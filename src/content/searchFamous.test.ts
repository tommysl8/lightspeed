/**
 * Search finds the famous object by the short name people use: "Andromeda" is the galaxy, not the
 * dwarf Andromeda X; "Virgo" the cluster, not the dwarf Virgo I; "Carina" the nebula, not the dwarf.
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
  });

  it('still finds the dwarfs by their own names', () => {
    expect(top('andromeda x')).toBe(searchDestinations('Andromeda X')[0].destination.id);
    expect(searchDestinations('andromeda x')[0].destination.name).toBe('Andromeda X');
  });
});
