/**
 * Multiple-star systems from src/sim/stars/systems.json: barycentres in straight-line motion and
 * Kepler orbits (docs/data/stars.md §3.6 and §4.7).
 *
 * Each orbit links two groups of members ([A] and [B], or [A, B] and [Proxima]). The relative
 * position of group 2 about group 1 is r(t) = a [(cos E − e) p̂ + √(1−e²) sin E q̂] with
 * E − e sin E = 2π (JD − tPeriJD) / P. Members of group 1 are displaced by −m2/(m1+m2) r and
 * members of group 2 by +m1/(m1+m2) r. A member's position is the system barycentre plus the sum
 * of its displacements over all orbits (the hierarchical two-body approximation).
 *
 * Time. Visual orbits are fitted to what is seen from Earth, so their periastron times are
 * observed times. The functions below that say "seen from the Sun" evaluate the orbits at the
 * date itself, as the published ephemerides do; the app's registry (records.ts) places the stars
 * where they are, evaluating each orbit a light-time later (at t + d/c), so that the light-time
 * correction brings back exactly the published orbit seen from the Sun.
 */
import { AU_KM, AU_PER_PC, C_PC_PER_YR, JD_J2000, KMS_TO_PC_PER_YR } from './constants';
import type { Vec3 } from './frames';

export interface OrbitJson {
  id: string;
  primary: string[];
  secondary: string[];
  massPrimaryMsun: number;
  massSecondaryMsun: number;
  aAu: number;
  e: number;
  periodDays: number;
  tPeriJD: number;
  /** Unit vector toward periastron of the secondary group, J2000 ecliptic. */
  pHat: Vec3;
  /** Unit vector 90° ahead of pHat in the direction of motion, J2000 ecliptic. */
  qHat: Vec3;
  eclipticAngles: { iDeg: number; OmegaDeg: number; omegaDeg: number };
  source: string;
  published: Record<string, unknown>;
}

export interface SystemJson {
  id: string;
  name: string;
  note: string;
  members: string[];
  barycentre: { posPc: Vec3; velKms: Vec3; distancePc: number; massMsun: number; refs?: string[]; source?: string; [k: string]: unknown };
  orbits: OrbitJson[];
  checks: string[];
}

export interface StarJson {
  id: string;
  name: string;
  altNames: string[];
  system: string | null;
  catalogueIndex: number | null;
  hip: number | null;
  gaiaDr3: string | null;
  spectralType: string | null;
  catalogueDistancePc: number | null;
  massMsun?: number;
  massErr?: number;
  massMsunRange?: [number, number];
  radiusRsun?: number;
  radiusErr?: number;
  radiusPolarRsun?: number;
  teffK?: number;
  teffErr?: number;
  teffPolarK?: number;
  teffEquatorK?: number;
  luminosityLsun?: number;
  luminosityErr?: number;
  /** A distance the paper prefers to the catalogue's (Betelgeuse, Deneb, Polaris), pc. */
  distancePc?: number;
  vMag?: number;
  refs: Record<string, string>;
  notes?: string;
  [k: string]: unknown;
}

export interface SystemsFile {
  format: 'lightspeed.star-systems';
  version: number;
  refs: Record<string, string>;
  systems: SystemJson[];
  stars: StarJson[];
}

/** Solve Kepler's equation E − e sin E = M for 0 ≤ e < 1 (Newton, from a safe first guess). */
export function solveKepler(M: number, e: number): number {
  let m = M % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  if (m < -Math.PI) m += 2 * Math.PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-15) break;
  }
  return E;
}

/** Relative position (au) and velocity (km/s) of group 2 about group 1 at Julian date jd, J2000 ecliptic. */
export function orbitRelativeState(o: OrbitJson, jd: number): { posAu: Vec3; velKms: Vec3 } {
  const posAu: Vec3 = [0, 0, 0];
  const velKms: Vec3 = [0, 0, 0];
  orbitStateInto(o, jd, posAu, velKms);
  return { posAu, velKms };
}

/** orbitRelativeState without allocating: writes au and km/s into `pos` and `vel` (3 numbers each). */
export function orbitStateInto(o: OrbitJson, jd: number, pos: number[] | Float64Array, vel: number[] | Float64Array | null): void {
  const n = (2 * Math.PI) / o.periodDays;
  // The fmod keeps the phase exact over very long spans.
  const E = solveKepler(n * ((jd - o.tPeriJD) % o.periodDays), o.e);
  const cE = Math.cos(E);
  const sE = Math.sin(E);
  const b = Math.sqrt(1 - o.e * o.e);
  const x = o.aAu * (cE - o.e);
  const y = o.aAu * b * sE;
  const P = o.pHat;
  const Q = o.qHat;
  pos[0] = x * P[0] + y * Q[0];
  pos[1] = x * P[1] + y * Q[1];
  pos[2] = x * P[2] + y * Q[2];
  if (!vel) return;
  const Edot = n / (1 - o.e * cE);
  const k = AU_KM / 86_400; // au/day → km/s
  const vx = -o.aAu * sE * Edot * k;
  const vy = o.aAu * b * cE * Edot * k;
  vel[0] = vx * P[0] + vy * Q[0];
  vel[1] = vx * P[1] + vy * Q[1];
  vel[2] = vx * P[2] + vy * Q[2];
}

/**
 * Barycentre at Julian date jd. 'seen-from-sun' (default) moves the astrometric J2000 position,
 * like the catalogue; 'coordinate' adds the light-time term v·d/c: where it is at time jd.
 */
export function barycentreAt(sys: SystemJson, jd: number, mode: 'seen-from-sun' | 'coordinate' = 'seen-from-sun'): { posPc: Vec3; velKms: Vec3 } {
  const p = sys.barycentre.posPc;
  const v = sys.barycentre.velKms;
  let dtYr = (jd - JD_J2000) / 365.25;
  if (mode === 'coordinate') dtYr += Math.hypot(p[0], p[1], p[2]) / C_PC_PER_YR;
  const k = dtYr * KMS_TO_PC_PER_YR;
  return { posPc: [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k], velKms: [v[0], v[1], v[2]] };
}

function membersFrom(sys: SystemJson, bary: { posPc: Vec3; velKms: Vec3 }, jdOrbit: number): Map<string, { posPc: Vec3; velKms: Vec3 }> {
  const out = new Map<string, { posPc: Vec3; velKms: Vec3 }>();
  for (const id of sys.members) out.set(id, { posPc: [...bary.posPc], velKms: [...bary.velKms] });
  for (const o of sys.orbits) {
    const { posAu, velKms } = orbitRelativeState(o, jdOrbit);
    const m1 = o.massPrimaryMsun;
    const m2 = o.massSecondaryMsun;
    const apply = (ids: string[], f: number) => {
      for (const id of ids) {
        const st = out.get(id);
        if (!st) continue;
        for (let k = 0; k < 3; k++) {
          st.posPc[k] += (f * posAu[k]) / AU_PER_PC;
          st.velKms[k] += f * velKms[k];
        }
      }
    };
    apply(o.primary, -m2 / (m1 + m2));
    apply(o.secondary, m1 / (m1 + m2));
  }
  return out;
}

/**
 * Members as seen from the Sun at Julian date jd (pc, km/s, J2000 ecliptic, heliocentric):
 * consistent with the catalogue's astrometric positions. Orbits are evaluated at jd, as the
 * published ephemerides are.
 */
export function systemMembersAt(sys: SystemJson, jd: number): Map<string, { posPc: Vec3; velKms: Vec3 }> {
  return membersFrom(sys, barycentreAt(sys, jd), jd);
}

/**
 * Members where they are at coordinate time jd: the barycentre with its light-time term, and the
 * orbits a light-time (the barycentre's J2000 distance over c) later than jd, since their
 * elements describe what is seen from Earth. This is what the registry's providers give.
 */
export function systemMembersAtCoordinateTime(sys: SystemJson, jd: number): Map<string, { posPc: Vec3; velKms: Vec3 }> {
  return membersFrom(sys, barycentreAt(sys, jd, 'coordinate'), jd + orbitLightTimeDays(sys));
}

/** The light-time from a system's J2000 barycentre to the Sun, days: how far its orbits' observed phases lag where the stars are. */
export const orbitLightTimeDays = (sys: SystemJson): number => (Math.hypot(...sys.barycentre.posPc) / C_PC_PER_YR) * 365.25;

/**
 * Members as seen at Julian date jd by an observer at rest (heliocentric frame) at obs (pc,
 * ecliptic): the system at the emission time on the observer's past light cone of the barycentre.
 */
export function systemMembersSeenFrom(sys: SystemJson, obs: Readonly<Vec3>, jd: number): { members: Map<string, { posPc: Vec3; velKms: Vec3 }>; emittedJD: number } {
  const b = barycentreAt(sys, jd, 'coordinate');
  const v = b.velKms.map((x) => x * KMS_TO_PC_PER_YR) as Vec3;
  const a: Vec3 = [b.posPc[0] - obs[0], b.posPc[1] - obs[1], b.posPc[2] - obs[2]];
  const c = C_PC_PER_YR;
  const A = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - c * c;
  const B = 2 * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
  const C = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  const sYr = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A); // ≤ 0
  const te = jd + sYr * 365.25;
  return { members: systemMembersAtCoordinateTime(sys, te), emittedJD: te };
}

/** Orbital period in years and current phase (0 at periastron) of an orbit at Julian date jd. */
export function orbitPhase(o: OrbitJson, jd: number): { periodYr: number; phase: number } {
  const ph = ((((jd - o.tPeriJD) / o.periodDays) % 1) + 1) % 1;
  return { periodYr: o.periodDays / 365.25, phase: ph };
}

/** Points along an orbit's relative ellipse (au, ecliptic), sampled in eccentric anomaly (dense near periastron). */
export function orbitEllipse(o: OrbitJson, segments = 256): Vec3[] {
  const b = Math.sqrt(1 - o.e * o.e);
  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (2 * Math.PI * k) / segments;
    const x = o.aAu * (Math.cos(E) - o.e);
    const y = o.aAu * b * Math.sin(E);
    pts.push([x * o.pHat[0] + y * o.qHat[0], x * o.pHat[1] + y * o.qHat[1], x * o.pHat[2] + y * o.qHat[2]]);
  }
  return pts;
}
