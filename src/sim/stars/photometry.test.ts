import { describe, expect, it } from 'vitest';
import { loadNames, loadStars, loadSystems } from '../../test/stars';
import { findStar } from './names';
import {
  apparentMagnitude,
  apparentMagnitudeFrom,
  bolometricCorrection,
  distanceModulus,
  luminosityFromAbsMag,
  radiusFromLuminosity,
  sunApparentMagnitudeFrom,
} from './photometry';
import { systemMembersAt } from './orbits';
import { JD_J2000, SUN_ABS_V } from './constants';
import type { Vec3 } from './frames';

const stars = loadStars();
const names = loadNames();
const one = (q: string) => findStar(names, q)[0];

describe('apparent magnitudes', () => {
  it('distance modulus is zero at 10 pc and 5 mag per factor of 10', () => {
    expect(distanceModulus(10)).toBe(0);
    expect(distanceModulus(100)).toBeCloseTo(5, 12);
    expect(apparentMagnitude(4.81, 1 / 206264.806)).toBeCloseTo(-26.76, 2); // the Sun from 1 au (Willmer 2018)
  });

  it('reproduces the Hipparcos V of bright stars from the Sun', () => {
    const expected: [string, number][] = [
      ['Sirius', -1.44],
      ['Canopus', -0.62],
      ['Arcturus', -0.05],
      ['Vega', 0.03],
      ['Rigel', 0.18],
      ['Betelgeuse', 0.45],
      ['Altair', 0.76],
      ['Deneb', 1.25],
    ];
    for (const [name, V] of expected) expect(apparentMagnitudeFrom(stars, one(name), [0, 0, 0]), name).toBeCloseTo(V, 1);
  });

  it('from Alpha Centauri the Sun is a 0.4-magnitude star', () => {
    const sys = loadSystems().systems.find((s) => s.id === 'alpha-centauri')!;
    const m = sunApparentMagnitudeFrom(systemMembersAt(sys, JD_J2000).get('alpha-cen-a')!.posPc);
    expect(m).toBeGreaterThan(0.35);
    expect(m).toBeLessThan(0.5);
  });

  it('from Proxima, Alpha Centauri A shines at about magnitude −6.8', () => {
    const sys = loadSystems().systems.find((s) => s.id === 'alpha-centauri')!;
    const members = systemMembersAt(sys, JD_J2000);
    const prox = members.get('proxima')!.posPc;
    const a = members.get('alpha-cen-a')!.posPc;
    const d = Math.hypot(a[0] - prox[0], a[1] - prox[1], a[2] - prox[2]);
    const iA = one('Rigil Kentaurus');
    const m = apparentMagnitude(stars.absMag[iA], d);
    expect(m).toBeGreaterThan(-7.3);
    expect(m).toBeLessThan(-6.3);
    expect(apparentMagnitudeFrom(stars, iA, prox as Vec3)).toBeCloseTo(m, 1);
  });
});

describe('sizes from brightness and colour', () => {
  it("Flower's bolometric correction (Torres 2010) gives the Sun one solar luminosity", () => {
    expect(bolometricCorrection(5772)).toBeCloseTo(-0.08, 2);
    expect(luminosityFromAbsMag(SUN_ABS_V, 5772)).toBeCloseTo(1, 2);
    expect(radiusFromLuminosity(1, 5772)).toBe(1);
  });

  it("recovers Sirius A's measured luminosity and radius (Bond et al. 2017) to 2%", () => {
    const i = one('Sirius');
    const L = luminosityFromAbsMag(stars.absMag[i], 9845);
    expect(L / 24.74).toBeGreaterThan(0.98);
    expect(L / 24.74).toBeLessThan(1.02);
    expect(radiusFromLuminosity(L, 9845) / 1.7144).toBeCloseTo(1, 1);
  });

  it('keeps the correction finite outside the fit (clamped to 3,100–50,000 K)', () => {
    expect(bolometricCorrection(2000)).toBe(bolometricCorrection(3100));
    expect(bolometricCorrection(1e6)).toBe(bolometricCorrection(50_000));
    expect(Number.isFinite(bolometricCorrection(0))).toBe(true);
  });
});
