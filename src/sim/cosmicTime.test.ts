import { describe, expect, it } from 'vitest';
import { J2000_MS, JULIAN_YEAR_MS } from '../lib/time';
import { planck18 } from '../physics/cosmology';
import { cosmicAt, cosmicAtMemo, PRESENT_AGE_GYR, PRESENT_DECELERATION } from './cosmicTime';

const GYR_MS = 1e9 * JULIAN_YEAR_MS;
const at = (dtGyr: number) => cosmicAt(J2000_MS + dtGyr * GYR_MS);

describe('the universe at the time on the clock', () => {
  it('is the model at the present', () => {
    const model = planck18();
    expect(PRESENT_AGE_GYR).toBeCloseTo(model.ageGyr(), 4);
    const now = at(0);
    expect(now.a).toBe(1);
    expect(now.tCmbK).toBeCloseTo(2.72548, 6);
    // The deceleration parameter today, q0 = -a a'' / a'^2, from the model.
    const h = 1e-3;
    const age = model.ageGyr();
    const a1 = model.scaleAtTimeGyr(age + h);
    const a0 = model.scaleAtTimeGyr(age - h);
    const adot = (a1 - a0) / (2 * h);
    expect(-(a1 - 2 + a0) / (h * h) / (adot * adot)).toBeCloseTo(PRESENT_DECELERATION, 3);
  });

  it('joins the model smoothly a million years either side of the present', () => {
    const model = planck18();
    for (const dt of [-0.99e-3, -1e-5, 1e-5, 0.99e-3]) {
      expect(Math.abs(at(dt).a - model.scaleAtTimeGyr(model.ageGyr() + dt))).toBeLessThan(1e-10);
    }
    expect(Math.abs(at(1.01e-3).a - at(0.99e-3).a)).toBeLessThan(2e-6);
  });

  it('expands and cools into the future, and was hotter in the past', () => {
    const later = at(10);
    expect(later.a).toBeGreaterThan(1.5);
    expect(later.ageGyr).toBeCloseTo(PRESENT_AGE_GYR + 10, 3);
    expect(later.tCmbK).toBeCloseTo(2.72548 / later.a, 9);
    const early = at(-13.7862); // about 380,000 years after the Big Bang: recombination
    expect(early.a).toBeLessThan(1e-3);
    expect(early.tCmbK).toBeGreaterThan(2700);
    // At or before the Big Bang the age stays at zero and the temperature finite.
    const bang = at(-20);
    expect(bang.ageGyr).toBe(0);
    expect(Number.isFinite(bang.tCmbK)).toBe(true);
  });

  it('gives ln a and a − 1 without cancellation, however near the present', () => {
    const model = planck18();
    for (const dt of [1e-12, -3e-9, 2.67e-8, 5e-4, 0.5, -3, 10, 100]) {
      const u = at(dt);
      expect(Math.abs(u.a - (1 + u.am1)) / u.a).toBeLessThan(3e-16);
      expect(Math.abs(u.lnA - Math.log1p(u.am1))).toBeLessThanOrEqual(1e-15 * Math.max(1, Math.abs(u.lnA)));
      if (Math.abs(dt) >= 1e-3) expect(u.lnA).toBeCloseTo(Math.log(model.scaleAtTimeGyr(model.ageGyr() + dt)), 12);
    }
    // 26.7 years on (the tests' date, 2026), the universe has grown by H0 × 26.7 yr = 1.85 × 10⁻⁹.
    const u = at(26.7e-9);
    expect(u.am1 / (26.7e-9 / (977.79222 / 67.66))).toBeCloseTo(1, 6);
    expect(u.tCmbK).toBeCloseTo(2.72548 * (1 - u.am1), 15);
  });

  it('remembers the last time asked about (the galaxies all ask for the frame’s)', () => {
    const ms = J2000_MS + 7 * GYR_MS;
    const u = cosmicAtMemo(ms);
    expect(cosmicAtMemo(ms)).toBe(u);
    expect(u.a).toBe(cosmicAt(ms).a);
    expect(cosmicAtMemo(J2000_MS).a).toBe(1);
  });
});
