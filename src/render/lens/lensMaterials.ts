/**
 * The lens's own passes, for the background compiles (render/precompile.ts): the lens box's composite of the
 * Galaxy's light, the photon ring's band and the lensed luminous spheres. They are first drawn near a black hole,
 * and a large program compiled mid-flight would stop the frame (the composite 0.6–2.4 s on a fresh page on the
 * target laptop), so the lens waits for them (render/lens/lensState.ts lensProgramsReady).
 *
 * Each is compiled as it is drawn: a quad into a half-float target (three.js keys a program on its shaders, its
 * defines and the target's kind, not on the geometry's attributes).
 */
import type { LaterMaterial } from '../precompile';
import { createLensCompositeMaterial } from './lensComposite';
import { createLensBandMaterial } from './lensBand';
import { createLensSpheresMaterial } from './lensSpheres';
import { createSkyMeterMaterial } from './skyMeter';
import { lensedVariant } from '../lensVariants';
import { createCmbMapMaterial, createMilkyWayBackgroundMaterial } from '../materials';

/**
 * The composite, the band, the spheres, the sky's meter (render/lens/skyMeter.ts) and the LENS variants of the two
 * sky layers drawn as quads (the Milky Way from the Sun and the CMB map, whose plain programs have no lens code), with
 * how each is drawn. (The relativistic remap's LENS variant is compiled with them from its own scene: render/
 * RenderPipeline.tsx.)
 */
export const LENS_LATER: readonly LaterMaterial[] = [
  [createLensCompositeMaterial, 'quad'],
  [createLensBandMaterial, 'quad'],
  [createLensSpheresMaterial, 'quad'],
  [createSkyMeterMaterial, 'quad'],
  [() => lensedVariant(createMilkyWayBackgroundMaterial()), 'quad'],
  [() => lensedVariant(createCmbMapMaterial()), 'quad'],
];
