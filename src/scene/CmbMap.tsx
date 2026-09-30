/**
 * The map of the cosmic microwave background as a layer of the sky, when the View menu or a scene
 * turns it on (sim/cosmos/cmb.ts; shaders/cmbMap.frag.glsl): the WMAP nine-year ILC map in false
 * colour, contrast enhanced about 10,000 times, turned from galactic coordinates into the app's
 * ecliptic axes. A quad over the whole view, added over the Milky Way from the Sun and under
 * everything else, in the plain view (its layer is left out of the relativistic one, which draws
 * the real background as a moving ship sees it). It reads the map's linear temperature codes
 * (cmb-data.png, 0.3 MB, one channel) and colours them itself, dark at the mean temperature so the
 * stars still show; the texture loads when the map is first shown and is let go when it is off.
 * The pattern is the one seen from the Solar System at the present: away from here or from now the
 * sky shows another shell of the early universe, so the map fades out (sim/cosmos/cmb.ts). Near a
 * black hole it is drawn with its material's LENS variant, seen through the lens (render/lensVariants.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PlaneGeometry, type Mesh, type PerspectiveCamera, type Texture } from 'three';
import { createCmbMapMaterial } from '../render/materials';
import { BACKGROUND_LAYER } from '../render/LightspeedScenePass';
import { acquireTexture, releaseTexture } from '../render/textures';
import { useLensVariant } from '../render/lensVariants';
import { CMB_DATA_TEXTURE, cmbPatternShare } from '../sim/cosmos/cmb';
import { WORLD_TO_GAL } from '../sim/galaxy/frames';
import { useUI } from '../state/ui';

/** Brightness of the map's colours (1: the end colours of the palette at ±250 µK). */
const GAIN = 1.8;
/** Linear data, one channel. */
const TEX = { color: false, grey: true } as const;

function useCmbTexture(wanted: boolean): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // acquireTexture holds the texture at once, before it has loaded: release it however soon the map is
    // turned off (or React runs the effect twice), or the hold would outlive the map and the texture stay.
    void acquireTexture(CMB_DATA_TEXTURE, TEX).then((t) => {
      if (live && t) setTex(t);
    });
    return () => {
      live = false;
      setTex(null);
      releaseTexture(CMB_DATA_TEXTURE, TEX);
    };
  }, [wanted]);
  return tex;
}

export function CmbMap() {
  const show = useUI((s) => s.showCmb);
  const material = useMemo(createCmbMapMaterial, []);
  const geometry = useMemo(() => new PlaneGeometry(2, 2), []);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const tex = useCmbTexture(show);
  const mesh = useRef<Mesh>(null);
  useLensVariant(mesh);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const m = WORLD_TO_GAL;
    material.uniforms.uWorldToGal.value.set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]);
  }, [material]);

  useFrame((_, dt) => {
    const u = material.uniforms;
    u.uCmbTex.value = tex;
    const want = show && tex ? GAIN * cmbPatternShare() : 0;
    u.uGain.value += (want - u.uGain.value) * Math.min(1, dt * 4);
    if (Math.abs(want - u.uGain.value) < 0.002) u.uGain.value = want;
    if (mesh.current) mesh.current.visible = !!tex && u.uGain.value > 0.002;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={-999.5}
      visible={false}
      ref={(o) => {
        mesh.current = o;
        o?.layers.set(BACKGROUND_LAYER);
      }}
    />
  );
}
