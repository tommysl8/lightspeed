/**
 * Position and velocity of a fitted moon model (public/data/moons.json, format
 * lightspeed-moons/1; staging/phase2/moons.md) in one pass: the relativeOrbitProvider `state`
 * for the phase-2 moons.
 *
 * The position is the staging evaluator's (moonModels.ts evalMoon), operation for operation, so
 * it is the same to the last bit; the velocity is its exact time derivative, carried through
 * every series term, the generalised Kepler equation and the fade outside the precise window.
 * The staging evaluator's own velocity is a central difference: two more evaluations of every
 * series, every frame, for every moon (Nereid has 600 terms). This does it with the sines and
 * cosines the position needs anyway.
 *
 * Time: TDB days since J2000; position in km and velocity in km/day, J2000 ecliptic, relative
 * to the model's centre. Allocation-free.
 */

/** A periodic term: [ν (rad/day), A, B] or [ν, A, B, k] (argument ντ + kΛ). */
type Term = readonly number[];

/** The parts of a lightspeed-moons/1 model this reads. */
export interface FittedMoonModel {
  /** Epoch of τ = 0, TDB days since J2000. */
  epoch: number;
  /** Precise window, TDB days since J2000. */
  window: readonly number[];
  /** Fade length outside the window, days. */
  taper: number;
  /** Fit frame → ecliptic J2000, row-major 3×3. */
  frame: readonly number[];
  a: { p: readonly number[]; m: readonly Term[] };
  l: { p: readonly number[]; t: readonly Term[]; m: readonly Term[]; q?: number };
  z: { p: readonly (readonly number[])[]; f: readonly Term[]; m: readonly Term[] };
  s: { p: readonly (readonly number[])[]; f: readonly Term[]; m: readonly Term[] };
  xy: readonly Term[];
  zz: readonly Term[];
}

// Results of the series sums and their time derivatives (scratch, so nothing is allocated).
const sum = { v: 0, d: 0 };
const csum = { re: 0, im: 0, dre: 0, dim: 0 };

/**
 * Σ A cos a + B sin a over the terms, a = ντ + kΛ, and its time derivative (a' = ν + kΛ').
 * The sum is accumulated exactly as the staging realSum does.
 */
function realSum(terms: readonly Term[], tau: number, Lambda: number, dLambda: number): void {
  let s = 0;
  let d = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const k = T.length > 3 ? T[3] : 0;
    const a = T[0] * tau + (k ? k * Lambda : 0);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    s += T[1] * c + T[2] * sn;
    d += (T[0] + k * dLambda) * (T[2] * c - T[1] * sn);
  }
  sum.v = s;
  sum.d = d;
}

/** Σ (A + iB) e^{ia} and its time derivative, as the staging cplxSum (before its weight). */
function cplxSum(terms: readonly Term[], tau: number, Lambda: number, dLambda: number): void {
  let re = 0;
  let im = 0;
  let dre = 0;
  let dim = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const k = T.length > 3 ? T[3] : 0;
    const a = T[0] * tau + (k ? k * Lambda : 0);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tr = T[1] * c - T[2] * s;
    const ti = T[1] * s + T[2] * c;
    re += tr;
    im += ti;
    const da = T[0] + k * dLambda;
    dre -= da * ti;
    dim += da * tr;
  }
  csum.re = re;
  csum.im = im;
  csum.dre = dre;
  csum.dim = dim;
}

// Elements and their rates.
const el = { a: 0, lambda: 0, k: 0, h: 0, q: 0, p: 0, w: 0, Lambda: 0 };
const eld = { a: 0, lambda: 0, k: 0, h: 0, q: 0, p: 0, w: 0, Lambda: 0 };
const zz = [0, 0];
const zzd = [0, 0];

/** Equinoctial elements at t and their rates (staging moonElements, with secularOnly false). */
function elements(m: FittedMoonModel, t: number): void {
  const tau = t - m.epoch;
  // The fade outside the window (staging taperAt) and its rate.
  const w0 = m.window[0];
  const w1 = m.window[1];
  const L = m.taper;
  const dist = t < w0 ? w0 - t : t > w1 ? t - w1 : 0;
  let w: number;
  let tc: number;
  let wDot: number;
  let tcDot: number;
  if (dist <= 0) {
    w = 1;
    tc = t - m.epoch;
    wDot = 0;
    tcDot = 1;
  } else {
    const x = dist / L;
    w = x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x));
    const s = x >= 1 ? 0.5 * L : L * (x - 0.5 * x * x);
    tc = (t < w0 ? w0 - s : w1 + s) - m.epoch;
    // dx/dt = ±1/L (after the window, before it); ds/dt = ±(1 − x); tc moves with s after, against it before.
    const side = t > w1 ? 1 : -1;
    wDot = x >= 1 ? 0 : (-0.5 * Math.PI * Math.sin(Math.PI * x) * side) / L;
    tcDot = x >= 1 ? 0 : 1 - x;
  }

  const lp = m.l.p;
  let Lambda = lp[1] * tau;
  let dLambda = lp[1];
  let pw = tc * tc;
  let pwm1 = tc; // tc^(k−1)
  for (let k = 2; k < lp.length; k++) {
    const physical = k === 2 && m.l.q;
    Lambda += lp[k] * (physical ? tau * tau : pw);
    dLambda += lp[k] * (physical ? 2 * tau : k * pwm1 * tcDot);
    pw *= tc;
    pwm1 *= tc;
  }
  if (w) {
    realSum(m.l.t, tau, 0, 0);
    Lambda += w * sum.v;
    dLambda += wDot * sum.v + w * sum.d;
  }
  let lambda = lp[0] + Lambda;
  let dlambda = dLambda;
  if (w) {
    realSum(m.l.m, tau, Lambda, dLambda);
    lambda += w * sum.v;
    dlambda += wDot * sum.v + w * sum.d;
  }

  const ap = m.a.p;
  let a = ap[0];
  let da = 0;
  pw = tc;
  pwm1 = 1;
  for (let k = 1; k < ap.length; k++) {
    a += ap[k] * pw;
    da += ap[k] * k * pwm1 * tcDot;
    pw *= tc;
    pwm1 *= tc;
  }
  if (w) {
    realSum(m.a.m, tau, Lambda, dLambda);
    a += w * sum.v;
    da += wDot * sum.v + w * sum.d;
  }

  for (let b = 0; b < 2; b++) {
    const B = b === 0 ? m.z : m.s;
    zz[0] = zz[1] = zzd[0] = zzd[1] = 0;
    let pp = 1;
    let ppm1 = 0; // d(tc^k)/dtc = k tc^(k−1)
    for (let k = 0; k < B.p.length; k++) {
      zz[0] += B.p[k][0] * pp;
      zz[1] += B.p[k][1] * pp;
      zzd[0] += B.p[k][0] * ppm1 * tcDot;
      zzd[1] += B.p[k][1] * ppm1 * tcDot;
      ppm1 = (k + 1) * pp;
      pp *= tc;
    }
    cplxSum(B.f, tau, 0, 0);
    zz[0] += 1 * csum.re;
    zz[1] += 1 * csum.im;
    zzd[0] += csum.dre;
    zzd[1] += csum.dim;
    if (w) {
      cplxSum(B.m, tau, Lambda, dLambda);
      zz[0] += w * csum.re;
      zz[1] += w * csum.im;
      zzd[0] += wDot * csum.re + w * csum.dre;
      zzd[1] += wDot * csum.im + w * csum.dim;
    }
    if (b === 0) {
      el.k = zz[0];
      el.h = zz[1];
      eld.k = zzd[0];
      eld.h = zzd[1];
    } else {
      el.q = zz[0];
      el.p = zz[1];
      eld.q = zzd[0];
      eld.p = zzd[1];
    }
  }
  el.a = a;
  el.lambda = lambda;
  el.w = w;
  el.Lambda = Lambda;
  eld.a = da;
  eld.lambda = dlambda;
  eld.w = wDot;
  eld.Lambda = dLambda;
}

const r = [0, 0, 0];
const rd = [0, 0, 0];

/** Position in the fit frame from the elements (staging keplerPosition), and its rate. */
function kepler(): void {
  const { a, lambda, k, h, q, p } = el;
  let F = lambda;
  for (let it = 0; it < 50; it++) {
    const sF = Math.sin(F);
    const cF = Math.cos(F);
    const d = (F - k * sF + h * cF - lambda) / (1 - k * cF - h * sF);
    F -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  const sF = Math.sin(F);
  const cF = Math.cos(F);
  const D = Math.sqrt(Math.max(0, 1 - h * h - k * k));
  const beta = 1 / (1 + D);
  const Xn = (1 - h * h * beta) * cF + h * k * beta * sF - k;
  const Yn = (1 - k * k * beta) * sF + h * k * beta * cF - h;
  const X = a * ((1 - h * h * beta) * cF + h * k * beta * sF - k);
  const Y = a * ((1 - k * k * beta) * sF + h * k * beta * cF - h);
  const c = Math.sqrt(Math.max(0, 1 - q * q - p * p));
  r[0] = X * (1 - 2 * p * p) + Y * 2 * q * p;
  r[1] = X * 2 * q * p + Y * (1 - 2 * q * q);
  r[2] = 2 * c * (Y * q - X * p);

  // Rates. F − k sin F + h cos F = λ gives F' (1 − k cos F − h sin F) = λ' + k' sin F − h' cos F.
  const dk = eld.k;
  const dh = eld.h;
  const dq = eld.q;
  const dp = eld.p;
  const dF = (eld.lambda + dk * sF - dh * cF) / (1 - k * cF - h * sF);
  const dD = D > 0 ? -(h * dh + k * dk) / D : 0;
  const dbeta = -dD / ((1 + D) * (1 + D));
  const dhk = (dh * k + h * dk) * beta + h * k * dbeta;
  const dXn = -(2 * h * dh * beta + h * h * dbeta) * cF - (1 - h * h * beta) * sF * dF + dhk * sF + h * k * beta * cF * dF - dk;
  const dYn = -(2 * k * dk * beta + k * k * dbeta) * sF + (1 - k * k * beta) * cF * dF + dhk * cF - h * k * beta * sF * dF - dh;
  const dX = eld.a * Xn + a * dXn;
  const dY = eld.a * Yn + a * dYn;
  const dc = c > 0 ? -(q * dq + p * dp) / c : 0;
  const qp = q * p;
  const dqp = dq * p + q * dp;
  rd[0] = dX * (1 - 2 * p * p) - X * 4 * p * dp + dY * 2 * qp + Y * 2 * dqp;
  rd[1] = dX * 2 * qp + X * 2 * dqp + dY * (1 - 2 * q * q) - Y * 4 * q * dq;
  rd[2] = 2 * dc * (Y * q - X * p) + 2 * c * (dY * q + Y * dq - dX * p - X * dp);
}

/**
 * Position (km) and velocity (km/day) of a fitted moon relative to its centre, J2000 ecliptic,
 * at `tdbDays` (TDB days since J2000): evalMoon's position and its exact derivative.
 */
export function moonState(m: FittedMoonModel, tdbDays: number, pos: [number, number, number], vel: [number, number, number]): void {
  elements(m, tdbDays);
  kepler();
  if (el.w) {
    const tau = tdbDays - m.epoch;
    cplxSum(m.xy, tau, el.Lambda, eld.Lambda);
    r[0] += el.w * csum.re;
    r[1] += el.w * csum.im;
    rd[0] += eld.w * csum.re + el.w * csum.dre;
    rd[1] += eld.w * csum.im + el.w * csum.dim;
    realSum(m.zz, tau, el.Lambda, eld.Lambda);
    r[2] += el.w * sum.v;
    rd[2] += eld.w * sum.v + el.w * sum.d;
  }
  const F = m.frame;
  pos[0] = F[0] * r[0] + F[1] * r[1] + F[2] * r[2];
  pos[1] = F[3] * r[0] + F[4] * r[1] + F[5] * r[2];
  pos[2] = F[6] * r[0] + F[7] * r[1] + F[8] * r[2];
  vel[0] = F[0] * rd[0] + F[1] * rd[1] + F[2] * rd[2];
  vel[1] = F[3] * rd[0] + F[4] * rd[1] + F[5] * rd[2];
  vel[2] = F[6] * rd[0] + F[7] * rd[1] + F[8] * rd[2];
}
