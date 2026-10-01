// The display law of the two galaxy maps: the cosmic web (cosmicWeb.vert.glsl) and the galaxy surveys (survey.vert.glsl,
// surveyGlow.vert.glsl). A galaxy's light on the screen is the product of
//   mapLight(l)   the light it carries, by its luminosity l = L/L* (sim/surveys/format.ts mapLight is its twin), and
//   mapDepth(d)   a cue for depth, by its distance d from the camera in Mpc,
// times what the expansion and the ship's motion do to its light (each shader's own lines). Because the law is a
// product, a cell of the surveys' octree can carry the summed mapLight of all the galaxies it holds, and its glow, with
// the same depth cue and the same shifts applied at its centroid, holds the light of all of them at any distance, speed
// or epoch (render/galaxyMap.ts; docs/data/surveys.md §4). A point's size only shapes it: its alpha is its light over
// its area.
//
// The depth cue: a galaxy nearer than 180 Mpc is brighter by up to 9× (mapNear: the light the web's larger near points
// used to carry), and beyond uDepthMpc its light falls as 1/d². uDepthMpc (render/galaxyMap.ts mapDepthMpc) is 180 Mpc
// from near home, as the web always had, and the camera's distance from the Sun farther out: the knee moves out with
// the camera, so that seen from gigaparsecs away the surveys are not dimmed by their whole distance squared.
uniform float uDepthMpc;
const float MAP_DEPTH_REF = 180.0;

// The expansion's dimming of a map's point is held to MAP_DIM_FLOOR (ln of flux) below what the ship's own shift gives:
// a tenth in the display's square-root law. Its colour still shows the whole redshift. Without the floor the maps went
// black from a few gigaparsecs out, where every galaxy's light arrives at z = 1 to 5; the maps show where the galaxies
// are, and stay readable from anywhere their light has reached (render/galaxyMap.ts MAP_DIM_FLOOR, its twin).
const float MAP_DIM_FLOOR = -4.6051702;

/**
 * ln of the flux factor of light from a black body at e^lnT K, shifted by the ship (e^lnDs, with any other shift but the
 * expansion's) and the expansion (L = ln(1 + z)), given the flux law's value lnF with both: lnF, or the floor.
 */
float mapFloorLnF(float lnF, float lnT, float lnDs, float b0a, float lnExposure) {
  vec4 b2 = blackbodyLn(lnT + lnDs);
  return max(lnF, b2.a - b0a - 2.0 * lnDs + lnExposure + MAP_DIM_FLOOR);
}

float mapLight(float l) {
  return clamp(0.6 * pow(l, 0.3), 0.08, 1.0) * clamp(pow(l, 0.36), 0.5, 4.0);
}

float mapNear(float d) {
  return min(1.0 + 0.5 * MAP_DEPTH_REF / max(d, 1e-6), 9.0);
}

float mapDepth(float d) {
  float q = d / uDepthMpc;
  return 1.4 * mapNear(d) / (1.0 + q * q);
}

/** A point's diameter in device pixels (its shape only: its light does not depend on it). */
float mapSizePx(float l, float d, float pixelRatio) {
  return clamp(1.5 * pow(l, 0.18) * sqrt(mapNear(d)), 1.1, 4.5) * pixelRatio + 1.0;
}

/** Light is counted in alpha × px² of the point sprite, a unit point being 1.5 (pixel ratio + ½) px across. */
float mapUnitPx2(float pixelRatio) {
  float s = 1.5 * (pixelRatio + 0.5);
  return s * s;
}
