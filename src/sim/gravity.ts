/**
 * The gravity of the one black hole that matters this frame, for the lens, the clocks, the HUD and the
 * readings.
 *
 * What: among the registered black holes, the one with the largest x = r_s/r from the camera (switching
 * only when another's x is 10 % larger), and from it the exact camera position relative to the hole (from
 * the controller's or the fall's float64 hole-relative position, never from sim.camera.pos − hole.pos,
 * whose ulp is 2 km at Gaia BH1, 32 km at Sgr A*, 65,536 km at M87*), r and the height above the horizon,
 * α = √(1 − x) and 1 − α without cancellation, the lens frame (the raindrop's only during a fall below
 * r = 3M), whether the time warp is paced by the hovering observer's clock, the boost from the Sun's frame
 * to the hole's, and the ship's motion relative to the local observer.
 *
 * How: r and the height come from the controller (holeRelative, holeHeightKm) when it works about the
 * hole, from the fall's closed form during a fall (fallPose, written by sim/fall.ts), and otherwise from
 * the world positions (then far enough away for their 32 km to be nothing). Outside a fall r is clamped to
 * r_s(1 + 10⁻⁶), the hover floor: a slew that passes close can otherwise land inside the horizon and make
 * every uniform NaN. α² = h/r is formed from the height, exact at the floor (where 1 − x would keep only
 * six digits); 1 − α = x/(1 + α); ln g = −½ log1p(−x) far out and −ln α close in.
 *
 * Why the threshold: below x = 5e-10 no hole is selected and every field keeps its default, so every
 * existing path stays bit-identical (at the Sun, Sgr A* gives x = 4.97e-11 and M87* 3.72e-11). Why one
 * hole: where two could matter the lesser's lens is far below a pixel (docs/data/blackholes.md §3,
 * label 20).
 *
 * Cost: a loop over the dozen registered holes and a few float64 operations a frame (≈ 1 µs); nothing
 * allocated (the list of holes is rebuilt only when the registry changes).
 *
 * Run by SimDriver after updateShipKinematics. Readers: render/lens/lensState.ts (L), sim/lensBodies.ts
 * (C), the cluster (N), the flow (F), sim/tick.ts and sim/chronometer.ts (pacing, clocks), the HUD
 * (ui/flight/HoleStrip.tsx), the instruments and the chrome. Twin: physics/geodesics.ts has the formulas.
 */
import { Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { relativeRapidity } from '../physics/geodesics';
import { rapidityFromSpeed } from '../physics/relativity';
import type { LensFrame } from '../physics/schwarzschild';
import { bodyRecords, getBody, registryVersion, type BodyId } from './bodies';
import { blackHoleRsKm, controller, HOVER_FLOOR_RS } from '../controls/cameraController';
import { sim } from './sim';

/**
 * Below this x = r_s/r no hole is selected and every field keeps its default, so every existing path is
 * bit-identical (at the Sun, Sgr A* gives 4.97e-11 and M87* 3.72e-11). Just below the lens's own activation
 * (θ_E = 0.05 px at 1,484 px/rad is x = 5.7e-10).
 */
export const GRAVITY_X_MIN = 5e-10;
/** During a fall the lens tables use the static frame above this radius (units of M) and the rain frame below. */
export const RAIN_TABLE_BELOW_M = 3;
/** Departures of the flight planner are refused within this many r_s of a hole. */
export const PLANNER_REFUSAL_RS = 30;
/** Time is paced by the hovering observer's clock once it runs slow by more than this (within 5,000 r_s). */
export const PACED_ONE_MINUS_ALPHA = 1e-4;
/** Another hole takes over only when its x = r_s/r is this much larger (so two holes never flicker). */
const SWITCH_MARGIN = 1.1;

/** The moving observer during a fall, relative to the lens frame of the moment. */
export interface FallView {
  /** The faller's rapidity and unit direction (world) relative to the lens frame (static above 3M: inward; rain below: outward for a drip). */
  phi: number;
  dir: Vector3;
  /** The raindrop's own rapidity relative to the lens frame (inward artanh v above 3M; 0 below): the split view's left half. */
  rainPhi: number;
}

/**
 * The gravity of the one black hole that matters this frame (largest r_s/r among registered holes, with a
 * 10 % switching margin). x = 0 exactly (and every field at its default) when none has x ≥ GRAVITY_X_MIN.
 */
export interface GravityState {
  hole: BodyId | null;
  gmKm3S2: number;
  /** M = GM/c², km. */
  mKm: number;
  /** GM/c³, s. */
  mTimeS: number;
  rsKm: number;
  /**
   * Camera relative to the hole, world axes, km, float64 and exact (from the controller or the fall: never
   * from sim.camera.pos − hole.pos). Outside a fall, clamped to r ≥ r_s(1 + 1e-6).
   */
  camRelHoleKm: Vector3;
  rKm: number;
  /** r − r_s, km, exact (from the controller's logHeight or the fall's closed form; negative inside). */
  heightKm: number;
  /** r in units of M. */
  rM: number;
  /** r_s/r. */
  x: number;
  alpha: number;
  oneMinusAlpha: number;
  /** The lens frame the tables are built for (rain only during a fall below RAIN_TABLE_BELOW_M). */
  frame: LensFrame;
  /** r < r_s (only during a fall). */
  inside: boolean;
  /** 1 − α > 1e-4: the time warp paces the static observer's proper time, live mode is off. */
  paced: boolean;
  /** The hole's velocity in S, km/s (the S → hole-frame boost). */
  holeVelKmS: Vector3;
  /** Rapidity and unit direction (world) of the S → hole-frame boost (0 at Sgr A* and M87*). */
  framePhi: number;
  frameVelDir: Vector3;
  /**
   * The ship's rapidity and direction relative to the local static observer (outside) or raindrop (inside),
   * for the HUD, instruments and lab readings ("speed past hovering observers").
   */
  relPhi: number;
  relVelDir: Vector3;
  /** ln g of light from infinity at the camera for a static observer (0 in the rain frame). */
  lnGStatic: number;
  /** The raindrop's inward speed v = √(r_s/r) and 1 − v (from float64). */
  rainV: number;
  rainOneMinusV: number;
  /** Set during a fall: the view observers' motion relative to the lens frame. */
  fallView: FallView | null;
}

/** This frame's gravity: with no hole selected, r is infinite, x = 0 and α = 1. */
export const gravity: GravityState = {
  hole: null,
  gmKm3S2: 0,
  mKm: 0,
  mTimeS: 0,
  rsKm: 0,
  camRelHoleKm: new Vector3(),
  rKm: Infinity,
  heightKm: Infinity,
  rM: Infinity,
  x: 0,
  alpha: 1,
  oneMinusAlpha: 0,
  frame: 'static',
  inside: false,
  paced: false,
  holeVelKmS: new Vector3(),
  framePhi: 0,
  frameVelDir: new Vector3(0, 0, -1),
  relPhi: 0,
  relVelDir: new Vector3(0, 0, -1),
  lnGStatic: 0,
  rainV: 0,
  rainOneMinusV: 1,
  fallView: null,
};

/**
 * What a fall under way tells the gravity state each frame (written by sim/fall.ts updateFall, read here,
 * so that this module does not import the fall's).
 */
export interface FallPose {
  active: boolean;
  hole: BodyId | null;
  /** Camera relative to the hole, world km, from the closed form r(τ) along the fall's line. */
  relKm: Vector3;
  /** Unit vector from the hole to where the fall began (world). */
  dirOut: Vector3;
  rM: number;
  /** (r − 2M), km: negative inside the horizon. */
  heightKm: number;
  /** The faller's rapidity past the hovering observers, inward (NaN inside the horizon). */
  phiInStatic: number;
  /** The faller's rapidity past the raindrop there, outward (a drip: ≥ 0; rain: 0). */
  phiRelRain: number;
}

export const fallPose: FallPose = {
  active: false,
  hole: null,
  relKm: new Vector3(),
  dirOut: new Vector3(0, 0, 1),
  rM: Infinity,
  heightKm: Infinity,
  phiInStatic: 0,
  phiRelRain: 0,
};

// ─── The registered holes ──────────────────────────────────────────────────────────────

interface HoleEntry {
  id: BodyId;
  gm: number;
  rs: number;
}
const holes = { version: -1, list: [] as HoleEntry[] };

/** The registered black holes with their GM and r_s (rebuilt only when the registry changes). */
export function blackHoles(): readonly HoleEntry[] {
  const v = registryVersion();
  if (holes.version !== v) {
    holes.list = [];
    for (const r of bodyRecords()) {
      if (r.kind !== 'black-hole') continue;
      const rs = blackHoleRsKm(r.id);
      if (!(rs > 0)) continue;
      holes.list.push({ id: r.id, gm: r.blackHole?.gmKm3S2 ?? r.physical.gmKm3S2 ?? (rs * C_KM_S * C_KM_S) / 2, rs });
    }
    holes.version = v;
  }
  return holes.list;
}

/** A registered black hole's GM, km³/s² (0 when it is not one). */
export function blackHoleGm(id: BodyId): number {
  const r = getBody(id);
  if (!r || r.kind !== 'black-hole') return 0;
  return r.blackHole?.gmKm3S2 ?? r.physical.gmKm3S2 ?? (blackHoleRsKm(id) * C_KM_S * C_KM_S) / 2;
}

// ─── Per frame ─────────────────────────────────────────────────────────────────────────

const rel = new Vector3();
const shipDir = new Vector3();
const relOut = { phi: 0, dir: new Vector3() };
const fallViewState: FallView = { phi: 0, dir: new Vector3(), rainPhi: 0 };

/** Every field back to its default: no hole. */
function reset(): void {
  gravity.hole = null;
  gravity.gmKm3S2 = 0;
  gravity.mKm = 0;
  gravity.mTimeS = 0;
  gravity.rsKm = 0;
  gravity.camRelHoleKm.set(0, 0, 0);
  gravity.rKm = Infinity;
  gravity.heightKm = Infinity;
  gravity.rM = Infinity;
  gravity.x = 0;
  gravity.alpha = 1;
  gravity.oneMinusAlpha = 0;
  gravity.frame = 'static';
  gravity.inside = false;
  gravity.paced = false;
  gravity.holeVelKmS.set(0, 0, 0);
  gravity.framePhi = 0;
  gravity.frameVelDir.set(0, 0, -1);
  gravity.relPhi = 0;
  gravity.relVelDir.set(0, 0, -1);
  gravity.lnGStatic = 0;
  gravity.rainV = 0;
  gravity.rainOneMinusV = 1;
  gravity.fallView = null;
}

/** After controller.update and updateShipKinematics (SimDriver): this frame's hole, if any, and everything that follows from it. */
export function updateGravity(): void {
  const list = blackHoles();
  const fallHole = fallPose.active ? fallPose.hole : null;
  const ctrlHole = controller.holeRelative(rel);
  let pick: BodyId | null = null;
  let entry: HoleEntry | null = null;
  if (fallHole) {
    // A fall is always about its own hole. (A plain loop: a closure here would allocate its context every frame.)
    for (const h of list) if (h.id === fallHole) entry = h;
    pick = entry ? fallHole : null;
  } else {
    let best: HoleEntry | null = null;
    let bestX = 0;
    let current: HoleEntry | null = null;
    let currentX = 0;
    const cp = sim.camera.pos;
    for (const h of list) {
      const hb = sim.bodies[h.id];
      if (!hb?.present) continue;
      // The distance to each hole, km: exact for the one the controller works about. (Written out here:
      // a helper returning a double would box it on every call, one allocation per hole per frame.)
      const dx = h.id === ctrlHole ? rel.x : cp.x - hb.pos.x;
      const dy = h.id === ctrlHole ? rel.y : cp.y - hb.pos.y;
      const dz = h.id === ctrlHole ? rel.z : cp.z - hb.pos.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const x = r > h.rs ? h.rs / r : 1;
      if (x > bestX) {
        bestX = x;
        best = h;
      }
      if (h.id === gravity.hole) {
        current = h;
        currentX = x;
      }
    }
    // Keep the present hole unless another is 10 % stronger here.
    entry = current && currentX >= GRAVITY_X_MIN && !(bestX > SWITCH_MARGIN * currentX) ? current : best && bestX >= GRAVITY_X_MIN ? best : null;
    pick = entry?.id ?? null;
  }
  if (!pick || !entry) {
    if (gravity.hole !== null || gravity.x !== 0) reset();
    controller.nearHole = null;
    return;
  }
  const b = sim.bodies[pick];
  const rs = entry.rs;
  const mKm = rs / 2;
  gravity.hole = pick;
  gravity.gmKm3S2 = entry.gm;
  gravity.mKm = mKm;
  gravity.mTimeS = mKm / C_KM_S;
  gravity.rsKm = rs;

  // The camera relative to the hole, exactly, and its height above the horizon.
  const cam = gravity.camRelHoleKm;
  let h: number;
  if (fallHole === pick) {
    cam.copy(fallPose.relKm);
    h = fallPose.heightKm;
  } else if (ctrlHole === pick) {
    cam.copy(rel);
    h = controller.holeHeightKm;
    if (!Number.isFinite(h)) h = cam.length() - rs;
  } else {
    cam.copy(sim.camera.pos).sub(b.pos);
    h = cam.length() - rs;
  }
  const inFall = fallHole === pick;
  if (!inFall) {
    // The hover floor: nothing but a fall goes below r_s(1 + 10⁻⁶).
    const floor = rs * HOVER_FLOOR_RS;
    if (!(h >= floor)) {
      const len = cam.length();
      if (len > 0) cam.multiplyScalar((rs + floor) / len);
      else cam.set(0, 0, rs + floor);
      h = floor;
    }
  }
  const r = rs + h;
  const x = rs / r;
  gravity.rKm = r;
  gravity.heightKm = h;
  gravity.rM = r / mKm;
  gravity.x = x;
  const inside = inFall && h < 0;
  gravity.inside = inside;
  // α² = h/r, exact at the floor; inside the horizon no observer can hover (α is set to 0).
  const a2 = h / r;
  const alpha = a2 > 0 ? Math.sqrt(a2) : 0;
  gravity.alpha = alpha;
  gravity.oneMinusAlpha = a2 > 0 ? x / (1 + alpha) : 1;
  gravity.paced = gravity.oneMinusAlpha > PACED_ONE_MINUS_ALPHA;
  const rain = inFall && gravity.rM < RAIN_TABLE_BELOW_M;
  gravity.frame = rain ? 'rain' : 'static';
  gravity.lnGStatic = rain || !(a2 > 0) ? 0 : x < 0.5 ? -0.5 * Math.log1p(-x) : -Math.log(alpha);
  const v = Math.sqrt(x);
  gravity.rainV = v;
  gravity.rainOneMinusV = a2 / (1 + v);

  // The S → hole-frame boost: the hole's own motion.
  gravity.holeVelKmS.copy(b.vel);
  const u = b.vel.length();
  gravity.framePhi = u > 0 ? rapidityFromSpeed(u) : 0;
  if (u > 0) gravity.frameVelDir.copy(b.vel).divideScalar(u);

  // The ship relative to the local observer.
  if (inFall) {
    const out = fallPose.dirOut;
    if (!inside) {
      gravity.relPhi = fallPose.phiInStatic;
      gravity.relVelDir.copy(out).negate();
    } else {
      gravity.relPhi = Math.abs(fallPose.phiRelRain);
      gravity.relVelDir.copy(out).multiplyScalar(fallPose.phiRelRain < 0 ? -1 : 1);
    }
    // The view observers relative to the lens frame: static tables above 3M (the faller
    // and the raindrop move inward past the hovering observers), the raindrop's below.
    const fv = fallViewState;
    if (rain) {
      fv.phi = Math.abs(fallPose.phiRelRain);
      fv.dir.copy(out).multiplyScalar(fallPose.phiRelRain < 0 ? -1 : 1);
      fv.rainPhi = 0;
    } else {
      fv.phi = fallPose.phiInStatic;
      fv.dir.copy(out).negate();
      fv.rainPhi = Math.atanh(v);
    }
    gravity.fallView = fv;
  } else {
    gravity.fallView = null;
    const phiS = sim.ship.phi;
    const sv = sim.ship.vel;
    if (sv.x === b.vel.x && sv.y === b.vel.y && sv.z === b.vel.z) {
      // Riding with the hole (hovering): exactly at rest past the hovering observers.
      gravity.relPhi = 0;
    } else if (Number.isFinite(phiS)) {
      const s = sv.length();
      if (s > 0) shipDir.copy(sv).divideScalar(s);
      else shipDir.set(0, 0, -1);
      relativeRapidity(phiS, shipDir, b.vel, relOut);
      gravity.relPhi = Number.isFinite(relOut.phi) ? relOut.phi : 0;
      if (relOut.phi > 0) gravity.relVelDir.copy(relOut.dir);
    } else gravity.relPhi = 0;
  }

  // Free flight that comes this close flies relative to the hole.
  controller.nearHole = gravity.paced ? pick : null;
}
