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
import { Rotation_GAL_EQJ } from 'astronomy-engine';
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

const GAL_EQJ = Rotation_GAL_EQJ().rot;

/**
 * Galactic longitude/latitude (degrees) → unit vector in world axes. astronomy-engine's
 * galactic → J2000 equatorial rotation, then the same equator → ecliptic step as everything
 * else here (so it agrees with the star catalogue).
 */
export function galacticToWorld(lDeg: number, bDeg: number, out = new Vector3()): Vector3 {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  const gx = Math.cos(b) * Math.cos(l);
  const gy = Math.cos(b) * Math.sin(l);
  const gz = Math.sin(b);
  // astronomy-engine's convention (RotateVector): v′ᵢ = Σⱼ rot[j][i] vⱼ
  const x = GAL_EQJ[0][0] * gx + GAL_EQJ[1][0] * gy + GAL_EQJ[2][0] * gz;
  const y = GAL_EQJ[0][1] * gx + GAL_EQJ[1][1] * gy + GAL_EQJ[2][1] * gz;
  const z = GAL_EQJ[0][2] * gx + GAL_EQJ[1][2] * gy + GAL_EQJ[2][2] * gz;
  return eqjToWorld(x, y, z, out);
}
