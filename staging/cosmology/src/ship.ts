// A relativistic rocket in a flat FLRW universe (see cosmology.md, "The ship", for the derivation).
//
// Metric ds^2 = -c^2 dt^2 + a(t)^2 (dchi^2 + chi^2 dOmega^2); the ship moves along a straight radial line
// in comoving coordinates. u = gamma v_pec / c is its peculiar four-velocity relative to the local
// comoving observers and w = asinh(u) the matching rapidity. With proper acceleration A along the path
// (A > 0 pushes away from home) and ship proper time tau:
//
//   dw/dtau   = A/c - H(a) sinh w          (thrust minus "Hubble drag")
//   dt/dtau   = cosh w
//   dchi/dtau = c sinh w / a               (comoving distance, a = 1 today)
//   dln a/dtau = H(a) cosh w
//
// Equivalently d(a u)/dt = a A/c: with the engine off, a u is conserved (peculiar momentum decays as
// 1/a), and with constant A, a u - a0 u0 = (A/c) int a dt. The integrator carries K = int (a/a_dep) dt
// as an extra state so that this identity can be checked on every trip.
//
// It also carries the light lag L = eta - chi (conformal time since departure minus comoving distance
// covered), dL/dtau = c (cosh w - sinh w) / a = c e^-w / a. L measures, without cancellation, how far
// the ship trails a light signal sent from home at departure:
//   - the light from home that reaches the ship left home at conformal time eta_dep + L, so the home
//     clock the traveller sees through a telescope follows from L alone;
//   - chi_EH(a_dep) - chi = chi_EH(a) + L exactly, so a target close to the cosmic event horizon is
//     planned from two small, precisely known numbers instead of the difference of two large ones.
//
// Integration is dimensionless: time unit t_u = c/A_ref (0.969 yr at 1 g), length unit c t_u, and
// eps = t_u H(a) (6.7e-11 today at 1 g). Thrust phases run in the ship's proper time sigma = tau/t_u,
// except where a rapidity-bounded phase ends: the deceleration (and the cruise's acceleration) uses the
// rapidity itself as the independent variable, so "arrive at rest" is hit exactly, with no event search.
//
// Numerics: Dormand-Prince 5(4), rtol 1e-12 by default; Brent's method for the flip time.

import { C_KM_S, C_M_S, G0_M_S2, MPC_KM, MPC_LY, YEAR_S } from './constants.ts';
import { Cosmology } from './cosmology.ts';
import { checkpointIndex, dopri5, type Rhs } from './ode.ts';
import { brent } from './rootfind.ts';

/** State layout: rapidity, ln(a/a_dep), cosmic time since departure, comoving distance, K = int (a/a_dep) dt, light lag L. */
export const IW = 0;
export const IX = 1;
export const IT = 2;
export const ICHI = 3;
export const IK = 4;
export const IL = 5;
/** Length of the state vector. */
export const NSTATE = 6;

/** Largest flip time tried (in units of c/A): ln a would reach ~400 before this. */
const S_CAP = 400;
/** A trip is not followed beyond ln(a/a_dep) = 550 (the universe has grown by e^550 = 1e239 by then). */
const LN_A_MAX = 550;

/**
 * Smallest proper acceleration the planners accept: 1e-6 g (9.8e-6 m/s^2, a weak ion drive). Below about
 * 5e-11 g the Hubble time is shorter than c/A and the engine cannot even reach u = 1 against the Hubble
 * drag; the integration variables are scaled for engines that can.
 */
export const MIN_ACCEL_M_S2 = 1e-6 * G0_M_S2;
/** Departure scale factors the planners accept (z = 9999 to a million times today's size). */
export const DEPARTURE_SCALE_MIN = 1e-4;
export const DEPARTURE_SCALE_MAX = 1e6;

export interface ShipFrame {
  cosmo: Cosmology;
  /** Scale factor at departure. */
  aDep: number;
  /** Reference proper acceleration, m/s^2. */
  accel: number;
  /** Time unit c/A, s. */
  tu: number;
  /** t_u H0: eps(a) = epsScale * E(a). */
  epsScale: number;
  /** Length unit c t_u, Mpc. */
  chiUnitMpc: number;
  rtol: number;
}

export function makeFrame(cosmo: Cosmology, aDep: number, accel: number, rtol = 1e-12): ShipFrame {
  const tu = C_M_S / accel;
  const hubbleTimeS = MPC_KM / cosmo.params.H0;
  return { cosmo, aDep, accel, tu, epsScale: tu / hubbleTimeS, chiUnitMpc: (C_KM_S * tu) / MPC_KM, rtol };
}

/** Thrust in units of A_ref: a constant, or 'hold' (whatever keeps u constant against the Hubble drag). */
export type Thrust = number | 'hold';

/** Right-hand side with the ship's proper time (units t_u) as independent variable. */
export function rhsProper(fr: ShipFrame, thrust: Thrust): Rhs {
  const { cosmo, aDep, epsScale } = fr;
  return (_s, y, dy) => {
    const w = y[IW];
    const ex = Math.exp(y[IX]);
    const a = aDep * ex;
    const eps = epsScale * cosmo.E(a);
    const sh = Math.sinh(w);
    const ch = Math.cosh(w);
    dy[IW] = thrust === 'hold' ? 0 : thrust - eps * sh;
    dy[IX] = eps * ch;
    dy[IT] = ch;
    dy[ICHI] = sh / a;
    dy[IK] = ex * ch;
    dy[IL] = Math.exp(-w) / a;
  };
}

/**
 * Right-hand side with the rapidity as independent variable, for a phase of constant thrust +-1 during
 * which w changes monotonically. Independent variable v runs from 0: w = v when accelerating from rest,
 * w = wStart - v when decelerating. State: [sigma, ln(a/a_dep), T, chi, K, L].
 */
export function rhsRapidity(fr: ShipFrame, thrust: 1 | -1, wStart: number): Rhs {
  const { cosmo, aDep, epsScale } = fr;
  return (v, y, dy) => {
    const w = thrust > 0 ? v : wStart - v;
    const ex = Math.exp(y[1]);
    const a = aDep * ex;
    const eps = epsScale * cosmo.E(a);
    const sh = Math.sinh(w);
    const ch = Math.cosh(w);
    const g = thrust > 0 ? 1 - eps * sh : 1 + eps * sh; // |dw/dsigma|
    dy[0] = 1 / g;
    dy[1] = (eps * ch) / g;
    dy[2] = ch / g;
    dy[3] = sh / (a * g);
    dy[4] = (ex * ch) / g;
    dy[5] = Math.exp(-w) / (a * g);
  };
}

/** A proper-time leg that caches its accepted steps, so the state at any sigma costs one short integration. */
class ProperTimeLeg {
  private xs: number[];
  private ys: Float64Array[];
  private h: number;
  private readonly rhs: Rhs;
  private readonly fr: ShipFrame;
  constructor(fr: ShipFrame, thrust: Thrust, y0: Float64Array, s0: number) {
    this.fr = fr;
    this.rhs = rhsProper(fr, thrust);
    this.xs = [s0];
    this.ys = [Float64Array.from(y0)];
    this.h = 0.05;
  }
  at(s: number): Float64Array {
    const last = this.xs.length - 1;
    const x0 = this.xs[last];
    if (s > x0) {
      const r = dopri5(this.rhs, x0, this.ys[last], s, { rtol: this.fr.rtol, h0: Math.min(this.h, s - x0), record: true });
      const cp = r.checkpoints!;
      for (let i = 1; i < cp.x.length; i++) {
        this.xs.push(cp.x[i]);
        this.ys.push(cp.y[i]);
      }
      this.h = r.h || this.h;
      return r.y;
    }
    // binary search for the last checkpoint <= s
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.xs[m] <= s) lo = m;
      else hi = m;
    }
    if (this.xs[lo] === s) return Float64Array.from(this.ys[lo]);
    const r = dopri5(this.rhs, this.xs[lo], this.ys[lo], s, { rtol: this.fr.rtol, h0: s - this.xs[lo] });
    return r.y;
  }
}

/**
 * Decelerate at A from state y (proper-time layout) at sigma = s until at rest. Returns the arrival
 * state; its K component restarts from 0 at the start of this leg (it only serves the a*u check).
 * With chiFromZero the comoving distance is counted from 0 (the distance covered while braking alone).
 */
function decelerate(fr: ShipFrame, y: Float64Array, s: number, chiFromZero = false): { s: number; y: Float64Array } {
  const w0 = y[IW];
  const chi0 = chiFromZero ? 0 : y[ICHI];
  if (!(w0 > 0)) {
    const out = Float64Array.from(y);
    out[ICHI] = chi0;
    return { s, y: out };
  }
  const r = dopri5(rhsRapidity(fr, -1, w0), 0, [s, y[IX], y[IT], chi0, 0, y[IL]], w0, { rtol: fr.rtol, h0: w0 / 64 });
  return { s: r.y[0], y: Float64Array.from([0, r.y[1], r.y[2], r.y[3], r.y[4], r.y[5]]) };
}

/** Accelerate at A from rest until the rapidity reaches wEnd (must stay below the drag limit). */
function accelerateTo(fr: ShipFrame, wEnd: number): { s: number; y: Float64Array } {
  const r = dopri5(rhsRapidity(fr, 1, 0), 0, [0, 0, 0, 0, 0, 0], wEnd, { rtol: fr.rtol, h0: wEnd / 64 });
  return { s: r.y[0], y: Float64Array.from([wEnd, r.y[1], r.y[2], r.y[3], r.y[4], r.y[5]]) };
}

/** Comoving event horizon at ln a = l, in ship length units (c t_u), to full float64 precision. */
function horizonUnits(fr: ShipFrame, l: number): number {
  const c = fr.cosmo;
  return (c.eventHorizonPreciseLn(l) * c.dH) / fr.chiUnitMpc;
}

/**
 * Cosmic time (in units of t_u) between departure and the moment home emitted the light that trails the
 * ship by the lag L (units c t_u): the light left home at conformal time eta_dep + L. Exact, no cancellation.
 */
function lagToHomeDt(fr: ShipFrame, L: number): number {
  if (!(L > 0)) return 0;
  const c = fr.cosmo;
  const lDep = Math.log(fr.aDep);
  const span = c.arrivalSpanLn(lDep, (L * fr.chiUnitMpc) / c.dH);
  if (!Number.isFinite(span)) return Infinity;
  return (c.timeAfterLn(lDep, span) * (MPC_KM / c.params.H0)) / fr.tu;
}

/**
 * Light lag of a ship that accelerates at A for ever (units c t_u): the absolute limit of reach is this
 * far inside the event horizon at departure. About c^2/A / a_dep (0.9687 ly at 1 g today). Converged
 * to 1e-15 by doubling the burn time.
 */
function lagLimit(leg: ProperTimeLeg): number {
  let s = 25;
  let prev = leg.at(s)[IL];
  while (2 * s <= S_CAP) {
    const y = leg.at(2 * s);
    s *= 2;
    const L = y[IL];
    if (Math.abs(L - prev) <= 1e-15 * L || y[IX] > LN_A_MAX / 2) return L;
    prev = L;
  }
  return prev;
}

// ------------------------------------------------------------------------------------ results

export interface TrajectorySamples {
  /** Ship proper time since departure, yr. The flip (and cruise boundaries) appear twice, once per side. */
  tauYr: Float64Array;
  /** Cosmic time since departure, yr. */
  dtYr: Float64Array;
  /** Comoving distance from home, Mpc (a = 1 today). */
  chiMpc: Float64Array;
  /** Peculiar four-velocity gamma*beta relative to the local comoving observers. */
  u: Float64Array;
  /** ln a. */
  lnA: Float64Array;
  /** Derivatives with respect to tauYr, for cubic Hermite playback. */
  dDt: Float64Array;
  dChi: Float64Array;
  dU: Float64Array;
  dLnA: Float64Array;
}

export interface Phase {
  kind: 'accelerate' | 'cruise' | 'decelerate';
  thrust: Thrust;
  /** Proper-time range, units of c/A (internal) and years. */
  s0: number;
  s1: number;
  startTauYr: number;
  endTauYr: number;
  /** Checkpoints of the sampling integration (sigma, state), for exact re-integration. */
  cpS: Float64Array;
  cpY: Float64Array[];
}

export type UnreachableReason =
  | 'beyond-event-horizon'
  | 'ship-time-limit'
  | 'beyond-reach'
  | 'beyond-reach-at-cruise-speed'
  | 'cruise-speed-unattainable'
  | 'invalid-input'
  | 'numerical-failure';

export interface Unreachable {
  ok: false;
  reason: UnreachableReason;
  message: string;
  targetChiMpc: number;
  /** Comoving event horizon at departure, Mpc: nothing at or beyond it can ever be reached. */
  eventHorizonMpc: number;
  /** Furthest comoving distance reachable under the stated limit (ship-time or cruise speed), Mpc. */
  maxChiMpc?: number;
  maxShipTimeYr?: number;
  /** Largest peculiar u the engine can reach or hold at departure (A / (c H)). */
  maxU?: number;
}

export interface TripPlan {
  ok: true;
  model: 'flrw' | 'static';
  profile: 'flip-and-burn' | 'cruise';
  /** Proper acceleration during the burns, m/s^2. */
  accel: number;
  /** Destination: comoving distance (FLRW, a = 1 today) or fixed distance (static), Mpc. */
  chiMpc: number;
  departure: { scale: number; timeGyr: number };
  arrival: {
    scale: number;
    timeGyr: number;
    /** a_arrival / a_departure - 1: how much the universe stretched during the trip. */
    stretch: number;
    /** Proper distance home -> destination at arrival, Mpc. */
    properDistanceMpc: number;
    cmbTemperatureK: number;
  };
  shipTimeYr: number;
  cosmicTimeYr: number;
  peakGamma: number;
  peakU: number;
  /** Rapidity at the peak (exact at any speed; beta = tanh). */
  peakRapidity: number;
  /**
   * Home (comoving at chi = 0) as seen by the traveller on arrival: the redshift and scale factor of the
   * light arriving from home, and when it left. emissionAfterDepartureYr is that emission time counted
   * from departure on the home clock, computed from the light lag without cancellation.
   */
  home: { redshift: number; emissionScale: number; emissionTimeGyr: number; emissionAfterDepartureYr: number };
  /** The destination as seen from home at departure (null if outside the particle horizon). */
  destinationSeenAtDeparture: { redshift: number; emissionTimeGyr: number } | null;
  eventHorizonAtDepartureMpc: number;
  phases: Phase[];
  samples: TrajectorySamples;
  diagnostics: {
    /** |a u - a0 u0 - (A/c) int a dt| relative, worst over the thrust phases. */
    conservation: number;
    /** Cosmic time from the ODE vs the cosmology table's t(a_arr) - t(a_dep), relative. */
    tableTime: number;
    rootIterations: number;
  };
  /** Cruise-specific values. */
  cruise?: { u: number; gamma: number; reached: boolean; holdThrustAtStartG: number; holdThrustAtEndG: number };
  /** Internal: the frame used (needed by stateAtShipTime). */
  frame?: ShipFrame;
}

export interface PlanOptions {
  /** Proper acceleration, m/s^2 (default 1 g = 9.80665; at least MIN_ACCEL_M_S2 = 1e-6 g). */
  accel?: number;
  /** Scale factor at departure (default 1, today; DEPARTURE_SCALE_MIN to DEPARTURE_SCALE_MAX). */
  departureScale?: number;
  /** Refuse trips that need more ship time than this, years (default: no limit). */
  maxShipTimeYr?: number;
  /** Relative tolerance of the integrator (default 1e-12). */
  rtol?: number;
  /** Number of evenly spaced playback samples (default 1000). */
  samples?: number;
}

function unreachable(reason: UnreachableReason, message: string, fields: Omit<Unreachable, 'ok' | 'reason' | 'message'>): Unreachable {
  return { ok: false, reason, message, ...fields };
}

/** Shared input validation. Returns a message, or null when the inputs are usable. */
function invalidInput(distanceMpc: number, accel: number, aDep: number, maxShipTimeYr: number | undefined): string | null {
  if (!(distanceMpc > 0) || !Number.isFinite(distanceMpc)) return 'the distance must be a positive, finite number of Mpc';
  if (!(accel >= MIN_ACCEL_M_S2) || !Number.isFinite(accel))
    return `the acceleration must be finite and at least ${MIN_ACCEL_M_S2.toExponential(3)} m/s^2 (1e-6 g)`;
  if (!(aDep >= DEPARTURE_SCALE_MIN && aDep <= DEPARTURE_SCALE_MAX))
    return `the departure scale factor must lie between ${DEPARTURE_SCALE_MIN} and ${DEPARTURE_SCALE_MAX}`;
  if (maxShipTimeYr !== undefined && !(maxShipTimeYr > 0)) return 'the ship-time limit must be positive';
  return null;
}

/** Run a planner body; an integrator or root-finder failure becomes a structured refusal instead of an exception. */
function guarded(chiMpc: number, cosmo: Cosmology, aDep: number, body: () => TripPlan | Unreachable): TripPlan | Unreachable {
  try {
    return body();
  } catch (e) {
    let eh = NaN;
    try {
      eh = cosmo.eventHorizonMpc(aDep);
    } catch {
      /* keep NaN */
    }
    return unreachable('numerical-failure', `The trip could not be computed: ${(e as Error).message}`, { targetChiMpc: chiMpc, eventHorizonMpc: eh });
  }
}

// ------------------------------------------------------------------------------------ flip-and-burn

interface Eval {
  s: number;
  yFlip: Float64Array;
  sEnd: number;
  yEnd: Float64Array;
}

/**
 * Flip-and-burn in FLRW: constant proper acceleration A away from home, flip, constant A towards home,
 * arriving at rest relative to the comoving observers at comoving distance chiMpc. The flip time is found
 * with Brent's method (the arrival distance increases monotonically with it). Targets beyond half the
 * event horizon are solved in terms of their distance inside the horizon (chi_EH(a_arr) + L), which keeps
 * full precision right up to the absolute limit of reach.
 */
export function planFlipAndBurn(cosmo: Cosmology, chiMpc: number, opts: PlanOptions = {}): TripPlan | Unreachable {
  const accel = opts.accel ?? G0_M_S2;
  const aDep = opts.departureScale ?? 1;
  const bad = invalidInput(chiMpc, accel, aDep, opts.maxShipTimeYr);
  if (bad) {
    let eh = NaN;
    if (aDep >= DEPARTURE_SCALE_MIN && aDep <= DEPARTURE_SCALE_MAX) eh = cosmo.eventHorizonMpc(aDep);
    return unreachable('invalid-input', bad, { targetChiMpc: chiMpc, eventHorizonMpc: eh });
  }
  return guarded(chiMpc, cosmo, aDep, () => flipAndBurnBody(cosmo, chiMpc, accel, aDep, opts));
}

function flipAndBurnBody(cosmo: Cosmology, chiMpc: number, accel: number, aDep: number, opts: PlanOptions): TripPlan | Unreachable {
  const fr = makeFrame(cosmo, aDep, accel, opts.rtol ?? 1e-12);
  const lDep = Math.log(aDep);
  const ehMpc = cosmo.eventHorizonMpc(aDep);
  if (chiMpc >= ehMpc)
    return unreachable(
      'beyond-event-horizon',
      `The target is ${fmt(chiMpc)} Mpc away (comoving) but the event horizon at departure is ${fmt(ehMpc)} Mpc: not even light sent now can ever get there.`,
      { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc },
    );
  const Xd = chiMpc / fr.chiUnitMpc;
  const ehDep = horizonUnits(fr, lDep);
  // Distance of the target inside the event horizon at departure, in ship units.
  const deltaT = ehDep - Xd;
  const nearHorizon = deltaT < Xd;
  const sMax = opts.maxShipTimeYr !== undefined ? (opts.maxShipTimeYr * YEAR_S) / fr.tu : Infinity;
  const leg = new ProperTimeLeg(fr, 1, new Float64Array(NSTATE), 0);
  if (nearHorizon) {
    const Linf = lagLimit(leg);
    if (deltaT <= Linf * (1 + 1e-12)) return beyondReach(fr, chiMpc, ehMpc, ehDep, Linf, deltaT);
  }
  let iterations = 0;
  // Arrival distance relative to the target (ship units), in the better-conditioned representation.
  const miss = (yEnd: Float64Array) => (nearHorizon ? deltaT - (horizonUnits(fr, lDep + yEnd[IX]) + yEnd[IL]) : yEnd[ICHI] - Xd);
  const evalAt = (s: number): Eval => {
    iterations++;
    const yFlip = leg.at(s);
    const d = decelerate(fr, yFlip, s);
    return { s, yFlip, sEnd: d.s, yEnd: d.y };
  };
  // Flat-space guess from the proper distance at departure: X = 2 (cosh s - 1).
  const dProper = aDep * Xd;
  const sFlat = 2 * Math.asinh(Math.sqrt(dProper / 4));
  let lo = 0;
  let fLo = -Xd;
  let hi = sFlat * (1 + 1e-6) + 1e-12;
  let eHi = evalAt(hi);
  while (miss(eHi.yEnd) < 0) {
    if (eHi.sEnd > sMax) return timeLimited(fr, evalAt, lo, hi, sMax, chiMpc, ehMpc, ehDep);
    if (hi >= S_CAP || eHi.yFlip[IX] > LN_A_MAX) {
      const Linf = lagLimit(leg);
      return beyondReach(fr, chiMpc, ehMpc, ehDep, Linf, deltaT);
    }
    lo = hi;
    fLo = miss(eHi.yEnd);
    hi = Math.min(S_CAP, hi * 1.25 + 0.5);
    eHi = evalAt(hi);
  }
  const fHi = miss(eHi.yEnd);
  const cache = new Map<number, Eval>();
  const sF = brent(
    (s) => {
      const e = evalAt(s);
      cache.set(s, e);
      return miss(e.yEnd);
    },
    lo,
    hi,
    { fa: fLo, fb: fHi, rtol: 1e-15 },
  );
  const best = cache.get(sF) ?? (sF === hi ? eHi : evalAt(sF));
  if (best.sEnd > sMax) return timeLimited(fr, evalAt, 0, sF, sMax, chiMpc, ehMpc, ehDep);
  const yEnd = Float64Array.from(best.yEnd);
  if (nearHorizon) yEnd[ICHI] = ehDep - (horizonUnits(fr, lDep + yEnd[IX]) + yEnd[IL]);
  return buildTrip(fr, chiMpc, [
    { kind: 'accelerate', thrust: 1, s0: 0, s1: best.s, y0: new Float64Array(NSTATE), y1: best.yFlip },
    { kind: 'decelerate', thrust: -1, s0: best.s, s1: best.sEnd, y0: best.yFlip, y1: yEnd },
  ], opts.samples ?? 1000, iterations);
}

function beyondReach(fr: ShipFrame, chiMpc: number, ehMpc: number, ehDep: number, Linf: number, deltaT: number): Unreachable {
  const limitMpc = Linf * fr.chiUnitMpc;
  const ly = (x: number) => fmt(x * MPC_LY);
  return unreachable(
    'beyond-reach',
    `The target lies ${ly(Math.max(0, deltaT) * fr.chiUnitMpc)} light-years inside the event horizon; at ${fmt(fr.accel / G0_M_S2)} g a ship leaving from rest can never get closer to the horizon than ${ly(limitMpc)} light-years (the lag it builds up behind a light signal while accelerating), even with unlimited time.`,
    { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxChiMpc: (ehDep - Linf) * fr.chiUnitMpc },
  );
}

function timeLimited(
  fr: ShipFrame,
  evalAt: (s: number) => Eval,
  lo: number,
  hi: number,
  sMax: number,
  chiMpc: number,
  ehMpc: number,
  ehDep: number,
): Unreachable {
  const s = brent((x) => evalAt(x).sEnd - sMax, 0, Math.max(hi, lo), { rtol: 1e-14 });
  const e = evalAt(s);
  const maxChi = bestArrivalChi(fr, e.yEnd, ehDep) * fr.chiUnitMpc;
  const yr = (sMax * fr.tu) / YEAR_S;
  return unreachable(
    'ship-time-limit',
    `At ${fmt(fr.accel / G0_M_S2)} g the furthest comoving distance reachable within ${fmt(yr)} years of ship time is ${fmt(maxChi)} Mpc; the target is at ${fmt(chiMpc)} Mpc.`,
    { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxChiMpc: maxChi, maxShipTimeYr: yr },
  );
}

/** Arrival distance (ship units) from whichever representation is better conditioned. */
function bestArrivalChi(fr: ShipFrame, yEnd: Float64Array, ehDep: number): number {
  const inside = horizonUnits(fr, Math.log(fr.aDep) + yEnd[IX]) + yEnd[IL];
  return inside < yEnd[ICHI] ? ehDep - inside : yEnd[ICHI];
}

/**
 * The furthest comoving distance a flip-and-burn at the given acceleration reaches (arriving at rest)
 * within a given ship time, and the redshift at which home sees a galaxy there at departure.
 * insideEventHorizonMpc is how far that point lies inside the event horizon at departure (exact, from
 * the light lag); limitInsideEventHorizonMpc is the absolute limit for unlimited ship time (c^2/A / a_dep
 * to within 1e-10 for any sensible A). `saturated` is true once the reach equals that limit to 1e-9.
 * Throws a RangeError for invalid inputs (same rules as the planners).
 */
export function maxReach(
  cosmo: Cosmology,
  shipTimeYr: number,
  opts: Omit<PlanOptions, 'maxShipTimeYr' | 'samples'> = {},
): {
  chiMpc: number;
  insideEventHorizonMpc: number;
  limitChiMpc: number;
  limitInsideEventHorizonMpc: number;
  redshiftSeenAtDeparture: number;
  flipShipTimeYr: number;
  arrivalScale: number;
  arrivalTimeGyr: number;
  peakGamma: number;
  saturated: boolean;
} {
  const accel = opts.accel ?? G0_M_S2;
  const aDep = opts.departureScale ?? 1;
  const bad = invalidInput(1, accel, aDep, shipTimeYr);
  if (bad) throw new RangeError(`maxReach: ${bad}`);
  const fr = makeFrame(cosmo, aDep, accel, opts.rtol ?? 1e-12);
  const leg = new ProperTimeLeg(fr, 1, new Float64Array(NSTATE), 0);
  const sMax = (shipTimeYr * YEAR_S) / fr.tu;
  const lDep = Math.log(aDep);
  const ehDep = horizonUnits(fr, lDep);
  const evalAt = (s: number): Eval => {
    const yFlip = leg.at(s);
    const d = decelerate(fr, yFlip, s);
    return { s, yFlip, sEnd: d.s, yEnd: d.y };
  };
  const cap = evalAt(Math.min(sMax, S_CAP));
  const s = cap.sEnd <= sMax ? cap.s : brent((x) => evalAt(x).sEnd - sMax, 0, cap.s, { rtol: 1e-15, fb: cap.sEnd - sMax });
  const e = cap.sEnd <= sMax ? cap : evalAt(s);
  const Linf = lagLimit(leg);
  const lArr = lDep + e.yEnd[IX];
  const inside = horizonUnits(fr, lArr) + e.yEnd[IL];
  const chiUnits = inside < e.yEnd[ICHI] ? ehDep - inside : e.yEnd[ICHI];
  const chi = chiUnits * fr.chiUnitMpc;
  return {
    chiMpc: chi,
    insideEventHorizonMpc: inside * fr.chiUnitMpc,
    limitChiMpc: (ehDep - Linf) * fr.chiUnitMpc,
    limitInsideEventHorizonMpc: Linf * fr.chiUnitMpc,
    redshiftSeenAtDeparture: Math.expm1(cosmo.emissionSpanLn(lDep, chi / cosmo.dH)),
    flipShipTimeYr: (s * fr.tu) / YEAR_S,
    arrivalScale: Math.exp(lArr),
    arrivalTimeGyr: cosmo.timeGyr(aDep) + (e.yEnd[IT] * fr.tu) / (YEAR_S * 1e9),
    peakGamma: Math.cosh(e.yFlip[IW]),
    saturated: inside - Linf <= 1e-9 * Linf,
  };
}

// ------------------------------------------------------------------------------------ cruise

export interface CruiseOptions extends PlanOptions {
  /** Cruise peculiar four-velocity gamma*beta (give one of cruiseU, cruiseGamma, cruiseBeta). */
  cruiseU?: number;
  cruiseGamma?: number;
  cruiseBeta?: number;
}

function cruiseU(opts: CruiseOptions): number {
  return (
    opts.cruiseU ??
    (opts.cruiseGamma !== undefined
      ? Math.sqrt((opts.cruiseGamma - 1) * (opts.cruiseGamma + 1))
      : opts.cruiseBeta !== undefined
        ? opts.cruiseBeta / Math.sqrt((1 - opts.cruiseBeta) * (1 + opts.cruiseBeta))
        : NaN)
  );
}

/**
 * Accelerate at A to peculiar four-velocity u_c, hold u_c against the Hubble drag (the engine then
 * supplies A_hold = c H u_c, which falls as H falls), and decelerate at A to arrive at rest. The cruise
 * length is found with Brent's method. If the target is too close to reach u_c, the plan falls back to
 * a flip-and-burn and says so (cruise.reached = false). While cruising the ship covers exactly beta_c of
 * the conformal time, so its distance short of the cruise-speed limit is beta_c chi_EH(a): targets close
 * to that limit are solved in that form, which stays exact however close they are.
 */
export function planCruise(cosmo: Cosmology, chiMpc: number, opts: CruiseOptions): TripPlan | Unreachable {
  const accel = opts.accel ?? G0_M_S2;
  const aDep = opts.departureScale ?? 1;
  const uc = cruiseU(opts);
  const bad = invalidInput(chiMpc, accel, aDep, opts.maxShipTimeYr) ?? (!(uc > 0) || !Number.isFinite(uc) ? 'the cruise speed must be positive and below c' : null);
  if (bad) {
    let eh = NaN;
    if (aDep >= DEPARTURE_SCALE_MIN && aDep <= DEPARTURE_SCALE_MAX) eh = cosmo.eventHorizonMpc(aDep);
    return unreachable('invalid-input', bad, { targetChiMpc: chiMpc, eventHorizonMpc: eh });
  }
  return guarded(chiMpc, cosmo, aDep, () => cruiseBody(cosmo, chiMpc, accel, aDep, uc, opts));
}

function cruiseBody(cosmo: Cosmology, chiMpc: number, accel: number, aDep: number, uc: number, opts: CruiseOptions): TripPlan | Unreachable {
  const fr = makeFrame(cosmo, aDep, accel, opts.rtol ?? 1e-12);
  const lDep = Math.log(aDep);
  const ehMpc = cosmo.eventHorizonMpc(aDep);
  if (chiMpc >= ehMpc)
    return unreachable(
      'beyond-event-horizon',
      `The target is ${fmt(chiMpc)} Mpc away (comoving) but the event horizon at departure is ${fmt(ehMpc)} Mpc.`,
      { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc },
    );
  const wc = Math.asinh(uc);
  const eps0 = fr.epsScale * cosmo.E(aDep);
  const uMax = 1 / eps0;
  if (eps0 * uc > 0.99)
    return unreachable(
      'cruise-speed-unattainable',
      `At ${fmt(accel / G0_M_S2)} g the engine cannot hold u = ${fmt(uc)} against the Hubble drag here (limit A/(cH) = ${fmt(uMax)}).`,
      { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxU: uMax },
    );
  const Xd = chiMpc / fr.chiUnitMpc;
  const A = accelerateTo(fr, wc);
  let iterations = 0;
  const decelNow = decelerate(fr, A.y, A.s);
  if (decelNow.y[ICHI] >= Xd) {
    const fb = planFlipAndBurn(cosmo, chiMpc, opts);
    if (fb.ok) fb.cruise = { u: uc, gamma: Math.hypot(1, uc), reached: false, holdThrustAtStartG: 0, holdThrustAtEndG: 0 };
    return fb;
  }
  // Furthest reach at this speed: accelerate, then cruise for ever (beta_c of the event horizon at a1).
  const betaC = Math.tanh(wc);
  const l1 = lDep + A.y[IX];
  const reachX = A.y[ICHI] + betaC * horizonUnits(fr, l1);
  if (reachX <= Xd)
    return unreachable(
      'beyond-reach-at-cruise-speed',
      `Cruising at u = ${fmt(uc)} (beta = ${betaC.toPrecision(6)}) can never cover ${fmt(chiMpc)} Mpc: the limit at this speed is ${fmt(reachX * fr.chiUnitMpc)} Mpc.`,
      { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxChiMpc: reachX * fr.chiUnitMpc },
    );
  // Distance of the target short of the cruise-speed limit.
  const deltaT = reachX - Xd;
  const nearLimit = deltaT < 0.5 * Xd;
  const sMax = opts.maxShipTimeYr !== undefined ? (opts.maxShipTimeYr * YEAR_S) / fr.tu : Infinity;
  const leg = new ProperTimeLeg(fr, 'hold', A.y, A.s);
  const evalAt = (ds: number) => {
    iterations++;
    const yc = leg.at(A.s + ds);
    const d = decelerate(fr, yc, A.s + ds, nearLimit);
    const yEnd = d.y;
    // Near the limit: chi_arrival = reachX - (beta_c chi_EH(a_c) - distance covered while braking).
    const short = nearLimit ? betaC * horizonUnits(fr, lDep + yc[IX]) - yEnd[ICHI] : 0;
    if (nearLimit) yEnd[ICHI] = reachX - short;
    const f = nearLimit ? deltaT - short : yEnd[ICHI] - Xd;
    return { ds, yc, sEnd: d.s, yEnd, f };
  };
  const refuseNumerically = () =>
    unreachable(
      'beyond-reach-at-cruise-speed',
      `Cruising at u = ${fmt(uc)} the target (${fmt(chiMpc)} Mpc) lies only ${fmt(deltaT * fr.chiUnitMpc)} Mpc short of the limit at this speed, ${fmt(reachX * fr.chiUnitMpc)} Mpc; getting there would take until the universe has grown by e^${LN_A_MAX}.`,
      { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxChiMpc: reachX * fr.chiUnitMpc },
    );
  let lo = 0;
  let fLo = nearLimit ? deltaT - (betaC * horizonUnits(fr, l1) - decelerate(fr, A.y, A.s, true).y[ICHI]) : decelNow.y[ICHI] - Xd;
  let hi = Math.max(1e-9, ((Xd - decelNow.y[ICHI]) * Math.exp(l1)) / uc);
  let eHi = evalAt(hi);
  let expansions = 0;
  while (eHi.f < 0) {
    if (eHi.sEnd > sMax) {
      const ds = brent((x) => evalAt(x).sEnd - sMax, lo, hi, { rtol: 1e-14 });
      const e = evalAt(ds);
      return unreachable(
        'ship-time-limit',
        `Cruising at u = ${fmt(uc)}, ${fmt(opts.maxShipTimeYr!)} years of ship time reach ${fmt(e.yEnd[ICHI] * fr.chiUnitMpc)} Mpc; the target is at ${fmt(chiMpc)} Mpc.`,
        { targetChiMpc: chiMpc, eventHorizonMpc: ehMpc, maxChiMpc: e.yEnd[ICHI] * fr.chiUnitMpc, maxShipTimeYr: opts.maxShipTimeYr },
      );
    }
    if (eHi.yc[IX] > LN_A_MAX || ++expansions > 400) return refuseNumerically();
    lo = hi;
    fLo = eHi.f;
    hi = hi * 2 + 1;
    eHi = evalAt(hi);
  }
  const cache = new Map<number, ReturnType<typeof evalAt>>();
  const ds = brent(
    (x) => {
      const e = evalAt(x);
      cache.set(x, e);
      return e.f;
    },
    lo,
    hi,
    { fa: fLo, fb: eHi.f, rtol: 1e-15 },
  );
  const best = cache.get(ds) ?? (ds === hi ? eHi : evalAt(ds));
  if (best.sEnd > sMax)
    return unreachable('ship-time-limit', `This cruise needs ${fmt((best.sEnd * fr.tu) / YEAR_S)} years of ship time, more than the limit of ${fmt(opts.maxShipTimeYr!)}.`, {
      targetChiMpc: chiMpc,
      eventHorizonMpc: ehMpc,
      maxShipTimeYr: opts.maxShipTimeYr,
    });
  const yc = Float64Array.from(best.yc);
  if (nearLimit) yc[ICHI] = reachX - betaC * horizonUnits(fr, lDep + yc[IX]);
  const trip = buildTrip(
    fr,
    chiMpc,
    [
      { kind: 'accelerate', thrust: 1, s0: 0, s1: A.s, y0: new Float64Array(NSTATE), y1: A.y },
      { kind: 'cruise', thrust: 'hold', s0: A.s, s1: A.s + ds, y0: A.y, y1: yc },
      { kind: 'decelerate', thrust: -1, s0: A.s + ds, s1: best.sEnd, y0: yc, y1: best.yEnd },
    ],
    opts.samples ?? 1000,
    iterations,
  );
  trip.profile = 'cruise';
  const holdG = (y: Float64Array) => (fr.epsScale * cosmo.E(aDep * Math.exp(y[IX])) * uc * accel) / G0_M_S2;
  trip.cruise = { u: uc, gamma: Math.hypot(1, uc), reached: true, holdThrustAtStartG: holdG(A.y), holdThrustAtEndG: holdG(yc) };
  return trip;
}

// ------------------------------------------------------------------------------------ assembling a trip

interface LegSpec {
  kind: Phase['kind'];
  thrust: Thrust;
  s0: number;
  s1: number;
  y0: Float64Array;
  y1: Float64Array;
}

function buildTrip(fr: ShipFrame, chiMpc: number, legs: LegSpec[], nSamples: number, rootIterations: number): TripPlan {
  const { cosmo, aDep, tu } = fr;
  const lDep = Math.log(aDep);
  const sTot = legs[legs.length - 1].s1;
  const yrPerS = tu / YEAR_S;
  const grid: number[] = [];
  for (let i = 0; i < nSamples; i++) grid.push((sTot * i) / Math.max(1, nSamples - 1));
  const rows: number[][] = [];
  const phases: Phase[] = [];
  let conservation = 0;
  const push = (s: number, y: Float64Array, dy: Float64Array) => {
    const w = y[IW];
    const ch = Math.cosh(w);
    // columns: tau, dt, chi, u, lnA, dDt, dChi, dU, dLnA
    rows.push([
      s * yrPerS,
      y[IT] * yrPerS,
      y[ICHI] * fr.chiUnitMpc,
      Math.sinh(w),
      lDep + y[IX],
      dy[IT],
      (dy[ICHI] * fr.chiUnitMpc) / yrPerS,
      (ch * dy[IW]) / yrPerS,
      dy[IX] / yrPerS,
    ]);
  };
  for (const leg of legs) {
    const rhs = rhsProper(fr, leg.thrust);
    const outs = grid.filter((s) => s > leg.s0 && s < leg.s1);
    const tmp = new Float64Array(NSTATE);
    rhs(leg.s0, leg.y0, tmp);
    push(leg.s0, leg.y0, tmp);
    const r = dopri5(rhs, leg.s0, leg.y0, leg.s1, {
      rtol: fr.rtol,
      h0: Math.min(0.05, (leg.s1 - leg.s0) / 8) || 1e-9,
      record: true,
      outputs: outs,
      onOutput: (s, y, dy) => push(s, y, dy),
    });
    // End of the leg: use the exact state from the planner (the rapidity-based integration).
    rhs(leg.s1, leg.y1, tmp);
    push(leg.s1, leg.y1, tmp);
    const cp = r.checkpoints!;
    phases.push({
      kind: leg.kind,
      thrust: leg.thrust,
      s0: leg.s0,
      s1: leg.s1,
      startTauYr: leg.s0 * yrPerS,
      endTauYr: leg.s1 * yrPerS,
      cpS: cp.x,
      cpY: cp.y,
    });
    if (typeof leg.thrust === 'number') {
      // a u - a0 u0 = thrust * K_leg (a relative to a_dep; every thrust leg's K starts from 0).
      const lhs = Math.exp(leg.y1[IX]) * Math.sinh(leg.y1[IW]) - Math.exp(leg.y0[IX]) * Math.sinh(leg.y0[IW]);
      const rhsK = leg.thrust * leg.y1[IK];
      conservation = Math.max(conservation, Math.abs(lhs - rhsK) / Math.max(Math.abs(rhsK), 1e-300));
    }
  }
  const col = (j: number) => Float64Array.from(rows, (r) => r[j]);
  const samples: TrajectorySamples = {
    tauYr: col(0),
    dtYr: col(1),
    chiMpc: col(2),
    u: col(3),
    lnA: col(4),
    dDt: col(5),
    dChi: col(6),
    dU: col(7),
    dLnA: col(8),
  };
  const yEnd = legs[legs.length - 1].y1;
  const lArr = lDep + yEnd[IX];
  const aArr = Math.exp(lArr);
  const tDep = cosmo.timeGyr(aDep);
  const dtS = yEnd[IT] * tu;
  const tArr = tDep + dtS / (YEAR_S * 1e9);
  const tableDt = cosmo.timeAfterLn(lDep, yEnd[IX]) * (MPC_KM / cosmo.params.H0);
  // Home as seen on arrival, from the light lag: the light left home at eta_dep + L.
  const Lc = (yEnd[IL] * fr.chiUnitMpc) / cosmo.dH;
  const homeSpan = cosmo.arrivalSpanLn(lDep, Lc); // ln(a_emit / a_dep)
  const homeDtYr = cosmo.timeAfterLn(lDep, homeSpan) * cosmo.tH * 1e9;
  const dHome = yEnd[IX] - homeSpan; // ln(1 + z_home)
  const dDest = cosmo.emissionSpanLn(lDep, chiMpc / cosmo.dH);
  const lDest = lDep - dDest;
  let wPeak = 0;
  for (const leg of legs) wPeak = Math.max(wPeak, leg.y0[IW], leg.y1[IW]);
  return {
    ok: true,
    model: 'flrw',
    profile: 'flip-and-burn',
    accel: fr.accel,
    chiMpc,
    departure: { scale: aDep, timeGyr: tDep },
    arrival: {
      scale: aArr,
      timeGyr: tArr,
      stretch: Math.expm1(yEnd[IX]),
      properDistanceMpc: aArr * chiMpc,
      cmbTemperatureK: cosmo.cmbTemperatureK(aArr),
    },
    shipTimeYr: sTot * yrPerS,
    cosmicTimeYr: dtS / YEAR_S,
    peakGamma: Math.cosh(wPeak),
    peakU: Math.sinh(wPeak),
    peakRapidity: wPeak,
    home: {
      redshift: Math.expm1(dHome),
      emissionScale: Math.exp(lDep + homeSpan),
      emissionTimeGyr: tDep + homeDtYr / 1e9,
      emissionAfterDepartureYr: homeDtYr,
    },
    destinationSeenAtDeparture: Number.isFinite(lDest)
      ? { redshift: Math.expm1(dDest), emissionTimeGyr: tDep - cosmo.tH * cosmo.timeAfterLn(lDest, dDest) }
      : null,
    eventHorizonAtDepartureMpc: cosmo.eventHorizonMpc(aDep),
    phases,
    samples,
    diagnostics: { conservation, tableTime: Math.abs(dtS - tableDt) / tableDt, rootIterations },
    frame: fr,
  };
}

/** A plain-JSON summary of a trip (no samples, no internal frame), for UI state and logs. */
export function tripSummary(trip: TripPlan): Omit<TripPlan, 'samples' | 'phases' | 'frame'> & { phases: { kind: Phase['kind']; startTauYr: number; endTauYr: number }[] } {
  const { samples: _s, frame: _f, phases, ...rest } = trip;
  void _s;
  void _f;
  return { ...rest, phases: phases.map((p) => ({ kind: p.kind, startTauYr: p.startTauYr, endTauYr: p.endTauYr })) };
}

// ------------------------------------------------------------------------------------ playback

export interface ShipState {
  tauYr: number;
  phase: Phase['kind'];
  /** Cosmic time since departure (yr) and since the big bang (Gyr). */
  dtYr: number;
  timeGyr: number;
  scale: number;
  /** Comoving distance from home (Mpc, a = 1 today) and proper distance now (Mpc). */
  chiMpc: number;
  properDistanceMpc: number;
  /** Peculiar motion relative to the local comoving observers. */
  u: number;
  gamma: number;
  rapidity: number;
  beta: number;
  /**
   * Home as seen from the ship at this moment: the light now arriving left home this long after departure
   * (years on the home clock). Exact at any speed (computed from the light lag).
   */
  homeSeenAfterDepartureYr: number;
}

/**
 * Exact state at ship time tauYr, by re-integrating from the nearest checkpoint of the trip's own
 * integration (same tolerance as the plan). Works for FLRW and static trips.
 */
export function stateAtShipTime(trip: TripPlan, tauYr: number): ShipState {
  if (trip.model === 'static') return staticStateAt(trip, tauYr);
  const fr = trip.frame!;
  const s = Math.min(Math.max((tauYr * YEAR_S) / fr.tu, 0), trip.phases[trip.phases.length - 1].s1);
  let ph = trip.phases[0];
  for (const p of trip.phases) if (s >= p.s0) ph = p;
  const i = checkpointIndex(ph.cpS, s);
  let y = ph.cpY[i];
  if (ph.cpS[i] !== s) y = dopri5(rhsProper(fr, ph.thrust), ph.cpS[i], y, s, { rtol: fr.rtol, h0: s - ph.cpS[i] }).y;
  const w = Math.max(0, y[IW]);
  const lnA = Math.log(fr.aDep) + y[IX];
  const a = Math.exp(lnA);
  return {
    tauYr: (s * fr.tu) / YEAR_S,
    phase: ph.kind,
    dtYr: (y[IT] * fr.tu) / YEAR_S,
    timeGyr: trip.departure.timeGyr + (y[IT] * fr.tu) / (YEAR_S * 1e9),
    scale: a,
    chiMpc: y[ICHI] * fr.chiUnitMpc,
    properDistanceMpc: a * y[ICHI] * fr.chiUnitMpc,
    u: Math.sinh(w),
    gamma: Math.cosh(w),
    rapidity: w,
    beta: Math.tanh(w),
    homeSeenAfterDepartureYr: (lagToHomeDt(fr, y[IL]) * fr.tu) / YEAR_S,
  };
}

/** Fast playback: cubic Hermite interpolation of the stored samples (error ~ h^4; see cosmology.md). */
export function sampleAt(samples: TrajectorySamples, tauYr: number): { dtYr: number; chiMpc: number; u: number; lnA: number } {
  const t = samples.tauYr;
  const n = t.length;
  if (tauYr <= t[0]) return { dtYr: samples.dtYr[0], chiMpc: samples.chiMpc[0], u: samples.u[0], lnA: samples.lnA[0] };
  if (tauYr >= t[n - 1]) return { dtYr: samples.dtYr[n - 1], chiMpc: samples.chiMpc[n - 1], u: samples.u[n - 1], lnA: samples.lnA[n - 1] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t[m] <= tauYr) lo = m;
    else hi = m;
  }
  const h = t[hi] - t[lo];
  const x = (tauYr - t[lo]) / h;
  const h00 = (1 + 2 * x) * (1 - x) * (1 - x);
  const h10 = x * (1 - x) * (1 - x);
  const h01 = x * x * (3 - 2 * x);
  const h11 = x * x * (x - 1);
  const H = (v: Float64Array, d: Float64Array) => h00 * v[lo] + h10 * h * d[lo] + h01 * v[hi] + h11 * h * d[hi];
  return { dtYr: H(samples.dtYr, samples.dDt), chiMpc: H(samples.chiMpc, samples.dChi), u: H(samples.u, samples.dU), lnA: H(samples.lnA, samples.dLnA) };
}

// ------------------------------------------------------------------------------------ static space

/**
 * Special-relativistic trip in static (Minkowski) space, the model for destinations bound to the Local
 * Group, in closed form (units c = 1, time c/A, length c^2/A). Phases: accelerate from rest for sigma in
 * [0, s1] (w = sigma), coast at w_c = s1 for [s1, s2] (no thrust is needed to hold a speed in static
 * space), decelerate for [s2, s3]. A flip-and-burn has s1 = s2.
 */
interface StaticProfile {
  wc: number;
  s1: number;
  s2: number;
  s3: number;
  D: number;
}

function staticAt(p: StaticProfile, s: number): { T: number; X: number; w: number; dw: number; lag: number; phase: Phase['kind'] } {
  const { wc, s1, s2, s3, D } = p;
  const coast = s2 - s1;
  const Ttot = 2 * Math.sinh(wc) + Math.cosh(wc) * coast;
  // Home light lag T - X = t_emit(home) - t_dep, in forms without cancellation.
  const gap = -2 * Math.expm1(-wc) + Math.exp(-wc) * coast;
  if (s <= s1) return { T: Math.sinh(s), X: 2 * Math.sinh(s / 2) ** 2, w: s, dw: 1, lag: -Math.expm1(-s), phase: 'accelerate' };
  if (s < s2) {
    const d = s - s1;
    return {
      T: Math.sinh(wc) + Math.cosh(wc) * d,
      X: 2 * Math.sinh(wc / 2) ** 2 + Math.sinh(wc) * d,
      w: wc,
      dw: 0,
      lag: -Math.expm1(-wc) + Math.exp(-wc) * d,
      phase: 'cruise',
    };
  }
  const r = Math.max(0, s3 - s);
  return { T: Ttot - Math.sinh(r), X: D - 2 * Math.sinh(r / 2) ** 2, w: r, dw: -1, lag: gap + Math.expm1(-r), phase: 'decelerate' };
}

function staticPlanFromProfile(cosmo: Cosmology, distanceMpc: number, fr: ShipFrame, p: StaticProfile, nS: number, cruise?: TripPlan['cruise']): TripPlan {
  const yrPerS = fr.tu / YEAR_S;
  const aDep = fr.aDep;
  const lnA = Math.log(aDep);
  const rows: number[][] = [];
  const add = (s: number, st: ReturnType<typeof staticAt>) =>
    rows.push([s * yrPerS, st.T * yrPerS, st.X * fr.chiUnitMpc, Math.sinh(st.w), lnA, Math.cosh(st.w), (Math.sinh(st.w) * fr.chiUnitMpc) / yrPerS, (Math.cosh(st.w) * st.dw) / yrPerS, 0]);
  // Phase boundaries appear twice, once per side (the derivative of u jumps there):
  // rapidity rate +1 while accelerating, 0 while coasting, -1 while braking.
  const bounds = p.s1 === p.s2 ? [{ s: p.s1, before: 1, after: -1 }] : [{ s: p.s1, before: 1, after: 0 }, { s: p.s2, before: 0, after: -1 }];
  const grid = new Set<number>();
  for (let i = 0; i < nS; i++) grid.add((p.s3 * i) / Math.max(1, nS - 1));
  let bi = 0;
  for (const s of [...grid].sort((a, b) => a - b)) {
    while (bi < bounds.length && s >= bounds[bi].s) {
      const b = bounds[bi++];
      const st = staticAt(p, b.s);
      add(b.s, { ...st, dw: b.before });
      add(b.s, { ...st, dw: b.after });
    }
    if (bounds.some((b) => b.s === s)) continue;
    add(s, staticAt(p, s));
  }
  const col = (j: number) => Float64Array.from(rows, (r) => r[j]);
  const tDep = cosmo.timeGyr(aDep);
  const end = staticAt(p, p.s3);
  const dtYr = end.T * yrPerS;
  const gapYr = end.lag * yrPerS;
  const lightYr = distanceMpc * MPC_LY;
  const phases: Phase[] = [{ kind: 'accelerate', thrust: 1, s0: 0, s1: p.s1, startTauYr: 0, endTauYr: p.s1 * yrPerS, cpS: new Float64Array(0), cpY: [] }];
  if (p.s2 > p.s1) phases.push({ kind: 'cruise', thrust: 0, s0: p.s1, s1: p.s2, startTauYr: p.s1 * yrPerS, endTauYr: p.s2 * yrPerS, cpS: new Float64Array(0), cpY: [] });
  phases.push({ kind: 'decelerate', thrust: -1, s0: p.s2, s1: p.s3, startTauYr: p.s2 * yrPerS, endTauYr: p.s3 * yrPerS, cpS: new Float64Array(0), cpY: [] });
  return {
    ok: true,
    model: 'static',
    profile: cruise?.reached ? 'cruise' : 'flip-and-burn',
    accel: fr.accel,
    chiMpc: distanceMpc,
    departure: { scale: aDep, timeGyr: tDep },
    arrival: { scale: aDep, timeGyr: tDep + dtYr / 1e9, stretch: 0, properDistanceMpc: distanceMpc, cmbTemperatureK: cosmo.cmbTemperatureK(aDep) },
    shipTimeYr: p.s3 * yrPerS,
    cosmicTimeYr: dtYr,
    peakGamma: Math.cosh(p.wc),
    peakU: Math.sinh(p.wc),
    peakRapidity: p.wc,
    // Bound system: no cosmological redshift; home is seen as it was one light-travel time earlier.
    home: { redshift: 0, emissionScale: aDep, emissionTimeGyr: tDep + gapYr / 1e9, emissionAfterDepartureYr: gapYr },
    destinationSeenAtDeparture: { redshift: 0, emissionTimeGyr: tDep - lightYr / 1e9 },
    eventHorizonAtDepartureMpc: cosmo.eventHorizonMpc(aDep),
    phases,
    samples: { tauYr: col(0), dtYr: col(1), chiMpc: col(2), u: col(3), lnA: col(4), dDt: col(5), dChi: col(6), dU: col(7), dLnA: col(8) },
    diagnostics: { conservation: 0, tableTime: 0, rootIterations: 0 },
    cruise,
    frame: fr,
  };
}

/** Largest distance (units c^2/A) a static-space flip-and-burn covers in ship time S (units c/A): 2 (cosh(S/2) - 1). */
function staticReach(S: number): number {
  return 4 * Math.sinh(S / 4) ** 2;
}

/**
 * Flip-and-burn in static (Minkowski) space: the special-relativistic rocket used for destinations
 * bound to the Local Group. tau = (2c/A) arccosh(1 + A d / (2 c^2)), t = (2c/A) sinh(A tau / (2c)).
 * Validates its inputs like the FLRW planners and honours maxShipTimeYr (closed-form reach
 * 2 (cosh(A T / 2c) - 1) c^2/A in ship time T).
 */
export function planStatic(cosmo: Cosmology, distanceMpc: number, opts: PlanOptions = {}): TripPlan | Unreachable {
  const accel = opts.accel ?? G0_M_S2;
  const aDep = opts.departureScale ?? 1;
  const bad = invalidInput(distanceMpc, accel, aDep, opts.maxShipTimeYr);
  const ehMpc = aDep >= DEPARTURE_SCALE_MIN && aDep <= DEPARTURE_SCALE_MAX ? cosmo.eventHorizonMpc(aDep) : NaN;
  if (bad) return unreachable('invalid-input', bad, { targetChiMpc: distanceMpc, eventHorizonMpc: ehMpc });
  const fr = makeFrame(cosmo, aDep, accel, opts.rtol ?? 1e-12);
  const D = distanceMpc / fr.chiUnitMpc; // units c^2/A
  const sHalf = 2 * Math.asinh(Math.sqrt(D / 4)); // arccosh(1 + D/2)
  const sMax = opts.maxShipTimeYr !== undefined ? (opts.maxShipTimeYr * YEAR_S) / fr.tu : Infinity;
  if (2 * sHalf > sMax) {
    const maxChi = staticReach(sMax) * fr.chiUnitMpc;
    return unreachable(
      'ship-time-limit',
      `At ${fmt(accel / G0_M_S2)} g the furthest distance reachable within ${fmt(opts.maxShipTimeYr!)} years of ship time is ${fmt(maxChi)} Mpc; the target is at ${fmt(distanceMpc)} Mpc.`,
      { targetChiMpc: distanceMpc, eventHorizonMpc: ehMpc, maxChiMpc: maxChi, maxShipTimeYr: opts.maxShipTimeYr },
    );
  }
  return staticPlanFromProfile(cosmo, distanceMpc, fr, { wc: sHalf, s1: sHalf, s2: sHalf, s3: 2 * sHalf, D }, opts.samples ?? 1000);
}

/**
 * Constant-speed cruise in static space (Local Group destinations): accelerate to u_c, coast, decelerate.
 * Falls back to a flip-and-burn (cruise.reached = false) when the target is too close to reach u_c.
 */
export function planStaticCruise(cosmo: Cosmology, distanceMpc: number, opts: CruiseOptions): TripPlan | Unreachable {
  const accel = opts.accel ?? G0_M_S2;
  const aDep = opts.departureScale ?? 1;
  const uc = cruiseU(opts);
  const ehMpc = aDep >= DEPARTURE_SCALE_MIN && aDep <= DEPARTURE_SCALE_MAX ? cosmo.eventHorizonMpc(aDep) : NaN;
  const bad = invalidInput(distanceMpc, accel, aDep, opts.maxShipTimeYr) ?? (!(uc > 0) || !Number.isFinite(uc) ? 'the cruise speed must be positive and below c' : null);
  if (bad) return unreachable('invalid-input', bad, { targetChiMpc: distanceMpc, eventHorizonMpc: ehMpc });
  const fr = makeFrame(cosmo, aDep, accel, opts.rtol ?? 1e-12);
  const D = distanceMpc / fr.chiUnitMpc;
  const wc = Math.asinh(uc);
  const accelDist = 4 * Math.sinh(wc / 2) ** 2; // accelerate + decelerate: 2 (cosh w_c - 1)
  const cruise = { u: uc, gamma: Math.hypot(1, uc), reached: true, holdThrustAtStartG: 0, holdThrustAtEndG: 0 };
  if (accelDist >= D) {
    const fb = planStatic(cosmo, distanceMpc, opts);
    if (fb.ok) fb.cruise = { ...cruise, reached: false };
    return fb;
  }
  const coast = (D - accelDist) / Math.sinh(wc);
  const s3 = 2 * wc + coast;
  const sMax = opts.maxShipTimeYr !== undefined ? (opts.maxShipTimeYr * YEAR_S) / fr.tu : Infinity;
  if (s3 > sMax) {
    const reach = sMax > 2 * wc ? accelDist + Math.sinh(wc) * (sMax - 2 * wc) : staticReach(sMax);
    return unreachable(
      'ship-time-limit',
      `Cruising at u = ${fmt(uc)}, ${fmt(opts.maxShipTimeYr!)} years of ship time reach ${fmt(reach * fr.chiUnitMpc)} Mpc; the target is at ${fmt(distanceMpc)} Mpc.`,
      { targetChiMpc: distanceMpc, eventHorizonMpc: ehMpc, maxChiMpc: reach * fr.chiUnitMpc, maxShipTimeYr: opts.maxShipTimeYr },
    );
  }
  return staticPlanFromProfile(cosmo, distanceMpc, fr, { wc, s1: wc, s2: wc + coast, s3, D }, opts.samples ?? 1000, cruise);
}

function staticStateAt(trip: TripPlan, tauYr: number): ShipState {
  const fr = trip.frame!;
  const ph = trip.phases;
  const s1 = ph[0].s1;
  const s3 = ph[ph.length - 1].s1;
  const s2 = ph[ph.length - 1].s0;
  const p: StaticProfile = { wc: s1, s1, s2, s3, D: trip.chiMpc / fr.chiUnitMpc };
  const s = Math.min(Math.max((tauYr * YEAR_S) / fr.tu, 0), s3);
  const st = staticAt(p, s);
  const yr = fr.tu / YEAR_S;
  return {
    tauYr: s * yr,
    phase: st.phase,
    dtYr: st.T * yr,
    timeGyr: trip.departure.timeGyr + (st.T * yr) / 1e9,
    scale: trip.departure.scale,
    chiMpc: st.X * fr.chiUnitMpc,
    properDistanceMpc: st.X * fr.chiUnitMpc,
    u: Math.sinh(st.w),
    gamma: Math.cosh(st.w),
    rapidity: st.w,
    beta: Math.tanh(st.w),
    homeSeenAfterDepartureYr: st.lag * yr,
  };
}

/** Static-space flip-and-burn ship time in years (closed form), for comparisons. */
export function staticShipTimeYr(distanceMpc: number, accel = G0_M_S2): number {
  const tu = C_M_S / accel;
  const D = distanceMpc / ((C_KM_S * tu) / MPC_KM);
  return (4 * Math.asinh(Math.sqrt(D / 4)) * tu) / YEAR_S;
}

// ------------------------------------------------------------------------------------ round trips

/** Out and back: the return leg departs when the outbound leg arrives (by homogeneity, home is then chi away). */
export function planRoundTrip(
  cosmo: Cosmology,
  chiMpc: number,
  opts: PlanOptions = {},
): { outbound: TripPlan | Unreachable; inbound: TripPlan | Unreachable | null; shipTimeYr: number; cosmicTimeYr: number } {
  const out = planFlipAndBurn(cosmo, chiMpc, opts);
  if (!out.ok) return { outbound: out, inbound: null, shipTimeYr: NaN, cosmicTimeYr: NaN };
  const back = planFlipAndBurn(cosmo, chiMpc, { ...opts, departureScale: out.arrival.scale });
  if (!back.ok) return { outbound: out, inbound: back, shipTimeYr: NaN, cosmicTimeYr: NaN };
  return { outbound: out, inbound: back, shipTimeYr: out.shipTimeYr + back.shipTimeYr, cosmicTimeYr: out.cosmicTimeYr + back.cosmicTimeYr };
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  const ax = Math.abs(x);
  if (ax !== 0 && (ax < 1e-3 || ax >= 1e7)) return x.toExponential(4);
  return x.toPrecision(6).replace(/\.?0+$/, '');
}
