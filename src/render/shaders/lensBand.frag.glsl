// The photon ring's band: the pixels within (uLensSsBandPx + 1) pixel angles of the shadow's edge, each supersampled
// along the meridian through the hole, so that the unresolved rings of higher orders (at 20 M 8.4, 0.35 and 0.015 px
// wide; at 200 M 1.1, 0.045 and 0.002 px) are averaged without bias and the shadow's edge is anti-aliased.
//
// What: the pixel's footprint along the meridian in the lens frame, [α − ω/2, α + ω/2] with ω the
// pixel's angle there (aberration is conformal); its part outside the edge split into N strata uniform in the
// table's variable s = ln g + 3g (every half-turn band spans about π in s, so each gets its share of sub-rays, and
// bands under about 1e-4 px are dropped), one sub-ray in each, placed at random within it (a hash of the pixel and
// the frame) uniformly in α and weighted by the stratum's own width in α over ω. That is unbiased, like the
// dα/ds-weighted sample uniform in s it replaced, but exact wherever the light is smooth across a stratum: with the
// dα/ds weight a stratum spanning 1.4 in s (near the edge, where a pixel's footprint reaches down to 1e-5 of
// itself) varies its weight 4× from sample to sample, and the uniform-radiance sky (dev/lensTest.ts, debug sky 4)
// showed the pixels on the edge flickering by up to 58 % from frame to frame; with the stratum's width it is flat
// to the last bit. Each sub-ray does everything a pixel of the composite does (lightspeed_lenspixel: the lens, the
// source's screen or cube reading at the level of its own stratum's footprint, the surface-brightness factors, the
// recolouring, the flow); the part inside the edge adds only the flow in front of the shadow. Sub-rays spaced
// regularly in α would meet a 0.015-px ring with probability 0.12 and flicker by up to 11 % of the sky's brightness.
//
// Cost: 2,700 pixels at 100 M to 39,000 at the horizon of a fall, 8 sub-rays each (4 at rung 1): 0.02–0.15 ms.
//
// Twins: render/lens/lensBand.ts (the material), lensComposite.frag.glsl (leaves exactly these pixels).
#include <lightspeed_relativity>
#include <lightspeed_dopplercolour>
#include <lightspeed_galaxycomposite>
#include <lightspeed_lens>
#include <lightspeed_flowlookup>
#include <lightspeed_lenspixel>

uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform float uBandSubRays; // N: 8 (4 at rung 1)
uniform float uBandJitter;  // this frame's offset of the sub-rays within their strata, 0 … 1

// ln g of the gap whose table variable is s = ln g + 3g: Newton in y = ln g from a start on the root's right
// (y = s when s ≤ 3, ln(s/3) beyond: y + 3e^y − s is convex and increasing, so it falls to the root), 4 steps.
float lensLnGapOfS(float s) {
  float y = s <= 3.0 ? s : lensLog(s / 3.0);
  for (int k = 0; k < 4; k++) {
    float e = 3.0 * exp(y);
    y -= (y + e - s) / (1.0 + e);
  }
  return y;
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uTargetPx * 2.0 - 1.0;
  vec4 q = uProjInv * vec4(ndc, -1.0, 1.0);
  vec3 dView = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  // Exactly the pixels the composite leaves.
  if (!lensInBand(dView)) discard;
  float cP = max(dot(dView, uViewFwd), 1e-3);
  float lnDpix;
  vec3 dS = relUnaberrateLens(dView, uVelDir, uEPhi, uEmPhi, lnDpix);
  float lnDfPix;
  vec3 d = frameAberrate(dS, lnDfPix);
  // The meridian through the hole: d = cos α axis + sin α ê.
  vec3 side = d - dot(d, uLensAxis) * uLensAxis;
  float sl = length(side);
  vec3 e = sl > 1e-12 ? side / sl : normalize(abs(uLensAxis.x) < 0.9 ? vec3(1.0, 0.0, 0.0) - uLensAxis.x * uLensAxis : vec3(0.0, 1.0, 0.0) - uLensAxis.y * uLensAxis);
  float omega = uPixelAngle * exp(lnDpix);
  float c;
  float g = lensGapC(d, c);
  float gLo = g - 0.5 * omega;
  float gHi = min(g + 0.5 * omega, uLensSpan);
  vec4 acc = vec4(0.0);
  vec3 flow = vec3(0.0);
  if (gHi > 0.0) {
    float gl = max(gLo, 1e-5 * omega);
    float s0 = lensLog(gl) + 3.0 * gl;
    float s1 = lensLog(gHi) + 3.0 * gHi;
    float n = uBandSubRays;
    float ds = (s1 - s0) / n;
    float hash = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    // The strata's ends in g: gl, the gaps at s0 + k ds, gHi.
    float gA = gl;
    for (int k = 0; k < 8; k++) {
      if (float(k) >= n) break;
      float gB = float(k) + 1.0 >= n ? gHi : exp(lensLnGapOfS(s0 + (float(k) + 1.0) * ds));
      float xi = fract(uBandJitter + hash + 0.618034 * float(k));
      float gk = gA + xi * (gB - gA);
      float w = (gB - gA) / omega;
      float sa;
      float ca;
      lensSinCosOfGap(gk, sa, ca);
      vec3 dk = ca * uLensAxis + sa * e;
      vec4 flux;
      float lnG;
      float gRay;
      bool esc = lensSourceFlux(dView, dk, lnDpix, lnDfPix, vec2(gB - gA, omega), flux, lnG, gRay);
      if (esc) acc += w * flux;
      if (uLensDebug < 0.5) flow += w * lensFlowAtGap(dk, gRay, lnDpix, lnG);
      gA = gB;
    }
  }
  // The part inside the edge: the flow in front of the shadow only.
  float capturedShare = clamp(-gLo / omega, 0.0, 1.0);
  if (capturedShare > 0.0 && uLensDebug < 0.5) {
    float gc = gHi > 0.0 ? 0.5 * gLo : g;
    float sa;
    float ca;
    lensSinCosOfGap(gc, sa, ca);
    vec3 dc = ca * uLensAxis + sa * e;
    flow += capturedShare * lensFlow(dc, lnDpix, lensLnGAt(0.5 * length(uLensAxis - dc)));
  }
  vec3 rgb;
  // Uniform radiance (4): as the composite writes it.
  if (uLensDebug > 3.5) rgb = 0.5 * acc.rgb / (cP * cP * cP + 1.0);
  else if (uLensDebug > 0.5) rgb = acc.rgb;
  else rgb = galaxyDisplay(acc) + flow;
  // Half-float targets overflow at 65,504: a real camera saturates long before.
  gl_FragColor = vec4(min(rgb, vec3(3.0e4)), 1.0);
}
