/**
 * Search finds the famous object by the short name people use: "Andromeda" is the galaxy, not the
 * dwarf Andromeda X; "Virgo" the cluster, not the dwarf Virgo I; "Carina" the nebula, not the dwarf;
 * "M87" the galaxy, not its black hole M87*; "black hole" Sagittarius A*, the one at home.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { registerUniverse } from '../test/universe';
import { searchDestinations } from './destinations';

beforeAll(() => registerUniverse());

const top = (q: string) => searchDestinations(q)[0]?.destination.id;

describe('searching by a famous short name', () => {
  it('puts the famous object first', () => {
    expect(top('andromeda')).toBe('andromeda');
    expect(top('Andromeda')).toBe('andromeda');
    expect(top('triangulum')).toBe('triangulum');
    expect(top('virgo')).toBe('virgo-cluster');
    expect(top('coma')).toBe('coma-cluster');
    expect(top('carina')).toBe('carina-nebula');
    expect(top('m87')).toBe('m87');
    expect(top('M87')).toBe('m87');
    expect(top('black hole')).toBe('sgr-a-star');
  });

  it('finds the black holes by their own names, a name ending in * only when the query does', () => {
    expect(top('M87*')).toBe('m87-star');
    expect(top('Sgr A*')).toBe('sgr-a-star');
    expect(top('Sagittarius A')).toBe('sgr-a-star');
    expect(top('Gaia BH1')).toBe('gaia-bh1');
    expect(top('Gaia BH3')).toBe('gaia-bh3');
    expect(top('Cygnus X-1')).toBe('cyg-x-1');
    expect(top('Cyg X-1')).toBe('cyg-x-1');
    expect(top('HDE 226868')).toBe('hde-226868');
    expect(top('V404 Cyg')).toBe('v404-cygni');
    expect(top('V616 Mon')).toBe('a0620-00');
    expect(top('OGLE-2011-BLG-0462')).toBe('ogle-2011-blg-0462');
    // No hole but Sgr A* answers to a bare "black hole".
    for (const m of searchDestinations('black hole')) if (m.destination.id !== 'sgr-a-star') expect(m.score).toBeLessThan(990);
  });

  it('still finds the dwarfs by their own names', () => {
    expect(top('andromeda x')).toBe(searchDestinations('Andromeda X')[0].destination.id);
    expect(searchDestinations('andromeda x')[0].destination.name).toBe('Andromeda X');
  });
});
