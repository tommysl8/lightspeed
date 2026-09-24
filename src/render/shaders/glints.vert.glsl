// Unresolved bodies drawn as point sources (a planet smaller than a pixel still shines like
// a star). `position` is camera-relative, in km (floating origin).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute float aMag;
attribute vec3 aColor;
attribute float aFade;
attribute float aRadius;
attribute float aTemp;

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  float dist = max(length(position), 1e-6);
  float D;
  vec3 dShip = relAberrate(position / dist, D);
  vec3 shifted;
  float mag = aMag + dopplerMagnitudeShift(aTemp, D, shifted);
  vec4 rest = blackbodyLookup(aTemp);
  float sigma, peak, size;
  psfFromMagnitude(mag, sigma, peak, size);
  vColor = aColor * shifted / max(rest.rgb, vec3(1e-3));
  vPeak = peak * aFade;
  vSigma = sigma;
  vSize = size;
  // Sit just in front of the body's surface so the body cannot occlude its own glint.
  float d = max(dist - aRadius * 1.05, dist * 0.5);
  vec4 mv = viewMatrix * vec4(dShip * d, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vPeak < 0.002 ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
