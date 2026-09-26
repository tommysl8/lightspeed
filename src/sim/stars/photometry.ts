/**
 * Apparent brightness from any observer position: the distance modulus m = M + 5 log10(d / 10 pc),
 * and the physical sizes that follow from a star's luminosity and temperature.
 *
 * absMag in the catalogue comes from the V magnitude seen from the Sun and the parallax distance,
 * with no correction for interstellar dust. So m reproduces the catalogue V exactly from the Sun,
 * and elsewhere assumes the same (zero) extinction. Dust is negligible inside the Local Bubble
 * (~100 pc) but dims distant disc stars by roughly 1 mag per kpc: those look slightly too faint
 * (and too red, by nothing: no reddening is modelled either) when approached. See stars.md §7.
 */
import { SUN_ABS_V } from './constants';
import type { Vec3 } from './frames';
import type { Stars3D } from './catalogue';
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

/**
 * Bolometric correction BC_V(T) of Flower (1996, ApJ 469, 355) with the coefficients as corrected
 * by Torres (2010, AJ 140, 1158, Table 1), for M_bol = M_V + BC_V. The polynomial runs away below
 * about 3,100 K and above 50,000 K, so the temperature is clamped to that range (the catalogue's
 * colour temperatures stay inside it; the few cooler stars have literature values instead).
 */
export function bolometricCorrection(teffK: number): number {
  const lt = Math.log10(Math.min(50_000, Math.max(3_100, teffK)));
  let c: readonly number[];
  if (lt < 3.7) c = [-0.190537291496456e5, 0.155144866764412e5, -0.421278819301717e4, 0.381476328422343e3];
  else if (lt < 3.9) c = [-0.370510203809015e5, 0.385672629965804e5, -0.150651486316025e5, 0.261724637119416e4, -0.170623810323864e3];
  else c = [-0.118115450538963e6, 0.137145973583929e6, -0.636233812100225e5, 0.147412923562646e5, -0.170587278406872e4, 0.788731721804990e2];
  let bc = 0;
  for (let k = c.length - 1; k >= 0; k--) bc = bc * lt + c[k];
  return bc;
}

/** The Sun's M_bol to use with Flower's corrections: 4.73, as Torres (2010) recommends for consistency with V☉ = −26.76. */
export const SUN_M_BOL = 4.73;

/** Luminosity in solar units from M_V and the temperature (through the bolometric correction). */
export const luminosityFromAbsMag = (absMagV: number, teffK: number): number => 10 ** (-0.4 * (absMagV + bolometricCorrection(teffK) - SUN_M_BOL));

/** Radius in solar radii from the luminosity (L☉) and the effective temperature: Stefan–Boltzmann, R = √L (T☉/T)². */
export const radiusFromLuminosity = (lSun: number, teffK: number, tSunK = 5772): number => Math.sqrt(lSun) * (tSunK / teffK) ** 2;
