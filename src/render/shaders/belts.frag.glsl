#include <common>
#include <logdepthbuf_pars_fragment>

varying vec3 vColor;
varying float vAlpha;

void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vAlpha * (1.0 - smoothstep(0.35, 1.0, r));
  if (a < 0.0002) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
}
