import { describe, expect, it } from 'vitest';
import { MakeTime } from 'astronomy-engine';
import { C_KM_S, type BodyId } from '../physics/constants';
import { astroTimeAt } from '../lib/time';
import { bodyPositionAt, updateEphemeris } from './ephemeris';
import { clearPulses, emitPulse, onDetection, updatePulses, type Detection } from './pulses';
import { sim } from './sim';

const T0 = Date.UTC(2026, 8, 24, 0, 0, 0);

function setTime(ms: number) {
  sim.timeMs = ms;
  // A day count, not a Date: the fastest warp carries the clock past what Date can hold.
  sim.astroTime = astroTimeAt(ms);
  updateEphemeris();
}

/** Run a pulse from Earth (or another source) for `duration` s in steps of `step` s; return the detections. */
function run(step: number, duration: number, source: BodyId = 'earth'): Map<BodyId, Detection> {
  clearPulses();
  setTime(T0);
  const hits = new Map<BodyId, Detection>();
  const off = onDetection((_, d) => hits.set(d.body, d));
  emitPulse(source);
  for (let t = step; t <= duration + 1e-9; t += step) {
    setTime(T0 + t * 1000);
    updatePulses();
  }
  off();
  return hits;
}

describe('light-pulse detectors', () => {
  it('time each crossing exactly: |r_B(t₁) − r_E(t₀)| = c (t₁ − t₀)', () => {
    const hits = run(60, 3 * 3600);
    const origin = bodyPositionAt('earth', MakeTime(new Date(T0)));
    for (const id of ['moon', 'sun', 'venus', 'mars', 'jupiter'] as BodyId[]) {
      const d = hits.get(id);
      expect(d, id).toBeDefined();
      const at = bodyPositionAt(id, MakeTime(new Date(d!.atMs)));
      const dist = at.distanceTo(origin);
      // Detector equation holds to well under a kilometre (≈ 3 µs of flight).
      expect(Math.abs(dist - C_KM_S * d!.dt)).toBeLessThan(1);
      // (Date() in this check rounds to 1 ms, i.e. ~15 m of Earth's motion.)
      expect(Math.abs(d!.d - dist)).toBeLessThan(0.1);
    }
    // The Moon answers in about 1.3 s, the Sun in about 8.3 min.
    expect(hits.get('moon')!.dt).toBeGreaterThan(1.2);
    expect(hits.get('moon')!.dt).toBeLessThan(1.4);
    expect(hits.get('sun')!.dt).toBeGreaterThan(490);
    expect(hits.get('sun')!.dt).toBeLessThan(510);
  });

  it('stays exact at the fastest warp: one frame of 5 million years', () => {
    const step = 1e16 / 60;
    const fine = run(10, 2 * 3600, 'sun');
    const coarse = run(step, step, 'sun');
    for (const id of ['mercury', 'earth', 'mars', 'jupiter'] as BodyId[]) {
      expect(coarse.get(id)!.dt, id).toBeCloseTo(fine.get(id)!.dt, 5);
    }
    // Everything hears it within the frame, Proxima Centauri after 4.25 years.
    expect(coarse.get('proxima')!.dt / (365.25 * 86_400)).toBeCloseTo(4.2465, 3);
  });

  it('gives the same times however coarse the frame steps (time warp)', () => {
    const fine = run(10, 2 * 3600);
    const coarse = run(1800, 2 * 3600);
    for (const id of ['sun', 'venus', 'mars', 'jupiter'] as BodyId[]) {
      expect(coarse.get(id)!.dt, id).toBeCloseTo(fine.get(id)!.dt, 5);
    }
  });
});
