import { describe, expect, it } from 'vitest';
import { M_EARTH_MSUN } from './constants.ts';
import { eccentricFromTrue, meanFromTrue, periodDays, semiMajorAxisAu, solveKepler, trueFromEccentric, wrap360 } from './kepler.ts';

describe('Kepler equation', () => {
  it('solves M = E - e sin E to 1e-12 for e up to 0.999', () => {
    for (const e of [0, 1e-6, 0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97, 0.99, 0.999]) {
      for (let k = -20; k <= 20; k++) {
        const M = k * 0.37;
        const E = solveKepler(M, e);
        const Mw = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        let r = E - e * Math.sin(E) - Mw;
        r = Math.atan2(Math.sin(r), Math.cos(r));
        expect(Math.abs(r)).toBeLessThan(1e-12);
      }
    }
  });

  it('round-trips true, eccentric and mean anomaly', () => {
    for (const e of [0, 0.05, 0.5, 0.95]) {
      for (let f = -3; f <= 3; f += 0.25) {
        const E = eccentricFromTrue(f, e);
        expect(trueFromEccentric(E, e)).toBeCloseTo(f, 12);
        const M = meanFromTrue(f, e);
        const f2 = trueFromEccentric(solveKepler(M, e), e);
        expect(Math.atan2(Math.sin(f2 - f), Math.cos(f2 - f))).toBeCloseTo(0, 11);
      }
    }
  });

  it('rejects hyperbolic eccentricities', () => {
    expect(() => solveKepler(1, 1)).toThrow();
  });

  it('wraps degrees into [0, 360)', () => {
    expect(wrap360(-90)).toBe(270);
    expect(wrap360(720.5)).toBeCloseTo(0.5, 12);
  });
});

describe("Kepler's third law", () => {
  it("gives Earth's orbit: 1 au for one sidereal year", () => {
    // Sidereal year 365.256363 d; Earth-Moon mass included for the relative orbit.
    const a = semiMajorAxisAu(365.256_363, 1 + 1.0123 * M_EARTH_MSUN);
    expect(a).toBeCloseTo(1.000_001, 5);
  });

  it('inverts', () => {
    const P = periodDays(0.05, 0.9);
    expect(semiMajorAxisAu(P, 0.9)).toBeCloseTo(0.05, 12);
  });
});
