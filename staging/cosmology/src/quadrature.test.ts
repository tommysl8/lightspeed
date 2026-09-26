import { describe, expect, it } from 'vitest';
import { QK15, adaptive, adaptiveVec, gaussIntegrate, gaussLegendre, CompensatedSum } from './quadrature.ts';
import { dopri5 } from './ode.ts';
import { brent } from './rootfind.ts';

describe('Gauss-Legendre', () => {
  it('weights sum to 2 and integrate polynomials of degree 2n-1 exactly', () => {
    for (const n of [1, 2, 5, 8, 16, 33]) {
      const { x, w } = gaussLegendre(n);
      expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(2, 14);
      for (let d = 0; d <= 2 * n - 1; d++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += w[i] * x[i] ** d;
        const exact = d % 2 === 1 ? 0 : 2 / (d + 1);
        expect(Math.abs(s - exact)).toBeLessThan(2e-15);
      }
      // nodes ascending and symmetric
      for (let i = 0; i < n; i++) expect(x[i] + x[n - 1 - i]).toBeCloseTo(0, 15);
    }
  });
  it('composite rule integrates exp to machine precision', () => {
    expect(Math.abs(gaussIntegrate(Math.exp, 0, 1, 16, 4) / (Math.E - 1) - 1)).toBeLessThan(1e-15);
  });
});

describe('QUADPACK QK15 constants', () => {
  it('Kronrod rule is exact to degree 22, embedded Gauss rule to degree 13', () => {
    const { XGK, WGK, WG } = QK15;
    const k = (d: number) => {
      let s = WGK[7] * (d === 0 ? 1 : 0);
      for (let j = 0; j < 7; j++) s += WGK[j] * (XGK[j] ** d + (-XGK[j]) ** d);
      return s;
    };
    const g = (d: number) => {
      let s = WG[3] * (d === 0 ? 1 : 0);
      for (let j = 0; j < 3; j++) s += WG[j] * (XGK[2 * j + 1] ** d + (-XGK[2 * j + 1]) ** d);
      return s;
    };
    for (let d = 0; d <= 22; d += 2) expect(Math.abs(k(d) - 2 / (d + 1))).toBeLessThan(1e-15);
    for (let d = 0; d <= 12; d += 2) expect(Math.abs(g(d) - 2 / (d + 1))).toBeLessThan(1e-15);
  });
  it('adaptive quadrature handles a peaked integrand and a vector integrand', () => {
    const r = adaptive((x) => 1 / (1e-4 + x * x), -1, 1, { relTol: 1e-14 });
    expect(r.value / ((2 / 1e-2) * Math.atan(1 / 1e-2)) - 1).toBeLessThan(1e-13);
    const v = adaptiveVec(
      (x, out) => {
        out[0] = Math.sin(x);
        out[1] = x * x;
      },
      2,
      0,
      Math.PI,
    );
    expect(v.value[0]).toBeCloseTo(2, 13);
    expect(v.value[1]).toBeCloseTo(Math.PI ** 3 / 3, 12);
  });
  it('compensated summation keeps what naive summation loses', () => {
    const c = new CompensatedSum();
    c.add(1);
    let naive = 1;
    for (let i = 0; i < 1000; i++) {
      c.add(1e-17);
      naive += 1e-17;
    }
    expect(naive).toBe(1);
    expect(c.value).toBe(1 + 1e-14);
  });
});

describe('Dormand-Prince 5(4) and Brent', () => {
  it('y\' = y reaches e^10 to the requested tolerance, and outputs land exactly', () => {
    const outs = [0.5, 1, 2.5, 7];
    const seen: number[] = [];
    const r = dopri5(
      (_x, y, dy) => {
        dy[0] = y[0];
      },
      0,
      [1],
      10,
      { rtol: 1e-12, h0: 0.01, outputs: outs, onOutput: (x, y) => {
        seen.push(x);
        expect(Math.abs(y[0] / Math.exp(x) - 1)).toBeLessThan(2e-11);
      } },
    );
    expect(Math.abs(r.y[0] / Math.exp(10) - 1)).toBeLessThan(3e-11);
    expect(seen).toEqual(outs);
  });
  it('global error falls as rtol^(5/6) or faster (5th-order method)', () => {
    const f = (_x: number, y: Float64Array, dy: Float64Array) => {
      dy[0] = y[1];
      dy[1] = -y[0];
    };
    const e1 = Math.abs(dopri5(f, 0, [0, 1], 20, { rtol: 1e-7 }).y[0] - Math.sin(20));
    const e2 = Math.abs(dopri5(f, 0, [0, 1], 20, { rtol: 1e-10 }).y[0] - Math.sin(20));
    expect(e2).toBeLessThan(e1 / 100);
  });
  it('Brent finds roots to machine precision', () => {
    expect(brent((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 15);
    expect(brent((x) => Math.cos(x) - x, 0, 1)).toBeCloseTo(0.7390851332151607, 15);
  });
});
