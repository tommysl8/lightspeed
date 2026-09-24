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
};
