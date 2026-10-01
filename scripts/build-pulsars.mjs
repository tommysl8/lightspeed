// Builds public/data/deepsky/pulsars.json.gz: the pulsars of the ATNF Pulsar Catalogue that have a distance (the format
// in src/sim/deepsky/format.ts; the method in docs/data/deepsky.md).
//
// Source: the ATNF Pulsar Catalogue (Manchester, Hobbs, Teoh & Hobbs 2005, AJ 129, 1993;
// https://www.atnf.csiro.au/research/pulsar/psrcat), the public database psrcat.db of the psrcat package. The package
// is free software under the GNU General Public License, version 3 or later, and asks for the paper and the web address
// to be cited; the derived file is therefore released under the same licence (CREDITS.md).
//
// Each pulsar's distance is the catalogue's own best estimate (DIST, as psrcat works it out: defineParams.c
// defineDistance), in its order of preference:
//   1. DIST_A, an independent distance (its globular cluster's, an association's, HI absorption, a companion's);
//   2. its parallax PX, where it is more than three times its uncertainty;
//   3. between DIST_AMN and DIST_AMX, the DM distance if it falls inside them, else the nearer limit (their middle without one);
//   4. DIST_DM, from its dispersion measure and the YMW16 model of the Galaxy's free electrons (Yao, Manchester & Wang
//      2017, ApJ 835, 29).
// A pulsar whose dispersion measure is more than YMW16 can account for gets 25 kpc from the model, a stand-in rather
// than a distance: those are left out, as are those with no distance at all.
//
// Input: data-raw/deepsky/psrcat_pkg.tar.gz (fetched when missing), its psrcat_tar/psrcat.db.
// Output: public/data/deepsky/pulsars.json.gz; its section of docs/data/deepsky-build-log.txt.
//
// Run: node scripts/build-pulsars.mjs

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { DEG, ensure, galactic, round, sexagesimal, writeColumns } from './deepsky/common.mjs';
import { say, writeLog } from './deepsky/log.mjs';

const RAW = 'data-raw/deepsky';
const PSRCAT = 'https://www.atnf.csiro.au/research/pulsar/psrcat/downloads/psrcat_pkg.tar.gz';
/** YMW16's stand-in for a dispersion measure it cannot account for, kpc (the model's edge). */
const YMW16_LIMIT_KPC = 25;
/** A parallax counts when more than this many times its uncertainty (psrcat's rule). */
const PX_SIGMA = 3;

await ensure(`${RAW}/psrcat_pkg.tar.gz`, PSRCAT);

/** psrcat.db from the package (a ustar archive): read straight from the gzip. */
function psrcatDb() {
  if (existsSync(`${RAW}/psrcat_tar/psrcat.db`)) return readFileSync(`${RAW}/psrcat_tar/psrcat.db`, 'utf8');
  const tar = gunzipSync(readFileSync(`${RAW}/psrcat_pkg.tar.gz`));
  for (let p = 0; p + 512 <= tar.length; ) {
    const name = tar.toString('latin1', p, p + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(tar.toString('latin1', p + 124, p + 136).replace(/\0.*$/, '').trim(), 8) || 0;
    if (name.endsWith('/psrcat.db')) return tar.toString('utf8', p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('psrcat.db not found in the package');
}

const text = psrcatDb();
const version = (text.match(/^#CATALOGUE\s+(\S+)/m) ?? [])[1] ?? '?';

/** A value and its uncertainty: psrcat quotes the uncertainty in units of the value's last digit ("0.6 5" is 0.6 ± 0.5). */
function valueErr(v, e) {
  const value = Number(v);
  if (!e || !/^\d+$/.test(e)) return { value, err: NaN };
  const m = v.match(/^[+-]?\d*(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  const decimals = m?.[1]?.length ?? 0;
  const exp = m?.[2] ? Number(m[2]) : 0;
  return { value, err: Number(e) * 10 ** (exp - decimals) };
}

/** The pulsars, each a map of label to its value, uncertainty (as written) and reference. */
const records = [];
{
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('#')) continue;
    if (raw.startsWith('@')) {
      if (cur) records.push(cur);
      cur = null;
      continue;
    }
    const f = raw.trim().split(/\s+/);
    if (!f[0]) continue;
    cur ??= {};
    if (f[0] === 'TYPE' || f[0] === 'ASSOC' || f[0] === 'BINCOMP') cur[f[0]] = { v: f.slice(1).join(' ') };
    else cur[f[0]] = { v: f[1], e: f.length >= 4 ? f[2] : f.length === 3 && /^\d+$/.test(f[2]) ? f[2] : undefined };
  }
  if (cur) records.push(cur);
}

say(`run on ${new Date().toISOString().slice(0, 10)}: ATNF Pulsar Catalogue ${version}, ${records.length.toLocaleString('en')} pulsars`);

// The J2000 ecliptic, for the pulsars the catalogue places in ecliptic coordinates.
const EPS = ((84_381.448 / 3600) * Math.PI) / 180;
function eclipticToRaDec(lonDeg, latDeg) {
  const l = lonDeg * DEG;
  const b = latDeg * DEG;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(b) * Math.sin(l);
  const z = Math.sin(b);
  const ye = Math.cos(EPS) * y - Math.sin(EPS) * z;
  const ze = Math.sin(EPS) * y + Math.cos(EPS) * z;
  let ra = Math.atan2(ye, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(ze) / DEG };
}

/** Strip psrcat's references in brackets: "GC:NGC_104[fhn+05]" → "GC:NGC_104". */
const unref = (s) => s.replace(/\[[^\]]*\]/g, '');
/** A list of psrcat's ("HE[a],HE[b]", "GRS:x[a],OPT:[b]"): its entries once each, without references or empty values. */
const listOf = (s) => [...new Set(unref(s).split(',').map((x) => x.trim()).filter((x) => x && !/:$/.test(x)))].join(',');

const rows = [];
const counts = new Map();
const count = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);

for (const r of records) {
  const name = r.PSRJ?.v;
  if (!name) continue;
  let ra = sexagesimal(r.RAJ?.v ?? '', true);
  let dec = sexagesimal(r.DECJ?.v ?? '', false);
  if (!Number.isFinite(ra) && r.ELONG && r.ELAT) ({ ra, dec } = eclipticToRaDec(Number(r.ELONG.v), Number(r.ELAT.v)));
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    count('skipped: no position');
    continue;
  }
  // Distance, as psrcat's DIST.
  const px = r.PX ? valueErr(r.PX.v, r.PX.e) : null;
  const distA = r.DIST_A ? Number(r.DIST_A.v) : NaN;
  const amn = r.DIST_AMN ? Number(r.DIST_AMN.v) : NaN;
  const amx = r.DIST_AMX ? Number(r.DIST_AMX.v) : NaN;
  const dmDist = r.DIST_DM ? Number(r.DIST_DM.v) : NaN;
  let d = NaN;
  let lo = NaN;
  let hi = NaN;
  let method = '';
  if (Number.isFinite(distA)) {
    d = distA;
    method = 'independent';
    if (Number.isFinite(amn) && Number.isFinite(amx)) [lo, hi] = [amn, amx];
  } else if (px && Number.isFinite(px.err) && px.value / px.err > PX_SIGMA) {
    d = 1 / px.value;
    lo = 1 / (px.value + px.err);
    hi = 1 / (px.value - px.err);
    method = 'parallax';
  } else if (Number.isFinite(amn) && Number.isFinite(amx)) {
    d = Number.isFinite(dmDist) ? Math.min(amx, Math.max(amn, dmDist)) : (amn + amx) / 2;
    [lo, hi] = [amn, amx];
    method = 'limits';
  } else if (Number.isFinite(dmDist)) {
    if (dmDist >= YMW16_LIMIT_KPC - 1e-6) {
      count('skipped: dispersion measure beyond what YMW16 can account for (25 kpc stand-in)');
      continue;
    }
    d = dmDist;
    method = 'dm';
  } else {
    count('skipped: no distance');
    continue;
  }
  count(`placed: ${method === 'dm' ? 'dispersion measure (YMW16)' : method === 'parallax' ? 'parallax' : method === 'limits' ? 'between published limits' : 'independent distance (DIST_A)'}`);
  // Spin: P0 or 1/F0, and its rate of change.
  const p0 = r.P0 ? Number(r.P0.v) : r.F0 ? 1 / Number(r.F0.v) : NaN;
  const p1 = r.P1 ? Number(r.P1.v) : r.F1 && r.F0 ? -Number(r.F1.v) / Number(r.F0.v) ** 2 : NaN;
  const type = r.TYPE ? listOf(r.TYPE.v) : '';
  const assoc = r.ASSOC ? listOf(r.ASSOC.v) : '';
  const pb = r.PB ? Number(r.PB.v) : NaN;
  const g = galactic(ra, dec);
  const pc = d * 1000;
  rows.push([
    name,
    r.PSRB?.v ?? null,
    round(ra, 5),
    round(dec, 5),
    round(pc, 1),
    Number.isFinite(lo) ? round(lo * 1000, 1) : null,
    Number.isFinite(hi) ? round(hi * 1000, 1) : null,
    method,
    Number.isFinite(p0) ? Number(p0.toPrecision(10)) : null,
    Number.isFinite(p1) ? Number(p1.toPrecision(4)) : null,
    r.DM ? Number(r.DM.v) : null,
    Number.isFinite(pb) ? Number(pb.toPrecision(6)) : null,
    r.BINCOMP ? unref(r.BINCOMP.v) : null,
    type || null,
    assoc || null,
    round(pc * g.u[0], 2),
    round(pc * g.u[1], 2),
    round(pc * g.u[2], 2),
  ]);
}

say('Placed and skipped:');
for (const [k, n] of [...counts].sort()) say(`  ${k}: ${n.toLocaleString('en')}`);
const COLUMNS = ['name', 'bname', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'method', 'p0', 'p1', 'dm', 'pbDays', 'companion', 'type', 'assoc', 'xPc', 'yPc', 'zPc'];
const out = writeColumns(
  'public/data/deepsky/pulsars.json.gz',
  {
    schema: 'lightspeed.pulsars/1',
    credit: 'ATNF Pulsar Catalogue (Manchester et al. 2005, AJ 129, 1993; https://www.atnf.csiro.au/research/pulsar/psrcat)',
    licence: 'GPL-3.0-or-later, as the psrcat package',
    version,
    built: new Date().toISOString().slice(0, 10),
    frames: 'heliocentric galactic pc (x → l = 0, y → l = 90°, z → north galactic pole); periods in s',
  },
  COLUMNS,
  rows,
);
say(`wrote public/data/deepsky/pulsars.json.gz: ${rows.length.toLocaleString('en')} pulsars, ${(out.gz / 1024).toFixed(0)} kB (${(out.raw / 1024).toFixed(0)} kB inflated)`);
writeLog('build-pulsars.mjs');
