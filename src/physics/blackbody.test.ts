import { describe, expect, it } from 'vitest';
import {
  BB_LUT_LN_T_MAX,
  BB_LUT_LN_T_MIN,
  LN_REF_TEMPERATURE,
  LN_Y_FLOOR,
  blackbody,
  blackbodyLut,
  blackbodyRgb,
  bvToTemperature,
  lnLuminanceRelSun,
  logPlanck,
  sampleBlackbody,
} from './blackbody';

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
    const lut = blackbodyLut();
    expect(lut.data.length).toBe(lut.size * 4);
    expect(lut.data.every(Number.isFinite)).toBe(true);
  });
});

describe('blackbody table with its asymptotes (what the shaders compute)', () => {
  const lnY = (T: number) => sampleBlackbody(Math.log(T)).lnY;

  it('matches the exact integral inside the table, relative to the Sun', () => {
    expect(Math.abs(lnY(5772))).toBeLessThan(1e-4);
    for (const T of [20, 300, 1000, 3000, 5772, 1e4, 3e5, 1e7, 5e9]) {
      const exact = lnLuminanceRelSun(T);
      expect(Math.abs(lnY(T) - exact)).toBeLessThan(2e-4 * Math.max(1, Math.abs(exact)));
    }
  });

  it('is finite and never decreases with temperature, from 10⁻⁴⁰ K to 10⁴⁰ K', () => {
    let prev = -Infinity;
    for (let lnT = -92; lnT <= 92; lnT += 0.037) {
      const s = sampleBlackbody(lnT);
      for (const v of [s.r, s.g, s.b, s.lnY]) expect(Number.isFinite(v)).toBe(true);
      expect(s.lnY).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s.lnY;
    }
  });

  it('is continuous where the asymptotes take over', () => {
    for (const edge of [BB_LUT_LN_T_MIN, BB_LUT_LN_T_MAX]) {
      const a = sampleBlackbody(edge - 1e-7);
      const b = sampleBlackbody(edge + 1e-7);
      expect(Math.abs(a.lnY - b.lnY)).toBeLessThan(1e-3);
      expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThan(1e-3);
      // and smooth: the slope just inside matches the asymptote's (to the Wien tail's own
      // curvature, 1 % per 0.01 in ln T, over the 0.03 between the two measurements)
      const inside = (sampleBlackbody(edge - 0.02).lnY - sampleBlackbody(edge - 0.01).lnY) / -0.01;
      const outside = (sampleBlackbody(edge + 0.02).lnY - sampleBlackbody(edge + 0.01).lnY) / 0.01;
      expect(Math.abs(inside - outside) / Math.abs(outside)).toBeLessThan(0.04);
    }
  });

  it('follows Rayleigh–Jeans when hot: visible luminance exactly ∝ T, colour fixed', () => {
    expect(lnY(1e15) - lnY(1e12)).toBeCloseTo(Math.log(1000), 9);
    // the exact integral agrees far beyond the table
    for (const T of [1e11, 1e14, 1e18]) expect(Math.abs(lnY(T) - lnLuminanceRelSun(T))).toBeLessThan(1e-4);
    const a = sampleBlackbody(Math.log(1e11));
    const b = sampleBlackbody(Math.log(1e21));
    expect([a.r, a.g, a.b]).toEqual([b.r, b.g, b.b]);
    expect(a.b).toBeGreaterThan(a.r); // blue-white
    expect(0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b).toBeCloseTo(1, 5);
  });

  it('follows the Wien tail when cold, and cuts to nothing below display precision', () => {
    for (const T of [8, 5, 3]) {
      const exact = lnLuminanceRelSun(T);
      expect(Math.abs(lnY(T) - exact) / Math.abs(exact)).toBeLessThan(0.01);
    }
    expect(lnY(1e-3)).toBe(LN_Y_FLOOR);
    expect(lnY(1e-30)).toBe(LN_Y_FLOOR);
    // 2.7 K light in float32: exactly zero.
    expect(Math.fround(Math.exp(lnY(2.725)))).toBe(0);
  });

  it('keeps the colour of cold light deep red (not the green of the CIE fit’s far-red tail)', () => {
    for (const T of [5, 100, 400, 600]) {
      const s = sampleBlackbody(Math.log(T));
      expect(s.r).toBeGreaterThan(s.g);
      expect(s.g).toBeGreaterThanOrEqual(s.b);
    }
  });

  it('uses the Sun as its reference', () => {
    expect(LN_REF_TEMPERATURE).toBeCloseTo(Math.log(5772), 12);
  });
});
