import { describe, expect, it } from 'vitest';
import { loadNames, loadStars, readRepoFile } from './test-helpers';
import { buildNameIndex, findStar } from './names';

interface ConstellationsJson {
  format: string;
  match: { vertices: number; failures: number; medianArcsec: number; maxArcsec: number; segments: number };
  constellations: { abbr: string; name: string; genitive: string; lines: number[][]; stars: { i: number; hip: number | null; v: number }[] }[];
}

const json = JSON.parse(readRepoFile('public/data/constellations.json').toString('utf8')) as ConstellationsJson;
const stars = loadStars();
const names = buildNameIndex(loadNames());
const one = (q: string) => findStar(names, q)[0];

describe('constellations.json', () => {
  it('has the 88 IAU constellations with names and genitives', () => {
    expect(json.format).toBe('lightspeed.constellations');
    expect(json.constellations).toHaveLength(88);
    const ori = json.constellations.find((c) => c.abbr === 'Ori')!;
    expect(ori.name).toBe('Orion');
    expect(ori.genitive).toBe('Orionis');
  });

  it('resolved every line vertex to a naked-eye star in stars3d', () => {
    expect(json.match.failures).toBe(0);
    expect(json.match.medianArcsec).toBeLessThan(1);
    for (const c of json.constellations) {
      for (const line of c.lines) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const i of line) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(stars.count);
          const r = Math.hypot(stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]);
          expect(stars.absMag[i] + 5 * Math.log10(r) - 5).toBeLessThan(6.6);
        }
      }
    }
  });

  it('joins the right stars: Orion\'s belt, the Big Dipper, the Southern Cross pointers', () => {
    const has = (abbr: string, a: number, b: number) =>
      json.constellations
        .find((c) => c.abbr === abbr)!
        .lines.some((l) => l.some((x, k) => (x === a && (l[k + 1] === b || l[k - 1] === b))));
    expect(has('Ori', one('Alnitak'), one('Alnilam'))).toBe(true);
    expect(has('Ori', one('Alnilam'), one('Mintaka'))).toBe(true);
    expect(has('UMa', one('Dubhe'), one('Merak'))).toBe(true);
    expect(has('UMa', one('Mizar'), one('Alkaid'))).toBe(true);
    expect(json.constellations.find((c) => c.abbr === 'Cen')!.stars.some((s) => s.i === one('Rigil Kentaurus'))).toBe(true);
  });

  it('ends the Canes Venatici line on Cor Caroli (alpha-2 CVn), not its faint companion alpha-1', () => {
    const cvn = json.constellations.find((c) => c.abbr === 'CVn')!;
    const cor = one('Cor Caroli');
    expect(cvn.lines.flat()).toContain(cor);
    expect(cvn.stars.find((s) => s.i === cor)!.hip).toBe(63125);
    expect(cvn.stars.some((s) => s.hip === 63121)).toBe(false);
  });
});
