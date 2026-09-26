import { describe, expect, it } from 'vitest';
import { msFromCivil } from '../../lib/time';
import { arrivalText, homeDateText, oneMinusBeta, roughDuration, speedText, tripCostText } from './tripText';

const YEAR = 365.25 * 86_400;

describe('oneMinusBeta', () => {
  it('is 1 − tanh φ, exact where β has rounded to 1', () => {
    expect(oneMinusBeta(0)).toBe(1);
    expect(oneMinusBeta(Math.atanh(0.9))).toBeCloseTo(0.1, 12);
    // γ = 10⁹: 1 − β ≈ 1/(2γ²) = 5 × 10⁻¹⁹, far below float64's spacing near 1.
    const phi = Math.acosh(1e9);
    expect(Math.tanh(phi)).toBe(1);
    expect(oneMinusBeta(phi) / 5e-19).toBeCloseTo(1, 6);
  });
});

describe('speedText', () => {
  it('shows ordinary speeds as β with their nines', () => {
    const phi = Math.atanh(0.99999);
    expect(speedText({ beta: 0.99999, phi }, false).beta).toBe('0.999 990 0');
    expect(speedText({ beta: 0.5, phi: Math.atanh(0.5) }, false).gamma).toBe('1.154 70');
  });

  it('switches to 1 − ε when the nines run out', () => {
    const phi = Math.acosh(1e9);
    const s = speedText({ beta: 1, phi }, false);
    expect(s.beta).toBe('1 − 5.0 × 10⁻¹⁹');
    expect(s.gamma).toBe('1.0000 × 10⁹');
    expect(speedText({ beta: 1, phi: 400 }, false).beta).toBe('1 − 10⁻³⁴⁷');
  });

  it('gives the fictional warp no γ', () => {
    expect(speedText({ beta: 10, phi: NaN }, true)).toEqual({ beta: '10.0', gamma: 'imaginary' });
  });
});

describe('roughDuration', () => {
  it('rounds the way people say it', () => {
    expect(roughDuration(8.4)).toBe('8.4 s');
    expect(roughDuration(34 * 60 + 12)).toBe('34 min');
    expect(roughDuration(78 * 60 + 20)).toBe('1 h 18 min');
    expect(roughDuration(2 * 3600 + 59.8 * 60)).toBe('3 h');
    expect(roughDuration(12 * 86_400)).toBe('12 days');
    expect(roughDuration(3.52 * YEAR)).toBe('3.5 years');
    expect(roughDuration(2.54e6 * YEAR)).toBe('2.5 million years');
  });
});

describe('homeDateText', () => {
  it('writes the date in words, or only the year far from now', () => {
    expect(homeDateText(msFromCivil(2032, 4, 11, 9))).toBe('11 April 2032');
    expect(homeDateText(msFromCivil(2_540_000, 6, 1))).toBe('year 2.54 million');
  });

  it('keeps years written with a thousands comma whole', () => {
    expect(homeDateText(msFromCivil(-4994, 3, 14, 17, 5))).toBe('14 March 4,995 BCE');
    expect(homeDateText(msFromCivil(-999, 3, 14))).toBe('14 March 1,000 BCE');
    expect(homeDateText(msFromCivil(-43, 3, 15, 12))).toBe('15 March 44 BCE');
  });
});

describe('arrivalText', () => {
  it('sums up a short trip in one sentence', () => {
    const t = arrivalText({ destName: 'Saturn', earthTime: 78 * 60 + 5, shipTime: 34 * 60 + 2, warp: false, endMs: 0 });
    expect(t.headline).toBe('Arrived at Saturn. The trip took 34 min for you and 1 h 18 min at home.');
    expect(t.more).toBeNull();
  });

  it('adds your age and the date at home for a long one', () => {
    const t = arrivalText({ destName: 'Andromeda', earthTime: 2.54e6 * YEAR, shipTime: 29.2 * YEAR, warp: false, endMs: msFromCivil(2_540_000, 1, 1) });
    expect(t.more).toBe('You are 29 years older. At home it is now year 2.54 million.');
  });

  it('says that the warp has no time on board', () => {
    const t = arrivalText({ destName: 'Mars', earthTime: 120, shipTime: NaN, warp: true, endMs: 0 });
    expect(t.headline).toBe('Arrived at Mars. The trip took 2 min at home.');
    expect(t.more).toMatch(/fiction/);
  });
});

describe('tripCostText', () => {
  it('gives both clocks', () => {
    expect(tripCostText({ shipTime: 3.55 * YEAR, earthTime: 5.93 * YEAR })).toBe('3.5 years for you · 5.9 years at home');
  });
});
