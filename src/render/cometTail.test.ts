import { describe, expect, it } from 'vitest';
import { AU_KM, GM_SUN_KM3_S2 } from '../physics/constants';
import { propagateTwoBody } from '../physics/kepler';
import { cometActivity, dustOffset, ionTailDirection, keplerPosition, SOLAR_WIND_KM_S, tailBrightness, type V3 } from './cometTail';

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('comet activity', () => {
  it('follows sunlight inside 3 au and stops by 5 au', () => {
    expect(cometActivity(1)).toBeCloseTo(1, 12);
    expect(cometActivity(2)).toBeCloseTo(0.25, 12);
    expect(cometActivity(3)).toBeCloseTo(1 / 9, 12);
    expect(cometActivity(4)).toBeLessThan(1 / 16);
    expect(cometActivity(4)).toBeGreaterThan(0);
    expect(cometActivity(5)).toBe(0);
    expect(cometActivity(30)).toBe(0);
    expect(cometActivity(0)).toBe(0);
  });

  it('draws bigger comets brighter, up to a limit', () => {
    expect(tailBrightness(1, 30)).toBeGreaterThan(0.99);
    expect(tailBrightness(1, 1.65)).toBeLessThan(tailBrightness(1, 4.6));
    expect(tailBrightness(6, 30)).toBe(0);
  });
});

describe('two-body motion', () => {
  it('matches the app’s propagator on ellipses and hyperbolas', () => {
    const r = { x: 0.59 * AU_KM, y: 0.1 * AU_KM, z: 0.02 * AU_KM };
    for (const v of [v3(-3, 54, 5), v3(10, 70, -3), v3(0, 30, 0)]) {
      for (const dt of [-30 * 86_400, -86_400, 3600, 20 * 86_400]) {
        const want = propagateTwoBody(r, v, dt, GM_SUN_KM3_S2).r;
        const got = keplerPosition(r, v, dt, GM_SUN_KM3_S2, v3());
        expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z) / norm(want)).toBeLessThan(1e-9);
      }
    }
  });

  it('moves in a straight line with no gravity', () => {
    const p = keplerPosition(v3(1e8, 0, 0), v3(0, 10, 0), 1000, 0, v3());
    expect(p).toEqual({ x: 1e8, y: 10_000, z: 0 });
  });
});

describe('the tails', () => {
  // Halley near its 2061 perihelion: 0.59 au, about 55 km/s, retrograde.
  const r = v3(0.59 * AU_KM, 0, 0);
  const v = v3(0, -54.5, 8);

  it('points the ion tail down the solar wind, a few degrees off the anti-solar direction', () => {
    const d = ionTailDirection(r, v, v3());
    const cos = dot(d, r) / norm(r);
    const deg = (Math.acos(cos) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(1);
    // The aberration: atan(v⊥ / v_sw).
    expect(deg).toBeCloseTo((Math.atan(Math.hypot(v.y, v.z) / SOLAR_WIND_KM_S) * 180) / Math.PI, 6);
    // Swept back, away from the direction of motion.
    expect(dot(d, v)).toBeLessThan(0);
  });

  it('pushes fresh dust straight out from the Sun by ½βgt²', () => {
    const t = 3600;
    const beta = 0.5;
    const g = GM_SUN_KM3_S2 / norm(r) ** 2;
    const d = dustOffset(r, v, beta, t, v3());
    expect(d.x / (0.5 * beta * g * t * t)).toBeCloseTo(1, 2);
    expect(Math.hypot(d.y, d.z) / norm(d)).toBeLessThan(0.05);
    // No radiation pressure: the grain stays with the nucleus.
    expect(norm(dustOffset(r, v, 0, 10 * 86_400, v3()))).toBeLessThan(1);
  });

  it('bends older dust back along the orbit, finer dust further out', () => {
    const old = dustOffset(r, v, 0.5, 20 * 86_400, v3());
    expect(dot(old, v)).toBeLessThan(0);
    expect(dot(old, r)).toBeGreaterThan(0);
    const fine = dustOffset(r, v, 1, 20 * 86_400, v3());
    expect(norm(fine)).toBeGreaterThan(norm(old));
    // Tens of millions of km: the length of real dust tails near 0.6 au.
    expect(norm(fine)).toBeGreaterThan(1e7);
    expect(norm(fine)).toBeLessThan(2e8);
  });
});
