// The small bodies (scene/Asteroids.tsx): every asteroid and comet of JPL's Small-Body Database with a usable orbit,
// each on its two-body orbit about the Sun (or the barycentre), solved here per vertex from its elements, so a
// million of them move under any time warp at no CPU cost. Twin: sim/asteroids/conic.ts (the same equations in
// float64, for picking and the tests); the brightness law is sim/asteroids/lod.ts's.
//
// Ellipses (the default) carry a, e and the mean anomaly at the reference epoch. With CONIC defined (comets, and
// the few orbits near or beyond parabolic) they carry q, e and the time of perihelion instead, and are written about
// perihelion, x = q − 2a sin²(E/2), which float32 keeps exact enough as e → 1; e = 1 exactly is Barker's parabola.
//
// Brightness: the body's real apparent magnitude (H, its distances from the Sun and the camera, its phase in the
// IAU H, G system; a comet's M1 + 5 log Δ + K1 log r), shifted by the observer's motion like every point source,
// drawn in proportion to its light up to uFullMag and faded out before uLimitMag (lod.ts). Points under that limit
// get no size and are not rasterised.
//
// With PICKING defined (scene/asteroidPick.ts) the same points are drawn into a small target round the pointer,
// each as its section and vertex in RGBA, at least 3 px across, the brightest in front.
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

#ifdef CONIC
attribute float aPerihelion; // perihelion distance q, au
attribute float aE;  // eccentricity
attribute float aTp; // time of perihelion, days after the reference epoch
attribute float aM1; // total magnitude M1 in quarter magnitudes from -5 (normalised uint8; 255: not known)
attribute float aK1; // its slope K1 in quarter magnitudes (normalised uint8)
#else
attribute float aA;  // semi-major axis, au
attribute float aE;  // eccentricity (normalised uint16)
attribute float aM;  // mean anomaly at the reference epoch / 2pi (normalised uint16)
attribute float aH;  // absolute magnitude in the section's range uHRange (normalised uint8, 254 steps)
#endif
// The orbit's orientation, worked out once on the CPU from i, the node and the argument of perihelion (six sines and
// cosines a body a frame saved): unit vectors towards perihelion (P) and 90 degrees ahead (Q), J2000 ecliptic
// (normalised int16).
attribute vec3 aP;
attribute vec3 aQ;

uniform float uDays;     // days since the reference epoch
uniform vec3 uCamAU;     // camera position, au from the Sun (world axes)
uniform vec3 uCentreAU;  // the orbits' centre, au from the Sun: 0, or the barycentre for the sections about it
uniform float uSqrtMu;   // sqrt(GM / GM of the Sun) of that centre
uniform vec2 uHRange;    // the section's range of H
uniform vec3 uColor;
uniform float uPointSize;
uniform float uOpacity;
uniform float uFullMag;  // drawn at full strength at this magnitude and brighter
uniform float uLimitMag; // not drawn fainter than this
uniform float uFadeMag;  // faded out over this much before the limit
uniform float uRetarded; // 1: draw where each body was when the light now arriving left it
uniform int uHidden;     // the vertex of a body the registry draws for now (one clicked or found), or -1

varying vec3 vColor;
varying float vAlpha;
#ifdef PICKING
uniform float uPickSection; // the section's id + 1
varying vec4 vPick;
varying float vRank;
#endif

const float K_GAUSS = 0.01720209895; // rad/day at 1 au
const float AU_KM = 149597870.7;
const float LIGHT_DAYS_PER_AU = 499.004784 / 86400.0;

// Position in the orbit's plane (x towards perihelion), au, `days` after the reference epoch.
vec2 inPlane(float days) {
  float e = aE;
  float k = K_GAUSS * uSqrtMu;
#ifdef CONIC
  float q = aPerihelion;
  float dt = days - aTp;
  if (e < 1.0) {
    float a = q / (1.0 - e);
    float M = mod(k / (a * sqrt(a)) * dt + PI, PI2) - PI;
    // Danby's start converges for every e and M.
    float E = M + 0.85 * e * (M < 0.0 ? -1.0 : 1.0);
    for (int i = 0; i < 40; i++) {
      float d = (E - e * sin(E) - M) / (1.0 - e * cos(E));
      E -= d;
      if (abs(d) < 1e-6) break;
    }
    float s = sin(0.5 * E);
    return vec2(q - 2.0 * a * s * s, sqrt(a * q * (1.0 + e)) * sin(E));
  } else if (e > 1.0) {
    float a = q / (e - 1.0);
    float M = k / (a * sqrt(a)) * dt;
    float F = sign(M) * log(2.0 * abs(M) / e + 1.8);
    for (int i = 0; i < 40; i++) {
      float d = (e * sinh(F) - F - M) / (e * cosh(F) - 1.0);
      F -= d;
      if (abs(d) < 1e-6 * max(1.0, abs(F))) break;
    }
    float s = sinh(0.5 * F);
    return vec2(q - 2.0 * a * s * s, sqrt(a * q * (1.0 + e)) * sinh(F));
  }
  // Barker: D + D^3/3 = B, D = tan(nu/2), solved in closed form (on |B|: the cube root loses digits for B < 0).
  float B = k * dt / sqrt(2.0 * q * q * q);
  float y = 1.5 * abs(B);
  float c = pow(y + sqrt(y * y + 1.0), 1.0 / 3.0);
  float D = sign(B) * (c - 1.0 / c);
  return vec2(q * (1.0 - D * D), 2.0 * q * D);
#else
  float a = aA;
  float M = mod(aM * PI2 + k / (a * sqrt(a)) * days, PI2);
  if (M > PI) M -= PI2;
  float sE, cE;
  if (e < 0.35) {
    // Nearly all of them: a second-order start (off by about e^3) and two Newton steps, no loop: converged to 1e-9
    // rad or better for e < 0.35. The last step's sine and cosine are carried to its result to first order rather
    // than taken again.
    float sM = sin(M), cM = cos(M);
    float E = M + e * sM * (1.0 + e * cM);
    sE = sin(E);
    cE = cos(E);
    E -= (E - e * sE - M) / (1.0 - e * cE);
    sE = sin(E);
    cE = cos(E);
    float d = (E - e * sE - M) / (1.0 - e * cE);
    float s0 = sE;
    sE -= d * cE;
    cE += d * s0;
  } else {
    // Danby's start converges for every e and M.
    float E = M + 0.85 * e * (M < 0.0 ? -1.0 : 1.0);
    for (int i = 0; i < 16; i++) {
      float d = (E - e * sin(E) - M) / (1.0 - e * cos(E));
      E -= d;
      if (abs(d) < 2e-7) break;
    }
    sE = sin(E);
    cE = cos(E);
  }
  return vec2(a * (cE - e), a * sqrt(1.0 - e * e) * sE);
#endif
}

void main() {
  vec3 P = aP;
  vec3 Q = aQ;

  vec2 xy = inPlane(uDays);
  vec3 ecl = P * xy.x + Q * xy.y;
  vec3 w = vec3(ecl.x, ecl.z, -ecl.y) + uCentreAU; // world axes, au from the Sun
  if (uRetarded > 0.5) {
    xy = inPlane(uDays - length(w - uCamAU) * LIGHT_DAYS_PER_AU);
    ecl = P * xy.x + Q * xy.y;
    w = vec3(ecl.x, ecl.z, -ecl.y) + uCentreAU;
  }
  vec3 relAU = w - uCamAU;
  float delta = max(length(relAU), 1e-9);
  float r = max(length(w), 1e-9);

#ifdef CONIC
  float m1 = aM1 * 255.0;
  // A comet with no magnitude in the catalogue is taken as a faint one: M1 = 15, K1 = 10.
  bool known = m1 < 254.5;
  float M1 = known ? m1 * 0.25 - 5.0 : 15.0;
  float K1 = known && aK1 * 255.0 < 254.5 ? aK1 * 255.0 * 0.25 : 10.0;
  float mag = M1 + 5.0 * log2(delta) * 0.30103 + K1 * log2(r) * 0.30103;
#else
  float H = mix(uHRange.x, uHRange.y, aH * (255.0 / 254.0));
  // Phase angle at the body, Sun to camera, and the H, G phase law with G = 0.15 (conic.ts phaseMagnitude).
  float cosA = clamp(dot(-w, -relAU) / (r * delta), -1.0, 1.0);
  float t = sqrt(max(1.0 - cosA, 0.0) / max(1.0 + cosA, 1e-4));
  float lt = log(max(t, 1e-6));
  float phi = 0.85 * exp(-3.33 * exp(0.63 * lt)) + 0.15 * exp(-1.87 * exp(1.22 * lt));
  // H + 5 log10(r delta) - 2.5 log10(phi), in one logarithm.
  float mag = H + 0.7525750 * log2((r * delta) * (r * delta) / max(phi, 1e-30));
#endif

  vec3 rel = relAU * AU_KM;
  float dist = delta * AU_KM;
  vec3 dShip = rel / dist;
  vColor = uColor;
  // The observer's motion (none in the classical view: then this is skipped, the costliest part otherwise).
  if (uPhi > 0.0) {
    float lnD;
    dShip = relAberrate(dShip, lnD);
    vec3 shifted;
    mag += dopplerMagnitudeShift(LN_T_SUN, lnD, shifted) - MAG_PER_LN * uLnExposure;
    vec4 rest = blackbodyLn(LN_T_SUN);
    vColor = uColor * shifted / max(rest.rgb, vec3(1e-3));
  }

  // In proportion to its light, faded out before the limit (lod.ts drawnStrength).
  float strength = exp2(clamp(-1.3287712 * (mag - uFullMag), -126.0, 20.0));
  float fade = smoothstep(uLimitMag, uLimitMag - uFadeMag, mag);
  strength *= fade;
  if (gl_VertexID == uHidden) strength = 0.0;
  // Brighter than full strength, a point grows (its light ~ its area) up to 1.5 times across, then saturates.
  vAlpha = uOpacity * min(strength, 1.0);
  float grow = clamp(sqrt(strength), 1.0, 1.5);

  vec4 mv = viewMatrix * vec4(dShip * dist, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vAlpha < 0.0005 ? 0.0 : uPointSize * grow;
#ifdef PICKING
  vPick = vec4(float(gl_VertexID & 255), float((gl_VertexID >> 8) & 255), float((gl_VertexID >> 16) & 255), uPickSection) / 255.0;
  vRank = clamp((mag + 10.0) / 50.0, 0.0, 1.0);
  if (gl_PointSize > 0.0) gl_PointSize = max(gl_PointSize, 3.0);
#endif
  #include <logdepthbuf_vertex>
}
