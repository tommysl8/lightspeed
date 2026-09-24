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
 * ephemeris). The ship's state derives from simulation time, so pausing, time warp and
 * "jump to arrival" stay consistent.
 */
import { Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import { BODIES, C_KM_S, G0_KM_S2, type BodyId } from '../physics/constants';
import { solveInterceptReach } from '../physics/intercept';
import { gamma } from '../physics/relativity';
import { flipAndBurn, flipAndBurnAtEarthTime, type FlipAndBurnTrip } from '../physics/rocket';
import { framingDistance } from '../controls/framing';
import { bodyPositionAt } from './ephemeris';
import { sim } from './sim';
import { advanceTime } from './clock';

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

export interface Trip extends TripPlan {
  startMs: number;
  dir: Vector3;
}

export interface ArrivalSummary {
  dest: BodyId;
  drive: Drive;
  beta: number;
  warp: boolean;
  earthTime: number;
  shipTime: number;
  distance: number;
  /** Real-world timestamp (ms) when the summary was created, for auto-dismissal. */
  at: number;
}

/** Instantaneous ship state along the current trip. */
export interface ShipState {
  beta: number;
  gamma: number;
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

/** Flip-and-burn distance coverable in total coordinate time T at acceleration a. */
function rocketReach(T: number, a = G0_KM_S2): number {
  const x = (a * T) / (2 * C_KM_S);
  return ((2 * C_KM_S * C_KM_S) / a) * (Math.sqrt(1 + x * x) - 1);
}

/**
 * Plan a straight-line intercept of `dest` from `from`. `beta` is the cruise speed (or the
 * multiple of c for warp); it is ignored for the rocket drive. Null if unreachable.
 */
export function planTrip(
  dest: BodyId,
  beta: number,
  from: Vector3,
  time: AstroTime = sim.astroTime,
  drive: Drive = beta >= 1 ? 'warp' : 'cruise',
): TripPlan | null {
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

export function launch(plan: TripPlan): void {
  travel.trip = {
    ...plan,
    startMs: sim.timeMs,
    dir: plan.aim.clone().sub(plan.start).normalize(),
  };
  travel.shipPos.copy(plan.start);
  travel.lastArrival = null;
}

/** Elapsed Sun-frame seconds since launch (clamped to the trip). */
export function tripElapsed(t: Trip): number {
  return Math.min(Math.max(0, (sim.timeMs - t.startMs) / 1000), t.earthTime);
}

/** Speed, γ, ship time and distance covered at Earth time `elapsed` into the trip. */
export function shipStateAt(t: Trip, elapsed: number): ShipState {
  if (t.rocket) {
    const s = flipAndBurnAtEarthTime(t.rocket, elapsed);
    return { beta: s.beta, gamma: s.gamma, tau: s.tau, covered: s.d };
  }
  return { beta: t.beta, gamma: t.gamma, tau: t.warp ? NaN : elapsed / t.gamma, covered: t.speed * elapsed };
}

/** Advance the ship along its course. Returns true on the frame it arrives. */
export function updateTrip(): boolean {
  const t = travel.trip;
  if (!t) return false;
  const elapsed = tripElapsed(t);
  const s = shipStateAt(t, elapsed);
  travel.shipPos.copy(t.start).addScaledVector(t.dir, s.covered);
  if (elapsed >= t.earthTime) {
    travel.lastArrival = {
      dest: t.dest,
      drive: t.drive,
      beta: t.beta,
      warp: t.warp,
      earthTime: t.earthTime,
      shipTime: t.shipTime,
      distance: t.distance,
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
  if (t) advanceTime(t.earthTime - tripElapsed(t) + 1e-3);
}

export function abortTrip(): void {
  travel.trip = null;
}

export const describeDest = (id: BodyId): string => BODIES[id].name;
