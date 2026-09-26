/**
 * The fitted moons' position-and-velocity evaluator against the staging evaluator (positions to
 * the bit) and against a fourth-order numerical derivative of itself (velocities), inside the
 * precise window, in the fade beyond it and far outside it.
 */
import { describe, expect, it } from 'vitest';
import data from '../../../../public/data/moons.json';
import { moonState, type FittedMoonModel } from './moonState';

interface Catalogue {
  format: string;
  moons: (FittedMoonModel & { id: string; orbit: { period: number } })[];
}

const catalogue = data as unknown as Catalogue;

type EvalMoon = (m: unknown, t: number, out: number[]) => number[];
/** The staging evaluator, or its copy once moved into src/sim, whichever is there. */
const evaluators = import.meta.glob<{ evalMoon: EvalMoon }>(['../../../../staging/phase2/src/sim/moonModels.ts', '../../moonModels.ts']);

async function stagingEvalMoon(): Promise<EvalMoon | null> {
  const load = Object.values(evaluators)[0];
  return load ? (await load()).evalMoon : null;
}

const pos = (m: FittedMoonModel, t: number): [number, number, number] => {
  const p: [number, number, number] = [0, 0, 0];
  moonState(m, t, p, [0, 0, 0]);
  return p;
};

/** Velocity by a five-point central difference (error of order h⁴), km/day. */
function numericalVelocity(m: FittedMoonModel, t: number, h: number): number[] {
  const a = pos(m, t - 2 * h);
  const b = pos(m, t - h);
  const c = pos(m, t + h);
  const d = pos(m, t + 2 * h);
  return [0, 1, 2].map((i) => (a[i] - 8 * b[i] + 8 * c[i] - d[i]) / (12 * h));
}

describe('fitted moon states', () => {
  it('read the catalogue format they were written for', () => {
    expect(catalogue.format).toMatch(/^lightspeed-moons\/1/);
    expect(catalogue.moons.length).toBeGreaterThanOrEqual(25);
  });

  it('give exactly the staging evaluator’s positions', async () => {
    const evalMoon = await stagingEvalMoon();
    if (!evalMoon) return; // neither is there: the velocity tests below still hold
    let checked = 0;
    for (const m of catalogue.moons) {
      for (const t of [9765.5, m.window[0] + 10, m.window[1] - 10, m.window[1] + 0.3 * m.taper, m.window[0] - 2 * m.taper, 3.6e8]) {
        const want = evalMoon(m, t, [0, 0, 0]);
        const got = pos(m, t);
        expect(got, `${m.id} at ${t}`).toEqual(want);
        checked++;
      }
    }
    expect(checked).toBe(6 * catalogue.moons.length);
  });

  it('give the time derivative of those positions, everywhere', () => {
    for (const m of catalogue.moons) {
      const h = m.orbit.period / 4000;
      const dates = [
        9765.5, // 2026, inside the window
        m.window[1] + 0.37 * m.taper, // fading out after it
        m.window[0] - 0.61 * m.taper, // fading out before it
        m.window[1] + 3 * m.taper, // the mean orbit, far outside
      ];
      for (const t of dates) {
        const v: [number, number, number] = [0, 0, 0];
        moonState(m, t, [0, 0, 0], v);
        const want = numericalVelocity(m, t, h);
        const speed = Math.hypot(...want);
        const err = Math.hypot(v[0] - want[0], v[1] - want[1], v[2] - want[2]);
        expect(err / speed, `${m.id} at ${t}`).toBeLessThan(1e-7);
      }
    }
  });
});
