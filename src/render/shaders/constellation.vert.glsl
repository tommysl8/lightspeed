// Constellation figures between the real 3D stars (scene/Constellations.tsx). Each figure segment
// joins two catalogue stars; it is cut into pieces whose ends are points on the straight 3D
// segment between the stars (moved like the stars in stars.vert.glsl, relative to the camera),
// drawn at their true places. From Earth the figures are the familiar ones; as you fly away they
// come apart, as the stars they join do, and segments stretched across much of the sky fade out,
// as does (unless the figures were turned on) a whole figure that has come apart
// (uFigureFade, from scene/Constellations.tsx). In the relativistic view each point is aberrated
// like a star (the figures are guides, so they get no Doppler colour).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#ifdef LENS
// Near a black hole (render/lensVariants.ts swaps in this shader compiled with LENS while the lens is
// drawn) each point goes to its star-like primary image (lensImage, tier 1): the figures follow the stars'
// primary images, drawn at the same distance, so clipping is still the straight line's. A guide: no second
// image, no colour. Cost: a few table reads a point.
//
// Twin: physics/lensPoint.ts (pointImageTier1).
#include <lightspeed_lens>
#endif

attribute vec3 aVelA; // the first star's velocity (0.1 km/s steps); `position` is its J2000 place, pc
attribute vec3 aPosB; // the second star's J2000 place and velocity
attribute vec3 aVelB;
attribute float aT;   // where along the segment this vertex is, 0–1
attribute float aFigure; // which figure the segment belongs to

uniform vec3 uCamHi;
uniform vec3 uCamLo;
uniform float uYears;
uniform float uRetarded;
uniform float uFigureFade[96]; // CONSTELLATION_FIGURE_SLOTS

varying float vAlpha;
varying float vGap; // angle to the nearer of the two stars, radians (for the gap round each star)

const float PC_PER_YR_PER_STEP = 1.0227121650537077e-7;
const float C_PC_PER_YR = 0.30660139378555057;

/** A star relative to the camera, pc, J2000 ecliptic: as in stars.vert.glsl. */
vec3 starRel(vec3 p, vec3 velSteps) {
  vec3 v = velSteps * PC_PER_YR_PER_STEP;
  vec3 rel = (p - uCamHi) - uCamLo + v * (uYears + length(p) / C_PC_PER_YR);
  return rel - uRetarded * v * (length(rel) / C_PC_PER_YR);
}

const float PC_KM = 3.0856775814913673e13;

void main() {
  vec3 a = starRel(position, aVelA);
  vec3 b = starRel(aPosB, aVelB);
  // A segment longer than 40° on the sky no longer outlines a figure (seen from far from the Sun,
  // or from beside one of its stars): it fades out by 90°.
  float span = acos(clamp(dot(normalize(a), normalize(b)), -1.0, 1.0));
  vAlpha = (1.0 - smoothstep(0.698, 1.571, span)) * uFigureFade[int(aFigure + 0.5)];
  vec3 p = mix(a, b, aT);
  float d = length(p);
  vec3 e = p / max(d, 1e-30);
  vec3 ua = normalize(a);
  vec3 ub = normalize(b);
  vGap = min(atan(length(cross(e, ua)), dot(e, ua)), atan(length(cross(e, ub)), dot(e, ub)));
  float lnD;
#ifdef LENS
  float lnDf;
  vec3 image;
  float lnMu;
  float lnG;
  lensImage(frameAberrate(vec3(e.x, e.z, -e.y), lnDf) * (d * uLensScale.y), 0.0, 0.0, image, lnMu, lnG);
  vec3 dShip = relAberrate(frameUnaberrate(image, lnDf), lnD);
#else
  vec3 dShip = relAberrate(vec3(e.x, e.z, -e.y), lnD);
#endif
  // At its true distance (km), not on a unit sphere: a piece that passes beside or behind the
  // camera (near a star of the figure) is then clipped as the straight line it is.
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * (dShip * (d * PC_KM)), 1.0);
  #include <logdepthbuf_vertex>
}
