/**
 * The near-Sun draw counts: drawing the first `count` stars shows exactly what drawing all
 * 329,770 does, from anywhere within 0.05 pc of the Sun, within the years each count is for.
 * Checked against the star shader's own arithmetic (render/shaders/stars.vert.glsl) from many
 * places and dates, with light-time on and off.
 */
import { describe, expect, it } from 'vitest';
import { loadStars } from '../../test/stars';
import type { Stars3D } from './catalogue';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';
import { NEAR_SUN_PC, NEAR_SUN_YEARS, STAR_FADE_MAG, STAR_MAG_LIMIT, nearSunCounts, nearSunDrawCount } from './visibility';

const stars = loadStars();
const counts = nearSunCounts(stars);

/**
 * Index of the last star that shows from `cam` (pc) `years` after J2000, or −1: its apparent
 * magnitude as the star shader works it out (float64 here) is under the end of the fade.
 */
function lastVisible(s: Stars3D, cam: readonly number[], years: number, retarded: boolean): number {
  const cut = STAR_MAG_LIMIT + STAR_FADE_MAG;
  const u = s.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = s.positions;
  const V = s.velocitiesInt16;
  let last = -1;
  for (let i = 0; i < s.count; i++) {
    const px = P[3 * i], py = P[3 * i + 1], pz = P[3 * i + 2];
    const vx = V[3 * i] * u, vy = V[3 * i + 1] * u, vz = V[3 * i + 2] * u;
    const t = years + Math.sqrt(px * px + py * py + pz * pz) / C_PC_PER_YR;
    let rx = px - cam[0] + vx * t;
    let ry = py - cam[1] + vy * t;
    let rz = pz - cam[2] + vz * t;
    if (retarded) {
      const lt = Math.sqrt(rx * rx + ry * ry + rz * rz) / C_PC_PER_YR;
      rx -= vx * lt;
      ry -= vy * lt;
      rz -= vz * lt;
    }
    const d = Math.max(Math.sqrt(rx * rx + ry * ry + rz * rz), 1e-12);
    if (s.absMagInt16[i] * s.absMagUnit + 5 * Math.log10(d) - 5 < cut) last = i;
  }
  return last;
}

describe('near-Sun draw counts', () => {
  it('draw only a few per cent of the catalogue near the Sun', () => {
    expect(counts.years).toEqual([...NEAR_SUN_YEARS]);
    expect(counts.radiusPc).toBe(NEAR_SUN_PC);
    expect(counts.counts[0]).toBeGreaterThan(9_000); // at least the naked-eye stars
    expect(counts.counts[0]).toBeLessThan(0.06 * stars.count);
    expect(counts.counts[1]).toBeGreaterThanOrEqual(counts.counts[0]);
  });

  it('leave out no star that can be seen, from anywhere within 0.05 pc and at any date in the span', () => {
    const r = NEAR_SUN_PC;
    const places = [
      [0, 0, 0],
      [4.8e-6, 0, 0], // Earth's distance from the Sun
      [r, 0, 0],
      [-r, 0, 0],
      [0, r, 0],
      [0, -r, 0],
      [0, 0, r],
      [0, 0, -r],
      [r / Math.sqrt(3), -r / Math.sqrt(3), r / Math.sqrt(3)],
    ];
    for (const [k, span] of counts.years.entries()) {
      for (const years of [-span, 0, span]) {
        for (const cam of places) {
          for (const retarded of [false, true]) {
            expect(lastVisible(stars, cam, years, retarded)).toBeLessThan(counts.counts[k]);
          }
        }
      }
    }
  }, 60_000);

  it('reach far down the list for a faint star that comes close', () => {
    // Three stars: two bright ones, then a faint one 5 pc away heading for the Sun at 500 km/s.
    const toward = -500 / 0.1; // −500 km/s along x, in int16 steps of 0.1 km/s
    const s: Stars3D = {
      count: 3,
      epochJy: 2000,
      positions: new Float32Array([10, 0, 0, 0, 10, 0, 5, 0, 0]),
      velocitiesInt16: new Int16Array([0, 0, 0, 0, 0, 0, toward, 0, 0]),
      velocityUnitKms: 0.1,
      absMagInt16: new Int16Array([0, 100, 1100]),
      absMagUnit: 0.01,
      absMag: new Float32Array([0, 1, 11]),
      teff: new Uint16Array(3),
      flags: new Uint16Array(3),
    };
    // Seen now it is V = 11 + 5 log10(5) − 5 = 9.5, too faint; within 9,000 years it comes within
    // about 0.4 pc, where it is V ≈ 4: the count for that span must include it.
    const c = nearSunCounts(s, STAR_MAG_LIMIT, NEAR_SUN_PC, [0, 9_000]);
    expect(c.counts).toEqual([2, 3]);
  });

  it('say when the shortened field does not apply', () => {
    expect(nearSunDrawCount(counts, 0, 0, STAR_MAG_LIMIT)).toBe(counts.counts[0]);
    expect(nearSunDrawCount(counts, 0.04, -999, STAR_MAG_LIMIT)).toBe(counts.counts[0]);
    expect(nearSunDrawCount(counts, 0.04, 2_500, STAR_MAG_LIMIT)).toBe(counts.counts[1]);
    expect(nearSunDrawCount(counts, 0.06, 0, STAR_MAG_LIMIT)).toBeNull(); // too far from the Sun
    expect(nearSunDrawCount(counts, 0, 5_000, STAR_MAG_LIMIT)).toBeNull(); // too far from 2000
    expect(nearSunDrawCount(counts, 0, 0, STAR_MAG_LIMIT + 1)).toBeNull(); // fainter stars asked for
    expect(nearSunDrawCount(undefined, 0, 0, STAR_MAG_LIMIT)).toBeNull();
    expect(nearSunDrawCount(counts, NaN, 0, STAR_MAG_LIMIT)).toBeNull();
  });
});
