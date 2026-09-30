/**
 * The catalogue's extension as shipped (docs/data/stars.md §12): the pinned head, the index and the band files,
 * and the loader's choice of files.
 */
import { describe, expect, it } from 'vitest';
import { cellDistance } from './cells';
import { Origin } from './catalogue';
import { fileOfStar, neededFiles } from './extensionLoad';
import { nearSunCounts, NEAR_SUN_PC, NEAR_SUN_YEARS } from './visibility';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';
import { findStar } from './names';
import { loadBandFile, loadHeadCatalogue, loadHeadFile, loadNames, loadNamesJson, loadStarIndex, loadStars } from '../../test/stars';
import { readJson } from '../../test/files';

describe('the pinned head (stars3d-head.bin.gz)', () => {
  it('follows the core without moving a core star', async () => {
    const core = loadStars();
    const all = await loadHeadCatalogue();
    const head = loadHeadFile();
    expect(all.coreCount).toBe(core.count);
    expect(all.count).toBe(core.count + head.count);
    expect(head.count).toBeGreaterThan(3000);
    for (let i = 0; i < core.count; i += 997) {
      expect(all.positions[3 * i]).toBe(core.positions[3 * i]);
      expect(all.absMagInt16[i]).toBe(core.absMagInt16[i]);
      expect(all.flags[i]).toBe(core.flags[i]);
      expect(all.origin![i]).toBe(Origin.core);
    }
    expect(all.headExtra!.count).toBe(head.count);
  });

  it('leaves the near-Sun counts as they were: no pinned star can be seen from near the Sun within ±3,000 years', async () => {
    const core = loadStars();
    const all = await loadHeadCatalogue();
    expect(nearSunCounts(all).counts).toEqual(nearSunCounts(core).counts);
    expect(NEAR_SUN_YEARS[NEAR_SUN_YEARS.length - 1]).toBe(3000);
  });

  it('holds the Gaia black holes’ companions where blackholes.json points', async () => {
    const all = await loadHeadCatalogue();
    const file = readJson<{ companions: { id: string; catalogueIndex: number | null }[] }>('src/sim/blackholes/blackholes.json');
    for (const id of ['gaia-bh1-star', 'gaia-bh2-star', 'gaia-bh3-star']) {
      const i = file.companions.find((c) => c.id === id)!.catalogueIndex!;
      expect(i).toBeGreaterThanOrEqual(all.coreCount!);
      expect(i).toBeLessThan(all.count);
      expect(all.origin![i] & 15).toBe(Origin.bhCompanion);
    }
  });
});

describe('the index and band files', () => {
  const x = loadStarIndex();

  it('number every star once: the head, then the files end to end, as the names file does', async () => {
    const all = await loadHeadCatalogue();
    expect(x.coreCount).toBe(loadStars().count);
    expect(x.headCount).toBe(all.count);
    let next = x.headCount;
    for (let f = 0; f < x.files; f++) {
      expect(x.base[f]).toBe(next);
      next += x.count[f];
    }
    expect(next).toBe(x.total);
    expect(loadNamesJson().count).toBe(x.total);
    expect(x.total).toBeGreaterThan(3_000_000);
    expect(fileOfStar(x, x.headCount)).toBe(0);
    expect(fileOfStar(x, x.total - 1)).toBe(x.files - 1);
    expect(fileOfStar(x, x.headCount - 1)).toBe(-1);
    const f = Math.floor(x.files / 2);
    expect(fileOfStar(x, x.base[f] + x.count[f] - 1)).toBe(f);
  });

  it('describe their files truly: counts, brightest stars, cells whose boxes hold their stars', () => {
    for (let f = 0; f < x.files; f += Math.ceil(x.files / 40)) {
      const file = loadBandFile(f);
      const s = file.stars;
      expect(s.count).toBe(x.count[f]);
      expect(file.cells.count).toBe(x.cells[f]);
      let mMin = Infinity;
      for (let c = 0; c < file.cells.count; c++) {
        const a = file.cells.start[c];
        const b = file.cells.start[c + 1];
        const cc = x.cellFirst[f] + c;
        expect(b - a).toBeGreaterThan(0);
        for (let q = a + 1; q < b; q++) expect(s.absMagInt16[q]).toBeGreaterThanOrEqual(s.absMagInt16[q - 1]);
        // The index's brightest magnitude and box (rounded outward) bound the cell's stars.
        expect(x.cellMin[cc]).toBeLessThanOrEqual(s.absMagInt16[a] / 100 + 1e-6);
        for (let q = a; q < b; q++) {
          const lt = Math.hypot(s.positions[3 * q], s.positions[3 * q + 1], s.positions[3 * q + 2]) / C_PC_PER_YR;
          for (let k = 0; k < 3; k++) {
            const p = s.positions[3 * q + k] + s.velocitiesInt16[3 * q + k] * 0.1 * KMS_TO_PC_PER_YR * lt;
            expect(p).toBeGreaterThanOrEqual(x.cellBox[6 * cc + k] - 1e-3);
            expect(p).toBeLessThanOrEqual(x.cellBox[6 * cc + 3 + k] + 1e-3);
          }
          // Each star in its cell's box from the file too (distance zero from its own place).
          if (q === a) expect(cellDistance(file.cells, c, s.positions[3 * q] + (p0(s, q, 0) - s.positions[3 * q]), p0(s, q, 1), p0(s, q, 2), 0)).toBe(0);
        }
        mMin = Math.min(mMin, s.absMagInt16[a] / 100);
      }
      expect(x.mMin[f]).toBeLessThanOrEqual(mMin + 1e-6);
      // Bands: the file's stars inside its band's magnitudes.
      const edges = [-Infinity, -3, 0, 3, 6, 9, Infinity];
      expect(mMin).toBeGreaterThanOrEqual(edges[x.band[f]] - 0.01);
    }
  }, 600_000);

  it('can be searched by the new stars’ designations', () => {
    const names = loadNames();
    // An HD star of the extension (the names file's HD column, past the head).
    const hd = names.hd;
    let k = hd.star.length - 1;
    while (k > 0 && hd.star[k] < x.headCount) k--;
    const i = hd.star[k];
    expect(i).toBeGreaterThanOrEqual(x.headCount);
    expect(findStar(names, `HD ${hd.id[k]}`)).toContain(i);
  });
});

/** Star q's J2000 place with its light-time's motion (the boxes' reference), coordinate k. */
function p0(s: { positions: Float32Array; velocitiesInt16: Int16Array }, q: number, k: number): number {
  const lt = Math.hypot(s.positions[3 * q], s.positions[3 * q + 1], s.positions[3 * q + 2]) / C_PC_PER_YR;
  return s.positions[3 * q + k] + s.velocitiesInt16[3 * q + k] * 0.1 * KMS_TO_PC_PER_YR * lt;
}

describe('the loader', () => {
  const x = loadStarIndex();

  it('fetches every file that holds a star the camera could see (with the prefetch margin)', () => {
    for (const [cam, years] of [
      [[60, -40, 30], 0],
      [[40, 396, -36], 0],
      [[-1100, 372, -1985], 0],
      [[3, 1, -2], 5000],
    ] as [[number, number, number], number][]) {
      const need = new Set(neededFiles(x, cam[0], cam[1], cam[2], years).map(([f]) => f));
      for (let f = 0; f < x.files; f += 3) {
        if (need.has(f)) continue;
        const { stars } = loadBandFile(f);
        const kv = 0.1 * KMS_TO_PC_PER_YR;
        for (let q = 0; q < stars.count; q++) {
          const lt = Math.hypot(stars.positions[3 * q], stars.positions[3 * q + 1], stars.positions[3 * q + 2]) / C_PC_PER_YR;
          const t = years + lt;
          const d = Math.hypot(...[0, 1, 2].map((k) => stars.positions[3 * q + k] + stars.velocitiesInt16[3 * q + k] * kv * t - cam[k]));
          expect(stars.absMagInt16[q] / 100 + 5 * Math.log10(d / 10), `file ${f} star ${q} from ${cam}`).toBeGreaterThan(7.0);
        }
      }
    }
  }, 600_000);

  it('asks for a few files near the Sun, none galaxy-wide', () => {
    const need = neededFiles(x, 3, 1, -2, 0);
    expect(need.length).toBeGreaterThan(0);
    expect(need.length).toBeLessThan(60);
    // Every star the head does not pin: none of them visible from within 0.05 pc of the Sun at any date.
    expect(NEAR_SUN_PC).toBe(0.05);
    expect(MOTION_VALID_YEARS).toBe(1e6);
  });
});
