// Builds public/data/survey/: the galaxy surveys as a nested octree of gzip files (the format in
// src/sim/surveys/format.ts, the method in docs/data/surveys.md).
//
// Sources (credits, licences and the acknowledgements they ask for in CREDITS.md and docs/data/surveys.md)
//   DESI Data Release 1 (DESI Collaboration et al. 2026, AJ 171, 285; arXiv:2503.14745), the large-scale-structure
//   "clustering" catalogues v1.5 of its four tracers (Ross et al. 2025, JCAP 01, 125): the Bright Galaxy Survey, the
//   luminous red galaxies, the emission-line galaxies and the quasars. CC BY 4.0.
//   SDSS DR17 (Abdurro'uf et al. 2022, ApJS 259, 35): the SDSS-I/II spectroscopic galaxies from SkyServer (Strauss et
//   al. 2002), BOSS DR12 LOWZ + CMASS (Reid et al. 2016), eBOSS DR16 LRG, ELG and QSO clustering catalogues (Ross et
//   al. 2020; Raichoor et al. 2021) and the DR16 quasar catalogue DR16Q (Lyke et al. 2020, via VizieR VII/289). SDSS
//   data are "considered in the public domain" (sdss.org image-use policy).
//
// What is done to them (the changes CC BY asks to be indicated):
//   1. kept: the LSS catalogues as delivered (their quality cuts); SDSS galaxies with zWarning = 0, sciencePrimary = 1,
//      class GALAXY, z > 0.002; BOSS rows with IMATCH = 1 (IMATCH = 2 re-uses SDSS-I/II redshifts: duplicates);
//      DR16Q rows with IS_QSO_FINAL = 1 and z > 0; everything with z <= Z_MAX;
//   2. merged: DESI entries by TARGETID (the first of BGS, LRG, ELG, QSO kept), then each SDSS catalogue against all
//      before it on the sky within 1.5" (src/sim/surveys/match.ts): the earlier survey keeps the galaxy and its
//      redshift; galaxies that are in Cosmicflows-4 (within 6" and 800 km/s) are left to the cosmic web layer;
//   3. placed: each heliocentric redshift taken to the CMB frame and turned into a comoving distance with the app's own
//      cosmology (src/physics/cosmology, Planck 2018), along the galaxy's direction: redshift-space positions;
//   4. described: a class (red or blue by g - r for BGS and SDSS galaxies, at the trough of the colour distribution
//      measured in each redshift bin; red for LRG and BOSS, blue for ELG, quasar for the QSO samples) and a luminosity
//      (r band, from the catalogue's photometry where there is one, with only the (1 + z) bandwidth term for the
//      K-correction; otherwise the median of the measured ones of its class);
//   5. rounded: directions kept to 5", distances to 0.125 Mpc; tiled into the octree with glows.
//
// Inputs (data-raw/surveys/, fetched only when missing; about 1.9 GB):
//   desi/{BGS_ANY,LRG,ELG_LOPnotqso,QSO}_{NGC,SGC}_clustering.dat.fits   DESI_LSS below
//   sdss/galaxy_DR12v5_CMASSLOWZTOT_{North,South}.fits.gz                  SDSS_BOSS below
//   sdss/eBOSS_{LRG,ELG,QSO}_clustering_data-{NGC,SGC}-vDR16.fits          SDSS_EBOSS below
//   sdss/dr16q_vizier.csv                                                  VizieR TAP, VII/289
//   sdss/legacy_dr17_ra*.csv                                               SkyServer DR17 SQL (LEGACY_SQL)
//   licences/*.html                                                        the licence and acknowledgement pages
// and public/data/cosmic-web.bin.gz (the Cosmicflows-4 galaxies, for step 2).
//
// Output: public/data/survey/hierarchy.bin.gz and r<octants>.bin.gz, one per node (every file under 1 MB);
// docs/data/surveys-build-log.txt.
//
// Run: node --max-old-space-size=8000 scripts/build-surveys.mjs   (about 1.5 GB of memory, a few minutes)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFitsTable } from './surveys/fits.mjs';
import { Cosmology, PLANCK18 } from '../src/physics/cosmology/cosmology.ts';
import * as F from '../src/sim/surveys/format.ts';
import { CF4_MATCH_ARCSEC, CF4_MATCH_KM_S, dedupe, SkyIndex, SURVEY_MATCH_ARCSEC } from '../src/sim/surveys/match.ts';
import { buildOctree, nodeBytes } from '../src/sim/surveys/tile.ts';

const RAW = 'data-raw/surveys';
const OUT = 'public/data/survey';
const LOG = 'docs/data/surveys-build-log.txt';
/** The deepest redshift kept: DESI's quasar sample stops here, and above it DESI's Lyman-alpha redshifts are biased (DR1 known issues). */
const Z_MAX = 3.5;
const SEED = 20260930;

const DESI_LSS = 'https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5';
const SDSS_BOSS = 'https://data.sdss.org/sas/dr12/boss/lss';
const SDSS_EBOSS = 'https://data.sdss.org/sas/dr17/eboss/lss/catalogs/DR16';
const VIZIER_TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const SKYSERVER = 'https://skyserver.sdss.org/dr17/SkyServerWS/SearchTools/SqlSearch';
const LEGACY_SQL = (a, b) =>
  `SELECT s.specObjID, s.ra, s.dec, s.z, s.zErr, p.modelMag_g, p.modelMag_r, p.petroMag_r, p.extinction_g, p.extinction_r FROM SpecObj s LEFT JOIN PhotoObj p ON p.objID = s.bestObjID WHERE s.survey = 'sdss' AND s.class = 'GALAXY' AND s.zWarning = 0 AND s.sciencePrimary = 1 AND s.ra >= ${a} AND s.ra < ${b}`;
const LEGACY_SLICES = [
  [0, 150],
  [150, 200],
  [200, 360.0001],
];
const LICENCES = {
  'desi_ack.html': 'https://data.desi.lbl.gov/doc/acknowledgments/',
  'sdss_image_use_policy.html': 'https://www.sdss.org/collaboration/image-use-policy/',
  'sdss12_credits.html': 'https://classic.sdss.org/collaboration/credits.html',
  'sdss3_boilerplate.html': 'https://www.sdss3.org/collaboration/boiler-plate.php',
  'sdss4_collaboration.html': 'https://www.sdss4.org/collaboration/',
};

const log = [];
const say = (s) => {
  console.log(s);
  log.push(s);
};
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;

async function ensure(path, url) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

// ─── 0. Inputs and licences ─────────────────────────────────────────────────────────────

const DESI_TRACERS = [
  ['desi-bgs', 'BGS_ANY'],
  ['desi-lrg', 'LRG'],
  ['desi-elg', 'ELG_LOPnotqso'],
  ['desi-qso', 'QSO'],
];
for (const [, t] of DESI_TRACERS) for (const cap of ['NGC', 'SGC']) await ensure(`${RAW}/desi/${t}_${cap}_clustering.dat.fits`, `${DESI_LSS}/${t}_${cap}_clustering.dat.fits`);
for (const cap of ['North', 'South']) await ensure(`${RAW}/sdss/galaxy_DR12v5_CMASSLOWZTOT_${cap}.fits.gz`, `${SDSS_BOSS}/galaxy_DR12v5_CMASSLOWZTOT_${cap}.fits.gz`);
for (const t of ['LRG', 'ELG', 'QSO']) for (const cap of ['NGC', 'SGC']) await ensure(`${RAW}/sdss/eBOSS_${t}_clustering_data-${cap}-vDR16.fits`, `${SDSS_EBOSS}/eBOSS_${t}_clustering_data-${cap}-vDR16.fits`);
await ensure(
  `${RAW}/sdss/dr16q_vizier.csv`,
  `${VIZIER_TAP}?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&MAXREC=2000000&QUERY=${encodeURIComponent('SELECT RAJ2000, DEJ2000, z, r_z, QSO, zPipe, q_zPipe FROM "VII/289/dr16q"')}`,
);
for (const [a, b] of LEGACY_SLICES) await ensure(`${RAW}/sdss/legacy_dr17_ra${a}-${Math.floor(b)}.csv`, `${SKYSERVER}?format=csv&cmd=${encodeURIComponent(LEGACY_SQL(a, b))}`);
for (const [file, url] of Object.entries(LICENCES)) await ensure(`${RAW}/licences/${file}`, url);

/** Text of an HTML fragment: tags dropped, entities of the pages decoded, white space collapsed. */
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The licences are checked against what this build ships: it stops if a page changed.
{
  const desi = readFileSync(`${RAW}/licences/desi_ack.html`, 'utf8');
  if (!/Creative Commons Attribution 4\.0 International License/.test(desi)) throw new Error('DESI data licence is no longer CC BY 4.0: check before shipping');
  const m = /<blockquote>([\s\S]*?)<\/blockquote>/.exec(desi.slice(desi.indexOf('should include the following acknowledgments text')));
  if (!m) throw new Error('DESI acknowledgement text not found on its page');
  const ack = textOf(m[1]);
  const credits = readFileSync('CREDITS.md', 'utf8').replace(/\s+/g, ' ');
  if (!credits.includes(ack)) throw new Error(`CREDITS.md does not quote DESI's acknowledgement as its page gives it now:\n${ack}`);
  say(`DESI acknowledgement (sha256 ${createHash('sha256').update(ack).digest('hex').slice(0, 16)}) is quoted verbatim in CREDITS.md`);
  const sdss = readFileSync(`${RAW}/licences/sdss_image_use_policy.html`, 'utf8');
  if (!/considered in the public domain/.test(sdss)) throw new Error('SDSS no longer says its data are in the public domain: check before shipping');
}

// ─── 1. Read the catalogues ─────────────────────────────────────────────────────────────

/** A catalogue as read: growable columns. */
function catalogue(key) {
  const source = F.SURVEY_SOURCES.find((s) => s.key === key);
  return { key, source: source.code, name: source.name, n: 0, cap: 0, ra: null, dec: null, z: null, gr: null, mr: null, cls: null, id: null };
}
function grow(c, extra) {
  if (c.n + extra <= c.cap) return;
  const cap = Math.max(1024, Math.ceil((c.n + extra) * 1.5));
  const re = (a, T) => {
    const b = new T(cap);
    if (a) b.set(a.subarray(0, c.n));
    return b;
  };
  c.ra = re(c.ra, Float64Array);
  c.dec = re(c.dec, Float64Array);
  c.z = re(c.z, Float64Array);
  c.gr = re(c.gr, Float32Array);
  c.mr = re(c.mr, Float32Array);
  c.cls = re(c.cls, Uint8Array);
  c.id = re(c.id, BigInt64Array);
  c.cap = cap;
}
function push(c, ra, dec, z, gr, mr, cls, id = 0n) {
  grow(c, 1);
  const i = c.n++;
  c.ra[i] = ra;
  c.dec[i] = dec;
  c.z[i] = z;
  c.gr[i] = gr;
  c.mr[i] = mr;
  c.cls[i] = cls;
  c.id[i] = id;
}
const mag = (flux) => (flux > 0 ? 22.5 - 2.5 * Math.log10(flux) : NaN);
const UNSET = 255;
const { red, blue, other, quasar } = F.SURVEY_CLASS;

const cats = [];
const counts = {};

// DESI: one catalogue per tracer; TARGETIDs already taken by an earlier tracer are skipped.
let taken = new BigInt64Array(0);
const hasId = (id) => {
  let lo = 0;
  let hi = taken.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (taken[m] < id) lo = m + 1;
    else hi = m;
  }
  return lo < taken.length && taken[lo] === id;
};
for (const [key, t] of DESI_TRACERS) {
  const c = catalogue(key);
  let rows = 0;
  let dup = 0;
  let zcut = 0;
  const bgs = key === 'desi-bgs';
  for (const cap of ['NGC', 'SGC']) {
    const want = { id: 'TARGETID', ra: 'RA', dec: 'DEC', z: 'Z' };
    if (bgs) Object.assign(want, { g: 'flux_g_dered', r: 'flux_r_dered' });
    rows += await readFitsTable(`${RAW}/desi/${t}_${cap}_clustering.dat.fits`, want, (v, n) => {
      for (let i = 0; i < n; i++) {
        if (hasId(v.id[i])) {
          dup++;
          continue;
        }
        if (!(v.z[i] > 0 && v.z[i] <= Z_MAX)) {
          zcut++;
          continue;
        }
        const gr = bgs ? mag(v.g[i]) - mag(v.r[i]) : NaN;
        const cls = bgs ? UNSET : key === 'desi-lrg' ? red : key === 'desi-elg' ? blue : quasar;
        push(c, v.ra[i], v.dec[i], v.z[i], gr, bgs ? mag(v.r[i]) : NaN, cls, v.id[i]);
      }
    });
  }
  const merged = new BigInt64Array(taken.length + c.n);
  merged.set(taken);
  merged.set(c.id.subarray(0, c.n), taken.length);
  merged.sort();
  taken = merged;
  c.id = null;
  counts[key] = { rows, dupId: dup, zcut };
  say(`${c.name}: ${rows.toLocaleString('en')} rows, ${dup.toLocaleString('en')} already in an earlier DESI tracer, ${zcut} beyond z = ${Z_MAX}; ${c.n.toLocaleString('en')} kept (${secs()})`);
  cats.push(c);
}
taken = null;

// SDSS-I/II galaxies (SkyServer CSV): colour and magnitude from their photometry, corrected for Galactic extinction.
{
  const c = catalogue('sdss-legacy');
  let rows = 0;
  let cut = 0;
  let noPhot = 0;
  for (const [a, b] of LEGACY_SLICES) {
    const lines = readFileSync(`${RAW}/sdss/legacy_dr17_ra${a}-${Math.floor(b)}.csv`, 'utf8').split(/\r?\n/);
    const head = lines[1].split(',');
    const col = Object.fromEntries(head.map((h, i) => [h, i]));
    for (let l = 2; l < lines.length; l++) {
      if (!lines[l]) continue;
      const f = lines[l].split(',');
      rows++;
      const z = Number(f[col.z]);
      if (!(z > 0.002 && z <= Z_MAX)) {
        cut++;
        continue;
      }
      const num = (k) => (f[col[k]] === '' ? NaN : Number(f[col[k]]));
      const gr = num('modelMag_g') - num('extinction_g') - (num('modelMag_r') - num('extinction_r'));
      const mr = num('petroMag_r') - num('extinction_r');
      if (!Number.isFinite(gr)) noPhot++;
      push(c, Number(f[col.ra]), Number(f[col.dec]), z, gr, mr, UNSET);
    }
  }
  counts['sdss-legacy'] = { rows, zcut: cut, noPhot };
  say(`${c.name}: ${rows.toLocaleString('en')} rows, ${cut} with z <= 0.002; ${noPhot} without photometry; ${c.n.toLocaleString('en')} kept (${secs()})`);
  cats.push(c);
}

// BOSS DR12 LOWZ + CMASS: IMATCH 1 only; magnitudes from MODELFLUX (nanomaggies) and EXTINCTION (g is element 1, r 2).
{
  const c = catalogue('boss');
  let rows = 0;
  let imatch2 = 0;
  for (const cap of ['North', 'South']) {
    rows += await readFitsTable(`${RAW}/sdss/galaxy_DR12v5_CMASSLOWZTOT_${cap}.fits.gz`, { ra: 'RA', dec: 'DEC', z: 'Z', imatch: 'IMATCH', fg: 'MODELFLUX[1]', fr: 'MODELFLUX[2]', eg: 'EXTINCTION[1]', er: 'EXTINCTION[2]' }, (v, n) => {
      for (let i = 0; i < n; i++) {
        if (v.imatch[i] !== 1) {
          if (v.imatch[i] === 2) imatch2++;
          continue;
        }
        if (!(v.z[i] > 0 && v.z[i] <= Z_MAX)) continue;
        const mr = mag(v.fr[i]) - v.er[i];
        push(c, v.ra[i], v.dec[i], v.z[i], mag(v.fg[i]) - v.eg[i] - mr, mr, red);
      }
    });
  }
  counts.boss = { rows, imatch2 };
  say(`${c.name}: ${rows.toLocaleString('en')} rows, ${imatch2.toLocaleString('en')} with IMATCH = 2 (SDSS-I/II redshifts re-used) left out; ${c.n.toLocaleString('en')} kept (${secs()})`);
  cats.push(c);
}

// eBOSS DR16 clustering catalogues.
for (const [key, t, cls] of [
  ['eboss-lrg', 'LRG', red],
  ['eboss-elg', 'ELG', blue],
  ['eboss-qso', 'QSO', quasar],
]) {
  const c = catalogue(key);
  let rows = 0;
  for (const cap of ['NGC', 'SGC']) {
    rows += await readFitsTable(`${RAW}/sdss/eBOSS_${t}_clustering_data-${cap}-vDR16.fits`, { ra: 'RA', dec: 'DEC', z: 'Z' }, (v, n) => {
      for (let i = 0; i < n; i++) if (v.z[i] > 0 && v.z[i] <= Z_MAX) push(c, v.ra[i], v.dec[i], v.z[i], NaN, NaN, cls);
    });
  }
  counts[key] = { rows };
  say(`${c.name}: ${rows.toLocaleString('en')} rows; ${c.n.toLocaleString('en')} kept`);
  cats.push(c);
}

// DR16Q (VizieR VII/289): IS_QSO_FINAL = 1 (the QSO column), z > 0.
{
  const c = catalogue('dr16q');
  const lines = readFileSync(`${RAW}/sdss/dr16q_vizier.csv`, 'utf8').split(/\r?\n/);
  const col = Object.fromEntries(lines[0].split(',').map((h, i) => [h, i]));
  let rows = 0;
  let notQso = 0;
  let beyond = 0;
  for (let l = 1; l < lines.length; l++) {
    if (!lines[l]) continue;
    const f = lines[l].split(',');
    rows++;
    if (Number(f[col.QSO]) !== 1) {
      notQso++;
      continue;
    }
    const z = f[col.z] === '' ? NaN : Number(f[col.z]);
    if (!(z > 0)) continue;
    if (z > Z_MAX) {
      beyond++;
      continue;
    }
    push(c, Number(f[col.RAJ2000]), Number(f[col.DEJ2000]), z, NaN, NaN, quasar);
  }
  counts.dr16q = { rows, notQso, beyond };
  say(`${c.name}: ${rows.toLocaleString('en')} rows, ${notQso} not IS_QSO_FINAL = 1, ${beyond.toLocaleString('en')} beyond z = ${Z_MAX} left out; ${c.n.toLocaleString('en')} kept (${secs()})`);
  cats.push(c);
}

// ─── 2. Merge ───────────────────────────────────────────────────────────────────────────

// DESI's four tracers are one set on the sky (their overlaps went by TARGETID); each SDSS catalogue then in turn.
{
  const desi = cats.filter((c) => c.key.startsWith('desi-'));
  const n = desi.reduce((s, c) => s + c.n, 0);
  const ra = new Float64Array(n);
  const dec = new Float64Array(n);
  let o = 0;
  for (const c of desi) {
    ra.set(c.ra.subarray(0, c.n), o);
    dec.set(c.dec.subarray(0, c.n), o);
    o += c.n;
  }
  const sdss = cats.filter((c) => !c.key.startsWith('desi-'));
  const flags = dedupe([{ ra, dec, count: n }, ...sdss.map((c) => ({ ra: c.ra, dec: c.dec, count: c.n }))], SURVEY_MATCH_ARCSEC);
  sdss.forEach((c, k) => {
    const f = flags[k + 1];
    let m = 0;
    for (let i = 0; i < c.n; i++) {
      if (!f[i]) continue;
      c.ra[m] = c.ra[i];
      c.dec[m] = c.dec[i];
      c.z[m] = c.z[i];
      c.gr[m] = c.gr[i];
      c.mr[m] = c.mr[i];
      c.cls[m] = c.cls[i];
      m++;
    }
    say(`${c.name}: ${(c.n - m).toLocaleString('en')} already in a survey before it (within ${SURVEY_MATCH_ARCSEC}"), ${m.toLocaleString('en')} new`);
    counts[c.key].matched = c.n - m;
    c.n = m;
  });
  say(`merged on the sky (${secs()})`);
}

// ─── 3. Place ───────────────────────────────────────────────────────────────────────────

// Comoving distance from the app's own cosmology, tabulated finely (linear interpolation errs by under 1e-4 Mpc).
const cosmo = new Cosmology(PLANCK18);
const Z_STEP = 1e-4;
const chiTable = new Float64Array(Math.ceil((Z_MAX + 0.1) / Z_STEP) + 2);
for (let k = 0; k < chiTable.length; k++) chiTable[k] = cosmo.comovingDistanceMpc(k * Z_STEP);
const chiOf = (z) => {
  const x = z / Z_STEP;
  const k = Math.min(chiTable.length - 2, Math.floor(x));
  return chiTable[k] + (x - k) * (chiTable[k + 1] - chiTable[k]);
};
for (const z of [0.01, 0.1, 0.5, 1, 2, 3.5]) {
  const d = Math.abs(chiOf(z) - cosmo.comovingDistanceMpc(z));
  if (d > 1e-3) throw new Error(`distance table off by ${d} Mpc at z = ${z}`);
}
say(`comoving distance (Planck 2018, the app's module): z = 0.1 ${chiOf(0.1).toFixed(2)} Mpc, z = 1 ${chiOf(1).toFixed(1)} Mpc, z = 3.5 ${chiOf(3.5).toFixed(1)} Mpc`);

const N0 = cats.reduce((s, c) => s + c.n, 0);
const U = {
  n: N0,
  ra: new Float64Array(N0),
  dec: new Float64Array(N0),
  zc: new Float64Array(N0),
  chi: new Float64Array(N0),
  gr: new Float32Array(N0),
  mr: new Float32Array(N0),
  cls: new Uint8Array(N0),
  src: new Uint8Array(N0),
};
{
  let o = 0;
  for (const c of cats) {
    for (let i = 0; i < c.n; i++, o++) {
      U.ra[o] = c.ra[i];
      U.dec[o] = c.dec[i];
      const zc = F.zHelioToCmb(c.z[i], c.ra[i], c.dec[i]);
      U.zc[o] = zc;
      U.chi[o] = chiOf(Math.max(0, zc));
      U.gr[o] = c.gr[i];
      U.mr[o] = c.mr[i];
      U.cls[o] = c.cls[i];
      U.src[o] = c.source;
    }
    c.ra = c.dec = c.z = c.gr = c.mr = c.cls = null;
  }
}

// Cosmicflows-4's galaxies stay in the cosmic web: a survey entry within 6" of one, at a velocity within 800 km/s of it,
// is the same galaxy and is left out here.
{
  const buf = gunzipSync(readFileSync('public/data/cosmic-web.bin.gz'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.toString('latin1', 0, 4) !== 'LSCW') throw new Error('cosmic-web.bin.gz: unexpected format');
  const n = dv.getUint32(8, true);
  const off = (k) => dv.getUint32(16 + 4 * k, true);
  const ra = new Float64Array(n);
  const dec = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ra[i] = dv.getFloat32(off(0) + 4 * i, true);
    dec[i] = dv.getFloat32(off(1) + 4 * i, true);
    const vc = dv.getInt16(off(2) + 2 * i, true);
    v[i] = vc === -32768 ? NaN : vc;
  }
  const cf4 = new SkyIndex(ra, dec, CF4_MATCH_ARCSEC);
  const zMax = 32767 / F.C_KM_S + CF4_MATCH_KM_S / F.C_KM_S;
  let dropped = 0;
  const perSource = new Array(F.SURVEY_SOURCE_COUNT).fill(0);
  let m = 0;
  for (let i = 0; i < U.n; i++) {
    let drop = false;
    if (U.zc[i] < zMax) {
      const cz = U.zc[i] * F.C_KM_S;
      drop = cf4.nearest(U.ra[i], U.dec[i], (j) => Math.abs(v[j] - cz) < CF4_MATCH_KM_S) >= 0;
    }
    if (drop) {
      dropped++;
      perSource[U.src[i]]++;
      continue;
    }
    for (const k of ['ra', 'dec', 'zc', 'chi', 'gr', 'mr', 'cls', 'src']) U[k][m] = U[k][i];
    m++;
  }
  U.n = m;
  say(`Cosmicflows-4: ${n.toLocaleString('en')} galaxies; ${dropped.toLocaleString('en')} survey entries are among them (within ${CF4_MATCH_ARCSEC}" and ${CF4_MATCH_KM_S} km/s) and are left to the cosmic web (${secs()})`);
  F.SURVEY_SOURCES.forEach((s) => (counts[s.key].cf4 = perSource[s.code]));
}

// ─── 4. Colours and luminosities ────────────────────────────────────────────────────────

/**
 * The g − r colour that parts red galaxies from blue ones at each redshift, for one catalogue: in bins of 0.02 in z,
 * the lowest point of the (smoothed) colour histogram between its two highest peaks at least 0.2 mag apart. Bins
 * without two peaks take the straight line fitted to those with them. Observed colours redden with z (the K-correction),
 * so the cut rises with it.
 */
function colourCut(src) {
  const DZ = 0.02;
  const nb = Math.ceil(0.6 / DZ);
  const lo = -0.5;
  const w = 0.02;
  const nh = Math.round(3 / w);
  const hist = Array.from({ length: nb }, () => new Float64Array(nh));
  const tot = new Float64Array(nb);
  for (let i = 0; i < U.n; i++) {
    if (U.src[i] !== src || !Number.isFinite(U.gr[i])) continue;
    const b = Math.floor(U.zc[i] / DZ);
    const h = Math.floor((U.gr[i] - lo) / w);
    if (b >= 0 && b < nb && h >= 0 && h < nh) {
      hist[b][h]++;
      tot[b]++;
    }
  }
  const trough = new Float64Array(nb).fill(NaN);
  for (let b = 0; b < nb; b++) {
    if (tot[b] < 2000) continue;
    const s = new Float64Array(nh);
    for (let h = 0; h < nh; h++) for (let k = -3; k <= 3; k++) s[h] += hist[b][Math.min(nh - 1, Math.max(0, h + k))] / 7;
    const peaks = [];
    for (let h = 1; h < nh - 1; h++) if (s[h] >= s[h - 1] && s[h] > s[h + 1]) peaks.push(h);
    peaks.sort((a, c) => s[c] - s[a]);
    const p1 = peaks[0];
    const p2 = peaks.find((p) => Math.abs(p - p1) * w >= 0.2 && s[p] > 0.1 * s[p1]);
    if (p1 === undefined || p2 === undefined) continue;
    let best = Math.min(p1, p2);
    for (let h = Math.min(p1, p2); h <= Math.max(p1, p2); h++) if (s[h] < s[best]) best = h;
    trough[b] = lo + (best + 0.5) * w;
  }
  // A straight line through the measured troughs, weighted by their counts, for the bins without one.
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let b = 0; b < nb; b++) {
    if (!Number.isFinite(trough[b])) continue;
    const x = (b + 0.5) * DZ;
    const wt = tot[b];
    sw += wt;
    sx += wt * x;
    sy += wt * trough[b];
    sxx += wt * x * x;
    sxy += wt * x * trough[b];
  }
  const slope = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
  const icpt = (sy - slope * sx) / sw;
  const cut = new Float64Array(nb);
  for (let b = 0; b < nb; b++) cut[b] = Number.isFinite(trough[b]) ? trough[b] : icpt + slope * (b + 0.5) * DZ;
  const at = (z) => {
    const x = z / DZ - 0.5;
    if (x <= 0) return cut[0];
    if (x >= nb - 1) return icpt + slope * z;
    const k = Math.floor(x);
    return cut[k] + (x - k) * (cut[k + 1] - cut[k]);
  };
  say(
    `${F.SURVEY_SOURCES[src].name}: g - r cut by z (measured troughs; fitted line ${icpt.toFixed(3)} + ${slope.toFixed(3)} z): ` +
      [...trough].map((t, b) => `${((b + 0.5) * DZ).toFixed(2)}:${Number.isFinite(t) ? t.toFixed(2) : '-'}`).join(' '),
  );
  return at;
}
// The SDSS-I/II galaxies' own troughs are measured only at z < 0.1 (beyond, its luminous red galaxies outnumber the
// blue ones and the histogram has one peak); they agree with BGS's there within 0.04 mag, so BGS's cut, measured to
// z = 0.5 from five million galaxies, parts both.
const cutBgs = colourCut(0);
colourCut(4);
let byColour = [0, 0, 0];
for (let i = 0; i < U.n; i++) {
  if (U.cls[i] !== UNSET) continue;
  const gr = U.gr[i];
  if (!Number.isFinite(gr)) U.cls[i] = other;
  else U.cls[i] = gr >= cutBgs(U.zc[i]) ? red : blue;
  byColour[U.cls[i]]++;
}
say(`BGS and SDSS galaxies by colour: ${byColour[red].toLocaleString('en')} red, ${byColour[blue].toLocaleString('en')} blue, ${byColour[other].toLocaleString('en')} without a colour (grey)`);

// Luminosity: M_r = m_r − DM(z) + 2.5 log10(1 + z) (the bandwidth term of the K-correction only), log10 L/L* = −0.4 (M_r − M*).
const logL = new Float32Array(U.n).fill(NaN);
for (let i = 0; i < U.n; i++) {
  const m = U.mr[i];
  if (!Number.isFinite(m) || !(m > 5 && m < 30)) continue;
  const z = Math.max(1e-4, U.zc[i]);
  const dm = 5 * Math.log10((1 + z) * U.chi[i]) + 25;
  logL[i] = -0.4 * (m - dm + 2.5 * Math.log10(1 + z) - F.MR_STAR);
}
// Where a catalogue has no photometry: the median of the measured luminosities of the same class beyond z = 0.4 (the
// redshifts of the LRG and ELG samples), or of all of that class; quasars (no measured value) as L* galaxies.
const defaults = [0, 0, 0, 0];
for (const cl of [red, blue, other]) {
  const far = [];
  const all = [];
  for (let i = 0; i < U.n; i++) {
    if (U.cls[i] !== cl || !Number.isFinite(logL[i])) continue;
    all.push(logL[i]);
    if (U.zc[i] > 0.4) far.push(logL[i]);
  }
  const pick = far.length >= 1000 ? far : all;
  pick.sort((a, b) => a - b);
  defaults[cl] = pick.length ? pick[pick.length >> 1] : 0;
}
let measured = 0;
for (let i = 0; i < U.n; i++) {
  if (Number.isFinite(logL[i])) measured++;
  else logL[i] = defaults[U.cls[i]];
}
say(
  `luminosities: ${measured.toLocaleString('en')} from photometry; the rest at their class's median log L/L* (red ${defaults[red].toFixed(2)}, blue ${defaults[blue].toFixed(2)}, grey ${defaults[other].toFixed(2)}, quasar ${defaults[quasar].toFixed(2)})`,
);

// ─── 5. Tile ────────────────────────────────────────────────────────────────────────────

const pos = new Float64Array(3 * U.n);
const kind = new Uint8Array(U.n);
const lum = new Uint8Array(U.n);
const dist = new Float64Array(U.n);
{
  const u = new Float64Array(3);
  for (let i = 0; i < U.n; i++) {
    F.raDecToWorld(U.ra[i], U.dec[i], u);
    const d = U.chi[i];
    pos[3 * i] = u[0] * d;
    pos[3 * i + 1] = u[1] * d;
    pos[3 * i + 2] = u[2] * d;
    dist[i] = d;
    kind[i] = F.packKind(U.cls[i], U.src[i]);
    lum[i] = F.lumByte(logL[i]);
  }
}

// Counts by catalogue, class and shell, as shipped.
const shippedPerSource = new Array(F.SURVEY_SOURCE_COUNT).fill(0);
{
  const bySource = shippedPerSource;
  const byClass = [0, 0, 0, 0];
  const edges = [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000];
  const shells = new Array(edges.length).fill(0);
  for (let i = 0; i < U.n; i++) {
    bySource[U.src[i]]++;
    byClass[U.cls[i]]++;
    let s = 0;
    while (s < edges.length - 1 && dist[i] >= edges[s + 1]) s++;
    shells[s]++;
  }
  say(`shipped: ${U.n.toLocaleString('en')} galaxies and quasars`);
  F.SURVEY_SOURCES.forEach((s) => say(`  ${s.name}: ${bySource[s.code].toLocaleString('en')} (${JSON.stringify(counts[s.key])})`));
  say(`  by class: red ${byClass[red].toLocaleString('en')}, blue ${byClass[blue].toLocaleString('en')}, grey ${byClass[other].toLocaleString('en')}, quasar ${byClass[quasar].toLocaleString('en')}`);
  say(`  by comoving distance (Mpc): ${edges.map((e, k) => `${e}${k < edges.length - 1 ? `-${edges[k + 1]}` : '+'}: ${shells[k].toLocaleString('en')}`).join('; ')}`);
}

const nodes = buildOctree({ count: U.n, pos, kind, lum }, SEED);
say(`octree: ${nodes.length} nodes, depth ${Math.max(...nodes.map((n) => n.path.length))} (${secs()})`);

if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith('.bin.gz')) rmSync(`${OUT}/${f}`);
mkdirSync(OUT, { recursive: true });
const sizes = [];
let totalBytes = 0;
for (const node of nodes) {
  const { bytes } = nodeBytes(node, { count: U.n, pos, kind, lum }, dist);
  const gz = gzipSync(bytes, { level: 9 });
  if (gz.length >= 1_000_000) throw new Error(`node ${node.path} is ${gz.length} bytes: over the 1 MB a file may be`);
  writeFileSync(`${OUT}/${F.nodeFile(node.path)}`, gz);
  node.fileBytes = gz.length;
  sizes.push(gz.length);
  totalBytes += gz.length;
}
const hierarchy = gzipSync(F.encodeHierarchy(nodes.map((n) => ({ ...n, points: n.points.length })), U.n, shippedPerSource), { level: 9 });
writeFileSync(`${OUT}/${F.HIERARCHY_FILE}`, hierarchy);
sizes.sort((a, b) => a - b);
say(
  `files: ${nodes.length} nodes, ${(totalBytes / 1e6).toFixed(1)} MB (${((8 * totalBytes) / U.n / 8).toFixed(2)} bytes a galaxy); node files median ${(sizes[sizes.length >> 1] / 1e3).toFixed(0)} kB, largest ${(sizes[sizes.length - 1] / 1e3).toFixed(0)} kB; hierarchy ${(hierarchy.length / 1e3).toFixed(1)} kB (${secs()})`,
);
for (const f of readdirSync(OUT)) if (statSync(`${OUT}/${f}`).size >= 1_000_000) throw new Error(`${f} is over 1 MB`);

writeFileSync(LOG, `# scripts/build-surveys.mjs, ${new Date().toISOString().slice(0, 10)}\n${log.join('\n')}\n`);
