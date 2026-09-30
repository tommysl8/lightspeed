import { describe, expect, it } from 'vitest';
import { MakeTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { framingDistance } from '../controls/framing';
import { gamma } from '../physics/relativity';
import { bodyPositionAt, updateEphemeris } from './ephemeris';
import { planFlight, planTrip } from './travel';
import { registerGalaxyCore } from './galaxy/load';
import { setSimTime, sim } from './sim';
import { blackHoleRsKm } from '../controls/cameraController';

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

  it('refuses to set out from within 30 r_s of a black hole, and plans from just outside it', () => {
    registerGalaxyCore();
    setSimTime(Date.UTC(2026, 8, 24, 15));
    updateEphemeris();
    const hole = sim.bodies['sgr-a-star'].pos;
    const rs = blackHoleRsKm('sgr-a-star');
    const out = new Vector3(0.6, 0, 0.8);
    const deep = planFlight('s2', 0.5, hole.clone().addScaledVector(out, 29 * rs));
    expect(deep.ok).toBe(false);
    const r = !deep.ok ? deep.refusal : null;
    expect(r?.reason).toBe('gravity-well');
    expect(r?.hole).toBe('sgr-a-star');
    expect(r?.wellKm).toBeCloseTo(30 * rs, 0);
    expect(planFlight('s2', 0.5, hole.clone().addScaledVector(out, 31 * rs)).ok).toBe(true);
    // Arrivals are unchanged: a flight to it ends at its framing distance, far outside.
    expect(planTrip('sgr-a-star', 0.5, from, t0)).not.toBeNull();
  });

  it('takes about 499 s at (nearly) light speed from the Sun to Earth', () => {
    const sunSide = new Vector3(0, 0, 0);
    const p = planTrip('earth', 0.99999, sunSide, t0)!;
    // 1 au minus the ~25,000 km standoff, at 0.99999c
    expect(p.earthTime).toBeGreaterThan(490);
    expect(p.earthTime).toBeLessThan(510);
  });
});
