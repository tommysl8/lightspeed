// Stars at infinity: `position` is a direction (only the direction matters).
// Each star gets the exact relativistic treatment: aberrated direction, Doppler-shifted
// blackbody colour (T' = D T) and visible-band brightness change.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute float aMag;
attribute float aTemp;

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  vec3 dir = normalize(position);
  float D;
  vec3 dShip = relAberrate(dir, D);
  vec3 color;
  float mag = aMag + dopplerMagnitudeShift(aTemp, D, color);
  float sigma, peak, size;
  psfFromMagnitude(mag, sigma, peak, size);
  vColor = color;
  vPeak = peak;
  vSigma = sigma;
  vSize = size;
  // Place the star 1 km away along its direction; stars skip the depth test and draw first.
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = peak < 0.002 ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
