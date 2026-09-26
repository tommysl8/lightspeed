#include <common>
#include <logdepthbuf_pars_fragment>

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

// Tone mapping (AgX) encodes each channel's logarithm, which draws every colour towards grey, and
// more so as it brightens past about 1: the brightest stars came out nearly white (Betelgeuse a
// pale peach, Rigel grey) while fainter ones kept a little colour. For points of light, whose
// colour is how a star is told apart, two corrections: the colour's saturation is raised by
// POINT_SATURATION before tone mapping, which offsets most of AgX's greying (measured on the
// canvas from Earth at pixel ratio 2: Betelgeuse's core 202,171,117, its 3,600 K blackbody
// 255,208,146, where it was 215,203,194; Rigel's 168,182,200 for 200,219,255); and up to a blinding
// brightness the brightest channel is eased under HUE_CAP with the channels' ratios, hence the
// hue, unchanged. Only the brightest sources (Venus, the Sun from the outer planets) still go past
// it into the bloom and bleach, as glare does.
const float POINT_SATURATION = 1.5;
const float HUE_KNEE = 0.6;
const float HUE_CAP = 1.0;

vec3 keepHue(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 s = max(vec3(0.0), l + POINT_SATURATION * (c - l));
  float m = max(max(s.r, s.g), s.b);
  if (m <= HUE_KNEE) return s;
  float y = (m - HUE_KNEE) / (HUE_CAP - HUE_KNEE);
  float eased = HUE_KNEE + (HUE_CAP - HUE_KNEE) * y / (1.0 + y);
  return mix(s * (eased / m), c, smoothstep(4.0, 16.0, m));
}

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = (gl_PointCoord - 0.5) * vSize;
  float g = vPeak * exp(-dot(p, p) / (2.0 * vSigma * vSigma));
  if (g < 0.0015) discard;
  gl_FragColor = vec4(keepHue(vColor * g), 1.0);
}
