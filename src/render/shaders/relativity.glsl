// Relativistic aberration and Doppler factor for point sources. Mirrors src/physics/relativity.ts.
// uBeta: ship speed / c in the Sun's rest frame; uVelDir: unit velocity direction (world axes);
// uGamma: Lorentz factor. With uBeta = 0 this is the identity.
uniform float uBeta;
uniform float uGamma;
uniform vec3 uVelDir;

// Rest-frame viewing direction (unit vector toward the source) -> ship-frame direction.
// Also returns the Doppler factor D = gamma (1 + beta cos(theta_rest)).
vec3 relAberrate(vec3 dRest, out float D) {
  if (uBeta <= 0.0) {
    D = 1.0;
    return dRest;
  }
  float c = clamp(dot(dRest, uVelDir), -1.0, 1.0);
  float denom = 1.0 + uBeta * c;
  float cs = clamp((c + uBeta) / denom, -1.0, 1.0);
  D = uGamma * denom;
  vec3 perp = dRest - c * uVelDir;
  float pl = length(perp);
  if (pl < 1e-8) return uVelDir * (cs >= 0.0 ? 1.0 : -1.0);
  float s = sqrt(max(0.0, 1.0 - cs * cs));
  return cs * uVelDir + (s / pl) * perp;
}

// Blackbody lookup: rgb = colour (luminance 1), a = log10 of visible luminance (relative).
uniform sampler2D uBlackbody;
uniform float uLogTMin;
uniform float uLogTMax;

vec4 blackbodyLookup(float T) {
  float u = (log2(max(T, 1e-3)) * 0.30103 - uLogTMin) / (uLogTMax - uLogTMin);
  return texture2D(uBlackbody, vec2(clamp(u, 0.0, 1.0), 0.5));
}

// Change in apparent magnitude of a point source whose light is a blackbody at T, seen with
// Doppler factor D: the spectrum shifts to T' = D T, and aberration shrinks its solid angle by
// 1/D^2. (Bolometric flux goes as D^2; this is the visible-band version.)
float dopplerMagnitudeShift(float T, float D, out vec3 colorOut) {
  vec4 a = blackbodyLookup(T);
  vec4 b = blackbodyLookup(T * D);
  colorOut = b.rgb;
  return -2.5 * (b.a - a.a - 2.0 * log2(D) * 0.30103);
}
