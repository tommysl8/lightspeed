// Numerical quadrature: Gauss-Legendre rules (nodes computed at load time by Newton's method on the
// Legendre recurrence, so no transcribed tables) and a globally adaptive 7/15-point Gauss-Kronrod
// integrator (the QUADPACK QK15 rule; Piessens et al. 1983, "QUADPACK", Springer).

export interface GaussRule {
  /** Nodes on [-1, 1], ascending. */
  x: Float64Array;
  /** Weights, summing to 2. */
  w: Float64Array;
}

const ruleCache = new Map<number, GaussRule>();

/** n-point Gauss-Legendre rule on [-1, 1]; exact for polynomials of degree 2n - 1. */
export function gaussLegendre(n: number): GaussRule {
  const hit = ruleCache.get(n);
  if (hit) return hit;
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    // Tricomi's initial guess, then Newton on P_n.
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      if (n === 1) {
        p1 = z;
        p0 = 1;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-17) break;
    }
    // Recompute the derivative at the converged node for the weight.
    let p0 = 1;
    let p1 = z;
    for (let k = 2; k <= n; k++) {
      const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
      p0 = p1;
      p1 = p2;
    }
    dp = n === 1 ? 1 : (n * (z * p1 - p0)) / (z * z - 1);
    const wi = 2 / ((1 - z * z) * dp * dp);
    x[i] = -z;
    x[n - 1 - i] = z;
    w[i] = wi;
    w[n - 1 - i] = wi;
  }
  if (n % 2 === 1) x[(n - 1) / 2] = 0;
  const rule = { x, w };
  ruleCache.set(n, rule);
  return rule;
}

/** Composite Gauss-Legendre: `panels` equal panels of an n-point rule on [a, b]. */
export function gaussIntegrate(f: (x: number) => number, a: number, b: number, n = 16, panels = 1): number {
  const { x, w } = gaussLegendre(n);
  const h = (b - a) / panels;
  let s = 0;
  for (let p = 0; p < panels; p++) {
    const m = a + (p + 0.5) * h;
    let ps = 0;
    for (let j = 0; j < n; j++) ps += w[j] * f(m + 0.5 * h * x[j]);
    s += ps;
  }
  return 0.5 * h * s;
}

// QUADPACK QK15 abscissae and weights (Kronrod extension of the 7-point Gauss rule).
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0,
];
const WGK = [
  0.02293532201052922496373200805897, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.27970539148927666790146777142378, 0.381830050505118944950369775488975,
  0.417959183673469387755102040816327,
];
export const QK15 = { XGK, WGK, WG } as const;

interface Segment {
  a: number;
  b: number;
  value: Float64Array;
  error: number;
}

function qk15Vec(f: (x: number, out: Float64Array) => void, dim: number, a: number, b: number, tmp: Float64Array): Segment {
  const c = 0.5 * (a + b);
  const h = 0.5 * (b - a);
  const k = new Float64Array(dim);
  const g = new Float64Array(dim);
  f(c, tmp);
  for (let d = 0; d < dim; d++) {
    k[d] = WGK[7] * tmp[d];
    g[d] = WG[3] * tmp[d];
  }
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    f(c - dx, tmp);
    const t1 = tmp.slice(0, dim);
    f(c + dx, tmp);
    for (let d = 0; d < dim; d++) {
      const s = t1[d] + tmp[d];
      k[d] += WGK[j] * s;
      if (j % 2 === 1) g[d] += WG[(j - 1) / 2] * s;
    }
  }
  let err = 0;
  for (let d = 0; d < dim; d++) {
    k[d] *= h;
    g[d] *= h;
    err = Math.max(err, Math.abs(k[d] - g[d]));
  }
  return { a, b, value: k, error: err };
}

export interface AdaptiveResult {
  value: Float64Array;
  /** Sum of the |K15 - G7| estimates: a conservative bound for smooth integrands. */
  error: number;
  segments: number;
}

/**
 * Globally adaptive Gauss-Kronrod (7/15) quadrature of a vector-valued integrand on [a, b]: the
 * segment with the largest error estimate is bisected until the summed estimate falls below
 * max(absTol, relTol * max_d |I_d|). `breaks` adds interior break points.
 */
export function adaptiveVec(
  f: (x: number, out: Float64Array) => void,
  dim: number,
  a: number,
  b: number,
  opts: { relTol?: number; absTol?: number; maxSegments?: number; breaks?: number[] } = {},
): AdaptiveResult {
  const relTol = opts.relTol ?? 1e-13;
  const absTol = opts.absTol ?? 0;
  const maxSeg = opts.maxSegments ?? 2000;
  const tmp = new Float64Array(dim);
  const pts = [a, ...(opts.breaks ?? []).filter((x) => x > Math.min(a, b) && x < Math.max(a, b)), b];
  if (b < a) pts.sort((p, q) => q - p);
  else pts.sort((p, q) => p - q);
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push(qk15Vec(f, dim, pts[i], pts[i + 1], tmp));
  const total = (): { v: Float64Array; e: number } => {
    const v = new Float64Array(dim);
    let e = 0;
    for (const s of segs) {
      for (let d = 0; d < dim; d++) v[d] += s.value[d];
      e += s.error;
    }
    return { v, e };
  };
  let { v, e } = total();
  while (segs.length < maxSeg) {
    let mag = 0;
    for (let d = 0; d < dim; d++) mag = Math.max(mag, Math.abs(v[d]));
    if (e <= Math.max(absTol, relTol * mag)) break;
    let worst = 0;
    for (let i = 1; i < segs.length; i++) if (segs[i].error > segs[worst].error) worst = i;
    const s = segs[worst];
    const m = 0.5 * (s.a + s.b);
    if (m === s.a || m === s.b) break; // cannot split further
    const left = qk15Vec(f, dim, s.a, m, tmp);
    const right = qk15Vec(f, dim, m, s.b, tmp);
    segs.splice(worst, 1, left, right);
    // Update running totals incrementally.
    for (let d = 0; d < dim; d++) v[d] += left.value[d] + right.value[d] - s.value[d];
    e += left.error + right.error - s.error;
  }
  ({ v, e } = total());
  return { value: v, error: e, segments: segs.length };
}

/** Scalar convenience wrapper around adaptiveVec. */
export function adaptive(
  f: (x: number) => number,
  a: number,
  b: number,
  opts: { relTol?: number; absTol?: number; maxSegments?: number; breaks?: number[] } = {},
): { value: number; error: number; segments: number } {
  const r = adaptiveVec(
    (x, out) => {
      out[0] = f(x);
    },
    1,
    a,
    b,
    opts,
  );
  return { value: r.value[0], error: r.error, segments: r.segments };
}

/** Neumaier (improved Kahan) compensated summation. */
export class CompensatedSum {
  sum = 0;
  private c = 0;
  add(x: number): void {
    const t = this.sum + x;
    if (Math.abs(this.sum) >= Math.abs(x)) this.c += this.sum - t + x;
    else this.c += x - t + this.sum;
    this.sum = t;
  }
  get value(): number {
    return this.sum + this.c;
  }
}
