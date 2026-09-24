import { describe, expect, it } from 'vitest';
import { MakeTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { framingDistance } from '../controls/framing';
import { gamma } from '../physics/relativity';
import { bodyPositionAt } from './ephemeris';
import { planTrip } from './travel';

describe('trip planning', () => {
  const t0 = MakeTime(new Date('2026-09-24T15:00:00Z'));
  const from = bodyPositionAt('earth', t0).add(new Vector3(26_000, 0, 0));

  it('keeps distance = speed × Earth time, and ship time = Earth time / γ', () => {
    for (const beta of [0.001, 0.5, 0.99]) {
      const p = planTrip('mars', beta, from, t0)!;
      expect(p.distance / (p.speed * p.earthTime)).toBeCloseTo(1, 6);
      expect(p.shipTime * gamma(beta)).toBeCloseTo(p.earthTime, 3);
    }
  });

  it('arrives where Mars will be, at the standoff distance', () => {
    const p = planTrip('mars', 0.01, from, t0)!;
    const marsThen = bodyPositionAt('mars', t0.AddDays(p.earthTime / 86_400));
    expect(Math.abs(p.aim.distanceTo(marsThen) - framingDistance('mars')) / framingDistance('mars')).toBeLessThan(1e-3);
  });

  it('takes about 499 s at (nearly) light speed from the Sun to Earth', () => {
    const sunSide = new Vector3(0, 0, 0);
    const p = planTrip('earth', 0.99999, sunSide, t0)!;
    // 1 au minus the ~25,000 km standoff, at 0.99999c
    expect(p.earthTime).toBeGreaterThan(490);
    expect(p.earthTime).toBeLessThan(510);
  });
});
