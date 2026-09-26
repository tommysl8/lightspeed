/**
 * The laboratory's two clocks.
 *
 *  - t: coordinate time in the Sun's rest frame S since the last zero.
 *  - τ: proper time of the observer (the camera, or the ship during a trip). An observer
 *    moving with Earth runs slow by the velocity term, β²/2 ≈ 4.9 × 10⁻⁹. Real Earth clocks
 *    also sit in the Sun's potential, GM/(rc²) ≈ 9.9 × 10⁻⁹ at 1 au, which this flat-spacetime
 *    model ignores (together ≈ 1.55 × 10⁻⁸, the IAU constant L_B).
 *
 * At everyday speeds t − τ is parts in 10⁹ of t, far below the rounding of a
 * millisecond timestamp, so the clocks keep the lag L = t − τ as its own sum,
 * dL = dt (1 − 1/γ) = dt β²/(1 + √(1 − β²)), which is accurate at any size. τ is kept as a
 * third sum too: on a relativistic trip L is nearly all of t, and t − L would lose τ's digits.
 * During a trip all three come from the trip's closed-form solution (the trip passes its own
 * t, τ and lag, each computed without cancellation), so "skip to arrival", ship-time pacing
 * and large time-warp steps stay exact.
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
  /** Observer proper time τ since the last zero, s. */
  tau: 0,
  tauValid: true,
  /** Simulation time (ms, Unix epoch) at the last zero. */
  zeroMs: sim.timeMs,
  /** Set while a trip runs: the clocks at launch. */
  trip: null as null | { t0: number; lag0: number; tau0: number },
};

/** Coordinate time t since the last zero, s. */
export const chronoT = (): number => chrono.t;
/** Observer proper time τ since the last zero, s. */
export const chronoTau = (): number => chrono.tau;

/** 1 − 1/γ = 1 − √(1 − β²), without cancellation at small β. */
export const lagRate = (beta: number): number => {
  const b2 = beta * beta;
  return b2 / (1 + Math.sqrt(Math.max(0, 1 - b2)));
};

/** Reset both clocks to zero now (mid-trip: from the current point of the trip). */
export function zeroChrono(tripElapsed = 0, tripTau = 0, tripLag = tripElapsed - tripTau): void {
  chrono.t = 0;
  chrono.lag = 0;
  chrono.tau = 0;
  chrono.tauValid = true;
  chrono.zeroMs = sim.timeMs;
  if (chrono.trip) chrono.trip = { t0: -tripElapsed, lag0: -tripLag, tau0: -tripTau };
}

/** Called at launch. */
export function chronoLaunch(): void {
  chrono.trip = { t0: chrono.t, lag0: chrono.lag, tau0: chrono.tau };
}

/**
 * During a trip: the clocks follow the trip. `elapsed` is coordinate time since launch, `lag`
 * the trip's own t − τ and `tau` its ship time (NaN for the fictional warp, which invalidates
 * τ). Pass τ when the trip knows it: it is then taken as is, never recovered from t − lag.
 */
export function chronoTrip(elapsed: number, lag: number, tau: number = elapsed - lag): void {
  if (!chrono.trip) return;
  chrono.t = chrono.trip.t0 + elapsed;
  if (!Number.isFinite(lag) || !Number.isFinite(tau)) chrono.tauValid = false;
  else {
    chrono.lag = chrono.trip.lag0 + lag;
    chrono.tau = chrono.trip.tau0 + tau;
  }
}

export function chronoTripEnd(): void {
  chrono.trip = null;
}

/** Outside trips: advance t by dt and the lag by dt (1 − 1/γ) for the observer's velocity. */
export function chronoIntegrate(dtSim: number): void {
  if (chrono.trip || dtSim <= 0) return;
  const beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);
  const dLag = dtSim * lagRate(beta);
  chrono.t += dtSim;
  chrono.lag += dLag;
  chrono.tau += dtSim - dLag;
}
