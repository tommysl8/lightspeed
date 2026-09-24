/**
 * The relativistic rocket: constant proper acceleration a (what the crew feels), starting
 * from rest in the Sun's frame. With proper time τ on board:
 *   coordinate (Earth) time   t = (c/a) sinh(aτ/c)
 *   distance covered          d = (c²/a) (cosh(aτ/c) − 1)
 *   speed                     β = tanh(aτ/c),   γ = cosh(aτ/c)
 * The rapidity aτ/c grows linearly with ship time, which is why a constant 1 g never reaches c.
 *
 * Flip-and-burn trip: accelerate for half the distance, turn around, decelerate to arrive at
 * rest. Everything is symmetric about the midpoint.
 */
import { C_KM_S, G0_KM_S2 } from './constants';

export interface RocketState {
  /** Coordinate (Sun-frame) time since departure, s. */
  t: number;
  /** Distance travelled, km. */
  d: number;
  beta: number;
  gamma: number;
}

/** State after proper time τ (s) of constant proper acceleration a (km/s²) from rest. */
export function acceleratingState(tau: number, a: number = G0_KM_S2): RocketState {
  const phi = (a * tau) / C_KM_S; // rapidity
  return {
    t: (C_KM_S / a) * Math.sinh(phi),
    d: ((C_KM_S * C_KM_S) / a) * (Math.cosh(phi) - 1),
    beta: Math.tanh(phi),
    gamma: Math.cosh(phi),
  };
}

/** Proper time needed to cover distance d (km) from rest at constant proper acceleration a. */
export function properTimeToCover(d: number, a: number = G0_KM_S2): number {
  return (C_KM_S / a) * Math.acosh(1 + (d * a) / (C_KM_S * C_KM_S));
}

export interface FlipAndBurnTrip {
  distance: number;
  accel: number;
  /** Total proper (ship) time, s. */
  shipTime: number;
  /** Total coordinate (Earth) time, s. */
  earthTime: number;
  /** Speed at the midpoint. */
  peakBeta: number;
  peakGamma: number;
}

export function flipAndBurn(distance: number, a: number = G0_KM_S2): FlipAndBurnTrip {
  const tauHalf = properTimeToCover(distance / 2, a);
  const mid = acceleratingState(tauHalf, a);
  return {
    distance,
    accel: a,
    shipTime: 2 * tauHalf,
    earthTime: 2 * mid.t,
    peakBeta: mid.beta,
    peakGamma: mid.gamma,
  };
}

/** State of a flip-and-burn trip at ship time τ (0 … shipTime). */
export function flipAndBurnAt(trip: FlipAndBurnTrip, tau: number): RocketState {
  const half = trip.shipTime / 2;
  const tc = Math.min(Math.max(tau, 0), trip.shipTime);
  if (tc <= half) return acceleratingState(tc, trip.accel);
  // Second half mirrors the first.
  const back = acceleratingState(trip.shipTime - tc, trip.accel);
  return {
    t: trip.earthTime - back.t,
    d: trip.distance - back.d,
    beta: back.beta,
    gamma: back.gamma,
  };
}

/** Flip-and-burn state at coordinate (Earth) time t (0 … earthTime), in closed form. */
export function flipAndBurnAtEarthTime(trip: FlipAndBurnTrip, t: number): RocketState & { tau: number } {
  const a = trip.accel;
  const c = C_KM_S;
  const T = trip.earthTime;
  const tc = Math.min(Math.max(t, 0), T);
  // First half, from rest: at/c = sinh(aτ/c) ⇒ τ = (c/a) asinh(at/c), γ = √(1 + (at/c)²).
  const leg = (time: number) => {
    const x = (a * time) / c;
    const g = Math.sqrt(1 + x * x);
    return { tau: (c / a) * Math.asinh(x), d: ((c * c) / a) * (g - 1), beta: x / g, gamma: g };
  };
  if (tc <= T / 2) {
    const s = leg(tc);
    return { t: tc, d: s.d, beta: s.beta, gamma: s.gamma, tau: s.tau };
  }
  const s = leg(T - tc);
  return { t: tc, d: trip.distance - s.d, beta: s.beta, gamma: s.gamma, tau: trip.shipTime - s.tau };
}

/**
 * Mass ratio (initial / final) for a perfect photon rocket (exhaust speed c) doing the whole
 * flip-and-burn: from the relativistic rocket equation, Δ(rapidity) = ln(m_i/m_f) when the
 * exhaust leaves at c.
 */
export function photonRocketMassRatio(trip: FlipAndBurnTrip): number {
  return Math.exp((2 * trip.accel * (trip.shipTime / 2)) / C_KM_S);
}
