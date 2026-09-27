// Rings round the famous open clusters (scene/GalaxyModel.tsx): one point per cluster, drawn as a thin
// ring of the radius holding half its members, as it looks from the camera. Its stars are the star
// catalogue's; the ring only says where the cluster is and how big. Shown while the ring is a few
// pixels to a few hundred across; in the relativistic view it is aberrated like the stars (it is a
// guide, so it keeps its colour).
#include <common>
#include <lightspeed_relativity>

attribute float aRadius; // pc

uniform vec3 uCamHi;      // camera, heliocentric galactic kpc: hi + lo
uniform vec3 uCamLo;
uniform mat3 uGalToWorld;
uniform float uPxPerRad;  // CSS pixels per radian
uniform float uPixelRatio;

varying float vAlpha;
varying float vRing; // the ring's radius as a share of the sprite's half-width

void main() {
  vec3 rel = (position - uCamHi) - uCamLo;
  float d = max(length(rel), 1e-9);
  float r = aRadius * 1e-3 / d * uPxPerRad;
  vAlpha = smoothstep(4.0, 7.0, r) * (1.0 - smoothstep(160.0, 320.0, r));
  if (vAlpha <= 0.0 || d * 1e3 < aRadius) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(normalize(uGalToWorld * (rel / d)), lnD);
  r *= exp(-lnD);
  float half_ = r + 2.0;
  vRing = r / half_;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = 2.0 * half_ * uPixelRatio;
}
