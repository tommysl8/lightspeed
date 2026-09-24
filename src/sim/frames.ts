/**
 * Coordinate frames.
 *
 * World frame: heliocentric, kilometres, J2000 ecliptic axes arranged for three.js (Y up):
 *   world.x = ecliptic x (toward the March equinox of J2000)
 *   world.y = ecliptic z (ecliptic north)
 *   world.z = −ecliptic y
 * This is a proper rotation of the ecliptic frame, so handedness and angles are preserved.
 */
import { Vector3 } from 'three';
import { OBLIQUITY_J2000_DEG } from '../physics/constants';

const EPS = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);

/** J2000 ecliptic (x, y, z) → world. */
export function eclToWorld(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  return out.set(x, z, -y);
}

/** J2000 mean equator (EQJ / ICRF-aligned) (x, y, z) → world. */
export function eqjToWorld(x: number, y: number, z: number, out = new Vector3()): Vector3 {
  const ye = COS_E * y + SIN_E * z;
  const ze = -SIN_E * y + COS_E * z;
  return out.set(x, ze, -ye);
}

/** World → J2000 ecliptic. */
export function worldToEcl(v: Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: -v.z, z: v.y };
}

/** RA/Dec (degrees, EQJ) → unit vector in world axes. */
export function raDecToWorld(raDeg: number, decDeg: number, out = new Vector3()): Vector3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return eqjToWorld(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), out);
}
