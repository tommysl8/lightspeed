// The CMB sky textures (public/textures/cmb.png and cmb-data.png, built by scripts/build-cmb.mjs
// from the WMAP 9-year ILC map; credit "NASA / WMAP Science Team").
//
// Layout of both images: equirectangular in galactic coordinates, drawn as CMB maps are published,
// seen from inside the sky: the Galactic centre in the middle, galactic longitude increasing to the
// LEFT. With texture coordinates u (0 at the left edge, 1 at the right) and v (0 at the top, 1 at
// the bottom):
//   l = (180 - 360 u) mod 360,  b = 90 - 180 v   (degrees)
// Pixel values are a linear temperature code k in 0..255: dT = (k - 127.5) * 500/255 uK, i.e.
// -250 .. +250 uK, clipped beyond. In cmb.png k is the palette index (the palette is Moreland's
// cool-warm diverging map); cmb-data.png stores k as grey, to be sampled as linear data.
// The mean temperature T0 = 2.7255 K, monopole and dipole are removed from the map: the colours show
// deviations of order 1e-5 of T0, contrast enhanced ~10^4 times. The app must label the map
// "contrast enhanced".

import { ECL_TO_GAL, apply, lbToUnit, GAL_TO_ECL, unitToSph, type Vec3 } from './frames.ts';

export const CMB_RANGE_UK = 250;
export const CMB_STEP_UK = (2 * CMB_RANGE_UK) / 255;

/** Temperature anisotropy in microkelvin for a texture code k (0..255). */
export const cmbCodeToMicroK = (k: number): number => (k - 127.5) * CMB_STEP_UK;
/** Texture code for an anisotropy in microkelvin (clipped). */
export const microKToCmbCode = (dT: number): number =>
  Math.max(0, Math.min(255, Math.round(127.5 + dT / CMB_STEP_UK)));
/** Normalised grey value (what a shader reads from cmb-data.png, 0..1) to microkelvin. */
export const cmbGreyToMicroK = (g: number): number => cmbCodeToMicroK(g * 255);

/** Galactic (l, b) in degrees of texture coordinates (u, v). */
export function cmbUvToGalactic(u: number, v: number): { l: number; b: number } {
  let l = (180 - 360 * u) % 360;
  if (l < 0) l += 360;
  return { l, b: 90 - 180 * v };
}

/** Texture coordinates of galactic (l, b) in degrees. u in [0, 1), v in [0, 1]. */
export function galacticToCmbUv(lDeg: number, bDeg: number): { u: number; v: number } {
  let u = (180 - lDeg) / 360;
  u -= Math.floor(u);
  return { u, v: (90 - bDeg) / 180 };
}

/** Texture coordinates for a direction given as an ecliptic (J2000) vector. */
export function eclDirectionToCmbUv(dirEcl: Vec3): { u: number; v: number } {
  const { lon, lat } = unitToSph(apply(ECL_TO_GAL, dirEcl));
  return galacticToCmbUv(lon, lat);
}

/** Ecliptic unit vector of the sky point at texture coordinates (u, v). */
export function cmbUvToEclDirection(u: number, v: number): Vec3 {
  const { l, b } = cmbUvToGalactic(u, v);
  return apply(GAL_TO_ECL, lbToUnit(l, b));
}

/**
 * GLSL for a fragment shader that samples the CMB texture along a world-space view direction
 * (world = (x_ecl, z_ecl, -y_ecl)). WORLD_TO_GAL is ECL_TO_GAL applied after world -> ecliptic.
 * Returned as a 3x3 matrix in column-major order, ready for a THREE.Matrix3.fromArray / uniform.
 */
export function worldToGalacticColumnMajor(): number[] {
  // world -> ecl: x_e = x_w, y_e = -z_w, z_e = y_w
  const W2E = [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ];
  const m: number[][] = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => ECL_TO_GAL[i][0] * W2E[0][j] + ECL_TO_GAL[i][1] * W2E[1][j] + ECL_TO_GAL[i][2] * W2E[2][j]),
  );
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}

export const CMB_UV_GLSL = /* glsl */ `
// dirGal: unit view direction in galactic axes (worldToGalactic * worldDir).
vec2 cmbUv(vec3 dirGal) {
  float l = atan(dirGal.y, dirGal.x);          // radians, (-pi, pi]
  float b = asin(clamp(dirGal.z, -1.0, 1.0));
  float u = fract(0.5 - l / 6.283185307179586); // l = 0 at u = 0.5, increasing to the left
  float v = 0.5 - b / 3.141592653589793;        // v = 0 at the north galactic pole (top row)
  return vec2(u, 1.0 - v);                      // for a texture loaded with flipY = true (three.js default)
}
`;

export const CMB_CREDIT = 'CMB: NASA / WMAP Science Team (9-year ILC map), contrast enhanced';

