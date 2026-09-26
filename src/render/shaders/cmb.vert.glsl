// The cosmic microwave background's bright spot dead ahead, drawn as a point source once it is
// only a pixel or so in radius (wholly from gamma ~ 200 at 1080p and a 50 degree view; at
// gamma = 1000 it is a Sun-hot spot half a pixel in radius). Its total flux, flux-weighted colour and the
// crossfade with the resolved CMB in the remap pass come from the CPU (cmbSpot in
// src/physics/cmb.ts); its direction is already in the ship's frame, so it is not aberrated
// again.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>

uniform vec3 uCmbPointDir;
uniform float uCmbPointMag;  // apparent magnitude, exposure included
uniform vec3 uCmbPointColor;
uniform float uCmbPointFade; // share of the spot drawn here (the rest is resolved in the remap)

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  float sigma, peak, size;
  psfFromMagnitude(uCmbPointMag, sigma, peak, size);
  vColor = uCmbPointColor;
  vPeak = peak * uCmbPointFade;
  vSigma = sigma;
  vSize = size;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * uCmbPointDir, 1.0);
  // Relativistic view only: the classical half of the split view runs with uPhi = 0.
  gl_PointSize = (uPhi <= 0.0 || vPeak < 0.002) ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
