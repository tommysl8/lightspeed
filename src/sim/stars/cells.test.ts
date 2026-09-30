/**
 * Cells (cells.ts) never leave out a star the star shader would show: from many places, at many dates, with and
 * without the light-time correction and with the cut raised (beaming, a lens), every star brighter than the cut
 * from the camera, by the shader's own arithmetic (render/shaders/stars.vert.glsl), is inside its cell's prefix.
 * Checked over the head (the core and the pinned stars) and over band files of the extension.
 */
import { describe, expect, it } from 'vitest';
import { buildCells, cellPrefixes, CUT_ABOVE_LIMIT, fillCellIndex, type StarCells } from './cells';
import { STAR_MAG_LIMIT } from './visibility';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';
import type { Stars3D } from './catalogue';
import { loadBandFile, loadHeadCatalogue, loadStarIndex } from '../../test/stars';

type Cam = [number, number, number];
const CAMS: Cam[] = [
  [1e-4, 0, 0], // the Sun
  [0.9, -0.4, -0.7], // near α Centauri
  [7, 3, -5],
  [60, -40, 30],
  [40, 396, -36], // the Orion Nebula
  [-1100, 372, -1985], // Carina
  [599, -2937, -137], // 3 kpc toward the inner Galaxy
  [-460, -7200, -3900], // near the Galactic Centre
];
const DATES = [0, 2000, -250_000, 1e6, -3e6];

/** Stars the shader shows from `cam` at `years` with the cut raised by `raise` that the cells' prefixes leave out. */
function missed(stars: Stars3D, cells: StarCells, cam: Cam, years: number, retarded: boolean, raise: number): number[] {
  const counts = new Uint32Array(cells.count);
  cellPrefixes(cells, cam[0], cam[1], cam[2], years, STAR_MAG_LIMIT + CUT_ABOVE_LIMIT + raise, counts);
  const drawn = new Uint8Array(stars.count);
  const idx = new Uint32Array(stars.count);
  const n = fillCellIndex(cells, counts, idx);
  for (let k = 0; k < n; k++) drawn[idx[k]] = 1;
  const y = Math.max(-MOTION_VALID_YEARS, Math.min(MOTION_VALID_YEARS, years));
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const out: number[] = [];
  for (let i = 0; i < stars.count; i++) {
    if (drawn[i]) continue;
    const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
    const v = [V[3 * i] * kv, V[3 * i + 1] * kv, V[3 * i + 2] * kv];
    const t = y + Math.hypot(p[0], p[1], p[2]) / C_PC_PER_YR;
    const rel = [0, 1, 2].map((k) => p[k] - cam[k] + v[k] * t);
    if (retarded) {
      const d0 = Math.hypot(rel[0], rel[1], rel[2]);
      for (let k = 0; k < 3; k++) rel[k] -= (v[k] * d0) / C_PC_PER_YR;
    }
    const d = Math.max(Math.hypot(rel[0], rel[1], rel[2]), 1e-12);
    // The shader: shown while the magnitude is under the limit + the fade (0.5).
    if (stars.absMagInt16[i] * stars.absMagUnit + 5 * Math.log10(d / 10) < STAR_MAG_LIMIT + 0.5 + raise) out.push(i);
  }
  return out;
}

describe('cells', () => {
  it('of the head leave out no star the shader would show, from anywhere, at any date', async () => {
    const stars = await loadHeadCatalogue();
    const cells = stars.cells!;
    expect(cells.count).toBeGreaterThan(500);
    for (const cam of CAMS)
      for (const years of DATES)
        for (const retarded of [false, true])
          for (const raise of [0, 3]) expect(missed(stars, cells, cam, years, retarded, raise), `camera ${cam} at ${years} y`).toEqual([]);
  }, 600_000);

  it('of the band files leave out no star either', () => {
    const x = loadStarIndex();
    // Files of every band, among them those nearest the Sun.
    const files = new Set<number>();
    for (let f = 0; f < x.files; f += Math.ceil(x.files / 25)) files.add(f);
    for (let b = 0; b < 6; b++) files.add(x.band.indexOf(b));
    for (const f of files) {
      const { stars, cells } = loadBandFile(f);
      for (const cam of CAMS) for (const years of [0, 1e6]) expect(missed(stars, cells, cam, years, true, 0), `file ${f}, camera ${cam}`).toEqual([]);
    }
  }, 600_000);

  it('draw far fewer stars than the catalogue holds, away from the Sun', async () => {
    const stars = await loadHeadCatalogue();
    const counts = new Uint32Array(stars.cells!.count);
    // 100 pc out, where today every star of the core is drawn.
    const n = cellPrefixes(stars.cells!, 60, -40, 30, 0, STAR_MAG_LIMIT + CUT_ABOVE_LIMIT, counts);
    expect(n).toBeLessThan(40_000);
    expect(n).toBeGreaterThan(10_000);
  });

  it('are built in order, each sorted by absolute magnitude', () => {
    const src = { positions: new Float32Array([1, 0, 0, 2, 0, 0, 1.5, 0, 0, 100, 0, 0]), velocitiesInt16: new Int16Array(12), velocityUnitKms: 0.1, absMagInt16: new Int16Array([500, 100, 300, -100]) };
    const c = buildCells(src, 4, 2);
    expect(c.start[c.count]).toBe(4);
    for (let k = 0; k < c.count; k++) for (let q = c.start[k] + 1; q < c.start[k + 1]; q++) expect(c.mag[q]).toBeGreaterThanOrEqual(c.mag[q - 1]);
    expect([...c.order!].sort()).toEqual([0, 1, 2, 3]);
  });
});
