/**
 * Constants for the exoplanet evaluator. Every value carries its source.
 *
 *   [SI]   BIPM, The International System of Units, 9th ed. (2019)
 *   [IAU]  IAU 2012 Resolution B2 (au); IAU 2015 Resolution B2 (parsec); IAU 2015 Resolution B3
 *          (nominal solar and planetary conversion constants)
 *   [IERS] IERS Conventions (2010), the Gaussian gravitational constant k
 *
 * These match src/physics/constants.ts in the app, so the integrator can swap the imports.
 */

/** Speed of light, km/s. Exact. [SI] */
export const C_KM_S = 299_792.458;
/** Astronomical unit, km. Exact. [IAU 2012 B2] */
export const AU_KM = 149_597_870.7;
/** Seconds per day. [SI] */
export const DAY_S = 86_400;
/** Parsec, km: (648000/pi) au. Exact. [IAU 2015 B2] */
export const PARSEC_KM = (648_000 / Math.PI) * AU_KM;
/** Obliquity of the J2000 ecliptic, degrees (84381.448 arcsec, the value JPL uses for "ecliptic of J2000"). */
export const OBLIQUITY_J2000_DEG = 84_381.448 / 3600;
/** Julian date of J2000.0 (2000-01-01 12:00 TT). */
export const J2000_JD = 2_451_545.0;

/**
 * Gaussian gravitational constant k, rad/day. With the au, day and solar mass as units,
 * GM_sun = k^2 au^3/day^2. [IERS 2010; k = 0.01720209895 exactly by the old definition of the au,
 * and GM_sun/au^3 differs from k^2 by < 1e-9 with the 2012 au, far below any exoplanet error]
 */
export const GAUSS_K = 0.017_202_098_95;
/** GM of the Sun in au^3/day^2. */
export const GM_SUN_AU3_D2 = GAUSS_K * GAUSS_K;

/** Nominal solar radius, km. [IAU 2015 B3] */
export const R_SUN_KM = 695_700;
/** Nominal Earth equatorial radius, km (the NASA Exoplanet Archive's Earth-radius unit). [IAU 2015 B3] */
export const R_EARTH_KM = 6_378.1;
/** Nominal Jupiter equatorial radius, km (the archive's Jupiter-radius unit). [IAU 2015 B3] */
export const R_JUP_KM = 71_492;
/** Earth mass / Sun mass, from nominal GM values (3.986004e14 / 1.3271244e20). [IAU 2015 B3] */
export const M_EARTH_MSUN = 3.986_004e14 / 1.327_124_4e20;
/** Jupiter mass / Sun mass, from nominal GM values (1.2668653e17 / 1.3271244e20). [IAU 2015 B3] */
export const M_JUP_MSUN = 1.266_865_3e17 / 1.327_124_4e20;
/** Jupiter mass in Earth masses (317.828...), the ratio the archive uses. */
export const M_JUP_MEARTH = M_JUP_MSUN / M_EARTH_MSUN;

export const DEG = Math.PI / 180;
export const TAU = 2 * Math.PI;
