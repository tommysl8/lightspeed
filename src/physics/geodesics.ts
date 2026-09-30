/**
 * Clocks and motion near a black hole that does not spin: the rate of a hovering observer's clock, the
 * thrust it takes to hover or to move at a steady speed past the hovering observers, tides, radial falls
 * (from rest far away, let go from a hover, or thrown in) through the horizon to the end, circular
 * orbits, and rapidities relative to a moving frame.
 *
 * How: G = c = 1 with lengths in units of M = GM/c² where a name has no unit, times in seconds through
 * the hole's GM/c³ (mTimeS); every quantity that would cancel near the horizon or far away is written in a
 * form that does not: α = √(1 − x), x = r_s/r; 1 − α = x/(1 + α); the lag rate 1 − α/cosh φ =
 * x/(1 + α) + α·2 sinh²(φ/2)/cosh φ. Falls are the closed forms of the radial geodesic, which is Newton's
 * radial Kepler problem in proper time (Misner, Thorne & Wheeler 1973, 25.5 and 31.4):
 * rain (e = 1) r^{3/2} = r0^{3/2} − (3/√2)τ; the drip (e < 1) the cycloid r = R cos²(η/2),
 * τ = √(R³/8)(η + sin η), R = 2/(1 − e²); hail (e > 1) r = A(cosh η − 1), τ = A^{3/2}(sinh η − η),
 * A = 1/(e² − 1). The free-fallers' (Painlevé–Gullstrand) time T, which is the raindrop's proper time and
 * the app's "home, on the free-fallers' clocks" (Hamilton & Lisle 2008), follows
 * dT/dτ = γ = (e² + x)/(e + √x w), w = √(e² − 1 + x) = −dr/dτ, γ the faller's Lorentz factor against the
 * local raindrop; it is tabulated at 2,000 samples in the cycloid's parameter η (dτ/dη → 0 at the
 * ends, so samples crowd at the start, the horizon and the centre, where uniform steps in τ would put the whole
 * interior of a fall from 4,000 au inside one interval), uniform in ln(1 + η/(2e)), which is uniform in η for
 * drips from far out and resolves the start of one let go just above the horizon (γ = 1/e = 1,000 at the hover
 * floor, halving within η ~ 2e), with T − τ as its own column, from γ − 1 in a form with no
 * cancellation: γ − 1 = q²(x + e²)/((√x + e w)(√x + w)(1 + e)(e + √x w)), q = 1 − e². Cubic Hermite with
 * the exact derivative reads it back; η from τ by Newton, with ζ − sin ζ by its series near the end.
 *
 * Why: near a hole the app paces the time warp by the hovering observer's proper time, runs home's clock
 * 1/α faster, shows the thrust and tides, and plays falls in real proper time (sim/gravity.ts, sim/fall.ts,
 * sim/chronometer.ts, the HoleStrip).
 *
 * Cost: closed forms, microseconds a frame, no allocation (FallState and the rapidity's out are written in
 * place); a drip's table (2,000 samples, eight-point Gauss–Legendre on each interval) about a millisecond,
 * once when the fall starts.
 *
 * Twins: none on the GPU. The fixtures' `time` and `drip` sections (scripts/schwarzschild/make_fixtures.py:
 * the closed forms and T by quadrature in 40 digits, checked against Schwarzschild t plus the PG offset)
 * check these to 1e-12.
 */
import { C_KM_S } from './constants';
import type { Vec3 } from './vec';

/** α = √(1 − x), x = r_s/r: the rate of a hovering observer's clock against a distant one. */
export function alphaOf(x: number): number {
  return Math.sqrt(1 - x);
}

/** 1 − α = x/(1 + √(1 − x)), without cancellation far from the hole. */
export function oneMinusAlpha(x: number): number {
  return x / (1 + Math.sqrt(1 - x));
}

/**
 * α at a height h above the horizon, given as h/r_s: √(h/(r_s + h)) — exact at the hover floor
 * (h = 1e-6 r_s), where x = r_s/r rounds away the digits that 1 − x needs.
 */
export function alphaAtHeight(heightOverRs: number): number {
  return Math.sqrt(heightOverRs / (1 + heightOverRs));
}

/**
 * The chronometer's lag rate 1 − α/cosh φ = x/(1 + α) + α·2 sinh²(φ/2)/cosh φ, with φ the ship's rapidity
 * relative to S (home's frame), not to the hole: both terms are ≥ 0 and formed without cancellation.
 */
export function lagRateGravity(x: number, phiS: number): number {
  const a = Math.sqrt(1 - x);
  const sh = Math.sinh(0.5 * phiS);
  return x / (1 + a) + (a * 2 * sh * sh) / Math.cosh(phiS);
}

/** r_s = 2GM/c², km, from GM in km³/s². */
function rsKm(gmKm3S2: number): number {
  return (2 * gmKm3S2) / (C_KM_S * C_KM_S);
}

/** Proper acceleration to hover at r: GM/(r² α), km/s² (α from r − r_s, exact near the horizon). */
export function hoverAccelKmS2(gmKm3S2: number, rKm: number): number {
  const alpha = Math.sqrt((rKm - rsKm(gmKm3S2)) / rKm);
  return gmKm3S2 / (rKm * rKm * alpha);
}

/**
 * Proper acceleration of a ship moving at constant velocity (radial w_r, tangential w_t, in c, relative to the
 * static observers) at r: |a| = γ² √((a_s − w_t² α c²/r)² + (w_r w_t α c²/r)² − w_r² a_s²), a_s = GM/(r²α);
 * km/s². Radial motion gives γ a_s; the circular geodesic, w_t² = M/(r − 2M), gives 0 (derived
 * from the static frame's rotation coefficients).
 */
export function properAccelKmS2(gmKm3S2: number, rKm: number, wr: number, wt: number): number {
  const alpha = Math.sqrt((rKm - rsKm(gmKm3S2)) / rKm);
  const as = gmKm3S2 / (rKm * rKm * alpha);
  const k = (C_KM_S * C_KM_S * alpha) / rKm;
  const g2 = 1 / ((1 - wr * wr) - wt * wt);
  const radial = as - wt * wt * k;
  const cross = wr * wt * k;
  const sum = radial * radial + cross * cross - wr * wr * as * as;
  return g2 * Math.sqrt(Math.max(0, sum));
}

/** Radial tidal stretch across `lengthM` metres at r: 2GM·L/r³, m/s² (km³/s² over km³, times m). */
export function tidalStretchMS2(gmKm3S2: number, rKm: number, lengthM: number): number {
  return (2 * gmKm3S2 * lengthM) / (rKm * rKm * rKm);
}

/** Radius where the tidal stretch across `lengthM` (2 m) reaches `limitMS2` (1,000 m/s²): (2GM L/limit)^{1/3}, km. */
export function tidalEndRadiusKm(gmKm3S2: number, lengthM = 2, limitMS2 = 1000): number {
  return Math.cbrt((2 * gmKm3S2 * lengthM) / limitMS2);
}

/** How a radial fall starts: from rest far away (rain, e = 1), let go from rest at r0 (drip, e < 1), or thrown in (hail, e > 1). */
export type FallKind = 'rain' | 'drip' | 'hail';

/** State of a radial fall at proper time τ. Lengths in units of M, times in seconds. */
export interface FallState {
  tau: number;
  r: number;
  /** dr/dτ (units of M per second), negative. */
  drdtau: number;
  /** Painlevé–Gullstrand time elapsed since the start of the fall, s ("home, on the free-fallers' clocks"). */
  T: number;
  /** dT/dτ = γ relative to the local raindrop. */
  dTdTau: number;
  /** Rapidity relative to the raindrop, positive outward (drip: ≥ 0; rain: 0; hail: ≤ 0). */
  phiRelRain: number;
  /** Rapidity relative to the static observer, positive inward (r > 2 only; NaN inside). */
  phiInStatic: number;
  inside: boolean;
}

/** A radial fall, evaluated at any proper time. */
export interface RadialFall {
  kind: FallKind;
  /** Conserved energy per unit rest energy. */
  e: number;
  r0: number;
  rEnd: number;
  /** GM/c³, s: converts units of M to seconds. */
  mTimeS: number;
  tauHorizon: number;
  tauEnd: number;
  /** Drip: T(τ) is tabulated in the cycloid parameter η (dense at the horizon and the end); rain and hail are closed forms. */
  stateAt(tau: number, out: FallState): FallState;
  tauAtR(r: number): number;
}

/** Samples of the drip's and hail's T − τ table. */
export const FALL_TABLE_SAMPLES = 2000;

/** Eight-point Gauss–Legendre nodes and weights on [−1, 1]. */
const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/**
 * γ − 1 for the energy e at x = 2/r, without cancellation: q²(x + e²)/((√x + e w)(√x + w)(1 + e)(e + √x w)),
 * q = 1 − e², w = √(x − q) (= −dr/dτ in units of c). Exact: γ − 1 = ((e² + x) − (e + √x w))/(e + √x w), whose
 * numerator is q²(x + e²)/((√x + e w)(√x + w)(1 + e)).
 */
function gammaMinusOne(e: number, q: number, x: number, w: number): number {
  const sx = Math.sqrt(x);
  return (q * q * (x + e * e)) / ((sx + e * w) * (sx + w) * (1 + e) * (e + sx * w));
}

/**
 * ζ − sin ζ without cancellation for small ζ (the series to ζ¹³ below 0.5, relative error under 1e-17), and
 * its inverse by Newton from (6w)^{1/3}: the end of a drip, η = π − ζ.
 */
function zetaMinusSin(z: number): number {
  if (z > 0.5) return z - Math.sin(z);
  const z2 = z * z;
  // z³/6 − z⁵/120 + z⁷/5040 − z⁹/362880 + z¹¹/39916800 − z¹³/6227020800
  return ((z * z2) / 6) * (1 - (z2 / 20) * (1 - (z2 / 42) * (1 - (z2 / 72) * (1 - (z2 / 110) * (1 - z2 / 156)))));
}

function zetaOfW(w: number): number {
  if (!(w > 0)) return 0;
  let z = Math.cbrt(6 * w);
  if (z > Math.PI) z = Math.PI;
  for (let k = 0; k < 60; k++) {
    const f = zetaMinusSin(z) - w;
    const fp = z > 0.5 ? 1 - Math.cos(z) : 2 * Math.sin(0.5 * z) * Math.sin(0.5 * z);
    const dz = f / fp;
    z -= dz;
    if (Math.abs(dz) <= 1e-16 * z) break;
  }
  return z;
}

/**
 * The fall's closed forms: rain r^{3/2} = r0^{3/2} − (3/√2)τ with T = τ; the drip's cycloid and hail's cosh
 * form with T − τ tabulated in η. opts: r0 where the fall starts (units of M), e its energy
 * (α0 = √(1 − 2/r0) for a drip from rest at r0), rEnd where it ends (units of M), mTimeS = GM/c³ in seconds.
 */
export function radialFall(opts: { r0: number; e: number; rEnd: number; mTimeS: number }): RadialFall {
  const { r0, rEnd, mTimeS } = opts;
  let e = opts.e;
  if (Math.abs(e - 1) < 1e-15) return rainFall(r0, rEnd, mTimeS);
  let q = (1 - e) * (1 + e);
  if (e < 1) {
    // from rest at r0 whenever e is α0 to its rounding: then R = r0 exactly and q = 2/r0
    if (Math.abs(q * r0 - 2) < 1e-9) {
      q = 2 / r0;
      e = Math.sqrt((r0 - 2) / r0);
    }
    return cycloidFall(r0, e, q, rEnd, mTimeS);
  }
  return hailFall(r0, e, q, rEnd, mTimeS);
}

/** Rain: from rest at infinity. Proper time in units of M: τ(r) = (√2/3)(r0^{3/2} − r^{3/2}); T = τ. */
function rainFall(r0: number, rEnd: number, mTimeS: number): RadialFall {
  const k = Math.SQRT2 / 3;
  const c0 = r0 * Math.sqrt(r0);
  const tauAtRM = (r: number) => k * (c0 - r * Math.sqrt(r));
  const tauEndM = tauAtRM(rEnd);
  return {
    kind: 'rain',
    e: 1,
    r0,
    rEnd,
    mTimeS,
    tauHorizon: tauAtRM(2) * mTimeS,
    tauEnd: tauEndM * mTimeS,
    tauAtR: (r: number) => tauAtRM(r) * mTimeS,
    stateAt(tau: number, out: FallState): FallState {
      const tM = Math.min(Math.max(tau / mTimeS, 0), tauEndM);
      const r = Math.pow(c0 - tM / k, 2 / 3);
      const x = 2 / r;
      out.tau = tM * mTimeS;
      out.r = r;
      out.drdtau = -Math.sqrt(x) / mTimeS;
      out.T = out.tau;
      out.dTdTau = 1;
      out.phiRelRain = 0;
      // inward past the static observers at √x: φ = ln((1 + √x)/α), α = √((r − 2)/r)
      out.phiInStatic = r > 2 ? Math.log((1 + Math.sqrt(x)) / Math.sqrt((r - 2) / r)) : NaN;
      out.inside = r < 2;
      return out;
    },
  };
}

/**
 * The T − τ table of a drip or of hail: samples uniform in a variable σ of the cycloid's parameter η, with T − τ
 * (units of M) and its derivative in σ at each, the integral taken interval by interval with eight-point
 * Gauss–Legendre. For a drip σ = ln(1 + η/(2e)): uniform in η when e is near 1 (a drip from far out), and
 * logarithmic at the start when e is small (let go just above the horizon, where γ = 1/e at the start falls to
 * about half within η ~ 2e: e = 1e-3 at the hover floor); for hail σ = η.
 */
interface FallTable {
  s0: number;
  ds: number;
  n: number;
  /** η = c (e^σ − 1) with c = 2e (drip), or η = σ (hail: c = 0). */
  c: number;
  lag: Float64Array;
  dlag: Float64Array;
}

/** Registers of the falls' read-back (one call at a time, so stateAt allocates nothing). */
const FR = new Float64Array(8);
const FR_ETA = 0;
const FR_LAG = 1;

const sigmaOf = (t: { c: number }, eta: number): number => (t.c > 0 ? Math.log1p(eta / t.c) : eta);
const etaOfSigma = (t: { c: number }, s: number): number => (t.c > 0 ? t.c * Math.expm1(s) : s);
/** dη/dσ. */
const detaDsigma = (t: { c: number }, s: number): number => (t.c > 0 ? t.c * Math.exp(s) : 1);

function buildTable(etaStart: number, etaStop: number, c: number, dLagDEta: (eta: number) => number): FallTable {
  const n = FALL_TABLE_SAMPLES;
  const map = { c };
  const s0 = sigmaOf(map, etaStart);
  const s1 = sigmaOf(map, etaStop);
  const ds = (s1 - s0) / (n - 1);
  const lag = new Float64Array(n);
  const dlag = new Float64Array(n);
  const dLagDs = (s: number) => dLagDEta(etaOfSigma(map, s)) * detaDsigma(map, s);
  dlag[0] = dLagDs(s0);
  for (let i = 1; i < n; i++) {
    const a = s0 + (i - 1) * ds;
    let sum = 0;
    for (let k = 0; k < 8; k++) sum += GL_W[k] * dLagDs(a + 0.5 * ds * (GL_X[k] + 1));
    lag[i] = lag[i - 1] + 0.5 * ds * sum;
    dlag[i] = dLagDs(s0 + i * ds);
  }
  return { s0, ds, n, c, lag, dlag };
}

/** Cubic Hermite in σ through the table's samples, with their exact derivatives: FR[FR_ETA] → FR[FR_LAG]. */
function tableAt(t: FallTable): void {
  const s = t.c > 0 ? Math.log1p(FR[FR_ETA] / t.c) : FR[FR_ETA];
  let x = (s - t.s0) / t.ds;
  if (x < 0) x = 0;
  if (x > t.n - 1) x = t.n - 1;
  let i = Math.floor(x);
  if (i > t.n - 2) i = t.n - 2;
  const u = x - i;
  const u2 = u * u;
  const u3 = u2 * u;
  FR[FR_LAG] = (2 * u3 - 3 * u2 + 1) * t.lag[i] + (u3 - 2 * u2 + u) * t.ds * t.dlag[i] + (3 * u2 - 2 * u3) * t.lag[i + 1] + (u3 - u2) * t.ds * t.dlag[i + 1];
}

/**
 * The drip (e < 1): r = R cos²(η/2), τ = K(η + sin η) − τ_start, K = √(R³/8), R = 2/q; from η_start (0 when let
 * go from rest at r0 = R) to π; dr/dτ = −√q tan(η/2); w = √q tan(η/2); T − τ tabulated in σ = ln(1 + η/(2e)).
 */
function cycloidFall(r0: number, e: number, q: number, rEnd: number, mTimeS: number): RadialFall {
  const R = 2 / q;
  const K = Math.sqrt((R * R * R) / 8);
  const sq = Math.sqrt(q);
  // η at radius r: cos(η/2) = √(r/R), sin(η/2) = √((R − r)/R)
  const etaAtR = (r: number) => 2 * Math.atan2(Math.sqrt(Math.max(R - r, 0)), Math.sqrt(r));
  const etaStart = r0 >= R ? 0 : etaAtR(r0);
  const tauStart = K * (etaStart + Math.sin(etaStart));
  // τ (units of M, from the start) at η; near the end through ζ = π − η without cancellation
  const tauAtEta = (eta: number) => (eta < 2.5 ? K * (eta + Math.sin(eta)) - tauStart : K * (Math.PI - zetaMinusSin(Math.PI - eta)) - tauStart);
  const etaEnd = etaAtR(rEnd);
  const dLag = (eta: number) => {
    const c = Math.cos(0.5 * eta);
    const r = R * c * c;
    const x = 2 / r;
    const w = sq * Math.tan(0.5 * eta);
    return gammaMinusOne(e, q, x, w) * K * 2 * c * c;
  };
  const table = buildTable(etaStart, Math.PI, 2 * e, dLag);
  const tauEndM = tauAtEta(etaEnd);
  const tauTotal = K * Math.PI - tauStart;
  /** η from τ (units of M from the start) into FR[FR_ETA]: Newton on K(η + sin η) = τ + τ_start, near the end on ζ − sin ζ. */
  const etaAtTau = (tM: number): void => {
    const s = (tM + tauStart) / K;
    const w = Math.PI - s;
    if (w < 0.5) {
      FR[FR_ETA] = Math.PI - zetaOfW(w);
      return;
    }
    let eta = etaStart + (Math.PI - etaStart) * Math.min(1, Math.max(0, tM / tauTotal));
    for (let k = 0; k < 60; k++) {
      const f = eta + Math.sin(eta) - s;
      const fp = 1 + Math.cos(eta);
      let next = eta - f / fp;
      if (next < 0) next = 0.5 * eta;
      if (next > Math.PI) next = 0.5 * (eta + Math.PI);
      const d = next - eta;
      eta = next;
      if (Math.abs(d) <= 1e-16 * Math.max(1, eta)) break;
    }
    FR[FR_ETA] = eta;
  };
  return {
    kind: 'drip',
    e,
    r0,
    rEnd,
    mTimeS,
    tauHorizon: tauAtEta(etaAtR(2)) * mTimeS,
    tauEnd: tauEndM * mTimeS,
    tauAtR: (r: number) => tauAtEta(etaAtR(r)) * mTimeS,
    stateAt(tau: number, out: FallState): FallState {
      const tM = Math.min(Math.max(tau / mTimeS, 0), tauEndM);
      etaAtTau(tM);
      tableAt(table);
      const eta = FR[FR_ETA];
      const c = Math.cos(0.5 * eta);
      const r = R * c * c;
      const x = 2 / r;
      const w = sq * Math.tan(0.5 * eta);
      const sx = Math.sqrt(x);
      // γ − 1 (gammaMinusOne, written out: a call would box its result)
      const gm1 = (q * q * (x + e * e)) / ((sx + e * w) * (sx + w) * (1 + e) * (e + sx * w));
      out.tau = tM * mTimeS;
      out.r = r;
      out.drdtau = -w / mTimeS;
      out.T = (tM + FR[FR_LAG]) * mTimeS;
      out.dTdTau = 1 + gm1;
      // outward against the raindrop: sinh φ = √((γ − 1)(γ + 1))
      out.phiRelRain = Math.asinh(Math.sqrt(gm1 * (2 + gm1)));
      out.phiInStatic = r > 2 ? Math.log((e + w) / Math.sqrt((r - 2) / r)) : NaN;
      out.inside = r < 2;
      return out;
    },
  };
}

/**
 * Hail (e > 1, thrown in at r0): r = A(cosh η − 1), τ = A^{3/2}[(sinh η_start − η_start) − (sinh η − η)],
 * A = 1/(e² − 1), η falling from η_start to 0; w = √(e² − 1 + x); T − τ tabulated in η. Not offered in the app.
 */
function hailFall(r0: number, e: number, q: number, rEnd: number, mTimeS: number): RadialFall {
  const A = -1 / q;
  const K = A * Math.sqrt(A);
  // sinh η − η without cancellation for small η
  const shm = (eta: number) => {
    if (eta > 0.5) return Math.sinh(eta) - eta;
    const e2 = eta * eta;
    return ((eta * e2) / 6) * (1 + (e2 / 20) * (1 + (e2 / 42) * (1 + (e2 / 72) * (1 + (e2 / 110) * (1 + e2 / 156)))));
  };
  const etaAtR = (r: number) => Math.acosh(1 + r / A);
  const etaStart = etaAtR(r0);
  const s0 = shm(etaStart);
  const tauAtEta = (eta: number) => K * (s0 - shm(eta));
  const etaEnd = etaAtR(rEnd);
  const dLag = (eta: number) => {
    const r = A * (Math.cosh(eta) - 1);
    const x = 2 / r;
    const w = Math.sqrt(x - q);
    // dτ/dη = −K (cosh η − 1); the table runs from η_start down to 0
    return -gammaMinusOne(e, q, x, w) * K * (Math.cosh(eta) - 1);
  };
  const table = buildTable(etaStart, 0, 0, dLag);
  const tauEndM = tauAtEta(etaEnd);
  const tauAll = tauAtEta(0);
  const etaAtTau = (tM: number): void => {
    const target = s0 - tM / K;
    let eta = Math.max(0, etaStart * (1 - tM / Math.max(tauAll, 1e-300)));
    for (let k = 0; k < 80; k++) {
      const f = shm(eta) - target;
      const fp = Math.cosh(eta) - 1;
      if (!(fp > 0)) {
        eta = Math.cbrt(6 * Math.max(target, 0));
        continue;
      }
      let next = eta - f / fp;
      if (next < 0) next = 0.5 * eta;
      const d = next - eta;
      eta = next;
      if (Math.abs(d) <= 1e-16 * Math.max(1, eta)) break;
    }
    FR[FR_ETA] = eta;
  };
  return {
    kind: 'hail',
    e,
    r0,
    rEnd,
    mTimeS,
    tauHorizon: tauAtEta(etaAtR(2)) * mTimeS,
    tauEnd: tauEndM * mTimeS,
    tauAtR: (r: number) => tauAtEta(etaAtR(r)) * mTimeS,
    stateAt(tau: number, out: FallState): FallState {
      const tM = Math.min(Math.max(tau / mTimeS, 0), tauEndM);
      etaAtTau(tM);
      tableAt(table);
      const eta = FR[FR_ETA];
      const r = A * (Math.cosh(eta) - 1);
      const x = 2 / r;
      const w = Math.sqrt(x - q);
      const sx = Math.sqrt(x);
      const gm1 = (q * q * (x + e * e)) / ((sx + e * w) * (sx + w) * (1 + e) * (e + sx * w));
      out.tau = tM * mTimeS;
      out.r = r;
      out.drdtau = -w / mTimeS;
      out.T = (tM + FR[FR_LAG]) * mTimeS;
      out.dTdTau = 1 + gm1;
      // inward against the raindrop
      out.phiRelRain = -Math.asinh(Math.sqrt(gm1 * (2 + gm1)));
      out.phiInStatic = r > 2 ? Math.log((e + w) / Math.sqrt((r - 2) / r)) : NaN;
      out.inside = r < 2;
      return out;
    },
  };
}

/** A circular geodesic orbit. */
export interface CircularOrbit {
  r: number;
  /** Speed relative to the static observer, v = √(1/(r − 2)). */
  vRelStatic: number;
  rapidity: number;
  /** dτ/dt = √(1 − 3/r). */
  dtaudt: number;
  /** Coordinate angular velocity √(1/r³), rad per second (via mTimeS). */
  omegaRadPerS: number;
  periodCoordS: number;
  periodProperS: number;
}

/**
 * A circular orbit at r > 3 (stable for r ≥ 6; units of M): speed past the static observers √(M/(r − 2M)),
 * clock rate √(1 − 3M/r), coordinate angular velocity √(M/r³).
 */
export function circularOrbit(r: number, mTimeS: number): CircularOrbit {
  const v = 1 / Math.sqrt(r - 2);
  const dtaudt = Math.sqrt((r - 3) / r);
  const omega = 1 / (r * Math.sqrt(r) * mTimeS);
  const period = (2 * Math.PI) / omega;
  return { r, vRelStatic: v, rapidity: Math.atanh(v), dtaudt, omegaRadPerS: omega, periodCoordS: period, periodProperS: period * dtaudt };
}

/**
 * The ship's rapidity and unit direction relative to a frame moving with `frameVelKmS` (both in S), from the
 * ship's rapidity φ_s and unit direction in S (exact at any γ: 4-velocities in rapidity form, float64). Writes
 * `out` and returns it. In orbit about a hole (ship velocity = the hole's) φ = 0.
 * The ship's 4-velocity (cosh φ, sinh φ n̂) seen from the frame (rapidity φ_f along n̂_f) has spatial part
 * sinh φ n̂ − [sinh φ_f cosh φ − 2 sinh²(φ_f/2) sinh φ (n̂·n̂_f)] n̂_f; φ = asinh of its length.
 */
export function relativeRapidity(phiShip: number, dirShip: Vec3, frameVelKmS: Vec3, out: { phi: number; dir: Vec3 }): { phi: number; dir: Vec3 } {
  const vx = frameVelKmS.x;
  const vy = frameVelKmS.y;
  const vz = frameVelKmS.z;
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const sp = Math.sinh(phiShip);
  let ux = sp * dirShip.x;
  let uy = sp * dirShip.y;
  let uz = sp * dirShip.z;
  if (speed > 0) {
    const phiF = Math.atanh(speed / C_KM_S);
    const fx = vx / speed;
    const fy = vy / speed;
    const fz = vz / speed;
    const shh = Math.sinh(0.5 * phiF);
    const nf = dirShip.x * fx + dirShip.y * fy + dirShip.z * fz;
    const b = Math.sinh(phiF) * Math.cosh(phiShip) - 2 * shh * shh * sp * nf;
    ux -= b * fx;
    uy -= b * fy;
    uz -= b * fz;
  }
  const len = Math.sqrt(ux * ux + uy * uy + uz * uz);
  out.phi = Math.asinh(len);
  if (len > 0) {
    out.dir.x = ux / len;
    out.dir.y = uy / len;
    out.dir.z = uz / len;
  }
  return out;
}
