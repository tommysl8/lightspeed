// The Milky Way behind everything in the classical view (the relativistic view draws it in the
// remap pass, aberrated and Doppler shifted), filtered over each pixel's footprint on the map.
#include <lightspeed_milkyway>

uniform mat4 uProjInv;
uniform mat4 uCamWorld;

varying vec2 vUv;

void main() {
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  vec3 eye;
  vec3 p = milkyWayP(d, eye);
  gl_FragColor = vec4(milkyWayDisplay(p, eye, 1.0), 1.0);
}
