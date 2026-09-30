// "Blur to the EHT's resolution": the flow map convolved with the Event Horizon Telescope's beam,
// 20 µas FWHM seen from Earth, which is 3.90 M of impact parameter at Sgr A*'s distance: a Gaussian of σ_b = 1.656 M
// in the plane of impact parameters (b, ω), carried into this camera's view. Separable, in two passes over the map
// (it costs nothing per pixel of the screen). Along the look angle, σ_α = σ_b / |db/dα| (the row's own b(α):
// r sin α/√(1 − 2/r) for a hovering observer, r sin α/(1 − v cos α) for the raindrop; at most 0.5 rad where the row
// turns), summed over every row of the map, each weighted by the Gaussian at its own look angle and by its own width
// in look angle (the rows are uneven, crowded at the shadow's edge, where the picture also jumps: taps between rows
// drew rings there). Along the azimuth, σ_ω = σ_b / b (at most π): 25 taps from −3σ to +3σ read by hardware bilinear
// filtering, repeating in ω (the columns are even and the picture smooth that way).
//
// Cost: along the look angle 256 rows a texel, 16,384 texels (about 0.3 ms); along the azimuth 25 reads a texel;
// only on the frames the map changes while the blur is on.
//
// Twins: render/flow/flowMap.ts (the rows' look angles, widths and σ, the passes), shaders/flowLookup.glsl (the rows).

uniform highp sampler2D uFlowSrc;      // the map to blur
uniform highp sampler2D uFlowBlurRows; // RGBA32F rows × 2: row 0 (the row's signed gap g, σ_α, σ_ω, its width in α)
uniform vec4 uFlowSize;                // (rows, columns, rows inside the edge, 0)
uniform float uFlowAlong;              // 0 along the look angle, 1 along the azimuth

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 row = texelFetch(uFlowBlurRows, ivec2(px.y, 0), 0);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  if (uFlowAlong < 0.5) {
    float inv2s2 = 0.5 / (row.y * row.y);
    for (int i = 0; i < 256; i++) {
      if (float(i) >= uFlowSize.x) break;
      vec4 other = texelFetch(uFlowBlurRows, ivec2(i, 0), 0);
      float d = other.x - row.x;
      float q = d * d * inv2s2;
      if (q > 6.0) continue;
      float w = exp(-q) * other.w;
      sum += w * texelFetch(uFlowSrc, ivec2(px.x, i), 0);
      wsum += w;
    }
  } else {
    float u0 = (float(px.x) + 0.5) / uFlowSize.y;
    float v0 = (float(px.y) + 0.5) / uFlowSize.x;
    for (int i = 0; i < 25; i++) {
      float t = (float(i) - 12.0) * 0.25;
      float w = exp(-0.5 * t * t);
      sum += w * textureLod(uFlowSrc, vec2(u0 + t * row.z * 0.1591549431, v0), 0.0);
      wsum += w;
    }
  }
  gl_FragColor = wsum > 0.0 ? sum / wsum : texelFetch(uFlowSrc, px, 0);
}
