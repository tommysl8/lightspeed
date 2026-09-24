import { describe, expect, it } from 'vitest';
import { blackbodyRgb, blackbody } from './blackbody';
import { buildDopplerLut, dopplerColorMatrix, reflectanceBasis } from './dopplerColor';
import { SUN_TEFF_K } from './constants';

const apply = (T: number[], c: number[]) => [0, 1, 2].map((r) => T[r * 3] * c[0] + T[r * 3 + 1] * c[1] + T[r * 3 + 2] * c[2]);
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('Doppler recolouring of pixels', () => {
  it('uses reflectance bands that sum to one everywhere', () => {
    for (const l of [200, 380, 450, 500, 545, 600, 700, 900, 5000]) {
      const [r, g, b] = reflectanceBasis(l);
      expect(r + g + b).toBeCloseTo(1, 12);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('is the identity at D = 1', () => {
    const T = dopplerColorMatrix(1);
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    T.forEach((v, i) => expect(v).toBeCloseTo(I[i], 9));
  });

  it('turns sunlight into a blackbody at D·T (a shifted blackbody stays a blackbody)', () => {
    const sun = blackbodyRgb(SUN_TEFF_K);
    for (const D of [0.3, 0.7, 1.5, 3, 10]) {
      const out = apply(dopplerColorMatrix(D), sun);
      const expected = blackbodyRgb(SUN_TEFF_K * D);
      const n = lum(out);
      // (blackbodyRgb clips slightly out-of-gamut channels at 0, hence a 1% tolerance)
      for (let i = 0; i < 3; i++) expect(Math.abs(Math.max(0, out[i] / n) - expected[i])).toBeLessThan(0.01 * Math.max(1, expected[i]));
      // Brightness follows the visible luminance of the hotter/cooler blackbody.
      const ratio = 10 ** (blackbody(SUN_TEFF_K * D).log10Y - blackbody(SUN_TEFF_K).log10Y);
      // Rec.709 luminance of white-balanced RGB is not exactly CIE Y (the balance reweights the
      // channels), so allow 3%.
      expect(Math.abs(n / lum(sun) / ratio - 1)).toBeLessThan(0.03);
    }
  });

  it('brightens and blues surfaces ahead, dims and reddens those behind', () => {
    const grey = [0.5, 0.5, 0.5];
    const ahead = apply(dopplerColorMatrix(2), grey);
    const behind = apply(dopplerColorMatrix(0.5), grey);
    expect(lum(ahead)).toBeGreaterThan(lum(grey));
    expect(ahead[2] / ahead[0]).toBeGreaterThan(1);
    expect(lum(behind)).toBeLessThan(lum(grey));
    expect(behind[0] / Math.max(behind[2], 1e-9)).toBeGreaterThan(1);
  });

  it('builds a finite lookup table', () => {
    const lut = buildDopplerLut(128);
    expect(lut.every(Number.isFinite)).toBe(true);
  });
});
