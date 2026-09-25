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
 *
 * Numerics: every expression is written so it keeps full relative precision from a one-second
 * hop (rapidity 3 × 10⁻⁸) to intergalactic trips (γ ≈ 10⁹): cosh φ − 1 as 2 sinh²(φ/2),
 * acosh(1 + x) through asinh, and t − τ as (c/a)(sinh φ − φ) with a series for small φ.
 */
import { C_KM_S, G0_KM_S2 } from './constants';

/** cosh φ − 1 without cancellation. */
export function coshMinusOne(phi: number): number {
  const s = Math.sinh(phi / 2);
  return 2 * s * s;
}

/** sinh φ − φ without cancellation (a series below |φ| = 0.1, where the difference is < 2 × 10⁻⁴). */
export function sinhMinusX(phi: number): number {
  if (Math.abs(phi) < 0.1) {
    const p2 = phi * phi;
    return ((phi * p2) / 6) * (1 + (p2 / 20) * (1 + (p2 / 42) * (1 + (p2 / 72) * (1 + p2 / 110))));
  }
  return Math.sinh(phi) - phi;
}

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
    d: ((C_KM_S * C_KM_S) / a) * coshMinusOne(phi),
    beta: Math.tanh(phi),
    gamma: Math.cosh(phi),
  };
}

/** Proper time needed to cover distance d (km) from rest at constant proper acceleration a. */
export function properTimeToCover(d: number, a: number = G0_KM_S2): number {
  // acosh(1 + x) = 2 asinh(√(x/2)): exact for tiny hops as well as huge distances.
  return ((2 * C_KM_S) / a) * Math.asinh(Math.sqrt((d * a) / (2 * C_KM_S * C_KM_S)));
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
    const g = Math.hypot(1, x);
    return { tau: (c / a) * Math.asinh(x), d: ((c * c) / a) * ((x * x) / (g + 1)), beta: x / g, gamma: g };
  };
  if (tc <= T / 2) {
    const s = leg(tc);
    return { t: tc, d: s.d, beta: s.beta, gamma: s.gamma, tau: s.tau };
  }
  const s = leg(T - tc);
  return { t: tc, d: trip.distance - s.d, beta: s.beta, gamma: s.gamma, tau: trip.shipTime - s.tau };
}

/** Earth (coordinate) time at ship time τ of a flip-and-burn trip. Inverse of shipTimeAtEarthTime. */
export function earthTimeAtShipTime(trip: FlipAndBurnTrip, tau: number): number {
  const tc = Math.min(Math.max(tau, 0), trip.shipTime);
  const k = C_KM_S / trip.accel;
  if (tc <= trip.shipTime / 2) return k * Math.sinh(tc / k);
  return trip.earthTime - k * Math.sinh((trip.shipTime - tc) / k);
}

/** Ship (proper) time at Earth time t of a flip-and-burn trip. Inverse of earthTimeAtShipTime. */
export function shipTimeAtEarthTime(trip: FlipAndBurnTrip, t: number): number {
  const tc = Math.min(Math.max(t, 0), trip.earthTime);
  const k = C_KM_S / trip.accel;
  if (tc <= trip.earthTime / 2) return k * Math.asinh(tc / k);
  return trip.shipTime - k * Math.asinh((trip.earthTime - tc) / k);
}

/**
 * The lag t − τ at ship time τ, computed directly rather than as a difference: 1.8 × 10⁻¹⁶ s
 * after the first second of a 1 g burn, nearly all of t on a relativistic trip, exact either way.
 */
export function flipAndBurnLag(trip: FlipAndBurnTrip, tau: number): number {
  const tc = Math.min(Math.max(tau, 0), trip.shipTime);
  const k = C_KM_S / trip.accel;
  const half = trip.shipTime / 2;
  if (tc <= half) return k * sinhMinusX(tc / k);
  // Second half mirrors the first: lag = 2·lag(half) − lag(remaining).
  return 2 * k * sinhMinusX(half / k) - k * sinhMinusX((trip.shipTime - tc) / k);
}

/**
 * Mass ratio (initial / final) for a perfect photon rocket (exhaust speed c) doing the whole
 * flip-and-burn: from the relativistic rocket equation, Δ(rapidity) = ln(m_i/m_f) when the
 * exhaust leaves at c.
 */
export function photonRocketMassRatio(trip: FlipAndBurnTrip): number {
  return Math.exp((2 * trip.accel * (trip.shipTime / 2)) / C_KM_S);
}
