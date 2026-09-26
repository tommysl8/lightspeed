/**
 * Travel mode: fly to a body.
 *
 * Three drives:
 *  - cruise: idealised, with an instantaneous boost to a constant speed v, a straight line
 *    through the Sun's rest frame, and an instantaneous stop. Ship (proper) time τ = t/γ.
 *  - rocket: realistic, with constant 1 g proper acceleration and a flip halfway to decelerate:
 *    t = (c/a) sinh(aτ/c), d = (c²/a)(cosh(aτ/c) − 1).
 *  - warp: fictional faster-than-light motion (γ and proper time undefined).
 *
 * Every course aims at where the destination will be on arrival (solved from the real
 * ephemeris).
 *
 * Pacing. Real trips play back by SHIP time: each frame advances the crew's proper time τ by
 * (real seconds) × shipRate, and the Earth clock is then set from the trip's closed-form t(τ).
 * A relativistic trip that takes years at home and hours on board thus plays at an even pace
 * through the part the crew lives through, rather than flashing by in a few frames of Earth
 * time. The default rate plays any trip in about a minute (never slower than real time).
 * The fictional warp has no proper time, so it keeps Earth-time pacing at the chosen time warp.
 * Pausing, "skip to arrival" and the chronometers stay exact either way.
 */
import { Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import { BODIES, C_KM_S, G0_KM_S2, type BodyId } from '../physics/constants';
import { solveInterceptReach } from '../physics/intercept';
import { gamma } from '../physics/relativity';
import {
  earthTimeAtShipTime,
  flipAndBurn,
  flipAndBurnAt,
  flipAndBurnAtEarthTime,
  flipAndBurnLag,
  shipTimeAtEarthTime,
  type FlipAndBurnTrip,
} from '../physics/rocket';
import { framingDistance } from '../controls/framing';
import { formatDurationShort, msFromAstroTime } from '../lib/time';
import { bodyAvailability, bodyPositionAt } from './ephemeris';
import { sim } from './sim';
import { advanceTime, stepWarp } from './clock';

export type Drive = 'cruise' | 'rocket' | 'warp';

export interface TripPlan {
  dest: BodyId;
  drive: Drive;
  /** Cruise speed as a fraction of c (the peak speed for the rocket; above 1 only for warp). */
  beta: number;
  /** Fictional faster-than-light warp: γ and ship time are undefined. */
  warp: boolean;
  speed: number;
  gamma: number;
  start: Vector3;
  aim: Vector3;
  distance: number;
  /** Sun-frame (Earth) flight time, s. */
  earthTime: number;
  /** Proper (ship) time, s. */
  shipTime: number;
  /** Flip-and-burn profile (rocket drive only). */
  rocket: FlipAndBurnTrip | null;
}

/** 'ship': playback advances the crew's clock (cruise, rocket). 'earth': the Sun-frame clock at the time warp (fictional warp). */
export type TripPacing = 'ship' | 'earth';

export interface Trip extends TripPlan {
  startMs: number;
  dir: Vector3;
  pacing: TripPacing;
  /** Ship (proper) time elapsed, s: the playback position of a ship-paced trip (NaN for warp). */
  tau: number;
  /** Earth (Sun-frame) time elapsed, s. */
  t: number;
  /** Ship seconds per real second (ship-paced trips). */
  shipRate: number;
}

export interface ArrivalSummary {
  dest: BodyId;
  drive: Drive;
  beta: number;
  warp: boolean;
  earthTime: number;
  shipTime: number;
  distance: number;
  /** Simulation time at arrival (ms): the date at home when the ship got there. */
  endMs: number;
  /** Real-world timestamp (ms) when the summary was created, for auto-dismissal. */
  at: number;
}

/** Instantaneous ship state along the current trip. */
export interface ShipState {
  beta: number;
  gamma: number;
  /**
   * Rapidity φ = artanh β from the trip's closed form (NaN for warp). Exact at any γ, where β
   * has long since rounded to 1: the renderer works from this, not from the velocity.
   */
  phi: number;
  /** Ship (proper) time elapsed, s (NaN for warp). */
  tau: number;
  /** Distance covered, km (Sun frame). */
  covered: number;
}

export const travel = {
  trip: null as Trip | null,
  shipPos: new Vector3(),
  lastArrival: null as ArrivalSummary | null,
};

const tmp = new Vector3();

/** Real seconds a trip takes at its default ship rate. */
export const TRIP_PLAYBACK_S = 60;
/** The slowest ship rate: real time on board. */
export const SHIP_RATE_MIN = 1;

/** Flip-and-burn distance coverable in total coordinate time T at acceleration a. */
function rocketReach(T: number, a = G0_KM_S2): number {
  const x = (a * T) / (2 * C_KM_S);
  // 2(c²/a)(√(1 + x²) − 1), written without cancellation for short hops.
  return ((2 * C_KM_S * C_KM_S) / a) * ((x * x) / (Math.hypot(1, x) + 1));
}

/** γ − 1 without cancellation at low speed: β²γ²/(1 + γ). */
export function gammaMinusOne(beta: number): number {
  const g = gamma(beta);
  return (beta * beta * g * g) / (1 + g);
}

/**
 * Plan a straight-line intercept of `dest` from `from`. `beta` is the cruise speed (or the
 * multiple of c for warp); it is ignored for the rocket drive. Null if unreachable, or if the
 * destination does not exist at this date (Voyager 1 before 1980).
 */
export function planTrip(
  dest: BodyId,
  beta: number,
  from: Vector3,
  time: AstroTime = sim.astroTime,
  drive: Drive = beta >= 1 ? 'warp' : 'cruise',
): TripPlan | null {
  if (!bodyAvailability(dest, msFromAstroTime(time)).available) return null;
  const standoff = framingDistance(dest);
  const targetAt = (dt: number) => bodyPositionAt(dest, time.AddDays(dt / 86_400), tmp).clone();
  const hit =
    drive === 'rocket'
      ? solveInterceptReach(targetAt, from, (T) => rocketReach(T), standoff, (d) => flipAndBurn(d).earthTime)
      : solveInterceptReach(targetAt, from, (T) => beta * C_KM_S * T, standoff, (d) => d / (beta * C_KM_S));
  if (!hit) return null;
  const target = new Vector3(hit.targetAtArrival.x, hit.targetAtArrival.y, hit.targetAtArrival.z);
  const toTarget = target.clone().sub(from);
  const distanceToCentre = toTarget.length();
  const aim = from.clone().addScaledVector(toTarget.normalize(), Math.max(0, distanceToCentre - standoff));
  const distance = aim.distanceTo(from);

  if (drive === 'rocket') {
    const rocket = flipAndBurn(Math.max(distance, 1e-9));
    return {
      dest,
      drive,
      beta: rocket.peakBeta,
      warp: false,
      speed: rocket.peakBeta * C_KM_S,
      gamma: rocket.peakGamma,
      start: from.clone(),
      aim,
      distance,
      earthTime: rocket.earthTime,
      shipTime: rocket.shipTime,
      rocket,
    };
  }

  const warp = drive === 'warp';
  // Beyond c, γ = 1/√(1 − β²) is imaginary: proper time has no meaning for this fiction.
  const g = warp ? NaN : gamma(beta);
  return {
    dest,
    drive,
    beta,
    warp,
    speed: beta * C_KM_S,
    gamma: g,
    start: from.clone(),
    aim,
    distance,
    earthTime: hit.time,
    shipTime: warp ? NaN : hit.time / g,
    rocket: null,
  };
}

/** Ship seconds per real second that play a trip in about TRIP_PLAYBACK_S, never slower than real time. */
export const defaultShipRate = (plan: Pick<TripPlan, 'shipTime'>): number =>
  Number.isFinite(plan.shipTime) ? Math.max(SHIP_RATE_MIN, plan.shipTime / TRIP_PLAYBACK_S) : SHIP_RATE_MIN;

/** Real seconds a plan takes to play at its default ship rate (NaN for warp, which follows the time warp). */
export const playbackSeconds = (plan: TripPlan): number => (plan.warp ? NaN : plan.shipTime / defaultShipRate(plan));

export function launch(plan: TripPlan): void {
  const pacing: TripPacing = plan.warp ? 'earth' : 'ship';
  travel.trip = {
    ...plan,
    startMs: sim.timeMs,
    dir: plan.aim.clone().sub(plan.start).normalize(),
    pacing,
    tau: plan.warp ? NaN : 0,
    t: 0,
    shipRate: defaultShipRate(plan),
  };
  travel.shipPos.copy(plan.start);
  travel.lastArrival = null;
  // The trip sets the clock from here on: it no longer shows the present.
  sim.live = false;
}

// ─── The trip model: t(τ), τ(t), lag, state ──────────────────────────────────────────────

/** Earth time at ship time τ (exact closed forms; the end maps to earthTime exactly). */
export function earthTimeAtTau(t: TripPlan, tau: number): number {
  if (t.warp) return NaN;
  if (tau >= t.shipTime) return t.earthTime;
  if (t.rocket) return earthTimeAtShipTime(t.rocket, tau);
  return Math.max(0, tau) * t.gamma;
}

/** Ship time at Earth time t (NaN for warp). */
export function tauAtEarthTime(t: TripPlan, elapsed: number): number {
  if (t.warp) return NaN;
  if (elapsed >= t.earthTime) return t.shipTime;
  if (t.rocket) return shipTimeAtEarthTime(t.rocket, elapsed);
  return Math.max(0, elapsed) / t.gamma;
}

/** t − τ at ship time τ, without cancellation (NaN for warp). */
export function lagAtTau(t: TripPlan, tau: number): number {
  if (t.warp) return NaN;
  const tc = Math.min(Math.max(tau, 0), t.shipTime);
  if (t.rocket) return flipAndBurnLag(t.rocket, tc);
  return tc * gammaMinusOne(t.beta);
}

/** Elapsed Sun-frame seconds since launch (clamped to the trip). */
export function tripElapsed(t: Trip): number {
  if (t.pacing === 'ship') return t.t;
  return Math.min(Math.max(0, (sim.timeMs - t.startMs) / 1000), t.earthTime);
}

/** Ship time elapsed on the trip so far (NaN for warp). */
export const tripShipTime = (t: Trip): number => (t.pacing === 'ship' ? t.tau : tauAtEarthTime(t, tripElapsed(t)));

/** Rapidity of a constant-speed cruise (NaN for the fictional warp, which has none). */
const cruiseRapidity = (t: TripPlan): number => (t.warp ? NaN : Math.atanh(t.beta));

/** Speed, γ, ship time and distance covered at Earth time `elapsed` into the trip. */
export function shipStateAt(t: TripPlan, elapsed: number): ShipState {
  if (t.rocket) {
    const s = flipAndBurnAtEarthTime(t.rocket, elapsed);
    return { beta: s.beta, gamma: s.gamma, phi: s.phi, tau: s.tau, covered: s.d };
  }
  return { beta: t.beta, gamma: t.gamma, phi: cruiseRapidity(t), tau: t.warp ? NaN : elapsed / t.gamma, covered: t.speed * elapsed };
}

/** The same at ship time τ (not for warp). */
export function shipStateAtTau(t: TripPlan, tau: number): ShipState {
  const tc = Math.min(Math.max(tau, 0), t.shipTime);
  if (t.rocket) {
    const s = flipAndBurnAt(t.rocket, tc);
    return { beta: s.beta, gamma: s.gamma, phi: s.phi, tau: tc, covered: s.d };
  }
  return { beta: t.beta, gamma: t.gamma, phi: cruiseRapidity(t), tau: tc, covered: t.speed * earthTimeAtTau(t, tc) };
}

/** The ship's state now: from τ on a ship-paced trip, from the Earth clock otherwise. */
export const tripState = (t: Trip): ShipState => (t.pacing === 'ship' ? shipStateAtTau(t, t.tau) : shipStateAt(t, tripElapsed(t)));

// ─── Playback ────────────────────────────────────────────────────────────────────────────

/**
 * Advance a ship-paced trip by `dtReal` real seconds and set the simulation clock from it.
 * Returns the Earth seconds that passed, or null when no ship-paced trip is under way (the
 * caller then runs the clock at the time warp).
 */
export function advanceTripClock(dtReal: number): number | null {
  const trip = travel.trip;
  if (!trip || trip.pacing !== 'ship') return null;
  const t0 = trip.t;
  if (dtReal > 0 && trip.tau < trip.shipTime) {
    trip.tau = Math.min(trip.shipTime, trip.tau + dtReal * trip.shipRate);
    trip.t = earthTimeAtTau(trip, trip.tau);
    sim.timeMs = trip.startMs + 1000 * trip.t;
    sim.timeCarryMs = 0;
  }
  return trip.t - t0;
}

/** Advance the ship along its course. Returns true on the frame it arrives. */
export function updateTrip(): boolean {
  const t = travel.trip;
  if (!t) return false;
  let s: ShipState;
  let arrived: boolean;
  if (t.pacing === 'ship') {
    s = shipStateAtTau(t, t.tau);
    arrived = t.tau >= t.shipTime;
  } else {
    t.t = tripElapsed(t);
    s = shipStateAt(t, t.t);
    arrived = t.t >= t.earthTime;
  }
  travel.shipPos.copy(t.start).addScaledVector(t.dir, s.covered);
  if (arrived) {
    travel.lastArrival = {
      dest: t.dest,
      drive: t.drive,
      beta: t.beta,
      warp: t.warp,
      earthTime: t.earthTime,
      shipTime: t.shipTime,
      distance: t.distance,
      endMs: t.startMs + 1000 * t.earthTime,
      at: performance.now(),
    };
    travel.trip = null;
    sim.ship.vel.copy(sim.bodies[t.dest].vel);
    return true;
  }
  sim.ship.vel.copy(t.dir).multiplyScalar(s.beta * C_KM_S);
  return false;
}

export function jumpToArrival(): void {
  const t = travel.trip;
  if (!t) return;
  if (t.pacing === 'ship') {
    t.tau = t.shipTime;
    t.t = t.earthTime;
    sim.timeMs = t.startMs + 1000 * t.earthTime;
    sim.timeCarryMs = 0;
    return;
  }
  advanceTime(t.earthTime - tripElapsed(t) + 1e-3);
}

export function abortTrip(): void {
  travel.trip = null;
}

// ─── Ship rate ───────────────────────────────────────────────────────────────────────────

/** Set how many ship seconds pass per real second (ship-paced trips). Returns the rate applied, or null. */
export function setShipRate(rate: number): number | null {
  const t = travel.trip;
  if (!t || t.pacing !== 'ship' || !(rate > 0)) return null;
  // From real time on board up to the whole trip in one second.
  t.shipRate = Math.min(Math.max(SHIP_RATE_MIN, t.shipTime), Math.max(SHIP_RATE_MIN, rate));
  return t.shipRate;
}

/** Ten times faster or slower. */
export const stepShipRate = (dir: 1 | -1): number | null => (travel.trip ? setShipRate(travel.trip.shipRate * 10 ** dir) : null);

/** Slower or faster time, whichever clock is in charge: the ship rate on a real trip, the time warp otherwise. */
export function stepRate(dir: 1 | -1): void {
  if (travel.trip?.pacing === 'ship') stepShipRate(dir);
  else stepWarp(dir);
}

/** Back to the pace that plays the whole trip in about a minute. */
export const resetShipRate = (): number | null => (travel.trip ? setShipRate(defaultShipRate(travel.trip)) : null);

export interface TripPace {
  /** Ship seconds per real second (NaN for warp). */
  shipPerSecond: number;
  /** Earth seconds per real second right now (the ship rate times the current γ). */
  earthPerSecond: number;
  /** Real seconds left to arrival at this pace. */
  realSecondsLeft: number;
  /** "3.4 months" of ship time per real second ('' for warp). */
  onBoard: string;
  /** "12 years" of Earth time per real second. */
  atHome: string;
  /** "1 s here = 3.4 months on board; 12 years at home" */
  text: string;
}

/** How fast the trip is playing, in numbers and in words. */
export function tripPace(t: Trip, warp: number = sim.warp): TripPace {
  if (t.pacing !== 'ship') {
    const atHome = formatDurationShort(warp);
    const left = warp > 0 ? (t.earthTime - tripElapsed(t)) / warp : Infinity;
    return { shipPerSecond: NaN, earthPerSecond: warp, realSecondsLeft: left, onBoard: '', atHome, text: `1 s here = ${atHome} at home` };
  }
  const g = tripState(t).gamma;
  const earthPerSecond = t.shipRate * g;
  const onBoard = formatDurationShort(t.shipRate);
  const atHome = formatDurationShort(earthPerSecond);
  return {
    shipPerSecond: t.shipRate,
    earthPerSecond,
    realSecondsLeft: (t.shipTime - t.tau) / t.shipRate,
    onBoard,
    atHome,
    text: `1 s here = ${onBoard} on board; ${atHome} at home`,
  };
}

export const describeDest = (id: BodyId): string => BODIES[id].name;
