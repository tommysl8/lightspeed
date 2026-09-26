// Builds public/data/cosmic-web.bin.gz: 55,877 galaxies with measured distances, from Cosmicflows-4.
//
// Sources
//   Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94; doi:10.3847/1538-4357/ac94d8), tables 2 and 4 as
//   distributed by CDS/VizieR (J/ApJ/944/94). The article (accepted August 2022) and its tables are
//   published under the Creative Commons Attribution 4.0 licence, as stated on the IOP article page,
//   so the derived file is CC BY 4.0 with credit to Tully et al. (2023).
//   Ks magnitudes, axis ratios and position angles: 2MASS Extended Source Catalog (Skrutskie et al.
//   2006, AJ 131, 1163; VizieR VII/233), matched by position with the CDS XMatch service. 2MASS data
//   are released by NASA/IPAC with a required acknowledgement (see staging/cosmos/cosmos.md).
//
// Not used, on purpose: the 2MASS Redshift Survey (Huchra et al. 2012). Its README asks users not to
// redistribute the catalogue files, and the ApJS tables are AAS copyright (pre-2021), so a derived
// point file could not be shipped under confirmed terms.
//
// Inputs (cached in data-raw/cosmos/, fetched only when missing):
//   J_ApJ_944_94/table2.dat.gz   https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat.gz
//   J_ApJ_944_94/table4.dat.gz   https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table4.dat.gz
//   cf4_2masx_xmatch.csv.gz      CDS XMatch of table2 positions against vizier:VII/233/xsc within 6"
//
// Output: public/data/cosmic-web.bin.gz, gzip of the little-endian binary described below (the app
// decodes it with DecompressionStream('gzip'); Vercel does not compress application/octet-stream).
//
//   Header, 64 bytes:
//     0   char[4]  magic "LSCW"
//     4   uint16   format version (1)
//     6   uint16   header size in bytes (64)
//     8   uint32   N, number of galaxies
//     12  uint32   number of columns (12)
//     16  uint32[12] byte offset of each column from the start of the file
//   Columns (structure of arrays, each N long, in this order):
//     ra        float32  deg, ICRS (J2000) right ascension
//     dec       float32  deg, ICRS declination
//     vcmb      int16    km/s, galaxy velocity cz in the CMB frame (CF4 Vcmb); -32768 = not known
//     vgroup    int16    km/s, CMB-frame velocity of the galaxy's group (CF4 table 4 V3k); -32768 = none
//     dm        uint16   distance modulus x 1000, all methods combined (CF4 DM); 0 = none
//     dmgroup   uint16   group distance modulus x 1000 on the calibrated scale (CF4 DMzp); 0 = none
//     ks        uint16   2MASS Ks total magnitude x 1000 (k_m_ext, not extinction corrected); 0 = no match
//     edm       uint8    uncertainty of dm x 100 (mag); 0 = none
//     edmgroup  uint8    uncertainty of dmgroup x 100 (mag); 0 = none
//     methods   uint8    bit mask of the methods behind dm: 1 SN Ia, 2 Tully-Fisher, 4 Fundamental Plane,
//                        8 SBF, 16 SN II, 32 TRGB, 64 Cepheids, 128 maser
//     axisratio uint8    2MASS b/a x 100 (sup_ba); 255 = unknown
//     pa        uint8    2MASS position angle of the major axis, deg east of north in [0,180); 255 = unknown
//   Rows are sorted by group distance (dmgroup, else dm), then by group, so members of a group are
//   contiguous and the nearest galaxies come first.
//
// Run: node scripts/build-cosmic-web.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const RAW = 'data-raw/cosmos';
const CF4_DIR = `${RAW}/J_ApJ_944_94`;
const CDS_FTP = 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94';
const XMATCH_FILE = `${RAW}/cf4_2masx_xmatch.csv.gz`;
const XMATCH_RADIUS_ARCSEC = 6;
const OUT = 'public/data/cosmic-web.bin.gz';

async function ensure(path, url) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

// Fixed-width field, 1-based inclusive byte range as in the VizieR ReadMe.
const field = (line, a, b) => line.slice(a - 1, b).trim();
const num = (line, a, b) => {
  const s = field(line, a, b);
  return s === '' ? NaN : Number(s);
};

await ensure(`${CF4_DIR}/table2.dat.gz`, `${CDS_FTP}/table2.dat.gz`);
await ensure(`${CF4_DIR}/table4.dat.gz`, `${CDS_FTP}/table4.dat.gz`);

// ---- CF4 table 2: individual galaxies ----
const METHOD_COLS = [
  // [bit, first byte of DM column, last byte]
  [1, 42, 47], // SN Ia
  [2, 54, 59], // Tully-Fisher
  [4, 66, 71], // Fundamental Plane
  [8, 78, 83], // SBF
  [16, 91, 96], // SN II
  [32, 103, 107], // TRGB
  [64, 114, 119], // Cepheids
  [128, 127, 131], // maser
];
const galaxies = [];
for (const line of gunzipSync(readFileSync(`${CF4_DIR}/table2.dat.gz`)).toString('latin1').split(/\r?\n/)) {
  if (line.trim() === '') continue;
  let methods = 0;
  for (const [bit, a, b] of METHOD_COLS) if (Number.isFinite(num(line, a, b))) methods |= bit;
  galaxies.push({
    pgc: num(line, 1, 7),
    group: num(line, 9, 15),
    vcmb: num(line, 23, 27),
    dm: num(line, 29, 34),
    edm: num(line, 36, 40),
    methods,
    ra: num(line, 138, 145),
    dec: num(line, 147, 154),
  });
}

// ---- CF4 table 4: groups ----
const groups = new Map();
for (const line of gunzipSync(readFileSync(`${CF4_DIR}/table4.dat.gz`)).toString('latin1').split(/\r?\n/)) {
  if (line.trim() === '') continue;
  groups.set(num(line, 1, 7), { dmzp: num(line, 9, 14), edmzp: num(line, 16, 20), v3k: num(line, 40, 44) });
}

// ---- 2MASS XSC cross-match (CDS XMatch), fetched once ----
if (!existsSync(XMATCH_FILE)) {
  const csv = ['pgc,ra,dec', ...galaxies.map((g) => `${g.pgc},${g.ra},${g.dec}`)].join('\n');
  const form = new FormData();
  form.append('request', 'xmatch');
  form.append('distMaxArcsec', String(XMATCH_RADIUS_ARCSEC));
  form.append('RESPONSEFORMAT', 'csv');
  form.append('cat1', new Blob([csv], { type: 'text/csv' }), 'cf4.csv');
  form.append('colRA1', 'ra');
  form.append('colDec1', 'dec');
  form.append('cat2', 'vizier:VII/233/xsc');
  console.log('querying CDS XMatch (CF4 x 2MASS XSC)...');
  const res = await fetch('http://cdsxmatch.u-strasbg.fr/xmatch/api/v1/sync', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`XMatch: HTTP ${res.status}`);
  writeFileSync(XMATCH_FILE, gzipSync(Buffer.from(await res.arrayBuffer()), { level: 9 }));
}
const xm = new Map(); // pgc -> nearest XSC match
{
  const lines = gunzipSync(readFileSync(XMATCH_FILE)).toString('utf8').split(/\r?\n/);
  const head = lines[0].split(',');
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split(',');
    const d = Number(f[c.angDist]);
    if (!(d <= XMATCH_RADIUS_ARCSEC)) continue;
    const pgc = Number(f[c.pgc]);
    const prev = xm.get(pgc);
    if (prev && prev.d <= d) continue;
    xm.set(pgc, { d, k: Number(f[c['K.ext']]), ba: Number(f[c['Sb/a']]), pa: Number(f[c.Spa]) });
  }
}

// ---- assemble ----
for (const g of galaxies) {
  const grp = groups.get(g.group);
  g.dmg = grp ? grp.dmzp : NaN;
  g.edmg = grp ? grp.edmzp : NaN;
  g.vg = grp ? grp.v3k : NaN;
  g.sortKey = Number.isFinite(g.dmg) ? g.dmg : g.dm;
  const m = xm.get(g.pgc);
  g.ks = m ? m.k : NaN;
  g.ba = m ? m.ba : NaN;
  g.pa = m ? m.pa : NaN;
}
galaxies.sort((a, b) => a.sortKey - b.sortKey || a.group - b.group || a.dm - b.dm || a.pgc - b.pgc);

const N = galaxies.length;
const COLS = [
  ['ra', Float32Array],
  ['dec', Float32Array],
  ['vcmb', Int16Array],
  ['vgroup', Int16Array],
  ['dm', Uint16Array],
  ['dmgroup', Uint16Array],
  ['ks', Uint16Array],
  ['edm', Uint8Array],
  ['edmgroup', Uint8Array],
  ['methods', Uint8Array],
  ['axisratio', Uint8Array],
  ['pa', Uint8Array],
];
const HEADER = 64;
let offset = HEADER;
const offsets = [];
for (const [, T] of COLS) {
  offsets.push(offset);
  offset += N * T.BYTES_PER_ELEMENT;
}
const buf = Buffer.alloc(offset);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
buf.write('LSCW', 0, 'latin1');
dv.setUint16(4, 1, true);
dv.setUint16(6, HEADER, true);
dv.setUint32(8, N, true);
dv.setUint32(12, COLS.length, true);
offsets.forEach((o, i) => dv.setUint32(16 + 4 * i, o, true));

const i16 = (v) => (Number.isFinite(v) && v !== 0 ? Math.round(v) : -32768);
const u16 = (v, s) => (Number.isFinite(v) ? Math.round(v * s) : 0);
const u8err = (v) => (Number.isFinite(v) ? Math.max(1, Math.min(254, Math.round(v * 100))) : 0);
let withKs = 0;
let noV = 0;
galaxies.forEach((g, i) => {
  dv.setFloat32(offsets[0] + 4 * i, g.ra, true);
  dv.setFloat32(offsets[1] + 4 * i, g.dec, true);
  // CF4 prints Vcmb = 0 for galaxies without a velocity (dwarfs with TRGB distances only).
  dv.setInt16(offsets[2] + 2 * i, i16(g.vcmb), true);
  if (!(Number.isFinite(g.vcmb) && g.vcmb !== 0)) noV++;
  dv.setInt16(offsets[3] + 2 * i, Number.isFinite(g.vg) ? Math.round(g.vg) : -32768, true);
  dv.setUint16(offsets[4] + 2 * i, u16(g.dm, 1000), true);
  dv.setUint16(offsets[5] + 2 * i, u16(g.dmg, 1000), true);
  dv.setUint16(offsets[6] + 2 * i, u16(g.ks, 1000), true);
  if (Number.isFinite(g.ks)) withKs++;
  buf[offsets[7] + i] = u8err(g.edm);
  buf[offsets[8] + i] = u8err(g.edmg);
  buf[offsets[9] + i] = g.methods;
  buf[offsets[10] + i] = Number.isFinite(g.ba) ? Math.round(g.ba * 100) : 255;
  buf[offsets[11] + i] = Number.isFinite(g.pa) ? ((Math.round(g.pa) % 180) + 180) % 180 : 255;
});

mkdirSync('public/data', { recursive: true });
const gz = gzipSync(buf, { level: 9 });
writeFileSync(OUT, gz);

// Index of every galaxy by PGC, for build-local-galaxies.mjs (named objects point into the file).
const index = {};
galaxies.forEach((g, i) => {
  index[g.pgc] = [i, g.group];
});
writeFileSync(`${RAW}/cosmic-web-index.json`, JSON.stringify(index));

console.log(
  `${OUT}: ${N} galaxies, ${buf.length} bytes raw, ${gz.length} bytes gzipped; ` +
    `${withKs} with 2MASS Ks; ${noV} without a velocity; ${groups.size} groups`,
);
