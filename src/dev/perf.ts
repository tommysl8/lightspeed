/**
 * GPU and CPU timing of whole frames inside the running app (window.__ls.perf, development builds only).
 *
 * What: whole-frame GPU time from timer queries (EXT_disjoint_timer_query_webgl2) round __ls.step(1), as the
 * best and the median of batch medians, with the CPU time of each step and the canvas it was taken on;
 * A/B comparisons interleaved in the same minutes; the GPU time of the passes that are separated by
 * render-target switches; the quality pinned (pixel ratio 2, no multisampling, a fixed lens rung, the GPU-time
 * controller paused); the standard views near a black hole (docs/data/blackholes.md §11); cold compiles of the programs drawn later (and of the
 * exact orbit program, compiled only when first wanted) and the start-up total; the sky cube's face renders; one frame read back as pixels, or as the scene pass's own light in
 * floats (before bloom and tone mapping). A view waits for the background compiles, so the lens is drawn in it.
 *
 * How: frames are driven by stepping the render loop (@react-three/fiber's advance, with the simulation's
 * fixed debug step), so it works while the tab is hidden. Waiting is done by yielding through a message
 * channel, not by timers, which a hidden tab throttles to one a second or less. A batch the driver marks
 * disjoint is thrown away. Timer queries never nest: `passes()` ends one query and begins the next at every
 * render-target switch, and every measurement pauses the GPU-time controller, whose own query would
 * otherwise collide with these.
 *
 * Why: per-object queries misattribute work on this GPU (the plain Galaxy composite read 0.8 or 2.0 ms
 * depending on what was drawn after it), so a piece drawn inside one render is costed only by whole frames
 * with and without it, interleaved (`ab`); and single batches swing by a millisecond, so every figure is a
 * median of batch medians, reported with its best, its conditions and the time it was taken.
 *
 * Cost: nothing unless called; it is imported only by the development build's __ls wiring (main.tsx). While
 * it measures, the main thread is busy stepping frames and the page does nothing else.
 *
 * Twins: scripts/lens-check/lens-check.js and run-perf.mjs drive it (the GPU checks, and the views in a Chrome
 * of their own); scripts/check-shaders.mjs does the compile checks headless; render/gpuBudget.ts is the in-app
 * controller it pauses. docs/data/blackholes.md §11 records what it measured.
 */
import { _roots, advance } from '@react-three/fiber';
import { EffectComposer } from 'postprocessing';
import {
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  type ShaderMaterial,
  Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { quality, type LensRung } from '../render/quality';
import { gpuBudget } from '../render/gpuBudget';
import { galaxyLayer } from '../render/galaxyLayer';
import { relView } from '../render/relativisticView';
import { LATER_MATERIALS, lensPassesReady, precompileSoon, type LaterMaterial } from '../render/precompile';
import { LENS_LATER } from '../render/lens/lensMaterials';
import { lens } from '../render/lens/lensState';
import { skyCube } from '../render/lens/skyCube';
import { EXACT_ORBIT_LATER, VERTEX_LENS_LATER } from '../render/lensVariants';
import { RING_LATER } from '../render/lensRingMaterial';
import { FLOW_LATER, flowUniforms } from '../render/flow/flowMap';
import {
  createCosmicWebMaterial,
  createGlintMaterial,
  createHostRingMaterial,
  createStarMaterial,
  createClusterRingMaterial,
  createConstellationMaterial,
  createNebulaMaterial,
} from '../render/materials';
import { sim } from '../sim/sim';
import { travel, shipStateAtTau, setShipRate } from '../sim/travel';
import { gravity } from '../sim/gravity';
import { fall, startFall } from '../sim/fall';
import { equatorialToWorld } from '../sim/galaxy/frames';
import { galaxyStatus } from '../sim/galaxy/load';
import { cosmosStatus } from '../sim/cosmos/load';
import { starStatus } from '../sim/stars/load';
import { controller } from '../controls/cameraController';
import { minDistance } from '../controls/framing';
import { getBody } from '../sim/bodies/registry';
import { useUI } from '../state/ui';
import { runScene } from '../content/scenes';
import { stopTrip } from '../ui/tripActions';
import { AU_KM, PARSEC_KM } from '../physics/constants';

// ─── The interface ────────────────────────────────────────────────────────────────────────────────

/** The standard views near a black hole, and a few of the baselines measured before the lens. */
export type PerfViewName =
  | 'framing'
  | '1000au'
  | '500au'
  | '100M'
  | 'arriving'
  | 'arriving-split'
  | 'free-500au'
  | 'fall-horizon'
  | 'fall-6M'
  | '100M-flow'
  | 'flow-20M'
  | 'gaia-bh1-companion'
  | 'm87-1000au'
  | 'flight-start-split'
  // the other baselines
  | 'earth'
  | 'gc-orbits'
  | 'flight-1s'
  | 'flight-1s-split'
  | 'flight-3s'
  | 'flight-6s'
  | 'flight-6s-split'
  | 'arriving-4499'
  | 'arriving-4499-split'
  // The sky map's handover region without a black hole (9.3–10.3 ms warm when measured for docs/data/cosmos.md)
  | 'handover-300pc'
  | 'handover-480pc';

/** One whole-frame measurement. */
export interface FrameMeasure {
  /** Best (lowest) batch median, GPU ms. */
  gpu: number;
  /** Median of the batch medians, GPU ms. */
  gpuMed: number;
  /** Best batch median of the step's CPU time (the whole frame's JavaScript), ms. */
  cpu: number;
  cpuMed: number;
  /** Canvas size in device px, and its pixel ratio. */
  w: number;
  h: number;
  dpr: number;
  msaa: number;
  rung: LensRung;
  /** A black hole's lens was drawn in the last frame measured. */
  lens: boolean;
  /** Batch medians, GPU ms, in order. */
  batches: number[];
  /** Batches dropped because the driver marked them disjoint. */
  disjoint: number;
  /** Local time the measurement ended. */
  at: string;
  hidden: boolean;
}

/** What `ab` returns: the median GPU ms of each round, A and B interleaved. */
export interface AbResult {
  a: number[];
  b: number[];
  /** Median over rounds of each; B − A as the median of the rounds' differences. */
  aMed: number;
  bMed: number;
  diffMed: number;
  /** Each round's B − A, and their spread (largest − smallest): a spread near the difference itself means noise. */
  diffs: number[];
  diffSpread: number;
  aBest: number;
  bBest: number;
  w: number;
  h: number;
  at: string;
}

/** window.__ls.perf. */
export interface PerfApi {
  /** GPU ms of whole frames: best and median of batch medians (EXT_disjoint_timer_query_webgl2, disjoint checked). */
  measure(frames?: number, batches?: number): Promise<FrameMeasure>;
  /** Per named pass, only where passes are separated by render-target switches: 'galaxyLayer', 'skyCubeFace', 'flowMap', 'post' (and 'scene', 'relCube', 'frame'). */
  passes(frames?: number): Promise<Record<string, number>>;
  /** Pin pixel ratio 2 and no multisampling; pause the GPU-time controller at rung `rung`. */
  pin(rung?: LensRung): void;
  /** Place the camera for one of the standard views (or the other baselines), then warm the GPU 150 frames. */
  view(name: PerfViewName): Promise<void>;
  /** Interleave two settings in the same minutes: measure(setA), measure(setB), repeated (the only trustworthy way to cost a piece inside one render). */
  ab(setA: () => void, setB: () => void, rounds?: number): Promise<AbResult>;
  /** Cold compile of each program drawn later (unique marker comment), the plain point programs for comparison, and the start-up total of the first 30 frames. */
  compiles(): Promise<Record<string, number>>;
  /** The sky cube's face draws over `frames` frames (render/lens/skyCube.ts counts them; expected 6 faces and one mipmap pass an approach). */
  cubeFaces(frames: number): Promise<number>;
}

/** The additions beyond PerfApi. */
export interface PerfExtras {
  /** Let the GPU-time controller run again and the quality move (after `pin`). */
  unpin(): void;
  /** Step `frames` frames of 1/60 s in chunks, yielding between them so loaders and workers can deliver. */
  settle(frames?: number): Promise<void>;
  /** Wait (stepping frames) until the stars, the Galaxy and the galaxies beyond have loaded, or `timeoutMs` passes. */
  ready(timeoutMs?: number): Promise<Record<string, string>>;
  /** Render one frame and read the canvas back (RGBA, bottom row first), in the same task. */
  readFrame(): { w: number; h: number; data: Uint8Array };
  /** Render one frame and read the scene pass's own output (linear light before bloom and tone mapping) as floats, bottom row first (the buffer is reused by the next call). */
  readHdr(): { w: number; h: number; data: Float32Array };
  /**
   * Draw into a canvas of w × h CSS px at pixel ratio dpr (the reference pictures are 360 × 240 at 1), until
   * called with null, which gives the canvas back to the page's layout.
   */
  canvasSize(w: number | null, h?: number, dpr?: number): Promise<{ w: number; h: number }>;
  /** The renderer's name, the canvas, the pin and the page's visibility. */
  info(): Record<string, unknown>;
  /** The scene and the view's camera (for costing a piece by hiding its material in an A/B). */
  scene(): { scene: Scene; camera: PerspectiveCamera };
  /** The pipeline's composer once it has rendered (its passes hold the relativistic view's remap scene). */
  composer(): EffectComposer | null;
  /** Every measurement of this page, oldest first. */
  readonly log: Record<string, unknown>[];
  /** The details of the last cubeFaces() and compiles() runs. */
  readonly last: Record<string, unknown>;
}

// ─── The page's renderer, composer and store ────────────────────────────────────────────────────────

/** The start-up frames main.tsx records from the very first frame (window.__lsStartup), before this module loads. */
interface StartupFrames {
  /** When the first frame began (performance.now). */
  firstStartMs: number;
  /** When each of the first frames ended. */
  endsMs: number[];
}

type StepWindow = Window & { __lsStartup?: StartupFrames };

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

let composerSeen: EffectComposer | null = null;
{
  // Capture the pipeline's composer (render/RenderPipeline.tsx keeps it in a React memo) the first time it renders.
  const proto = EffectComposer.prototype as EffectComposer & { __lsPerf?: boolean };
  if (!proto.__lsPerf) {
    const render = proto.render;
    proto.render = function (this: EffectComposer, dt?: number) {
      composerSeen = this;
      return render.call(this, dt);
    };
    proto.__lsPerf = true;
  }
}

function root() {
  const r = _roots.values().next().value;
  if (!r) throw new Error('[lightspeed] perf: no canvas yet');
  return r.store.getState();
}

function renderer(): WebGLRenderer {
  return root().gl;
}

function gl2(): WebGL2RenderingContext {
  return renderer().getContext() as WebGL2RenderingContext;
}

function timerExt(): TimerExt {
  const ext = gl2().getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext) throw new Error('[lightspeed] perf: EXT_disjoint_timer_query_webgl2 is not available in this browser');
  return ext;
}

/**
 * Stop the page's own frames while `run` measures (in a visible tab the render loop would otherwise draw frames
 * of its own between the stepped ones, on the same GPU), and give the loop back after. A hidden tab draws
 * none anyway.
 */
async function holdingLoop<T>(run: () => Promise<T>): Promise<T> {
  const state = root();
  const before = state.frameloop;
  state.setFrameloop('never');
  try {
    return await run();
  } finally {
    root().setFrameloop(before);
  }
}

/** Step the render loop n frames of dt seconds each (as __ls.step does). */
function step(n = 1, dt = 1 / 60): void {
  sim.debugDt = dt;
  try {
    for (let i = 0; i < n; i++) advance(performance.now());
  } finally {
    sim.debugDt = 0;
  }
}

// Yielding without timers: a hidden tab runs message-channel tasks at once, and timers once a second or less.
let channel: MessageChannel | null = null;
const waiting: (() => void)[] = [];
function yieldTask(): Promise<void> {
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => waiting.shift()?.();
  }
  return new Promise((resolve) => {
    waiting.push(resolve);
    channel!.port2.postMessage(0);
  });
}

const median = (xs: readonly number[]): number => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
};
const round2 = (x: number): number => Math.round(x * 100) / 100;
const clock = (): string => new Date().toTimeString().slice(0, 8);

/** Wait for every query's result (flushing now and then), read them in ms, and delete them; null when the GPU reported a disjoint. */
async function collect(queries: readonly WebGLQuery[]): Promise<number[] | null> {
  const gl = gl2();
  const ext = timerExt();
  gl.flush();
  const t0 = performance.now();
  for (let i = 0; performance.now() - t0 < 5000; i++) {
    if (queries.every((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))) break;
    if (i % 64 === 63) gl.flush();
    await yieldTask();
  }
  const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
  const ms = queries.map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6 : NaN));
  for (const q of queries) gl.deleteQuery(q);
  return disjoint ? null : ms;
}

/** Throw if a timer query is open (the GPU-time controller's, or a measurement still running). */
function assertNoQuery(): void {
  const gl = gl2();
  if (gl.getQuery(timerExt().TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
    throw new Error('[lightspeed] perf: a timer query is already open (is the GPU-time controller paused? is another measurement running?)');
  }
}

// ─── Pinning ──────────────────────────────────────────────────────────────────────────────────────

const pinned = { on: false, rung: 0 as LensRung, dpr: 2 };

/** Apply the pin again (adaptive quality may have moved the pixel ratio between calls). */
function applyPin(): void {
  if (!pinned.on) pin(0);
  quality.msaa = 0;
  quality.maxDpr = Math.max(quality.maxDpr, pinned.dpr);
  quality.dpr = pinned.dpr;
  quality.lensRung = pinned.rung;
  gpuBudget.pause(true);
  const state = root();
  if (state.viewport.dpr !== pinned.dpr) state.setDpr(pinned.dpr);
}

function pin(rung: LensRung = 0): void {
  pinned.on = true;
  pinned.rung = rung;
  applyPin();
}

function unpin(): void {
  pinned.on = false;
  gpuBudget.pause(false);
}

// ─── Whole frames ───────────────────────────────────────────────────────────────────────────────────

const log: Record<string, unknown>[] = [];
const last: Record<string, unknown> = {};

async function measure(frames = 20, batches = 8): Promise<FrameMeasure> {
  return holdingLoop(() => measureHeld(frames, batches));
}

async function measureHeld(frames: number, batches: number): Promise<FrameMeasure> {
  applyPin();
  step(3);
  assertNoQuery();
  const gl = gl2();
  const ext = timerExt();
  const gpuMeds: number[] = [];
  const cpuMeds: number[] = [];
  let disjoint = 0;
  for (let b = 0; b < batches; b++) {
    const queries: WebGLQuery[] = [];
    const cpu: number[] = [];
    for (let i = 0; i < frames; i++) {
      const q = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      const t0 = performance.now();
      step(1);
      cpu.push(performance.now() - t0);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(q);
    }
    const ms = await collect(queries);
    if (ms) gpuMeds.push(median(ms));
    else disjoint++;
    cpuMeds.push(median(cpu));
    await yieldTask();
  }
  const cv = renderer().domElement;
  const out: FrameMeasure = {
    gpu: round2(Math.min(...gpuMeds)),
    gpuMed: round2(median(gpuMeds)),
    cpu: round2(Math.min(...cpuMeds)),
    cpuMed: round2(median(cpuMeds)),
    w: cv.width,
    h: cv.height,
    dpr: renderer().getPixelRatio(),
    msaa: composerSeen?.multisampling ?? quality.msaa,
    rung: quality.lensRung,
    lens: lens.active,
    batches: gpuMeds.map(round2),
    disjoint,
    at: clock(),
    hidden: document.hidden,
  };
  log.push({ kind: 'measure', view: currentView, ...out });
  return out;
}

async function ab(setA: () => void, setB: () => void, rounds = 3): Promise<AbResult> {
  const a: number[] = [];
  const b: number[] = [];
  let aBest = Infinity;
  let bBest = Infinity;
  for (let r = 0; r < rounds; r++) {
    setA();
    await settle(60);
    const ma = await measure(20, 4);
    setB();
    await settle(60);
    const mb = await measure(20, 4);
    a.push(ma.gpuMed);
    b.push(mb.gpuMed);
    aBest = Math.min(aBest, ma.gpu);
    bBest = Math.min(bBest, mb.gpu);
  }
  const cv = renderer().domElement;
  const out: AbResult = {
    a,
    b,
    aMed: round2(median(a)),
    bMed: round2(median(b)),
    diffMed: round2(median(a.map((x, i) => b[i] - x))),
    diffs: a.map((x, i) => round2(b[i] - x)),
    diffSpread: round2(Math.max(...a.map((x, i) => b[i] - x)) - Math.min(...a.map((x, i) => b[i] - x))),
    aBest,
    bBest,
    w: cv.width,
    h: cv.height,
    at: clock(),
  };
  log.push({ kind: 'ab', view: currentView, ...out });
  return out;
}

// ─── Passes, across render-target switches ────────────────────────────────────────────────────────────

type Target = WebGLRenderTarget & { isWebGLCubeRenderTarget?: boolean };

/** The Galaxy layer's own targets (whatever it holds now: rt, rtBig, and any added later). */
function galaxyTargets(): Set<unknown> {
  const s = new Set<unknown>();
  for (const v of Object.values(galaxyLayer as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && (v as { isWebGLRenderTarget?: boolean }).isWebGLRenderTarget) s.add(v);
  }
  return s;
}

/** The relativistic view's own cube (render/LightspeedScenePass.ts), not the black hole's sky cube. */
function relCube(): unknown {
  const pass = composerSeen?.passes[0] as unknown as { cubeRT?: unknown } | undefined;
  return pass?.cubeRT ?? null;
}

/** Wrap the renderer's setRenderTarget for the duration of `run`, calling `on` before each switch. */
function onTargetSwitch(on: (target: Target | null, face: number) => void, run: () => void): void {
  const r = renderer();
  const original = r.setRenderTarget;
  r.setRenderTarget = function (target: WebGLRenderTarget | null, activeCubeFace = 0, activeMipmapLevel = 0) {
    on(target as Target | null, activeCubeFace);
    return original.call(this, target, activeCubeFace, activeMipmapLevel);
  };
  try {
    run();
  } finally {
    r.setRenderTarget = original;
  }
}

async function passes(frames = 20): Promise<Record<string, number>> {
  return holdingLoop(() => passesHeld(frames));
}

async function passesHeld(frames: number): Promise<Record<string, number>> {
  applyPin();
  step(3);
  assertNoQuery();
  const gl = gl2();
  const ext = timerExt();
  const composer = composerSeen;
  if (!composer) throw new Error('[lightspeed] perf: the composer has not rendered yet');
  const labels: string[] = [];
  const queries: WebGLQuery[] = [];
  let open = false;
  let stage = 'frame';
  const begin = (label: string) => {
    if (open) gl.endQuery(ext.TIME_ELAPSED_EXT);
    const q = gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    open = true;
    queries.push(q);
    labels.push(label);
  };
  const galaxy = galaxyTargets();
  const cube = relCube();
  const classify = (t: Target | null): string => {
    if (t && galaxy.has(t)) return 'galaxyLayer';
    if (t?.isWebGLCubeRenderTarget) return t === cube ? 'relCube' : 'skyCubeFace';
    if (t && flowUniforms.uFlowMap.value && t.texture === (flowUniforms.uFlowMap.value as unknown)) return 'flowMap';
    return stage;
  };
  // Each composer pass sets the stage its own switches are counted under.
  const restore: (() => void)[] = [];
  for (const p of composer.passes) {
    const label = p.name === 'LightspeedScenePass' ? 'scene' : 'post';
    const render = p.render;
    p.render = function (...args: Parameters<typeof render>) {
      const before = stage;
      stage = label;
      begin(label);
      try {
        return render.apply(this, args);
      } finally {
        stage = before;
        begin(before);
      }
    };
    restore.push(() => (p.render = render));
  }
  try {
    onTargetSwitch(
      (t) => begin(classify(t)),
      () => {
        for (let i = 0; i < frames; i++) {
          stage = 'frame';
          begin('frame');
          step(1);
        }
        if (open) gl.endQuery(ext.TIME_ELAPSED_EXT);
        open = false;
      },
    );
  } finally {
    for (const f of restore) f();
  }
  const ms = await collect(queries);
  if (!ms) return { disjoint: 1 };
  const sums: Record<string, number> = {};
  labels.forEach((k, i) => (sums[k] = (sums[k] ?? 0) + (Number.isFinite(ms[i]) ? ms[i] : 0) / frames));
  let total = 0;
  for (const k of Object.keys(sums)) {
    total += sums[k];
    sums[k] = Math.round(sums[k] * 1000) / 1000;
  }
  sums.total = round2(total);
  log.push({ kind: 'passes', view: currentView, at: clock(), ...sums });
  return sums;
}

// ─── The sky cube's faces ────────────────────────────────────────────────────────────────────────────

async function cubeFaces(frames: number): Promise<number> {
  const cube = relCube();
  const faces = new Set<string>();
  let renders = 0;
  let frame = 0;
  // The sky cube's own count of its face draws (render/lens/skyCube.ts), and its target switches seen here.
  const before = skyCube.faceRenders;
  const doneBefore = skyCube.done;
  onTargetSwitch(
    (t, face) => {
      if (!t?.isWebGLCubeRenderTarget || t === cube) return;
      renders++;
      faces.add(`${frame}:${face}`);
    },
    () => {
      for (frame = 0; frame < frames; frame++) step(1);
    },
  );
  await yieldTask();
  const drawn = skyCube.faceRenders - before;
  last.cubeFaces = { frames, faceDraws: drawn, mipmapsDrawn: doneBefore <= 6 && skyCube.done > 6, faceTargetsSeen: faces.size, targetSwitches: renders, at: clock() };
  log.push({ kind: 'cubeFaces', view: currentView, ...(last.cubeFaces as object) });
  return drawn;
}

// ─── Compiles ─────────────────────────────────────────────────────────────────────────────────────────

/** The plain point programs, whose lensed variants are compiled in the background (to set each variant's cold compile against its plain program's). */
const PLAIN_POINT: readonly (readonly [string, () => ShaderMaterial, LaterMaterial[1]])[] = [
  ['plain:stars', createStarMaterial, 'points'],
  ['plain:glints', createGlintMaterial, 'points'],
  ['plain:constellations', createConstellationMaterial, 'lines'],
  ['plain:host rings', createHostRingMaterial, 'points'],
  ['plain:cluster rings', createClusterRingMaterial, 'points'],
  ['plain:cosmic web', createCosmicWebMaterial, 'points'],
  ['plain:nebula', createNebulaMaterial, 'quad'],
];

let compileRun = 0;

/** Compile one material cold (a unique marker comment defeats three's and the browser's program caches) and time it to the end of linking. */
function coldCompile(make: () => ShaderMaterial, drawn: LaterMaterial[1], marker: string): number {
  const r = renderer();
  const material = make();
  const tag = `\n// cold compile ${marker}\n`;
  material.vertexShader = tag + material.vertexShader;
  material.fragmentShader = tag + material.fragmentShader;
  material.needsUpdate = true;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const object = drawn === 'points' ? new Points(geometry, material) : drawn === 'lines' ? new LineSegments(geometry, material) : new Mesh(new PlaneGeometry(2, 2), material);
  object.frustumCulled = false;
  const scene = new Scene();
  scene.add(object);
  const camera = drawn === 'quad' ? new OrthographicCamera(-1, 1, 1, -1, 0, 1) : new PerspectiveCamera(50, 1, 1e-3, 1e25);
  const t0 = performance.now();
  r.compile(scene, camera);
  // compile() issues the compile and link; three.js waits for them when the program is first used.
  const program = (r.properties.get(material) as { currentProgram?: { getUniforms(): unknown } }).currentProgram;
  program?.getUniforms();
  const ms = performance.now() - t0;
  material.dispose();
  geometry.dispose();
  if (object instanceof Mesh) object.geometry.dispose();
  return Math.round(ms * 10) / 10;
}

const nameOf = (make: () => ShaderMaterial, i: number, list: string): string => {
  const m = make();
  const lensed = m.defines && ('LENS' in m.defines || 'LENS_EXACT' in m.defines) ? '+LENS' : '';
  const n = `${list}:${m.name || make.name || '#' + i}${lensed}`;
  m.dispose();
  return n;
};

async function compiles(): Promise<Record<string, number>> {
  const run = ++compileRun;
  const out: Record<string, number> = {};
  const lists: [string, readonly LaterMaterial[]][] = [
    ['lens', LENS_LATER],
    ['vertexLens', VERTEX_LENS_LATER],
    ['ring', RING_LATER],
    ['flow', FLOW_LATER],
  ];
  const lensed = new Set<LaterMaterial>(lists.flatMap(([, l]) => l));
  let laterTotal = 0;
  let i = 0;
  for (const [list, entries] of [...lists, ['later', LATER_MATERIALS.filter((e) => !lensed.has(e))] as [string, readonly LaterMaterial[]]]) {
    for (const [make, drawn] of entries) {
      const key = nameOf(make, i, list);
      const ms = coldCompile(make, drawn, `${run}.${i++}.${Date.now()}`);
      out[key in out ? `${key}#${i}` : key] = ms;
      laterTotal += ms;
      await yieldTask();
    }
  }
  for (const [key, make, drawn] of PLAIN_POINT) {
    out[key] = coldCompile(make, drawn, `${run}.${i++}.${Date.now()}`);
    await yieldTask();
  }
  // The exact orbit program: compiled only when an orbit line near a hole first wants it, never in the background list.
  for (const [make, drawn] of EXACT_ORBIT_LATER) {
    out[`on demand:${nameOf(make, i, 'exactOrbit')}`] = coldCompile(make, drawn, `${run}.${i++}.${Date.now()}`);
    await yieldTask();
  }
  out['background list total'] = Math.round(laterTotal * 10) / 10;
  const s = (window as StepWindow).__lsStartup;
  if (s && s.endsMs.length >= 30) {
    out['start-up: first 30 frames'] = Math.round(s.endsMs[29] - s.firstStartMs);
  }
  out['programs now'] = renderer().info.programs?.length ?? 0;
  last.compiles = { ...out, at: clock() };
  log.push({ kind: 'compiles', ...out, at: clock() });
  return out;
}

// ─── Views ──────────────────────────────────────────────────────────────────────────────────────────

/** Sgr A*'s M = GM/c² (km) for placing views before the gravity state is real (4.297 × 10⁶ M☉; docs/data/blackholes.md §4). */
const SGR_A_M_KM = 6_345_058;
/** Gaia BH1 (El-Badry et al. 2023, Gaia DR3 photocentre; 480 pc): where the view goes before its record exists. */
const GAIA_BH1 = { raDeg: 262.17120816, decDeg: -0.58109202, pc: 480 };

let currentView: PerfViewName | null = null;

async function settle(frames = 240): Promise<void> {
  // Adaptive quality may lower the pixel ratio while frames run slow: a pin holds through the frames stepped here.
  if (pinned.on) applyPin();
  for (let i = 0; i < frames; i += 20) {
    step(Math.min(20, frames - i));
    await yieldTask();
  }
}

async function ready(timeoutMs = 60_000): Promise<Record<string, string>> {
  const t0 = performance.now();
  const state = () => ({ stars: starStatus(), galaxy: galaxyStatus(), cosmos: cosmosStatus() });
  const done = (s: Record<string, string>) => Object.values(s).every((x) => x === 'ready' || x === 'failed');
  while (!done(state()) && performance.now() - t0 < timeoutMs) {
    step(2);
    // Loaders run in idle time and workers: give them real time between frames.
    await new Promise((r) => setTimeout(r, 50));
  }
  return state();
}

const distanceTo = (id: string): number => {
  const b = sim.bodies[id];
  return b ? sim.camera.pos.distanceTo(b.pos) : NaN;
};

/** Leave any trip, fall or hole mode and go back to the classical view, with lensing and the flow as a visitor first has them. */
function reset(relMode: 'off' | 'on' | 'split' = 'off'): void {
  if (fall.trip) stopTrip();
  if (travel.trip) stopTrip();
  controller.leaveHoleModes();
  useUI.setState({ relMode, lensing: true, accretionFlow: true });
}

/**
 * Go to a body at a distance and wait until the controller orbits it there. A distance inside the body's
 * closest approach (framing.ts minDistance) becomes that distance, and the log says so.
 */
async function goAt(id: string, km: number, direction?: Vector3): Promise<void> {
  if (!sim.bodies[id]) throw new Error(`[lightspeed] perf: ${id} is not registered (yet)`);
  const want = Math.max(km, minDistance(id));
  if (want !== km) log.push({ kind: 'note', view: currentView, note: `${id}: ${km} km is inside its closest approach; placed at ${want} km` });
  controller.goTo(id, direction ? { distance: want, direction } : { distance: want, keepDirection: true });
  for (let i = 0; i < 60; i++) {
    await settle(60);
    if (controller.mode === 'orbit' && Math.abs(distanceTo(id) / want - 1) < 1e-3) return;
  }
  throw new Error(`[lightspeed] perf: did not reach ${id} at ${want} km (now ${distanceTo(id)} km, mode ${controller.mode})`);
}

async function framing(): Promise<void> {
  reset();
  runScene('go:sgr-a-star');
  for (let i = 0; i < 60 && !(controller.mode === 'orbit' && Math.abs(distanceTo('sgr-a-star') / (4000 * AU_KM) - 1) < 1e-3); i++) await settle(60);
}

/**
 * The 1 g flight to Sgr A* from Earth, placed at the ship time where `f` changes sign (bisection over the
 * trip's proper time), then paced at one ship second a real second, so the view holds still while it is measured.
 */
async function flightAt(f: (beta: number, remainingKm: number) => number, lo: number, hi: number, relMode: 'on' | 'split'): Promise<void> {
  reset(relMode);
  runScene('go:earth');
  await settle(600);
  runScene('fly:sgr-a-star');
  step(2);
  const t = travel.trip;
  if (!t || t.pacing !== 'ship') throw new Error('[lightspeed] perf: the flight to Sgr A* did not start');
  let a = lo * t.shipTime;
  let b = hi * t.shipTime;
  const g = (tau: number) => {
    const s = shipStateAtTau(t, tau);
    return f(s.beta, t.distance - s.covered);
  };
  const ga = g(a);
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b);
    if (Math.sign(g(m)) === Math.sign(ga)) a = m;
    else b = m;
  }
  t.tau = a;
  setShipRate(1);
  await settle(120);
}

/** Arriving: the flight's remaining distance puts the ship `au` from Sgr A* (it arrives at the 4,000-au framing distance). */
const arriving = (au: number, relMode: 'on' | 'split') => flightAt((_, rem) => rem - (au - 4000) * AU_KM, 0.5, 1, relMode);
const flightBeta = (beta: number, relMode: 'on' | 'split') => flightAt((b) => b - beta, 0, 0.5, relMode);

/**
 * Free flight without the pointer lock: with it, a lock refused or released (a hidden tab, another window
 * taking the focus) ends free flight and the camera flies off to orbit the nearest body mid-measurement.
 */
function enterFreeFlight(): void {
  const c = controller as unknown as { dom: HTMLElement | null };
  const dom = c.dom;
  c.dom = null;
  try {
    controller.enterFreeFlight();
  } finally {
    c.dom = dom;
  }
}

/** Free flight: W held at the throttle that gives `beta` (bisection over the throttle). */
function freeFlight(beta: number): void {
  enterFreeFlight();
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    controller.throttle = 0.5 * (lo + hi);
    if (controller.throttleBeta < beta) lo = controller.throttle;
    else hi = controller.throttle;
  }
  (controller as unknown as { keys: Set<string> }).keys.add('KeyW');
}

/** Stand in free flight at a heliocentric point (km, world axes), looking at `at`; check it is still there after settling. */
async function standAt(pos: Vector3, at: Vector3): Promise<void> {
  // Free flight rides along with its reference body; Earth's motion is negligible here, and a black hole as the
  // reference would keep the camera on its own hole-relative place instead of this one.
  controller.target = 'earth';
  enterFreeFlight();
  (controller as unknown as { keys: Set<string> }).keys.clear();
  sim.camera.pos.copy(pos);
  const m = new Matrix4().lookAt(pos, at, new Vector3(0, 1, 0));
  sim.camera.quat.setFromRotationMatrix(m);
  await settle(300);
  const off = sim.camera.pos.distanceTo(pos);
  if (controller.mode !== 'free' || off > 1e-6 * pos.length() + 1e6) {
    throw new Error(`[lightspeed] perf: the camera left its place (mode ${controller.mode}, ${off.toExponential(2)} km away)`);
  }
}

/**
 * Start the background compiles now and wait (stepping frames) until they are done: the lens is drawn only once its
 * programs have compiled (render/precompile.ts lensPassesReady), so a view measured before would have no lens.
 */
async function programsReady(timeoutMs = 120_000): Promise<boolean> {
  precompileSoon();
  const t0 = performance.now();
  while (!lensPassesReady() && performance.now() - t0 < timeoutMs) {
    step(1);
    await new Promise((r) => setTimeout(r, 50));
  }
  return lensPassesReady();
}

async function view(name: PerfViewName): Promise<void> {
  currentView = name;
  if (!(await programsReady())) throw new Error('[lightspeed] perf: the background compiles did not finish');
  (controller as unknown as { keys: Set<string> }).keys.clear();
  const au = AU_KM;
  switch (name) {
    case 'earth':
      reset();
      runScene('go:earth');
      await settle(600);
      break;
    case 'framing':
      await framing();
      break;
    case '1000au':
      await framing();
      await goAt('sgr-a-star', 1000 * au);
      break;
    case '500au':
      await framing();
      await goAt('sgr-a-star', 500 * au);
      break;
    case '100M':
      await framing();
      useUI.setState({ accretionFlow: false });
      await goAt('sgr-a-star', 100 * (gravity.hole === 'sgr-a-star' ? gravity.mKm : SGR_A_M_KM));
      break;
    case 'gc-orbits':
      reset();
      runScene('galactic-centre-orbits');
      await settle(600);
      break;
    case 'arriving':
      await arriving(4050, 'on');
      break;
    case 'arriving-split':
      await arriving(4050, 'split');
      break;
    case 'arriving-4499':
      await arriving(4499, 'on');
      break;
    case 'arriving-4499-split':
      await arriving(4499, 'split');
      break;
    case 'flight-1s':
      await flightBeta(0.33, 'on');
      break;
    case 'flight-1s-split':
      await flightBeta(0.33, 'split');
      break;
    case 'flight-3s':
      await flightBeta(0.77, 'on');
      break;
    case 'flight-start-split':
      await flightBeta(0.77, 'split');
      break;
    case 'flight-6s':
      await flightBeta(0.97, 'on');
      break;
    case 'flight-6s-split':
      await flightBeta(0.97, 'split');
      break;
    case 'free-500au':
      await framing();
      await goAt('sgr-a-star', 500 * au);
      useUI.setState({ relMode: 'on' });
      freeFlight(0.1);
      await settle(60);
      break;
    case 'fall-horizon':
    case 'fall-6M': {
      // The fall into Sgr A* from rest at 20 M (as the fall-into-sgr-a-star scene), the flow off as the scene sets it,
      // held at r = 1.8 M (inside the horizon: the raindrop's tables, the classical-cost path) or 6 M (the static
      // tables, the raindrop's motion 0.58c: the relativistic path) so that every batch measures the same frame.
      await framing();
      const hole = sim.bodies['sgr-a-star'];
      const out = new Vector3().subVectors(sim.camera.pos, hole.pos).normalize();
      controller.hoverAt('sgr-a-star', 20, out);
      await settle(60);
      useUI.setState({ accretionFlow: false });
      const started = startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: out, rate: 'auto' });
      if (!started.ok) throw new Error(`[lightspeed] perf: the fall did not start (${started.reason})`);
      const t = fall.trip;
      if (!t) throw new Error('[lightspeed] perf: no fall under way');
      t.tau = t.model.tauAtR(name === 'fall-horizon' ? 1.8 : 6);
      t.fixedRate = 1e-9;
      await settle(30);
      const want = name === 'fall-horizon' ? 1.8 : 6;
      if (!(Math.abs(gravity.rM / want - 1) < 1e-3)) throw new Error(`[lightspeed] perf: the fall is at r = ${gravity.rM} M, not ${want} M`);
      break;
    }
    case '100M-flow':
      await framing();
      useUI.setState({ accretionFlow: true });
      await goAt('sgr-a-star', 100 * (gravity.hole === 'sgr-a-star' ? gravity.mKm : SGR_A_M_KM));
      break;
    case 'flow-20M': {
      // Hovering at 20 M looking at the hole with the flow on (the sgr-a-star-flow scene's distance).
      await framing();
      useUI.setState({ accretionFlow: true });
      const hole = sim.bodies['sgr-a-star'];
      controller.hoverAt('sgr-a-star', 20, new Vector3().subVectors(sim.camera.pos, hole.pos).normalize());
      await settle(120);
      break;
    }
    case 'gaia-bh1-companion': {
      reset();
      if (sim.bodies['gaia-bh1']) {
        // The hole's record (sim/blackholes/records.ts): 10⁶ km from it, on the side away from its companion, looking at the hole.
        const hole = sim.bodies['gaia-bh1'];
        const companionId = getBody('gaia-bh1')?.blackHole?.companion;
        const companion = companionId ? sim.bodies[companionId] : undefined;
        const away = companion ? new Vector3().subVectors(hole.pos, companion.pos).normalize() : undefined;
        runScene('go:gaia-bh1');
        await settle(600);
        await goAt('gaia-bh1', 1e6, away);
      } else {
        // Before the record exists: the same place in today's app (the sky map's handover region, 480 pc).
        const [x, y, z] = equatorialToWorld(GAIA_BH1.raDeg, GAIA_BH1.decDeg, GAIA_BH1.pc * PARSEC_KM);
        const hole = new Vector3(x, y, z);
        const pos = hole.clone().addScaledVector(hole.clone().normalize(), -1e6);
        await standAt(pos, hole);
      }
      break;
    }
    case 'handover-300pc':
    case 'handover-480pc': {
      // Towards Gaia BH1 from the Sun, 300 or 480 pc out, looking on along the same line (no black hole).
      reset();
      const pc = name === 'handover-300pc' ? 300 : 480;
      const [x, y, z] = equatorialToWorld(GAIA_BH1.raDeg, GAIA_BH1.decDeg, pc * PARSEC_KM);
      const pos = new Vector3(x, y, z);
      await standAt(pos, pos.clone().multiplyScalar(2));
      break;
    }
    case 'm87-1000au': {
      reset();
      const id = sim.bodies['m87-star'] ? 'm87-star' : 'm87';
      runScene(`go:${id}`);
      for (let i = 0; i < 60 && controller.mode !== 'orbit'; i++) await settle(60);
      await goAt(id, 1000 * au);
      break;
    }
    default:
      throw new Error(`[lightspeed] perf: no view ${String(name)}`);
  }
  // Warm the GPU on the view.
  await settle(150);
  log.push({ kind: 'view', view: name, at: clock(), beta: round2(relView.beta), split: relView.split, gravityRM: gravity.rM, lens: lens.active });
}

// ─── Frames as pixels ─────────────────────────────────────────────────────────────────────────────────

function readFrame(): { w: number; h: number; data: Uint8Array } {
  const r = renderer();
  const gl = gl2();
  step(1);
  // The drawing buffer is not preserved: read it in the same task as the frame.
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const data = new Uint8Array(w * h * 4);
  r.setRenderTarget(null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { w, h, data };
}

/** readHdr's buffer, kept between calls (a 2,048 × 1,320 frame is 43 MB of floats). */
let hdrBuffer: Float32Array | null = null;

function readHdr(): { w: number; h: number; data: Float32Array } {
  const composer = composerSeen;
  if (!composer) throw new Error('[lightspeed] perf: the composer has not rendered yet');
  const pass = composer.passes[0];
  const render = pass.render;
  const gl = gl2();
  let out: { w: number; h: number; data: Float32Array } | null = null;
  pass.render = function (this: typeof pass, ...args: Parameters<typeof render>) {
    const r = render.apply(this, args);
    const [renderer, input] = args;
    if (input) {
      const n = 4 * input.width * input.height;
      if (hdrBuffer?.length !== n) hdrBuffer = new Float32Array(n);
      const data = hdrBuffer;
      renderer.setRenderTarget(input);
      gl.readPixels(0, 0, input.width, input.height, gl.RGBA, gl.FLOAT, data);
      out = { w: input.width, h: input.height, data };
    }
    return r;
  };
  try {
    step(1);
  } finally {
    pass.render = render;
  }
  if (!out) throw new Error('[lightspeed] perf: the scene pass drew straight to the screen');
  return out;
}

/** The page's own canvas size (CSS px) and pixel ratio, kept while canvasSize holds another. */
let pageSize: { w: number; h: number; dpr: number } | null = null;

async function canvasSize(w: number | null, h = 0, dpr = 1): Promise<{ w: number; h: number }> {
  const state = root();
  if (w === null) {
    const back = pageSize ?? { w: state.size.width, h: state.size.height, dpr: 2 };
    pageSize = null;
    pinned.dpr = back.dpr;
    quality.dpr = back.dpr;
    state.setDpr(back.dpr);
    state.setSize(back.w, back.h);
    w = back.w;
    h = back.h;
    dpr = back.dpr;
  } else {
    pageSize ??= { w: state.size.width, h: state.size.height, dpr: state.viewport.dpr };
    pinned.dpr = dpr;
    quality.dpr = dpr;
    state.setDpr(dpr);
    state.setSize(w, h);
  }
  // The composer follows the size in an effect after React commits: let it run, then draw.
  for (let i = 0; i < 20; i++) {
    await yieldTask();
    step(1);
    const cv = renderer().domElement;
    if (cv.width === Math.round(w * dpr) && cv.height === Math.round(h * dpr)) break;
  }
  const cv = renderer().domElement;
  return { w: cv.width, h: cv.height };
}

function scene(): { scene: Scene; camera: PerspectiveCamera } {
  const state = root();
  return { scene: state.scene, camera: state.camera as PerspectiveCamera };
}

function info(): Record<string, unknown> {
  const gl = gl2();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const cv = renderer().domElement;
  return {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    canvas: `${cv.width}×${cv.height}`,
    dpr: renderer().getPixelRatio(),
    msaa: composerSeen?.multisampling ?? quality.msaa,
    pinned: { ...pinned },
    lensRung: quality.lensRung,
    hidden: document.hidden,
    timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    view: currentView,
    at: clock(),
  };
}

/** The timing hooks (window.__ls.perf). */
export const perf: PerfApi & PerfExtras = {
  measure,
  passes,
  pin,
  view,
  ab,
  compiles,
  cubeFaces,
  unpin,
  settle,
  ready,
  readFrame,
  readHdr,
  canvasSize,
  info,
  scene,
  composer: () => composerSeen,
  log,
  last,
};
