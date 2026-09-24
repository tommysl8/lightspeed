import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, type PerspectiveCamera } from 'three';
import { BloomEffect, EffectComposer, EffectPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { LightspeedScenePass } from './LightspeedScenePass';

/**
 * HDR render pipeline: scene (classical or relativistic) → bloom → AgX tone mapping. It uses
 * the `postprocessing` library directly (what @react-three/postprocessing wraps), because the
 * relativistic stage replaces the scene render and has to run before bloom.
 */
export function RenderPipeline() {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: 4 });
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
  }, [composer, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, delta) => {
    composer.render(delta);
  }, 1);

  return null;
}
