// The galaxies beyond the Milky Way (sim/cosmos; scene/Galaxies.tsx): each galaxy near enough for
// its shape to show is a particle template (sim/cosmos/templates.ts) drawn once per galaxy as an
// instance, scaled to its measured size, tilted as it lies and as bright as it is; one too small on
// screen is a single splat holding all its light (the 'point' template). Every particle is a
// Gaussian splat of linear light added into the Galaxy's target (render/galaxyLayer.ts), dimmed by
// its galaxy's dust, and in flight aberrated and Doppler shifted like every point source.
//
// The expanding universe (sim/cosmos/expansion.ts): each instance carries ln(1 + z), the redshift of
// its galaxy's light from the expansion of space on the way to the camera. The light that arrives is
// a black body at T seen at T D / (1 + z), D the ship's Doppler factor (the two compose); its visible
// flux changes by the black body's change in brightness and the solid angle (D⁻² from aberration,
// (1 + z)² from the angular-diameter distance a_e χ against the a_o χ it is drawn at), the
// (1 + z)⁻⁴ surface-brightness dimming of Tolman in all. The CPU scales the luminosity by
// (a_e / a_o)² when the galaxy is drawn where its light left it (a_e χ away), so that either way the
// flux is the one that arrives.
//
// Positions: the template in its own units; per instance the galaxy's centre relative to the
// camera in kiloparsecs, worked out in float64 on the CPU each frame (a float32 kilometre would
// overflow at these distances), and its axes already scaled to kiloparsecs.
#include <common>
#include <lightspeed_relativity>
#include <lightspeed_psf>

attribute vec3 aColor; // linear RGB, luminance 1
attribute vec4 aAttr;  // share of the galaxy's light, splat radius (1σ, template units), ln T, population

attribute vec3 iCentre; // kpc, relative to the camera, world axes
attribute vec3 iAxX;    // the template's x, y and z in world axes, kpc per template unit
attribute vec3 iAxY;
attribute vec3 iAxZ;
attribute vec3 iNormal; // the plane of its dust (unit)
attribute vec2 iLum;    // V luminosity drawn, L☉; splat size per template unit, kpc
attribute vec4 iDust;   // face-on τ_V; the dust's scale length (kpc), or minus the ring's thickness for a ring; ring radius, ring width (kpc)
attribute float iLn1pz; // ln(1 + z) of its light (0: in the camera's own bound structure)

uniform float uPxPerRad;
uniform float uResScale;
uniform float uSigmaMax;
uniform float uSigmaBudget;
uniform float uReachFloor;
uniform float uBigPass;
uniform float uBigScale;
uniform float uSigmaCoarse;
uniform float uFluxCut;

varying vec3 vColor;
varying float vPeak;
varying float vSigma;
varying float vSize;

const float M_V_SUN = 4.83;

float particleHash() {
  uint h = uint(gl_VertexID) * 2654435761u + uint(gl_InstanceID) * 40503u;
  h ^= h >> 15;
  h *= 2246822519u;
  h ^= h >> 13;
  return float(h) / 4294967296.0;
}

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vPeak = 0.0;
}

// V-band extinction (mag) of the galaxy's own dust between the camera and the particle: a thin
// layer in the disc's plane, face-on optical depth τ(r) at the radius r where the line of sight
// crosses it, times 1/|cos| of the crossing angle. Particles in front of the layer are not dimmed.
// A ring of dust (the Sombrero Galaxy) has a thickness h: seen at a grazing angle the line of sight
// runs through it over h tan θ of radius, which widens the ring as seen (its column kept).
float dustAV(vec3 rel, float d) {
  if (iDust.x <= 0.0) return 0.0;
  float dn = dot(rel, iNormal);
  if (abs(dn) < 1e-9 * d) return 0.0;
  float t = dot(iCentre, iNormal) / dn;
  if (t <= 0.0 || t >= 1.0) return 0.0;
  float r = length(rel * t - iCentre);
  float mu = abs(dn) / d;
  float tau;
  if (iDust.y > 0.0) tau = iDust.x * exp(-r / iDust.y);
  else {
    float spread = -iDust.y * sqrt(max(1.0 - mu * mu, 0.0)) / max(mu, 0.05);
    float w = sqrt(iDust.w * iDust.w + spread * spread);
    tau = iDust.x * (iDust.w / w) * exp(-0.5 * pow((r - iDust.z) / max(w, 1e-6), 2.0));
  }
  return min(1.0857362 * tau / max(mu, 0.05), 8.0);
}

void main() {
  vec3 rel = iCentre + iAxX * position.x + iAxY * position.y + iAxZ * position.z;
  float d = length(rel);
  float hKpc = aAttr.y * iLum.y;
  if (iLum.x <= 0.0 || d <= hKpc) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);

  float sigmaPsf = 0.5 * uPixelRatio * uResScale;
  float sigmaExt = hKpc / d * uPxPerRad * exp(-lnD);
  if (sigmaExt >= uSigmaMax) {
    cull();
    return;
  }
  float near = 1.0 - smoothstep(0.5 * uSigmaMax, uSigmaMax, sigmaExt);
  bool large = sigmaExt > uSigmaCoarse;
  if (uBigPass >= 0.0 && large != (uBigPass > 0.5)) {
    cull();
    return;
  }
  // Large splats are drawn by lot, each as bright as the ones left out (as galaxy.vert.glsl).
  if (sigmaExt > uSigmaBudget) {
    float thr = (uSigmaBudget * uSigmaBudget) / (sigmaExt * sigmaExt);
    float w = clamp((thr - particleHash()) / (0.25 * thr), 0.0, 1.0);
    if (w <= 0.0) {
      cull();
      return;
    }
    near *= w / (0.875 * thr);
  }
  float sigmaT = max(max(sigmaPsf, sigmaExt), 0.6);

  float lum = iLum.x * aAttr.x * near;
  float mag = M_V_SUN - 1.0857362 * log(lum) + 2.1714724 * log(d * 100.0) - MAG_PER_LN * uLnExposure;
  float lnT = aAttr.z;
  vec3 tint = vec3(1.0);
  float lnDe = lnD - iLn1pz;
  if (lnDe != 0.0) {
    vec3 shifted;
    // With the solid angle taken as D_e⁻² = D⁻² (1 + z)², this is the flux relative to a static
    // universe with the galaxy a_o χ away, where it is drawn now; drawn where it was (a_e χ), the
    // CPU has taken off (a_e / a_o)² (docs/data/cosmology.md, section 4).
    mag += dopplerMagnitudeShift(lnT, lnDe, shifted);
    tint = shifted / max(blackbodyLn(lnT).rgb, vec3(1e-3));
  }
  float geom = (sigmaPsf * sigmaPsf) / (sigmaT * sigmaT);
  if (-0.9210340 * (mag - uMagZero) + log(geom) < log(0.02 * uFluxCut)) {
    cull();
    return;
  }
  float av = dustAV(rel, d);
  mag += av;
  vec3 redden = exp(-0.921034 * av * (vec3(0.89, 1.0, 1.23) - 1.0));
  vec3 c = aColor * tint * redden;
  float lumC = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float lnF = -0.9210340 * (mag - uMagZero);
  if (lumC <= 0.0 || lnF < -60.0) {
    cull();
    return;
  }
  float peak = min(exp(min(lnF, 60.0)), 3.0e4) * geom;
  if (peak < 0.02 * uFluxCut) {
    cull();
    return;
  }
  float reach = min(max(uReachFloor, sqrt(2.0 * log(max(peak / uFluxCut, 1.0001)))), 4.0);
  peak /= 1.0 - exp(-0.5 * reach * reach);

  vColor = c / lumC;
  vPeak = peak;
  float s = large && uBigPass > 0.5 ? uBigScale : 1.0;
  vSigma = sigmaT * s;
  vSize = 2.0 * sigmaT * s * reach + 2.0;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = vSize;
}
