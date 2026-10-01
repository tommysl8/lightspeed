// Builds public/data/survey-quaia/: the Quaia quasars that the galaxy surveys do not already have, as a nested octree
// of gzip files in the surveys' own format (src/sim/surveys/format.ts), with each quasar's distance error (quaia.ts).
// The method is in docs/data/surveys.md §10.
//
// Source (credit and licence in CREDITS.md and docs/data/surveys.md)
//   Quaia, the Gaia-unWISE quasar catalogue: Storey-Fisher et al. 2024, ApJ 964, 69 (doi:10.3847/1538-4357/ad1328);
//   data doi:10.5281/zenodo.10403370, version 1.0.0, quaia_G20.5.fits (1,295,502 quasars with
//   Gaia G < 20.5). CC BY 4.0.
//
// What is done to it (the changes CC BY asks to be indicated):
//   1. matched on the sky, within 1.5" (src/sim/surveys/match.ts), against every object the galaxy surveys' build
//      reads (scripts/build-surveys.mjs, with its cuts): a quasar DESI or the SDSS took a spectrum of is left out, its
//      spectroscopic redshift wins (it is in public/data/survey/, or, for DR16Q quasars beyond z = 3.5, knowingly
//      left out of both);
//   2. placed: each redshift taken to the CMB frame and turned into a comoving distance with the app's own cosmology
//      (src/physics/cosmology, Planck 2018), along the quasar's direction, as the survey's; its redshift error turned
//      into a comoving distance error (quaia.ts sigmaChiMpc), kept in one byte;
//   3. described: the survey's quasar class, its luminosity the survey quasars' (that of an L* galaxy: none of them
//      has a measured one), Quaia's catalogue code;
//   4. rounded: directions kept to 5", distances to 0.125 Mpc; tiled into an octree with glows, each quasar's light in
//      them faded as the app fades it (quaia.ts quaiaFade).
//
// Inputs:
//   data-raw/quaia/quaia_G20.5.fits (171 MB) and the Zenodo record's metadata (its licence and checksums), fetched
//   only when missing;
//   data-raw/surveys/: the galaxy surveys' inputs (scripts/build-surveys.mjs fetches them; this build reads only their
//   positions, redshifts and cuts).
//
// Output: public/data/survey-quaia/hierarchy.bin.gz and r<octants>.bin.gz, one per node (every file under 1 MB);
// docs/data/quaia-build-log.txt. The survey's own tiles (public/data/survey/) are not touched.
//
// Run: npm run data:quaia (node --max-old-space-size=6000 scripts/build-quaia.mjs; about a minute and 2 GB of memory)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFitsTable } from './surveys/fits.mjs';
import { Cosmology, PLANCK18 } from '../src/physics/cosmology/cosmology.ts';
import * as F from '../src/sim/surveys/format.ts';
import { SURVEY_MATCH_ARCSEC } from '../src/sim/surveys/match.ts';
import { matchQuaia, QUAIA_EXTRA_PER, QUAIA_SOURCE, quaiaFade, sigmaByte, sigmaChiMpc, sigmaOfByte } from '../src/sim/surveys/quaia.ts';
import { buildOctree, nodeBytes } from '../src/sim/surveys/tile.ts';

const RAW = 'data-raw/quaia';
const SURVEY_RAW = 'data-raw/surveys';
const OUT = 'public/data/survey-quaia';
const LOG = 'docs/data/quaia-build-log.txt';
/** The galaxy surveys' deepest redshift (scripts/build-surveys.mjs Z_MAX): their inputs are read with its cuts. */
const SURVEY_Z_MAX = 3.5;
const SEED = 20261001;

const ZENODO_RECORD = 'https://zenodo.org/api/records/10403370';
const FILE = 'quaia_G20.5.fits';

const log = [];
const say = (s) => {
  console.log(s);
  log.push(s);
};
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
const fmt = (n) => n.toLocaleString('en');

async function ensure(path, url) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  // Zenodo turns away requests that do not say who is asking.
  const res = await fetch(url, { headers: { 'User-Agent': 'skyfold-data-build (https://github.com/tommysl8/skyfold)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

// ─── 0. Inputs and licence ──────────────────────────────────────────────────────────────

await ensure(`${RAW}/zenodo_10403370.json`, ZENODO_RECORD);
const record = JSON.parse(readFileSync(`${RAW}/zenodo_10403370.json`, 'utf8'));
if (record.metadata?.license?.id !== 'cc-by-4.0') throw new Error(`Quaia's Zenodo record no longer says CC BY 4.0 (${JSON.stringify(record.metadata?.license)}): check before shipping`);
const entry = record.files.find((f) => f.key === FILE);
await ensure(`${RAW}/${FILE}`, `${ZENODO_RECORD}/files/${FILE}/content`);
{
  const md5 = createHash('md5').update(readFileSync(`${RAW}/${FILE}`)).digest('hex');
  if (`md5:${md5}` !== entry.checksum) throw new Error(`${FILE}: md5 ${md5}, the record says ${entry.checksum}`);
  say(`Quaia ${record.metadata.version} (doi:${record.doi}, ${record.metadata.license.id}): ${FILE}, md5 ${md5}`);
}
for (const f of ['desi/QSO_NGC_clustering.dat.fits', 'sdss/dr16q_vizier.csv', 'sdss/legacy_dr17_ra0-150.csv']) {
  if (!existsSync(`${SURVEY_RAW}/${f}`)) throw new Error(`${SURVEY_RAW}/${f} is missing: run npm run data:surveys first (it fetches the surveys' inputs)`);
}

// ─── 1. Read Quaia ──────────────────────────────────────────────────────────────────────

const Q = { n: 0, ra: null, dec: null, z: null, e: null, b: null };
{
  const ra = [];
  const dec = [];
  const z = [];
  const e = [];
  const b = [];
  const rows = await readFitsTable(`${RAW}/${FILE}`, { ra: 'ra', dec: 'dec', z: 'redshift_quaia', e: 'redshift_quaia_err', b: 'b' }, (v, n) => {
    for (let i = 0; i < n; i++) {
      ra.push(v.ra[i]);
      dec.push(v.dec[i]);
      z.push(v.z[i]);
      e.push(v.e[i]);
      b.push(v.b[i]);
    }
  });
  Object.assign(Q, { n: rows, ra: Float64Array.from(ra), dec: Float64Array.from(dec), z: Float64Array.from(z), e: Float64Array.from(e), b: Float64Array.from(b) });
  let bad = 0;
  for (let i = 0; i < rows; i++) if (!(Q.z[i] > 0 && Q.e[i] > 0)) bad++;
  if (bad) throw new Error(`${bad} Quaia rows without a positive redshift and error`);
  say(`Quaia: ${fmt(rows)} quasars read (${secs()})`);
}

// ─── 2. The surveys' objects ────────────────────────────────────────────────────────────

/** Positions of one survey catalogue as the survey's build reads it (its cuts), growable. */
function positions(name, quasar) {
  return { name, quasar, n: 0, ra: new Float64Array(1 << 16), dec: new Float64Array(1 << 16) };
}
function add(set, ra, dec) {
  if (set.n === set.ra.length) {
    const grow = (a) => {
      const b = new Float64Array(a.length * 2);
      b.set(a);
      return b;
    };
    set.ra = grow(set.ra);
    set.dec = grow(set.dec);
  }
  set.ra[set.n] = ra;
  set.dec[set.n++] = dec;
}
const inZ = (z) => z > 0 && z <= SURVEY_Z_MAX;

// Quasars first, so a quasar a survey has under both kinds is counted as one of its quasars.
const sets = [];
{
  const s = positions('DESI DR1 quasars', true);
  for (const cap of ['NGC', 'SGC'])
    await readFitsTable(`${SURVEY_RAW}/desi/QSO_${cap}_clustering.dat.fits`, { ra: 'RA', dec: 'DEC', z: 'Z' }, (v, n) => {
      for (let i = 0; i < n; i++) if (inZ(v.z[i])) add(s, v.ra[i], v.dec[i]);
    });
  sets.push(s);
}
{
  const s = positions('SDSS-IV eBOSS DR16 quasars', true);
  for (const cap of ['NGC', 'SGC'])
    await readFitsTable(`${SURVEY_RAW}/sdss/eBOSS_QSO_clustering_data-${cap}-vDR16.fits`, { ra: 'RA', dec: 'DEC', z: 'Z' }, (v, n) => {
      for (let i = 0; i < n; i++) if (inZ(v.z[i])) add(s, v.ra[i], v.dec[i]);
    });
  sets.push(s);
}
{
  // DR16Q: IS_QSO_FINAL = 1 and z > 0, as the survey reads it; those beyond its z = 3.5 in a set of their own (the
  // survey leaves them out, and with a spectroscopic redshift known, Quaia's estimate is not drawn for them either).
  const near = positions('SDSS DR16 quasar catalogue', true);
  const far = positions(`SDSS DR16 quasar catalogue, beyond z = ${SURVEY_Z_MAX}`, true);
  const lines = readFileSync(`${SURVEY_RAW}/sdss/dr16q_vizier.csv`, 'utf8').split(/\r?\n/);
  const col = Object.fromEntries(lines[0].split(',').map((h, i) => [h, i]));
  for (let l = 1; l < lines.length; l++) {
    if (!lines[l]) continue;
    const f = lines[l].split(',');
    if (Number(f[col.QSO]) !== 1) continue;
    const z = f[col.z] === '' ? NaN : Number(f[col.z]);
    if (!(z > 0)) continue;
    add(z <= SURVEY_Z_MAX ? near : far, Number(f[col.RAJ2000]), Number(f[col.DEJ2000]));
  }
  sets.push(near, far);
}
for (const [name, t] of [
  ['DESI DR1 Bright Galaxy Survey', 'BGS_ANY'],
  ['DESI DR1 luminous red galaxies', 'LRG'],
  ['DESI DR1 emission-line galaxies', 'ELG_LOPnotqso'],
]) {
  const s = positions(name, false);
  for (const cap of ['NGC', 'SGC'])
    await readFitsTable(`${SURVEY_RAW}/desi/${t}_${cap}_clustering.dat.fits`, { ra: 'RA', dec: 'DEC', z: 'Z' }, (v, n) => {
      for (let i = 0; i < n; i++) if (inZ(v.z[i])) add(s, v.ra[i], v.dec[i]);
    });
  sets.push(s);
}
{
  const s = positions('SDSS galaxies (SDSS-I/II, DR17)', false);
  for (const slice of ['0-150', '150-200', '200-360']) {
    const lines = readFileSync(`${SURVEY_RAW}/sdss/legacy_dr17_ra${slice}.csv`, 'utf8').split(/\r?\n/);
    const col = Object.fromEntries(lines[1].split(',').map((h, i) => [h, i]));
    for (let l = 2; l < lines.length; l++) {
      if (!lines[l]) continue;
      const f = lines[l].split(',');
      const z = Number(f[col.z]);
      if (z > 0.002 && z <= SURVEY_Z_MAX) add(s, Number(f[col.ra]), Number(f[col.dec]));
    }
  }
  sets.push(s);
}
{
  const s = positions('SDSS-III BOSS DR12 galaxies', false);
  for (const cap of ['North', 'South'])
    await readFitsTable(`${SURVEY_RAW}/sdss/galaxy_DR12v5_CMASSLOWZTOT_${cap}.fits.gz`, { ra: 'RA', dec: 'DEC', z: 'Z', imatch: 'IMATCH' }, (v, n) => {
      for (let i = 0; i < n; i++) if (v.imatch[i] === 1 && inZ(v.z[i])) add(s, v.ra[i], v.dec[i]);
    });
  sets.push(s);
}
for (const [name, t] of [
  ['SDSS-IV eBOSS DR16 luminous red galaxies', 'LRG'],
  ['SDSS-IV eBOSS DR16 emission-line galaxies', 'ELG'],
]) {
  const s = positions(name, false);
  for (const cap of ['NGC', 'SGC'])
    await readFitsTable(`${SURVEY_RAW}/sdss/eBOSS_${t}_clustering_data-${cap}-vDR16.fits`, { ra: 'RA', dec: 'DEC', z: 'Z' }, (v, n) => {
      for (let i = 0; i < n; i++) if (inZ(v.z[i])) add(s, v.ra[i], v.dec[i]);
    });
  sets.push(s);
}
say(`the surveys' objects, as their build reads them: ${sets.map((s) => `${s.name} ${fmt(s.n)}`).join('; ')} (${secs()})`);

// ─── 3. Match ───────────────────────────────────────────────────────────────────────────

const quaiaSky = { ra: Q.ra, dec: Q.dec, count: Q.n };
const found = matchQuaia(quaiaSky, sets.map((s) => ({ ra: s.ra, dec: s.dec, count: s.n })), SURVEY_MATCH_ARCSEC);
const perSet = new Array(sets.length).fill(0);
for (let i = 0; i < Q.n; i++) if (found[i] >= 0) perSet[found[i]]++;
const matched = perSet.reduce((a, b) => a + b, 0);
say(`matched within ${SURVEY_MATCH_ARCSEC}" (each to the first catalogue that has it): ${sets.map((s, k) => `${s.name} ${fmt(perSet[k])}`).join('; ')}; ${fmt(matched)} in all (${secs()})`);
// How many of those an unrelated neighbour would give: the same match with every quasar moved 30" north.
{
  const shifted = { ra: Q.ra, dec: Q.dec.map((d) => Math.min(90, d + 30 / 3600)), count: Q.n };
  const chance = matchQuaia(shifted, sets.map((s) => ({ ra: s.ra, dec: s.dec, count: s.n })), SURVEY_MATCH_ARCSEC);
  let c = 0;
  for (let i = 0; i < Q.n; i++) if (chance[i] >= 0) c++;
  say(`chance matches (every quasar moved 30" north and matched again): ${fmt(c)}, ${((100 * c) / Q.n).toFixed(2)} % of Quaia (${secs()})`);
}
for (const s of sets) s.ra = s.dec = null;

// ─── 4. Place ───────────────────────────────────────────────────────────────────────────

const cosmo = new Cosmology(PLANCK18);
const Z_STEP = 1e-4;
const Z_TABLE = 9;
const chiTable = new Float64Array(Math.ceil(Z_TABLE / Z_STEP) + 2);
for (let k = 0; k < chiTable.length; k++) chiTable[k] = cosmo.comovingDistanceMpc(k * Z_STEP);
const chiOf = (z) => {
  if (z >= Z_TABLE) return cosmo.comovingDistanceMpc(z);
  const x = Math.max(0, z) / Z_STEP;
  const k = Math.min(chiTable.length - 2, Math.floor(x));
  return chiTable[k] + (x - k) * (chiTable[k + 1] - chiTable[k]);
};
for (const z of [0.01, 0.5, 1.5, 3, 4.6, 7]) {
  const d = Math.abs(chiOf(z) - cosmo.comovingDistanceMpc(z));
  if (d > 1e-3) throw new Error(`distance table off by ${d} Mpc at z = ${z}`);
}

const keep = [];
for (let i = 0; i < Q.n; i++) if (found[i] < 0) keep.push(i);
const n = keep.length;
const pos = new Float64Array(3 * n);
const dist = new Float64Array(n);
const kind = new Uint8Array(n).fill(F.packKind(F.SURVEY_CLASS.quasar, QUAIA_SOURCE.code));
// As the survey's quasars: the luminosity of an L* galaxy (none of them has a measured one).
const lum = new Uint8Array(n).fill(F.lumByte(0));
const extra = new Uint8Array(n * QUAIA_EXTRA_PER);
const weight = new Float32Array(n);
const sig = new Float64Array(n);
const zs = new Float64Array(n);
{
  const u = new Float64Array(3);
  for (let j = 0; j < n; j++) {
    const i = keep[j];
    const zc = F.zHelioToCmb(Q.z[i], Q.ra[i], Q.dec[i]);
    const d = chiOf(zc);
    F.raDecToWorld(Q.ra[i], Q.dec[i], u);
    pos[3 * j] = u[0] * d;
    pos[3 * j + 1] = u[1] * d;
    pos[3 * j + 2] = u[2] * d;
    dist[j] = d;
    zs[j] = zc;
    const s = sigmaChiMpc(zc, Q.e[i], chiOf);
    sig[j] = s;
    extra[j] = sigmaByte(s);
    // The glows hold the light the app draws: faded by the error as stored.
    weight[j] = quaiaFade(sigmaOfByte(extra[j]));
  }
}

// ─── 5. What is kept ────────────────────────────────────────────────────────────────────

{
  const q = (a, ps) => {
    const s = Float64Array.from(a).sort();
    return ps.map((p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]);
  };
  let south = 0;
  let southAll = 0;
  for (let i = 0; i < Q.n; i++) if (Q.dec[i] < -20) southAll++;
  for (const i of keep) if (Q.dec[i] < -20) south++;
  let lowB = 0;
  for (const i of keep) if (Math.abs(Q.b[i]) < 20) lowB++;
  say(`kept: ${fmt(n)} quasars (${fmt(Q.n - n)} left to the surveys); ${fmt(south)} south of declination -20 (of Quaia's ${fmt(southAll)}), ${fmt(lowB)} within 20 degrees of the Galactic plane`);
  const zq = q(zs, [0, 0.05, 0.5, 0.95, 1]);
  const dq = q(dist, [0, 0.05, 0.5, 0.95, 1]);
  say(`  redshift (CMB frame) min ${zq[0].toFixed(3)}, 5 % ${zq[1].toFixed(2)}, median ${zq[2].toFixed(2)}, 95 % ${zq[3].toFixed(2)}, max ${zq[4].toFixed(2)}; comoving distance ${dq.map((d) => d.toFixed(0)).join(' / ')} Mpc`);
  const sq = q(sig, [0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]);
  say(`  distance error (1 sigma, comoving Mpc) 5 % ${sq[0].toFixed(0)}, 25 % ${sq[1].toFixed(0)}, median ${sq[2].toFixed(0)}, 75 % ${sq[3].toFixed(0)}, 90 % ${sq[4].toFixed(0)}, 95 % ${sq[5].toFixed(0)}, 99 % ${sq[6].toFixed(0)}`);
  let faded = 0;
  let floor = 0;
  let worst = 0;
  for (let j = 0; j < n; j++) {
    if (weight[j] < 1) faded++;
    if (weight[j] <= 0.151) floor++;
    worst = Math.max(worst, Math.abs(sigmaOfByte(extra[j]) / sig[j] - 1));
  }
  say(`  drawn fainter for their error: ${fmt(faded)} (${fmt(floor)} at the floor); the error kept in a byte to ${(100 * worst).toFixed(1)} % at worst`);
}

// ─── 6. Tile ────────────────────────────────────────────────────────────────────────────

const input = { count: n, pos, kind, lum, extra: { per: QUAIA_EXTRA_PER, bytes: extra }, weight };
const nodes = buildOctree(input, SEED);
say(`octree: ${nodes.length} nodes, depth ${Math.max(...nodes.map((x) => x.path.length))} (${secs()})`);

if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (f.endsWith('.bin.gz')) rmSync(`${OUT}/${f}`);
mkdirSync(OUT, { recursive: true });
const sizes = [];
let totalBytes = 0;
for (const node of nodes) {
  const { bytes } = nodeBytes(node, input, dist);
  const gz = gzipSync(bytes, { level: 9 });
  if (gz.length >= 1_000_000) throw new Error(`node ${node.path} is ${gz.length} bytes: over the 1 MB a file may be`);
  writeFileSync(`${OUT}/${F.nodeFile(node.path)}`, gz);
  node.fileBytes = gz.length;
  sizes.push(gz.length);
  totalBytes += gz.length;
}
const perSource = new Array(QUAIA_SOURCE.code + 1).fill(0);
perSource[QUAIA_SOURCE.code] = n;
const hierarchy = gzipSync(F.encodeHierarchy(nodes.map((x) => ({ ...x, points: x.points.length })), n, perSource), { level: 9 });
writeFileSync(`${OUT}/${F.HIERARCHY_FILE}`, hierarchy);
sizes.sort((a, b) => a - b);
say(
  `files: ${nodes.length} nodes, ${(totalBytes / 1e6).toFixed(2)} MB (${(totalBytes / n).toFixed(2)} bytes a quasar); node files median ${(sizes[sizes.length >> 1] / 1e3).toFixed(0)} kB, largest ${(sizes[sizes.length - 1] / 1e3).toFixed(0)} kB; hierarchy ${(hierarchy.length / 1e3).toFixed(1)} kB (${secs()})`,
);
for (const f of readdirSync(OUT)) if (statSync(`${OUT}/${f}`).size >= 1_000_000) throw new Error(`${f} is over 1 MB`);

writeFileSync(LOG, `# scripts/build-quaia.mjs, ${new Date().toISOString().slice(0, 10)}\n${log.join('\n')}\n`);
