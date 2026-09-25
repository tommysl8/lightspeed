/**
 * The laboratory's two clocks.
 *
 *  - t: coordinate time in the Sun's rest frame S since the last zero. For a clock at rest on
 *    Earth this differs from S time only by effects the app ignores (Earth's 30 km/s orbital
 *    motion: 5 parts in 10⁹; gravity: a few parts in 10⁹).
 *  - τ: proper time of the observer (the camera, or the ship during a trip).
 *
 * Near everyday speeds t − τ is a few parts in 10⁹ of t, far below the rounding of a
 * millisecond timestamp, so the clocks keep the lag L = t − τ as its own sum,
 * dL = dt (1 − 1/γ) = dt β²/(1 + √(1 − β²)), which is accurate at any size. During a trip
 * both come from the trip's closed-form solution instead, so "skip to arrival" and large
 * time-warp steps stay exact.
 *
 * After a fictional faster-than-light trip τ has no meaning, so it is flagged invalid until
 * the next zero.
 */
import { C_KM_S } from '../physics/constants';
import { sim } from './sim';

export const chrono = {
  /** Coordinate time since the last zero, s. */
  t: 0,
  /** Lag t − τ, s. */
  lag: 0,
  tauValid: true,
  /** Simulation time (ms, Unix epoch) at the last zero. */
  zeroMs: sim.timeMs,
  /** Set while a trip runs: the clocks at launch. */
  trip: null as null | { t0: number; lag0: number },
};

/** Coordinate time t since the last zero, s. */
export const chronoT = (): number => chrono.t;
/** Observer proper time τ since the last zero, s. */
export const chronoTau = (): number => chrono.t - chrono.lag;

/** 1 − 1/γ = 1 − √(1 − β²), without cancellation at small β. */
export const lagRate = (beta: number): number => {
  const b2 = beta * beta;
  return b2 / (1 + Math.sqrt(Math.max(0, 1 - b2)));
};

/** Reset both clocks to zero now (mid-trip: from the current point of the trip). */
export function zeroChrono(tripElapsed = 0, tripTau = 0): void {
  chrono.t = 0;
  chrono.lag = 0;
  chrono.tauValid = true;
  chrono.zeroMs = sim.timeMs;
  if (chrono.trip) chrono.trip = { t0: -tripElapsed, lag0: -(tripElapsed - tripTau) };
}

/** Called at launch. */
export function chronoLaunch(): void {
  chrono.trip = { t0: chrono.t, lag0: chrono.lag };
}

/**
 * During a trip: the clocks follow the trip. `elapsed` is coordinate time since launch and
 * `lag` the trip's own t − τ (NaN for the fictional warp, which invalidates τ).
 */
export function chronoTrip(elapsed: number, lag: number): void {
  if (!chrono.trip) return;
  chrono.t = chrono.trip.t0 + elapsed;
  if (!Number.isFinite(lag)) chrono.tauValid = false;
  else chrono.lag = chrono.trip.lag0 + lag;
}

export function chronoTripEnd(): void {
  chrono.trip = null;
}

/** Outside trips: advance t by dt and the lag by dt (1 − 1/γ) for the observer's velocity. */
export function chronoIntegrate(dtSim: number): void {
  if (chrono.trip || dtSim <= 0) return;
  const beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);
  chrono.t += dtSim;
  chrono.lag += dtSim * lagRate(beta);
}
