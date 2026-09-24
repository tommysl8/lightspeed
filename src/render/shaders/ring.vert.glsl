#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vLocal; // position in the ring plane (local units, km before display scaling)
varying vec3 vPosW;  // camera-relative world position

void main() {
  vLocal = position.xz;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
