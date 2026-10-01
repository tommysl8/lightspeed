// Chunk `lightspeed_disklookup`: a thin accretion disc (Cygnus X-1's) along one ray of the lens passes.
//
// What (docs/data/blackholes.md §12): the lens box's composite, the photon ring's band and the lensed spheres have a
// backward ray from the hovering camera, its look direction d in the lens frame and its gap g to the shadow's edge.
// diskAt finds where that ray crosses the disc's plane (orders 0, 1, 2: the direct image, the far side lensed over
// the top of the shadow and under it, and the thin ring at the photon ring) and, at the first crossing between the
// disc's edges (it is opaque), returns the disc's light: a blackbody at the ring's Novikov–Thorne temperature, seen
// at g·T (g = √(1 − 3/r)/(1 − Ω L_z) for gas on a circular Keplerian orbit, times the ray's own shift to the camera),
// times an illustrative swirl. Its brightness is either its visible light, as a surface of the Sun's calibration
// (radiance 8 is a 5,772 K surface), or all of its light (σ(gT)⁴, mostly X-rays: the bolometric picture of Luminet
// 1979 and the published images), each in the visible colour of the blackbody at gT.
//
// How each crossing's radius is found (physics/thinDisk.ts diskRayCrossings, its float64 twin, line for line): the
// ray's orbit depends on its impact parameter b alone, so a table of every orbit, v = b·u against the sweep ψ from
// infinity, serves every camera (uDiskOrbit, its rows in b crowding at b_c, uniform in ψ to the periapsis or the
// horizon); b comes from the gap (x − 1 = cot α_e sin g + cos g − 1, uDiskGeom.x from float64). The ray reaches the
// plane after the sweeps Δ_k = Δ_0 + kπ; a crossing before the ray's periapsis is placed from the camera's own place
// on each row's orbit (ψ_c + Δ_k, uDiskRows.z), one past it from the far end (Δφ − Δ_k, Δφ the lens's own sweep to
// infinity from its forward table). v is read on the two rows either side, linear in b between them, and u = v/b.
//
// The swirl (illustrative): two layers of a tiling noise in (ln r, φ − Ω τ), sheared by the gas's own differential
// rotation (Keplerian, Ω = r^(−3/2)), each restarted every uDiskSwirl period and crossfaded with the other so that
// the shear never winds up; faded out where its streaks would be under a few pixels (no shimmer), and not on the
// photon ring's thin images. Light-travel time across the disc is left out of it.
//
// Rules: include after lightspeed_relativity (the blackbody table) and lightspeed_lens (the lens's uniforms and
// helpers); declares only the disc's uniforms (render/disk/diskMap.ts diskUniforms, shared by reference). Reads with
// texelFetch, and the swirl's noise with textureLod (the band calls this in a loop). Every loop has a constant bound.
//
// Cost: with uDiskOn 0, one comparison. On: up to three crossings of four table reads each and two row reads, one
// forward-table read for the sweep, two blackbody reads and two noise reads; target laptop, docs/data/blackholes.md
// §12.
//
// Twins: physics/thinDisk.ts (diskRayCrossings, keplerRedshift, ntFluxShape), render/disk/diskMap.ts (the uniforms).

uniform float uDiskOn;                // 1 while a disc is drawn
uniform highp sampler2D uDiskOrbit;   // R32F 512 × 512: v = b·u, rows in b, columns uniform in ψ to ψ_end
uniform highp sampler2D uDiskRows;    // RGBA32F 512 × 1: (b, ψ_end, the camera's ψ_c on that orbit, 0)
uniform vec4 uDiskAxes;               // (q of row 0 and 1/Δq, falling-in rows: q = ln w + 3w; the same, escaping: q = ln w)
uniform vec4 uDiskGeom;               // (cot α_e, r_in, r_out, ln T* (K))
uniform vec3 uDiskNormal;             // the disc's axis (lens frame, world axes; the gas turns anticlockwise about it)
uniform vec3 uDiskX;                  // and two axes in its plane, for the azimuth
uniform vec3 uDiskY;
uniform vec3 uDiskLight;              // (0 visible light, 1 all its light; ln gain; contrast γ): displayed L^γ e^gain, L the
                                      // visible luminance relative to a 5,772 K surface, or T⁴; calibration, exposure, fade
uniform vec4 uDiskSwirl;              // (τ of layer A, τ of layer B (units of M), A's weight, amplitude)
uniform sampler2D uDiskNoise;         // 128 × 128 tiling noise, filtered, repeating
uniform float uDiskStarLnE;           // the exposure (ln) of luminous spheres drawn beside the disc (the lensed spheres' pass)

const int DISK_ROWS_IN = 128;
const int DISK_ROWS = 512;
const int DISK_COLS = 512;
const float DISK_BC = 5.196152422706632;
const float DISK_B_MAX = 1.0e5;

// v = b·u on row j (its row texel R) at ψ from infinity, linear between columns, an escaping orbit reflected about
// its periapsis; −1 beyond its far end (escaped, or fallen in).
float diskRowV(int j, vec4 R, float psi) {
  float psiEnd = R.y;
  float p = psi;
  float v = -1.0;
  bool ok = p >= 0.0;
  if (j >= DISK_ROWS_IN) {
    ok = ok && p <= 2.0 * psiEnd;
    if (p > psiEnd) p = 2.0 * psiEnd - p;
  } else ok = ok && p <= psiEnd;
  if (ok) {
    float x = p / psiEnd * float(DISK_COLS - 1);
    int i = min(int(floor(x)), DISK_COLS - 2);
    float f = x - float(i);
    v = mix(texelFetch(uDiskOrbit, ivec2(i, j), 0).r, texelFetch(uDiskOrbit, ivec2(i + 1, j), 0).r, f);
  }
  return v;
}

// The blackbody table at ln T (rgb: colour of luminance 1; a: ln of the visible luminance relative to 5,772 K),
// with texelFetch: blackbody.glsl's blackbodyLn arithmetic, usable in a loop.
vec4 diskBlackbody(float lnT) {
  float lo = uBbRange.x;
  float hi = uBbRange.y;
  float n = uBbRange.z;
  float x = (clamp(lnT, lo, hi) - lo) / (hi - lo) * (n - 1.0);
  float i0 = min(floor(x), n - 2.0);
  int c = int(i0);
  vec4 r = mix(texelFetch(uBlackbody, ivec2(c, 0), 0), texelFetch(uBlackbody, ivec2(c + 1, 0), 0), x - i0);
  if (lnT > hi) r.a += lnT - hi;
  else if (lnT < lo) r.a = max(r.a - uBbRange.w * (exp(min(-lnT, 60.0)) - exp(-lo)), LN_Y_FLOOR);
  return r;
}

// ln of the Novikov–Thorne flux's shape f(r), r > 6 (physics/thinDisk.ts ntFluxShape). Its bracket is the integral
// of (x² − 6)/(x² − 3) from √6 to x = √r, which vanishes quadratically at the inner edge: there the closed form
// would cancel to nothing in float32, so below r = 9 it is integrated by 4-point Gauss–Legendre instead (within
// 7e-7 of itself there).
float diskLnFlux(float r) {
  float x = sqrt(r);
  float num;
  if (r < 9.0) {
    float h = 0.5 * (x - 2.449489743);
    float m = 2.449489743 + h;
    float s = 0.0;
    float t;
    t = m - 0.861136312 * h; s += 0.347854845 * (t * t - 6.0) / (t * t - 3.0);
    t = m - 0.339981044 * h; s += 0.652145155 * (t * t - 6.0) / (t * t - 3.0);
    t = m + 0.339981044 * h; s += 0.652145155 * (t * t - 6.0) / (t * t - 3.0);
    t = m + 0.861136312 * h; s += 0.347854845 * (t * t - 6.0) / (t * t - 3.0);
    num = s * h;
  } else {
    // √r − √6 + (√3/2) ln((√r + √3)(√6 − √3) / ((√r − √3)(√6 + √3)))
    num = x - 2.449489743 + 0.866025404 * (log((x + 1.732050808) / (x - 1.732050808)) - 1.762747174);
  }
  return log(max(num, 1e-30)) - log((r - 3.0) * r * r * x);
}

// The illustrative swirl at radius r and azimuth phi (in the disc's plane), seen at about px device pixels a
// streak: 1 on average.
float diskSwirl(float r, float phi, float px) {
  float amp = uDiskSwirl.w * smoothstep(2.0, 8.0, px);
  if (amp <= 0.0) return 1.0;
  float om = 1.0 / (r * sqrt(r));
  float y = log(r) * 2.0;
  float a = textureLod(uDiskNoise, vec2((phi - om * uDiskSwirl.x) * 0.1591549431, y), 0.0).r;
  float b = textureLod(uDiskNoise, vec2((phi - om * uDiskSwirl.y) * 0.1591549431 + 0.37, y + 0.61), 0.0).r;
  float n = mix(b, a, uDiskSwirl.z) - 0.5;
  return exp(amp * 2.5 * n);
}

// The disc along the backward ray d (lens frame, unit) whose gap to the shadow's edge is g (≤ 0 inside it), the ray's
// light shifted by e^lnShift on its way from the hole's frame to the view: true where the ray meets the disc, with rgb
// its displayed radiance. One exit; every output set on every path.
bool diskAt(vec3 d, float g, float lnShift, out vec3 rgb) {
  rgb = vec3(0.0);
  bool hit = false;
  if (uDiskOn > 0.5) {
    vec3 e1 = -uLensAxis;
    float ca = dot(d, uLensAxis);
    vec3 side = d - ca * uLensAxis;
    float sl = length(side);
    float xm1 = uDiskGeom.x * lensSin(g) + lensCosM1(g);
    bool famOut = xm1 > 0.0;
    bool escapes = g > 0.0;
    // A ray inside a camera's photon sphere with b > b_c is trapped there and never reaches the disc.
    if (sl > 1e-12 && (escapes || !famOut)) {
      vec3 s = side / sl;
      float b = DISK_BC * (1.0 + xm1);
      float sweep = 0.0;
      if (escapes) {
        float dd;
        sweep = (uLensSpan - g) + lensDelta(g, dd);
      }
      float w = max(abs(xm1), 1e-9);
      float fr = famOut ? float(DISK_ROWS_IN) + clamp((log(w) - uDiskAxes.z) * uDiskAxes.w, 0.0, float(DISK_ROWS - DISK_ROWS_IN - 1)) : clamp((log(w) + 3.0 * w - uDiskAxes.x) * uDiskAxes.y, 0.0, float(DISK_ROWS_IN - 1));
      int j0 = min(int(floor(fr)), famOut ? DISK_ROWS - 2 : DISK_ROWS_IN - 2);
      vec4 R0 = texelFetch(uDiskRows, ivec2(j0, 0), 0);
      vec4 R1 = texelFetch(uDiskRows, ivec2(j0 + 1, 0), 0);
      // v linear in b between the rows (near the camera v = b u_c exactly; from the far end it hardly depends on b)
      float fj = clamp((b - R0.x) / (R1.x - R0.x), 0.0, 1.0);
      bool straight = famOut && b > DISK_B_MAX;
      bool inward = ca > 0.0;
      float psiPeri = mix(R0.y, R1.y, fj);
      float a = dot(e1, uDiskNormal);
      float c = dot(s, uDiskNormal);
      float d0 = atan(-a, c);
      if (d0 < 0.0) d0 += LENS_PI;
      if (d0 < 1e-6) d0 += LENS_PI;
      // the photon's angular momentum about the disc's axis per unit energy (the backward ray's, reversed)
      float lz = -b * dot(cross(e1, s), uDiskNormal);
      // The crossings, in order, until one lands on the disc (the march alone in the loop: the light is worked out
      // once, after it, which keeps the band's eight inlined copies of this small enough to compile in good time).
      float hitR = 0.0;
      float hitDelta = 0.0;
      float hitK = 0.0;
      for (int k = 0; k < 3; k++) {
        float delta = d0 + float(k) * LENS_PI;
        // before the periapsis (or falling in): from the camera's place on each row's orbit; past it: from the far end
        bool far = escapes && !(inward && delta < sweep - psiPeri);
        float v0 = diskRowV(j0, R0, far ? sweep - delta : R0.z + delta);
        float v1 = diskRowV(j0 + 1, R1, far ? sweep - delta : R1.z + delta);
        if (straight) {
          float psi = sweep - delta;
          v0 = psi > 0.0 ? sin(min(psi, LENS_HALF_PI)) : -1.0;
          v1 = v0;
        }
        if (v0 < 0.0 || v1 < 0.0) break;
        float u = mix(v0, v1, fj) / b;
        if (!(u > 0.0)) break;
        float r = 1.0 / u;
        if (r >= uDiskGeom.y && r <= uDiskGeom.z) {
          hitR = r;
          hitDelta = delta;
          hitK = float(k);
          hit = true;
          break;
        }
      }
      if (hit) {
        float r = hitR;
        // ln g∞ of the gas's light, then the ring's temperature as seen
        float lnG = 0.5 * log(1.0 - 3.0 / r) - log(1.0 - lz / (r * sqrt(r)));
        float lnT = uDiskGeom.w + 0.25 * diskLnFlux(r) + lnG + lnShift;
        vec4 bb = diskBlackbody(lnT);
        vec3 p = cos(hitDelta) * e1 + sin(hitDelta) * s;
        float phi = atan(dot(p, uDiskY), dot(p, uDiskX));
        // a streak's size on the screen: 1/32 of r radially, seen from the camera (straight: a heuristic)
        float dist = length(uLensRo * e1 - r * p);
        float px = hitK < 1.5 ? 0.03125 * r / max(dist, 1e-6) * uLensPxPerRad : 0.0;
        // visible light: the blackbody's own luminance; all its light: σT⁴ (I ∝ g⁴), in its visible colour
        float lnL = uDiskLight.z * (uDiskLight.x > 0.5 ? 4.0 * lnT : bb.a);
        rgb = bb.rgb * exp(min(lnL + uDiskLight.y, 30.0)) * diskSwirl(r, phi, px);
      }
    }
  }
  return hit;
}
