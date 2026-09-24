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

/**
 * Integrate a blackbody spectrum at temperature T against the CIE observer (380–780 nm).
 * Computed in log space so it stays finite from a few kelvin to millions of kelvin.
 */
export function blackbody(T: number): BlackbodyColor {
  const step = 5;
  const logs: number[] = [];
  let maxLog = -Infinity;
  for (let l = 380; l <= 780; l += step) {
    const v = logPlanck(l * 1e-9, T);
    logs.push(v);
    if (v > maxLog) maxLog = v;
  }
  let X = 0;
  let Y = 0;
  let Z = 0;
  let k = 0;
  for (let l = 380; l <= 780; l += step, k++) {
    const w = Math.exp(logs[k] - maxLog);
    const [cx, cy, cz] = cie1931(l);
    X += w * cx;
    Y += w * cy;
    Z += w * cz;
  }
  return {
    xyz: [X / Y, 1, Z / Y],
    log10Y: (Math.log(Y * step) + maxLog) / Math.LN10,
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
  const { xyz } = blackbody(T);
  const rgb = xyzToLinearSrgb(xyz[0], xyz[1], xyz[2]);
  const wb = whiteBalance();
  const r = Math.max(0, rgb[0] / wb[0]);
  const g = Math.max(0, rgb[1] / wb[1]);
  const b = Math.max(0, rgb[2] / wb[2]);
  // Rec.709 luminance of the balanced colour → normalise to 1.
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0 ? [r / lum, g / lum, b / lum] : [1, 0, 0];
}

/** Range of the temperature lookup table, log10(K). Covers Doppler factors from ~1/450 to ~450. */
export const BB_LUT_LOG_T_MIN = 0; // 1 K
export const BB_LUT_LOG_T_MAX = 7.5; // ~3.2 × 10⁷ K

/**
 * Lookup table sampled uniformly in log10(T): per entry, RGB (as blackbodyRgb) and
 * log10 Y relative to a 6500 K blackbody. The star shader uses it to recolour and re-brighten
 * Doppler-shifted stars.
 */
export function buildBlackbodyLut(size = 1024): Float32Array {
  const data = new Float32Array(size * 4);
  const ref = blackbody(WHITE_POINT_K).log10Y;
  for (let i = 0; i < size; i++) {
    const logT = BB_LUT_LOG_T_MIN + ((BB_LUT_LOG_T_MAX - BB_LUT_LOG_T_MIN) * i) / (size - 1);
    const T = 10 ** logT;
    const rgb = blackbodyRgb(T);
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = Math.max(-80, blackbody(T).log10Y - ref);
  }
  return data;
}
