// The photon ring's band (lensBand.frag.glsl): an annulus about the shadow's (or the dark region's) edge circle, in
// the view observer's directions, a little wider than the band pass's own ±(uLensSsBandPx + 1) pixel angles (its
// fragment shader keeps exactly those pixels, as the composite leaves them).
//
// How: each vertex has (azimuth share, side); its direction is the edge circle's centre turned out to the circle's
// radius ± the half-width, at that azimuth about it; projected as a direction (at infinity, w from the view), with
// z = 0 so that nothing is clipped by the far plane and the plane w = 0 clips what lies behind the camera.
//
// Cost: 514 vertices, drawn only when the edge is at least a pixel in radius.
//
// Twins: render/lens/lensGeometry.ts createBandGeometry (the attributes), render/lens/lensBand.ts (the uniforms).
uniform vec3 uLensEdgeCentre;  // the edge circle's centre, view observer's frame, unit
uniform float uLensEdgeRadius; // its radius, rad
uniform float uLensSsBandPx;   // the band's half-width, device px
uniform float uPixelAngle;     // a device pixel's angle at the screen's centre, rad
uniform mat4 uViewProj;        // projection × view (rotation only)

attribute vec2 aBand; // (azimuth share 0 … 1, side −1 inside the edge, +1 outside)

void main() {
  if (uLensSsBandPx <= 0.0) {
    // no band in this half (the edge is under a pixel): nothing drawn
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 c = uLensEdgeCentre;
  vec3 e1 = normalize(abs(c.x) < 0.9 ? vec3(1.0, 0.0, 0.0) - c.x * c : vec3(0.0, 1.0, 0.0) - c.y * c);
  vec3 e2 = cross(c, e1);
  float rho = max(uLensEdgeRadius + aBand.y * (uLensSsBandPx + 2.0) * uPixelAngle, 0.0);
  float t = 6.28318530718 * aBand.x;
  vec3 d = cos(rho) * c + sin(rho) * (cos(t) * e1 + sin(t) * e2);
  vec4 clip = uViewProj * vec4(d, 0.0);
  gl_Position = vec4(clip.xy, 0.0, clip.w);
}
