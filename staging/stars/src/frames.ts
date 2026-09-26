/**
 * Coordinate frames.
 *
 * The star files use the J2000 ecliptic frame: x toward the J2000 equinox, z toward the north ecliptic pole, y
 * completing a right-handed set. It is ICRS rotated about x by the J2000 obliquity (84381.448″), the same rotation
 * the app and JPL use for "ecliptic of J2000". The 23-mas frame bias between ICRS and the dynamical J2000 equator is
 * below the precision of the star files and is ignored.
 *
 * The app's world axes are world = (x_ecl, z_ecl, −y_ecl) (ecliptic north is +Y).
 */
import { OBLIQUITY_J2000 } from './constants';

export type Vec3 = [number, number, number];

const COS_E = Math.cos(OBLIQUITY_J2000);
const SIN_E = Math.sin(OBLIQUITY_J2000);
const DEG = Math.PI / 180;

/** ICRS (equatorial J2000) → J2000 ecliptic. */
export function equatorialToEcliptic(v: Readonly<Vec3>): Vec3 {
  return [v[0], COS_E * v[1] + SIN_E * v[2], -SIN_E * v[1] + COS_E * v[2]];
}

/** J2000 ecliptic → ICRS (equatorial J2000). */
export function eclipticToEquatorial(v: Readonly<Vec3>): Vec3 {
  return [v[0], COS_E * v[1] - SIN_E * v[2], SIN_E * v[1] + COS_E * v[2]];
}

/** J2000 ecliptic → app world axes (x, z, −y). */
export function eclipticToWorld(v: Readonly<Vec3>): Vec3 {
  return [v[0], v[2], -v[1]];
}

/** App world axes → J2000 ecliptic. */
export function worldToEcliptic(v: Readonly<Vec3>): Vec3 {
  return [v[0], -v[2], v[1]];
}

/** Unit vector (ICRS) from right ascension and declination in degrees. */
export function unitFromRaDec(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** Right ascension and declination (degrees, RA in [0, 360)) of an ICRS vector. */
export function raDecFromVector(v: Readonly<Vec3>): { raDeg: number; decDeg: number; r: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  const ra = (Math.atan2(v[1], v[0]) / DEG + 360) % 360;
  return { raDeg: ra, decDeg: Math.asin(v[2] / r) / DEG, r };
}

/** Local sky basis at (ra, dec): unit vectors toward the star, east and north (ICRS). */
export function skyBasis(raDeg: number, decDeg: number): { toward: Vec3; east: Vec3; north: Vec3 } {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return {
    toward: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)],
    east: [-Math.sin(a), Math.cos(a), 0],
    north: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
  };
}
