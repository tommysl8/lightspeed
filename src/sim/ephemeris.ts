/**
 * Body positions, velocities and orientations in the world frame (km, km/s), at any date.
 *
 * Which model applies when is set out in ephemerisPolicy.ts: astronomy-engine (VSOP87 planets,
 * a numerical Pluto, Brown's lunar theory and the IAU WGCCRE 2015 rotation models) in
 * 1700–2200; Standish's JPL Keplerian elements for the planets out to 3000 BCE–3000 CE; frozen
 * elements, a mean-element Moon and frozen poles beyond. Model changes are blended so that
 * positions and velocities stay continuous. Voyager 1 comes from voyager.ts.
 */
import {
  Body,
  GeoMoonState,
  HelioState,
  HelioVector,
  RotationAxis,
  type AstroTime,
} from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  AU_KM,
  BODIES,
  DAY_S,
  PROXIMA_DEC_DEG,
  PROXIMA_DISTANCE_KM,
  PROXIMA_RA_DEG,
  type BodyId,
} from '../physics/constants';
import { moonMeanLongitude, moonMeanState, newEclState, standishState, type MeanPlanet } from '../physics/meanElements';
import { astroTimeAt, msFromAstroTime, msFromCivil } from '../lib/time';
import { eclToWorld, eqjToWorld, raDecToWorld } from './frames';
import {
  APPROX_END_MS,
  APPROX_START_MS,
  moonBlend,
  orientationEdge,
  planetBlend,
  type Blend,
} from './ephemerisPolicy';
import { sim } from './sim';
import { voyagerHelioState } from './voyager';

export {
  ephemerisQuality,
  qualityNote,
  QUALITY_NOTES,
  PRECISE_START_MS,
  PRECISE_END_MS,
  APPROX_START_MS,
  APPROX_END_MS,
  type EphemerisQuality,
} from './ephemerisPolicy';

const ENGINE_BODY: Partial<Record<BodyId, Body>> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

/** Bodies placed on Standish's elements far from the present (Earth goes through the Earth–Moon barycentre). */
const MEAN_PLANET: Partial<Record<BodyId, MeanPlanet>> = {
  mercury: 'mercury',
  venus: 'venus',
  mars: 'mars',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
  pluto: 'pluto',
};

const AXIS_BODY: Partial<Record<BodyId, Body>> = {
  sun: Body.Sun,
  moon: Body.Moon,
  ...ENGINE_BODY,
};

const AU_PER_DAY_TO_KM_S = AU_KM / DAY_S;
/** Earth/Moon mass ratio, from the GMs in the body table (≈ 81.30). */
const EARTH_MOON_RATIO = BODIES.earth.gmKm3S2! / BODIES.moon.gmKm3S2!;
const CY_D = 36_525;

// ─── Availability ────────────────────────────────────────────────────────────────────────

/** Voyager 1's launch, 1977-09-05 12:56 UTC. [NASA/JPL] */
export const VOYAGER1_LAUNCH_MS = msFromCivil(1977, 9, 5, 12, 56);
/** Voyager 1's Saturn flyby, 1980-11-12 23:46 UTC: its modelled path (a solar hyperbola) starts here. */
export const VOYAGER1_MODEL_START_MS = msFromCivil(1980, 11, 12, 23, 46);

export interface Availability {
  available: boolean;
  /** Why not, in a sentence for the interface (null when available). */
  reason: string | null;
}

const AVAILABLE: Availability = { available: true, reason: null };
const V1_NOT_LAUNCHED: Availability = {
  available: false,
  reason: 'Voyager 1 had not been launched yet: it left Earth on 5 September 1977.',
};
const V1_NOT_MODELLED: Availability = {
  available: false,
  reason: 'Voyager 1 appears after its Saturn flyby on 12 November 1980; its path before that is not modelled.',
};

/**
 * Whether a body can be shown, picked and targeted at a simulation time. A body that is not
 * available is hidden from rendering, labels and picking, and cannot be flown to.
 */
export function bodyAvailability(id: BodyId, ms: number): Availability {
  if (id === 'voyager1') {
    if (ms < VOYAGER1_LAUNCH_MS) return V1_NOT_LAUNCHED;
    if (ms < VOYAGER1_MODEL_START_MS) return V1_NOT_MODELLED;
  }
  return AVAILABLE;
}

export const isBodyAvailable = (id: BodyId, ms: number = sim.timeMs): boolean => bodyAvailability(id, ms).available;

// ─── Positions ───────────────────────────────────────────────────────────────────────────

/**
 * Proxima Centauri: fixed at its catalogue position. Its proper motion (3.9″ a year) is ignored:
 * negligible for centuries, but some 5° by 3000 BCE and meaningless in deep time.
 */
const PROXIMA_POS = raDecToWorld(PROXIMA_RA_DEG, PROXIMA_DEC_DEG).multiplyScalar(PROXIMA_DISTANCE_KM);

const ecl = newEclState();
const pA = new Vector3();
const vA = new Vector3();
const pB = new Vector3();
const vB = new Vector3();
const moonP = new Vector3();
const moonV = new Vector3();
// The Moon has scratch vectors of its own: Earth's state needs it halfway through its own blend.
const mA = new Vector3();
const mvA = new Vector3();
const mB = new Vector3();
const mvB = new Vector3();
const moonBlendTmp: Blend = { w: 0, dw: 0 };
const moonEcl = newEclState();
const blendTmp: Blend = { w: 0, dw: 0 };

/** out = (1 − w)·a + w·b for positions; velocities also carry dw/dt·(b − a) so they stay the derivative. */
function mix(w: number, dw: number, pa: Vector3, va: Vector3 | null, pb: Vector3, vb: Vector3 | null, pos: Vector3, vel: Vector3 | null) {
  if (vel && va && vb) {
    vel.set(
      (1 - w) * va.x + w * vb.x + dw * (pb.x - pa.x),
      (1 - w) * va.y + w * vb.y + dw * (pb.y - pa.y),
      (1 - w) * va.z + w * vb.z + dw * (pb.z - pa.z),
    );
  }
  pos.set((1 - w) * pa.x + w * pb.x, (1 - w) * pa.y + w * pb.y, (1 - w) * pa.z + w * pb.z);
}

/** Geocentric Moon (world axes, km and km/s): astronomy-engine, fading into mean elements far from now. */
function moonGeoState(time: AstroTime, pos: Vector3, vel: Vector3 | null): void {
  const { w, dw } = moonBlend(msFromAstroTime(time), moonBlendTmp);
  if (w < 1) {
    const m = GeoMoonState(time);
    eqjToWorld(m.x * AU_KM, m.y * AU_KM, m.z * AU_KM, mA);
    eqjToWorld(m.vx * AU_PER_DAY_TO_KM_S, m.vy * AU_PER_DAY_TO_KM_S, m.vz * AU_PER_DAY_TO_KM_S, mvA);
    if (w === 0) {
      pos.copy(mA);
      vel?.copy(mvA);
      return;
    }
  }
  moonMeanState(time.tt / CY_D, moonEcl);
  eclToWorld(moonEcl.x, moonEcl.y, moonEcl.z, mB);
  eclToWorld(moonEcl.vx, moonEcl.vy, moonEcl.vz, mvB);
  if (w === 1) {
    pos.copy(mB);
    vel?.copy(mvB);
    return;
  }
  mix(w, dw, mA, mvA, mB, mvB, pos, vel);
}

/**
 * Heliocentric state of a planet (world axes). Earth needs the geocentric Moon, since Standish
 * gives the Earth–Moon barycentre.
 */
function planetState(id: BodyId, time: AstroTime, pos: Vector3, vel: Vector3 | null, moonGeo: Vector3 | null, moonGeoVel: Vector3 | null): void {
  const { w, dw } = planetBlend(msFromAstroTime(time), blendTmp);
  if (w < 1) {
    const body = ENGINE_BODY[id]!;
    if (vel) {
      const s = HelioState(body, time);
      eqjToWorld(s.x * AU_KM, s.y * AU_KM, s.z * AU_KM, pA);
      eqjToWorld(s.vx * AU_PER_DAY_TO_KM_S, s.vy * AU_PER_DAY_TO_KM_S, s.vz * AU_PER_DAY_TO_KM_S, vA);
    } else {
      const v = HelioVector(body, time);
      eqjToWorld(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM, pA);
    }
    if (w === 0) {
      pos.copy(pA);
      if (vel) vel.copy(vA);
      return;
    }
  }
  const T = time.tt / CY_D;
  standishState(id === 'earth' ? 'emb' : MEAN_PLANET[id]!, T, ecl);
  eclToWorld(ecl.x, ecl.y, ecl.z, pB);
  eclToWorld(ecl.vx, ecl.vy, ecl.vz, vB);
  if (id === 'earth') {
    // Earth sits opposite the Moon about the barycentre: E = EMB − r_Moon/(1 + M_E/M_M).
    let mg = moonGeo;
    let mv = moonGeoVel;
    if (!mg) {
      moonGeoState(time, moonP, vel ? moonV : null);
      mg = moonP;
      mv = moonV;
    }
    const k = 1 / (1 + EARTH_MOON_RATIO);
    pB.addScaledVector(mg, -k);
    if (vel && mv) vB.addScaledVector(mv, -k);
  }
  if (w === 1) {
    pos.copy(pB);
    if (vel) vel.copy(vB);
    return;
  }
  mix(w, dw, pA, vA, pB, vB, pos, vel);
}

/** Heliocentric world position of a body (km) at any time. Voyager and the Sun are handled too. */
export function bodyPositionAt(id: BodyId, time: AstroTime, out = new Vector3()): Vector3 {
  if (id === 'sun') return out.set(0, 0, 0);
  if (id === 'proxima') return out.copy(PROXIMA_POS);
  if (id === 'voyager1') return out.copy(voyagerHelioState(time).pos);
  if (id === 'moon') {
    moonGeoState(time, moonP, null);
    planetState('earth', time, out, null, moonP, null);
    return out.add(moonP);
  }
  planetState(id, time, out, null, null, null);
  return out;
}

// ─── Orientations ────────────────────────────────────────────────────────────────────────

interface FrozenAxis {
  ra: number;
  dec: number;
  spin: number;
  /** Spin rate at the edge, degrees per day. */
  rate: number;
  /** TT days since J2000 at the edge. */
  tt: number;
  /** The Moon's mean longitude at the edge (deg), which its spin follows beyond. */
  moonL: number;
}

/** Per side of the span (past, future), filled on first use. */
const frozenPast: Partial<Record<BodyId, FrozenAxis>> = {};
const frozenFuture: Partial<Record<BodyId, FrozenAxis>> = {};

/**
 * The rotation elements at an edge of 3000 BCE–3000 CE. Beyond, a pole direction held there
 * stays sensible; the IAU polynomials (and Earth's precession series) would wander off.
 */
function frozenAxis(id: BodyId, side: 1 | -1): FrozenAxis {
  const cache = side > 0 ? frozenFuture : frozenPast;
  let f = cache[id];
  if (!f) {
    const t0 = astroTimeAt(side > 0 ? APPROX_END_MS : APPROX_START_MS);
    const body = AXIS_BODY[id]!;
    const a0 = RotationAxis(body, t0);
    // 0.01 day is short enough that no body turns more than half a revolution in it.
    const t1 = t0.AddDays(0.01);
    const a1 = RotationAxis(body, t1);
    const dSpin = ((((a1.spin - a0.spin) % 360) + 540) % 360) - 180;
    f = { ra: a0.ra, dec: a0.dec, spin: a0.spin, rate: dSpin / (t1.tt - t0.tt), tt: t0.tt, moonL: moonMeanLongitude(t0.tt / CY_D) };
    cache[id] = f;
  }
  return f;
}

const axisTmp = { ra: 0, dec: 0, spin: 0 };

/** Pole (right ascension in hours, declination in degrees) and spin angle (degrees) of a body. */
function axisAt(id: BodyId, body: Body, time: AstroTime): { ra: number; dec: number; spin: number } {
  const side = orientationEdge(msFromAstroTime(time));
  if (side === 0) return RotationAxis(body, time);
  const f = frozenAxis(id, side);
  axisTmp.ra = f.ra;
  axisTmp.dec = f.dec;
  if (id === 'moon') {
    // Tidally locked: keep turning with the mean-element Moon so the near side faces Earth.
    axisTmp.spin = f.spin + ((moonMeanLongitude(time.tt / CY_D) - f.moonL) % 360);
  } else {
    const period = 360 / Math.abs(f.rate); // days per turn; the fmod keeps huge spans exact
    axisTmp.spin = f.spin + ((time.tt - f.tt) % period) * f.rate;
  }
  return axisTmp;
}

const xb = new Vector3();
const yb = new Vector3();
const zb = new Vector3();
const q = new Vector3();
const basis = new Matrix4();

/**
 * Orientation of a body-fixed frame in world axes, for a mesh whose local +X is the prime
 * meridian, local +Y the north pole and local −Z longitude 90°E (three.js SphereGeometry's
 * UV layout with an equirectangular map centred on longitude 0).
 *
 * IAU convention: pole at (α₀, δ₀); the prime meridian sits W degrees east of the node Q where
 * the body's equator crosses the ICRF equator, Q = (−sin α₀, cos α₀, 0).
 */
export function bodyOrientation(id: BodyId, time: AstroTime, out = new Quaternion()): Quaternion {
  const body = AXIS_BODY[id];
  if (!body) return out.identity();
  const axis = axisAt(id, body, time);
  const ra = (axis.ra * 15 * Math.PI) / 180;
  const dec = (axis.dec * Math.PI) / 180;
  const W = ((axis.spin % 360) * Math.PI) / 180;
  // In EQJ components:
  const zx = Math.cos(dec) * Math.cos(ra);
  const zy = Math.cos(dec) * Math.sin(ra);
  const zz = Math.sin(dec);
  const qx = -Math.sin(ra);
  const qy = Math.cos(ra);
  // x_b = Q cos W + (z × Q) sin W
  const cx = zy * 0 - zz * qy;
  const cy = zz * qx - zx * 0;
  const cz = zx * qy - zy * qx;
  const bx = qx * Math.cos(W) + cx * Math.sin(W);
  const by = qy * Math.cos(W) + cy * Math.sin(W);
  const bz = 0 * Math.cos(W) + cz * Math.sin(W);
  eqjToWorld(bx, by, bz, xb);
  eqjToWorld(zx, zy, zz, zb);
  yb.crossVectors(zb, xb); // 90°E in world
  // mesh local axes: +X → x_b, +Y → z_b (north), +Z → −y_b
  q.copy(yb).negate();
  basis.makeBasis(xb, zb, q);
  return out.setFromRotationMatrix(basis);
}

// ─── Per frame ───────────────────────────────────────────────────────────────────────────

const PLANETS = Object.keys(ENGINE_BODY).filter((id) => id !== 'earth') as BodyId[];
const AXIS_IDS = Object.keys(AXIS_BODY) as BodyId[];
const ALL_IDS = Object.keys(sim.bodies) as BodyId[];

/** Update positions, velocities, orientations and availability of every body for sim.astroTime. */
export function updateEphemeris(): void {
  const time = sim.astroTime;
  const ms = msFromAstroTime(time);
  const B = sim.bodies;

  B.sun.pos.set(0, 0, 0);
  B.sun.vel.set(0, 0, 0);

  moonGeoState(time, moonP, moonV);
  planetState('earth', time, B.earth.pos, B.earth.vel, moonP, moonV);
  B.moon.pos.copy(B.earth.pos).add(moonP);
  B.moon.vel.copy(B.earth.vel).add(moonV);
  for (const id of PLANETS) planetState(id, time, B[id].pos, B[id].vel, null, null);

  const v = voyagerHelioState(time);
  B.voyager1.pos.copy(v.pos);
  B.voyager1.vel.copy(v.vel);

  B.proxima.pos.copy(PROXIMA_POS);
  B.proxima.vel.set(0, 0, 0);

  for (const id of AXIS_IDS) bodyOrientation(id, time, B[id].quat);
  for (const id of ALL_IDS) B[id].present = bodyAvailability(id, ms).available;
}

/** Geocentric state of the Moon (km, km/s) in world axes. */
export function moonGeocentric(time: AstroTime): { r: Vector3; v: Vector3 } {
  const r = new Vector3();
  const v = new Vector3();
  moonGeoState(time, r, v);
  return { r, v };
}
