import { describe, expect, it } from 'vitest';
import { loadNames, loadStars, loadSystems } from './test-helpers';
import { buildNameIndex, findStar } from './names';
import { apparentMagnitude, apparentMagnitudeFrom, distanceModulus, sunApparentMagnitudeFrom } from './photometry';
import { systemMembersAt } from './orbits';
import { JD_J2000 } from './constants';
import type { Vec3 } from './frames';

const stars = loadStars();
const names = buildNameIndex(loadNames());
const one = (q: string) => findStar(names, q)[0];

describe('apparent magnitudes', () => {
  it('distance modulus is zero at 10 pc and 5 mag per factor of 10', () => {
    expect(distanceModulus(10)).toBe(0);
    expect(distanceModulus(100)).toBeCloseTo(5, 12);
    expect(apparentMagnitude(4.81, 1 / 206264.806)).toBeCloseTo(-26.76, 2); // the Sun from 1 au (Willmer 2018: -26.76)
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
    for (const [name, V] of expected) {
      expect(apparentMagnitudeFrom(stars, one(name), [0, 0, 0]), name).toBeCloseTo(V, 1);
    }
  });

  it('from Alpha Centauri the Sun is a 0.4-magnitude star', () => {
    const sys = loadSystems().systems.find((s) => s.id === 'alpha-centauri')!;
    const a = systemMembersAt(sys, JD_J2000).get('alpha-cen-a')!.posPc;
    const m = sunApparentMagnitudeFrom(a);
    expect(m).toBeGreaterThan(0.35);
    expect(m).toBeLessThan(0.5);
  });

  it('from Proxima, Alpha Centauri A shines at about magnitude -6.8', () => {
    const sys = loadSystems().systems.find((s) => s.id === 'alpha-centauri')!;
    const members = systemMembersAt(sys, JD_J2000);
    const prox = members.get('proxima')!.posPc;
    const a = members.get('alpha-cen-a')!.posPc;
    const d = Math.hypot(a[0] - prox[0], a[1] - prox[1], a[2] - prox[2]);
    const iA = one('Rigil Kentaurus');
    const m = apparentMagnitude(stars.absMag[iA], d);
    expect(m).toBeGreaterThan(-7.3);
    expect(m).toBeLessThan(-6.3);
    // and through the catalogue path (retarded position) it agrees
    const m2 = apparentMagnitudeFrom(stars, iA, prox as Vec3);
    expect(m2).toBeCloseTo(m, 1);
  });
});
