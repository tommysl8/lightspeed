/**
 * One ray of the accretion flow's map, in float64 (and a float32 mode through Math.fround for the orbit): the
 * twin of one texel of render/shaders/flowMap.frag.glsl, used by the row table (render/flow/flowMap.ts) and the
 * tests (flowRay.test.ts, against the Python reference of scripts/sgra-flow).
 *
 * What (docs/data/blackholes.md §7): a look direction of the camera at angle α from the hole and azimuth ω about the
 * camera–hole axis (measured from the flow's axis projected across that axis) is traced backwards as a null geodesic
 * with photon energy E = 1 at infinity, in the plane of the hole, the camera and the direction, through the flow of
 * model A (sim/blackholes/accretion.ts), adding up its light as it goes.
 *
 * - The start (flowRayStart, the map's row table): the impact parameter b = r sin α / √(1 − 2/r) and dr/dλ = −cos α
 *   for a hovering observer; b = r sin α / (1 − v cos α) and dr/dλ = (v − cos α)/(1 − v cos α), v = √(2/r), for the
 *   raindrop (with 1 − v cos α ≤ 0, inside the horizon, no light from outside arrives: the ray is dark). A camera
 *   beyond FLOW_OUTER_M (400 M, where the flow's light is followed to) starts its rays where they cross it on the way in, at
 *   the azimuth φ₀ they have swept by then (entrySweep: the orbit's integral by Gauss–Legendre quadrature in a
 *   variable that removes the turning point's square root); a ray heading out, or passing outside 400 M, meets no
 *   flow.
 * - The orbit: the Cartesian form of the orbit equation, ẍ = −3b²x/|x|⁵ (exact with the affine parameter λ for
 *   E = 1: (dr/dλ)² = 1 − b²(1 − 2/r)/r², dφ/dλ = b/r²), RK4 in steps that move the point by 0.07 r (0.07 r/max(1, |ẋ|):
 *   the same as 0.07 r min(1, r/b) outside the horizon, where |ẋ| ≈ max(1, b/r); inside it, where a raindrop's rays
 *   leave at |ẋ| up to 40 and a step of 0.07 r min(1, r/b) lost 0.1–0.4 rad of their azimuth, a share falling to
 *   0.025 r by 0.7 M), at most 128 steps;
 *   it ends heading into the horizon, heading out beyond 400 M, or (at 1.3 mm) once the optical depth passes 10.
 * - The light: sampled at one point of every second step (the pair's length times a frame's jitter ξ, placed by
 *   cubic Hermite interpolation of the two steps' ends; with `group` > 1, one pair in `group`, weighted by as many),
 *   outside the horizon and inside 400 M only; the fluid's frequency factor g = ν_∞/ν_emit = 1/(−p·u) from its
 *   Keplerian rotation (r ≥ 6) or the ISCO plunge (inside), with the photon's angular momentum about the flow's axis
 *   λ_z = −b (r̂ × ê)·â (constant along the ray; the physical photon travels opposite to the backward ray). Visible
 *   light is optically thin: I_∞ = Σ W g^(2 − α) j_V (in V = 0 stars per square arcsecond); at 1.3 mm the thermal
 *   and power-law emission and absorption at the emitted frequency, carried front to back from the camera
 *   (T += g S (1 − e^−Δτ) e^−τ, brightness temperatures in units of 1e10 K at 150, 230 and 345 GHz). Accumulating the
 *   map over eight frames of stratified ξ integrates each pair's light exactly.
 *
 * Why: the map is built from the camera, so the flow is drawn from anywhere, inside the photon sphere and inside the
 * horizon included; the orbit's form needs no special case at turning points or for radial rays.
 *
 * Cost: flowRayStart about 0.1 µs a row (the whole row table ≈ 30 µs); flowMarch a few µs a ray in float64 (tests).
 *
 * Twins: render/shaders/flowMap.frag.glsl (line for line), scripts/sgra-flow/flow_camera.py (the reference).
 */
import { flowEmission } from '../../sim/blackholes/accretion';

/**
 * The flow's light is followed out to this radius (units of M), as the reference traces it (riaf_model.py): beyond it
 * the model adds nothing that shows (at 40 M it still added 0.7 % of V, and the edge showed in the sky's √ law).
 */
export const FLOW_OUTER_M = 400;
/** Beyond this radius (units of M) the steps grow in proportion to r (the orbits there are nearly straight). */
export const FLOW_STEP_GROWS_M = 40;
/** RK4 step: this times r min(1, r/b). */
export const FLOW_STEP_K = 0.07;
/** Steps a ray may take. */
export const FLOW_MAX_STEPS = 128;
/** At 1.3 mm a ray stops once its optical depth passes this (e^−10 of what lies behind is left). */
export const FLOW_TAU_STOP = 10;
/** The innermost stable orbit's energy and angular momentum (the plunge inside it). */
export const FLOW_E_ISCO = Math.sqrt(8 / 9);
export const FLOW_L_ISCO = Math.sqrt(12);
/** Keplerian rotation outside this radius (units of M, as the reference: the spherical r). */
export const FLOW_ISCO_M = 6;

/** Where a ray of the map starts: on the camera, or where it first crosses FLOW_OUTER_M. */
export interface FlowRayStart {
  /** False: the ray meets no flow (it heads away beyond 400 M, passes outside it, or carries no light from outside). */
  lit: boolean;
  /** Impact parameter, units of M (≥ 0). */
  b: number;
  /** Start radius (units of M) and dr/dλ there (negative: heading in). */
  r0: number;
  rdot0: number;
  /** Azimuth swept from the camera to the start, in the ray's plane (0 when the camera is inside 400 M). */
  phi0: number;
}

/** Gauss–Legendre nodes and weights on [0, 1] (16 points). */
const GL_X = new Float64Array(16);
const GL_W = new Float64Array(16);
{
  // Newton on the Legendre polynomial P16, from the Chebyshev-like starts.
  const n = 16;
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    GL_X[i] = 0.5 * (1 - x);
    GL_W[i] = 1 / ((1 - x * x) * dp * dp);
  }
}

/**
 * The azimuth a ray of impact parameter b sweeps going in from u = 1/r between uo and u1 (uo < u1, no turning point
 * before u1): ∫ b du / √(1 − b²u²(1 − 2u)), with u = u1 − (u1 − uo)s², so the square root of a turning point at u1
 * (a ray grazing r = 1/u1) cancels; 16-point Gauss–Legendre in s. Radial rays sweep nothing.
 */
export function entrySweep(b: number, uo: number, u1: number): number {
  if (!(b > 0)) return 0;
  const du = u1 - uo;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    const s = GL_X[i];
    const u = u1 - du * s * s;
    const q = 1 - b * b * u * u * (1 - 2 * u);
    sum += (GL_W[i] * 2 * du * s * b) / Math.sqrt(Math.max(q, 1e-300));
  }
  return sum;
}

/**
 * The start of the ray looking at angle α from the hole (given as sin α and cos α, from the gap to the edge in
 * float64), for a camera at r (units of M) in the static or raindrop frame. Writes and returns `out`.
 */
export function flowRayStart(rM: number, frame: 'static' | 'rain', sinA: number, cosA: number, out: FlowRayStart): FlowRayStart {
  let b: number;
  let rdot: number;
  if (frame === 'static') {
    b = (rM * sinA) / Math.sqrt(1 - 2 / rM);
    rdot = -cosA;
  } else {
    const v = Math.sqrt(2 / rM);
    const den = 1 - v * cosA;
    if (!(den > 0)) {
      out.lit = false;
      out.b = 0;
      out.r0 = rM;
      out.rdot0 = 0;
      out.phi0 = 0;
      return out;
    }
    b = (rM * sinA) / den;
    rdot = (v - cosA) / den;
  }
  out.b = Math.abs(b);
  out.phi0 = 0;
  if (rM <= FLOW_OUTER_M) {
    out.lit = true;
    out.r0 = rM;
    out.rdot0 = rdot;
    return out;
  }
  // From beyond 400 M: in to 400 M, if the ray gets there.
  const qOut = 1 - (b * b * (1 - 2 / FLOW_OUTER_M)) / (FLOW_OUTER_M * FLOW_OUTER_M);
  out.lit = rdot < 0 && qOut > 0;
  out.r0 = FLOW_OUTER_M;
  out.rdot0 = out.lit ? -Math.sqrt(qOut) : 0;
  out.phi0 = out.lit ? entrySweep(out.b, 1 / rM, 1 / FLOW_OUTER_M) : 0;
  return out;
}

/** Options of a march: the band, this frame's jitter ξ ∈ [0, 1), one sampled pair in `group`, float32 orbit. */
export interface FlowMarchOptions {
  band: 'visible' | 'mm';
  jitter: number;
  group: number;
  f32?: boolean;
  /** Step factor and step count (the defaults: FLOW_STEP_K, FLOW_MAX_STEPS). */
  stepK?: number;
  maxSteps?: number;
}

const id = (x: number) => x;

/** Orbit state and scratch (nothing allocated per ray). */
const S = new Float64Array(12); // x0 y0 vx0 vy0 | x1 y1 vx1 vy1 | x2 y2 vx2 vy2
const P = new Float64Array(4); // a sample's x y vx vy
const acc = new Float64Array(2);
const T = new Float64Array(3); // optical depth at the three 1.3 mm frequencies

/** ẍ = −3b²x/|x|⁵ at (x, y), into acc, rounded by F. */
function accel(F: (x: number) => number, b2x3: number, x: number, y: number): void {
  const ir = F(1 / Math.sqrt(F(F(x * x) + F(y * y))));
  const ir2 = F(ir * ir);
  const k = F(-b2x3 * F(F(ir2 * ir2) * ir));
  acc[0] = F(k * x);
  acc[1] = F(k * y);
}

/**
 * One RK4 step of length h from state slot `from` into slot `to` of S (slots 0, 1, 2 of four numbers).
 */
function rk4(F: (x: number) => number, b2x3: number, h: number, from: number, to: number): void {
  const x = S[from];
  const y = S[from + 1];
  const vx = S[from + 2];
  const vy = S[from + 3];
  const hh = F(0.5 * h);
  accel(F, b2x3, x, y);
  const k1vx = acc[0];
  const k1vy = acc[1];
  accel(F, b2x3, F(x + F(hh * vx)), F(y + F(hh * vy)));
  const k2vx = acc[0];
  const k2vy = acc[1];
  const k2x = F(vx + F(hh * k1vx));
  const k2y = F(vy + F(hh * k1vy));
  accel(F, b2x3, F(x + F(hh * k2x)), F(y + F(hh * k2y)));
  const k3vx = acc[0];
  const k3vy = acc[1];
  const k3x = F(vx + F(hh * k2vx));
  const k3y = F(vy + F(hh * k2vy));
  accel(F, b2x3, F(x + F(h * k3x)), F(y + F(h * k3y)));
  const k4vx = acc[0];
  const k4vy = acc[1];
  const k4x = F(vx + F(h * k3vx));
  const k4y = F(vy + F(h * k3vy));
  const h6 = F(h / 6);
  S[to] = F(x + F(h6 * F(F(vx + F(2 * F(k2x + k3x))) + k4x)));
  S[to + 1] = F(y + F(h6 * F(F(vy + F(2 * F(k2y + k3y))) + k4y)));
  S[to + 2] = F(vx + F(h6 * F(F(k1vx + F(2 * F(k2vx + k3vx))) + k4vx)));
  S[to + 3] = F(vy + F(h6 * F(F(k1vy + F(2 * F(k2vy + k3vy))) + k4vy)));
}

/**
 * The step length at slot `at`: k r / max(1, |ẋ|), so a step moves the point by at most k r (for a ray far out,
 * k r; along the photon sphere, k r²/b; inside the horizon, where |ẋ| grows as r^−3/2, still a fixed share of r),
 * with k itself falling to 0.35 k between r = 2 M and 0.7 M and growing as r/40 beyond 40 M.
 */
function stepAt(F: (x: number) => number, k: number, at: number): number {
  const r = F(Math.sqrt(F(F(S[at] * S[at]) + F(S[at + 1] * S[at + 1]))));
  const sp = F(Math.sqrt(F(F(S[at + 2] * S[at + 2]) + F(S[at + 3] * S[at + 3]))));
  // inside the horizon, down to 0.35 of it by r = 0.7 M (the orbit bends fastest there)
  const kin = F(F(k * Math.min(1, Math.max(0.35, F(0.5 * r)))) * Math.max(1, F(r / FLOW_STEP_GROWS_M)));
  return F(F(kin * r) / Math.max(1, sp));
}

/**
 * Follow a ray's orbit alone (the tests' check against the exact sweeps): calls visit(x, y, λ) at the start and after
 * every step, in the ray's plane (x along the start's radius). Returns the steps taken.
 */
export function flowOrbit(start: FlowRayStart, f32: boolean, visit: (x: number, y: number, lambda: number) => void, maxSteps = FLOW_MAX_STEPS, stepK = FLOW_STEP_K): number {
  const F = f32 ? Math.fround : id;
  const b = F(start.b);
  const b2x3 = F(3 * F(b * b));
  S[0] = F(start.r0);
  S[1] = 0;
  S[2] = F(start.rdot0);
  S[3] = F(b / F(start.r0));
  let lam = 0;
  visit(S[0], S[1], 0);
  let n = 0;
  for (; n < maxSteps; n++) {
    const h = stepAt(F, stepK, 0);
    rk4(F, b2x3, h, 0, 4);
    lam += h;
    S[0] = S[4];
    S[1] = S[5];
    S[2] = S[6];
    S[3] = S[7];
    visit(S[0], S[1], lam);
    if (ended(S[0], S[1], S[2], S[3])) return n + 1;
  }
  return n;
}

/** The ray has ended: heading into the horizon, or heading out beyond 400 M. */
function ended(x: number, y: number, vx: number, vy: number): boolean {
  const r2 = x * x + y * y;
  const out = x * vx + y * vy;
  return (r2 <= 4 && out < 0) || (r2 > FLOW_OUTER_M * FLOW_OUTER_M && out > 0);
}

/** Cubic Hermite position and velocity at fraction t of a step of length h between slots a and b of S, into P. */
function hermite(F: (x: number) => number, a: number, bb: number, h: number, t: number): void {
  const t2 = F(t * t);
  const t3 = F(t2 * t);
  const h00 = F(F(F(2 * t3) - F(3 * t2)) + 1);
  const h10 = F(F(t3 - F(2 * t2)) + t);
  const h01 = F(F(-2 * t3) + F(3 * t2));
  const h11 = F(t3 - t2);
  // derivatives with respect to t, over h
  const d00 = F(F(6 * t2) - F(6 * t));
  const d10 = F(F(F(3 * t2) - F(4 * t)) + 1);
  const d11 = F(F(3 * t2) - F(2 * t));
  for (let c = 0; c < 2; c++) {
    const p0 = S[a + c];
    const p1 = S[bb + c];
    const v0 = S[a + 2 + c];
    const v1 = S[bb + 2 + c];
    P[c] = F(F(F(F(h00 * p0) + F(F(h10 * h) * v0)) + F(h01 * p1)) + F(F(h11 * h) * v1));
    P[2 + c] = F(F(F(F(F(d00 * F(p0 - p1)) / h) + F(d10 * v0)) + F(d11 * v1)));
  }
}

/**
 * The fluid's frequency factor g = ν_∞/ν_emit at P (the backward ray's position and velocity there), for photon
 * angular momentum lz about the flow's axis; rho2 the squared distance from the axis. As riaf_model.local, clipped
 * to [1e-4, 1e4].
 */
export function fluidG(r: number, rho2: number, rdotBack: number, lz: number): number {
  const f = 1 - 2 / r;
  let mku: number;
  if (r >= FLOW_ISCO_M) {
    const om = Math.pow(r, -1.5);
    const ut = 1 / Math.sqrt(Math.max(f - rho2 * om * om, 1e-6));
    mku = ut * (1 - om * lz);
  } else {
    const utp = FLOW_E_ISCO / f;
    const uphi = FLOW_L_ISCO / (r * r);
    const ur = -Math.sqrt(Math.max(FLOW_E_ISCO * FLOW_E_ISCO - f * (1 + rho2 * uphi * uphi), 0));
    // the physical photon's covariant p_r = (dr/dλ)/f, travelling opposite to the backward ray
    const kr = -rdotBack / f;
    mku = utp - kr * ur - lz * uphi;
  }
  const g = 1 / mku;
  return g > 0 ? Math.min(Math.max(g, flowEmission.gMin), flowEmission.gMax) : flowEmission.gMin;
}

/** ln K2(1/Θ) for Θ ≥ 2 (the flow's electrons are at Θ ≥ 2 inside 400 M): the small-argument series, within 2e−4 there. */
function lnK2Inv(lnTheta: number): number {
  const x = Math.exp(-lnTheta);
  const k2 = 2 / (x * x) - 0.5 - ((x * x) / 8) * (Math.log(x / 2) + 0.5772156649015329 - 0.75);
  return Math.log(k2);
}

/**
 * The light at one sample: position (x, y) in the ray's plane with (ax, ay, an) the flow's axis in that plane's basis,
 * the backward ray's dr/dλ, the photon's lz, weight W (units of M). Visible: returns the addition to I_∞. 1.3 mm:
 * adds to out[0..2] with the optical depths in T (returns 0).
 */
function sampleLight(band: 'visible' | 'mm', x: number, y: number, rdotBack: number, ax: number, ay: number, an: number, lz: number, W: number, out: Float64Array): number {
  const r = Math.sqrt(x * x + y * y);
  if (!(r > 2) || r >= FLOW_OUTER_M) return 0;
  const z = x * ax + y * ay;
  const cr = x * ay - y * ax;
  const rho2 = Math.max(r * r * an * an + cr * cr, 1e-12);
  const z2r = Math.min((z * z) / rho2, 1e4);
  const g = fluidG(r, rho2, rdotBack, lz);
  const lnRho2 = Math.log(rho2);
  const lnR = Math.log(r);
  const e = flowEmission;
  // g^(2 − α) = g^2.5 for the power law's p = 2 (as the GPU computes it: g² √g)
  if (band === 'visible') return W * Math.exp(e.lnV + e.cRho * lnRho2 + e.cR * lnR + e.cZ * z2r) * (e.gExp === 2.5 ? g * g * Math.sqrt(g) : Math.pow(g, e.gExp));
  const lnG = Math.log(g);
  // 1.3 mm: the thermal electrons (Leung et al. 2011) and the power law (Pandya et al. 2016), absorption by
  // Kirchhoff's law for the thermal part, at the emitted frequency ν/g.
  const lnNth = e.lnN0 - 0.55 * lnRho2 - 0.5 * z2r;
  const lnNnt = e.lnN0Nt - 1.45 * lnRho2 - 0.5 * z2r;
  const lnT = e.lnT0 - 0.84 * lnR;
  const lnTheta = e.lnThetaPerK + lnT;
  const lnB = 0.5 * (e.lnBSquared - 0.55 * lnRho2 - 0.5 * z2r - lnR);
  const lnNuS = e.lnNuS + lnB + 2 * lnTheta;
  const lnK2 = lnK2Inv(lnTheta);
  const lnDs = Math.log(W) + e.lnRg - lnG; // the fluid's path length, cm
  for (let k = 0; k < 3; k++) {
    const lnNu = Math.log(e.mmHz[k]) - lnG;
    // X = ν/ν_s; beyond X^(1/3) = 600 the thermal emission is e^−600: none (and X itself may overflow)
    const lnX = lnNu - lnNuS;
    const x3 = Math.exp(lnX / 3);
    let lnJt = -1e30;
    let lnAt = -1e30;
    if (x3 < 600) {
      const sx = Math.exp(lnX / 2) + 1.8877486253633868 * Math.exp(lnX / 6); // √X + 2^(11/12) X^(1/6)
      lnJt = lnNth + e.lnThermalJ + lnNuS + 2 * Math.log(sx) - x3 - lnK2;
      const hx = e.hOverK * Math.exp(lnNu - lnT);
      const lnBnu = e.lnTwoHOverC2 + 3 * lnNu - Math.log(hx < 1e-3 ? hx * (1 + 0.5 * hx + (hx * hx) / 6) : Math.expm1(hx));
      lnAt = lnJt - lnBnu;
    }
    const lnJn = e.lnPowerLawJ + lnNnt + e.pjB * lnB + e.pjNu * lnNu;
    const lnAn = e.lnPowerLawA + lnNnt + e.paB * lnB + e.paNu * lnNu;
    const mj = Math.max(lnJt, lnJn);
    const ma = Math.max(lnAt, lnAn);
    const lnJ = mj + Math.log(Math.exp(lnJt - mj) + Math.exp(lnJn - mj));
    const lnA = ma + Math.log(Math.exp(lnAt - ma) + Math.exp(lnAn - ma));
    // the source function as a brightness temperature at ν/g (1e10 K) times the slab's 1 − e^−Δτ
    // S (1 − e^−Δτ): where the slab is thin, S Δτ = j Δs itself (so a slab that neither emits nor absorbs, far off
    // the flow's plane, gives 0 rather than ∞ × 0)
    const dtau = Math.exp(lnA + lnDs);
    const lnTb = e.lnTbUnit - 2 * lnNu;
    const add = dtau < 1e-3 ? Math.exp(lnJ + lnDs + lnTb) * (1 - 0.5 * dtau + (dtau * dtau) / 6) : Math.exp(lnJ - lnA + lnTb) * -Math.expm1(-dtau);
    out[k] += g * add * Math.exp(-T[k]);
    T[k] += dtau;
  }
  return 0;
}

/**
 * March one texel's ray: the start from flowRayStart, the flow's axis at angle i from the camera's radial direction
 * (cosI, sinI), the texel's azimuth ω. Writes the visible I_∞ (V = 0 stars per arcsec²) into out[0], or the 1.3 mm
 * brightness temperatures (1e10 K) at 150, 230 and 345 GHz into out[0..2]; returns the steps taken.
 */
export function flowMarch(start: FlowRayStart, cosI: number, sinI: number, omega: number, opts: FlowMarchOptions, out: Float64Array): number {
  out[0] = out[1] = out[2] = 0;
  T[0] = T[1] = T[2] = 0;
  if (!start.lit) return 0;
  const F = opts.f32 ? Math.fround : id;
  const k = opts.stepK ?? FLOW_STEP_K;
  const maxSteps = opts.maxSteps ?? FLOW_MAX_STEPS;
  const group = Math.max(1, Math.floor(opts.group));
  const xiG = opts.jitter * group;
  const pick = Math.min(group - 1, Math.floor(xiG));
  const xi = xiG - pick;
  // The flow's axis in the plane's basis (the start's radius, the direction it turns towards, their normal).
  const cp = Math.cos(start.phi0);
  const sp = Math.sin(start.phi0);
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const ax = F(cp * cosI + sp * sinI * cw);
  const ay = F(-sp * cosI + cp * sinI * cw);
  const an = F(sinI * sw);
  const b = F(start.b);
  const lz = -b * an;
  const b2x3 = F(3 * F(b * b));
  S[0] = F(start.r0);
  S[1] = 0;
  S[2] = F(start.rdot0);
  S[3] = F(b / F(start.r0));
  let sum = 0;
  let ha = 0;
  let n = 0;
  let done = false;
  for (; n < maxSteps && !done; n++) {
    const first = (n & 1) === 0;
    const from = first ? 0 : 4;
    const to = first ? 4 : 8;
    const h = stepAt(F, k, from);
    rk4(F, b2x3, h, from, to);
    done = ended(S[to], S[to + 1], S[to + 2], S[to + 3]);
    if (first) ha = h;
    // A pair is complete (or the ray ended after its first step): sample it if it is this group's pick.
    if (!first || done) {
      const pair = n >> 1;
      if (pair % group === pick) {
        const hb = first ? 0 : h;
        const len = ha + hb;
        const at = xi * len;
        if (at < ha || hb === 0) hermite(F, 0, 4, ha, Math.min(1, at / ha));
        else hermite(F, 4, 8, hb, (at - ha) / hb);
        const r = Math.sqrt(P[0] * P[0] + P[1] * P[1]);
        const rdot = (P[0] * P[2] + P[1] * P[3]) / r;
        sum += sampleLight(opts.band, P[0], P[1], rdot, ax, ay, an, lz, group * len, out);
        if (opts.band === 'mm' && Math.min(T[0], T[1], T[2]) > FLOW_TAU_STOP) done = true;
      }
      // the pair's end starts the next pair
      if (!first) {
        S[0] = S[8];
        S[1] = S[9];
        S[2] = S[10];
        S[3] = S[11];
      }
    }
  }
  if (opts.band === 'visible') out[0] = sum;
  return n;
}
