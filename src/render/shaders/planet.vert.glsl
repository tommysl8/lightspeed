// Lighting happens in camera-relative world space (not view space), so the same material
// renders correctly from the main camera and from the six faces of the relativistic cube map.
// All cameras sit at the floating origin.
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  // Inverse-transpose keeps normals right for oblate (non-uniformly scaled) bodies.
  vNormalW = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
