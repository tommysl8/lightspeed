/**
 * Adaptive quality: the renderer lowers its pixel ratio (and then the relativistic cube-map
 * resolution) when frames run slow, and raises them again with headroom.
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
  /** The GPU shares the computer's memory and power (Intel and most laptop and phone GPUs). */
  integrated: false,
};

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
