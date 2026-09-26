/**
 * The observer's rapidity, the one kinematic quantity the renderer trusts at extreme speed.
 *
 * On a real trip it comes from the trip model's closed form (a 1 g flight to Andromeda peaks at
 * γ ≈ 10⁶, cosmological trips at 10⁹, where v/c has rounded to exactly 1 and the velocity
 * vector no longer carries the speed). Otherwise (orbiting, free flight, the fictional warp) it
 * follows from the velocity, which is then far enough below c to be exact.
 */
import { rapidityFromSpeed } from '../physics/relativity';
import { sim } from './sim';
import { travel, tripState } from './travel';

/** φ for the current frame: from the trip when one is under way, else from sim.ship.vel. */
export function shipRapidity(): number {
  const trip = travel.trip;
  if (trip) return trip.warp ? NaN : tripState(trip).phi;
  return rapidityFromSpeed(sim.ship.vel.length());
}

/** Run after the trip and the camera have set this frame's velocity. */
export function updateShipKinematics(): void {
  sim.ship.phi = shipRapidity();
}
