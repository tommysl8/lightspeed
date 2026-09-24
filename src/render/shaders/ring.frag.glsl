#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uSunView;
uniform vec3 uCenterV;      // planet centre, view space
uniform vec3 uNormalV;      // ring-plane normal, view space
uniform float uPlanetRadius; // displayed equatorial radius, km
uniform float uSunIntensity;
uniform vec3 uSunColor;
uniform float uInner; // ring texture's inner radius, km
uniform float uOuter; // ring texture's outer radius, km

varying vec2 vLocal;
varying vec3 vPosV;

void main() {
  #include <logdepthbuf_fragment>
  float radial = (length(vLocal) - uInner) / (uOuter - uInner);
  if (radial < 0.0 || radial > 1.0) discard;
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, vec2(radial, 0.5)) : vec4(0.8, 0.75, 0.65, 0.6 * step(0.3, radial));
  if (tex.a < 0.01) discard;
  vec3 L = normalize(uSunView - vPosV);
  vec3 V = normalize(-vPosV);
  float sl = dot(L, uNormalV);
  float sv = dot(V, uNormalV);
  // Lit face: diffuse reflection. Unlit face: light filtering through thin parts of the rings.
  float lit = sl * sv > 0.0 ? 0.25 + 0.75 * sqrt(abs(sl)) : 0.55 * (1.0 - tex.a);

  // Saturn's shadow across the rings: ray toward the Sun vs. the planet sphere.
  vec3 oc = vPosV - uCenterV;
  float b = dot(oc, L);
  float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
  float h = b * b - c;
  float shadow = (h > 0.0 && -b - sqrt(h) > 0.0) ? 0.03 : 1.0;

  vec3 col = tex.rgb * uSunColor * uSunIntensity * lit * shadow;
  gl_FragColor = vec4(col, tex.a);
}
