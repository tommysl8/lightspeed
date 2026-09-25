/**
 * The instruments' readings, derived from the simulation state.
 *
 * Angles are measured from the apex, the direction of the observer's velocity through the
 * Sun's rest frame S. θ is a direction's angle in S (the "catalogue" angle), θ′ the angle in
 * the observer's frame S′ (where the light is actually seen). They are related by aberration,
 * and the light's Doppler factor is D = 1/(γ(1 − β cos θ′)).
 */
import { Vector3 } from 'three';
import { BODIES, C_KM_S, type BodyId } from '../physics/constants';
import { cosRestFromShip, cosShipFromRest, dopplerFromShipAngle, gamma } from '../physics/relativity';
import { sim } from '../sim/sim';

const DEG = 180 / Math.PI;

export interface ApexGeometry {
  beta: number;
  gamma: number;
  /** Angle from the apex in S, degrees. */
  thetaDeg: number;
  /** Angle from the apex in S′ (as seen), degrees. */
  thetaShipDeg: number;
  /** Doppler factor ν_obs/ν_emit for a source at rest in S. */
  D: number;
}

const clampCos = (c: number) => Math.max(-1, Math.min(1, c));

/** Observer speed as a fraction of c (Sun's frame). */
export const observerBeta = (): number => Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);

/** Unit vector of the observer's velocity, or null when (effectively) at rest. */
export function apexDirection(out = new Vector3()): Vector3 | null {
  const v = sim.ship.vel.length();
  if (v < 1e-9) return null;
  return out.copy(sim.ship.vel).divideScalar(v);
}

/** Geometry for a direction given in S (unit vector). */
export function geometryFromRest(dirRest: Vector3, beta: number, apex: Vector3): ApexGeometry {
  const cosT = clampCos(dirRest.dot(apex));
  const cosS = clampCos(cosShipFromRest(cosT, beta));
  return {
    beta,
    gamma: gamma(beta),
    thetaDeg: Math.acos(cosT) * DEG,
    thetaShipDeg: Math.acos(cosS) * DEG,
    D: dopplerFromShipAngle(cosS, beta),
  };
}

/** Geometry for a viewing direction given in S′ (unit vector). */
export function geometryFromShip(dirShip: Vector3, beta: number, apex: Vector3): ApexGeometry {
  const cosS = clampCos(dirShip.dot(apex));
  const cosT = clampCos(cosRestFromShip(cosS, beta));
  return {
    beta,
    gamma: gamma(beta),
    thetaDeg: Math.acos(cosT) * DEG,
    thetaShipDeg: Math.acos(cosS) * DEG,
    D: dopplerFromShipAngle(cosS, beta),
  };
}

const fwd = new Vector3();
const apexTmp = new Vector3();
const rel = new Vector3();

/** The reticle (screen centre) direction, in the observer's frame. */
export function reticleDirection(out = new Vector3()): Vector3 {
  return out.set(0, 0, -1).applyQuaternion(sim.camera.quat);
}

/** Spectrometer at the reticle: θ′, the equivalent θ, and D. Null when at rest. */
export function reticleReading(): ApexGeometry | null {
  const apex = apexDirection(apexTmp);
  if (!apex) return null;
  return geometryFromShip(reticleDirection(fwd), observerBeta(), apex);
}

/** Goniometer on a body: its catalogue angle θ (from its light-time-corrected position) and θ′. */
export function targetReading(id: BodyId): ApexGeometry | null {
  const apex = apexDirection(apexTmp);
  if (!apex) return null;
  rel.copy(sim.bodies[id].apparentPos).sub(sim.camera.pos);
  if (rel.lengthSq() === 0) return null;
  return geometryFromRest(rel.normalize(), observerBeta(), apex);
}

/** Rate of change of the range to a body, km/s (positive: receding), in S. */
export function rangeRate(id: BodyId): number {
  const b = sim.bodies[id];
  rel.copy(b.pos).sub(sim.camera.pos);
  const r = rel.length();
  if (r === 0) return 0;
  return (rel.dot(b.vel) - rel.dot(sim.ship.vel)) / r;
}

/** Angular diameter of a body from the camera, degrees. */
export function angularDiameterDeg(id: BodyId): number {
  const b = sim.bodies[id];
  const R = BODIES[id].equatorialRadiusKm ?? BODIES[id].radiusKm;
  const d = b.distCamera;
  return d > R ? 2 * Math.asin(R / d) * DEG : 180;
}

/** Heliocentric ecliptic longitude and latitude of the camera, degrees. */
export function eclipticLonLat(p: Vector3): { lon: number; lat: number; r: number } {
  // world = (x_ecl, z_ecl, −y_ecl)
  const x = p.x;
  const y = -p.z;
  const z = p.y;
  const r = Math.hypot(x, y, z);
  if (r === 0) return { lon: 0, lat: 0, r: 0 };
  let lon = Math.atan2(y, x) * DEG;
  if (lon < 0) lon += 360;
  return { lon, lat: Math.asin(z / r) * DEG, r };
}
