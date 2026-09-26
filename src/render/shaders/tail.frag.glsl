#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uGain;

varying vec3 vColor;
varying float vSide;

void main() {
  #include <logdepthbuf_fragment>
  // Soft edges across the ion tail.
  float across = 1.0 - vSide * vSide;
  gl_FragColor = vec4(vColor * across * uGain, 1.0);
}
