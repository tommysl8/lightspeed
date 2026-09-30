/**
 * Bodies seen through a black hole's lens, on the CPU, and what each black hole looks like from the camera.
 *
 * What: every image (orders 0–2) of the bodies near the lens's axis or near the hole (the S-stars, a stellar
 * hole's companion, the Sun, the planets, the deep-sky bodies' labels), with its screen point, magnitude and
 * frequency shift, so the glints, labels, picking and the hover tag sit on the drawn images; near-perfect
 * alignments as rings of light (scene/LensRings.tsx); the active hole's shadow as an exact circle on screen in
 * each half of the view (labels, picking) and its exact distances; and holeView's numbers for the card, the
 * HUD, the labels and the scene tests.
 *
 * How, float64 throughout:
 *   relM = (body − hole) − camRelHole: the first difference from heliocentric positions (2 km coarse at Gaia BH1,
 *   10⁻⁶ of the companion's distance), the second from gravity.camRelHoleKm, the only camera near a hole; its
 *   direction boosted from the Sun's frame to the hole's (frameAberrate, ln D_f(src));
 *   tier 2 (physics/lensPoint.ts pointImageExact: exact, both branches, the emitter's own potential and its
 *   emission direction) for bodies within 1,000 r_o of the hole seen by a static observer outside r = 3M; tier 1
 *   (pointImageTier1) on the very tables the GPU reads (lens.inv) otherwise;
 *   near a caustic (D = nπ, n ≥ 1) the source's own disc caps the magnification: ln(μB0) = ln(zμ) + ln(B0(z)/z),
 *   z = |D − nπ| r_s/R★, finite at exact alignment;
 *   each image back to the Sun's frame (frameUnaberrate, ln D_f(img)), then to the view observer of the half it
 *   lands in (the ship relative to the Sun's frame; in a fall the raindrop and the faller relative to the lens
 *   frame, whose frame boost is 0), projected as derived.ts projects bodies;
 *   ln D_tot = ln D_src + ln g − ln D_f(img) + ln D_view, D_src the frame boost of a source at rest in the Sun's
 *   frame (tier 1) or the source's own motion relative to the hole's frame along its emission direction (tier 2,
 *   the S-stars' orbital shift); the magnitude is the flat one − 2.5 log10(μB0) + the band's shift for
 *   ln D_tot (the glint shader's dopplerMagnitudeShift, whose −2 ln D is the solid-angle change of an observer's
 *   boost), with 2(ln g + ln D_own) added back: the lens's solid angle is μ, and neither the gravitational shift
 *   nor a source's own motion changes it (the distances are the hole frame's);
 *   an image of order ≥ 1 is kept while it could show (the eye's limit + 1 for stars).
 * Rings: the two images at a caustic with z < 3.5 fade into a ring (scene/LensRings.tsx) over z 3.5 → 2.5,
 * of radius their mean look angle (the caustic's image angle to O(β²)), arcs of half-angle asin(min(1, 1/z))
 * about the side towards the source and away from it (a disc behind a point lens, Gould 1994), holding all
 * their light.
 * Circles: aberration maps circles on the sky to circles (it is conformal), so the shadow (the edge angle about the axis
 * in the lens frame) is a circle for any observer. boostCircle moves its two points in the plane of the centre
 * and the velocity, tan(θ′/2) = k tan(θ/2), exactly, and the new centre and radius are their mean and half
 * difference (for a radius under 10⁻⁶ rad, the centre's image and the radius × dθ′/dθ).
 * The Einstein ring (holeView) solves Δφ(α) = π by the Illinois method in ln(α − α_edge) on the closed-form
 * sweeps (about 15 of them), cached per hole while r holds; the lens's own table gives it for the active lens.
 *
 * Why: a label, a pick or a hover tag must sit on the drawn image (0.01 px), and a black hole's shadow must be
 * picked where it is drawn, at any size (the small-angle radius is 31 px short at 10 M, and meaningless inside
 * the horizon).
 *
 * Cost: nothing without an active lens but the active hole's two circles (a few closed forms). With one: a loop
 * over the registered bodies (≈ 480), order 0 of those in the point zone (a few table reads each), orders 1–2 of
 * the bright ones (a bound on their magnification skips the rest before any solving), tier 2 for the bodies near
 * the hole (≈ 10 µs an image): 0.21–0.39 ms of processor time in the worst case, 20 M from Sgr A* with 390
 * bodies in the zone, on a laptop busy with other work (budget 0.5 ms; lensBodies.test.ts). No allocation per body: each lensed body keeps its
 * BodyLens, and numbers travel through REG and objects of this module's own classes (see "Allocation" below); a
 * frame fills a few hundred bytes in all, from tier 2's own numbers and the once-a-frame set-up.
 *
 * Twins: the GPU draws the same images through render/shaders/lens.glsl (lensImage, the same tables) and
 * lensExact.glsl; the arithmetic is physics/lensPoint.ts's; render/lens/lensState.ts draws the same edge
 * circles (LensView.edgeCentre, edgeRadius); the glints' shader (render/shaders/glints.vert.glsl) adds the view
 * observer's own shift to lnDx and magLensed as this module does.
 */
import { Vector3, Quaternion, PerspectiveCamera } from 'three';
import { blackbodyLut, LN_Y_FLOOR } from '../physics/blackbody';
import { C_KM_S, G0_KM_S2, SUN_TEFF_K } from '../physics/constants';
import { hoverAccelKmS2, properAccelKmS2, relativeRapidity, tidalStretchMS2 } from '../physics/geodesics';
import { pointImageExact, pointImageTier1, type ImageOrder, type PointImage } from '../physics/lensPoint';
import { edgeAngle, escapeSweepInto, lnGRain, spanAngle, type LensFrame, type LensObserver, type SweepSample } from '../physics/schwarzschild';
import type { InverseTable } from '../physics/schwarzschildTables';
import { lens } from '../render/lens/lensState';
import { lensUniforms } from '../render/lens/lensUniforms';
import { relView } from '../render/relativisticView';
import { controller } from '../controls/cameraController';
import { flowPoint, type FlowPoint } from './blackholes/accretion';
import type { BodyId, BodyRecord } from './bodies';
import { bodyEntries, entryOf, type Entry } from './bodies/registry';
import { fall } from './fall';
import { blackHoles, gravity } from './gravity';
import { MAX_BODY_IMAGES, ScreenPos, sim, type BodyImage, type BodyLens, type BodyState, type LensRing, type ScreenPoint } from './sim';
import { STAR_MAG_LIMIT } from './stars/visibility';

/** What a black hole looks like from where the camera is (card, data sheet, HUD, labels, scene tests). */
export interface HoleView {
  id: BodyId;
  /** Distance to the centre, km (exact for the active hole: gravity.camRelHoleKm). */
  distanceKm: number;
  /** Height above the horizon, km, and r in units of r_s: what the card, ViewInfo and the label show for a hole. */
  heightKm: number;
  rOverRs: number;
  rM: number;
  frame: LensFrame;
  /** Angular radius of the shadow (or dark region) in the view observer's frame, rad; its centre off the hole's direction, rad. */
  shadowRadius: number;
  shadowOffset: number;
  /**
   * The shadow's centre as the view observer sees it: a unit direction, world axes (the hole's own direction,
   * from which shadowOffset is measured, is the camera → hole line). Written into when present.
   */
  shadowCentre?: Vector3;
  /** The Einstein ring of the sky behind (sources at infinity; the static observer, or the raindrop below 3M in a fall), rad. */
  einsteinRadius: number;
  /** dτ/dt of the camera against home's clock (α/γ_S; in a fall dτ/dT on the free-fallers' clocks). */
  clockRate: number;
  /** Proper acceleration needed to hold the present motion here, in g (hover, or properAccelKmS2); null inside the horizon or while falling. */
  thrustG: number | null;
  /** Tidal stretch across 2 m, m/s²; and whether it passes the fall's own limit (1,000 m/s²). */
  tidalMS2: number;
  tidesTearShip: boolean;
}

/** Magnitudes per unit of ln flux, 2.5/ln 10 (the shaders' MAG_PER_LN). */
export const MAG_PER_LN = 2.5 / Math.LN10;
/** Bodies within this distance of the hole (units of M) are lensed wherever they are in the sky. */
export const LENS_NEAR_M = 1e5;
/** Tier 2 (exact) for bodies within this many r_o of the hole, seen by a static observer outside r = 3M. */
export const TIER2_WITHIN_RO = 1e3;
/**
 * A body fainter than this in flat space is not lensed unless it is the focus or the selection: even perfectly
 * aligned behind a hole (the Sun 8 kpc behind Sgr A*: 23.7 magnitudes brighter) it would stay below what a glint
 * can show (about 15).
 */
export const LENS_FAINT_MAG = 45;
/** The ring of an alignment is drawn from this z = β/ρ inward, and holds all the light from RING_FULL_Z. */
export const RING_START_Z = 3.5;
export const RING_FULL_Z = 2.5;
/**
 * screenOf's vectors shorter than this (km) are directions, not points (nothing labelled sits within a few km of
 * the camera), and are lensed as light from infinitely far away: AT_INFINITY_M (units of M), where the parallax
 * of even the widest lens (b ≈ 4 × 10⁹ M) is 10⁻²⁰ rad.
 */
const DIRECTION_ONLY_KM = 2;
const AT_INFINITY_M = 1e30;
/** Rings drawn at once (scene/LensRings.tsx). */
export const MAX_RINGS = 8;
/** Far from a caustic B0 is 1 within 1/(8z²): beyond z = 100, under 2 × 10⁻⁵ mag, it is left out. */
const B0_Z_MAX = 100;
/** The tidal stretch (m/s² across 2 m) where a fall ends: beyond it a ship is torn apart. */
const TIDES_TEAR_MS2 = 1000;
/** Secondary images of bodies other than stars are kept while brighter than this (a glint fainter shows nothing). */
const GLINT_KEEP_MAG = 16;
/** Secondary images of stars are kept while brighter than this: the eye's limit, and a magnitude of fading. */
const STAR_KEEP_MAG = STAR_MAG_LIMIT + 1;

const TWO_PI = 2 * Math.PI;
/**
 * Offsets from a caustic (rad, seen from the hole) that the float64 geometry resolves to 10⁻⁴ (γ near π carries
 * about 10⁻¹⁶ rad of rounding): the finite-source cap measures z|μ| no nearer the caustic than this (lensEntry).
 */
const OFFSET_RESOLVED_RAD = 1e-12;
/**
 * A bound on how much a frequency shift ln D can brighten a blackbody in V, magnitudes per unit |ln D|: the
 * shift is −(2.5/ln 10)(d ln Y/d ln T − 2) ln D to first order, and d ln Y/d ln T = hc/λkT < 26 above 1,000 K.
 * Only prunes images far below what could show before their shift is worked out exactly.
 */
const SHIFT_BOUND_MAG = 30;

/**
 * Numbers passed to and from the per-image helpers below. A double passed to, or returned from, a call V8 does
 * not inline is boxed: one allocation per call, per image, per frame; these registers carry them instead.
 * R_LN: a frequency factor's ln D (out); R_SHIFT: a magnitude shift (out); R_LNT, R_LND: a temperature's and a
 * shift's ln (in); R_DIST: a distance, km (in); R_ARG, R_LNY: lnYInto's argument and result; R_B0: b0OverZInto's
 * result (its argument in R_ARG).
 */
const REG = new Float64Array(8);
const R_LN = 0;
const R_SHIFT = 1;
const R_LNT = 2;
const R_LND = 3;
const R_DIST = 4;
const R_ARG = 5;
const R_LNY = 6;
const R_B0 = 7;

// ─── Small float64 helpers ──────────────────────────────────────────────────────────────────

/*
 * Allocation. V8 boxes a number (a 16-byte allocation) when it is passed to or returned from a call it does not
 * inline, and when it is stored into a field whose layout is shared with objects that have held other things
 * there. So the per-image path passes numbers through REG; stores them at its own sites rather than through
 * three.js's shared methods (copy, set, applyQuaternion); and keeps them in objects of classes of its own
 * (ImageState, RingState, sim.ts ScreenPos, three.js Vector3), never in { x, y, … } literals, whose field layout
 * every object in the app that starts with x shares.
 */

/** out = a, component by component, at this module's own store site. */
function copy3(a: Vector3, out: Vector3): void {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
}

/** The angle between two unit vectors, from chords (exact at 0 and π). */
function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  const sx = ax + bx;
  const sy = ay + by;
  const sz = az + bz;
  return 2 * Math.atan2(Math.sqrt(dx * dx + dy * dy + dz * dz), Math.sqrt(sx * sx + sy * sy + sz * sz));
}

/**
 * The circle of angular radius rho about unit centre c, seen by an observer boosted along unit v with half-angle
 * ratio k (tan(θ′/2) = k tan(θ/2), θ from v: k = e^−φ into the moving frame, e^φ back out of it): writes its
 * centre into outC and returns its radius. Exact: the plane of c and v is a plane of symmetry, so the circle's two
 * points in it map to the new circle's two points in it (for rho < 10⁻⁶ rad the centre's image and rho·dθ′/dθ,
 * whose error is O(rho²)). Works for any radius up to π (inside the photon sphere the shadow passes 90°).
 */
export function boostCircle(c: Vector3, rho: number, v: Vector3, k: number, outC: Vector3): number {
  if (k === 1) {
    outC.copy(c);
    return rho;
  }
  const dx = c.x - v.x;
  const dy = c.y - v.y;
  const dz = c.z - v.z;
  const px = c.x + v.x;
  const py = c.y + v.y;
  const pz = c.z + v.z;
  const sLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const cLen = Math.sqrt(px * px + py * py + pz * pz);
  const n = Math.hypot(sLen, cLen);
  const sh = sLen / n; // sin(θc/2)
  const ch = cLen / n; // cos(θc/2)
  const thc = 2 * Math.atan2(sh, ch);
  // ê: the unit part of c perpendicular to v (any perpendicular when c is along ±v: the circle is symmetric)
  const cv = c.x * v.x + c.y * v.y + c.z * v.z;
  let ex = c.x - cv * v.x;
  let ey = c.y - cv * v.y;
  let ez = c.z - cv * v.z;
  let el = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (!(el > 1e-300)) {
    const useY = Math.abs(v.x) > 0.9;
    ex = useY ? 0 : 1;
    ey = useY ? 1 : 0;
    ez = 0;
    const e = ex * v.x + ey * v.y;
    ex -= e * v.x;
    ey -= e * v.y;
    ez -= e * v.z;
    el = Math.sqrt(ex * ex + ey * ey + ez * ez);
  }
  ex /= el;
  ey /= el;
  ez /= el;
  let thcNew: number;
  let rhoNew: number;
  if (rho < 1e-6) {
    thcNew = 2 * Math.atan2(k * sh, ch);
    rhoNew = (rho * k) / (ch * ch + k * k * sh * sh);
  } else {
    // 2 atan2(k sin(t/2), cos(t/2)) is continuous and increasing for t/2 ∈ (−π/2, π]: t = thc ± rho stays in it
    const t1 = 0.5 * (thc - rho);
    const t2 = 0.5 * (thc + rho);
    const a1 = 2 * Math.atan2(k * Math.sin(t1), Math.cos(t1));
    const a2 = 2 * Math.atan2(k * Math.sin(t2), Math.cos(t2));
    thcNew = 0.5 * (a1 + a2);
    rhoNew = 0.5 * (a2 - a1);
  }
  const cs = Math.cos(thcNew);
  const sn = Math.sin(thcNew);
  outC.set(cs * v.x + sn * ex, cs * v.y + sn * ey, cs * v.z + sn * ez);
  return rhoNew;
}

/**
 * ln Y, the visible luminance relative to a 5,772 K blackbody, at ln T = REG[R_ARG], into REG[R_LNY]: the lnY of
 * physics/blackbody.ts sampleBlackbody (its twin: the same table, the same asymptotes), in register form.
 */
function lnYInto(): void {
  const lut = blackbodyLut();
  const data = lut.data;
  const lnT = REG[R_ARG];
  const c = Math.min(Math.max(lnT, lut.lnTMin), lut.lnTMax);
  const x = ((c - lut.lnTMin) / (lut.lnTMax - lut.lnTMin)) * (lut.size - 1);
  const i0 = Math.min(Math.floor(x), lut.size - 2);
  const f = x - i0;
  const a = i0 * 4 + 3;
  let lnY = data[a] + (data[a + 4] - data[a]) * f;
  if (lnT > lut.lnTMax) lnY += lnT - lut.lnTMax;
  else if (lnT < lut.lnTMin) lnY = Math.max(lnY - lut.wienK * (Math.exp(Math.min(-lnT, 60)) - Math.exp(-lut.lnTMin)), LN_Y_FLOOR);
  REG[R_LNY] = lnY;
}

/** magnitudeShift of ln T = REG[R_LNT] and ln D = REG[R_LND] into REG[R_SHIFT]. */
function shiftInto(): void {
  const lnD = REG[R_LND];
  if (lnD === 0) {
    REG[R_SHIFT] = 0;
    return;
  }
  const lnT = REG[R_LNT];
  REG[R_ARG] = lnT;
  lnYInto();
  const a = REG[R_LNY];
  REG[R_ARG] = lnT + lnD;
  lnYInto();
  REG[R_SHIFT] = -MAG_PER_LN * (REG[R_LNY] - a - 2 * lnD);
}

/**
 * B0(z)/z at z = REG[R_ARG] (Gould 1994's finite-source factor over z: 2 at z = 0, 4/π at 1, → 1/z far out) into
 * REG[R_B0]: physics/lensPoint.ts gouldB0OverZ's twin, with the complete elliptic integrals from the
 * arithmetic–geometric mean (DLMF 19.8) instead of Carlson's forms, in one loop of locals so that nothing is
 * allocated. For z < 1 B0/z = (4/π) E(z²); beyond, by the reciprocal-modulus transformation (DLMF 19.7.4),
 * z E(arcsin(1/z) | z²) = z² E(1/z²) − (z² − 1) K(1/z²). Within 10⁻¹² of gouldB0OverZ for z ≤ 100
 * (lensBodies.test.ts), where the last form's cancellation costs a few digits.
 */
function b0OverZInto(): void {
  const z = REG[R_ARG];
  if (z === 1) {
    REG[R_B0] = 4 / Math.PI;
    return;
  }
  const inner = z < 1;
  const m = inner ? z * z : 1 / (z * z);
  // √(1 − m), without cancellation next to z = 1
  let b = inner ? Math.sqrt((1 - z) * (1 + z)) : Math.sqrt((z - 1) * (z + 1)) / z;
  let a = 1;
  let sum = 0.5 * m;
  let pw = 0.5;
  for (let i = 0; i < 40; i++) {
    const c = 0.5 * (a - b);
    const an = 0.5 * (a + b);
    b = Math.sqrt(a * b);
    a = an;
    pw *= 2;
    sum += pw * c * c;
    if (!(Math.abs(c) > 1e-15 * a)) break;
  }
  const kK = Math.PI / (2 * a);
  const eE = kK * (1 - sum);
  REG[R_B0] = inner ? (4 / Math.PI) * eE : (4 / (Math.PI * z)) * (z * z * eE - (z - 1) * (z + 1) * kK);
}

/** B0(z)/z (b0OverZInto), for tests. */
export function b0OverZ(z: number): number {
  REG[R_ARG] = z;
  b0OverZInto();
  return REG[R_B0];
}

/**
 * The magnitude change of a point source whose light is a blackbody at e^lnT seen with frequency factor e^lnD:
 * the CPU twin of the relativity chunk's dopplerMagnitudeShift (the same table, render/shaders/blackbody.glsl).
 */
export function magnitudeShift(lnT: number, lnD: number): number {
  REG[R_LNT] = lnT;
  REG[R_LND] = lnD;
  shiftInto();
  return REG[R_SHIFT];
}

// ─── The Einstein ring of the sky behind ─────────────────────────────────────────────────────

const einObs: LensObserver = { frame: 'static', r: 0 };
const einSample: SweepSample = { captured: false, dphi: 0, lnG: 0 };
let einEdge = 0;

/** Δφ(α_edge + e^x) − π: positive near the edge, −π straight out. */
function einF(x: number): number {
  const g = Math.exp(x);
  escapeSweepInto(einObs, einEdge + g, g, einSample);
  return einSample.captured ? Infinity : einSample.dphi - Math.PI;
}

/**
 * The look angle of the Einstein ring of the sky behind the hole (Δφ = π), lens frame, from the closed-form
 * sweeps by the Illinois method in x = ln(α − α_edge): the same root as physics/schwarzschild.ts einsteinAngle
 * (bisection, for tests), in about 15 sweeps instead of 150.
 */
export function einsteinRadius(frame: LensFrame, r: number): number {
  einObs.frame = frame;
  einObs.r = r;
  einEdge = edgeAngle(einObs);
  const xHi0 = Math.log(spanAngle(einObs));
  // A bracket about the weak-field guess 2/√r where it holds, else the whole range.
  let a = xHi0 - 60;
  let b = xHi0;
  if (r > 30) {
    const guess = 2 / Math.sqrt(r) - einEdge;
    if (guess > 0) {
      const x0 = Math.log(guess);
      if (x0 - 0.5 > a && x0 + 0.5 < b && einF(x0 - 0.5) > 0 && einF(x0 + 0.5) < 0) {
        a = x0 - 0.5;
        b = x0 + 0.5;
      }
    }
  }
  let fa = einF(a);
  let fb = einF(b);
  if (!(fa > 0) || !(fb < 0)) return NaN;
  let side = 0;
  for (let i = 0; i < 200; i++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = einF(c);
    if (fc === 0 || Math.abs(b - a) < 1e-15 * Math.max(1, Math.abs(c))) {
      a = b = c;
      break;
    }
    if (fc < 0) {
      b = c;
      fb = fc;
      if (side === -1) fa *= 0.5;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb *= 0.5;
      side = 1;
    }
  }
  return einEdge + Math.exp(0.5 * (a + b));
}

interface EinsteinCache {
  frame: LensFrame;
  r: number;
  value: number;
}
const einCache = new Map<BodyId, EinsteinCache>();

/** The hole's Einstein ring from the camera: the active lens's table, else the cache, else solved (and cached). */
function einsteinFor(id: BodyId, frame: LensFrame, r: number): number {
  if (lens.inv && lens.hole === id && lens.obs.frame === frame && Math.abs(lens.obs.r / r - 1) < 1e-7) return lens.inv.thetaE;
  let c = einCache.get(id);
  if (c && c.frame === frame && Math.abs(c.r / r - 1) < 1e-9) return c.value;
  const value = einsteinRadius(frame, r);
  if (!c) {
    c = { frame, r, value };
    einCache.set(id, c);
  } else {
    c.frame = frame;
    c.r = r;
    c.value = value;
  }
  return value;
}

// ─── The frame's set-up: the camera, the view observers, the lens ───────────────────────────

/** The camera the screen points are projected with (derived.ts passes its own), or one kept in step with sim.camera. */
let projCam: PerspectiveCamera | null = null;
let ownCam: PerspectiveCamera | null = null;
const invQ = new Quaternion();
const vView = new Vector3();

function useCamera(camera?: PerspectiveCamera): void {
  if (camera) {
    projCam = camera;
    return;
  }
  ownCam ??= new PerspectiveCamera(50, 1, 1e-3, 1e25);
  const aspect = sim.viewport.width / Math.max(1, sim.viewport.height);
  if (ownCam.fov !== sim.camera.fovDeg || ownCam.aspect !== aspect) {
    ownCam.fov = sim.camera.fovDeg;
    ownCam.aspect = aspect;
    ownCam.updateProjectionMatrix();
  }
  projCam = ownCam;
}

/**
 * Project the camera-relative vector in vView (world axes, the view observer's frame) to CSS px, as derived.ts
 * does (the camera's inverse rotation, then the projection matrix), written out so every number stays local.
 */
function projectView(out: ScreenPoint): void {
  const width = sim.viewport.width;
  const height = sim.viewport.height;
  // v' = q v q* with q = invQ (three.js Vector3.applyQuaternion)
  const vx = vView.x;
  const vy = vView.y;
  const vz = vView.z;
  const qx = invQ.x;
  const qy = invQ.y;
  const qz = invQ.z;
  const qw = invQ.w;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  const cx = vx + qw * tx + qy * tz - qz * ty;
  const cy = vy + qw * ty + qz * tx - qx * tz;
  const cz = vz + qw * tz + qx * ty - qy * tx;
  // clip = P (cx, cy, cz, 1) (three.js Vector4.applyMatrix4; column-major elements)
  const e = projCam!.projectionMatrix.elements;
  const px = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
  const py = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
  let w = e[3] * cx + e[7] * cy + e[11] * cz + e[15];
  if (w === 0) w = 1e-9;
  const inFront = cz < 0;
  const x = ((px / w + 1) / 2) * width;
  const y = ((1 - py / w) / 2) * height;
  out.inFront = inFront;
  out.x = x;
  out.y = y;
  out.onScreen = inFront && x > -80 && x < width + 80 && y > -80 && y < height + 80;
}

/** projectView of (x, y, z) (per frame and per label, not per image). */
function project(x: number, y: number, z: number, out: ScreenPoint): void {
  vView.x = x;
  vView.y = y;
  vView.z = z;
  projectView(out);
}

/**
 * A boost: a view observer's relative to the frame the glints are drawn in, or the frame boost from the Sun's
 * frame to the hole's. Its rapidity, unit direction, and the ratios the per-image helpers need (set per frame).
 */
interface Observer {
  phi: number;
  dir: Vector3;
  /** e^−φ and e^φ: tan(θ′/2) = k tan(θ/2) into the moving frame and back out of it. */
  kTo: number;
  kFrom: number;
  /** e^−2φ and e^2φ, for ln D. */
  e2m: number;
  e2p: number;
}
const makeObserver = (): Observer => ({ phi: 0, dir: new Vector3(0, 0, -1), kTo: 1, kFrom: 1, e2m: 1, e2p: 1 });
const observers: [Observer, Observer] = [makeObserver(), makeObserver()];
/** The frame boost, S → hole frame (rapidity 0 during a fall, and at Sgr A* and M87*). */
const frameObs: Observer = makeObserver();

/** An observer's ratios from its rapidity (per frame). */
function setRatios(o: Observer): void {
  const phi = o.phi > 0 ? o.phi : 0;
  o.phi = phi;
  o.kTo = Math.exp(-phi);
  o.kFrom = Math.exp(phi);
  o.e2m = o.kTo * o.kTo;
  o.e2p = o.kFrom * o.kFrom;
}

/**
 * Light along unit direction d seen by boost o, exactly (the rapidity forms of physics/relativity.ts
 * aberrateToShipRapidity and lnDopplerFromRestDir, their twins, with no numbers passed): `back` false, d in the
 * frame before the boost (at rest) and out in the moving frame, tan(θ′/2) = e^−φ tan(θ/2) from o.dir; `back`
 * true, the inverse. ln D of the light, from its direction in the frame at rest (half-angles h: ln(e^φ cos²h +
 * e^−φ sin²h)), into REG[R_LN]. Half-angles from chords, so exact at 0 and π.
 */
function boost(d: Vector3, o: Observer, back: boolean, out: Vector3): void {
  const v = o.dir;
  const mx = d.x - v.x;
  const my = d.y - v.y;
  const mz = d.z - v.z;
  const px = d.x + v.x;
  const py = d.y + v.y;
  const pz = d.z + v.z;
  let sh = Math.sqrt(mx * mx + my * my + mz * mz);
  let ch = Math.sqrt(px * px + py * py + pz * pz);
  const hn = Math.sqrt(sh * sh + ch * ch);
  sh /= hn;
  ch /= hn;
  const k = back ? o.kFrom : o.kTo;
  const ksh = k * sh;
  const den = ch * ch + ksh * ksh;
  const cT = (ch * ch - ksh * ksh) / den;
  const sT = (2 * ksh * ch) / den;
  const dv = d.x * v.x + d.y * v.y + d.z * v.z;
  let ex = d.x - dv * v.x;
  let ey = d.y - dv * v.y;
  let ez = d.z - dv * v.z;
  const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (el > 1e-300) {
    ex /= el;
    ey /= el;
    ez /= el;
    out.x = cT * v.x + sT * ex;
    out.y = cT * v.y + sT * ey;
    out.z = cT * v.z + sT * ez;
  } else {
    out.x = d.x;
    out.y = d.y;
    out.z = d.z;
  }
  // the half-angles of the direction in the frame at rest: d's, or (going back) out's
  const hs2 = back ? (ksh * ksh) / den : sh * sh;
  const hc2 = back ? (ch * ch) / den : ch * ch;
  if (!(o.phi > 0)) REG[R_LN] = 0;
  else if (hc2 >= hs2 * o.e2m) REG[R_LN] = o.phi + Math.log(hc2 + hs2 * o.e2m);
  else REG[R_LN] = hc2 > 0 ? -o.phi + Math.log(hs2 + hc2 * o.e2p) : -o.phi + Math.log(hs2);
}
let split = false;
/**
 * The frame's numbers. Fields of one object rather than module-level variables: a number stored into a module's
 * variable is boxed (a 16-byte allocation a store, and several are stored every frame); an object's number
 * fields are updated in place. (Each starts as a fraction or an infinity, so its field holds doubles from the
 * start.)
 */
class FrameNumbers {
  /** The split view's divide, CSS px (−∞ when the view is whole). */
  splitPx = -Infinity;
  /** The S → hole-frame boost's rapidity (0 during a fall, and at Sgr A* and M87*). */
  phiF = 0.5;
  /** The camera's distance from the hole, units of M. */
  ro = Infinity;
  /** The hole's M, km. */
  mKm = 0.5;
  /** cos of the point zone's and the diffuse zone's angles about the axis (−2: the whole sky). */
  cosPt = -2.5;
  cosDiff = -2.5;
  /** How far motion and the exposure can brighten an image, magnitudes (for what is kept). */
  keepBoost = 0.5;
  /** The largest |ln D| the lens and the frame boost can give a far body's light in tier 1. */
  lnDBound = Infinity;
  /** Device px per radian (tier 1's pass counts, as the GPU's). */
  pxDev = 1000.5;
}
const fr = new FrameNumbers();
/** The half the whole view shows when it is not split: 1 (the ship, or the faller) while the relativistic path runs. */
let wholeHalf: 0 | 1 = 0;
let inFall = false;
const vF = new Vector3(0, 0, -1);
/** Camera → hole, lens frame: unit, and in units of M; r_o. */
const axis = new Vector3(0, 0, -1);
const holeM = new Vector3();

/** The view observers of both halves and which one the whole view shows (derived.ts:118-131's rule). */
function setupObservers(): void {
  split = relView.split;
  fr.splitPx = split ? relView.splitX * sim.viewport.width : -Infinity;
  const fv = gravity.fallView;
  inFall = fv !== null;
  if (fv) {
    // The raindrop falls along the axis (towards the hole); the faller as the fall says. Both relative to the
    // lens frame: the static observer above 3M, the raindrop below (where rainPhi is 0).
    observers[0].phi = fv.rainPhi;
    observers[0].dir.copy(axis);
    observers[1].phi = fv.phi;
    observers[1].dir.copy(fv.dir);
    wholeHalf = relView.active || relView.mode !== 'off' ? 1 : 0;
  } else {
    observers[0].phi = 0;
    observers[1].phi = relView.active ? relView.phi : 0;
    observers[1].dir.copy(relView.velDir);
    wholeHalf = relView.active ? 1 : 0;
  }
  setRatios(observers[0]);
  setRatios(observers[1]);
}

/** The axis and the frame boost from the gravity state (the lens's own when it is drawn). */
function setupHoleFrame(): void {
  const cr = gravity.camRelHoleKm;
  const r = Math.sqrt(cr.x * cr.x + cr.y * cr.y + cr.z * cr.z);
  fr.mKm = gravity.mKm;
  if (lens.active && lens.hole === gravity.hole && lens.mKm > 0) {
    // What the GPU was given (uLensHole, uLensAxis), bit for bit.
    holeM.copy(lens.holeM);
    fr.mKm = lens.mKm;
  } else if (r > 0) holeM.set(-cr.x / fr.mKm, -cr.y / fr.mKm, -cr.z / fr.mKm);
  fr.ro = holeM.length();
  if (fr.ro > 0) axis.copy(holeM).divideScalar(fr.ro);
  fr.phiF = gravity.fallView ? 0 : gravity.framePhi;
  vF.copy(gravity.frameVelDir);
  frameObs.phi = fr.phiF;
  frameObs.dir.copy(vF);
  setRatios(frameObs);
}

const dirTmp = new Vector3();

/** A direction in the Sun's frame to the hole's: the direction into out, and ln D_f of light from it (a source at rest in S) into REG[R_LN]. */
function frameAberrate(d: Vector3, out: Vector3): void {
  if (!(frameObs.phi > 0)) {
    copy3(d, out);
    REG[R_LN] = 0;
    return;
  }
  boost(d, frameObs, false, out);
}

/** A direction in the hole's frame back to the Sun's: the direction into out, and ln D_f of light arriving from it into REG[R_LN]. */
function frameUnaberrate(d: Vector3, out: Vector3): void {
  if (!(frameObs.phi > 0)) {
    copy3(d, out);
    REG[R_LN] = 0;
    return;
  }
  boost(d, frameObs, true, out);
}

/** A glint-frame direction to the view observer of `half`: the direction into out, and ln D_view into REG[R_LN]. */
function toView(d: Vector3, half: 0 | 1, out: Vector3): void {
  const o = observers[half];
  if (!(o.phi > 0)) {
    copy3(d, out);
    REG[R_LN] = 0;
    return;
  }
  boost(d, o, false, out);
}

/** The half the last place() used. */
let placedHalf: 0 | 1 = 0;
/** The view-frame direction the last place() projected. */
const placedDir = new Vector3();

/** vView = placedDir × REG[R_DIST], then projected into out. */
function projectPlaced(out: ScreenPoint): void {
  const dist = REG[R_DIST];
  vView.x = placedDir.x * dist;
  vView.y = placedDir.y * dist;
  vView.z = placedDir.z * dist;
  projectView(out);
}

/**
 * Where a glint-frame direction at distance REG[R_DIST] shows (CSS px), and ln D_view there (into REG[R_LN]): in
 * the classical half at the classical observer's direction; where that lands in the relativistic half, the
 * relativistic observer's; off screen if that lands back in the classical half (derived.ts's rule for bodies).
 */
function place(d: Vector3, out: ScreenPoint): void {
  if (!split) {
    toView(d, wholeHalf, placedDir);
    projectPlaced(out);
    placedHalf = wholeHalf;
    return;
  }
  toView(d, 0, placedDir);
  projectPlaced(out);
  if (out.x < fr.splitPx) {
    placedHalf = 0;
    return;
  }
  toView(d, 1, placedDir);
  projectPlaced(out);
  if (out.x < fr.splitPx) out.onScreen = false;
  placedHalf = 1;
}

/**
 * A circle about a lens-frame centre to the view observer of `half` (the Sun's frame then the ship's; in a fall
 * the raindrop's or the faller's): centre into outC, radius returned.
 */
function circleToView(c: Vector3, rho: number, half: 0 | 1, outC: Vector3): number {
  const o = observers[half];
  let r = rho;
  outC.copy(c);
  // Outside a fall: the hole's frame back to the Sun's first (a fall's frame boost is 0).
  if (!inFall && fr.phiF > 0) r = boostCircle(c, r, vF, Math.exp(fr.phiF), outC);
  if (o.phi > 0) {
    dirTmp.copy(outC);
    r = boostCircle(dirTmp, r, o.dir, Math.exp(-o.phi), outC);
  }
  return r;
}

// ─── The active hole's shadow ────────────────────────────────────────────────────────────────

/**
 * The shadow (or the raindrop's dark region) of the hole gravity follows, as a circle in each half's view
 * observer's frame, this frame; for labels and picking (derived.ts, scene/picking.ts). Filled whether or not the
 * lens is drawn: the shadow is there (lensing off draws light straight and hides it; it can still be picked).
 */
export const holeShadow = {
  hole: null as BodyId | null,
  /** The edge angle about the hole's direction in the lens frame, rad. */
  edge: 0,
  centre: [new Vector3(0, 0, -1), new Vector3(0, 0, -1)] as [Vector3, Vector3],
  radius: [0, 0] as [number, number],
};

const edgeObs: LensObserver = { frame: 'static', r: 0 };

function updateHoleShadow(): void {
  holeShadow.hole = gravity.hole;
  if (!gravity.hole) return;
  edgeObs.frame = gravity.frame;
  edgeObs.r = gravity.rM;
  const edge = edgeAngle(edgeObs);
  holeShadow.edge = edge;
  holeShadow.radius[0] = circleToView(axis, edge, 0, holeShadow.centre[0]);
  holeShadow.radius[1] = circleToView(axis, edge, 1, holeShadow.centre[1]);
}

// ─── Pools: every lensed body keeps its BodyLens (no allocation per frame) ───────────────────

/** One pooled image (a class: see "Allocation" above). */
class ImageState implements BodyImage {
  order: ImageOrder = 0;
  screen = new ScreenPos();
  magnitude = 99;
  lnMu = 0;
  lnD = 0;
  lnDView = 0;
  lnDx = 0;
  magLensed = 99;
  dir = new Vector3();
  dirLens = new Vector3();
  share = 1;
}

/** One pooled ring (a class: see "Allocation" above). */
class RingState implements LensRing {
  centre = new Vector3();
  radius = 0;
  towards = new Vector3();
  arcHalf = 0;
  magnitude = 99;
  lnT = 0;
  lnD = 0;
  share = 0;
  half: 0 | 1 = 1;
}

/**
 * What a lensed body keeps: its images and ring, and the constants of its record (read again only when the record
 * is replaced: a record's numbers are read through property lookups that see every kind of record, and V8 boxes
 * each number such a lookup returns).
 */
class Kept {
  lens: BodyLens;
  ring = new RingState();
  rec: BodyRecord | null = null;
  /** ln of the temperature its light is a blackbody at (its own, or the Sun's for reflected light). */
  lnT = 0;
  /** Its radius, km, for the finite-source cap. */
  radiusKm = 0;
  /** A star: its secondary images fade at the eye's limit. */
  luminous = false;

  constructor() {
    const images: BodyImage[] = [];
    for (let i = 0; i < MAX_BODY_IMAGES; i++) images.push(new ImageState());
    this.lens = { count: 0, images, ring: null };
  }
}
const pool = new Map<BodyId, Kept>();

/** Each registry entry's Kept by its place in the list (a map lookup per body per frame costs more than all its arithmetic). */
const keptAt: (Kept | undefined)[] = [];

/** The Kept of entry i of the registry's list, found through its place (checked by its record) or its id. */
function keptOf(i: number, id: BodyId, rec: BodyRecord): Kept {
  let k = keptAt[i];
  if (k !== undefined && k.rec === rec) return k;
  k = pool.get(id);
  if (!k) {
    k = new Kept();
    pool.set(id, k);
  }
  if (k.rec !== rec) {
    k.rec = rec;
    const lum = rec.physical.luminous;
    k.luminous = !!lum;
    k.lnT = Math.log(lum ? lum.teffK : SUN_TEFF_K);
    k.radiusKm = rec.physical.radiusKm;
  }
  keptAt[i] = k;
  return k;
}

/** The bodies whose ring of an alignment is drawn this frame (scene/LensRings.tsx), their count first. */
export const lensRings = { count: 0, owners: new Array<BodyState | null>(MAX_RINGS).fill(null) };

// ─── The lens on bodies ──────────────────────────────────────────────────────────────────────

/** Whether bodies are lensed this frame: the lens is drawn (a hole, lensing on, programs ready) with its tables. */
export function lensOnBodies(): boolean {
  return lens.active && lens.inv !== null && lens.hole !== null && lens.hole === gravity.hole && !!sim.bodies[lens.hole]?.present;
}

let anyLensed = false;
/** The frame's lens constants (setupFrame). */
let frameReady = false;
let maxOrder: ImageOrder = 1;
let tier2On = false;
let far = false;
const holePos = new Vector3();
const holeVel = new Vector3();

function setupFrame(): void {
  const h = sim.bodies[lens.hole!];
  holePos.copy(h.pos);
  holeVel.copy(h.vel);
  const pz = lens.pointZoneSrc;
  const dz = lens.diffuseZone;
  fr.cosPt = pz > 0 && pz < Math.PI ? Math.cos(pz) : -2;
  fr.cosDiff = dz > 0 && dz < Math.PI ? Math.cos(dz) : -2;
  maxOrder = lens.ringBandPx >= 1 ? 2 : 1;
  tier2On = lens.obs.frame === 'static' && fr.ro > 3;
  fr.pxDev = lensUniforms.uLensPxPerRad.value > 0 ? lensUniforms.uLensPxPerRad.value : 1000;
  // In motion the view observer's boost can brighten an image beyond the limit at rest, and the exposure
  // (stopped down near a hole, or in flight) moves what shows: keep what either could bring into view.
  const phi = Math.max(observers[0].phi, observers[1].phi);
  fr.keepBoost = (phi > 0 ? MAG_PER_LN * 4 * phi : 0) + MAG_PER_LN * Math.max(0, relView.lnExposure);
  far = sim.solarSystemPx < 1;
  const inv = lens.inv!;
  if (inv !== boundTable || inv.version !== boundVersion) updateOrderBounds(inv);
  // The largest ln D the lens and the frame boost can give a far body's light in tier 1 (for the cull below).
  fr.lnDBound = lens.obs.frame === 'static' ? Math.abs(gravity.lnGStatic) + 2 * frameObs.phi : Infinity;
  frameReady = true;
}

/**
 * Bounds on the magnification of the images of orders 1 and 2 of a far source, per table: for a source at
 * infinity |μ| = sin α e^m/|sin D| (m = −ln|dΔφ/dα|, the inverse table's own), so ln|μ_k| ≤ ln max(sin α e^m)
 * − ln sin γ, the maximum over the nodes of the table's row for that order, doubled for the spline between them.
 * A body far from the hole (beyond 1,000 r_o, where its finite distance changes μ by under 0.1 %) whose image
 * could not come within the keep limit even so is not solved for that order: most bodies are far from the axis,
 * where the second image is 10 log10(ψ/θ_E) magnitudes fainter than the body.
 */
const orderLnMuMax = new Float64Array(3);
let boundTable: InverseTable | null = null;
let boundVersion = -1;

function updateOrderBounds(inv: InverseTable): void {
  const edge = inv.fwd.edge;
  let row0 = 0;
  for (let i = 0; i < inv.y.length; i++) {
    const v = Math.sin(edge + Math.exp(inv.y[i])) * Math.exp(inv.m[i]);
    if (v > row0) row0 = v;
  }
  let row1 = 0;
  for (let i = 0; i < inv.rel.y.length; i++) {
    const v = Math.sin(edge + Math.exp(inv.rel.y[i])) * Math.exp(inv.rel.m[i]);
    if (v > row1) row1 = v;
  }
  orderLnMuMax[0] = Infinity;
  orderLnMuMax[1] = row0 > 0 ? Math.log(2 * row0) : Infinity;
  orderLnMuMax[2] = row1 > 0 ? Math.log(2 * row1) : Infinity;
  boundTable = inv;
  boundVersion = inv.version;
}

/** The image being solved (a class, for its numbers' sake: see "Allocation" above). */
class PointImageState implements PointImage {
  ok = false;
  alpha = 0;
  dir = new Vector3();
  lnMu = 0;
  lnG = 0;
  side: 1 | -1 = 1;
  branch: PointImage['branch'] = 'identity';
  emitDir = new Vector3();
  causticOffset = Infinity;
}
const pi = new PointImageState();
const dS = new Vector3();
const dH = new Vector3();
const srcM = new Vector3();
const srcNudge = new Vector3();
const dLens = new Vector3();
const dGlint = new Vector3();
/** Per image of the body in hand: its caustic's n, z and look angle, and the view direction it was placed at. */
const imgN = new Int32Array(MAX_BODY_IMAGES);
const imgZ = new Float64Array(MAX_BODY_IMAGES);
const imgAlpha = new Float64Array(MAX_BODY_IMAGES);
const imgView = [new Vector3(), new Vector3(), new Vector3()];
const imgHalf = new Int32Array(MAX_BODY_IMAGES);

/**
 * Tier 1 or 2 for one order into pi; order 0 always returns an image (straight if need be). Where the exact
 * solver finds no image (no bracket: a source within about 10⁻¹² rad of a caustic) tier 1 gives it.
 */
function solveImage(exact: boolean, src: Vector3, order: ImageOrder): void {
  if (exact) {
    pointImageExact(fr.ro, holeM, src, order, pi);
    if (pi.ok && pi.branch !== 'unlensed') return;
  }
  pointImageTier1(lens.inv!, holeM, src, order, pi, fr.pxDev);
}

/** Lens one registered entry (or clear its lens), as the module's header describes. */
function lensEntry(e: Entry, i: number, focus: BodyId | undefined, selected: BodyId | null | undefined): void {
  const b = e.state;
  const rec = e.record;
  if (e.isNode || !b.present || rec.kind === 'black-hole') {
    b.lens = null;
    return;
  }
  const id = e.id;
  const chosen = id === focus || id === selected;
  // The Solar System merged into the Sun's point from afar: its members are hidden (derived.ts), not lensed.
  if (far && !chosen && id !== 'sun' && e.root.id === 'sun') {
    b.lens = null;
    return;
  }
  const layer = rec.visual?.renderer === 'layer';
  if (!layer && !chosen && !(b.magnitude < LENS_FAINT_MAG)) {
    b.lens = null;
    return;
  }
  // hole → body (heliocentric float64 difference), then camera → body = hole → body + camera → hole (the
  // lens's own holeM: exactly what the GPU was given)
  const hx = b.apparentPos.x - holePos.x;
  const hy = b.apparentPos.y - holePos.y;
  const hz = b.apparentPos.z - holePos.z;
  const rsKm = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const rsM = rsKm / fr.mKm;
  // A layer centred on the hole, or anything within its photon sphere: no image to find.
  if (!(rsM > 3)) {
    b.lens = null;
    return;
  }
  const rx = hx + holeM.x * fr.mKm;
  const ry = hy + holeM.y * fr.mKm;
  const rz = hz + holeM.z * fr.mKm;
  const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (!(d > 0)) {
    b.lens = null;
    return;
  }
  const cosPsi = (rx * axis.x + ry * axis.y + rz * axis.z) / d;
  // Point-like bodies are lensed in the point zone (images move ≥ 0.02 px); labels of extended ones in the
  // diffuse zone (≥ 0.5 px); anything near the hole wherever it is.
  if (!(rsM < LENS_NEAR_M) && !(cosPsi > (layer ? fr.cosDiff : fr.cosPt))) {
    b.lens = null;
    return;
  }

  dS.x = rx / d;
  dS.y = ry / d;
  dS.z = rz / d;
  frameAberrate(dS, dH);
  const lnDfSrc = REG[R_LN];
  srcM.x = (dH.x * d) / fr.mKm;
  srcM.y = (dH.y * d) / fr.mKm;
  srcM.z = (dH.z * d) / fr.mKm;
  const exact = tier2On && !layer && rsM < TIER2_WITHIN_RO * fr.ro;
  // γ: the angle at the hole between the camera and the body (for the caustic each order is near), from chords
  const ux0 = hx / rsKm + axis.x;
  const uy0 = hy / rsKm + axis.y;
  const uz0 = hz / rsKm + axis.z;
  const vx0 = hx / rsKm - axis.x;
  const vy0 = hy / rsKm - axis.y;
  const vz0 = hz / rsKm - axis.z;
  const gamma = 2 * Math.atan2(Math.sqrt(ux0 * ux0 + uy0 * uy0 + uz0 * uz0), Math.sqrt(vx0 * vx0 + vy0 * vy0 + vz0 * vz0));
  const kept = keptOf(i, id, rec);
  const bl = kept.lens;
  const lnT = kept.lnT;
  const radiusM = kept.radiusKm / fr.mKm;
  const flat = b.magnitude;
  const keepLimit = fr.keepBoost + (kept.luminous ? STAR_KEEP_MAG : GLINT_KEEP_MAG);
  // The source's own motion relative to the hole's frame (tier 2: the S-stars' orbits, a companion's).
  const ux = (b.vel.x - holeVel.x) / C_KM_S;
  const uy = (b.vel.y - holeVel.y) / C_KM_S;
  const uz = (b.vel.z - holeVel.z) / C_KM_S;
  const lnGamma = exact ? -0.5 * Math.log1p(-(ux * ux + uy * uy + uz * uz)) : 0;
  const top = layer ? 0 : maxOrder;
  // Orders 1 and 2 of a far body: the brightest they could be (updateOrderBounds), before any solving.
  const cullFar = top > 0 && !exact && rsM > TIER2_WITHIN_RO * fr.ro && fr.lnDBound < 1;
  const lnSinGamma = cullFar ? Math.log(Math.sin(gamma)) : 0;
  const lnDMax = Math.abs(lnDfSrc) + fr.lnDBound;

  let count = 0;
  for (let k = 0; k <= top; k++) {
    const order = k as ImageOrder;
    if (order > 0 && cullFar && flat - MAG_PER_LN * (orderLnMuMax[order] - lnSinGamma + 2 * lnDMax) - SHIFT_BOUND_MAG * lnDMax > keepLimit) continue;
    solveImage(exact, srcM, order);
    if (!pi.ok) continue;
    const straight = pi.branch === 'unlensed' || pi.branch === 'identity';
    const D = (order & 1) === 0 ? gamma + TWO_PI * (order >> 1) : TWO_PI - gamma + TWO_PI * (order >> 1);
    const n = Math.round(D / Math.PI);
    // The finite-source cap at a caustic (n ≥ 1; D near 0 is the straight view away from the hole, no caustic):
    // ln(μB0) = ln(z|μ|) + ln(B0(z)/z), z = |D − nπ| r_s/R★ (physics/lensPoint.ts causticZ), with z|μ| from μ's
    // own factors, finite at exact alignment.
    let lnMuB0 = straight ? 0 : pi.lnMu;
    let z = Infinity;
    if (!straight && n >= 1 && radiusM > 0) {
      z = (pi.causticOffset * rsM) / radiusM;
      if (z < B0_Z_MAX) {
        let lzm = 0;
        if (pi.causticOffset >= OFFSET_RESOLVED_RAD) lzm = pi.lnMu + Math.log(z);
        else {
          // Nearer the caustic than the float64 geometry resolves (exact alignment included, where ln μ is
          // infinite): z|μ| of the same image with the source OFFSET_RESOLVED_RAD off the line, where it has its
          // limit to O(offset/θ_E) with θ_E seen from the hole (10⁻⁴ or better for any body here). Its direction
          // stays the one found.
          const saveAlpha = pi.alpha;
          const sx = pi.dir.x;
          const sy = pi.dir.y;
          const sz = pi.dir.z;
          nudgeSource(hx / rsKm, hy / rsKm, hz / rsKm, OFFSET_RESOLVED_RAD * rsM);
          solveImage(exact, srcNudge, order);
          lzm = pi.ok && pi.branch === 'outgoing' ? pi.lnMu + Math.log((pi.causticOffset * rsM) / radiusM) : Infinity;
          pi.ok = true;
          pi.alpha = saveAlpha;
          pi.dir.x = sx;
          pi.dir.y = sy;
          pi.dir.z = sz;
        }
        REG[R_ARG] = z;
        b0OverZInto();
        // (lzm − lzm is 0 exactly when lzm is finite)
        if (lzm - lzm === 0) lnMuB0 = lzm + Math.log(REG[R_B0]);
        else if (order > 0) continue;
        else lnMuB0 = 0; // (not met: the nudged image has a finite ln(z|μ|); the primary is kept finite regardless)
      }
    }
    // The source's frequency factor into the hole's frame: its own motion along the ray it sent (tier 2), or
    // the frame boost of a source at rest in the Sun's frame (tier 1).
    let lnDsrc = lnDfSrc;
    let lnOwn = 0;
    if (exact && !straight) {
      const bk = ux * pi.emitDir.x + uy * pi.emitDir.y + uz * pi.emitDir.z;
      lnOwn = -(lnGamma + Math.log1p(-bk));
      lnDsrc = lnOwn;
    }
    const lnG = pi.lnG;
    dLens.x = pi.dir.x;
    dLens.y = pi.dir.y;
    dLens.z = pi.dir.z;
    frameUnaberrate(dLens, dGlint);
    const lnDx = lnDsrc + lnG - REG[R_LN];
    const magLensed = flat - MAG_PER_LN * (lnMuB0 + 2 * (lnG + lnOwn));
    // Images beyond order 0 far below what could show are dropped before their shift and place are worked out.
    if (order > 0 && !(magLensed - SHIFT_BOUND_MAG * Math.abs(lnDx) < keepLimit)) continue;
    REG[R_LNT] = lnT;
    REG[R_LND] = lnDx;
    shiftInto();
    const magnitude = magLensed + REG[R_SHIFT];
    if (order > 0 && !(magnitude < keepLimit)) continue;
    const img = bl.images[count];
    REG[R_DIST] = d;
    place(dGlint, img.screen);
    const lnDView = REG[R_LN];
    img.order = order;
    img.lnMu = pi.lnMu;
    img.lnDView = lnDView;
    img.lnDx = lnDx;
    img.lnD = lnDx + lnDView;
    img.magLensed = magLensed;
    img.magnitude = magnitude;
    copy3(dGlint, img.dir);
    copy3(dLens, img.dirLens);
    img.share = 1;
    imgN[count] = n;
    imgZ[count] = z;
    imgAlpha[count] = pi.alpha;
    copy3(placedDir, imgView[count]);
    imgHalf[count] = placedHalf;
    count++;
  }
  bl.count = count;
  bl.ring = null;
  if (count === 0) {
    b.lens = null;
    return;
  }
  if (count > 1) ringOf(b, kept);
  b.lens = bl;
  const p = bl.images[0];
  b.screen.x = p.screen.x;
  b.screen.y = p.screen.y;
  b.screen.onScreen = p.screen.onScreen;
  b.screen.inFront = p.screen.inFront;
  b.magnitude = p.magnitude;
  b.dopplerFactor = Math.exp(p.lnD);
}

/** srcNudge = srcM moved by `by` (units of M) perpendicular to the hole → source direction ĥ. */
function nudgeSource(hx: number, hy: number, hz: number, by: number): void {
  // a perpendicular: ĥ × axis, or ĥ × x̂ when they are parallel
  let px = hy * axis.z - hz * axis.y;
  let py = hz * axis.x - hx * axis.z;
  let pz = hx * axis.y - hy * axis.x;
  let pl = Math.sqrt(px * px + py * py + pz * pz);
  if (!(pl > 1e-12)) {
    px = 0;
    py = hz;
    pz = -hy;
    pl = Math.sqrt(py * py + pz * pz) || 1;
  }
  srcNudge.set(srcM.x + (px / pl) * by, srcM.y + (py / pl) * by, srcM.z + (pz / pl) * by);
}

const smooth01 = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The ring of a near-perfect alignment: the two images at one caustic (orders 0 and 1 behind
 * the hole, n = 1; orders 1 and 2 at the forward caustic, n = 2) with z < RING_START_Z fade into it.
 */
function ringOf(b: BodyState, kept: Kept): void {
  const bl = kept.lens;
  const images = bl.images;
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i + 1 < bl.count; i++) {
    const o = images[i].order;
    const n = imgN[i];
    if (images[i + 1].order === o + 1 && imgN[i + 1] === n && ((o === 0 && n === 1) || (o === 1 && n === 2)) && imgZ[i] < RING_START_Z) {
      i0 = i;
      i1 = i + 1;
      break;
    }
  }
  // An order-2 image at the 3π caustic has its partner (order 3) undrawn: near alignment its sliver of light
  // (e^−2π of the secondary's) fades out rather than stand alone as a point.
  for (let i = 0; i < bl.count; i++) if (images[i].order === 2 && imgN[i] === 3 && imgZ[i] < RING_START_Z) images[i].share = 1 - smooth01(RING_START_Z, RING_FULL_Z, imgZ[i]);
  if (i0 < 0) return;
  const z = imgZ[i0];
  const w = smooth01(RING_START_Z, RING_FULL_Z, z);
  images[i0].share = 1 - w;
  images[i1].share = 1 - w;
  if (!(w > 0) || lensRings.count >= MAX_RINGS) return;
  const ring = kept.ring;
  const half: 0 | 1 = imgHalf[i0] === 1 ? 1 : 0;
  const alphaRing = 0.5 * (imgAlpha[i0] + imgAlpha[i1]);
  ring.radius = circleToView(axis, alphaRing, half, ring.centre);
  // towards: the primary's view direction, made perpendicular to the ring's centre
  const t = imgView[i0];
  const c = ring.centre;
  const tc = t.x * c.x + t.y * c.y + t.z * c.z;
  ring.towards.set(t.x - tc * c.x, t.y - tc * c.y, t.z - tc * c.z);
  const tl = ring.towards.length();
  if (tl > 0) ring.towards.divideScalar(tl);
  else ring.towards.set(c.y, -c.x, 0).normalize();
  ring.arcHalf = Math.asin(Math.min(1, 1 / z));
  // All the pair's light as seen (the view observer's own shift included: the ring is drawn as it is seen)
  const lnT = kept.lnT;
  REG[R_LNT] = lnT;
  REG[R_LND] = images[i0].lnD;
  shiftInto();
  const m0 = images[i0].magLensed + REG[R_SHIFT];
  REG[R_LND] = images[i1].lnD;
  shiftInto();
  const m1 = images[i1].magLensed + REG[R_SHIFT];
  ring.magnitude = Math.min(m0, m1) - 2.5 * Math.log10(1 + Math.pow(10, -0.4 * Math.abs(m0 - m1)));
  ring.lnT = lnT;
  ring.lnD = images[i0].lnD;
  ring.share = w;
  ring.half = half;
  bl.ring = ring;
  lensRings.owners[lensRings.count++] = b;
}

/**
 * Images, magnitudes and screen points of the bodies seen through the lens, called by derived.ts
 * updateDerived after every body's straight screen point and flat magnitude: a lensed body's screen point becomes
 * its primary image's, its magnitude and Doppler factor the primary's; the active hole's shadow circles are
 * updated whether or not the lens is drawn. `camera` is the one derived.ts projects with; focus and selected are
 * lensed however faint.
 */
export function lensBodies(camera?: PerspectiveCamera, focus?: BodyId, selected?: BodyId | null): void {
  useCamera(camera);
  invQ.copy(sim.camera.quat).invert();
  lensRings.count = 0;
  if (gravity.hole) {
    setupHoleFrame();
    setupObservers();
    updateHoleShadow();
  } else holeShadow.hole = null;
  if (!lensOnBodies()) {
    frameReady = false;
    if (anyLensed) {
      const list = bodyEntries();
      for (let i = 0; i < list.length; i++) list[i].state.lens = null;
      anyLensed = false;
    }
    return;
  }
  setupFrame();
  anyLensed = true;
  const list = bodyEntries();
  for (let i = 0; i < list.length; i++) lensEntry(list[i], i, focus, selected);
}

// ─── Black holes on screen ───────────────────────────────────────────────────────────────────

const flowPoints = new Map<BodyId, FlowPoint>();

/** The flow's point of a hole this frame (placeBlackHoles fills it): its magnitude, colour, spectral index and share. */
export function holeFlowPoint(id: BodyId): FlowPoint | undefined {
  return flowPoints.get(id);
}

const centreScreen = new ScreenPos();
/** The critical impact parameter, units of M: 3√3. */
const SHADOW_BC = 3 * Math.sqrt(3);

/**
 * Every black hole's entry, after derived.ts's radii: its magnitude is the flow's point
 * (99 without one); the active hole's distances come from gravity.camRelHoleKm, its screen point is the shadow's
 * centre in the half it lands in and radiusPx the shadow's radius (the app's convention, for labels and the glint:
 * picking uses the exact circle); another hole keeps its straight screen point with its shadow's radius as seen
 * from here.
 */
export function placeBlackHoles(pxPerRad: number): void {
  const holes = blackHoles();
  for (let i = 0; i < holes.length; i++) {
    const id = holes[i].id;
    const b = sim.bodies[id];
    if (!b || !b.present) continue;
    let fp = flowPoints.get(id);
    if (!fp) {
      fp = { magnitude: 99, spectralIndex: -0.5, rgb: [1, 1, 1], pointShare: 1 };
      flowPoints.set(id, fp);
    }
    flowPoint(id, fp);
    b.magnitude = fp.magnitude;
    const rs = holes[i].rs;
    if (id === holeShadow.hole) {
      b.distTrue = gravity.rKm;
      b.distCamera = gravity.rKm;
      const r = gravity.rKm;
      let half: 0 | 1 = split ? 0 : wholeHalf;
      let c = holeShadow.centre[half];
      project(c.x * r, c.y * r, c.z * r, centreScreen);
      if (split && centreScreen.x >= fr.splitPx) {
        half = 1;
        c = holeShadow.centre[1];
        project(c.x * r, c.y * r, c.z * r, centreScreen);
        if (centreScreen.x < fr.splitPx) centreScreen.onScreen = false;
      }
      b.screen.x = centreScreen.x;
      b.screen.y = centreScreen.y;
      b.screen.onScreen = centreScreen.onScreen;
      b.screen.inFront = centreScreen.inFront;
      b.radiusPx = holeShadow.radius[half] * pxPerRad;
    } else {
      // The static shadow from here, physics/schwarzschild.ts shadowAngle's closed form written out (a call per
      // hole per frame would box its result): atan2(b_c √(r − 2), (r − 3) √(r + 6)), b_c = 3√3.
      const rM = (2 * b.distCamera) / rs;
      const rho = rM > 2 * (1 + 1e-6) ? Math.atan2(SHADOW_BC * Math.sqrt(rM - 2), (rM - 3) * Math.sqrt(rM + 6)) : Math.PI;
      b.radiusPx = (rho * pxPerRad) / b.dopplerFactor;
    }
  }
}

const pointer = new Vector3();

/**
 * The active hole, when the pointer (CSS px) is inside its shadow as drawn in the half under it: the angle
 * between the pointer's direction and the circle's centre against its radius, exact at any size (inside the
 * horizon too).
 */
export function pointerInShadow(x: number, y: number): BodyId | null {
  const id = holeShadow.hole;
  if (!id || !projCam) return null;
  const { width, height } = sim.viewport;
  const half: 0 | 1 = split ? (x < fr.splitPx ? 0 : 1) : wholeHalf;
  const rho = holeShadow.radius[half];
  if (!(rho > 0)) return null;
  // The pointer's ray in the camera's frame, inverting project(): at z = −1, x_ndc = P₀x − P₈ and y_ndc = P₅y − P₉
  // (a perspective projection), then the camera's rotation.
  const P = projCam.projectionMatrix.elements;
  pointer.set(((2 * x) / width - 1 + P[8]) / P[0], (1 - (2 * y) / height + P[9]) / P[5], -1).normalize().applyQuaternion(sim.camera.quat);
  const c = holeShadow.centre[half];
  return angleBetween(pointer.x, pointer.y, pointer.z, c.x, c.y, c.z) < rho ? id : null;
}

/**
 * Where a camera-relative point (world km, the Sun's frame) shows through the lens (derived.ts screenOf, for
 * labels and rings that are not bodies): its order-0 image (tier 1, the same tables) in the point zone, then the
 * view observers as for bodies. A vector under DIRECTION_ONLY_KM long is a direction, its source at infinity (the
 * constellation names pass unit vectors). False (and nothing written) while no lens bends bodies: the caller
 * projects it as it always has.
 */
export function lensedScreenOf(rel: Vector3, out: ScreenPoint): boolean {
  if (!frameReady || !lensOnBodies()) return false;
  const d = rel.length();
  if (!(d > 0)) return false;
  dS.copy(rel).divideScalar(d);
  if (dS.dot(axis) > fr.cosPt) {
    frameAberrate(dS, dH);
    srcM.copy(dH).multiplyScalar(d < DIRECTION_ONLY_KM ? AT_INFINITY_M : d / fr.mKm);
    pointImageTier1(lens.inv!, holeM, srcM, 0, pi, fr.pxDev);
    dLens.set(pi.dir.x, pi.dir.y, pi.dir.z);
    frameUnaberrate(dLens, dGlint);
  } else dGlint.copy(dS);
  REG[R_DIST] = d;
  place(dGlint, out);
  return true;
}

/**
 * ln g of straight light from a camera-relative direction (world axes, any length) while bodies are lensed: the
 * static observer's −½ ln(1 − 2/r) anywhere, the raindrop's at the angle from the hole; 0 otherwise. For the
 * glints of bodies the lens leaves where they are (the observer's blueshift reaches every light).
 */
export function unlensedLnG(x: number, y: number, z: number): number {
  if (!frameReady) return 0;
  if (lens.obs.frame === 'static') return gravity.lnGStatic;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (!(l > 0)) return 0;
  return lnGRain(lens.obs.r, angleBetween(x / l, y / l, z / l, axis.x, axis.y, axis.z));
}

// ─── What a hole looks like from here ────────────────────────────────────────────────────────

const hvRel = new Vector3();
const hvAxis = new Vector3();
const hvC = new Vector3();
const hvC2 = new Vector3();
const hvShip = new Vector3();
const hvRelOut = { phi: 0, dir: new Vector3() };
const hvFrameDir = new Vector3();


/**
 * Exact numbers for any registered black hole from the camera (not only the active lens): the height above its
 * horizon, the shadow and its centre as the view shows it (the view observer: the ship, or at rest; in a fall the
 * faller), the Einstein ring, the clock rate against home's, the thrust the present motion takes there, and the
 * tides. Null for an id that is not a present black hole, or before the first frame has placed it and the camera.
 * Fills `out` when given (no allocation), else a new object.
 */
export function holeView(id: BodyId, out?: HoleView): HoleView | null {
  const e = entryOf(id);
  if (!e || e.record.kind !== 'black-hole' || !e.state.present) return null;
  const hb = e.state;
  const rec: BodyRecord = e.record;
  const rs = rec.blackHole?.rsKm ?? rec.physical.radiusKm;
  const gm = rec.blackHole?.gmKm3S2 ?? rec.physical.gmKm3S2 ?? (rs * C_KM_S * C_KM_S) / 2;
  if (!(rs > 0)) return null;
  const m = rs / 2;
  const active = gravity.hole === id;
  let rKm: number;
  let heightKm: number;
  let frame: LensFrame = 'static';
  if (active) {
    hvRel.copy(gravity.camRelHoleKm);
    rKm = gravity.rKm;
    heightKm = gravity.heightKm;
    frame = gravity.frame;
  } else {
    hvRel.copy(sim.camera.pos).sub(hb.pos);
    rKm = hvRel.length();
    // Before the first frame has placed the bodies and the camera, everything is at the origin: nothing to say yet.
    if (!(rKm > 0)) return null;
    heightKm = rKm - rs;
    // (Another hole cannot be this near: gravity would have chosen it. Keep the numbers finite anyway.)
    if (!(heightKm > rs * 1e-6)) {
      heightKm = rs * 1e-6;
      rKm = rs + heightKm;
    }
  }
  const rM = rKm / m;
  const falling = active && gravity.fallView !== null;
  const inside = active && gravity.inside;
  hvAxis.copy(hvRel).divideScalar(-Math.max(hvRel.length(), 1e-300));
  edgeObs.frame = frame;
  edgeObs.r = rM;
  const edge = edgeAngle(edgeObs);

  // The shadow as the whole view shows it.
  let radius: number;
  if (active) {
    // This frame's observers (the same as the lens's: gravity and the relativistic view are current).
    setupHoleFrame();
    setupObservers();
    radius = circleToView(axis, edge, wholeHalf, hvC);
  } else {
    // The hole's own frame boost, then the ship's motion (relative to the Sun's frame).
    const u = hb.vel.length();
    radius = edge;
    hvC.copy(hvAxis);
    if (u > 0) {
      hvFrameDir.copy(hb.vel).divideScalar(u);
      radius = boostCircle(hvAxis, radius, hvFrameDir, Math.exp(Math.atanh(Math.min(u / C_KM_S, 1 - 1e-16))), hvC);
    }
    if (relView.active && relView.phi > 0) {
      hvC2.copy(hvC);
      radius = boostCircle(hvC2, radius, relView.velDir, Math.exp(-relView.phi), hvC);
    }
  }
  const offset = angleBetween(hvC.x, hvC.y, hvC.z, hvAxis.x, hvAxis.y, hvAxis.z);

  // Clocks: α/γ_S (home at rest in the Sun's frame); in a fall dτ/dT on the free-fallers' slices.
  const alpha = active ? gravity.alpha : Math.sqrt(heightKm / rKm);
  const phiS = Number.isFinite(sim.ship.phi) ? sim.ship.phi : 0;
  let clockRate = alpha / Math.cosh(phiS);
  const trip = falling ? fall.trip : null;
  if (trip && trip.hole === id && trip.state.dTdTau > 0) clockRate = 1 / trip.state.dTdTau;

  // Thrust: hovering, or the proper acceleration of the present motion past the hovering observers; none on a
  // circular orbit, a geodesic (the formula would leave a rounding residue of about 10⁻¹¹ g there).
  let thrustG: number | null = null;
  if (active && controller.circularHole === id) thrustG = 0;
  else if (!falling && !inside) {
    let relPhi = 0;
    if (active) {
      relPhi = gravity.relPhi;
      hvShip.copy(gravity.relVelDir);
    } else if (phiS > 0) {
      const s = sim.ship.vel.length();
      if (s > 0) hvShip.copy(sim.ship.vel).divideScalar(s);
      relativeRapidity(phiS, hvShip, hb.vel, hvRelOut);
      relPhi = Number.isFinite(hvRelOut.phi) ? hvRelOut.phi : 0;
      hvShip.copy(hvRelOut.dir);
    }
    let a: number;
    if (relPhi > 0) {
      const w = Math.tanh(relPhi);
      // radial part along the outward r̂ = −axis
      const cr = -(hvShip.x * hvAxis.x + hvShip.y * hvAxis.y + hvShip.z * hvAxis.z);
      const wr = w * cr;
      const wt = w * Math.sqrt(Math.max(0, 1 - cr * cr));
      a = properAccelKmS2(gm, rKm, wr, wt);
    } else a = hoverAccelKmS2(gm, rKm);
    thrustG = Number.isFinite(a) ? a / G0_KM_S2 : null;
  }
  const tidalMS2 = tidalStretchMS2(gm, Math.max(rKm, 1e-300), 2);

  const v = out ?? ({} as HoleView);
  v.id = id;
  v.distanceKm = rKm;
  v.heightKm = heightKm;
  v.rOverRs = rKm / rs;
  v.rM = rM;
  v.frame = frame;
  v.shadowRadius = radius;
  v.shadowOffset = offset;
  (v.shadowCentre ??= new Vector3()).copy(hvC);
  v.einsteinRadius = einsteinFor(id, frame, rM);
  v.clockRate = clockRate;
  v.thrustG = thrustG;
  v.tidalMS2 = tidalMS2;
  v.tidesTearShip = tidalMS2 >= TIDES_TEAR_MS2;
  return v;
}

/** For tests: forget the cached Einstein rings (a hole re-registered with another mass). */
export function clearHoleCaches(): void {
  einCache.clear();
}

/** The hole whose lens bends the bodies' light this frame, or null (for naming images: "second image, bent round …"). */
export function lensingHole(): BodyId | null {
  return lensOnBodies() ? lens.hole : null;
}

const alignObs: Observer = makeObserver();
const alignRel = new Vector3();
const alignS = new Vector3();
const alignH = new Vector3();

/**
 * Where to hover `distanceKm` from black hole `holeId` so that body `sourceId` lies exactly behind it as its lens
 * sees it: the camera's position relative to the hole (world axes, km, into out; null if either is missing). That
 * is on the line along which the source's light arrives in the hole's own frame: for a hole at rest in the Sun's
 * frame (Sgr A*, M87*) the line from the source through the hole; for a moving one that line turned by the
 * aberration of the source's light (at Gaia BH1, about 2 × 10⁻⁴ rad: four million of the Sun's radii as seen from
 * there, so on the straight line its two images would never join into a ring). Three fixed-point steps take in
 * the source's parallax across the camera's offset. For the aligned sky-from scenes (content/scenes.ts).
 */
export function alignBehind(holeId: BodyId, sourceId: BodyId, distanceKm: number, out: Vector3): Vector3 | null {
  const h = sim.bodies[holeId];
  const src = sim.bodies[sourceId];
  if (!h || !src || !(distanceKm > 0)) return null;
  const u = h.vel.length();
  alignObs.phi = u > 0 ? Math.atanh(Math.min(u / C_KM_S, 1 - 1e-16)) : 0;
  if (u > 0) alignObs.dir.copy(h.vel).divideScalar(u);
  setRatios(alignObs);
  alignRel.set(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    // camera → source in the Sun's frame (heliocentric float64 differences, as lensEntry forms them)
    alignS.copy(src.apparentPos).sub(h.pos).sub(alignRel).normalize();
    if (alignObs.phi > 0) boost(alignS, alignObs, false, alignH);
    else alignH.copy(alignS);
    alignRel.copy(alignH).multiplyScalar(-distanceKm);
  }
  return out.copy(alignRel);
}

/** Test and debugging access to the frame state (read only). */
export const lensBodiesDebug = {
  get axis(): Vector3 {
    return axis;
  },
  get holeM(): Vector3 {
    return holeM;
  },
  get wholeHalf(): 0 | 1 {
    return wholeHalf;
  },
};
