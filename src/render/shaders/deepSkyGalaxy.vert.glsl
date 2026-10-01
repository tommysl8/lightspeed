// The NGC/IC galaxies with measured distances (scene/DeepSky.tsx): one point each, a thin ring of the galaxy's true
// size once that is a pixel or two across, at its comoving place in megaparsecs (float32, world axes; the camera as
// hi + lo). Each is the same galaxy as a point of the cosmic web or the galaxy surveys and is placed as they place it,
// in the expanding universe as cosmicWeb.vert.glsl: at position + (a − 1) anchor at the clock's time, and with
// light-delayed positions on where it was when the light now arriving left it. Twin of sim/deepsky/markers.ts
// (galaxyAlpha), which picking uses. In flight each ring is aberrated like a star; it is a guide, so it keeps its colour.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute vec3 aAnchor;  // Mpc, comoving
attribute float aRadius; // Mpc

uniform vec3 uCamHi;
uniform vec3 uCamLo;
uniform float uPxPerRad;
uniform float uPixelRatio;
uniform float uOpacity;
uniform float uSelected;

uniform float uAm1;
uniform float uAObs;
uniform vec3 uAnchorObs;
uniform float uRetarded;
uniform float uSkyOn;

//#emission

varying float vAlpha;
varying float vRing;
varying float vStyle;
varying float vPulse;
varying float vSelected;

const float MIN_RING_PX = 3.0;
const float GALAXY_FROM_PX = 1.0;
const float GALAXY_FULL_PX = 2.5;
const float BIG_FROM_PX = 100.0;
const float BIG_GONE_PX = 200.0;

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vAlpha = 0.0;
}

void main() {
  vec3 rel = (position - uCamHi) - uCamLo + uAm1 * aAnchor;
  vec3 sep = aAnchor - uAnchorObs;
  float chi = length(sep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    float L = emissionLn1pZ(chi);
    if (L > 1e29) {
      cull(); // beyond the particle horizon: none of its light has arrived
      return;
    }
    if (uRetarded > 0.5) rel -= (uAObs * (1.0 - exp(-L))) * sep;
  }
  float d = max(length(rel), 1e-9);
  float rPx = aRadius / d * uPxPerRad;
  float big = 1.0 - smoothstep(BIG_FROM_PX, BIG_GONE_PX, rPx);
  float a = smoothstep(GALAXY_FROM_PX, GALAXY_FULL_PX, rPx) * big;
  float selected = abs(float(gl_VertexID) - uSelected) < 0.5 ? 1.0 : 0.0;
  if (selected > 0.5) a = max(a, big);
  a *= uOpacity;
  if (a <= 0.003 || d <= aRadius) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);
  float r = max(rPx * exp(-lnD), selected > 0.5 ? 6.0 : MIN_RING_PX);
  float half_ = r + 2.0;
  vRing = r / half_;
  vStyle = 6.0;
  vPulse = 1.0;
  vSelected = selected;
  vAlpha = a;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = 2.0 * half_ * uPixelRatio;
  #include <logdepthbuf_vertex>
}
