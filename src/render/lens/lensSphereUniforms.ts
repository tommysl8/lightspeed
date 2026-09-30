/**
 * The uniforms of the lensed luminous spheres (shaders/lensSpheres.frag.glsl): up to two stars drawn exactly through
 * the lens (a stellar-mass hole's companion near the axis), written by render/lens/lensState.ts updateLens when it
 * lists them in lens.spheres, and read by the spheres' material (render/lens/lensSpheres.ts). Kept apart so that the
 * lens state can write them without importing the material and everything it reads.
 *
 * Units: centres relative to the hole in units of M (hole frame, world axes), radii in M, ln T in ln K, velocities
 * relative to the hole frame in units of c. uLensBox here is the spheres' own box per half (the lens box and each
 * sphere's disc, grown by its deflection), set with the half's view.
 */
import { Vector3, Vector4 } from 'three';
import { LIMB_DARKENING_U, SUN_CENTRE_RADIANCE } from '../materials';

/** At most this many spheres are drawn through the lens. */
export const MAX_LENS_SPHERES = 2;

export const sphereUniforms = {
  /** Centre (M, relative to the hole) and radius (M). */
  uSphereKR: { value: [new Vector4(), new Vector4()] },
  /** x ln T; y 1 while drawn; z ½ ln(1 − 2/|K|), its own gravitational redshift; w 0. */
  uSphereT: { value: [new Vector4(), new Vector4()] },
  /** Its velocity relative to the hole frame, c. */
  uSphereVel: { value: [new Vector3(), new Vector3()] },
  uLimbU: { value: LIMB_DARKENING_U },
  uCentreRadiance: { value: SUN_CENTRE_RADIANCE },
  /** The spheres' box this half (NDC x0, y0, x1, y1), placed by shaders/lensBox.vert.glsl; empty with none. */
  uLensBox: { value: new Vector4(0, 0, 0, 0) },
};

/** Each half's box for the spheres (NDC), written by updateLens, copied into uLensBox by setLensView. */
export const sphereBoxes: [[number, number, number, number], [number, number, number, number]] = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
