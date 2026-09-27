// A nebula's picture: its linear light is a surface brightness, NEBULA_MU_PEAK mag/arcsec² at its
// brightest (scene/Nebulae.tsx), drawn with the same law as the sky from the Sun (milkyway.glsl):
// luminance uStarGain √(S Ω_psf), faded out where the eye would lose it. In flight it is
// brightened and recoloured as a surface lit by sunlight-like light would be (remap.frag.glsl).
#include <lightspeed_blackbody>

uniform sampler2D uMap;
uniform float uPeakScale; // Y = √(uPeakScale · l · k) for the picture's luminance l (0–1) and a brightening k
uniform vec2 uFadeL;      // l · k where the light starts to show, and where it shows in full
uniform float uOpacity;
uniform float uPhi;
uniform float uLnExposure;

varying vec2 vUv;
varying float vFacing;
varying float vLnD;

void main() {
  vec3 v = texture2D(uMap, vUv).rgb;
  float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
  if (l <= 0.0) discard;
  float lnK = uLnExposure;
  vec3 tint = vec3(1.0);
  if (uPhi > 0.0) {
    vec4 shifted = blackbodyLn(LN_T_SUN + vLnD);
    lnK += shifted.a;
    tint = shifted.rgb / blackbodyLn(LN_T_SUN).rgb;
  }
  float k = exp(clamp(lnK, -80.0, 40.0));
  float y = sqrt(uPeakScale * l * k) * smoothstep(uFadeL.x, uFadeL.y, l * k) * smoothstep(0.05, 0.35, vFacing);
  gl_FragColor = vec4((v / l) * tint * (y * uOpacity), 1.0);
}
