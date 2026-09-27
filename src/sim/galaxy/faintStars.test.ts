/**
 * The light of the catalogue's stars too faint to be drawn as points (public/textures/faint-stars.png,
 * scripts/build-faint-stars.mjs): all of it is in the map, in the sky map's projection and units,
 * and it is the light the star field leaves out.
 */
import { describe, expect, it } from 'vitest';
import { readBytes } from '../../test/files';
import { loadStars } from '../../test/stars';
import { apply, ECL_TO_GAL } from './frames';
import { MW_FAINT_STARS, MW_FLUX_PER_SR, decodeSvs } from './background';
import { STAR_MAG_LIMIT } from '../stars/visibility';

interface NodeZlib {
  inflateSync(data: Uint8Array): Uint8Array;
}
const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as NodeZlib;

/** A grey 8-bit PNG's pixels, row 0 at the top. */
function readGreyPng(path: string): { w: number; h: number; px: Uint8Array } {
  const b = readBytes(path);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Uint8Array[] = [];
  while (o < b.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...b.subarray(o + 4, o + 8));
    const data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = dv.getUint32(o + 8);
      h = dv.getUint32(o + 12);
      expect(data[8]).toBe(8); // bit depth
      expect(data[9]).toBe(0); // grey
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const all = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let k = 0;
  for (const d of idat) {
    all.set(d, k);
    k += d.length;
  }
  const raw = zlib.inflateSync(all);
  const px = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const f = raw[j * (w + 1)];
    for (let i = 0; i < w; i++) {
      const x = raw[j * (w + 1) + 1 + i];
      const a = i > 0 ? px[j * w + i - 1] : 0;
      const up = j > 0 ? px[(j - 1) * w + i] : 0;
      const c = i > 0 && j > 0 ? px[(j - 1) * w + i - 1] : 0;
      const p = a + up - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : paeth;
      px[j * w + i] = (x + pred) & 255;
    }
  }
  return { w, h, px };
}

describe('the faint stars’ light', () => {
  const { w, h, px } = readGreyPng(`public/textures/${MW_FAINT_STARS}`);

  it('holds the light the star field leaves out: the catalogue’s stars past the eye’s limit, seen from the Sun', () => {
    expect([w, h]).toEqual([1024, 512]);
    // The map: p per texel, times 1,790 per steradian (the sky map's units), over the sphere.
    let map = 0;
    for (let j = 0; j < h; j++) {
      const dec = Math.PI / 2 - ((j + 0.5) * Math.PI) / h;
      const omega = ((2 * Math.PI) / w) * (Math.PI / h) * Math.cos(dec);
      for (let i = 0; i < w; i++) map += decodeSvs(px[j * w + i]) * MW_FLUX_PER_SR * omega;
    }
    // The stars: 1 − the star field's fade (V = 6 to 7) of each one's light.
    const stars = loadStars();
    let want = 0;
    for (let i = 0; i < stars.count; i++) {
      const r = Math.hypot(stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]);
      if (!(r > 0)) continue;
      const V = stars.absMag[i] + 5 * Math.log10(r / 10);
      const t = Math.min(1, Math.max(0, V - (STAR_MAG_LIMIT - 0.5)));
      want += t * t * (3 - 2 * t) * 10 ** (-0.4 * V);
    }
    // About 106 stars of V = 0 (the 8-bit encoding holds each texel to a few per cent).
    expect(want).toBeGreaterThan(100);
    expect(want).toBeLessThan(112);
    expect(Math.abs(map / want - 1)).toBeLessThan(0.03);
  });

  it('is brightest along the Milky Way, in the sky map’s projection', () => {
    // Mean p in bands of galactic latitude, from each texel's direction (ICRS: RA = 0 at the centre column, increasing to the left).
    const band = { low: [0, 0], high: [0, 0] };
    const icrsToEcl = (v: [number, number, number]): [number, number, number] => {
      const e = (84381.448 / 3600) * (Math.PI / 180);
      return [v[0], Math.cos(e) * v[1] + Math.sin(e) * v[2], -Math.sin(e) * v[1] + Math.cos(e) * v[2]];
    };
    for (let j = 0; j < h; j += 4)
      for (let i = 0; i < w; i += 4) {
        const dec = Math.PI / 2 - ((j + 0.5) * Math.PI) / h;
        const ra = Math.PI - ((i + 0.5) / w) * 2 * Math.PI;
        const g = apply(ECL_TO_GAL, icrsToEcl([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]));
        const b = Math.abs(Math.asin(g[2])) * (180 / Math.PI);
        const p = decodeSvs(px[j * w + i]);
        const c = Math.cos(dec);
        if (b < 10) {
          band.low[0] += p * c;
          band.low[1] += c;
        } else if (b > 50) {
          band.high[0] += p * c;
          band.high[1] += c;
        }
      }
    expect(band.low[0] / band.low[1] / (band.high[0] / band.high[1])).toBeGreaterThan(2);
  });
});
