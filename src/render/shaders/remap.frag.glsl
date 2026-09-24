// Relativistic remap of the scene seen from the moving ship.
//
// The scene (everything except point sources, which are transformed exactly in their own
// shaders) was rendered into a cube map in the Sun's rest frame. For each screen pixel:
//  1. ship-frame viewing direction d' at angle θ' from the velocity
//  2. aberration: rest-frame angle θ, via the half-angle form of
//     cos θ = (cos θ' − β) / (1 − β cos θ'), which is tan(θ/2) = k tan(θ'/2), k = √((1+β)/(1−β));
//     numerically stable even at β = 0.99999
//  3. sample the cube map there, with the mip level set by how much aberration squeezes
//     the sky (linear factor D) so the compressed forward view doesn't shimmer
//  4. Doppler shift + beaming: an approximate spectral recolouring I'λ(λ) = D⁵ Iλ(λD),
//     precomputed as a 3×3 RGB matrix per D (see src/physics/dopplerColor.ts)
// The result is written premultiplied, and the cube map's alpha (surface coverage) lets
// planets hide the analytically drawn stars behind them.

uniform samplerCube uCube;
uniform sampler2D uDopplerLut;
uniform float uLnDMin;
uniform float uLnDMax;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uVelDir;
uniform float uBeta;
uniform float uGamma;
uniform float uK;
uniform float uPixelAngle;
uniform float uTexelAngle;
uniform float uMaxLod;
uniform float uDoppler; // 1: apply Doppler/beaming, 0: aberration only
uniform float uExposure;

varying vec2 vUv;

vec3 dopplerRgb(vec3 c, float D) {
  float u = clamp((log(D) - uLnDMin) / (uLnDMax - uLnDMin), 0.0, 1.0);
  vec3 r0 = texture2D(uDopplerLut, vec2(u, 1.0 / 6.0)).rgb;
  vec3 r1 = texture2D(uDopplerLut, vec2(u, 0.5)).rgb;
  vec3 r2 = texture2D(uDopplerLut, vec2(u, 5.0 / 6.0)).rgb;
  return max(vec3(dot(r0, c), dot(r1, c), dot(r2, c)), 0.0);
}

void main() {
  // Un-project at the near plane: with near = 1 m and far = 10¹³ km the far plane is
  // effectively at infinity (w = 0 there).
  vec4 p = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 d = normalize(mat3(uCamWorld) * normalize(p.xyz / p.w));

  float cp = clamp(dot(d, uVelDir), -1.0, 1.0); // cos θ'
  vec3 perp = d - cp * uVelDir;
  float sp = length(perp);                       // sin θ'
  float tHalf = cp > 0.0 ? sp / (1.0 + cp) : (1.0 - cp) / max(sp, 1e-20);
  float th = 2.0 * atan(uK * tHalf);
  float c = cos(th);
  vec3 e = sp > 1e-12 ? perp / sp : vec3(0.0);
  vec3 dRest = c * uVelDir + sin(th) * e;

  // Doppler factor, in whichever form avoids cancellation.
  float D = c >= 0.0 ? uGamma * (1.0 + uBeta * c) : 1.0 / (uGamma * (1.0 - uBeta * cp));

  float lod = clamp(log2(max(D * uPixelAngle / uTexelAngle, 1.0)), 0.0, uMaxLod);
  vec4 src = textureLod(uCube, dRest, lod);
  vec3 rgb = uDoppler > 0.5 ? dopplerRgb(src.rgb, D) * uExposure : src.rgb;
  gl_FragColor = vec4(rgb, src.a);
}
