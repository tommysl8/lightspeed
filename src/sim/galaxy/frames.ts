// Reference frames for the Milky Way layer.
//
// Frames (all right-handed, Cartesian):
//   ICRS / EQJ   heliocentric equatorial J2000 (astronomy-engine's EQJ; the 23 mas ICRS frame bias is ignored).
//   ECL          heliocentric ecliptic J2000, mean obliquity 84381.448 arcsec (what the app uses).
//   WORLD        the app's scene axes: world = (x_ecl, z_ecl, -y_ecl).
//   GAL          heliocentric galactic: x -> (l=0, b=0), y -> (l=90, b=0), z -> north galactic pole.
//                IAU definition as realised in the ICRS by Hipparcos/Gaia (ESA 1997, SP-1200 vol. 1, 1.5.3).
//   G            galactocentric model frame: origin at Sgr A*, x from the Sun's projection towards Sgr A*,
//                y towards l = 90 deg, z towards the NGP, Sun at (-8.27697, 0, +0.0208) kpc. Built like
//                astropy's Galactocentric frame (roll 0) with R0 = 8.277 kpc (GRAVITY 2022),
//                z0 = 20.8 pc (Bennett & Bovy 2019), Sgr A* at ICRS (266.4168371, -29.0078106) deg
//                (Reid & Brunthaler 2004).
// Units: any length unit for the rotations; kpc for the G <-> GAL translation.

export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

const DEG = Math.PI / 180;

/** v_gal = ICRS_TO_GAL * v_icrs. Rows: galactic axes in ICRS components (Hipparcos definition). */
export const ICRS_TO_GAL: Mat3 = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

/** Mean obliquity of the J2000 ecliptic (IAU 1976), radians. */
export const OBLIQUITY_J2000 = (84381.448 / 3600) * DEG;

/** v_gal = ECL_TO_GAL * v_ecl. */
export const ECL_TO_GAL: Mat3 = mul(ICRS_TO_GAL, [
  [1, 0, 0],
  [0, Math.cos(OBLIQUITY_J2000), -Math.sin(OBLIQUITY_J2000)],
  [0, Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)],
]);

/** v_gal = WORLD_TO_GAL * v_world (world = (x_ecl, z_ecl, -y_ecl)). */
export const WORLD_TO_GAL: Mat3 = mul(ECL_TO_GAL, [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
]);

/** v_world = GAL_TO_WORLD * v_gal. */
export const GAL_TO_WORLD: Mat3 = transpose(WORLD_TO_GAL);
export const GAL_TO_ECL: Mat3 = transpose(ECL_TO_GAL);
export const GAL_TO_ICRS: Mat3 = transpose(ICRS_TO_GAL);

/** Galactocentric frame G: x_G = GAL_TO_G_ROT * x_gal + SUN_G (kpc). */
export const GAL_TO_G_ROT: Mat3 = [
  [0.9999980695118587, -0.0009727463073357, 0.0017072601380173],
  [0.0009729203334801, 0.9999995216017424, -0.0001011054434291],
  [-0.0017071609713203, 0.0001027662763491, 0.9999985375191858],
];
export const SUN_G: Vec3 = [-8.2769738649, 0.0, 0.0208];
export const R0_KPC = 8.277;
export const Z0_KPC = 0.0208;

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}

export function transpose(a: Mat3): Mat3 {
  return [
    [a[0][0], a[1][0], a[2][0]],
    [a[0][1], a[1][1], a[2][1]],
    [a[0][2], a[1][2], a[2][2]],
  ];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Heliocentric galactic (kpc) -> galactocentric frame G (kpc). */
export function galToG(v: Vec3): Vec3 {
  const r = apply(GAL_TO_G_ROT, v);
  return [r[0] + SUN_G[0], r[1] + SUN_G[1], r[2] + SUN_G[2]];
}

/** Galactocentric frame G (kpc) -> heliocentric galactic (kpc). */
export function gToGal(v: Vec3): Vec3 {
  return apply(transpose(GAL_TO_G_ROT), [v[0] - SUN_G[0], v[1] - SUN_G[1], v[2] - SUN_G[2]]);
}

/** Unit vector for spherical angles (degrees): longitude/latitude or RA/Dec. */
export function unitFromAngles(lonDeg: number, latDeg: number): Vec3 {
  const l = lonDeg * DEG, b = latDeg * DEG;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

/** Spherical angles (degrees, longitude in [0, 360)) of a vector. */
export function anglesFromVector(v: Vec3): { lon: number; lat: number; r: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return { lon, lat: Math.asin(v[2] / r) / DEG, r };
}

/** RA/Dec (deg, ICRS) -> galactic l/b (deg). */
export function equatorialToGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const g = apply(ICRS_TO_GAL, unitFromAngles(raDeg, decDeg));
  const a = anglesFromVector(g);
  return { l: a.lon, b: a.lat };
}

/** Heliocentric position in the app's world axes (any unit) from RA/Dec (deg) and distance. */
export function equatorialToWorld(raDeg: number, decDeg: number, dist: number): Vec3 {
  const u = unitFromAngles(raDeg, decDeg);
  const ecl = apply(transpose(ECL_TO_GAL), apply(ICRS_TO_GAL, u));
  return [ecl[0] * dist, ecl[2] * dist, -ecl[1] * dist];
}

/**
 * Texel lookup for the NASA SVS celestial plate carree maps (Deep Star Maps 2020, celestial version):
 * RA = 0 at the image centre, RA increasing to the LEFT; Dec +90 at the top row.
 * Pixel (i, j) (column, row from the top) of a W x H image covers the centre direction
 *   RA = 360 * (0.5 - (i + 0.5) / W) mod 360,   Dec = 90 - 180 * (j + 0.5) / H.
 * Returns texture coordinates u in [0,1) (left to right) and vTop in [0,1] (top to bottom); with
 * three.js' default flipY the GL coordinate is vGL = 1 - vTop.
 */
export function svsCelestialUV(raDeg: number, decDeg: number): { u: number; vTop: number } {
  let u = 0.5 - raDeg / 360;
  u -= Math.floor(u);
  return { u, vTop: (90 - decDeg) / 180 };
}

/** Same lookup starting from a direction in the app's world axes. */
export function svsCelestialUVFromWorld(d: Vec3): { u: number; vTop: number } {
  const ecl: Vec3 = [d[0], -d[2], d[1]];
  const eq = apply(transpose(ICRS_TO_GAL), apply(ECL_TO_GAL, ecl));
  const a = anglesFromVector(eq);
  return svsCelestialUV(a.lon, a.lat);
}
