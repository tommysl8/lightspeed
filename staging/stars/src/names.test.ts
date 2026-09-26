import { describe, expect, it } from 'vitest';
import { loadExtra, loadNames, loadStars } from './test-helpers';
import { buildNameIndex, findStar, normalizeName, searchStars } from './names';

const json = loadNames();
const index = buildNameIndex(json);

describe('star names', () => {
  it('normalises names', () => {
    expect(normalizeName("  Barnard's   Star ")).toBe('barnards star');
    expect(normalizeName('Rosalíadecastro')).toBe('rosaliadecastro');
    expect(normalizeName('TRAPPIST-1')).toBe('trappist 1');
  });

  it('finds Sirius by name, Bayer, Flamsteed and catalogue numbers', () => {
    for (const q of ['Sirius', 'alpha canis majoris', 'α CMa', 'Alp CMa', 'alpha cma', '9 CMa', '9 Canis Majoris', 'HIP 32349', 'HD 48915', 'HR 2491', 'GJ 244A']) {
      expect(findStar(index, q), q).toContain(0);
    }
  });

  it('finds the nearest stars', () => {
    const prox = findStar(index, 'Proxima Centauri');
    expect(prox).toHaveLength(1);
    expect(findStar(index, 'GJ 551')).toContain(prox[0]);
    expect(findStar(index, 'V645 Cen')).toContain(prox[0]);
    expect(findStar(index, 'Alpha Centauri A')).toEqual(findStar(index, 'Rigil Kentaurus'));
    expect(findStar(index, 'Toliman')).toEqual(findStar(index, 'Alpha Centauri B'));
    expect(findStar(index, "Barnard's Star")).toHaveLength(1);
    expect(findStar(index, 'Wolf 359')).toHaveLength(1);
    expect(findStar(index, 'TRAPPIST-1')).toHaveLength(1);
    expect(findStar(index, '61 Cyg')).toHaveLength(2); // A and B share the Flamsteed number
  });

  it('marks IAU-approved names', () => {
    const iau = new Map(json.proper.map(([, n, f]) => [n, f]));
    expect(iau.get('Sirius')).toBe(1);
    expect(iau.get('Proxima Centauri')).toBe(1);
    expect(iau.get('Wolf 359')).toBe(0); // a catalogue designation, not a WGSN name
  });

  it('gives display names, IAU names first', () => {
    const i = findStar(index, 'Betelgeuse')[0];
    expect(index.display.get(i)).toBe('Betelgeuse');
    expect(index.labels(i)).toContain('α Ori');
    expect(index.labels(i)).toContain('58 Ori');
  });

  it('prefix search returns brighter stars first', () => {
    const r = searchStars(index, 'alp', 5);
    expect(r.length).toBe(5);
    for (let k = 1; k < r.length; k++) expect(r[k].index).toBeGreaterThan(r[k - 1].index);
  });

  it('spectral types and constellations decode', () => {
    const extra = loadExtra();
    const stars = loadStars();
    expect(extra.count).toBe(stars.count);
    const i = findStar(index, 'Betelgeuse')[0];
    expect(json.spectralTypes[extra.spectralType[i]]).toMatch(/^M/);
    expect(json.constellations[extra.constellation[i] - 1][0]).toBe('Ori');
    expect(json.constellations).toHaveLength(88);
  });
});
