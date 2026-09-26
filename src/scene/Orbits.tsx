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
  type WebGLRenderer,
} from 'three';
import { solveKepler, solveKeplerHyperbolic } from '../physics/kepler';
import { createOrbitMaterial } from '../render/materials';
import { GUIDES_LAYER } from '../render/LightspeedScenePass';
import { relView } from '../render/relativisticView';
import { pixelsPerRadian, solarSystemHidden } from '../sim/derived';
import { recordSerial, registryVersion, subscribeRegistry, type BodyId, type BodyKind } from '../sim/bodies';
import { bodyEntries, entryOf, type Entry } from '../sim/bodies/registry';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { useUI } from '../state/ui';
import { conicFromState, makeConic, orbitMu, orbitSource, segmentsFor, viewDistance, visVivaA, type Conic, type OrbitSource } from './orbitLines';

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
const ON_DEMAND: ReadonlySet<BodyKind> = new Set<BodyKind>(['asteroid', 'comet', 'interstellar']);
/**
 * Below this opacity nothing of a line survives the fragment shader (alpha < 0.003 is
 * discarded, and the brightest part of a line, its trail, has alpha 0.62 × opacity): don't draw it.
 */
const MIN_OPACITY = 0.003 / 0.62;

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

/** Whether a body gets an orbit line at all (not stars, barycentres, or records that say no). */
function hasOrbitLine(e: Entry): boolean {
  const r = e.record;
  if (r.orbitLine === false || e.isNode || !e.parent) return false;
  return r.kind !== 'star' && r.kind !== 'galaxy' && r.kind !== 'cluster' && r.kind !== 'nebula';
}

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
  const material = useMemo<ShaderMaterial>(() => createOrbitMaterial(new Color(colour).lerp(new Color('#cfd8ea'), 0.55)), [colour]);
  // R3F disposes neither a geometry nor a material handed to a mesh as props.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<Mesh | null>(null);
  const scratch = useMemo(() => ({ src: { rel: null as unknown as Entry, centre: null, view: null } as OrbitSource, conic: makeConic() }), []);

  useFrame(({ camera, gl }) => {
    const e = entryOf(id);
    const b = e?.state;
    const u = material.uniforms;
    // From beyond the Solar System's pixel there is nothing to draw (and nothing to compute).
    if (!e || !b || !b.present || solarSystemHidden()) return hideLine(material, mesh.current);
    const src = orbitSource(e, scratch.src);
    const mu = orbitMu(e, src);
    const r = src.rel.rel.pos;
    const v = src.rel.rel.vel;

    // Fade orbits that are tiny on screen (e.g. the Moon's orbit seen from Neptune), and dim
    // them in close-ups, where distant orbits only cross the view as edge-on streaks. The size
    // comes from the vis-viva semi-major axis, before any other work: hidden lines cost little.
    const ui = useUI.getState();
    const dist = viewDistance(src.view, sim.camera.pos, sim.bodies.sun?.distCamera ?? Infinity);
    const sizePx = (visVivaA(r, v, mu) / Math.max(dist, 1)) * pixelsPerRadian();
    const selected = ui.selected === id ? 1.35 : 1;
    const closeUp = ui.controlMode === 'free' ? 0 : smoothstep(40, 220, sim.bodies[ui.focus]?.radiusPx ?? 0);
    const opacity = smoothstep(4, 40, sizePx) * selected * (1 - 0.85 * closeUp);
    if (!(opacity > MIN_OPACITY)) return hideLine(material, mesh.current);
    u.uOpacity.value = opacity;
    if (mesh.current) mesh.current.visible = true;

    const o = conicFromState(r, v, mu, scratch.conic);
    u.uBodyPos.value.copy(b.apparentPos).sub(sim.camera.pos);
    u.uP.value.copy(o.P);
    u.uQ.value.copy(o.Q);
    u.uA.value = Math.abs(o.a);
    u.uB.value = o.b;
    // Draw through where the body appears: step the anomaly back by the light delay.
    u.uAnomaly.value = b.lightDelay > 0 ? anomalyAt(o, o.meanAnomaly - o.meanMotion * b.lightDelay) : o.anomaly;
    u.uHyperbolic.value = o.hyperbolic ? 1 : 0;
    u.uClosed.value = o.hyperbolic ? 0 : 1;
    if (o.hyperbolic) {
      // Trail back to where the path starts (Voyager 1: its Saturn flyby in 1980), after which
      // it has coasted on this hyperbola.
      const from = e.record.orbitLine ? e.record.orbitLine.trailFromMs : undefined;
      if (from !== undefined) {
        const dt = (from - sim.timeMs) / 1000;
        const H0 = solveKeplerHyperbolic(o.meanAnomaly + o.meanMotion * dt, o.e);
        u.uSpanMin.value = Math.min(0, H0 - o.anomaly);
      }
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
    // Nothing to draw: lines hidden, the Solar System a speck, or the relativistic view (not
    // split), which leaves guides out.
    if (!show || solarSystemHidden() || (relView.active && !relView.split)) {
      if (st.set.size) {
        st.set.clear();
        st.small.clear();
        setMounted([]);
      }
      return;
    }
    const ui = useUI.getState();
    const focusGroup = entryOf(ui.focus)?.group;
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
      // What the viewer is looking at: the planets (and anything with a key), the system in
      // focus, the selection and the flight's destination.
      const kind = e.record.kind;
      const tier =
        id === ui.selected || id === ui.focus || id === tripDest
          ? 2
          : (focusGroup !== undefined && e.group === focusGroup && focusGroup.id !== 'sun') ||
              kind === 'planet' ||
              kind === 'dwarf-planet' ||
              !!e.record.key
            ? 1
            : 0;
      if (tier === 0 && ON_DEMAND.has(kind)) {
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
