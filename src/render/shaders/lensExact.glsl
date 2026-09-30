// Chunk `lightspeed_lens_exact`: the exact lens for point sources near the hole (tier 2), in float32.
//
// What: the images of orders 0 and 1 of a point source at a finite distance r_s from a hole, seen by the static
// (hovering) observer outside the photon sphere, whichever way the light reaches it: met on the way in (the source
// lies between the camera and the ray's closest approach, where tier 1 draws it straight: up to 2 px wrong for the
// S-stars' orbit lines) or on the way out. lensImageExact returns the image's direction, ln|μ| and ln g; the exact
// orbit program (orbit.vert.glsl with LENS_EXACT) draws the orbit lines of bodies within 1e5 M of the hole with it.
//
// How (physics/schwarzschild.ts exactImageInto and physics/lensPoint.ts pointImageExact; docs/data/blackholes.md §4):
// a ray is one number, its look angle α from the hole, carried as the gap g = α − α_edge from the shadow's edge,
// with d = b/b_c − 1 = 2 cos(α_edge + g/2) sin(g/2)/sin α_edge and b/b_c = sin α/sin α_edge formed without
// cancellation. The azimuth it sweeps to the source's sphere (lensExactSweep), by Carlson's R_F:
//  - on the way in: ∫ du/√G from u_o to u_s, real roots for b > b_c (the periapsis from Darwin's closed form
//    rewritten without cancellation), a complex pair for b < b_c (rays that fall in after meeting the source);
//  - on the way out: from u_o out to u_s for a ray that starts outwards (a complex pair when it looks nearly
//    straight out), or to the periapsis and back out to u_s for one that starts inwards (two R_F);
//  u2 − u_o from the look angle (never 1/r0 − u_o), u_s − u_o from the camera-relative vector ((r_o² − r_s²)/(r_o + r_s),
//  exact where the source is near the camera's sphere), and b Δu with its b³ term for nearly radial rays. No table:
//  tier 2 is exact to float32's rounding of its inputs.
// Which branch: with r_s < r_o a ray met on the way in sweeps at most D_t, the sweep of the tangent ray (whose
// closest approach is r_s); the source's angle γ at the hole (order 0) or 2π − γ (order 1) at most D_t → in, else
// out. The look angle is solved by the Illinois method (regula falsi that halves an end kept twice) in a variable in
// which the sweep is nearly linear: ln g on the way out (the sweep grows as −ln g at the edge), w = √(α_t − α) on the
// way in (the sweep has a square-root end at the tangent ray), from a bracket probed outwards from a start (the
// straight direction on the way in; the inverse table at γ plus the flat parallax on the way out), to 1e-7 rad and
// 3e-7 of α. |μ| = d² sin α/(r_s² |sin D| |cos ψ_s dΔφ/dα|), dΔφ/dα by a difference over 1e-3 of the solve's variable
// (in w next to the tangent ray): about 1e-3 relative, not capped at the caustics (the orbit lines do not use it);
// ln g = ½ ln(1 − 2/r_s) − ½ ln(1 − 2/r_o). False (the caller falls back to tier 1) without a lens, in the raindrop's
// frame, inside the photon sphere (r_o ≤ 3 or r_s ≤ 3), for orders ≥ 2, or when the solve fails.
//
// Checked on the target laptop's GPU against pointImageExact in float64 (dev/lensTest.ts exactImages): 6,930 grid cases
// (cameras from 5 M to 4,000 au, sources from 4 M to 1e5 M, γ from 1e-3 to π − 1e-3, both orders) and 7,840 random
// ones: every image the CPU finds is found, within 0.0026 device px (0.0015 at the 99.9th percentile); ln|μ| within
// 0.0035 for 99 % (0.01–0.05 beside the caustics); ln g to the float32 of the camera-relative input.
//
// Why: the orbit lines of the S-stars pass within a few thousand M of Sgr A*, where tier 1's straight fallback for
// sources in front of the hole is off by up to 2 px; bodies are placed on the CPU by the float64 twin, so the line
// would miss its star.
//
// Cost: up to 27 sweeps a vertex, typically about 12 (each one or two R_F of up to 12 duplication passes), only in the
// exact orbit program, only for orbit lines within 1e5 M of the hole (a few thousand vertices). The solve is one loop
// with one call of the sweep and no `continue`, and the sweep has one R_F and one R_F(x, z, z̄), so the compiler
// inlines each once: a program with one call of lensImageExact alone compiles in 0.9–1.5 s cold on the target laptop
// (ANGLE on D3D11: the D3D compiler's time grows much faster than the code, so a program should call it from one
// place and not beside lensImage). Compiled in the background, never at start-up. Loops: R_F's duplication (constant
// bound 12, early break), the sweep's two legs (2) and the solve (28).
//
// Rules: included after lightspeed_lens (it reads its uniforms and helpers: lensAtan, lensAngle, lensSin,
// lensCosM1, lensAsin, lensAsinh, lensLog, lensSinCosOfGap, lensInvGap); declares no uniform.
//
// Twins: physics/lensPoint.ts pointImageExact (float64), physics/schwarzschild.ts for the roots and the integrals
// (kRootsReal, kRootsComplex, kToPeri, kBetweenReal, kBetweenComplex, kRF, kRFC).

const float LENS_BC = 5.19615242271; // b_c = 3√3
const float LENS_SQ2 = 1.41421356237;
const float LENS_SQ3 = 1.73205080757;

// sinh x with relative accuracy near 0 (the series below 0.1).
float lensSinh(float x) {
  if (abs(x) < 0.1) {
    float x2 = x * x;
    return x * (1.0 + x2 / 6.0 * (1.0 + x2 / 20.0 * (1.0 + x2 / 42.0)));
  }
  float e = exp(x);
  return 0.5 * (e - 1.0 / e);
}

// Carlson's R_F(x, y, z), x, y, z ≥ 0 with at most one zero: duplication until the relative spread is under 0.04,
// then the fifth-order series (DLMF 19.36.1; truncation under 1e-9, float32 rounding about 1e-7).
float lensRF(float x, float y, float z) {
  float X = 0.0;
  float Y = 0.0;
  float Z = 0.0;
  float A = (x + y + z) * (1.0 / 3.0);
  for (int i = 0; i < 12; i++) {
    float sx = sqrt(x);
    float sy = sqrt(y);
    float sz = sqrt(z);
    float lam = sx * (sy + sz) + sy * sz;
    x = 0.25 * (x + lam);
    y = 0.25 * (y + lam);
    z = 0.25 * (z + lam);
    A = (x + y + z) * (1.0 / 3.0);
    X = 1.0 - x / A;
    Y = 1.0 - y / A;
    Z = 1.0 - z / A;
    if (max(max(abs(X), abs(Y)), abs(Z)) < 0.04) break;
  }
  float E2 = X * Y - Z * Z;
  float E3 = X * Y * Z;
  return (1.0 - E2 * 0.1 + E3 * (1.0 / 14.0) + E2 * E2 * (1.0 / 24.0) - E2 * E3 * (3.0 / 44.0)) * inversesqrt(A);
}

// R_F(x, z, z̄), z = zr + i zi, in real arithmetic (the duplication keeps the conjugate pair; Re √z and zr + |z|
// formed without cancellation next to the negative real axis, as kRFC).
float lensRFc(float x, float zr, float zi) {
  float X = 0.0;
  float Yr = 0.0;
  float Yi = 0.0;
  float A = (x + 2.0 * zr) * (1.0 / 3.0);
  for (int i = 0; i < 12; i++) {
    float md = length(vec2(zr, zi));
    float t = sqrt(0.5 * (md + abs(zr)));
    float a = t > 0.0 ? (zr >= 0.0 ? t : abs(zi) / (2.0 * t)) : 0.0;
    float sx = sqrt(x);
    float lam = 2.0 * sx * a + md;
    float zpm = zr >= 0.0 ? zr + md : zi * zi / (md - zr);
    x = 0.25 * (x + lam);
    zr = 0.25 * (zpm + 2.0 * sx * a);
    zi = 0.25 * zi;
    A = (x + 2.0 * zr) * (1.0 / 3.0);
    X = 1.0 - x / A;
    Yr = 1.0 - zr / A;
    Yi = -zi / A;
    if (max(abs(X), length(vec2(Yr, Yi))) < 0.04) break;
  }
  float Y2 = Yr * Yr + Yi * Yi;
  float E2 = 2.0 * X * Yr + Y2;
  float E3 = X * Y2;
  return (1.0 - E2 * 0.1 + E3 * (1.0 / 14.0) + E2 * E2 * (1.0 / 24.0) - E2 * E3 * (3.0 / 44.0)) * inversesqrt(A);
}

// The principal square root of re + i im, without cancellation (Re from |z| + |re|, Im from im over it).
vec2 lensCsqrt(float re, float im) {
  float md = length(vec2(re, im));
  float t = sqrt(0.5 * (md + abs(re)));
  if (!(t > 0.0)) return vec2(0.0);
  return re >= 0.0 ? vec2(t, im / (2.0 * t)) : vec2(abs(im) / (2.0 * t), im >= 0.0 ? t : -t);
}

// The roots of G(u) = 1/b² − u² + 2u³ for b > b_c from d = b/b_c − 1 > 0, as the differences the sweeps need:
// (P = r0 the periapsis, −u1, u3 − u2, u2 − u1), every term positive or of the order of its leading one.
vec4 lensRootsReal(float d) {
  float b = LENS_BC * (1.0 + d);
  float ap = 2.0 * lensAsin(sqrt(d / (2.0 * (1.0 + d))));
  float s3 = lensSin(ap / 3.0);
  float s6 = lensSin(ap / 6.0);
  float eps = 3.0 * d - (2.0 * b / LENS_SQ3) * s6 * s6 + b * s3;
  float P = 3.0 + eps;
  float Q = sqrt((P - 2.0) * (P + 6.0));
  float qmp6 = (4.0 * P - 12.0) / (Q + P) + 6.0;
  float pq = P * (P - 2.0 + Q);
  return vec4(P, 2.0 * (P - 2.0) / pq, 4.0 * eps / (P * qmp6), (3.0 * P - 6.0 + Q) / pq);
}

// b < b_c: G = 2(u − u1)((u − m)² + n²), from d ∈ (−1, 0] and β = b/b_c = 1 + d (each to its own digits): (u1, m, n).
vec3 lensRootsComplex(float d, float beta) {
  float s = sqrt(-d * (1.0 + beta)) / beta;
  float sh = lensSinh(lensAsinh(s) / 3.0);
  float eta = -2.0 / 3.0 * sh * sh;
  float S = 2.0 / 3.0 - eta;
  return vec3(-1.0 / 6.0 + eta, 0.5 * S, sqrt(max(-0.75 * eta * S, 0.0)));
}

// b < b_c: the azimuth swept between ua < ub (du = ub − ua given), in one R_F(x, z, z̄).
float lensBetweenComplex(float ua, float ub, float du, vec3 C) {
  float X1 = sqrt(ub - C.x);
  float Y1 = sqrt(ua - C.x);
  vec2 zx = lensCsqrt(ub - C.y, -C.z);
  vec2 zy = lensCsqrt(ua - C.y, -C.z);
  float U14 = (X1 * dot(zy, zy) + Y1 * dot(zx, zx)) / du;
  float pr = zx.x * zy.x + zx.y * zy.y;
  float pi = zx.y * zy.x - zx.x * zy.y;
  float Ur = (X1 + Y1) * pr / du;
  float Ui = (X1 - Y1) * pi / du;
  return LENS_SQ2 * lensRFc(U14 * U14, Ur * Ur - Ui * Ui, 2.0 * Ur * Ui);
}

// A static observer's ray at gap g (negative inside the shadow's outline): d = b/b_c − 1 and β = b/b_c, both
// without cancellation (d from the gap near the edge, where it is small; β − 1 where the ray looks nearly straight
// out, where the gap form's cos((α + α_edge)/2) would lose its digits), and cos α.
void lensRayOfGap(float g, out float d, out float beta, out float ca) {
  float sSh = lensSin(uLensEdge);
  float sa;
  lensSinCosOfGap(g, sa, ca);
  beta = sa / sSh;
  d = beta < 0.5 ? beta - 1.0 : 2.0 * cos(uLensEdge + 0.5 * g) * lensSin(0.5 * g) / sSh;
}

// u2 − u_o from the look angle (never 1/r0 − u_o): y (y + u3 − u2) = cos²α/(2b²(u_o − u1)).
float lensYFromLook(float ca, float b, float uo, vec4 R) {
  float K = ca * ca / (2.0 * b * b * (uo + R.y));
  return 2.0 * K / (R.z + sqrt(R.z * R.z + 4.0 * K));
}

// The azimuth a static observer's ray at gap g sweeps to the source's sphere, on the way in (from u_o in to u_s,
// du = u_s − u_o > 0) or on the way out (du of either sign); gt: the tangent ray's gap when the source is inside the
// camera's sphere (else a negative number). One R_F site (a loop of two for the way past the periapsis) and one
// R_F(x, z, z̄) site, so that the solve's single call inlines each once.
float lensExactSweep(bool incoming, float g, float uo, float us, float du, float rs, float gt) {
  float d;
  float beta;
  float ca;
  lensRayOfGap(g, d, beta, ca);
  float b = LENS_BC * beta;
  // Between two radii with no turning point: in (u_o → u_s), or out from the camera (u_s → u_o, the source beyond it).
  bool between = incoming || ca < 0.0;
  float ua = incoming ? uo : us;
  float ub = incoming ? us : uo;
  float dd = incoming ? du : -du;
  if (between && b * ub < 1e-2) {
    // nearly radial: b Δu with its b³ term
    float s2 = ua * ua + ua * ub + ub * ub;
    float s3 = (ua + ub) * (ua * ua + ub * ub);
    return b * dd * (1.0 + 0.5 * b * b * (s2 / 3.0 - 0.5 * s3));
  }
  if (between && !(d > 0.0)) return lensBetweenComplex(ua, ub, dd, lensRootsComplex(d, beta));
  vec4 R = lensRootsReal(d);
  float y = lensYFromLook(ca, b, uo, R); // u2 − u_o
  // u2 − u_s: beyond the camera's sphere (u2 − u_o) + (u_o − u_s); inside it, where the ray may be nearly tangent to
  // the source's sphere, as u2 − u_o is found from the look angle, from cos²ψ_s = 1 − (b/b_t)² =
  // sin(α_t − α) sin(α_t + α)/sin²α_t (α_t − α = g_t − g, exact near the tangent ray; never 1/r0 − u_s).
  float ys = y - du;
  if (gt >= 0.0) {
    float at = gt + uLensEdge;
    float st = lensSin(at);
    float c2 = lensSin(gt - g) * lensSin(at + uLensEdge + g) / (st * st);
    float Ks = max(c2, 0.0) / (2.0 * b * b * (us + R.y));
    ys = 2.0 * Ks / (R.z + sqrt(R.z * R.z + 4.0 * Ks));
  }
  float sum = 0.0;
  for (int j = 0; j < 2; j++) {
    float px = 0.0;
    float py = 0.0;
    float pz = 0.0;
    float pre = 0.0;
    if (between) {
      if (j > 0) break;
      // DLMF 19.29.4: ua < ub, ya = u2 − ua, yb = u2 − ub
      float ya = incoming ? y : ys;
      float yb = max(incoming ? ys : y, 0.0);
      float X1 = sqrt(ub + R.y);
      float Y1 = sqrt(ua + R.y);
      float X2 = sqrt(yb);
      float Y2 = sqrt(ya);
      float X3 = sqrt(R.z + yb);
      float Y3 = sqrt(R.z + ya);
      float U12 = (X1 * X2 * Y3 + Y1 * Y2 * X3) / dd;
      float U13 = (X1 * X3 * Y2 + Y1 * Y3 * X2) / dd;
      float U14 = (X1 * Y2 * Y3 + Y1 * X2 * X3) / dd;
      px = U12 * U12;
      py = U13 * U13;
      pz = U14 * U14;
      pre = LENS_SQ2;
    } else {
      // to the periapsis from u_o, then from there out to u_s
      float u = j == 0 ? uo : us;
      float yy = max(j == 0 ? y : ys, 0.0);
      px = (u + R.y) * R.z;
      py = R.w * R.z;
      pz = R.w * (R.z + yy);
      pre = LENS_SQ2 * sqrt(yy);
    }
    sum += pre * lensRF(px, py, pz);
  }
  return sum;
}

// Λ(b, u_s) = ∫₀^{u_s} du/√G for b > b_c and a ray that reaches u_s (b u_s < 1 roughly): the azimuth swept from the source's sphere out to
// infinity. Its series far out, where b u_s < 1e-2.
float lensLambdaExact(float b, float us) {
  float x = b * us;
  if (x < 1e-2) return x * (1.0 + 0.5 * b * b * us * us * (1.0 / 3.0 - 0.5 * us));
  vec4 R = lensRootsReal(b / LENS_BC - 1.0);
  float ys = (1.0 - us * R.x) / R.x;
  float X1 = sqrt(us + R.y);
  float Y1 = sqrt(R.y);
  float X2 = sqrt(max(ys, 0.0));
  float Y2 = sqrt(1.0 / R.x);
  float X3 = sqrt(R.z + max(ys, 0.0));
  float Y3 = sqrt(R.z + 1.0 / R.x);
  float U12 = (X1 * X2 * Y3 + Y1 * Y2 * X3) / us;
  float U13 = (X1 * X3 * Y2 + Y1 * Y3 * X2) / us;
  float U14 = (X1 * Y2 * Y3 + Y1 * X2 * X3) / us;
  return LENS_SQ2 * lensRF(U12 * U12, U13 * U13, U14 * U14);
}

// The gap g_t of the tangent ray (b_t = r_s √(r_s/(r_s − 2)), closest approach r_s; r_s < r_o).
float lensTurnGap(float rs) {
  float bt = rs * sqrt(rs / (rs - 2.0));
  float st = bt / LENS_BC * lensSin(uLensEdge);
  return lensAsin(min(st, 1.0)) - uLensEdge;
}

// D_t, the most a ray met on the way in can sweep: the tangent ray's, from the camera to r_s.
float lensTurnSweep(float us, float uo) {
  float rs = 1.0 / us;
  float gt = lensTurnGap(rs);
  return lensExactSweep(true, gt, uo, us, us - uo, rs, gt);
}

// Δφ to infinity of a static observer's ray at gap g (analytic, r_o > 3, with cos α formed from g): the forward
// table's twin on the GPU. Negative when the ray is captured (g ≤ 0).
float lensSweepExact(float g) {
  if (!(g > 0.0)) return -1.0;
  float uo = 1.0 / uLensRo;
  // a source at infinity: out from u_o to 0 (u_s = 0 beyond the camera's sphere)
  return lensExactSweep(false, g, uo, 0.0, -uo, 1e30, -1.0);
}

// Φ(u_o, u_s) on the way in for the look angle whose gap is g.
float lensSweepIncoming(float g, float uo, float us) {
  float rs = 1.0 / us;
  return lensExactSweep(true, g, uo, us, us - uo, rs, lensTurnGap(rs));
}

// Tier 2 (pointImageExact): relM camera → source, world axes, hole frame, units of M; orders 0 and
// 1. dir: the image's direction (hole frame); lnMu = ln|μ|; lnG = ½ ln(1 − 2/r_s) − ½ ln(1 − 2/r_o). False when the
// exact solver does not apply or fails (the caller then uses lensImage).
bool lensImageExact(vec3 relM, float order, out vec3 dir, out float lnMu, out float lnG) {
  float dist = length(relM);
  vec3 u = relM / max(dist, 1e-30);
  dir = u;
  lnMu = 0.0;
  lnG = 0.0;
  float ro = uLensRo;
  if (uLensOn < 0.5 || uLensFrame > 0.5 || !(ro > 3.0) || order > 1.5) return false;
  vec3 axis = uLensAxis;
  vec3 srcH = relM - uLensHole;
  float rs = length(srcH);
  if (!(rs > 3.0)) return false;
  vec3 sHat = srcH / rs;
  float gamma = 2.0 * lensAtan(length(sHat + axis), length(sHat - axis)); // at the hole, camera to source
  bool order0 = order < 0.5;
  float T = order0 ? gamma : LENS_TWO_PI - gamma;
  // r_o − r_s from the camera-relative vector: (r_o² − r_s²)/(r_o + r_s), r_o² − r_s² = 2 relM·hole − |relM|².
  float roMinusRs = (2.0 * dot(relM, uLensHole) - dist * dist) / (ro + rs);
  float uo = 1.0 / ro;
  float us = 1.0 / rs;
  float du = roMinusRs / (ro * rs); // u_s − u_o
  float span = uLensSpan;
  float edge = uLensEdge;
  // A way in exists only for a source inside the camera's sphere (within 1e-6 of it, the rays that could meet it on
  // the way in sweep nothing).
  bool inside = roMinusRs > 1e-6 * ro;
  float gt = inside ? lensTurnGap(rs) : span;
  float gEdge = 1e-9 * span;
  // The solve in phases, one call of the sweep an iteration and no `continue` (FXC, the D3D compiler, takes many
  // times longer over a loop that jumps about): 0 the tangent ray on the way in (T ≤ D_t: the way in; with no way in,
  // a point that only starts the loop); 1 the probe from the start; 2 the lower end when the probe never rose above
  // 0; 3 Illinois; 4, 5 the two points of the derivative; 6 done. On the way in x = w ∈ [0, √α_t] (the residual falls
  // from D_t − T to −T); on the way out x = ln g ∈ [ln(1e-9 span), ln(g_end)] (from far above 0 to D_t − T, or −T
  // with g_end = span: straight out).
  bool incoming = inside;
  int phase = 0;
  float xLo = log(gEdge);
  float xHi = log(gt);
  float xa = xLo;
  float ga = gEdge;
  float fa = 0.0;
  bool haveLo = false;
  float xb = xHi;
  float gb = gt;
  float fb = -T;
  float h = 0.0;
  float x = 0.0;
  int probe = 0;
  float wa = 0.0;
  float wb = 0.0;
  int kept = 0;
  int ill = 0;
  bool failed = false;
  float g = 0.0;
  float gP = 0.0;
  float gN = 0.0;
  float fP = 0.0;
  float fN = 0.0;
  float m = 0.0;
  bool useW = false;
  float wm = 0.0;
  float wP = 0.0;
  float wN = 0.0;
  float aFlat = lensAngle(u, axis);
  for (int it = 0; it < 28; it++) {
    // The gap of this point (the derivative's points are given as gaps), and the one call of the sweep.
    float gx = phase >= 4 ? (phase == 4 ? gP : gN) : (incoming ? gt - x * x : exp(x));
    float fx = lensExactSweep(incoming, gx, uo, us, du, rs, inside ? gt : -1.0) - T;
    bool illinois = false;
    bool fresh = false;
    if (phase == 0) {
      // The branch, the range, the bracket's known ends, the start and the probe's first step.
      incoming = inside && fx >= 0.0;
      if (incoming) {
        fa = fx;
        haveLo = true;
        xLo = 0.0;
        xHi = sqrt(gt + edge);
        xa = xLo;
        ga = gt;
        xb = xHi;
        gb = -edge;
        x = sqrt(max(gt + edge - aFlat, 0.0));
        h = 0.01 * xHi + 1e-6;
      } else {
        if (inside) fb = fx;
        // the image of a source at infinity whose sweep is T plus the flat parallax of the straight line's ray
        float bFlat = LENS_BC * lensSin(aFlat) / lensSin(edge);
        x = log(clamp(lensInvGap(LENS_PI - T - lensAsin(min(bFlat / rs, 1.0)), m), gEdge, gt));
        h = 0.05;
      }
      x = clamp(x, xLo, xHi);
      phase = 1;
    } else if (phase == 1) {
      if (fx >= 0.0) {
        xa = x;
        ga = gx;
        fa = fx;
        haveLo = true;
        x += h;
      } else {
        xb = x;
        gb = gx;
        fb = fx;
        x -= h;
      }
      h *= 4.0;
      probe++;
      if (!(x > xa && x < xb && probe < 6)) {
        if (haveLo) {
          phase = 3;
          illinois = true;
          fresh = true;
        } else {
          phase = 2;
          x = xa;
        }
      }
    } else if (phase == 2) {
      ga = gx;
      fa = fx;
      phase = 3;
      illinois = true;
      fresh = true;
    } else if (phase == 3) {
      if (fx >= 0.0) {
        xa = x;
        ga = gx;
        fa = fx;
        wa = fx;
        if (kept == 1) wb *= 0.5;
        kept = 1;
      } else {
        xb = x;
        gb = gx;
        fb = fx;
        wb = fx;
        if (kept == 2) wa *= 0.5;
        kept = 2;
      }
      illinois = true;
    } else if (phase == 4) {
      fP = fx;
      phase = 5;
    } else {
      fN = fx;
      phase = 6;
    }
    if (illinois) {
      if (fresh) {
        failed = !(fa >= 0.0) || !(fb <= 0.0);
        wa = fa;
        wb = fb;
      }
      float aMax = edge + max(ga, gb);
      float width = abs(gb - ga);
      // float32 stops the bracket at a few ulps of the look angle: after 16 steps within 1e-5 is close enough (the
      // secant below finds the answer inside it).
      if (width <= 1e-7 + 3e-7 * aMax || (ill >= 16 && width <= 1e-5 * (1.0 + aMax))) {
        // The gap between the ends, by the secant of their true residuals; then the derivative's two points.
        g = fa - fb > 0.0 ? ga + (gb - ga) * fa / (fa - fb) : 0.5 * (ga + gb);
        useW = incoming || (inside && gt - g < g);
        if (useW) {
          // in w = √(α_t − α), in which the tangent ray's square root is linear
          wm = sqrt(max(gt - g, 0.0));
          float hw = max(3e-3 * wm, 3e-4 * sqrt(gt + edge));
          wP = wm + hw;
          if (incoming) wP = min(wP, sqrt(gt + edge));
          wN = max(wm - hw, 0.0);
          gP = gt - wP * wP;
          gN = gt - wN * wN;
        } else {
          gP = min(g * 1.001, inside ? gt : span);
          gN = g * 0.999;
          if (gP - g < 0.5 * (g - gN)) gP = g;
        }
        phase = 4;
      } else {
        failed = failed || ill >= 16;
        ill++;
        x = xb - wb * (xb - xa) / (wb - wa);
        if (!(x > min(xa, xb) && x < max(xa, xb))) x = 0.5 * (xa + xb);
      }
    }
    if (failed || phase >= 6) break;
  }
  if (failed || phase != 6) return false;
  float sa;
  float ca;
  lensSinCosOfGap(g, sa, ca);
  vec3 qv = relM - dot(relM, axis) * axis;
  float ql = length(qv);
  vec3 q = ql > 1e-30 * dist ? qv / ql : normalize(abs(axis.x) > 0.9 ? vec3(0.0, 1.0, 0.0) - axis.y * axis : vec3(1.0, 0.0, 0.0) - axis.x * axis);
  dir = ca * axis + (sa * (order0 ? 1.0 : -1.0)) * q;
  // |μ| = d² sin α / (r_s² |sin D| J), J = |cos ψ_s dΔφ/dα|. Next to the tangent ray, in w: cos²ψ_s = 1 − (b/b_t)² =
  // sin(α_t − α) sin(α_t + α)/sin²α_t with α_t − α = w², and dΔφ/dα = −(dΔφ/dw)/(2w), so J stays finite at w = 0.
  float J = 1.0;
  if (useW) {
    float at = gt + edge;
    float w2 = wm * wm;
    float r = w2 > 0.0 ? sqrt(lensSin(w2) / w2) : 1.0;
    float dPhiDw = wP != wN ? abs((fP - fN) / (wP - wN)) : 0.0;
    J = sqrt(max(lensSin(at + edge + g), 0.0)) / lensSin(at) * r * 0.5 * dPhiDw;
  } else {
    float bu = LENS_BC * sa / lensSin(edge) * us;
    float cPsi = sqrt(max(1.0 - bu * bu * (1.0 - 2.0 * us), 0.0));
    J = cPsi * (gP != gN ? abs((fP - fN) / (gP - gN)) : 1.0);
  }
  float sinD = abs(lensSin(gamma < LENS_HALF_PI ? gamma : LENS_PI - gamma));
  lnMu = 2.0 * log(dist / rs) + log(max(sa, 1e-30)) - log(max(sinD, 1e-30)) - log(max(J, 1e-30));
  float x2 = 2.0 * us;
  lnG = uLensLnG + (x2 < 1e-2 ? -0.5 * x2 * (1.0 + x2 * (0.5 + x2 / 3.0)) : 0.5 * lensLog(1.0 - x2));
  return true;
}
