import { describe, expect, it } from 'vitest';
import { loadExtra, loadNames, loadNamesJson, loadStars } from '../../test/stars';
import { catalogueNumber, findStar, hasIauName, normalizeName, searchStars, starDisplayName, starLabels, starsByNumber } from './names';

const json = loadNamesJson();
const table = loadNames();

describe('star names', () => {
  it('normalises names', () => {
    expect(normalizeName("  Barnard's   Star ")).toBe('barnards star');
    expect(normalizeName('Rosalíadecastro')).toBe('rosaliadecastro');
    expect(normalizeName('TRAPPIST-1')).toBe('trappist 1');
  });

  it('finds Sirius by name, Bayer, Flamsteed and catalogue numbers', () => {
    for (const q of ['Sirius', 'alpha canis majoris', 'α CMa', 'Alp CMa', 'alpha cma', '9 CMa', '9 Canis Majoris', 'HIP 32349', 'hip32349', 'HD 48915', 'HR 2491', 'GJ 244A']) {
      expect(findStar(table, q), q).toContain(0);
    }
  });

  it('finds the nearest stars', () => {
    const prox = findStar(table, 'Proxima Centauri');
    expect(prox).toHaveLength(1);
    expect(findStar(table, 'GJ 551')).toContain(prox[0]);
    expect(findStar(table, 'V645 Cen')).toContain(prox[0]);
    expect(findStar(table, 'HIP 70890')).toEqual(prox);
    expect(findStar(table, 'Alpha Centauri A')).toEqual(findStar(table, 'Rigil Kentaurus'));
    expect(findStar(table, 'Toliman')).toEqual(findStar(table, 'Alpha Centauri B'));
    expect(findStar(table, "Barnard's Star")).toHaveLength(1);
    expect(findStar(table, 'Wolf 359')).toHaveLength(1);
    expect(findStar(table, 'TRAPPIST-1')).toHaveLength(1);
    expect(findStar(table, '61 Cyg')).toHaveLength(2); // A and B share the Flamsteed number
  });

  it('marks IAU-approved names', () => {
    const iau = new Map(json.proper.map(([, n, f]) => [n, f]));
    expect(iau.get('Sirius')).toBe(1);
    expect(iau.get('Wolf 359')).toBe(0); // a catalogue designation, not a WGSN name
    expect(hasIauName(table, findStar(table, 'Sirius')[0])).toBe(true);
    expect(hasIauName(table, findStar(table, 'Wolf 359')[0])).toBe(false);
  });

  it('gives display names and labels, IAU names first, catalogue numbers last', () => {
    const i = findStar(table, 'Betelgeuse')[0];
    expect(starDisplayName(table, i)).toBe('Betelgeuse');
    const labels = starLabels(table, i);
    expect(labels).toContain('α Ori');
    expect(labels).toContain('58 Ori');
    expect(labels).toContain('HIP 27989');
    expect(labels.indexOf('α Ori')).toBeLessThan(labels.indexOf('HIP 27989'));
    expect(catalogueNumber(table, 'hip', i)).toBe(27989);
    expect(starsByNumber(table, 'hip', 27989)).toEqual([i]);
  });

  it('names a star that has only catalogue numbers by the first of them', () => {
    // The faintest stars of the catalogue mostly have no names at all.
    let plain = -1;
    for (let i = loadStars().count - 1; i > 300_000; i--) {
      if (catalogueNumber(table, 'hip', i) !== null && findStar(table, `HIP ${catalogueNumber(table, 'hip', i)}`).length === 1) {
        const l = starLabels(table, i);
        if (l[0].startsWith('HIP') || l[0].startsWith('HD') || l[0].startsWith('HR')) {
          plain = i;
          break;
        }
      }
    }
    expect(plain).toBeGreaterThan(0);
    expect(starDisplayName(table, plain)).toMatch(/^(HR|HIP|HD) \d+$/);
  });

  it('prefix search returns exact matches first, then brighter stars', () => {
    const r = searchStars(table, 'alp', 5);
    expect(r.length).toBe(5);
    for (let k = 1; k < r.length; k++) expect(r[k].index).toBeGreaterThan(r[k - 1].index);
    expect(searchStars(table, 'Vega')[0].index).toBe(findStar(table, 'Vega')[0]);
    expect(searchStars(table, 'Betelgeuse')[0]).toMatchObject({ index: findStar(table, 'Betelgeuse')[0], exact: true });
    expect(searchStars(table, 'HIP 70890')).toEqual([{ index: findStar(table, 'Proxima Centauri')[0], match: 'hip 70890', exact: true }]);
    expect(searchStars(table, '')).toEqual([]);
    expect(searchStars(table, 'zzzzqqq')).toEqual([]);
  });

  it('spectral types and constellations decode', () => {
    const extra = loadExtra();
    expect(extra.count).toBe(loadStars().count);
    const i = findStar(table, 'Betelgeuse')[0];
    expect(table.spectralTypes[extra.spectralType[i]]).toMatch(/^M/);
    expect(table.constellations[extra.constellation[i] - 1][0]).toBe('Ori');
    expect(table.constellations).toHaveLength(88);
  });
});
