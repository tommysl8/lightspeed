import { describe, expect, it } from 'vitest';
import { readJson } from '../../test/files';
import { loadNames, loadStars } from '../../test/stars';
import { findStar } from './names';
import { constellationSegments, figureStars, type ConstellationsFile } from './constellations';

const json = readJson<ConstellationsFile & { match: { failures: number; medianArcsec: number; segments: number } }>('public/data/constellations.json');
const stars = loadStars();
const names = loadNames();
const one = (q: string) => findStar(names, q)[0];

describe('constellations.json', () => {
  it('has the 88 IAU constellations with names and genitives', () => {
    expect(json.format).toBe('lightspeed.constellations');
    expect(json.constellations).toHaveLength(88);
    const ori = json.constellations.find((c) => c.abbr === 'Ori')!;
    expect(ori.name).toBe('Orion');
    expect(ori.genitive).toBe('Orionis');
  });

  it('resolved every line vertex to a naked-eye star of the bright subset', () => {
    expect(json.match.failures).toBe(0);
    expect(json.match.medianArcsec).toBeLessThan(1);
    for (const c of json.constellations) {
      for (const line of c.lines) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const i of line) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(9_959); // in stars3d-bright.bin.gz: the figures are there from the first frames
          const r = Math.hypot(stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]);
          expect(stars.absMag[i] + 5 * Math.log10(r) - 5).toBeLessThan(6.6);
        }
      }
    }
  });

  it("joins the right stars: Orion's belt, the Big Dipper, Alpha Centauri", () => {
    const has = (abbr: string, a: number, b: number) =>
      json.constellations.find((c) => c.abbr === abbr)!.lines.some((l) => l.some((x, k) => x === a && (l[k + 1] === b || l[k - 1] === b)));
    expect(has('Ori', one('Alnitak'), one('Alnilam'))).toBe(true);
    expect(has('Ori', one('Alnilam'), one('Mintaka'))).toBe(true);
    expect(has('UMa', one('Dubhe'), one('Merak'))).toBe(true);
    expect(has('UMa', one('Mizar'), one('Alkaid'))).toBe(true);
    expect(json.constellations.find((c) => c.abbr === 'Cen')!.stars.some((s) => s.i === one('Rigil Kentaurus'))).toBe(true);
  });

  it('flattens into one segment list for the GPU', () => {
    const { pairs, owner } = constellationSegments(json);
    expect(pairs.length).toBe(2 * json.match.segments);
    expect(owner.length).toBe(json.match.segments);
    const ori = json.constellations.findIndex((c) => c.abbr === 'Ori');
    expect(figureStars(json.constellations[ori])).toContain(one('Betelgeuse'));
  });
});
