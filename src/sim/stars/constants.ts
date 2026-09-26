/**
 * Units and constants of the star files (docs/data/stars.md). The values match
 * scripts/build-stars3d.mjs and physics/constants.ts.
 */
import { AU_KM, C_KM_S, JULIAN_YEAR_S, PARSEC_KM } from '../../physics/constants';

export { AU_KM, PARSEC_KM };

/** Astronomical units per parsec (648000/π). */
export const AU_PER_PC = 648_000 / Math.PI;
/** 1 km/s in parsecs per Julian year (≈ 1.0227 × 10⁻⁶). */
export const KMS_TO_PC_PER_YR = JULIAN_YEAR_S / PARSEC_KM;
/** Speed of light in parsecs per Julian year (≈ 0.30660). */
export const C_PC_PER_YR = C_KM_S * KMS_TO_PC_PER_YR;
/** Julian date of the J2000.0 epoch (TT). */
export const JD_J2000 = 2_451_545.0;
/** Obliquity of the J2000 ecliptic, rad (84381.448″, IAU 1976; as used by JPL and the app). */
export const OBLIQUITY_J2000 = ((84_381.448 / 3600) * Math.PI) / 180;
/** Nominal solar values, IAU 2015 Resolution B3. */
export const SUN_RADIUS_KM = 695_700;
export const SUN_LUMINOSITY_W = 3.828e26;
export const SUN_TEFF_K = 5772;
/** Absolute visual magnitude of the Sun (Willmer 2018, ApJS 236, 47: M_V = 4.81). */
export const SUN_ABS_V = 4.81;
/** Solar mass parameter GM☉, km³/s² (IAU 2015 B3). */
export const GM_SUN_KM3_S2 = 1.327_124_4e11;

/**
 * Straight-line motion is trusted this many years either side of J2000 (docs/data/stars.md §6):
 * after a million years the Galaxy's tide has bent a star's path by less than a 1 km/s error in
 * its velocity would move it. Beyond that, star positions are frozen at the edge and labelled.
 */
export const MOTION_VALID_YEARS = 1e6;

/** Julian year (TT) → Julian date. */
export const jyToJd = (jy: number): number => JD_J2000 + (jy - 2000) * 365.25;
/** Julian date → Julian year (TT). */
export const jdToJy = (jd: number): number => 2000 + (jd - JD_J2000) / 365.25;
/** Besselian year → Julian date (for comparisons with catalogues that tabulate Besselian epochs, such as ORB6). */
export const besselianToJd = (by: number): number => 2_415_020.313_52 + (by - 1900) * 365.242_198_781;
