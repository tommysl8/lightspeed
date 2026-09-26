/**
 * Constants of the exoplanet evaluator. The shared ones come from physics/constants.ts; the rest
 * carry their sources here.
 *
 *   [IAU]   IAU 2015 Resolution B3 (nominal solar and planetary conversion constants)
 *   [IERS]  IERS Conventions (2010), the Gaussian gravitational constant k
 */
import { AU_KM, C_KM_S, DAY_S, GM_SUN_KM3_S2, J2000_JD, OBLIQUITY_J2000_DEG, PARSEC_KM, SUN_RADIUS_KM } from '../../physics/constants';

export { AU_KM, C_KM_S, DAY_S, GM_SUN_KM3_S2, J2000_JD, OBLIQUITY_J2000_DEG, PARSEC_KM };

/** Nominal solar radius, km. [IAU 2015 B3] */
export const R_SUN_KM = SUN_RADIUS_KM;

/**
 * Gaussian gravitational constant k, rad/day. With the au, day and solar mass as units,
 * GM_sun = k^2 au^3/day^2. [IERS 2010; k = 0.01720209895 exactly by the old definition of the au,
 * and GM_sun/au^3 differs from k^2 by < 1e-9 with the 2012 au, far below any exoplanet error]
 */
export const GAUSS_K = 0.017_202_098_95;
/** GM of the Sun in au^3/day^2. */
export const GM_SUN_AU3_D2 = GAUSS_K * GAUSS_K;

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
/** Nominal GM of the Earth, km³/s². [IAU 2015 B3] */
export const GM_EARTH_KM3_S2 = 3.986_004e5;

export const DEG = Math.PI / 180;
export const TAU = 2 * Math.PI;
