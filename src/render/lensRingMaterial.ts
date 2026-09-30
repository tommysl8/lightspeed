/**
 * The ring sprites that draw a near-perfect alignment behind a black hole as an arc or a ring of light
 * (scene/LensRings.tsx), as a plain material module so render/precompile.ts never imports a
 * React component.
 *
 * The program is first drawn near a hole, so it is compiled in the background with the lens's own passes
 * (RING_LATER in render/precompile.ts LATER_MATERIALS): drawn as a quad, as it is (an instanced quad whose
 * program is the plain mesh's). Additive, no depth: it sits over the glints it takes over from (render
 * order 21, after their 20). Its only uniforms are three.js's own (the projection matrix).
 */
import { AdditiveBlending, ShaderMaterial } from 'three';
import type { LaterMaterial } from './precompile';
import lensRingVert from './shaders/lensRing.vert.glsl?raw';
import lensRingFrag from './shaders/lensRing.frag.glsl?raw';

/** The ring sprites' material (per instance: box, centre, primary arc, radius, arcs, peak, colour, σ). */
export function createLensRingMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: lensRingVert,
    fragmentShader: lensRingFrag,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}

/** The ring sprites' material, for the background compiles. */
export const RING_LATER: readonly LaterMaterial[] = [[createLensRingMaterial, 'quad']];
