// Orbit lines as screen-space ribbons. Each instance is one segment; vertices are computed
// on the GPU relative to the body, so the line passes exactly through it at any zoom:
//
//   r(A + dA) - r(A) = -2a sin(A + dA/2) sin(dA/2) P + 2b cos(A + dA/2) sin(dA/2) Q    (ellipse)
//   (the hyperbola uses sinh/cosh)
//
// dA is small near the body, so the offset is precise in float32. The camera-relative body
// position comes from the CPU in float64 (floating origin).
#include <common>
#include <logdepthbuf_pars_vertex>
#ifdef LENS
// Near a black hole (render/lensVariants.ts: the line's material is swapped for one compiled with LENS
// while the lens is drawn) both ends of each segment go to their primary image, keeping their straight-line
// distance from the camera, so the near-plane clipping and the depth test still see the line where it is:
// with LENS alone by tier 1 (lensImage, as the stars), with LENS_EXACT, for the lines of bodies within
// 10⁵ M of the hole (the S-stars round Sgr A*), by the exact solver of both branches (lensImageExact: tier 1
// is 2 px off for S2's line in front of the hole), drawn straight where it does not apply (scene/Orbits.tsx
// asks for it only for a hovering camera beyond 3M, the one case it always does). The point's place relative
// to the hole comes from the body's, worked out in float64 on the CPU (uBodyHoleM), plus the segment's
// offset, so the hole-relative position keeps its precision. A guide: the primary image only, no colour.
// Both ends go through one call of lensPoint in a loop: the compiler keeps one copy of the lens code, where
// two calls (and tier 1 as the exact solver's fallback) had the exact program's cold compile at 17–40 s on
// the target laptop. Cost: two images a vertex, 1,024 segments at most (tier 2: 0.06 ms for 4,096 vertices,
// measured); the programs are compiled in the background and used only near a hole.
//
// Twins: scene/orbitLines.ts (the conic), physics/lensPoint.ts (pointImageTier1, pointImageExact).
#include <lightspeed_lens>
#ifdef LENS_EXACT
#include <lightspeed_lens_exact>
#endif
uniform vec3 uBodyHoleM;   // the body relative to the lensing hole, world axes, units of M (float64 on the CPU)
#endif

attribute vec2 corner;  // x: 0 = segment start, 1 = end; y: -1 / +1 side
attribute float aIndex; // segment index

uniform vec3 uBodyPos;     // body position relative to the camera, km
uniform vec3 uP;           // unit vector to periapsis (world axes)
uniform vec3 uQ;           // unit vector 90 deg ahead in the orbit plane
uniform float uA;          // |semi-major axis|, km
uniform float uB;          // semi-minor axis, km
uniform float uAnomaly;    // body's current eccentric (or hyperbolic) anomaly
uniform float uHyperbolic; // 1.0 for a hyperbola
uniform float uSpanMin;    // anomaly offset range: [uSpanMin, uSpanMax]
uniform float uSpanMax;
uniform float uClosed;     // 1.0: closed orbit, parameter clustered at dA = 0 from both sides
uniform float uSegments;
uniform float uWidth;      // CSS px
uniform float uPixelRatio;
uniform vec2 uResolution;  // drawing-buffer px
uniform float uNear;
uniform float uBodyRadius; // displayed radius, km (fade the line inside the disc)
uniform float uAlphaBase;
uniform float uAlphaTrail;

varying float vSide;
varying float vAlpha;

float anomalyOffset(float s) {
  // s in [0, 1] -> dA, with samples clustered near dA = 0 (cubic), so the line hugs the body.
  if (uClosed > 0.5) {
    float t = 2.0 * s - 1.0;
    return PI * sign(t) * abs(t) * t * t;
  }
  return uSpanMin * (1.0 - s) * (1.0 - s) * (1.0 - s);
}

vec3 orbitOffset(float dA) {
  float mid = uAnomaly + 0.5 * dA;
  if (uHyperbolic > 0.5) {
    float s = sinh(0.5 * dA);
    return -2.0 * uA * sinh(mid) * s * uP + 2.0 * uB * cosh(mid) * s * uQ;
  }
  float s = sin(0.5 * dA);
  return -2.0 * uA * sin(mid) * s * uP + 2.0 * uB * cos(mid) * s * uQ;
}

#ifdef LENS
// A point of the line, p from the camera (km) and o from the body (km), moved to its primary image at the
// same distance from the camera. Within 3M of the hole (only its own orbit line comes so near, where the
// line has faded out beside the hole) it stays where it is.
vec3 lensPoint(vec3 p, vec3 o) {
  vec3 srcH = uBodyHoleM + o * uLensScale.x;
  if (dot(srcH, srcH) < 9.0) return p;
  vec3 relM = uLensHole + srcH;
  float lnDf = 0.0;
  if (uFramePhi > 0.0) relM = frameAberrate(normalize(relM), lnDf) * length(relM);
  vec3 image;
  float lnMu;
  float lnG;
#ifdef LENS_EXACT
  // (Straight, the direction it sets first, where the exact solver does not apply.)
  lensImageExact(relM, 0.0, image, lnMu, lnG);
#else
  lensImage(relM, 0.0, 0.0, image, lnMu, lnG);
#endif
  return frameUnaberrate(image, lnDf) * length(p);
}
#endif

float trailAlpha(float dA) {
  // Brighter just behind the body (where it has been), fading around the orbit.
  float behind = clamp(-dA / (PI * 0.95), 0.0, 1.0);
  float ahead = clamp(dA / (PI * 0.08), 0.0, 1.0);
  float trail = dA < 0.0 ? pow(1.0 - behind, 2.2) : 0.55 * pow(1.0 - ahead, 2.0);
  return uAlphaBase + (uAlphaTrail - uAlphaBase) * trail;
}

void main() {
  float s0 = aIndex / uSegments;
  float s1 = (aIndex + 1.0) / uSegments;
  float dA0 = anomalyOffset(s0);
  float dA1 = anomalyOffset(s1);
  vec3 o0 = orbitOffset(dA0);
  vec3 o1 = orbitOffset(dA1);
#ifdef LENS
  // Both ends through one call site (see the header).
  vec3 e0 = uBodyPos + o0;
  vec3 e1 = uBodyPos + o1;
  for (int k = 0; k < 2; k++) {
    vec3 o = k == 0 ? o0 : o1;
    vec3 q = lensPoint(uBodyPos + o, o);
    if (k == 0) e0 = q;
    else e1 = q;
  }
  vec4 v0 = viewMatrix * vec4(e0, 1.0);
  vec4 v1 = viewMatrix * vec4(e1, 1.0);
#else
  vec4 v0 = viewMatrix * vec4(uBodyPos + o0, 1.0);
  vec4 v1 = viewMatrix * vec4(uBodyPos + o1, 1.0);
#endif

  // Clip the segment against the near plane.
  float nz = -uNear * 1.001;
  if (v0.z > nz && v1.z > nz) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vSide = 0.0;
    return;
  }
  if (v0.z > nz) v0 = mix(v0, v1, (nz - v0.z) / (v1.z - v0.z));
  else if (v1.z > nz) v1 = mix(v1, v0, (nz - v1.z) / (v0.z - v1.z));

  vec4 c0 = projectionMatrix * v0;
  vec4 c1 = projectionMatrix * v1;
  vec2 p0 = c0.xy / c0.w * uResolution * 0.5;
  vec2 p1 = c1.xy / c1.w * uResolution * 0.5;
  vec2 dir = p1 - p0;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  bool atEnd = corner.x > 0.5;
  vec4 c = atEnd ? c1 : c0;
  float halfW = 0.5 * uWidth * uPixelRatio + 0.75; // +AA margin
  c.xy += nrm * corner.y * halfW / (uResolution * 0.5) * c.w;
  gl_Position = c;

  float dA = atEnd ? dA1 : dA0;
  vec3 o = atEnd ? o1 : o0;
  float nearFade = smoothstep(uBodyRadius * 1.3, uBodyRadius * 5.0, length(o));
  vAlpha = trailAlpha(dA) * nearFade;
  vSide = corner.y * halfW;
  #include <logdepthbuf_vertex>
}
