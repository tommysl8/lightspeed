/**
 * Apparent brightness from any observer position: the distance modulus m = M + 5 log10(d / 10 pc).
 *
 * absMag in stars3d is derived from the V magnitude seen from the Sun and the parallax distance, with no
 * correction for interstellar dust. So m reproduces the catalogue V exactly from the Sun, and for other observers
 * it assumes the same (zero) extinction. Dust is negligible inside the Local Bubble (~100 pc) but dims distant
 * disc stars by roughly 1 mag per kpc; those stars will look slightly too faint when approached. See stars.md.
 */
import { SUN_ABS_V } from './constants';
import type { Vec3 } from './frames';
import type { Stars3D } from './stars3d';
import { positionSeenFrom } from './motion';

/** Distance modulus m − M for a distance in parsecs. */
export const distanceModulus = (distancePc: number): number => 5 * Math.log10(distancePc) - 5;

/** Apparent magnitude of a star of absolute magnitude M at a distance in parsecs. */
export const apparentMagnitude = (absMag: number, distancePc: number): number => absMag + distanceModulus(distancePc);

/** Flux relative to a magnitude-0 source: 10^(−0.4 m). */
export const fluxFromMagnitude = (m: number): number => 10 ** (-0.4 * m);

/** Apparent V of catalogue star i seen by an observer at rest at `obs` (pc, ecliptic) at Julian year t. */
export function apparentMagnitudeFrom(stars: Stars3D, i: number, obs: Readonly<Vec3>, jy: number = stars.epochJy): number {
  const { position } = positionSeenFrom(stars, i, obs, jy);
  const d = Math.hypot(position[0] - obs[0], position[1] - obs[1], position[2] - obs[2]);
  return apparentMagnitude(stars.absMag[i], d);
}

/** Apparent V of the Sun seen from `obs` (pc, ecliptic), using M_V(Sun) = 4.81 (Willmer 2018). */
export function sunApparentMagnitudeFrom(obs: Readonly<Vec3>): number {
  return apparentMagnitude(SUN_ABS_V, Math.hypot(obs[0], obs[1], obs[2]));
}
