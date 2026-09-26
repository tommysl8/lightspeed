import { describe, expect, it } from 'vitest';
import { parseLsm1, shapeGeometry } from './shapes';

/** An LSM1 file (staging/phase2/assets.md §3) for an octahedron of radius r. */
function octahedron(r: number): ArrayBuffer {
  const v = [
    [r, 0, 0],
    [-r, 0, 0],
    [0, r, 0],
    [0, -r, 0],
    [0, 0, r],
    [0, 0, -r],
  ];
  // Counter-clockwise from outside.
  const t = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ];
  const buf = new ArrayBuffer(32 + 12 * v.length + 2 * 3 * t.length);
  const dv = new DataView(buf);
  'LSM1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint32(4, 1, true);
  dv.setUint32(8, v.length, true);
  dv.setUint32(12, t.length, true);
  dv.setUint32(16, 2, true);
  dv.setFloat32(20, r, true);
  dv.setFloat32(24, r * 0.8, true);
  v.flat().forEach((x, i) => dv.setFloat32(32 + 4 * i, x, true));
  t.flat().forEach((x, i) => dv.setUint16(32 + 12 * v.length + 2 * i, x, true));
  return buf;
}

describe('LSM1 shape models', () => {
  it('parse, and refuse anything else', () => {
    const s = parseLsm1(octahedron(10));
    expect(s.positions.length).toBe(18);
    expect(s.indices.length).toBe(24);
    expect(s.maxRadiusKm).toBe(10);
    expect(s.equalVolumeRadiusKm).toBeCloseTo(8, 5);
    expect(() => parseLsm1(new ArrayBuffer(40))).toThrow(/LSM1/);
  });

  it('become geometry in mesh axes (body x, z, −y) with longitude–latitude UVs and a split seam', () => {
    const g = shapeGeometry(parseLsm1(octahedron(10)));
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    // Vertex 2 is body +y (90° E): mesh −z, u = 0.75 (as on three.js' sphere).
    expect([pos.getX(2), pos.getY(2), pos.getZ(2)]).toEqual([0, 0, -10]);
    expect(uv.getX(2)).toBeCloseTo(0.75, 9);
    // Vertex 4 is the north pole: mesh +y, v = 1.
    expect(pos.getY(4)).toBe(10);
    expect(uv.getY(4)).toBeCloseTo(1, 9);
    // Faces crossing longitude 180° (between −x and ±y) got seam copies: more vertices than 6.
    expect(pos.count).toBeGreaterThan(6);
    const idx = g.getIndex()!;
    for (let f = 0; f < idx.count; f += 3) {
      const us = [0, 1, 2].map((k) => uv.getX(idx.getX(f + k)));
      // Pole vertices aside, no triangle spans more than half a turn.
      const spread = Math.max(...us) - Math.min(...us);
      expect(spread).toBeLessThanOrEqual(0.75);
    }
    expect(g.getAttribute('normal')).toBeDefined();
  });
});
