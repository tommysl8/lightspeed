#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uSunColor;   // 5772 K blackbody colour (luminance 1)
uniform float uIntensity;

varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vPosV);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  // Limb darkening, I(mu)/I(1) = 1 - u (1 - mu), with u depending on wavelength: about 0.8 in
  // blue down to 0.5 in red (approximating Neckel & Labs 1994). That is also why the limb looks
  // redder.
  vec3 u = vec3(0.52, 0.64, 0.8);
  vec3 limb = 1.0 - u * (1.0 - mu);
  float gran = 1.0;
  if (uHasMap > 0.5) {
    // Granulation contrast relative to the map's mean (its smallest mip level).
    const vec3 W = vec3(0.2126, 0.7152, 0.0722);
    float lum = dot(texture2D(uMap, vUv).rgb, W);
    float avg = dot(textureLod(uMap, vUv, 11.0).rgb, W);
    // The map's large-scale blotches are artistic, not photospheric, so keep only a hint.
    gran = clamp(1.0 + 0.22 * (lum / max(avg, 1e-3) - 1.0), 0.8, 1.2);
  }
  gl_FragColor = vec4(uSunColor * uIntensity * limb * gran, 1.0);
}
