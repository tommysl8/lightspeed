// What a traveller sees: for an observer at scale factor a_o and a comoving galaxy at comoving distance
// chi (a = 1 today), the light arriving now left when eta(a_e) = eta(a_o) - chi (flat FLRW: light moves on
// straight lines in comoving coordinates, one unit of comoving distance per unit of conformal time).
//
//   1 + z_cos = a_o / a_e                  cosmological redshift
//   D_A = a_e chi,  D_L = a_o^2 chi / a_e  angular-diameter and luminosity distance (flat)
//   bolometric surface brightness  ~ (1 + z)^-4 (Tolman)
//
// The ship moves through the local comoving frame with rapidity w along unit vector v. A photon arriving
// from direction n (unit vector towards the source, comoving frame) is Doppler shifted by
//   D = gamma (1 + beta n.v) = [e^w (1 + n.v) + e^-w (1 - n.v)] / 2        (no cancellation at any w)
// and appears in direction
//   n' = [n + ((cosh w - 1) n.v + sinh w) v] / D,
// evaluated as n' = (n - (n.v) v) / D + cos' v with cos' from aberrateCos (no cancellation behind the ship).
// The two effects multiply: nu_obs / nu_emit = D / (1 + z_cos); a black body at T is seen at T D/(1+z);
// bolometric intensity scales as (D/(1+z))^4 and a point source's flux as D^2 L / (4 pi D_L^2).
//
// Comoving directions are also the directions a comoving observer at the ship sees, because null
// geodesics of flat FLRW are straight lines in comoving Cartesian coordinates (the metric is conformally
// flat); only the ship's own motion aberrates them.

import { Cosmology } from './cosmology.ts';
import { MPC_M } from './constants.ts';

/** Redshift of the last scattering surface, z_* = 1089.80 +- 0.21 (Planck 2018, table 2). */
export const Z_RECOMBINATION = 1089.8;

export type Vec3 = [number, number, number];

export interface Appearance {
  visible: boolean;
  /** Why not visible: outside the particle horizon, or emitted before the universe became transparent. */
  hidden?: 'beyond-particle-horizon' | 'before-last-scattering';
  aEmit: number;
  /** Cosmic time of emission and light-travel (lookback) time, Gyr. */
  emitTimeGyr: number;
  lookbackGyr: number;
  /** Cosmological redshift a_o/a_e - 1. */
  z: number;
  angularDiameterDistanceMpc: number;
  luminosityDistanceMpc: number;
  /** Proper distance to the galaxy now (a_o chi) and when the light left (a_e chi), Mpc. */
  properDistanceNowMpc: number;
  properDistanceThenMpc: number;
  /** Ship Doppler factor D (1 for a comoving observer). */
  doppler: number;
  /** nu_observed / nu_emitted = D / (1 + z). */
  frequencyRatio: number;
  /** Bolometric surface-brightness factor (D/(1+z))^4. */
  surfaceBrightnessFactor: number;
  /** Point-source bolometric flux per unit luminosity, W/m^2 per W: D^2 / (4 pi D_L^2). */
  fluxPerLuminosity: number;
  /** cos of the angle between the apparent direction and the ship's velocity (ship frame). */
  cosShip: number;
}

/** Doppler factor gamma(1 + beta cos) from rapidity, exact at any speed. */
export function dopplerFromRapidity(w: number, cosRest: number): number {
  return 0.5 * (Math.exp(w) * (1 + cosRest) + Math.exp(-w) * (1 - cosRest));
}

/** Aberration of the direction towards a source: rest (comoving) frame cos -> ship frame cos. */
export function aberrateCos(w: number, cosRest: number): number {
  const num = 0.5 * (Math.exp(w) * (1 + cosRest) - Math.exp(-w) * (1 - cosRest));
  return num / dopplerFromRapidity(w, cosRest);
}

/**
 * Aberrate a unit direction n (towards the source) for a ship with rapidity w along unit vector v.
 * The component along v is replaced by the aberrated cosine (aberrateCos, exact at any speed) and the
 * perpendicular part is scaled by 1/D, so there is no cancellation anywhere, including directly behind
 * the ship (n = -v, where home lies on a radial trip): that direction maps to exactly -v.
 */
export function aberrateDirection(n: Vec3, v: Vec3, w: number): Vec3 {
  const c = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const D = dopplerFromRapidity(w, c);
  const cp = aberrateCos(w, c);
  const px = (n[0] - c * v[0]) / D;
  const py = (n[1] - c * v[1]) / D;
  const pz = (n[2] - c * v[2]) / D;
  const x = px + cp * v[0];
  const y = py + cp * v[1];
  const z = pz + cp * v[2];
  const r = Math.hypot(x, y, z);
  return [x / r, y / r, z / r];
}

/** Scale factor at which light reaching an observer at aObs left a comoving source at chiMpc (0 if none). */
export function emissionScale(cosmo: Cosmology, aObs: number, chiMpc: number): number {
  const l = cosmo.lnEmission(Math.log(aObs), chiMpc / cosmo.dH);
  return Number.isFinite(l) ? Math.exp(l) : 0;
}

/**
 * Full appearance of a comoving source at comoving distance chiMpc, seen at aObs by a ship with
 * rapidity w whose velocity makes angle acos(cosRest) with the direction to the source (both measured
 * in the local comoving frame). Defaults: a comoving observer (w = 0).
 */
export function appearance(cosmo: Cosmology, aObs: number, chiMpc: number, w = 0, cosRest = 1): Appearance {
  const lO = Math.log(aObs);
  const span = cosmo.emissionSpanLn(lO, chiMpc / cosmo.dH);
  const lE = lO - span;
  const D = dopplerFromRapidity(w, cosRest);
  const cosShip = aberrateCos(w, cosRest);
  if (!Number.isFinite(lE)) {
    return {
      visible: false,
      hidden: 'beyond-particle-horizon',
      aEmit: 0,
      emitTimeGyr: 0,
      lookbackGyr: cosmo.tH * cosmo.timeLn(lO),
      z: Infinity,
      angularDiameterDistanceMpc: 0,
      luminosityDistanceMpc: Infinity,
      properDistanceNowMpc: aObs * chiMpc,
      properDistanceThenMpc: 0,
      doppler: D,
      frequencyRatio: 0,
      surfaceBrightnessFactor: 0,
      fluxPerLuminosity: 0,
      cosShip,
    };
  }
  const aE = Math.exp(lE);
  const onePlusZ = Math.exp(span);
  const z = Math.expm1(span);
  const dL = aObs * onePlusZ * chiMpc;
  const ratio = D / onePlusZ;
  const dLm = dL * MPC_M;
  const early = aE < 1 / (1 + Z_RECOMBINATION);
  return {
    visible: !early,
    hidden: early ? 'before-last-scattering' : undefined,
    aEmit: aE,
    emitTimeGyr: cosmo.tH * cosmo.timeLn(lE),
    lookbackGyr: cosmo.tH * cosmo.timeAfterLn(lE, span),
    z,
    angularDiameterDistanceMpc: aE * chiMpc,
    luminosityDistanceMpc: dL,
    properDistanceNowMpc: aObs * chiMpc,
    properDistanceThenMpc: aE * chiMpc,
    doppler: D,
    frequencyRatio: ratio,
    surfaceBrightnessFactor: ratio ** 4,
    fluxPerLuminosity: chiMpc > 0 ? (D * D) / (4 * Math.PI * dLm * dLm) : Infinity,
    cosShip,
  };
}

/**
 * The latest cosmic time (Gyr) at which a comoving source at chiMpc emits light that an observer at the
 * origin will ever receive: eta_e = eta_inf - chi (Loeb 2002, Phys. Rev. D 65, 047301). Returns null if
 * the source is beyond the event horizon of the big bang itself (chi >= eta_inf).
 */
export function lastVisibleEmissionTimeGyr(cosmo: Cosmology, chiMpc: number): number | null {
  const chi = chiMpc / cosmo.dH;
  if (chi >= cosmo.etaInf) return null;
  return cosmo.tH * cosmo.timeLn(cosmo.lnAtEventHorizon(chi));
}

// ------------------------------------------------------------------------------------ GPU table

export interface EmissionTable {
  /** g(v) = ln a - v at N evenly spaced v in [vMin, vMax]. */
  data: Float32Array;
  data64: Float64Array;
  n: number;
  vMin: number;
  vMax: number;
  /** Largest error of ln a_e reconstructed from data64 by the cubic (Catmull-Rom) lookup, over the range. */
  maxErrorLnA: number;
  /** The same, reconstructed from the float32 data (what a shader reads). */
  maxErrorLnA32: number;
  /** GLSL ES 3.0 snippet (four texelFetch + cubic Catmull-Rom weights computed in the shader, so the result does not depend on 8-bit filter weights). */
  glsl: string;
}

/**
 * Table for emission lookups on the GPU or for many sources per frame on the CPU.
 * With eta_o = eta(a_o) (particle horizon of the observer, Mpc) and chiEH_o = chi_EH(a_o) (event
 * horizon of the observer, Mpc), a source at comoving chi was seen emitting at
 *   v = ln((eta_o - chi) / (chiEH_o + chi)),   ln a_e = v + g(v).
 * Writing v with the two horizons keeps both numerator and denominator free of cancellation at any
 * observer time. ln a is asymptotically linear in v at both ends (a ~ eta early, a ~ 1/chi_EH late), so
 * g is smooth and bounded.
 */
export function buildEmissionTable(cosmo: Cosmology, n = 1024, aMin = 1e-5, aMax = 1e5): EmissionTable {
  const vOf = (l: number) => Math.log(cosmo.conformalLn(l) / cosmo.eventHorizonLn(l));
  const vMin = vOf(Math.log(aMin));
  const vMax = vOf(Math.log(aMax));
  const data64 = new Float64Array(n);
  // eta / chiEH = e^v with eta + chiEH = etaInf: invert through whichever horizon is the smaller number.
  const lnAofV = (v: number) =>
    v > 0 ? cosmo.lnAtEventHorizon(cosmo.etaInf / (1 + Math.exp(v))) : cosmo.lnAtConformal(cosmo.etaInf / (1 + Math.exp(-v)));
  for (let i = 0; i < n; i++) {
    const v = vMin + ((vMax - vMin) * i) / (n - 1);
    data64[i] = lnAofV(v) - v;
  }
  const data32 = Float32Array.from(data64);
  let maxErr = 0;
  let maxErr32 = 0;
  const dv = (vMax - vMin) / (n - 1);
  for (let i = 0; i < n - 1; i++) {
    for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      const v = vMin + (i + f) * dv;
      const exact = lnAofV(v);
      maxErr = Math.max(maxErr, Math.abs(v + catmullRom(data64, n, i, f) - exact));
      maxErr32 = Math.max(maxErr32, Math.abs(v + catmullRom(data32, n, i, f) - exact));
    }
  }
  const glsl = `// Emission scale factor and redshift of comoving sources (staging/cosmology/src/appearance.ts).
// uEmitTable: ${n} x 1 R32F texture of g(v) = ln a - v, v evenly spaced over [uEmitRange.x, uEmitRange.y].
// Upload with NEAREST min/mag filters and no mipmaps (R32F is not filterable in WebGL2 without an
// extension, and the lookup below reads texels with texelFetch and interpolates itself).
// uEtaObs = particle horizon of the observer (Mpc), uChiEHObs = event horizon of the observer (Mpc).
// uLnAObsTable = emissionLnAFast(table, uEtaObs, uChiEHObs, 0) from the CPU: ln a of the observer as the
// table itself returns it, so that ln(1 + z) = uLnAObsTable - emissionLnA(chi) cancels the table error.
precision highp float;
precision highp int;
uniform highp sampler2D uEmitTable;
uniform vec2 uEmitRange;
uniform float uEtaObs;
uniform float uChiEHObs;
uniform float uLnAObsTable;
// Returns ln(a_emit); -1e30 when the source is outside the particle horizon.
float emissionLnA(float chiMpc) {
  float num = uEtaObs - chiMpc;
  if (num <= 0.0) return -1e30;
  float v = log(num / (uChiEHObs + chiMpc));
  float x = clamp((v - uEmitRange.x) / (uEmitRange.y - uEmitRange.x), 0.0, 1.0) * ${(n - 1).toFixed(1)};
  int i = min(int(x), ${n - 2});
  float f = x - float(i);
  float g0 = texelFetch(uEmitTable, ivec2(i, 0), 0).r;
  float g1 = texelFetch(uEmitTable, ivec2(i + 1, 0), 0).r;
  // Neighbours; past either end of the table, quadratic extrapolation from the three nearest samples.
  float gm = i > 0 ? texelFetch(uEmitTable, ivec2(i - 1, 0), 0).r : 3.0 * (g0 - g1) + texelFetch(uEmitTable, ivec2(i + 2, 0), 0).r;
  float g2 = i < ${n - 2} ? texelFetch(uEmitTable, ivec2(i + 2, 0), 0).r : 3.0 * (g1 - g0) + gm;
  // Catmull-Rom cubic through the four values (error below 1e-7 in ln a, the float32 resolution).
  return v + g0 + 0.5 * f * ((g1 - gm) + f * ((2.0 * gm - 5.0 * g0 + 4.0 * g1 - g2) + f * (3.0 * (g0 - g1) + g2 - gm)));
}
// ln(1 + z) of a comoving source at chiMpc; 1e30 outside the particle horizon.
float emissionLn1pZ(float chiMpc) {
  float l = emissionLnA(chiMpc);
  return l < -1e29 ? 1e30 : max(0.0, uLnAObsTable - l);
}
`;
  return { data: data32, data64, n, vMin, vMax, maxErrorLnA: maxErr, maxErrorLnA32: maxErr32, glsl };
}

/** CPU twin of the GLSL lookup (float64 data, same cubic). Returns ln a_e, or -Infinity outside the particle horizon. */
export function emissionLnAFast(t: EmissionTable, etaObsMpc: number, chiEHObsMpc: number, chiMpc: number): number {
  const num = etaObsMpc - chiMpc;
  if (num <= 0) return -Infinity;
  const v = Math.log(num / (chiEHObsMpc + chiMpc));
  const x = Math.min(Math.max((v - t.vMin) / (t.vMax - t.vMin), 0), 1) * (t.n - 1);
  const i = Math.min(Math.floor(x), t.n - 2);
  return v + catmullRom(t.data64, t.n, i, x - i);
}

/** Catmull-Rom cubic between samples i and i+1 at fraction f (quadratic extrapolation past the ends); same formula as the GLSL. */
function catmullRom(g: ArrayLike<number>, n: number, i: number, f: number): number {
  const g0 = g[i];
  const g1 = g[i + 1];
  const gm = i > 0 ? g[i - 1] : 3 * (g0 - g1) + g[i + 2];
  const g2 = i < n - 2 ? g[i + 2] : 3 * (g1 - g0) + gm;
  return g0 + 0.5 * f * (g1 - gm + f * (2 * gm - 5 * g0 + 4 * g1 - g2 + f * (3 * (g0 - g1) + g2 - gm)));
}

/**
 * CPU twin of emissionLn1pZ in the GLSL: ln(1 + z) = g-lookup at chi = 0 minus g-lookup at chi, so the
 * table's interpolation error (2e-5 in ln a) cancels for nearby sources. Infinity outside the particle horizon.
 */
export function emissionLn1pZFast(t: EmissionTable, etaObsMpc: number, chiEHObsMpc: number, chiMpc: number): number {
  const l = emissionLnAFast(t, etaObsMpc, chiEHObsMpc, chiMpc);
  if (l === -Infinity) return Infinity;
  return Math.max(0, emissionLnAFast(t, etaObsMpc, chiEHObsMpc, 0) - l);
}
