/**
 * Adapters that plug data formats into the registry, and astronomy-engine's Galilean moons.
 *
 *  - jupiterMoonProvider: astronomy-engine's JupiterMoons() (Lieske's E5 theory), relative to
 *    Jupiter. Ready, but unused: the fitted models of the moons data (staging/phase2/moons.md)
 *    are ten to thirty times closer to JPL, and should replace it.
 *  - relativeOrbitProvider: any evaluator of a body's position relative to its centre as a
 *    function of TDB days (the fitted moon models: moonState for position and velocity in one
 *    pass, see moonState.ts, and moonRegime).
 *  - trackProvider: any trajectory whose samples are relative to a named centre that changes
 *    from piece to piece, with optional blends between two centres (the Chebyshev tracks of
 *    staging/phase2/tracks.md: Tracks.evalTrack and evalState return exactly this shape).
 *
 * The adapters are small interfaces, not the formats: the data modules stay where they are and
 * are wrapped in a line or two (see docs/bodies.md).
 */
import { JupiterMoons, type AstroTime, type JupiterMoonsInfo } from 'astronomy-engine';
import { AU_KM, DAY_S, OBLIQUITY_J2000_DEG } from '../../../physics/constants';
import { deltaTSeconds, utDaysSinceJ2000 } from '../../../lib/time';
import { ephemerisQuality } from '../../ephemerisPolicy';
import { heliocentricEclAt, heliocentricEclStateAt } from '../world';
import type { Availability, BodyId, PositionProvider, Regime, Vec3Like } from '../types';
import { ALWAYS } from './simple';

const EPS = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);
const AU_PER_DAY_TO_KM_S = AU_KM / DAY_S;

/** TT days since J2000 at a UTC time (ms), for availability checks against TDB spans (good to well under a second). */
export const ttDaysFromMs = (ms: number): number => {
  const ut = utDaysSinceJ2000(ms);
  return ut + deltaTSeconds(ut) / DAY_S;
};

/**
 * The same, remembered for the last time asked: every provider's availability is asked at the
 * frame's time, so the conversion (ΔT and all) is done once a frame rather than once a body.
 */
const ttMemo = { ms: NaN, tt: 0 };
function ttDaysAt(ms: number): number {
  if (ms !== ttMemo.ms) {
    ttMemo.ms = ms;
    ttMemo.tt = ttDaysFromMs(ms);
  }
  return ttMemo.tt;
}

// ─── astronomy-engine's Galilean moons ───────────────────────────────────────────────────

export type GalileanMoon = 'io' | 'europa' | 'ganymede' | 'callisto';

const jm = { time: null as AstroTime | null, info: null as JupiterMoonsInfo | null };
function jupiterMoons(time: AstroTime): JupiterMoonsInfo {
  if (jm.time !== time) {
    jm.info = JupiterMoons(time);
    jm.time = time;
  }
  return jm.info!;
}

const JM_REGIME: Record<'precise' | 'approximate' | 'illustrative', Availability> = {
  // Against JPL Horizons over 1981–2199 its errors reach 950 km (Io): approximate at best.
  precise: ALWAYS.approximate,
  approximate: ALWAYS.illustrative,
  illustrative: ALWAYS.illustrative,
};

/**
 * A Galilean moon relative to Jupiter (astronomy-engine JupiterMoons: jovicentric EQJ state,
 * rotated to the J2000 ecliptic).
 */
export function jupiterMoonProvider(moon: GalileanMoon): PositionProvider {
  return {
    label: 'Galilean moon theory (Lieske E5) via astronomy-engine',
    availability: (ms) => JM_REGIME[ephemerisQuality(ms)],
    positionAt(time, pos, vel) {
      const s = jupiterMoons(time)[moon];
      pos.x = s.x * AU_KM;
      pos.y = (COS_E * s.y + SIN_E * s.z) * AU_KM;
      pos.z = (-SIN_E * s.y + COS_E * s.z) * AU_KM;
      if (vel) {
        vel.x = s.vx * AU_PER_DAY_TO_KM_S;
        vel.y = (COS_E * s.vy + SIN_E * s.vz) * AU_PER_DAY_TO_KM_S;
        vel.z = (-SIN_E * s.vy + COS_E * s.vz) * AU_PER_DAY_TO_KM_S;
      }
    },
  };
}

// ─── Relative orbits (the fitted moon models) ────────────────────────────────────────────

/** A body's position relative to its centre as a function of time. */
export interface RelativeOrbitModel {
  /** Position at TDB days since J2000, J2000 ecliptic km, written into out[0], out[1], out[2]. */
  position(tdbDays: number, out: [number, number, number]): unknown;
  /**
   * Position and velocity together (velocity in `velocityUnit`), in one evaluation: used
   * whenever a velocity is wanted, which is every frame. Preferred to `velocity`, which for the
   * fitted moons is a central difference (two more evaluations of the whole series).
   */
  state?(tdbDays: number, pos: [number, number, number], vel: [number, number, number]): unknown;
  /** Velocity at TDB days since J2000, into out (units: `velocityUnit`). Numerical differences otherwise. */
  velocity?(tdbDays: number, out: [number, number, number]): unknown;
  /** How good the position is at that time. */
  regime(tdbDays: number): Regime;
}

export interface RelativeOrbitOptions {
  label?: string;
  /** Units of `velocity` (the fitted moon models give km/day). Default km/s. */
  velocityUnit?: 'km/s' | 'km/day';
  /** Half-step of the numerical velocity, days (default 10⁻³ d). */
  dtDays?: number;
}

/** A provider from a relative-orbit evaluator. Allocation-free if the evaluator is. */
export function relativeOrbitProvider(model: RelativeOrbitModel, opts: RelativeOrbitOptions = {}): PositionProvider {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];
  const velScale = opts.velocityUnit === 'km/day' ? 1 / DAY_S : 1;
  const h = opts.dtDays ?? 1e-3;
  return {
    label: opts.label ?? 'Orbit model fitted to JPL Horizons',
    availability: (ms) => ALWAYS[model.regime(ttDaysAt(ms))],
    positionAt(time, pos, vel) {
      const t = time.tt;
      if (vel && model.state) {
        model.state(t, a, b);
        pos.x = a[0];
        pos.y = a[1];
        pos.z = a[2];
        vel.x = b[0] * velScale;
        vel.y = b[1] * velScale;
        vel.z = b[2] * velScale;
        return;
      }
      if (vel) {
        if (model.velocity) {
          model.velocity(t, a);
          vel.x = a[0] * velScale;
          vel.y = a[1] * velScale;
          vel.z = a[2] * velScale;
        } else {
          model.position(t + h, a);
          model.position(t - h, b);
          const k = 1 / (2 * h * DAY_S);
          vel.x = (a[0] - b[0]) * k;
          vel.y = (a[1] - b[1]) * k;
          vel.z = (a[2] - b[2]) * k;
        }
      }
      model.position(t, a);
      pos.x = a[0];
      pos.y = a[1];
      pos.z = a[2];
    },
  };
}

// ─── Tracks with centres that change (the Chebyshev trajectories) ────────────────────────

/** One evaluation of a track: position relative to a named centre, and maybe a second centre being blended in. */
export interface TrackSample {
  /** km, J2000 ecliptic, relative to `centre`. */
  pos: ArrayLike<number>;
  /** km/s, when asked for. */
  vel?: ArrayLike<number>;
  centre: string;
  /** 'precise' | 'extrapolated' | 'before-launch' | 'unknown' (or any Regime). */
  regime: string;
  /** Inside a hand-over: the same body relative to another centre, and that one's weight (0–1). */
  blend?: { pos: ArrayLike<number>; vel?: ArrayLike<number>; centre: string; weight: number };
}

export interface TrackSource {
  /** Evaluate at TDB days since J2000 (with the velocity when `withVelocity`). */
  evaluate(tdbDays: number, withVelocity: boolean): TrackSample;
  /**
   * The regime at a date without evaluating the trajectory (availability is asked for every
   * body every frame): for the tracks, 'precise' inside `info(id).precise`, else the regime of
   * the `before` or `after` fallback. The default evaluates a sample and reads its regime.
   */
  regime?(tdbDays: number): string;
}

export interface TrackOptions {
  /** Body name for the interface ("New Horizons"). */
  name: string;
  /**
   * The registry body for each centre name the track uses. 'sun' is the origin and needs no
   * entry. 'ssb' (the Solar System barycentre) is resolved by `ssb` below. Note that the tracks
   * call the Pluto–Charon barycentre 'pluto': map it to 'pluto-barycentre'.
   */
  centres: Record<string, BodyId>;
  /**
   * Heliocentric J2000 ecliptic km of the Solar System barycentre (needed only for 'ssb'); its
   * velocity is neglected (13 m/s).
   */
  ssb?: (time: AstroTime, out: Vec3Like) => void;
  /** The body's own registry centre, when not the Sun (positions are returned relative to it). */
  selfCentre?: BodyId;
  /**
   * When the track is not modelled at a date, and why. The default reads the regime of a
   * sample: 'before-launch' and 'unknown' hide the body.
   */
  availability?: (ms: number) => Availability;
  label?: string;
}

const ZERO3 = [0, 0, 0] as const;

const TRACK_REGIME: Record<string, Regime> = {
  precise: 'precise',
  extrapolated: 'extrapolated',
  approximate: 'approximate',
  illustrative: 'illustrative',
};

/**
 * A provider from a track: resolves each sample's centre (and blend centre) through the
 * registry at the same time, and returns the position relative to the body's own centre.
 */
export function trackProvider(source: TrackSource, opts: TrackOptions): PositionProvider {
  const c1: Vec3Like = { x: 0, y: 0, z: 0 };
  const c2: Vec3Like = { x: 0, y: 0, z: 0 };
  const self: Vec3Like = { x: 0, y: 0, z: 0 };
  const c1v: Vec3Like = { x: 0, y: 0, z: 0 };
  const c2v: Vec3Like = { x: 0, y: 0, z: 0 };
  const selfV: Vec3Like = { x: 0, y: 0, z: 0 };
  const beforeLaunch: Availability = { available: false, reason: `${opts.name} had not been launched yet`, regime: 'unknown' };
  const unknown: Availability = { available: false, reason: `Where ${opts.name} is at this date is not known`, regime: 'unknown' };

  /** Heliocentric position (and velocity, when `outV` is given) of a named centre. */
  function centreAt(name: string, time: AstroTime, out: Vec3Like, outV: Vec3Like | null): void {
    if (outV) outV.x = outV.y = outV.z = 0;
    if (name === 'sun') {
      out.x = out.y = out.z = 0;
      return;
    }
    if (name === 'ssb') {
      if (!opts.ssb) throw new Error(`trackProvider(${opts.name}): the track uses 'ssb' but no ssb resolver was given`);
      opts.ssb(time, out);
      return;
    }
    const id = opts.centres[name];
    if (!id) throw new Error(`trackProvider(${opts.name}): no registry body for centre '${name}'`);
    if (outV) heliocentricEclStateAt(id, time, out, outV);
    else heliocentricEclAt(id, time, out);
  }

  return {
    label: opts.label ?? 'Chebyshev fit to JPL Horizons',
    availability:
      opts.availability ??
      ((ms) => {
        const t = ttDaysAt(ms);
        const r = source.regime ? source.regime(t) : source.evaluate(t, false).regime;
        if (r === 'before-launch') return beforeLaunch;
        if (r === 'unknown') return unknown;
        return ALWAYS[TRACK_REGIME[r] ?? 'approximate'];
      }),
    positionAt(time, pos, vel) {
      const s = source.evaluate(time.tt, !!vel);
      // Resolve the centres first: they may reuse scratch space the output points at.
      const wantV = !!vel;
      centreAt(s.centre, time, c1, wantV ? c1v : null);
      const w = s.blend ? s.blend.weight : 0;
      if (s.blend) centreAt(s.blend.centre, time, c2, wantV ? c2v : null);
      if (opts.selfCentre) {
        if (wantV) heliocentricEclStateAt(opts.selfCentre, time, self, selfV);
        else heliocentricEclAt(opts.selfCentre, time, self);
      } else self.x = self.y = self.z = selfV.x = selfV.y = selfV.z = 0;
      let x = c1.x + s.pos[0];
      let y = c1.y + s.pos[1];
      let z = c1.z + s.pos[2];
      if (s.blend && w > 0) {
        const b = s.blend.pos;
        x = (1 - w) * x + w * (c2.x + b[0]);
        y = (1 - w) * y + w * (c2.y + b[1]);
        z = (1 - w) * z + w * (c2.z + b[2]);
      }
      if (vel) {
        // Heliocentric velocity: the centre's plus the track's. The blend weight's own rate
        // is left out (hand-overs last days; the offsets they hide are a few hundred km).
        const v = s.vel ?? ZERO3;
        let vx = c1v.x + v[0];
        let vy = c1v.y + v[1];
        let vz = c1v.z + v[2];
        if (s.blend && w > 0) {
          const bv = s.blend.vel ?? ZERO3;
          vx = (1 - w) * vx + w * (c2v.x + bv[0]);
          vy = (1 - w) * vy + w * (c2v.y + bv[1]);
          vz = (1 - w) * vz + w * (c2v.z + bv[2]);
        }
        vel.x = vx - selfV.x;
        vel.y = vy - selfV.y;
        vel.z = vz - selfV.z;
      }
      pos.x = x - self.x;
      pos.y = y - self.y;
      pos.z = z - self.z;
    },
  };
}
