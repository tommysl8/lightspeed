// Asteroids, Jupiter Trojans and trans-Neptunian objects: Kepler's equation solved per vertex
// from real JPL orbital elements (heliocentric, J2000 ecliptic), so the belts orbit under time
// warp at no CPU cost.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute float aA;    // semi-major axis, au
attribute float aE;    // eccentricity (normalised uint16)
attribute float aI;    // inclination / pi
attribute float aNode; // node / 2pi
attribute float aPeri; // argument of perihelion / 2pi
attribute float aM;    // mean anomaly at the reference epoch / 2pi
attribute float aH;    // absolute magnitude * 10 / 255 (normalised uint8)
attribute float aKind; // 0 main belt, 1 Trojan, 2 TNO (normalised uint8: /255)

uniform float uDays;   // days since the reference epoch
uniform vec3 uCamAU;   // camera position, au (world axes)
uniform float uPointSize;
uniform float uOpacity;
uniform vec3 uColorMain;
uniform vec3 uColorTrojan;
uniform vec3 uColorTno;
uniform float uShowKuiper;
uniform float uShowAsteroids;
uniform float uRefDistAU; // distance at which a point has brightness 0.5
uniform float uNearCap;   // maximum per-point brightness

varying vec3 vColor;
varying float vAlpha;

const float K_GAUSS = 0.01720209895; // rad/day at 1 au
const float AU_KM = 149597870.7;

uniform float uRetarded; // 1: draw where each object was when its light left it

const float LIGHT_DAYS_PER_AU = 499.004784 / 86400.0;

// Heliocentric world-axes position (au) at `days` after the reference epoch.
vec3 keplerPosition(float days) {
  float a = aA;
  float e = aE;
  float inc = aI * PI;
  float node = aNode * PI2;
  float peri = aPeri * PI2;
  float n = K_GAUSS / (a * sqrt(a));
  float M = mod(aM * PI2 + n * days, PI2);
  float E = e < 0.8 ? M : PI;
  for (int k = 0; k < 10; k++) {
    E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  }
  float x = a * (cos(E) - e);
  float y = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(peri), sw = sin(peri), cn = cos(node), sn = sin(node), ci = cos(inc), si = sin(inc);
  vec3 ecl = vec3(
    x * (cw * cn - sw * sn * ci) - y * (sw * cn + cw * sn * ci),
    x * (cw * sn + sw * cn * ci) + y * (cw * cn * ci - sw * sn),
    x * (sw * si) + y * (cw * si)
  );
  return vec3(ecl.x, ecl.z, -ecl.y);
}

void main() {
  vec3 w = keplerPosition(uDays);
  if (uRetarded > 0.5) w = keplerPosition(uDays - length(w - uCamAU) * LIGHT_DAYS_PER_AU);
  vec3 relAU = w - uCamAU;
  vec3 rel = relAU * AU_KM;
  float dist = max(length(rel), 1e-6);

  float D;
  vec3 dShip = relAberrate(rel / dist, D);
  vec3 shifted;
  float dm = dopplerMagnitudeShift(5772.0, D, shifted);
  vec4 rest = blackbodyLookup(5772.0);

  int kind = int(aKind * 255.0 + 0.5);
  vec3 base = kind == 2 ? uColorTno : (kind == 1 ? uColorTrojan : uColorMain);
  float show = kind == 2 ? uShowKuiper : uShowAsteroids;
  float H = aH * 25.5;
  float sizeWeight = clamp(1.7 - 0.09 * H, 0.3, 1.0);
  // Per-point brightness falls as 1/d^2 (capped), so the belt's surface brightness stays the
  // same at any viewing distance instead of piling up into a white blob from afar.
  float distAU = dist / AU_KM;
  float falloff = min(uNearCap, 0.5 * (uRefDistAU * uRefDistAU) / (distAU * distAU));
  vColor = base * shifted / max(rest.rgb, vec3(1e-3));
  vAlpha = uOpacity * falloff * sizeWeight * show * clamp(exp2(-1.3287712 * dm), 0.0, 8.0);

  vec4 mv = viewMatrix * vec4(dShip * dist, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vAlpha < 0.0004 ? 0.0 : uPointSize;
  #include <logdepthbuf_vertex>
}
