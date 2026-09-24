/**
 * Light-travel time and light-delay solvers, all in the Sun's rest frame.
 */
import { C_KM_S } from './constants';
import { type Vec3, distance } from './vec';

/** Time for light to cross `distanceKm`, in seconds. */
export const lightTime = (distanceKm: number): number => distanceKm / C_KM_S;

/**
 * Light delay to a moving source: the time τ ≥ 0 such that light that left the source at
 * t − τ reaches the observer (fixed at `observer`) at time t:
 *   |x_src(t − τ) − x_obs| = c τ
 * Solved by fixed-point iteration, which converges quickly because sources move much slower
 * than light. `positionAt(dtSeconds)` returns the source position dt seconds from now.
 *
 * "You are seeing Earth as it was τ ago."
 */
export function retardedDelay(
  positionAt: (dtSeconds: number) => Vec3,
  observer: Vec3,
  maxIterations = 12,
  toleranceSeconds = 1e-6,
): number {
  let tau = lightTime(distance(positionAt(0), observer));
  for (let i = 0; i < maxIterations; i++) {
    const next = lightTime(distance(positionAt(-tau), observer));
    if (Math.abs(next - tau) < toleranceSeconds) return next;
    tau = next;
  }
  return tau;
}

/**
 * Signal delay: the time τ ≥ 0 for a signal sent now from `observer` to reach the moving
 * target, i.e. |x_target(t + τ) − x_obs| = c τ.
 *
 * "A message to Earth would take τ."
 */
export function signalDelay(
  positionAt: (dtSeconds: number) => Vec3,
  observer: Vec3,
  maxIterations = 12,
  toleranceSeconds = 1e-6,
): number {
  let tau = lightTime(distance(positionAt(0), observer));
  for (let i = 0; i < maxIterations; i++) {
    const next = lightTime(distance(positionAt(tau), observer));
    if (Math.abs(next - tau) < toleranceSeconds) return next;
    tau = next;
  }
  return tau;
}
