/**
 * The ring of light of a body lined up almost exactly behind a black hole, one instance per
 * ring: a quad over the ring's box on screen, placed in NDC from aBox (scene/LensRings.tsx works the box out
 * on the CPU from points on the ring, with three PSF widths of margin, clipped to its half of a split view),
 * with the ray through each corner in camera space for the fragment shader. The ray is linear in NDC, so the
 * interpolated vRay is the pixel's own ray exactly (it inverts the perspective projection at z = −1: x_ndc =
 * P₀x − P₈, y_ndc = P₅y − P₉).
 *
 * Why here: the ring is a circle on the sky, which the projection turns into an ellipse off the screen's centre;
 * drawing it per pixel from its angle is right at any size. Cost: up to eight quads, each a ring's box (a few
 * hundred to a few thousand pixels), only while a ring shows. Twins: lensRing.frag.glsl; the CPU side is
 * scene/LensRings.tsx and sim/lensBodies.ts (ringOf).
 */
attribute vec4 aBox;     // the ring's box, NDC (x0, y0, x1, y1)
attribute vec3 aCentre;  // the ring's centre, unit, camera space
attribute vec3 aTowards; // the middle of the primary arc (towards the source), unit, camera space, ⟂ aCentre
attribute vec4 aRingA;   // chord of the radius 2 sin(ρ/2), cos(ρ/2), cos of the arcs' half-angle (≤ 0: a full ring), peak
attribute vec4 aRingB;   // linear colour of luminance 1 (rgb) and the PSF's σ, device px (a)

varying vec3 vRay;
varying vec3 vCentre;
varying vec3 vTowards;
varying vec4 vRingA;
varying vec4 vRingB;

void main() {
  vec2 corner = position.xy * 0.5 + 0.5; // the quad's corners, 0…1
  vec2 ndc = mix(aBox.xy, aBox.zw, corner);
  vRay = vec3((ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0], (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1], -1.0);
  vCentre = aCentre;
  vTowards = aTowards;
  vRingA = aRingA;
  vRingB = aRingB;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
