/**
 * The galaxy surveys: 13.5 million galaxies and quasars of DESI DR1 and the SDSS (sim/surveys; docs/data/surveys.md),
 * drawn as a map like the cosmic web, from its octree of tiles, under a point budget.
 *
 * Each frame, while the layer shows (ui/cosmicLayers.ts: beyond 30 Mpc from the Sun, or turned on):
 *  1. the nodes to draw are chosen (sim/surveys/lod.ts) so that the budget (render/gpuBudget.ts surveyBudget: 80,000 to
 *     300,000 galaxies, 200,000 to start with) is spread over the whole visible volume, more where the galaxies crowd
 *     on the screen but none left empty: deep nodes and every galaxy where needed, elsewhere a fair sample of each node (the first so many of its galaxies, which the worker has put in an order
 *     where every prefix is spread evenly over the node); those missing are asked for (sim/surveys/load.ts);
 *  2. each drawn node is one draw of its points (shaders/survey.vert.glsl), its centre as seen from the camera computed
 *     here in float64;
 *  3. where no point is drawn at all (an octant of a node drawn whole whose child is not drawn), a glow
 *     (shaders/surveyGlow.vert.glsl) fills in faintly, into a target of its own (render/surveyGlow.ts): at GLOW_FILL of
 *     the light of the galaxies it stands for, and fading out where it would look large, so that it shows where the
 *     galaxies too far or too small to draw are without ever lying over the points as a haze.
 * The points are the map: the cosmic web's walls, filaments and voids show in their density.
 *
 * As the web: shown only after the first galaxies and while a − 1 < 10³⁰; each point's light redshifted and shifted by
 * the ship as it arrives (the expansion's dimming held to a tenth, galaxyMap.glsl, so the map stays readable from
 * gigaparsecs away). Faded out while a black hole's lens is drawn (the surveys have no lensed variant: near a hole the
 * web's lensed map stands for them).
 *
 * Cost, measured on the target laptop (docs/data/surveys.md §8), and nothing at all, not even a download, until the
 * layer is wanted.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  type Group,
  HalfFloatType,
  type Mesh,
  type PerspectiveCamera,
  Points,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { createSurveyGlowMaterial, createSurveyMaterial, updateSkyUniforms, withEmission } from '../render/materials';
import surveyVert from '../render/shaders/survey.vert.glsl?raw';
import surveyGlowVert from '../render/shaders/surveyGlow.vert.glsl?raw';
import { BACKGROUND_LAYER, POINTS_LAYER } from '../render/LightspeedScenePass';
import { SURVEY_GLOW_LAYER, surveyGlow } from '../render/surveyGlow';
import { surveyBudget } from '../render/gpuBudget';
import { GLOW_FILL, glowDepth, glowFade, MAP_DIM_FLOOR, mapDepth, mapDepthMpc, mapUnitPx2, POINT_KERNEL } from '../render/galaxyMap';
import { lensDrawn } from '../render/lensVariants';
import { relView } from '../render/relativisticView';
import { MPC_KM } from '../physics/constants';
import { bvToTemperature, lnLuminanceRelSun } from '../physics/blackbody';
import { cosmicSky, ln1pzAt } from '../sim/cosmos/expansion';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { surveyLoadWanted, surveyShare } from '../ui/cosmicLayers';
import { WEB_MAX_AM1 } from './CosmicWeb';
import { SURVEY_CLASSES } from '../sim/surveys/format.ts';
import { glowList, glowSettings, MAX_GLOWS, selectGlows, selectNodes, type LodView } from '../sim/surveys/lod';
import { evictSurveyNodes, loadSurveyHierarchy, requestSurveyNodes, survey, surveyHierarchyDue, touchSurveyNodes } from '../sim/surveys/load';

/** A node on the GPU. */
interface NodeGpu {
  id: number;
  points: Points;
  geometry: BufferGeometry;
}

const fwd = new Vector3();
/** A half field of view that culls nothing. */
const NO_CULL = Math.PI;

/** A node is not drawn when none of its galaxies could be drawn brighter than this alpha (invisible alone). */
const FAINT_NODE_ALPHA = 0.01;
/** A glow is drawn only if its brightest pixel could reach this (linear light: far below what a display shows). */
const GLOW_FLOOR = 1e-5;
/** The hottest class's colour temperature (quasars: materials.ts SURVEY_CLASS_LN_T), for the best case of a node's light. */
const T_HOTTEST = bvToTemperature(0.3);
/** ln of its visible radiance seen at e^lnDe times its temperature, over at its own, for lnDe from −8 by 0.01. */
let lnYShift: Float64Array | null = null;
function lnYAt(lnDe: number): number {
  if (!lnYShift) {
    const t = new Float64Array(1101);
    const y0 = lnLuminanceRelSun(T_HOTTEST);
    for (let i = 0; i < t.length; i++) t[i] = lnLuminanceRelSun(T_HOTTEST * Math.exp(-8 + 0.01 * i)) - y0;
    lnYShift = t;
  }
  const x = Math.min(lnYShift.length - 1.001, Math.max(0, (lnDe + 8) / 0.01));
  const i = Math.floor(x);
  return lnYShift[i] + (x - i) * (lnYShift[i + 1] - lnYShift[i]);
}

/**
 * The best case of the flux factor for light shifted by the ship (lnD) and the expansion (L = ln(1 + z)), ln, for the
 * hottest class: as the shaders' law, the expansion's dimming held to MAP_DIM_FLOOR of what the ship's shift alone gives.
 */
function bestLnF(lnD: number, L: number, lnExposure: number): number {
  const lnDe = lnD - L;
  const lnF = lnYAt(lnDe) - 2 * lnDe + lnExposure;
  const lnF0 = lnYAt(lnD) - 2 * lnD + lnExposure;
  return Math.max(lnF, lnF0 + MAP_DIM_FLOOR);
}

/** The glows are chosen again at least this often, frames. */
const GLOW_EVERY = 30;
/** What the last choice of glows was made for (see there). */
const glowPick = { sig: -1, fwd: [0, 0, 0] as number[], cam: [NaN, NaN, NaN] as number[], frame: -Infinity, max: -1 };

/** Frame statistics, for the dev tools (window.__ls.surveys) and the measurements in docs/data/surveys.md. */
export const surveyFrame = { nodes: 0, points: 0, glows: 0, budget: 0, fetching: 0, scale: 0 };

export function Surveys() {
  const material = useMemo(createSurveyMaterial, []);
  const glowMaterial = useMemo(createSurveyGlowMaterial, []);
  const group = useRef<Group | null>(null);
  const gpu = useMemo(() => new Map<number, NodeGpu>(), []);
  const opacity = useRef(0);
  const glows = useMemo(() => glowList(MAX_GLOWS), []);
  const compiled = useRef(false);
  const glow = useMemo(() => {
    const g = new BufferGeometry();
    const attr = (n: number) => new BufferAttribute(new Float32Array(MAX_GLOWS * n), n).setUsage(DynamicDrawUsage);
    g.setAttribute('position', attr(3));
    g.setAttribute('aSep', attr(3));
    g.setAttribute('aLight', attr(4));
    g.setAttribute('aRms', attr(1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new Sphere(new Vector3(), Infinity);
    return g;
  }, []);

  // The glows' one draw, in the glow layer's own scene (render/surveyGlow.ts), not the app's.
  useEffect(() => {
    const p = new Points(glow, glowMaterial);
    p.frustumCulled = false;
    p.layers.set(SURVEY_GLOW_LAYER);
    surveyGlow.scene.add(p);
    return () => {
      surveyGlow.scene.remove(p);
    };
  }, [glow, glowMaterial]);

  const dropNode = (id: number) => {
    const n = gpu.get(id);
    if (!n) return;
    group.current?.remove(n.points);
    n.geometry.dispose();
    gpu.delete(id);
  };

  useEffect(
    () => () => {
      for (const id of [...gpu.keys()]) dropNode(id);
      material.dispose();
      glowMaterial.dispose();
      glow.dispose();
      surveyBudget.active = false;
      surveyGlow.active = false;
    },
    [],
  );

  useFrame(({ gl, camera }, dt) => {
    const mode = useUI.getState().surveys;
    const dist = sim.camera.pos.length();
    survey.frame++;
    if (surveyLoadWanted(mode, dist) && surveyHierarchyDue()) void loadSurveyHierarchy();
    const want = cosmicSky.galaxiesShown && cosmicSky.am1 < WEB_MAX_AM1 && !lensDrawn() ? surveyShare(mode, dist) : 0;
    // Eased in and out over a third of a second, as the web.
    opacity.current += (want - opacity.current) * Math.min(1, dt * 3);
    if (Math.abs(want - opacity.current) < 0.002) opacity.current = want;
    const h = survey.hierarchy;
    const shown = !!h && opacity.current > 0.002;
    surveyBudget.active = shown;
    // Frames stepped by hand (sim.debugDt: window.__ls.step, the perf tools) or drawn in a hidden page are not timed
    // as the laptop draws them: their timings must not move the budget (gpuBudget.ts).
    surveyBudget.trusted = !sim.debugDt && !(typeof document !== 'undefined' && document.hidden);
    surveyGlow.active = false;
    surveyFrame.nodes = surveyFrame.points = surveyFrame.glows = 0;
    surveyFrame.fetching = survey.loading.size;
    if (!shown) {
      for (const n of gpu.values()) n.points.visible = false;
      glow.setDrawRange(0, 0);
      glowPick.sig = -1;
      return;
    }

    // The emission lookup, once the cosmology's table is in (one recompile, as the web).
    updateSkyUniforms();
    for (const [m, src] of [
      [material, surveyVert],
      [glowMaterial, surveyGlowVert],
    ] as const) {
      const s = withEmission(src);
      if (m.vertexShader !== s) {
        m.vertexShader = s;
        m.needsUpdate = true;
      }
    }
    if (!compiled.current) {
      // Compile both programs in the background the first time, into a render target as they draw.
      compiled.current = true;
      const scene = new Scene();
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
      g.setAttribute('aAttr', new BufferAttribute(new Uint8Array(2), 2));
      scene.add(new Points(g, material), new Points(glow, glowMaterial));
      const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
      const back = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      const done = () => {
        rt.dispose();
        g.dispose();
      };
      gl.compileAsync(scene, camera).then(done, done);
      gl.setRenderTarget(back);
    }

    // The view, for the selection.
    const cam = camera as PerspectiveCamera;
    const cx = sim.camera.pos.x / MPC_KM;
    const cy = sim.camera.pos.y / MPC_KM;
    const cz = sim.camera.pos.z / MPC_KM;
    const a = cosmicSky.a;
    const ax = cosmicSky.anchorKm.x / MPC_KM;
    const ay = cosmicSky.anchorKm.y / MPC_KM;
    const az = cosmicSky.anchorKm.z / MPC_KM;
    const pr = gl.getPixelRatio();
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const heightPx = sim.viewport.height * pr;
    const pxPerRad = heightPx / 2 / tanV;
    cam.getWorldDirection(fwd);
    const moving = relView.active && relView.phi > 1e-6;
    const lnDMax = moving ? relView.phi : 0;
    const lnExposure = relView.active ? relView.lnExposure : relView.lnExposureClassical;
    const depth = mapDepthMpc(Math.hypot(cx, cy, cz));
    const horizon = cosmicSky.table && cosmicSky.etaMpc > 0 ? cosmicSky.etaMpc : Infinity;
    const view: LodView = {
      cam: [cx, cy, cz],
      a,
      forward: [fwd.x, fwd.y, fwd.z],
      // Half the diagonal field; the split view draws both halves from one selection, so it culls nothing.
      halfFov: relView.split ? NO_CULL : Math.atan(tanV * Math.hypot(1, cam.aspect)),
      pxPerRad,
      phi: lnDMax,
      velDir: [relView.velDir.x, relView.velDir.y, relView.velDir.z],
      budget: surveyBudget.points,
      screenPx: heightPx * heightPx * Math.max(1, cam.aspect),
      anchor: [ax, ay, az],
      reachMpc: horizon,
      faint: (dProper, chi) => {
        // The best case for any of the node's galaxies: the nearest point of its box, the most luminous galaxy
        // (mapLight at most 4), the smallest point, the hottest colour and the ship's largest Doppler factor.
        const L = chi > 1e-9 ? ln1pzAt(chi) : 0;
        if (!(L < 1e29)) return true;
        const lnF = Math.min(2, 0.5 * bestLnF(lnDMax, L, lnExposure));
        const pxMin = 1.1 * pr + 1;
        return opacity.current * 4 * mapDepth(dProper, depth) * (mapUnitPx2(pr) / (pxMin * pxMin)) * Math.exp(lnF) < FAINT_NODE_ALPHA;
      },
    };
    const nodes = h.nodes;
    const sel = selectNodes(nodes, view, (i) => survey.nodes.has(i));
    requestSurveyNodes(sel.fetch);
    touchSurveyNodes(sel.draw);
    for (const id of evictSurveyNodes()) dropNode(id);
    surveyFrame.budget = view.budget;
    surveyFrame.scale = sel.scale;

    // Each drawn node: its first `count` galaxies (a fair sample of it: lod.ts), its numbers in its model matrix.
    const drawnIds = new Set(sel.draw);
    for (const [id, n] of gpu) {
      if (!drawnIds.has(id)) {
        n.points.visible = false;
        // Let go of on the GPU once not drawn for a while (the data stay cached: load.ts).
        if (survey.frame - (survey.nodes.get(id)?.lastUsed ?? -Infinity) > 120) dropNode(id);
      }
    }
    let drawnPoints = 0;
    sel.draw.forEach((id, k) => {
      let n = gpu.get(id);
      if (!n) {
        const d = survey.nodes.get(id)!;
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(d.position, 3));
        g.setAttribute('aAttr', new BufferAttribute(d.attrs, 2));
        g.boundingSphere = new Sphere(new Vector3(), Infinity);
        const p = new Points(g, material);
        p.frustumCulled = false;
        p.renderOrder = -95;
        p.layers.set(POINTS_LAYER);
        // The node's own numbers ride in its model matrix, which three.js sends with every draw anyway
        // (survey.vert.glsl reads them): per-node uniforms would send all of the material's thirty-odd uniforms again
        // for each node. So the matrix is set here and never recomputed from a position.
        p.matrixAutoUpdate = false;
        p.matrixWorldAutoUpdate = false;
        n = { id, points: p, geometry: g };
        gpu.set(id, n);
        group.current?.add(p);
      }
      const node = nodes[id];
      const count = sel.count[k];
      n.geometry.setDrawRange(0, count);
      n.points.visible = true;
      const hs = node.side / 2;
      const x = node.lo[0] + hs;
      const y = node.lo[1] + hs;
      const z = node.lo[2] + hs;
      // Column 0: a × its centre − the camera; column 1: its centre − the camera's comoving place (Mpc); column 2: its weight.
      const e = n.points.matrixWorld.elements;
      e[0] = a * x - cx;
      e[1] = a * y - cy;
      e[2] = a * z - cz;
      e[4] = x - ax;
      e[5] = y - ay;
      e[6] = z - az;
      e[8] = opacity.current;
      drawnPoints += count;
      surveyFrame.nodes++;
    });
    surveyFrame.points = drawnPoints;

    // The glows, where no point is drawn: octants of nodes drawn whole whose child is not drawn, split through the
    // hierarchy where they look wide (sim/surveys/lod.ts selectGlows). Which glows changes only when the drawn nodes
    // change or the camera moves or turns: chosen again then, or every GLOW_EVERY frames, and kept between (0.5 ms of
    // the processor's time for 1,000 glows). Their places and brightness below are worked out every frame.
    const sources = sel.draw.filter((id) => sel.whole.has(id));
    let sig = sel.draw.length;
    for (const id of sel.draw) sig = (sig * 31 + id * 1009 + (sel.whole.has(id) ? 7 : 0)) % 1_000_000_007;
    const gp = glowPick;
    const turned = fwd.x * gp.fwd[0] + fwd.y * gp.fwd[1] + fwd.z * gp.fwd[2] < Math.cos(0.01);
    const moved = Math.hypot(cx - gp.cam[0], cy - gp.cam[1], cz - gp.cam[2]) > 0.005 * Math.max(1, Math.hypot(cx, cy, cz));
    if (sig !== gp.sig || turned || moved || survey.frame - gp.frame >= GLOW_EVERY || glowSettings.max !== gp.max) {
      selectGlows(nodes, view, sources, () => 1, (i) => drawnIds.has(i), (i) => survey.nodes.get(i)?.glows, glows, surveyGlow.resScale);
      gp.sig = sig;
      gp.fwd = [fwd.x, fwd.y, fwd.z];
      gp.cam = [cx, cy, cz];
      gp.frame = survey.frame;
      gp.max = glowSettings.max;
    }
    const list = glows;
    const pos = glow.attributes.position.array as Float32Array;
    const sepA = glow.attributes.aSep.array as Float32Array;
    const light = glow.attributes.aLight.array as Float32Array;
    const rms = glow.attributes.aRms.array as Float32Array;
    // A glow whose brightest pixel could not reach GLOW_FLOOR (the best case of its law, as for the nodes), or that
    // has faded out for looking large, is left out; with none left the target and its full-screen pass are not drawn
    // at all (0.5 ms on the target laptop).
    const unit = mapUnitPx2(pr) * POINT_KERNEL;
    // At the rate the points sample the catalogue (a glow then shows its galaxies as bright as the drawn sample shows
    // theirs), at most GLOW_FILL.
    const fill = Math.min(GLOW_FILL, drawnPoints / Math.max(1, h.total)) * opacity.current;
    let k = 0;
    for (let j = 0; j < list.count; j++) {
      const x = list.centre[3 * j];
      const y = list.centre[3 * j + 1];
      const z = list.centre[3 * j + 2];
      const rx = a * x - cx;
      const ry = a * y - cy;
      const rz = a * z - cz;
      const d = Math.hypot(rx, ry, rz);
      const r = a * list.rms[j];
      const chi = Math.hypot(x - ax, y - ay, z - az);
      const L = chi > 1e-9 ? ln1pzAt(chi) : 0;
      if (!(L < 1e29)) continue;
      let sum = 0;
      for (let c = 0; c < SURVEY_CLASSES; c++) sum += list.light[4 * j + c];
      const sigmaPx = Math.max(0.7 / surveyGlow.resScale, (1.6 * r * 0.57735 * pxPerRad) / Math.max(d, 1e-6) / Math.exp(lnDMax));
      const peak = (fill * sum * glowFade(sigmaPx) * Math.exp(Math.min(2, 0.5 * bestLnF(lnDMax, L, lnExposure))) * glowDepth(d, r, depth) * unit) / (2 * Math.PI * sigmaPx * sigmaPx * 0.9389);
      if (!(peak >= GLOW_FLOOR)) continue;
      pos[3 * k] = rx;
      pos[3 * k + 1] = ry;
      pos[3 * k + 2] = rz;
      sepA[3 * k] = x - ax;
      sepA[3 * k + 1] = y - ay;
      sepA[3 * k + 2] = z - az;
      for (let c = 0; c < SURVEY_CLASSES; c++) light[4 * k + c] = list.light[4 * j + c] * fill;
      rms[k] = r;
      k++;
    }
    glow.setDrawRange(0, k);
    for (const name of ['position', 'aSep', 'aLight', 'aRms']) {
      const at = glow.attributes[name] as BufferAttribute;
      at.clearUpdateRanges();
      at.addUpdateRange(0, k * at.itemSize);
      at.needsUpdate = true;
    }
    surveyGlow.active = k > 0;
    surveyFrame.glows = k;

    // The shared uniforms.
    const u = material.uniforms;
    u.uDepthMpc.value = depth;
    // Mean points per device pixel of sky, for drawing by lot where a fast ship crowds them ahead (as the web).
    u.uPointsPerPx.value = drawnPoints / (4 * Math.PI * pxPerRad * pxPerRad);
    u.uLotMin.value = Math.min(1, 48 / Math.max(1, drawnPoints));
    const gu = glowMaterial.uniforms;
    gu.uDepthMpc.value = depth;
    gu.uPxPerRad.value = pxPerRad * surveyGlow.resScale;
    gu.uResScale.value = surveyGlow.resScale;
    gu.uMaxSize.value = maxPointSize(gl.getContext());
  });

  return (
    <>
      <group ref={group} />
      <primitive
        object={surveyGlow.quad}
        renderOrder={-94}
        ref={(o: Mesh | null) => {
          if (!o) return;
          o.layers.set(BACKGROUND_LAYER);
          o.layers.enable(POINTS_LAYER);
        }}
      />
    </>
  );
}

let maxPoint = 0;
/** The largest point size the GPU draws, px (ANGLE on Direct3D 11: 1,024). */
function maxPointSize(gl: WebGLRenderingContext | WebGL2RenderingContext): number {
  if (!maxPoint) {
    const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    maxPoint = r ? r[1] : 64;
  }
  return maxPoint;
}
