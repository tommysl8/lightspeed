#include <common>
#include <logdepthbuf_pars_fragment>

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = (gl_PointCoord - 0.5) * vSize;
  float g = vPeak * exp(-dot(p, p) / (2.0 * vSigma * vSigma));
  if (g < 0.0015) discard;
  gl_FragColor = vec4(vColor * g, 1.0);
}
