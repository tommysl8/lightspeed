/**
 * Sagittarius A*'s accretion flow as the lens passes draw it: a map in the lens frame whose every texel is a
 * backward ray integrated from the camera along its exact orbit through the fitted flow model, read per pixel
 * by the lens box's composite and the photon ring's band through the chunk `lightspeed_flowlookup`
 * (render/shaders/flowLookup.glsl), so the flow is drawn from any camera, inside the photon sphere and inside
 * the horizon included, with no screen target and no second full-screen pass.
 *
 * What (docs/data/blackholes.md §7): for the camera's r and the lens frame (the hovering observer, or the raindrop
 * during a fall below 3M) the flow's image is a function of two angles, the look angle α from the hole and the
 * azimuth ω about the camera–hole axis. Rows (FLOW_MAP_ROWS: FLOW_MAP_ROWS_IN inside the shadow's edge, the rest
 * outside it) are uniform in the forward table's own variable s = ln g + 3g, g the gap to the edge (inside it, from
 * the axis down to 1e−6 of the edge; outside, from 1e−6 of the span up to the flow's outer angle, beyond which no
 * ray comes within 400 M: π whenever the camera is inside 400 M), so both sides crowd at the photon ring. Columns are
 * uniform in ω from uFlowRef, the flow's axis projected across the camera–hole axis. The row table (CPU, float64:
 * each row's impact parameter, where its ray starts and the azimuth it has swept by then, from render/flow/flowRay.ts
 * flowRayStart) goes to the GPU as a float texture; each texel's ray is marched in flowMap.frag.glsl.
 *
 * When: the map is rebuilt when the camera's r (|Δ ln r| or |Δ ln(r − 2M)| over 1e−4), the lens frame, the flow's
 * angle to the camera–hole line (over 1e−3 rad), the band, the blur or the quality rung changes: every frame in a
 * fall, an orbit or while dragging round the hole; never while only turning the view. While nothing changes, seven
 * more frames of jittered samples are averaged into it (eight in all), then it rests. "Blur to the EHT's
 * resolution" convolves it in two more passes (flowBlur.frag.glsl). Rung 1: 192 × 48 texels, and in motion one
 * emission sample every fourth step. Only while the flow is resolved (its ring over 1.5 device px), on, and the lens
 * drawn: otherwise uFlowOn is 0 and nothing runs.
 *
 * Display (flowLookup.glsl): the map's intensity at infinity times the ray's k^(3 − α), faded in as the point fades
 * out (sim/blackholes/accretion.ts flowPointShare), with the law the diffuse sky round it is drawn with (the Galaxy
 * layer's: √ of the light in a faint star's image, so the flow keeps its place among the sky's lights: it is a million
 * times the nuclear cluster's glow per square arcsecond, and its point, the hole's glint, hands over to it smoothly),
 * and the view's exposure stopping down for its glare, like a camera's averaging meter: the flow's mean displayed
 * brightness over the look angles the view holds (its axis's angle from the hole ± the half-diagonal), reduced on the
 * GPU and read back without waiting (flowMeter.frag.glsl), is brought to FLOW_EXPOSURE_MEAN and everything else dims
 * with it, as an eye would (flowLnExposure, taken by render/relativisticView.ts near a hole). A ring a few pixels across
 * hardly moves the meter, so it glares as its point did; one that fills the view stops it down. The √ law is not
 * additive: the same light spread over the picture's many pixels shows as more in all than as one point (74–146 times,
 * measured, as the ring passes 1.5–3 px, mostly the faint gas out to 400 M), so across the handover the picture is
 * drawn dimmer, a display choice: its gain times κ = min(1, P_point / P_picture)^(1 − h), P_point the point's light at
 * full share as the screen shows it (psf.glsl's law, its saturated core counted up to display white and
 * logarithmically beyond, pointDrawnLight), P_picture the picture's in the sky's law (the meter's second sum, over
 * every row; its pixels stay under white there), h rising smoothly from 0 at a ring of 3 px to 1 at 30 px
 * (flowHandoverGain): the light on the screen is continuous where the point hands over and the sky's own law holds
 * from a ring of 30 px in. Measured on the target laptop (2,048 × 1,104, pixel ratio 2; the screen's light within
 * 128 px of the hole, the flow on less the flow off at one exposure): within a factor 1.35 from 300 au in to 60 au,
 * where with the sky's law in full it grew 34 times across the handover (and 6.5 times matched to the point's drawn,
 * not shown, light). The first display, a surface of the Sun's calibration (radiance 8·S_V/S_V,☉), is kept as
 * flowDisplay.law 'surface' for comparison: next to the √-law sky it drew the flow a million times too faint, hidden
 * behind the cluster's glow. At 1.3 mm a false colour of the
 * brightness temperature at 230 GHz (0 to 6e10 K: black, red, yellow, white) at a fixed brightness, under the same
 * exposure, stopped down at least to FLOW_MM_LN_EXPOSURE (starlight does not show at 1.3 mm: the model's picture
 * shows against a dark sky).
 *
 * Cost (target laptop, 2,048 × 1,320, measured under load from other work): rebuilding the visible map every frame
 * 0.31–0.37 ms of GPU at rung 0 (16,384 rays) and 0.15–0.19 ms at rung 1; nothing while the camera is still; the 1.3 mm map
 * about twice the visible one; the blur about 0.3 ms on the frames it runs; the lens passes' reads (lensPixel.glsl
 * lensFlow and this chunk) 0.66 ms over a full-screen box. The row table about 0.03 ms of main thread when rebuilt;
 * nothing allocated per frame but the read-back's small buffer.
 *
 * Twins: render/shaders/flowMap.frag.glsl, flowLookup.glsl, render/flow/flowBlur.frag.glsl and flowMeter.frag.glsl (the GPU side),
 * render/flow/flowRay.ts (a texel's ray in float64), sim/blackholes/accretion.ts (the model and the point).
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { LaterMaterial } from '../precompile';
import flowMapFrag from '../shaders/flowMap.frag.glsl?raw';
import flowQuadVert from './flowQuad.vert.glsl?raw';
import flowBlurFrag from './flowBlur.frag.glsl?raw';
import flowMeterFrag from './flowMeter.frag.glsl?raw';
import { AU_KM, PARSEC_KM, SUN_RADIUS_KM, SUN_VMAG_AT_1AU } from '../../physics/constants';
import { edgeAngle, lnGStatic, spanAngle, type LensObserver } from '../../physics/schwarzschild';
import { lnGapOfS } from '../../physics/schwarzschildTables';
import { FLOW_RESOLVED_PX, FLOW_RING_M, FLOW_V_RGB, flowAxisWorld, flowEmission, flowModel } from '../../sim/blackholes/accretion';
import { psfSolidAngle } from '../../sim/galaxy/background';
import { psfUniforms } from '../materials';
import { FLOW_OUTER_M, FLOW_STEP_K, flowRayStart, type FlowRayStart } from './flowRay';

/** Rows of the flow map at rung 0 (look angle: FLOW_MAP_ROWS_IN inside the edge, the rest outside it). */
export const FLOW_MAP_ROWS = 256;
/** Columns of the flow map at rung 0 (azimuth about the camera–hole axis). */
export const FLOW_MAP_COLS = 64;
/** Rows inside the shadow's edge at rung 0. */
export const FLOW_MAP_ROWS_IN = 64;
/** Rung 1: 192 × 48, 48 of the rows inside the edge. */
export const FLOW_MAP_ROWS_RUNG1 = 192;
export const FLOW_MAP_COLS_RUNG1 = 48;
export const FLOW_MAP_ROWS_IN_RUNG1 = 48;

/**
 * The jitter ξ of each frame the map is averaged over, the centres of eight equal strata of an emission pair (the
 * first, used alone while the camera moves, nearest its middle); after eight frames each pair's light is integrated
 * as eight samples would. flowRay.test.ts averages the same eight.
 */
export const FLOW_JITTERS: readonly number[] = [0.5625, 0.3125, 0.8125, 0.0625, 0.6875, 0.1875, 0.9375, 0.4375];

/** The EHT's beam: 20 µas FWHM seen from Earth, in impact parameter at Sgr A*'s distance (units of M), as σ. */
export const EHT_BEAM_SIGMA_M = (() => {
  const mUas = (flowModel.rgCm / 1e5 / (flowModel.distancePc * PARSEC_KM)) * (180 / Math.PI) * 3600e6;
  return 20 / mUas / (2 * Math.sqrt(2 * Math.log(2)));
})();

/**
 * Visible light as a surface of the Sun's calibration: the map's unit (a V = 0 star per square
 * arcsecond) as displayed radiance, where the Sun's disc (V = −26.74 from 1 au over its solid angle) is 8.
 */
export const FLOW_SURFACE_GAIN = (() => {
  const arcsec2PerSr = (180 / Math.PI) ** 2 * 3600 ** 2;
  const sunSr = Math.PI * (SUN_RADIUS_KM / AU_KM) ** 2;
  return (8 * arcsec2PerSr * sunSr) / 10 ** (-0.4 * SUN_VMAG_AT_1AU);
})();

const ARCSEC2_PER_SR = (180 / Math.PI) ** 2 * 3600 ** 2;
/** Magnitudes per unit of ln flux (2.5 / ln 10). */
const MAG_PER_LN = 2.5 / Math.LN10;

/** The 1.3 mm false colour's brightness (display units) at its white end, 6e10 K. */
export const FLOW_FALSE_COLOUR_WHITE = 1;

/** A uniform: shared by reference between materials. */
interface Uniform<T> {
  value: T;
}

/**
 * Uniforms of the chunk `lightspeed_flowlookup`, which the lens composite and the band include to add the
 * resolved flow at a ray's (g, ω).
 */
export interface FlowUniforms {
  /** 1 while the resolved flow is drawn. */
  uFlowOn: Uniform<number>;
  /** The map (RGBA16F, lens frame): the accumulated march or, with the blur on, its blurred copy. */
  uFlowMap: Uniform<Texture | null>;
  /** Rows: (s at the first row outside the edge, 1/Δs there, s at row 0 (the axis), 1/Δs inside). */
  uFlowMapAxes: Uniform<Vector4>;
  /** (rows, columns, rows inside the edge, the outer gap beyond which no ray reaches the flow). */
  uFlowMapSize: Uniform<Vector4>;
  /** Unit vector ⟂ the axis from which the azimuth ω is measured (lens frame, world axes). */
  uFlowRef: Uniform<Vector3>;
  /** 0 visible (radiance × k^(3 − α_s)), 1 the 1.3 mm false colour. */
  uFlowBand: Uniform<number>;
  /** The false-colour map of the 1.3 mm view. */
  uFlowFalseColour: Uniform<Texture | null>;
  /** (visible gain, display law (0 surface, 1 the sky's √ law), the false colour's gain, 0); the fades and the exposure's compensation folded in. */
  uFlowGain: Uniform<Vector4>;
  /** The power law's linear-sRGB colour, luminance 1. */
  uFlowColour: Uniform<Vector3>;
}

/** A 1 × 1 black texture: what the chunk reads while there is no map. */
function black(): DataTexture {
  const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** The 1.3 mm false colour: a square-root stretch of T_b/6e10 K through black, red, yellow and white (256 texels). */
function falseColourTexture(): DataTexture {
  const n = 256;
  const d = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) {
    const a = Math.sqrt(i / (n - 1));
    const c = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x)));
    d[4 * i] = c(2 * a);
    d[4 * i + 1] = c(2 * a - 0.5);
    d[4 * i + 2] = c(2 * a - 1);
    d[4 * i + 3] = 255;
  }
  const t = new DataTexture(d, n, 1, RGBAFormat, UnsignedByteType);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The flow's uniforms: off, with a black map. */
export const flowUniforms: FlowUniforms = {
  uFlowOn: { value: 0 },
  uFlowMap: { value: black() },
  uFlowMapAxes: { value: new Vector4(0, 1, 0, 1) },
  uFlowMapSize: { value: new Vector4(FLOW_MAP_ROWS, FLOW_MAP_COLS, FLOW_MAP_ROWS_IN, 0) },
  uFlowRef: { value: new Vector3(1, 0, 0) },
  uFlowBand: { value: 0 },
  uFlowFalseColour: { value: falseColourTexture() },
  uFlowGain: { value: new Vector4(0, 0, 0, 0) },
  uFlowColour: { value: new Vector3(FLOW_V_RGB[0], FLOW_V_RGB[1], FLOW_V_RGB[2]) },
};

// ─── The passes' materials ─────────────────────────────────────────────────────────────────────

/** The march's own uniforms (constants of the model and this build's sampling). */
function marchUniforms() {
  const e = flowEmission;
  // the shader takes g^(2 − α) as g² √g: the power law's p = 2
  if (e.gExp !== 2.5) console.warn(`[lightspeed] flow: the model's power law needs g^${e.gExp}, the map's march takes g^2.5`);
  return {
    uFlowRows: { value: null as Texture | null },
    uFlowPrev: { value: null as Texture | null },
    uFlowFrames: { value: 0 },
    uFlowGeom: { value: new Vector4(1, 0, FLOW_MAP_ROWS, FLOW_MAP_COLS) },
    uFlowSampling: { value: new Vector4(0.5, 1, 0, FLOW_STEP_K) },
    uFlowV: { value: new Vector4(e.lnV, e.cRho, e.cR, e.cZ) },
    uFlowV2: { value: new Vector4(e.gExp, e.gMin, e.gMax, 0) },
    uFlowMm1: { value: new Vector4(e.lnN0, e.lnN0Nt, e.lnT0, e.lnThetaPerK) },
    uFlowMm2: { value: new Vector4(e.lnBSquared, e.lnNuS, e.lnThermalJ, e.lnPowerLawJ) },
    uFlowMm3: { value: new Vector4(e.lnPowerLawA, e.lnTwoHOverC2, e.hOverK, e.lnTbUnit) },
    uFlowMm4: { value: new Vector4(e.lnRg, Math.log(e.mmHz[0]), Math.log(e.mmHz[1]), Math.log(e.mmHz[2])) },
    uFlowMm5: { value: new Vector4(e.pjB, e.pjNu, e.paB, e.paNu) },
  };
}

/** The map's march (flowMap.frag.glsl): one backward ray a texel. */
export function createFlowMapMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: marchUniforms(),
    vertexShader: flowQuadVert,
    fragmentShader: flowMapFrag,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
}

/** The EHT blur (flowBlur.frag.glsl), along the rows or the columns. */
export function createFlowBlurMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uFlowSrc: { value: null as Texture | null },
      uFlowBlurRows: { value: null as Texture | null },
      uFlowSize: { value: new Vector4(FLOW_MAP_ROWS, FLOW_MAP_COLS, FLOW_MAP_ROWS_IN, 0) },
      uFlowAlong: { value: 0 },
    },
    vertexShader: flowQuadVert,
    fragmentShader: flowBlurFrag,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
}

/** The exposure's meter over the map (flowMeter.frag.glsl), in two stages. */
export function createFlowMeterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uFlowSrc: { value: null as Texture | null },
      uFlowBlurRows: { value: null as Texture | null },
      uFlowSize: { value: new Vector4(FLOW_MAP_ROWS, FLOW_MAP_COLS, 0, 0) },
      uFlowEdge: { value: 0 },
      uFlowStage: { value: 0 },
    },
    vertexShader: flowQuadVert,
    fragmentShader: flowMeterFrag,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
}

/** The flow map's passes, for the background compiles (the lens waits for them: render/precompile.ts). */
export const FLOW_LATER: readonly LaterMaterial[] = [
  [createFlowMapMaterial, 'quad'],
  [createFlowBlurMaterial, 'quad'],
  [createFlowMeterMaterial, 'quad'],
];

// ─── The row table ─────────────────────────────────────────────────────────────────────────────

/** The rows' variables for a build: the camera, the edge, and the two sides' axes. */
export interface FlowRowAxes {
  obs: LensObserver;
  edge: number;
  span: number;
  rows: number;
  rowsIn: number;
  /** s at the first row outside the edge, and its step. */
  sMin: number;
  ds: number;
  /** s at row 0 (the axis, g′ = the edge) and the step inside (s decreasing with the row). */
  sTop: number;
  dsIn: number;
  /** The outer gap: the look angle beyond which no ray comes within 400 M, less the edge (the span when all do). */
  gOut: number;
}

/** The smallest gap of each side: 1e−6 of the span outside, 1e−6 of the edge inside (at most 1e−6 rad). */
const G_MIN_SHARE = 1e-6;

/**
 * The rows for this camera: their axes (into `axes`), each row's ray start (b, r0, dr/dλ, φ0; b = −1 dark) into
 * `rowData` (rows × 4), and into `blur` (rows × 8: two texel rows) its signed gap, the EHT blur's σ_α and σ_ω and its
 * width in look angle, then the lens frame's ln k of light from far away along it.
 */
export function buildFlowRows(obs: LensObserver, rows: number, rowsIn: number, axes: FlowRowAxes, rowData: Float32Array, blur: Float32Array): FlowRowAxes {
  const r = obs.r;
  const edge = edgeAngle(obs);
  const span = spanAngle(obs);
  axes.obs.frame = obs.frame;
  axes.obs.r = r;
  axes.edge = edge;
  axes.span = span;
  axes.rows = rows;
  axes.rowsIn = rowsIn;
  // Outside: up to the flow's outer angle (a hovering camera beyond 400 M: the ray grazing 400 M).
  let gOut = span;
  if (obs.frame === 'static' && r > FLOW_OUTER_M) {
    const bOut = FLOW_OUTER_M / Math.sqrt(1 - 2 / FLOW_OUTER_M);
    gOut = Math.min(span, Math.asin(Math.min(1, (bOut * Math.sqrt(1 - 2 / r)) / r)) - edge);
  }
  axes.gOut = gOut;
  const gMin = G_MIN_SHARE * span;
  axes.sMin = Math.log(gMin) + 3 * gMin;
  const sOut = Math.log(gOut) + 3 * gOut;
  const nOut = rows - rowsIn;
  axes.ds = (sOut - axes.sMin) / (nOut - 1);
  // Inside: from the axis (g′ = the edge) down to g′min at the edge.
  const gInMin = Math.min(G_MIN_SHARE, G_MIN_SHARE * edge * 1e3);
  axes.sTop = Math.log(edge) + 3 * edge;
  const sBot = Math.log(gInMin) + 3 * gInMin;
  axes.dsIn = (axes.sTop - sBot) / (rowsIn - 1);
  const sigmaB = EHT_BEAM_SIGMA_M;
  const rain = obs.frame === 'rain';
  const v = rain ? Math.sqrt(2 / r) : 0;
  const rootF = rain ? 0 : Math.sqrt(1 - 2 / r);
  const lnGK = rain ? 0 : lnGStatic(r);
  for (let j = 0; j < rows; j++) {
    let g: number;
    if (j < rowsIn) g = -(j === 0 ? edge : Math.exp(lnGapOfS(axes.sTop - j * axes.dsIn)));
    else g = Math.exp(lnGapOfS(axes.sMin + (j - rowsIn) * axes.ds));
    const alpha = Math.max(0, edge + g);
    const sa = Math.sin(alpha);
    const ca = Math.cos(alpha);
    flowRayStart(r, obs.frame, sa, ca, start);
    const o = 4 * j;
    rowData[o] = start.lit ? start.b : -1;
    rowData[o + 1] = start.r0;
    rowData[o + 2] = start.rdot0;
    rowData[o + 3] = start.phi0;
    // The blur's widths: σ_b over |db/dα| along the rows, σ_b over b along the columns.
    let b: number;
    let dbda: number;
    if (rain) {
      const den = 1 - v * ca;
      b = den > 0 ? (r * sa) / den : 0;
      dbda = den > 0 ? (r * (ca - v)) / (den * den) : 0;
    } else {
      b = (r * sa) / rootF;
      dbda = (r * ca) / rootF;
    }
    blur[o] = g;
    blur[o + 1] = Math.min(0.5, sigmaB / Math.max(Math.abs(dbda), 1e-30));
    blur[o + 2] = Math.min(Math.PI, sigmaB / Math.max(b, 1e-30));
    // (the row's width in look angle, below); the second texel row: the lens frame's blueshift of light from far
    // away along this row (for the exposure's meter)
    blur[4 * rows + o] = rain ? (1 - v * ca > 0 ? -Math.log(1 - v * ca) : -40) : lnGK;
  }
  // Each row's width in look angle, from its neighbours' gaps (one-sided at the ends).
  for (let j = 0; j < rows; j++) {
    const lo = blur[4 * Math.max(0, j - 1)];
    const hi = blur[4 * Math.min(rows - 1, j + 1)];
    blur[4 * j + 3] = (hi - lo) / (j === 0 || j === rows - 1 ? 1 : 2);
  }
  return axes;
}
const start: FlowRayStart = { lit: false, b: 0, r0: 0, rdot0: 0, phi0: 0 };

/**
 * The map's row (a fractional texel index) of a signed gap, clamped to its own side of the edge: the twin of
 * flowLookup.glsl flowRowOf (and flowBlur's use of the rows).
 */
export function flowMapRowOf(g: number, axes: FlowRowAxes): number {
  if (g > 0) {
    const s = Math.log(g) + 3 * g;
    return Math.min(axes.rows - 1, Math.max(axes.rowsIn, axes.rowsIn + (s - axes.sMin) / axes.ds));
  }
  const gp = Math.max(-g, 1e-30);
  const s = Math.log(gp) + 3 * gp;
  return Math.min(axes.rowsIn - 1, Math.max(0, (axes.sTop - s) / axes.dsIn));
}

// ─── The map ───────────────────────────────────────────────────────────────────────────────────

/** What the map needs to know this frame (render/flow is below the lens state: scene/AccretionFlow.tsx passes it). */
export interface FlowFrame {
  /** The flow is to be drawn resolved this frame (the lens drawn at Sgr A*, the flow on, its point share under 1). */
  on: boolean;
  /** The lens frame and the camera's r (units of M). */
  obs: LensObserver;
  /** Unit camera → hole, world axes, lens frame. */
  axis: Vector3;
  /** The flow's point share (1 − the resolved picture's share). */
  pointShare: number;
  band: 'visible' | 'mm';
  /** "Blur to the EHT's resolution" is ticked (it applies at 1.3 mm only: flowBlurOn). */
  blur: boolean;
  rung: number;
  /** Device px per radian at the screen's centre (the sky's √ law counts light within a faint star's image). */
  pxPerRad: number;
  /** The flow's point's V magnitude as its glint draws it (the hole's, scene/Glints.tsx; 99 when none): the handover. */
  pointMag: number;
  /** ln of the view's exposure this frame (render/relativisticView.ts relView.lnExposure: the lens passes multiply by e^it). */
  lnExposure: number;
  /** The view's forward direction (world, unit) and the angle from it to the screen's corner (rad): the exposure's meter. */
  viewFwd: Vector3;
  viewHalfDiag: number;
}

/**
 * How visible light is displayed: 'sky', with the law of the diffuse sky round it (the Galaxy layer's: the √ of the
 * light in a faint star's image; its point, the hole's glint, is drawn with the stars' matching law, so the two hand
 * over smoothly), with the view's exposure following its glare (flowLnExposure); or 'surface', a surface of the
 * Sun's calibration, which leaves the flow a millionth as bright as it is next to the stars'
 * glow round it (development and comparison only).
 */
export const flowDisplay = { law: 'sky' as 'surface' | 'sky' };

/**
 * The exposure's target: the flow's mean displayed brightness over the look angles the view holds (the √ law, display
 * units) is brought down to this (a camera's averaging meter: AgX's middle grey is 0.18; the flow's bright ring then
 * sits well above it, its faint glow below).
 */
export const FLOW_EXPOSURE_MEAN = 0.3;

/** A float texture of rows × 1 RGBA, nearest. */
function rowTexture(rows: number, height = 1): DataTexture {
  const t = new DataTexture(new Float32Array(4 * rows * height), rows, height, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** A half-float target of the map's size, filtered, repeating in ω. */
function mapTarget(cols: number, rows: number): WebGLRenderTarget {
  const t = new WebGLRenderTarget(cols, rows, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: RepeatWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  t.texture.name = 'flowMap';
  return t;
}

/** A small unfiltered target (the meter's passes). */
function smallTarget(w: number, h: number, half: boolean): WebGLRenderTarget {
  return new WebGLRenderTarget(w, h, {
    type: half ? HalfFloatType : UnsignedByteType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

interface MapState {
  rows: number;
  cols: number;
  rowsIn: number;
  /** Two for the accumulation (ping-pong), two for the blur. */
  targets: [WebGLRenderTarget, WebGLRenderTarget, WebGLRenderTarget, WebGLRenderTarget] | null;
  /** The meter's two stages: the rows (half floats), and the mean (1 × 1, bytes). */
  meterTargets: [WebGLRenderTarget, WebGLRenderTarget] | null;
  /** The target holding the latest accumulation (0 or 1). */
  current: number;
  frames: number;
  rowTex: DataTexture | null;
  blurTex: DataTexture | null;
  axes: FlowRowAxes;
  /** What the map was built for. */
  builtR: number;
  builtFrame: string;
  builtCosI: number;
  builtBand: string;
  builtBlur: boolean;
  builtRung: number;
  /** A rebuild is due (set when anything changes; cleared by a march). */
  dirty: boolean;
  /** The map has changed since the meter last read it (set by a march; cleared when a reading is issued). */
  meterStale: boolean;
  scene: Scene | null;
  camera: OrthographicCamera;
  mesh: Mesh | null;
  march: ShaderMaterial | null;
  blurMat: ShaderMaterial | null;
  meterMat: ShaderMaterial | null;
  /** Frames since the map was last drawn resolved (its targets are released after a while). */
  idle: number;
}

/** The map's state (development tools and tests read it). */
export const flowMap: MapState = {
  rows: FLOW_MAP_ROWS,
  cols: FLOW_MAP_COLS,
  rowsIn: FLOW_MAP_ROWS_IN,
  targets: null,
  meterTargets: null,
  current: 0,
  frames: 0,
  rowTex: null,
  blurTex: null,
  axes: { obs: { frame: 'static', r: Infinity }, edge: 0, span: Math.PI, rows: FLOW_MAP_ROWS, rowsIn: FLOW_MAP_ROWS_IN, sMin: 0, ds: 1, sTop: 0, dsIn: 1, gOut: 0 },
  builtR: NaN,
  builtFrame: '',
  builtCosI: NaN,
  builtBand: '',
  builtBlur: false,
  builtRung: -1,
  dirty: true,
  meterStale: true,
  scene: null,
  camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
  mesh: null,
  march: null,
  blurMat: null,
  meterMat: null,
  idle: 0,
};

/**
 * The exposure the flow's glare calls for, as its meter was last read back: the mean over the view of the √ law's
 * display at no exposure, uStarGain √(toF) ⟨√(I k^3.5)⟩, is brought to FLOW_EXPOSURE_MEAN (the view never brightens),
 * faded in with the resolved picture's share, and eased in over a few frames (an eye adapts over a fraction of a
 * second; a turn that brings the ring into view does not flash). render/relativisticView.ts takes the smaller of this
 * and its own (the observer's blueshift) near a black hole, so the whole view, the stars and the sky's glow with it, is
 * exposed for the gas, as an eye or a camera would be; a ring a few pixels across hardly moves it, and glares as its
 * point did.
 */
export const flowGlare = {
  /** ln ⟨√(I k^3.5)⟩ over the view at the last reading (the map's units), or −∞ before the first. */
  lnMean: -Infinity,
  /** A read-back is under way. */
  pending: false,
  /** The view's angle from the hole when the meter was last read (rad). */
  alphaView: NaN,
  /** The exposure the view is held at (ln), easing towards flowExposureTarget. */
  lnExposure: 0,
  /** The resolved share, ln toF and ln uStarGain of the frame the flow was last drawn in (0 share: none). */
  share: 0,
  lnToF: 0,
  lnGain: 0,
  /** ln of the meter's second sum: Σ over every row of solid angle × ⟨√(I k^3.5)⟩ (the whole picture), or −∞ before the first. */
  lnTotal: -Infinity,
  /** The handover's κ this frame (1 once the ring is 30 px; 0 within the handover until the picture's light is read). */
  kappa: 1,
  /** The 1.3 mm view is drawn (the view then stops down at least to FLOW_MM_LN_EXPOSURE). */
  mm: false,
};

/**
 * The view's exposure at 1.3 mm, at most (ln): starlight is far too faint to show at that wavelength, so the sky
 * goes dark behind the false colour, whatever the visible light's last reading (there may be none: a camera that
 * arrived with Radio eyes on has never metered the visible flow). e^−20 dims the sky's √ law by e^−10.
 */
export const FLOW_MM_LN_EXPOSURE = -20;

/** The ring's radius (device px) by which the picture is drawn with the sky's own law in full (κ = 1). */
export const FLOW_HANDOVER_END_PX = 30;

/**
 * psf.glsl psfFromMagnitude's law, summed: the light (display units, before tone mapping, over device px) a point of
 * magnitude `mag` (the exposure in it) is drawn with, peak × 2πσ², its peak capped at 24 and its core widened (to
 * 1.6 times at most) beyond; or (`shown`) as the screen shows it, each pixel's light counted up to display white (1)
 * and logarithmically beyond, 2πσ² (1 + ln peak) for a peak over 1: tone mapping saturates a bright point's core, and
 * this is the light the eye gets from it (a point at the cap shows about a sixth of its drawn light). starGain,
 * magZero, pixelRatio: the psf uniforms.
 */
export function pointDrawnLight(mag: number, starGain: number, magZero: number, pixelRatio: number, shown = false): number {
  const flux = 2 ** Math.max(-126, Math.min(126, -1.3287712 * (mag - magZero)));
  const p = starGain * Math.sqrt(flux);
  const spread = p > 24 ? (p / 24) ** 0.25 : 1;
  const peak = Math.min(p, 24);
  const sigma = pixelRatio * Math.min(2.6, Math.max(0.5, 0.62 * flux ** 0.1)) * Math.min(spread, 1.6);
  const area = 2 * Math.PI * sigma * sigma;
  return area * (shown && peak > 1 ? 1 + Math.log(peak) : peak);
}

/**
 * The handover's κ: the picture's gain factor that makes its drawn light P_picture (in the sky's √ law, at full share)
 * the point's P_point where the point hands over (a ring of 3 px), relaxing to the sky's own law, κ = 1, by a ring of
 * FLOW_HANDOVER_END_PX: min(1, P_point/P_picture)^(1 − h), h the smoothstep of the ring's radius between the two.
 * Never above 1 (a picture already fainter than its point is left as it is). Before the picture's light has been
 * read (P_picture unknown), 0 until the end of the handover: the picture waits the few frames for its first reading
 * rather than flash up in the sky's full law.
 */
export function flowHandoverGain(pPoint: number, pPicture: number, ringPx: number): number {
  const t = Math.min(1, Math.max(0, (ringPx - FLOW_RESOLVED_PX) / (FLOW_HANDOVER_END_PX - FLOW_RESOLVED_PX)));
  const h = t * t * (3 - 2 * t);
  if (h >= 1) return 1;
  if (!(pPicture > 0) || !Number.isFinite(pPicture)) return 0;
  if (!(pPoint > 0)) return 1;
  return Math.min(1, pPoint / pPicture) ** (1 - h);
}

/** The flow's ring's radius in device px for a camera at r (units of M; the raindrop's frame and r ≤ 2: resolved). */
export function flowRingPx(obs: LensObserver, pxPerRad: number): number {
  const r = obs.r;
  if (obs.frame === 'rain' || !(r > 2)) return Infinity;
  const s = (FLOW_RING_M * Math.sqrt(1 - 2 / r)) / r;
  return (s >= 1 ? Math.PI / 2 : Math.asin(s)) * pxPerRad;
}

/**
 * ln of the exposure the resolved flow's glare calls for now, from the last reading (0 when it is not drawn, not the
 * sky's law, or before a reading), for the flow as it is drawn: with the handover's κ (a picture drawn κ times as
 * bright needs 2 ln κ less stopping down; κ follows the exposure itself while the point is at its cap, so the easing
 * settles on the fixed point, monotonically). At 1.3 mm the view keeps the visible light's last reading (the false
 * colour itself is drawn at a fixed brightness), so the model's 1.3 mm picture shows against a dark sky.
 */
export function flowExposureTarget(): number {
  const g = flowGlare;
  if (!(g.share > 0)) return 0;
  const e = Number.isFinite(g.lnMean) ? 2 * (Math.log(FLOW_EXPOSURE_MEAN) - g.lnGain - g.lnMean - Math.log(Math.min(1, Math.max(g.kappa, 1e-12)))) - g.lnToF : 0;
  return g.share * Math.min(0, e, g.mm ? FLOW_MM_LN_EXPOSURE : 0);
}

/** The share of the way to the target the exposure moves each frame (an eye adapts over a fraction of a second). */
export const FLOW_EXPOSURE_ADAPT = 0.15;

/** Move the exposure a frame's step towards its target (updateFlowMap calls it once a frame). */
function adaptExposure(): void {
  const g = flowGlare;
  const t = flowExposureTarget();
  g.lnExposure += (t - g.lnExposure) * FLOW_EXPOSURE_ADAPT;
  if (Math.abs(t - g.lnExposure) < 1e-4) g.lnExposure = t;
}

/** ln of the exposure the flow's glare holds the view at (render/relativisticView.ts takes it near a hole). */
export function flowLnExposure(): number {
  return flowGlare.lnExposure;
}

/** Frames the map is averaged over while nothing changes. */
export const FLOW_ACCUMULATE = FLOW_JITTERS.length;
/**
 * Development (the performance checks, dev/perf.ts): rebuild the map every frame, as in motion; or leave the lens passes' reads of it
 * out (the exposure stays as if they were drawn), to cost them apart; or draw the picture with the sky's law in full
 * across the handover (κ = 1), or matched to the point's drawn light rather than its light as shown, to compare.
 */
export const flowDev = { rebuildEveryFrame: false, noReads: false, noHandover: false, handoverDrawn: false };
/** Frames after which an unused map releases its targets (about ten seconds). */
const RELEASE_AFTER = 600;

const ref = new Vector3();
const meterBytes = new Uint8Array(8);
/** The meter reads again when the view turns by this much (rad). */
const METER_TURN_RAD = Math.PI / 180;

/** Allocate (or resize) the targets and row textures for a map of rows × cols. */
function ensureTargets(rows: number, cols: number): void {
  const m = flowMap;
  if (m.targets && m.rows === rows && m.cols === cols) return;
  release();
  m.rows = rows;
  m.cols = cols;
  m.targets = [mapTarget(cols, rows), mapTarget(cols, rows), mapTarget(cols, rows), mapTarget(cols, rows)];
  m.meterTargets = [smallTarget(rows, 1, true), smallTarget(2, 1, false)];
  m.rowTex = rowTexture(rows);
  m.blurTex = rowTexture(rows, 2);
  m.dirty = true;
}

/** Free the map's targets (the flow unused for a while). */
function release(): void {
  const m = flowMap;
  if (m.targets) for (const t of m.targets) t.dispose();
  if (m.meterTargets) for (const t of m.meterTargets) t.dispose();
  m.targets = null;
  m.meterTargets = null;
  m.rowTex?.dispose();
  m.blurTex?.dispose();
  m.rowTex = null;
  m.blurTex = null;
  m.frames = 0;
  m.dirty = true;
}

/** Draw `material` over the whole of `target`. */
function pass(renderer: WebGLRenderer, material: ShaderMaterial, target: WebGLRenderTarget): void {
  const m = flowMap;
  if (!m.scene || !m.mesh) {
    m.scene = new Scene();
    m.mesh = new Mesh(new PlaneGeometry(2, 2), material);
    m.mesh.frustumCulled = false;
    m.scene.add(m.mesh);
  }
  m.mesh.material = material;
  renderer.setRenderTarget(target);
  renderer.render(m.scene, m.camera);
}

/**
 * The exposure's meter over the visible map `src` for the look angles the view holds (gaps gLo to gHi), reduced on the
 * GPU (the flow's √-law light summed over solid angle), read back without waiting (one at a time) and divided by the
 * meter's own solid angle.
 */
function readMeter(renderer: WebGLRenderer, src: Texture, gLo: number, gHi: number): boolean {
  const m = flowMap;
  const g = flowGlare;
  if (g.pending || !m.meterTargets || !m.blurTex) return false;
  // the meter's own solid angle: the band of look angles, beyond the flow's outer angle too (the flow adds nothing there)
  const aLo = Math.max(0, m.axes.edge + gLo);
  const aHi = Math.min(Math.PI, m.axes.edge + gHi);
  const lnOmega = Math.log(Math.max(2 * Math.PI * (Math.cos(aLo) - Math.cos(aHi)), 1e-12));
  m.meterMat ??= createFlowMeterMaterial();
  const mu = m.meterMat.uniforms;
  mu.uFlowSize.value.set(m.rows, m.cols, gLo, gHi);
  mu.uFlowEdge.value = m.axes.edge;
  mu.uFlowBlurRows.value = m.blurTex;
  mu.uFlowSrc.value = src;
  mu.uFlowStage.value = 0;
  pass(renderer, m.meterMat, m.meterTargets[0]);
  mu.uFlowSrc.value = m.meterTargets[0].texture;
  mu.uFlowStage.value = 1;
  pass(renderer, m.meterMat, m.meterTargets[1]);
  g.pending = true;
  const target = m.meterTargets[1];
  renderer.readRenderTargetPixelsAsync(target, 0, 0, 2, 1, meterBytes).then(
    () => {
      g.pending = false;
      if (flowMap.meterTargets?.[1] !== target) return;
      const v = meterBytes[0] * 256 + meterBytes[1];
      g.lnMean = v === 0 ? -Infinity : (v / 65535) * 120 - 60 - lnOmega;
      const t = meterBytes[4] * 256 + meterBytes[5];
      g.lnTotal = t === 0 ? -Infinity : (t / 65535) * 120 - 60;
    },
    () => {
      g.pending = false;
    },
  );
  return true;
}

/**
 * Whether the map is blurred to the EHT's resolution: the box ticked and the 1.3 mm view shown. The EHT's beam belongs
 * to its 1.3 mm picture; the visible view (and its exposure's meter) never takes it, whatever the box says.
 */
export function flowBlurOn(f: Pick<FlowFrame, 'blur' | 'band'>): boolean {
  return f.blur && f.band === 'mm';
}

/**
 * The flow map this frame (scene/AccretionFlow.tsx calls it at priority 0, after the lens state and before the
 * render): rebuild, average one more frame, or rest; and the lookup's uniforms. Nothing when the flow is not drawn
 * resolved.
 */
export function updateFlowMap(renderer: WebGLRenderer, f: FlowFrame): void {
  const m = flowMap;
  const u = flowUniforms;
  const g = flowGlare;
  if (!f.on) {
    u.uFlowOn.value = 0;
    g.share = 0;
    // The picture's light is read afresh when it is drawn again (a reading from elsewhere would give the wrong κ), even
    // if the map itself is still the one drawn last.
    g.lnTotal = -Infinity;
    m.meterStale = true;
    adaptExposure();
    if (m.targets && ++m.idle > RELEASE_AFTER) release();
    return;
  }
  m.idle = 0;
  const blur = flowBlurOn(f);
  const rung1 = f.rung >= 1;
  const rows = rung1 ? FLOW_MAP_ROWS_RUNG1 : FLOW_MAP_ROWS;
  const cols = rung1 ? FLOW_MAP_COLS_RUNG1 : FLOW_MAP_COLS;
  const rowsIn = rung1 ? FLOW_MAP_ROWS_IN_RUNG1 : FLOW_MAP_ROWS_IN;
  ensureTargets(rows, cols);
  m.rowsIn = rowsIn;
  // The flow's axis against the camera–hole line: cos i from the hole towards the camera, and the reference ⟂ it.
  const a = flowAxisWorld;
  const ax = f.axis;
  const ad = a[0] * ax.x + a[1] * ax.y + a[2] * ax.z;
  const cosI = -ad;
  ref.set(a[0] - ad * ax.x, a[1] - ad * ax.y, a[2] - ad * ax.z);
  if (ref.lengthSq() < 1e-24) {
    // looking along the flow's axis: any direction across it (the picture is then round)
    if (Math.abs(ax.x) < 0.9) ref.set(1, 0, 0);
    else ref.set(0, 1, 0);
    ref.addScaledVector(ax, -ref.dot(ax));
  }
  ref.normalize();
  u.uFlowRef.value.copy(ref);
  const r = f.obs.r;
  const changed =
    f.obs.frame !== m.builtFrame ||
    !(Math.abs(Math.log(r / m.builtR)) <= 1e-4) ||
    !(Math.abs(Math.log(Math.abs((r - 2) / (m.builtR - 2)))) <= 1e-4) ||
    !(Math.abs(cosI - m.builtCosI) <= 1e-3) ||
    f.band !== m.builtBand ||
    blur !== m.builtBlur ||
    f.rung !== m.builtRung ||
    m.dirty ||
    flowDev.rebuildEveryFrame;
  const marched = changed || m.frames < FLOW_ACCUMULATE;
  if (marched) m.meterStale = true;
  if (marched) {
    if (changed) {
      buildFlowRows(f.obs, rows, rowsIn, m.axes, m.rowTex!.image.data as Float32Array, m.blurTex!.image.data as Float32Array);
      m.rowTex!.needsUpdate = true;
      m.blurTex!.needsUpdate = true;
      m.builtR = r;
      m.builtFrame = f.obs.frame;
      m.builtCosI = cosI;
      m.builtBand = f.band;
      m.builtBlur = blur;
      m.builtRung = f.rung;
      m.frames = 0;
      m.dirty = false;
    }
    m.march ??= createFlowMapMaterial();
    const mu = m.march.uniforms;
    // Ping-pong: read the latest, write the other (a pass never reads its own target).
    const next = 1 - m.current;
    mu.uFlowRows.value = m.rowTex;
    mu.uFlowPrev.value = m.targets![m.current].texture;
    mu.uFlowFrames.value = m.frames;
    mu.uFlowGeom.value.set(cosI, Math.sqrt(Math.max(0, 1 - cosI * cosI)), rows, cols);
    // In motion at rung 1 one emission sample every fourth step (one pair in two).
    const group = rung1 && changed ? 2 : 1;
    mu.uFlowSampling.value.set(FLOW_JITTERS[m.frames % FLOW_ACCUMULATE], group, f.band === 'mm' ? 1 : 0, FLOW_STEP_K);
    const back = renderer.getRenderTarget();
    pass(renderer, m.march, m.targets![next]);
    m.current = next;
    m.frames++;
    if (blur) {
      m.blurMat ??= createFlowBlurMaterial();
      const bu = m.blurMat.uniforms;
      bu.uFlowBlurRows.value = m.blurTex;
      bu.uFlowSize.value.set(rows, cols, rowsIn, 0);
      bu.uFlowSrc.value = m.targets![m.current].texture;
      bu.uFlowAlong.value = 0;
      pass(renderer, m.blurMat, m.targets![2]);
      bu.uFlowSrc.value = m.targets![2].texture;
      bu.uFlowAlong.value = 1;
      pass(renderer, m.blurMat, m.targets![3]);
    }
    renderer.setRenderTarget(back);
  }
  // The exposure's meter (and the whole picture's light, for the handover): the look angles the view holds, from its
  // axis's angle to the hole ± the half-diagonal; read again whenever the map has changed since the last reading (one
  // is under way at a time, so the last change is always read) or the view turns by a degree.
  const alphaView = Math.acos(Math.max(-1, Math.min(1, f.viewFwd.dot(f.axis))));
  if (f.band === 'visible' && flowDisplay.law === 'sky' && (m.meterStale || !(Math.abs(alphaView - g.alphaView) < METER_TURN_RAD))) {
    const back = renderer.getRenderTarget();
    const issued = readMeter(renderer, (blur ? m.targets![3] : m.targets![m.current]).texture, alphaView - f.viewHalfDiag - m.axes.edge, alphaView + f.viewHalfDiag - m.axes.edge);
    renderer.setRenderTarget(back);
    if (issued) {
      g.alphaView = alphaView;
      m.meterStale = false;
    }
  }
  // The lookup's uniforms.
  const x = m.axes;
  u.uFlowMapAxes.value.set(x.sMin, 1 / x.ds, x.sTop, 1 / x.dsIn);
  u.uFlowMapSize.value.set(rows, cols, rowsIn, x.gOut);
  u.uFlowMap.value = (blur ? m.targets![3] : m.targets![m.current]).texture;
  u.uFlowBand.value = f.band === 'mm' ? 1 : 0;
  const share = 1 - f.pointShare;
  // The lens passes multiply what the chunk returns by e^E: the false colour takes it back out (a fixed brightness).
  const e = Math.exp(f.lnExposure);
  if (flowDisplay.law === 'surface') {
    u.uFlowGain.value.set(FLOW_SURFACE_GAIN * share, 0, (FLOW_FALSE_COLOUR_WHITE * share) / e, 0);
    g.share = 0;
  } else {
    // The Galaxy layer's unit: the light (V = 0 stars, relative to 10^(−0.4 m0)) in a faint star's image, whose σ is
    // half a CSS px; displayed as uStarGain √(f e^E), faded by the share: share · uStarGain √(toF e^E) √I, of which
    // the lens passes supply the e^E.
    const pr = psfUniforms.uPixelRatio.value || 1;
    const cssPxAngle = pr / Math.max(f.pxPerRad, 1e-9);
    const toF = ARCSEC2_PER_SR * psfSolidAngle(cssPxAngle) * 10 ** (0.4 * psfUniforms.uMagZero.value);
    const gain = psfUniforms.uStarGain.value;
    // The handover from the point (see the header): the point's drawn light at full share against the picture's. (At
    // 1.3 mm, a false colour at a fixed brightness, the visible light's last κ is kept for the exposure.)
    if (f.band === 'visible') {
      let kappa = 1;
      if (f.pointMag < 90 && !flowDev.noHandover) {
        const pPoint = pointDrawnLight(f.pointMag - MAG_PER_LN * f.lnExposure, gain, psfUniforms.uMagZero.value, pr, !flowDev.handoverDrawn);
        const pPicture = f.pxPerRad * f.pxPerRad * gain * Math.sqrt(toF * e) * Math.exp(g.lnTotal);
        kappa = flowHandoverGain(pPoint, pPicture, flowRingPx(f.obs, f.pxPerRad));
      }
      g.kappa = kappa;
    }
    const kappa = f.band === 'visible' ? g.kappa : 1;
    u.uFlowGain.value.set((kappa * share * gain * Math.sqrt(toF)) / Math.sqrt(e), 1, (FLOW_FALSE_COLOUR_WHITE * share) / e, 0);
    g.share = share;
    g.mm = f.band === 'mm';
    g.lnToF = Math.log(toF);
    g.lnGain = Math.log(gain);
  }
  u.uFlowOn.value = share > 0 && !flowDev.noReads ? 1 : 0;
  adaptExposure();
}
