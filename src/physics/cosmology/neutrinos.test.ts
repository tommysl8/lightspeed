import { describe, expect, it } from 'vitest';
import { F0, NU_TABLE, fermiDiracIntegrals, nuDensityRatio } from './neutrinos.ts';

// zeta(3), zeta(5): the cold limit and the first correction of the large-y series.
const ZETA3 = 1.2020569031595942;
const ZETA5 = 1.0369277551433699;

describe('massive-neutrino density ratio r(y) = F(y)/F(0)', () => {
  it('F(0) = 7 pi^4 / 120 by quadrature', () => {
    expect(fermiDiracIntegrals(0).F / F0 - 1).toBeLessThan(1e-14);
  });
  it('matches direct quadrature to 1e-12 across the table and at both hand-overs', () => {
    let worst = 0;
    let worstSlope = 0;
    for (let k = 0; k <= 400; k++) {
      const y = Math.exp(Math.log(1e-5) + (k / 400) * Math.log(1e3 / 1e-5)) * (1 + 0.37 / 401);
      const d = fermiDiracIntegrals(y);
      const r = nuDensityRatio(y);
      worst = Math.max(worst, Math.abs(r.r / (d.F / F0) - 1));
      worstSlope = Math.max(worstSlope, Math.abs(r.dlnr - (y * d.dF) / d.F));
    }
    expect(worst).toBeLessThan(2e-13);
    expect(worstSlope).toBeLessThan(1e-9);
    // Both sides of each hand-over (series <-> table) agree with quadrature at the same argument.
    for (const y0 of [NU_TABLE.yMin, NU_TABLE.yMax]) {
      for (const y of [y0 * (1 - 1e-9), y0 * (1 + 1e-9)]) {
        expect(Math.abs(nuDensityRatio(y).r / (fermiDiracIntegrals(y).F / F0) - 1)).toBeLessThan(2e-13);
      }
    }
  });
  it('relativistic and cold limits', () => {
    expect(nuDensityRatio(0).r).toBe(1);
    expect(Math.abs(nuDensityRatio(1e-6).r - 1 - (5 / (7 * Math.PI ** 2)) * 1e-12)).toBeLessThan(3e-16);
    // Cold: F = y [ (3/2) zeta(3) + (45/4) zeta(5) / y^2 + ... ]
    const y = 1e4;
    const cold = (y * (1.5 * ZETA3 + (22.5 * ZETA5) / (2 * y * y))) / F0;
    expect(nuDensityRatio(y).r / cold - 1).toBeLessThan(1e-14);
    // d ln r / d ln y = 1 - (45/2) zeta(5) / ((3/2) zeta(3) y^2) + ...
    expect(nuDensityRatio(1e6).dlnr - (1 - (22.5 * ZETA5) / (1.5 * ZETA3 * 1e12))).toBeCloseTo(0, 15);
  });
});
