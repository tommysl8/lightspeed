// Relativistic aberration and Doppler shift for point sources, in rapidity form. Mirrors
// src/physics/relativity.ts (aberrateToShipRapidity, lnDopplerFromRestDir).
//
// The ship moves with rapidity phi = artanh(beta) along uVelDir (world axes) through the Sun's
// rest frame. Flights reach gamma ~ 10^9, where beta rounds to 1 even in float64, and float32
// loses 1 - beta above gamma ~ 3000. So nothing here forms 1 - beta or 1 - beta cos(theta):
// the CPU passes e^phi and e^-phi (rounded to float32 like any value, but neither overflows up
// to phi = 40), and angles enter as half-angles taken from chords, |d - v| = 2 sin(theta/2) and
// |d + v| = 2 cos(theta/2):
//   aberration  tan(theta'/2) = e^-phi tan(theta/2)
//   Doppler     D = gamma (1 + beta cos theta) = e^phi cos^2(theta/2) + e^-phi sin^2(theta/2)
// Doppler factors travel as ln D. With uPhi = 0 (the classical view) this is the identity.
#include <lightspeed_blackbody>

uniform float uPhi;
uniform float uEPhi;       // e^phi
uniform float uEmPhi;      // e^-phi
uniform vec3 uVelDir;
uniform float uLnExposure; // ln of the relativistic auto-exposure (0 in the classical view)

// Rest-frame viewing direction (unit vector toward the source) -> ship-frame direction, and ln D.
vec3 relAberrate(vec3 dRest, out float lnD) {
  if (uPhi <= 0.0) {
    lnD = 0.0;
    return dRest;
  }
  vec3 a = dRest - uVelDir;
  vec3 b = dRest + uVelDir;
  float s2 = dot(a, a);
  float c2 = dot(b, b);
  float n = s2 + c2; // 4 for a unit vector
  s2 /= n;
  c2 /= n;
  lnD = log(uEPhi * c2 + uEmPhi * s2); // the sum is at least e^-phi: never log(0)
  float th = 2.0 * atan(uEmPhi * sqrt(s2), sqrt(c2));
  vec3 perp = dRest - dot(dRest, uVelDir) * uVelDir;
  float pl = length(perp);
  if (pl < 1e-12) return c2 >= s2 ? uVelDir : -uVelDir;
  return cos(th) * uVelDir + (sin(th) / pl) * perp;
}

// Change in apparent magnitude of a point source whose light is a blackbody at T = e^lnT, seen
// with Doppler factor e^lnD: the spectrum becomes a blackbody at D T, and aberration shrinks its
// solid angle by 1/D^2 (bolometric flux goes as D^2; this is the visible-band version).
float dopplerMagnitudeShift(float lnT, float lnD, out vec3 colorOut) {
  vec4 a = blackbodyLn(lnT);
  vec4 b = blackbodyLn(lnT + lnD);
  colorOut = b.rgb;
  return -MAG_PER_LN * (b.a - a.a - 2.0 * lnD);
}
