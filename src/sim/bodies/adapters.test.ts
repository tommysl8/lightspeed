/** The cheap paths of the data adapters: one evaluation for a state, and availability without a sample. */
import { describe, expect, it } from 'vitest';
import { astroTimeAt, msFromCivil } from '../../lib/time';
import { relativeOrbitProvider, trackProvider, ttDaysFromMs, type TrackSample } from '.';

const T = msFromCivil(2026, 9, 25);

describe('relativeOrbitProvider', () => {
  it('takes position and velocity from one state evaluation when the model has one', () => {
    const calls = { position: 0, velocity: 0, state: 0 };
    const p = relativeOrbitProvider(
      {
        position: (t, out) => (calls.position++, (out[0] = 1000 * Math.cos(t)), (out[1] = 1000 * Math.sin(t)), (out[2] = 0), out),
        velocity: (t, out) => (calls.velocity++, (out[0] = -1000 * Math.sin(t)), (out[1] = 1000 * Math.cos(t)), (out[2] = 0), out),
        state: (t, pos, vel) => {
          calls.state++;
          pos[0] = 1000 * Math.cos(t);
          pos[1] = 1000 * Math.sin(t);
          pos[2] = 0;
          vel[0] = -1000 * Math.sin(t);
          vel[1] = 1000 * Math.cos(t);
          vel[2] = 0;
        },
        regime: () => 'precise',
      },
      { velocityUnit: 'km/day' },
    );
    const time = astroTimeAt(T);
    const pos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    p.positionAt(time, pos, vel);
    expect(calls).toEqual({ position: 0, velocity: 0, state: 1 });
    expect(pos.x).toBeCloseTo(1000 * Math.cos(time.tt), 9);
    expect(vel.y).toBeCloseTo((1000 * Math.cos(time.tt)) / 86_400, 12);
    // Without a velocity wanted, the position alone.
    p.positionAt(time, pos);
    expect(calls).toEqual({ position: 1, velocity: 0, state: 1 });
  });

  it('converts the frame’s time for availability once, whatever the number of bodies', () => {
    const seen: number[] = [];
    const make = () => relativeOrbitProvider({ position: (_t, out) => out, regime: (t) => (seen.push(t), 'precise') });
    const a = make();
    const b = make();
    a.availability(T);
    b.availability(T);
    expect(seen).toEqual([ttDaysFromMs(T), ttDaysFromMs(T)]);
  });
});

describe('trackProvider availability', () => {
  it('reads the regime without evaluating the track when the source can tell it', () => {
    let evaluations = 0;
    const launch = 10_000; // TT days since J2000
    const p = trackProvider(
      {
        evaluate: (t): TrackSample => (evaluations++, { pos: [1, 0, 0], centre: 'sun', regime: t < launch ? 'before-launch' : 'precise' }),
        regime: (t) => (t < launch ? 'before-launch' : 'precise'),
      },
      { name: 'Probe', centres: {} },
    );
    expect(p.availability(T).available).toBe(false); // 2026 is day ~9765
    expect(p.availability(T).reason).toMatch(/had not been launched/);
    expect(p.availability(msFromCivil(2030, 1, 1)).regime).toBe('precise');
    expect(evaluations).toBe(0);
  });
});
