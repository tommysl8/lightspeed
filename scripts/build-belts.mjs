// Builds public/data/belts.bin: real osculating orbital elements for the brightest
// main-belt asteroids, Jupiter Trojans, and all known trans-Neptunian objects.
//
// Source: JPL Small-Body Database Query API, https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html
// Elements are heliocentric, referred to the J2000 ecliptic and equinox.
//
// Raw API responses are cached in data-raw/ (not committed). Delete them to refetch.
//
// belts.bin layout (little-endian):
//   header, 32 bytes: u32 magic 'BLT1', u32 count, u32 reserved, u32 reserved,
//                     f64 reference epoch (JD, TDB), f64 reserved
//   f32[count]  a      semi-major axis, AU
//   u16[count]  e      eccentricity * 65535
//   u16[count]  i      inclination / pi * 65535
//   u16[count]  node   longitude of ascending node / 2pi * 65535
//   u16[count]  peri   argument of perihelion / 2pi * 65535
//   u16[count]  M      mean anomaly at the reference epoch / 2pi * 65535
//   u8[count]   H      absolute magnitude * 10 (clamped to 0..255)
//   u8[count]   kind   0 = main belt / Mars-crosser, 1 = Jupiter Trojan, 2 = TNO

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = 'a,e,i,om,w,ma,epoch,H,class';
const REF_EPOCH_JD = 2461041.5; // 2026-01-01 00:00 TDB
// Gaussian gravitational constant k (IAU 1976), rad/day for a = 1 AU.
const K_GAUSS = 0.01720209895;

async function query(name, params) {
  const cache = `data-raw/sbdb_${name}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const url = `${API}?${new URLSearchParams({ fields: FIELDS, ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const json = await res.json();
  writeFileSync(cache, JSON.stringify(json));
  return json;
}

const asteroids = await query('asteroids_H14', {
  'sb-kind': 'a',
  'sb-class': 'IMB,MBA,OMB,TJN,MCA',
  'sb-cdata': JSON.stringify({ AND: ['H|LT|14'] }),
});
const tnos = await query('tnos', { 'sb-class': 'TNO' });

const TAU = Math.PI * 2;
const wrap = (x) => ((x % TAU) + TAU) % TAU;
const deg = Math.PI / 180;

const rows = [];
for (const src of [asteroids, tnos]) {
  const idx = Object.fromEntries(src.fields.map((f, i) => [f, i]));
  for (const r of src.data) {
    const a = Number(r[idx.a]);
    const e = Number(r[idx.e]);
    const i = Number(r[idx.i]) * deg;
    const om = Number(r[idx.om]) * deg;
    const w = Number(r[idx.w]) * deg;
    const ma = Number(r[idx.ma]) * deg;
    const epoch = Number(r[idx.epoch]);
    const H = r[idx.H] == null ? 15 : Number(r[idx.H]);
    const cls = r[idx.class];
    if (![a, e, i, om, w, ma, epoch].every(Number.isFinite)) continue;
    if (!(a > 0) || !(e >= 0 && e < 1)) continue;
    const n = K_GAUSS / Math.pow(a, 1.5); // mean motion, rad/day
    const M = wrap(ma + n * (REF_EPOCH_JD - epoch));
    const kind = cls === 'TNO' ? 2 : cls === 'TJN' ? 1 : 0;
    rows.push({ a, e, i, om: wrap(om), w: wrap(w), M, H, kind });
  }
}

const N = rows.length;
const size = 32 + N * 4 + N * 2 * 5 + N * 2;
const buf = new ArrayBuffer(size);
const dv = new DataView(buf);
dv.setUint32(0, 0x31544c42, true); // 'BLT1'
dv.setUint32(4, N, true);
dv.setFloat64(16, REF_EPOCH_JD, true);
let off = 32;
const f32 = new Float32Array(buf, off, N);
off += N * 4;
const u16 = (k) => {
  const arr = new Uint16Array(buf, off + k * N * 2, N);
  return arr;
};
const [ue, ui, unode, uperi, uM] = [0, 1, 2, 3, 4].map(u16);
off += N * 2 * 5;
const uH = new Uint8Array(buf, off, N);
const uKind = new Uint8Array(buf, off + N, N);
const q = (x) => Math.max(0, Math.min(65535, Math.round(x * 65535)));
rows.forEach((r, k) => {
  f32[k] = r.a;
  ue[k] = q(r.e);
  ui[k] = q(r.i / Math.PI);
  unode[k] = q(r.om / TAU);
  uperi[k] = q(r.w / TAU);
  uM[k] = q(r.M / TAU);
  uH[k] = Math.max(0, Math.min(255, Math.round(r.H * 10)));
  uKind[k] = r.kind;
});

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/belts.bin', Buffer.from(buf));
const counts = [0, 0, 0];
rows.forEach((r) => counts[r.kind]++);
console.log(
  `belts.bin: ${N} objects (main belt ${counts[0]}, Trojans ${counts[1]}, TNOs ${counts[2]}), ${size} bytes`,
);
