/**
 * Images of point sources seen through the lens: where each image of a star or a body is, how much it is
 * magnified, and the light's frequency factor, at any distance of the source from the hole.
 *
 * What and how: tier 1 (every point shader, and the CPU for bodies far from the hole) meets the source on
 * the outgoing leg of the backward ray, through the per-frame tables and the parallax Λ (the azimuth the ray
 * sweeps beyond the source), with 0, 1 or 3 fixed-point passes or up to 4 Newton steps by r_o/r_s; sources in
 * front of the hole, or with no outgoing solution, come back drawn straight, never culled. Tier 2 (orbit guides
 * near the hole and the bodies there) solves the lens equation exactly, both branches, with Carlson's
 * integrals (physics/schwarzschild.ts exactImageInto). Near a caustic the source's own disc caps the
 * magnification through Gould's (1994) finite-source factor B0(z), carried as ln(zμ) + ln(B0(z)/z) so it stays
 * finite at exact alignment (causticZ, gouldB0OverZ, fillB0OverZ).
 *
 * The parallax. The simplest choice is the flat Λ = asin(b/r_s) throughout (the usual first-order term,
 * −(1 − c)²/(bc), is singular at the foot of the perpendicular). In the pass regimes (r_o/r_s < 0.05) it stays:
 * x = b/r_s ≤ 0.05 there and it is exact to 1e-6 rad. In the Newton regime it is 0.048 px off just beyond the
 * foot at 1e5 M (the `foot` fixtures, sources at 0.95 r_o) and leaves a band with no solution, because the true
 * images there have b up to r_s + M. There tier 1 inverts the first-order orbit u = sin φ/b + (1 + cos²φ)/b²
 * instead, rescaled so its slope at infinity is exact (lambdaTier1): regular through the foot, within 5e-8
 * of the `foot` fixtures' magnifications and 1e-5 px of their images, and better than the flat Λ everywhere
 * from b = 30 M; below b = 30 M (x ≤ 0.1 for every source tier 1 draws) the flat Λ is kept, where the first-order
 * orbit's O(M²/b²) error would dominate.
 *
 * Tier 1, step by step (with the parallax above; lens.glsl's lensImage does the same in float32):
 *   ro = |holeM|, axis = holeM/ro; srcH = srcM − holeM, r_s = |srcH|, ŝ = srcH/r_s;
 *   γ = 2 atan2(|ŝ + axis|, |ŝ − axis|) (the angle at the hole between camera and source);
 *   q̂ = the unit part of srcM perpendicular to the axis (the source's side); α_flat its angle from the axis;
 *   k = ⌊order/2⌋, side = +1 (even orders) or −1; D = γ + 2πk (side +1) or 2π − γ + 2πk (side −1);
 *   order 0 with r_s < ro and ro cos γ > r_s (in front of the hole): drawn straight;
 *   b(α) = r sin α e^{ln g} (static), r sin α/(1 − v cos α) (raindrop), r the table's radius;
 *   the flat parallax: x = b/r_s < 1, c = √((1 − x)(1 + x)), Λ = atan2(x, c), cψ = c, cψΛ′ = 1/r_s;
 *   the orbit parallax (b ≥ 30): q = x − 2/b, S = 2q/(1 + √(1 − 4q/b)) (needs 1 − 4q/b ≥ 0 and S < 1),
 *     S0 = the same at x = 0, c0 = √(1 − S0²), cS = √(1 − S²), k = (1 − 2S0/b) c0,
 *     A = atan2(S, cS) − atan2(S0, c0), Λ = k A, cψ = cS (1 − 2S/b),
 *     S0′ = ((2 − S0²)/b²)/(1 − 2S0/b), k′ = (2S0/b² − 2S0′/b) c0 − (1 − 2S0/b) S0 S0′/c0,
 *     cψΛ′ = k((2 − S²)/b² + 1/r_s) − cψ (k S0′/c0 − k′A);
 *   solve Δφ(α) − Λ(b(α)) = D:
 *     (ro/r_s)·pxPerRad < 0.005: α = inverse(D) (no pass);
 *     (ro/r_s)²·pxPerRad < 0.005: α = inverse(D + Λ(b(inverse(D)))) (one pass, flat Λ);
 *     ro/r_s < 0.05: three such passes from inverse(D);
 *     else Newton, orbit parallax, f = Δφ(α) − Λ − D, f′ = dΔφ/dα − (cψΛ′/cψ) b′, b′ = r cos α e^{ln g} (static)
 *       or r (cos α − v)/(1 − v cos α)² (raindrop), Δφ and dΔφ/dα from the forward table; start
 *       α₀ = min(inverse(D + Λ(b(α_flat))), α_max) (order 0; inverse(D) for the others), replaced by α_flat for
 *       order 0 when α_flat's Newton step |f/f′| is the smaller; α_max: b = r_s(1 + 1/b) (the ray tangent to
 *       the source's sphere: S = 1), static observers only, π otherwise; with α_max < π the steps run in
 *       w = √(α_max − α) (w ← w + f/(2w f′), clamped to [1e-9, 1] of √(α_max − α_edge)), since Λ grows like
 *       √(α_max − α) there; else in α, clamped into (α_edge, α_max]; at most 4 steps, converged when an
 *       unclamped step moves α by under 1e-7, or when the last of the 4 did by under 1e-5 (the shader's own bound,
 *       where it stops: the images it draws are all found here, and refined further while steps are left);
 *   no solution (no parallax at a pass or at the answer, Newton not converged, or with the flat parallax c² < 10/r_s
 *     at the answer): order 0 straight, orders ≥ 1 no image;
 *   dir = cos α·axis + sin α·side·q̂;
 *   |μ| = d² sin α / (r_s² |sin D| J), J = |cψ dΔφ/dα − b′ cψΛ′| (cψ |dD_s/dα|, finite where cψ → 0),
 *     d = |srcM|, |sin D| from D's distance to the nearest multiple of π, dΔφ/dα = −e^{−m} from the last inverse
 *     read after passes, from the forward table after Newton (for r_s → ∞: sin α e^m/|sin D|);
 *   ln g: static −½ ln(1 − 2/r); raindrop −ln((1 − v) + 2v sin²(α/2)).
 * The CPU twin has no point zone (the GLSL skips order 0 beyond it, where the image moves under 0.02 px). In
 * the raindrop's frame (only below 3M in a fall) the straight fallback is not aberrated; it is never reached
 * there (every source is far outside r_o, so a solution exists).
 *
 * Why: a label, a pick or a hover tag must sit on the drawn image, and the vertex shaders and the CPU must
 * agree on it to 0.01 device px.
 *
 * Cost: tier 1 a few table reads (under a microsecond); tier 2 some tens of R_F evaluations per image (about
 * 10 µs). Neither allocates: both work through the kernels' registers of physics/schwarzschild.ts and
 * physics/schwarzschildTables.ts.
 *
 * Twins: render/shaders/lens.glsl (lensImage, tier 1; lensMuBound; the B0(z)/z texture) and lensExact.glsl
 * (lensImageExact, tier 2), and the float32 mirror physics/lensMirror32.ts.
 */
import { sampleBlackbody, type BlackbodySample } from './blackbody';
import { PARSEC_KM, SUN_RADIUS_KM } from './constants';
import { BC, escapeRegs, exactImageFromRegs, EXACT_PHI, EXACT_RO, EXACT_RS, rf, rootsComplex, rootsReal, sweepBetweenComplex, sweepBetweenReal, type ExactImage } from './schwarzschild';
import {
  forwardFromRegs,
  inverseFromRegs,
  tableRegs,
  TABLE_FWD_DSWEEP,
  TABLE_FWD_G,
  TABLE_FWD_SWEEP,
  TABLE_INV_ALPHA,
  TABLE_INV_D,
  TABLE_INV_M,
  type ForwardTable,
  type InverseTable,
} from './schwarzschildTables';
import type { Vec3 } from './vec';

/** Which image: 0 the primary, 1 the secondary on the far side, 2 and 3 after a further turn round the hole. */
export type ImageOrder = 0 | 1 | 2 | 3;

/**
 * One image of a point source. Directions are unit vectors in world axes, in the lens frame. lnMu is ln|μ|
 * (image solid angle over the flat-space one, lens frame); lnG the frequency factor of the light at the
 * observer relative to the source's rest frame (observer term; plus the emitter's ½ ln(1 − 2/r_s) only in
 * the exact solver).
 */
export interface PointImage {
  ok: boolean;
  /** Look angle from the hole's direction. */
  alpha: number;
  dir: Vec3;
  lnMu: number;
  lnG: number;
  /** Parity: +1 same side as the source, −1 opposite. */
  side: 1 | -1;
  /**
   * 'unlensed': tier 1's fallback for sources in front of the hole or in the band just beyond the flat foot
   * where the flat parallax has no solution (drawn straight, μ = 1; error ≤ 0.011 px measured).
   */
  branch: 'outgoing' | 'incoming' | 'unlensed' | 'identity';
  /** Unit direction (world) in which the light leaves the source (tier 2: from the solved ray; tier 1: source → camera). */
  emitDir: Vec3;
  /** The source's offset from the caustic line as seen from the hole, |D_k − nπ| (rad), for the finite-source cap. */
  causticOffset: number;
}

/** Device px per radian the accuracy targets are stated in (the 50° view on a 1,384-px-tall canvas). */
export const REFERENCE_PX_PER_RAD = 1484;

const TWO_PI = 2 * Math.PI;

/** Geometry scratch (one call at a time). */
const G = new Float64Array(16);
const G_AX = 0; // axis x, y, z
const G_Q = 3; // q̂ x, y, z
const G_S = 6; // ŝ x, y, z (unit, hole → source)
const G_RO = 9;
const G_RS = 10;
const G_GAMMA = 11;
const G_D = 12; // |srcM|
const G_AFLAT = 13; // the source's straight-line angle from the axis
const G_LNG = 14; // straightInto's ln g
const G_ALPHA = 15; // imageDir's α

/**
 * The shared geometry of both tiers into G: the axis, the source's side q̂, ŝ, ro, r_s, γ, d and α_flat. q̂ for a
 * source on the axis itself (a ring) is any perpendicular (the x axis or the y axis projected off it).
 */
function geometry(holeM: Vec3, srcM: Vec3): void {
  const ro = Math.sqrt(holeM.x * holeM.x + holeM.y * holeM.y + holeM.z * holeM.z);
  const ax = holeM.x / ro;
  const ay = holeM.y / ro;
  const az = holeM.z / ro;
  const sx0 = srcM.x - holeM.x;
  const sy0 = srcM.y - holeM.y;
  const sz0 = srcM.z - holeM.z;
  const rs = Math.sqrt(sx0 * sx0 + sy0 * sy0 + sz0 * sz0);
  const sx = sx0 / rs;
  const sy = sy0 / rs;
  const sz = sz0 / rs;
  // γ: the angle between ŝ and −axis, from chords
  const px = sx + ax;
  const py = sy + ay;
  const pz = sz + az;
  const mx = sx - ax;
  const my = sy - ay;
  const mz = sz - az;
  const gamma = 2 * Math.atan2(Math.sqrt(px * px + py * py + pz * pz), Math.sqrt(mx * mx + my * my + mz * mz));
  // q̂: srcM's part perpendicular to the axis
  const d = Math.sqrt(srcM.x * srcM.x + srcM.y * srcM.y + srcM.z * srcM.z);
  const dot = srcM.x * ax + srcM.y * ay + srcM.z * az;
  let qx = srcM.x - dot * ax;
  let qy = srcM.y - dot * ay;
  let qz = srcM.z - dot * az;
  let ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (!(ql > 1e-300 * d) || ql === 0) {
    // on the axis: any perpendicular will do
    const useY = Math.abs(ax) > 0.9;
    const ex = useY ? 0 : 1;
    const ey = useY ? 1 : 0;
    const e = ex * ax + ey * ay;
    qx = ex - e * ax;
    qy = ey - e * ay;
    qz = -e * az;
    ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
  }
  G[G_AX] = ax;
  G[G_AX + 1] = ay;
  G[G_AX + 2] = az;
  G[G_Q] = qx / ql;
  G[G_Q + 1] = qy / ql;
  G[G_Q + 2] = qz / ql;
  G[G_S] = sx;
  G[G_S + 1] = sy;
  G[G_S + 2] = sz;
  G[G_RO] = ro;
  G[G_RS] = rs;
  G[G_GAMMA] = gamma;
  G[G_D] = d;
  // α_flat: the angle between srcM and the axis, from chords
  const ux = srcM.x / d;
  const uy = srcM.y / d;
  const uz = srcM.z / d;
  const cx = ux - ax;
  const cy = uy - ay;
  const cz = uz - az;
  const ex2 = ux + ax;
  const ey2 = uy + ay;
  const ez2 = uz + az;
  G[G_AFLAT] = 2 * Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), Math.sqrt(ex2 * ex2 + ey2 * ey2 + ez2 * ez2));
}

/** The image of a source seen straight (μ = 1): tier 1's fallback and the identity of straight light; ln g in G[G_LNG]. */
function straightInto(srcM: Vec3, branch: PointImage['branch'], out: PointImage): PointImage {
  const d = G[G_D];
  const lnG = G[G_LNG];
  out.ok = true;
  out.alpha = G[G_AFLAT];
  out.dir.x = srcM.x / d;
  out.dir.y = srcM.y / d;
  out.dir.z = srcM.z / d;
  out.emitDir.x = -out.dir.x;
  out.emitDir.y = -out.dir.y;
  out.emitDir.z = -out.dir.z;
  out.lnMu = 0;
  out.lnG = lnG;
  out.side = 1;
  out.branch = branch;
  out.causticOffset = Infinity;
  return out;
}

/** Writes dir = cos α·axis + sin α·side·q̂ from G, α in G[G_ALPHA]. */
function imageDir(side: number, out: Vec3): void {
  const alpha = G[G_ALPHA];
  const c = Math.cos(alpha);
  const s = Math.sin(alpha) * side;
  out.x = c * G[G_AX] + s * G[G_Q];
  out.y = c * G[G_AX + 1] + s * G[G_Q + 1];
  out.z = c * G[G_AX + 2] + s * G[G_Q + 2];
}

/** Below this impact parameter (units of M) tier 1's Newton regime uses the flat parallax (see lambdaTier1). */
export const ORBIT_PARALLAX_MIN_B = 30;

/** Scratch of the parallax (PX_…): Λ, and for the Jacobian cψ and cψ·dΛ/db; ok flag as 1/0. */
const PXR = new Float64Array(6);
const PX_LAM = 0;
const PX_CPSI = 1;
const PX_CPSI_DLAM = 2;
const PX_OK = 3;
const PX_B = 4;
const PX_RS = 5;

/**
 * Tier 1's parallax at impact parameter b = PXR[PX_B] for a source at r_s = PXR[PX_RS] (units of M), with what
 * the Jacobian needs, into
 * PXR: the flat Λ = asin x (x = b/r_s) when `flat` or b < ORBIT_PARALLAX_MIN_B, cψ = √(1 − x²), cψ·Λ′ = 1/r_s;
 * otherwise the rescaled first-order orbit (lambdaTier1), cψ = √(1 − S²)(1 − 2S/b) and
 * cψ·Λ′ = k((2 − S²)/b² + 1/r_s) − cψ(k S0′/√(1 − S0²) − k′A). PX_OK is 0 when the ray does not reach r_s.
 */
function parallax(flat: boolean): void {
  const b = PXR[PX_B];
  const rs = PXR[PX_RS];
  if (flat || b < ORBIT_PARALLAX_MIN_B) {
    const x = b / rs;
    const c2 = (1 - x) * (1 + x);
    if (!(x < 1)) {
      PXR[PX_OK] = 0;
      return;
    }
    const c = Math.sqrt(c2);
    PXR[PX_LAM] = Math.atan2(x, c);
    PXR[PX_CPSI] = c;
    PXR[PX_CPSI_DLAM] = 1 / rs;
    PXR[PX_OK] = 1;
    return;
  }
  const x = b / rs;
  const q = x - 2 / b;
  const disc = 1 - (4 * q) / b;
  const S = (2 * q) / (1 + Math.sqrt(disc));
  if (!(disc >= 0) || !(S < 1)) {
    PXR[PX_OK] = 0;
    return;
  }
  const q0 = -2 / b;
  const S0 = (2 * q0) / (1 + Math.sqrt(1 - (4 * q0) / b));
  const c0 = Math.sqrt((1 - S0) * (1 + S0));
  const cS = Math.sqrt((1 - S) * (1 + S));
  const k = (1 - (2 * S0) / b) * c0;
  const A = Math.atan2(S, cS) - Math.atan2(S0, c0);
  const dS0 = (2 - S0 * S0) / (b * b) / (1 - (2 * S0) / b);
  const dk = ((2 * S0) / (b * b) - (2 * dS0) / b) * c0 - ((1 - (2 * S0) / b) * S0 * dS0) / c0;
  const cPsi = cS * (1 - (2 * S) / b);
  PXR[PX_LAM] = k * A;
  PXR[PX_CPSI] = cPsi;
  PXR[PX_CPSI_DLAM] = k * ((2 - S * S) / (b * b) + 1 / rs) - cPsi * ((k * dS0) / c0 - dk * A);
  PXR[PX_OK] = 1;
}

/** Scratch of tier 1's Newton residual (NP_…): its inputs, and f, df/dα and an ok flag. */
const NP = new Float64Array(12);
const NP_RS = 0;
const NP_D = 1;
const NP_R = 2;
const NP_V = 3;
const NP_EG = 4;
const NP_ALPHA = 5;
const NP_F = 6;
const NP_FP = 7;
const NP_OK = 8;

/**
 * f(α) = Δφ(α) − Λ(b(α)) − D and df/dα = dΔφ/dα − Λ′(b) b′(α) at NP[NP_ALPHA] (Δφ from the forward table, Λ the
 * Newton regime's parallax), into NP; NP_OK 0 when the ray does not reach the source's sphere.
 */
function newtonResidual(fwd: ForwardTable, rain: boolean): void {
  const alpha = NP[NP_ALPHA];
  const r = NP[NP_R];
  const v = NP[NP_V];
  const rs = NP[NP_RS];
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  let b: number;
  let bp: number;
  if (rain) {
    const den = 1 - v * ca;
    b = (r * sa) / den;
    bp = (r * (ca - v)) / (den * den);
  } else {
    b = r * sa * NP[NP_EG];
    bp = r * ca * NP[NP_EG];
  }
  PXR[PX_B] = b;
  PXR[PX_RS] = rs;
  parallax(false);
  if (PXR[PX_OK] === 0) {
    NP[NP_OK] = 0;
    return;
  }
  tableRegs[TABLE_FWD_G] = alpha - fwd.edge;
  forwardFromRegs(fwd);
  NP[NP_F] = tableRegs[TABLE_FWD_SWEEP] - PXR[PX_LAM] - NP[NP_D];
  NP[NP_FP] = tableRegs[TABLE_FWD_DSWEEP] - (PXR[PX_CPSI_DLAM] / PXR[PX_CPSI]) * bp;
  NP[NP_OK] = 1;
}

/**
 * Tier 1: sources met on the outgoing leg, through the inverse table and the parallax of the source's distance
 * (flat in the pass regimes, the rescaled first-order orbit in Newton's: see the header), with 0, 1 or 3 passes or
 * up to 4 Newton steps by r_o/r_s; order 0 never fails: sources in front of the hole, or with no outgoing solution,
 * come back unlensed. Mirrors lens.glsl lensImage (the arithmetic is in this module's header). holeM: camera →
 * hole; srcM: camera → source; both world axes, lens frame (the hole frame), units of M. pxPerRad sets the pass
 * counts (default 1,484). A table of straight light (θ_E = 0) gives the source's own direction and only order 0.
 */
export function pointImageTier1(inv: InverseTable, holeM: Vec3, srcM: Vec3, order: ImageOrder, out: PointImage, pxPerRad: number = REFERENCE_PX_PER_RAD): PointImage {
  geometry(holeM, srcM);
  const fwd = inv.fwd;
  const rain = fwd.obs.frame === 'rain';
  const r = fwd.obs.r;
  const v = Math.sqrt(2 / r);
  const eG = Math.sqrt(r / (r - 2));
  const lnGStatic = r < 4 ? -0.5 * Math.log((r - 2) / r) : -0.5 * Math.log1p(-2 / r);
  if (!(inv.thetaE > 0)) {
    if (order !== 0) {
      out.ok = false;
      return out;
    }
    G[G_LNG] = 0;
    return straightInto(srcM, 'identity', out);
  }
  const ro = G[G_RO];
  const rs = G[G_RS];
  const gamma = G[G_GAMMA];
  const k = order >> 1;
  const side: 1 | -1 = (order & 1) === 0 ? 1 : -1;
  const D = side > 0 ? gamma + TWO_PI * k : TWO_PI - gamma + TWO_PI * k;
  const aFlat = G[G_AFLAT];
  // the straight direction's frequency factor (raindrop: at the straight angle)
  const sf = Math.sin(aFlat / 2);
  const lnGFlat = rain ? -Math.log((r - 2) / (r * (1 + v)) + 2 * v * sf * sf) : lnGStatic;
  if (order === 0 && rs < ro && ro * Math.cos(gamma) > rs) {
    G[G_LNG] = lnGFlat;
    return straightInto(srcM, 'unlensed', out);
  }
  const edge = fwd.edge;
  const ratio = ro / rs;
  const TR = tableRegs;
  const passRegime = ratio < 0.05;
  let alpha = 0;
  let dSweep = 0;
  let ok = true;
  if (passRegime) {
    // no pass, one pass, or three fixed-point passes α ← inverse(D + Λ(b(α))), flat Λ
    const passes = ratio * pxPerRad < 0.005 ? 0 : ratio * ratio * pxPerRad < 0.005 ? 1 : 3;
    TR[TABLE_INV_D] = D;
    inverseFromRegs(inv);
    alpha = TR[TABLE_INV_ALPHA];
    for (let p = 0; p < passes && ok; p++) {
      const b = rain ? (r * Math.sin(alpha)) / (1 - v * Math.cos(alpha)) : r * Math.sin(alpha) * eG;
      PXR[PX_B] = b;
      PXR[PX_RS] = rs;
      parallax(true);
      if (PXR[PX_OK] === 0) ok = false;
      else {
        TR[TABLE_INV_D] = D + PXR[PX_LAM];
        inverseFromRegs(inv);
        alpha = TR[TABLE_INV_ALPHA];
      }
    }
    dSweep = -Math.exp(-TR[TABLE_INV_M]);
  } else {
    // Newton on f(α) = Δφ(α) − Λ(b(α)) − D; α_max where the ray is tangent to the source's sphere (the orbit's
    // S = 1: b = r_s(1 + 1/b)), for static observers (inside 3M every sky ray has b < b_c)
    const bTan = 0.5 * (rs + Math.sqrt(rs * rs + 4 * rs));
    const aMax = !rain && bTan < r * eG ? Math.asin(bTan / (r * eG)) : Math.PI;
    NP[NP_RS] = rs;
    NP[NP_D] = D;
    NP[NP_R] = r;
    NP[NP_V] = v;
    NP[NP_EG] = eG;
    // the start: inverse(D + Λ(b(α_flat))), or for order 0 the straight-line angle itself when its
    // Newton step is the smaller (near the foot the first overshoots the tangent: the fixed point amplifies there)
    let start = D;
    if (order === 0) {
      const b0 = rain ? (r * Math.sin(aFlat)) / (1 - v * Math.cos(aFlat)) : r * Math.sin(aFlat) * eG;
      PXR[PX_B] = b0;
      PXR[PX_RS] = rs;
      parallax(false);
      if (PXR[PX_OK] !== 0) start = D + PXR[PX_LAM];
    }
    TR[TABLE_INV_D] = start;
    inverseFromRegs(inv);
    alpha = Math.min(TR[TABLE_INV_ALPHA], aMax);
    if (order === 0 && aFlat > edge && aFlat < aMax) {
      NP[NP_ALPHA] = alpha;
      newtonResidual(fwd, rain);
      const stepA = NP[NP_OK] !== 0 && alpha < aMax ? Math.abs(NP[NP_F] / NP[NP_FP]) : Infinity;
      NP[NP_ALPHA] = aFlat;
      newtonResidual(fwd, rain);
      const stepB = NP[NP_OK] !== 0 ? Math.abs(NP[NP_F] / NP[NP_FP]) : Infinity;
      if (stepB < stepA) alpha = aFlat;
    }
    // With a tangent (aMax < π) Newton runs in w = √(α_max − α): near it Λ grows like √(α_max − α), which is
    // linear in w, so the steps stay good right up to the foot; otherwise in α itself.
    const tangent = aMax < Math.PI;
    const wMax = Math.sqrt(aMax - edge);
    let w = tangent ? Math.sqrt(Math.max(aMax - alpha, 0)) : 0;
    if (tangent && !(w > 1e-9 * wMax)) w = 1e-9 * wMax;
    if (tangent) alpha = aMax - w * w;
    let converged = false;
    let settled = false;
    for (let it = 0; it < 4; it++) {
      NP[NP_ALPHA] = alpha;
      newtonResidual(fwd, rain);
      if (NP[NP_OK] === 0) break;
      const f = NP[NP_F];
      let next: number;
      let clamped = false;
      if (tangent) {
        // dF/dw = −2w dF/dα (w/cψ, inside dF/dα, stays finite at the tangent)
        let wn = w + f / (2 * w * NP[NP_FP]);
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
        next = alpha - f / NP[NP_FP];
        if (next > aMax) {
          next = aMax;
          clamped = true;
        }
        if (!(next > edge)) {
          next = edge + 0.5 * (alpha - edge);
          clamped = true;
        }
      }
      const step = next - alpha;
      alpha = next;
      if (!clamped && Math.abs(step) < 1e-7) {
        converged = true;
        break;
      }
      // lens.glsl stops at a step under 1e-5 (its error is then of the order of that step's square): with steps
      // left this twin refines on; with none left, it takes what the shader takes.
      settled = !clamped && Math.abs(step) < 1e-5;
    }
    if (!converged && !settled) ok = false;
    else {
      TR[TABLE_FWD_G] = alpha - edge;
      forwardFromRegs(fwd);
      dSweep = TR[TABLE_FWD_DSWEEP];
    }
  }
  // the answer, with its parallax's cos ψ_s and cψ·Λ′ for the Jacobian
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  let b: number;
  let bp: number;
  let den = 1;
  if (rain) {
    const sh = Math.sin(alpha / 2);
    den = (r - 2) / (r * (1 + v)) + 2 * v * sh * sh;
    b = (r * sa) / den;
    bp = (r * (ca - v)) / (den * den);
  } else {
    b = r * sa * eG;
    bp = r * ca * eG;
  }
  const flat = passRegime || b < ORBIT_PARALLAX_MIN_B;
  if (ok) {
    PXR[PX_B] = b;
    PXR[PX_RS] = rs;
    parallax(passRegime);
  }
  // no solution: no parallax at the answer, or the flat one within √(10/r_s) of the foot
  if (!ok || PXR[PX_OK] === 0 || (flat && !(PXR[PX_CPSI] * PXR[PX_CPSI] >= 10 / rs)) || !(alpha > edge)) {
    if (order !== 0) {
      out.ok = false;
      return out;
    }
    G[G_LNG] = lnGFlat;
    return straightInto(srcM, 'unlensed', out);
  }
  const off = D - Math.PI * Math.round(D / Math.PI);
  const d = G[G_D];
  const jac = Math.abs(PXR[PX_CPSI] * dSweep - bp * PXR[PX_CPSI_DLAM]);
  out.ok = true;
  out.alpha = alpha;
  G[G_ALPHA] = alpha;
  imageDir(side, out.dir);
  out.lnMu = 2 * Math.log(d / rs) + Math.log(sa) - Math.log(Math.abs(Math.sin(off))) - Math.log(jac);
  out.lnG = rain ? -Math.log(den) : lnGStatic;
  out.side = side;
  out.branch = 'outgoing';
  out.emitDir.x = -srcM.x / d;
  out.emitDir.y = -srcM.y / d;
  out.emitDir.z = -srcM.z / d;
  out.causticOffset = Math.abs(off);
  return out;
}

const exact: ExactImage = { ok: false, branch: 'out', theta: 0, gap: 0, b: 0, dphi: 0, cs: 0, dd: 0, mu: 0, dOmegadA: 0 };

/**
 * Tier 2: exact for any source position (static observer, ro > 3), both branches, with the emitter's
 * gravitational term and the emission direction; Carlson throughout (physics/schwarzschild.ts
 * exactImageInto). The CPU twin of lensExact.glsl. ro: the observer's r (units of M); holeM, srcM as tier 1.
 * lnG = ½ ln(1 − 2/r_s) − ½ ln(1 − 2/ro); emitDir is the direction the light leaves the source, from the solved
 * ray (at the source's angle ψ_s to its radial, cos ψ_s the backward ray's outward cosine, in the plane of hole,
 * camera and source). Inside the photon sphere (ro ≤ 3), or if the solver finds no bracket, order 0 comes back
 * straight ('unlensed') and the other orders with ok false.
 */
export function pointImageExact(ro: number, holeM: Vec3, srcM: Vec3, order: ImageOrder, out: PointImage): PointImage {
  geometry(holeM, srcM);
  const rs = G[G_RS];
  const gamma = G[G_GAMMA];
  const k = order >> 1;
  const side: 1 | -1 = (order & 1) === 0 ? 1 : -1;
  const lnG = 0.5 * Math.log1p(-2 / rs) - 0.5 * Math.log1p(-2 / ro);
  escapeRegs[EXACT_RO] = ro;
  escapeRegs[EXACT_RS] = rs;
  escapeRegs[EXACT_PHI] = gamma;
  if (!(ro > 3) || !(rs > 2) || !exactImageFromRegs(k, side, exact)) {
    if (order !== 0) {
      out.ok = false;
      return out;
    }
    G[G_LNG] = lnG;
    return straightInto(srcM, 'unlensed', out);
  }
  const T = exact.dphi;
  out.ok = true;
  out.alpha = exact.theta;
  G[G_ALPHA] = exact.theta;
  imageDir(side, out.dir);
  out.lnMu = Math.log(Math.abs(exact.mu));
  out.lnG = lnG;
  out.side = side;
  out.branch = exact.branch === 'out' || exact.branch === 'peri' ? 'outgoing' : 'incoming';
  // the light leaves the source against the backward ray: −(cs ŝ + sin ψ t̂), t̂ = −sin T r̂o + cos T ê, with
  // r̂o = −axis (hole → camera) and ê = side·q̂ (the look direction's part perpendicular to r̂o)
  const cs = exact.cs;
  const sp = Math.sqrt(Math.max(0, 1 - cs * cs));
  const cT = Math.cos(T);
  const sT = Math.sin(T);
  const tx = sT * G[G_AX] + cT * side * G[G_Q];
  const ty = sT * G[G_AX + 1] + cT * side * G[G_Q + 1];
  const tz = sT * G[G_AX + 2] + cT * side * G[G_Q + 2];
  out.emitDir.x = -(cs * G[G_S] + sp * tx);
  out.emitDir.y = -(cs * G[G_S + 1] + sp * ty);
  out.emitDir.z = -(cs * G[G_S + 2] + sp * tz);
  out.causticOffset = Math.abs(T - Math.PI * Math.round(T / Math.PI));
  return out;
}

/**
 * Tier 1's parallax in its Newton regime: the azimuth a ray of impact parameter b sweeps from infinity in to
 * r_s = 1/u_s, from the first-order orbit u = sin φ/b + (1 + cos²φ)/b² (M = 1), rescaled so that its slope at
 * infinity is exact: Λ = k (asin S − asin S0), S the root of S + (2 − S²)/b = b u_s (S = 2q/(1 + √(1 − 4q/b)),
 * q = b u_s − 2/b), S0 the root at u_s = 0 (the asymptote), k = (1 − 2S0/b)√(1 − S0²). Regular through the
 * foot (S → 1), where the flat asin(b u_s) is off by up to M/b·(1 − c)²/c and the usual first-order expansion is
 * singular: within 5e-5 rad of lambdaExact at b = 1,000 M and 4e-8 at 1e5 M for every source the ray reaches, and
 * better than the flat Λ everywhere from b = 30 M (below it the first-order orbit is off by O(M²/b²), and the
 * flat Λ is used). NaN when the orbit does not reach r_s.
 */
export function lambdaTier1(b: number, us: number): number {
  PXR[PX_B] = b;
  PXR[PX_RS] = 1 / us;
  parallax(false);
  return PXR[PX_OK] === 0 ? NaN : PXR[PX_LAM];
}

/** Λ(b, u_s) of flat space, asin(b u_s), through atan2 (no cancellation near 1): tier 1's parallax far from the hole. */
export function lambdaFlat(b: number, us: number): number {
  const x = b * us;
  return Math.atan2(x, Math.sqrt((1 - x) * (1 + x)));
}

/** Λ exactly: ∫₀^{u_s} du/√G(u), the azimuth a ray of impact parameter b sweeps from infinity in to r_s = 1/u_s (b > b_c, u_s ≤ u2). */
export function lambdaExact(b: number, us: number): number {
  if (us <= 0 || b <= 0) return 0;
  const d = b / BC - 1;
  return d > 0 ? sweepBetweenReal(rootsReal(d), 0, us) : sweepBetweenComplex(rootsComplex(d), 0, us);
}

/**
 * Carlson's R_D(x, y, z), x, y ≥ 0 (at most one zero), z > 0: duplication to a relative spread under 1e-3, then
 * the series of DLMF 19.36.2 (relative error under 1e-15).
 */
function rd(x: number, y: number, z: number): number {
  let sum = 0;
  let fac = 1;
  let A = 0;
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let i = 0; i < 60; i++) {
    const sx = Math.sqrt(x);
    const sy = Math.sqrt(y);
    const sz = Math.sqrt(z);
    const lam = sx * (sy + sz) + sy * sz;
    sum += fac / (sz * (z + lam));
    fac *= 0.25;
    x = 0.25 * (x + lam);
    y = 0.25 * (y + lam);
    z = 0.25 * (z + lam);
    A = (x + y + 3 * z) / 5;
    X = (A - x) / A;
    Y = (A - y) / A;
    Z = (A - z) / A;
    if (Math.max(Math.abs(X), Math.abs(Y), Math.abs(Z)) < 1e-3) break;
  }
  const ea = X * Y;
  const eb = Z * Z;
  const ec = ea - eb;
  const ed = ea - 6 * eb;
  const ee = ed + ec + ec;
  const s = 1 + ed * (-3 / 14 + (9 / 88) * ed - (9 / 52) * Z * ee) + Z * ((1 / 6) * ee + Z * ((-9 / 22) * ec + Z * (3 / 26) * ea));
  return 3 * sum + (fac * s) / (A * Math.sqrt(A));
}

/**
 * B0(z)/z, finite at z = 0 (where it is 2), so ln(μB0) = ln(zμ) + ln(B0/z) never forms ∞ − ∞. B0(z) = (4z/π)
 * E(arcsin min(1, 1/z) | z²) (Gould 1994, ApJ 421, L71), with the elliptic integral in Carlson's form: for
 * z ≤ 1 E(z²) = R_F(0, 1 − z², 1) − (z²/3) R_D(0, 1 − z², 1); beyond, where z² sin²φ = 1,
 * z E(φ | z²) = R_F(c², 0, 1) − R_D(c², 0, 1)/3 with c² = 1 − 1/z². Exact at every z.
 */
export function gouldB0OverZ(z: number): number {
  // At z = 1 both forms have two zero arguments (E(π/2 | 1) = 1); on either side they are exact.
  if (z === 1) return 4 / Math.PI;
  if (z < 1) {
    const m = z * z;
    const k = 1 - m;
    return (4 / Math.PI) * (rf(0, k, 1) - (m / 3) * rd(0, k, 1));
  }
  const c2 = ((z - 1) * (z + 1)) / (z * z);
  return (4 / (Math.PI * z)) * (rf(c2, 0, 1) - rd(c2, 0, 1) / 3);
}

/** Gould's (1994) finite-source factor B0(z) = (4z/π) E(arcsin min(1, 1/z) | z²): 4/π at z = 1, → 1 far from the caustic. */
export function gouldB0(z: number): number {
  return z * gouldB0OverZ(z);
}

/**
 * The finite-source parameter at any caustic: z = |D_k − nπ|·r_s/R★ with nπ the multiple of π nearest D_k
 * (the source's offset from the caustic line seen from the hole over its angular radius seen from the hole).
 * Frame-free; it equals β/ρ in flat space. A point source (R★ = 0) has z = ∞: no cap.
 */
export function causticZ(causticOffset: number, rsM: number, starRadiusM: number): number {
  return starRadiusM > 0 ? (causticOffset * rsM) / starRadiusM : Infinity;
}

const bbSample: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

/**
 * A blackbody star's radius from its absolute visual magnitude and temperature, R☉:
 * R/R☉ = 10^(−0.2(M_V − 4.83)) e^(−lnY(T)/2), with Y the visual luminance relative to a 5,772 K surface from the
 * blackbody table the shaders read (physics/blackbody.ts). Exact for a blackbody; an estimate for a real star.
 */
export function starRadiusRsun(absMagV: number, teffK: number): number {
  const lnY = sampleBlackbody(Math.log(teffK), bbSample).lnY;
  return Math.pow(10, -0.2 * (absMagV - 4.83)) * Math.exp(-0.5 * lnY);
}

/** Its angular radius (rad) seen from a distance in pc. */
export function starAngularRadiusRad(absMagV: number, teffK: number, distPc: number): number {
  const rPc = (starRadiusRsun(absMagV, teffK) * SUN_RADIUS_KM) / PARSEC_KM;
  return Math.asin(Math.min(1, rPc / distPc));
}

/** Nodes of the B0(z)/z texture (uLensB0Z): z = 0, 1/16, …, 8. */
export const B0Z_NODES = 129;
/** Its node spacing in z. */
export const B0Z_STEP = 1 / 16;
/** Its texels: a ghost at z = −1/16, then the 129 nodes (R32F 130 × 1). */
export const B0Z_TEXELS = B0Z_NODES + 1;

/**
 * Fills the B0(z)/z texture (length B0Z_TEXELS): texel i + 1 holds B0(z)/z at z = i/16 (i = 0 … 128), texel 0 the
 * ghost at z = −1/16, equal to the value at +1/16 (B0(z)/z = (4/π) E(z²) is even in z). Beyond z = 8, B0 is 1 to
 * 1e-3, so B0(z)/z = 1/z there.
 */
export function fillB0OverZ(out: Float32Array): Float32Array {
  for (let i = 0; i < B0Z_NODES; i++) out[i + 1] = gouldB0OverZ(i * B0Z_STEP);
  out[0] = out[2];
  return out;
}
