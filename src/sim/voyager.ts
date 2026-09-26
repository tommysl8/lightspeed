/**
 * Voyager 1: a JPL Horizons barycentric state vector (2026-01-01 TDB) propagated as a
 * two-body hyperbola around the Solar System's total mass, then shifted to heliocentric
 * coordinates with the barycentre's offset from the Sun: astronomy-engine's in 1700–2200,
 * fading into one computed from Standish's elements for Jupiter–Neptune further off (see
 * ephemerisPolicy.ts). The model is only meaningful after the 1980 Saturn flyby; ephemeris.ts
 * hides the craft before then.
 */
import { Body, HelioVector, type AstroTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, BODIES, DAY_S, GM_SOLAR_SYSTEM_KM3_S2, GM_SUN_KM3_S2, J2000_JD, VOYAGER1_STATE } from '../physics/constants';
import { propagateTwoBody } from '../physics/kepler';
import { newEclState, standishState, type MeanPlanet } from '../physics/meanElements';
import { msFromAstroTime } from '../lib/time';
import { planetBlend, type Blend } from './ephemerisPolicy';
import { eclToWorld, eqjToWorld } from './frames';

const R0 = { x: VOYAGER1_STATE.r[0], y: VOYAGER1_STATE.r[1], z: VOYAGER1_STATE.r[2] };
const V0 = { x: VOYAGER1_STATE.v[0], y: VOYAGER1_STATE.v[1], z: VOYAGER1_STATE.v[2] };

const cache = { tt: NaN, pos: new Vector3(), vel: new Vector3() };
const ssb = new Vector3();
const ssbFar = new Vector3();
const blend: Blend = { w: 0, dw: 0 };
const ecl = newEclState();

/** The giant planets that set the barycentre (astronomy-engine uses the same four). */
const GIANTS = ['jupiter', 'saturn', 'uranus', 'neptune'] as const satisfies readonly MeanPlanet[];
const GIANT_GM = GIANTS.map((p) => BODIES[p].gmKm3S2!);
const GM_TOTAL = GM_SUN_KM3_S2 + GIANT_GM.reduce((a, b) => a + b, 0);

/** Seconds from the Horizons reference epoch to `time` (TT ≈ TDB to within 2 ms). */
export function secondsSinceVoyagerEpoch(time: AstroTime): number {
  return (time.tt + J2000_JD - VOYAGER1_STATE.epochJdTdb) * DAY_S;
}

/** Barycentric Voyager 1 state in the J2000 ecliptic frame (km, km/s). */
export function voyagerBarycentricEcl(time: AstroTime) {
  return propagateTwoBody(R0, V0, secondsSinceVoyagerEpoch(time), GM_SOLAR_SYSTEM_KM3_S2);
}

/** Position of the Solar System barycentre relative to the Sun, world axes, km. */
export function barycentreFromSun(time: AstroTime, out = new Vector3()): Vector3 {
  const { w } = planetBlend(msFromAstroTime(time), blend);
  if (w < 1) {
    const b = HelioVector(Body.SSB, time);
    eqjToWorld(b.x * AU_KM, b.y * AU_KM, b.z * AU_KM, out);
    if (w === 0) return out;
  }
  // Σ GMᵢ rᵢ / ΣGM with the Sun at the origin.
  ssbFar.set(0, 0, 0);
  const T = time.tt / 36_525;
  for (let i = 0; i < GIANTS.length; i++) {
    standishState(GIANTS[i], T, ecl);
    const k = GIANT_GM[i] / GM_TOTAL;
    ssbFar.x += k * ecl.x;
    ssbFar.y += k * ecl.y;
    ssbFar.z += k * ecl.z;
  }
  eclToWorld(ssbFar.x, ssbFar.y, ssbFar.z, ssbFar);
  return w === 1 ? out.copy(ssbFar) : out.lerp(ssbFar, w);
}

/** Heliocentric world-frame position and velocity of Voyager 1. */
export function voyagerHelioState(time: AstroTime): { pos: Vector3; vel: Vector3 } {
  if (time.tt === cache.tt) return cache;
  const { r, v } = voyagerBarycentricEcl(time);
  barycentreFromSun(time, ssb);
  eclToWorld(r.x, r.y, r.z, cache.pos).add(ssb);
  // The Sun's ~13 m/s barycentric velocity is negligible next to Voyager's 17 km/s.
  eclToWorld(v.x, v.y, v.z, cache.vel);
  cache.tt = time.tt;
  return cache;
}
