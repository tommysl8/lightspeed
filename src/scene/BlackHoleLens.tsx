/**
 * The black hole's lens in the scene: the lens box's quad (the Galaxy layer's light resampled through the lens, and the
 * accretion flow: render/lens/lensComposite.ts), the photon ring's band (its own annulus pass, supersampled:
 * render/lens/lensBand.ts), the exactly lensed luminous spheres (a stellar hole's companion: render/lens/lensSpheres.ts),
 * and, each frame, the shared uniforms of those passes and the hole's sky cube's schedule (render/lens/skyCube.ts).
 *
 * How: three meshes with no bounds, drawn on layers 3 and 1 (so both the classical render and the relativistic
 * render's points pass draw them, each with its half's lens view: render/lens/lensState.ts setLensView): the box
 * additively at render order −999 beside the Galaxy layer's own composite (which draws the frame round the box), the
 * band additively at −998.5, the spheres "over" at 1, after the stars. Hidden whenever the lens is not drawn, so
 * their programs (compiled in the background: render/lens/lensMaterials.ts) cost nothing far from holes.
 *
 * Mounted after AccretionFlow (App.tsx), so the Galaxy layer's uniforms and the flow map are current when the sky
 * cube's face is drawn here.
 *
 * Cost: the passes' own (docs/data/blackholes.md §11); the frame's work here is a few matrix copies (with no lens,
 * a comparison).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector2, type Mesh, type PerspectiveCamera } from 'three';
import { BACKGROUND_LAYER, LENS_DEBUG_LAYER, POINTS_LAYER } from '../render/LightspeedScenePass';
import { lens, lensOverride } from '../render/lens/lensState';
import { createLensCompositeMaterial, lensPassUniforms, setLensPassFrame } from '../render/lens/lensComposite';
import { BAND_SUB_RAYS, BAND_SUB_RAYS_RUNG1, bandUniforms, createLensBandMaterial } from '../render/lens/lensBand';
import { createLensSpheresMaterial } from '../render/lens/lensSpheres';
import { createBandGeometry, createBoxGeometry } from '../render/lens/lensGeometry';
import { idleSkyCube, scheduleSkyCube } from '../render/lens/skyCube';
import { quality } from '../render/quality';
import { sim } from '../sim/sim';

/**
 * Layers 3 (the classical render) and 1 (the relativistic render's points pass); the box and the band also on the
 * debug skies' layer (dev/lensTest.ts), which draws nothing else.
 */
function lensLayers(o: Mesh | null, debug: boolean): void {
  if (!o) return;
  o.layers.set(BACKGROUND_LAYER);
  o.layers.enable(POINTS_LAYER);
  if (debug) o.layers.enable(LENS_DEBUG_LAYER);
}

const size = new Vector2();

export function BlackHoleLens() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const composite = useMemo(createLensCompositeMaterial, []);
  const band = useMemo(createLensBandMaterial, []);
  const spheres = useMemo(createLensSpheresMaterial, []);
  const boxGeometry = useMemo(createBoxGeometry, []);
  const bandGeometry = useMemo(createBandGeometry, []);
  const spheresGeometry = useMemo(createBoxGeometry, []);
  const boxMesh = useRef<Mesh | null>(null);
  const bandMesh = useRef<Mesh | null>(null);
  const spheresMesh = useRef<Mesh | null>(null);
  useEffect(
    () => () => {
      composite.dispose();
      band.dispose();
      spheres.dispose();
      boxGeometry.dispose();
      bandGeometry.dispose();
      spheresGeometry.dispose();
    },
    [composite, band, spheres, boxGeometry, bandGeometry, spheresGeometry],
  );

  useFrame(() => {
    const on = lens.active;
    if (boxMesh.current) boxMesh.current.visible = on;
    if (bandMesh.current) bandMesh.current.visible = on && (lens.view[0].ssBandPx > 0 || lens.view[1].ssBandPx > 0);
    if (spheresMesh.current) spheresMesh.current.visible = on && lens.spheres.length > 0;
    if (!on) {
      // No lens: the sky cube is not read, and its memory goes back 30 s after it last was.
      idleSkyCube();
      return;
    }
    gl.getDrawingBufferSize(size);
    setLensPassFrame(camera, size.x, size.y, lens.pxPerRad, lens.dopplerSkip);
    bandUniforms.uBandSubRays.value = quality.lensRung >= 1 ? BAND_SUB_RAYS_RUNG1 : BAND_SUB_RAYS;
    bandUniforms.uBandJitter.value = Math.random();
    const cssPxPerRad = sim.viewport.height / 2 / Math.tan((camera.fov * Math.PI) / 360);
    scheduleSkyCube(gl, scene, cssPxPerRad);
    // The uniform-radiance debug sky reads no real cube: its every off-screen source is drawn from the same uniform sky.
    if (lensOverride.debug === 4) lensPassUniforms.uSkyCubeLive.value = 1;
  });

  return (
    <>
      <mesh geometry={boxGeometry} material={composite} frustumCulled={false} renderOrder={-999} visible={false} ref={(o) => ((boxMesh.current = o), lensLayers(o, true))} />
      <mesh geometry={bandGeometry} material={band} frustumCulled={false} renderOrder={-998.5} visible={false} ref={(o) => ((bandMesh.current = o), lensLayers(o, true))} />
      <mesh geometry={spheresGeometry} material={spheres} frustumCulled={false} renderOrder={1} visible={false} ref={(o) => ((spheresMesh.current = o), lensLayers(o, false))} />
    </>
  );
}
