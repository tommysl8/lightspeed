/**
 * Orbit lines: the osculating conic of each body about what it orbits, drawn through where the
 * body appears. Planets' lines are exact two-body orbits from their state vectors; a moon's is
 * drawn about its planet and only while that planet's system is framed: a line mounts once its
 * orbit is a few pixels across and fades in with its size on screen. Lines that are not drawn
 * are not there (unmounted, or visible = false), rather than drawn at opacity 0.
 *
 * However many bodies are registered, at most MAX_LINES lines are mounted: those the viewer is
 * looking at (the planets, the system in focus, the selection, the flight's destination) first,
 * then the largest on screen. Asteroids, comets and interstellar objects get a line only when
 * selected, in focus or flown to. The relativistic view leaves guides out, so no line is kept
 * while it is on (not split).
 *
 * Near a black hole each line draws with a lensed variant (render/lensVariants.ts): every point at its
 * primary image, tier 1, or for the lines of bodies within 10⁵ M of the hole (the S-stars round Sgr A*, a
 * companion round its hole) the exact tier-2 program, whose flat twin would put S2's line 2 px off in front of
 * the hole, once that program has compiled in the background (about 0.6 s cold: tier 1 until
 * then; and tier 1 in a fall's raindrop frame or within 3M, where the exact solver does not apply). The body's place
 * relative to the hole (uBodyHoleM) is worked out here in float64.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  type Mesh,
  type PerspectiveCamera,
  type ShaderMaterial,
  WebGLCubeRenderTarget,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { solveKepler, solveKeplerHyperbolic } from '../physics/kepler';
import { createOrbitMaterial } from '../render/materials';
import { exactVariant, lensDrawn, useLensVariant, variantCompiled } from '../render/lensVariants';
import { lens } from '../render/lens/lensState';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { relView } from '../render/relativisticView';
import { pixelsPerRadian, solarSystemHidden } from '../sim/derived';
import { recordSerial, registryVersion, subscribeRegistry, type BodyId, type BodyKind } from '../sim/bodies';
import { bodyEntries, entryOf, type Entry } from '../sim/bodies/registry';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { surroundings } from '../controls/roam';
import { useUI } from '../state/ui';
import { conicFromState, makeConic, orbitMu, orbitSource, segmentsFor, trailStart, viewDistance, visVivaA, type Conic, type OrbitSource } from './orbitLines';

const SEGMENTS = 1024;
/** A line mounts once its orbit is this wide on screen (px)… */
const MOUNT_PX = 3;
/** …and unmounts after this many frames below UNMOUNT_PX (or at once when hidden). */
const UNMOUNT_PX = 2;
const UNMOUNT_FRAMES = 90;
/** Most lines mounted at once. */
export const MAX_LINES = 48;
/** A mounted line keeps its place against a newcomer up to this much larger (no flicker at the cut). */
const INCUMBENT_BONUS = 1.25;
/** Kinds whose lines are drawn only when the viewer is looking at that body. */
/**
 * Kinds whose lines are drawn only when looked at. Stars too: a star's orbit about its system's
 * centre of mass is drawn while that system is in focus (or the star is selected, in focus or
 * flown to), not as an arc across the sky from elsewhere (Proxima's 2° orbit seen from Earth).
 */
const ON_DEMAND: ReadonlySet<BodyKind> = new Set<BodyKind>(['asteroid', 'comet', 'interstellar', 'star']);
/**
 * Below this opacity nothing of a line survives the fragment shader (alpha < 0.003 is
 * discarded, and the brightest part of a line, its trail, has alpha 0.62 × opacity): don't draw it.
 */
const MIN_OPACITY = 0.003 / 0.62;
/** Lines of bodies nearer the lensing hole than this, in its M, are drawn by the exact program. */
export const EXACT_LENS_WITHIN_M = 1e5;

function segmentGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  // Quad: (start|end) × (−1|+1 side)
  g.setAttribute('corner', new Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
  // three.js needs a position attribute to size the draw; the shader ignores it.
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const idx = new Float32Array(SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) idx[i] = i;
  g.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
  g.instanceCount = SEGMENTS;
  return g;
}

function anomalyAt(o: Conic, M: number): number {
  if (!o.hyperbolic) {
    // Keep E continuous with the current anomaly (solveKepler wraps to [0, 2π)).
    const E = solveKepler(M, o.e);
    return E + Math.round((o.anomaly - E) / (2 * Math.PI)) * 2 * Math.PI;
  }
  return solveKeplerHyperbolic(M, o.e);
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Whether a body gets an orbit line at all: not barycentres, records that say no, galaxies,
 * clusters or nebulae, and stars only when their record asks for one (a star in a binary).
 */
function hasOrbitLine(e: Entry): boolean {
  const r = e.record;
  if (r.orbitLine === false || e.isNode || !e.parent) return false;
  if (r.kind === 'star') return r.orbitLine !== undefined;
  return r.kind !== 'galaxy' && r.kind !== 'cluster' && r.kind !== 'nebula';
}

/**
 * Lines of the Solar System are hidden once it has shrunk below a pixel (and float32 could not
 * place them); those of other star systems follow their own size on screen.
 */
const lostInTheDistance = (e: Entry): boolean => e.root.id === 'sun' && solarSystemHidden();

function hideLine(material: ShaderMaterial, mesh: Mesh | null): void {
  material.uniforms.uOpacity.value = 0;
  if (mesh) mesh.visible = false;
}

const srcScratch: OrbitSource = { rel: null as unknown as Entry, centre: null, view: null };

/** Rough size of a body's orbit on screen, px (for mounting). */
function orbitSizePx(e: Entry, pxPerRad: number): number {
  const { rel, view } = orbitSource(e, srcScratch);
  const a = Math.max(rel.rel.pos.length(), e.record.physical.semiMajorAxisKm ?? 0);
  const d = viewDistance(view, sim.camera.pos, sim.bodies.sun?.distCamera ?? Infinity);
  return (a / Math.max(d, 1)) * pxPerRad;
}

function OrbitLine({ id }: { id: BodyId }) {
  const geometry = useMemo(segmentGeometry, []);
  const entry = entryOf(id);
  const colour = entry?.record.physical.colour ?? '#cfd8ea';
  const material = useMemo<ShaderMaterial>(() => {
    const m = createOrbitMaterial(new Color(colour).lerp(new Color('#cfd8ea'), 0.55));
    // The body relative to the lensing hole (units of M): read only by the lensed variants, which share it.
    m.uniforms.uBodyHoleM = { value: new Vector3() };
    return m;
  }, [colour]);
  // R3F disposes neither a geometry nor a material handed to a mesh as props.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<Mesh | null>(null);
  const exact = useRef(false);
  useLensVariant(mesh, { exact: () => exact.current });
  const scratch = useMemo(
    () => ({
      src: { rel: null as unknown as Entry, centre: null, view: null } as OrbitSource,
      inView: { rel: null as unknown as Entry, centre: null, view: null } as OrbitSource,
      conic: makeConic(),
    }),
    [],
  );

  useFrame(({ camera, gl }) => {
    const e = entryOf(id);
    const b = e?.state;
    const u = material.uniforms;
    // From beyond the Solar System's pixel there is nothing to draw (and nothing to compute).
    if (!e || !b || !b.present || lostInTheDistance(e)) return hideLine(material, mesh.current);
    const src = orbitSource(e, scratch.src);
    const mu = orbitMu(e, src);
    const r = src.rel.rel.pos;
    const v = src.rel.rel.vel;

    // Fade orbits that are tiny on screen (e.g. the Moon's orbit seen from Neptune), and dim
    // them in close-ups, where distant orbits only cross the view as edge-on streaks (hovering over a
    // black hole, orbiting it, in a snapshot or falling in, as when orbiting a body). The size
    // comes from the vis-viva semi-major axis, before any other work: hidden lines cost little.
    const ui = useUI.getState();
    const dist = viewDistance(src.view, sim.camera.pos, sim.bodies.sun?.distCamera ?? Infinity);
    const sizePx = (visVivaA(r, v, mu) / Math.max(dist, 1)) * pixelsPerRadian();
    const selected = ui.selected === id ? 1.35 : 1;
    // Roaming there is no focus: the nearest body Roam measures stands in for it.
    const inView = ui.controlMode === 'roam' ? surroundings.id : ui.controlMode === 'free' ? null : ui.focus;
    const focusPx = inView ? (sim.bodies[inView]?.radiusPx ?? 0) : 0;
    // In a close-up the orbits round the body in view (its moons', or its partner's about their
    // barycentre) and the selected body's are dimmed. The rest go once the camera is close to that body
    // compared with the size of its own orbit (under a fiftieth of it): from there they pass the camera
    // nearly edge-on and only streak across the view. Pulled back to see the system, they return.
    const c = src.centre;
    const around = ui.selected === id || c?.id === inView || (!!c?.isNode && c.placed.some((k) => k.id === inView));
    let closeUp = 0;
    if (around) closeUp = 0.85 * smoothstep(40, 220, focusPx);
    else if (inView) {
      const f = entryOf(inView);
      const own = f ? orbitSource(f, scratch.inView).rel.rel.pos.length() : 0;
      const near = sim.bodies[inView]?.distCamera ?? Infinity;
      if (own > 0) closeUp = 1 - smoothstep(0.02, 0.1, near / own);
    }
    const opacity = smoothstep(4, 40, sizePx) * selected * (1 - closeUp);
    if (!(opacity > MIN_OPACITY)) return hideLine(material, mesh.current);
    u.uOpacity.value = opacity;
    if (mesh.current) mesh.current.visible = true;

    const o = conicFromState(r, v, mu, scratch.conic);
    u.uBodyPos.value.copy(b.apparentPos).sub(sim.camera.pos);
    // Near a black hole: the body from the hole, units of M (float64 here, so it keeps its precision there).
    const hole = lens.hole ? sim.bodies[lens.hole] : undefined;
    if (lensDrawn() && hole && lens.mKm > 0) {
      const h = u.uBodyHoleM.value as Vector3;
      h.copy(b.apparentPos).sub(hole.pos).divideScalar(lens.mKm);
      // The exact program once it has compiled in the background (its first request starts it); tier 1 till then, and
      // wherever the exact solver does not apply (in a fall's raindrop frame, or within 3M), where it draws straight.
      const exactApplies = lens.obs.frame === 'static' && lens.obs.r > 3;
      exact.current = exactApplies && h.length() < EXACT_LENS_WITHIN_M && variantCompiled(gl, camera, exactVariant(material), 'quad');
    } else exact.current = false;
    u.uP.value.copy(o.P);
    u.uQ.value.copy(o.Q);
    u.uA.value = Math.abs(o.a);
    u.uB.value = o.b;
    // Draw through where the body appears: step the anomaly back by the light delay.
    u.uAnomaly.value = b.lightDelay > 0 ? anomalyAt(o, o.meanAnomaly - o.meanMotion * b.lightDelay) : o.anomaly;
    u.uHyperbolic.value = o.hyperbolic ? 1 : 0;
    u.uClosed.value = o.hyperbolic ? 0 : 1;
    if (o.hyperbolic) {
      // Trail back to where the path starts (a spacecraft's last flyby: Voyager 1's of Saturn in
      // 1980), after which it has coasted on this hyperbola.
      const from = trailStart(e.record.orbitLine, sim.timeMs);
      if (from !== undefined) {
        const dt = (from - sim.timeMs) / 1000;
        const H0 = solveKeplerHyperbolic(o.meanAnomaly + o.meanMotion * dt, o.e);
        u.uSpanMin.value = Math.min(0, H0 - o.anomaly);
      } else u.uSpanMin.value = -Math.PI;
    }
    // Fewer segments for a line that is small on screen (the samples cluster at the body anyway).
    const n = segmentsFor(sizePx);
    geometry.instanceCount = n;
    u.uSegments.value = n;
    u.uBodyRadius.value = b.displayRadius;
    const pr = gl.getPixelRatio();
    u.uPixelRatio.value = pr;
    u.uResolution.value.set(sim.viewport.width * pr, sim.viewport.height * pr);
    u.uNear.value = (camera as PerspectiveCamera).near;
  });

  // Line width is in pixels of whatever is being rendered: the screen, or a relativistic
  // cube-map face.
  const onBeforeRender = useMemo(
    () => (renderer: WebGLRenderer) => {
      const rt = renderer.getRenderTarget();
      const u = material.uniforms;
      if (rt) {
        u.uResolution.value.set(rt.width, rt.height);
        u.uPixelRatio.value = rt instanceof WebGLCubeRenderTarget ? 1.1 : renderer.getPixelRatio();
      }
    },
    [material],
  );

  // A body that has just left the registry: nothing to draw (Orbits drops it next frame).
  if (!entry) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10}
      visible={false}
      onBeforeRender={onBeforeRender}
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(GUIDES_LAYER);
      }}
    />
  );
}

interface Candidate {
  id: BodyId;
  /** Higher is kept first: see TIER. */
  rank: number;
}
/**
 * Ranks: the selection, the focus and the flight's destination first, then the planets, dwarf
 * planets and the system in focus, then everything else; by size on screen within each.
 */
const TIER = 1e15;
const byRank = (a: Candidate, b: Candidate) => b.rank - a.rank;

/**
 * Mounts an orbit line for each body whose orbit is a few pixels across (a moon's only when its
 * planet's system is framed), with a grace period before a shrinking one goes, and at most
 * MAX_LINES at once.
 */
export function Orbits() {
  const show = useUI((s) => s.showOrbits);
  const version = useSyncExternalStore(subscribeRegistry, registryVersion);
  const [mounted, setMounted] = useState<readonly BodyId[]>([]);
  const live = useRef({
    set: new Set<BodyId>(),
    small: new Map<BodyId, number>(),
    version: -1,
    pool: [] as Candidate[],
    cands: [] as Candidate[],
  });

  useFrame(() => {
    const st = live.current;
    let changed = false;
    const drop = (id: BodyId) => {
      st.set.delete(id);
      st.small.delete(id);
      changed = true;
    };
    // Nothing to draw: lines hidden, or the relativistic view (not split), which leaves guides out.
    if (!show || (relView.active && !relView.split)) {
      if (st.set.size) {
        st.set.clear();
        st.small.clear();
        setMounted([]);
      }
      return;
    }
    const ui = useUI.getState();
    const focusGroup = entryOf(ui.focus)?.group;
    // The star system in focus (its barycentre), whose stars' orbits are drawn.
    const focusRoot = entryOf(ui.focus)?.root;
    const focusSystem = focusRoot?.isNode ? focusRoot : undefined;
    const tripDest = travel.trip?.dest;
    const ppr = pixelsPerRadian();
    const list = bodyEntries();
    const cands = st.cands;
    cands.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!hasOrbitLine(e)) continue;
      const id = e.id;
      const has = st.set.has(id);
      if (lostInTheDistance(e)) {
        if (has) drop(id);
        continue;
      }
      // What the viewer is looking at: the planets (and anything with a key), the system in
      // focus, the selection and the flight's destination.
      const kind = e.record.kind;
      // Lines drawn only when looked at: asteroids, comets, interstellar objects, and records that say so.
      const onDemand = ON_DEMAND.has(kind) || (e.record.orbitLine !== undefined && e.record.orbitLine !== false && e.record.orbitLine.onDemand === true);
      const tier =
        id === ui.selected || id === ui.focus || id === tripDest
          ? 2
          : (focusGroup !== undefined && e.group === focusGroup && focusGroup.id !== 'sun') ||
              (focusSystem !== undefined && kind === 'star' && e.root === focusSystem) ||
              // Stars orbiting a body that is not a star system's node: the S-stars about Sgr A*, while it or one of them is in focus.
              (kind === 'star' && e.root !== e && e.root.id !== 'sun' && (e.root.id === ui.focus || e.root === focusRoot)) ||
              (!onDemand && (kind === 'planet' || kind === 'dwarf-planet')) ||
              !!e.record.key
            ? 1
            : 0;
      if (tier === 0 && onDemand) {
        if (has) drop(id);
        continue;
      }
      const size = e.state.present ? orbitSizePx(e, ppr) : 0;
      if (size >= MOUNT_PX || (has && size >= UNMOUNT_PX)) {
        st.small.delete(id);
        const c = st.pool[cands.length] ?? (st.pool[cands.length] = { id, rank: 0 });
        c.id = id;
        c.rank = tier * TIER + (has ? size * INCUMBENT_BONUS : size);
        cands.push(c);
      } else if (has) {
        const n = (st.small.get(id) ?? 0) + 1;
        if (n > UNMOUNT_FRAMES || !e.state.present) drop(id);
        else st.small.set(id, n);
      }
    }
    // Over budget: keep the lines looked at, then the largest.
    if (cands.length > MAX_LINES) {
      cands.sort(byRank);
      for (let i = MAX_LINES; i < cands.length; i++) if (st.set.has(cands[i].id)) drop(cands[i].id);
      cands.length = MAX_LINES;
    }
    for (let i = 0; i < cands.length; i++) {
      if (!st.set.has(cands[i].id)) {
        st.set.add(cands[i].id);
        changed = true;
      }
    }
    if (st.version !== version) {
      st.version = version;
      for (const id of st.set) if (!entryOf(id)) drop(id);
    }
    if (changed) setMounted([...st.set]);
  });

  return (
    <group visible={show}>
      {mounted
        // A body removed from the registry since the last frame is left out at once.
        .filter((id) => entryOf(id))
        .map((id) => (
          <OrbitLine key={`${id}:${recordSerial(id)}`} id={id} />
        ))}
    </group>
  );
}
