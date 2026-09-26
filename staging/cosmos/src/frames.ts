// Reference frames for the extragalactic layer (local galaxies, cosmic web, CMB).
//
// All frames are right-handed and Cartesian; the rotations are the same whatever the length unit.
//   ICRS / EQJ  equatorial J2000 (x to RA 0, z to the north celestial pole). The 23 mas frame bias
//               between the dynamical J2000 frame and the ICRS is ignored.
//   ECL         J2000 ecliptic, mean obliquity 84381.448 arcsec (IAU 1976; the value JPL,
//               astronomy-engine and the app use): v_ecl = R_x(+eps) v_icrs.
//   GAL         IAU 1958 galactic coordinates as realised in the ICRS (Hipparcos, ESA 1997, SP-1200
//               vol. 1, sect. 1.5.3): x to (l, b) = (0, 0), y to (90, 0), z to the north galactic pole
//               at (RA, Dec) = (192.85948, +27.12825) deg; the north celestial pole is at l = 122.93192.
//   SGAL        supergalactic coordinates (de Vaucouleurs et al. 1991, RC3; Lahav et al. 2000, MNRAS
//               312, 166): north supergalactic pole at (l, b) = (47.37, +6.32) deg, SGL = 0 at
//               (l, b) = (137.37, 0) deg.
//   WORLD       the app's scene axes: world = (x_ecl, z_ecl, -y_ecl) (ecliptic north is +Y).
// Every positional output of this layer is heliocentric (the Sun at the origin).

export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

export const DEG = Math.PI / 180;

/** Mean obliquity of the J2000 ecliptic, radians (84381.448 arcsec). */
export const OBLIQUITY_J2000 = (84381.448 / 3600) * DEG;

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ] as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
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

/** v_ecl = ICRS_TO_ECL v_icrs. */
export const ICRS_TO_ECL: Mat3 = [
  [1, 0, 0],
  [0, Math.cos(OBLIQUITY_J2000), Math.sin(OBLIQUITY_J2000)],
  [0, -Math.sin(OBLIQUITY_J2000), Math.cos(OBLIQUITY_J2000)],
];
export const ECL_TO_ICRS: Mat3 = transpose(ICRS_TO_ECL);

/** v_gal = ICRS_TO_GAL v_icrs. Rows are the galactic axes in ICRS components (Hipparcos eq. 1.5.11). */
export const ICRS_TO_GAL: Mat3 = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
export const GAL_TO_ICRS: Mat3 = transpose(ICRS_TO_GAL);

/** v_ecl = GAL_TO_ECL v_gal, and its inverse. */
export const GAL_TO_ECL: Mat3 = mul(ICRS_TO_ECL, GAL_TO_ICRS);
export const ECL_TO_GAL: Mat3 = transpose(GAL_TO_ECL);

/** v_sgal = GAL_TO_SGAL v_gal. Rows are the supergalactic axes in galactic components. */
export const GAL_TO_SGAL: Mat3 = (() => {
  const z = sphToUnit(47.37, 6.32); // north supergalactic pole
  const x = sphToUnit(137.37, 0); // SGL = 0, SGB = 0 (lies in the supergalactic plane: z . x = 0)
  const y = cross(z, x);
  return [x, y, z];
})();
export const SGAL_TO_GAL: Mat3 = transpose(GAL_TO_SGAL);
export const SGAL_TO_ECL: Mat3 = mul(GAL_TO_ECL, SGAL_TO_GAL);

/** App world axes from ecliptic, world = (x, z, -y), and back. */
export const eclToWorld = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];
export const worldToEcl = (w: Vec3): Vec3 => [w[0], -w[2], w[1]];

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/** Unit vector toward spherical coordinates (lon, lat) in degrees, in the frame they are given in. */
export function sphToUnit(lonDeg: number, latDeg: number): Vec3 {
  const a = lonDeg * DEG;
  const d = latDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}
/** (lon in [0, 360), lat) in degrees of a vector. */
export function unitToSph(v: Vec3): { lon: number; lat: number } {
  const r = norm(v);
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return { lon, lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / DEG };
}

export const raDecToUnit = sphToUnit; // ICRS
export const lbToUnit = sphToUnit; // galactic

/** ICRS direction (RA, Dec in degrees) as an ecliptic unit vector. */
export const raDecToEcl = (raDeg: number, decDeg: number): Vec3 => apply(ICRS_TO_ECL, raDecToUnit(raDeg, decDeg));
/** Galactic direction (l, b in degrees) as an ecliptic unit vector. */
export const lbToEcl = (lDeg: number, bDeg: number): Vec3 => apply(GAL_TO_ECL, lbToUnit(lDeg, bDeg));

/**
 * Sky-plane basis at (RA, Dec), in ICRS: r = line of sight (away from the Sun), e = east (increasing
 * RA), n = north (increasing Dec). (n, e, r) is left-handed (n x e = -r): east is to the left of
 * north as seen by the observer. Position angles are measured from n toward e.
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
