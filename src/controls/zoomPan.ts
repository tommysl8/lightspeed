/**
 * Smooth, efficient zoom-and-pan path (van Wijk & Nuij, "Smooth and efficient zooming and
 * panning", IEEE InfoVis 2003; the same model as d3.interpolateZoom).
 *
 * The camera pans a distance d while its "view width" w (here: distance from the camera to
 * the point it looks at) goes from w0 to w1. The optimal path zooms out, pans, and zooms back
 * in, spending equal time per factor of scale. A jump from Earth to Neptune (a factor of ~10⁵
 * in scale) therefore feels as smooth as a short hop.
 *
 * Written with asinh instead of log(√(b²+1) − b), which stays accurate for scale ratios of
 * 10⁶ and more.
 */
export interface ZoomPanPath {
  /** Path length in the zoom-pan metric; use it to pick a duration. */
  S: number;
  /** Position at t ∈ [0, 1]: u = fraction of the pan completed, w = view width. */
  at(t: number): { u: number; w: number };
}

export function zoomPanPath(d: number, w0: number, w1: number, rho = Math.SQRT2): ZoomPanPath {
  // A zero (or negative, or NaN) scale has no logarithm: the path would be NaN throughout.
  const W_MIN = 1e-9;
  w0 = w0 > W_MIN ? w0 : W_MIN;
  w1 = w1 > W_MIN ? w1 : W_MIN;
  d = d > 0 ? d : 0;
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;
  if (d < 1e-9 * Math.max(w0, w1)) {
    const S = Math.log(w1 / w0) / rho;
    return { S: Math.abs(S), at: (t) => ({ u: t, w: w0 * Math.exp(rho * t * S) }) };
  }
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d * d) / (2 * w0 * rho2 * d);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d * d) / (2 * w1 * rho2 * d);
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / rho;
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  return {
    S,
    at(t) {
      const s = t * S;
      const u = (w0 / (rho2 * d)) * (coshR0 * Math.tanh(rho * s + r0) - sinhR0);
      const w = (w0 * coshR0) / Math.cosh(rho * s + r0);
      return { u, w };
    },
  };
}

/** Smooth ease-in-out (quintic smootherstep). */
export const easeInOut = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
