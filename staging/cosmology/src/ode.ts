// Adaptive Dormand-Prince 5(4) Runge-Kutta integrator (Dormand & Prince 1980, J. Comput. Appl. Math.
// 6, 19; the same tableau as Hairer, Norsett & Wanner, "Solving ODEs I", DOPRI5, and MATLAB's ode45).
// Local extrapolation (the 5th-order solution is propagated), FSAL, error norm
//   err = sqrt(mean_i (e_i / (atol_i + rtol max(|y_i|, |y_new_i|)))^2),
// step factor 0.9 err^(-1/5) clamped to [0.2, 5] (no growth right after a rejection).
// Optional output points are hit exactly by shortening the step that would cross them.

export type Rhs = (x: number, y: Float64Array, dydx: Float64Array) => void;

export interface OdeOptions {
  rtol?: number;
  atol?: number;
  /** First trial step (signed or unsigned; the direction comes from x0 -> x1). */
  h0?: number;
  hMax?: number;
  maxSteps?: number;
  /** Record every accepted step (x, y) as a checkpoint. */
  record?: boolean;
  /** Called at each point of `outputs` (must be monotone in the direction of integration). */
  outputs?: ArrayLike<number>;
  onOutput?: (x: number, y: Float64Array, dydx: Float64Array) => void;
}

export interface OdeResult {
  x: number;
  y: Float64Array;
  dydx: Float64Array;
  steps: number;
  rejected: number;
  evaluations: number;
  /** Last accepted step size (to restart efficiently). */
  h: number;
  checkpoints?: { x: Float64Array; y: Float64Array[] };
}

// Butcher tableau.
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
// Error coefficients: b(5th) - b*(4th).
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

export function dopri5(f: Rhs, x0: number, y0: ArrayLike<number>, x1: number, opts: OdeOptions = {}): OdeResult {
  const n = y0.length;
  const rtol = opts.rtol ?? 1e-12;
  const atol = opts.atol ?? 1e-300;
  const maxSteps = opts.maxSteps ?? 1_000_000;
  const dir = x1 >= x0 ? 1 : -1;
  const span = Math.abs(x1 - x0);
  const hMax = opts.hMax ?? span;
  let h = Math.min(Math.abs(opts.h0 ?? span / 100), hMax, span) || span;
  const y = Float64Array.from(y0);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n);
  const k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
  const yt = new Float64Array(n), yn = new Float64Array(n);
  let x = x0;
  let evals = 0;
  f(x, y, k1);
  evals++;
  let steps = 0;
  let rejected = 0;
  let lastRejected = false;
  const cpX: number[] = [];
  const cpY: Float64Array[] = [];
  if (opts.record) {
    cpX.push(x);
    cpY.push(Float64Array.from(y));
  }
  const outs = opts.outputs;
  let oi = 0;
  if (outs && opts.onOutput) {
    while (oi < outs.length && dir * (outs[oi] - x) <= 0) {
      opts.onOutput(x, y, k1);
      oi++;
    }
  }
  if (span === 0) return { x, y, dydx: k1, steps: 0, rejected: 0, evaluations: evals, h: 0 };
  while (dir * (x1 - x) > 0) {
    if (steps + rejected > maxSteps) throw new Error(`dopri5: more than ${maxSteps} steps`);
    // Target of this step: the end point or the next output point, whichever is nearer.
    let target = x1;
    if (outs && oi < outs.length && dir * (outs[oi] - target) < 0) target = outs[oi];
    let hs = Math.min(h, hMax);
    let landing = false;
    if (hs >= Math.abs(target - x) * (1 - 1e-12)) {
      hs = Math.abs(target - x);
      landing = true;
    }
    const hh = dir * hs;
    for (let i = 0; i < n; i++) yt[i] = y[i] + hh * A21 * k1[i];
    f(x + C2 * hh, yt, k2);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A31 * k1[i] + A32 * k2[i]);
    f(x + C3 * hh, yt, k3);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    f(x + C4 * hh, yt, k4);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    f(x + C5 * hh, yt, k5);
    for (let i = 0; i < n; i++) yt[i] = y[i] + hh * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    const xn = landing ? target : x + hh;
    f(x + hh, yt, k6);
    for (let i = 0; i < n; i++) yn[i] = y[i] + hh * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    f(xn, yn, k7);
    evals += 6;
    let err = 0;
    for (let i = 0; i < n; i++) {
      const e = hh * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i]));
      const r = e / sc;
      err += r * r;
    }
    err = Math.sqrt(err / n);
    if (!Number.isFinite(err)) {
      h = hs * 0.1;
      rejected++;
      lastRejected = true;
      if (h < 1e-300) throw new Error('dopri5: step size underflow');
      continue;
    }
    if (err <= 1) {
      x = xn;
      y.set(yn);
      k1.set(k7);
      steps++;
      if (opts.record) {
        cpX.push(x);
        cpY.push(Float64Array.from(y));
      }
      if (landing && outs && opts.onOutput && oi < outs.length && target === outs[oi]) {
        opts.onOutput(x, y, k1);
        oi++;
        while (oi < outs.length && dir * (outs[oi] - x) <= 0) {
          opts.onOutput(x, y, k1);
          oi++;
        }
      }
      const fac = err === 0 ? 5 : Math.min(lastRejected ? 1 : 5, Math.max(0.2, 0.9 * err ** -0.2));
      // Do not let a short landing step shrink the step used afterwards.
      h = landing ? Math.max(h, hs * fac) : hs * fac;
      lastRejected = false;
    } else {
      h = hs * Math.max(0.2, 0.9 * err ** -0.2);
      rejected++;
      lastRejected = true;
    }
  }
  if (outs && opts.onOutput) {
    while (oi < outs.length) {
      opts.onOutput(x, y, k1);
      oi++;
    }
  }
  const res: OdeResult = { x, y, dydx: k1, steps, rejected, evaluations: evals, h };
  if (opts.record) res.checkpoints = { x: Float64Array.from(cpX), y: cpY };
  return res;
}

/** Index of the last checkpoint with x <= target (checkpoints ascending). */
export function checkpointIndex(xs: Float64Array, target: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (target >= xs[hi]) return hi;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= target) lo = m;
    else hi = m;
  }
  return lo;
}
