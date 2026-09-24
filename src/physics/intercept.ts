/**
 * Straight-line intercept of a moving target at constant speed (Sun's rest frame).
 *
 * Find the flight time T such that the ship, leaving `from` now at `speed`, reaches a point
 * `standoff` short of where the target will be at T:
 *   f(T) = |x_target(T) − from| − standoff − speed · T = 0
 * f(0) > 0 when we are not there yet. f eventually goes negative whenever the ship can catch
 * the target, so we bracket the root by doubling T and then bisect. Works for any target
 * motion, including planets on curved orbits.
 */
import { type Vec3, distance } from './vec';

export interface Intercept {
  /** Flight time in seconds (Sun frame). */
  time: number;
  /** Target position at arrival. */
  targetAtArrival: Vec3;
}

const MAX_TIME_S = 1e4 * 365.25 * 86_400; // give up beyond 10,000 years

export function solveIntercept(
  targetAt: (dtSeconds: number) => Vec3,
  from: Vec3,
  speed: number,
  standoff: number,
): Intercept | null {
  return solveInterceptReach(targetAt, from, (T) => speed * T, standoff, (d) => d / speed);
}

/**
 * General form: `reach(T)` is how far the ship can get in time T (increasing), and
 * `guess(d)` a rough time to cover distance d (used to start the bracket). The 1 g rocket
 * uses this with its flip-and-burn reach.
 */
export function solveInterceptReach(
  targetAt: (dtSeconds: number) => Vec3,
  from: Vec3,
  reach: (T: number) => number,
  standoff: number,
  guess: (d: number) => number,
): Intercept | null {
  const f = (T: number) => distance(targetAt(T), from) - standoff - reach(T);
  const f0 = f(0);
  if (f0 <= 0) return { time: 0, targetAtArrival: targetAt(0) };

  let lo = 0;
  let hi = Math.max(guess(f0), 1e-3);
  let fhi = f(hi);
  while (fhi > 0) {
    lo = hi;
    hi *= 2;
    if (hi > MAX_TIME_S) return null;
    fhi = f(hi);
  }
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7 * Math.max(1, hi)) break;
  }
  return { time: hi, targetAtArrival: targetAt(hi) };
}
