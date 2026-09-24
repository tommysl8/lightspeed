#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform float uHasMap;
uniform sampler2D uNight;
uniform float uHasNight;
uniform sampler2D uClouds;
uniform float uHasClouds;
uniform vec3 uBaseColor;
uniform float uBanded;       // procedural fallback: gas-giant bands
uniform vec3 uSunView;       // Sun position in view space, km
uniform float uSunIntensity;
uniform vec3 uSunColor;
uniform vec3 uAtmoColor;
uniform float uAtmoStrength;
uniform float uLonOffset;    // texture longitude offset (fraction of a turn)
uniform float uFillBlack;    // fill unimaged (black) map regions procedurally (Pluto)
uniform float uAmbient;
uniform float uFlat;         // plain colour, no procedural noise (spacecraft parts)

// Saturn's rings casting a shadow on the planet
uniform float uRingShadow;
uniform sampler2D uRingMap;
uniform vec3 uRingNormalV;   // ring-plane normal in view space
uniform vec3 uCenterV;       // planet centre in view space
uniform float uRingInner;    // km (displayed scale)
uniform float uRingOuter;

varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

vec3 proceduralSurface(vec2 uv) {
  float lat = (uv.y - 0.5) * PI;
  if (uBanded > 0.5) {
    float bands = sin(lat * 14.0 + noise(uv * vec2(8.0, 40.0)) * 1.5) * 0.5 + 0.5;
    return uBaseColor * (0.82 + 0.28 * bands);
  }
  float n = noise(uv * vec2(64.0, 32.0)) * 0.6 + noise(uv * vec2(256.0, 128.0)) * 0.4;
  return uBaseColor * (0.8 + 0.35 * n);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vPosV);
  vec3 L = normalize(uSunView - vPosV);
  float NdL = dot(N, L);

  vec2 uv = vec2(fract(vUv.x + uLonOffset), vUv.y);
  vec3 albedo = uFlat > 0.5 ? uBaseColor : proceduralSurface(uv);
  if (uHasMap > 0.5) {
    vec3 tex = texture2D(uMap, uv).rgb;
    if (uFillBlack > 0.5) {
      float lum = dot(tex, vec3(0.2126, 0.7152, 0.0722));
      albedo = mix(albedo, tex, smoothstep(0.004, 0.03, lum));
    } else {
      albedo = tex;
    }
  }

  // Lambert with a slightly softened terminator.
  float diffuse = smoothstep(-0.02, 0.12, NdL) * max(NdL, 0.0) + 0.002 * smoothstep(-0.1, 0.1, NdL);

  // Ring shadow: does the ray toward the Sun cross the ring plane within the rings?
  float shadow = 1.0;
  if (uRingShadow > 0.5) {
    float denom = dot(L, uRingNormalV);
    if (abs(denom) > 1e-4) {
      float t = dot(uCenterV - vPosV, uRingNormalV) / denom;
      if (t > 0.0) {
        vec3 hit = vPosV + L * t;
        float r = length(hit - uCenterV);
        float u = (r - uRingInner) / (uRingOuter - uRingInner);
        if (u > 0.0 && u < 1.0) shadow = 1.0 - 0.92 * texture2D(uRingMap, vec2(u, 0.5)).a;
      }
    }
  }

  vec3 col = albedo * uSunColor * uSunIntensity * diffuse * shadow;

  if (uHasClouds > 0.5) {
    float cloud = texture2D(uClouds, uv).r;
    col = mix(col, uSunColor * uSunIntensity * diffuse * shadow * 0.95, cloud * 0.85);
    if (uHasNight > 0.5) {
      vec3 lights = texture2D(uNight, uv).rgb;
      col += lights * (1.0 - cloud) * smoothstep(0.05, -0.18, NdL) * 1.4;
    }
  } else if (uHasNight > 0.5) {
    col += texture2D(uNight, uv).rgb * smoothstep(0.05, -0.18, NdL) * 1.4;
  }

  // Atmospheric rim on the lit side.
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uAtmoColor * uAtmoStrength * rim * smoothstep(-0.25, 0.35, NdL) * uSunIntensity;

  col += albedo * uAmbient;
  gl_FragColor = vec4(col, 1.0);
}
