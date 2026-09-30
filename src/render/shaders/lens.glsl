// Chunk `lightspeed_lens`: the gravitational lens of one Schwarzschild black hole, per pixel and per vertex.
//
// What: for the one hole that matters (render/lens/lensState.ts), the whole lens is the sweep Δφ(α) of a
// backward ray against its look angle α from the hole, for the observer's radius and frame (the static,
// hovering observer; or the raindrop falling from rest far away, only during a fall below r = 3M). The CPU
// builds it each time r changes as a table of the deflection δ(α) = Δφ − (π − α) in s = ln g + 3g,
// g = α − α_edge (physics/schwarzschildTables.ts), and an inverse table (the image angle for a wanted sweep).
// lensRay turns a pixel's ray into the direction its light came from (diffuse light: the Galaxy's targets,
// the sky cube, the Milky Way and the CMB); lensImage turns a source's position into the directions of its
// images (point sources: stars, the cosmic web, the guides); frameAberrate and frameUnaberrate conjugate the
// lens by the boost from the Sun's frame to the hole's.
//
// How, per pixel (lensRay): the gap g from the edge from chords (lensGap), δ and dδ/dα by Catmull–Rom in s from
// four texelFetch reads (lensDelta, exactly forwardEval's arithmetic), the look direction rotated towards the
// hole by δ, the Jacobian (|dΔφ/dα|, |sin Δφ / sin α|) and ln g. Per vertex (lensImage, tier 1, exactly
// physics/lensPoint.ts pointImageTier1's arithmetic): the source's angle γ at the hole, the sweep D_k of the
// wanted order, then 0, 1 or 3 fixed-point passes through the inverse table with the flat parallax Λ = asin(b/r_s)
// when r_o/r_s < 0.05, else up to 4 Newton steps on Δφ(α) − Λ(b(α)) = D_k with the rescaled first-order orbit's
// parallax; the magnification from the same factors, capped near every caustic by the source's own disc through
// Gould's B0(z)/z (texture uLensB0Z) so that ln(μB0) stays finite at exact alignment.
//
// Rules: this chunk includes nothing and declares only the lens uniforms below (the lensUniforms object,
// shared by reference); include it after lightspeed_relativity, or wherever the shader already has what it
// needs; functions that need the ship's motion or ln Y take them as arguments; uImageOrder belongs to the
// shaders that draw several orders, never to this chunk. No acos, no asin, no built-in atan (this GPU's is
// the Abramowitz–Stegun polynomial: atan(1e-3, 1)·1e3 = 0.999866 measured in Chrome on the target laptop):
// angles from chords with lensAtan, small angles through lensSin and lensCosM1, anything that cancels
// (1 − 2/r, 1 − v, α_edge, π − α_edge) from float64 as a uniform. Tables are read with texelFetch and
// Catmull–Rom or Hermite, never the hardware filter (R32F is not filterable without an extension phones lack);
// every loop has a constant bound of at most 4. With uLensOn < 0.5 every lens function returns its input: the
// direction unchanged, μ = 1, ln g = 0, and only an order-0 image.
//
// Why float64 tables and float32 arithmetic: one table a frame is the whole lens for every pixel and every
// vertex; storing δ rather than Δφ spends float32's relative precision where δ is small, far from the hole.
// Measured against the float32 mirror with this GPU's error model: ≤ 0.005 device px of equivalent look angle.
//
// Cost: per pixel inside the lens zone, one angle, four fetches and a rotation (about 0.43 ns a pixel on the
// target laptop); per vertex, a few fetches (0 passes) up to about 30 (Newton near the hole). Nothing far
// from holes, where the vertex layers draw their plain programs and the fragment passes see uLensOn = 0.
//
// Twins: physics/schwarzschildTables.ts (forwardEval, inverseEval, buildMuBound, muBoundEval),
// physics/lensPoint.ts (pointImageTier1, starRadiusRsun, fillB0OverZ), and the float32 mirror
// physics/lensMirror32.ts, line for line.

uniform float uLensOn;        // 1: a lens is drawn this frame
uniform vec3  uLensHole;      // camera → hole, world axes, units of M, from float64
uniform vec3  uLensAxis;      // unit camera → hole, world axes, hole frame
uniform float uLensRo;        // r, units of M
uniform float uLensEdge;      // α_edge, rad: shadow (static) or dark-region (rain) radius, from float64
uniform float uLensSpan;      // π − α_edge, rad, from float64 (used when α_edge > π/2, and near α = π)
uniform float uLensFrame;     // 0 the static observer, 1 the raindrop
uniform float uLensLnG;       // static: −½ ln(1 − 2/r)
uniform vec2  uLensRain;      // rain: (v = √(2/r), 1 − v), from float64
uniform vec4  uLensFwd;       // forward table: (s0, 1/Δs, n, κ)
uniform highp sampler2D uLensFwdTab;  // R32F (n + 2) × 1, NEAREST: δ at nodes −1 … n (texel i = node i − 1)
uniform vec4  uLensInv;       // inverse row 0: (z0, 1/Δz, n, 2θ_E)
uniform vec4  uLensInvRel;    // inverse row 1: (2π, 1/ΔD, n1, 0)
uniform highp sampler2D uLensInvTab;  // RG32F (n + 2) × 2: (y = ln(α − α_edge), m = −ln|dΔφ/dα|)
uniform float uLensPtCos;     // cos of the point zone's source-angle radius (1: no vertex is lensed)
uniform float uLensDiffCos;   // cos of the diffuse zone's image-angle radius, lens frame (1: nothing resampled)
uniform vec4  uLensMuBound[4];// ln|μ₀| bound at 16 nodes in ln ψ (the vertex pre-cull)
uniform vec2  uLensMuBoundAxis; // (ln ψ_min, 1/Δ ln ψ) of those nodes
uniform vec4  uLensScale;     // units of M per (km, pc, kpc, Mpc)
uniform float uLensPxPerRad;  // device px per rad at the screen centre (thresholds, pass counts)
uniform highp sampler2D uLensB0Z;     // R32F 130 × 1: Gould's B0(z)/z at z = 0, 1/16, …, 8 (texel i + 1), ghosts
uniform vec4  uLensBox;       // per half: the lens box, NDC (x0, y0, x1, y1); (0, 0, 0, 0): empty
uniform vec3  uLensEdgeCentre;// per half: the edge circle's centre, view observer's frame, unit
uniform float uLensEdgeRadius;// per half: its radius, rad
uniform float uLensSsBandPx;  // per half: half-width of the band pass about the edge, device px (0: none)
uniform vec2  uLensBandChord2;// per half: the band's annulus as bounds on |d − edge centre|² (float64; (0, 0): none)
uniform vec3  uLensZoneCentre;// per half: the diffuse zone as a cone in the view observer's frame (unit centre)
uniform float uLensZoneCos;   //   and the cos of its radius
uniform float uFramePhi;      // rapidity of the S → hole-frame boost
uniform float uFrameEPhi;     // e^φ_f
uniform float uFrameEmPhi;    // e^−φ_f
uniform vec3  uFrameVelDir;   // the boost's unit direction, world axes

const float LENS_PI = 3.14159265359;
const float LENS_TWO_PI = 6.28318530718;
const float LENS_HALF_PI = 1.5707963268;
// Tier 1 uses the flat parallax below this impact parameter (units of M): physics/lensPoint.ts ORBIT_PARALLAX_MIN_B.
const float LENS_ORBIT_MIN_B = 30.0;
// The Sun's radius, km (lensStarRadiusM).
const float LENS_SUN_RADIUS_KM = 695700.0;

// Cephes atanf with full quadrant logic: about 2 ulp. Never the built-in.
float lensAtan(float y, float x) {
  float ax = abs(x);
  float ay = abs(y);
  bool big = ay > ax;
  // 1e-30, not a subnormal: D3D11 flushes those to 0, and atan(0, 0) would become 0/0.
  float t = big ? ax / max(ay, 1e-30) : ay / max(ax, 1e-30);
  float base = 0.0;
  if (t > 0.41421356) {
    base = 0.78539816;
    t = (t - 1.0) / (t + 1.0);
  }
  float z = t * t;
  float r = base + ((((0.0805374449538 * z - 0.138776856032) * z + 0.199777106478) * z - 0.333329491539) * z * t + t);
  r = big ? 1.5707963268 - r : r;
  r = x < 0.0 ? 3.14159265359 - r : r;
  return y < 0.0 ? -r : r;
}

// The angle between unit vectors, from the chords: 2 atan(|a − b|, |a + b|) (never acos of a dot product).
float lensAngle(vec3 a, vec3 b) {
  return 2.0 * lensAtan(length(a - b), length(a + b));
}

// Whether a view direction (this half's observer, unit) lies in the photon ring's band annulus, within (uLensSsBandPx
// + 1) pixel angles of the edge circle: the squared chord to the circle's centre between bounds worked out in float64
// (render/lens/lensState.ts setLensView), one dot product where the angle itself costs an arctangent. The band pass
// draws exactly these pixels and the box's composite leaves exactly these: the same expression in both.
bool lensInBand(vec3 dView) {
  vec3 dc = dView - uLensEdgeCentre;
  float c2 = dot(dc, dc);
  return c2 > uLensBandChord2.x && c2 < uLensBandChord2.y;
}

// sin x with relative accuracy: the series below 0.1 (this GPU's sin(1e-6)/1e-6 is 0.954).
float lensSin(float x) {
  if (abs(x) < 0.1) {
    float x2 = x * x;
    return x * (1.0 - x2 / 6.0 * (1.0 - x2 / 20.0 * (1.0 - x2 / 42.0)));
  }
  return sin(x);
}

// cos x − 1 = −2 sin²(x/2), without cancellation.
float lensCosM1(float x) {
  float s = lensSin(0.5 * x);
  return -2.0 * s * s;
}

// asin x through lensAtan (the built-in asin(1e-3)·1e3 is 1.065 here).
float lensAsin(float x) {
  return lensAtan(x, sqrt((1.0 - x) * (1.0 + x)));
}

// ln x (x > 0, a normal float) to about 1 ulp, without the built-in: x = m 2^e with m in [√½, √2),
// ln x = e ln 2 + 2 atanh((m − 1)/(m + 1)) by its series (|z| ≤ 0.172, five terms: 4e-10), ln 2 as hi + lo. This
// GPU's log is off by up to 1.7e-6 absolute, which through the table's variable s would move a pixel's source by
// up to 0.02 px where the raindrop's sky crowds, deep inside the horizon.
float lensLog(float x) {
  int bits = floatBitsToInt(x);
  int e = ((bits >> 23) & 255) - 127;
  float m = intBitsToFloat((bits & 8388607) | 1065353216);
  if (m > 1.41421356) {
    m *= 0.5;
    e += 1;
  }
  float z = (m - 1.0) / (m + 1.0);
  float z2 = z * z;
  float s = z * (2.0 + z2 * (0.6666666667 + z2 * (0.4 + z2 * (0.2857142857 + z2 * 0.2222222222))));
  return float(e) * 0.693145751953125 + (float(e) * 1.428606765330187e-6 + s);
}

// asinh x with relative accuracy near 0 (the series below 1e-2) and no overflow for |x| up to 1e18.
float lensAsinh(float x) {
  float ax = abs(x);
  float r = ax < 1e-2 ? ax * (1.0 - ax * ax / 6.0) : lensLog(ax + sqrt(ax * ax + 1.0));
  return x < 0.0 ? -r : r;
}

// Turns unit d about the unit axis v so that tan(θ′/2) = k tan(θ/2) (θ, θ′ the angles from v), keeping its
// azimuth; s2 and c2 are sin²(θ/2) and cos²(θ/2) of d. No trigonometry: with p = k sin(θ/2), q = cos(θ/2),
// sin θ′ = 2pq/(p² + q²) and cos θ′ = (q² − p²)/(p² + q²), accurate near θ′ = 0 and near θ′ = π alike. The part of d
// perpendicular to v comes from the shorter chord (d − v near v, d + v near −v), so it keeps its direction there.
vec3 lensTurnHalfAngle(vec3 d, vec3 v, float k, out float s2, out float c2) {
  vec3 a = d - v;
  vec3 b = d + v;
  s2 = dot(a, a);
  c2 = dot(b, b);
  float n = s2 + c2; // 4 for a unit vector
  s2 /= n;
  c2 /= n;
  vec3 chord = s2 <= c2 ? a : b;
  vec3 perp = chord - dot(chord, v) * v;
  float pl = length(perp);
  if (pl < 1e-30) return c2 >= s2 ? v : -v;
  float p = k * sqrt(s2);
  float q = sqrt(c2);
  float den = p * p + q * q;
  return ((q * q - p * p) / den) * v + (2.0 * p * q / (den * pl)) * perp;
}

// A boost's aberration of a photon direction (relAberrate's law, chords and half-angles): d seen from a frame
// moving with rapidity φ along velDir (tan(θ′/2) = e^−φ tan(θ/2)); lnD = ln(ν_moving/ν_rest) of that light.
vec3 lensBoost(vec3 d, vec3 velDir, float ePhi, float emPhi, out float lnD) {
  float s2;
  float c2;
  vec3 r = lensTurnHalfAngle(d, velDir, emPhi, s2, c2);
  lnD = log(ePhi * c2 + emPhi * s2);
  return r;
}
// Its inverse: a direction d′ seen from the moving frame back to the rest frame (tan(θ/2) = e^φ tan(θ′/2));
// lnD = ln(ν_moving/ν_rest) of that light, −ln(e^−φ cos²(θ′/2) + e^φ sin²(θ′/2)).
vec3 lensUnboost(vec3 d, vec3 velDir, float ePhi, float emPhi, out float lnD) {
  float s2;
  float c2;
  vec3 r = lensTurnHalfAngle(d, velDir, ePhi, s2, c2);
  lnD = -log(emPhi * c2 + ePhi * s2);
  return r;
}

// S → hole frame (uFrame*): the direction of light from dS as the hole frame sees it, and lnDf = ln(ν_hole/ν_S)
// of that light. The identity, with lnDf = 0, when there is no lens or no frame boost (Sgr A*, M87*, falls).
vec3 frameAberrate(vec3 dS, out float lnDf) {
  if (uLensOn < 0.5 || uFramePhi <= 0.0) {
    lnDf = 0.0;
    return dS;
  }
  return lensBoost(dS, uFrameVelDir, uFrameEPhi, uFrameEmPhi, lnDf);
}
// Hole frame → S: its inverse; lnDf is again ln(ν_hole/ν_S) of the same light (so a caller subtracts it).
vec3 frameUnaberrate(vec3 dH, out float lnDf) {
  if (uLensOn < 0.5 || uFramePhi <= 0.0) {
    lnDf = 0.0;
    return dH;
  }
  return lensUnboost(dH, uFrameVelDir, uFrameEPhi, uFrameEmPhi, lnDf);
}

// The view observer's frame → the frame it moves in (S, or during a fall the lens frame), for per-pixel passes;
// the caller passes its own uniforms. lnD = ln(ν_view/ν_frame) of the light seen in dView. At rest the identity.
vec3 relUnaberrateLens(vec3 dView, vec3 velDir, float ePhi, float emPhi, out float lnD) {
  if (ePhi <= 1.0) {
    lnD = 0.0;
    return dView;
  }
  return lensUnboost(dView, velDir, ePhi, emPhi, lnD);
}

float lensFwdTexel(int i) {
  return texelFetch(uLensFwdTab, ivec2(i, 0), 0).r;
}

// The forward table: δ(α) and dδ/dα at gap g > 0, c = span − g ≥ 0 (forwardEvalGap's arithmetic):
// Catmull–Rom in s = ln g + κg through texels i … i + 3 (nodes i − 1 … i + 2), linear in s below node 0. The node
// position x = (s − s0)/Δs is found from the nearer end of the table: in its upper half from the top node,
// s − s_top = ln(1 − c/span) − κc, so that the fraction t between nodes keeps its digits where g is of order 1 (a
// float near node 500 has steps of 3e-5 of a node; in a raindrop's crowded sky deep inside the horizon, where
// |dΔφ/dα| is 0.09, that alone would move a pixel's source by 0.02 px).
float lensDeltaGC(float g, float c, out float dDeltaDAlpha) {
  float n1 = uLensFwd.z - 1.0;
  float yTop = (lensLog(1.0 - c / uLensSpan) - uLensFwd.w * c) * uLensFwd.y;
  float delta;
  float dds;
  int i;
  float t;
  bool linear = false;
  float x = 0.0;
  if (yTop > -0.5 * n1) {
    float fy = floor(yTop);
    i = int(n1 + fy);
    t = yTop - fy;
    if (i > int(n1) - 1) {
      t += float(i - (int(n1) - 1));
      i = int(n1) - 1;
    }
  } else {
    x = (lensLog(g) + uLensFwd.w * g - uLensFwd.x) * uLensFwd.y;
    linear = x < 0.0;
    i = int(floor(x));
    t = x - float(i);
  }
  if (linear) {
    float q1 = lensFwdTexel(1);
    float q2 = lensFwdTexel(2);
    delta = q1 + (q2 - q1) * x;
    dds = (q2 - q1) * uLensFwd.y;
  } else {
    float p0 = lensFwdTexel(i);
    float p1 = lensFwdTexel(i + 1);
    float p2 = lensFwdTexel(i + 2);
    float p3 = lensFwdTexel(i + 3);
    float a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    float b = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3;
    float cc = p2 - p0;
    delta = 0.5 * (2.0 * p1 + t * (cc + t * (b + t * a)));
    dds = 0.5 * (cc + t * (2.0 * b + 3.0 * a * t)) * uLensFwd.y;
  }
  dDeltaDAlpha = dds * (1.0 / g + uLensFwd.w);
  return delta;
}

// The forward table at gap g alone.
float lensDelta(float g, out float dDeltaDAlpha) {
  return lensDeltaGC(g, max(uLensSpan - g, 0.0), dDeltaDAlpha);
}

// The gap g = α − α_edge of a lens-frame direction, and c = π − α = span − g: each from the chord on its own side
// (α from the hole's direction when d looks towards it, π − α from the opposite one when it looks away), so
// neither side of a subtraction is near π. (One exit: Direct3D's compiler warns of an uninitialised result
// otherwise.)
float lensGapC(vec3 d, out float c) {
  float g;
  if (dot(d, uLensAxis) >= 0.0 && uLensEdge <= LENS_HALF_PI) {
    g = lensAngle(d, uLensAxis) - uLensEdge;
    c = uLensSpan - g;
  } else {
    c = lensAngle(d, -uLensAxis);
    g = uLensSpan - c;
  }
  return g;
}
float lensGap(vec3 d) {
  float c;
  return lensGapC(d, c);
}

// sin α and cos α of the look angle α = α_edge + g, accurate near 0 and near π (π − α = span − g).
void lensSinCosOfGap(float g, out float sa, out float ca) {
  float a = uLensEdge + g;
  if (a < LENS_HALF_PI) {
    sa = lensSin(a);
    ca = 1.0 + lensCosM1(a);
  } else {
    float c = uLensSpan - g;
    sa = lensSin(c);
    ca = -1.0 - lensCosM1(c);
  }
}

// ln g of light from infinity at look angle α whose half-angle sine is sh = sin(α/2): static the uniform;
// the raindrop −ln((1 − v) + 2v sin²(α/2)), at most 40 (straight at the hole on the horizon it is infinite), and
// −40 (no light) where the bracket is not positive: inside the horizon, looking at the hole, no photon from
// outside arrives (E ≤ 0); those rays are all in the dark region.
float lensLnGAt(float sh) {
  if (uLensFrame < 0.5) return uLensLnG;
  float den = uLensRain.y + 2.0 * uLensRain.x * sh * sh;
  return den > 0.0 ? -log(max(den, 4e-18)) : -40.0;
}

// Backward, per pixel. d: unit look direction, lens frame. False when captured. nInf: where the light came
// from (hole frame, at infinity); jac: (|dΔφ/dα|, |sin Δφ / sin α|); lnG: of light from infinity (defined
// for captured rays too, for the flow in front of the shadow); g: the gap α − α_edge (≤ 0 when captured; 0 with
// no lens), for a caller that needs it too (the flow's lookup), so it is not worked out twice.
bool lensRayGap(vec3 d, out vec3 nInf, out vec2 jac, out float lnG, out float g) {
  nInf = d;
  jac = vec2(1.0);
  lnG = 0.0;
  g = 0.0;
  if (uLensOn < 0.5) return true;
  vec3 chord = uLensAxis - d; // |axis − d| = 2 sin(α/2)
  float cl = length(chord);
  lnG = lensLnGAt(0.5 * cl);
  float c;
  g = lensGapC(d, c);
  if (!(g > 0.0)) return false;
  float dd;
  float delta = lensDeltaGC(g, c, dd);
  // Towards the hole, perpendicular to d: axis − (axis·d) d, from the shorter chord so that it keeps its direction
  // looking towards the hole and looking away alike: (axis − d) + ½|axis − d|² d, or (axis + d) − ½|axis + d|² d.
  vec3 chordP = uLensAxis + d;
  float cp = length(chordP);
  vec3 t = cl <= cp ? chord + (0.5 * cl * cl) * d : chordP - (0.5 * cp * cp) * d;
  float tl = length(t);
  if (tl >= 1e-7) {
    float sd = lensSin(delta);
    float cd = 1.0 + lensCosM1(delta);
    nInf = normalize(d * cd + t * (sd / tl));
  }
  float sa;
  float ca;
  lensSinCosOfGap(g, sa, ca);
  float amd = uLensEdge + g - delta; // α − δ = π − Δφ
  jac = vec2(abs(dd - 1.0), abs(lensSin(amd)) / max(sa, 1e-30));
  return true;
}
bool lensRay(vec3 d, out vec3 nInf, out vec2 jac, out float lnG) {
  float g;
  return lensRayGap(d, nInf, jac, lnG, g);
}

// Row 0 of the inverse table at x (texels i … i + 3 of row `row`): the Hermite of y with the nodes' own slopes
// and the Catmull–Rom of m (inverseEval's arithmetic). Returns the gap g = e^y.
vec2 lensInvTexel(int i, int row) {
  return texelFetch(uLensInvTab, ivec2(i, row), 0).rg;
}

// The inverse table: the gap g = α − α_edge of the image whose sweep to infinity is D, given as π − D (so that
// sources near the axis behind the hole keep their precision); m = −ln|dΔφ/dα| there. D ∈ (0, 4π).
float lensInvGap(float piMinusD, out float m) {
  float h = uLensInv.w;
  if (!(h > 0.0)) {
    // a table of straight light: α = π − D
    m = 0.0;
    return piMinusD - uLensEdge;
  }
  bool row0 = piMinusD > -LENS_PI; // D < 2π
  float x;
  int n;
  int row;
  if (row0) {
    x = (lensAsinh(piMinusD / h) - uLensInv.x) * uLensInv.y;
    n = int(uLensInv.z);
    row = 0;
  } else {
    x = (-piMinusD - LENS_PI) * uLensInvRel.y; // (D − 2π)/ΔD
    n = int(uLensInvRel.z);
    row = 1;
  }
  int i = int(floor(x));
  i = clamp(i, 0, n - 2);
  float u = x - float(i);
  vec2 t0 = lensInvTexel(i, row);
  vec2 t1 = lensInvTexel(i + 1, row);
  vec2 t2 = lensInvTexel(i + 2, row);
  vec2 t3 = lensInvTexel(i + 3, row);
  float y1 = t1.x;
  float y2 = t2.x;
  float m1 = t1.y;
  float m2 = t2.y;
  float s1;
  float s2;
  if (row0) {
    float dz = 1.0 / uLensInv.y;
    float z1 = uLensInv.x + float(i) * dz;
    s1 = h * cosh(z1) * exp(m1 - y1) * dz;
    s2 = h * cosh(z1 + dz) * exp(m2 - y2) * dz;
  } else {
    float dD = 1.0 / uLensInvRel.y;
    s1 = -exp(m1 - y1) * dD;
    s2 = -exp(m2 - y2) * dD;
  }
  float u2 = u * u;
  float u3 = u2 * u;
  float y = (2.0 * u3 - 3.0 * u2 + 1.0) * y1 + (u3 - 2.0 * u2 + u) * s1 + (3.0 * u2 - 2.0 * u3) * y2 + (u3 - u2) * s2;
  float p0 = t0.y;
  float p3 = t3.y;
  m = 0.5 * (2.0 * m1 + u * (m2 - p0 + u * (2.0 * p0 - 5.0 * m1 + 4.0 * m2 - p3 + u * (-p0 + 3.0 * m1 - 3.0 * m2 + p3))));
  return exp(y);
}

// The inverse table: look angle α of the image whose sweep to infinity is D ∈ (0, 4π); m = −ln|dΔφ/dα|.
float lensInverse(float D, out float m) {
  if (uLensOn < 0.5) {
    m = 0.0;
    return LENS_PI - D;
  }
  return uLensEdge + lensInvGap(LENS_PI - D, m);
}

// Gould's B0(z)/z from its table (z ≥ 0), linearly between nodes; 1/z beyond z = 8 (B0 is 1 there to 1e-3).
float lensB0OverZ(float z) {
  if (z >= 8.0) return 1.0 / z;
  float x = z * 16.0;
  int i = int(floor(x));
  float t = x - float(i);
  float a = texelFetch(uLensB0Z, ivec2(i + 1, 0), 0).r;
  float b = texelFetch(uLensB0Z, ivec2(i + 2, 0), 0).r;
  return a + (b - a) * t;
}

// Tier 1's parallax at impact parameter b for a source at r_s (units of M), with what the Jacobian needs: the
// flat Λ = asin(b/r_s) when `flatLam` or b < 30 (cψ = √(1 − x²), cψΛ′ = 1/r_s); else the first-order orbit rescaled
// so its slope at infinity is exact (lensPoint.ts parallax). False when the ray does not reach r_s.
// (flatLam, not `flat`: that is a keyword of GLSL ES 3.00. One exit, every output set on every path: Direct3D's
// compiler warns of an uninitialised result otherwise.)
bool lensParallax(float b, float rs, bool flatLam, out float lam, out float cPsi, out float cPsiDLam) {
  lam = 0.0;
  cPsi = 1.0;
  cPsiDLam = 0.0;
  bool reaches = false;
  float x = b / rs;
  if (flatLam || b < LENS_ORBIT_MIN_B) {
    if (x < 1.0) {
      float c = sqrt((1.0 - x) * (1.0 + x));
      lam = lensAtan(x, c);
      cPsi = c;
      cPsiDLam = 1.0 / rs;
      reaches = true;
    }
  } else {
    float q = x - 2.0 / b;
    float disc = 1.0 - 4.0 * q / b;
    float S = disc >= 0.0 ? 2.0 * q / (1.0 + sqrt(disc)) : 2.0;
    if (S < 1.0) {
      float q0 = -2.0 / b;
      float S0 = 2.0 * q0 / (1.0 + sqrt(1.0 - 4.0 * q0 / b));
      float c0 = sqrt((1.0 - S0) * (1.0 + S0));
      float cS = sqrt((1.0 - S) * (1.0 + S));
      float k = (1.0 - 2.0 * S0 / b) * c0;
      float A = lensAtan(S, cS) - lensAtan(S0, c0);
      float dS0 = (2.0 - S0 * S0) / (b * b) / (1.0 - 2.0 * S0 / b);
      float dk = (2.0 * S0 / (b * b) - 2.0 * dS0 / b) * c0 - (1.0 - 2.0 * S0 / b) * S0 * dS0 / c0;
      cPsi = cS * (1.0 - 2.0 * S / b);
      lam = k * A;
      cPsiDLam = k * ((2.0 - S * S) / (b * b) + 1.0 / rs) - cPsi * (k * dS0 / c0 - dk * A);
      reaches = true;
    }
  }
  return reaches;
}

// The impact parameter b of the look angle α (sin α, cos α given; sh = sin(α/2)) and db/dα; den = the raindrop's
// 1 − v cos α (1 for the static observer).
float lensImpact(float sa, float ca, float sh, out float bp, out float den) {
  if (uLensFrame > 0.5) {
    den = uLensRain.y + 2.0 * uLensRain.x * sh * sh;
    bp = uLensRo * (ca - uLensRain.x) / (den * den);
    return uLensRo * sa / den;
  }
  den = 1.0;
  float rEg = uLensRo * exp(uLensLnG);
  bp = rEg * ca;
  return rEg * sa;
}

// Tier 1's Newton residual at look angle alpha: f = Δφ(α) − Λ(b(α)) − D and df/dα (orbit parallax). False when
// the ray does not reach the source's sphere.
bool lensResidual(float alpha, float rs, float D, out float f, out float fp) {
  f = 0.0;
  fp = 1.0;
  float g = alpha - uLensEdge;
  if (!(g > 0.0)) return false;
  float sa;
  float ca;
  lensSinCosOfGap(g, sa, ca);
  float bp;
  float den;
  float b = lensImpact(sa, ca, lensSin(0.5 * alpha), bp, den);
  float lam;
  float cPsi;
  float cPsiDLam;
  if (!lensParallax(b, rs, false, lam, cPsi, cPsiDLam)) return false;
  float dd;
  float delta = lensDelta(g, dd);
  f = delta + uLensSpan - g - lam - D;
  fp = dd - 1.0 - cPsiDLam / cPsi * bp;
  return true;
}

// Forward, per vertex, tier 1 (physics/lensPoint.ts pointImageTier1 step by step, whose header
// lists the arithmetic). relM: camera → source, world axes, hole frame, units of M; starRadiusM: the source's
// radius in M (0: a point, no cap). Order 0 always returns true (the unlensed fallback: sources in front of the
// hole, beyond the point zone, or with no outgoing solution, are drawn straight, never culled); orders ≥ 1 return
// false when there is no such image. dir: the image's direction (hole frame); lnMuB0 = ln(|μ| B0(z)).
bool lensImage(vec3 relM, float order, float starRadiusM, out vec3 dir, out float lnMuB0, out float lnG) {
  float d = length(relM);
  vec3 u = relM / max(d, 1e-30);
  dir = u;
  lnMuB0 = 0.0;
  lnG = 0.0;
  if (uLensOn < 0.5) return order < 0.5;
  vec3 axis = uLensAxis;
  // The straight direction's ln g (the raindrop's at the straight angle).
  float lnGFlat = lensLnGAt(0.5 * length(u - axis));
  lnG = lnGFlat;
  bool order0 = order < 0.5;
  // Beyond the point zone order 0 moves by under 0.02 px: drawn straight, with the observer's ln g only.
  if (order0 && dot(u, axis) < uLensPtCos) return true;
  float ro = uLensRo;
  vec3 srcH = relM - uLensHole;
  float rs = length(srcH);
  vec3 sh = srcH / max(rs, 1e-30);
  float gamma = 2.0 * lensAtan(length(sh + axis), length(sh - axis)); // angle at the hole, camera to source
  float gammaC = 2.0 * lensAtan(length(sh - axis), length(sh + axis)); // π − γ
  // In front of the hole: drawn straight.
  if (order0 && rs < ro && ro * cos(gamma) > rs) return true;
  int ord = int(order + 0.5);
  int kTurn = ord / 2;
  float side = ord - 2 * kTurn == 0 ? 1.0 : -1.0;
  // π − D_k, D_k = γ + 2πk (side +1) or 2π − γ + 2πk (side −1)
  float piMinusD = side > 0.0 ? (kTurn == 0 ? gammaC : -LENS_PI - gamma) : (kTurn == 0 ? -gammaC : -gammaC - LENS_TWO_PI);
  float D = LENS_PI - piMinusD;
  // The source's side: srcM's part perpendicular to the axis.
  vec3 qv = relM - dot(relM, axis) * axis;
  float ql = length(qv);
  vec3 q = ql > 1e-30 * d ? qv / ql : normalize(abs(axis.x) > 0.9 ? vec3(0.0, 1.0, 0.0) - axis.y * axis : vec3(1.0, 0.0, 0.0) - axis.x * axis);
  float aFlat = lensAngle(u, axis);
  float edge = uLensEdge;
  float ratio = ro / rs;
  bool passRegime = ratio < 0.05;
  float g = 0.0;
  float alpha = 0.0;
  float dSweep = -1.0;
  bool ok = true;
  float lam;
  float cPsi;
  float cPsiDLam;
  float m;
  if (passRegime) {
    // No pass, one, or three fixed-point passes α ← inverse(D + Λ(b(α))), flat Λ.
    int passes = ratio * uLensPxPerRad < 0.005 ? 0 : (ratio * ratio * uLensPxPerRad < 0.005 ? 1 : 3);
    g = lensInvGap(piMinusD, m);
    for (int p = 0; p < 3; p++) {
      if (p >= passes) break;
      float sa;
      float ca;
      lensSinCosOfGap(g, sa, ca);
      float bp;
      float den;
      float b = lensImpact(sa, ca, lensSin(0.5 * (edge + g)), bp, den);
      if (!lensParallax(b, rs, true, lam, cPsi, cPsiDLam)) {
        ok = false;
        break;
      }
      g = lensInvGap(piMinusD - lam, m);
    }
    alpha = edge + g;
    dSweep = -exp(-m);
  } else {
    // Newton on f(α) = Δφ(α) − Λ(b(α)) − D; α_max where the ray is tangent to the source's sphere (b = r_s(1 + 1/b)),
    // for static observers.
    float bTan = 0.5 * (rs + sqrt(rs * rs + 4.0 * rs));
    float rEg = ro * exp(uLensLnG);
    bool tangent = uLensFrame < 0.5 && bTan < rEg;
    float aMax = tangent ? lensAsin(bTan / rEg) : LENS_PI;
    float start = D;
    if (order0) {
      float sa0;
      float ca0;
      float bp0;
      float den0;
      sa0 = lensSin(aFlat);
      ca0 = 1.0 + lensCosM1(aFlat);
      float b0 = lensImpact(sa0, ca0, lensSin(0.5 * aFlat), bp0, den0);
      if (lensParallax(b0, rs, false, lam, cPsi, cPsiDLam)) start = D + lam;
    }
    alpha = min(edge + lensInvGap(LENS_PI - start, m), aMax);
    // One loop and one call of the residual (the D3D compiler's time grows much faster than the code: a second and
    // third call site for the start's choice made the program about twice as slow to compile). With order 0, two
    // evaluations first (k 0 and 1): at the table's start and at α_flat, whose smaller Newton step picks the start.
    // Then (k 2, 3) up to four Newton steps: with a tangent in w = √(α_max − α), in which Λ is linear near it;
    // otherwise in α.
    int k = order0 && aFlat > edge && aFlat < aMax ? 0 : 2;
    int steps = 0;
    float stepA = 1e30;
    float wMax = sqrt(aMax - edge);
    float w = 0.0;
    bool converged = false;
    float f;
    float fp;
    for (int it = 0; it < 6; it++) {
      if (k == 2) {
        if (tangent) {
          w = sqrt(max(aMax - alpha, 0.0));
          if (!(w > 1e-9 * wMax)) w = 1e-9 * wMax;
          alpha = aMax - w * w;
        }
        k = 3;
      }
      bool res = lensResidual(k == 1 ? aFlat : alpha, rs, D, f, fp);
      if (k == 0) {
        if (alpha < aMax && res) stepA = abs(f / fp);
        k = 1;
      } else if (k == 1) {
        if (res && abs(f / fp) < stepA) alpha = aFlat;
        k = 2;
      } else {
        if (!res) break;
        float next;
        bool clamped = false;
        if (tangent) {
          float wn = w + f / (2.0 * w * fp);
          if (!(wn > 1e-9 * wMax)) {
            wn = 1e-9 * wMax;
            clamped = true;
          }
          if (wn > wMax) {
            wn = 0.5 * (w + wMax);
            clamped = true;
          }
          w = wn;
          next = aMax - w * w;
        } else {
          next = alpha - f / fp;
          if (next > aMax) {
            next = aMax;
            clamped = true;
          }
          if (!(next > edge)) {
            next = edge + 0.5 * (alpha - edge);
            clamped = true;
          }
        }
        float step = next - alpha;
        alpha = next;
        // float32: the table's own noise keeps steps near 1e-7; a step under 1e-5 leaves an error of its square.
        if (!clamped && abs(step) < 1e-5) {
          converged = true;
          break;
        }
        steps++;
        if (steps >= 4) break;
      }
    }
    if (!converged) ok = false;
    else {
      float ddn;
      lensDelta(alpha - edge, ddn);
      dSweep = ddn - 1.0;
    }
    g = alpha - edge;
  }
  // The answer, with its parallax's cψ and cψΛ′ for the Jacobian.
  float sa;
  float ca;
  lensSinCosOfGap(g, sa, ca);
  float bp;
  float den;
  float b = lensImpact(sa, ca, lensSin(0.5 * alpha), bp, den);
  bool flatLam = passRegime || b < LENS_ORBIT_MIN_B;
  bool par = ok && lensParallax(b, rs, passRegime, lam, cPsi, cPsiDLam);
  // No solution: no parallax at the answer, or the flat one within √(10/r_s) of the foot.
  if (!par || (flatLam && !(cPsi * cPsi >= 10.0 / rs)) || !(g > 0.0)) {
    dir = u;
    lnMuB0 = 0.0;
    lnG = lnGFlat;
    return order0;
  }
  dir = ca * axis + (sa * side) * q;
  // |μ| = d² sin α / (r_s² |sin D| J), J = |cψ dΔφ/dα − b′ cψΛ′|; |sin D| = |sin(off)|, off the offset from the caustic.
  float offAbs = gamma < LENS_HALF_PI ? gamma : gammaC;
  float jac = abs(cPsi * dSweep - bp * cPsiDLam);
  float sinOverOff = offAbs < 1e-30 ? 1.0 : lensSin(offAbs) / offAbs;
  float L = 2.0 * log(d / rs) + log(sa) - log(sinOverOff) - log(jac); // ln(|off| |μ|)
  lnMuB0 = L - log(max(offAbs, 1e-30));
  if (starRadiusM > 0.0) {
    float z = offAbs * rs / starRadiusM;
    if (z < 8.0) lnMuB0 = L + log(rs / starRadiusM) + log(lensB0OverZ(z));
  }
  lnG = uLensFrame > 0.5 ? -log(den) : uLensLnG;
  return true;
}

// The pre-cull bound (muBoundEval): ln|μ₀| at most, for a source whose straight-line angle from
// the axis is psi. 0 (μ ≤ 1) without a lens.
float lensMuBound(float psi) {
  if (uLensOn < 0.5) return 0.0;
  int i = int(floor((log(max(psi, 1e-30)) - uLensMuBoundAxis.x) * uLensMuBoundAxis.y));
  i = clamp(i, 0, 15);
  int j = i / 4;
  return uLensMuBound[j][i - 4 * j];
}

// A blackbody star's radius in M from its absolute V magnitude, ln Y(T) (the caller's blackbody table: the visual
// luminance relative to a 5,772 K surface) and the scale: R★/R☉ = 10^(−0.2(M_V − 4.83)) e^(−½ ln Y) (lensPoint.ts
// starRadiusRsun, exact for a blackbody, an estimate for a real star). 0 without a lens.
float lensStarRadiusM(float absMag, float lnY) {
  if (uLensOn < 0.5) return 0.0;
  return exp(-0.4605170186 * (absMag - 4.83) - 0.5 * lnY) * LENS_SUN_RADIUS_KM * uLensScale.x;
}
