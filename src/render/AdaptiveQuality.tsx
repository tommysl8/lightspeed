import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { gpuRendererName, isIntegratedGpu, quality } from './quality';
import { relView } from './relativisticView';
import { textures, TEXTURE_BUDGET_INTEGRATED_BYTES } from './textures';

const CUBE_SIZES = [512, 768, 1024];

/**
 * Keeps the frame rate near 60 fps on ordinary laptops. It measures a 1 s average; after two
 * slow seconds it steps the pixel ratio down (then the cube-map size while the relativistic
 * view is active). After five fast seconds it steps back up. On an integrated GPU the cube map
 * starts at 768 px a face and the texture budget is smaller (its memory is the computer's).
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
    }
  }, [gl]);

  useFrame((_, delta) => {
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
      const ci = CUBE_SIZES.indexOf(quality.cubeFace);
      if (quality.dpr > 1) {
        quality.dpr = Math.max(1, quality.dpr - 0.25);
        setDpr(quality.dpr);
      } else if (relView.active && ci > 0) {
        quality.cubeFace = CUBE_SIZES[ci - 1];
      }
    } else if (a.fast >= 5) {
      a.fast = 0;
      const ci = CUBE_SIZES.indexOf(quality.cubeFace);
      if (relView.active && ci < CUBE_SIZES.length - 1) {
        quality.cubeFace = CUBE_SIZES[ci + 1];
      } else if (quality.dpr < quality.maxDpr) {
        quality.dpr = Math.min(quality.maxDpr, quality.dpr + 0.25);
        setDpr(quality.dpr);
      }
    }
  });

  return null;
}
