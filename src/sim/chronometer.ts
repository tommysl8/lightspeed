/**
 * The laboratory's two clocks.
 *
 *  - t: coordinate time in the Sun's rest frame S, i.e. simulation time since the last zero.
 *    For a clock at rest on Earth this differs from S time only by effects the app ignores
 *    (Earth's 30 km/s orbital motion: 5 parts in 10⁹; gravity: a few parts in 10⁹).
 *  - τ: proper time of the observer (the camera, or the ship during a trip), integrated as
 *    dτ = dt/γ(v). During a trip it comes from the trip's closed-form solution instead, so
 *    "skip to arrival" and large time-warp steps stay exact.
 *
 * After a fictional faster-than-light trip τ has no meaning, so it is flagged invalid until
 * the next zero.
 */
import { C_KM_S } from '../physics/constants';
import { gamma } from '../physics/relativity';
import { sim } from './sim';

export const chrono = {
  /** Simulation time (ms, Unix epoch) at the last zero. */
  zeroMs: sim.timeMs,
  /** Proper time since the last zero, s. */
  tau: 0,
  tauValid: true,
  /** Set while a trip runs: τ at launch (minus any zeroing during the trip). */
  trip: null as null | { tau0: number },
};

/** Coordinate time t since the last zero, s. */
export const chronoT = (): number => (sim.timeMs - chrono.zeroMs) / 1000;

/** Reset both clocks to zero now. */
export function zeroChrono(currentTripTau = 0): void {
  chrono.zeroMs = sim.timeMs;
  chrono.tau = 0;
  chrono.tauValid = true;
  if (chrono.trip) chrono.trip.tau0 = -currentTripTau;
}

/** Called at launch. */
export function chronoLaunch(): void {
  chrono.trip = { tau0: chrono.tau };
}

/** During a trip: τ = τ(launch) + τ_trip. NaN (fictional warp) invalidates τ. */
export function chronoTrip(tripTau: number): void {
  if (!chrono.trip) return;
  if (!Number.isFinite(tripTau)) chrono.tauValid = false;
  else chrono.tau = chrono.trip.tau0 + tripTau;
}

export function chronoTripEnd(): void {
  chrono.trip = null;
}

/** Outside trips: integrate dτ = dt/γ for the observer's current velocity. */
export function chronoIntegrate(dtSim: number): void {
  if (chrono.trip || dtSim <= 0) return;
  const beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);
  chrono.tau += dtSim / gamma(beta);
}
