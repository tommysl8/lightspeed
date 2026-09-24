import { describe, expect, it } from 'vitest';
import {
  elementsToPosition,
  orbitOffset,
  orbitPosition,
  propagateTwoBody,
  solveKepler,
  solveKeplerHyperbolic,
  stateToOrbit,
} from './kepler';
import {
  AU_KM,
  DAY_S,
  GM_SOLAR_SYSTEM_KM3_S2,
  GM_SUN_KM3_S2,
  VOYAGER1_CHECK_STATES,
  VOYAGER1_STATE,
} from './constants';
import { distance, length, type Vec3 } from './vec';

const mu = GM_SUN_KM3_S2;

describe("Kepler's equation", () => {
  it('solves the elliptic case', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (let M = -6; M <= 6; M += 0.37) {
        const E = solveKepler(M, e);
        const m = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        expect(E - e * Math.sin(E)).toBeCloseTo(m, 10);
      }
    }
  });

  it('solves the hyperbolic case', () => {
    for (const e of [1.1, 2, 6]) {
      for (const M of [-50, -3, 0.2, 5, 80]) {
        const H = solveKeplerHyperbolic(M, e);
        expect(e * Math.sinh(H) - H).toBeCloseTo(M, 8);
      }
    }
  });
});

describe('state vector → osculating orbit', () => {
  it("a circular 1 au orbit has Earth's period (Kepler's third law)", () => {
    const r: Vec3 = { x: AU_KM, y: 0, z: 0 };
    const v: Vec3 = { x: 0, y: Math.sqrt(mu / AU_KM), z: 0 };
    const o = stateToOrbit(r, v, mu);
    expect(o.a / AU_KM).toBeCloseTo(1, 10);
    expect(o.e).toBeLessThan(1e-10);
    expect(o.period / DAY_S).toBeCloseTo(365.2569, 3);
  });

  it('places the body on its own orbit, for ellipses and hyperbolas', () => {
    const cases: [Vec3, Vec3][] = [
      [{ x: 1.2e8, y: 3e7, z: 1e7 }, { x: -5, y: 30, z: 3 }], // eccentric ellipse
      [{ x: 2e9, y: -1e9, z: 4e8 }, { x: 10, y: 12, z: -3 }], // hyperbola (v > escape)
    ];
    for (const [r, v] of cases) {
      const o = stateToOrbit(r, v, mu);
      const p = orbitPosition(o, o.anomaly);
      expect(distance(p, r) / length(r)).toBeLessThan(1e-10);
      // Offset form agrees with the difference of positions.
      const dA = o.hyperbolic ? 0.3 : 1.1;
      const off = orbitOffset(o, dA);
      const p2 = orbitPosition(o, o.anomaly + dA);
      expect(distance({ x: p.x + off.x, y: p.y + off.y, z: p.z + off.z }, p2) / length(r)).toBeLessThan(1e-10);
    }
  });

  it('elementsToPosition agrees with stateToOrbit', () => {
    const r: Vec3 = { x: 3.1e8, y: -2.2e8, z: 5e7 };
    const v: Vec3 = { x: 9.5, y: 12.1, z: -1.4 };
    const o = stateToOrbit(r, v, mu);
    const p = elementsToPosition(o.a, o.e, o.i, o.node, o.argPeri, o.meanAnomaly);
    expect(distance(p, r) / length(r)).toBeLessThan(1e-9);
  });
});

describe('two-body propagation', () => {
  it('returns to the start after one period', () => {
    const r: Vec3 = { x: 1.5e8, y: 2e7, z: -1e7 };
    const v: Vec3 = { x: -3, y: 28, z: 2 };
    const o = stateToOrbit(r, v, mu);
    const out = propagateTwoBody(r, v, o.period, mu);
    expect(distance(out.r, r) / length(r)).toBeLessThan(1e-9);
  });

  it('conserves energy on a hyperbola', () => {
    const r: Vec3 = { x: 1e9, y: 0, z: 0 };
    const v: Vec3 = { x: 5, y: 20, z: 0 };
    const e0 = (v.x ** 2 + v.y ** 2) / 2 - mu / 1e9;
    const out = propagateTwoBody(r, v, 20 * 365.25 * DAY_S, mu);
    const e1 = (out.v.x ** 2 + out.v.y ** 2 + out.v.z ** 2) / 2 - mu / length(out.r);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-9);
  });

  it('reproduces JPL Horizons positions of Voyager 1 ten years either side of the reference epoch', () => {
    const r0 = { x: VOYAGER1_STATE.r[0], y: VOYAGER1_STATE.r[1], z: VOYAGER1_STATE.r[2] };
    const v0 = { x: VOYAGER1_STATE.v[0], y: VOYAGER1_STATE.v[1], z: VOYAGER1_STATE.v[2] };
    for (const check of VOYAGER1_CHECK_STATES) {
      const dt = (check.epochJdTdb - VOYAGER1_STATE.epochJdTdb) * DAY_S;
      const { r } = propagateTwoBody(r0, v0, dt, GM_SOLAR_SYSTEM_KM3_S2);
      const truth = { x: check.r[0], y: check.r[1], z: check.r[2] };
      // Observed residual ≈ 184,000 km, the same size and direction ten years either side of the
      // epoch: a constant ~4×10⁻⁹ m/s² acceleration, likely non-gravitational forces in JPL's fitted
      // trajectory (thrusters, RTG heat) that pure gravity omits. That is 7 parts per million of
      // the distance. (A heliocentric two-body model is off by ~5 million km.)
      expect(distance(r, truth)).toBeLessThan(3e5);
      expect(distance(r, truth) / length(truth)).toBeLessThan(1.5e-5);
    }
  });
});
