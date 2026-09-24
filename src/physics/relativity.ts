/**
 * Special relativity for an observer (the ship) moving at speed β = v/c through the Sun's
 * rest frame. Pure functions; the GLSL in src/render/shaders/relativity.glsl mirrors them.
 *
 * Conventions
 *  - β is the ship's speed as a fraction of c, measured in the Sun's rest frame.
 *  - θ′ ("ship angle") is the angle between the direction you look (toward a light source) and
 *    the direction of motion, measured in the ship's frame. θ is the same angle measured in
 *    the Sun's rest frame.
 *  - D is the Doppler factor: ν_observed = D · ν_emitted. D > 1 means blueshift.
 */
import { C_KM_S } from './constants';
import { type Vec3, dot, normalize, scale, sub, add, length } from './vec';

/** Lorentz factor γ = 1/√(1 − β²). Written as (1−β)(1+β) to avoid cancellation as β → 1. */
export function gamma(beta: number): number {
  const b = Math.abs(beta);
  if (b >= 1) return Infinity;
  return 1 / Math.sqrt((1 - b) * (1 + b));
}

/** β from γ (γ ≥ 1). */
export function betaFromGamma(g: number): number {
  if (g <= 1) return 0;
  return Math.sqrt(1 - 1 / (g * g));
}

/** Rapidity φ = artanh β. Rapidities add linearly under collinear boosts. */
export const rapidity = (beta: number): number => Math.atanh(beta);
export const betaFromRapidity = (phi: number): number => Math.tanh(phi);

/** Speed in km/s for a given β. */
export const speedKmS = (beta: number): number => beta * C_KM_S;
/** β for a speed in km/s. */
export const betaFromSpeed = (kmPerS: number): number => kmPerS / C_KM_S;

/** Proper (ship) time elapsed during coordinate (Sun-frame) time t at constant β: τ = t/γ. */
export const properTime = (coordinateTime: number, beta: number): number => coordinateTime / gamma(beta);

/** Length contraction: a rest-frame distance L measured by the moving ship is L/γ. */
export const contractedLength = (restLength: number, beta: number): number => restLength / gamma(beta);

/**
 * Relativistic kinetic energy per unit rest mass, in units of c²: (γ − 1).
 * Diverges as β → 1, which is why nothing with mass reaches c.
 */
export const kineticEnergyPerRestEnergy = (beta: number): number => gamma(beta) - 1;

// ─── Aberration ──────────────────────────────────────────────────────────────────────────

/**
 * Ship-frame angle → rest-frame angle of the same light ray:
 *   cos θ = (cos θ′ − β) / (1 − β cos θ′)
 * The rest-frame angle is larger: the sky you see is bunched toward the direction of travel.
 */
export function cosRestFromShip(cosShip: number, beta: number): number {
  return (cosShip - beta) / (1 - beta * cosShip);
}

/** Rest-frame angle → ship-frame angle: cos θ′ = (cos θ + β) / (1 + β cos θ). */
export function cosShipFromRest(cosRest: number, beta: number): number {
  return (cosRest + beta) / (1 + beta * cosRest);
}

// ─── Doppler shift and beaming ───────────────────────────────────────────────────────────

/** Doppler factor for light arriving from ship-frame angle θ′: D = 1 / (γ (1 − β cos θ′)). */
export function dopplerFromShipAngle(cosShip: number, beta: number): number {
  return 1 / (gamma(beta) * (1 - beta * cosShip));
}

/** The same Doppler factor written with the rest-frame angle: D = γ (1 + β cos θ). */
export function dopplerFromRestAngle(cosRest: number, beta: number): number {
  return gamma(beta) * (1 + beta * cosRest);
}

/** Head-on (θ′ = 0) Doppler factor: √((1 + β)/(1 − β)). */
export function dopplerHeadOn(beta: number): number {
  return Math.sqrt((1 + beta) / (1 - beta));
}

/**
 * Solid-angle Jacobian dΩ′/dΩ = 1/D². A patch of sky ahead (D > 1) shrinks in the ship
 * frame, and a patch behind (D < 1) grows.
 */
export const solidAngleRatio = (D: number): number => 1 / (D * D);

/**
 * Radiance (surface brightness) transformation for extended sources. I_ν/ν³ is Lorentz
 * invariant, so bolometric radiance scales as D⁴.
 */
export const radianceFactor = (D: number): number => D ** 4;

/**
 * Bolometric flux from a point source at rest in the Sun's frame, seen by the moving ship:
 * radiance × solid angle = D⁴ · D⁻² = D². (The D⁴ often quoted for point sources applies to
 * a moving *source* at a fixed distance in the observer's frame, which is a different setup.)
 */
export const pointFluxFactor = (D: number): number => D * D;

/** Observed temperature of a blackbody seen with Doppler factor D. The result is still a blackbody. */
export const dopplerTemperature = (temperature: number, D: number): number => temperature * D;

// ─── Velocity addition ───────────────────────────────────────────────────────────────────

/**
 * Relativistic velocity addition (km/s): the rest-frame velocity of something moving at `v`
 * relative to a frame that itself moves at `u`:
 *   w = (u + v∥ + v⊥/γᵤ) / (1 + u·v/c²)
 * The result is always slower than light when |u|, |v| < c.
 */
export function addVelocities(u: Vec3, v: Vec3): Vec3 {
  const u2 = dot(u, u);
  if (u2 === 0) return { ...v };
  const c2 = C_KM_S * C_KM_S;
  const gu = gamma(Math.sqrt(u2) / C_KM_S);
  const uv = dot(u, v);
  const vPar = scale(u, uv / u2);
  const vPerp = sub(v, vPar);
  const num = add(add(u, vPar), scale(vPerp, 1 / gu));
  return scale(num, 1 / (1 + uv / c2));
}

// ─── Vector forms ────────────────────────────────────────────────────────────────────────

/**
 * Aberrate a rest-frame viewing direction (unit vector from the ship toward a source) into
 * the ship frame. `velDir` is the unit direction of the ship's velocity in the rest frame.
 */
export function aberrateToShip(dirRest: Vec3, velDir: Vec3, beta: number): Vec3 {
  return rotateInPlane(dirRest, velDir, cosShipFromRest(dot(dirRest, velDir), beta));
}

/** Inverse of aberrateToShip: ship-frame viewing direction → rest-frame viewing direction. */
export function aberrateToRest(dirShip: Vec3, velDir: Vec3, beta: number): Vec3 {
  return rotateInPlane(dirShip, velDir, cosRestFromShip(dot(dirShip, velDir), beta));
}

/**
 * Keep the component of `dir` perpendicular to `axis` (its azimuth) but set the polar
 * angle so that cos(angle to axis) = newCos.
 */
function rotateInPlane(dir: Vec3, axis: Vec3, newCos: number): Vec3 {
  const c = Math.max(-1, Math.min(1, newCos));
  const perp = sub(dir, scale(axis, dot(dir, axis)));
  const pl = length(perp);
  if (pl < 1e-15) return scale(axis, c >= 0 ? 1 : -1);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  return normalize(add(scale(axis, c), scale(perp, s / pl)));
}
