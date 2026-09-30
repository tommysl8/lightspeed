/**
 * Adaptive quality: the renderer drops multisampling, lowers its pixel ratio and then the
 * relativistic cube-map resolution when frames run slow, and raises the last two again with
 * headroom. Near a black hole the lens's own quality rungs come first (render/gpuBudget.ts, the
 * GPU-time controller): while a lens is drawn the pixel-ratio steps wait for it.
 */
export const quality = {
  /** Measured frames per second (1 s average). */
  fps: 0,
  /** Current device-pixel ratio used for rendering. */
  dpr: 1,
  /** Upper bound for the pixel ratio (capped at 2: render/AdaptiveQuality.tsx). */
  maxDpr: 2,
  /** Relativistic cube-map face size, px. */
  cubeFace: 1024,
  /** Samples of the scene's multisampled buffer (0: none). */
  msaa: 4,
  /** The GPU shares the computer's memory and power (Intel and most laptop and phone GPUs). */
  integrated: false,
  /** The black hole lens's quality rung (0 everything; render/gpuBudget.ts sets it near a hole). */
  lensRung: 0 as LensRung,
  /**
   * Bloom's luminance pass at half resolution (render/RenderPipeline.tsx), with a slight change of look. Off: it would
   * be turned on only if it saved at least 0.4 ms while changing at most 0.1 % of pixels by more than 2/255 in the
   * standard views, and it measured 0.14–0.19 ms saved at 4,000 au from Sgr A* on the target laptop.
   */
  bloomHalfLuminance: false,
};

/**
 * The black hole lens's quality rungs: 0 everything; 1 the photon ring's band with 4 sub-rays, 30,000 of the
 * nuclear cluster's stars, its glow in 8 steps, the flow map 192 × 48 with 32 samples in motion and the sky
 * cube's faces every third frame; 2 besides, the Doppler skip at 1e-2, no images of orders 2–3, the Galaxy
 * targets without mipmaps and the sky cube frozen. Only the GPU-time controller writes it.
 */
export type LensRung = 0 | 1 | 2;

export type Quality = typeof quality;

/** Cube-map face sizes, smallest first. */
export const CUBE_SIZES = [512, 768, 1024];

/**
 * One step down when frames run slow. Multisampling goes first on a high-density screen: at a
 * pixel ratio of 1.5 or more its edges are already fine, and on an integrated GPU the
 * multisampled buffer (clearing and resolving it, and drawing the stars' points into it) is the
 * largest single cost of a frame (Intel Xe at 1936 × 1384: 5.9 ms of 9.8). Then the pixel ratio, in
 * steps of 0.25; multisampling at a pixel ratio of 1; then the cube map in the relativistic
 * view. Returns what changed, or null at the bottom. While a black hole's lens is drawn
 * (lensActive) the pixel ratio is left to the GPU-time controller (render/gpuBudget.ts), which
 * steps it only once the lens's rungs are exhausted.
 */
export function stepDown(q: Quality, relativistic: boolean, lensActive = false): 'msaa' | 'dpr' | 'cube' | null {
  if (q.msaa > 0 && q.dpr >= 1.5) {
    q.msaa = 0;
    return 'msaa';
  }
  if (q.dpr > 1 && !lensActive) {
    q.dpr = Math.max(1, q.dpr - 0.25);
    return 'dpr';
  }
  if (q.msaa > 0) {
    q.msaa = 0;
    return 'msaa';
  }
  const ci = CUBE_SIZES.indexOf(q.cubeFace);
  if (relativistic && ci > 0) {
    q.cubeFace = CUBE_SIZES[ci - 1];
    return 'cube';
  }
  return null;
}

/**
 * One step up with headroom: the cube map in the relativistic view, then the pixel ratio.
 * Multisampling, once dropped, stays off: it is too large a step to take back without the
 * frame rate swinging between the two. While a black hole's lens is drawn (lensActive) the
 * pixel ratio is the GPU-time controller's to raise.
 */
export function stepUp(q: Quality, relativistic: boolean, lensActive = false): 'dpr' | 'cube' | null {
  const ci = CUBE_SIZES.indexOf(q.cubeFace);
  if (relativistic && ci >= 0 && ci < CUBE_SIZES.length - 1) {
    q.cubeFace = CUBE_SIZES[ci + 1];
    return 'cube';
  }
  if (q.dpr < q.maxDpr && !lensActive) {
    q.dpr = Math.min(q.maxDpr, q.dpr + 0.25);
    return 'dpr';
  }
  return null;
}

/**
 * Whether a renderer string names an integrated or mobile GPU (Intel, ARM Mali, Qualcomm
 * Adreno, PowerVR, or a software renderer). Such GPUs share system memory, so they get a
 * smaller texture budget and start the relativistic cube map smaller.
 */
export function isIntegratedGpu(renderer: string, deviceMemoryGb?: number): boolean {
  if (/intel|mali|adreno|powervr|swiftshader|llvmpipe|microsoft basic render/i.test(renderer)) return true;
  return deviceMemoryGb !== undefined && deviceMemoryGb <= 4;
}

/** The GPU's name, as far as the browser tells it ('' when it does not). */
export function gpuRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}
