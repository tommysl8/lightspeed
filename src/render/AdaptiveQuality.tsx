import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { gpuRendererName, isIntegratedGpu, quality, stepDown, stepUp } from './quality';
import { relView } from './relativisticView';
import { textures, TEXTURE_BUDGET_INTEGRATED_BYTES } from './textures';
import { gpuBudget } from './gpuBudget';
import { lens } from './lens/lensState';

/**
 * Keeps the frame rate near 60 fps on ordinary laptops. It measures a 1 s average; after two
 * slow seconds it steps quality down (multisampling, the pixel ratio, then the cube-map size
 * while the relativistic view is active: quality.ts stepDown). After five fast seconds it steps
 * back up (not multisampling). On an integrated GPU the cube map starts at 768 px a face, the
 * texture budget is smaller (its memory is the computer's) and a screen of pixel ratio 2 starts
 * without multisampling.
 *
 * Near a black hole the GPU-time controller (gpuBudget.ts) comes first, each frame: it sets the
 * lens's quality rung, and only once its rungs are exhausted does it step the pixel ratio (and give
 * those steps back first); the frame-rate rules stay as the last resort and leave the pixel ratio
 * to it while a lens is drawn. While a measurement holds the controller (dev/perf.ts) the rung it
 * pinned is left alone.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const acc = useRef({ time: 0, frames: 0, slow: 0, fast: 0 });

  useEffect(() => {
    quality.maxDpr = Math.min(2, window.devicePixelRatio || 1);
    quality.dpr = quality.maxDpr;
    setDpr(quality.dpr);
  }, [setDpr]);

  useEffect(() => {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    quality.integrated = isIntegratedGpu(gpuRendererName(gl.getContext()), memory);
    if (quality.integrated) {
      quality.cubeFace = Math.min(quality.cubeFace, 768);
      textures.budget = Math.min(textures.budget, TEXTURE_BUDGET_INTEGRATED_BYTES);
      // At a pixel ratio of 2 the multisampled buffer costs an integrated GPU more than the rest
      // of the frame (Intel Xe, 1936 × 1384: 9.8 ms a frame with it, 3.9 ms without) and about
      // 130 MB of the computer's memory (four samples of colour and depth), while edges are
      // already fine at that density.
      if (quality.maxDpr >= 2) quality.msaa = 0;
    }
  }, [gl]);

  useFrame((_, delta) => {
    if (!gpuBudget.paused) {
      const rung = gpuBudget.rung(lens.active, relView.split);
      if (quality.lensRung !== rung) quality.lensRung = rung;
      // (A step the pixel ratio cannot take, at 1 already, is not counted: none is given back later.)
      if (gpuBudget.wantsDprStep(quality.dpr > 1)) {
        quality.dpr = Math.max(1, quality.dpr - 0.25);
        setDpr(quality.dpr);
      } else if (gpuBudget.wantsDprUp() && quality.dpr < quality.maxDpr) {
        quality.dpr = Math.min(quality.maxDpr, quality.dpr + 0.25);
        setDpr(quality.dpr);
      }
    }
    if (delta > 0.25) return; // tab was hidden or the page stalled: not a real measurement
    const a = acc.current;
    a.time += delta;
    a.frames++;
    if (a.time < 1) return;
    quality.fps = a.frames / a.time;
    a.time = 0;
    a.frames = 0;

    if (quality.fps < 45) {
      a.slow++;
      a.fast = 0;
    } else if (quality.fps > 57) {
      a.fast++;
      a.slow = 0;
    } else {
      a.slow = a.fast = 0;
    }

    if (a.slow >= 2) {
      a.slow = 0;
      if (stepDown(quality, relView.active, lens.active) === 'dpr') setDpr(quality.dpr);
    } else if (a.fast >= 5) {
      a.fast = 0;
      if (stepUp(quality, relView.active, lens.active) === 'dpr') setDpr(quality.dpr);
    }
  });

  return null;
}
