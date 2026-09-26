import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, type PerspectiveCamera } from 'three';
import { BloomEffect, EffectComposer, EffectPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { LightspeedScenePass } from './LightspeedScenePass';
import { quality } from './quality';

/**
 * Nothing after the scene pass reads its depth (bloom and tone mapping use colour only), so the
 * multisampled depth is never resolved: resolving it costs about 2 ms a frame on an integrated
 * GPU at 1936 × 1384, and the relativistic view resolves twice. The buffers are made again when
 * the multisampling changes, so this is applied after every change.
 */
function skipDepthResolve(composer: EffectComposer): void {
  for (const b of [composer.inputBuffer, composer.outputBuffer]) {
    b.resolveDepthBuffer = false;
    b.resolveStencilBuffer = false;
  }
}

/**
 * HDR render pipeline: scene (classical or relativistic) → bloom → AgX tone mapping. It uses
 * the `postprocessing` library directly (what @react-three/postprocessing wraps), because the
 * relativistic stage replaces the scene render and has to run before bloom.
 */
export function RenderPipeline() {
  const { gl, scene, camera, size } = useThree();
  // The buffers follow the pixel ratio too: adaptive quality lowers it when frames run slow.
  const dpr = useThree((s) => s.viewport.dpr);

  const composer = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: quality.msaa });
    skipDepthResolve(composer);
    composer.addPass(new LightspeedScenePass(scene, camera as PerspectiveCamera, 1024));
    const bloom = new BloomEffect({
      mipmapBlur: true,
      levels: 6,
      luminanceThreshold: 1.15,
      luminanceSmoothing: 0.4,
      intensity: 0.65,
      radius: 0.5,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    composer.addPass(new EffectPass(camera, bloom, tone));
    return composer;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size, dpr]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => {
    if (composer.multisampling !== quality.msaa) {
      composer.multisampling = quality.msaa;
      skipDepthResolve(composer);
    }
    composer.render(delta);
  }, 1);

  return null;
}
