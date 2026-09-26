// Kepler orbits of the S-stars around Sgr A*, with an optional Schwarzschild (1PN) periapsis advance.
// Data: staging/galaxy/sstars.json (GRAVITY Collaboration 2022).
//
// Frames and units
//   sky frame at Sgr A*: x = east (Delta RA cos Dec), y = north, z = away from the observer (au or arcsec).
//   Epochs t: decimal Julian years at the observer (2000.0 + (JD - 2451545) / 365.25).
//   Radial velocity = dz/dt, km/s, positive = receding. Relativistic redshift terms are not included.
//
// Conversions to the app's frames use frames.ts (sky frame -> ICRS -> galactic / ecliptic / world).

import { apply, ECL_TO_GAL, ICRS_TO_GAL, transpose, type Vec3 } from './frames.ts';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
/** Gaussian gravitational constant squared: G M_sun in au^3 / day^2 (IAU 2012 value of k = 0.01720209895). */
const GM_SUN_AU3_DAY2 = 0.01720209895 ** 2;
const DAYS_PER_JULIAN_YEAR = 365.25;
const AU_KM = 149597870.7;
const C_KM_S = 299792.458;
/** G M_sun in au^3 / yr^2 (Julian year). */
export const GM_SUN_AU3_YR2 = GM_SUN_AU3_DAY2 * DAYS_PER_JULIAN_YEAR ** 2;
/** Speed of light in au / yr. */
const C_AU_YR = (C_KM_S * 86400 * DAYS_PER_JULIAN_YEAR) / AU_KM;

export interface SStarJson {
  id: string;
  ref: string;
  potential: string;
  tOsc?: number;
  a: number; // arcsec
  e: number;
  i: number; // deg
  Omega: number; // deg
  omega: number; // deg
  tPeri: number; // decimal year
  P: number | null; // yr, null -> from Kepler's third law
  mK?: number;
  spectralType?: string;
  note?: string;
}

export interface SStarsJson {
  blackHole: { mass: { value: number }; distance: { value: number }; icrs: { raDeg: number; decDeg: number } };
  potentials: Record<string, { R0pc: number; mass: number }>;
  stars: SStarJson[];
}

export interface Orbit {
  id: string;
  aAu: number;
  aArcsec: number;
  e: number;
  i: number; // rad
  Omega: number; // rad
  omega: number; // rad
  tPeri: number;
  P: number; // yr
  mass: number; // M_sun of the potential
  R0pc: number;
  tOsc: number;
  /** Schwarzschild periapsis advance per orbit (rad) for f_SP = 1. */
  dOmegaGR: number;
}

export function makeOrbit(star: SStarJson, pot: { R0pc: number; mass: number }): Orbit {
  const aAu = star.a * pot.R0pc;
  const gm = GM_SUN_AU3_YR2 * pot.mass;
  const P = star.P ?? TWO_PI * Math.sqrt(aAu ** 3 / gm);
  const dOmegaGR = (6 * Math.PI * gm) / (C_AU_YR ** 2 * aAu * (1 - star.e ** 2));
  return {
    id: star.id,
    aAu,
    aArcsec: star.a,
    e: star.e,
    i: star.i * DEG,
    Omega: star.Omega * DEG,
    omega: star.omega * DEG,
    tPeri: star.tPeri,
    P,
    mass: pot.mass,
    R0pc: pot.R0pc,
    tOsc: star.tOsc ?? star.tPeri,
    dOmegaGR,
  };
}

export function loadOrbits(json: SStarsJson): Orbit[] {
  return json.stars.map((s) => {
    const pot = json.potentials[s.potential];
    if (!pot) throw new Error(`unknown potential ${s.potential} for ${s.id}`);
    return makeOrbit(s, pot);
  });
}

/** Solve Kepler's equation E - e sin E = M (elliptic, 0 <= e < 1) to ~1e-14. */
export function solveKepler(M: number, e: number): number {
  // Reduce M to [-pi, pi].
  let m = M - TWO_PI * Math.round(M / TWO_PI);
  // Danby's starting value E0 = M + 0.85 e sign(sin M) converges for every 0 <= e < 1.
  let E = m + 0.85 * e * (Math.sin(m) >= 0 ? 1 : -1);
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const fpp = e * Math.sin(E);
    // Halley step
    const dE = -f / (fp - (0.5 * f * fpp) / fp);
    E += dE;
    if (Math.abs(dE) < 1e-15) break;
  }
  return E;
}

/** Orbit number k and mean anomaly in [-pi, pi) at epoch t (pericentre passages at tPeri + k P). */
function phase(o: Orbit, t: number): { k: number; M: number } {
  const x = (t - o.tPeri) / o.P;
  const k = Math.floor(x + 0.5);
  return { k, M: TWO_PI * (x - k) };
}

function trueAnomaly(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/** Cumulative true anomaly (rad), zero at the pericentre tPeri. */
export function cumulativeAnomaly(o: Orbit, t: number): number {
  const { k, M } = phase(o, t);
  return TWO_PI * k + trueAnomaly(solveKepler(M, o.e), o.e);
}

export interface OrbitOptions {
  /** Scale of the Schwarzschild precession: 0 = Newtonian Kepler orbit (default), 1 = general relativity. */
  fSP?: number;
}

export interface OrbitState {
  /** Position in the sky frame (au): east, north, away from observer. */
  posAu: Vec3;
  /** Velocity in the sky frame (km/s). */
  velKms: Vec3;
  /** Sky offset from Sgr A* (arcsec): [Delta RA cos Dec (east), Delta Dec (north)]. */
  offsetArcsec: [number, number];
  /** Radial velocity (km/s), positive = receding. */
  radialVelocityKms: number;
  /** Distance from Sgr A* (au). */
  rAu: number;
  /** Speed (km/s). */
  speedKms: number;
  /** True anomaly (rad, -pi..pi). */
  nu: number;
  /** Argument of pericentre actually used (rad). */
  omegaUsed: number;
}

export function orbitState(o: Orbit, t: number, opts: OrbitOptions = {}): OrbitState {
  const fSP = opts.fSP ?? 0;
  const { M } = phase(o, t);
  const E = solveKepler(M, o.e);
  const nu = trueAnomaly(E, o.e);
  let omega = o.omega;
  if (fSP !== 0) {
    const phi = cumulativeAnomaly(o, t);
    const phiRef = cumulativeAnomaly(o, o.tOsc);
    omega += (fSP * o.dOmegaGR * (phi - phiRef)) / TWO_PI;
  }
  const r = o.aAu * (1 - o.e * Math.cos(E));
  const u = omega + nu;
  const cO = Math.cos(o.Omega), sO = Math.sin(o.Omega), ci = Math.cos(o.i), si = Math.sin(o.i);
  const cu = Math.cos(u), su = Math.sin(u);
  const pos: Vec3 = [
    r * (cu * sO + su * cO * ci),
    r * (cu * cO - su * sO * ci),
    r * su * si,
  ];
  // Velocity: d/dt of the above with dr/dt and du/dt from the Kepler orbit.
  const gm = GM_SUN_AU3_YR2 * o.mass;
  const p = o.aAu * (1 - o.e * o.e);
  const h = Math.sqrt(gm * p); // au^2/yr
  const rdot = (h / p) * o.e * Math.sin(nu); // au/yr
  const udot = h / (r * r); // rad/yr
  const dpos: Vec3 = [
    rdot * (cu * sO + su * cO * ci) + r * udot * (-su * sO + cu * cO * ci),
    rdot * (cu * cO - su * sO * ci) + r * udot * (-su * cO - cu * sO * ci),
    rdot * su * si + r * udot * cu * si,
  ];
  const kms = AU_KM / (DAYS_PER_JULIAN_YEAR * 86400);
  const vel: Vec3 = [dpos[0] * kms, dpos[1] * kms, dpos[2] * kms];
  return {
    posAu: pos,
    velKms: vel,
    offsetArcsec: [pos[0] / o.R0pc, pos[1] / o.R0pc],
    radialVelocityKms: vel[2],
    rAu: r,
    speedKms: Math.hypot(vel[0], vel[1], vel[2]),
    nu,
    omegaUsed: omega,
  };
}

/**
 * Unit vectors of the sky frame at the given ICRS direction, in ICRS components:
 * east = (-sin a, cos a, 0), north = (-sin d cos a, -sin d sin a, cos d), away = (cos d cos a, cos d sin a, sin d).
 */
export function skyBasisIcrs(raDeg: number, decDeg: number): { east: Vec3; north: Vec3; away: Vec3 } {
  const a = raDeg * DEG, d = decDeg * DEG;
  return {
    east: [-Math.sin(a), Math.cos(a), 0],
    north: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
    away: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)],
  };
}

/** Sky-frame vector (any unit) -> ICRS components. */
export function skyToIcrs(v: Vec3, raDeg: number, decDeg: number): Vec3 {
  const { east, north, away } = skyBasisIcrs(raDeg, decDeg);
  return [
    v[0] * east[0] + v[1] * north[0] + v[2] * away[0],
    v[0] * east[1] + v[1] * north[1] + v[2] * away[1],
    v[0] * east[2] + v[1] * north[2] + v[2] * away[2],
  ];
}

/** Sky-frame vector -> heliocentric galactic axes (same unit). Add the Sgr A* position for absolute coordinates. */
export function skyToGalactic(v: Vec3, raDeg: number, decDeg: number): Vec3 {
  return apply(ICRS_TO_GAL, skyToIcrs(v, raDeg, decDeg));
}

/** Sky-frame vector -> the app's world axes (world = (x_ecl, z_ecl, -y_ecl)), same unit. */
export function skyToWorld(v: Vec3, raDeg: number, decDeg: number): Vec3 {
  const ecl = apply(transpose(ECL_TO_GAL), skyToGalactic(v, raDeg, decDeg));
  return [ecl[0], ecl[2], -ecl[1]];
}
