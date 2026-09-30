/**
 * The lens this frame: which hole bends the light, the observer the tables are built for, the tables
 * themselves, the zones where the lens moves light enough to matter, the per-half boxes, edge circles and
 * zone cones, the band's width, the mipmap and glow-target flags and the magnification bound, all written into
 * the shared lens uniforms (render/lens/lensUniforms.ts) that every lensed shader reads.
 *
 * How (docs/data/blackholes.md §10): the hole is the gravity state's (sim/gravity.ts), the observer its r (units
 * of M) and frame (the static observer, or the raindrop only during a fall below 3M). The forward and inverse
 * tables (physics/schwarzschildTables.ts) are rebuilt in place only when tableNeedsRebuild says (|Δ ln r| or
 * |Δ ln(r − 2M)| over 1e-7, or the frame), and uploaded the same frame (lensTextures.ts). The diffuse zone is the
 * outermost look angle where the lens moves light by 0.5 device px or more (|δ| scanned down the forward table's
 * nodes from α = π and bisected between two nodes), the point zone the same at 0.02 px (as a cone of sources:
 * α_p − δ(α_p)). For each half of the view (0 the classical observer, at rest in the Sun's frame, or the raindrop
 * during a fall; 1 the ship, or the faller) the zone and the shadow's edge are cones about the axis in the lens
 * frame carried through that observer's boosts (aberration maps circles to circles: the two edge points of the
 * cone in the plane of the axis and the velocity, each aberrated); the box is the screen rectangle round the
 * zone's projected circle, 12 device px wider (4 px and one coarse Galaxy texel), and the whole screen when the
 * circle reaches behind the camera, is over 60° wide, when |ln g| is over the composite's Doppler skip, or in the
 * raindrop's frame. setLensView copies a half's view into the uniforms beside setPointUniforms.
 *
 * The lens is drawn (lens.active) when the hole's Einstein ring is at least 0.05 device px, View › Gravitational
 * lensing is on and every lensed program has compiled in the background (lensProgramsReady); otherwise every
 * uniform is at the identity and uLensOn is 0.
 *
 * Why: one table a frame is the whole lens for every pixel and vertex; the zones and boxes keep its cost to the
 * pixels and vertices it moves.
 *
 * Cost: at rest near a hole about 20 µs (the views and boxes); when r changes the table builds
 * (physics/schwarzschildTables.ts, within 0.4 ms) and the zone scans (about 40 µs). Nothing is allocated per frame;
 * nothing runs far from holes.
 *
 * Twins: the uniforms' meanings are in render/shaders/lens.glsl; physics/lensMirror32.ts reads the same values
 * through lensMirrorUniforms.
 */
import { Quaternion, Vector3 } from 'three';
import type { BodyId } from '../../sim/bodies/types';
import { getBody } from '../../sim/bodies';
import { blackHoleGm, gravity } from '../../sim/gravity';
import { sim } from '../../sim/sim';
import { useUI } from '../../state/ui';
import { C_KM_S, MPC_KM, PARSEC_KM } from '../../physics/constants';
import type { LensObserver } from '../../physics/schwarzschild';
import {
  FWD_NODES,
  INV_NODES,
  MU_BOUND_NODES,
  REL_NODES,
  buildForwardTable,
  buildInverseTable,
  buildMuBound,
  forwardEvalGap,
  inverseEval,
  lnGapOfS,
  muBoundAxisInto,
  tableNeedsRebuild,
  type ForwardSample,
  type ForwardTable,
  type InverseSample,
  type InverseTable,
} from '../../physics/schwarzschildTables';
import { psfUniforms } from '../materials';
import { quality } from '../quality';
import { lensUniforms } from './lensUniforms';
import { b0zTexture, forwardTexture, inverseTexture } from './lensTextures';
import { lensPassesReady, precompileSoon } from '../precompile';
import { MAX_LENS_SPHERES, sphereBoxes, sphereUniforms } from './lensSphereUniforms';

export { lensUniforms, type LensUniforms } from './lensUniforms';

/** One half of the split view (index 0 classical, 1 relativistic), or the whole view (index 1). */
export interface LensView {
  /** Screen box that holds every pixel the lens moves by ≥ 0.5 device px (and all of it while |ln g| ≥ the Doppler skip), NDC [x0, y0, x1, y1]. */
  box: [number, number, number, number];
  /** The box is the whole screen. */
  full: boolean;
  /** Diffuse lens zone as a cone in the view observer's frame: unit centre and cos of its radius. */
  zoneCentre: Vector3;
  zoneCos: number;
  /** Shadow (or dark region) in the view observer's frame: a circle (aberration keeps circles). */
  edgeCentre: Vector3;
  edgeRadius: number;
  /** Radial half-width of the photon-ring band pass about the edge, device px (3; 0: no band pass, when the edge's radius < 1 px). */
  ssBandPx: number;
}

/** The lens this frame. */
export interface LensState {
  /**
   * The lens is drawn this frame: a hole with an Einstein ring ≥ 0.05 device px, View › Gravitational lensing
   * on, and the lensed programs compiled (lensProgramsReady).
   */
  active: boolean;
  hole: BodyId | null;
  obs: LensObserver;
  mKm: number;
  /** Camera → hole, world axes, hole frame: unit, and in units of M (float64). */
  axis: Vector3;
  holeM: Vector3;
  edge: number;
  thetaE: number;
  /** Source angle from the axis beyond which order 0 moves < 0.02 device px (outermost |δ| scan). */
  pointZoneSrc: number;
  /** Image angle beyond which order 0 moves < 0.5 device px (the diffuse zone; outermost |δ| scan). */
  diffuseZone: number;
  /** Width of the 2π–3π image band, device px (orders ≥ 2 of point sources are drawn when ≥ 1). */
  ringBandPx: number;
  /** The Galaxy targets carry mipmaps this frame (r_o < 3,000 M or an Einstein ring over 100 px). */
  mipmaps: boolean;
  /** The glow goes into its own target (the normal view while a lens is active). */
  glowSeparate: boolean;
  fwd: ForwardTable | null;
  inv: InverseTable | null;
  /** ln|μ₀| bounds (MU_BOUND_NODES) for the vertex pre-cull. */
  muBound: Float32Array;
  view: [LensView, LensView];
  /** The hole's sky cube (off-screen far-side sources) is built and fresh (render/lens/skyCube.ts sets it). */
  skyCubeLive: boolean;
  /** Up to two luminous spheres drawn by the lens (a stellar hole's companion); ids. */
  spheres: BodyId[];
  /** Increments whenever anything above changes (for CPU consumers that cache). */
  version: number;
  /** Device px per radian at the screen's centre this frame. */
  pxPerRad: number;
  /** ln g of the static observer (0 in the raindrop's frame): the colour shift of all light from far away. */
  lnG: number;
  /** The composite's Doppler skip (1e-4; 1e-2 at rung 2): |ln g| over it makes the box the whole screen. */
  dopplerSkip: number;
}

function emptyView(): LensView {
  return { box: [0, 0, 0, 0], full: false, zoneCentre: new Vector3(0, 0, -1), zoneCos: 1, edgeCentre: new Vector3(0, 0, -1), edgeRadius: 0, ssBandPx: 0 };
}

/** The lens this frame: none until updateLens finds one. */
export const lens: LensState = {
  active: false,
  hole: null,
  obs: { frame: 'static', r: Infinity },
  mKm: 0,
  axis: new Vector3(0, 0, -1),
  holeM: new Vector3(),
  edge: 0,
  thetaE: 0,
  pointZoneSrc: 0,
  diffuseZone: 0,
  ringBandPx: 0,
  mipmaps: false,
  glowSeparate: false,
  fwd: null,
  inv: null,
  muBound: new Float32Array(MU_BOUND_NODES),
  view: [emptyView(), emptyView()],
  skyCubeLive: false,
  spheres: [],
  version: 0,
  pxPerRad: 1000,
  lnG: 0,
  dopplerSkip: 1e-4,
};

/** The lens is drawn only when its Einstein ring is at least this many device px. */
export const LENS_MIN_RING_PX = 0.05;
/** The diffuse zone: where the lens moves light by at least this many device px. */
export const DIFFUSE_ZONE_PX = 0.5;
/** The point zone: the same for point sources. */
export const POINT_ZONE_PX = 0.02;
/** Mipmaps of the Galaxy targets within this r (units of M), or with an Einstein ring over MIPMAP_RING_PX. */
export const MIPMAP_WITHIN_M = 3000;
export const MIPMAP_RING_PX = 100;
/** The box's margin round the zone's projected circle: 4 device px and one coarse Galaxy texel (8 px). */
export const BOX_MARGIN_PX = 12;
/** A zone cone wider than this is drawn over the whole screen (its projection is no longer a small ellipse). */
const BOX_MAX_CONE_RAD = Math.PI / 3;
/** Points on the zone's circle projected for its box. */
const BOX_POINTS = 64;
/** Within this r (units of M) a lensed sphere's pass covers the lens box too (strong deflection near the hole). */
export const SPHERE_NEAR_M = 1000;
/** The band pass's radial half-width about the edge, device px, when the edge is at least a pixel in radius. */
export const BAND_HALF_WIDTH_PX = 3;
/** The composite's Doppler skip: rung 0 and 1, and rung 2. */
export const DOPPLER_SKIP = 1e-4;
export const DOPPLER_SKIP_RUNG2 = 1e-2;

// ─── Scratch (nothing allocated per frame) ─────────────────────────────────────────────────────

const fwdSample: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
const invSample: InverseSample = { alpha: 0, m: 0 };
const nextObs: LensObserver = { frame: 'static', r: Infinity };
const axisScratch = { lnPsiMin: 0, invDelta: 0 };
const camRight = new Vector3();
const camUp = new Vector3();
const camBack = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();
const pt = new Vector3();
const coneC = new Vector3();
const shipDir = new Vector3();
const negFrameDir = new Vector3();
const quat = new Quaternion();

/** A boost of a view observer relative to the frame before it: rapidity and unit direction (world). */
interface Boost {
  phi: number;
  dir: Vector3;
}
const boosts: [Boost, Boost] = [
  { phi: 0, dir: new Vector3() },
  { phi: 0, dir: new Vector3() },
];

let forcedReady: boolean | null = null;
/** Development and tests: pretend the lensed programs have compiled (true), have not (false), or ask (null). */
export function forceLensProgramsReady(ready: boolean | null): void {
  forcedReady = ready;
}

/**
 * Development only (dev/lensTest.ts, window.__ls.lensTest): the lens's observer and the view forced to a reference
 * camera (a fixture camera of the Python reference: a position relative to the hole in M, a frame, a motion), so the
 * real passes can be checked against the reference pictures; and the debug skies. Never set by the app itself: with
 * `on` false (always, outside those checks) nothing here is read beyond that flag.
 */
export const lensOverride = {
  on: false,
  hole: null as BodyId | null,
  /** The lens frame: the static observer, or the raindrop (a fixture camera 'raindrop'). */
  frame: 'static' as LensObserver['frame'],
  /** The camera's r, units of M. */
  rM: 0,
  /** The camera relative to the hole, world axes, units of M. */
  camM: new Vector3(0, 0, 1),
  /** The camera's motion relative to the lens frame: rapidity, and unit direction (world axes). */
  phi: 0,
  velDir: new Vector3(0, 0, -1),
  /** Places the camera (orientation, field of view) each frame, after the controller has moved it. */
  apply: null as (() => void) | null,
  /** The debug sky drawn (0 none; 1–4 as dev/lensTest.ts says): the lens box is then the whole screen. */
  debug: 0,
};

/** M = GM/c² of a registered hole, km (the gravity state's when it is that hole). */
function holeMKm(id: BodyId): number {
  if (gravity.hole === id && gravity.mKm > 0) return gravity.mKm;
  return blackHoleGm(id) / (C_KM_S * C_KM_S);
}

/** Whether every lensed program has compiled in the background (no compile ever happens mid-flight). */
export function lensProgramsReady(): boolean {
  return forcedReady ?? lensPassesReady();
}

// ─── Geometry on the sky ───────────────────────────────────────────────────────────────────────

/**
 * A cone (unit centre c, half-angle rho) seen from a frame moving with rapidity phi along unit v (tan(θ′/2) =
 * e^−φ tan(θ/2) from v): its centre (into outC) and half-angle there (returned). Aberration maps circles to
 * circles; the edge points in the plane of c and v, at signed angles ψ ± ρ from v, give the new centre and radius,
 * whether or not the cone contains v or −v.
 */
export function boostCone(c: Vector3, rho: number, v: Vector3, phi: number, outC: Vector3): number {
  if (!(phi > 0) || rho >= Math.PI) {
    outC.copy(c);
    return Math.min(rho, Math.PI);
  }
  const cv = c.dot(v);
  e2.copy(c).addScaledVector(v, -cv);
  const el = e2.length();
  if (el < 1e-300) {
    // The cone is about v (or −v): it stays about it. About v its edge θ = ρ goes to 2 atan(k tan(ρ/2)); about −v its
    // edge θ = π − ρ goes to π − 2 atan(tan(ρ/2) / k), a radius of 2 atan(tan(ρ/2) / k) about −v.
    const k = Math.exp(-phi);
    const r = cv >= 0 ? 2 * Math.atan2(k * Math.sin(rho / 2), Math.cos(rho / 2)) : 2 * Math.atan2(Math.sin(rho / 2), k * Math.cos(rho / 2));
    outC.copy(c);
    return r;
  }
  e2.divideScalar(el);
  const psi = Math.atan2(el, cv);
  const k = Math.exp(-phi);
  const tp = psi + rho;
  const tm = psi - rho;
  const ap = 2 * Math.atan2(k * Math.sin(tp / 2), Math.cos(tp / 2));
  const am = 2 * Math.atan2(k * Math.sin(tm / 2), Math.cos(tm / 2));
  const centre = 0.5 * (ap + am);
  const radius = Math.min(Math.PI, 0.5 * Math.abs(ap - am));
  // centre on the great circle through v and e2 (e2 may be written into outC only after use)
  const cx = Math.cos(centre) * v.x + Math.sin(centre) * e2.x;
  const cy = Math.cos(centre) * v.y + Math.sin(centre) * e2.y;
  const cz = Math.cos(centre) * v.z + Math.sin(centre) * e2.z;
  outC.set(cx, cy, cz).normalize();
  return radius;
}

/** The cone (c, rho) of the lens frame seen by a view observer after `n` boosts: centre into outC, radius returned. */
function viewCone(c: Vector3, rho: number, n: number, outC: Vector3): number {
  coneC.copy(c);
  let r = rho;
  for (let i = 0; i < n; i++) r = boostCone(coneC, r, boosts[i].dir, boosts[i].phi, coneC);
  outC.copy(coneC);
  return r;
}

/**
 * The screen box of a cone of directions (world axes) for the camera (sim.camera: at the origin, looking along
 * −z of its orientation), NDC, grown by marginX and marginY; or 'full' (it reaches behind the camera or is wide),
 * or 'none' (all of it behind the camera). Writes box.
 */
function coneBox(c: Vector3, rho: number, tanHalf: number, aspect: number, marginX: number, marginY: number, box: [number, number, number, number]): 'box' | 'full' | 'none' {
  if (rho >= BOX_MAX_CONE_RAD) return 'full';
  // a basis about c
  const ax = Math.abs(c.x) < 0.9 ? 1 : 0;
  e1.set(ax, ax ? 0 : 1, 0);
  e1.addScaledVector(c, -e1.dot(c)).normalize();
  e2.crossVectors(c, e1);
  const cr = Math.cos(rho);
  const sr = Math.sin(rho);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let behind = 0;
  for (let k = 0; k < BOX_POINTS; k++) {
    const t = (2 * Math.PI * k) / BOX_POINTS;
    const ct = Math.cos(t) * sr;
    const st = Math.sin(t) * sr;
    pt.set(cr * c.x + ct * e1.x + st * e2.x, cr * c.y + ct * e1.y + st * e2.y, cr * c.z + ct * e1.z + st * e2.z);
    const zc = pt.dot(camBack);
    if (!(zc < -1e-6)) {
      behind++;
      continue;
    }
    const x = pt.dot(camRight) / -zc / (tanHalf * aspect);
    const y = pt.dot(camUp) / -zc / tanHalf;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (behind === BOX_POINTS) {
    // the whole circle behind the camera: its inside is visible only if it holds the view's forward direction
    return c.dot(camBack) < -cr ? 'full' : 'none';
  }
  if (behind > 0) return 'full';
  box[0] = Math.max(-1, x0 - marginX);
  box[1] = Math.max(-1, y0 - marginY);
  box[2] = Math.min(1, x1 + marginX);
  box[3] = Math.min(1, y1 + marginY);
  if (box[0] >= box[2] || box[1] >= box[3]) return 'none';
  if (box[0] <= -1 && box[1] <= -1 && box[2] >= 1 && box[3] >= 1) return 'full';
  return 'box';
}

/**
 * The outermost look angle at which the forward table's |δ| reaches `thr` rad: the nodes scanned from α = π
 * inward, then bisection in s between the last two. NaN when |δ| stays below it everywhere; π when even the
 * node at straight out reaches it.
 */
export function zoneAngle(fwd: ForwardTable, thr: number): number {
  const D = fwd.delta;
  const n = fwd.n;
  let i = n - 1;
  while (i >= 0 && !(Math.abs(D[i + 1]) >= thr)) i--;
  if (i < 0) return NaN;
  if (i === n - 1) return Math.PI;
  // |δ| ≥ thr at node i, below it at node i + 1: bisect in s
  let lo = fwd.s0 + i * fwd.ds;
  let hi = lo + fwd.ds;
  for (let k = 0; k < 30; k++) {
    const mid = 0.5 * (lo + hi);
    forwardEvalGap(fwd, Math.exp(lnGapOfS(mid, fwd.kappa)), fwdSample);
    if (Math.abs(fwdSample.delta) >= thr) lo = mid;
    else hi = mid;
  }
  return fwd.edge + Math.exp(lnGapOfS(lo, fwd.kappa));
}

// ─── The uniforms ──────────────────────────────────────────────────────────────────────────────

/** Every lens uniform back to the identity (no lens). */
function identityUniforms(): void {
  const u = lensUniforms;
  u.uLensOn.value = 0;
  u.uLensHole.value.set(0, 0, 0);
  u.uLensAxis.value.set(0, 0, -1);
  u.uLensRo.value = 1e30;
  u.uLensEdge.value = 0;
  u.uLensSpan.value = Math.PI;
  u.uLensFrame.value = 0;
  u.uLensLnG.value = 0;
  u.uLensRain.value.set(0, 1);
  u.uLensPtCos.value = 1;
  u.uLensDiffCos.value = 1;
  u.uLensMuBound.value.fill(0);
  u.uLensBox.value.set(0, 0, 0, 0);
  u.uLensEdgeCentre.value.set(0, 0, -1);
  u.uLensEdgeRadius.value = 0;
  u.uLensSsBandPx.value = 0;
  u.uLensBandChord2.value.set(0, 0);
  u.uLensZoneCentre.value.set(0, 0, -1);
  u.uLensZoneCos.value = 1;
  u.uFramePhi.value = 0;
  u.uFrameEPhi.value = 1;
  u.uFrameEmPhi.value = 1;
  u.uFrameVelDir.value.set(0, 0, -1);
}

/** The table-dependent values of the lens uniforms (as lensMirror32 reads them too): writes `out`. */
export interface LensTableValues {
  ro: number;
  edge: number;
  span: number;
  frame: number;
  lnG: number;
  rainV: number;
  rainOneMinusV: number;
  fwd: [number, number, number, number];
  inv: [number, number, number, number];
  invRel: [number, number, number, number];
  muAxis: [number, number];
}

/** The uniforms' values for these tables and this observer (r, frame from fwd.obs). */
export function lensTableValues(fwd: ForwardTable, inv: InverseTable, out: LensTableValues): LensTableValues {
  const r = fwd.obs.r;
  const rain = fwd.obs.frame === 'rain';
  out.ro = r;
  out.edge = fwd.edge;
  out.span = fwd.span;
  out.frame = rain ? 1 : 0;
  out.lnG = rain ? 0 : r < 4 ? -0.5 * Math.log((r - 2) / r) : -0.5 * Math.log1p(-2 / r);
  const v = Math.sqrt(2 / r);
  out.rainV = v;
  out.rainOneMinusV = (r - 2) / (r * (1 + v));
  out.fwd[0] = fwd.s0;
  out.fwd[1] = 1 / fwd.ds;
  out.fwd[2] = fwd.n;
  out.fwd[3] = fwd.kappa;
  out.inv[0] = inv.z0;
  out.inv[1] = inv.dz > 0 ? 1 / inv.dz : 1;
  out.inv[2] = inv.n;
  out.inv[3] = 2 * inv.thetaE;
  out.invRel[0] = inv.rel.d0;
  out.invRel[1] = 1 / inv.rel.dd;
  out.invRel[2] = inv.rel.n;
  out.invRel[3] = 0;
  muBoundAxisInto(inv, axisScratch);
  out.muAxis[0] = axisScratch.lnPsiMin;
  out.muAxis[1] = axisScratch.invDelta;
  return out;
}

const tv: LensTableValues = { ro: 0, edge: 0, span: 0, frame: 0, lnG: 0, rainV: 0, rainOneMinusV: 1, fwd: [0, 1, 2, 3], inv: [0, 1, 2, 1], invRel: [2 * Math.PI, 1, 2, 0], muAxis: [0, 1] };

function writeTableUniforms(fwd: ForwardTable, inv: InverseTable): void {
  lensTableValues(fwd, inv, tv);
  const u = lensUniforms;
  u.uLensRo.value = tv.ro;
  u.uLensEdge.value = tv.edge;
  u.uLensSpan.value = tv.span;
  u.uLensFrame.value = tv.frame;
  u.uLensLnG.value = tv.lnG;
  u.uLensRain.value.set(tv.rainV, tv.rainOneMinusV);
  u.uLensFwd.value.set(tv.fwd[0], tv.fwd[1], tv.fwd[2], tv.fwd[3]);
  u.uLensInv.value.set(tv.inv[0], tv.inv[1], tv.inv[2], tv.inv[3]);
  u.uLensInvRel.value.set(tv.invRel[0], tv.invRel[1], tv.invRel[2], tv.invRel[3]);
  u.uLensMuBoundAxis.value.set(tv.muAxis[0], tv.muAxis[1]);
  u.uLensMuBound.value.set(lens.muBound);
  u.uLensFwdTab.value = forwardTexture(fwd);
  u.uLensInvTab.value = inverseTexture(inv);
  u.uLensB0Z.value = b0zTexture();
}

// ─── Per frame ─────────────────────────────────────────────────────────────────────────────────

/** The zones are scanned again when the screen's scale (device px per radian) moves by more than this share. */
export const ZONE_RESCAN_SCALE = 0.01;
/** The screen's scale the zones and the band were last scanned at. */
let zonesPxPerRad = NaN;

/**
 * The zones for these tables at this screen scale (outermost |δ| over the thresholds; the point zone as a cone of
 * sources) and the width of the 2π–3π image band, in device px.
 */
function scanZones(fwd: ForwardTable, inv: InverseTable, pxPerRad: number): void {
  const rain = fwd.obs.frame === 'rain';
  const aD = zoneAngle(fwd, DIFFUSE_ZONE_PX / pxPerRad);
  const aP = zoneAngle(fwd, POINT_ZONE_PX / pxPerRad);
  lens.diffuseZone = rain ? Math.PI : Number.isNaN(aD) ? 0 : aD;
  if (rain) lens.pointZoneSrc = Math.PI;
  else if (Number.isNaN(aP)) lens.pointZoneSrc = 0;
  else {
    forwardEvalGap(fwd, aP - fwd.edge, fwdSample);
    lens.pointZoneSrc = Math.min(Math.PI, Math.max(0, aP - fwdSample.delta));
  }
  inverseEval(inv, 2 * Math.PI, invSample);
  const a2 = invSample.alpha;
  inverseEval(inv, 3 * Math.PI, invSample);
  lens.ringBandPx = Math.abs(a2 - invSample.alpha) * pxPerRad;
  zonesPxPerRad = pxPerRad;
}

let wasActive = false;
let lastHole: BodyId | null = null;

/** No lens this frame: everything at its default (once). */
function noLens(): void {
  lens.hole = null;
  if (!wasActive && lens.version === lensVersionAtIdle) return;
  lens.active = false;
  lens.mipmaps = false;
  lens.glowSeparate = false;
  lens.ringBandPx = 0;
  lens.spheres.length = 0;
  lens.lnG = 0;
  for (const v of lens.view) {
    v.box[0] = v.box[1] = v.box[2] = v.box[3] = 0;
    v.full = false;
    v.zoneCos = 1;
    v.edgeRadius = 0;
    v.ssBandPx = 0;
  }
  identityUniforms();
  // The table uniforms are identity now: the next lens must write them again, even for the same hole and observer
  // (lensing switched off and on while hovering left an observer at infinity drawn until the camera moved).
  lastHole = null;
  wasActive = false;
  lens.version++;
  lensVersionAtIdle = lens.version;
}
let lensVersionAtIdle = 0;

/**
 * The boosts that take the lens frame to each half's view observer: outside a fall, half 0 is
 * at rest in S (the hole frame seen from S: the frame boost reversed) and half 1 the ship (then its motion in S);
 * during a fall (no frame boost there), half 0 is the raindrop (inward, above 3M) and half 1 the faller.
 */
function setBoosts(half: 0 | 1): number {
  if (lensOverride.on) {
    // A reference camera: half 0 at rest in the lens frame, half 1 moving as the camera does.
    const b = boosts[0];
    b.phi = half === 1 ? lensOverride.phi : 0;
    b.dir.copy(lensOverride.velDir);
    return b.phi > 0 ? 1 : 0;
  }
  const fv = gravity.fallView;
  if (fv) {
    const b = boosts[0];
    if (half === 0) {
      b.phi = fv.rainPhi;
      b.dir.copy(lens.axis);
    } else {
      b.phi = fv.phi;
      b.dir.copy(fv.dir);
    }
    return b.phi > 0 ? 1 : 0;
  }
  let n = 0;
  if (gravity.framePhi > 0) {
    negFrameDir.copy(gravity.frameVelDir).negate();
    boosts[n].phi = gravity.framePhi;
    boosts[n].dir.copy(negFrameDir);
    n++;
  }
  if (half === 1) {
    const phi = sim.ship.phi;
    if (Number.isFinite(phi) && phi > 0 && sim.ship.vel.lengthSq() > 0) {
      shipDir.copy(sim.ship.vel).normalize();
      boosts[n].phi = phi;
      boosts[n].dir.copy(shipDir);
      n++;
    }
  }
  return n;
}

/** Runs between updateCosmicSky and updateRelativisticView (SimDriver). */
export function updateLens(): void {
  const ov = lensOverride.on;
  if (ov) lensOverride.apply?.();
  const hole = ov ? lensOverride.hole : gravity.hole;
  // A hole this close: its programs should compile now rather than after start-up's delay.
  if (hole) precompileSoon();
  const vh = Math.max(1, sim.viewport.height);
  const vw = Math.max(1, sim.viewport.width);
  const dpr = psfUniforms.uPixelRatio.value || 1;
  const tanHalf = Math.tan((sim.camera.fovDeg * Math.PI) / 360);
  const pxPerRad = (vh * dpr) / 2 / tanHalf;
  lens.pxPerRad = pxPerRad;
  // Weak-field estimate of the Einstein angle first: far away no table is built at all.
  const x = ov ? 2 / lensOverride.rM : gravity.x;
  if (!hole || !(Math.sqrt(2 * x) * pxPerRad >= 0.5 * LENS_MIN_RING_PX)) {
    noLens();
    return;
  }
  nextObs.frame = ov ? lensOverride.frame : gravity.frame;
  nextObs.r = ov ? lensOverride.rM : gravity.rM;
  const holeChanged = hole !== lastHole;
  if (holeChanged || !lens.fwd || !lens.inv || tableNeedsRebuild(lens.obs, nextObs)) {
    lens.fwd = buildForwardTable(nextObs, FWD_NODES, lens.fwd ?? undefined);
    lens.inv = buildInverseTable(lens.fwd, INV_NODES, REL_NODES, lens.inv ?? undefined);
    buildMuBound(lens.inv, lens.muBound);
    lens.obs.frame = nextObs.frame;
    lens.obs.r = nextObs.r;
    lens.edge = lens.fwd.edge;
    lens.thetaE = lens.inv.thetaE;
    lastHole = hole;
    scanZones(lens.fwd, lens.inv, pxPerRad);
    writeTableUniforms(lens.fwd, lens.inv);
    lens.version++;
  } else if (!(Math.abs(pxPerRad / zonesPxPerRad - 1) <= ZONE_RESCAN_SCALE)) {
    // The same tables on a screen of another scale (the window resized, the pixel ratio stepped): the zones and the
    // band are in pixels, so they are scanned again.
    scanZones(lens.fwd, lens.inv, pxPerRad);
    lens.version++;
  }
  lens.hole = hole;
  const m = ov ? holeMKm(hole) : gravity.mKm;
  lens.mKm = m;
  if (ov) lens.holeM.copy(lensOverride.camM).negate();
  else lens.holeM.copy(gravity.camRelHoleKm).multiplyScalar(-1 / m);
  lens.axis.copy(lens.holeM).normalize();
  const rain = lens.obs.frame === 'rain';
  const r = lens.obs.r;
  lens.lnG = rain ? 0 : ov ? (r < 4 ? -0.5 * Math.log((r - 2) / r) : -0.5 * Math.log1p(-2 / r)) : gravity.lnGStatic;
  const ui = useUI.getState();
  const drawn = lens.thetaE * pxPerRad >= LENS_MIN_RING_PX && (ov || (ui.lensing && lensProgramsReady()));
  if (!drawn) {
    if (wasActive) noLens();
    lens.hole = hole;
    return;
  }
  lens.active = true;
  wasActive = true;
  // Rung 2 reads the Galaxy targets at level 0.
  lens.mipmaps = quality.lensRung < 2 && (lens.obs.r < MIPMAP_WITHIN_M || lens.thetaE * pxPerRad > MIPMAP_RING_PX);
  lens.dopplerSkip = quality.lensRung >= 2 ? DOPPLER_SKIP_RUNG2 : DOPPLER_SKIP;
  // The glow has a target of its own whenever the Galaxy layer is drawn over the whole width (not a half of the split view).
  const relPath = ov ? Math.tanh(lensOverride.phi) > 0.01 : gravity.fallView !== null || (Number.isFinite(sim.ship.phi) && Math.tanh(sim.ship.phi) > 0.01);
  lens.glowSeparate = !(ui.relMode === 'split' && relPath);

  // The uniforms that follow the camera: the hole, the scale, the frame boost, the zones.
  const u = lensUniforms;
  u.uLensOn.value = 1;
  u.uLensHole.value.copy(lens.holeM);
  u.uLensAxis.value.copy(lens.axis);
  u.uLensScale.value.set(1 / m, PARSEC_KM / m, (1000 * PARSEC_KM) / m, MPC_KM / m);
  u.uLensPxPerRad.value = pxPerRad;
  u.uLensPtCos.value = lens.pointZoneSrc >= Math.PI ? -1 : Math.cos(lens.pointZoneSrc);
  u.uLensDiffCos.value = lens.diffuseZone >= Math.PI ? -1 : Math.cos(lens.diffuseZone);
  const fphi = ov || gravity.fallView ? 0 : gravity.framePhi;
  u.uFramePhi.value = fphi;
  u.uFrameEPhi.value = Math.exp(fphi);
  u.uFrameEmPhi.value = Math.exp(-fphi);
  u.uFrameVelDir.value.copy(gravity.frameVelDir);

  // The views of both halves.
  quat.copy(sim.camera.quat);
  camRight.set(1, 0, 0).applyQuaternion(quat);
  camUp.set(0, 1, 0).applyQuaternion(quat);
  camBack.set(0, 0, 1).applyQuaternion(quat);
  const aspect = vw / vh;
  const mx = (BOX_MARGIN_PX * 2) / (vw * dpr);
  const my = (BOX_MARGIN_PX * 2) / (vh * dpr);
  const fullScreen = rain || Math.abs(lens.lnG) >= lens.dopplerSkip || lensOverride.debug > 0;
  updateView(0, pxPerRad, fullScreen, tanHalf, aspect, mx, my);
  updateView(1, pxPerRad, fullScreen, tanHalf, aspect, mx, my);
  selectSpheres(pxPerRad, tanHalf, aspect, mx, my);
}

const sphereRel = new Vector3();
const sphereDir = new Vector3();
const sphereCone = new Vector3();
const sphereBox: [number, number, number, number] = [0, 0, 0, 0];

/**
 * The luminous spheres drawn through the lens: the hole's companion star when its disc is at least
 * a pixel and its straight-line direction lies in the diffuse zone; their uniforms, and each half's box for them
 * (its view's lens box and the disc's, grown by twice the Einstein angle).
 */
function selectSpheres(pxPerRad: number, tanHalf: number, aspect: number, mx: number, my: number): void {
  lens.spheres.length = 0;
  const T = sphereUniforms.uSphereT.value;
  for (let i = 0; i < MAX_LENS_SPHERES; i++) T[i].y = 0;
  sphereBoxes[0][0] = sphereBoxes[0][1] = sphereBoxes[0][2] = sphereBoxes[0][3] = 0;
  sphereBoxes[1][0] = sphereBoxes[1][1] = sphereBoxes[1][2] = sphereBoxes[1][3] = 0;
  const hole = lens.hole;
  const companion = hole && !lensOverride.on ? getBody(hole)?.blackHole?.companion : undefined;
  if (!hole || !companion) return;
  const cb = sim.bodies[companion];
  const hb = sim.bodies[hole];
  const rec = getBody(companion);
  const lum = rec?.physical.luminous;
  if (!cb?.present || !hb || !rec || !lum) return;
  const m = gravity.mKm;
  sphereRel.copy(cb.pos).sub(hb.pos);
  const kLen = sphereRel.length();
  // camera → companion, km
  sphereDir.copy(sphereRel).sub(gravity.camRelHoleKm);
  const dist = sphereDir.length();
  const radiusKm = rec.physical.radiusKm;
  if (!(dist > radiusKm)) return;
  const angRadius = Math.asin(radiusKm / dist);
  if (angRadius * pxPerRad < 1) return;
  sphereDir.divideScalar(dist);
  if (sphereDir.angleTo(lens.axis) > lens.diffuseZone + angRadius) return;
  const i = lens.spheres.length;
  lens.spheres.push(companion);
  sphereUniforms.uSphereKR.value[i].set(sphereRel.x / m, sphereRel.y / m, sphereRel.z / m, radiusKm / m);
  T[i].set(Math.log(lum.teffK), 1, 0.5 * Math.log1p(-(2 * m) / kLen), 0);
  sphereUniforms.uSphereVel.value[i].copy(cb.vel).sub(hb.vel).divideScalar(C_KM_S);
  // Each half's box: where the sphere's images can be. Far from the hole every image of a sphere of angular radius ρ
  // lies within ρ + θ_E of its straight direction (the primary image moves outwards by (√(β² + 4θ_E²) − β)/2 ≤ θ_E; a
  // source at a finite distance has a smaller Einstein angle than one at infinity) or within θ_E + ρ of the axis (the
  // secondary image and the photon ring's, inside the Einstein ring): the two cones, grown by half again. Near the
  // hole (r_o under SPHERE_NEAR_M, strong deflection) the lens box as well. (The lens box alone at Gaia BH1 from 10⁶ km
  // is 465 px square, about 50 times the pixels the sphere's images cover.)
  const near = lens.obs.r < SPHERE_NEAR_M;
  for (let h = 0 as 0 | 1; ; h = 1) {
    const n = setBoosts(h);
    const v = lens.view[h];
    const out = sphereBoxes[h];
    const r = viewCone(sphereDir, 1.5 * (angRadius + 2 * lens.thetaE), n, sphereCone);
    let kind = coneBox(sphereCone, r, tanHalf, aspect, mx, my, sphereBox);
    if (kind === 'box') {
      out[0] = sphereBox[0];
      out[1] = sphereBox[1];
      out[2] = sphereBox[2];
      out[3] = sphereBox[3];
    } else out[0] = out[1] = out[2] = out[3] = 0;
    // the axis's cone (or the lens box, near the hole)
    if (kind !== 'full') {
      if (near) {
        kind = v.full ? 'full' : v.box[2] > v.box[0] ? 'box' : 'none';
        for (let k = 0; k < 4; k++) sphereBox[k] = v.box[k];
      } else {
        const ra = viewCone(lens.axis, 1.5 * (lens.thetaE + angRadius) + lens.edge, n, sphereCone);
        kind = coneBox(sphereCone, ra, tanHalf, aspect, mx, my, sphereBox);
      }
      if (kind === 'box') {
        if (!(out[2] > out[0])) for (let k = 0; k < 4; k++) out[k] = sphereBox[k];
        else {
          out[0] = Math.min(out[0], sphereBox[0]);
          out[1] = Math.min(out[1], sphereBox[1]);
          out[2] = Math.max(out[2], sphereBox[2]);
          out[3] = Math.max(out[3], sphereBox[3]);
        }
      }
    }
    if (kind === 'full') {
      out[0] = -1;
      out[1] = -1;
      out[2] = 1;
      out[3] = 1;
    }
    if (h === 1) break;
  }
}

/** One half's view: its edge circle, zone cone, band and box. */
function updateView(h: 0 | 1, pxPerRad: number, fullScreen: boolean, tanHalf: number, aspect: number, mx: number, my: number): void {
  const v = lens.view[h];
  const n = setBoosts(h);
  v.edgeRadius = viewCone(lens.axis, lens.edge, n, v.edgeCentre);
  const zr = viewCone(lens.axis, lens.diffuseZone, n, v.zoneCentre);
  v.zoneCos = zr >= Math.PI ? -1 : Math.cos(zr);
  v.ssBandPx = v.edgeRadius * pxPerRad >= 1 ? BAND_HALF_WIDTH_PX : 0;
  const kind = fullScreen ? 'full' : lens.diffuseZone > 0 ? coneBox(v.zoneCentre, zr, tanHalf, aspect, mx, my, v.box) : 'none';
  v.full = kind === 'full';
  if (kind === 'full') {
    v.box[0] = -1;
    v.box[1] = -1;
    v.box[2] = 1;
    v.box[3] = 1;
  } else if (kind === 'none') v.box[0] = v.box[1] = v.box[2] = v.box[3] = 0;
}

/**
 * The band's annulus, all directions within (ssBandPx + 1) pixel angles of an edge circle of radius R, as bounds on the
 * squared chord to its centre, in float64 (the GPU's sin() is inaccurate for small angles): (4 sin²((R − w)/2),
 * 4 sin²((R + w)/2)), −1 below and 5 above when the annulus reaches the centre or the far pole; (0, 0), which holds no
 * direction, with no band. Into out (the uniform uLensBandChord2, lens.glsl lensInBand).
 */
export function bandChord2(edgeRadius: number, ssBandPx: number, pxPerRad: number, out: { set(x: number, y: number): unknown }): void {
  if (!(ssBandPx > 0)) {
    out.set(0, 0);
    return;
  }
  const w = (ssBandPx + 1) / pxPerRad;
  const lo = edgeRadius - w;
  const hi = edgeRadius + w;
  const sLo = Math.sin(0.5 * lo);
  const sHi = Math.sin(0.5 * hi);
  out.set(lo > 0 ? 4 * sLo * sLo : -1, hi < Math.PI ? 4 * sHi * sHi : 5);
}

/** Copy view[relativistic ? 1 : 0] into the shared uniforms (called beside setPointUniforms). */
export function setLensView(relativistic: boolean): void {
  const u = lensUniforms;
  if (!lens.active) {
    u.uLensBox.value.set(0, 0, 0, 0);
    u.uLensSsBandPx.value = 0;
    u.uLensBandChord2.value.set(0, 0);
    sphereUniforms.uLensBox.value.set(0, 0, 0, 0);
    return;
  }
  const h = relativistic ? 1 : 0;
  const v = lens.view[h];
  u.uLensBox.value.set(v.box[0], v.box[1], v.box[2], v.box[3]);
  const sb = sphereBoxes[h];
  sphereUniforms.uLensBox.value.set(sb[0], sb[1], sb[2], sb[3]);
  u.uLensEdgeCentre.value.copy(v.edgeCentre);
  u.uLensEdgeRadius.value = v.edgeRadius;
  u.uLensSsBandPx.value = v.ssBandPx;
  bandChord2(v.edgeRadius, v.ssBandPx, lens.pxPerRad, u.uLensBandChord2.value);
  u.uLensZoneCentre.value.copy(v.zoneCentre);
  u.uLensZoneCos.value = v.zoneCos;
}
