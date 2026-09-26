/**
 * What an orbit line draws, as plain functions (Orbits.tsx draws it): which state and which
 * centre the conic comes from, the gravitational parameter of that conic, how far away it is
 * seen from, and the conic itself, computed without allocating (it runs for every line every
 * frame).
 */
import { Vector3 } from 'three';
import { GM_SUN_KM3_S2 } from '../physics/constants';
import type { Entry } from '../sim/bodies/registry';

export interface OrbitSource {
  /** The entry whose state relative to its centre is the orbit (the body, or its barycentre). */
  rel: Entry;
  /** What that state is measured from. */
  centre: Entry | null;
  /** What the orbit is seen around, for its size on screen. */
  view: Entry | null;
}

/**
 * The orbit to draw for a body: its state relative to what it orbits. A body placed on a
 * barycentre that itself orbits the body's parent (Pluto on the Pluto–Charon barycentre) is
 * drawn on the barycentre's orbit, the path of the system as a whole; otherwise the orbit is
 * about the body's centre (Charon about the barycentre). Written into `out`.
 */
export function orbitSource(e: Entry, out: OrbitSource): OrbitSource {
  const c = e.centre;
  if (c && c.isNode && c.parent === e.parent) {
    out.rel = c;
    out.centre = c.centre;
    out.view = e.parent;
  } else {
    out.rel = e;
    out.centre = c;
    out.view = e.parent && !e.parent.isNode ? e.parent : c;
  }
  return out;
}

/** GM of an entry, km³/s²: a barycentre's is its system's (its own record's, else its members' sum). */
export function systemGm(e: Entry): number {
  const own = e.record.physical.gmKm3S2;
  if (own !== undefined || !e.isNode) return own ?? 0;
  let sum = 0;
  for (const k of e.placed) sum += systemGm(k);
  return sum;
}

/**
 * GM of the two-body conic drawn for a body (km³/s²): the record's `orbitLine.muKm3S2`, else
 *  - about a barycentre (Charon about Pluto–Charon's): the orbit of a body at distance r from
 *    the barycentre under the pull of the rest of the system, whose centre of mass is on the
 *    far side: μ = (GM − GMᵢ)³ / GM², GM the system's (Charon: 691, not Pluto's 870);
 *  - about a body: the two masses, GM_centre + GM_self;
 *  - about a body of unknown mass (another star): from the record's orbit, 4π²a³/P², else a
 *    circular orbit through the body's present state (v²r). Only the Sun falls back to its own GM.
 */
export function orbitMu(e: Entry, src: OrbitSource): number {
  const spec = e.record.orbitLine;
  if (spec && spec.muKm3S2) return spec.muKm3S2;
  const c = src.centre;
  const self = systemGm(src.rel);
  if (c?.isNode) {
    const total = systemGm(c);
    if (total > 0 && total > self) {
      const rest = total - self;
      return (rest * rest * rest) / (total * total);
    }
  } else if (c) {
    let gmC = systemGm(c);
    if (!gmC && c.id === 'sun') gmC = GM_SUN_KM3_S2;
    if (gmC > 0) return gmC + self;
  }
  // Unknown masses: Kepler's third law from the record, else a circle through the body.
  const p = e.record.physical;
  if (p.semiMajorAxisKm && p.orbitalPeriodD) {
    const a = p.semiMajorAxisKm;
    const n = (2 * Math.PI) / (p.orbitalPeriodD * 86_400);
    return n * n * a * a * a;
  }
  const r = src.rel.rel.pos.length();
  const v2 = src.rel.rel.vel.lengthSq();
  return r > 0 && v2 > 0 ? v2 * r : GM_SUN_KM3_S2;
}

/**
 * Distance from the camera to what an orbit is seen around, km: a body's own camera distance,
 * or, for a barycentre (which has none), its position's. With no view entry, the Sun's.
 */
export function viewDistance(view: Entry | null, camera: Vector3, sunDistance: number): number {
  if (!view) return sunDistance;
  return view.isNode ? view.state.pos.distanceTo(camera) : view.state.distCamera;
}

/** Instanced segments of a line this wide on screen (px): fewer for small orbits. */
export function segmentsFor(sizePx: number): number {
  if (sizePx < 100) return 128;
  if (sizePx < 400) return 256;
  if (sizePx < 1500) return 512;
  return 1024;
}

/** |semi-major axis| from the vis-viva equation (km): cheap, for deciding whether a line shows at all. */
export function visVivaA(r: Vector3, v: Vector3, mu: number): number {
  const k = 2 / r.length() - v.lengthSq() / mu;
  return k !== 0 ? Math.abs(1 / k) : Infinity;
}

/** The parts of an osculating conic an orbit line needs (see physics/kepler.ts `Orbit`). */
export interface Conic {
  /** Semi-major axis, km (negative for a hyperbola). */
  a: number;
  /** Semi-minor axis, km (positive). */
  b: number;
  e: number;
  /** Unit vector towards periapsis, and 90° ahead of it along the motion. */
  P: Vector3;
  Q: Vector3;
  /** Present eccentric (or hyperbolic) anomaly, and mean anomaly. */
  anomaly: number;
  meanAnomaly: number;
  /** rad/s */
  meanMotion: number;
  hyperbolic: boolean;
}

export const makeConic = (): Conic => ({
  a: 1,
  b: 1,
  e: 0,
  P: new Vector3(1, 0, 0),
  Q: new Vector3(0, 0, -1),
  anomaly: 0,
  meanAnomaly: 0,
  meanMotion: 0,
  hyperbolic: false,
});

const h = new Vector3();
const eVec = new Vector3();

/**
 * Osculating conic from position r (km) and velocity v (km/s) relative to the centre, into
 * `out`: the same numbers as physics/kepler.ts stateToOrbit, without allocating.
 */
export function conicFromState(r: Vector3, v: Vector3, mu: number, out: Conic): Conic {
  const rm = r.length();
  const v2 = v.lengthSq();
  const rv = r.dot(v);
  h.crossVectors(r, v).normalize(); // W
  eVec.copy(r).multiplyScalar(v2 - mu / rm).addScaledVector(v, -rv).multiplyScalar(1 / mu);
  const e = eVec.length();
  const energy = v2 / 2 - mu / rm;
  const a = -mu / (2 * energy);
  const hyperbolic = e >= 1;
  if (e > 1e-10) out.P.copy(eVec).multiplyScalar(1 / e);
  else out.P.copy(r).normalize();
  out.Q.crossVectors(h, out.P).normalize();
  const nu = Math.atan2(r.dot(out.Q), r.dot(out.P));
  let anomaly: number;
  let meanAnomaly: number;
  let b: number;
  if (!hyperbolic) {
    anomaly = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    meanAnomaly = anomaly - e * Math.sin(anomaly);
    b = a * Math.sqrt(1 - e * e);
  } else {
    anomaly = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    meanAnomaly = e * Math.sinh(anomaly) - anomaly;
    b = Math.abs(a) * Math.sqrt(e * e - 1);
  }
  out.a = a;
  out.b = b;
  out.e = e;
  out.anomaly = anomaly;
  out.meanAnomaly = meanAnomaly;
  out.meanMotion = Math.sqrt(mu / Math.abs(a) ** 3);
  out.hyperbolic = hyperbolic;
  return out;
}
