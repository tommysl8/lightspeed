/**
 * Blackbody colour science: Planck's law, CIE 1931 colour matching, and star temperatures.
 *
 * Used to colour stars from their B−V index, and to recolour them when the Doppler effect
 * shifts their temperature (a Doppler-shifted blackbody is still a blackbody at T′ = D·T).
 */

/** Second radiation constant c₂ = hc/k, m·K (exact, from the exact SI values of h, c, k). */
const C2 = (6.626_070_15e-34 * 299_792_458) / 1.380_649e-23;

/**
 * B−V colour index → effective temperature, K. Ballesteros (2012), EPL 97, 34008:
 *   T = 4600 (1/(0.92(B−V) + 1.7) + 1/(0.92(B−V) + 0.62))
 * Clamped to −0.4 ≤ B−V ≤ 2.0, where the formula is reasonable (~21,700 K down to ~3,200 K).
 */
export function bvToTemperature(bv: number): number {
  const x = Number.isFinite(bv) ? Math.min(2.0, Math.max(-0.4, bv)) : 0.6;
  return 4600 * (1 / (0.92 * x + 1.7) + 1 / (0.92 * x + 0.62));
}

/** ln of Planck spectral radiance B_λ(T) (up to a constant), λ in metres. Stable for all T. */
export function logPlanck(lambdaM: number, T: number): number {
  const x = C2 / (lambdaM * T);
  // ln(e^x − 1) without overflow or cancellation
  const logExpm1 = x > 30 ? x + Math.log1p(-Math.exp(-x)) : Math.log(Math.expm1(x));
  return -5 * Math.log(lambdaM) - logExpm1;
}

/** Gaussian lobe with different widths either side, as used by Wyman, Sloan & Shirley. */
function lobe(l: number, mu: number, s1: number, s2: number): number {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/**
 * CIE 1931 2° colour-matching functions, multi-lobe analytic fit from Wyman, Sloan & Shirley,
 * "Simple Analytic Approximations to the CIE XYZ Color Matching Functions", JCGT 2(2), 2013.
 * λ in nanometres.
 */
export function cie1931(lambdaNm: number): [number, number, number] {
  const l = lambdaNm;
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** XYZ → linear sRGB (D65). */
export function xyzToLinearSrgb(X: number, Y: number, Z: number): [number, number, number] {
  return [
    3.240_454_2 * X - 1.537_138_5 * Y - 0.498_531_4 * Z,
    -0.969_266 * X + 1.876_010_8 * Y + 0.041_556 * Z,
    0.055_643_4 * X - 0.204_025_9 * Y + 1.057_225_2 * Z,
  ];
}

export interface BlackbodyColor {
  /** CIE XYZ chromaticity scaled so Y = 1. */
  xyz: [number, number, number];
  /** log10 of the (relative) luminance Y emitted per unit area and solid angle. */
  log10Y: number;
}

/** The wavelength grid every visible-band integral here uses: 380–780 nm in 5 nm steps. */
export const SPECTRAL_STEP_NM = 5;
export const SPECTRAL_GRID_NM: readonly number[] = Array.from({ length: 81 }, (_, i) => 380 + i * SPECTRAL_STEP_NM);

let cieCache: [number, number, number][] | null = null;
/** cie1931 on SPECTRAL_GRID_NM, computed once (the tables below integrate it thousands of times). */
export function cieOnGrid(): readonly [number, number, number][] {
  cieCache ??= SPECTRAL_GRID_NM.map(cie1931);
  return cieCache;
}

const logsScratch = new Float64Array(SPECTRAL_GRID_NM.length);

/**
 * Integrate a blackbody spectrum at temperature T against the CIE observer (380–780 nm).
 * Computed in log space so it stays finite from a few kelvin to millions of kelvin.
 */
export function blackbody(T: number): BlackbodyColor {
  const cie = cieOnGrid();
  let maxLog = -Infinity;
  for (let k = 0; k < SPECTRAL_GRID_NM.length; k++) {
    const v = logPlanck(SPECTRAL_GRID_NM[k] * 1e-9, T);
    logsScratch[k] = v;
    if (v > maxLog) maxLog = v;
  }
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let k = 0; k < SPECTRAL_GRID_NM.length; k++) {
    const w = Math.exp(logsScratch[k] - maxLog);
    X += w * cie[k][0];
    Y += w * cie[k][1];
    Z += w * cie[k][2];
  }
  return {
    xyz: [X / Y, 1, Z / Y],
    log10Y: (Math.log(Y * SPECTRAL_STEP_NM) + maxLog) / Math.LN10,
  };
}

/** Temperature treated as display white: blackbody colours are white-balanced to this. */
export const WHITE_POINT_K = 6500;

let whiteRgb: [number, number, number] | null = null;
function whiteBalance(): [number, number, number] {
  if (!whiteRgb) {
    const w = blackbody(WHITE_POINT_K).xyz;
    whiteRgb = xyzToLinearSrgb(w[0], w[1], w[2]);
  }
  return whiteRgb;
}

/**
 * Linear-sRGB colour of a blackbody at T, white-balanced so a 6500 K blackbody is neutral,
 * with luminance normalised to 1 (brightness is handled separately). Out-of-gamut channels
 * are clipped at 0.
 */
export function blackbodyRgb(T: number): [number, number, number] {
  return balancedRgb(blackbody(T).xyz);
}

function balancedRgb(xyz: [number, number, number]): [number, number, number] {
  const rgb = xyzToLinearSrgb(xyz[0], xyz[1], xyz[2]);
  const wb = whiteBalance();
  const r = Math.max(0, rgb[0] / wb[0]);
  const g = Math.max(0, rgb[1] / wb[1]);
  const b = Math.max(0, rgb[2] / wb[2]);
  // Rec.709 luminance of the balanced colour → normalise to 1.
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0 ? [r / lum, g / lum, b / lum] : [1, 0, 0];
}

// ─── Brightness relative to the Sun, at any temperature ──────────────────────────────────

/** The reference for every "relative luminance" below: a blackbody at the Sun's 5,772 K. */
export const REF_TEMPERATURE_K = 5772;
export const LN_REF_TEMPERATURE = Math.log(REF_TEMPERATURE_K);

let lnYRef: number | null = null;
/**
 * ln of the visible luminance of a blackbody at T relative to one at 5,772 K, exact (a full
 * integral over the CIE observer). Finite for any T > 0.
 */
export function lnLuminanceRelSun(T: number): number {
  lnYRef ??= blackbody(REF_TEMPERATURE_K).log10Y * Math.LN10;
  return blackbody(T).log10Y * Math.LN10 - lnYRef;
}

/**
 * Temperature lookup table, shared by the GPU and its CPU mirror (sampleBlackbody).
 *
 * Doppler factors now reach e^±40 (γ ≈ 10¹⁷), so a shifted temperature can be anything from
 * 10⁻¹⁴ K to 10²¹ K. The table covers 10 K to 10¹⁰ K, uniform in ln T; beyond it the two exact
 * asymptotes of a blackbody seen through the CIE observer take over:
 *  - hot (Rayleigh–Jeans): hc/λkT → 0, so B_λ → 2ckT/λ⁴. The colour stops changing (it is
 *    already within 3 × 10⁻⁵ of the limit at 10¹⁰ K) and visible luminance grows exactly as T:
 *    ln Y = ln Y(T_max) + ln(T/T_max).
 *  - cold (Wien): B_λ → (2hc²/λ⁵) exp(−hc/λkT), dominated by the reddest wavelength the eye
 *    sees, so ln Y = ln Y(T_min) − K (1/T − 1/T_min), with K ≈ hc/(780 nm · k) taken from the
 *    table's own slope so the join is smooth. It is floored at LN_Y_FLOOR: at 10 K a blackbody
 *    is already e⁻⁴⁰⁰⁰ times fainter than the Sun, far below anything a display can show.
 * Everything is carried as ln Y, so brightness never overflows float32 on the GPU.
 */
export const BB_LUT_LN_T_MIN = Math.log(10);
export const BB_LUT_LN_T_MAX = Math.log(1e10);
export const BB_LUT_SIZE = 2048;
/** Colours below this temperature are held at its value (see blackbodyLut). */
const COLOUR_FLOOR_K = 500;
/** ln Y below which light counts as none at all (and the floor of the cold asymptote). */
export const LN_Y_FLOOR = -1e4;

export interface BlackbodyLut {
  /** size × RGBA: linear-sRGB colour (as blackbodyRgb, luminance 1) and ln Y relative to 5,772 K. */
  data: Float32Array;
  size: number;
  lnTMin: number;
  lnTMax: number;
  /** Cold asymptote: ln Y falls as −wienK/T below the table (K). */
  wienK: number;
}

let lutCache: BlackbodyLut | null = null;

/** The lookup table (built once; about 2,000 blackbody integrals). */
export function blackbodyLut(): BlackbodyLut {
  if (lutCache) return lutCache;
  const size = BB_LUT_SIZE;
  const data = new Float32Array(size * 4);
  const step = (BB_LUT_LN_T_MAX - BB_LUT_LN_T_MIN) / (size - 1);
  const ref = blackbody(REF_TEMPERATURE_K).log10Y;
  let coldRgb: [number, number, number] | null = null;
  for (let i = 0; i < size; i++) {
    const T = Math.exp(BB_LUT_LN_T_MIN + step * i);
    const bb = blackbody(T);
    // Below 500 K the analytic CIE fit's far-red tails are unreliable (they would turn the
    // Wien limit green); a blackbody there is e⁻⁴² times fainter than the Sun anyway, so its
    // colour is held at the 500 K deep red.
    const rgb = T < COLOUR_FLOOR_K ? (coldRgb ??= blackbodyRgb(COLOUR_FLOOR_K)) : balancedRgb(bb.xyz);
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = (bb.log10Y - ref) * Math.LN10;
  }
  // d lnY/d lnT = K/T at T_min, matched to the table's first interval.
  const wienK = ((data[7] - data[3]) / step) * Math.exp(BB_LUT_LN_T_MIN);
  lutCache = { data, size, lnTMin: BB_LUT_LN_T_MIN, lnTMax: BB_LUT_LN_T_MAX, wienK };
  return lutCache;
}

export interface BlackbodySample {
  /** Linear-sRGB colour, luminance 1. */
  r: number;
  g: number;
  b: number;
  /** ln of the visible luminance relative to a 5,772 K blackbody. */
  lnY: number;
}

/**
 * The table at ln T, with the asymptotes beyond it: exactly what the GPU computes (see
 * shaders/blackbody.glsl), so tests and CPU-side exposure agree with the pixels.
 */
export function sampleBlackbody(lnT: number, out: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 }): BlackbodySample {
  const { data, size, lnTMin, lnTMax, wienK } = blackbodyLut();
  const c = Math.min(Math.max(lnT, lnTMin), lnTMax);
  const x = ((c - lnTMin) / (lnTMax - lnTMin)) * (size - 1);
  const i0 = Math.min(Math.floor(x), size - 2);
  const f = x - i0;
  const a = i0 * 4;
  const b = a + 4;
  out.r = data[a] + (data[b] - data[a]) * f;
  out.g = data[a + 1] + (data[b + 1] - data[a + 1]) * f;
  out.b = data[a + 2] + (data[b + 2] - data[a + 2]) * f;
  let lnY = data[a + 3] + (data[b + 3] - data[a + 3]) * f;
  if (lnT > lnTMax) lnY += lnT - lnTMax;
  else if (lnT < lnTMin) lnY = Math.max(lnY - wienK * (Math.exp(Math.min(-lnT, 60)) - Math.exp(-lnTMin)), LN_Y_FLOOR);
  out.lnY = lnY;
  return out;
}
