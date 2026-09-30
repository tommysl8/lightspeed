import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PlaneGeometry, type Mesh, type PerspectiveCamera, type Texture } from 'three';
import { createMilkyWayBackgroundMaterial, milkyWayUniforms, psfUniforms } from '../render/materials';
import { BACKGROUND_LAYER } from '../render/LightspeedScenePass';
import { acquireTexture, releaseTexture } from '../render/textures';
import { useLensVariant } from '../render/lensVariants';
import { backgroundScale, modelShare, MW_FAINT_STARS, MW_TEXTURE_2K } from '../sim/galaxy/background';
import { sim } from '../sim/sim';

const TEX_OPTS = { color: false } as const;
const FAINT_OPTS = { color: false, grey: true } as const;

/**
 * The sky map: the 2K file (1 MB; 11 MB on the GPU with its mipmaps), held for as long as the app
 * runs. The sky is drawn no finer than its texels (10.5′, shaders/milkyway.glsl), and it was averaged
 * from the 4K master in linear light, so the 4K file would add nothing drawn (its own finer
 * levels would be averaged by the GPU in the log-encoded values, which is less exact).
 */
function useSkyTexture(file: string, opts: { color: boolean; grey?: boolean }): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let live = true;
    // Acquiring holds the texture at once, loaded or not: let go of it however soon this unmounts.
    void acquireTexture(file, opts).then((t) => {
      if (live && t) setTex(t);
    });
    return () => {
      live = false;
      releaseTexture(file, opts);
    };
  }, [file, opts]);
  return tex;
}

/**
 * The Milky Way as seen from the Sun, behind everything in the classical view (the relativistic
 * view draws it in its remap pass: render/LightspeedScenePass.ts). It fades out as the camera
 * leaves the Sun's neighbourhood, while the model of the Galaxy fades in (sim/galaxy/background.ts).
 * Near a black hole it is drawn with its material's LENS variant (render/lensVariants.ts; the plain
 * program, the one start-up compiles, has no lens code).
 */
export function MilkyWayBackground() {
  const material = useMemo(createMilkyWayBackgroundMaterial, []);
  const geometry = useMemo(() => new PlaneGeometry(2, 2), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const tex = useSkyTexture(MW_TEXTURE_2K, TEX_OPTS);
  // The catalogue's stars too faint to draw as points (192 kB, 0.5 MB on the GPU), added to the map.
  const faint = useSkyTexture(MW_FAINT_STARS, FAINT_OPTS);
  const mesh = useRef<Mesh>(null);
  useLensVariant(mesh);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const u = milkyWayUniforms;
    u.uMwTex.value = tex;
    u.uMwFaint.value = faint;
    // The sky map's share of the view: the model has the rest (render/galaxyLayer.ts blends the two pictures). Below a
    // share of 1 % (beyond about 477 pc from the Sun) it is left out, as the model is below 1 % near the Sun
    // (scene/GalaxyModel.tsx): at a 0.7 % share that changes no pixel by more than 2/255 and saves its whole pass,
    // 0.85 ms at Gaia BH1's 480 pc on the target laptop (docs/data/blackholes.md §11).
    const share = 1 - modelShare(sim.camera.pos.length());
    u.uMwGain.value = tex && share >= 0.01 ? share : 0;
    // Beyond the crossfade nothing is drawn (the clear colour is black).
    if (mesh.current) mesh.current.visible = u.uMwGain.value > 0;
    const img = tex?.image as { height?: number } | undefined;
    // No finer than the 2K map's texels (see shaders/milkyway.glsl).
    if (img?.height) u.uMwMinLod.value = Math.max(0, Math.log2(img.height / 1024));
    const cssPixel = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, sim.viewport.height);
    u.uMwScale.value = backgroundScale(cssPixel, psfUniforms.uStarGain.value, psfUniforms.uMagZero.value);
    const m = material.uniforms;
    m.uProjInv.value.copy(camera.projectionMatrixInverse);
    m.uCamWorld.value.copy(camera.matrixWorld);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
      visible={false}
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(BACKGROUND_LAYER);
      }}
    />
  );
}
