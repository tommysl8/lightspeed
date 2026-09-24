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
  vec4 v0 = viewMatrix * vec4(uBodyPos + o0, 1.0);
  vec4 v1 = viewMatrix * vec4(uBodyPos + o1, 1.0);

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
