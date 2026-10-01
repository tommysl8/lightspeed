// The cosmic web (sim/cosmos/cosmicWeb.ts; scene/CosmicWeb.tsx): 55,877 galaxies with measured
// distances from Cosmicflows-4, at their comoving places in megaparsecs (float32, heliocentric world
// axes), the camera as hi + lo floats. A map, not the light the eye would get: from out here every
// galaxy is far too faint to see. Each point is coloured by the kind of galaxy its distance method
// says it is and carries light by its infrared (Ks) luminosity; points fade out close to the camera,
// where the galaxies drawn as bodies take over, and dim gently with distance, for depth. The law of
// that light is the one the galaxy surveys use (galaxyMap.glsl), so the two maps agree where they meet.
//
// In the expanding universe (sim/cosmos/expansion.ts) a point with anchor c (its group's comoving
// place, its own, or home inside the Local Group) is at position + (a − 1) c at the clock's time, so
// groups keep their size while the space between them grows. Its light left it when the universe had
// scale factor a_e, from the anchor's comoving distance to the camera's (the cosmology module's
// emission table, emissionLn1pZ): with light-delayed positions on it is drawn where it was then (a_e
// rather than a_o times that distance), and its colour and brightness are those of the light that
// arrives: the map colour recoloured as a black body of its kind's temperature seen redshifted, at
// T D / (1 + z) with D the ship's Doppler factor, and brightened or dimmed with the flux (Tolman's
// (1 + z)⁻⁴ in surface brightness, the ship's D², shown with the display's square-root law). In
// flight each point is also aberrated like a star.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_galaxymap>
#ifdef LENS
// Near a black hole (render/lensVariants.ts swaps in this shader compiled with LENS while the lens is
// drawn) each point is drawn at its image (lensImage, tier 1, as the stars: stars.vert.glsl), its light
// shifted by the observer's gravitational ln g as well and brightened by the magnification μ (in the
// display's square-root law), and the points per pixel of sky, which set the drawing by lot, divided by μ.
// uImageOrder 1 draws the images bent round the far side of the hole: near M87* its Einstein ring is tens
// of degrees across and holds the whole web's second image (scene/CosmicWeb.tsx draws it while the Einstein
// angle is over 2°). Cost: without LENS, today's program; with it a few table reads a point (the second
// image of all 55,877 points, from M87*, was estimated at 0.18 ms).
//
// Twins: physics/relativity.ts, physics/lensPoint.ts (pointImageTier1).
#include <lightspeed_lens>
uniform float uImageOrder; // which image: 0 the primary, 1 the one bent round the far side of the hole
#endif

attribute vec3 aAnchor; // Mpc, comoving
attribute vec2 aAttr;   // type code (0 elliptical and lenticular, 1 spiral and irregular, 2 either), log10 L/L*

uniform vec3 uCamHi;
uniform vec3 uCamLo;
uniform float uOpacity;
uniform float uPixelRatio;
uniform float uNearMpc;  // points within this distance fade out (the bodies take over)
uniform vec3 uTypeColor[3];
uniform float uTypeLnT[3]; // ln of each kind's colour temperature (K)

uniform float uPointsPerPx; // the web's mean number of points per device pixel of sky, at rest
uniform float uLotMin;      // the smallest share of points drawn by lot where they crowd

uniform float uAm1;       // a − 1 at the clock's time
uniform float uAObs;      // a at the clock's time
uniform vec3 uAnchorObs;  // the camera's comoving place, Mpc
uniform float uRetarded;  // 1: drawn where they were when the light left
uniform float uSkyOn;     // 1: the emission table is in (redshifts computed)

// The emission lookup: the cosmology module's GLSL once its table is built (render/materials.ts).
//#emission

varying vec3 vColor;
varying float vAlpha;

/** Points fainter than this are drawn smaller, their light kept. */
const float FAINT_ALPHA = 0.05;
/** More points than this to a pixel (ahead of a fast ship) are drawn by lot. */
const float CROWD_MAX = 4.0;

float pointHash() {
  uint h = uint(gl_VertexID) * 2654435761u;
  h ^= h >> 15;
  h *= 2246822519u;
  h ^= h >> 13;
  return float(h) / 4294967296.0;
}

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vAlpha = 0.0;
}

void main() {
  // Where it is now: its comoving place moved with its anchor (float32 differences of nearby numbers).
  vec3 rel = (position - uCamHi) - uCamLo + uAm1 * aAnchor;
  float L = 0.0; // ln(1 + z)
  vec3 sep = aAnchor - uAnchorObs;
  float chi = length(sep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    L = emissionLn1pZ(chi);
    if (L > 1e29) {
      cull(); // beyond the particle horizon: none of its light has arrived
      return;
    }
    if (uRetarded > 0.5) rel -= (uAObs * (1.0 - exp(-L))) * sep;
  }
  float d = length(rel);
  float a = uOpacity * smoothstep(0.35 * uNearMpc, uNearMpc, d);
  if (a <= 0.0) {
    cull();
    return;
  }
  float lnD;
#ifdef LENS
  float lnDfSrc;
  vec3 image;
  float lnMu;
  float lnG;
  if (!lensImage(frameAberrate(rel / d, lnDfSrc) * (d * uLensScale.w), uImageOrder, 0.0, image, lnMu, lnG)) {
    cull();
    return;
  }
  float lnDfImg;
  vec3 dShip = relAberrate(frameUnaberrate(image, lnDfImg), lnD);
  // The boosts' own factor (the frame's there and back, and the view observer's); gravity's is added below.
  lnD += lnDfSrc - lnDfImg;
  // The boosts squeeze the sky by D², the lens stretches it by μ.
  float crowd = uPointsPerPx * exp(2.0 * lnD - lnMu);
#else
  vec3 dShip = relAberrate(rel / d, lnD);
  // Ahead of a fast ship D² more points share each pixel of sky. Beyond a few, they are drawn by lot
  // (the same ones every frame), each as bright as those left out (as galaxy.vert.glsl draws its
  // large splats): the same light, without tens of thousands of blends on one pixel.
  float crowd = uPointsPerPx * exp(2.0 * lnD);
#endif
  if (crowd > CROWD_MAX) {
    float p = max(CROWD_MAX / crowd, uLotMin);
    if (pointHash() >= p) {
      cull();
      return;
    }
    a /= p;
  }
  float l = exp2(3.3219281 * aAttr.y); // L / L*
  // Light by luminosity (gently: the survey spans 10⁴ in L) and by distance, for depth (galaxyMap.glsl:
  // it halves at uDepthMpc, and nearer points are brighter); the size only shapes the point, its alpha
  // being its light over its area.
  float px = mapSizePx(l, d, uPixelRatio);
  a *= mapLight(l) * mapDepth(d) * mapUnitPx2(uPixelRatio) / (px * px);
  int t = int(aAttr.x + 0.5);
  vec3 base = t == 0 ? uTypeColor[0] : t == 1 ? uTypeColor[1] : uTypeColor[2];
  float lnT = t == 0 ? uTypeLnT[0] : t == 1 ? uTypeLnT[1] : uTypeLnT[2];
  // The light that arrives: a black body at T seen at T D / (1 + z). Its visible flux relative to a
  // static universe with the point a_o χ away: the black body's change in brightness and the solid
  // angle (D⁻² from aberration, (1 + z)² from the angular-diameter distance a_e χ); drawn where it
  // was (a_e χ away), (a_e / a_o)² of that (docs/data/cosmology.md, section 4).
  float lnDe = lnD - L;
#ifdef LENS
  lnDe += lnG;
  if (uPhi > 0.0 || uLensOn > 0.5 || uFramePhi > 0.0 || lnDe != 0.0) {
#else
  if (lnDe != 0.0) {
#endif
    vec4 b0 = blackbodyLn(lnT);
    vec4 b1 = blackbodyLn(lnT + lnDe);
    vec3 c = base * (b1.rgb / max(b0.rgb, vec3(1e-3)));
    float lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
    base = lc > 0.0 ? c * (dot(base, vec3(0.2126, 0.7152, 0.0722)) / lc) : base;
    float lnF = b1.a - b0.a - 2.0 * lnDe - (uRetarded > 0.5 ? 2.0 * L : 0.0) + uLnExposure;
    // The expansion's dimming held to a tenth, as the galaxy surveys' (galaxyMap.glsl), so from gigaparsecs away the two
    // maps stay readable alike.
    if (L > 0.5) lnF = mapFloorLnF(lnF, lnT, lnDe + L, b0.a, uLnExposure);
#ifdef LENS
    // The lens's solid angle: μ, in place of the g⁻² a boost by ln g would give.
    lnF += lnMu + 2.0 * lnG;
#endif
    a *= exp(clamp(0.5 * lnF, -60.0, 2.0));
  }
  if (a <= 1e-4) {
    cull();
    return;
  }
  // Ahead of a fast ship the sky is squeezed by 1/D and the whole web crowds into a few degrees:
  // each point is drawn that much smaller (a symbol on the sky shrinks with it), and a faint point
  // smaller still, each as much brighter, its light (alpha × area) kept. Tens of thousands of points
  // each blended over a hundred pixels in one small patch would cost milliseconds for light that
  // adds up the same.
  float k = min(exp(-max(lnD, 0.0)), sqrt(min(a / FAINT_ALPHA, 1.0)));
  if (k < 1.0) {
    float s = max(px * k, 1.5);
    a *= (px * px) / (s * s);
    px = s;
  }
  vColor = base;
  vAlpha = a;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = px;
  #include <logdepthbuf_vertex>
}
