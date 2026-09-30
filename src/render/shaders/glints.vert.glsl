// Unresolved bodies drawn as point sources (a planet smaller than a pixel still shines like
// a star). `position` is camera-relative, in km (floating origin).
//
// Near a black hole each body can have up to three images (scene/Glints.tsx gives each its own
// vertex): the CPU lenses them exactly (sim/lensBodies.ts) and writes the image's direction as the
// position, its magnification and the shifts that change no solid angle folded into aMag, and the
// rest of its frequency factor beyond the view observer's own (the lens's g, the frame boost, the
// source's own motion and potential) as aLnDx, which this shader adds to its own aberration's ln D
// before the colour and the magnitude shift. A hole's own point (its accretion flow, unresolved) is
// a power law: aSpec = 1 − α > 0, brightness × D^aSpec with its colour unchanged (F_ν ∝ ν^α keeps
// its shape under any shift). Far from holes aLnDx and aSpec are 0 and this is the old shader
// exactly. Twin: sim/lensBodies.ts (magnitudeShift, the images' lnDx and magLensed). Cost: one
// branch per vertex; a few hundred vertices.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute float aMag;
attribute vec3 aColor;
attribute float aFade;
attribute float aRadius;
attribute float aTemp;
attribute float aLimit; // 1 for stars: they fade out at the eye's limit, like the star field
attribute float aLnDx;  // ln of the frequency factor beyond the view observer's own motion (0 far from holes)
attribute float aSpec;  // 0: a blackbody at aTemp; > 0: a power law F_nu ∝ nu^alpha with aSpec = 1 − alpha

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

void main() {
  // (The CPU keeps |position| below 10^16 km, so dot(p, p) cannot overflow float32.)
  float dist = max(length(position), 1e-6);
  float lnD;
  vec3 dShip = relAberrate(position / dist, lnD);
  float lnDt = lnD + aLnDx;
  float mag;
  if (aSpec > 0.0) {
    // A power law: its flux at any band scales as D^(1 − alpha), its colour stays.
    mag = aMag - MAG_PER_LN * (aSpec * lnDt + uLnExposure);
    vColor = aColor;
  } else {
    vec3 shifted;
    float lnT = log(aTemp);
    mag = aMag + dopplerMagnitudeShift(lnT, lnDt, shifted) - MAG_PER_LN * uLnExposure;
    vec4 rest = blackbodyLn(lnT);
    vColor = aColor * shifted / max(rest.rgb, vec3(1e-3));
  }
  float sigma, peak, size;
  psfFromMagnitude(mag, sigma, peak, size);
  vPeak = peak * aFade * (aLimit > 0.5 ? limitFade(mag) : 1.0);
  vSigma = sigma;
  vSize = size;
  // Sit just in front of the body's surface so the body cannot occlude its own glint.
  float d = max(dist - aRadius * 1.05, dist * 0.5);
  vec4 mv = viewMatrix * vec4(dShip * d, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vPeak < 0.002 ? 0.0 : size;
  #include <logdepthbuf_vertex>
}
