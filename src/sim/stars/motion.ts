/**
 * Star motion over time: straight-line space motion from the catalogue epoch.
 *
 * Catalogue positions are astrometric: the direction light arrives from at the Solar System
 * barycentre at J2000, placed at the parallax distance. That light left the star d/c earlier, so
 * where the star actually is at J2000 (its coordinate position) differs by v·d/c: up to ~0.2 pc
 * for a fast star 1 kpc away. Three views:
 *
 *   positionSeenFromSun(t)      what an observer at the Sun sees at time t (to first order in v/c)
 *   positionAt(t)               where the star is at coordinate time t (heliocentric frame)
 *   positionSeenFrom(obs, t)    what an observer at rest (heliocentric frame) at `obs` sees at time
 *                               t: the retarded position on the observer's past light cone, exact
 *                               for straight-line motion
 *
 * The app's registry places a star at its coordinate position (positionAt); the light-time
 * correction then gives what the camera sees, and the ship's own aberration and Doppler shift go
 * on top. The GPU does the same per star (shaders/stars.vert.glsl).
 *
 * Validity: straight lines ignore the Galaxy's gravity. After 1 Myr the Galactic tide has moved a
 * star 100 pc away by only ~0.04 pc from the straight line, less than a 1 km/s velocity error
 * would (≈ 1 pc per Myr). Beyond ±1 Myr the app freezes the stars (motionYears) and says so.
 */
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';
import type { Vec3 } from './frames';
import type { Stars3D } from './catalogue';
import { velocityStatus, VelocityStatus } from './catalogue';

export { C_PC_PER_YR, MOTION_VALID_YEARS };

export type MotionQuality = 'ok' | 'beyond-validity' | 'no-radial-velocity' | 'no-velocity';

/** Years since J2000 that the app moves stars by at Julian year `jy`: frozen beyond ±1 Myr. */
export const motionYears = (jy: number): number => Math.max(-MOTION_VALID_YEARS, Math.min(MOTION_VALID_YEARS, jy - 2000));

/** Whether star motion is frozen at Julian year `jy` (more than a million years from J2000). */
export const motionFrozen = (jy: number): boolean => Math.abs(jy - 2000) > MOTION_VALID_YEARS;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = 365.25 * 86_400_000;

/** A sentence for the interface when the stars stand still (more than a million years from 2000), else null. */
export function starMotionNote(ms: number): string | null {
  const years = (ms - J2000_MS) / YEAR_MS;
  if (Math.abs(years) <= MOTION_VALID_YEARS) return null;
  return `The stars are held where they would be a million years ${years > 0 ? 'after' : 'before'} 2000: beyond that, their straight-line motion is not trusted.`;
}

/** Quality of the motion model for star i at Julian year t. */
export function motionQuality(stars: Stars3D, i: number, jy: number): MotionQuality {
  const vs = velocityStatus(stars.flags[i]);
  if (vs === VelocityStatus.Unknown || vs === VelocityStatus.Rejected) return jy === stars.epochJy ? 'ok' : 'no-velocity';
  if (Math.abs(jy - stars.epochJy) > MOTION_VALID_YEARS) return 'beyond-validity';
  if (vs === VelocityStatus.NoRadialVelocity && jy !== stars.epochJy) return 'no-radial-velocity';
  return 'ok';
}

/** Position (pc) and velocity (km/s) of catalogue star i, J2000 ecliptic. */
export function catalogueRow(stars: Stars3D, i: number, pos: Vec3 = [0, 0, 0], velKms: Vec3 = [0, 0, 0]): { pos: Vec3; velKms: Vec3 } {
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const u = stars.velocityUnitKms;
  for (let k = 0; k < 3; k++) {
    pos[k] = P[3 * i + k];
    velKms[k] = V[3 * i + k] * u;
  }
  return { pos, velKms };
}

function read(stars: Stars3D, i: number): { p: Vec3; v: Vec3 } {
  const { pos, velKms } = catalogueRow(stars, i);
  return { p: pos, v: [velKms[0] * KMS_TO_PC_PER_YR, velKms[1] * KMS_TO_PC_PER_YR, velKms[2] * KMS_TO_PC_PER_YR] };
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
 * Retarded position (pc, ecliptic) of star i as seen at Julian year t by an observer at rest in the
 * heliocentric frame at `obs` (pc, ecliptic): the point r(te) with |r(te) − obs| = c (t − te),
 * solved exactly for linear motion. Also returns the emission time te and the light-travel time.
 */
export function positionSeenFrom(stars: Stars3D, i: number, obs: Readonly<Vec3>, jy: number): { position: Vec3; emittedJy: number; lightTimeYr: number } {
  const { p, v } = read(stars, i);
  const c = C_PC_PER_YR;
  // r(te) = a + v s with s = te − t, a = coordinate position at time t (relative to the observer)
  const dt = jy - stars.epochJy + Math.hypot(p[0], p[1], p[2]) / c;
  const a: Vec3 = [p[0] + v[0] * dt - obs[0], p[1] + v[1] * dt - obs[1], p[2] + v[2] * dt - obs[2]];
  // |a + v s|² = c² s²  →  (v·v − c²) s² + 2 (a·v) s + a·a = 0, with s ≤ 0
  const A = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - c * c;
  const B = 2 * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
  const C = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C));
  const s = (-B + disc) / (2 * A); // A < 0: this is the root with s ≤ 0
  const position: Vec3 = [a[0] + v[0] * s + obs[0], a[1] + v[1] * s + obs[1], a[2] + v[2] * s + obs[2]];
  return { position, emittedJy: jy + s, lightTimeYr: -s };
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
