#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
uniform float uOpacity;
uniform float uWidth;
uniform float uPixelRatio;

varying float vSide;
varying float vAlpha;

void main() {
  #include <logdepthbuf_fragment>
  // vSide is the signed distance from the centre line in px: anti-alias the edges.
  float halfW = 0.5 * uWidth * uPixelRatio;
  float edge = 1.0 - smoothstep(halfW - 0.5, halfW + 0.75, abs(vSide));
  float a = vAlpha * uOpacity * edge;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
