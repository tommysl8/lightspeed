/**
 * Null geodesics of a Schwarzschild black hole (one that does not spin), exactly, in float64.
 *
 * What: every light ray near the hole stays in a plane through it, so a ray is one number, its impact
 * parameter b, and what the ray does is the azimuth Δφ it sweeps in that plane. This module gives Δφ
 * between any two radii, the total deflection, the shadow of a static observer (Synge 1966), the escape
 * of a backward ray for a static or a free-falling ("raindrop") observer, and every image of a point
 * source at a finite distance with its magnification.
 *
 * How: G = c = M = 1, lengths in units of M = GM/c², angles in radians, u = 1/r. The orbit equation is
 * (du/dφ)² = G(u) = 1/b² − u² + 2u³, with the critical impact parameter b_c = 3√3 (the photon sphere at
 * r = 3). Near b_c the variable is d = b/b_c − 1 (b = b_c (1 + d)): pass d, not b. The roots of G come
 * from closed forms in d whose every term is positive or of the order of its leading term (the
 * periapsis as in Darwin 1959, rewritten without cancellation), and the swept angles from Carlson's
 * symmetric integral R_F with arguments built from differences of roots (DLMF 19.29.4, 19.36.1;
 * Carlson 1995). Nothing here subtracts nearly equal numbers: d comes from the gap to the edge (the look
 * angle's distance from the shadow or the dark region), b/b_c itself where the ray is nearly radial, the
 * shadow as atan2(b_c √(r − 2), (r − 3)√(r + 6)) (1 − sin²α_sh = (r − 3)²(r + 6)/r³), and u2 − uo from the
 * look angle: the escape maps are exact to 1e-14 rad of look angle down to 1e-12 of the edge.
 *
 * Why: the app's lens is built from these on the CPU every time the camera's r changes, and the CPU
 * places labels and picks bodies with the same numbers the GPU draws with.
 *
 * Cost: a sweep is one or two R_F evaluations of 4–8 duplication passes each, about half a microsecond
 * on the target laptop (513 of them build the per-frame table). The per-frame path allocates nothing: V8
 * boxes a double (16 bytes) at every call it does not inline, so the kernels (the k… functions) pass their
 * numbers through a Float64Array of registers, and the table build and the point images call them through
 * escapeFromRegs and exactImageFromRegs; the exported functions wrap the same kernels for everyone else.
 * The convenience forms (rootsReal, staticEscape, raindropEscape and the reference solver lensImages)
 * return new objects and are for tests and one-off use.
 *
 * Twins: the GLSL of the lens (render/shaders/lens.glsl, lensExact.glsl) and its float32 mirror
 * (physics/lensMirror32.ts). Checked against an independent reference in 30–50 digit arithmetic
 * (scripts/schwarzschild/, mpmath), whose output is src/physics/__fixtures__/schwarzschild.json.
 */

/** Critical impact parameter b_c = 3√3 (units of M): rays with b < b_c fall in, b > b_c escape. */
export const BC = 3 * Math.sqrt(3);
const SQ2 = Math.SQRT2;
const SQ3 = Math.sqrt(3);

// ─── Registers of the allocation-free kernels ───────────────────────────────────────────────────

/**
 * V8 boxes a double (a 16-byte heap object) whenever one is passed to or returned from a call it does not
 * inline, and module-level `let` doubles box on every write. The per-frame path (the table build, the point
 * images of bodies) makes thousands of such calls a frame, so its kernels (the k… functions) take their
 * inputs from this array and leave their results in it, and take no double arguments. One kernel call at a
 * time: JavaScript runs one frame at a time. The exported functions below wrap the kernels for everyone else.
 */
const REG = new Float64Array(64);
// kRF, kRFC: in R_A, R_B, R_C → R_OUT
const R_A = 0;
const R_B = 1;
const R_C = 2;
const R_OUT = 3;
// kToPeri: in (u, y) → out
const TP_U = 4;
const TP_Y = 5;
const TP_OUT = 6;
// kBetweenReal: in (ua, ub, ya, yb) → out
const BR_UA = 7;
const BR_UB = 8;
const BR_YA = 9;
const BR_YB = 10;
const BR_OUT = 11;
// kBetweenComplex: in (ua, ub) → out (ub may be Infinity: r = 0)
const BC_UA = 12;
const BC_UB = 13;
const BC_OUT = 14;
// kSweepFrom: in (ro, uo, d, cs) → out
const SF_RO = 16;
const SF_UO = 17;
const SF_D = 18;
const SF_CS = 19;
const SF_OUT = 20;
// escapeFromRegs (kStatic, kRain): in (r, α, gap or NaN) → out (the sweep, NaN when captured)
const ES_R = 21;
const ES_ALPHA = 22;
const ES_GAP = 23;
const ES_OUT = 20;
// kRootsReal, kRootsComplex: in d
const RT_D = 24;
// what kStatic and kRain keep from the last r they saw (the table build asks 513 times at one r)
const KS_R = 25;
const KS_SSH = 26;
const KS_THSH = 27;
const KR_R = 28;
const KR_V = 29;
const KR_RR = 30;
const KR_A = 31;
REG[KS_R] = NaN;
REG[KR_R] = NaN;

// ─── Carlson's R_F ──────────────────────────────────────────────────────────────────────────────

/** R_F kernel: REG[R_A..R_C] = (x, y, z) → REG[R_OUT]. */
function kRF(): void {
  let x = REG[R_A];
  let y = REG[R_B];
  let z = REG[R_C];
  let X = 0;
  let Y = 0;
  let Z = 0;
  let A = 0;
  for (let i = 0; i < 60; i++) {
    const sx = Math.sqrt(x);
    const sy = Math.sqrt(y);
    const sz = Math.sqrt(z);
    const lam = sx * (sy + sz) + sy * sz;
    x = 0.25 * (x + lam);
    y = 0.25 * (y + lam);
    z = 0.25 * (z + lam);
    A = (x + y + z) / 3;
    X = 1 - x / A;
    Y = 1 - y / A;
    Z = 1 - z / A;
    if (Math.max(Math.abs(X), Math.abs(Y), Math.abs(Z)) < 0.0025) break;
  }
  const E2 = X * Y - Z * Z;
  const E3 = X * Y * Z;
  REG[R_OUT] = (1 - E2 / 10 + E3 / 14 + (E2 * E2) / 24 - (3 * E2 * E3) / 44) / Math.sqrt(A);
}

/**
 * Carlson's R_F(x, y, z), x, y, z ≥ 0 with at most one zero. Duplication until the relative spread of
 * the arguments is under 0.0025, then the series of DLMF 19.36.1: relative error under 1e-15, 4–8
 * passes for the arguments met here.
 */
export function rf(x: number, y: number, z: number): number {
  REG[R_A] = x;
  REG[R_B] = y;
  REG[R_C] = z;
  kRF();
  return REG[R_OUT];
}

/**
 * R_F(x, z, z̄) kernel: REG[R_A..R_C] = (x, zr, zi) → REG[R_OUT]. In real arithmetic the duplication keeps
 * the conjugate pair and λ = 2√x Re√z + |z| is real. Near b_c the argument z lies next to the negative
 * real axis, so Re√z and zr + |z| are formed without cancellation (the naive forms lose half the digits
 * there). |z| as √(zr² + zi²): Math.hypot is a call V8 does not inline (it boxes its arguments), and the
 * arguments here never come near overflow.
 */
function kRFC(): void {
  let x = REG[R_A];
  let zr = REG[R_B];
  let zi = REG[R_C];
  let X = 0;
  let Yr = 0;
  let Yi = 0;
  let A = 0;
  for (let i = 0; i < 60; i++) {
    const mod = Math.sqrt(zr * zr + zi * zi);
    // Re √z without cancellation
    const t = Math.sqrt((mod + Math.abs(zr)) / 2);
    const a = t === 0 ? 0 : zr >= 0 ? t : Math.abs(zi) / (2 * t);
    const sx = Math.sqrt(x);
    const lam = 2 * sx * a + mod;
    // zr + |z| without cancellation when zr < 0
    const zpm = zr >= 0 ? zr + mod : (zi * zi) / (mod - zr);
    x = 0.25 * (x + lam);
    zr = 0.25 * (zpm + 2 * sx * a);
    zi = 0.25 * zi;
    A = (x + 2 * zr) / 3;
    X = 1 - x / A;
    Yr = 1 - zr / A;
    Yi = -zi / A;
    if (Math.max(Math.abs(X), Math.sqrt(Yr * Yr + Yi * Yi)) < 0.0025) break;
  }
  const Y2 = Yr * Yr + Yi * Yi;
  const E2 = 2 * X * Yr + Y2;
  const E3 = X * Y2;
  REG[R_OUT] = (1 - E2 / 10 + E3 / 14 + (E2 * E2) / 24 - (3 * E2 * E3) / 44) / Math.sqrt(A);
}

/**
 * R_F(x, z, z̄), x ≥ 0, z = zr + i zi, in real arithmetic: the duplication keeps the conjugate pair and
 * λ = 2√x Re√z + |z| is real. Near b_c the argument z lies next to the negative real axis, so Re√z and
 * zr + |z| are formed without cancellation (the naive forms lose half the digits there).
 */
export function rfConj(x: number, zr: number, zi: number): number {
  REG[R_A] = x;
  REG[R_B] = zr;
  REG[R_C] = zi;
  kRFC();
  return REG[R_OUT];
}

// ─── Roots of G(u) ──────────────────────────────────────────────────────────────────────────────

/** The roots of G(u) = 1/b² − u² + 2u³ for b > b_c, as the differences the sweeps need. */
export interface RealRoots {
  b: number;
  /** Periapsis r0. */
  P: number;
  /** r0 − 3. */
  eps: number;
  u2: number;
  /** −u1 (> 0). */
  mu1: number;
  /** u3 − u2. */
  du32: number;
  /** u2 − u1. */
  du21: number;
}

/** Roots kernel: d = REG[RT_D] > 0 → out. */
function kRootsReal(out: RealRoots): void {
  const d = REG[RT_D];
  const b = BC * (1 + d);
  const Ap = 2 * Math.asin(Math.sqrt(d / (2 * (1 + d))));
  const s3 = Math.sin(Ap / 3);
  const s6 = Math.sin(Ap / 6);
  const eps = 3 * d - ((2 * b) / SQ3) * s6 * s6 + b * s3;
  const P = 3 + eps;
  const Q = Math.sqrt((P - 2) * (P + 6));
  const QmP6 = (4 * P - 12) / (Q + P) + 6;
  out.b = b;
  out.P = P;
  out.eps = eps;
  out.u2 = 1 / P;
  out.mu1 = (2 * (P - 2)) / (P * (P - 2 + Q));
  out.du32 = (4 * eps) / (P * QmP6);
  out.du21 = (3 * P - 6 + Q) / (P * (P - 2 + Q));
}

/**
 * b > b_c, d = b/b_c − 1 > 0. A′ = 2 asin √(d/(2(1 + d))); r0 − 3 = 3d + b [sin(A′/3) − (2/√3) sin²(A′/6)];
 * Q = √((P − 2)(P + 6)); u3 − u2 = 4ε/(P (Q − P + 6)); u2 − u1 = (3P − 6 + Q)/(P (P − 2 + Q));
 * −u1 = 2(P − 2)/(P (P − 2 + Q)); Q − P + 6 = (4P − 12)/(Q + P) + 6.
 */
export function rootsReal(d: number): RealRoots {
  return rootsRealInto(d, { b: 0, P: 0, eps: 0, u2: 0, mu1: 0, du32: 0, du21: 0 });
}

/** rootsReal into a reused object (no allocation). */
export function rootsRealInto(d: number, out: RealRoots): RealRoots {
  REG[RT_D] = d;
  kRootsReal(out);
  return out;
}

/** b < b_c: G = 2 (u − u1)((u − m)² + n²). */
export interface ComplexRoots {
  b: number;
  u1: number;
  m: number;
  n: number;
}

/** Roots kernel: d = REG[RT_D] ∈ (−1, 0) and β = b/b_c = REG[RT_BETA] (1 + d, each to its own last digits) → out. */
function kRootsComplex(out: ComplexRoots): void {
  const d = REG[RT_D];
  const beta = REG[RT_BETA];
  // −d (2 + d) = (1 − β)(1 + β)
  const s = Math.sqrt(-d * (1 + beta)) / beta;
  const sh = Math.sinh(Math.asinh(s) / 3);
  const eta = (-2 / 3) * sh * sh;
  const S = 2 / 3 - eta;
  out.b = BC * beta;
  out.u1 = -1 / 6 + eta;
  out.m = S / 2;
  out.n = Math.sqrt(-0.75 * eta * S);
}

/**
 * 0 < b < b_c, −1 < d < 0: with s = √(−d (2 + d))/(1 + d) and η = −(2/3) sinh²(asinh(s)/3),
 * u1 = −1/6 + η, S = 2/3 − η, m = S/2, n² = −(3/4) η S.
 */
export function rootsComplex(d: number): ComplexRoots {
  return rootsComplexInto(d, { b: 0, u1: 0, m: 0, n: 0 });
}

/** rootsComplex into a reused object (no allocation). */
export function rootsComplexInto(d: number, out: ComplexRoots): ComplexRoots {
  REG[RT_D] = d;
  REG[RT_BETA] = 1 + d;
  kRootsComplex(out);
  return out;
}

// ─── Swept angles ───────────────────────────────────────────────────────────────────────────────

/** Kernel: REG[TP_U] = u, REG[TP_Y] = u2 − u → REG[TP_OUT], the sweep from u to the periapsis. */
function kToPeri(R: RealRoots): void {
  const u = REG[TP_U];
  const y = Math.max(REG[TP_Y], 0);
  REG[R_A] = (u + R.mu1) * R.du32;
  REG[R_B] = R.du21 * R.du32;
  REG[R_C] = R.du21 * (R.du32 + y);
  kRF();
  REG[TP_OUT] = SQ2 * Math.sqrt(y) * REG[R_OUT];
}

/** b > b_c: the azimuth swept from u (≤ u2) to the periapsis. y = u2 − u (pass it when it is known accurately). */
export function sweepToPeriapsis(R: RealRoots, u: number, y = R.u2 - u): number {
  REG[TP_U] = u;
  REG[TP_Y] = y;
  kToPeri(R);
  return REG[TP_OUT];
}

/** Kernel: REG[BR_UA..BR_YB] = (ua, ub, u2 − ua, u2 − ub) → REG[BR_OUT]. */
function kBetweenReal(R: RealRoots): void {
  const ua = REG[BR_UA];
  const ub = REG[BR_UB];
  const ya = REG[BR_YA];
  const yb = Math.max(REG[BR_YB], 0);
  const X1 = Math.sqrt(ub + R.mu1);
  const Y1 = Math.sqrt(ua + R.mu1);
  const X2 = Math.sqrt(yb);
  const Y2 = Math.sqrt(ya);
  const X3 = Math.sqrt(R.du32 + yb);
  const Y3 = Math.sqrt(R.du32 + ya);
  const dd = ub - ua;
  const U12 = (X1 * X2 * Y3 + Y1 * Y2 * X3) / dd;
  const U13 = (X1 * X3 * Y2 + Y1 * Y3 * X2) / dd;
  const U14 = (X1 * Y2 * Y3 + Y1 * X2 * X3) / dd;
  REG[R_A] = U12 * U12;
  REG[R_B] = U13 * U13;
  REG[R_C] = U14 * U14;
  kRF();
  REG[BR_OUT] = SQ2 * REG[R_OUT];
}

/** b > b_c, 0 ≤ ua < ub ≤ u2: the azimuth swept between them; ya = u2 − ua, yb = u2 − ub. */
export function sweepBetweenReal(R: RealRoots, ua: number, ub: number, ya = R.u2 - ua, yb = R.u2 - ub): number {
  REG[BR_UA] = ua;
  REG[BR_UB] = ub;
  REG[BR_YA] = ya;
  REG[BR_YB] = yb;
  kBetweenReal(R);
  return REG[BR_OUT];
}

/**
 * Kernel: REG[BC_UA], REG[BC_UB] = (ua, ub) → REG[BC_OUT] (b < b_c). The principal square roots of
 * ub − m − i n and ua − m − i n are formed without cancellation (Re from |z| + |zr|, Im from zi over it).
 */
function kBetweenComplex(C: ComplexRoots): void {
  const ua = REG[BC_UA];
  const ub = REG[BC_UB];
  const u1 = C.u1;
  const m = C.m;
  const n = C.n;
  if (ub === Infinity) {
    REG[R_A] = ua - u1;
    REG[R_B] = ua - m;
    REG[R_C] = -n;
    kRFC();
    REG[BC_OUT] = SQ2 * REG[R_OUT];
    return;
  }
  const X1 = Math.sqrt(ub - u1);
  const Y1 = Math.sqrt(ua - u1);
  // √(ub − m − i n) = zxr + i zxi
  let zr = ub - m;
  let mod = Math.sqrt(zr * zr + n * n);
  let t = Math.sqrt((mod + Math.abs(zr)) / 2);
  let zxr = 0;
  let zxi = 0;
  if (t !== 0) {
    zxr = zr >= 0 ? t : n / (2 * t);
    zxi = zr >= 0 ? -n / (2 * t) : -t;
  }
  // √(ua − m − i n) = zyr + i zyi
  zr = ua - m;
  mod = Math.sqrt(zr * zr + n * n);
  t = Math.sqrt((mod + Math.abs(zr)) / 2);
  let zyr = 0;
  let zyi = 0;
  if (t !== 0) {
    zyr = zr >= 0 ? t : n / (2 * t);
    zyi = zr >= 0 ? -n / (2 * t) : -t;
  }
  const dd = ub - ua;
  const U14 = (X1 * (zyr * zyr + zyi * zyi) + Y1 * (zxr * zxr + zxi * zxi)) / dd;
  const pr = zxr * zyr + zxi * zyi;
  const pi = zxi * zyr - zxr * zyi;
  const Ur = ((X1 + Y1) * pr) / dd;
  const Ui = ((X1 - Y1) * pi) / dd;
  REG[R_A] = U14 * U14;
  REG[R_B] = Ur * Ur - Ui * Ui;
  REG[R_C] = 2 * Ur * Ui;
  kRFC();
  REG[BC_OUT] = SQ2 * REG[R_OUT];
}

/** b < b_c, 0 ≤ ua < ub (ub may be Infinity: r = 0): the azimuth swept between them. */
export function sweepBetweenComplex(C: ComplexRoots, ua: number, ub: number): number {
  REG[BC_UA] = ua;
  REG[BC_UB] = ub;
  kBetweenComplex(C);
  return REG[BC_OUT];
}

/** Total deflection α(b) = 2Φ_p(0) − π for b = b_c (1 + d), d > 0. */
export function deflection(d: number): number {
  const R = rootsReal(d);
  return 2 * sweepToPeriapsis(R, 0) - Math.PI;
}

/**
 * The azimuth swept between radii (ra > rb: from ra inward to rb; rb may be 0), with no turning point
 * between them; b given as d = b/b_c − 1.
 */
export function sweepBetweenRadii(d: number, ra: number, rb: number): number {
  const ua = ra === Infinity ? 0 : 1 / ra;
  const ub = rb === 0 ? Infinity : 1 / rb;
  if (d > 0) {
    const R = rootsReal(d);
    if (ub === Infinity) throw new Error('b > b_c never reaches r = 0 from outside');
    return sweepBetweenReal(R, ua, ub);
  }
  return sweepBetweenComplex(rootsComplex(d), ua, ub);
}

// ─── Observers ──────────────────────────────────────────────────────────────────────────────────

/**
 * Angular radius of the shadow for a static observer at ro > 2 (Synge 1966), over 90° inside r = 3:
 * sin α_sh = (b_c/r)√(1 − 2/r), and since 1 − sin²α_sh = (r − 3)²(r + 6)/r³ exactly,
 * α_sh = atan2(b_c √(r − 2), (r − 3)√(r + 6)): no asin (which loses half the digits where sin α_sh → 1, at the
 * photon sphere), and r − 2, r − 3 exact where they are small.
 */
export function shadowAngle(ro: number): number {
  return Math.atan2(BC * Math.sqrt(ro - 2), (ro - 3) * Math.sqrt(ro + 6));
}

/** sin α_sh = b_c √(r − 2)/r^{3/2}, the static shadow's sine (r − 2 exact near the horizon). */
function shadowSine(ro: number): number {
  return (BC * Math.sqrt(ro - 2)) / (ro * Math.sqrt(ro));
}

/** Where a backward ray goes. */
export interface Escape {
  captured: boolean;
  /** Azimuth swept to infinity (NaN when captured). */
  dphi: number;
}

/** Scratch roots for the kernels (one call at a time). */
const escR: RealRoots = { b: 0, P: 0, eps: 0, u2: 0, mu1: 0, du32: 0, du21: 0 };
const escC: ComplexRoots = { b: 0, u1: 0, m: 0, n: 0 };

/**
 * Kernel: the sweep to infinity of the backward ray with d = b/b_c − 1 (and β = b/b_c = 1 + d in REG[SF_BETA])
 * from uo = 1/ro, given the outward direction cosine cs of the backward ray in the static frame at uo (cs < 0:
 * it starts inward): REG[SF_RO..SF_CS] → REG[SF_OUT], NaN when it cannot escape. u2 − uo comes from the look angle,
 * y (y + u3 − u2) = cs²/(2b²(uo − u1)), never from 1/r0 − 1/ro (a difference that cancels when r0 is near ro).
 */
function kSweepFrom(): void {
  const ro = REG[SF_RO];
  const uo = REG[SF_UO];
  const d = REG[SF_D];
  const cs = REG[SF_CS];
  if (d > 0) {
    if (ro <= 3) {
      REG[SF_OUT] = NaN; // b > b_c below the photon sphere: climbs to r3 and falls back, or falls in
      return;
    }
    REG[RT_D] = d;
    kRootsReal(escR);
    const b = escR.b;
    const K = (cs * cs) / (2 * b * b * (uo + escR.mu1));
    const y = (2 * K) / (escR.du32 + Math.sqrt(escR.du32 * escR.du32 + 4 * K));
    if (cs < 0) {
      REG[TP_U] = 0;
      REG[TP_Y] = escR.u2;
      kToPeri(escR);
      const far = REG[TP_OUT];
      REG[TP_U] = uo;
      REG[TP_Y] = y;
      kToPeri(escR);
      REG[SF_OUT] = far + REG[TP_OUT];
      return;
    }
    REG[BR_UA] = 0;
    REG[BR_UB] = uo;
    REG[BR_YA] = escR.u2;
    REG[BR_YB] = y;
    kBetweenReal(escR);
    REG[SF_OUT] = REG[BR_OUT];
    return;
  }
  if (cs < 0) {
    REG[SF_OUT] = NaN; // inward with b < b_c: into the hole
    return;
  }
  const beta = REG[SF_BETA];
  const b = BC * beta;
  if (b * uo < 1e-6) {
    REG[SF_OUT] = b * uo;
    return;
  }
  REG[RT_D] = Math.min(d, -1e-300);
  REG[RT_BETA] = beta;
  kRootsComplex(escC);
  REG[BC_UA] = 0;
  REG[BC_UB] = uo;
  kBetweenComplex(escC);
  REG[SF_OUT] = REG[BC_OUT];
}

/** Kernel for the static observer: REG[ES_R], REG[ES_ALPHA], REG[ES_GAP] (NaN: none) → REG[ES_OUT]. */
function kStatic(): void {
  const ro = REG[ES_R];
  const theta = REG[ES_ALPHA];
  const uo = 1 / ro;
  if (REG[KS_R] !== ro) {
    REG[KS_R] = ro;
    REG[KS_SSH] = shadowSine(ro);
    REG[KS_THSH] = shadowAngle(ro);
  }
  const sSh = REG[KS_SSH];
  const thSh = REG[KS_THSH];
  const gap = REG[ES_GAP];
  const g = gap === gap ? gap : theta - thSh;
  if (!(g > 0)) {
    REG[ES_OUT] = NaN;
    return;
  }
  // d = b/b_c − 1 = (sin θ − sin θ_sh)/sin θ_sh, from half-angles (exact near the edge); far from it, where d
  // nears −1 (rays close to radial), b/b_c = sin θ/sin θ_sh itself
  let d = (2 * Math.cos(thSh + g / 2) * Math.sin(g / 2)) / sSh;
  let beta = 1 + d;
  if (d < -0.5) {
    beta = Math.sin(theta) / sSh;
    d = beta - 1;
  }
  REG[SF_RO] = ro;
  REG[SF_UO] = uo;
  REG[SF_D] = d;
  REG[SF_BETA] = beta;
  REG[SF_CS] = -Math.cos(theta);
  kSweepFrom();
}

/** Kernel for the raindrop: REG[ES_R], REG[ES_ALPHA], REG[ES_GAP] (NaN: none) → REG[ES_OUT] (see rainSweep). */
function kRain(): void {
  const r = REG[ES_R];
  const alpha = REG[ES_ALPHA];
  const gap = REG[ES_GAP];
  if (REG[KR_R] !== r) {
    // R = √(r² + b_c²v²) = √(r² + 54/r); A = α_edge + ψ0, R sin A = b_c (see raindropDarkRadius)
    REG[KR_R] = r;
    REG[KR_V] = Math.sqrt(2 / r);
    REG[KR_RR] = Math.sqrt(r * r + 54 / r);
    REG[KR_A] = Math.atan2(BC, (r - 3) * Math.sqrt((r + 6) / r));
    REG[KR_EDGE] = REG[KR_A] - Math.atan2(BC * REG[KR_V], r);
  }
  const v = REG[KR_V];
  const sh = Math.sin(alpha / 2);
  const den = (r - 2) / (r * (1 + v)) + 2 * v * sh * sh;
  if (!(den > 0)) {
    REG[ES_OUT] = NaN;
    return;
  }
  const uo = 1 / r;
  const c = Math.cos(alpha);
  const sa = Math.sin(alpha);
  if (sa === 0) {
    REG[ES_OUT] = c < v ? 0 : NaN;
    return;
  }
  // b/b_c directly; near the edge (|d| < 1/2) d from the gap (α − α_edge when not given), exact there: at
  // r = 3 the edge is where b(α) peaks and b − b_c is quadratic in the gap
  let beta = (r * sa) / den / BC;
  let d = beta - 1;
  if (d > -0.5 && d < 0.5) {
    const g = gap === gap ? gap : alpha - REG[KR_EDGE];
    d = (2 * REG[KR_RR] * Math.cos(REG[KR_A] + g / 2) * Math.sin(g / 2)) / (BC * den);
    beta = 1 + d;
  }
  if (d > 0) {
    if (r > 3) {
      REG[SF_RO] = r;
      REG[SF_UO] = uo;
      REG[SF_D] = d;
      REG[SF_BETA] = beta;
      REG[SF_CS] = (v - c) / den;
      kSweepFrom();
    } else REG[ES_OUT] = NaN;
    return;
  }
  if (!(c < v)) {
    REG[ES_OUT] = NaN; // falling with b < b_c: into the hole
    return;
  }
  const b = BC * beta;
  if (b * uo < 1e-6) {
    REG[ES_OUT] = b * uo;
    return;
  }
  REG[RT_D] = Math.min(d, -1e-300);
  REG[RT_BETA] = beta;
  kRootsComplex(escC);
  REG[BC_UA] = 0;
  REG[BC_UB] = uo;
  kBetweenComplex(escC);
  REG[ES_OUT] = REG[BC_OUT];
}

/**
 * The escape kernel for the per-frame builds of physics/schwarzschildTables.ts and physics/lensPoint.ts
 * (which run it by the million a minute): write r, α and the gap (NaN when not known) into
 * escapeRegs[ESCAPE_R], [ESCAPE_ALPHA], [ESCAPE_GAP], call escapeFromRegs, read the sweep (NaN: captured) from
 * escapeRegs[ESCAPE_OUT]. Nothing is allocated.
 */
export const escapeRegs = REG;
export const ESCAPE_R = ES_R;
export const ESCAPE_ALPHA = ES_ALPHA;
export const ESCAPE_GAP = ES_GAP;
export const ESCAPE_OUT = ES_OUT;
export function escapeFromRegs(rain: boolean): void {
  if (rain) kRain();
  else kStatic();
}

/**
 * Static observer at ro > 2, look angle theta (static frame) from the hole's direction: the sweep of the
 * backward ray to infinity, or NaN when it is captured (inside the shadow). gap = theta − theta_sh may be
 * passed to keep precision right at the shadow's edge.
 */
export function staticSweep(ro: number, theta: number, gap?: number): number {
  REG[ES_R] = ro;
  REG[ES_ALPHA] = theta;
  REG[ES_GAP] = gap === undefined ? NaN : gap;
  kStatic();
  return REG[ES_OUT];
}

/**
 * Static observer at ro > 2, look direction at angle theta (static frame) from the hole's direction.
 * gap = theta − theta_sh may be passed to keep precision right at the shadow's edge.
 */
export function staticEscape(ro: number, theta: number, gap?: number): Escape {
  const dphi = staticSweep(ro, theta, gap);
  return Number.isNaN(dphi) ? { captured: true, dphi: NaN } : { captured: false, dphi };
}

/** Where a backward ray goes, for the raindrop. */
export interface RaindropEscape extends Escape {
  /** ln(ν_obs/ν_∞) for light from infinity (NaN when captured with E ≤ 0). */
  lnF: number;
  reason?: 'E<=0' | 'trapped' | 'from the hole';
}

/** 1 − v cos α for the raindrop, as (1 − v) + 2v sin²(α/2) with 1 − v = (r − 2)/(r (1 + v)): no cancellation. */
function rainDen(r: number, v: number, alpha: number): number {
  const s = Math.sin(alpha / 2);
  return (r - 2) / (r * (1 + v)) + 2 * v * s * s;
}

/**
 * The raindrop (falling freely from rest at infinity) at any r > 0, look angle theta (raindrop frame)
 * from the hole's direction: b = r sin θ/(1 − v cos θ), v = √(2/r), ν_obs/ν_∞ = 1/(1 − v cos θ); valid
 * inside the horizon too (Hamilton & Lisle 2008, the river model).
 */
export function raindropEscape(r: number, theta: number): RaindropEscape {
  const v = Math.sqrt(2 / r);
  const den = rainDen(r, v, theta);
  if (!(den > 0)) return { captured: true, dphi: NaN, lnF: NaN, reason: 'E<=0' };
  const lnF = -Math.log(den);
  const dphi = rainSweep(r, theta);
  if (!Number.isNaN(dphi)) return { captured: false, dphi, lnF };
  const b = (r * Math.sin(theta)) / den;
  return { captured: true, dphi: NaN, lnF, reason: Math.cos(theta) < v && b > BC ? 'trapped' : 'from the hole' };
}

/**
 * The raindrop at any r > 0, look angle alpha (raindrop frame) from the hole: the sweep of the backward ray
 * to infinity, or NaN when its light did not come from the sky (E ≤ 0, trapped, or from the hole).
 * gap = alpha − raindropDarkRadius(r) may be passed; then d = b/b_c − 1 comes from it without cancellation:
 * b − b_c = 2R cos(A + g/2) sin(g/2)/(1 − v cos α), R = √(r² + b_c²v²), A = α_edge + atan2(b_c v, r) (so
 * R sin A = b_c). The backward ray climbs when cos α < v; in the static frame (outside the horizon) its
 * outward direction cosine is (v − cos α)/(1 − v cos α), the aberration between the two frames, which also
 * gives u2 − uo without cancellation.
 */
export function rainSweep(r: number, alpha: number, gap?: number): number {
  REG[ES_R] = r;
  REG[ES_ALPHA] = alpha;
  REG[ES_GAP] = gap === undefined ? NaN : gap;
  kRain();
  return REG[ES_OUT];
}

/**
 * Angular radius of the raindrop's dark region round the hole's direction, any r > 0: its edge is b = b_c,
 * R sin(θ + ψ0) = b_c with R = √(r² + b_c² v²), ψ0 = atan2(b_c v, r). 42.10° at the horizon. θ + ψ0 is
 * asin(b_c/R) outside r = 3 and π − asin(b_c/R) inside; since R² − b_c² = (r − 3)²(r + 6)/r exactly, both are
 * atan2(b_c, (r − 3)√((r + 6)/r)), with no asin near 1 at r = 3.
 */
export function raindropDarkRadius(r: number): number {
  const v = Math.sqrt(2 / r);
  return Math.atan2(BC, (r - 3) * Math.sqrt((r + 6) / r)) - Math.atan2(BC * v, r);
}

// ─── The lens equation (static observer ro > 3, static source rs > 2) ──────────────────────────

/** How a backward ray meets the source: outward, after periapsis, or on its way in (to the source inside ro). */
export type Branch = 'out' | 'peri' | 'in_c' | 'in_p';

interface BranchValue {
  dphi: number;
  /** Signed outward direction cosine of the backward ray at the source. */
  cs: number;
}

/**
 * The azimuth swept to the source's sphere on one branch, as a function of the observer's look angle given
 * as (theta_sh, g) with theta = theta_sh + g (g < 0 below the edge), so the edge is resolved to the last bit.
 */
function branchValue(ro: number, rs: number, br: Branch, thSh: number, g: number): BranchValue {
  const uo = 1 / ro;
  const us = 1 / rs;
  const sSh = shadowSine(ro);
  const theta = thSh + g;
  const d = (2 * Math.cos(thSh + g / 2) * Math.sin(g / 2)) / sSh;
  const b = BC * (1 + d);
  const c = Math.cos(theta);
  const cosPsi = (bb: number, u: number) => Math.sqrt(Math.max(0, 1 - bb * bb * u * u * (1 - 2 * u)));
  if (br === 'out') {
    if (d > 0) {
      const R = rootsReal(d);
      const K = (c * c) / (2 * b * b * (uo + R.mu1));
      const y = (2 * K) / (R.du32 + Math.sqrt(R.du32 * R.du32 + 4 * K));
      return { dphi: sweepBetweenReal(R, us, uo, y + (uo - us), y), cs: cosPsi(b, us) };
    }
    if (b * uo < 1e-7) return { dphi: b * (uo - us), cs: 1 };
    return { dphi: sweepBetweenComplex(rootsComplex(d), us, uo), cs: cosPsi(b, us) };
  }
  if (br === 'peri') {
    const R = rootsReal(d);
    const K = (c * c) / (2 * b * b * (uo + R.mu1));
    const y = (2 * K) / (R.du32 + Math.sqrt(R.du32 * R.du32 + 4 * K));
    const ys = us < uo ? y + (uo - us) : (rs - R.P) / (rs * R.P);
    return { dphi: sweepToPeriapsis(R, uo, y) + sweepToPeriapsis(R, us, ys), cs: cosPsi(b, us) };
  }
  // met on the way in (rs < ro)
  if (b * uo < 1e-7) return { dphi: b * (us - uo), cs: -1 };
  if (d > 0) {
    const R = rootsReal(d);
    const K = (c * c) / (2 * b * b * (uo + R.mu1));
    const y = (2 * K) / (R.du32 + Math.sqrt(R.du32 * R.du32 + 4 * K));
    const ys = Math.max(0, (rs - R.P) / (rs * R.P));
    return { dphi: sweepBetweenReal(R, uo, us, y, ys), cs: -cosPsi(b, us) };
  }
  return { dphi: sweepBetweenComplex(rootsComplex(d), uo, us), cs: -cosPsi(b, us) };
}

/** Brent's method on [a, b] with f(a), f(b) of opposite signs. */
function brent(f: (x: number) => number, a: number, b: number, tol = 1e-15, maxit = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error('brent: no bracket');
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxit; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : m > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  return b;
}

/** One image of a point source. */
export interface Image {
  k: number;
  side: 1 | -1;
  branch: Branch;
  /** Look angle from the hole's direction, static frame. */
  theta: number;
  dphi: number;
  /** Signed magnification relative to flat space at the same coordinates; the sign is the parity. */
  mu: number;
  /** dΩ_o/dA_s (1/M²): flux = L/(4π) g⁴ dΩ/dA. */
  dOmegadA: number;
}

/**
 * Every image of order k = 0 … kmax on both sides of a static point source at rs, seen by a static observer
 * at ro > 3; Phi is the angle at the hole between observer and source (0 … π). Solves Δφ = Φ + 2πk
 * (side +1) or 2π − Φ + 2πk (side −1) on the monotone branches (Perlick 2004), by Brent's method.
 */
export function lensImages(ro: number, rs: number, Phi: number, kmax = 2): Image[] {
  const thSh = shadowAngle(ro);
  const span = Math.PI - thSh;
  // θ_t: the ray whose periapsis is rs (3 < rs < ro)
  const thT = rs > 3 && rs < ro ? Math.asin((rs / ro) * Math.sqrt((1 - 2 / ro) / (1 - 2 / rs))) : NaN;
  const dE2 = ro * ro + rs * rs - 2 * ro * rs * Math.cos(Phi);
  const out: Image[] = [];
  for (let k = 0; k <= kmax; k++) {
    for (const side of [1, -1] as const) {
      const T = (side > 0 ? Phi : 2 * Math.PI - Phi) + 2 * Math.PI * k;
      // choose the branch and a parameterisation g(x) of the gap to the edge
      let br: Branch;
      let gOf: (x: number) => number;
      let lo: number;
      let hi: number;
      const valAt = (b: Branch, g: number) => branchValue(ro, rs, b, thSh, g).dphi;
      if (rs >= ro) {
        const D90 = valAt(rs > ro ? 'out' : 'peri', Math.PI / 2 - thSh);
        if (rs > ro && T <= D90) {
          br = 'out';
          gOf = (x) => x;
          lo = Math.PI / 2 - thSh;
          hi = span;
        } else {
          br = 'peri';
          gOf = (x) => Math.exp(x);
          lo = -T - 40;
          hi = Math.log(Math.PI / 2 - thSh);
        }
      } else if (rs <= 3) {
        br = 'in_c';
        gOf = (x) => -Math.exp(x);
        lo = -T - 40;
        hi = Math.log(thSh);
      } else {
        const Dsh = valAt('in_c', -1e-13 * thSh);
        const Dt = valAt('in_p', thT - thSh);
        if (T <= Dsh) {
          br = 'in_c';
          gOf = (x) => -x;
          lo = 1e-13 * thSh;
          hi = thSh;
        } else if (T <= Dt) {
          br = 'in_p';
          gOf = (x) => x;
          lo = 1e-13 * thSh;
          hi = thT - thSh;
        } else {
          br = 'peri';
          gOf = (x) => Math.exp(x);
          lo = -T - 40;
          hi = Math.log(thT - thSh);
        }
      }
      const f = (x: number) => valAt(br, gOf(x)) - T;
      const x = brent(f, lo, hi, 1e-15 * Math.max(1, Math.abs(hi)));
      const g = gOf(x);
      const v = branchValue(ro, rs, br, thSh, g);
      // dΔφ/dθ by central differences: in ln|g| near the shadow's edge, and in w = √(θ_t − θ) near θ_t,
      // where the two branches through periapsis meet with an infinite slope (cos ψ_s → 0 there, and the
      // product that enters μ stays finite).
      const h = 1e-4;
      let dd: number;
      const wt = thT - thSh - g;
      if ((br === 'in_p' || br === 'peri') && wt > 0 && wt < Math.abs(g)) {
        const w = Math.sqrt(wt);
        const wp = w * Math.exp(h);
        const wm = w * Math.exp(-h);
        const dPhidw = (valAt(br, thT - thSh - wp * wp) - valAt(br, thT - thSh - wm * wm)) / (wp - wm);
        dd = -dPhidw / (2 * w);
      } else {
        let gp = g * Math.exp(h);
        let gm = g * Math.exp(-h);
        if (gp > span) {
          gp = span;
          gm = 2 * g - span;
        }
        dd = (valAt(br, gp) - valAt(br, gm)) / (gp - gm);
      }
      const theta = thSh + g;
      const dOmegadA = Math.sin(theta) / (rs * rs * Math.abs(Math.sin(v.dphi)) * Math.abs(dd) * Math.abs(v.cs));
      const parity = -Math.sign(Math.sin(v.dphi) * dd * v.cs);
      out.push({ k, side, branch: br, theta, dphi: v.dphi, mu: parity * dE2 * dOmegadA, dOmegadA });
    }
  }
  return out;
}

// ─── One exact image, without allocating (tier 2 on the CPU: physics/lensPoint.ts) ────────────────

// kBranch: in (ro, rs, θ_sh, sin θ_sh, g) → (Δφ at the source, signed outward cosine there)
const BV_RO = 32;
const BV_RS = 33;
const BV_THSH = 34;
const BV_SSH = 35;
const BV_G = 36;
const BV_DPHI = 37;
const BV_CS = 38;
// the Brent search: in (lo, hi, target, tolerance) in the branch's variable x → root
const BT_LO = 39;
const BT_HI = 40;
const BT_T = 41;
const BT_TOL = 42;
const BT_X = 43;
const BT_ROOT = 44;
// exactImageFromRegs: in (ro, rs, Φ)
const EX_RO = 45;
const EX_RS = 46;
const EX_PHI = 47;
// b/b_c = 1 + d, carried beside d where the ray is far from the edge and d → −1 (nearly radial rays): the
// complex roots need both 1 − b/b_c (= −d) and b/b_c to their last digits
const RT_BETA = 48;
const SF_BETA = 49;
// kRain's cached dark-region radius for KR_R
const KR_EDGE = 50;

/** Branch codes of the exact solver (the order of `Branch`). */
const B_OUT = 0;
const B_PERI = 1;
const B_IN_C = 2;
const B_IN_P = 3;
const BRANCH_NAMES: readonly Branch[] = ['out', 'peri', 'in_c', 'in_p'];

/**
 * Kernel: the azimuth swept to the source's sphere on branch `br` at gap g = θ − θ_sh (g < 0 below the edge),
 * and the signed outward direction cosine of the backward ray there; branchValue's arithmetic.
 */
function kBranch(br: number): void {
  const ro = REG[BV_RO];
  const rs = REG[BV_RS];
  const thSh = REG[BV_THSH];
  const sSh = REG[BV_SSH];
  const g = REG[BV_G];
  const uo = 1 / ro;
  const us = 1 / rs;
  const theta = thSh + g;
  const d = (2 * Math.cos(thSh + g / 2) * Math.sin(g / 2)) / sSh;
  const b = BC * (1 + d);
  const c = Math.cos(theta);
  const cosPsi = Math.sqrt(Math.max(0, 1 - b * b * us * us * (1 - 2 * us)));
  if (br === B_OUT) {
    if (d > 0) {
      REG[RT_D] = d;
      kRootsReal(escR);
      const K = (c * c) / (2 * b * b * (uo + escR.mu1));
      const y = (2 * K) / (escR.du32 + Math.sqrt(escR.du32 * escR.du32 + 4 * K));
      REG[BR_UA] = us;
      REG[BR_UB] = uo;
      REG[BR_YA] = y + (uo - us);
      REG[BR_YB] = y;
      kBetweenReal(escR);
      REG[BV_DPHI] = REG[BR_OUT];
      REG[BV_CS] = cosPsi;
      return;
    }
    if (b * uo < 1e-7) {
      REG[BV_DPHI] = b * (uo - us);
      REG[BV_CS] = 1;
      return;
    }
    REG[RT_D] = d;
    REG[RT_BETA] = 1 + d;
    kRootsComplex(escC);
    REG[BC_UA] = us;
    REG[BC_UB] = uo;
    kBetweenComplex(escC);
    REG[BV_DPHI] = REG[BC_OUT];
    REG[BV_CS] = cosPsi;
    return;
  }
  if (br === B_PERI) {
    REG[RT_D] = d;
    kRootsReal(escR);
    const K = (c * c) / (2 * b * b * (uo + escR.mu1));
    const y = (2 * K) / (escR.du32 + Math.sqrt(escR.du32 * escR.du32 + 4 * K));
    const ys = us < uo ? y + (uo - us) : (rs - escR.P) / (rs * escR.P);
    REG[TP_U] = uo;
    REG[TP_Y] = y;
    kToPeri(escR);
    const near = REG[TP_OUT];
    REG[TP_U] = us;
    REG[TP_Y] = ys;
    kToPeri(escR);
    REG[BV_DPHI] = near + REG[TP_OUT];
    REG[BV_CS] = cosPsi;
    return;
  }
  // met on the way in (rs < ro)
  if (b * uo < 1e-7) {
    REG[BV_DPHI] = b * (us - uo);
    REG[BV_CS] = -1;
    return;
  }
  if (d > 0) {
    REG[RT_D] = d;
    kRootsReal(escR);
    const K = (c * c) / (2 * b * b * (uo + escR.mu1));
    const y = (2 * K) / (escR.du32 + Math.sqrt(escR.du32 * escR.du32 + 4 * K));
    REG[BR_UA] = uo;
    REG[BR_UB] = us;
    REG[BR_YA] = y;
    REG[BR_YB] = Math.max(0, (rs - escR.P) / (rs * escR.P));
    kBetweenReal(escR);
    REG[BV_DPHI] = REG[BR_OUT];
  } else {
    REG[RT_D] = d;
    REG[RT_BETA] = 1 + d;
    kRootsComplex(escC);
    REG[BC_UA] = uo;
    REG[BC_UB] = us;
    kBetweenComplex(escC);
    REG[BV_DPHI] = REG[BC_OUT];
  }
  REG[BV_CS] = -cosPsi;
}

/** Kernel: the branch value at x = REG[BT_X], with g = x (mode 0), e^x (1), −e^x (2) or −x (3). */
function kBranchAtX(br: number, mode: number): void {
  const x = REG[BT_X];
  REG[BV_G] = mode === 0 ? x : mode === 1 ? Math.exp(x) : mode === 2 ? -Math.exp(x) : -x;
  kBranch(br);
}

/**
 * Brent's method for kBranchAtX(br, mode) = target on [lo, hi] (REG[BT_LO], REG[BT_HI], REG[BT_T],
 * REG[BT_TOL]) → REG[BT_ROOT]; false when the ends do not bracket a root.
 */
function kBrent(br: number, mode: number): boolean {
  const target = REG[BT_T];
  const tol = REG[BT_TOL];
  let a = REG[BT_LO];
  let b = REG[BT_HI];
  REG[BT_X] = a;
  kBranchAtX(br, mode);
  let fa = REG[BV_DPHI] - target;
  REG[BT_X] = b;
  kBranchAtX(br, mode);
  let fb = REG[BV_DPHI] - target;
  if (fa === 0) {
    REG[BT_ROOT] = a;
    return true;
  }
  if (fb === 0) {
    REG[BT_ROOT] = b;
    return true;
  }
  if (!(fa * fb < 0)) return false;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < 200; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) break;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : m > 0 ? tol1 : -tol1;
    REG[BT_X] = b;
    kBranchAtX(br, mode);
    fb = REG[BV_DPHI] - target;
  }
  REG[BT_ROOT] = b;
  return true;
}


/** One image of a point source from the exact solver (exactImageInto). */
export interface ExactImage {
  ok: boolean;
  branch: Branch;
  /** Look angle from the hole's direction, static frame. */
  theta: number;
  /** θ − θ_sh (negative for images inside the shadow's outline: the `in_c` branch). */
  gap: number;
  b: number;
  /** Azimuth swept to the source (the target Φ + 2πk or 2π − Φ + 2πk). */
  dphi: number;
  /** Signed outward direction cosine of the backward ray at the source. */
  cs: number;
  /** dΔφ/dθ. */
  dd: number;
  /** Signed magnification relative to flat space at the same coordinates; the sign is the parity. */
  mu: number;
  /** dΩ_o/dA_s (1/M²). */
  dOmegadA: number;
}

/**
 * The image of order (k, side) of a static point source at rs seen by a static observer at ro > 3, Phi the angle
 * at the hole between them: lensImages' solution for one image, written into `out` without allocating (the
 * branch chosen from its end values, Brent's method in the branch's stretched variable, dΔφ/dθ by central
 * differences in ln|g|, or in √(θ_t − θ) next to the ray whose periapsis is rs). Returns out.ok.
 */
export function exactImageInto(ro: number, rs: number, Phi: number, k: number, side: 1 | -1, out: ExactImage): boolean {
  REG[EX_RO] = ro;
  REG[EX_RS] = rs;
  REG[EX_PHI] = Phi;
  return exactImageFromRegs(k, side, out);
}

/**
 * exactImageInto for callers that must not allocate (physics/lensPoint.ts): ro, rs and Φ in
 * escapeRegs[EXACT_RO], [EXACT_RS], [EXACT_PHI].
 */
export const EXACT_RO = EX_RO;
export const EXACT_RS = EX_RS;
export const EXACT_PHI = EX_PHI;
export function exactImageFromRegs(k: number, side: 1 | -1, out: ExactImage): boolean {
  const ro = REG[EX_RO];
  const rs = REG[EX_RS];
  const Phi = REG[EX_PHI];
  out.ok = false;
  if (!(ro > 3) || !(rs > 2) || rs === ro) return false;
  const uo = 1 / ro;
  const sSh = shadowSine(ro);
  const thSh = shadowAngle(ro);
  const span = Math.PI - thSh;
  const thT = rs > 3 && rs < ro ? Math.asin((rs / ro) * Math.sqrt((1 - 2 / ro) / (1 - 2 / rs))) : NaN;
  const dE2 = ro * ro + rs * rs - 2 * ro * rs * Math.cos(Phi);
  const T = (side > 0 ? Phi : 2 * Math.PI - Phi) + 2 * Math.PI * k;
  REG[BV_RO] = ro;
  REG[BV_RS] = rs;
  REG[BV_THSH] = thSh;
  REG[BV_SSH] = sSh;
  let br: number;
  let mode: number;
  let lo: number;
  let hi: number;
  if (rs >= ro) {
    REG[BV_G] = Math.PI / 2 - thSh;
    kBranch(rs > ro ? B_OUT : B_PERI);
    const D90 = REG[BV_DPHI];
    if (rs > ro && T <= D90) {
      br = B_OUT;
      mode = 0;
      lo = Math.PI / 2 - thSh;
      hi = span;
    } else {
      br = B_PERI;
      mode = 1;
      lo = -T - 40;
      hi = Math.log(Math.PI / 2 - thSh);
    }
  } else if (rs <= 3) {
    br = B_IN_C;
    mode = 2;
    lo = -T - 40;
    hi = Math.log(thSh);
  } else {
    REG[BV_G] = -1e-13 * thSh;
    kBranch(B_IN_C);
    const Dsh = REG[BV_DPHI];
    REG[BV_G] = thT - thSh;
    kBranch(B_IN_P);
    const Dt = REG[BV_DPHI];
    if (T <= Dsh) {
      br = B_IN_C;
      mode = 3;
      lo = 1e-13 * thSh;
      hi = thSh;
    } else if (T <= Dt) {
      br = B_IN_P;
      mode = 0;
      lo = 1e-13 * thSh;
      hi = thT - thSh;
    } else {
      br = B_PERI;
      mode = 1;
      lo = -T - 40;
      hi = Math.log(thT - thSh);
    }
  }
  REG[BT_LO] = lo;
  REG[BT_HI] = hi;
  REG[BT_T] = T;
  REG[BT_TOL] = 1e-15 * Math.max(1, Math.abs(hi));
  if (!kBrent(br, mode)) return false;
  const x = REG[BT_ROOT];
  const g = mode === 0 ? x : mode === 1 ? Math.exp(x) : mode === 2 ? -Math.exp(x) : -x;
  REG[BV_G] = g;
  kBranch(br);
  const dphi = REG[BV_DPHI];
  const cs = REG[BV_CS];
  // dΔφ/dθ by central differences: in ln|g| near the shadow's edge, and in w = √(θ_t − θ) near θ_t, where
  // the two branches through periapsis meet with an infinite slope (cos ψ_s → 0 there, and the product
  // that enters μ stays finite)
  const h = 1e-4;
  let dd: number;
  const wt = thT - thSh - g;
  if ((br === B_IN_P || br === B_PERI) && wt > 0 && wt < Math.abs(g)) {
    const w = Math.sqrt(wt);
    const wp = w * Math.exp(h);
    const wm = w * Math.exp(-h);
    REG[BV_G] = thT - thSh - wp * wp;
    kBranch(br);
    const fp = REG[BV_DPHI];
    REG[BV_G] = thT - thSh - wm * wm;
    kBranch(br);
    const fm = REG[BV_DPHI];
    dd = -((fp - fm) / (wp - wm)) / (2 * w);
  } else {
    let gp = g * Math.exp(h);
    let gm = g * Math.exp(-h);
    if (gp > span) {
      gp = span;
      gm = 2 * g - span;
    }
    REG[BV_G] = gp;
    kBranch(br);
    const fp = REG[BV_DPHI];
    REG[BV_G] = gm;
    kBranch(br);
    const fm = REG[BV_DPHI];
    dd = (fp - fm) / (gp - gm);
  }
  const theta = thSh + g;
  const sd = Math.sin(dphi);
  const dOmegadA = Math.sin(theta) / (rs * rs * Math.abs(sd) * Math.abs(dd) * Math.abs(cs));
  const parity = sd * dd * cs > 0 ? -1 : 1;
  out.ok = true;
  out.branch = BRANCH_NAMES[br];
  out.theta = theta;
  out.gap = g;
  out.b = (ro * Math.sin(theta)) / Math.sqrt((ro - 2) * uo);
  out.dphi = dphi;
  out.cs = cs;
  out.dd = dd;
  out.mu = parity * dE2 * dOmegadA;
  out.dOmegadA = dOmegadA;
  return true;
}

// ─── The lens observer: what the per-frame tables are built for ─────────────────────────────────

/** The frame the lens tables are built for: the static (hovering) observer, or the raindrop. */
export type LensFrame = 'static' | 'rain';

/** Who the lens tables are built for. r in units of M; 'static' needs r > 2 (gravity keeps r ≥ 2(1 + 1e-6)). */
export interface LensObserver {
  frame: LensFrame;
  r: number;
}

/**
 * Angular radius, from the hole's direction in the lens frame, of the region whose rays do not come from
 * the sky: Synge's shadow (static) or the dark region (rain). Float64, 1e-15.
 */
export function edgeAngle(obs: LensObserver): number {
  return obs.frame === 'static' ? shadowAngle(obs.r) : raindropDarkRadius(obs.r);
}

/**
 * π − edgeAngle(obs) without cancellation: for the static observer atan2(b_c √(r − 2), (3 − r)√(r + 6)) (the
 * shadow's supplement; 2.6e-3 rad at the hover floor, where π − α_edge would keep only 13 digits). The
 * raindrop's dark region never passes π/2 (86° at 0.01 M), so its span is formed by subtraction.
 */
export function spanAngle(obs: LensObserver): number {
  if (obs.frame === 'static') return Math.atan2(BC * Math.sqrt(obs.r - 2), (3 - obs.r) * Math.sqrt(obs.r + 6));
  return Math.PI - edgeAngle(obs);
}

/** Output of escapeSweepInto (reused: no allocation). */
export interface SweepSample {
  captured: boolean;
  /** Azimuth swept to infinity, rad (NaN when captured). */
  dphi: number;
  /** ln(ν_obs/ν_∞) of light from infinity at this look angle. */
  lnG: number;
}

/**
 * The backward ray at look angle alpha (lens frame, from the hole's direction): captured, or the sweep Δφ
 * to infinity, with ln g. `gap` = alpha − edgeAngle(obs) when the caller knows it better than alpha (near
 * the edge). Exact (Carlson), float64, allocation-free (the per-frame table build calls it 513 times).
 */
export function escapeSweepInto(obs: LensObserver, alpha: number, gap: number | undefined, out: SweepSample): SweepSample {
  const r = obs.r;
  REG[ES_R] = r;
  REG[ES_ALPHA] = alpha;
  REG[ES_GAP] = gap === undefined ? NaN : gap;
  if (obs.frame === 'static') {
    kStatic();
    out.lnG = r < 4 ? -0.5 * Math.log((r - 2) / r) : -0.5 * Math.log1p(-2 / r);
  } else {
    kRain();
    const v = Math.sqrt(2 / r);
    const s = Math.sin(alpha / 2);
    out.lnG = -Math.log((r - 2) / (r * (1 + v)) + 2 * v * s * s);
  }
  const dphi = REG[ES_OUT];
  out.captured = dphi !== dphi;
  out.dphi = dphi;
  return out;
}

/**
 * ln g of light from infinity for a static observer at r: −½ ln(1 − 2/r), through log1p far away and as
 * −½ ln((r − 2)/r) near the horizon (r − 2 exact there), so it keeps its digits at both ends.
 */
export function lnGStatic(r: number): number {
  return r < 4 ? -0.5 * Math.log((r - 2) / r) : -0.5 * Math.log1p(-2 / r);
}

/**
 * ln G for the raindrop at r looking at alpha from the hole: −ln((1 − v) + 2v sin²(α/2)), v = √(2/r), with
 * 1 − v = (r − 2)/(r (1 + v)) so it keeps its digits at the horizon (and is negative inside it).
 */
export function lnGRain(r: number, alpha: number): number {
  const v = Math.sqrt(2 / r);
  const oneMinusV = (r - 2) / (r * (1 + v));
  const s = Math.sin(alpha / 2);
  return -Math.log(oneMinusV + 2 * v * s * s);
}

/**
 * The look angle of the Einstein ring of the sky behind the hole (Δφ = π), lens frame: the root of
 * Δφ(α) = π between the edge and straight out (Δφ falls from infinity at the edge to 0 at α = π), found
 * by bisection in ln(α − edge), to the last bit. About 150 sweeps: for tests and one-off use (each frame's θ_E
 * is the inverse table's, from the forward spline, within 0.004 px of this).
 */
export function einsteinAngle(obs: LensObserver): number {
  const edge = edgeAngle(obs);
  const span = Math.PI - edge;
  const sample: SweepSample = { captured: false, dphi: 0, lnG: 0 };
  // Δφ − π at gap e^x: positive near the edge (and where captured), negative towards straight out.
  const f = (x: number): number => {
    const g = Math.exp(x);
    escapeSweepInto(obs, edge + g, g, sample);
    return sample.captured ? Infinity : sample.dphi - Math.PI;
  };
  let lo = Math.log(span) - 60;
  let hi = Math.log(span);
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, Math.abs(hi)); i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return edge + Math.exp(0.5 * (lo + hi));
}
