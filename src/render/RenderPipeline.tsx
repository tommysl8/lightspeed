import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, type PerspectiveCamera } from 'three';
import { BloomEffect, EffectComposer, EffectPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { LightspeedScenePass } from './LightspeedScenePass';
import { precompileLater, setPrecompileStarter } from './precompile';
import { quality } from './quality';
import { GpuFrameTimer, surveyBudget } from './gpuBudget';
import { lens, lensOverride } from './lens/lensState';

/**
 * The shaders drawn later are compiled in the background this long after the pipeline starts, ms:
 * once start-up's loading (the stars, the galaxies, the Milky Way model) and its own compiles are
 * over, which they would otherwise hold up (precompile.ts). A black hole met before then starts
 * them at once (precompile.ts precompileSoon): the lens waits for its programs.
 */
const PRECOMPILE_AFTER_MS = 8000;

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
 *
 * Near a black hole the GPU-time controller (gpuBudget.ts) times each frame's GPU work with one
 * query (none far from holes): opened in a frame callback that runs before every other but the
 * simulation's (priority −1), so the passes issued ahead of the composer (the accretion flow's map,
 * the sky cube's faces) are counted too, and closed after the composer's render. Bloom's luminance pass can run at half resolution
 * (quality.bloomHalfLuminance: off, since it saves too little for the pixels it changes, docs/data/blackholes.md
 * §11; its mip chain starts at half resolution anyway). The lens's debug skies (dev/lensTest.ts) go straight to the screen, without
 * bloom or tone mapping, so their colours can be compared with the reference pictures.
 */
export function RenderPipeline() {
  const { gl, scene, camera, size } = useThree();
  // The buffers follow the pixel ratio too: adaptive quality lowers it when frames run slow.
  const dpr = useThree((s) => s.viewport.dpr);

  const { composer, scenePass, effectPass, bloom } = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: quality.msaa });
    skipDepthResolve(composer);
    const scenePass = new LightspeedScenePass(scene, camera as PerspectiveCamera, 1024);
    composer.addPass(scenePass);
    const bloom = new BloomEffect({
      mipmapBlur: true,
      levels: 6,
      luminanceThreshold: 1.15,
      luminanceSmoothing: 0.4,
      intensity: 0.65,
      radius: 0.5,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    const effectPass = new EffectPass(camera, bloom, tone);
    composer.addPass(effectPass);
    return { composer, scenePass, effectPass, bloom };
  }, [gl, scene, camera]);
  const timer = useMemo(() => new GpuFrameTimer(gl.getContext()), [gl]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size, dpr]);

  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => () => timer.dispose(), [timer]);

  // After start-up (or at once near a black hole): the shaders of what is drawn later, and the relativistic view's.
  useEffect(() => {
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      void precompileLater(gl, camera, [scenePass.remapScene], [scenePass.remapLensedScene]);
    };
    setPrecompileStarter(start);
    const id = setTimeout(start, PRECOMPILE_AFTER_MS);
    return () => {
      clearTimeout(id);
      setPrecompileStarter(null);
    };
  }, [gl, camera, scenePass]);

  // The frame's GPU work near a black hole (or with the galaxy surveys drawn: their point budget) starts here: after
  // the simulation (priority −10), before the flow map and the sky cube (priority 0) and the render (1).
  useFrame(() => timer.begin(lens.active || surveyBudget.active), -1);

  useFrame((_, delta) => {
    if (composer.multisampling !== quality.msaa) {
      composer.multisampling = quality.msaa;
      skipDepthResolve(composer);
    }
    const lumScale = quality.bloomHalfLuminance ? 0.5 : 1;
    if (bloom.luminancePass.resolution.scale !== lumScale) bloom.luminancePass.resolution.scale = lumScale;
    // A debug sky of the lens's checks: the scene pass straight to the screen.
    const debug = lensOverride.debug > 0 && lens.active;
    if (effectPass.enabled === debug) {
      effectPass.enabled = !debug;
      scenePass.renderToScreen = debug;
    }
    composer.render(delta);
    timer.end();
  }, 1);

  return null;
}
