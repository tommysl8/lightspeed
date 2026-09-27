/**
 * Reference frames for the galaxies beyond the Milky Way, the cosmic web and the CMB map.
 *
 * All frames are right-handed and Cartesian; the rotations hold whatever the length unit.
 *   ICRS   equatorial J2000 (x to RA 0, z to the north celestial pole); the 23 mas frame bias is ignored.
 *   ECL    J2000 ecliptic, mean obliquity 84381.448″ (IAU 1976, as JPL and astronomy-engine): v_ecl = R_x(+ε) v_icrs.
 *   GAL    IAU 1958 galactic coordinates as realised in the ICRS (Hipparcos, ESA 1997, SP-1200 vol. 1,
 *          sect. 1.5.3): the same matrix as the Milky Way layer (sim/galaxy/frames.ts).
 *   SGAL   supergalactic (de Vaucouleurs et al. 1991, RC3; Lahav et al. 2000, MNRAS 312, 166): north pole
 *          at (l, b) = (47.37°, +6.32°), SGL = 0 at (137.37°, 0).
 *   WORLD  the app's scene axes: world = (x_ecl, z_ecl, −y_ecl).
 * Every position here is heliocentric. Lengths: kpc in local-galaxies.json.gz, Mpc in named.json and
 * the cosmic web.
 */
import { OBLIQUITY_J2000 } from '../stars/constants';
import { GAL_TO_ICRS, ICRS_TO_GAL, apply, mul, transpose, type Mat3, type Vec3 } from '../galaxy/frames';

export { apply, mul, transpose, ICRS_TO_GAL, GAL_TO_ICRS, type Mat3, type Vec3 };

export const DEG = Math.PI / 180;

/** v_ecl = ICRS_TO_ECL v_icrs. */
export const ICRS_TO_ECL: Mat3 = [
  [1, 0, 0],
  [0, Math.cos(OBLIQUITY_J2000), Math.sin(OBLIQUITY_J2000)],
  [0, -Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)],
];
export const ECL_TO_ICRS: Mat3 = transpose(ICRS_TO_ECL);

/** v_ecl = GAL_TO_ECL v_gal, and back. */
export const GAL_TO_ECL: Mat3 = mul(ICRS_TO_ECL, GAL_TO_ICRS);
export const ECL_TO_GAL: Mat3 = transpose(GAL_TO_ECL);

export const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (v: Readonly<Vec3>, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const norm = (v: Readonly<Vec3>): number => Math.hypot(v[0], v[1], v[2]);

/** Unit vector toward spherical coordinates (lon, lat) in degrees, in the frame they are given in. */
export function sphToUnit(lonDeg: number, latDeg: number): Vec3 {
  const a = lonDeg * DEG;
  const d = latDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** (lon in [0, 360), lat) in degrees of a vector. */
export function unitToSph(v: Readonly<Vec3>): { lon: number; lat: number } {
  const r = norm(v);
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return { lon, lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / DEG };
}

/** v_sgal = GAL_TO_SGAL v_gal. Rows are the supergalactic axes in galactic components. */
export const GAL_TO_SGAL: Mat3 = (() => {
  const z = sphToUnit(47.37, 6.32);
  const x = sphToUnit(137.37, 0);
  return [x, cross(z, x), z];
})();

/** App world axes from ecliptic, world = (x, z, −y), and back. */
export const eclToWorld = (v: Readonly<Vec3>): Vec3 => [v[0], v[2], -v[1]];
export const worldToEcl = (w: Readonly<Vec3>): Vec3 => [w[0], -w[2], w[1]];

/** ICRS direction (RA, Dec in degrees) as an ecliptic unit vector. */
export const raDecToEcl = (raDeg: number, decDeg: number): Vec3 => apply(ICRS_TO_ECL, sphToUnit(raDeg, decDeg));
/** Galactic direction (l, b in degrees) as an ecliptic unit vector. */
export const lbToEcl = (lDeg: number, bDeg: number): Vec3 => apply(GAL_TO_ECL, sphToUnit(lDeg, bDeg));

/**
 * Sky-plane basis at (RA, Dec), ICRS: r the line of sight (away from the Sun), e east (increasing
 * RA), n north. (n, e, r) is left-handed (n × e = −r): east is left of north as the observer sees
 * it. Position angles run from n towards e.
 */
export function skyBasis(raDeg: number, decDeg: number): { r: Vec3; e: Vec3; n: Vec3 } {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return {
    r: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)],
    e: [-Math.sin(a), Math.cos(a), 0],
    n: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
  };
}

/** The world direction of a position angle (degrees east of north) on the sky at (RA, Dec). */
export function skyDirectionWorld(raDeg: number, decDeg: number, paDeg: number): Vec3 {
  const { e, n } = skyBasis(raDeg, decDeg);
  const p = paDeg * DEG;
  return eclToWorld(apply(ICRS_TO_ECL, add(scale(n, Math.cos(p)), scale(e, Math.sin(p)))));
}
