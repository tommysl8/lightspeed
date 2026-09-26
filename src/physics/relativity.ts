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

// ─── Rapidity forms: exact at any γ ──────────────────────────────────────────────────────
//
// Near c, β itself is the wrong variable: β = tanh φ rounds to 1 in float64 above γ ≈ 10⁸
// (in float32 above γ ≈ 3000), and 1 − β cos θ cancels catastrophically long before that. The
// forms below take the rapidity φ = artanh β and half-angles instead, and never subtract
// nearly equal numbers:
//   aberration   tan(θ′/2) = e^−φ tan(θ/2)
//   Doppler      D = γ(1 + β cos θ)  = e^φ cos²(θ/2) + e^−φ sin²(θ/2)      (rest-frame angle θ)
//                1/D = γ(1 − β cos θ′) = e^−φ cos²(θ′/2) + e^φ sin²(θ′/2)   (ship-frame angle θ′)
// Half-angles come from chords of unit vectors, |d − v| = 2 sin(θ/2) and |d + v| = 2 cos(θ/2),
// which stay accurate right up to the apex and the antapex. The shaders mirror these.

/** Rapidity of a speed in km/s (Infinity at or above c). */
export function rapidityFromSpeed(kmPerS: number): number {
  const b = Math.abs(kmPerS) / C_KM_S;
  return b >= 1 ? Infinity : Math.atanh(b);
}

/** ln(eᵃ + eᵇ) without overflow or underflow. */
export function logAddExp(a: number, b: number): number {
  const m = Math.max(a, b);
  if (m === -Infinity) return -Infinity;
  return m + Math.log1p(Math.exp(Math.min(a, b) - m));
}

// Results of halfAngles (module scratch: these run per body per frame, so no allocation).
let hs2 = 0;
let hc2 = 1;

/** Sets hs2 = sin²(θ/2) and hc2 = cos²(θ/2) of the angle between unit vectors, from chords. */
function halfAngles(d: Vec3, v: Vec3): void {
  const ax = d.x - v.x;
  const ay = d.y - v.y;
  const az = d.z - v.z;
  const bx = d.x + v.x;
  const by = d.y + v.y;
  const bz = d.z + v.z;
  const s2 = ax * ax + ay * ay + az * az;
  const c2 = bx * bx + by * by + bz * bz;
  const n = s2 + c2; // 4 for exact unit vectors; dividing removes rounding in their lengths
  hs2 = s2 / n;
  hc2 = c2 / n;
}

/** ln D for light arriving from rest-frame direction `dRest` (unit), ship moving along `velDir` with rapidity φ. */
export function lnDopplerFromRestDir(dRest: Vec3, velDir: Vec3, phi: number): number {
  if (phi === 0) return 0;
  halfAngles(dRest, velDir);
  return logAddExp(phi + Math.log(hc2), -phi + Math.log(hs2));
}

/** ln D for light seen from ship-frame direction `dShip` (unit). */
export function lnDopplerFromShipDir(dShip: Vec3, velDir: Vec3, phi: number): number {
  if (phi === 0) return 0;
  halfAngles(dShip, velDir);
  return -logAddExp(-phi + Math.log(hc2), phi + Math.log(hs2));
}

/**
 * Rotate unit vector `dir` about `axis` to half-angle-tangent ratio `k`: the result keeps
 * dir's azimuth about the axis and has tan(new/2) = k · tan(old/2).
 */
function scaleHalfAngle(dir: Vec3, axis: Vec3, k: number, out: Vec3): Vec3 {
  halfAngles(dir, axis);
  const theta = 2 * Math.atan2(k * Math.sqrt(hs2), Math.sqrt(hc2));
  const c = dot(dir, axis);
  let px = dir.x - c * axis.x;
  let py = dir.y - c * axis.y;
  let pz = dir.z - c * axis.z;
  // Project a second time: within 10⁻⁹ rad of the axis the first pass leaves an along-axis residue
  // of ~10⁻⁷ relative to the tiny perpendicular part, which the rescaling below would magnify.
  const r = px * axis.x + py * axis.y + pz * axis.z;
  px -= r * axis.x;
  py -= r * axis.y;
  pz -= r * axis.z;
  const pl = Math.hypot(px, py, pz);
  const cs = Math.cos(theta);
  if (pl < 1e-300) {
    const sign = c >= 0 ? 1 : -1;
    out.x = axis.x * sign;
    out.y = axis.y * sign;
    out.z = axis.z * sign;
    return out;
  }
  const sn = Math.sin(theta) / pl;
  out.x = cs * axis.x + sn * px;
  out.y = cs * axis.y + sn * py;
  out.z = cs * axis.z + sn * pz;
  return out;
}

/** aberrateToShip in rapidity form: exact at any γ. Writes into `out` when given. */
export function aberrateToShipRapidity(dirRest: Vec3, velDir: Vec3, phi: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  return scaleHalfAngle(dirRest, velDir, Math.exp(-phi), out);
}

/** aberrateToRest in rapidity form: exact at any γ. Writes into `out` when given. */
export function aberrateToRestRapidity(dirShip: Vec3, velDir: Vec3, phi: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  return scaleHalfAngle(dirShip, velDir, Math.exp(phi), out);
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
