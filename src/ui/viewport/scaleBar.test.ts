import { describe, expect, it } from 'vitest';
import { AU_KM, LIGHT_YEAR_KM } from '../../physics/constants';
import { scaleBarLength } from './scaleBar';

const NBSP = '\u00a0';

/** The scale bar with a 110 px target at a given length per bar. */
const bar = (kmPerBar: number) => scaleBarLength(kmPerBar / 110);

describe('scale bar', () => {
  it('reads in metres, kilometres and au close in', () => {
    expect(bar(0.5).label).toBe('500 m');
    // SI grouping (lib/sci): a no-break space, from five digits on
    expect(bar(20_000).label).toBe(`20${NBSP}000 km`);
    expect(bar(5 * AU_KM).label).toBe('5 au');
  });

  it('reads in light-years, then thousands, millions and billions of them', () => {
    expect(bar(0.1 * LIGHT_YEAR_KM).label).toBe('0.1 ly');
    expect(bar(4.2 * LIGHT_YEAR_KM).label).toBe('5 ly');
    expect(bar(2e3 * LIGHT_YEAR_KM).label).toBe('2000 ly');
    expect(bar(1e5 * LIGHT_YEAR_KM).label).toBe(`100${NBSP}000 ly`);
    expect(bar(2.5e6 * LIGHT_YEAR_KM).label).toBe('2 million ly');
    expect(bar(4.6e8 * LIGHT_YEAR_KM).label).toBe('500 million ly');
    expect(bar(9e10 * LIGHT_YEAR_KM).label).toBe('100 billion ly');
  });

  it('stays close to its target length at every scale out to the camera’s limit', () => {
    for (let km = 1e-4; km < 1e25; km *= 3.7) {
      const s = scaleBarLength(km / 110);
      expect(Number.isFinite(s.px)).toBe(true);
      expect(s.px).toBeGreaterThan(110 / 2.5);
      expect(s.px).toBeLessThan(110 * 2.5);
      expect(s.label).not.toMatch(/e[+-]|NaN|Infinity/);
    }
  });
});
