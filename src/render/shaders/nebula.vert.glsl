// A nebula's picture as a card in space (scene/Nebulae.tsx): a grid of vertices across the card,
// each placed from the camera in parsecs (float64 on the CPU for the centre, so it keeps its
// precision anywhere in the Galaxy), drawn at unit distance along its direction like the stars, and
// in flight aberrated vertex by vertex (the grid lets a large card curve as the sky does).
#include <common>
#include <lightspeed_relativity>
#ifdef LENS
// Near a black hole (render/lensVariants.ts swaps in this shader compiled with LENS while the lens is
// drawn) each vertex of the grid goes to its primary image (lensImage, tier 1, as the stars), so the card
// bends as far as its 9 × 9 grid allows, and the light's frequency factor gains the observer's
// gravitational shift ln g (its surface brightness is otherwise unchanged by the lens). No second image.
// Cost: 81 vertices a card.
//
// Twins: physics/relativity.ts, physics/lensPoint.ts (pointImageTier1), sim/galaxy/cards.ts (apparentCard:
// where the picture shows, for its credit line).
#include <lightspeed_lens>
#endif

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
#ifdef LENS
  float lnDfSrc;
  vec3 image;
  float lnMu;
  float lnG;
  lensImage(frameAberrate(dir, lnDfSrc) * (length(rel) * uLensScale.y), 0.0, 0.0, image, lnMu, lnG);
  float lnDfImg;
  vec3 dShip = relAberrate(frameUnaberrate(image, lnDfImg), lnD);
  lnD += lnDfSrc + lnG - lnDfImg;
#else
  vec3 dShip = relAberrate(dir, lnD);
#endif
  vUv = uv;
  // Seen edge-on a flat card is a line: it fades away as it turns side-on.
  vFacing = abs(dot(dir, uNormal));
  vLnD = lnD;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
}
