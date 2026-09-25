import { describe, expect, it } from 'vitest';
import { gaussian, hashSeed, linearFit, mean, mulberry32, proportionalFit, sem, stdev } from './stats';

describe('least squares', () => {
  it('recovers an exact line', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => 3 + 2 * x);
    const f = linearFit(xs, ys)!;
    expect(f.a).toBeCloseTo(3, 12);
    expect(f.b).toBeCloseTo(2, 12);
    expect(f.r2).toBeCloseTo(1, 12);
    expect(f.sb).toBeLessThan(1e-12);
  });

  it('matches the textbook example (Taylor, problem-style data)', () => {
    // y = a + b x with scatter; values checked against a hand calculation.
    const xs = [0, 1, 2, 3, 4];
    const ys = [1.1, 2.9, 5.2, 6.8, 9.1];
    const f = linearFit(xs, ys)!;
    // b = Σ(x−x̄)(y−ȳ)/Σ(x−x̄)² = 19.9/10 = 1.99; a = ȳ − b x̄ = 5.02 − 3.98 = 1.04
    expect(f.b).toBeCloseTo(1.99, 10);
    expect(f.a).toBeCloseTo(1.04, 10);
    // residuals: 0.06, −0.13, 0.18, −0.21, 0.10 → SSR = 0.107, s² = 0.107/3
    expect(f.sb).toBeCloseTo(Math.sqrt(0.107 / 3 / 10), 10);
    expect(f.sa).toBeCloseTo(Math.sqrt((0.107 / 3) * (1 / 5 + 4 / 10)), 10);
    expect(f.ndf).toBe(3);
  });

  it('weights by 1/σ² and reports χ²', () => {
    const xs = [1, 2, 3, 4];
    const ys = [2.1, 3.9, 6.2, 7.8];
    const sy = [0.1, 0.1, 0.1, 0.1];
    const w = linearFit(xs, ys, sy)!;
    const u = linearFit(xs, ys)!;
    // Equal σ: same line as unweighted.
    expect(w.b).toBeCloseTo(u.b, 12);
    expect(w.weighted).toBe(true);
    // σ_b = σ/√Σ(x−x̄)² = 0.1/√5
    expect(w.sb).toBeCloseTo(0.1 / Math.sqrt(5), 12);
    expect(w.chi2).toBeGreaterThan(0);
  });

  it('fits a line through the origin', () => {
    const xs = [1, 2, 3];
    const ys = [2, 4.1, 5.9];
    const f = proportionalFit(xs, ys)!;
    expect(f.b).toBeCloseTo((2 + 8.2 + 17.7) / 14, 12);
    expect(f.ndf).toBe(2);
  });

  it('refuses degenerate input', () => {
    expect(linearFit([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(linearFit([1], [1])).toBeNull();
  });
});

describe('descriptive statistics and noise', () => {
  it('computes mean, sample standard deviation and standard error', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    expect(stdev(xs)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(sem(xs)).toBeCloseTo(Math.sqrt(32 / 7) / Math.sqrt(8), 12);
  });

  it('generates reproducible standard normal deviates', () => {
    const r1 = mulberry32(hashSeed('row-1'));
    const r2 = mulberry32(hashSeed('row-1'));
    expect(gaussian(r1)).toBe(gaussian(r2));
    const r = mulberry32(42);
    const xs = Array.from({ length: 20000 }, () => gaussian(r));
    expect(Math.abs(mean(xs))).toBeLessThan(0.03);
    expect(stdev(xs)).toBeGreaterThan(0.97);
    expect(stdev(xs)).toBeLessThan(1.03);
  });
});
