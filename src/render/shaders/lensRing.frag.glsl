/**
 * The ring of an alignment behind a black hole, per pixel: a Gaussian of the PSF's σ across
 * the ring's circle on the sky, masked to the two arcs a disc behind a point lens makes (about the side towards
 * the source and the side away, half-angle asin(min(1, 1/z)) each: Gould 1994) with a one-pixel soft edge, and
 * the brightness the CPU gives it: the light a PSF-wide stretch of the arcs holds, shown as the stars are (peak
 * uStarGain √f_σ, scene/LensRings.tsx).
 *
 * How: the angle from the ring is taken in chords, (|d − c| − 2 sin(ρ/2))/cos(ρ/2), exact to first order in the
 * few pixels that matter and free of the GPU's atan (whose error is 1.3 × 10⁻⁴ relative here); its size in
 * device pixels from the chord's screen derivatives. Colour: the point shader's saturation and hue easing
 * (keepHue, a copy of point.frag.glsl's: its twin), so a ring's colour matches the glints it replaces.
 * Cost: one normalise, two derivatives and an exponential per pixel of the ring's box.
 */
varying vec3 vRay;
varying vec3 vCentre;
varying vec3 vTowards;
varying vec4 vRingA;
varying vec4 vRingB;

const float POINT_SATURATION = 1.5;
const float HUE_KNEE = 0.6;
const float HUE_CAP = 1.0;

// point.frag.glsl's keepHue (twin): saturation raised before tone mapping, the brightest channel eased.
vec3 keepHue(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 s = max(vec3(0.0), l + POINT_SATURATION * (c - l));
  float m = max(max(s.r, s.g), s.b);
  if (m <= HUE_KNEE) return s;
  float y = (m - HUE_KNEE) / (HUE_CAP - HUE_KNEE);
  float eased = HUE_KNEE + (HUE_CAP - HUE_KNEE) * y / (1.0 + y);
  return mix(s * (eased / m), c, smoothstep(4.0, 16.0, m));
}

void main() {
  vec3 d = normalize(vRay);
  float chord = length(d - vCentre);
  // radians across the ring, and radians per device pixel along the ring's normal
  float across = (chord - vRingA.x) / vRingA.y;
  float perPx = length(vec2(dFdx(chord), dFdy(chord))) / vRingA.y;
  float px = across / max(perPx, 1e-12);
  float sigma = vRingB.a;
  float g = vRingA.w * exp(-0.5 * px * px / (sigma * sigma));
  float mask = 1.0;
  if (vRingA.z > 0.0) {
    // the two arcs: |cos| of the azimuth about the centre, from the primary arc's middle, above cos(half-angle)
    vec3 p = d - dot(d, vCentre) * vCentre;
    float pl = length(p);
    float ca = pl > 0.0 ? dot(p, vTowards) / pl : 1.0;
    mask = clamp((abs(ca) - vRingA.z) / max(fwidth(ca), 1e-6) + 0.5, 0.0, 1.0);
  }
  g *= mask;
  if (g < 0.0015) discard;
  gl_FragColor = vec4(keepHue(vRingB.rgb * g), 1.0);
}
