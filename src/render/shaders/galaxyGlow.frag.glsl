// The Galaxy model's light near the camera as a smooth glow (sim/galaxy/glow.ts, whose nearGlow is
// this integration in TypeScript, for the tests). The thin and thick discs and the young arm stars
// are smooth laws of the model; near the camera their particles are few and each seen hundreds of
// parsecs wide, so there their light is worked out along each line of sight instead, through the
// model's dust, and their particles take over further out (galaxy.vert.glsl: the two cross over
// between s0 and s1). Added into the Galaxy layer's target in its units: the flux, in V = 0 stars
// relative to the exposure, that falls within a faint star's image area (its luminance in alpha, as
// the model's particles).
//
// In flight the pixel's ship-frame direction is taken back to the rest frame (the inverse of the
// aberration of point sources), and each population's light is brightened and recoloured as a
// blackbody of its colour temperature seen with the Doppler factor D (a surface's radiance becomes
// that of a blackbody at D T).
#include <common>
#include <lightspeed_relativity>

uniform vec3 uCamG;        // camera in frame G, kpc
uniform mat3 uGalToWorld;  // heliocentric galactic → world axes
uniform mat3 uGalToG;      // heliocentric galactic → frame G (rotation)
uniform sampler2D uDust;   // face-on dust maps in frame G: disc a_V, disc height, arm a_V, arm height
uniform sampler2D uWarpMap; // r: height of the warped midplane (kpc); g: the young arm stars' surface brightness (L☉/pc²)
uniform float uDustExtent; // the maps cover ±uDustExtent kpc
uniform float uLumGain;    // the model's share of the sky (crossfade with the sky from the Sun)
uniform float uPxPerRad;   // target pixels per radian (the main target)
uniform float uResScale;   // target pixels per device pixel
uniform float uPixelRatio;
uniform float uMagZero;
uniform vec4 uGlowThin;    // surface brightness at R = 0 (L☉/pc²), hR, hz, Rmax (kpc)
uniform vec4 uGlowThick;
uniform float uGlowYoungHz; // kpc
uniform vec4 uGlowRange;   // the discs' s0 and s1, the young arm stars' s0 and s1 (kpc)
uniform vec3 uGlowThinRgb; // linear sRGB of luminance 1
uniform vec3 uGlowYoungRgb;
uniform vec3 uGlowThickRgb;
uniform vec3 uGlowLnT;     // ln of their colour temperatures (K): thin, young, thick

varying vec3 vRay;

const int GLOW_STEPS = 32;     // as sim/galaxy/glow.ts
const float GLOW_S_SCALE = 0.01; // step ends at GLOW_S_SCALE (e^(kλ) − 1) kpc
const float M_V_SUN = 4.83;
// A red, green and blue channel's extinction as a share of A_V (Cardelli et al. 1989, as the particles).
const vec3 REDDEN = vec3(0.89, 1.0, 1.23);

float erfA(float x) {
  float s = sign(x);
  float t = 1.0 / (1.0 + 0.3275911 * abs(x));
  float y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// ∫ e^(−|z|/h) dz from 0 to z.
float layerInt(float z, float h) {
  return sign(z) * h * (1.0 - exp(-abs(z) / h));
}

// Ship-frame direction → rest-frame direction, and ln D: the inverse of relAberrate. With the
// half-angles of the ship-frame angle θ′, tan(θ/2) = e^φ tan(θ′/2) and D = 1 / (e^−φ cos²(θ′/2) + e^φ sin²(θ′/2)).
vec3 relUnaberrate(vec3 dShip, out float lnD) {
  if (uPhi <= 0.0) {
    lnD = 0.0;
    return dShip;
  }
  vec3 a = dShip - uVelDir;
  vec3 b = dShip + uVelDir;
  float s2 = dot(a, a);
  float c2 = dot(b, b);
  float n = s2 + c2;
  s2 /= n;
  c2 /= n;
  lnD = -log(uEmPhi * c2 + uEPhi * s2);
  float th = 2.0 * atan(uEPhi * sqrt(s2), sqrt(c2));
  vec3 perp = dShip - dot(dShip, uVelDir) * uVelDir;
  float pl = length(perp);
  if (pl < 1e-12) return c2 >= s2 ? uVelDir : -uVelDir;
  return cos(th) * uVelDir + (sin(th) / pl) * perp;
}

// A population's light seen with Doppler factor e^lnD: its colour (luminance 1) and the ln of its brightening.
vec3 shifted(vec3 rgb, float lnT, float lnD, out float lnK) {
  if (uPhi <= 0.0) {
    lnK = 0.0;
    return rgb;
  }
  vec4 a = blackbodyLn(lnT);
  vec4 b = blackbodyLn(lnT + lnD);
  lnK = b.a - a.a;
  vec3 c = rgb * b.rgb / max(a.rgb, vec3(1e-3));
  return c / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
}

void main() {
  float lnD;
  vec3 dWorld = relUnaberrate(normalize(vRay), lnD);
  vec3 dir = uGalToG * (transpose(uGalToWorld) * dWorld);
  float end = uGlowRange.y;
  float lambda = log(1.0 + end / GLOW_S_SCALE) / float(GLOW_STEPS);
  float zOut = 7.0 * max(uGlowThin.z, uGlowThick.z) + 2.0;
  float tau = 0.0;
  // Each population's column (L☉/pc², V) after the dust, and its colour after the reddening.
  vec3 col = vec3(0.0);
  vec3 tint0 = vec3(0.0);
  vec3 tint1 = vec3(0.0);
  vec3 tint2 = vec3(0.0);
  float sa = 0.0;
  for (int k = 1; k <= GLOW_STEPS; k++) {
    float sb = GLOW_S_SCALE * (exp(float(k) * lambda) - 1.0);
    float L = sb - sa;
    vec3 pa = uCamG + dir * sa;
    vec3 pb = uCamG + dir * sb;
    float smid = 0.5 * (sa + sb);
    sa = sb;
    // Wholly above or below the discs: no light and no dust.
    if (min(pa.z, pb.z) > zOut || max(pa.z, pb.z) < -zOut) continue;
    // In-plane quantities where the step comes closest to the midplane (as columnAV).
    vec3 q = pa.z * pb.z <= 0.0 && pa.z != pb.z ? mix(pa, pb, pa.z / (pa.z - pb.z)) : (abs(pa.z) < abs(pb.z) ? pa : pb);
    vec4 m = vec4(0.0, 0.1, 0.0, 0.1);
    vec2 wy = vec2(0.0);
    if (abs(q.x) < uDustExtent && abs(q.y) < uDustExtent) {
      vec2 uv = (q.xy + uDustExtent) / (2.0 * uDustExtent);
      m = texture2D(uDust, uv);
      wy = texture2D(uWarpMap, uv).rg;
    }
    float za = pa.z - wy.x;
    float zb = pb.z - wy.x;
    float dz = zb - za;
    bool level = abs(dz) < 1e-6 * L;
    float av;
    if (level) {
      float s = 1.0 / cosh(za / m.y);
      av = L * (m.x * s * s + m.z * exp(-za * za / (m.w * m.w)));
    } else {
      float disc = m.x * m.y * (tanh(zb / m.y) - tanh(za / m.y));
      float arms = m.z * m.w * 0.8862269 * (erfA(zb / m.w) - erfA(za / m.w));
      av = (L / dz) * (disc + arms);
    }
    float dtau = 0.921034 * max(av, 0.0);
    // The step's own light is mixed with its own dust: (1 − e^−τ) / τ of it gets out, per channel.
    vec3 dt = dtau * REDDEN;
    vec3 mixC = dtau > 1e-6 ? (1.0 - exp(-dt)) / dt : vec3(1.0);
    vec3 seen = exp(-tau * REDDEN) * mixC;
    float seenV = seen.g;
    float R = length(q.xy);
    float wDisc = 1.0 - smoothstep(uGlowRange.x, uGlowRange.y, smid);
    float wYoung = 1.0 - smoothstep(uGlowRange.z, uGlowRange.w, smid);
    // Σ / (2h) × ∫ e^(−|z|/h) ds over the step: L☉/pc².
    float hT = uGlowThin.z;
    float hK = uGlowThick.z;
    float hY = uGlowYoungHz;
    float cT = level ? L * exp(-abs(za) / hT) : (layerInt(zb, hT) - layerInt(za, hT)) * L / dz;
    float cK = level ? L * exp(-abs(za) / hK) : (layerInt(zb, hK) - layerInt(za, hK)) * L / dz;
    float cY = level ? L * exp(-abs(za) / hY) : (layerInt(zb, hY) - layerInt(za, hY)) * L / dz;
    float sT = R > uGlowThin.w ? 0.0 : uGlowThin.x * exp(-R / uGlowThin.y);
    float sK = R > uGlowThick.w ? 0.0 : uGlowThick.x * exp(-R / uGlowThick.y);
    vec3 e = vec3(wDisc * sT * cT / (2.0 * hT), wYoung * wy.y * cY / (2.0 * hY), wDisc * sK * cK / (2.0 * hK));
    col += e * seenV;
    tint0 += e.x * seen;
    tint1 += e.y * seen;
    tint2 += e.z * seen;
    tau += dtau;
    if (tau > 30.0) break;
  }
  // A column S (L☉/pc²) along a line of sight is 10^(−0.4 M☉) × (10 pc)² × S V = 0 stars per steradian;
  // in the target, times a faint star's image area and the exposure.
  float sigmaPsf = 0.5 * uPixelRatio * uResScale / uPxPerRad;
  float perColumn = exp(-0.921034 * (M_V_SUN - uMagZero) + uLnExposure) * 100.0 * 6.2831853 * sigmaPsf * sigmaPsf * uLumGain;
  float lnK0, lnK1, lnK2;
  vec3 c0 = shifted(uGlowThinRgb, uGlowLnT.x, lnD, lnK0);
  vec3 c1 = shifted(uGlowYoungRgb, uGlowLnT.y, lnD, lnK1);
  vec3 c2 = shifted(uGlowThickRgb, uGlowLnT.z, lnD, lnK2);
  // The reddening tints each population's colour; the V-band dimming is in col already.
  vec3 r0 = c0 * tint0 / max(col.x, 1e-30);
  vec3 r1 = c1 * tint1 / max(col.y, 1e-30);
  vec3 r2 = c2 * tint2 / max(col.z, 1e-30);
  r0 /= max(dot(r0, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  r1 /= max(dot(r1, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  r2 /= max(dot(r2, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
  vec3 f = perColumn * (col.x * exp(min(lnK0, 60.0)) * r0 + col.y * exp(min(lnK1, 60.0)) * r1 + col.z * exp(min(lnK2, 60.0)) * r2);
  f = min(f, vec3(6.0e4));
  // The luminance goes into alpha too: this is the Milky Way model's light (galaxy.frag.glsl).
  gl_FragColor = vec4(f, dot(f, vec3(0.2126, 0.7152, 0.0722)));
}
