// Distances and times in a flat Lambda-CDM universe, and the Doppler bookkeeping of the CMB frame.
//
// Parameters: Planck 2018, TT,TE,EE+lowE+lensing+BAO (Planck Collaboration 2020, A&A 641, A6,
// table 2, last column): H0 = 67.66 km/s/Mpc, Omega_m = 0.3111, flat. Radiation: CMB photons at
// T0 = 2.7255 K (Fixsen 2009, ApJ 707, 916) and two massless neutrino species out of N_eff = 3.046
// (the third, of 0.06 eV, is counted in Omega_m; it behaves as matter for z < ~100).
// Checked against astropy's Planck18 cosmology: comoving distances agree to < 0.003 % for z < 15.
//
// This is the same model scripts/build-local-galaxies.mjs uses for named.json. If the app's own
// cosmology module (staging/cosmology) is adopted, feed it these parameters, or re-derive named.json.

import { GAL_TO_ICRS, apply, dot, lbToUnit, raDecToUnit, type Vec3 } from './frames.ts';

/** Speed of light, km/s (exact). */
export const C_KM_S = 299_792.458;

export interface Cosmology {
  H0: number; // km/s/Mpc
  omegaM: number;
  omegaR: number;
  omegaL: number;
}

/** Omega_r for photons at tCmbK plus nMassless massless neutrino species (each worth N_eff/3). */
export function radiationDensity(H0: number, tCmbK = 2.7255, nEff = 3.046, masslessFraction = 2 / 3): number {
  const sigmaSB = 5.670374419e-8; // W m^-2 K^-4 (CODATA 2018, exact)
  const c = 299_792_458;
  const G = 6.6743e-11; // CODATA 2018
  const mpcM = 3.0856775814913673e22;
  const rhoGamma = (4 * sigmaSB * tCmbK ** 4) / c ** 3;
  const h = (H0 * 1000) / mpcM;
  const rhoCrit = (3 * h * h) / (8 * Math.PI * G);
  return (rhoGamma / rhoCrit) * (1 + (7 / 8) * (4 / 11) ** (4 / 3) * nEff * masslessFraction);
}

export const PLANCK18: Cosmology = (() => {
  const H0 = 67.66;
  const omegaM = 0.3111;
  const omegaR = radiationDensity(H0);
  return { H0, omegaM, omegaR, omegaL: 1 - omegaM - omegaR };
})();

/** c/H0 in Mpc. */
export const hubbleDistanceMpc = (c: Cosmology = PLANCK18): number => C_KM_S / c.H0;
/** 1/H0 in Gyr (977.79... Gyr = 1 Mpc/(km/s)). */
export const hubbleTimeGyr = (c: Cosmology = PLANCK18): number => 977.7922216807891 / c.H0;

/** E(z) = H(z)/H0. */
export function E(z: number, c: Cosmology = PLANCK18): number {
  const x = 1 + z;
  return Math.sqrt(c.omegaR * x ** 4 + c.omegaM * x ** 3 + c.omegaL);
}

// 16-point Gauss-Legendre, composite over n panels.
const GX = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003, -0.6178762444026438,
  -0.4580167776572274, -0.2816035507792589, -0.0950125098376374, 0.0950125098376374, 0.2816035507792589,
  0.4580167776572274, 0.6178762444026438, 0.755404408355003, 0.8656312023878318, 0.9445750230732326,
  0.9894009349916499,
];
const GW = [
  0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339, 0.1495959888165767,
  0.1691565193950025, 0.1826034150449236, 0.1894506104550685, 0.1894506104550685, 0.1826034150449236,
  0.1691565193950025, 0.1495959888165767, 0.1246289712555339, 0.0951585116824928, 0.0622535239386479,
  0.0271524594117541,
];
function integrate(f: (x: number) => number, a: number, b: number, n = 64): number {
  const h = (b - a) / n;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const m = a + (k + 0.5) * h;
    for (let j = 0; j < 16; j++) s += GW[j] * f(m + 0.5 * h * GX[j]);
  }
  return 0.5 * h * s;
}
// In the scale factor a = 1/(1+z): a^2 E(a) = sqrt(Or + Om a + OL a^4), finite at a -> 0.
const a2E = (a: number, c: Cosmology) => Math.sqrt(c.omegaR + c.omegaM * a + c.omegaL * a ** 4);

/** Line-of-sight comoving distance to redshift z, Mpc (flat: equal to the transverse comoving distance). */
export function comovingDistanceMpc(z: number, c: Cosmology = PLANCK18): number {
  if (z <= 0) return 0;
  return hubbleDistanceMpc(c) * integrate((a) => 1 / a2E(a, c), 1 / (1 + z), 1);
}
export const luminosityDistanceMpc = (z: number, c: Cosmology = PLANCK18): number =>
  (1 + z) * comovingDistanceMpc(z, c);
export const angularDiameterDistanceMpc = (z: number, c: Cosmology = PLANCK18): number =>
  comovingDistanceMpc(z, c) / (1 + z);
/** Cosmic time at redshift z (age of the universe then), Gyr. */
export function ageGyr(z: number, c: Cosmology = PLANCK18): number {
  return hubbleTimeGyr(c) * integrate((a) => a / a2E(a, c), 0, 1 / (1 + z), 256);
}
export const lookbackTimeGyr = (z: number, c: Cosmology = PLANCK18): number => ageGyr(0, c) - ageGyr(z, c);

/**
 * A monotonic table z -> comoving distance for fast lookups (e.g. 55,877 cosmic-web galaxies) and
 * its inverse. Nodes are spaced evenly in log(1+z); between nodes the smooth ratio g(z) = D_C/z
 * (-> c/H0 as z -> 0) is interpolated linearly in z. With n = 2048 up to z = 20 the relative error
 * is below 1e-6 everywhere, including z -> 0.
 */
export function makeDistanceTable(zMax = 20, n = 2048, c: Cosmology = PLANCK18) {
  const zs = new Float64Array(n + 1);
  const dc = new Float64Array(n + 1);
  const g = new Float64Array(n + 1);
  const lmax = Math.log1p(zMax);
  let acc = 0;
  let prevA = 1;
  for (let i = 0; i <= n; i++) {
    const lz = (lmax * i) / n;
    zs[i] = Math.expm1(lz);
    const a = Math.exp(-lz);
    if (i > 0) acc += integrate((x) => 1 / a2E(x, c), a, prevA, 2);
    prevA = a;
    dc[i] = acc * hubbleDistanceMpc(c);
    g[i] = i === 0 ? hubbleDistanceMpc(c) / Math.sqrt(c.omegaR + c.omegaM + c.omegaL) : dc[i] / zs[i];
  }
  const cell = (z: number) => Math.min(n - 1, Math.floor((Math.log1p(z) / lmax) * n));
  const gAt = (i: number, z: number) => g[i] + ((z - zs[i]) / (zs[i + 1] - zs[i])) * (g[i + 1] - g[i]);
  return {
    comovingMpc(z: number): number {
      if (z <= 0) return 0;
      const zz = Math.min(z, zMax);
      return zz * gAt(cell(zz), zz);
    },
    redshiftAt(dcMpc: number): number {
      if (dcMpc <= 0) return 0;
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (dc[m] < dcMpc) lo = m;
        else hi = m;
      }
      // Newton on z g(z) = D within the cell (g linear there)
      const slope = (g[hi] - g[lo]) / (zs[hi] - zs[lo]);
      let z = zs[lo] + ((dcMpc - dc[lo]) / (dc[hi] - dc[lo])) * (zs[hi] - zs[lo]);
      for (let k = 0; k < 3; k++) {
        const gz = g[lo] + (z - zs[lo]) * slope;
        z -= (z * gz - dcMpc) / (gz + z * slope);
      }
      return z;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Distance moduli

/** Luminosity distance in Mpc from a distance modulus. */
export const dmToMpc = (dm: number): number => 10 ** ((dm - 25) / 5);
export const mpcToDm = (mpc: number): number => 5 * Math.log10(mpc) + 25;
/**
 * Comoving distance from a measured distance modulus and the observed CMB-frame redshift:
 * D_C = D_L / (1 + z). Using the observed rather than the cosmological redshift errs by ~v_pec/c
 * (~0.1 %), far below the distance errors.
 */
export const dmToComovingMpc = (dm: number, zCmb: number): number => dmToMpc(dm) / (1 + Math.max(0, zCmb));

// ---------------------------------------------------------------------------------------------
// The CMB frame

/** CMB monopole temperature, K (Fixsen 2009). */
export const T_CMB_K = 2.7255;
/**
 * Solar-system barycentre velocity relative to the CMB (Planck Collaboration 2020, A&A 641, A1):
 * 369.82 +/- 0.11 km/s toward (l, b) = (264.021 +/- 0.011, 48.253 +/- 0.005) deg; the dipole
 * amplitude is 3362.08 +/- 0.99 uK.
 */
export const CMB_DIPOLE = { speedKmS: 369.82, l: 264.021, b: 48.253, amplitudeUK: 3362.08 } as const;
export const CMB_DIPOLE_ICRS: Vec3 = apply(GAL_TO_ICRS, lbToUnit(CMB_DIPOLE.l, CMB_DIPOLE.b));

/**
 * Heliocentric -> CMB-frame redshift for a source at (RA, Dec):
 *   1 + z_cmb = (1 + z_hel) * gamma * (1 + beta cos(theta)),
 * theta = angle between the source and the dipole apex. (First order: cz_cmb = cz_hel + v cos theta.)
 */
export function zHelioToCmb(zHel: number, raDeg: number, decDeg: number): number {
  const beta = CMB_DIPOLE.speedKmS / C_KM_S;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return (1 + zHel) * gamma * (1 + beta * dot(raDecToUnit(raDeg, decDeg), CMB_DIPOLE_ICRS)) - 1;
}
export function zCmbToHelio(zCmb: number, raDeg: number, decDeg: number): number {
  const beta = CMB_DIPOLE.speedKmS / C_KM_S;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return (1 + zCmb) / (gamma * (1 + beta * dot(raDecToUnit(raDeg, decDeg), CMB_DIPOLE_ICRS))) - 1;
}

/**
 * Temperature of the CMB seen in direction `look` (unit vector, the direction the observer looks,
 * in the observer's frame) by an observer moving with velocity beta (in units of c, same frame as
 * `look`) relative to the CMB rest frame: T = T0 / (gamma (1 - beta . look)). The spectrum stays a
 * black body. At beta = 0.99 the forward sky is at 38.5 K and the backward sky at 0.19 K.
 */
export function cmbTemperatureSeenK(look: Vec3, beta: Vec3, t0 = T_CMB_K): number {
  const b2 = dot(beta, beta);
  const gamma = 1 / Math.sqrt(1 - b2);
  return t0 / (gamma * (1 - dot(beta, look)));
}

