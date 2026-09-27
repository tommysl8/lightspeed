// The map of the cosmic microwave background as a layer of the sky (scene/CmbMap.tsx): the WMAP
// nine-year ILC map (cmb-data.png: a linear code k per pixel, ΔT = (k − 127.5) × 500/255 µK about
// 2.7255 K), in galactic coordinates, turned into the app's ecliptic world axes and drawn in false
// colour: black at the mean temperature, blue colder and red warmer, with the end colours of
// Moreland's cool–warm map (±250 µK), so the contrast is enhanced about 10,000 times and the sky
// stays dark enough for the stars. The map is published seen from inside the sky: the Galactic
// centre in the middle, longitude increasing to the left, v = 0 at the top (three.js flips it).
uniform sampler2D uCmbTex;
uniform mat3 uWorldToGal;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform float uGain;

varying vec2 vUv;

// Moreland's end colours, (59, 76, 192) and (180, 4, 38) in sRGB, as linear RGB.
const vec3 COLD = vec3(0.0437, 0.0723, 0.5271);
const vec3 WARM = vec3(0.4564, 0.0012, 0.0194);

void main() {
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  vec3 g = uWorldToGal * d;
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / 6.283185307179586), 0.5 + b / 3.141592653589793);
  // Derivatives across the seam at l = 180° taken the short way round (no one-pixel line there).
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  float k = textureGrad(uCmbTex, uv, dx, dy).r * 255.0;
  float t = clamp((k - 127.5) / 127.5, -1.0, 1.0);
  // Linear light as t², so that the colour's lightness grows about evenly with |ΔT|.
  vec3 c = (t < 0.0 ? COLD : WARM) * (t * t);
  gl_FragColor = vec4(c * uGain, 1.0);
}
