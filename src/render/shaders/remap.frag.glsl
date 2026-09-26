// Relativistic remap of the scene seen from the moving ship.
//
// The scene (everything except point sources, which are transformed exactly in their own
// shaders) was rendered into a cube map in the Sun's rest frame. For each screen pixel:
//  1. ship-frame viewing direction d' at angle theta' from the velocity
//  2. aberration: the rest-frame angle from tan(theta/2) = e^phi tan(theta'/2), with the
//     half-angles taken from chords (|d' - v| = 2 sin(theta'/2), |d' + v| = 2 cos(theta'/2))
//  3. sample the cube map there, with the mip level set by how much aberration squeezes
//     the sky (linear factor D) so the compressed forward view doesn't shimmer
//  4. Doppler shift + beaming: an approximate spectral recolouring I'_lambda = D^5 I_lambda(lambda D),
//     split into a bounded colour matrix per D (src/physics/dopplerColor.ts) and a brightness
//     ln L(D) from the blackbody table, which holds at any D
//  5. the cosmic microwave background behind everything: a blackbody at T_CMB D_cmb, where
//     D_cmb is the Doppler factor relative to the CMB's rest frame
// Every step works in rapidity and ln D: 1/D = e^-phi cos^2(theta'/2) + e^phi sin^2(theta'/2)
// never forms 1 - beta, and brightness stays a logarithm until the final exposure, so the pass
// is finite from phi = 0 to phi = 40 (gamma ~ 10^17).
// The result is written premultiplied, and the cube map's alpha (surface coverage) lets
// planets hide the analytically drawn stars (and the CMB) behind them.
#include <lightspeed_blackbody>

uniform samplerCube uCube;
uniform sampler2D uDopplerLut;
uniform vec3 uDopplerLutRange; // ln D min, ln D max, table size
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uVelDir;
uniform float uEPhi;  // e^phi
uniform float uEmPhi; // e^-phi
uniform float uLnPixelOverTexel; // ln(pixel angle / cube texel angle)
uniform float uMaxLod;
uniform float uDoppler; // 1: apply Doppler/beaming, 0: aberration only
uniform float uLnExposure;
uniform float uLnSunRadiance; // ln of the Sun-surface radiance the renderer uses

// Cosmic microwave background
uniform vec3 uCmbDir;     // direction of the ship's motion through the CMB (ship frame, world axes)
uniform float uCmbEPhi;   // e^phi_cmb
uniform float uCmbEmPhi;  // e^-phi_cmb
uniform float uLnTCmb;    // ln T_CMB
uniform float uCmbGain;   // 1 while the CMB's bright spot is resolved; 0 once a point source draws it

varying vec2 vUv;

// The colour matrix for ln D, blended between the two nearest table columns. The table is a
// float texture read with nearest filtering (linear filtering of float textures is not
// available everywhere), so the blend is done here: taking the nearest column alone leaves
// steps of 0.007 in ln D, which show as rings across the sky and jumps in colour as the ship
// speeds up (up to 11% on a saturated red).
vec3 dopplerRgb(vec3 c, float lnD) {
  float n = uDopplerLutRange.z;
  float x = clamp((lnD - uDopplerLutRange.x) / (uDopplerLutRange.y - uDopplerLutRange.x), 0.0, 1.0) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  float f = x - i0;
  float u0 = (i0 + 0.5) / n;
  float u1 = (i0 + 1.5) / n;
  vec3 r0 = mix(texture2D(uDopplerLut, vec2(u0, 1.0 / 6.0)).rgb, texture2D(uDopplerLut, vec2(u1, 1.0 / 6.0)).rgb, f);
  vec3 r1 = mix(texture2D(uDopplerLut, vec2(u0, 0.5)).rgb, texture2D(uDopplerLut, vec2(u1, 0.5)).rgb, f);
  vec3 r2 = mix(texture2D(uDopplerLut, vec2(u0, 5.0 / 6.0)).rgb, texture2D(uDopplerLut, vec2(u1, 5.0 / 6.0)).rgb, f);
  return max(vec3(dot(r0, c), dot(r1, c), dot(r2, c)), 0.0);
}

// ln D for a ship-frame direction d seen moving along v with e^+-phi: -ln(e^-phi cos^2 + e^phi sin^2).
float lnDopplerShip(vec3 d, vec3 v, float ePhi, float emPhi) {
  vec3 a = d - v;
  vec3 b = d + v;
  return -log(0.25 * (emPhi * dot(b, b) + ePhi * dot(a, a)));
}

// exp of a log-brightness, cut to exactly zero far below display precision
float expBrightness(float lnB) {
  return lnB < -60.0 ? 0.0 : exp(min(lnB, 12.0));
}

void main() {
  // Un-project at the near plane: with near = 1 m and far = 10^25 km the far plane is
  // effectively at infinity (w = 0 there).
  vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(p.xyz / p.w));

  vec3 perp = d - dot(d, uVelDir) * uVelDir;
  float sp = length(perp);
  // theta/2 = atan(e^phi |d - v|, |d + v|): both chords are accurate, and atan's two-argument form
  // copes with either being zero (straight ahead, straight behind).
  float th = 2.0 * atan(uEPhi * length(d - uVelDir), length(d + uVelDir));
  vec3 e = sp > 1e-12 ? perp / sp : vec3(0.0);
  vec3 dRest = cos(th) * uVelDir + sin(th) * e;

  float lnD = lnDopplerShip(d, uVelDir, uEPhi, uEmPhi);

  // One ship pixel spans D times more of the rest-frame sky (the aberration Jacobian).
  float lod = clamp((lnD + uLnPixelOverTexel) * 1.442695, 0.0, uMaxLod);
  vec4 src = textureLod(uCube, dRest, lod);
  vec3 rgb = src.rgb;
  if (uDoppler > 0.5) {
    float lnL = blackbodyLn(LN_T_SUN + lnD).a; // brightness of sunlight shifted to D T_sun
    rgb = dopplerRgb(src.rgb, lnD) * expBrightness(lnL + uLnExposure);

    // The CMB: behind every surface, added to the point sources already drawn under this pass.
    if (uCmbGain > 0.0) {
      vec4 bb = blackbodyLn(uLnTCmb + lnDopplerShip(d, uCmbDir, uCmbEPhi, uCmbEmPhi));
      rgb += (1.0 - src.a) * uCmbGain * bb.rgb * expBrightness(bb.a + uLnSunRadiance + uLnExposure);
    }
  }
  // Half-float targets overflow at 65,504: a real camera saturates long before.
  gl_FragColor = vec4(min(rgb, vec3(3.0e4)), src.a);
}
