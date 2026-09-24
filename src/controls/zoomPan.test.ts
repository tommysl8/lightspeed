import { describe, expect, it } from 'vitest';
import { zoomPanPath } from './zoomPan';

describe('zoom-pan path', () => {
  it('starts and ends where asked, even across a 10⁶ scale jump', () => {
    for (const [d, w0, w1] of [
      [4.4e9, 2.5e4, 1e5], // Earth → Neptune
      [1e3, 5e4, 5e4], // tiny hop
      [7.5e9, 1e3, 3e9], // zoom way out
    ]) {
      const p = zoomPanPath(d, w0, w1);
      const a = p.at(0);
      const b = p.at(1);
      expect(a.u).toBeCloseTo(0, 9);
      expect(a.w / w0).toBeCloseTo(1, 9);
      expect(b.u).toBeCloseTo(1, 6);
      expect(b.w / w1).toBeCloseTo(1, 6);
    }
  });

  it('zooms out mid-way on long jumps so both ends fit in view', () => {
    const p = zoomPanPath(4.4e9, 2.5e4, 1e5);
    const mid = p.at(0.5);
    expect(mid.w).toBeGreaterThan(1e9);
  });

  it('handles pure zoom', () => {
    const p = zoomPanPath(0, 1e4, 1e8);
    expect(p.at(1).w).toBeCloseTo(1e8, 0);
    expect(p.S).toBeGreaterThan(0);
  });
});
