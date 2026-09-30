/**
 * Merging the surveys: an entry within 1.5″ of one in an earlier (higher-priority) survey is the same galaxy and is
 * dropped; anything farther is kept; across 0h/24h and near the poles too; and Cosmicflows-4's galaxies are matched
 * only when their velocities agree.
 */
import { describe, expect, it } from 'vitest';
import { CF4_MATCH_ARCSEC, CF4_MATCH_KM_S, dedupe, SkyIndex, SURVEY_MATCH_ARCSEC } from './match';
import { seeded } from './tile';

const AS = 1 / 3600;

/** A point `arcsec` away from (ra, dec) in the direction `pa` (radians from north through east). */
function offset(ra: number, dec: number, arcsec: number, pa: number): [number, number] {
  const d = (dec * Math.PI) / 180;
  const r = (arcsec * AS * Math.PI) / 180;
  const dec2 = Math.asin(Math.sin(d) * Math.cos(r) + Math.cos(d) * Math.sin(r) * Math.cos(pa));
  const dra = Math.atan2(Math.sin(pa) * Math.sin(r) * Math.cos(d), Math.cos(r) - Math.sin(d) * Math.sin(dec2));
  return [(((ra + (dra * 180) / Math.PI) % 360) + 360) % 360, (dec2 * 180) / Math.PI];
}

describe('merging surveys on the sky', () => {
  it('drops an entry within 1.5″ of an earlier survey’s and keeps one farther away', () => {
    const rand = seeded(7);
    const n = 5000;
    const ra = new Float64Array(n);
    const dec = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      ra[i] = rand() * 360;
      dec[i] = Math.asin(2 * rand() - 1) * (180 / Math.PI);
    }
    // Hard places: across 0h/24h, and a few arcseconds from each pole.
    ra[0] = 359.99995;
    dec[0] = 10;
    ra[1] = 12;
    dec[1] = 89.9996;
    ra[2] = 200;
    dec[2] = -89.9997;
    const m = 3000;
    const ra2 = new Float64Array(m);
    const dec2 = new Float64Array(m);
    const same = new Uint8Array(m);
    for (let j = 0; j < m; j++) {
      const i = j < 3 ? j : Math.floor(rand() * n);
      // Half the entries within the radius (up to 1.4″), half just outside it (1.6″ to 5″).
      same[j] = j % 2 === 0 ? 1 : 0;
      const sep = same[j] ? rand() * 1.4 : 1.6 + rand() * 3.4;
      [ra2[j], dec2[j]] = offset(ra[i], dec[i], sep, rand() * 2 * Math.PI);
    }
    const [first, second] = dedupe([
      { ra, dec, count: n },
      { ra: ra2, dec: dec2, count: m },
    ]);
    expect([...first].every((f) => f === 1)).toBe(true);
    let wrong = 0;
    for (let j = 0; j < m; j++) {
      // An entry just outside one galaxy's radius may still fall within another's: none of these are that close.
      if (second[j] !== 1 - same[j]) wrong++;
    }
    expect(wrong).toBe(0);
    expect(SURVEY_MATCH_ARCSEC).toBe(1.5);
  });

  it('matches later surveys against earlier ones, and against the new entries of those in between', () => {
    const a = { ra: Float64Array.of(10), dec: Float64Array.of(20), count: 1 };
    const [r1, d1] = offset(50, -30, 0, 0);
    const b = { ra: Float64Array.of(r1, ...offset(10, 20, 1, 1)), dec: Float64Array.of(d1, offset(10, 20, 1, 1)[1]), count: 2 };
    const c = { ra: Float64Array.of(...offset(50, -30, 1.2, 2), 120), dec: Float64Array.of(offset(50, -30, 1.2, 2)[1], 0), count: 2 };
    const [fa, fb, fc] = dedupe([a, b, c]);
    expect([...fa]).toEqual([1]);
    expect([...fb]).toEqual([1, 0]);
    // c's first entry is b's first galaxy (new in b), its second is new.
    expect([...fc]).toEqual([0, 1]);
  });

  it('finds the nearest of several candidates', () => {
    const [ra1, dec1] = offset(100, 45, 0.9, 0);
    const [ra2, dec2] = offset(100, 45, 0.3, 2);
    const ix = new SkyIndex(Float64Array.of(ra1, ra2), Float64Array.of(dec1, dec2), SURVEY_MATCH_ARCSEC);
    expect(ix.nearest(100, 45)).toBe(1);
    expect(ix.nearest(...offset(100, 45, 3, 1))).toBe(-1);
  });

  it('leaves a Cosmicflows-4 galaxy’s neighbour on the sky alone when its velocity differs', () => {
    const v = Float64Array.of(5000);
    const cf4 = new SkyIndex(Float64Array.of(150), Float64Array.of(2), CF4_MATCH_ARCSEC);
    const [ra, dec] = offset(150, 2, 5, 1);
    const agree = (cz: number) => (i: number) => Math.abs(v[i] - cz) < CF4_MATCH_KM_S;
    expect(cf4.nearest(ra, dec, agree(5400))).toBe(0);
    expect(cf4.nearest(ra, dec, agree(9000))).toBe(-1);
    expect(cf4.nearest(...offset(150, 2, 7, 1), agree(5000))).toBe(-1);
  });
});
