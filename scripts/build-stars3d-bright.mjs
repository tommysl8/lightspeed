// Builds public/data/stars3d-bright.bin.gz: the naked-eye stars of public/data/stars3d.bin.gz, for the
// first frames while the full catalogue (5 MB) is still on its way.
//
// The catalogue is sorted by apparent V seen from the Sun at J2000, brightest first, so the subset is
// simply its first N stars: every star down to V = 6.6 (the faintest constellation-figure star is
// V 6.6). The file has exactly the catalogue's layout ("LSS3", docs/data/stars.md §3.1) with N in the
// header, so the same decoder reads it and star i is the same star in both files.
//
// Run after scripts/build-stars3d.mjs:  node scripts/build-stars3d-bright.mjs
// Deterministic: the same input gives the same bytes.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync, constants } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'public', 'data', 'stars3d.bin.gz');
const OUT = join(ROOT, 'public', 'data', 'stars3d-bright.bin.gz');
const V_LIMIT = 6.6;

const raw = gunzipSync(readFileSync(IN));
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const dv = new DataView(buf);
const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
if (magic !== 'LSS3') throw new Error(`unexpected magic ${magic}`);
const n = dv.getUint32(8, true);
const sections = dv.getUint32(24, true);
const offsets = Array.from({ length: sections }, (_, k) => dv.getUint32(28 + 4 * k, true));
// [elements per star, bytes per element] of each section: position, velocity, absMag, teff, flags.
const LAYOUT = [
  [3, 4],
  [3, 2],
  [1, 2],
  [1, 2],
  [1, 2],
];

function unshuffle(offset, count, width) {
  const src = new Uint8Array(buf, offset, count * width);
  const out = new Uint8Array(count * width);
  for (let k = 0; k < width; k++) for (let i = 0; i < count; i++) out[i * width + k] = src[k * count + i];
  return out;
}
function shuffle(bytes, count, width) {
  const out = new Uint8Array(count * width);
  for (let k = 0; k < width; k++) for (let i = 0; i < count; i++) out[k * count + i] = bytes[i * width + k];
  return out;
}

const cols = LAYOUT.map(([per, width], s) => unshuffle(offsets[s], per * n, width));
const pos = new Float32Array(cols[0].buffer);
const absMag = new Int16Array(cols[2].buffer);
const magUnit = dv.getFloat32(20, true);
let keep = 0;
for (let i = 0; i < n; i++) {
  const r = Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  const v = absMag[i] * magUnit + 5 * Math.log10(r) - 5;
  if (v <= V_LIMIT) keep = i + 1;
}

const parts = LAYOUT.map(([per, width], s) => shuffle(cols[s].subarray(0, per * keep * width), per * keep, width));
const header = new Uint8Array(buf.slice(0, 64));
const hv = new DataView(header.buffer);
hv.setUint32(8, keep, true);
let at = 64;
parts.forEach((p, s) => {
  hv.setUint32(28 + 4 * s, at, true);
  at += Math.ceil(p.byteLength / 4) * 4;
});
const out = new Uint8Array(at);
out.set(header, 0);
parts.forEach((p, s) => out.set(p, hv.getUint32(28 + 4 * s, true)));
const gz = gzipSync(out, { level: constants.Z_BEST_COMPRESSION });
// Clear the gzip header's OS byte, so the output does not depend on the platform it was built on.
gz[9] = 255;
writeFileSync(OUT, gz);
console.log(`stars3d-bright.bin.gz: ${keep.toLocaleString('en-GB')} of ${n.toLocaleString('en-GB')} stars (V ≤ ${V_LIMIT}), ${out.byteLength.toLocaleString('en-GB')} B raw, ${gz.byteLength.toLocaleString('en-GB')} B gzipped`);
