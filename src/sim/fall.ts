/**
 * A radial fall into a supermassive black hole, through the horizon to where tides end it.
 *
 * What: the fall from rest far away (rain, e = 1) or let go from a hover (a drip, e = α₀), along the line
 * from the hole through where it began, played by the faller's own proper time τ: the stretch to r = 2 r_s
 * takes 20 s of real time, the last stretch, from 2 r_s to the tidal end, 80 s whatever the mass (at
 * Sgr A* that is real time within 0.3 %; at M87* one second is 25 minutes aboard); the pace stepper
 * scales both. Home's clock follows on the free-fallers' slices of simultaneity (Painlevé–Gullstrand time
 * T, a convention: hovering observers would say you never cross), and the chronometers take τ, T and
 * T − τ from the closed forms. The fall ends where the tidal stretch across 2 m reaches 1,000 m/s²
 * (0.0104 r_s at Sgr A*, 0.03 s before the centre for any mass), where general relativity predicts a
 * singularity soon after and stops working. Stopping ("Stop the fall", stopTrip, or anything that takes the
 * controller out of its fall mode) or ending puts the camera back hovering where it let go, with home's clock
 * kept: nothing leaves a black hole, so this is a reset, not a journey. While a fall runs, scenes and journeys
 * are refused (it holds tripActive) until it is stopped or ends. Falls into stellar-mass holes are refused
 * (tides tear a ship apart 27–78 r_s out, from Gaia BH3 to A0620-00, long before the horizon).
 *
 * How: physics/geodesics.ts radialFall gives the exact state at any τ (rain and hail in closed form, the
 * drip's T(τ) tabulated in its cycloid parameter η); this module paces τ (advanceFallClock, in
 * tickClock), puts the exact position r(τ) along the fall's line where the controller and the gravity
 * state read it (updateFall, right after tickClock), and holds the gates: a fall sets the store's
 * fallActive and tripActive, so every gate that holds during a trip holds during a fall.
 *
 * Cost: one closed-form (or table) evaluation a frame, well under 0.05 ms with the gravity state; no
 * objects allocated (fall.test.ts measures both).
 *
 * Twins: sim/gravity.ts (fallPose), controls/cameraController.ts ('fall' mode), ui/flight/HoleStrip.tsx
 * (the readings, "Let go", "Stop the fall" and the end card), sim/tick.ts (pacing and chronometers).
 */
import { Vector3 } from 'three';
import { radialFall, tidalEndRadiusKm, tidalStretchMS2, type FallState, type RadialFall } from '../physics/geodesics';
import { C_KM_S } from '../physics/constants';
import { controller, blackHoleRsKm } from '../controls/cameraController';
import { useUI } from '../state/ui';
import { getBody, type BodyId, type Vec3Like } from './bodies';
import { chronoLaunch, chronoTripEnd } from './chronometer';
import { blackHoleGm, fallPose, updateGravity } from './gravity';
import { sim } from './sim';

/** Real seconds the fall takes to r = 2 r_s at its own pace. */
export const FALL_FIRST_S = 20;
/** Real seconds from 2 r_s to the tidal end at its own pace, whatever the mass. */
export const FALL_LAST_S = 80;
/** Where the fall's second stretch begins, units of M (2 r_s). */
const SECOND_STRETCH_M = 4;
/** The pace stepper's range: from a hundred times slower to a hundred times faster. */
const PACE_MIN = 0.01;
const PACE_MAX = 100;

/** A fall under way. */
export interface FallTrip {
  hole: BodyId;
  model: RadialFall;
  /** Unit vector from the hole to the start point, world axes. */
  dirOut: Vector3;
  /** Where to put the camera back when the fall stops or ends: hovering at r0 along dirOut. */
  r0M: number;
  tau: number;
  /** Proper seconds per real second now (20 s to 2 r_s, then 80 s to the end, any mass). */
  rate: number;
  startMs: number;
  state: FallState;
  ended: boolean;
  /** GM, km³/s², and M = GM/c², km. */
  gmKm3S2: number;
  mKm: number;
  /** Proper time at r = 2 r_s (0 when the fall starts inside it). */
  tauTwoRs: number;
  /** The two stretches' own paces (proper s per real s), and a fixed pace when one was asked for. */
  rateFirst: number;
  rateLast: number;
  fixedRate: number | null;
  /** The pace stepper's factor (1: the fall's own pace). */
  pace: number;
  /** T − τ now, s (home's clock on the free-fallers' slices ahead of yours). */
  lag: number;
}

/** How the last fall ended, for its card (kept until the next fall). */
export interface FallEnd {
  why: 'stopped' | 'ended';
  hole: BodyId;
  r0M: number;
  /** Your proper time spent falling, s, and how much of it inside the horizon. */
  tau: number;
  tauInside: number;
  /** Home's time meanwhile (on the free-fallers' clocks), s. */
  homeT: number;
  /** performance.now() when it ended. */
  at: number;
}

/** The fall under way, if any, and how the last one ended. */
export const fall: { trip: FallTrip | null; lastEnd: FallEnd | null } = { trip: null, lastEnd: null };

/** Whether a fall started, or why not. */
export type FallStartResult = { ok: true } | { ok: false; reason: 'tides' | 'busy' | 'inside' | 'no-hole' | 'not-allowed' };

const scratch = new Vector3();

/** A black hole's GM (km³/s²), M (km) and GM/c³ (s), or null when the body is not a registered black hole. */
function holeScale(hole: BodyId): { gm: number; mKm: number; mTimeS: number } | null {
  const rs = blackHoleRsKm(hole);
  const gm = blackHoleGm(hole);
  if (!(rs > 0) || !(gm > 0)) return null;
  const mKm = rs / 2;
  return { gm, mKm, mTimeS: mKm / C_KM_S };
}

/** The radius (units of M) where the fall into this hole ends: the tidal stretch across 2 m reaches 1,000 m/s². */
export function fallEndM(hole: BodyId): number {
  const s = holeScale(hole);
  return s ? tidalEndRadiusKm(s.gm) / s.mKm : NaN;
}

/**
 * Why a fall into this hole from r0 (units of M) cannot start, or null when it can: busy (a trip or a fall
 * under way), no-hole, tides (a ship is torn apart before the horizon: every stellar-mass hole), not-allowed
 * (the record says so), inside (r0 at or inside the horizon, or past the tidal end).
 */
export function fallRefusal(hole: BodyId, r0: number): Exclude<FallStartResult, { ok: true }>['reason'] | null {
  const ui = useUI.getState();
  if (fall.trip || ui.tripActive || ui.fallActive) return 'busy';
  const rec = getBody(hole);
  const s = holeScale(hole);
  if (!rec || !s || !sim.bodies[hole]?.present) return 'no-hole';
  const endM = tidalEndRadiusKm(s.gm) / s.mKm;
  if (!(endM < 2)) return 'tides';
  if (rec.blackHole && rec.blackHole.fallAllowed === false) return 'not-allowed';
  if (!(r0 > 2) || !(r0 > endM) || !Number.isFinite(r0)) return 'inside';
  return null;
}

/**
 * Start a radial fall from r0 (units of M) with energy e (1: rain, from rest far away; α₀ = √(1 − 2/r0): a
 * drip let go from a hover at r0), from `dirOut`'s side of the hole (default: where the camera is), at the
 * fall's own pace ('auto': 20 s to 2 r_s, 80 s from there to the end) or a fixed number of proper seconds
 * per real second. Sets the store's fallActive and tripActive (so every navigation gate holds).
 */
export function startFall(opts: { hole: BodyId; r0: number; e: number; dirOut?: Vec3Like; rate?: number | 'auto' }): FallStartResult {
  const { hole, r0, e } = opts;
  const why = fallRefusal(hole, r0);
  if (why) return { ok: false, reason: why };
  if (!(e > 0) || !Number.isFinite(e)) return { ok: false, reason: 'inside' };
  const s = holeScale(hole)!;
  const b = sim.bodies[hole];
  const endM = tidalEndRadiusKm(s.gm) / s.mKm;
  const model = radialFall({ r0, e, rEnd: endM, mTimeS: s.mTimeS });
  const dirOut = new Vector3();
  if (opts.dirOut) dirOut.set(opts.dirOut.x, opts.dirOut.y, opts.dirOut.z);
  else if (controller.holeRelative(scratch) === hole) dirOut.copy(scratch);
  else dirOut.copy(sim.camera.pos).sub(b.pos);
  if (!(dirOut.lengthSq() > 0)) dirOut.set(0, 0, 1);
  dirOut.normalize();
  const tauTwoRs = r0 > SECOND_STRETCH_M ? model.tauAtR(SECOND_STRETCH_M) : 0;
  const rateFirst = tauTwoRs > 0 ? tauTwoRs / FALL_FIRST_S : 0;
  const rateLast = (model.tauEnd - tauTwoRs) / FALL_LAST_S;
  const fixedRate = typeof opts.rate === 'number' && opts.rate > 0 ? opts.rate : null;
  const state: FallState = { tau: 0, r: r0, drdtau: 0, T: 0, dTdTau: 1, phiRelRain: 0, phiInStatic: 0, inside: false };
  model.stateAt(0, state);
  fall.trip = {
    hole,
    model,
    dirOut,
    r0M: r0,
    tau: 0,
    rate: fixedRate ?? (tauTwoRs > 0 ? rateFirst : rateLast),
    startMs: sim.timeMs,
    state,
    ended: false,
    gmKm3S2: s.gm,
    mKm: s.mKm,
    tauTwoRs,
    rateFirst,
    rateLast,
    fixedRate,
    pace: 1,
    lag: 0,
  };
  fall.lastEnd = null;
  chronoLaunch();
  sim.live = false;
  controller.enterFall(hole, dirOut);
  useUI.setState({ fallActive: true, tripActive: true, plannerOpen: false });
  updateFall();
  return { ok: true };
}

/** Proper seconds per real second at proper time τ. */
function rateAt(t: FallTrip, tau: number): number {
  const own = t.fixedRate ?? (tau < t.tauTwoRs ? t.rateFirst : t.rateLast);
  return own * t.pace;
}

/**
 * In tickClock, after advanceTripClock (a trip and a fall never run together): advances τ by the real seconds × the pace
 * (splitting a frame that crosses 2 r_s, so that each stretch takes exactly its share), and sets home's
 * clock from T(τ). Returns home's seconds that passed, or null when no fall runs.
 */
export function advanceFallClock(dtReal: number): number | null {
  const t = fall.trip;
  if (!t) return null;
  // The frame after the tidal end: the fall ends before this frame's time is counted (the chronometers
  // took the fall's last τ and T on the frame it was drawn), and the clock runs on as a hover's.
  if (t.ended) {
    endFall('ended');
    return null;
  }
  const T0 = t.state.T;
  const end = t.model.tauEnd;
  if (dtReal > 0 && t.tau < end) {
    let dt = dtReal;
    let tau = t.tau;
    for (let i = 0; i < 3 && dt > 0 && tau < end; i++) {
      const rate = rateAt(t, tau);
      const limit = tau < t.tauTwoRs && t.fixedRate === null ? t.tauTwoRs : end;
      const need = (limit - tau) / rate;
      if (need > dt) {
        tau += dt * rate;
        dt = 0;
      } else {
        tau = limit;
        dt -= need;
      }
    }
    t.tau = Math.min(end, tau);
    t.model.stateAt(t.tau, t.state);
    t.lag = t.state.T - t.state.tau;
    sim.timeMs = t.startMs + 1000 * t.state.T;
    sim.timeCarryMs = 0;
  }
  t.rate = rateAt(t, t.tau);
  return t.state.T - T0;
}

/**
 * Right after tickClock (before the controller and the gravity state): the exact place r(τ) along the
 * fall's line, to both. At the tidal limit the fall is marked ended: this frame is drawn there, and the
 * next frame's clock ends it (advanceFallClock).
 */
export function updateFall(): void {
  const t = fall.trip;
  if (!t) {
    fallPose.active = false;
    return;
  }
  if (!sim.bodies[t.hole]?.present) {
    endFall('stopped');
    return;
  }
  const r = t.state.r;
  fallPose.active = true;
  fallPose.hole = t.hole;
  fallPose.dirOut.copy(t.dirOut);
  fallPose.rM = r;
  fallPose.relKm.copy(t.dirOut).multiplyScalar(r * t.mKm);
  fallPose.heightKm = (r - 2) * t.mKm;
  fallPose.phiInStatic = t.state.phiInStatic;
  fallPose.phiRelRain = t.state.phiRelRain;
  controller.setFallPose(t.hole, fallPose.relKm, fallPose.heightKm);
  if (t.tau >= t.model.tauEnd) t.ended = true;
}

/** Stop (the button, stopTrip, the controller leaving its fall mode) or end (the tidal limit): back to hovering at r0, home's clock kept. */
export function endFall(why: 'stopped' | 'ended'): void {
  const t = fall.trip;
  if (!t) return;
  fall.trip = null;
  fallPose.active = false;
  chronoTripEnd();
  const tauH = t.model.tauHorizon;
  fall.lastEnd = {
    why,
    hole: t.hole,
    r0M: t.r0M,
    tau: t.tau,
    tauInside: Number.isFinite(tauH) ? Math.max(0, t.tau - tauH) : 0,
    homeT: t.state.T,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  // Back where it let go (a reset: nothing leaves a black hole), looking at the hole; home's clock is kept.
  controller.hoverAt(t.hole, t.r0M, t.dirOut);
  // The gravity state of the hover at once: the clock and the chronometers read it before this frame's
  // own update, and the fall's last one may be inside the horizon (r_s/r > 1, no hovering observer).
  updateGravity();
  useUI.setState({ fallActive: false, tripActive: false, journeyNote: null });
}

// Leaving the fall mode (a slew, free flight or another of the controller's modes) ends the fall.
controller.onLeaveFall = () => endFall('stopped');

/** The HUD's readings during a fall (a reused object). */
export interface FallReadings {
  tau: number;
  rOverRs: number;
  heightKm: number;
  /** Home on the free-fallers' clocks (T). */
  homeT: number;
  /** Home's clock as seen straight up: rate e^{φ_rel}/(1 + v). */
  homeSeenRate: number;
  /** Speed past hovering observers, c (NaN inside). */
  speedPastHover: number;
  tidalMS2: number;
  tauLeft: number;
}

/** The HUD's readings now, or null when no fall runs. */
export function fallReadings(out: FallReadings): FallReadings | null {
  const t = fall.trip;
  if (!t) return null;
  const s = t.state;
  const r = s.r;
  out.tau = s.tau;
  out.rOverRs = r / 2;
  out.heightKm = (r - 2) * t.mKm;
  out.homeT = s.T;
  // The raindrop's speed √(2M/r), and the faller's rapidity past it (outward): home overhead as seen.
  out.homeSeenRate = Math.exp(s.phiRelRain) / (1 + Math.sqrt(2 / r));
  out.speedPastHover = r > 2 ? Math.tanh(s.phiInStatic) : NaN;
  out.tidalMS2 = tidalStretchMS2(t.gmKm3S2, r * t.mKm, 2);
  out.tauLeft = Math.max(0, t.model.tauEnd - s.tau);
  return out;
}

// ─── The pace ──────────────────────────────────────────────────────────────────────────

/** Ten times slower or faster (the footer's and the HUD's stepper, [ and ]). Returns the factor applied, or null with no fall. */
export function stepFallPace(dir: 1 | -1): number | null {
  const t = fall.trip;
  if (!t) return null;
  t.pace = Math.min(PACE_MAX, Math.max(PACE_MIN, t.pace * 10 ** dir));
  t.rate = rateAt(t, t.tau);
  return t.pace;
}

/** Whether the fall's pace can go slower (dir −1) or faster (+1). */
export function canStepFallPace(dir: 1 | -1): boolean {
  const t = fall.trip;
  if (!t) return false;
  return dir > 0 ? t.pace < PACE_MAX : t.pace > PACE_MIN;
}

/** Real seconds left at this pace (to the tidal end). */
export function fallRealSecondsLeft(t: FallTrip): number {
  let left = 0;
  if (t.tau < t.tauTwoRs && t.fixedRate === null) left += (t.tauTwoRs - t.tau) / (t.rateFirst * t.pace) + (t.model.tauEnd - t.tauTwoRs) / (t.rateLast * t.pace);
  else left += (t.model.tauEnd - t.tau) / rateAt(t, t.tau);
  return left;
}

/**
 * What a drip let go from rest at r0 (units of M) would take: proper time to the horizon and to the end,
 * s, and real seconds at the fall's own pace (for "Let go"'s confirmation). Null when it cannot start.
 */
export function dripPreview(hole: BodyId, r0: number): { tauHorizonS: number; tauEndS: number; realS: number } | null {
  const s = holeScale(hole);
  if (!s || !(r0 > 2)) return null;
  const endM = tidalEndRadiusKm(s.gm) / s.mKm;
  if (!(endM < 2) || !(r0 > endM)) return null;
  const e = Math.sqrt((r0 - 2) / r0);
  const m = radialFall({ r0, e, rEnd: endM, mTimeS: s.mTimeS });
  const t2 = r0 > SECOND_STRETCH_M ? m.tauAtR(SECOND_STRETCH_M) : 0;
  return { tauHorizonS: m.tauHorizon, tauEndS: m.tauEnd, realS: (t2 > 0 ? FALL_FIRST_S : 0) + FALL_LAST_S };
}

/**
 * "Let go" from a hover: a drip from rest at the camera's r along its line, e = α₀ from the height (exact at
 * any r). The camera must be hovering over the hole the gravity state has selected.
 */
export function letGo(hole: BodyId, rM: number, heightKm: number, mKm: number, dirOut: Vec3Like): FallStartResult {
  // α₀² = h/r, formed from the height (1 − 2/r would lose digits close to the horizon).
  const e = Math.sqrt(heightKm / (rM * mKm));
  return startFall({ hole, r0: rM, e, dirOut, rate: 'auto' });
}
