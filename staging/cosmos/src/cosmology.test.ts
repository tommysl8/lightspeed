import { describe, expect, it } from 'vitest';
import {
  CMB_DIPOLE,
  PLANCK18,
  T_CMB_K,
  ageGyr,
  cmbTemperatureSeenK,
  comovingDistanceMpc,
  dmToMpc,
  lookbackTimeGyr,
  luminosityDistanceMpc,
  makeDistanceTable,
  mpcToDm,
  zCmbToHelio,
  zHelioToCmb,
} from './cosmology.ts';

// Reference values from astropy 8.0.1, cosmology.Planck18 (H0 = 67.66, Om0 = 0.30966 plus one
// 0.06 eV neutrino, Tcmb0 = 2.7255 K, Neff = 3.046), computed for this test.
const ASTROPY = [
  { z: 0.01, dc: 44.20505557661846, lookback: 0.14346204835892962 },
  { z: 0.1, dc: 432.5656977383524, lookback: 1.3451981508947872 },
  { z: 0.29656, dc: 1219.6834069217393, lookback: 3.4956118893931656 },
  { z: 1, dc: 3395.6344711515662, lookback: 7.935542002084359 },
  { z: 3, dc: 6504.003988949642, lookback: 11.64313146468227 },
  { z: 10.607648, dc: 9763.080755718544, age: 0.4348075921676391 },
  { z: 14.457903, dc: 10384.031225457255, age: 0.2825773032714643 },
  { z: 1100, dc: 13886.327957431413 },
];

describe('flat Lambda-CDM (Planck 2018)', () => {
  it('has the Planck 2018 age', () => {
    // Planck 2018 (TT,TE,EE+lowE+lensing+BAO): 13.787 +/- 0.020 Gyr; astropy Planck18: 13.78689
    expect(ageGyr(0)).toBeCloseTo(13.7869, 3);
    expect(PLANCK18.omegaR).toBeGreaterThan(7.8e-5);
    expect(PLANCK18.omegaR).toBeLessThan(8.0e-5);
  });

  it('matches astropy comoving distances to better than 0.01 % for z < 15', () => {
    for (const r of ASTROPY) {
      const tol = r.z > 100 ? 2e-3 : 1e-4; // at z = 1100 the massive neutrino is not matter-like
      expect(Math.abs(comovingDistanceMpc(r.z) / r.dc - 1)).toBeLessThan(tol);
    }
  });

  it('matches astropy lookback times and ages', () => {
    for (const r of ASTROPY) {
      if (r.lookback != null) expect(Math.abs(lookbackTimeGyr(r.z) - r.lookback)).toBeLessThan(5e-4);
      if (r.age != null) expect(Math.abs(ageGyr(r.z) - r.age)).toBeLessThan(5e-4);
    }
  });

  it('reproduces the "280 million years after the Big Bang" of MoM-z14 (z = 14.44)', () => {
    expect(ageGyr(14.44)).toBeGreaterThan(0.278);
    expect(ageGyr(14.44)).toBeLessThan(0.288);
  });

  it('the fast table agrees with direct integration and inverts', () => {
    const t = makeDistanceTable(20, 2048);
    for (const z of [0.001, 0.02, 0.1, 0.5, 2, 10, 14.44]) {
      expect(Math.abs(t.comovingMpc(z) / comovingDistanceMpc(z) - 1)).toBeLessThan(1e-5);
      expect(Math.abs(t.redshiftAt(t.comovingMpc(z)) / z - 1)).toBeLessThan(1e-5);
    }
  });

  it('luminosity distance and distance modulus are consistent', () => {
    expect(dmToMpc(25)).toBe(1);
    expect(mpcToDm(dmToMpc(31.134))).toBeCloseTo(31.134, 12);
    expect(luminosityDistanceMpc(1)).toBeCloseTo(2 * comovingDistanceMpc(1), 9);
  });
});

describe('CMB frame', () => {
  it('dipole amplitude equals T0 * v/c', () => {
    expect((T_CMB_K * CMB_DIPOLE.speedKmS) / 299792.458 * 1e6).toBeCloseTo(3362.1, 0);
  });

  it('adds the solar motion toward the apex and removes it away from it', () => {
    // Toward the apex (l, b) = (264.021, 48.253) -> RA 167.94, Dec -6.94 (computed): cz grows by 369.8 km/s
    const apexRa = 167.942;
    const apexDec = -6.944;
    const z = zHelioToCmb(0.01, apexRa, apexDec);
    expect((z - 0.01) * 299792.458).toBeGreaterThan(369);
    expect((z - 0.01) * 299792.458).toBeLessThan(375);
    expect(zCmbToHelio(z, apexRa, apexDec)).toBeCloseTo(0.01, 12);
  });

  it('M87: heliocentric 0.00420 becomes ~0.0053 in the CMB frame (CF4 lists cz_cmb = 1608 km/s)', () => {
    const z = zHelioToCmb(0.0042, 187.70593077, 12.39112325);
    expect(z * 299792.458).toBeGreaterThan(1570);
    expect(z * 299792.458).toBeLessThan(1620);
  });

  it('a relativistic observer sees a hot sky ahead and a cold one behind', () => {
    const beta: [number, number, number] = [0.99, 0, 0];
    expect(cmbTemperatureSeenK([1, 0, 0], beta)).toBeCloseTo(38.45, 1);
    expect(cmbTemperatureSeenK([-1, 0, 0], beta)).toBeCloseTo(0.1932, 3);
    expect(cmbTemperatureSeenK([0, 1, 0], [0, 0, 0])).toBe(T_CMB_K);
  });
});
