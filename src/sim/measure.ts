/**
 * The instruments' readings, derived from the simulation state.
 *
 * Angles are measured from the apex, the direction of the observer's velocity through the
 * Sun's rest frame S. θ is a direction's angle in S (the "catalogue" angle), θ′ the angle in
 * the observer's frame S′ (where the light is actually seen). They are related by aberration,
 * and the light's Doppler factor is D = 1/(γ(1 − β cos θ′)).
 *
 * Near a black hole (wherever its gravity is modelled: sim/gravity.ts has a hole) the rest frame is
 * the local one, and the angles are the view observer's: the observer's motion is measured against
 * the observers hovering there (falling from rest far away, in a fall), gravity.relPhi and
 * relVelDir; θ is a direction's angle in that local frame (for a body, its primary image's direction
 * through the lens, sim/lensBodies.ts), θ′ as seen; the spectrometer's D carries the hole's
 * gravitational blueshift g of the light as well (for light from a source at rest far away in the
 * hole's own frame: at the moving stellar holes a source at rest in the Sun's frame differs by the
 * hole's Doppler factor, at most 0.19 %: Gaia BH3 moves 570 km/s relative to the Sun); a hole's angular diameter is its shadow's as the view
 * shows it (holeView). With no hole every reading is today's, bit for bit.
 */
import { Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { edgeAngle, lnGRain, type LensObserver } from '../physics/schwarzschild';
import { displayRadiusKm, getBody, type BodyId } from './bodies';
import { cosRestFromShip, cosShipFromRest, dopplerFromShipAngle, gamma } from '../physics/relativity';
import { gravity } from './gravity';
import { holeView, type HoleView } from './lensBodies';
import { sim } from './sim';

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

/** Observer speed as a fraction of c (Sun's frame; near a black hole, past the local observers). */
export const observerBeta = (): number =>
  gravity.hole ? Math.min(Math.tanh(gravity.relPhi), 0.999_999_999_999) : Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);

/** Unit vector of the observer's velocity (near a black hole, relative to the local observers), or null when (effectively) at rest. */
export function apexDirection(out = new Vector3()): Vector3 | null {
  if (gravity.hole) {
    if (!(Math.tanh(gravity.relPhi) * C_KM_S >= 1e-9)) return null;
    return out.copy(gravity.relVelDir);
  }
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

/**
 * Spectrometer at the reticle: θ′, the equivalent θ, and D. Null when at rest. Near a black hole D is the light's
 * whole frequency factor there: the kinematic one past the local observers times the hole's g (the hovering
 * observer's, −½ ln(1 − r_s/r) whatever the direction; the raindrop's by the light's local angle from the hole);
 * NaN where the reticle looks into the shadow (or, inside the horizon, the dark region), where no light from
 * outside arrives.
 */
export function reticleReading(): ApexGeometry | null {
  const apex = apexDirection(apexTmp);
  if (!apex) return null;
  const g = geometryFromShip(reticleDirection(fwd), observerBeta(), apex);
  if (gravity.hole) g.D *= Math.exp(lnGLocal(fwd, apex, g.thetaDeg));
  return g;
}

const plane = new Vector3();
const edgeObs: LensObserver = { frame: 'static', r: 0 };

/**
 * ln g of light seen in the local frame at angle thetaDeg from the apex, in the plane of the apex and the seen
 * direction `seen`: the hovering observer's (any direction; the motion is measured past them outside the horizon,
 * a fall included), or inside the horizon the raindrop's by the light's angle from the hole. NaN inside the
 * shadow's (or the dark region's) edge about the hole, where no light from outside arrives.
 */
function lnGLocal(seen: Vector3, apex: Vector3, thetaDeg: number): number {
  plane.copy(seen).addScaledVector(apex, -seen.dot(apex));
  const pl = plane.length();
  if (pl > 0) plane.divideScalar(pl);
  const th = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  // the light's direction in the local frame, and its angle from the hole's direction (from chords: exact at 0 and π)
  const lx = c * apex.x + s * plane.x;
  const ly = c * apex.y + s * plane.y;
  const lz = c * apex.z + s * plane.z;
  const h = gravity.camRelHoleKm;
  const hl = h.length();
  const ux = -h.x / hl;
  const uy = -h.y / hl;
  const uz = -h.z / hl;
  const a = 2 * Math.atan2(Math.hypot(lx - ux, ly - uy, lz - uz), Math.hypot(lx + ux, ly + uy, lz + uz));
  const inside = gravity.inside;
  edgeObs.frame = inside ? 'rain' : 'static';
  edgeObs.r = gravity.rM;
  if (a < edgeAngle(edgeObs)) return NaN;
  if (!inside) return gravity.x < 0.5 ? -0.5 * Math.log1p(-gravity.x) : -Math.log(gravity.alpha);
  return lnGRain(gravity.rM, a);
}

/**
 * Goniometer on a body: its catalogue angle θ (from its light-time-corrected position) and θ′. Near a black hole
 * θ is its primary image's direction in the local frame (through the lens; the hole's own direction for the hole).
 */
export function targetReading(id: BodyId): ApexGeometry | null {
  const apex = apexDirection(apexTmp);
  const b = sim.bodies[id];
  if (!apex || !b) return null;
  if (gravity.hole && b.lens && b.lens.count > 0) return geometryFromRest(rel.copy(b.lens.images[0].dirLens), observerBeta(), apex);
  if (gravity.hole && id === gravity.hole) rel.copy(gravity.camRelHoleKm).negate();
  else rel.copy(b.apparentPos).sub(sim.camera.pos);
  if (rel.lengthSq() === 0) return null;
  return geometryFromRest(rel.normalize(), observerBeta(), apex);
}

/** Rate of change of the range to a body, km/s (positive: receding), in S. */
export function rangeRate(id: BodyId): number {
  const b = sim.bodies[id];
  if (!b) return NaN;
  rel.copy(b.pos).sub(sim.camera.pos);
  const r = rel.length();
  if (r === 0) return 0;
  return (rel.dot(b.vel) - rel.dot(sim.ship.vel)) / r;
}

const hv = {} as HoleView;

/** Angular diameter of a body from the camera, degrees (a black hole's: its shadow's, as the view shows it). */
export function angularDiameterDeg(id: BodyId): number {
  const b = sim.bodies[id];
  const r = getBody(id);
  if (!b || !r) return NaN;
  if (r.kind === 'black-hole') {
    const v = holeView(id, hv);
    if (v) return 2 * v.shadowRadius * DEG;
  }
  const R = displayRadiusKm(r);
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
