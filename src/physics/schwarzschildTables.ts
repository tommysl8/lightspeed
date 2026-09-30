/**
 * The per-frame lens tables: the forward table (the deflection against the look angle), the inverse
 * table (the look angle of the image whose sweep to infinity is D) and the magnification bound the
 * vertex pre-cull reads.
 *
 * What and how: the forward table holds δ(α) = Δφ(α) − (π − α) at n = 512 nodes uniform in s = ln g + 3g,
 * g = α − α_edge, from g_min to the span π − α_edge, with a ghost node at each end (below node 0 δ is linear
 * in s, so the low ghost is 2δ₀ − δ₁; the high ghost is the odd reflection δ(π + x) = −δ(π − x) through
 * straight out). g_min = min(1e-9 span, 1e-5 α_edge): 1e-9 of the span in general, and for
 * a far static observer (beyond about 6 × 10⁴ M, where 1e-9 of the span is no longer deep in the edge's
 * logarithmic regime) small enough that b/b_c − 1 ≤ 1e-5 at node 0, so the table reaches Δφ = 4π and the
 * linear continuation below it is exact to O(d ln d). Each node's gap solves s = ln g + 3g by Newton in ln g,
 * and its δ comes from the closed forms of physics/schwarzschild.ts (escapeSweepInto with the gap, so the
 * edge is resolved to the last bit). It is read by Catmull–Rom in s (forwardEval: the GLSL's lensDelta, the
 * same arithmetic). The inverse table is derived from that spline alone by a walk down the nodes: row 0 over
 * z = asinh((π − D)/(2θ_E)) for D ∈ (0, 2π) (orders 0 and 1; D from 2π − 1e-9 at node 0 to 1e-9 at node
 * n − 1), row 1 uniform in D ∈ [2π, 4π) (orders 2 and 3), ghosts at both ends of both rows; each target is
 * bracketed between two forward nodes and polished by Newton in ln g on the spline, and the node stores
 * y = ln(α − α_edge) and m = −ln|dΔφ/dα|. inverseEval (the GLSL's lensInverse) reads y by cubic Hermite
 * between the two nodes about D, with the nodes' exact slopes, which the table already holds:
 * dy/dD = −e^(m − y), so dy/dz = 2θ_E cosh z e^(m − y) on row 0 (a Catmull–Rom read of y is 24 times worse
 * for a raindrop at 0.02 M, where the whole sky crowds into the upper hemisphere and dα/dD reaches 11 straight
 * out: 0.068 px against 0.0029); and m by Catmull–Rom.
 * buildMuBound turns the inverse table into an upper bound of the order-0 magnification against the
 * source's straight-line angle ψ from the axis, 16 nodes uniform in ln ψ. Rebuilt in place when the
 * observer's frame changes or ln r or ln(r − 2) moves by more than 1e-7.
 *
 * Why: one table a frame is the whole lens for every pixel and every vertex; storing δ rather than Δφ
 * spends float32's relative precision where δ is small, far from the hole; the variable s spreads the
 * nodes both into the edge (ln g) and over the whole sky (3g): Catmull–Rom at 512 nodes is within
 * 0.004 device px of look angle everywhere (docs/data/blackholes.md §4 has the measured errors). The inverse table's asinh
 * stretch keeps the Einstein ring resolved at any distance.
 *
 * Cost: both builds together within 0.4 ms of main thread, with no allocation (typed arrays and scratch
 * objects reused; 513 closed-form sweeps, then about 1,500 spline evaluations for the 580 inverse nodes).
 * buildMuBound 150 inverse reads, a few microseconds.
 *
 * Twins: the GLSL reads the same tables with the same arithmetic (render/shaders/lens.glsl: lensDelta,
 * lensInverse, lensMuBound) and physics/lensMirror32.ts mirrors it in float32. The texture layouts:
 * uLensFwdTab texel i = delta[i] (node i − 1), uLensFwd = (s0, 1/ds, n, κ); uLensInvTab row 0 texel i =
 * (y[i], m[i]), row 1 texel i = (rel.y[i], rel.m[i]), uLensInv = (z0, 1/dz, n, 2θ_E), uLensInvRel =
 * (rel.d0, 1/rel.dd, rel.n, 0); uLensMuBound = the 16 bounds, uLensMuBoundAxis = (ln ψ_min, 1/Δ ln ψ)
 * from muBoundAxisInto. inverseEval's comment gives lensInverse's arithmetic step by step.
 */
import { edgeAngle, escapeFromRegs, escapeRegs, ESCAPE_ALPHA, ESCAPE_GAP, ESCAPE_OUT, ESCAPE_R, spanAngle, type LensObserver } from './schwarzschild';

/** Nodes of the per-frame forward table. */
export const FWD_NODES = 512;
/** κ in the node variable s = ln g + κ g, g = α − α_edge. */
export const FWD_KAPPA = 3;
/** Nodes of the inverse table's first row (orders 0 and 1: D ∈ (0, 2π)). */
export const INV_NODES = 512;
/** Nodes of its second row (orders 2 and 3: D ∈ [2π, 4π)). */
export const REL_NODES = 64;
/** Nodes of the per-frame magnification bound used by the vertex pre-cull. */
export const MU_BOUND_NODES = 16;
/** The bound's first node, ψ_min, as a share of the Einstein angle. */
export const MU_BOUND_PSI_MIN_SHARE = 1 / 64;
/**
 * ln|μ| written into the bound's node 0 (sources within ψ₁ ≈ θ_E/32 of the axis) unless the caller passes
 * its catalogue's finite-source cap (muBoundCapLn): e^60 culls nothing.
 */
export const MU_BOUND_NO_CULL_LN = 60;

/** The smallest gap of the forward table, as a share of the span π − α_edge ... */
const G_MIN_SHARE = 1e-9;
/** ... or of the edge angle, whichever is less (far observers: b/b_c − 1 ≤ 1e-5 at node 0). */
const G_MIN_EDGE_SHARE = 1e-5;
/** Row 0 of the inverse table runs from D = 2π − INV_D_END (node 0) to INV_D_END (node n − 1). */
const INV_D_END = 1e-9;
const TWO_PI = 2 * Math.PI;

/**
 * The per-frame forward table: δ(α) = Δφ(α) − (π − α) at nodes uniform in s = ln g + 3g, g = α − edge, from
 * g_min = 1e-9·span to span = π − edge, with one ghost node at each end (index 0 is node −1). Built in
 * float64; the GPU gets Float32 copies of `delta`.
 */
export interface ForwardTable {
  obs: LensObserver;
  /** α_edge (edgeAngle(obs)). */
  edge: number;
  /** π − edge. */
  span: number;
  n: number;
  kappa: number;
  /** s at node 0. */
  s0: number;
  /** Node spacing in s. */
  ds: number;
  /** n + 2 values: δ at nodes −1 … n. */
  delta: Float64Array;
  /** Increments on every rebuild (uploads follow it). */
  version: number;
  /** n + 2 values: ln g at nodes −1 … n (the inverse walk starts from them). */
  lnGap?: Float64Array;
}

/**
 * ln g of the gap whose node variable is s = ln g + κ g: Newton in y = ln g on y + κ e^y − s, which is convex
 * and increasing, from a start on its right (y = s when s ≤ 3; ln(s/κ) beyond), so it falls monotonically
 * to the root; quadratic, 1–6 steps.
 */
export function lnGapOfS(s: number, kappa: number = FWD_KAPPA): number {
  return lnGapNewton(s, kappa, s <= 3 ? s : Math.log(s / kappa));
}

/** Newton for lnGapOfS from a start y (any start converges; one on the right of the root falls to it). */
function lnGapNewton(s: number, kappa: number, y: number): number {
  for (let k = 0; k < 40; k++) {
    const e = kappa * Math.exp(y);
    const dy = (y + e - s) / (1 + e);
    y -= dy;
    if (Math.abs(dy) <= 1e-16 * Math.max(1, Math.abs(y))) break;
  }
  return y;
}

/**
 * Registers of this module's kernels (V8 boxes doubles passed to or returned from calls it does not inline:
 * see physics/schwarzschild.ts's REG), so the builds allocate nothing.
 */
const TR = new Float64Array(24);
// evalAtY: in y → (Δφ, dΔφ/dy, dΔφ/dα)
const EV_Y = 0;
const EV_SWEEP = 1;
const EV_DY = 2;
const EV_DA = 3;
// solveLnGap / solveTarget: in (D, start y) → (y, m)
const SV_D = 4;
const SV_Y0 = 5;
const SV_Y = 6;
const SV_M = 7;
// kInverse: in D → (α, m, y)
const IV_D = 8;
const IV_ALPHA = 9;
const IV_M = 10;
// lnMuOrder0 kernel: in ψ → ln μ₀
const MU_PSI = 11;
const MU_OUT = 12;
// kForwardGap: in g → (δ, dδ/dα, Δφ, dΔφ/dα), all NaN when g ≤ 0 (captured)
const FW_G = 13;
const FW_DELTA = 14;
const FW_DDELTA = 15;
const FW_SWEEP = 16;
const FW_DSWEEP = 17;

/**
 * The tables' registers, for callers that must not allocate either (physics/lensPoint.ts): write the gap
 * into tableRegs[TABLE_FWD_G] and call forwardFromRegs (then read TABLE_FWD_SWEEP, TABLE_FWD_DSWEEP), or D into
 * tableRegs[TABLE_INV_D] and call inverseFromRegs (then read TABLE_INV_ALPHA, TABLE_INV_M).
 */
export const tableRegs = TR;
export const TABLE_FWD_G = FW_G;
export const TABLE_FWD_SWEEP = FW_SWEEP;
export const TABLE_FWD_DSWEEP = FW_DSWEEP;
export const TABLE_INV_D = IV_D;
export const TABLE_INV_ALPHA = IV_ALPHA;
export const TABLE_INV_M = IV_M;

/** δ at gap g by the closed form, for the observer (NaN if the ray were captured, which a positive gap never is). */
function deltaExactReg(rain: boolean, r: number, edge: number, span: number, g: number): number {
  escapeRegs[ESCAPE_R] = r;
  escapeRegs[ESCAPE_ALPHA] = edge + g;
  escapeRegs[ESCAPE_GAP] = g;
  escapeFromRegs(rain);
  return escapeRegs[ESCAPE_OUT] - (span - g);
}

/** Builds the forward table (or rebuilds `reuse` in place: no allocation when n is unchanged). */
export function buildForwardTable(obs: LensObserver, n: number = FWD_NODES, reuse?: ForwardTable): ForwardTable {
  const t: ForwardTable =
    reuse && reuse.n === n && reuse.lnGap
      ? reuse
      : { obs: { frame: obs.frame, r: obs.r }, edge: 0, span: Math.PI, n, kappa: FWD_KAPPA, s0: 0, ds: 0, delta: new Float64Array(n + 2), version: reuse?.version ?? 0, lnGap: new Float64Array(n + 2) };
  const K = FWD_KAPPA;
  const edge = edgeAngle(obs);
  const span = spanAngle(obs);
  const gMin = Math.min(G_MIN_SHARE * span, G_MIN_EDGE_SHARE * edge);
  const s0 = Math.log(gMin) + K * gMin;
  const s1 = Math.log(span) + K * span;
  const ds = (s1 - s0) / (n - 1);
  t.obs.frame = obs.frame;
  t.obs.r = obs.r;
  t.edge = edge;
  t.span = span;
  t.kappa = K;
  t.s0 = s0;
  t.ds = ds;
  const D = t.delta;
  const Y = t.lnGap as Float64Array;
  const rain = obs.frame === 'rain';
  const r = obs.r;
  let y = Math.log(gMin);
  let g = gMin;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      y = Math.log(span);
      g = span;
    } else if (i > 0) {
      // Newton for s = y + κ e^y from the previous node, one step ahead (s rises by Δs); the loop is written
      // out here rather than called (a call would box its doubles)
      // (second order: dy/ds = 1/(1 + κg), d²y/ds² = −κg/(1 + κg)³; then Newton, whose steps fall below 1e-12
      // after one or two: a node off its s by 1e-12 moves the table by under 1e-12 rad)
      const si = s0 + i * ds;
      const q = 1 / (1 + K * g);
      y += ds * q - 0.5 * ds * ds * K * g * q * q * q;
      for (let k = 0; k < 40; k++) {
        const e = K * Math.exp(y);
        const dy = (y + e - si) / (1 + e);
        y -= dy;
        if (Math.abs(dy) <= 1e-12 * Math.max(1, Math.abs(y))) break;
      }
      g = Math.exp(y);
    }
    Y[i + 1] = y;
    escapeRegs[ESCAPE_R] = r;
    escapeRegs[ESCAPE_ALPHA] = edge + g;
    escapeRegs[ESCAPE_GAP] = g;
    escapeFromRegs(rain);
    D[i + 1] = escapeRegs[ESCAPE_OUT] - (span - g);
  }
  // below node 0 δ is linear in s (to 1e-9 of the edge)
  D[0] = 2 * D[1] - D[2];
  Y[0] = lnGapNewton(s0 - ds, K, Y[1]);
  // beyond straight out, the odd reflection δ(π + x) = −δ(π − x)
  const yn = lnGapNewton(s1 + ds, K, Y[n]);
  const gn = Math.exp(yn);
  Y[n + 1] = yn;
  D[n + 1] = -deltaExactReg(rain, r, edge, span, span - (gn - span));
  t.version++;
  return t;
}

/**
 * Whether the tables must be rebuilt for `next` after being built for `prev`: a change of frame, or
 * |Δ ln r| > 1e-7, or |Δ ln(r − 2)| > 1e-7 (near the hover floor the lens depends on ln(r − 2M): a 1e-7
 * change of r there is a 10 % change of the height), or r − 2 changing sign (a fall through the horizon).
 */
export function tableNeedsRebuild(prev: LensObserver, next: LensObserver): boolean {
  if (prev.frame !== next.frame) return true;
  if (prev.r === next.r) return false;
  if (!(Math.abs(Math.log(next.r / prev.r)) <= 1e-7)) return true;
  const a = prev.r - 2;
  const b = next.r - 2;
  if (a > 0 !== b > 0) return true;
  return !(Math.abs(Math.log(b / a)) <= 1e-7);
}

/** Output of forwardEval (a reused object: no allocation per call). */
export interface ForwardSample {
  captured: boolean;
  /** δ(α). */
  delta: number;
  /** dδ/dα. */
  dDelta: number;
  /** Δφ = δ + π − α. */
  sweep: number;
  /** dΔφ/dα = dδ/dα − 1 (negative). */
  dSweep: number;
}

/** Catmull–Rom in s, exactly the GLSL's arithmetic in float64 (lensDelta): alpha from the hole's direction. */
export function forwardEval(t: ForwardTable, alpha: number, out: ForwardSample): ForwardSample {
  return forwardEvalGap(t, alpha - t.edge, out);
}

/**
 * forwardEval at the gap g = α − α_edge (which callers near the edge know better than α). The arithmetic
 * (the GLSL's lensDelta repeats it): x = (s − s0)/Δs; x < 0: δ = δ₀ + (δ₁ − δ₀)x; else i = min(⌊x⌋, n − 2), t = x − i,
 * p0 … p3 = texels i … i + 3, a = −p0 + 3p1 − 3p2 + p3, b = 2p0 − 5p1 + 4p2 − p3, c = p2 − p0,
 * δ = ½(2p1 + t(c + t(b + ta))), dδ/ds = ½(c + t(2b + 3at))/Δs; dδ/dα = (dδ/ds)(1/g + κ).
 */
export function forwardEvalGap(t: ForwardTable, g: number, out: ForwardSample): ForwardSample {
  TR[FW_G] = g;
  kForwardGap(t);
  out.captured = !(g > 0);
  out.delta = TR[FW_DELTA];
  out.dDelta = TR[FW_DDELTA];
  out.sweep = TR[FW_SWEEP];
  out.dSweep = TR[FW_DSWEEP];
  return out;
}

/** forwardEvalGap from the registers (tableRegs[TABLE_FWD_G] → TABLE_FWD_SWEEP, TABLE_FWD_DSWEEP): no allocation. */
export function forwardFromRegs(t: ForwardTable): void {
  kForwardGap(t);
}

/** Kernel of forwardEvalGap: TR[FW_G] → TR[FW_DELTA … FW_DSWEEP]. */
function kForwardGap(t: ForwardTable): void {
  const g = TR[FW_G];
  if (!(g > 0)) {
    TR[FW_DELTA] = NaN;
    TR[FW_DDELTA] = NaN;
    TR[FW_SWEEP] = NaN;
    TR[FW_DSWEEP] = NaN;
    return;
  }
  const s = Math.log(g) + t.kappa * g;
  const x = (s - t.s0) / t.ds;
  const D = t.delta;
  let delta: number;
  let dds: number;
  if (x < 0) {
    delta = D[1] + (D[2] - D[1]) * x;
    dds = (D[2] - D[1]) / t.ds;
  } else {
    let i = Math.floor(x);
    if (i > t.n - 2) i = t.n - 2;
    const u = x - i;
    const p0 = D[i];
    const p1 = D[i + 1];
    const p2 = D[i + 2];
    const p3 = D[i + 3];
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const c = p2 - p0;
    delta = 0.5 * (2 * p1 + u * (c + u * (b + u * a)));
    dds = (0.5 * (c + u * (2 * b + 3 * a * u))) / t.ds;
  }
  const dDelta = dds * (1 / g + t.kappa);
  TR[FW_DELTA] = delta;
  TR[FW_DDELTA] = dDelta;
  TR[FW_SWEEP] = delta + t.span - g;
  TR[FW_DSWEEP] = dDelta - 1;
}

/**
 * The per-frame inverse table, derived from the forward spline by one walk down its nodes (no closed-form
 * evaluations): row 0 over z = asinh((π − D)/(2θ_E)) (D ∈ (0, 2π): orders 0 and 1), row 1 uniform in
 * D ∈ [2π, 4π) (orders 2 and 3). Each node stores y = ln(α − edge) and m = −ln|dΔφ/dα|.
 */
export interface InverseTable {
  fwd: ForwardTable;
  /** Einstein angle θ_E: α at D = π. */
  thetaE: number;
  z0: number;
  dz: number;
  n: number;
  /** n + 2 each (ghosts at both ends). */
  y: Float64Array;
  m: Float64Array;
  rel: { d0: number; dd: number; n: number; y: Float64Array; m: Float64Array };
  version: number;
}

/** The forward nodes' sweeps Φ_i and their slopes dΦ/dy (i = 0 … n − 1), filled at the start of each inverse build. */
let nodePhi = new Float64Array(0);
let nodeSlope = new Float64Array(0);

/**
 * Kernel: the forward spline at y = TR[EV_Y] = ln g, as forwardEvalGap but from y (so s = y + κ e^y needs
 * no logarithm) → TR[EV_SWEEP] = Δφ, TR[EV_DY] = dΔφ/dy, TR[EV_DA] = dΔφ/dα.
 */
function evalAtY(t: ForwardTable): void {
  const y = TR[EV_Y];
  const g = Math.exp(y);
  const x = (y + t.kappa * g - t.s0) / t.ds;
  const D = t.delta;
  let delta: number;
  let dds: number;
  if (x < 0) {
    delta = D[1] + (D[2] - D[1]) * x;
    dds = (D[2] - D[1]) / t.ds;
  } else {
    let i = Math.floor(x);
    if (i > t.n - 2) i = t.n - 2;
    const u = x - i;
    const p0 = D[i];
    const p1 = D[i + 1];
    const p2 = D[i + 2];
    const p3 = D[i + 3];
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * p0 - 5 * p1 + 4 * p2 - p3;
    const c = p2 - p0;
    delta = 0.5 * (2 * p1 + u * (c + u * (b + u * a)));
    dds = (0.5 * (c + u * (2 * b + 3 * a * u))) / t.ds;
  }
  TR[EV_SWEEP] = delta + t.span - g;
  TR[EV_DY] = dds * (1 + t.kappa * g) - g;
  TR[EV_DA] = dds * (1 / g + t.kappa) - 1;
}

/**
 * Kernel: ln g where the forward spline's Δφ equals D = TR[SV_D], by Newton in y = ln g from TR[SV_Y0] →
 * TR[SV_Y], TR[SV_M] (= −ln|dΔφ/dα| there). From the Hermite start of solveTarget (within about 1e-8) one step
 * usually suffices: Newton squares the error, so a step under 1e-7 leaves y within about 1e-14, and m is taken
 * at the point before that step (within 1e-7).
 */
function solveLnGap(t: ForwardTable): void {
  const D = TR[SV_D];
  let y = TR[SV_Y0];
  let dAlpha = -1;
  for (let k = 0; k < 16; k++) {
    TR[EV_Y] = y;
    evalAtY(t);
    const dy = (TR[EV_SWEEP] - D) / TR[EV_DY];
    dAlpha = TR[EV_DA];
    y -= dy;
    if (Math.abs(dy) < 1e-7) break;
  }
  TR[SV_Y] = y;
  TR[SV_M] = -Math.log(-dAlpha);
}

/** The forward nodes' sweeps and slopes, for the walk (Φ_i = δ_i + span − g_i, dΦ/dy from the spline's tangent). */
function prepareNodes(t: ForwardTable): void {
  const n = t.n;
  if (nodePhi.length < n) {
    nodePhi = new Float64Array(n);
    nodeSlope = new Float64Array(n);
  }
  const D = t.delta;
  const Y = t.lnGap as Float64Array;
  for (let i = 0; i < n; i++) {
    const g = Math.exp(Y[i + 1]);
    nodePhi[i] = D[i + 1] + t.span - g;
    nodeSlope[i] = ((D[i + 2] - D[i]) / (2 * t.ds)) * (1 + t.kappa * g) - g;
  }
}

/**
 * Walks targets D = TR[SV_D] (decreasing from call to call, D ≥ 0) down the forward nodes from node `from`;
 * solves each (TR[SV_Y], TR[SV_M]) and returns the node reached, so the next target resumes there.
 */
function solveTarget(t: ForwardTable, from: number): number {
  const D = TR[SV_D];
  const n = t.n;
  const Y = t.lnGap as Float64Array;
  let i = from;
  while (i < n - 2 && nodePhi[i + 1] > D) i++;
  const f0 = nodePhi[i];
  let y: number;
  if (D >= f0 && i === 0) {
    // closer to the edge than node 0: the spline's linear part (Δφ ≈ −ln g + const there)
    y = Y[1] + (D - f0) / nodeSlope[0];
  } else {
    // the inverse of the spline between the two nodes as a cubic Hermite in Δφ (the nodes' y and dy/dΔφ =
    // 1/slope): within about 1e-8 of the root; outside the interval (the last one, D below its end), the
    // tangent at the nearer node
    const f1 = nodePhi[i + 1];
    const h = f1 - f0;
    const w = (D - f0) / h;
    if (w >= 0 && w <= 1) {
      const w2 = w * w;
      const w3 = w2 * w;
      y = (2 * w3 - 3 * w2 + 1) * Y[i + 1] + (w3 - 2 * w2 + w) * (h / nodeSlope[i]) + (3 * w2 - 2 * w3) * Y[i + 2] + (w3 - w2) * (h / nodeSlope[i + 1]);
    } else y = w > 1 ? Y[i + 2] + (D - f1) / nodeSlope[i + 1] : Y[i + 1] + (D - f0) / nodeSlope[i];
  }
  TR[SV_Y0] = y;
  solveLnGap(t);
  return i;
}

/**
 * Solves one inverse node at D = TR[SV_D] (any real: D < 0 lies beyond straight out, where
 * Δφ(π + x) = −Δφ(π − x), so α = 2π − α(−D)); writes y and m into the arrays at index j. Returns the forward
 * node reached (for D ≥ 0).
 */
function inverseNode(t: ForwardTable, from: number, ys: Float64Array, ms: Float64Array, j: number): number {
  if (TR[SV_D] >= 0) {
    const i = solveTarget(t, from);
    ys[j] = TR[SV_Y];
    ms[j] = TR[SV_M];
    return i;
  }
  TR[SV_D] = -TR[SV_D];
  solveTarget(t, 0);
  // α = π + (π − α') with α' = edge + e^y': the gap is span + (span − e^y')
  ys[j] = Math.log(2 * t.span - Math.exp(TR[SV_Y]));
  ms[j] = TR[SV_M];
  return from;
}

/** Builds the inverse table from the forward table (or rebuilds `reuse` in place). */
export function buildInverseTable(fwd: ForwardTable, n: number = INV_NODES, nRel: number = REL_NODES, reuse?: InverseTable): InverseTable {
  const t: InverseTable =
    reuse && reuse.n === n && reuse.rel.n === nRel
      ? reuse
      : {
          fwd,
          thetaE: 0,
          z0: 0,
          dz: 0,
          n,
          y: new Float64Array(n + 2),
          m: new Float64Array(n + 2),
          rel: { d0: TWO_PI, dd: TWO_PI / nRel, n: nRel, y: new Float64Array(nRel + 2), m: new Float64Array(nRel + 2) },
          version: reuse?.version ?? 0,
        };
  t.fwd = fwd;
  if (!fwd.lnGap || !(fwd.ds > 0)) {
    // a table not built here (straight light): the identity, α = π − D
    t.thetaE = 0;
    t.y.fill(0);
    t.m.fill(0);
    t.rel.y.fill(0);
    t.rel.m.fill(0);
    t.version++;
    return t;
  }
  prepareNodes(fwd);
  // the Einstein angle, where the spline's Δφ = π
  TR[SV_D] = Math.PI;
  solveTarget(fwd, 0);
  const thetaE = fwd.edge + Math.exp(TR[SV_Y]);
  t.thetaE = thetaE;
  const h = 2 * thetaE;
  const z0 = Math.asinh((Math.PI - (TWO_PI - INV_D_END)) / h);
  const z1 = Math.asinh((Math.PI - INV_D_END) / h);
  const dz = (z1 - z0) / (n - 1);
  t.z0 = z0;
  t.dz = dz;
  // row 1 first: targets 4π … 2π − ΔD, decreasing (texel k + 1 holds D = 2π + kΔD, k = −1 … nRel)
  const rel = t.rel;
  rel.d0 = TWO_PI;
  rel.dd = TWO_PI / nRel;
  let from = 0;
  for (let k = nRel; k >= -1; k--) {
    TR[SV_D] = rel.d0 + k * rel.dd;
    from = inverseNode(fwd, from, rel.y, rel.m, k + 1);
  }
  // row 0: z increasing is D decreasing (texel j + 1 holds node j, j = −1 … n)
  from = 0;
  for (let j = -1; j <= n; j++) {
    TR[SV_D] = Math.PI - h * Math.sinh(z0 + j * dz);
    from = inverseNode(fwd, from, t.y, t.m, j + 1);
  }
  t.version++;
  return t;
}

/** Output of inverseEval. */
export interface InverseSample {
  /** Look angle α (lens frame) of the image whose sweep to infinity is D. */
  alpha: number;
  /** −ln|dΔφ/dα| at that α. */
  m: number;
}

/**
 * The inverse table at D ∈ (0, 4π), mirroring the GLSL's lensInverse step by step:
 *   row 0 (D < 2π): h = 2θ_E, x = (asinh((π − D)/h) − z0)/Δz; row 1: x = (D − 2π)/ΔD;
 *   i = clamp(⌊x⌋, 0, n − 2), t = x − i; texels i … i + 3 hold (y, m) at nodes i − 1 … i + 2;
 *   m = Catmull–Rom of the four m's at t;
 *   y = cubic Hermite between y₁ = y[i + 1] and y₂ = y[i + 2] with slopes per node step
 *       row 0: s_k = h cosh(z0 + (i + k − 1)Δz) e^(m_k − y_k) Δz (k = 1, 2; nodes i and i + 1),
 *       row 1: s_k = −e^(m_k − y_k) ΔD,
 *     y = (2t³ − 3t² + 1) y₁ + (t³ − 2t² + t) s₁ + (3t² − 2t³) y₂ + (t³ − t²) s₂;
 *   α = α_edge + e^y.
 * A table of straight light (θ_E = 0) gives α = π − D, m = 0.
 */
export function inverseEval(t: InverseTable, D: number, out: InverseSample): InverseSample {
  TR[IV_D] = D;
  kInverse(t);
  out.alpha = TR[IV_ALPHA];
  out.m = TR[IV_M];
  return out;
}

/** inverseEval from the registers (tableRegs[TABLE_INV_D] → TABLE_INV_ALPHA, TABLE_INV_M): no allocation. */
export function inverseFromRegs(t: InverseTable): void {
  kInverse(t);
}

/** Kernel of inverseEval: TR[IV_D] → TR[IV_ALPHA], TR[IV_M]. */
function kInverse(t: InverseTable): void {
  const D = TR[IV_D];
  if (!(t.thetaE > 0)) {
    TR[IV_ALPHA] = Math.PI - D;
    TR[IV_M] = 0;
    return;
  }
  const row0 = D < TWO_PI;
  const h = 2 * t.thetaE;
  const x = row0 ? (Math.asinh((Math.PI - D) / h) - t.z0) / t.dz : (D - t.rel.d0) / t.rel.dd;
  const ys = row0 ? t.y : t.rel.y;
  const ms = row0 ? t.m : t.rel.m;
  const nn = row0 ? t.n : t.rel.n;
  let i = Math.floor(x);
  if (i < 0) i = 0;
  if (i > nn - 2) i = nn - 2;
  const u = x - i;
  const y1 = ys[i + 1];
  const y2 = ys[i + 2];
  const m1 = ms[i + 1];
  const m2 = ms[i + 2];
  let s1: number;
  let s2: number;
  if (row0) {
    const z1 = t.z0 + i * t.dz;
    s1 = h * Math.cosh(z1) * Math.exp(m1 - y1) * t.dz;
    s2 = h * Math.cosh(z1 + t.dz) * Math.exp(m2 - y2) * t.dz;
  } else {
    s1 = -Math.exp(m1 - y1) * t.rel.dd;
    s2 = -Math.exp(m2 - y2) * t.rel.dd;
  }
  const u2 = u * u;
  const u3 = u2 * u;
  const y = (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * s1 + (3 * u2 - 2 * u3) * y2 + (u3 - u2) * s2;
  TR[IV_ALPHA] = t.fwd.edge + Math.exp(y);
  // m by Catmull–Rom through ms[i + 1], ms[i + 2] with neighbours ms[i], ms[i + 3]
  const p0 = ms[i];
  const p1 = m1;
  const p2 = m2;
  const p3 = ms[i + 3];
  TR[IV_M] = 0.5 * (2 * p1 + u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (-p0 + 3 * p1 - 3 * p2 + p3))));
}

/**
 * ln|μ₀| of the order-0 image of a source at infinity at straight-line angle ψ from the axis (D = π − ψ),
 * from the inverse table: ln sin α + m − ln sin ψ; at ψ → π (D → 0) its limit 2m.
 */
export function lnMuOrder0(inv: InverseTable, psi: number): number {
  TR[MU_PSI] = psi;
  kLnMu0(inv);
  return TR[MU_OUT];
}

/** Kernel of lnMuOrder0: TR[MU_PSI] → TR[MU_OUT]. */
function kLnMu0(inv: InverseTable): void {
  const psi = TR[MU_PSI];
  const D = Math.PI - psi;
  TR[IV_D] = D;
  kInverse(inv);
  TR[MU_OUT] = D < 1e-6 ? 2 * TR[IV_M] : Math.log(Math.sin(TR[IV_ALPHA])) + TR[IV_M] - Math.log(Math.sin(psi));
}

/** ln ψ_min and 1/Δ ln ψ of the bound's nodes (uLensMuBoundAxis), for this inverse table. */
export function muBoundAxisInto(inv: InverseTable, out: { lnPsiMin: number; invDelta: number }): { lnPsiMin: number; invDelta: number } {
  const psiMin = inv.thetaE > 0 ? MU_BOUND_PSI_MIN_SHARE * inv.thetaE : 1e-9;
  out.lnPsiMin = Math.log(psiMin);
  out.invDelta = (MU_BOUND_NODES - 1) / (Math.log(Math.PI) - out.lnPsiMin);
  return out;
}

const axisScratch = { lnPsiMin: 0, invDelta: 0 };

/**
 * An upper bound of the order-0 magnification |μ₀| of a point source at infinity against its straight-line
 * angle ψ from the axis, at MU_BOUND_NODES nodes uniform in ln ψ from ψ_min = θ_E/64 to π (node i covers
 * [ψ_i, ψ_{i+1}); node 0 also covers ψ < ψ_min and holds the finite-source cap: `capLnMu`, the largest ln(μB0)
 * of the catalogue's stars (muBoundCapLn), or MU_BOUND_NO_CULL_LN when the caller has none). Sources at finite
 * distance are magnified less. Writes `out` (length MU_BOUND_NODES) as ln|μ| bounds: each node the largest of
 * its ends and middle (μ₀ falls with ψ, so the first is the largest) plus 0.005 (the inverse table's own m
 * is within 0.002 of the closed form). A table of straight light writes zeros.
 */
export function buildMuBound(inv: InverseTable, out: Float32Array, capLnMu: number = MU_BOUND_NO_CULL_LN): Float32Array {
  if (!(inv.thetaE > 0)) {
    out.fill(0);
    return out;
  }
  muBoundAxisInto(inv, axisScratch);
  const lnMin = axisScratch.lnPsiMin;
  const step = 1 / axisScratch.invDelta;
  const N = Math.min(out.length, MU_BOUND_NODES);
  out[0] = capLnMu;
  // samples at both ends and the middle of every node (shared ends: 2N − 3 evaluations)
  const lnPi = Math.log(Math.PI);
  let prev = 0;
  for (let i = 1; i < N; i++) {
    const la = lnMin + i * step;
    let best: number;
    if (i === 1) {
      TR[MU_PSI] = Math.exp(la);
      kLnMu0(inv);
      prev = TR[MU_OUT];
    }
    best = prev;
    if (i < N - 1) {
      TR[MU_PSI] = Math.exp(la + 0.5 * step);
      kLnMu0(inv);
      if (TR[MU_OUT] > best) best = TR[MU_OUT];
      TR[MU_PSI] = Math.min(Math.PI, Math.exp(Math.min(lnPi, la + step)));
      kLnMu0(inv);
      prev = TR[MU_OUT];
      if (prev > best) best = prev;
    }
    out[i] = best + 0.005;
  }
  return out;
}

/** The bound at ψ (the GLSL's lensMuBound): node clamp(⌊(ln ψ − ln ψ_min)/Δ⌋, 0, N − 1). */
export function muBoundEval(bound: Float32Array, lnPsiMin: number, invDelta: number, psi: number): number {
  let i = Math.floor((Math.log(psi) - lnPsiMin) * invDelta);
  if (!(i >= 0)) i = 0;
  if (i > bound.length - 1) i = bound.length - 1;
  return bound[i];
}

/**
 * The finite-source cap for node 0 of the bound: the largest ln(μB0) of a source at infinity whose radius seen
 * from the hole is 1/rsOverRadius (r_s/R★, both in the same unit), at exact alignment:
 * ln 2 + ln(r_s/R★) + ln sin θ_E + m(π) (z|μ| → (r_s/R★) sin θ_E e^m and B0(z)/z → 2 as z → 0).
 */
export function muBoundCapLn(inv: InverseTable, rsOverRadius: number): number {
  if (!(inv.thetaE > 0)) return 0;
  TR[IV_D] = Math.PI;
  kInverse(inv);
  return Math.LN2 + Math.log(rsOverRadius) + Math.log(Math.sin(TR[IV_ALPHA])) + TR[IV_M];
}
