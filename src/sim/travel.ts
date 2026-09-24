/**
 * Travel mode: fly to a body at a constant fraction of c.
 *
 * Model (idealised): an instantaneous boost to speed v at launch, a straight line through the
 * Sun's rest frame, and an instantaneous stop at arrival. The course aims at where the
 * destination will be when we get there (solved from the real ephemeris). Everything derives
 * from simulation time, so pausing, time warp and "jump to arrival" stay consistent:
 *   Earth (Sun-frame) time elapsed  t
 *   ship (proper) time elapsed      τ = t / γ
 *   distance remaining              d = v (T − t);  as measured aboard the ship: d / γ
 */
import { Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import { BODIES, C_KM_S, type BodyId } from '../physics/constants';
import { solveIntercept } from '../physics/intercept';
import { gamma } from '../physics/relativity';
import { framingDistance } from '../controls/framing';
import { bodyPositionAt } from './ephemeris';
import { sim } from './sim';
import { advanceTime } from './clock';

export interface TripPlan {
  dest: BodyId;
  beta: number;
  speed: number;
  gamma: number;
  start: Vector3;
  aim: Vector3;
  distance: number;
  /** Sun-frame (Earth) flight time, s. */
  earthTime: number;
  /** Proper (ship) time, s. */
  shipTime: number;
}

export interface Trip extends TripPlan {
  startMs: number;
  dir: Vector3;
}

export interface ArrivalSummary {
  dest: BodyId;
  beta: number;
  earthTime: number;
  shipTime: number;
  distance: number;
  /** Real-world timestamp (ms) when the summary was created, for auto-dismissal. */
  at: number;
}

export const travel = {
  trip: null as Trip | null,
  shipPos: new Vector3(),
  lastArrival: null as ArrivalSummary | null,
};

const tmp = new Vector3();

/** Plan a straight-line intercept from `from` to `dest` at speed β. Null if unreachable. */
export function planTrip(dest: BodyId, beta: number, from: Vector3, time: AstroTime = sim.astroTime): TripPlan | null {
  const speed = beta * C_KM_S;
  const standoff = framingDistance(dest);
  const targetAt = (dt: number) => bodyPositionAt(dest, time.AddDays(dt / 86_400), tmp).clone();
  const hit = solveIntercept(targetAt, from, speed, standoff);
  if (!hit) return null;
  const target = new Vector3(hit.targetAtArrival.x, hit.targetAtArrival.y, hit.targetAtArrival.z);
  const toTarget = target.clone().sub(from);
  const distanceToCentre = toTarget.length();
  const aim = from.clone().addScaledVector(toTarget.normalize(), Math.max(0, distanceToCentre - standoff));
  const g = gamma(beta);
  return {
    dest,
    beta,
    speed,
    gamma: g,
    start: from.clone(),
    aim,
    distance: aim.distanceTo(from),
    earthTime: hit.time,
    shipTime: hit.time / g,
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

/** Advance the ship along its course. Returns true on the frame it arrives. */
export function updateTrip(): boolean {
  const t = travel.trip;
  if (!t) return false;
  const elapsed = tripElapsed(t);
  travel.shipPos.copy(t.start).addScaledVector(t.dir, t.speed * elapsed);
  if (elapsed >= t.earthTime) {
    travel.lastArrival = {
      dest: t.dest,
      beta: t.beta,
      earthTime: t.earthTime,
      shipTime: t.shipTime,
      distance: t.distance,
      at: performance.now(),
    };
    travel.trip = null;
    sim.ship.vel.copy(sim.bodies[t.dest].vel);
    return true;
  }
  sim.ship.vel.copy(t.dir).multiplyScalar(t.speed);
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
