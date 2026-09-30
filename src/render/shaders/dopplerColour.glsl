// Chunk `lightspeed_dopplercolour`: the recolouring of diffuse light by a Doppler factor, shared by the relativistic
// remap (remap.frag.glsl) and the lens passes (lensComposite.frag.glsl, lensBand.frag.glsl), so that both apply the
// same spectral model to surfaces and mixed starlight.
//
// What: dopplerRgb turns a colour seen with Doppler factor D = e^lnD into the colour of the same light shifted
// (I′_λ = D⁵ I_λ(λD), split into a bounded colour matrix per D: physics/dopplerColor.ts builds the table);
// lnDopplerShip is ln D of light seen in a ship-frame direction; expBrightness the exponential of a log-brightness,
// cut to 0 far below display precision.
//
// How: the table is a float texture of 3 rows (the matrix's rows) and one column per ln D, read with texelFetch
// and blended between the two nearest columns by hand (float textures are not filterable everywhere; taking the
// nearest column alone leaves steps of 0.007 in ln D, rings across the sky and jumps of colour up to 11 % on a
// saturated red). texelFetch rather than a filtered read: the values are the same at the texel centres, and the
// lens band's sub-ray loop may not hold reads that need screen-space derivatives.
//
// Rules: includes nothing; declares only the table's two uniforms.
//
// Cost: six fetches and three dot products a call.
//
// Twin: physics/dopplerColor.ts (buildDopplerLut and the same interpolation).
uniform sampler2D uDopplerLut;
uniform vec3 uDopplerLutRange; // ln D min, ln D max, table size

// The colour matrix for ln D, blended between the two nearest table columns.
vec3 dopplerRgb(vec3 c, float lnD) {
  float n = uDopplerLutRange.z;
  float x = clamp((lnD - uDopplerLutRange.x) / (uDopplerLutRange.y - uDopplerLutRange.x), 0.0, 1.0) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  float f = x - i0;
  int c0 = int(i0);
  vec3 r0 = mix(texelFetch(uDopplerLut, ivec2(c0, 0), 0).rgb, texelFetch(uDopplerLut, ivec2(c0 + 1, 0), 0).rgb, f);
  vec3 r1 = mix(texelFetch(uDopplerLut, ivec2(c0, 1), 0).rgb, texelFetch(uDopplerLut, ivec2(c0 + 1, 1), 0).rgb, f);
  vec3 r2 = mix(texelFetch(uDopplerLut, ivec2(c0, 2), 0).rgb, texelFetch(uDopplerLut, ivec2(c0 + 1, 2), 0).rgb, f);
  return max(vec3(dot(r0, c), dot(r1, c), dot(r2, c)), 0.0);
}

// ln D for a ship-frame direction d seen moving along v with e^±φ: −ln(e^−φ cos²(θ/2) + e^φ sin²(θ/2)).
float lnDopplerShip(vec3 d, vec3 v, float ePhi, float emPhi) {
  vec3 a = d - v;
  vec3 b = d + v;
  return -log(0.25 * (emPhi * dot(b, b) + ePhi * dot(a, a)));
}

// exp of a log-brightness, cut to exactly zero far below display precision.
float expBrightness(float lnB) {
  return lnB < -60.0 ? 0.0 : exp(min(lnB, 12.0));
}
