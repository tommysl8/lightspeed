#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vLocal; // position in the ring plane (local units, km before display scaling)
varying vec3 vPosV;

void main() {
  vLocal = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
