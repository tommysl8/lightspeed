// Test helpers: read the shipped files from disk and decode 8-bit PNGs (greyscale or palette),
// so the tests check the real outputs. Node only; not for the app.
import { readFileSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';

const ROOT = new URL('../../../', import.meta.url);

export const repoFile = (rel: string): Buffer => readFileSync(new URL(rel, ROOT));
export const repoGunzip = (rel: string): Buffer => gunzipSync(repoFile(rel));
export const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  /** One byte per pixel: grey level or palette index. */
  pixels: Uint8Array;
  palette: Uint8Array | null;
  text: Record<string, string>;
}

export function decodePng8(buf: Buffer): DecodedPng {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  const idat: Buffer[] = [];
  const text: Record<string, string> = {};
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('only 8-bit PNGs');
      colorType = data[9];
    } else if (type === 'PLTE') palette = new Uint8Array(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'tEXt') {
      const z = data.indexOf(0);
      text[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1);
    }
    off += 12 + len;
  }
  if (colorType !== 0 && colorType !== 3) throw new Error('only greyscale or palette PNGs');
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    const f = raw[j * (width + 1)];
    for (let i = 0; i < width; i++) {
      const x = raw[j * (width + 1) + 1 + i];
      const a = i > 0 ? pixels[j * width + i - 1] : 0;
      const b = j > 0 ? pixels[(j - 1) * width + i] : 0;
      const c = i > 0 && j > 0 ? pixels[(j - 1) * width + i - 1] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[j * width + i] = (x + p) & 255;
    }
  }
  return { width, height, colorType, pixels, palette, text };
}
