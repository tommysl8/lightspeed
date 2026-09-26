// Rings around the stars that have known planets (scene/PlanetHosts.tsx): one point per host star
// of the star catalogue, moved like the stars in stars.vert.glsl and drawn as a small ring of fixed
// size on screen around the star. Shown within some tens of parsecs of the camera, fading out with
// distance, and fading away close to the star, where its planets and their orbits take over. In
// the relativistic view each ring is aberrated like its star (it is a guide, so it keeps its
// colour).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute vec3 aVel; // 0.1 km/s steps, heliocentric, J2000 ecliptic; `position` is the J2000 place, pc

uniform vec3 uCamHi;
uniform vec3 uCamLo;
uniform float uYears;
uniform float uRetarded;
uniform float uPixelRatio;
uniform float uNearPc;  // fully shown within this distance, pc…
uniform float uFarPc;   // …and gone beyond this one
uniform float uSizePx;

varying float vAlpha;

const float PC_PER_YR_PER_STEP = 1.0227121650537077e-7;
const float C_PC_PER_YR = 0.30660139378555057;

void main() {
  vec3 v = aVel * PC_PER_YR_PER_STEP;
  vec3 rel = (position - uCamHi) - uCamLo + v * (uYears + length(position) / C_PC_PER_YR);
  rel -= uRetarded * v * (length(rel) / C_PC_PER_YR);
  float d = max(length(rel), 1e-12);
  // Faded out with distance, and close to the star (inside 0.3 pc, gone by 0.1 pc).
  vAlpha = (1.0 - smoothstep(uNearPc, uFarPc, d)) * smoothstep(0.1, 0.3, d);
  if (vAlpha <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 e = rel / d;
  float lnD;
  vec3 dShip = relAberrate(vec3(e.x, e.z, -e.y), lnD);
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = uSizePx * uPixelRatio;
  #include <logdepthbuf_vertex>
}
