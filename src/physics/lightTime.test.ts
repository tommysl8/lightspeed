import { describe, expect, it } from 'vitest';
import { AU_KM, BODIES, C_KM_S, LIGHT_YEAR_KM, PROXIMA_DISTANCE_KM, PARSEC_KM } from './constants';
import { lightTime, pulseArrival, retardedDelay, signalDelay } from './lightTime';

describe('light-travel time sanity checks', () => {
  it('Sun → Earth (1 au) ≈ 499 s (8 min 19 s)', () => {
    const t = lightTime(AU_KM);
    expect(t).toBeCloseTo(499.004_784, 5);
    expect(Math.floor(t / 60)).toBe(8);
    expect(Math.floor(t % 60)).toBe(19);
  });

  it('Sun → Pluto at mean distance ≈ 5.5 h', () => {
    const hours = lightTime(BODIES.pluto.semiMajorAxisKm!) / 3600;
    expect(hours).toBeGreaterThan(5.4);
    expect(hours).toBeLessThan(5.6);
  });

  it('Proxima Centauri ≈ 4.24–4.25 light-years (Gaia DR3: 4.2465)', () => {
    const ly = PROXIMA_DISTANCE_KM / LIGHT_YEAR_KM;
    expect(ly).toBeGreaterThan(4.24);
    expect(ly).toBeLessThan(4.25);
  });

  it('uses exact definitions', () => {
    expect(C_KM_S).toBe(299_792.458);
    expect(AU_KM).toBe(149_597_870.7);
    expect(LIGHT_YEAR_KM).toBeCloseTo(9_460_730_472_580.8, 1);
    expect(PARSEC_KM / AU_KM).toBeCloseTo(206_264.806_247, 5);
  });
});

describe('light-delay solvers', () => {
  const d = 1e9;

  it('static source: delay = d/c', () => {
    const tau = retardedDelay(() => ({ x: d, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
    expect(tau).toBeCloseTo(d / C_KM_S, 9);
  });

  it('receding source: we see it where it was, τ = d/(c + u)', () => {
    const u = 30; // km/s
    const tau = retardedDelay((dt) => ({ x: d + u * dt, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
    expect(tau).toBeCloseTo(d / (C_KM_S + u), 6);
  });

  it('receding target: a signal must catch up, τ = d/(c − u)', () => {
    const u = 30;
    const tau = signalDelay((dt) => ({ x: d + u * dt, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
    expect(tau).toBeCloseTo(d / (C_KM_S - u), 6);
  });
});

describe('pulse arrival', () => {
  it('times a pulse to a receiver at rest', () => {
    const d = 1.5e8;
    const t = pulseArrival(() => ({ x: d, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, 0, 0, 1000);
    expect(t).toBeCloseTo(d / C_KM_S, 5);
  });

  it('times a pulse chasing a receiver that recedes', () => {
    // Receiver starts at d and recedes at v: d + v t = c t  ⇒  t = d / (c − v)
    const d = 7.8e8;
    const v = 13;
    const t = pulseArrival((s) => ({ x: d + v * s, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, 0, 0, 1e4);
    expect(t).toBeCloseTo(d / (C_KM_S - v), 5);
  });

  it('respects the emission time and an off-axis origin', () => {
    const t = pulseArrival(() => ({ x: 0, y: 3e5, z: 4e5 }), { x: 0, y: 0, z: 0 }, 100, 100, 200);
    expect(t).toBeCloseTo(100 + 5e5 / C_KM_S, 5);
  });
});

describe('pulse arrival, cheaply', () => {
  it('takes a handful of ephemeris calls, not thirty, for a moving receiver', () => {
    // A moon on a circular orbit 1.2 million km from the origin, crossed within a 60 s frame.
    let calls = 0;
    const R = 1.2e6;
    const w = (2 * Math.PI) / (16 * 86_400);
    const at = (t: number) => (calls++, { x: R * Math.cos(w * t), y: R * Math.sin(w * t), z: 3e4 });
    const t = pulseArrival(at, { x: 0, y: 0, z: 0 }, 0, 0, 60, 1e-7);
    const d = Math.hypot(R, 3e4);
    expect(t).toBeCloseTo(d / C_KM_S, 7);
    expect(calls).toBeLessThanOrEqual(6);
  });

  it('holds its accuracy over a frame of millions of years', () => {
    // Mercury-like: a circle about the origin, so the front reaches it at R/c whenever it is.
    let calls = 0;
    const R = 5.8e7;
    const w = (2 * Math.PI) / (88 * 86_400);
    const t = pulseArrival((s) => (calls++, { x: R * Math.cos(w * s), y: R * Math.sin(w * s), z: 0 }), { x: 0, y: 0, z: 0 }, 0, 0, 1.6e14, 1e-7);
    expect(t).toBeCloseTo(R / C_KM_S, 6);
    expect(calls).toBeLessThanOrEqual(8);
  });

  it('answers at the ends of the bracket when the front is already there, or not yet', () => {
    expect(pulseArrival(() => ({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, 0, 5, 10)).toBe(5);
    expect(pulseArrival(() => ({ x: 1e12, y: 0, z: 0 }), { x: 0, y: 0, z: 0 }, 0, 0, 10)).toBe(10);
  });
});
