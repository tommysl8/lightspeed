/**
 * The sky's averaging meter near a black hole: the view's exposure stops down when the sky itself glares, as an eye or
 * a camera would.
 *
 * What: within a few parsecs of Sgr A* the nuclear star cluster's millions of stars fill the sky: about 12 V
 * magnitudes per square arcsecond at 0.02 pc, ten thousand times the Milky Way's surface brightness seen from Earth,
 * and inside M87 its own starlight glows almost as evenly. At the app's fixed exposure (right for the sky from the
 * Solar System) that sky is drawn nearly white: the stars, the shadow's edge and the Sun's Einstein ring are lost in
 * it (measured: a mean of 207/255 at 4,000 au and 251/255 at 10,000 au). So near a hole (whenever one bends light
 * enough to matter, gravity.hole: within about 820 pc of Sgr A*, with its lens drawn or not) the log-average of the
 * frame's luminance before bloom and tone mapping over its lit pixels, exp⟨ln Y⟩ (the key of photographic tone
 * reproduction; a few bright bodies do not swing it as they would a plain mean, and the shadow, which has no light,
 * does not count), is measured on the GPU and read back without waiting (skyMeter.frag.glsl), and the exposure is set
 * so that it comes to SKY_METER_KEY, AgX's middle grey, in full once 40 % of the frame is lit and not at all under 10 %
 * (a dark sky round a stellar hole, lit only by its stars, is no glare: SKY_METER_LIT): never brighter
 * than the app's own exposure (only ever a stop-down), eased over a fraction of a second, and held still while the
 * reading stays within SKY_METER_DEADBAND of it. Everything dims with it,
 * stars, glow, gas and bodies alike, so relative brightness across the sky is kept; the instruments' Auto-exposure
 * row shows it. Far from every hole it is 0 and nothing runs, so every picture there is exactly as it was.
 *
 * How the reading becomes an exposure: the sky and the stars are displayed as the square root of their light times
 * e^E (the Galaxy layer's and the stars' law), so the log-average moves by E/2: the exposure that brings a frame drawn
 * at E with key K to the target is E + 2 ln(SKY_METER_KEY / K). Where the display saturates it moves less, and the
 * readings keep stopping down until it no longer does.
 *
 * Cost: two tiny passes and a 4-byte read-back after the scene pass (render/LightspeedScenePass.ts), a few hundredths
 * of a millisecond, only near a hole.
 *
 * Twins: render/relativisticView.ts (takes skyLnExposure beside the lens's and the flow's), render/flow/flowMap.ts
 * (the flow's own meter, the same idea for its glare), render/lens/skyMeter.frag.glsl.
 */
import { HalfFloatType, Mesh, NearestFilter, NoBlending, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, type Texture, UnsignedByteType, Vector2, WebGLRenderTarget, type WebGLRenderer } from 'three';
import skyMeterFrag from './skyMeter.frag.glsl?raw';
import { gravity } from '../../sim/gravity';
import { lensOverride } from './lensState';

/** The log-average luminance the meter brings the frame to (linear display units before tone mapping: AgX's middle grey). */
export const SKY_METER_KEY = 0.18;
/** How the displayed luminance follows the exposure: as e^(pE), p = ½ for the √ law of the sky and the stars. */
export const SKY_METER_POWER = 0.5;
/** The share of the way to its target the exposure moves each frame (an eye adapts over a fraction of a second). */
export const SKY_METER_ADAPT = 0.15;
/**
 * A reading moves the target only when it calls for a change of more than this (ln): the exposure then holds still
 * while nothing changes (the read-back's 16-bit steps and a few pixels coming and going would otherwise keep it
 * wandering by a few thousandths, and a paused view flickering), at the cost of a key within 2.5 % of the target.
 */
export const SKY_METER_DEADBAND = 0.05;

/** The meter's quad: over the whole of its target, whatever the camera. */
const QUAD_VERT = 'void main() {\n  gl_Position = vec4(position.xy, 0.0, 1.0);\n}\n';

/** The meter's two stages (skyMeter.frag.glsl). */
export function createSkyMeterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSrc: { value: null as Texture | null },
      uSrcPx: { value: new Vector2(1, 1) },
      uStage: { value: 0 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: skyMeterFrag,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
}

/** The meter's state (development tools and tests read it). */
export const skyMeter = {
  /** ln of the exposure the sky holds the view at: 0 far from holes, easing towards `target`. */
  lnExposure: 0,
  /** Where it is going: from the last reading (0 before any, and far from holes). */
  target: 0,
  /** ln of the key of the last reading, over its lit pixels (NaN before the first), and the share of it lit. */
  lnKey: NaN,
  lit: NaN,
  /** A read-back is under way, and the exposure its frame was drawn at. */
  pending: false,
  pendingLnExposure: 0,
  /** Readings so far (for the checks). */
  readings: 0,
  /** Development (measurements that compare two frames): the exposure held where it is, readings ignored. */
  hold: false,
};

/** Whether the meter runs: a hole is near, and no reference camera or debug sky of the lens's checks is drawn. */
export function skyMeterWanted(): boolean {
  return gravity.hole !== null && !lensOverride.on && lensOverride.debug === 0;
}

/**
 * The frame's lit share below which it is not a glaring sky (a dark sky whose stars alone are lit), and above which it
 * is in full (the rest a shadow or a fall's dark region): the stop-down is weighted by the smoothstep between.
 */
export const SKY_METER_LIT: readonly [number, number] = [0.1, 0.4];

/**
 * The exposure a reading calls for: the frame was drawn at lnExposureThen, its lit pixels' key came out as e^lnKey and
 * `lit` of it was lit; never above 0 (the meter only stops down), and none for a frame mostly unlit.
 */
export function skyExposureFor(lnExposureThen: number, lnKey: number, lit = 1): number {
  if (!Number.isFinite(lnKey)) return 0;
  const t = Math.min(1, Math.max(0, (lit - SKY_METER_LIT[0]) / (SKY_METER_LIT[1] - SKY_METER_LIT[0])));
  const w = t * t * (3 - 2 * t);
  const e = Math.min(0, lnExposureThen + (Math.log(SKY_METER_KEY) - lnKey) / SKY_METER_POWER);
  return w > 0 && e < 0 ? w * e : 0;
}

/** One frame's easing of the exposure towards its target (called once a frame, after the meter's pass). */
export function adaptSkyExposure(): void {
  const m = skyMeter;
  if (m.hold) return;
  m.lnExposure += (m.target - m.lnExposure) * SKY_METER_ADAPT;
  if (Math.abs(m.target - m.lnExposure) < 1e-4) m.lnExposure = m.target;
}

/** ln of the exposure the sky's glare holds the view at (render/relativisticView.ts takes it near a hole). */
export function skyLnExposure(): number {
  return skyMeter.lnExposure;
}

/** A reading arrived: its key (decoded) and lit share for a frame drawn at `lnExposureThen`. */
export function skyMeterReading(lnKey: number, lnExposureThen: number, lit = 1): void {
  if (skyMeter.hold) return;
  skyMeter.lnKey = lnKey;
  skyMeter.lit = lit;
  skyMeter.readings++;
  const t = skyExposureFor(lnExposureThen, lnKey, lit);
  // (Back to 0 always: the far-from-holes exposure is exactly the app's own.)
  if (t === 0 || !(Math.abs(t - skyMeter.target) <= SKY_METER_DEADBAND)) skyMeter.target = t;
}

// ─── The GPU side ──────────────────────────────────────────────────────────────────────────────

const gpu = {
  cells: null as WebGLRenderTarget | null,
  mean: null as WebGLRenderTarget | null,
  material: null as ShaderMaterial | null,
  scene: null as Scene | null,
  camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
  /** Frames since the meter last ran (its targets are given back after a while). */
  idle: 0,
};
const bytes = new Uint8Array(4);
/** Frames after which the unused meter gives its targets back (about ten seconds). */
const RELEASE_AFTER = 600;

function smallTarget(size: number, half: boolean): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type: half ? HalfFloatType : UnsignedByteType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

function release(): void {
  gpu.cells?.dispose();
  gpu.mean?.dispose();
  gpu.cells = null;
  gpu.mean = null;
}

function pass(renderer: WebGLRenderer, target: WebGLRenderTarget): void {
  const material = gpu.material as ShaderMaterial;
  if (!gpu.scene) {
    gpu.scene = new Scene();
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    gpu.scene.add(quad);
  }
  renderer.setRenderTarget(target);
  renderer.render(gpu.scene, gpu.camera);
}

/**
 * After the scene pass (render/LightspeedScenePass.ts): meter its frame `src` near a hole (one read-back at a time), and
 * ease the exposure; far from holes the exposure eases back to 0 and nothing is drawn. `lnExposure`: the exposure the
 * frame was drawn at (render/relativisticView.ts relView.lnExposure).
 */
export function meterSky(renderer: WebGLRenderer, src: WebGLRenderTarget, lnExposure: number): void {
  const m = skyMeter;
  if (!skyMeterWanted()) {
    m.target = 0;
    m.lnKey = NaN;
    adaptSkyExposure();
    if (gpu.cells && ++gpu.idle > RELEASE_AFTER) release();
    return;
  }
  gpu.idle = 0;
  if (!m.pending) {
    gpu.cells ??= smallTarget(16, true);
    gpu.mean ??= smallTarget(1, false);
    gpu.material ??= createSkyMeterMaterial();
    const u = gpu.material.uniforms;
    const back = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    u.uSrc.value = src.texture;
    (u.uSrcPx.value as Vector2).set(src.width, src.height);
    u.uStage.value = 0;
    pass(renderer, gpu.cells);
    u.uSrc.value = gpu.cells.texture;
    u.uStage.value = 1;
    pass(renderer, gpu.mean);
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(back);
    m.pending = true;
    m.pendingLnExposure = lnExposure;
    const target = gpu.mean;
    renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1, bytes).then(
      () => {
        m.pending = false;
        if (gpu.mean !== target || !skyMeterWanted()) return;
        // 0: nothing lit (the meter then asks for no stop-down); else ln = (v − 1)/65534 × 120 − 60; the lit share
        const v = bytes[0] * 256 + bytes[1];
        skyMeterReading(v === 0 ? -Infinity : ((v - 1) / 65534) * 120 - 60, m.pendingLnExposure, bytes[2] / 255);
      },
      () => {
        m.pending = false;
      },
    );
  }
  adaptSkyExposure();
}
