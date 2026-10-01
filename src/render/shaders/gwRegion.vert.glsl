// Where the mergers heard in gravitational waves probably happened (scene/DeepSky.tsx): each a soft region, not a
// point, drawn as REGION_SPRITES soft discs along its line of sight from the near end of its distance's 90 % interval
// to the far end, each as wide as the 90 % sky region is at its distance: together a cone's frustum, the shape of
// such a region. They take part in the expansion like the galaxies (cosmicWeb.vert.glsl): at a × their comoving place,
// and with light-delayed positions on where they were when the waves now arriving left them. A disc shows while it is a
// few to a hundred pixels across, the selected one to 250 (wider would outgrow the largest point many GPUs draw); twin of
// sim/deepsky/markers.ts (regionAlpha). `position` is the region's direction (a unit vector, world axes).
#include <common>
#include <logdepthbuf_pars_vertex>
#include <lightspeed_relativity>

attribute float aT;       // where along the distance range, 0 (near end) to 1 (far end)
attribute vec2 aRange;    // the comoving distances of the near and far ends, Mpc
attribute float aTheta;   // the 90 % sky region's angular radius, rad
attribute float aKind;    // 0 black holes, 1 a black hole and a neutron star, 2 neutron stars

uniform vec3 uCamHi;
uniform vec3 uCamLo;
uniform float uPxPerRad;
uniform float uPixelRatio;
uniform float uOpacity;
uniform float uSelected;  // the selected merger's index, or −1
uniform float uSprites;   // sprites per merger

uniform float uAm1;
uniform float uAObs;
uniform vec3 uAnchorObs;
uniform float uRetarded;
uniform float uSkyOn;

//#emission

varying float vAlpha;
varying float vKind;
varying float vSelected;

const float REGION_FROM_PX = 3.0;
const float REGION_FULL_PX = 10.0;
const float REGION_BIG_FROM_PX = 40.0;
const float REGION_BIG_GONE_PX = 70.0;
const float REGION_SELECTED_FROM_PX = 150.0;
const float REGION_GONE_PX = 250.0;
/** Each disc's strength at full: faint, so the overlapping discs read as one soft glow. */
const float DISC_ALPHA = 0.03;

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vAlpha = 0.0;
}

void main() {
  float dc = mix(aRange.x, aRange.y, aT);
  vec3 p = position * dc;
  vec3 rel = (p - uCamHi) - uCamLo + uAm1 * p;
  vec3 sep = p - uAnchorObs;
  float chi = length(sep);
  if (uSkyOn > 0.5 && chi > 1e-6) {
    float L = emissionLn1pZ(chi);
    if (L > 1e29) {
      cull();
      return;
    }
    if (uRetarded > 0.5) rel -= (uAObs * (1.0 - exp(-L))) * sep;
  }
  float d = max(length(rel), 1e-9);
  // The region is comoving: across the sky it is a (the scale factor) times its size at the present.
  float r = (1.0 + uAm1) * dc * sin(aTheta);
  if (d <= r) {
    cull(); // inside it: all round the view, nothing to draw
    return;
  }
  float rPx = r / d * uPxPerRad;
  float selected = abs(floor(float(gl_VertexID) / uSprites + 0.001) - uSelected) < 0.5 ? 1.0 : 0.0;
  // The ends of the range a little fainter: the distance is most probably near its middle.
  float w = 0.55 + 0.45 * (1.0 - abs(2.0 * aT - 1.0));
  float big = selected > 0.5 ? smoothstep(REGION_SELECTED_FROM_PX, REGION_GONE_PX, rPx) : smoothstep(REGION_BIG_FROM_PX, REGION_BIG_GONE_PX, rPx);
  float a = smoothstep(REGION_FROM_PX, REGION_FULL_PX, rPx) * (1.0 - big);
  a *= DISC_ALPHA * w * (selected > 0.5 ? 2.5 : 1.0) * uOpacity;
  if (a <= 0.0005) {
    cull();
    return;
  }
  float lnD;
  vec3 dShip = relAberrate(rel / d, lnD);
  float half_ = min(rPx * exp(-lnD), REGION_GONE_PX);
  vKind = aKind;
  vSelected = selected;
  vAlpha = a;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * dShip, 1.0);
  gl_PointSize = 2.0 * half_ * uPixelRatio;
  #include <logdepthbuf_vertex>
}
