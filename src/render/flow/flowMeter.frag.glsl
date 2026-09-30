// The exposure's meter for the flow's glare (render/flow/flowMap.ts flowExposureTarget), and the picture's displayed
// light for the handover from its point (flowHandoverGain): the mean, over the look angles the view holds, of
// √(I k^3.5), the flow's displayed brightness at no exposure in the sky's √ law (I the map's visible intensity at
// infinity, k the lens frame's blueshift of light from far away at that look angle); and the same summed over every
// row, the whole picture. Like a camera's averaging meter, a small bright ring hardly moves the first (the flow then
// glares as its point did) and a flow that fills the view stops it down. Two passes: each row's mean over the azimuth
// and its solid angle (2π sin α Δα); then the sums of solid angle × mean, pixel 0 over the rows whose gap lies between
// uFlowSize.z and .w (the view's axis's angle from the hole ± the half-diagonal), pixel 1 over all of them, each
// written as a 16-bit ln in the red and green bytes of a 2 × 1 target the CPU reads back without waiting (three.js
// readRenderTargetPixelsAsync); the CPU divides the first by the meter's own solid angle.
//
// Cost: 64 × 256 + 512 reads, only on the frames the visible map changes or the view turns by a degree.
//
// Twins: render/flow/flowMap.ts (the passes, the decoding: ln = v/65535 × 120 − 60, readMeter).

uniform highp sampler2D uFlowSrc;      // stage 0: the map; stage 1: the rows' ln means and solid angles
uniform highp sampler2D uFlowBlurRows; // rows × 2: (j, 0) = (row j's gap, σ_α, σ_ω, its width Δα), (j, 1).x = its ln k
uniform vec4 uFlowSize;                // (rows, columns, the metered gaps from, to)
uniform float uFlowEdge;               // α_edge (α = α_edge + g)
uniform float uFlowStage;              // 0 the rows (a rows × 1 target), 1 the sums (2 × 1)

void main() {
  if (uFlowStage < 0.5) {
    // ln of the row's mean √(I k^3.5) over the azimuth (a half-float holds its logarithm, not the sum: near the
    // horizon k^1.75 alone reaches 1e5), and the row's solid angle 2π sin α Δα
    int j = int(gl_FragCoord.x);
    vec4 row = texelFetch(uFlowBlurRows, ivec2(j, 0), 0);
    float s = 0.0;
    for (int k = 0; k < 64; k++) {
      if (float(k) >= uFlowSize.y) break;
      s += sqrt(max(texelFetch(uFlowSrc, ivec2(k, j), 0).r, 0.0));
    }
    float lnk = texelFetch(uFlowBlurRows, ivec2(j, 1), 0).x;
    float w = 6.2831853072 * sin(clamp(uFlowEdge + row.x, 0.0, 3.1415926536)) * row.w;
    gl_FragColor = vec4(log(max(s / uFlowSize.y, 1e-30)) + 1.75 * lnk, w, 0.0, 1.0);
  } else {
    // Σ over the rows of solid angle × mean: the flow's √-law light in the meter (pixel 0; the CPU divides by the
    // meter's own solid angle, beyond the flow's outer angle included, where it adds nothing), and in the whole
    // picture (pixel 1)
    bool all = gl_FragCoord.x > 1.0;
    float num = 0.0;
    for (int j = 0; j < 256; j++) {
      if (float(j) >= uFlowSize.x) break;
      float gap = texelFetch(uFlowBlurRows, ivec2(j, 0), 0).x;
      if (!all && (gap < uFlowSize.z || gap > uFlowSize.w)) continue;
      vec2 t = texelFetch(uFlowSrc, ivec2(j, 0), 0).rg;
      num += t.y * exp(min(t.x, 60.0));
    }
    float m = num > 0.0 ? log(num) : -60.0;
    float v = floor(clamp((m + 60.0) / 120.0, 0.0, 1.0) * 65535.0 + 0.5);
    float hi = floor(v / 256.0);
    gl_FragColor = vec4(hi / 255.0, (v - hi * 256.0) / 255.0, 0.0, 1.0);
  }
}
