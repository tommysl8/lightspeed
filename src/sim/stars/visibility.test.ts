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
import { MOTION_VALID_YEARS } from './constants';
import { FAR_LIST_PC, NEAR_SUN_PC, NEAR_SUN_YEARS, STAR_FADE_MAG, STAR_MAG_LIMIT, nearSunCounts, nearSunDrawCount, starDrawList, starDrawLists } from './visibility';

const stars = loadStars();
const counts = nearSunCounts(stars);
const lists = starDrawLists(stars);

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

/** Indices of every star that shows from `cam` (pc) `years` after J2000, as the star shader works it out (float64 here). */
function visible(s: Stars3D, cam: readonly number[], years: number, retarded: boolean): number[] {
  const cut = STAR_MAG_LIMIT + STAR_FADE_MAG;
  const u = s.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = s.positions;
  const V = s.velocitiesInt16;
  const out: number[] = [];
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
    if (s.absMagInt16[i] * s.absMagUnit + 5 * Math.log10(d) - 5 < cut) out.push(i);
  }
  return out;
}

/** Whether every index of `seen` is in the ascending `list`. */
function allListed(seen: number[], list: Uint32Array): boolean {
  let j = 0;
  for (const i of seen) {
    while (j < list.length && list[j] < i) j++;
    if (list[j] !== i) return false;
  }
  return true;
}

const ascending = (a: Uint32Array): boolean => a.every((v, k) => k === 0 || v > a[k - 1]);

describe('star draw lists', () => {
  it('are short, ascending, and shorten with distance', () => {
    expect(lists.farPc).toEqual([...FAR_LIST_PC]);
    for (const l of [...lists.far, ...lists.frozen]) expect(ascending(l)).toBe(true);
    for (let k = 1; k < lists.far.length; k++) expect(lists.far[k].length).toBeLessThan(lists.far[k - 1].length);
    // From 2 kpc a few per cent of the catalogue can show, from 8 kpc a few hundred stars at most.
    expect(lists.far[FAR_LIST_PC.indexOf(2000)].length).toBeLessThan(0.05 * stars.count);
    expect(lists.far[FAR_LIST_PC.indexOf(8000)].length).toBeLessThan(500);
    // With the stars standing still, near the Sun: about as many as now (tens of thousands, not all).
    for (const l of lists.frozen) {
      expect(l.length).toBeGreaterThan(9_000);
      expect(l.length).toBeLessThan(0.1 * stars.count);
    }
  });

  it('leave out no star that can be seen from their distance or farther, at any date', () => {
    // Towards the Galactic Centre (J2000 ecliptic), where the catalogue's far stars crowd, and three other ways.
    const dirs = [
      [-0.0549, -0.0965, -0.9938],
      [1, 0, 0],
      [0, 0, 1],
      [0.5774, -0.5774, 0.5774],
    ];
    for (const [k, r] of lists.farPc.entries()) {
      for (const dir of dirs) {
        // At the list's own distance (where it is tightest), and farther out for the last one.
        for (const scale of k === lists.farPc.length - 1 ? [1, 3] : [1]) {
          const cam = dir.map((c) => c * r * scale);
          for (const years of [-MOTION_VALID_YEARS, 0, MOTION_VALID_YEARS]) {
            for (const retarded of [false, true]) expect(allListed(visible(stars, cam, years, retarded), lists.far[k])).toBe(true);
          }
        }
      }
    }
    // Not an empty check: from 2 kpc towards the centre some catalogue stars still show.
    expect(visible(stars, dirs[0].map((c) => c * 2000), 0, false).length).toBeGreaterThan(10);
  }, 60_000);

  it('leave out no star that can be seen from near the Sun while the stars stand still', () => {
    const r = NEAR_SUN_PC;
    const places = [
      [0, 0, 0],
      [4.8e-6, 0, 0],
      [r, 0, 0],
      [-r, 0, 0],
      [0, r, 0],
      [0, -r, 0],
      [0, 0, r],
      [0, 0, -r],
    ];
    for (const [k, years] of [-MOTION_VALID_YEARS, MOTION_VALID_YEARS].entries()) {
      for (const cam of places) {
        for (const retarded of [false, true]) expect(allListed(visible(stars, cam, years, retarded), lists.frozen[k])).toBe(true);
      }
    }
  }, 60_000);

  it('say which list applies', () => {
    expect(starDrawList(lists, 0, MOTION_VALID_YEARS, STAR_MAG_LIMIT)).toBe(lists.frozen[1]);
    expect(starDrawList(lists, 0.04, -MOTION_VALID_YEARS, STAR_MAG_LIMIT)).toBe(lists.frozen[0]);
    expect(starDrawList(lists, 0.04, 5_000, STAR_MAG_LIMIT)).toBeNull(); // the stars still move: all are drawn
    expect(starDrawList(lists, 1, MOTION_VALID_YEARS, STAR_MAG_LIMIT)).toBeNull(); // between the Sun and the first list
    expect(starDrawList(lists, 499, 0, STAR_MAG_LIMIT)).toBeNull();
    expect(starDrawList(lists, 500, 0, STAR_MAG_LIMIT)).toBe(lists.far[0]);
    expect(starDrawList(lists, 3_000, 0, STAR_MAG_LIMIT)).toBe(lists.far[FAR_LIST_PC.indexOf(2000)]);
    expect(starDrawList(lists, 1e6, 0, STAR_MAG_LIMIT)).toBe(lists.far[lists.far.length - 1]);
    expect(starDrawList(lists, 3_000, 0, STAR_MAG_LIMIT + 1)).toBeNull(); // fainter stars asked for
    expect(starDrawList(undefined, 3_000, 0, STAR_MAG_LIMIT)).toBeNull();
    expect(starDrawList(lists, NaN, 0, STAR_MAG_LIMIT)).toBeNull();
  });
});
