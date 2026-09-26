import { describe, expect, it } from 'vitest';
import { bandsExtent, rasteriseBands } from './rings';

describe('ring bands', () => {
  it('span the system from the innermost edge to the outermost', () => {
    expect(bandsExtent([{ innerKm: 41_800, outerKm: 41_900, opacity: 0.3, colour: '#555' }, { innerKm: 51_120, outerKm: 51_180, opacity: 0.9, colour: '#555' }])).toEqual({
      innerKm: 41_800,
      outerKm: 51_180,
    });
    // A single narrow ring still has room.
    const e = bandsExtent([{ innerKm: 2287, outerKm: 2287, opacity: 0.5, colour: '#fff' }]);
    expect(e.outerKm - e.innerKm).toBeGreaterThan(0);
  });

  it('keep a ring narrower than a texel, at its covered fraction of opacity', () => {
    // 10 texels of 1,000 km; a 250 km ring of opacity 0.8 inside texel 3.
    const data = rasteriseBands([{ innerKm: 3_500, outerKm: 3_750, opacity: 0.8, colour: '#ffffff' }], 0, 10_000, 10);
    const alpha = [...Array(10).keys()].map((i) => data[4 * i + 3]);
    expect(alpha[3]).toBe(Math.round(255 * 0.8 * 0.25));
    expect(alpha.filter((a) => a > 0)).toHaveLength(1);
    expect(data[4 * 3]).toBe(255); // white
  });

  it('composite overlapping bands', () => {
    const data = rasteriseBands(
      [
        { innerKm: 0, outerKm: 10, opacity: 0.5, colour: '#ff0000' },
        { innerKm: 0, outerKm: 10, opacity: 0.5, colour: '#0000ff' },
      ],
      0,
      10,
      1,
    );
    expect(data[3]).toBe(Math.round(255 * 0.75));
    expect(data[2]).toBeGreaterThan(data[0]); // the later band is on top
  });
});

describe('the width of a body with rings', () => {
  it('is its rings’ outer radius (Saturn about 2.3 times its own)', async () => {
    const { extentFactor, ringOuterKm } = await import('./rings');
    const { getBody } = await import('../sim/bodies');
    const saturn = getBody('saturn')!;
    expect(extentFactor(saturn)).toBeCloseTo(ringOuterKm(saturn.visual!.rings!) / 60_268, 9);
    expect(extentFactor(saturn)).toBeGreaterThan(2.2);
    expect(extentFactor(getBody('earth')!)).toBe(1);
  });
});
