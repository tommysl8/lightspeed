// The accretion flow's map: one texel is one backward ray from the camera, marched along its exact orbit through the
// fitted flow model, carrying the flow's light (render/flow/flowMap.ts renders it; the lens passes read it through
// the chunk lightspeed_flowlookup).
//
// What (docs/data/blackholes.md §7): texel (column k, row j) is the look direction at angle α_j from the hole (the row
// table uFlowRows, built on the CPU in float64: its impact parameter b, where it starts (on the camera, or where it
// first crosses 400 M from a camera beyond), dr/dλ there and the azimuth φ₀ it has swept by then) and azimuth
// ω_k = 2π(k + ½)/cols about the camera–hole axis, measured from the flow's axis projected across that axis. In the
// ray's plane (x along the start's radius) the orbit is ẍ = −3b²x/|x|⁵ (exact for photon energy 1 with the affine
// parameter λ), RK4 in steps that move the point by 0.07 r (0.07 r/max(1, |ẋ|), the share falling to 0.35 of that
// between r = 2 M and 0.7 M and growing as r/40 beyond 40 M), at most 128 steps, ending heading into the horizon or
// out beyond 400 M (the reference's own reach: in the sky's √ law a cut at 40 M showed as an edge). The light is
// sampled at one point of every second step (a frame's jitter ξ along the pair, placed by cubic Hermite
// interpolation; in motion at rung 1, one pair in two, weighted by as many), outside the horizon and inside 400 M:
// the fluid's g = ν_∞/ν_emit from its Keplerian rotation (r ≥ 6 M) or the ISCO plunge, the photon's angular momentum
// about the flow's axis λ_z = −b (r̂ × ê)·â; visible light Σ W g^(2−α) j_V (the power-law electrons, optically thin,
// in V = 0 stars per square arcsecond); at 1.3 mm the thermal and power-law emission and absorption at ν/g, front to
// back (T += g S (1 − e^−Δτ) e^−τ, in 1e10 K at 150, 230 and 345 GHz), stopping once τ passes 10 at all three.
// Frames with the camera still are averaged into the map (uFlowFrames of them so far), each with its own ξ.
//
// Rules: GLSL ES 1 style (three.js turns it into ES 3.00); logarithms for everything that would leave float32's
// range (2h/c² is 1.5e−47); the one loop has a constant bound and a dynamic break.
//
// Cost: 16,384 rays of at most 128 RK4 steps and 64 samples, about 0.3 ms on the target laptop when rebuilt (visible
// light; the 1.3 mm view about twice that), only while the flow is resolved and something changed.
//
// Twins: render/flow/flowRay.ts (line for line: flowRayStart, flowMarch), scripts/sgra-flow/flow_camera.py (the
// reference it is checked against).

uniform highp sampler2D uFlowRows;  // RGBA32F rows × 1: (b, r0, dr/dλ at r0, φ0); b < 0: a dark ray
uniform highp sampler2D uFlowPrev;  // the map so far (averaged over uFlowFrames frames)
uniform float uFlowFrames;          // frames already in uFlowPrev (0: this frame replaces it)
uniform vec4 uFlowGeom;             // (cos i, sin i, rows, cols): i the angle of the flow's axis from hole → camera
uniform vec4 uFlowSampling;         // (jitter ξ ∈ [0, 1), pairs per sample, band (0 visible, 1 1.3 mm), step factor k)
uniform vec4 uFlowV;                // visible: (ln C, power of ρ², of r, factor of z²/ρ²)
uniform vec4 uFlowV2;               // (power of g: 2.5, taken as g² √g below; g's lower and upper clip, 0)
uniform vec4 uFlowMm1;              // 1.3 mm: (ln n0, ln n0,nt, ln T0, ln(k/m_e c²))
uniform vec4 uFlowMm2;              // (ln B²'s constant, ln ν_s's, ln the thermal j's, ln the power law's j)
uniform vec4 uFlowMm3;              // (ln the power law's absorption, ln 2h/c², h/k, ln(c²/2k) − ln 1e10)
uniform vec4 uFlowMm4;              // (ln r_g in cm, ln 150, 230, 345 GHz)
uniform vec4 uFlowMm5;              // the power law's exponents: (of B in j, of ν in j, of B in α, of ν in α)

const float FLOW_OUTER = 400.0;     // flowRay.ts FLOW_OUTER_M
const float FLOW_STEP_GROWS = 40.0; // flowRay.ts FLOW_STEP_GROWS_M
const float FLOW_E_ISCO = 0.9428090416;
const float FLOW_L_ISCO = 3.4641016151;
const float FLOW_TAU_STOP = 10.0;

vec2 flowAcc(vec2 x, float b2x3) {
  float ir = inversesqrt(dot(x, x));
  float ir2 = ir * ir;
  return (-b2x3 * (ir2 * ir2 * ir)) * x;
}

// One RK4 step of ẍ = −3b²x/|x|⁵ (state: position, velocity).
vec4 flowStep(vec4 s, float h, float b2x3) {
  vec2 x = s.xy;
  vec2 v = s.zw;
  float hh = 0.5 * h;
  vec2 k1v = flowAcc(x, b2x3);
  vec2 k2v = flowAcc(x + hh * v, b2x3);
  vec2 k2x = v + hh * k1v;
  vec2 k3v = flowAcc(x + hh * k2x, b2x3);
  vec2 k3x = v + hh * k2v;
  vec2 k4v = flowAcc(x + h * k3x, b2x3);
  vec2 k4x = v + h * k3v;
  float h6 = h / 6.0;
  return vec4(x + h6 * ((v + 2.0 * (k2x + k3x)) + k4x), v + h6 * ((k1v + 2.0 * (k2v + k3v)) + k4v));
}

// The step length: k r / max(1, |ẋ|), k falling to 0.35 k between r = 2 and 0.7 (inside the horizon) and growing as
// r/40 beyond 40 M (the orbits there are nearly straight).
float flowStepLength(vec4 s, float k) {
  float r = length(s.xy);
  float kin = k * min(1.0, max(0.35, 0.5 * r)) * max(1.0, r / FLOW_STEP_GROWS);
  return kin * r / max(1.0, length(s.zw));
}

bool flowEnded(vec4 s) {
  float r2 = dot(s.xy, s.xy);
  float o = dot(s.xy, s.zw);
  return (r2 <= 4.0 && o < 0.0) || (r2 > FLOW_OUTER * FLOW_OUTER && o > 0.0);
}

// Cubic Hermite position and velocity at fraction t of a step of length h from a to b.
vec4 flowHermite(vec4 a, vec4 b, float h, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  float h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
  float h10 = t3 - 2.0 * t2 + t;
  float h01 = -2.0 * t3 + 3.0 * t2;
  float h11 = t3 - t2;
  float d00 = 6.0 * t2 - 6.0 * t;
  float d10 = 3.0 * t2 - 4.0 * t + 1.0;
  float d11 = 3.0 * t2 - 2.0 * t;
  vec2 p = h00 * a.xy + h10 * h * a.zw + h01 * b.xy + h11 * h * b.zw;
  vec2 v = d00 * (a.xy - b.xy) / h + d10 * a.zw + d11 * b.zw;
  return vec4(p, v);
}

// The fluid's frequency factor g = ν_∞/ν_emit (riaf_model.local), clipped.
float flowFluidG(float r, float rho2, float rdotBack, float lz) {
  float f = 1.0 - 2.0 / r;
  float mku;
  if (r >= 6.0) {
    float om = 1.0 / (r * sqrt(r));
    mku = (1.0 - om * lz) / sqrt(max(f - rho2 * om * om, 1e-6));
  } else {
    float uphi = FLOW_L_ISCO / (r * r);
    float ur = -sqrt(max(FLOW_E_ISCO * FLOW_E_ISCO - f * (1.0 + rho2 * uphi * uphi), 0.0));
    mku = FLOW_E_ISCO / f + (rdotBack / f) * ur - lz * uphi;
  }
  return mku > 0.0 ? clamp(1.0 / mku, uFlowV2.y, uFlowV2.z) : uFlowV2.y;
}

// ln K2(1/Θ) for Θ ≥ 2 (the flow's electrons inside 400 M): the small-argument series, within 2e−4.
float flowLnK2Inv(float lnTheta) {
  float x = exp(-lnTheta);
  float x2 = x * x;
  return log(2.0 / x2 - 0.5 - (x2 / 8.0) * (log(0.5 * x) + 0.5772156649 - 0.75));
}

// The light at a sample. Visible: returns the addition. 1.3 mm: adds to acc, with the optical depths in tau.
float flowSample(bool mm, vec4 p, vec3 a, float lz, float w, inout vec3 acc, inout vec3 tau) {
  float r = length(p.xy);
  if (!(r > 2.0) || r >= FLOW_OUTER) return 0.0;
  float z = dot(p.xy, a.xy);
  float cr = p.x * a.y - p.y * a.x;
  float rho2 = max(r * r * a.z * a.z + cr * cr, 1e-12);
  float z2r = min(z * z / rho2, 1e4);
  float rdotBack = dot(p.xy, p.zw) / r;
  float g = flowFluidG(r, rho2, rdotBack, lz);
  float lnRho2 = log(rho2);
  float lnR = log(r);
  // g^(2 − α) = g^2.5 (uFlowV2.x; the model's p = 2, which flowMap.ts checks)
  if (!mm) return w * exp(uFlowV.x + uFlowV.y * lnRho2 + uFlowV.z * lnR + uFlowV.w * z2r) * (g * g * sqrt(g));
  float lnG = log(g);
  float lnNth = uFlowMm1.x - 0.55 * lnRho2 - 0.5 * z2r;
  float lnNnt = uFlowMm1.y - 1.45 * lnRho2 - 0.5 * z2r;
  float lnT = uFlowMm1.z - 0.84 * lnR;
  float lnTheta = uFlowMm1.w + lnT;
  float lnB = 0.5 * (uFlowMm2.x - 0.55 * lnRho2 - 0.5 * z2r - lnR);
  float lnNuS = uFlowMm2.y + lnB + 2.0 * lnTheta;
  float lnK2 = flowLnK2Inv(lnTheta);
  float lnDs = log(w) + uFlowMm4.x - lnG;
  for (int k = 0; k < 3; k++) {
    float lnNu = (k == 0 ? uFlowMm4.y : k == 1 ? uFlowMm4.z : uFlowMm4.w) - lnG;
    float lnX = lnNu - lnNuS;
    float x3 = exp(lnX / 3.0);
    float lnJt = -1e30;
    float lnAt = -1e30;
    if (x3 < 600.0) {
      float sx = exp(0.5 * lnX) + 1.8877486254 * exp(lnX / 6.0);
      lnJt = lnNth + uFlowMm2.z + lnNuS + 2.0 * log(sx) - x3 - lnK2;
      float hx = uFlowMm3.z * exp(lnNu - lnT);
      float em1 = hx < 1e-3 ? hx * (1.0 + 0.5 * hx + hx * hx / 6.0) : exp(hx) - 1.0;
      lnAt = lnJt - (uFlowMm3.y + 3.0 * lnNu - log(em1));
    }
    float lnJn = uFlowMm2.w + lnNnt + uFlowMm5.x * lnB + uFlowMm5.y * lnNu;
    float lnAn = uFlowMm3.x + lnNnt + uFlowMm5.z * lnB + uFlowMm5.w * lnNu;
    float mj = max(lnJt, lnJn);
    float ma = max(lnAt, lnAn);
    float lnJ = mj + log(exp(lnJt - mj) + exp(lnJn - mj));
    float lnA = ma + log(exp(lnAt - ma) + exp(lnAn - ma));
    // S (1 − e^−Δτ) as a brightness temperature (1e10 K); where the slab is thin, j Δs itself
    float dtau = exp(lnA + lnDs);
    float lnTb = uFlowMm3.w - 2.0 * lnNu;
    float emit = dtau < 1e-3 ? exp(lnJ + lnDs + lnTb) * (1.0 - 0.5 * dtau + dtau * dtau / 6.0) : exp(lnJ - lnA + lnTb) * (1.0 - exp(-dtau));
    float t = k == 0 ? tau.x : k == 1 ? tau.y : tau.z;
    float add = g * emit * exp(-t);
    if (k == 0) {
      acc.x += add;
      tau.x += dtau;
    } else if (k == 1) {
      acc.y += add;
      tau.y += dtau;
    } else {
      acc.z += add;
      tau.z += dtau;
    }
  }
  return 0.0;
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 row = texelFetch(uFlowRows, ivec2(px.y, 0), 0);
  bool mm = uFlowSampling.z > 0.5;
  vec3 acc = vec3(0.0);
  vec3 tau = vec3(0.0);
  float sum = 0.0;
  if (row.x >= 0.0) {
    float omega = 6.2831853072 * (float(px.x) + 0.5) / uFlowGeom.w;
    // The flow's axis in the plane's basis (the start's radius, the direction it turns towards, their normal).
    float cp = cos(row.w);
    float sp = sin(row.w);
    float cw = cos(omega);
    float sw = sin(omega);
    vec3 a = vec3(cp * uFlowGeom.x + sp * uFlowGeom.y * cw, -sp * uFlowGeom.x + cp * uFlowGeom.y * cw, uFlowGeom.y * sw);
    float b = row.x;
    float lz = -b * a.z;
    float b2x3 = 3.0 * b * b;
    float k = uFlowSampling.w;
    float group = uFlowSampling.y;
    float xiG = uFlowSampling.x * group;
    float pick = min(group - 1.0, floor(xiG));
    float xi = xiG - pick;
    vec4 s0 = vec4(row.y, 0.0, row.z, b / row.y);
    vec4 s1 = s0;
    vec4 s2 = s0;
    float ha = 0.0;
    for (int n = 0; n < 128; n++) {
      bool first = (n - 2 * (n / 2)) == 0;
      vec4 from = first ? s0 : s1;
      float h = flowStepLength(from, k);
      vec4 to = flowStep(from, h, b2x3);
      if (first) {
        s1 = to;
        ha = h;
      } else s2 = to;
      bool done = flowEnded(to);
      if (!first || done) {
        float pair = float(n / 2);
        if (pair - group * floor(pair / group) == pick) {
          float hb = first ? 0.0 : h;
          float len = ha + hb;
          float at = xi * len;
          vec4 p = (at < ha || hb == 0.0) ? flowHermite(s0, s1, ha, min(1.0, at / ha)) : flowHermite(s1, s2, hb, (at - ha) / hb);
          sum += flowSample(mm, p, a, lz, group * len, acc, tau);
          if (mm && min(min(tau.x, tau.y), tau.z) > FLOW_TAU_STOP) done = true;
        }
        if (!first) s0 = s2;
      }
      if (done) break;
    }
  }
  vec4 now = mm ? vec4(acc, 1.0) : vec4(sum, 0.0, 0.0, 1.0);
  vec4 prev = texelFetch(uFlowPrev, px, 0);
  gl_FragColor = uFlowFrames > 0.5 ? mix(prev, now, 1.0 / (uFlowFrames + 1.0)) : now;
}
