import { describe, expect, it } from 'vitest';
import { commonExponent, linearMinor, linearTicks, logDomain, logTicks, niceDomain, niceStep, tickDecimals } from './ticks';

describe('axis ticks', () => {
  it('chooses 1-2-5 steps', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 4)).toBe(0.2);
    expect(niceStep(360, 6)).toBe(50);
    expect(niceStep(3e8, 5)).toBe(5e7);
  });

  it('places ticks on whole steps inside the range', () => {
    const { ticks, step } = linearTicks(-0.3, 1.05, 5);
    expect(step).toBe(0.2);
    expect(ticks[0]).toBeCloseTo(-0.2, 12);
    expect(ticks.at(-1)).toBeCloseTo(1.0, 12);
    expect(ticks).toContain(0);
  });

  it('adds minor ticks between majors', () => {
    const minor = linearMinor(0, 1, 0.5);
    expect(minor.map((m) => +m.toFixed(6))).toEqual([0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9]);
    expect(linearMinor(0, 2, 2).length).toBe(3);
  });

  it('expands domains to nice bounds', () => {
    expect(niceDomain(0.13, 0.97)).toEqual([0, 1]);
    expect(niceDomain(5, 5)).toEqual([4.5, 5.5]);
  });

  it('builds decade ticks for log axes', () => {
    const t = logTicks(0.05, 200);
    expect(t.major).toEqual([0.1, 1, 10, 100]);
    expect(t.minor).toContain(0.2);
    expect(t.minor).toContain(50);
    expect(logDomain(0.05, 200)).toEqual([0.01, 1000]);
  });

  it('factors a common exponent out of long labels', () => {
    expect(commonExponent([0, 1e5, 2e5, 3e5])).toBe(5);
    expect(commonExponent([0, 0.5, 1])).toBe(0);
    expect(commonExponent([0, 0.0005, 0.001])).toBe(-3);
    expect(tickDecimals(5e4, 5)).toBe(1);
    expect(tickDecimals(0.25)).toBe(1);
  });
});
