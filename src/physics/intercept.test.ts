import { describe, expect, it } from 'vitest';
import { solveIntercept } from './intercept';

describe('intercept', () => {
  const v = 1000;
  it('matches the analytic answer for a receding target', () => {
    const d = 1e7;
    const u = 30;
    const res = solveIntercept((t) => ({ x: d + u * t, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, v, 0)!;
    expect(res.time).toBeCloseTo(d / (v - u), 3);
  });

  it('respects the standoff distance', () => {
    const res = solveIntercept(() => ({ x: 5e6, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, v, 1e6)!;
    expect(res.time).toBeCloseTo(4e6 / v, 3);
  });

  it('leads a target crossing the line of sight', () => {
    const res = solveIntercept((t) => ({ x: 1e7, y: 200 * t, z: 0 }), { x: 0, y: 0, z: 0 }, v, 0)!;
    // |(1e7, 200T)| = vT  →  T = 1e7 / √(v² − 200²)
    expect(res.time).toBeCloseTo(1e7 / Math.sqrt(v * v - 200 * 200), 2);
  });

  it('reports when a faster target cannot be caught', () => {
    expect(solveIntercept((t) => ({ x: 1e7 + 2000 * t, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, v, 0)).toBeNull();
  });
});
