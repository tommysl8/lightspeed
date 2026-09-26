/**
 * Approximate Doppler recolouring for rendered pixels (planets, the Sun's disc, rings, lines).
 *
 * An RGB pixel doesn't pin down a spectrum, so this is an approximation (the explainer says
 * so). Each pixel is modelled as sunlight reflected by a smooth reflectance:
 *
 *     S(λ) = Σⱼ wⱼ Rⱼ(λ) · B_λ(λ, 5772 K)
 *
 * where R_blue, R_green, R_red are smooth bands that sum to 1 at every wavelength, including
 * beyond the visible. A white surface therefore reflects the solar spectrum exactly, and
 * infrared or ultraviolet light shifted into view is still accounted for. Seen with Doppler
 * factor D, specific intensity transforms as
 *
 *     I′_λ(λ) = D⁵ I_λ(λ D)      (from I_ν/ν³ being invariant)
 *
 * which is linear in the weights w. So each D gives a 3×3 matrix T(D) = M(D)·M(1)⁻¹ acting on
 * linear RGB. Since D⁵ B_λ(λD, T) = B_λ(λ, D·T), a white surface turns into a blackbody at D·T,
 * consistent with the per-star treatment.
 *
 * Any D. T(D) is split into a brightness and a colour: T(D) = L(D) · Ĉ(D), where
 * L(D) = Y(D·T☉)/Y(T☉) is the visible-luminance boost of sunlight and Ĉ(D) is bounded. The GPU
 * takes ln L from the blackbody table, whose hot and cold asymptotes (blackbody.ts) hold at any
 * D, so brightness travels as a logarithm and never overflows float32. Ĉ needs no asymptote
 * of its own: above D ≈ 1.7 every visible wavelength λ samples the reflectance at λD > 650 nm,
 * where only the red band is left, and below D ≈ 0.55 only the blue band; either way Ĉ is a
 * blackbody's chromaticity times a fixed row. At the hot edge that chromaticity has converged to
 * its Rayleigh–Jeans limit; at the cold edge the light is already e⁻⁴⁵ times dimmer than
 * sunlight, deep red and invisible. Beyond the edges the edge values stand.
 */
import { cieOnGrid, logPlanck, xyzToLinearSrgb, WHITE_POINT_K, blackbody, SPECTRAL_GRID_NM, SPECTRAL_STEP_NM } from './blackbody';
import { SUN_TEFF_K } from './constants';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Reflectance basis (partition of unity), λ in nm. */
export function reflectanceBasis(lambdaNm: number): [number, number, number] {
  const blue = 1 - smoothstep(430, 530, lambdaNm);
  const red = smoothstep(560, 650, lambdaNm);
  return [red, 1 - blue - red, blue];
}

const logsScratch = new Float64Array(SPECTRAL_GRID_NM.length);

let wbCache: [number, number, number] | null = null;
/** White-balance factors (same convention as blackbodyRgb: a 6500 K blackbody is neutral). */
function whiteBalance(): [number, number, number] {
  if (!wbCache) {
    const w = blackbody(WHITE_POINT_K).xyz;
    wbCache = xyzToLinearSrgb(w[0], w[1], w[2]);
  }
  return wbCache;
}

interface ScaledBasis {
  /** M(D) · e^−lnScale, row-major. */
  m: number[];
  /** ln of the factor taken out of m (the largest ln B_λ on the grid). */
  lnScale: number;
  /** ln of the visible luminance Y of a blackbody at D·T☉ (same units as blackbody().log10Y · ln 10). */
  lnY: number;
}

/**
 * M(D): column j = linear RGB of basis spectrum j seen with Doppler factor D, i.e.
 * ∫ R_j(λD) B_λ(λ, T☉·D) · CMF(λ) dλ over the visible, computed with the largest term scaled
 * out so it neither underflows (D → 0) nor overflows (D → ∞).
 */
function scaledBasis(D: number): ScaledBasis {
  const T = SUN_TEFF_K * D;
  const wb = whiteBalance();
  const cie = cieOnGrid();
  const n = SPECTRAL_GRID_NM.length;
  const logs = logsScratch;
  let lnScale = -Infinity;
  for (let k = 0; k < n; k++) {
    logs[k] = logPlanck(SPECTRAL_GRID_NM[k] * 1e-9, T);
    if (logs[k] > lnScale) lnScale = logs[k];
  }
  const cols = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let Y = 0;
  for (let k = 0; k < n; k++) {
    const b = Math.exp(logs[k] - lnScale);
    const [cx, cy, cz] = cie[k];
    Y += b * cy;
    const R = reflectanceBasis(SPECTRAL_GRID_NM[k] * D);
    for (let j = 0; j < 3; j++) {
      const s = R[j] * b;
      cols[j * 3] += s * cx;
      cols[j * 3 + 1] += s * cy;
      cols[j * 3 + 2] += s * cz;
    }
  }
  const m: number[] = new Array(9);
  for (let j = 0; j < 3; j++) {
    const rgb = xyzToLinearSrgb(cols[j * 3], cols[j * 3 + 1], cols[j * 3 + 2]);
    for (let i = 0; i < 3; i++) m[i * 3 + j] = rgb[i] / wb[i];
  }
  return { m, lnScale, lnY: Math.log(Y * SPECTRAL_STEP_NM) + lnScale };
}

/**
 * M(D) with the absolute scale e^−refLog (the original, unscaled form; it under- or overflows
 * for extreme D). Returned row-major.
 */
export function basisMatrix(D: number, refLog: number): number[] {
  const { m, lnScale } = scaledBasis(D);
  const k = Math.exp(lnScale - refLog);
  return m.map((v) => v * k);
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

function mul3(a: number[], b: number[]): number[] {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}

interface Reference {
  /** M(1)⁻¹ in scaled units. */
  inverse: number[];
  lnScale: number;
  lnY: number;
}
let ref: Reference | null = null;
function reference(): Reference {
  if (!ref) {
    const s = scaledBasis(1);
    ref = { inverse: invert3(s.m), lnScale: s.lnScale, lnY: s.lnY };
  }
  return ref;
}

/** Ĉ(D) and ln L(D) together (one spectral integral). */
function splitTransform(lnD: number): { C: number[]; lnL: number } {
  const R = reference();
  const s = scaledBasis(Math.exp(lnD));
  // T(D) = m(D)·e^(lnScale(D)) · (m(1)·e^(lnScale(1)))⁻¹ and L(D) = e^(lnY(D) − lnY(1)); the
  // exponents combine into one of order 1 (lnY − lnScale is the log of a bounded sum).
  const k = Math.exp(s.lnScale - s.lnY - (R.lnScale - R.lnY));
  return { C: mul3(s.m, R.inverse).map((v) => v * k), lnL: s.lnY - R.lnY };
}

/**
 * ln L(D): the visible-luminance boost of sunlight seen with Doppler factor D, exact at any D
 * (Y(D·T☉)/Y(T☉) for a 5,772 K blackbody).
 */
export function dopplerLnLuminance(lnD: number): number {
  return scaledBasis(Math.exp(lnD)).lnY - reference().lnY;
}

/**
 * Ĉ(D) = T(D)/L(D): the colour part of the transform, bounded at any D (row-major). Applied to
 * the colour of sunlight it gives a blackbody colour at D·T☉ with luminance close to 1.
 */
export function dopplerColorMatrixNormalized(lnD: number): number[] {
  return splitTransform(lnD).C;
}

/** T(D): the 3×3 (row-major) linear-RGB transform for Doppler factor D. T(1) = identity. */
export function dopplerColorMatrix(D: number): number[] {
  const lnD = Math.log(D);
  const L = Math.exp(dopplerLnLuminance(lnD));
  return dopplerColorMatrixNormalized(lnD).map((v) => v * L);
}

/**
 * Range of the colour table in ln D: e^−2.5 to e¹², sunlight shifted to 474 K (already e⁻⁴⁵
 * times dimmer, and blue-band only) up to 9 × 10⁸ K (Rayleigh–Jeans to 3 × 10⁻⁵).
 */
export const DOPPLER_LUT_LN_MIN = -2.5;
export const DOPPLER_LUT_LN_MAX = 12;
export const DOPPLER_LUT_SIZE = 2048;

/**
 * Lookup texture data: `size` columns (uniform in ln D) × 3 rows (the rows of Ĉ), RGBA float.
 * Alpha of the first row holds ln L(D) for reference; the shader takes brightness from the
 * blackbody table instead, which extends past these edges.
 */
export function buildDopplerLut(size = DOPPLER_LUT_SIZE): Float32Array {
  const data = new Float32Array(size * 3 * 4);
  for (let k = 0; k < size; k++) {
    const lnD = DOPPLER_LUT_LN_MIN + ((DOPPLER_LUT_LN_MAX - DOPPLER_LUT_LN_MIN) * k) / (size - 1);
    const { C, lnL } = splitTransform(lnD);
    for (let row = 0; row < 3; row++) {
      const o = (row * size + k) * 4;
      data[o] = C[row * 3];
      data[o + 1] = C[row * 3 + 1];
      data[o + 2] = C[row * 3 + 2];
      data[o + 3] = row === 0 ? lnL : 1;
    }
  }
  return data;
}

/**
 * CPU mirror of the shader's pixel recolouring at any ln D: Ĉ blended linearly between the two
 * nearest table columns (the edge column beyond the table), times the brightness from the
 * blackbody table.
 */
export function sampleDopplerColor(lut: Float32Array, size: number, lnD: number, lnL: number, c: [number, number, number]): [number, number, number] {
  const u = Math.min(1, Math.max(0, (lnD - DOPPLER_LUT_LN_MIN) / (DOPPLER_LUT_LN_MAX - DOPPLER_LUT_LN_MIN)));
  const x = u * (size - 1);
  const k = Math.min(Math.floor(x), size - 2);
  const f = x - k;
  const scale = Math.exp(lnL);
  const out: [number, number, number] = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    const o0 = (row * size + k) * 4;
    const o1 = o0 + 4;
    let v = 0;
    for (let j = 0; j < 3; j++) v += (lut[o0 + j] + (lut[o1 + j] - lut[o0 + j]) * f) * c[j];
    out[row] = Math.max(0, v) * scale;
  }
  return out;
}
