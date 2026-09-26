import { describe, expect, it } from 'vitest';
import { bodyIds, getBody, type BodyRecord } from '../sim/bodies';
import { labelRank, labelScore } from './labelRank';

const rec = (kind: BodyRecord['kind'], radiusKm: number): BodyRecord =>
  ({ id: 'x', name: 'X', kind, parent: 'sun', physical: { radiusKm, colour: '#fff' }, provider: null as never }) as BodyRecord;

describe('label ranks', () => {
  it('keep the built-in bodies in their old order', () => {
    const order = [...bodyIds()].sort((a, b) => labelRank(getBody(a)!) - labelRank(getBody(b)!));
    expect(order).toEqual(['sun', 'jupiter', 'saturn', 'earth', 'venus', 'mars', 'uranus', 'neptune', 'mercury', 'pluto', 'moon', 'voyager1', 'proxima']);
  });

  it('put new bodies by kind, bigger first: dwarf planets after Pluto, moons after the Moon', () => {
    const eris = labelRank(rec('dwarf-planet', 1163));
    const ceres = labelRank(rec('dwarf-planet', 470));
    const titan = labelRank(rec('moon', 2575));
    const phobos = labelRank(rec('moon', 11));
    expect(eris).toBeGreaterThan(9);
    expect(eris).toBeLessThan(ceres);
    expect(ceres).toBeLessThan(10);
    expect(titan).toBeGreaterThan(10);
    expect(titan).toBeLessThan(phobos);
    expect(phobos).toBeLessThan(11);
    expect(labelRank(rec('spacecraft', 0.002))).toBeLessThan(12);
  });

  it('score selection, then the focus and its system, above rank; size only nudges', () => {
    expect(labelScore(0, 12, 0)).toBeLessThan(labelScore(4, 0, 1e4));
    expect(labelScore(3, 10.4, 0)).toBeLessThan(labelScore(4, 1, 0));
    // A body filling the view moves up by at most two ranks.
    expect(labelScore(4, 2.1, 1e4)).toBeGreaterThan(labelScore(4, 0, 0));
    expect(labelScore(4, 2, 300)).toBeLessThan(labelScore(4, 1, 0.1));
  });
});
