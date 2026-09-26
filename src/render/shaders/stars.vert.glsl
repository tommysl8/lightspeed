// The 3D star catalogue (sim/stars; docs/data/stars.md). Each star is a point in parsecs from the
// Sun at J2000 (J2000 ecliptic axes), moved in a straight line by its space velocity, taken
// relative to the camera, and drawn with its apparent magnitude from there: M_V + 5 log10(d / 10 pc)
// (no dust). Its colour is the blackbody at its temperature. On top, the exact relativistic
// treatment of every point source: aberrated direction, Doppler-shifted blackbody colour
// (T' = D T) and the visible-band brightness change, finite at any rapidity.
//
// Precision: the positions are float32 parsecs (at a few parsecs, a float32 step is ~10^7 km, so
// stars near the camera are drawn as registry bodies instead, from float64, and hidden here), and
// the camera comes as two floats, hi + lo, so the difference keeps its precision far from the Sun.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute vec3 aVel;     // int16 steps of 0.1 km/s, heliocentric, J2000 ecliptic
attribute float aAbsMag; // int16 steps of 0.01 mag; 32767: hidden (a registry body draws the star)
attribute float aTemp;   // uint16, K; 0 = unknown

uniform vec3 uCamHi;     // camera, parsecs from the Sun, J2000 ecliptic: hi + lo
uniform vec3 uCamLo;
uniform float uYears;    // Julian years since J2000, held to ±10^6 (the stars stand still beyond)
uniform float uRetarded; // 1: each star where the camera sees it (light-time); 0: where it is now

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

const float PC_PER_YR_PER_STEP = 1.0227121650537077e-7; // 0.1 km/s in pc per Julian year
const float C_PC_PER_YR = 0.30660139378555057;          // the speed of light
const float LOG10_E = 0.4342944819032518;

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: the point is dropped
  gl_PointSize = 0.0;
  vPeak = 0.0;
}

void main() {
  if (aAbsMag > 32000.0) {
    cull();
    return;
  }
  vec3 v = aVel * PC_PER_YR_PER_STEP;
  // Where the star is now: its astrometric J2000 place carried along its velocity for the years
  // since J2000 plus the light-time from there to the Sun (the catalogue shows it as it was).
  vec3 rel = (position - uCamHi) - uCamLo + v * (uYears + length(position) / C_PC_PER_YR);
  // Where the camera sees it: where it was when the light arriving now left it (first order in v/c).
  rel -= uRetarded * v * (length(rel) / C_PC_PER_YR);
  float d = max(length(rel), 1e-12);
  vec3 e = rel / d;
  vec3 dir = vec3(e.x, e.z, -e.y); // J2000 ecliptic → world axes
  float mag = aAbsMag * 0.01 + 5.0 * LOG10_E * log(d) - 5.0 - MAG_PER_LN * uLnExposure;

  float lnD;
  vec3 dShip = relAberrate(dir, lnD);
  // Behind the ship (D ≤ 1) no star brightens by more than |ln D| in magnitudes (a Rayleigh–Jeans
  // spectrum): anything still past the fade is dropped before the colour lookups. At rest, D = 1.
  if (lnD <= 0.0 && mag + MAG_PER_LN * lnD > uMagLimit + 0.5) {
    cull();
    return;
  }
  float lnT = log(aTemp > 0.0 ? aTemp : 5772.0);
  vec3 color;
  if (uPhi > 0.0) mag += dopplerMagnitudeShift(lnT, lnD, color);
  else color = blackbodyLn(lnT).rgb;
  float fade = limitFade(mag);
  if (fade <= 0.0) {
    cull();
    return;
  }
  float sigma, peak, size;
  psfFromMagnitude(mag, sigma, peak, size);
  vColor = color;
  vPeak = peak * fade;
  vSigma = sigma;
  vSize = size;
  // One unit away along the direction seen: stars skip the depth test and are drawn first.
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = vPeak < 0.002 ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
