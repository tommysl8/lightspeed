// The galaxy surveys' points (scene/Surveys.tsx; the tiles in sim/surveys/format.ts): one draw a node of the octree,
// each point at its place from the node's centre (float32 Mpc), the node's centre as seen from the camera computed in
// float64 on the CPU (in the model matrix, below), so neither a camera 14 Gpc out nor a galaxy 7 Gpc away loses precision.
//
// Like the cosmic web (cosmicWeb.vert.glsl), whose look this keeps: a map, not the light the eye would get. Each point
// is coloured by its kind (red, blue, grey, quasar), carries the display light of its luminosity with the shared depth
// cue (galaxyMap.glsl), and its light is redshifted, dimmed and shifted by the ship's motion as it arrives: at the
// clock's time a survey galaxy, which belongs to no group the tiles know of, is at a × its comoving place, and its
// light left it when the universe had scale factor a_e (the emission table). With light-delayed positions on it is
// drawn where it was then. In flight it is aberrated like a star, and ahead of a fast ship the points crowding a pixel
// are drawn by lot, each as bright as those left out.
//
// Not drawn with a black hole's lens: the layer fades out while a lens is drawn (Surveys.tsx).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_galaxymap>

attribute vec2 aAttr; // kind byte (class in bits 0–1, catalogue in 2–5), luminosity byte

// The node's own numbers come in its model matrix (scene/Surveys.tsx: three.js sends it with every draw, where
// uniforms of their own would resend the whole material's): column 0 a × the node's centre − the camera (Mpc),
// column 1 the node's centre − the camera's comoving place (Mpc), column 2's first its share (its fade in or out
// times the layer's).
uniform float uPixelRatio;
uniform float uNearMpc;
uniform vec3 uClassColor[4];
uniform float uClassLnT[4];
uniform vec2 uLum;       // log10 L/L* of byte 0, and of one step

uniform float uPointsPerPx;
uniform float uLotMin;

uniform float uAObs;
uniform float uRetarded;
uniform float uSkyOn;
uniform float uLnFirst;  // ln(1 + z) of light that left when the earliest galaxies shone: from farther, no galaxy yet

//#emission

varying vec3 vColor;
varying float vAlpha;

const float FAINT_ALPHA = 0.05;
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
  vec3 rel = modelMatrix[0].xyz + uAObs * position;
  vec3 sep = modelMatrix[1].xyz + position;
  float weight = modelMatrix[2].x;
  float L = 0.0;
  float chi = length(sep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    L = emissionLn1pZ(chi);
    // Its light left before the earliest galaxies shone (or beyond the particle horizon: it has not arrived).
    if (L > uLnFirst) {
      cull();
      return;
    }
    if (uRetarded > 0.5) rel -= (uAObs * (1.0 - exp(-L))) * sep;
  }
  float d = length(rel);
  float a = weight * smoothstep(0.35 * uNearMpc, uNearMpc, d);
  if (a <= 0.0) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);
  float crowd = uPointsPerPx * exp(2.0 * lnD);
  if (crowd > CROWD_MAX) {
    float p = max(CROWD_MAX / crowd, uLotMin);
    if (pointHash() >= p) {
      cull();
      return;
    }
    a /= p;
  }
  float l = exp2(3.3219281 * (uLum.x + aAttr.y * uLum.y));
  float px = mapSizePx(l, d, uPixelRatio);
  a *= mapLight(l) * mapDepth(d) * mapUnitPx2(uPixelRatio) / (px * px);
  int c = int(aAttr.x + 0.5) & 3;
  vec3 base = uClassColor[c];
  // The light that arrives: a black body at the class's temperature seen at T D / (1 + z), as the web's points.
  float lnDe = lnD - L;
  if (lnDe != 0.0) {
    float lnT = uClassLnT[c];
    vec4 b0 = blackbodyLn(lnT);
    vec4 b1 = blackbodyLn(lnT + lnDe);
    vec3 cc = base * (b1.rgb / max(b0.rgb, vec3(1e-3)));
    float lc = dot(cc, vec3(0.2126, 0.7152, 0.0722));
    base = lc > 0.0 ? cc * (dot(base, vec3(0.2126, 0.7152, 0.0722)) / lc) : base;
    float lnF = b1.a - b0.a - 2.0 * lnDe - (uRetarded > 0.5 ? 2.0 * L : 0.0) + uLnExposure;
    a *= exp(clamp(0.5 * lnF, -60.0, 2.0));
  }
  if (a <= 1e-4) {
    cull();
    return;
  }
  // Ahead of a fast ship, and for faint points, drawn smaller and as much brighter (alpha × area kept).
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
