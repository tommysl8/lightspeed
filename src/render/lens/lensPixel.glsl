// Chunk `lightspeed_lenspixel`: one ray of the per-pixel lens of diffuse light, shared by the lens box's composite
// (shaders/lensComposite.frag.glsl, one ray a pixel) and the photon ring's band (shaders/lensBand.frag.glsl, several
// sub-rays a pixel), so the two draw exactly the same light.
//
// What: given a look direction in the lens frame (the pixel's own, or a band sub-ray's), where its
// light came from (lensRay), where that source is seen by this half's observer unlensed (the frame boost undone, then
// the observer's own aberration), and its light: read from the Galaxy layer's targets at that point of the screen
// when it is on it (inside the half's drawn columns, one coarse texel in), else from the hole's sky cube when it is
// built, else nothing. The targets hold flux per pixel, whose kernel is fixed in pixels, so the particles' light is
// scaled by cos³θ_P / cos³θ_source (θ from the view's axis; a cube face's own cos³θ_face for the cube), the glow's is
// not (a constant angular kernel: radiance); then it is recoloured for the shift between the source's unlensed
// direction and the pixel's, with the observer's gravitational blueshift (only if that is over the Doppler skip),
// with the remap's spectral model (approximate for mixed starlight: labelled; stars stay exact). No magnification:
// surface brightness is conserved once those factors are applied. The result is flux in the targets' units, to go
// through the Galaxy layer's display law (lightspeed_galaxycomposite).
//
// Also the debug skies of dev/lensTest.ts (uLensDebug 1–4: the reference pictures' checkerboard, the escape
// direction, ln(ν_obs/ν_∞), a uniform-radiance sky).
//
// Rules: include after lightspeed_relativity, lightspeed_dopplercolour, lightspeed_galaxycomposite, lightspeed_lens
// and lightspeed_flowlookup (it uses theirs and declares only the uniforms below). Reads only texelFetch and
// textureLod, never a filtered read that needs screen-space derivatives (the band calls it in a loop).
//
// Cost: the lens (a table read and a rotation), two boosts when the view moves, three target reads (or two cube
// reads), a recolour only when the shift passes the skip.
//
// Twins: render/lens/lensComposite.ts (its uniforms), physics/lensMirror32.ts (the lens's arithmetic).

uniform sampler2D uGalaxy;        // the Galaxy layer's small splats (flux per pixel), ¼ resolution
uniform sampler2D uGalaxyBig;     // its large splats (normal view) or the glow (a half of the split view), ⅛
uniform sampler2D uGalaxyGlow;    // the glow on its own (normal view with a lens), ⅛; black otherwise
uniform float uGalaxyBigIsGlow;   // 1 when uGalaxyBig holds the glow
uniform float uMipmaps;           // 1 while the targets carry mipmaps (within 3,000 M)
uniform vec2 uColumns;            // the half's drawn columns, NDC x (its own and the box's)
uniform samplerCube uSkyCube;     // the hole's sky cube: the particles at rest in the hole frame, 512 px
uniform samplerCube uSkyCubeGlow; // and the glow, 128 px
uniform float uSkyCubeLive;       // 1 while the cube is built and fresh
uniform vec2 uCubeTexel;          // the particle and glow cubes' texel angles, rad
uniform mat4 uViewProj;           // projection × view (rotation only: the camera is at the origin)
uniform vec3 uViewFwd;            // the view's forward axis, world (unit)
uniform float uPixelAngle;        // a device pixel's angle at the screen's centre, rad
uniform vec2 uTargetPx;           // the screen in device px (margins)
uniform float uDopplerSkip;       // |Δ ln ν| below which nothing is recoloured (1e-4; 1e-2 at rung 2)
uniform float uLensDebug;         // 0 normal; 1–4 the debug skies

// ln of the visual luminance of a blackbody at e^lnT relative to 5,772 K: blackbodyLn(lnT).a read with texelFetch
// (the same table and interpolation), so that it may be used in a loop.
float lensLnY(float lnT) {
  float lo = uBbRange.x;
  float hi = uBbRange.y;
  float n = uBbRange.z;
  float x = (clamp(lnT, lo, hi) - lo) / (hi - lo) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  int c = int(i0);
  float r = mix(texelFetch(uBlackbody, ivec2(c, 0), 0).a, texelFetch(uBlackbody, ivec2(c + 1, 0), 0).a, x - i0);
  if (lnT > hi) r += lnT - hi;
  else if (lnT < lo) r = max(r - uBbRange.w * (exp(min(-lnT, 60.0)) - exp(-lo)), LN_Y_FLOOR);
  return r;
}

// Flux (rgb, and the model's share of its luminance in a) seen shifted by e^delta: the remap's spectral model.
vec4 lensRecolour(vec4 t, float delta) {
  if (abs(delta) < uDopplerSkip) return t;
  float f = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = dopplerRgb(t.rgb, delta) * exp(min(lensLnY(LN_T_SUN + delta), 40.0));
  float f2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return vec4(c, f > 0.0 ? t.a * (f2 / f) : 0.0);
}

// The debug skies' colour of light from direction n (world axes, at infinity): 1 the reference pictures'
// checkerboard (render_views.py: 15° cells coloured by octant, lines every 30°), 2 the direction itself.
vec3 lensDebugSky(vec3 n) {
  vec3 col = n * 0.5 + 0.5;
  if (uLensDebug < 1.5) {
    float lat = degrees(lensAsin(clamp(n.z, -1.0, 1.0)));
    float lon = degrees(lensAtan(n.y, n.x));
    float cell = mod(floor(lat / 15.0) + floor(lon / 15.0), 2.0);
    // The palette by octant (x > 0: +1, y > 0: +2, z > 0: +4), as render_views.py has it.
    vec3 lo = n.x > 0.0 ? (n.y > 0.0 ? vec3(70.0, 150.0, 220.0) : vec3(240.0, 180.0, 60.0)) : (n.y > 0.0 ? vec3(90.0, 180.0, 90.0) : vec3(230.0, 90.0, 80.0));
    vec3 hi = n.x > 0.0 ? (n.y > 0.0 ? vec3(150.0, 120.0, 90.0) : vec3(120.0, 200.0, 200.0)) : (n.y > 0.0 ? vec3(220.0, 220.0, 220.0) : vec3(200.0, 110.0, 200.0));
    vec3 pal = n.z > 0.0 ? hi : lo;
    bool line = abs(mod(lat + 15.0, 30.0) - 15.0) < 0.6 || abs(mod(lon + 15.0, 30.0) - 15.0) < 0.6;
    col = line ? vec3(1.0) : pal * (0.55 + 0.45 * cell) / 255.0;
  }
  return col;
}

// ln ν_obs/ν_∞ in false colour (debug sky 3): blue (−1.5) … white (0) … red (+1.5).
vec3 lensDebugShift(float lnG) {
  float z = clamp(lnG / 1.5, -1.0, 1.0);
  return vec3(z > 0.0 ? 1.0 : 1.0 + z, 1.0 - abs(z), z < 0.0 ? 1.0 : 1.0 - z);
}

// What the Galaxy targets hold at uv (particles in the first, glows in the second), at mip levels lod and lodBig; in
// the uniform-radiance debug sky (4) a uniform sky drawn with the targets' own conventions instead: the particles'
// flux per pixel cos³θ (θ from the view's axis at that point), the glow 1.
void lensTargets(vec2 uv, float lod, float lodBig, float cosAt, out vec4 particles, out vec4 glows) {
  if (uLensDebug > 3.5) {
    particles = vec4(vec3(cosAt * cosAt * cosAt), 0.0);
    glows = vec4(1.0, 1.0, 1.0, 0.0);
    return;
  }
  vec4 small = textureLod(uGalaxy, uv, lod);
  vec4 big = textureLod(uGalaxyBig, uv, lodBig);
  vec4 glow = textureLod(uGalaxyGlow, uv, lodBig);
  particles = uGalaxyBigIsGlow > 0.5 ? small : small + big;
  glows = uGalaxyBigIsGlow > 0.5 ? glow + big : glow;
}

// The light of an escaping ray whose source direction (hole frame, at infinity) is nInf: read where that source is
// seen by this half's observer unlensed (the frame boost undone, then its own aberration), from the Galaxy targets
// when that is on the drawn columns (one coarse texel in), else from the hole's sky cube when it is built, else
// nothing; with the surface-brightness factors, and recoloured by the shift between the pixel and the source.
vec4 lensSkyFlux(vec3 dView, vec3 nInf, vec2 jac, float lnDpix, float lnDfPix, float lnG, vec2 footLens) {
  float lnDfSrc = 0.0;
  vec3 nS = frameUnaberrate(nInf, lnDfSrc);
  float lnDsrc = 0.0;
  vec3 nV = uPhi > 0.0 ? lensBoost(nS, uVelDir, uEPhi, uEmPhi, lnDsrc) : nS;
  // The ray's footprint on the source sphere (its radial and tangential widths, stretched by the lens), and the
  // surface-brightness factor's pixel side.
  float foot = max(footLens.x * jac.x, footLens.y * jac.y);
  float cP = max(dot(dView, uViewFwd), 1e-3);
  vec4 clip = uViewProj * vec4(nV, 0.0);
  vec2 ndc = clip.xy / max(clip.w, 1e-30);
  vec2 margin = 16.0 / uTargetPx; // one coarse texel (8 device px), in NDC
  float delta = 0.0;
  vec4 particles = vec4(0.0);
  vec4 glows = vec4(0.0);
  vec4 flux = vec4(0.0);
  if (clip.w > 0.0 && ndc.x > uColumns.x + margin.x && ndc.x < uColumns.y - margin.x && abs(ndc.y) < 1.0 - margin.y) {
    vec2 uv = ndc * 0.5 + 0.5;
    float lod = uMipmaps > 0.5 ? log2(max(1.0, foot * exp(-lnDsrc) / (4.0 * uPixelAngle))) : 0.0;
    float cN = max(dot(nV, uViewFwd), 1e-3);
    lensTargets(uv, lod, max(lod - 1.0, 0.0), cN, particles, glows);
    float k = cP / cN;
    flux = particles * (k * k * k) + glows;
    delta = (lnDpix - lnDsrc) + (lnDfSrc - lnDfPix) + lnG;
    // The uniform debug sky's targets hold the sky at rest, not the view's shifted light: recolour from rest, as the cube.
    if (uLensDebug > 3.5) delta = lnDpix - lnDfPix + lnG;
  } else if (uSkyCubeLive > 0.5) {
    // The cube: the unlensed sky at rest in the hole frame, exposure 0; its faces' own pinhole factor.
    vec3 an = abs(nInf);
    float cf = max(max(an.x, an.y), an.z);
    if (uLensDebug > 3.5) {
      particles = vec4(vec3(cf * cf * cf), 0.0) * exp(-uLnExposure);
      glows = vec4(1.0, 1.0, 1.0, 0.0) * exp(-uLnExposure);
    } else {
      particles = textureLod(uSkyCube, nInf, log2(max(foot / uCubeTexel.x, 1.0)));
      glows = textureLod(uSkyCubeGlow, nInf, log2(max(foot / uCubeTexel.y, 1.0)));
    }
    float k = cP / cf;
    flux = (particles * (k * k * k) + glows) * exp(uLnExposure);
    delta = lnDpix - lnDfPix + lnG;
  }
  return lensRecolour(flux, delta);
}

// One ray: dView the pixel's (or sub-ray's) direction as this half's observer sees it; d the same in the lens frame;
// lnDpix = ln(ν_view/ν_frame) and lnDfPix = ln(ν_hole/ν_S) of its light (from relUnaberrateLens and frameAberrate);
// footLens the lens-frame widths of what this ray stands for, along the meridian through the hole and across it (a
// pixel: its angle times e^lnDpix both ways; a band stratum: the stratum's width, and the pixel's). Returns the flux
// in the targets' units (or, in debug skies 1–3, its colour with a = 1), false when captured; lnG the observer's shift
// of light from far away along it and g its gap to the edge (both for the flow). One exit, every variable set on every
// path (FXC warns otherwise).
bool lensSourceFlux(vec3 dView, vec3 d, float lnDpix, float lnDfPix, vec2 footLens, out vec4 flux, out float lnG, out float g) {
  flux = vec4(0.0);
  vec3 nInf;
  vec2 jac;
  bool esc = lensRayGap(d, nInf, jac, lnG, g);
  if (esc) {
    if (uLensDebug > 0.5 && uLensDebug < 3.5) flux = uLensDebug < 2.5 ? vec4(lensDebugSky(nInf), 1.0) : vec4(lensDebugShift(lnDpix + lnG), 1.0);
    else flux = lensSkyFlux(dView, nInf, jac, lnDpix, lnDfPix, lnG, footLens);
  }
  return esc;
}

// The same light from the pixel's own position (outside the diffuse zone, where the lens moves it under 0.5 px),
// shifted only by the observer's gravitational blueshift. cP: the pixel's cos θ from the view's axis.
vec4 lensOwnFlux(vec2 uv, float cP, float lnG) {
  vec4 particles;
  vec4 glows;
  lensTargets(uv, 0.0, 0.0, cP, particles, glows);
  return lensRecolour(particles + glows, lnG);
}

// The accretion flow along a lens-frame direction d (captured or not) whose gap to the edge is g (from its own lens
// ray: lensSourceFlux), with the pixel's own shift lnDpix, in displayed radiance (the exposure applied here): the flow
// map read through lightspeed_flowlookup. The azimuth takes the built-in atan: its error, about 1e-5 rad, is a
// ten-thousandth of the map's column (2π/64), where the lens's own angles need lensAtan's 2 ulp.
vec3 lensFlowAtGap(vec3 d, float g, float lnDpix, float lnG) {
  if (uFlowOn < 0.5) return vec3(0.0);
  // the azimuth about the camera–hole axis from uFlowRef
  vec3 side = d - dot(d, uLensAxis) * uLensAxis;
  float omega = atan(dot(side, cross(uLensAxis, uFlowRef)), dot(side, uFlowRef));
  if (omega < 0.0) omega += LENS_TWO_PI;
  return flowRadiance(g, omega, lnDpix + lnG) * exp(uLnExposure);
}
// The same where the ray's gap is not known yet.
vec3 lensFlow(vec3 d, float lnDpix, float lnG) {
  if (uFlowOn < 0.5) return vec3(0.0);
  return lensFlowAtGap(d, lensGap(d), lnDpix, lnG);
}
