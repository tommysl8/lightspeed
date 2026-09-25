/**
 * Frames.
 *
 * ICRS / "EQJ": equatorial, J2000 mean equator and equinox (ICRS-aligned to ~20 mas, far below
 * anything here). x toward RA 0, z toward the north celestial pole.
 *
 * ECL: the J2000 ecliptic, x toward the March equinox, z toward the ecliptic north pole; obtained
 * from EQJ by a rotation of +epsilon about x with epsilon = 84381.448 arcsec (the same rotation the app
 * and JPL use). Heliocentric positions in the app are in this frame.
 *
 * App world axes (three.js, Y up): world = (x_ecl, z_ecl, -y_ecl). See src/sim/frames.ts.
 *
 * Sky-plane basis at a star (RA alpha, Dec delta), as seen from the Sun:
 *   r (line of sight, away from the Sun) = ( cos d cos a,  cos d sin a,  sin d)
 *   e (east, direction of increasing RA) = (-sin a,        cos a,        0    )
 *   n (north, direction of increasing Dec)= (-sin d cos a, -sin d sin a,  cos d)
 * (n, e, r) is a LEFT-handed triple (n x e = -r): on the sky, east is to the left of north as seen
 * by the observer. Orbits are evaluated in the (north, east, away) components defined by this basis,
 * which is how visual-binary and exoplanet-imaging orbits are published.
 */
import { DEG, OBLIQUITY_J2000_DEG } from './constants.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Offset in the local sky frame of a star: north, east (both in the sky plane) and away (along the line of sight, away from the Sun). */
export interface SkyVec {
  north: number;
  east: number;
  away: number;
}

const EPS = OBLIQUITY_J2000_DEG * DEG;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);

/** Unit vector (EQJ) toward RA/Dec (degrees). */
export function raDecToUnit(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return { x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) };
}

/** The sky basis (north, east, line of sight) at RA/Dec, in EQJ. */
export function skyBasis(raDeg: number, decDeg: number): { n: Vec3; e: Vec3; r: Vec3 } {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cd = Math.cos(d);
  const sd = Math.sin(d);
  return {
    r: { x: cd * ca, y: cd * sa, z: sd },
    e: { x: -sa, y: ca, z: 0 },
    n: { x: -sd * ca, y: -sd * sa, z: cd },
  };
}

/** Sky-frame offset at RA/Dec -> EQJ vector (same length unit). */
export function skyToEquatorial(raDeg: number, decDeg: number, v: SkyVec): Vec3 {
  const { n, e, r } = skyBasis(raDeg, decDeg);
  return {
    x: v.north * n.x + v.east * e.x + v.away * r.x,
    y: v.north * n.y + v.east * e.y + v.away * r.y,
    z: v.north * n.z + v.east * e.z + v.away * r.z,
  };
}

/** EQJ vector -> sky-frame components at RA/Dec (inverse of skyToEquatorial; the basis is orthonormal). */
export function equatorialToSky(raDeg: number, decDeg: number, v: Vec3): SkyVec {
  const { n, e, r } = skyBasis(raDeg, decDeg);
  return {
    north: v.x * n.x + v.y * n.y + v.z * n.z,
    east: v.x * e.x + v.y * e.y + v.z * e.z,
    away: v.x * r.x + v.y * r.y + v.z * r.z,
  };
}

/** EQJ -> J2000 ecliptic. */
export function equatorialToEcliptic(v: Vec3): Vec3 {
  return { x: v.x, y: COS_E * v.y + SIN_E * v.z, z: -SIN_E * v.y + COS_E * v.z };
}

/** J2000 ecliptic -> EQJ. */
export function eclipticToEquatorial(v: Vec3): Vec3 {
  return { x: v.x, y: COS_E * v.y - SIN_E * v.z, z: SIN_E * v.y + COS_E * v.z };
}

/** J2000 ecliptic -> the app's three.js world axes (Y up): (x, z, -y). */
export function eclipticToWorld(v: Vec3): Vec3 {
  return { x: v.x, y: v.z, z: -v.y };
}

/** Sky-frame offset at RA/Dec -> J2000 ecliptic. */
export function skyToEcliptic(raDeg: number, decDeg: number, v: SkyVec): Vec3 {
  return equatorialToEcliptic(skyToEquatorial(raDeg, decDeg, v));
}

/** Position angle (deg east of north, [0, 360)) and separation of a sky offset. */
export function positionAngle(v: SkyVec): { paDeg: number; sep: number } {
  const pa = Math.atan2(v.east, v.north) / DEG;
  return { paDeg: pa < 0 ? pa + 360 : pa, sep: Math.hypot(v.north, v.east) };
}

/** Heliocentric position (J2000 ecliptic, km) of a star from RA/Dec (deg) and distance (km). */
export function starPositionEcliptic(raDeg: number, decDeg: number, distanceKm: number): Vec3 {
  const u = equatorialToEcliptic(raDecToUnit(raDeg, decDeg));
  return { x: u.x * distanceKm, y: u.y * distanceKm, z: u.z * distanceKm };
}
