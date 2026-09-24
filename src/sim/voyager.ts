/**
 * Voyager 1: a JPL Horizons barycentric state vector (2026-01-01 TDB) propagated as a
 * two-body hyperbola around the Solar System's total mass, then shifted to heliocentric
 * coordinates with astronomy-engine's barycentre offset.
 */
import { Body, HelioVector, type AstroTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, DAY_S, GM_SOLAR_SYSTEM_KM3_S2, J2000_JD, VOYAGER1_STATE } from '../physics/constants';
import { propagateTwoBody } from '../physics/kepler';
import { eclToWorld, eqjToWorld } from './frames';

const R0 = { x: VOYAGER1_STATE.r[0], y: VOYAGER1_STATE.r[1], z: VOYAGER1_STATE.r[2] };
const V0 = { x: VOYAGER1_STATE.v[0], y: VOYAGER1_STATE.v[1], z: VOYAGER1_STATE.v[2] };

const cache = { tt: NaN, pos: new Vector3(), vel: new Vector3() };
const ssb = new Vector3();

/** Seconds from the Horizons reference epoch to `time` (TT ≈ TDB to within 2 ms). */
export function secondsSinceVoyagerEpoch(time: AstroTime): number {
  return (time.tt + J2000_JD - VOYAGER1_STATE.epochJdTdb) * DAY_S;
}

/** Barycentric Voyager 1 state in the J2000 ecliptic frame (km, km/s). */
export function voyagerBarycentricEcl(time: AstroTime) {
  return propagateTwoBody(R0, V0, secondsSinceVoyagerEpoch(time), GM_SOLAR_SYSTEM_KM3_S2);
}

/** Heliocentric world-frame position and velocity of Voyager 1. */
export function voyagerHelioState(time: AstroTime): { pos: Vector3; vel: Vector3 } {
  if (time.tt === cache.tt) return cache;
  const { r, v } = voyagerBarycentricEcl(time);
  // Barycentre relative to the Sun (EQJ, au) → world km.
  const b = HelioVector(Body.SSB, time);
  eqjToWorld(b.x * AU_KM, b.y * AU_KM, b.z * AU_KM, ssb);
  eclToWorld(r.x, r.y, r.z, cache.pos).add(ssb);
  // The Sun's ~13 m/s barycentric velocity is negligible next to Voyager's 17 km/s.
  eclToWorld(v.x, v.y, v.z, cache.vel);
  cache.tt = time.tt;
  return cache;
}
