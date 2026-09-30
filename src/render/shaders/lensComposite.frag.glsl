// The lens box's composite: the Galaxy layer's light (its particles, clumps, galaxies and glow) resampled through a
// black hole's lens at every pixel of the box round the hole, with the accretion flow; the plain composite
// (render/galaxyLayer.ts) draws the frame round the box.
//
// What, per pixel: the pixel's ray as this half's observer sees it; the photon ring's band annulus is
// left to its own pass (lensBand.frag.glsl, which tests the identical expression, lens.glsl lensInBand: a squared
// chord against float64 bounds, so the two share the pixels out exactly); outside the diffuse zone (a cone in the observer's frame: one dot product) the lens moves the light under
// 0.5 px and the pixel reads the targets at its own position, shifted by the observer's gravitational blueshift
// alone; inside it the ray is taken to the hole's frame, through the lens (lightspeed_lenspixel), and its light read
// where its source is seen unlensed (the targets, or the hole's sky cube for sources off the screen), with the
// surface-brightness factors and the recolouring, then drawn with the Galaxy layer's display law. Captured rays are
// black (a hole formed by collapse has no white hole) apart from the flow in front of the shadow. One ray a pixel and
// no loop: the band's sub-rays are the band pass's (a loop of them here cost 3.7–3.9 ms over the whole screen with no
// pixel in the band, on the target laptop).
//
// Cost (target laptop, 2,048 × 1,320): about 0.8 ms over the whole screen at rest (1.04 in flight), 0.08 ms for the
// box at 4,000 au; only where the box is drawn.
//
// Twins: render/lens/lensComposite.ts (the material and its uniforms), physics/lensMirror32.ts (the lens).
#include <lightspeed_relativity>
#include <lightspeed_dopplercolour>
#include <lightspeed_galaxycomposite>
#include <lightspeed_lens>
#include <lightspeed_flowlookup>
#include <lightspeed_lenspixel>

uniform mat4 uProjInv;
uniform mat4 uCamWorld;

varying vec2 vUv;

void main() {
  // Un-project at the near plane, as the remap does.
  vec4 q = uProjInv * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 dView = normalize(mat3(uCamWorld) * normalize(q.xyz / q.w));
  // The band's annulus is the band pass's: the identical expression there.
  // (LENS_NO_BAND: compiled without it, for the check that the band's code costs nothing here: dev/lensTest.ts.)
#ifndef LENS_NO_BAND
  if (lensInBand(dView)) discard;
#endif
  float cP = max(dot(dView, uViewFwd), 1e-3);
  vec3 rgb;
  if (uLensDebug < 0.5 && dot(dView, uLensZoneCentre) < uLensZoneCos) {
    // Outside the diffuse zone: the light as drawn unlensed, with the observer's blueshift.
    rgb = galaxyDisplay(lensOwnFlux(vUv, cP, uLensLnG));
  } else {
    float lnDpix;
    vec3 dS = relUnaberrateLens(dView, uVelDir, uEPhi, uEmPhi, lnDpix);
    float lnDfPix;
    vec3 d = frameAberrate(dS, lnDfPix);
    vec4 flux;
    float lnG;
    float g;
    bool esc = lensSourceFlux(dView, d, lnDpix, lnDfPix, vec2(uPixelAngle * exp(lnDpix)), flux, lnG, g);
    // Uniform radiance (4): flux (cP³ + 1) here; half of it, so that Y(gT)/Y(T) stays below saturation on the 8-bit canvas.
    if (uLensDebug > 3.5) rgb = 0.5 * flux.rgb / (cP * cP * cP + 1.0);
    else if (uLensDebug > 0.5) rgb = esc ? flux.rgb : vec3(0.0);
    else rgb = (esc ? galaxyDisplay(flux) : vec3(0.0)) + lensFlowAtGap(d, g, lnDpix, lnG);
  }
  // Half-float targets overflow at 65,504: a real camera saturates long before.
  gl_FragColor = vec4(min(rgb, vec3(3.0e4)), 1.0);
}
