/**
 * Adaptive quality: the renderer drops multisampling, lowers its pixel ratio and then the
 * relativistic cube-map resolution when frames run slow, and raises the last two again with
 * headroom.
 */
export const quality = {
  /** Measured frames per second (1 s average). */
  fps: 0,
  /** Current device-pixel ratio used for rendering. */
  dpr: 1,
  /** Upper bound for the pixel ratio (the spec caps it at 2). */
  maxDpr: 2,
  /** Relativistic cube-map face size, px. */
  cubeFace: 1024,
  /** Samples of the scene's multisampled buffer (0: none). */
  msaa: 4,
  /** The GPU shares the computer's memory and power (Intel and most laptop and phone GPUs). */
  integrated: false,
};

export type Quality = typeof quality;

/** Cube-map face sizes, smallest first. */
export const CUBE_SIZES = [512, 768, 1024];

/**
 * One step down when frames run slow. Multisampling goes first on a high-density screen: at a
 * pixel ratio of 1.5 or more its edges are already fine, and on an integrated GPU the
 * multisampled buffer (clearing and resolving it, and drawing the stars' points into it) is the
 * largest single cost of a frame (Intel Xe at 1936 × 1384: 5.9 ms of 9.8). Then the pixel ratio, in
 * steps of 0.25; multisampling at a pixel ratio of 1; then the cube map in the relativistic
 * view. Returns what changed, or null at the bottom.
 */
export function stepDown(q: Quality, relativistic: boolean): 'msaa' | 'dpr' | 'cube' | null {
  if (q.msaa > 0 && q.dpr >= 1.5) {
    q.msaa = 0;
    return 'msaa';
  }
  if (q.dpr > 1) {
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
 * frame rate swinging between the two.
 */
export function stepUp(q: Quality, relativistic: boolean): 'dpr' | 'cube' | null {
  const ci = CUBE_SIZES.indexOf(q.cubeFace);
  if (relativistic && ci >= 0 && ci < CUBE_SIZES.length - 1) {
    q.cubeFace = CUBE_SIZES[ci + 1];
    return 'cube';
  }
  if (q.dpr < q.maxDpr) {
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
