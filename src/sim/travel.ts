/**
 * Travel mode: fly to a body.
 *
 * Three drives:
 *  - cruise: idealised, with an instantaneous boost to a constant speed v, a straight line
 *    through the Sun's rest frame, and an instantaneous stop. Ship (proper) time τ = t/γ.
 *  - rocket: realistic, with constant 1 g proper acceleration and a flip halfway to decelerate:
 *    t = (c/a) sinh(aτ/c), d = (c²/a)(cosh(aτ/c) − 1).
 *  - warp: fictional faster-than-light motion (γ and proper time undefined).
 *
 * Every course aims at where the destination will be on arrival (solved from the real
 * ephemeris).
 *
 * Which spacetime. Inside the Local Group (both ends of the flight within its zero-velocity
 * surface) space is static and the rocket and cruise follow special relativity, as above. A flight
 * that leaves the Local Group, or starts outside it, crosses the expanding universe: the rocket and
 * the cruise are then planned in a flat Lambda-CDM (FLRW) universe with the Planck 2018 parameters
 * (travelCosmic.ts, physics/cosmology), the clock at home runs on as cosmic time (billions of years
 * on the longest flights), the camera rides the ship's comoving position, and the ship's velocity is
 * its peculiar velocity relative to the galaxies it passes, which is what sets the aberration and
 * Doppler shift of the view. Those flights assume a perfect engine, and galaxies carried by the expansion or held
 * in their group or cluster (their own motions are left out).
 *
 * Where a flight ends: at the destination's framing distance, except for a galaxy, a cluster or a nebula, which has
 * no surface to stop short of: the ship goes all the way in (controls/framing.ts flightStandoff).
 *
 * Pacing. Real trips play back by SHIP time: each frame advances the crew's proper time τ by
 * (real seconds) × shipRate, and the Earth clock is then set from the trip's closed-form t(τ).
 * A relativistic trip that takes years at home and hours on board thus plays at an even pace
 * through the part the crew lives through, rather than flashing by in a few frames of Earth
 * time. The default rate plays any trip in about a minute (never slower than real time).
 * The fictional warp has no proper time, so it keeps Earth-time pacing at the chosen time warp.
 * Pausing, "skip to arrival" and the chronometers stay exact either way.
 */
import { Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import { C_KM_S, G0_KM_S2, JULIAN_YEAR_S, LIGHT_YEAR_KM } from '../physics/constants';
import { solveInterceptReach } from '../physics/intercept';
import { gamma } from '../physics/relativity';
import {
  earthTimeAtShipTime,
  flipAndBurn,
  flipAndBurnAt,
  flipAndBurnAtEarthTime,
  flipAndBurnLag,
  shipTimeAtEarthTime,
  sinhMinusX,
  type FlipAndBurnTrip,
} from '../physics/rocket';
import { flightStandoff } from '../controls/framing';
import { formatDurationShort, msFromAstroTime } from '../lib/time';
import { homeViewAt, MPC_KM, planck18, sampleAt, type PlaybackSample, type UnreachableReason } from '../physics/cosmology';
import { bodyAvailability, bodyName, bodyPositionAt, type BodyId } from './bodies';
import { sim } from './sim';
import { advanceTime, stepWarp } from './clock';
import { cosmicAt } from './cosmicTime';
import { insideLocalGroup } from './cosmos/expansion';
import { G0, planCosmicLeg, spaceModel, type CosmicLeg, type CosmicResult, type SpaceModel } from './travelCosmic';

export type { SpaceModel } from './travelCosmic';

export type Drive = 'cruise' | 'rocket' | 'warp';

export interface TripPlan {
  dest: BodyId;
  drive: Drive;
  /** Cruise speed as a fraction of c (the peak speed for the rocket; above 1 only for warp). */
  beta: number;
  /** Fictional faster-than-light warp: γ and ship time are undefined. */
  warp: boolean;
  speed: number;
  gamma: number;
  start: Vector3;
  aim: Vector3;
  distance: number;
  /** Sun-frame (Earth) flight time, s. */
  earthTime: number;
  /** Proper (ship) time, s. */
  shipTime: number;
  /** Flip-and-burn profile (rocket drive in static space only). */
  rocket: FlipAndBurnTrip | null;
  /** The spacetime crossed: static (special relativity, inside the Local Group) or the expanding universe. */
  model: SpaceModel;
  /** Proper acceleration of the burns, in units of g (the rocket; the cruise's burns in expanding space). */
  accelG: number;
  /**
   * The flight through the expanding universe (model 'flrw'): the plan with its playback samples, and
   * the home clock at arrival. `distance` is then comoving (the universe's size today), `earthTime`
   * cosmic time at home, `beta` and `gamma` the peak peculiar speed.
   */
  cosmic: CosmicLeg | null;
  /**
   * The course through comoving space (model 'flrw'): the departure's comoving place `q0` (world axes,
   * km at a = 1: its position divided by the scale factor at departure), the unit direction `dir` and
   * the arrival's comoving place `q1` = q0 + dir × distance (the aim divided by the scale factor on
   * arrival). The ship is at a(t) (q0 + dir χ(τ)) in the world frame, which holds proper positions at
   * the clock's time (sim/cosmicTime.ts); the second half of the way is reckoned back from q1, so that
   * both ends keep their full precision (home is 4 × 10²⁰ km from the Virgo Cluster, and Earth's
   * standoff 2.5 × 10⁴). The aim is where the destination is on arrival, whatever it does meanwhile:
   * carried by the expansion, held in its cluster or in the Local Group, or moving on its orbit.
   */
  course: { q0: Vector3; dir: Vector3; q1: Vector3 } | null;
  /** Home's light where the flight ends (model 'flrw'). */
  homeOnArrival: HomeLight | null;
}

/**
 * Home's light as seen where a flight through expanding space ends (the ship then at rest). Home is the
 * Local Group's comoving place, the origin. The module's own view of "home" is the departure point
 * (physics/cosmology homeViewAt), which is home only for a flight that set out from it.
 */
export interface HomeLight {
  /** The flight set out from home (within HOME_KM of the Sun). */
  fromHome: boolean;
  /** It ends inside the Local Group with home, where space does not expand: no redshift between. */
  inLocalGroup: boolean;
  /** Redshift of home's light there (the expansion's alone). */
  z: number;
  /** When that light left home, years after the ship set out (below 0: before). */
  afterDepartureYr: number;
}

/** Options of a flight beyond the drive and speed. */
export interface FlightOptions {
  /** Proper acceleration of the rocket (and of the cruise's burns in expanding space), in g. Default 1. */
  accelG?: number;
  /** Refuse flights that need more ship time than this, years (default: no limit). */
  maxShipTimeYr?: number;
}

/**
 * Why a flight cannot be made: the expanding universe's reasons (physics/cosmology's Unreachable), the
 * ship-time limit, or a destination that recedes faster than a slow ship can close (static space).
 */
export interface Refusal {
  reason: UnreachableReason | 'recedes';
  model: SpaceModel;
  dest: BodyId;
  /** Distance of the destination, km (comoving, a = 1 today, in expanding space). */
  distanceKm: number;
  /** Comoving event horizon at departure, km (NaN in static space). */
  horizonKm: number;
  /** Farthest distance reachable within the limit the reason names, km (NaN when none applies). */
  maxKm: number;
  /** The ship-time limit, years (NaN when none). */
  maxShipTimeYr: number;
  accelG: number;
  /** The drive's cruise speed (NaN for the rocket). */
  beta: number;
  /** Scale factor at departure (proper distances then are this times the comoving ones). */
  aDep: number;
  /** The planner's own sentence, with its numbers (for the data-minded; the UI words it plainly). */
  detail: string;
}

export type FlightResult = { ok: true; plan: TripPlan } | { ok: false; refusal: Refusal | null };

/** 'ship': playback advances the crew's clock (cruise, rocket). 'earth': the Sun-frame clock at the time warp (fictional warp). */
export type TripPacing = 'ship' | 'earth';

export interface Trip extends TripPlan {
  startMs: number;
  dir: Vector3;
  pacing: TripPacing;
  /** Ship (proper) time elapsed, s: the playback position of a ship-paced trip (NaN for warp). */
  tau: number;
  /** Earth (Sun-frame) time elapsed, s. */
  t: number;
  /** Ship seconds per real second (ship-paced trips). */
  shipRate: number;
  /** Scratch sample of the expanding-universe plan at τ (kept here so playback does not allocate). */
  sample: PlaybackSample;
  /** τ the sample is for (NaN: none yet). */
  sampleTau: number;
}

export interface ArrivalSummary {
  dest: BodyId;
  drive: Drive;
  beta: number;
  warp: boolean;
  earthTime: number;
  shipTime: number;
  distance: number;
  /** Simulation time at arrival (ms): the date at home when the ship got there. */
  endMs: number;
  /** Real-world timestamp (ms) when the summary was created, for auto-dismissal. */
  at: number;
  model: SpaceModel;
  accelG: number;
  /** A flight through the expanding universe: the universe on arrival and the home clock. */
  cosmic: CosmicLeg | null;
  /** And home's light there. */
  homeOnArrival: HomeLight | null;
}

/** Instantaneous ship state along the current trip. */
export interface ShipState {
  beta: number;
  gamma: number;
  /**
   * Rapidity φ = artanh β from the trip's closed form (NaN for warp). Exact at any γ, where β
   * has long since rounded to 1: the renderer works from this, not from the velocity.
   */
  phi: number;
  /** Ship (proper) time elapsed, s (NaN for warp). */
  tau: number;
  /** Distance covered, km (Sun frame). */
  covered: number;
}

export const travel = {
  trip: null as Trip | null,
  shipPos: new Vector3(),
  lastArrival: null as ArrivalSummary | null,
};

const tmp = new Vector3();

/** Real seconds a trip takes at its default ship rate. */
export const TRIP_PLAYBACK_S = 60;
/** The slowest ship rate: real time on board. */
export const SHIP_RATE_MIN = 1;

/** Flip-and-burn distance coverable in total coordinate time T at acceleration a. */
function rocketReach(T: number, a = G0_KM_S2): number {
  const x = (a * T) / (2 * C_KM_S);
  // 2(c²/a)(√(1 + x²) − 1), written without cancellation for short hops.
  return ((2 * C_KM_S * C_KM_S) / a) * ((x * x) / (Math.hypot(1, x) + 1));
}

/** γ − 1 without cancellation at low speed: β²γ²/(1 + γ). */
export function gammaMinusOne(beta: number): number {
  const g = gamma(beta);
  return (beta * beta * g * g) / (1 + g);
}

/** The drive a speed implies: above c only the fictional warp, otherwise a constant speed. */
const driveFor = (beta: number): Drive => (beta >= 1 ? 'warp' : 'cruise');

/**
 * Plan a flight to `dest` from `from` (world km), or say why there is none. `beta` is the cruise
 * speed (or the multiple of c for warp); the rocket ignores it. Static space aims a straight-line
 * intercept at where the destination will be on arrival; expanding space aims at the destination's
 * comoving place on arrival (planExpanding). `refusal` is null when the
 * destination does not exist at this date (Voyager 1 before 1980) or has no position yet.
 */
export function planFlight(
  dest: BodyId,
  beta: number,
  from: Vector3,
  time: AstroTime = sim.astroTime,
  drive: Drive = driveFor(beta),
  opts: FlightOptions = {},
): FlightResult {
  const ms = msFromAstroTime(time);
  if (!bodyAvailability(dest, ms).available) return { ok: false, refusal: null };
  const accelG = opts.accelG ?? 1;
  const accel = accelG * G0_KM_S2;
  const targetNow = bodyPositionAt(dest, time, tmp).clone();
  // Near the centre of what has no surface (a galaxy, a cluster, a nebula), else the framing distance.
  const standoff = flightStandoff(dest, targetNow.distanceTo(from));
  // The fictional warp keeps to static space: it is there for comparison with c, not with cosmology.
  if (drive !== 'warp' && targetNow.distanceTo(from) > standoff && spaceModel(from, targetNow) === 'flrw')
    return planExpanding(dest, beta, from, time, standoff, ms, drive, accelG, opts.maxShipTimeYr);
  const targetAt = (dt: number) => bodyPositionAt(dest, time.AddDays(dt / 86_400), tmp).clone();
  const hit =
    drive === 'rocket'
      ? solveInterceptReach(targetAt, from, (T) => rocketReach(T, accel), standoff, (d) => flipAndBurn(d, accel).earthTime)
      : solveInterceptReach(targetAt, from, (T) => beta * C_KM_S * T, standoff, (d) => d / (beta * C_KM_S));
  if (!hit) return { ok: false, refusal: refusal('recedes', 'static', dest, targetNow.distanceTo(from), accelG, drive === 'rocket' ? NaN : beta, 'The destination recedes faster than the ship can close.') };
  const target = new Vector3(hit.targetAtArrival.x, hit.targetAtArrival.y, hit.targetAtArrival.z);
  const toTarget = target.clone().sub(from);
  const distanceToCentre = toTarget.length();
  const aim = from.clone().addScaledVector(toTarget.normalize(), Math.max(0, distanceToCentre - standoff));
  const distance = aim.distanceTo(from);
  const base = { dest, start: from.clone(), aim, distance, model: 'static' as const, accelG, cosmic: null, course: null, homeOnArrival: null };

  if (drive === 'rocket') {
    const rocket = flipAndBurn(Math.max(distance, 1e-9), accel);
    const limit = opts.maxShipTimeYr;
    if (limit !== undefined && rocket.shipTime > limit * JULIAN_YEAR_S) {
      // Reach in ship time T: 4 sinh²(aT/4c) c²/a.
      const reach = 4 * Math.sinh((accel * limit * JULIAN_YEAR_S) / (4 * C_KM_S)) ** 2 * ((C_KM_S * C_KM_S) / accel);
      return { ok: false, refusal: { ...refusal('ship-time-limit', 'static', dest, distance, accelG, NaN, ''), maxKm: reach, maxShipTimeYr: limit } };
    }
    return {
      ok: true,
      plan: { ...base, drive, beta: rocket.peakBeta, warp: false, speed: rocket.peakBeta * C_KM_S, gamma: rocket.peakGamma, earthTime: rocket.earthTime, shipTime: rocket.shipTime, rocket },
    };
  }

  const warp = drive === 'warp';
  // Beyond c, γ = 1/√(1 − β²) is imaginary: proper time has no meaning for this fiction.
  const g = warp ? NaN : gamma(beta);
  const shipTime = warp ? NaN : hit.time / g;
  const limit = opts.maxShipTimeYr;
  if (!warp && limit !== undefined && shipTime > limit * JULIAN_YEAR_S)
    return { ok: false, refusal: { ...refusal('ship-time-limit', 'static', dest, distance, accelG, beta, ''), maxKm: beta * C_KM_S * g * limit * JULIAN_YEAR_S, maxShipTimeYr: limit } };
  return { ok: true, plan: { ...base, drive, beta, warp, speed: beta * C_KM_S, gamma: g, earthTime: hit.time, shipTime, rocket: null } };
}

/**
 * Plan a straight-line flight to `dest` from `from` (see planFlight). Null if unreachable, or if the
 * destination does not exist at this date (Voyager 1 before 1980).
 */
export function planTrip(dest: BodyId, beta: number, from: Vector3, time: AstroTime = sim.astroTime, drive: Drive = driveFor(beta), opts?: FlightOptions): TripPlan | null {
  const r = planFlight(dest, beta, from, time, drive, opts);
  return r.ok ? r.plan : null;
}

function refusal(reason: Refusal['reason'], model: SpaceModel, dest: BodyId, distanceKm: number, accelG: number, beta: number, detail: string): Refusal {
  return { reason, model, dest, distanceKm, horizonKm: NaN, maxKm: NaN, maxShipTimeYr: NaN, accelG, beta, aDep: 1, detail };
}

/** Most rounds of "where is it on arrival, so when does the ship arrive" (each shrinks the error by about v/c of the target's own speed). */
const AIM_ROUNDS = 8;

/**
 * A flight through the expanding universe (travelCosmic.ts), aimed at where the destination is on
 * arrival. The world frame holds proper positions at the clock's time, so the ship flies from its
 * comoving place at departure, q0 = p / a_dep, to the destination's on arrival, x / a_arr, with x its
 * position then: a galaxy carried by the expansion keeps its comoving place, but a member of a cluster,
 * anything held in the Local Group (the Milky Way and its stars, the planets on their orbits) and
 * anything that moves does not. When the ship arrives depends on how far it goes, and where the
 * destination is depends on when: the two are solved together, as solveInterceptReach does in static
 * space. The standoff is a proper distance on arrival.
 */
function planExpanding(
  dest: BodyId,
  beta: number,
  from: Vector3,
  time: AstroTime,
  standoff: number,
  ms: number,
  drive: Drive,
  accelG: number,
  maxShipTimeYr: number | undefined,
): FlightResult {
  const aDep = cosmicAt(ms).a;
  const q0 = from.clone().divideScalar(aDep);
  const cruiseBeta = drive === 'cruise' ? beta : undefined;
  const target = new Vector3();
  const dir = new Vector3();
  let aArr = aDep;
  let distance = 0;
  // Where the destination is `yr` after departure, and the comoving course to it less the standoff.
  const aimAt = (yr: number) => {
    const arrMs = ms + yr * JULIAN_YEAR_S * 1000;
    aArr = yr > 0 ? cosmicAt(arrMs).a : aDep;
    // Where it is then (a body with no place by then, such as a probe past its data, is aimed at where it was last).
    if (yr === 0 || bodyAvailability(dest, arrMs).available) bodyPositionAt(dest, yr > 0 ? time.AddDays(yr * 365.25) : time, target);
    dir.copy(target).divideScalar(aArr).sub(q0);
    distance = Math.max(0, dir.length() - standoff / aArr);
    dir.normalize();
  };
  const plan = () => planCosmicLeg({ chiMpc: distance / MPC_KM, aDep, accel: accelG * G0, cruiseBeta, maxShipTimeYr });
  let aimedYr = 0;
  aimAt(aimedYr);
  let r: CosmicResult = plan();
  for (let i = 0; i < AIM_ROUNDS && r.ok && r.leg.plan.cosmicTimeYr !== aimedYr; i++) {
    aimedYr = r.leg.plan.cosmicTimeYr;
    aimAt(aimedYr);
    r = plan();
  }
  if (!r.ok) {
    const u = r.unreachable;
    return {
      ok: false,
      refusal: {
        reason: u.reason,
        model: 'flrw',
        dest,
        distanceKm: u.targetChiMpc * MPC_KM,
        horizonKm: u.eventHorizonMpc * MPC_KM,
        maxKm: (u.maxChiMpc ?? NaN) * MPC_KM,
        maxShipTimeYr: u.maxShipTimeYr ?? maxShipTimeYr ?? NaN,
        accelG,
        beta: cruiseBeta ?? NaN,
        aDep,
        detail: u.message,
      },
    };
  }
  const p = r.leg.plan;
  // The aim: the standoff short of the destination as it is on arrival, along the course.
  if (p.cosmicTimeYr !== aimedYr) aimAt(p.cosmicTimeYr);
  const aim = target.clone().addScaledVector(dir, -standoff);
  const q1 = aim.clone().divideScalar(aArr);
  const peakBeta = Math.tanh(p.peakRapidity);
  const fromHome = q0.length() <= HOME_KM;
  const seen = fromHome ? null : homeSeenFrom(q1, Math.log(aArr));
  const homeOnArrival: HomeLight = seen
    ? { fromHome, inLocalGroup: seen.inLocalGroup, z: Math.expm1(seen.ln1pZ), afterDepartureYr: p.cosmicTimeYr - seen.lookbackYr }
    : { fromHome, inLocalGroup: false, z: p.home.redshift, afterDepartureYr: p.home.emissionAfterDepartureYr };
  return {
    ok: true,
    plan: {
      dest,
      drive,
      beta: drive === 'cruise' ? beta : peakBeta,
      warp: false,
      speed: (drive === 'cruise' ? beta : peakBeta) * C_KM_S,
      gamma: p.peakGamma,
      start: from.clone(),
      aim,
      distance,
      earthTime: p.cosmicTimeYr * JULIAN_YEAR_S,
      shipTime: p.shipTimeYr * JULIAN_YEAR_S,
      rocket: null,
      model: 'flrw',
      accelG,
      cosmic: r.leg,
      course: { q0, dir: dir.clone(), q1 },
      homeOnArrival,
    },
  };
}

/** Ship seconds per real second that play a trip in about TRIP_PLAYBACK_S, never slower than real time. */
export const defaultShipRate = (plan: Pick<TripPlan, 'shipTime'>): number =>
  Number.isFinite(plan.shipTime) ? Math.max(SHIP_RATE_MIN, plan.shipTime / TRIP_PLAYBACK_S) : SHIP_RATE_MIN;

/** Real seconds a plan takes to play at its default ship rate (NaN for warp, which follows the time warp). */
export const playbackSeconds = (plan: TripPlan): number => (plan.warp ? NaN : plan.shipTime / defaultShipRate(plan));

export function launch(plan: TripPlan): void {
  const pacing: TripPacing = plan.warp ? 'earth' : 'ship';
  travel.trip = {
    ...plan,
    startMs: sim.timeMs,
    dir: plan.course ? plan.course.dir.clone() : plan.aim.clone().sub(plan.start).normalize(),
    pacing,
    tau: plan.warp ? NaN : 0,
    t: 0,
    shipRate: defaultShipRate(plan),
    sample: { dtYr: 0, chiMpc: 0, u: 0, lnA: 0, lagMpc: 0 },
    sampleTau: NaN,
  };
  travel.shipPos.copy(plan.start);
  travel.lastArrival = null;
  // The trip sets the clock from here on: it no longer shows the present.
  sim.live = false;
}

// ─── The trip model: t(τ), τ(t), lag, state ──────────────────────────────────────────────

const YEAR_S = JULIAN_YEAR_S;
const cosmicNowScratch = cosmicAt(0);
/** Scratch sample for plans that are not under way (the planner's previews). */
const scratch: PlaybackSample = { dtYr: 0, chiMpc: 0, u: 0, lnA: 0, lagMpc: 0 };

/**
 * The expanding-universe plan at ship time τ (s, clamped to the trip): cubic Hermite interpolation of
 * its samples (physics/cosmology sampleAt), continuous through the flip. A trip under way keeps the
 * last sample, so the frame's several readers interpolate once.
 */
export function cosmicSampleAt(t: TripPlan, tau: number): PlaybackSample {
  const leg = t.cosmic!;
  const tc = Math.min(Math.max(tau, 0), t.shipTime);
  const trip = t as Partial<Trip>;
  if (trip.sample) {
    if (trip.sampleTau === tc) return trip.sample;
    trip.sampleTau = tc;
    return sampleAt(leg.plan.samples, tc / YEAR_S, trip.sample);
  }
  return sampleAt(leg.plan.samples, tc / YEAR_S, scratch);
}

/** Earth time at ship time τ (exact closed forms; the end maps to earthTime exactly). */
export function earthTimeAtTau(t: TripPlan, tau: number): number {
  if (t.warp) return NaN;
  if (tau >= t.shipTime) return t.earthTime;
  if (t.cosmic) return Math.min(t.earthTime, Math.max(0, cosmicSampleAt(t, tau).dtYr * YEAR_S));
  if (t.rocket) return earthTimeAtShipTime(t.rocket, tau);
  return Math.max(0, tau) * t.gamma;
}

/** Ship time at Earth time t (NaN for warp). */
export function tauAtEarthTime(t: TripPlan, elapsed: number): number {
  if (t.warp) return NaN;
  if (elapsed >= t.earthTime) return t.shipTime;
  if (t.cosmic) {
    // Cosmic time only grows with ship time: bisect (to a few ulp of the trip).
    let lo = 0;
    let hi = t.shipTime;
    for (let i = 0; i < 80 && hi - lo > 1e-15 * t.shipTime; i++) {
      const mid = 0.5 * (lo + hi);
      if (earthTimeAtTau(t, mid) < elapsed) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  if (t.rocket) return shipTimeAtEarthTime(t.rocket, elapsed);
  return Math.max(0, elapsed) / t.gamma;
}

/** t − τ at ship time τ, without cancellation (NaN for warp). */
export function lagAtTau(t: TripPlan, tau: number): number {
  if (t.warp) return NaN;
  const tc = Math.min(Math.max(tau, 0), t.shipTime);
  if (t.cosmic) {
    // Early in the first burn t − τ is a tiny difference of two nearly equal times: there the
    // special-relativistic form (c/a)(sinh φ − φ) holds to H t ≲ 10⁻¹⁰ and keeps every digit.
    const k = C_KM_S / (t.accelG * G0_KM_S2);
    if (tc < 0.1 * k && tc <= t.cosmic.plan.phases[0].endTauYr * YEAR_S) return k * sinhMinusX(tc / k);
    return Math.max(0, earthTimeAtTau(t, tc) - tc);
  }
  if (t.rocket) return flipAndBurnLag(t.rocket, tc);
  return tc * gammaMinusOne(t.beta);
}

/** Elapsed Sun-frame seconds since launch (clamped to the trip). */
export function tripElapsed(t: Trip): number {
  if (t.pacing === 'ship') return t.t;
  return Math.min(Math.max(0, (sim.timeMs - t.startMs) / 1000), t.earthTime);
}

/** Ship time elapsed on the trip so far (NaN for warp). */
export const tripShipTime = (t: Trip): number => (t.pacing === 'ship' ? t.tau : tauAtEarthTime(t, tripElapsed(t)));

/** Rapidity of a constant-speed cruise (NaN for the fictional warp, which has none). */
const cruiseRapidity = (t: TripPlan): number => (t.warp ? NaN : Math.atanh(t.beta));

/** Speed, γ, ship time and distance covered at Earth time `elapsed` into the trip. */
export function shipStateAt(t: TripPlan, elapsed: number): ShipState {
  if (t.cosmic) return shipStateAtTau(t, tauAtEarthTime(t, elapsed));
  if (t.rocket) {
    const s = flipAndBurnAtEarthTime(t.rocket, elapsed);
    return { beta: s.beta, gamma: s.gamma, phi: s.phi, tau: s.tau, covered: s.d };
  }
  return { beta: t.beta, gamma: t.gamma, phi: cruiseRapidity(t), tau: t.warp ? NaN : elapsed / t.gamma, covered: t.speed * elapsed };
}

/** The same at ship time τ (not for warp). */
export function shipStateAtTau(t: TripPlan, tau: number): ShipState {
  const tc = Math.min(Math.max(tau, 0), t.shipTime);
  if (t.cosmic) {
    if (tc >= t.shipTime) return { beta: 0, gamma: 1, phi: 0, tau: tc, covered: t.distance };
    const s = cosmicSampleAt(t, tc);
    // u = γβ relative to the galaxies passed; the rapidity is exact at any γ.
    const u = Math.max(0, s.u);
    const phi = Math.asinh(u);
    // Samples are in Mpc; this flight's own length maps the arrival exactly onto the aim.
    const covered = Math.min(t.distance, Math.max(0, s.chiMpc * (t.distance / t.cosmic.plan.chiMpc)));
    return { beta: Math.tanh(phi), gamma: Math.hypot(1, u), phi, tau: tc, covered };
  }
  if (t.rocket) {
    const s = flipAndBurnAt(t.rocket, tc);
    return { beta: s.beta, gamma: s.gamma, phi: s.phi, tau: tc, covered: s.d };
  }
  return { beta: t.beta, gamma: t.gamma, phi: cruiseRapidity(t), tau: tc, covered: t.speed * earthTimeAtTau(t, tc) };
}

/** The ship's state now: from τ on a ship-paced trip, from the Earth clock otherwise. */
export const tripState = (t: Trip): ShipState => (t.pacing === 'ship' ? shipStateAtTau(t, t.tau) : shipStateAt(t, tripElapsed(t)));

// ─── Playback ────────────────────────────────────────────────────────────────────────────

/**
 * Advance a ship-paced trip by `dtReal` real seconds and set the simulation clock from it.
 * Returns the Earth seconds that passed, or null when no ship-paced trip is under way (the
 * caller then runs the clock at the time warp).
 */
export function advanceTripClock(dtReal: number): number | null {
  const trip = travel.trip;
  if (!trip || trip.pacing !== 'ship') return null;
  const t0 = trip.t;
  if (dtReal > 0 && trip.tau < trip.shipTime) {
    trip.tau = Math.min(trip.shipTime, trip.tau + dtReal * trip.shipRate);
    trip.t = earthTimeAtTau(trip, trip.tau);
    sim.timeMs = trip.startMs + 1000 * trip.t;
    sim.timeCarryMs = 0;
  }
  return trip.t - t0;
}

/**
 * The ship's comoving place (km at a = 1) with `covered` of a flight through expanding space behind
 * it: q0 + dir χ, reckoned from the nearer end so that each end keeps its full precision.
 */
export function shipComovingAt(t: TripPlan, covered: number, out: Vector3): Vector3 {
  const c = t.course!;
  if (covered <= 0.5 * t.distance) return out.copy(c.q0).addScaledVector(c.dir, covered);
  return out.copy(c.q1).addScaledVector(c.dir, covered - t.distance);
}

/** Advance the ship along its course. Returns true on the frame it arrives. */
export function updateTrip(): boolean {
  const t = travel.trip;
  if (!t) return false;
  let s: ShipState;
  let arrived: boolean;
  if (t.pacing === 'ship') {
    s = shipStateAtTau(t, t.tau);
    arrived = t.tau >= t.shipTime;
  } else {
    t.t = tripElapsed(t);
    s = shipStateAt(t, t.t);
    arrived = t.t >= t.earthTime;
  }
  // Riding comoving space: a(t) times the comoving place, with a from the clock, as the galaxies have it.
  if (t.course) shipComovingAt(t, s.covered, travel.shipPos).multiplyScalar(cosmicAt(sim.timeMs, cosmicNowScratch).a);
  else travel.shipPos.copy(t.start).addScaledVector(t.dir, s.covered);
  if (arrived) {
    travel.lastArrival = {
      dest: t.dest,
      drive: t.drive,
      beta: t.beta,
      warp: t.warp,
      earthTime: t.earthTime,
      shipTime: t.shipTime,
      distance: t.distance,
      endMs: t.startMs + 1000 * t.earthTime,
      at: performance.now(),
      model: t.model,
      accelG: t.accelG,
      cosmic: t.cosmic,
      homeOnArrival: t.homeOnArrival,
    };
    travel.trip = null;
    const dest = sim.bodies[t.dest];
    if (dest) sim.ship.vel.copy(dest.vel);
    return true;
  }
  sim.ship.vel.copy(t.dir).multiplyScalar(s.beta * C_KM_S);
  return false;
}

export function jumpToArrival(): void {
  const t = travel.trip;
  if (!t) return;
  if (t.pacing === 'ship') {
    t.tau = t.shipTime;
    t.t = t.earthTime;
    sim.timeMs = t.startMs + 1000 * t.earthTime;
    sim.timeCarryMs = 0;
    return;
  }
  advanceTime(t.earthTime - tripElapsed(t) + 1e-3);
}

export function abortTrip(): void {
  travel.trip = null;
}

// ─── Ship rate ───────────────────────────────────────────────────────────────────────────

/** Set how many ship seconds pass per real second (ship-paced trips). Returns the rate applied, or null. */
export function setShipRate(rate: number): number | null {
  const t = travel.trip;
  if (!t || t.pacing !== 'ship' || !(rate > 0)) return null;
  // From real time on board up to the whole trip in one second.
  t.shipRate = Math.min(Math.max(SHIP_RATE_MIN, t.shipTime), Math.max(SHIP_RATE_MIN, rate));
  return t.shipRate;
}

/** Ten times faster or slower. */
export const stepShipRate = (dir: 1 | -1): number | null => (travel.trip ? setShipRate(travel.trip.shipRate * 10 ** dir) : null);

/** Slower or faster time, whichever clock is in charge: the ship rate on a real trip, the time warp otherwise. */
export function stepRate(dir: 1 | -1): void {
  if (travel.trip?.pacing === 'ship') stepShipRate(dir);
  else stepWarp(dir);
}

/** Back to the pace that plays the whole trip in about a minute. */
export const resetShipRate = (): number | null => (travel.trip ? setShipRate(defaultShipRate(travel.trip)) : null);

export interface TripPace {
  /** Ship seconds per real second (NaN for warp). */
  shipPerSecond: number;
  /** Earth seconds per real second right now (the ship rate times the current γ). */
  earthPerSecond: number;
  /** Real seconds left to arrival at this pace. */
  realSecondsLeft: number;
  /** "3.4 months" of ship time per real second ('' for warp). */
  onBoard: string;
  /** "12 years" of Earth time per real second. */
  atHome: string;
  /** "1 s here = 3.4 months on board; 12 years at home" */
  text: string;
}

/** How fast the trip is playing, in numbers and in words. */
export function tripPace(t: Trip, warp: number = sim.warp): TripPace {
  if (t.pacing !== 'ship') {
    const atHome = formatDurationShort(warp);
    const left = warp > 0 ? (t.earthTime - tripElapsed(t)) / warp : Infinity;
    return { shipPerSecond: NaN, earthPerSecond: warp, realSecondsLeft: left, onBoard: '', atHome, text: `1 s here = ${atHome} at home` };
  }
  const g = tripState(t).gamma;
  const earthPerSecond = t.shipRate * g;
  const onBoard = formatDurationShort(t.shipRate);
  const atHome = formatDurationShort(earthPerSecond);
  return {
    shipPerSecond: t.shipRate,
    earthPerSecond,
    realSecondsLeft: (t.shipTime - t.tau) / t.shipRate,
    onBoard,
    atHome,
    text: `1 s here = ${onBoard} on board; ${atHome} at home`,
  };
}

export const describeDest = (id: BodyId): string => bodyName(id);

// ─── Readings in expanding space ─────────────────────────────────────────────────────────

export interface CosmicReadings {
  /** The universe now, from the clock (sim/cosmicTime.ts): scale factor (1 today) and age, Gyr. */
  a: number;
  ageGyr: number;
  /** Distance left to the destination now, km: proper (the scale factor times the comoving distance). */
  properLeftKm: number;
  /** The same in comoving terms (the universe's size today), km. */
  comovingLeftKm: number;
  /**
   * Home as seen from the ship now: its light's expansion redshift z (what a galaxy here at rest would
   * see; 0 inside the Local Group, which does not expand) and ln(1 + z) and z as the crew sees them,
   * with the ship's own Doppler factor for light from home's direction, astern on the way out and ahead
   * on the way back (1 + z = (1 + z_expansion) / D; below 0, blueshifted).
   */
  homeZExpansion: number;
  homeLn1pZ: number;
  homeZ: number;
  /** When the light from home now reaching the ship left it: years after departure (below 0: before), on the home clock. */
  homeSeenAfterDepartureYr: number;
  /** The flight set out from home. */
  fromHome: boolean;
}

/** Within this of the Sun a departure is from home (the light-days make no difference to what is shown, years). */
export const HOME_KM = 0.01 * LIGHT_YEAR_KM;

const GYR_YR = 1e9;

/**
 * Home's light at comoving place `q` (km at a = 1) at ln a: ln(1 + z) of the expansion alone, and how
 * long ago it left home, years. Inside the Local Group (the proper position a q inside its
 * zero-velocity surface) space does not expand: no redshift, and the light is simply the light-time old.
 */
export function homeSeenFrom(q: Vector3, lnA: number): { ln1pZ: number; lookbackYr: number; inLocalGroup: boolean } {
  const a = Math.exp(lnA);
  const properKm = q.length() * a;
  if (insideLocalGroup(tmpHome.copy(q).multiplyScalar(a))) return { ln1pZ: 0, lookbackYr: properKm / LIGHT_YEAR_KM, inLocalGroup: true };
  const c = planck18();
  const span = c.emissionSpanLn(lnA, q.length() / MPC_KM / c.dH);
  return { ln1pZ: span, lookbackYr: c.tH * c.timeAfterLn(lnA - span, span) * GYR_YR, inLocalGroup: false };
}

const tmpHome = new Vector3();
const tmpK = new Vector3();

/** Readings of a flight through expanding space, now (null in static space). */
export function cosmicReadings(t: Trip): CosmicReadings | null {
  const leg = t.cosmic;
  if (!leg) return null;
  const now = cosmicAt(sim.timeMs);
  const st = tripState(t);
  const arrived = !(t.tau < t.shipTime);
  const left = Math.max(0, t.distance - st.covered);
  const fromHome = !!t.homeOnArrival?.fromHome;
  let lnExp: number;
  let afterYr: number;
  if (arrived && t.homeOnArrival) {
    lnExp = Math.log1p(t.homeOnArrival.z);
    afterYr = t.homeOnArrival.afterDepartureYr;
  } else if (fromHome) {
    // Set out from home: the module's view of the departure point, exact (from the light's lag, without cancellation).
    const s = cosmicSampleAt(t, Math.min(t.tau, t.shipTime));
    const h = homeViewAt(planck18(), Math.log(leg.plan.departure.scale), s.lnA, s.lagMpc);
    lnExp = h.ln1pZ;
    afterYr = h.emissionAfterDepartureYr;
  } else {
    const h = homeSeenFrom(shipComovingAt(t, st.covered, tmpHome), now.lnA);
    lnExp = h.ln1pZ;
    afterYr = earthTimeAtTau(t, st.tau) / YEAR_S - h.lookbackYr;
  }
  // The ship's Doppler factor for light from home: the light travels from home (the origin) to the
  // ship, along k = q/|q|; the ship moves along the course. 1/D = cosh φ − sinh φ cos ψ, written as
  // e^−φ + sinh φ (1 − cos ψ) with 1 − cos ψ = |k − v|²/2, exact however fast (home dead astern: e^−φ).
  let lnDoppler = 0;
  const phi = arrived ? 0 : st.phi;
  if (phi > 0) {
    const q = shipComovingAt(t, st.covered, tmpK);
    const len = q.length();
    const oneMinusCos = len > 0 ? q.divideScalar(len).sub(t.course!.dir).lengthSq() / 2 : 0;
    lnDoppler = -Math.log(Math.exp(-phi) + Math.sinh(phi) * oneMinusCos);
  }
  return {
    a: now.a,
    ageGyr: now.ageGyr,
    properLeftKm: now.a * left,
    comovingLeftKm: left,
    homeZExpansion: Math.expm1(lnExp),
    homeLn1pZ: lnExp + lnDoppler,
    homeZ: Math.expm1(lnExp + lnDoppler),
    homeSeenAfterDepartureYr: afterYr,
    fromHome,
  };
}
