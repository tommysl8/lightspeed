/**
 * Units and constants shared by the star-catalogue evaluators. Values match scripts/build-stars3d.mjs.
 */

/** Astronomical unit, km (IAU 2012 Resolution B2, exact). */
export const AU_KM = 149_597_870.7;
/** Parsec, km (648000/pi au, IAU 2015 Resolution B2). */
export const PC_KM = (AU_KM * 648_000) / Math.PI;
/** Astronomical units per parsec. */
export const AU_PER_PC = 648_000 / Math.PI;
/** Julian year, s. */
export const JULIAN_YEAR_S = 365.25 * 86_400;
/** 1 km/s expressed in pc per Julian year (≈ 1.0227e-6). */
export const KMS_TO_PC_PER_YR = JULIAN_YEAR_S / PC_KM;
/** Julian date of the J2000.0 epoch (TT). */
export const JD_J2000 = 2_451_545.0;
/** Obliquity of the J2000 ecliptic, rad (84381.448″, IAU 1976; as used by JPL and the app). */
export const OBLIQUITY_J2000 = ((84_381.448 / 3600) * Math.PI) / 180;
/** Nominal solar values, IAU 2015 Resolution B3. */
export const SUN_RADIUS_KM = 695_700;
export const SUN_LUMINOSITY_W = 3.828e26;
export const SUN_TEFF_K = 5772;
/** Absolute visual magnitude of the Sun (Willmer 2018, ApJS 236, 47: M_V = 4.81; 4.83 is the older common value). */
export const SUN_ABS_V = 4.81;

/** Julian year (TT) → Julian date. */
export const jyToJd = (jy: number): number => JD_J2000 + (jy - 2000) * 365.25;
/** Julian date → Julian year (TT). */
export const jdToJy = (jd: number): number => 2000 + (jd - JD_J2000) / 365.25;
/** Besselian year → Julian date (for comparisons with catalogues that tabulate Besselian epochs, such as ORB6). */
export const besselianToJd = (by: number): number => 2_415_020.313_52 + (by - 1900) * 365.242_198_781;
