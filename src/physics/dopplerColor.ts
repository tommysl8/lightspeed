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
 */
import { cie1931, logPlanck, xyzToLinearSrgb, WHITE_POINT_K, blackbody } from './blackbody';
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

/** White-balance factors (same convention as blackbodyRgb: a 6500 K blackbody is neutral). */
function whiteBalance(): [number, number, number] {
  const w = blackbody(WHITE_POINT_K).xyz;
  return xyzToLinearSrgb(w[0], w[1], w[2]);
}

/**
 * M(D): column j = linear-RGB of basis spectrum j seen with Doppler factor D, i.e.
 * ∫ R_j(λD) B_λ(λ, T☉·D) · CMF(λ) dλ over the visible. Absolute scale is arbitrary but
 * consistent across D. Returned row-major.
 */
export function basisMatrix(D: number, refLog: number): number[] {
  const T = SUN_TEFF_K * D;
  const wb = whiteBalance();
  const cols: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let l = 380; l <= 780; l += 5) {
    const b = Math.exp(logPlanck(l * 1e-9, T) - refLog);
    if (b === 0) continue;
    const [cx, cy, cz] = cie1931(l);
    const R = reflectanceBasis(l * D);
    for (let j = 0; j < 3; j++) {
      const s = R[j] * b;
      cols[j][0] += s * cx;
      cols[j][1] += s * cy;
      cols[j][2] += s * cz;
    }
  }
  const m: number[] = new Array(9);
  for (let j = 0; j < 3; j++) {
    const rgb = xyzToLinearSrgb(cols[j][0], cols[j][1], cols[j][2]);
    for (let i = 0; i < 3; i++) m[i * 3 + j] = rgb[i] / wb[i];
  }
  return m;
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

/** Reference so exp() stays in range: the log Planck value at 550 nm for the Sun. */
const REF_LOG = logPlanck(550e-9, SUN_TEFF_K);

let inverseA: number[] | null = null;

/** T(D): the 3×3 (row-major) linear-RGB transform for Doppler factor D. T(1) = identity. */
export function dopplerColorMatrix(D: number): number[] {
  inverseA ??= invert3(basisMatrix(1, REF_LOG));
  return mul3(basisMatrix(D, REF_LOG), inverseA);
}

export const DOPPLER_LUT_LN_MIN = -6.5;
export const DOPPLER_LUT_LN_MAX = 6.5;

/**
 * Lookup texture data: `size` columns (uniform in ln D) × 3 rows (the rows of T), RGBA float.
 */
export function buildDopplerLut(size = 1024): Float32Array {
  const data = new Float32Array(size * 3 * 4);
  for (let k = 0; k < size; k++) {
    const lnD = DOPPLER_LUT_LN_MIN + ((DOPPLER_LUT_LN_MAX - DOPPLER_LUT_LN_MIN) * k) / (size - 1);
    const T = dopplerColorMatrix(Math.exp(lnD));
    for (let row = 0; row < 3; row++) {
      const o = (row * size + k) * 4;
      data[o] = T[row * 3];
      data[o + 1] = T[row * 3 + 1];
      data[o + 2] = T[row * 3 + 2];
      data[o + 3] = 1;
    }
  }
  return data;
}
