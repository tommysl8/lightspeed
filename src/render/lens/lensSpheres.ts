/**
 * The lensed luminous spheres' material (shaders/lensSpheres.frag.glsl): up to two stars drawn exactly through a
 * black hole's lens, in practice a stellar-mass hole's companion seen near the axis (Gaia BH1's star, 1.4 au from the
 * hole, seen from 10⁶ km: the ring 0.43° across, the star 0.19° in radius), whose meshes are then hidden
 * (scene/Bodies.tsx) and whose glints are left out (sim/lensBodies.ts) while render/lens/lensState.ts lists them in
 * lens.spheres.
 *
 * How: a quad over the spheres' box (the lens box and each sphere's disc, grown by the deflection there), placed by
 * shaders/lensBox.vert.glsl from the spheres' own box uniform; premultiplied "over" at render order 1, after the
 * stars, on layers 3 and 1 (scene/BlackHoleLens.tsx).
 *
 * Cost: one lens ray and two sphere tests a pixel of its box, only while a sphere is listed (≤ 0.05 ms).
 *
 * Twins: shaders/lensSpheres.frag.glsl; lensSphereUniforms.ts.
 */
import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial } from 'three';
import { lensPassUniformSet } from './lensComposite';
import { sphereUniforms } from './lensSphereUniforms';
import lensBoxVert from '../shaders/lensBox.vert.glsl?raw';
import lensSpheresFrag from '../shaders/lensSpheres.frag.glsl?raw';

/** The spheres' material: premultiplied "over", no depth. */
export function createLensSpheresMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...lensPassUniformSet(), ...sphereUniforms },
    vertexShader: lensBoxVert,
    fragmentShader: lensSpheresFrag,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}
