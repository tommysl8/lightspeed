import { describe, expect, it } from 'vitest';
import type { Entry } from '../sim/bodies/registry';
import { UNRESOLVED_PX, unresolvedPairs, type PairLabels } from './labelPairs';

/** Just what unresolvedPairs reads of the registry's entries. */
function star(id: string, x: number, y: number, magnitude: number, parent: Entry | null): Entry {
  const e = {
    id,
    isNode: false,
    record: { id, name: id, kind: 'star' },
    parent,
    placed: [],
    state: { present: true, magnitude, screen: { x, y, onScreen: true, inFront: true } },
  } as unknown as Entry;
  if (parent) parent.placed.push(e);
  return e;
}

function barycentre(name: string): Entry {
  return { id: `${name}-barycentre`, isNode: true, record: { name, kind: 'barycentre' }, parent: null, placed: [] } as unknown as Entry;
}

describe('unresolved pairs', () => {
  const out: PairLabels = { hide: new Set(), text: new Map() };

  it('give a pair too close to tell apart one label, its system’s name, on its brighter star', () => {
    const sirius = barycentre('Sirius');
    const a = star('sirius', 100, 100, -1.46, sirius);
    const b = star('sirius-b', 104, 101, 8.4, sirius);
    const vega = star('vega', 300, 200, 0.03, null);
    unresolvedPairs([a, b, vega], out);
    expect(out.text.get('sirius')).toBe('Sirius');
    expect(out.hide.has('sirius-b')).toBe(true);
    expect(out.hide.has('sirius')).toBe(false);
    expect(out.text.has('vega')).toBe(false);
  });

  it('label each star of a pair seen apart by its own name', () => {
    const cen = barycentre('Alpha Centauri AB');
    const a = star('alpha-centauri-a', 100, 100, -0.01, cen);
    const b = star('alpha-centauri-b', 100 + UNRESOLVED_PX + 1, 100, 1.33, cen);
    unresolvedPairs([a, b], out);
    expect(out.text.size).toBe(0);
    expect(out.hide.size).toBe(0);
  });

  it('leave a star alone whose companion is off screen', () => {
    const cap = barycentre('Capella');
    const a = star('capella', 100, 100, 0.8, cap);
    const b = star('capella-ab', 101, 100, 0.9, cap);
    (b.state.screen as { onScreen: boolean }).onScreen = false;
    unresolvedPairs([a, b], out);
    expect(out.text.size).toBe(0);
  });
});
