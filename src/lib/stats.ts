/**
 * Small statistics toolkit for the lab notebook: least-squares fits with standard errors,
 * χ², and a seeded Gaussian generator for the simulated instrument noise.
 *
 * Fits follow the standard treatment (e.g. Taylor, An Introduction to Error Analysis, 2nd ed.,
 * ch. 8; Bevington & Robinson, Data Reduction and Error Analysis, 3rd ed., ch. 6). With known
 * uncertainties σᵢ the fit is weighted by 1/σᵢ². Without them, σ is estimated from the scatter
 * of the residuals.
 */

export interface LinearFit {
  /** Intercept a and slope b of y = a + b·x. */
  a: number;
  b: number;
  /** Standard errors. */
  sa: number;
  sb: number;
  /** Covariance of a and b. */
  cov: number;
  n: number;
  /** Degrees of freedom (n − 2). */
  ndf: number;
  /** χ² with the given σ (weighted) or the residual sum of squares / s² (unweighted: = ndf). */
  chi2: number;
  /** Coefficient of determination. */
  r2: number;
  weighted: boolean;
}

export interface ProportionalFit {
  /** Slope b of y = b·x (line through the origin). */
  b: number;
  sb: number;
  n: number;
  ndf: number;
  chi2: number;
  weighted: boolean;
}

const usable = (sy?: ArrayLike<number>) =>
  !!sy && Array.from(sy).every((s) => Number.isFinite(s) && s > 0);

/** Least-squares straight line y = a + b·x. Null with fewer than 2 distinct x values. */
export function linearFit(xs: ArrayLike<number>, ys: ArrayLike<number>, sy?: ArrayLike<number>): LinearFit | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const weighted = usable(sy) && sy!.length === n;
  let S = 0;
  let Sx = 0;
  let Sy = 0;
  for (let i = 0; i < n; i++) {
    const w = weighted ? 1 / (sy![i] * sy![i]) : 1;
    S += w;
    Sx += w * xs[i];
    Sy += w * ys[i];
  }
  const xm = Sx / S;
  const ym = Sy / S;
  // Centred sums are numerically stable.
  let Stt = 0;
  let Sty = 0;
  for (let i = 0; i < n; i++) {
    const w = weighted ? 1 / (sy![i] * sy![i]) : 1;
    const t = xs[i] - xm;
    Stt += w * t * t;
    Sty += w * t * (ys[i] - ym);
  }
  if (!(Stt > 0)) return null;
  const b = Sty / Stt;
  const a = ym - b * xm;

  let chi2 = 0;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const w = weighted ? 1 / (sy![i] * sy![i]) : 1;
    const r = ys[i] - (a + b * xs[i]);
    chi2 += w * r * r;
    ssRes += r * r;
    ssTot += (ys[i] - ym) ** 2;
  }
  const ndf = n - 2;
  let varB = 1 / Stt;
  let varA = 1 / S + (xm * xm) / Stt;
  let cov = -xm / Stt;
  if (!weighted) {
    // σ² estimated from the residuals.
    const s2 = ndf > 0 ? chi2 / ndf : NaN;
    varB *= s2;
    varA *= s2;
    cov *= s2;
    chi2 = ndf;
  }
  return {
    a,
    b,
    sa: Math.sqrt(varA),
    sb: Math.sqrt(varB),
    cov,
    n,
    ndf,
    chi2,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
    weighted,
  };
}

/** Least-squares line through the origin, y = b·x. */
export function proportionalFit(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sy?: ArrayLike<number>,
): ProportionalFit | null {
  const n = xs.length;
  if (n < 1 || ys.length !== n) return null;
  const weighted = usable(sy) && sy!.length === n;
  let Sxx = 0;
  let Sxy = 0;
  for (let i = 0; i < n; i++) {
    const w = weighted ? 1 / (sy![i] * sy![i]) : 1;
    Sxx += w * xs[i] * xs[i];
    Sxy += w * xs[i] * ys[i];
  }
  if (!(Sxx > 0)) return null;
  const b = Sxy / Sxx;
  let chi2 = 0;
  for (let i = 0; i < n; i++) {
    const w = weighted ? 1 / (sy![i] * sy![i]) : 1;
    chi2 += w * (ys[i] - b * xs[i]) ** 2;
  }
  const ndf = n - 1;
  let varB = 1 / Sxx;
  if (!weighted) {
    const s2 = ndf > 0 ? chi2 / ndf : NaN;
    varB *= s2;
    chi2 = ndf;
  }
  return { b, sb: Math.sqrt(varB), n, ndf, chi2, weighted };
}

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function stdev(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** Standard error of the mean. */
export const sem = (xs: ArrayLike<number>): number => stdev(xs) / Math.sqrt(xs.length);

/** χ² of data against a model with uncertainties σ. */
export function chiSquare(ys: ArrayLike<number>, model: ArrayLike<number>, sy: ArrayLike<number>): number {
  let c = 0;
  for (let i = 0; i < ys.length; i++) c += ((ys[i] - model[i]) / sy[i]) ** 2;
  return c;
}

/** Deterministic 32-bit PRNG (mulberry32): the same seed gives the same noise. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal deviate (Box–Muller) from a uniform generator. */
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u <= Number.EPSILON) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** String hash → seed (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
