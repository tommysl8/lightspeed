import { describe, expect, it } from 'vitest';
import { blackbody, blackbodyRgb, buildBlackbodyLut, bvToTemperature, logPlanck } from './blackbody';

describe('B−V → temperature (Ballesteros 2012)', () => {
  it('gives the Sun (B−V = 0.656) about 5,772 K', () => {
    expect(Math.abs(bvToTemperature(0.656) - 5772)).toBeLessThan(60);
  });

  it('is hotter for bluer stars', () => {
    let prev = Infinity;
    for (let bv = -0.4; bv <= 2; bv += 0.1) {
      const t = bvToTemperature(bv);
      expect(t).toBeLessThan(prev);
      prev = t;
    }
  });
});

describe('Planck spectrum', () => {
  it("peaks where Wien's law says (λ_max = b/T)", () => {
    for (const T of [3000, 5772, 10000]) {
      let best = 0;
      let bestV = -Infinity;
      for (let nm = 100; nm <= 3000; nm += 0.5) {
        const v = logPlanck(nm * 1e-9, T);
        if (v > bestV) {
          bestV = v;
          best = nm;
        }
      }
      expect(best).toBeCloseTo(2.897_771_955e6 / T, -1);
    }
  });
});

describe('blackbody colour', () => {
  it('treats 6500 K as white', () => {
    const [r, g, b] = blackbodyRgb(6500);
    expect(r).toBeCloseTo(1, 6);
    expect(g).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it('is red-orange when cool and blue when hot', () => {
    const cool = blackbodyRgb(3000);
    expect(cool[0]).toBeGreaterThan(cool[1]);
    expect(cool[1]).toBeGreaterThan(cool[2]);
    const hot = blackbodyRgb(20000);
    expect(hot[2]).toBeGreaterThan(hot[0]);
  });

  it('visible luminance rises with temperature and stays finite at the extremes', () => {
    let prev = -Infinity;
    for (const T of [5, 50, 500, 3000, 6000, 30000, 1e6, 1e7]) {
      const y = blackbody(T).log10Y;
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });

  it('approaches the Rayleigh–Jeans limit (visible brightness ∝ T) when very hot', () => {
    const d = blackbody(2e7).log10Y - blackbody(1e7).log10Y;
    expect(d).toBeCloseTo(Math.log10(2), 2);
  });

  it('builds a finite lookup table', () => {
    const lut = buildBlackbodyLut(256);
    expect(lut.length).toBe(1024);
    expect(lut.every(Number.isFinite)).toBe(true);
  });
});
