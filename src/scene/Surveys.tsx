/**
 * The galaxy surveys: 13.5 million galaxies and quasars of DESI DR1 and the SDSS (sim/surveys; docs/data/surveys.md),
 * drawn as a map like the cosmic web, from its octree of tiles, under a point budget, with the light of every galaxy
 * not drawn carried by glows.
 *
 * Each frame, while the layer shows (ui/cosmicLayers.ts: beyond 30 Mpc from the Sun, or turned on):
 *  1. the nodes to draw are chosen (sim/surveys/lod.ts) within the budget the GPU timer sets (render/gpuBudget.ts
 *     surveyBudget: 80,000 to 300,000 galaxies), and those missing are asked for (sim/surveys/load.ts);
 *  2. each node fades in or out over FADE_S; its share W is its fade times its parent's (the root's times the layer's),
 *     so a node drawn on its way in and the glow of its octant in its parent, drawn with the parent's share less its
 *     own, always add up to the light of the galaxies below;
 *  3. each drawn node is one draw of its points (shaders/survey.vert.glsl), its centre as seen from the camera computed
 *     here in float64; each octant of a drawn node whose child is not (wholly) drawn is one glow
 *     (shaders/surveyGlow.vert.glsl), drawn into a target of its own (render/surveyGlow.ts); a glow that looks wide is
 *     split through the hierarchy into its node's parts (sim/surveys/lod.ts selectGlows), none of its light lost.
 * At every moment the points plus the glows hold the summed display light of all the galaxies in the tiles
 * (sim/surveys/tile.ts): from afar the far universe is a faint haze of glows, and nearer it resolves into galaxies.
 *
 * As the web: shown only after the first galaxies and while a − 1 < 10³⁰; each point's light redshifted, dimmed and
 * shifted by the ship as it arrives. Faded out while a black hole's lens is drawn (the surveys have no lensed variant:
 * near a hole the web's lensed map stands for them).
 *
 * Cost, measured on the target laptop (docs/data/surveys.md §8): 1.0 to 1.3 ms of GPU a frame at the default budget
 * from 50 Mpc to 3 Gpc and in the cosmic web's scene, 1.5 ms at 0.999c; nothing near the edge of the observable
 * universe, where no survey galaxy's light shows; and nothing at all, not even a download, until the layer is wanted.
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
import { glowDepth, mapDepth, mapDepthMpc, mapUnitPx2, POINT_KERNEL } from '../render/galaxyMap';
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

/** Nodes fade in and out over this, s. */
const FADE_S = 0.3;

/** A node on the GPU. */
interface NodeGpu {
  id: number;
  points: Points;
  geometry: BufferGeometry;
  /** Its fade (0 to 1), and its share of light this frame (its fade times its parent's share). */
  t: number;
  w: number;
}

const fwd = new Vector3();
/** A half field of view that culls nothing. */
const NO_CULL = Math.PI;

/**
 * ln a when the earliest galaxy seen shone: MoM-z14 at z = 14.44, 283 million years after the Big Bang (sim/cosmos/
 * expansion.ts EARLIEST_GALAXIES_GYR). Light that left a place before then shows no galaxy there: from near the edge of
 * the observable universe, home's galaxies are seen before any had formed.
 */
const LN_A_FIRST = -Math.log1p(14.44);
const reach = { lnA: NaN, ln1pz: Infinity, mpc: Infinity };

/**
 * How far from the camera, comoving, light left after the earliest galaxies shone (Mpc), and its ln(1 + z), for this
 * frame's epoch: the emission table searched by bisection (sim/cosmos/expansion.ts ln1pzAt), once each epoch.
 */
function reachNow(): { ln1pz: number; mpc: number } {
  const s = cosmicSky;
  if (!s.table || !(s.etaMpc > 0)) return { ln1pz: Infinity, mpc: Infinity };
  if (reach.lnA === s.lnATable) return reach;
  reach.lnA = s.lnATable;
  reach.ln1pz = s.lnATable - LN_A_FIRST;
  let lo = 0;
  let hi = s.etaMpc;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (ln1pzAt(m) < reach.ln1pz) lo = m;
    else hi = m;
  }
  reach.mpc = hi;
  return reach;
}

/** A node is left to its parent's glow when none of its galaxies could be drawn brighter than this alpha (invisible alone). */
const FAINT_NODE_ALPHA = 0.01;
/** A glow is drawn only if its brightest pixel could reach this (linear light: far below what a display shows, even where hundreds overlap). */
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

/** The glows are chosen again at least this often, frames. */
const GLOW_EVERY = 30;
/** What the last choice of glows was made for (Surveys: see there). */
const glowPick = { sig: -1, fwd: [0, 0, 0] as number[], cam: [NaN, NaN, NaN] as number[], frame: -Infinity, max: -1 };

/** Frame statistics, for the dev tools (window.__ls.surveys) and the measurements in docs/data/surveys.md. */
export const surveyFrame = { nodes: 0, points: 0, glows: 0, budget: 0, fetching: 0 };

export function Surveys() {
  const material = useMemo(createSurveyMaterial, []);
  const glowMaterial = useMemo(createSurveyGlowMaterial, []);
  const group = useRef<Group | null>(null);
  const gpu = useMemo(() => new Map<number, NodeGpu>(), []);
  const drawnBefore = useMemo(() => new Set<number>(), []);
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
    surveyGlow.active = false;
    surveyFrame.nodes = surveyFrame.points = surveyFrame.glows = 0;
    surveyFrame.fetching = survey.loading.size;
    if (!shown) {
      for (const n of gpu.values()) n.points.visible = false;
      glow.setDrawRange(0, 0);
      drawnBefore.clear();
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
    const pxPerRad = (sim.viewport.height * pr) / 2 / tanV;
    cam.getWorldDirection(fwd);
    const moving = relView.active && relView.phi > 1e-6;
    const lnExposure = relView.active ? relView.lnExposure : relView.lnExposureClassical;
    const depth = mapDepthMpc(Math.hypot(cx, cy, cz));
    const view: LodView = {
      cam: [cx, cy, cz],
      a,
      forward: [fwd.x, fwd.y, fwd.z],
      // Half the diagonal field; the split view draws both halves from one selection, so it culls nothing.
      halfFov: relView.split ? NO_CULL : Math.atan(tanV * Math.hypot(1, cam.aspect)),
      pxPerRad,
      phi: moving ? relView.phi : 0,
      velDir: [relView.velDir.x, relView.velDir.y, relView.velDir.z],
      budget: surveyBudget.points,
      anchor: [ax, ay, az],
      reachMpc: reachNow().mpc,
      faint: (dProper, chi) => {
        // The best case for any of the node's galaxies: the nearest point of its box, the most luminous galaxy
        // (mapLight at most 4), the smallest point, the hottest colour and the ship's largest Doppler factor.
        const L = chi > 1e-9 ? ln1pzAt(chi) : 0;
        if (!(L <= reach.ln1pz)) return true;
        const lnDe = (moving ? relView.phi : 0) - L;
        const lnF = Math.min(2, 0.5 * (lnYAt(lnDe) - 2 * lnDe + lnExposure));
        const pxMin = 1.1 * pr + 1;
        return opacity.current * 4 * mapDepth(dProper, depth) * (mapUnitPx2(pr) / (pxMin * pxMin)) * Math.exp(lnF) < FAINT_NODE_ALPHA;
      },
    };
    const nodes = h.nodes;
    const sel = selectNodes(nodes, view, (i) => survey.nodes.has(i), (i) => drawnBefore.has(i));
    requestSurveyNodes(sel.fetch);
    touchSurveyNodes(sel.draw);
    for (const id of evictSurveyNodes()) dropNode(id);
    surveyFrame.budget = view.budget;

    // Fades: towards 1 for the chosen nodes, towards 0 for the rest; a node is made on the GPU when first chosen.
    const chosen = new Set(sel.draw);
    for (const id of sel.draw) {
      if (gpu.has(id)) continue;
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
      const n: NodeGpu = { id, points: p, geometry: g, t: 0, w: 0 };
      gpu.set(id, n);
      group.current?.add(p);
    }
    const step = dt > 0 ? dt / FADE_S : 1;
    // Parents come before children in the hierarchy's order, so each share is its fade times its parent's.
    const order = [...gpu.keys()].sort((x, y) => x - y);
    let drawnPoints = 0;
    for (const id of order) {
      const n = gpu.get(id)!;
      n.t = chosen.has(id) ? Math.min(1, n.t + step) : Math.max(0, n.t - step);
      const node = nodes[id];
      const parentW = node.parent < 0 ? opacity.current : (gpu.get(node.parent)?.w ?? 0);
      n.w = n.t * parentW;
      const on = n.w > 1e-3 && survey.nodes.has(id);
      n.points.visible = on;
      if (!on) continue;
      const hs = node.side / 2;
      const x = node.lo[0] + hs;
      const y = node.lo[1] + hs;
      const z = node.lo[2] + hs;
      // Column 0: a × its centre − the camera; column 1: its centre − the camera's comoving place (Mpc); column 2: its share.
      const e = n.points.matrixWorld.elements;
      e[0] = a * x - cx;
      e[1] = a * y - cy;
      e[2] = a * z - cz;
      e[4] = x - ax;
      e[5] = y - ay;
      e[6] = z - az;
      e[8] = n.w;
      drawnPoints += node.points;
      surveyFrame.nodes++;
    }
    // Nodes faded out and no longer chosen are let go of on the GPU (their data stay cached: load.ts).
    for (const id of order) {
      const n = gpu.get(id)!;
      if (n.t === 0 && !chosen.has(id)) dropNode(id);
    }
    surveyFrame.points = drawnPoints;
    drawnBefore.clear();
    for (const id of sel.draw) drawnBefore.add(id);

    // The glows: each octant of a drawn node, with the share of it its child does not draw, the wide ones split through
    // the hierarchy (sim/surveys/lod.ts selectGlows).
    const visibleIds = order.filter((id) => !!gpu.get(id)?.points.visible);
    const shareOf = (i: number): number => {
      const n = gpu.get(i);
      return n && n.points.visible ? n.w : 0;
    };
    // Which glows (and how they split) changes only when the drawn nodes or their shares change, or the camera moves or
    // turns: chosen again then, or every GLOW_EVERY frames, and kept between (0.5 ms of the processor's time for 1,000
    // glows). Their places and brightness below are worked out every frame.
    let sig = visibleIds.length;
    for (const id of visibleIds) sig = (sig * 31 + id * 1009 + Math.round(gpu.get(id)!.w * 4096)) % 1_000_000_007;
    const g = glowPick;
    const turned = fwd.x * g.fwd[0] + fwd.y * g.fwd[1] + fwd.z * g.fwd[2] < Math.cos(0.01);
    const moved = Math.hypot(cx - g.cam[0], cy - g.cam[1], cz - g.cam[2]) > 0.005 * Math.max(1, Math.hypot(cx, cy, cz));
    if (sig !== g.sig || turned || moved || survey.frame - g.frame >= GLOW_EVERY || glowSettings.max !== g.max) {
      selectGlows(nodes, view, visibleIds, shareOf, (i) => survey.nodes.get(i)?.glows, glows, surveyGlow.resScale);
      g.sig = sig;
      g.fwd = [fwd.x, fwd.y, fwd.z];
      g.cam = [cx, cy, cz];
      g.frame = survey.frame;
      g.max = glowSettings.max;
    }
    const list = glows;
    const pos = glow.attributes.position.array as Float32Array;
    const sepA = glow.attributes.aSep.array as Float32Array;
    const light = glow.attributes.aLight.array as Float32Array;
    const rms = glow.attributes.aRms.array as Float32Array;
    // A glow whose brightest pixel could not reach GLOW_FLOOR (the best case of its law, as for the nodes: the hottest
    // colour, the ship's largest Doppler factor) is left out; with none left the target and its full-screen pass are not
    // drawn at all (0.7 ms on the target laptop), as from near the edge of the observable universe, where the surveys'
    // light left before the galaxies shone or arrives redshifted to nothing.
    const unit = mapUnitPx2(pr) * POINT_KERNEL;
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
      if (!(L <= reach.ln1pz)) continue;
      const lnDe = (moving ? relView.phi : 0) - L;
      let sum = 0;
      for (let c = 0; c < SURVEY_CLASSES; c++) sum += list.light[4 * j + c];
      const sigmaPx = Math.max(0.7 / surveyGlow.resScale, (1.6 * r * 0.57735 * pxPerRad) / Math.max(d, 1e-6) / (moving ? Math.exp(relView.phi) : 1));
      const peak = (sum * Math.exp(Math.min(2, 0.5 * (lnYAt(lnDe) - 2 * lnDe + lnExposure))) * glowDepth(d, r, depth) * unit) / (2 * Math.PI * sigmaPx * sigmaPx * 0.9389);
      if (!(peak * opacity.current >= GLOW_FLOOR)) continue;
      pos[3 * k] = rx;
      pos[3 * k + 1] = ry;
      pos[3 * k + 2] = rz;
      sepA[3 * k] = x - ax;
      sepA[3 * k + 1] = y - ay;
      sepA[3 * k + 2] = z - az;
      for (let c = 0; c < SURVEY_CLASSES; c++) light[4 * k + c] = list.light[4 * j + c];
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
    u.uLnFirst.value = Math.min(1e30, reachNow().ln1pz);
    // Mean points per device pixel of sky, for drawing by lot where a fast ship crowds them ahead (as the web).
    u.uPointsPerPx.value = drawnPoints / (4 * Math.PI * pxPerRad * pxPerRad);
    u.uLotMin.value = Math.min(1, 48 / Math.max(1, drawnPoints));
    const gu = glowMaterial.uniforms;
    gu.uDepthMpc.value = depth;
    gu.uLnFirst.value = u.uLnFirst.value;
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
