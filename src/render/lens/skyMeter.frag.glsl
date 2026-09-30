// The sky's averaging meter near a black hole (render/lens/skyMeter.ts): the log-average of the scene pass's displayed
// luminance over the frame's lit pixels, exp⟨ln Y⟩ (a camera's averaging meter, the "key" of photographic tone
// reproduction), which the view's exposure brings down to SKY_METER_KEY when the sky itself glares (the nuclear star
// cluster's million stars from within a parsec of Sgr A*, or M87's own starlight from inside it). Pixels with no
// light at all, the shadow and the dark region of a fall, are left out: they would pull the key down and leave the sky
// round a shadow that fills half the view blown out. The share of the frame that is lit comes too: a dark sky with only
// its stars lit (a stellar hole's) is not a glare (render/lens/skyMeter.ts).
//
// Two stages: (0) a 16 × 16 target, each texel the mean of ln Y over the lit samples of a 16 × 16 grid spread evenly
// over its cell of the frame (each read at a texel corner, so the filter averages four pixels) and the share of them
// lit; (1) the lit samples' mean over all 256 cells into a 1 × 1 target, as a 16-bit ln in the red and green bytes,
// ln = (v − 1)/65534 × 120 − 60 (0: nothing lit), and the lit share in the blue, which the CPU reads back without
// waiting (three.js readRenderTargetPixelsAsync).
//
// Cost: 65,536 filtered reads and 256 more, a few hundredths of a millisecond; only near a hole.
//
// Twins: render/lens/skyMeter.ts (the passes, the decoding, the exposure), render/flow/flowMeter.frag.glsl (the
// same readout for the accretion flow's glare).

uniform highp sampler2D uSrc; // stage 0: the scene pass's frame (linear light, before bloom); stage 1: stage 0's texels
uniform vec2 uSrcPx;          // the frame's size, device px
uniform float uStage;         // 0 the cells (16 × 16 target), 1 the mean (1 × 1)

const float CELLS = 16.0;
const float SAMPLES = 16.0;
// A sample with less light than this is unlit (captured rays are drawn exactly black).
const float LIT = 1e-7;

void main() {
  if (uStage < 0.5) {
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 size = uSrcPx / CELLS;
    float s = 0.0;
    float n = 0.0;
    for (int j = 0; j < 16; j++) {
      for (int i = 0; i < 16; i++) {
        // a texel corner inside the cell: the bilinear read there averages the four pixels round it
        vec2 p = floor((cell + (vec2(float(i), float(j)) + 0.5) / SAMPLES) * size) + 1.0;
        vec3 c = textureLod(uSrc, min(p, uSrcPx - 1.0) / uSrcPx, 0.0).rgb;
        float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
        if (y > LIT) {
          s += log(y);
          n += 1.0;
        }
      }
    }
    gl_FragColor = vec4(n > 0.0 ? s / n : 0.0, n / (SAMPLES * SAMPLES), 0.0, 1.0);
  } else {
    float s = 0.0;
    float n = 0.0;
    for (int j = 0; j < 16; j++) {
      for (int i = 0; i < 16; i++) {
        vec2 t = texelFetch(uSrc, ivec2(i, j), 0).rg;
        s += t.x * t.y;
        n += t.y;
      }
    }
    float v = 0.0;
    if (n > 0.0) {
      float m = s / n;
      v = floor(clamp((m + 60.0) / 120.0, 0.0, 1.0) * 65534.0 + 1.5);
    }
    float hi = floor(v / 256.0);
    gl_FragColor = vec4(hi / 255.0, (v - hi * 256.0) / 255.0, n / (CELLS * CELLS), 1.0);
  }
}
