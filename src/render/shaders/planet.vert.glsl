#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;

void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  // normalMatrix is the inverse-transpose, so this stays correct for oblate (non-uniform) scale.
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
