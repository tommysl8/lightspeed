/**
 * Star motion over time: straight-line (linear) space motion from the catalogue epoch.
 *
 * Catalogue positions are astrometric: the direction light arrives from at the Solar System barycentre at J2000,
 * placed at the parallax distance. That light left the star d/c earlier, so where the star actually is at J2000
 * ("coordinate position") differs by v·d/c — up to ~0.2 pc for a fast star 1 kpc away. Three views are provided:
 *
 *   positionSeenFromSun(t)       what an observer at the Sun sees at time t (to first order in v/c)
 *   positionAt(t)                where the star is at coordinate time t (heliocentric frame)
 *   positionSeenFrom(obs, t)     what an observer at rest (heliocentric frame) at `obs` sees at time t: the retarded
 *                                position on the observer's past light cone, exact for straight-line motion
 *
 * The app's own aberration and Doppler for a moving ship are applied on top of positionSeenFrom.
 *
 * Validity: linear motion ignores the Galaxy's gravity. After 1 Myr the Galactic tide has moved a star 100 pc away
 * by only ~0.04 pc relative to the straight line, less than the effect of velocity errors (1 km/s ≈ 1 pc/Myr).
 * Beyond that, errors grow quadratically; results are flagged, not refused.
 */
import { KMS_TO_PC_PER_YR } from './constants';
import type { Vec3 } from './frames';
import type { Stars3D } from './stars3d';
import { velocityStatus, VelocityStatus } from './stars3d';

/** Speed of light, parsecs per Julian year. */
export const C_PC_PER_YR = 299_792.458 * KMS_TO_PC_PER_YR;
/** Time span around the epoch over which straight-line motion is considered reliable, years. */
export const MOTION_VALID_YEARS = 1e6;

export type MotionQuality = 'ok' | 'beyond-validity' | 'no-radial-velocity' | 'no-velocity';

/** Quality of the motion model for star i at Julian year t. */
export function motionQuality(stars: Stars3D, i: number, jy: number): MotionQuality {
  const vs = velocityStatus(stars.flags[i]);
  if (vs === VelocityStatus.Unknown || vs === VelocityStatus.Rejected) return jy === stars.epochJy ? 'ok' : 'no-velocity';
  if (Math.abs(jy - stars.epochJy) > MOTION_VALID_YEARS) return 'beyond-validity';
  if (vs === VelocityStatus.NoRadialVelocity && jy !== stars.epochJy) return 'no-radial-velocity';
  return 'ok';
}

function read(stars: Stars3D, i: number): { p: Vec3; v: Vec3 } {
  const P = stars.positions;
  const V = stars.velocities;
  return {
    p: [P[3 * i], P[3 * i + 1], P[3 * i + 2]],
    v: [V[3 * i] * KMS_TO_PC_PER_YR, V[3 * i + 1] * KMS_TO_PC_PER_YR, V[3 * i + 2] * KMS_TO_PC_PER_YR],
  };
}

/** Position (pc, ecliptic) seen from the Sun at Julian year t: r0 + v (t − t0). Matches the catalogue at t0. */
export function positionSeenFromSun(stars: Stars3D, i: number, jy: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const { p, v } = read(stars, i);
  const dt = jy - stars.epochJy;
  out[0] = p[0] + v[0] * dt;
  out[1] = p[1] + v[1] * dt;
  out[2] = p[2] + v[2] * dt;
  return out;
}

/** Coordinate position (pc, ecliptic) at Julian year t in the heliocentric frame: r0 + v (t − t0 + |r0|/c). */
export function positionAt(stars: Stars3D, i: number, jy: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const { p, v } = read(stars, i);
  const dt = jy - stars.epochJy + Math.hypot(p[0], p[1], p[2]) / C_PC_PER_YR;
  out[0] = p[0] + v[0] * dt;
  out[1] = p[1] + v[1] * dt;
  out[2] = p[2] + v[2] * dt;
  return out;
}

/**
 * Retarded position (pc, ecliptic) of star i as seen at Julian year t by an observer at rest in the heliocentric
 * frame at `obs` (pc, ecliptic): the point r(te) with |r(te) − obs| = c (t − te), solved exactly for linear motion.
 * Also returns the emission time te and the light-travel time.
 */
export function positionSeenFrom(
  stars: Stars3D,
  i: number,
  obs: Readonly<Vec3>,
  jy: number,
): { position: Vec3; emittedJy: number; lightTimeYr: number } {
  const { p, v } = read(stars, i);
  const c = C_PC_PER_YR;
  // r(te) = a + v * te' with te' = te − t, a = coordinate position at time t
  const dt = jy - stars.epochJy + Math.hypot(p[0], p[1], p[2]) / c;
  const a: Vec3 = [p[0] + v[0] * dt - obs[0], p[1] + v[1] * dt - obs[1], p[2] + v[2] * dt - obs[2]];
  // |a + v s|^2 = c^2 s^2 with s = te − t <= 0  →  (v·v − c²) s² + 2 (a·v) s + a·a = 0
  const A = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - c * c;
  const B = 2 * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
  const C = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
  // A < 0; the root with s <= 0 is (−B + disc) / (2A)
  const s = (-B + disc) / (2 * A);
  const position: Vec3 = [a[0] + v[0] * s + obs[0], a[1] + v[1] * s + obs[1], a[2] + v[2] * s + obs[2]];
  return { position, emittedJy: jy + s, lightTimeYr: -s };
}

/**
 * Positions of all stars seen from the Sun at Julian year t, written into `out` (3 floats per star). For GPU use the
 * same formula in a vertex shader: position + velocity * (t − 2000) * 1.0227e-6 (velocity in km/s).
 */
export function positionsSeenFromSun(stars: Stars3D, jy: number, out = new Float32Array(3 * stars.count)): Float32Array {
  const k = (jy - stars.epochJy) * KMS_TO_PC_PER_YR;
  const P = stars.positions;
  const V = stars.velocities;
  for (let j = 0; j < 3 * stars.count; j++) out[j] = P[j] + V[j] * k;
  return out;
}

/** Closest approach to the Sun of star i under straight-line motion (coordinate positions). */
export function closestApproachToSun(stars: Stars3D, i: number): { jy: number; distancePc: number; speedKms: number } {
  const { p, v } = read(stars, i);
  const r0 = Math.hypot(p[0], p[1], p[2]);
  const lt = r0 / C_PC_PER_YR;
  const q: Vec3 = [p[0] + v[0] * lt, p[1] + v[1] * lt, p[2] + v[2] * lt]; // coordinate position at t0
  const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (vv === 0) return { jy: stars.epochJy, distancePc: r0, speedKms: 0 };
  const tau = -(q[0] * v[0] + q[1] * v[1] + q[2] * v[2]) / vv;
  const d = Math.hypot(q[0] + v[0] * tau, q[1] + v[1] * tau, q[2] + v[2] * tau);
  return { jy: stars.epochJy + tau, distancePc: d, speedKms: Math.sqrt(vv) / KMS_TO_PC_PER_YR };
}
