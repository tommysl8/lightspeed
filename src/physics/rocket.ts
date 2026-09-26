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
 * Numerics: every expression is written so it keeps its relative precision, to within a few
 * parts in 10¹⁶, from a one-second hop (rapidity 3 × 10⁻⁸) to intergalactic trips (γ ≈ 10⁹):
 * cosh φ − 1 as 2 sinh²(φ/2), acosh(1 + x) through asinh, t − τ as (c/a)(sinh φ − φ) with a
 * series for small φ, and a whole trip's Earth time and peak γ straight from the distance,
 * without going through the rapidity (sinh and cosh of a rounded φ would multiply its
 * rounding error by φ, about 21 at γ = 10⁹).
 */
import { C_KM_S, G0_KM_S2 } from './constants';

/** cosh φ − 1 without cancellation. */
export function coshMinusOne(phi: number): number {
  const s = Math.sinh(phi / 2);
  return 2 * s * s;
}

/**
 * sinh φ − φ without cancellation. Below |φ| = 1 a series (to φ²¹, truncated at 2 × 10⁻²²
 * relative); above it sinh φ is at least 6.7 times the difference, so the subtraction loses
 * less than three bits.
 */
export function sinhMinusX(phi: number): number {
  if (Math.abs(phi) < 1) {
    const p2 = phi * phi;
    // φ³/3! (1 + φ²/(4·5) (1 + φ²/(6·7) (1 + …)))
    let s = 1 + p2 / 420;
    for (const d of [342, 272, 210, 156, 110, 72, 42, 20]) s = 1 + (p2 / d) * s;
    return ((phi * p2) / 6) * s;
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
  /**
   * Rapidity φ = artanh β. Exact at any speed: β itself rounds to 1 in float64 above γ ≈ 10⁸,
   * so anything that needs 1 − β (the optics, above all) should work from φ.
   */
  phi: number;
}

/** State after proper time τ (s) of constant proper acceleration a (km/s²) from rest. */
export function acceleratingState(tau: number, a: number = G0_KM_S2): RocketState {
  const phi = (a * tau) / C_KM_S; // rapidity
  return {
    t: (C_KM_S / a) * Math.sinh(phi),
    d: ((C_KM_S * C_KM_S) / a) * coshMinusOne(phi),
    beta: Math.tanh(phi),
    gamma: Math.cosh(phi),
    phi,
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
  // At the midpoint cosh φ = 1 + x, with x = a (d/2)/c², so sinh φ = √(x (2 + x)): exact to a
  // rounding or two at any distance.
  const x = (a * (distance / 2)) / (C_KM_S * C_KM_S);
  const sinhMid = Math.sqrt(x * (2 + x));
  return {
    distance,
    accel: a,
    shipTime: 2 * tauHalf,
    earthTime: 2 * (C_KM_S / a) * sinhMid,
    peakBeta: sinhMid / (1 + x),
    peakGamma: 1 + x,
  };
}

/**
 * State of a flip-and-burn trip at ship time τ (0 … shipTime). Each half is computed from its
 * own end (departure, or arrival mirrored); at the flip they can differ by a rounding, so each
 * is held to its side of the midpoint and t and d never step backwards there.
 */
export function flipAndBurnAt(trip: FlipAndBurnTrip, tau: number): RocketState {
  const half = trip.shipTime / 2;
  const tc = Math.min(Math.max(tau, 0), trip.shipTime);
  if (tc <= half) {
    const s = acceleratingState(tc, trip.accel);
    s.t = Math.min(s.t, trip.earthTime / 2);
    s.d = Math.min(s.d, trip.distance / 2);
    return s;
  }
  // Second half mirrors the first.
  const back = acceleratingState(trip.shipTime - tc, trip.accel);
  return {
    t: Math.max(trip.earthTime - back.t, trip.earthTime / 2),
    d: Math.max(trip.distance - back.d, trip.distance / 2),
    beta: back.beta,
    gamma: back.gamma,
    phi: back.phi,
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
    const phi = Math.asinh(x);
    return { tau: (c / a) * phi, d: ((c * c) / a) * ((x * x) / (g + 1)), beta: x / g, gamma: g, phi };
  };
  if (tc <= T / 2) {
    const s = leg(tc);
    return { t: tc, d: s.d, beta: s.beta, gamma: s.gamma, phi: s.phi, tau: s.tau };
  }
  const s = leg(T - tc);
  return { t: tc, d: trip.distance - s.d, beta: s.beta, gamma: s.gamma, phi: s.phi, tau: trip.shipTime - s.tau };
}

/** Earth (coordinate) time at ship time τ of a flip-and-burn trip. Inverse of shipTimeAtEarthTime. */
export function earthTimeAtShipTime(trip: FlipAndBurnTrip, tau: number): number {
  const tc = Math.min(Math.max(tau, 0), trip.shipTime);
  const k = C_KM_S / trip.accel;
  // Each half held to its side of the midpoint (see flipAndBurnAt).
  const mid = trip.earthTime / 2;
  if (tc <= trip.shipTime / 2) return Math.min(k * Math.sinh(tc / k), mid);
  return Math.max(trip.earthTime - k * Math.sinh((trip.shipTime - tc) / k), mid);
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
