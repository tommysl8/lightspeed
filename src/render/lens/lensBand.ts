/**
 * The photon ring's band (shaders/lensBand.vert.glsl, lensBand.frag.glsl): its material and the band's own uniforms.
 *
 * What: an annulus of the view about the shadow's edge, ±(3 + 1) px, drawn when the edge is at least a pixel in radius;
 * each of its pixels averages N sub-rays stratified in the table's variable, so the unresolved
 * rings of higher orders and the shadow's edge are sampled without bias; the lens box's composite leaves exactly
 * those pixels to it. Drawn additively on layers 3 and 1 at render order −998.5 (scene/BlackHoleLens.tsx).
 *
 * How: the uniforms are the composite's (lensComposite.ts lensPassUniformSet), and uBandSubRays (8; 4 at rung 1)
 * and uBandJitter (a new offset each frame: the strata's samples move, so their average converges on the eye's).
 *
 * Cost: 0.02–0.15 ms (2,700 to 39,000 pixels, 100 M to the horizon of a fall); nothing when the edge is under a pixel.
 *
 * Twins: shaders/lensBand.frag.glsl; lensGeometry.ts createBandGeometry.
 */
import { AdditiveBlending, ShaderMaterial } from 'three';
import { lensPassUniformSet } from './lensComposite';
import lensBandVert from '../shaders/lensBand.vert.glsl?raw';
import lensBandFrag from '../shaders/lensBand.frag.glsl?raw';

/** The band's own uniforms. */
export const bandUniforms = {
  /** Sub-rays a pixel: 8, 4 at rung 1. */
  uBandSubRays: { value: 8 },
  /** This frame's offset of the sub-rays within their strata. */
  uBandJitter: { value: 0 },
};

/** Sub-rays a band pixel at rung 0, and at rung 1 and beyond. */
export const BAND_SUB_RAYS = 8;
export const BAND_SUB_RAYS_RUNG1 = 4;

/** The band's material: additive, no depth, both faces (the annulus may be seen from either side of its strip). */
export function createLensBandMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...lensPassUniformSet(), ...bandUniforms },
    vertexShader: lensBandVert,
    fragmentShader: lensBandFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    side: 2,
  });
}
