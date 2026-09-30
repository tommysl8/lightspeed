// Chunk `lightspeed_flowlookup`: Sagittarius A*'s accretion flow at one ray of the lens passes.
//
// What (docs/data/blackholes.md §7): the lens box's composite and the photon ring's band (lensComposite.frag.glsl,
// lensBand.frag.glsl, through render/lens/lensPixel.glsl lensFlow) have found, for their ray, the gap to the shadow's
// edge (g = α − α_edge in the lens frame, negative inside the edge) and the azimuth ω about the camera–hole axis
// from uFlowRef. flowRadiance reads the flow map there (render/flow/flowMap.ts: rows in the forward table's
// variable s = ln g + 3g, uniform on each side of the edge, columns uniform in ω; hardware bilinear filtering of the
// half-float map, repeating in ω, never across the edge) and returns what the ray adds, before the exposure the
// caller multiplies it by: in visible light the map's intensity at infinity times the ray's own frequency factor k
// to the power 3 − α (k = e^lnK: the observer's blueshift of light from far away and the view's Doppler factor; a
// power law's colour is the same at any shift), shown with the law of the diffuse sky round it (uFlowGain.y = 1: the
// Galaxy layer's √ of the light in a faint star's image, so its gain carries e^(−E/2) for the caller's e^E) or, for
// comparison, as a surface of the Sun's calibration (uFlowGain.y = 0: radiance 8 is the Sun's disc); at 1.3 mm the
// brightness temperature the ray brings at 230 GHz, I(ν) = k³ I_∞(ν/k) from the map's three frequencies (log-log), in
// false colour at a fixed brightness (not light: its gain carries e^−E). Both are faded in by the flow's share of the
// picture as its point fades out (1 − pointShare, in the gains).
//
// Rules: includes nothing, declares only the flow's uniforms (flowUniforms, shared by reference) and uses no other.
//
// Cost: one filtered read a ray, a logarithm, an exponential and a square root; nothing where uFlowOn is 0.
//
// Twins: render/flow/flowMap.ts (the rows' variable, buildFlowRows; the gains), render/flow/flowRay.ts (a texel's ray).

uniform float uFlowOn;          // 1 while the resolved flow is drawn
uniform sampler2D uFlowMap;     // the flow map (RGBA16F, lens frame): visible I_∞ in r; at 1.3 mm T_b at 150, 230, 345 GHz
uniform vec4 uFlowMapAxes;      // rows: (s at the first row outside the edge, 1/Δs there, s at row 0 (the axis), 1/Δs inside)
uniform vec4 uFlowMapSize;      // (rows, columns, rows inside the edge, the outer gap: beyond it no ray reaches the flow)
uniform vec3 uFlowRef;          // unit vector ⟂ the camera–hole axis from which ω is measured (lens frame, world axes)
uniform float uFlowBand;        // 0 visible light, 1 the 1.3 mm false colour
uniform sampler2D uFlowFalseColour; // 256 × 1: black, red, yellow, white for T_b from 0 to 6e10 K
uniform vec4 uFlowGain;         // (visible gain, law (0 surface, 1 the sky's √), the false colour's gain, 0): fades and exposure in
uniform vec3 uFlowColour;       // the power law's linear-sRGB colour, luminance 1 (B − V = +0.24)

// The map's row (a fractional texel index) of a signed gap, clamped to its own side of the edge.
float flowRowOf(float gSigned) {
  if (gSigned > 0.0) {
    float s = log(gSigned) + 3.0 * gSigned;
    return clamp(uFlowMapSize.z + (s - uFlowMapAxes.x) * uFlowMapAxes.y, uFlowMapSize.z, uFlowMapSize.x - 1.0);
  }
  float gp = max(-gSigned, 1e-30);
  float s = log(gp) + 3.0 * gp;
  return clamp((uFlowMapAxes.z - s) * uFlowMapAxes.w, 0.0, uFlowMapSize.z - 1.0);
}

vec3 flowRadiance(float gSigned, float omega, float lnK) {
  if (uFlowOn < 0.5 || gSigned > uFlowMapSize.w) return vec3(0.0);
  vec2 uv = vec2(omega * 0.1591549431, (flowRowOf(gSigned) + 0.5) / uFlowMapSize.x);
  vec4 m = textureLod(uFlowMap, uv, 0.0);
  if (uFlowBand < 0.5) {
    // I_∞ × k^(3 − α), α = −0.5
    float i = m.r * exp(min(3.5 * lnK, 80.0));
    return uFlowColour * (uFlowGain.y < 0.5 ? i * uFlowGain.x : uFlowGain.x * sqrt(i));
  }
  // ln of I_∞ at 150, 230 and 345 GHz relative to 230 GHz's scale: ln T + 2 ln(ν/230 GHz)
  float l0 = log(max(m.r, 1e-30)) - 0.8548880;
  float l1 = log(max(m.g, 1e-30));
  float l2 = log(max(m.b, 1e-30)) + 0.8109302;
  // at 230 GHz / k: ln ν relative to 230 GHz is −lnK (log-log between the three, the end segments carried on)
  float x = -lnK;
  float lnI = x < 0.0 ? l1 + (l1 - l0) * (x / 0.4274440) : l1 + (l2 - l1) * (x / 0.4054651);
  float t = exp(min(3.0 * lnK + lnI, 80.0));
  vec3 c = textureLod(uFlowFalseColour, vec2(clamp(t / 6.0, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0).rgb;
  return c * uFlowGain.z;
}
