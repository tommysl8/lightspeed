import { describe, expect, it } from 'vitest';
import { blackbodyRgb, blackbody, LN_REF_TEMPERATURE, sampleBlackbody } from './blackbody';
import {
  buildDopplerLut,
  dopplerColorMatrix,
  dopplerColorMatrixNormalized,
  dopplerLnLuminance,
  DOPPLER_LUT_LN_MAX,
  DOPPLER_LUT_LN_MIN,
  DOPPLER_LUT_SIZE,
  reflectanceBasis,
  sampleDopplerColor,
} from './dopplerColor';
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

describe('Doppler recolouring at any Doppler factor', () => {
  const SIZE = 512;
  const lut = buildDopplerLut(SIZE);
  const sun = blackbodyRgb(SUN_TEFF_K);
  /** What the remap shader does to a pixel: colour from the table, brightness from the blackbody table. */
  const shade = (lnD: number, c: number[]) =>
    sampleDopplerColor(lut, SIZE, lnD, sampleBlackbody(LN_REF_TEMPERATURE + lnD).lnY, c as [number, number, number]);

  it('splits into a brightness and a bounded colour: T(D) = L(D) Ĉ(D)', () => {
    for (const D of [0.3, 0.7, 1, 2, 10]) {
      const T = dopplerColorMatrix(D);
      const C = dopplerColorMatrixNormalized(Math.log(D));
      const L = Math.exp(dopplerLnLuminance(Math.log(D)));
      T.forEach((v, i) => expect(v).toBeCloseTo(L * C[i], 9));
    }
    const I = dopplerColorMatrixNormalized(0);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(I[i]).toBeCloseTo(v, 9));
  });

  it('takes its brightness from the same blackbody law as the stars', () => {
    for (const lnD of [-2, -1, 0, 1, 3, 6, 11]) {
      expect(dopplerLnLuminance(lnD)).toBeCloseTo(sampleBlackbody(LN_REF_TEMPERATURE + lnD).lnY, 3);
    }
  });

  it('keeps the colour part bounded far beyond the table, where it has converged', () => {
    for (let lnD = -12; lnD <= 40; lnD += 1.3) {
      const C = dopplerColorMatrixNormalized(lnD);
      for (const v of C) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThan(50);
      }
    }
    // Beyond the hot edge nothing changes any more (Rayleigh–Jeans): the edge column stands in.
    const edge = dopplerColorMatrixNormalized(DOPPLER_LUT_LN_MAX);
    const far = dopplerColorMatrixNormalized(35);
    edge.forEach((v, i) => expect(Math.abs(v - far[i])).toBeLessThan(2e-3 * Math.max(1, Math.abs(v))));
  });

  it('is finite, and brighter the more the light is blueshifted, for ln D from −40 to 40', () => {
    let prev = -1;
    for (let lnD = -40; lnD <= 40; lnD += 0.05) {
      const rgb = shade(lnD, sun);
      for (const v of rgb) expect(Number.isFinite(v)).toBe(true);
      const l = lum(rgb);
      expect(l).toBeGreaterThanOrEqual(prev * (1 - 1e-6));
      prev = l;
    }
    // Far behind: nothing. Far ahead: brightness grows exactly as D (Rayleigh–Jeans).
    expect(Math.fround(lum(shade(-8, sun)))).toBe(0);
    expect(lum(shade(30, sun)) / lum(shade(20, sun))).toBeCloseTo(Math.exp(10), -2);
  });

  it('has no jump at the table edges', () => {
    for (const edge of [DOPPLER_LUT_LN_MIN, DOPPLER_LUT_LN_MAX]) {
      const a = shade(edge - 1e-6, [0.4, 0.5, 0.6]);
      const b = shade(edge + 1e-6, [0.4, 0.5, 0.6]);
      a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1e-4 * Math.max(v, 1e-30)));
    }
  });

  it('turns sunlight into the blackbody colour at D·T, whatever D', () => {
    for (const lnD of [-1.5, 0.5, 3, 9, 25]) {
      const rgb = shade(lnD, sun);
      const n = lum(rgb);
      const expected = sampleBlackbody(LN_REF_TEMPERATURE + lnD);
      [expected.r, expected.g, expected.b].forEach((v, i) => expect(Math.abs(rgb[i] / n - v)).toBeLessThan(0.02 * Math.max(1, v)));
    }
  });
});

describe('the colour table as the renderer reads it', () => {
  const lut = buildDopplerLut(DOPPLER_LUT_SIZE);
  const step = (DOPPLER_LUT_LN_MAX - DOPPLER_LUT_LN_MIN) / (DOPPLER_LUT_SIZE - 1);

  it('blends neighbouring columns, so even saturated colours change smoothly with speed', () => {
    // Halfway between columns is where reading the nearest column alone was furthest off.
    let worst = 0;
    for (let k = 3; k < DOPPLER_LUT_SIZE - 3; k += 37) {
      const lnD = DOPPLER_LUT_LN_MIN + (k + 0.5) * step;
      const C = dopplerColorMatrixNormalized(lnD);
      for (const c of [
        [1, 0, 0],
        [0.1, 0.2, 0.9],
        [0.6, 0.35, 0.22],
      ]) {
        const exact = apply(C, c);
        const got = sampleDopplerColor(lut, DOPPLER_LUT_SIZE, lnD, 0, c as [number, number, number]);
        const scale = Math.max(...exact.map(Math.abs), 1e-9);
        for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(Math.max(0, exact[i]) - got[i]) / scale);
      }
    }
    expect(worst).toBeLessThan(0.01);
  });
});
