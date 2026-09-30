// The map of the cosmic microwave background as a layer of the sky (scene/CmbMap.tsx): the WMAP
// nine-year ILC map (cmb-data.png: a linear code k per pixel, ΔT = (k − 127.5) × 500/255 µK about
// 2.7255 K), in galactic coordinates, turned into the app's ecliptic world axes and drawn in false
// colour: black at the mean temperature, blue colder and red warmer, with the end colours of
// Moreland's cool–warm map (±250 µK), so the contrast is enhanced about 10,000 times and the sky
// stays dark enough for the stars. The map is published seen from inside the sky: the Galactic
// centre in the middle, longitude increasing to the left, v = 0 at the top (three.js flips it).
#ifdef LENS
//
// This is the program drawn near a black hole (render/lensVariants.ts: the material's LENS variant, sharing every
// uniform; scene/CmbMap.tsx swaps it in while a lens is drawn, and it is compiled in the background before: the plain
// program, as before black holes, has none of this): a pixel inside the lens's diffuse zone (a cone in this half's
// view) is read where its light came from (lensRay, with the frame boosts either side), nothing where its ray falls
// into the hole, and the view's exposure applied; the map's footprint comes from the screen-space derivatives of the
// lensed position, so it carries the lens's stretch. Cost: one lens ray a pixel inside the zone.
//
// Twins: milkyway.frag.glsl (the same chain), render/lens/lensPixel.glsl.
#include <lightspeed_lens>
#endif
uniform sampler2D uCmbTex;
uniform mat3 uWorldToGal;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform float uGain;
#ifdef LENS
// This half's observer (the relativity uniforms, shared) and the view's exposure.
uniform vec3 uVelDir;
uniform float uEPhi;
uniform float uEmPhi;
uniform float uLnExposure;
#endif

varying vec2 vUv;

// Moreland's end colours, (59, 76, 192) and (180, 4, 38) in sRGB, as linear RGB.
const vec3 COLD = vec3(0.0437, 0.0723, 0.5271);
const vec3 WARM = vec3(0.4564, 0.0012, 0.0194);

void main() {
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
#ifdef LENS
  vec3 src = d;
  float seen = 1.0;
  if (uLensOn > 0.5) {
    float lnDpix;
    src = relUnaberrateLens(d, uVelDir, uEPhi, uEmPhi, lnDpix);
    if (dot(d, uLensZoneCentre) >= uLensZoneCos) {
      float lnDf;
      vec3 nInf;
      vec2 jac;
      float lnG;
      if (lensRay(frameAberrate(src, lnDf), nInf, jac, lnG)) src = frameUnaberrate(nInf, lnDf);
      else seen = 0.0;
    }
  }
  vec3 g = uWorldToGal * src;
#else
  vec3 g = uWorldToGal * d;
#endif
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / 6.283185307179586), 0.5 + b / 3.141592653589793);
  // Derivatives across the seam at l = 180° taken the short way round (no one-pixel line there).
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  float k = textureGrad(uCmbTex, uv, dx, dy).r * 255.0;
  float t = clamp((k - 127.5) / 127.5, -1.0, 1.0);
  // Linear light as t², so that the colour's lightness grows about evenly with |ΔT|.
  vec3 c = (t < 0.0 ? COLD : WARM) * (t * t);
#ifdef LENS
  if (uLensOn > 0.5) c *= seen * exp(uLnExposure);
#endif
  gl_FragColor = vec4(c * uGain, 1.0);
}
