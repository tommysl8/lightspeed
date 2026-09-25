import { describe, expect, it } from 'vitest';
import { AU_KM, JULIAN_YEAR_S, LIGHT_YEAR_KM } from '../physics/constants';
import { exponentOf, fixed, fmtBeta, fmtGamma, fmtPM, groupDigits, julianDate, pickUnit, qty, sci, sig, superscript } from './sci';

const NB = '\u00a0';

describe('sci formatting', () => {
  it('superscripts exponents', () => {
    expect(superscript(-12)).toBe('⁻¹²');
    expect(superscript(5)).toBe('⁵');
  });

  it('finds decimal exponents at exact powers of ten', () => {
    expect(exponentOf(1000)).toBe(3);
    expect(exponentOf(999.999)).toBe(2);
    expect(exponentOf(0.001)).toBe(-3);
    expect(exponentOf(-2.5e-7)).toBe(-7);
  });

  it('groups digits in threes, SI style', () => {
    expect(groupDigits('299792.458')).toBe(`299${NB}792.458`);
    expect(groupDigits('1234')).toBe('1234');
    expect(groupDigits('0.99999')).toBe(`0.999${NB}99`);
    expect(groupDigits('-12345')).toBe(`−12${NB}345`);
  });

  it('keeps significant figures, trailing zeros included', () => {
    expect(sig(0.5, 4)).toBe('0.5000');
    expect(sig(1234.5, 4)).toBe('1235');
    expect(sig(9.9996, 4)).toBe('10.00');
    expect(sig(0.012345, 3)).toBe('0.0123');
    expect(sig(0, 3)).toBe('0.00');
  });

  it('switches to scientific notation for very large and small values', () => {
    expect(sig(299792458, 4)).toBe('2.998 × 10⁸');
    expect(sig(4.94e-9, 3)).toBe('4.94 × 10⁻⁹');
    expect(sci(9.9996e5, 4)).toBe('1.000 × 10⁶');
  });

  it('uses a true minus sign and never shows −0', () => {
    expect(fixed(-1.5, 2)).toBe('−1.50');
    expect(fixed(-0.0001, 2)).toBe('0.00');
  });

  it('shows β with enough digits near c', () => {
    expect(fmtBeta(0.5)).toBe('0.5000');
    expect(fmtBeta(0.99)).toBe('0.9900');
    expect(fmtBeta(0.999)).toBe(`0.999${NB}00`);
    expect(fmtBeta(0.99999)).toBe(`0.999${NB}990${NB}0`);
    expect(fmtBeta(5.6e-5)).toBe('5.60 × 10⁻⁵');
  });

  it('shows γ as 1 + ε at everyday speeds', () => {
    expect(fmtGamma(1 + 4.94e-9)).toBe('1 + 4.94 × 10⁻⁹');
    expect(fmtGamma(2.294157)).toBe(`2.294${NB}16`);
    expect(fmtGamma(223.6068)).toBe('223.61');
  });

  it('picks natural units', () => {
    expect(pickUnit('time', 30).sym).toBe('s');
    expect(pickUnit('time', 499).sym).toBe('min');
    expect(pickUnit('time', 5 * 3600).sym).toBe('h');
    expect(pickUnit('time', 40 * 86400).sym).toBe('d');
    expect(pickUnit('time', 2 * JULIAN_YEAR_S).sym).toBe('yr');
    expect(pickUnit('length', 384400).sym).toBe('km');
    expect(pickUnit('length', 30 * AU_KM).sym).toBe('au');
    expect(qty(4.2465 * LIGHT_YEAR_KM, 'length', 4)).toEqual({ v: '4.247', u: 'ly' });
  });

  it('computes Julian dates', () => {
    // 2000-01-01 12:00 UTC = JD 2451545.0
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(2451545.0, 9);
  });
});

describe('value ± uncertainty', () => {
  it('rounds σ to two figures and the value to match', () => {
    expect(fmtPM(299792.4612, 0.3517)).toBe(`299${NB}792.46 ± 0.35`);
    expect(fmtPM(0.50123, 0.0021)).toBe('0.5012 ± 0.0021');
    expect(fmtPM(9.80665, 0.0123)).toBe('9.807 ± 0.012');
  });

  it('uses a shared exponent for large or small values', () => {
    expect(fmtPM(2.99792e8, 1.2e5)).toBe('(2.9979 ± 0.0012) × 10⁸');
    expect(fmtPM(4.5e-6, 2.1e-7)).toBe('(4.50 ± 0.21) × 10⁻⁶');
  });

  it('shows negligible σ separately', () => {
    expect(fmtPM(299792.458, 1e-4)).toBe(`299${NB}792.46 ± 1.0 × 10⁻⁴`);
    expect(fmtPM(0.5, 5.9e-17)).toBe(`0.500${NB}000${NB}000 (σ ≈ 0)`);
  });
});
