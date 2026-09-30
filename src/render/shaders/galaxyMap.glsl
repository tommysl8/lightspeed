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
// The depth cue: nearer than uDepthMpc a galaxy's light falls as 1/d (mapNear, capped at 9×: the light the web's larger
// near points used to carry), beyond it as 1/d². uDepthMpc (render/galaxyMap.ts mapDepthMpc) is 180 Mpc from near home,
// as the web always had, and half the camera's distance from the Sun farther out: the knee moves out with the camera, and
// nearer than the knee a galaxy looks as it does from home (the 1/d part does not change), so that from gigaparsecs out
// the survey's far side is neither a hundred times fainter than its near side nor, all summed, a glare.
uniform float uDepthMpc;
const float MAP_DEPTH_REF = 180.0;

float mapLight(float l) {
  return clamp(0.6 * pow(l, 0.3), 0.08, 1.0) * clamp(pow(l, 0.36), 0.5, 4.0);
}

float mapNear(float d) {
  return min((1.0 + 0.5 * uDepthMpc / max(d, 1e-6)) * (MAP_DEPTH_REF / uDepthMpc), 9.0);
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
