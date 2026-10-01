import { describe, expect, it } from 'vitest';
import { readJson } from '../../test/files';
import { conicFromState, conicPosition, conicVelocity, eccentricAnomaly, ellipticPosition, hyperbolicAnomaly, K_GAUSS, phaseMagnitude, type Conic } from './conic';
import { toBarycentric } from './barycentre';
import { quantU16, unquantU16 } from './format';

/** The build's reference epoch (scripts/build-asteroids.mjs). */
const REF = 2461200.5;
const DEG = Math.PI / 180;

interface Fixture {
  name: string;
  note: string;
  elements: Record<string, string | null>;
  positions: { jd: number; x: number; y: number; z: number }[];
}
const { bodies } = readJson<{ bodies: Fixture[] }>('src/sim/asteroids/__fixtures__/horizons.json');

/**
 * A fixture body's orbit as the layer holds it: the build's steps (heliocentric, or refitted about the barycentre
 * when q ≥ 7 au) and its rounding (angles and e to 16 bits; a, q, tp in float32).
 */
function asDrawn(el: Record<string, string | null>): { orbit: Conic; bary: boolean } {
  const n = (k: string) => Number(el[k]);
  const helio: Conic = { q: n('q'), e: n('e'), i: n('i') * DEG, node: n('om') * DEG, peri: n('w') * DEG, tp: n('tp') - REF, mu: 1 };
  const bary = helio.q >= 7;
  const o = bary ? toBarycentric(helio, n('epoch'), REF) : helio;
  const r16 = (x: number, span: number) => unquantU16(quantU16(x / span)) * span;
  return {
    bary,
    orbit: {
      q: Math.fround(o.q),
      e: o.e < 0.98 ? r16(o.e, 1) : Math.fround(o.e),
      i: r16(o.i, Math.PI),
      node: r16(o.node, 2 * Math.PI),
      peri: r16(o.peri, 2 * Math.PI),
      tp: Math.fround(o.tp),
      mu: o.mu,
    },
  };
}

/** The stated accuracy (bodies.ts KEPLER_NOTE, docs/data/asteroids.md §5), degrees as seen from the Sun, by years from the epoch. */
function allowedDeg(years: number): number {
  const y = Math.abs(years);
  if (y <= 1.01) return 0.15;
  if (y <= 10.01) return 4;
  return 11;
}

/** Where planets' pulls are known to take a body off its conic: the exceptions the note names. */
function exempt(name: string, jd: number): boolean {
  // Apophis passes about 32,000 km above Earth's surface on 2029 April 13.
  if (name.startsWith('99942 Apophis') && jd > 2462240) return true;
  // 29P passes near Jupiter in 2038.
  if (name.startsWith('29P') && jd > 2465000) return true;
  // Comet Bowell passed 0.23 au from Jupiter on 1980 December 9, which threw it out: before that it was on another orbit.
  if (name.startsWith('C/1980 E1') && jd < 2444582) return true;
  return false;
}

describe('small bodies: two-body motion against JPL Horizons', () => {
  it('has the hyperbolic and near-parabolic comets among its checks', () => {
    const es = bodies.map((b) => Number(b.elements.e));
    expect(es.filter((e) => e > 1).length).toBeGreaterThanOrEqual(3);
    expect(es.some((e) => e > 0.999 && e < 1)).toBe(true);
  });

  for (const b of bodies) {
    it(`${b.name} (${b.note}) stays within the stated accuracy`, async () => {
      const { orbit, bary } = asDrawn(b.elements);
      const epoch = Number(b.elements.epoch);
      const { barycentreState } = await import('./barycentre');
      const p = { x: 0, y: 0, z: 0 };
      for (const h of b.positions) {
        conicPosition(orbit, h.jd - REF, p);
        if (bary) {
          const s = barycentreState(h.jd);
          p.x += s.r.x;
          p.y += s.r.y;
          p.z += s.r.z;
        }
        const r = Math.hypot(h.x, h.y, h.z);
        const errDeg = Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) / r / DEG;
        const years = (h.jd - epoch) / 365.25;
        if (exempt(b.name, h.jd)) continue;
        expect(errDeg, `${years.toFixed(0)} years from the epoch`).toBeLessThan(allowedDeg(years));
      }
    });
  }
});

describe('small bodies: the conic solvers', () => {
  it('solve Kepler’s equation for every e, ellipse and hyperbola', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99, 0.9999]) {
      for (let M = -3.1; M < 3.2; M += 0.37) {
        const E = eccentricAnomaly(M, e);
        const d = E - e * Math.sin(E) - M;
        expect(Math.abs(d - 2 * Math.PI * Math.round(d / (2 * Math.PI)))).toBeLessThan(1e-12);
      }
    }
    for (const e of [1.0001, 1.05, 2, 6]) {
      for (const M of [-50, -1, -1e-4, 0, 1e-4, 0.3, 7, 200]) {
        const F = hyperbolicAnomaly(M, e);
        expect(e * Math.sinh(F) - F).toBeCloseTo(M, 9);
      }
    }
  });

  it('agree at the seam: an ellipse written by a and M, or by q and tp, is the same orbit', () => {
    const a = 2.7;
    const e = 0.2;
    const M0 = 1.1;
    const n = K_GAUSS / Math.pow(a, 1.5);
    const el = { a, e, i: 0.3, node: 1.2, peri: 2.3, M0, mu: 1 };
    const c: Conic = { q: a * (1 - e), e, i: 0.3, node: 1.2, peri: 2.3, tp: -M0 / n, mu: 1 };
    const p = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0 };
    for (const t of [-5000, -100, 0, 37, 4000]) {
      ellipticPosition(el, t, p);
      conicPosition(c, t, q);
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-12);
    }
  });

  it('meet the parabola from both sides as e goes to 1', () => {
    const base = { q: 0.5, i: 0.4, node: 0.5, peri: 0.6, tp: 0, mu: 1 };
    const par = conicPosition({ ...base, e: 1 }, 40, { x: 0, y: 0, z: 0 });
    for (const e of [1 - 1e-7, 1 + 1e-7]) {
      const p = conicPosition({ ...base, e }, 40, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(p.x - par.x, p.y - par.y, p.z - par.z)).toBeLessThan(1e-6);
    }
  });

  it('recover the conic from a state (the barycentric refit’s step)', () => {
    for (const c of [
      { q: 30, e: 0.2, i: 0.3, node: 1, peri: 2, tp: 500, mu: 1 },
      { q: 0.4, e: 1.0002, i: 2.3, node: 4, peri: 0.4, tp: -30, mu: 1 },
      { q: 1.3, e: 1, i: 1, node: 3, peri: 5, tp: 12, mu: 1 },
    ] satisfies Conic[]) {
      const t = 3;
      const r = conicPosition(c, t, { x: 0, y: 0, z: 0 });
      const v = conicVelocity(c, t, { x: 0, y: 0, z: 0 });
      const back = conicFromState(r, v, t, c.mu);
      expect(back.q).toBeCloseTo(c.q, 6);
      expect(back.e).toBeCloseTo(c.e, 6);
      expect(back.tp).toBeCloseTo(c.tp, 3);
      const p = conicPosition(back, 200, { x: 0, y: 0, z: 0 });
      const p0 = conicPosition(c, 200, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(p.x - p0.x, p.y - p0.y, p.z - p0.z)).toBeLessThan(1e-5 * Math.hypot(p0.x, p0.y, p0.z));
    }
  });

  it('dim with phase as the H, G law does (0 at opposition, about 1.3 mag at 30°)', () => {
    expect(phaseMagnitude(0)).toBeCloseTo(0, 6);
    expect(phaseMagnitude(30 * DEG)).toBeGreaterThan(1.1);
    expect(phaseMagnitude(30 * DEG)).toBeLessThan(1.5);
    expect(phaseMagnitude(90 * DEG)).toBeGreaterThan(phaseMagnitude(60 * DEG));
  });
});
