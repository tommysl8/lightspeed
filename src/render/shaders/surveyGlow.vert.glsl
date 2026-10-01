// The galaxy surveys' glows (scene/Surveys.tsx; render/surveyGlow.ts): for each octant of a drawn node whose child is
// not drawn, one soft splat holding the light of every galaxy in that child's subtree (or, split, of its parts), drawn
// into a target of a sixteenth of the view's resolution and added to the view with the points' own linear light.
//
// Its light is the points' law summed (galaxyMap.glsl): per class the stored sum of mapLight, times the depth cue
// (averaged over the octant's spread, below) and the shifts of the arriving light (the expansion's redshift, the ship's
// Doppler factor) at the octant's light-weighted centroid, so a glow and the points that replace it when its child is
// drawn carry the same light up to how much those factors change across the octant (the selection refines the octants
// that look large, where they would change most). The splat is a Gaussian as wide as the octant's rms radius seen from
// here, widened (below; squeezed by the Doppler factor ahead of a fast ship, like the sky), normalised so its summed
// light does not depend on its width, and at least 0.7 of a target pixel across.
#include <common>
#include <lightspeed_relativity>
#include <lightspeed_galaxymap>

attribute vec3 aSep;   // the centroid − the camera's comoving place, Mpc
attribute vec4 aLight; // summed mapLight of each class, times the node's share
attribute float aRms;  // rms radius, Mpc (proper)

uniform float uPixelRatio;
uniform float uNearMpc;
uniform vec3 uClassColor[4];
uniform float uClassLnT[4];
uniform float uPxPerRad;   // the target's pixels per radian
uniform float uResScale;   // target pixels per device pixel
uniform float uMaxSize;    // the largest point the GPU draws, target px
uniform float uPointKernel;

uniform float uAObs;
uniform float uRetarded;
uniform float uSkyOn;

//#emission

varying vec3 vColor;
varying float vSigma;
varying float vSize;

const float GLOW_WIDEN = 1.6;
const vec2 GLOW_FADE_PX = vec2(12.0, 48.0);

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vColor = vec3(0.0);
}

void main() {
  vec3 rel = position;
  float L = 0.0;
  float chi = length(aSep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    L = emissionLn1pZ(chi);
    if (L > 1e29) {
      cull();
      return;
    }
    if (uRetarded > 0.5) rel -= (uAObs * (1.0 - exp(-L))) * aSep;
  }
  float d = length(rel);
  // The depth cue averaged over the octant's galaxies, taken as a Gaussian cloud of its rms radius (render/galaxyMap.ts
  // glowDepth, its twin): three points along the line of sight, each as far aside as the cloud's mean spread across it.
  // Evaluated at the centroid alone, it made an octant round the camera several times too bright (its galaxies are near
  // and far, and the cue falls as 1/d²); with the average, the light the glows show agrees within a few per cent with
  // that of the points that replace them at the default budget (docs/data/surveys.md §5).
  float s = aRms * 0.57735;
  float k = 0.0;
  for (int i = -1; i <= 1; i++) {
    float z = float(i) * 1.7320508 * s;
    float di = sqrt((d + z) * (d + z) + 2.0 * s * s);
    k += (i == 0 ? 0.6666667 : 0.1666667) * smoothstep(0.35 * uNearMpc, uNearMpc, di) * mapDepth(di);
  }
  k *= mapUnitPx2(uPixelRatio) * uPointKernel;
  if (k <= 0.0) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);
  float lnDe = lnD - L;
  vec3 light = vec3(0.0);
  for (int c = 0; c < 4; c++) {
    float w = aLight[c];
    if (w <= 0.0) continue;
    vec3 base = uClassColor[c];
    float f = 1.0;
    if (lnDe != 0.0) {
      float lnT = uClassLnT[c];
      vec4 b0 = blackbodyLn(lnT);
      vec4 b1 = blackbodyLn(lnT + lnDe);
      vec3 cc = base * (b1.rgb / max(b0.rgb, vec3(1e-3)));
      float lc = dot(cc, vec3(0.2126, 0.7152, 0.0722));
      base = lc > 0.0 ? cc * (dot(base, vec3(0.2126, 0.7152, 0.0722)) / lc) : base;
      float lnF = b1.a - b0.a - 2.0 * lnDe - (uRetarded > 0.5 ? 2.0 * L : 0.0) + uLnExposure;
      if (L > 0.5) lnF = mapFloorLnF(lnF, lnT, lnD, b0.a, uLnExposure);
      f = exp(clamp(0.5 * lnF, -60.0, 2.0));
    }
    light += base * (w * f);
  }
  light *= k;
  if (dot(light, vec3(1.0)) <= 1e-7) {
    cull();
    return;
  }
  // Its width: the rms radius's projection on the sky (1/√3 of it along each direction), in target pixels, widened by
  // GLOW_WIDEN: an octant's light fills its cube, flat-topped, where a Gaussian of the same width is peaked, and
  // neighbouring octants' glows of that width summed to a lattice of lumps (ripples of 130 % of the mean on a regular
  // grid; 12 % once widened 1.6 times).
  float sigma = clamp(GLOW_WIDEN * (aRms * 0.57735 / max(d, 1e-6)) * uPxPerRad * exp(-lnD), 0.7, uMaxSize / 6.0);
  // A glow is a fill where no point is drawn; one that would look large (a region that size on the screen is drawn in
  // points) fades out (render/galaxyMap.ts glowFade, its twin).
  float fade = 1.0 - smoothstep(GLOW_FADE_PX.x, GLOW_FADE_PX.y, sigma / uResScale);
  if (fade <= 0.0) {
    cull();
    return;
  }
  light *= fade;
  vSigma = sigma;
  vSize = 6.0 * sigma;
  // Light per target pixel at the centre: the total over the splat (a Gaussian less its value at 3σ, where it ends:
  // 2πσ² × 0.9389 in all), and each target pixel stands for 1 / uResScale² device pixels.
  vColor = light * (uResScale * uResScale) / (6.2831853 * sigma * sigma * 0.93890);
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = vSize;
}
