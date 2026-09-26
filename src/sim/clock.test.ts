import { beforeEach, describe, expect, it } from 'vitest';
import { msFromCivil } from '../lib/time';
import {
  EPOCH_MAX_MS,
  EPOCH_MIN_MS,
  TIME_MAX_MS,
  TIME_MIN_MS,
  WARP_LABELS,
  WARP_STEPS,
  advanceClock,
  followWallClock,
  resetToNow,
  setEpoch,
  setPaused,
  setWarp,
  stepWarp,
  warpLabel,
} from './clock';
import { setSimTime, sim } from './sim';
import { tickClock } from './tick';
import { launch, planTrip, travel } from './travel';
import { updateEphemeris } from './ephemeris';

beforeEach(() => {
  setPaused(false);
  setWarp(1);
});

describe('time warp', () => {
  it('offers real time up to 320 million years a second, with computed labels', () => {
    expect(WARP_STEPS).toEqual([1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e12, 1e14, 1e16]);
    expect(WARP_STEPS.map((w) => WARP_LABELS[w])).toEqual([
      'real time',
      '10 s/s',
      '1.7 min/s',
      '17 min/s',
      '2.8 h/s',
      '1.2 days/s',
      '12 days/s',
      '3.8 months/s',
      '3.2 years/s',
      '32 years/s',
      '320 years/s',
      '32,000 years/s',
      '3.2 million years/s',
      '320 million years/s',
    ]);
    expect(warpLabel(3)).toBe('3 s/s');
  });

  it('steps from any warp to the neighbouring step', () => {
    setWarp(1e10);
    stepWarp(1);
    expect(sim.warp).toBe(1e12);
    setWarp(3e5); // set by hand, between steps
    stepWarp(1);
    expect(sim.warp).toBe(1e6);
    setWarp(3e5);
    stepWarp(-1);
    expect(sim.warp).toBe(1e5);
    setWarp(1e16);
    stepWarp(1);
    expect(sim.warp).toBe(1e16);
  });
});

describe('the clock', () => {
  it('keeps running at real time where a float64 only resolves 4 s (year 10⁹)', () => {
    const start = msFromCivil(1e9, 1, 1);
    setSimTime(start);
    for (let i = 0; i < 6000; i++) advanceClock(1 / 60); // 100 s in 16.7 ms frames
    // Without the carried remainder every frame would round away and the clock would freeze.
    expect(Math.abs(sim.timeMs - start - 100_000)).toBeLessThanOrEqual(4096);
    // With the carry the total is exact (the difference first: adding the carry to a 10¹⁹ ms count would round).
    expect(Math.abs(sim.timeMs - start + sim.timeCarryMs - 100_000)).toBeLessThan(1e-3);
  });

  it('is exact at ordinary dates and warps', () => {
    setSimTime(Date.UTC(2026, 8, 25));
    for (let i = 0; i < 600; i++) advanceClock(1e10 / 60);
    expect((sim.timeMs - Date.UTC(2026, 8, 25)) / 1000 / 1e11).toBeCloseTo(1, 12);
  });

  it('stops at the ends of time, and pauses', () => {
    setSimTime(TIME_MAX_MS - 1e12);
    const applied = advanceClock(1e16);
    expect(sim.timeMs).toBe(TIME_MAX_MS);
    // 10¹² ms before the end is itself only resolved to 67 s there.
    expect(applied / 1e9).toBeCloseTo(1, 4);
    expect(sim.paused).toBe(true);
    setPaused(false);
    setSimTime(TIME_MIN_MS + 5000);
    advanceClock(-1e3);
    expect(sim.timeMs).toBe(TIME_MIN_MS);
    expect(TIME_MAX_MS).toBe(msFromCivil(1e13, 1, 1));
  });

  it('sets any epoch from 10,000 BCE to 9999 CE', () => {
    expect(setEpoch(msFromCivil(-4000, 3, 21))).toBe(true);
    expect(sim.timeMs).toBe(msFromCivil(-4000, 3, 21));
    setEpoch(msFromCivil(20_000, 1, 1));
    expect(sim.timeMs).toBe(EPOCH_MAX_MS);
    setEpoch(msFromCivil(-20_000, 1, 1));
    expect(sim.timeMs).toBe(EPOCH_MIN_MS);
    expect(EPOCH_MIN_MS).toBe(msFromCivil(-9999, 1, 1));
  });
});

describe('the present', () => {
  const NOW = msFromCivil(2026, 9, 25, 12);

  it('keeps a live clock on the computer’s clock however the frames run', () => {
    resetToNow();
    setSimTime(NOW);
    expect(sim.live).toBe(true);
    // A tab hidden for five minutes: one clamped 0.1 s frame on return, yet the clock catches up.
    const dt = tickClock(0.1, NOW + 300_000);
    expect(sim.timeMs).toBe(NOW + 300_000);
    expect(dt).toBe(300);
    // Frames slower than real time (8 fps with 0.1 s clamping) do not fall behind either.
    tickClock(0.1, NOW + 300_125);
    expect(sim.timeMs).toBe(NOW + 300_125);
    expect(sim.live).toBe(true);
  });

  it('never runs a live clock backwards on a jitter, and follows a clock set back as Now would', () => {
    resetToNow();
    setSimTime(NOW);
    expect(followWallClock(NOW - 5)).toBe(0);
    expect(sim.timeMs).toBe(NOW);
    expect(followWallClock(NOW - 3_600_000)).toBe(0);
    expect(sim.timeMs).toBe(NOW - 3_600_000);
  });

  it('stops being live on a pause, another rate or a date, and Now brings it back', () => {
    resetToNow();
    setPaused(true);
    expect(sim.live).toBe(false);
    resetToNow();
    setWarp(10);
    expect(sim.live).toBe(false);
    setWarp(1);
    expect(sim.live).toBe(false); // back to real time, but behind the present
    resetToNow();
    expect(sim.live).toBe(true);
    setEpoch(msFromCivil(1969, 7, 20));
    expect(sim.live).toBe(false);
    resetToNow();
  });

  it('once off the present, runs by frame time rather than jumping to the computer’s clock', () => {
    resetToNow();
    setSimTime(NOW);
    setPaused(true);
    setPaused(false);
    tickClock(0.1, NOW + 300_000);
    expect(sim.timeMs).toBe(NOW + 100);
    resetToNow();
  });

  it('is not live during a trip', () => {
    resetToNow();
    setSimTime(NOW);
    updateEphemeris();
    launch(planTrip('mars', 0.5, sim.bodies.earth.pos.clone().addScalar(30_000), sim.astroTime)!);
    expect(sim.live).toBe(false);
    travel.trip = null;
    resetToNow();
  });
});
