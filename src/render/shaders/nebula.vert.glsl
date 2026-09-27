// A nebula's picture as a card in space (scene/Nebulae.tsx): a grid of vertices across the card,
// each placed from the camera in parsecs (float64 on the CPU for the centre, so it keeps its
// precision anywhere in the Galaxy), drawn at unit distance along its direction like the stars, and
// in flight aberrated vertex by vertex (the grid lets a large card curve as the sky does).
#include <common>
#include <lightspeed_relativity>

uniform vec3 uRel;    // the card's centre from the camera, pc, world axes
uniform vec3 uRight;  // half the card's width along image-right, pc
uniform vec3 uUp;     // half its height along image-up, pc
uniform vec3 uNormal; // the card's normal (it faces the Sun)

varying vec2 vUv;
varying float vFacing;
varying float vLnD;

void main() {
  vec3 rel = uRel + (2.0 * uv.x - 1.0) * uRight + (2.0 * uv.y - 1.0) * uUp;
  vec3 dir = normalize(rel);
  float lnD;
  vec3 dShip = relAberrate(dir, lnD);
  vUv = uv;
  // Seen edge-on a flat card is a line: it fades away as it turns side-on.
  vFacing = abs(dot(dir, uNormal));
  vLnD = lnD;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
}
