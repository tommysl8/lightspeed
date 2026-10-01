// Builds public/data/deepsky/ngc-galaxies.json.gz and ngc-galactic.json.gz: the objects of the NGC and IC catalogues
// (OpenNGC) that have a measured distance, the galaxies in one file and the clusters and nebulae of the Milky Way and
// the Magellanic Clouds in the other (the formats in src/sim/deepsky/format.ts; the method in docs/data/deepsky.md).
//
// A 3D map needs distances, and OpenNGC gives none. So an object is placed only where an openly licensed catalogue
// measured how far it is; the rest are counted in the log and left out. Nothing is placed at a guessed distance.
//
// Sources (licences in CREDITS.md)
//   OpenNGC (Mattia Verga, github.com/mattiaverga/OpenNGC, database_files/NGC.csv): names, types, positions, sizes,
//   magnitudes, Messier numbers, cross-identifications and common names. CC BY-SA 4.0.
//   Galaxies: Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94; VizieR J/ApJ/944/94), matched by PGC number, placed as the
//   app's cosmic web places the same galaxy (src/sim/cosmos/cosmicWeb.ts, 'recommended'); CC BY 4.0. Else the galaxy
//   surveys already built (public/data/survey/: DESI DR1, CC BY 4.0; SDSS DR17, public domain), matched on the sky
//   within MATCH_SURVEY_ARCSEC where the redshifts agree, placed where the survey layer draws the galaxy.
//   Open clusters and clusters with nebulae: Hunt & Reffert 2024 (A&A 686, A42; the Hunt & Reffert 2023 Gaia DR3
//   catalogue), matched by name; CC BY 4.0.
//   Globular clusters: the app's own clusters.json.gz (Baumgardt & Vasiliev 2021 distances, CC BY 4.0; Harris 2010 for
//   five), matched by name.
//   Planetary nebulae: the Gaia EDR3 parallax SIMBAD gives for the nebula's central star (SIMBAD TAP, CDS), kept only
//   when it is measured to 1/5 or better; ESA/Gaia/DPAC, CC BY-NC 3.0 IGO.
//   Clusters and nebulae in the Magellanic Clouds: the Cloud's own distance, as the app has it (src/sim/cosmos/named.json:
//   Pietrzyński et al. 2019 for the LMC, Graczyk et al. 2020 for the SMC), on the LMC's tilted disc (van der Marel &
//   Kallivayalil 2014), at the SMC's distance.
//
// Objects the app already has (src/sim/cosmos/named.json, public/data/local-galaxies.json.gz, src/sim/galaxy/nebulae.json
// and the famous clusters of public/data/clusters.json.gz) keep their records: they are not written again, and their
// NGC/IC/Messier designations go to the `existing` list, so "Where to?" finds the app's own body by them.
//
// Inputs (data-raw/deepsky/ and data-raw/galaxy/, data-raw/cosmos/; fetched only when missing), and the app's files above.
// Output: public/data/deepsky/ngc-galaxies.json.gz, ngc-galactic.json.gz; docs/data/deepsky-build-log.txt (appended).
//
// Run: node scripts/build-ngc.mjs

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { designationKey, ensure, galactic, ngcDesignation, raDecOfWorld, round, separationArcsec, sexagesimal, worldOfRaDec, writeColumns } from './deepsky/common.mjs';
import { say, writeLog } from './deepsky/log.mjs';
import { Cosmology, PLANCK18 } from '../src/physics/cosmology/cosmology.ts';
import { LOCAL_GROUP, localGroupBarycentre } from '../src/physics/cosmology/policy.ts';
import * as SF from '../src/sim/surveys/format.ts';

const RAW = 'data-raw/deepsky';
const OUT = 'public/data/deepsky';
const OPENNGC = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv';
const CF4 = 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94';
const HR24 = 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/686/A42/clusters.dat.gz';
const SIMBAD_TAP = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
const SIMBAD_PN = `SELECT b.main_id, b.ra, b.dec, b.plx_value, b.plx_err, b.plx_bibcode, b.otype, i.ids FROM basic AS b JOIN ids AS i ON i.oidref = b.oid WHERE b.otype = 'PN' AND b.plx_value IS NOT NULL`;

/** A survey galaxy within this of an NGC galaxy's catalogue position is the same galaxy (the tiles keep directions to 5"). */
const MATCH_SURVEY_ARCSEC = 6;
/** …if their redshifts agree to this (km/s), when OpenNGC gives one. */
const MATCH_SURVEY_KM_S = 500;
/** A parallax is used only when measured to this fraction or better (1/5: the distance is then good to about 20 %). */
const PLX_MIN_SNR = 5;
/** The Gaia EDR3 parallax zero point (Lindegren et al. 2021, A&A 649, A4): parallaxes read 0.017 mas too small on average. */
const PLX_ZERO_POINT_MAS = -0.017;
/** Hunt & Reffert's astrometric signal-to-noise below which a cluster is not trusted (their recommended cut). */
const HR_MIN_CST = 5;
/** A cluster or nebula within this of a Magellanic Cloud's centre (deg) is taken to be in it, unless found in the Milky Way. */
const CLOUD_RADIUS_DEG = { lmc: 8, smc: 3.5 };
/** Peculiar motions blur a redshift distance by about this much (km/s, typical of galaxies in groups and the field). */
const PECULIAR_KM_S = 300;
const C_KM_S = 299_792.458;

await ensure(`${RAW}/NGC.csv`, OPENNGC);
await ensure('data-raw/cosmos/J_ApJ_944_94/table2.dat.gz', `${CF4}/table2.dat.gz`);
await ensure('data-raw/cosmos/J_ApJ_944_94/table4.dat.gz', `${CF4}/table4.dat.gz`);
await ensure('data-raw/galaxy/HR24_clusters.dat.gz', HR24);
await ensure(`${RAW}/simbad_pn_plx.csv`, `${SIMBAD_TAP}?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=${encodeURIComponent(SIMBAD_PN)}`);

say(`run on ${new Date().toISOString().slice(0, 10)}`);

// ─── 1. OpenNGC ─────────────────────────────────────────────────────────────────────────

const GALAXY_TYPES = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
const CLUSTER_TYPES = new Set(['OCl', 'GCl', 'Cl+N']);
const NEBULA_TYPES = new Set(['PN', 'HII', 'Neb', 'EmN', 'RfN', 'SNR', 'DrkN']);

/** Each row of OpenNGC as an object; Dup rows are folded into their master's designations. */
function readOpenNgc() {
  const lines = readFileSync(`${RAW}/NGC.csv`, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(';');
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  const rows = lines.slice(1).map((l) => l.split(';'));
  const num = (r, k) => (r[c[k]] === '' || r[c[k]] === undefined ? NaN : Number(r[c[k]]));
  const objects = new Map();
  const dups = [];
  for (const r of rows) {
    const name = r[c.Name];
    const type = r[c.Type];
    if (type === 'Dup') {
      dups.push(r);
      continue;
    }
    const designation = ngcDesignation(name);
    const aliases = [];
    const m = r[c.M];
    if (m) aliases.push(`M${Number(m)}`, `M ${Number(m)}`, `Messier ${Number(m)}`);
    for (const k of ['NGC', 'IC']) for (const x of r[c[k]].split(',').filter(Boolean)) aliases.push(`${k} ${x.replace(/^0+/, '')}`);
    const common = r[c['Common names']].split(',').map((s) => s.trim()).filter(Boolean);
    const ids = r[c.Identifiers].split(',').map((s) => s.trim());
    const pgc = ids.map((s) => s.match(/^PGC 0*(\d+)$/)).find(Boolean);
    objects.set(designation, {
      designation,
      type,
      ra: sexagesimal(r[c.RA], true),
      dec: sexagesimal(r[c.Dec], false),
      majArcmin: num(r, 'MajAx'),
      minArcmin: num(r, 'MinAx'),
      pa: num(r, 'PosAng'),
      bmag: num(r, 'B-Mag'),
      vmag: num(r, 'V-Mag'),
      hubble: r[c.Hubble],
      z: num(r, 'Redshift'),
      messier: m ? Number(m) : null,
      common,
      aliases,
      pgc: pgc ? Number(pgc[1]) : null,
    });
  }
  // A duplicate entry ("NGC 650" for NGC 651) names its master in the NGC or IC column: its designation becomes an alias.
  let folded = 0;
  for (const r of dups) {
    const target = r[c.NGC] ? `NGC ${r[c.NGC].split(',')[0].replace(/^0+/, '')}` : r[c.IC] ? `IC ${r[c.IC].split(',')[0].replace(/^0+/, '')}` : null;
    const o = target ? objects.get(target) : undefined;
    if (!o) continue;
    o.aliases.push(ngcDesignation(r[c.Name]));
    const m = r[c.M];
    if (m && !o.messier) {
      o.messier = Number(m);
      o.aliases.push(`M${Number(m)}`, `M ${Number(m)}`, `Messier ${Number(m)}`);
    }
    folded++;
  }
  for (const o of objects.values()) o.aliases = [...new Set(o.aliases)].filter((a) => a !== o.designation);
  return { objects: [...objects.values()], rows: rows.length, dups: dups.length, folded };
}

const ngc = readOpenNgc();
say(`OpenNGC: ${ngc.rows.toLocaleString('en')} rows, ${ngc.objects.length.toLocaleString('en')} objects once ${ngc.dups} duplicate entries are folded into their masters (${ngc.folded} found)`);
{
  const byType = new Map();
  for (const o of ngc.objects) byType.set(o.type, (byType.get(o.type) ?? 0) + 1);
  say(`  by type: ${[...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ')}`);
}

// ─── 2. What the app already has ───────────────────────────────────────────────────────

/**
 * The app's own deep-sky bodies: each with the names it is found by (its name and aliases) and where it is, so an NGC
 * object that is one of them keeps the app's record. `key` is the name the app's search finds the body by.
 */
function existingBodies() {
  const out = [];
  const named = JSON.parse(readFileSync('src/sim/cosmos/named.json', 'utf8'));
  for (const o of named.objects) out.push({ key: o.name, names: [o.name, ...o.aliases], ra: o.ra, dec: o.dec, kind: 'galaxy' });
  const local = JSON.parse(gunzipSync(readFileSync('public/data/local-galaxies.json.gz')).toString('utf8'));
  for (const g of local.galaxies) {
    if (named.objects.some((o) => o.id === g.id)) continue;
    out.push({ key: g.name, names: [g.name, g.catalogueName?.replace(/^LVDB /, ''), ...(g.otherNames ?? [])].filter(Boolean), ra: g.ra, dec: g.dec, kind: 'galaxy' });
  }
  const neb = JSON.parse(readFileSync('src/sim/galaxy/nebulae.json', 'utf8'));
  for (const n of neb.objects) out.push({ key: n.name, names: [n.name, ...(n.otherNames ?? [])], ra: n.position.raDeg, dec: n.position.decDeg, kind: 'nebula' });
  const cl = JSON.parse(gunzipSync(readFileSync('public/data/clusters.json.gz')).toString('utf8'));
  // The clusters that are bodies (src/sim/galaxy/clusters.ts isFamousCluster): every open cluster with a common name,
  // and the globulars with a Messier number or a proper name.
  const NAMED_GLOBULARS = new Set(['Omega Centauri', '47 Tucanae', 'Intergalactic Wanderer']);
  const display = (name, common) => (common ? common.split(/\s*\(|,\s*/)[0].trim() || name : name);
  const parts = (common) => (common ?? '').split(/\s*[(),]\s*/).map((p) => p.replace(/^the\s+/i, '').trim()).filter(Boolean);
  const o = cl.openClusters;
  const oc = (k) => o.columns.indexOf(k);
  for (const r of o.rows) {
    const common = r[oc('commonName')];
    if (!common) continue;
    out.push({ key: display(r[oc('name')], common), names: [r[oc('name')], ...parts(common)], ra: r[oc('raDeg')], dec: r[oc('decDeg')], kind: 'cluster' });
  }
  const g = cl.globularClusters;
  const gc = (k) => g.columns.indexOf(k);
  for (const r of g.rows) {
    const common = r[gc('commonName')];
    if (!common || !(NAMED_GLOBULARS.has(common) || /^M\s?\d+\b/.test(common))) continue;
    out.push({ key: display(r[gc('name')], common), names: [r[gc('name')], ...parts(common)], ra: r[gc('raDeg')], dec: r[gc('decDeg')], kind: 'cluster' });
  }
  return { bodies: out, clusters: cl };
}

const { bodies: existing, clusters: clustersFile } = existingBodies();
const existingByKey = new Map();
for (const e of existing) for (const n of e.names) existingByKey.set(designationKey(n), e);
// "M 31" and "M31", "Messier 31".
for (const e of existing)
  for (const n of e.names) {
    const m = n.match(/^(?:M|Messier)\s?(\d+)$/i);
    if (m) for (const v of [`M${m[1]}`, `M ${m[1]}`, `Messier ${m[1]}`]) existingByKey.set(designationKey(v), e);
  }

/** The app's body an NGC object already is: by any of its designations, or (a galaxy) by its place, within an arcminute. */
function existingOf(o) {
  for (const n of [o.designation, ...o.aliases, ...o.common]) {
    const e = existingByKey.get(designationKey(n));
    if (e) return e;
  }
  if (GALAXY_TYPES.has(o.type)) for (const e of existing) if (e.kind === 'galaxy' && separationArcsec(o.ra, o.dec, e.ra, e.dec) < 60) return e;
  return null;
}

// ─── 3. Distances: galaxies ─────────────────────────────────────────────────────────────

/** Cosmicflows-4 table 2 rows in the order of public/data/cosmic-web.bin.gz (scripts/build-cosmic-web.mjs sorts them so). */
function readCf4() {
  const field = (line, a, b) => line.slice(a - 1, b).trim();
  const num = (line, a, b) => {
    const s = field(line, a, b);
    return s === '' ? NaN : Number(s);
  };
  const METHOD_COLS = [
    [1, 42, 47],
    [2, 54, 59],
    [4, 66, 71],
    [8, 78, 83],
    [16, 91, 96],
    [32, 103, 107],
    [64, 114, 119],
    [128, 127, 131],
  ];
  const galaxies = [];
  for (const line of gunzipSync(readFileSync('data-raw/cosmos/J_ApJ_944_94/table2.dat.gz')).toString('latin1').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let methods = 0;
    for (const [bit, a, b] of METHOD_COLS) if (Number.isFinite(num(line, a, b))) methods |= bit;
    galaxies.push({ pgc: num(line, 1, 7), group: num(line, 9, 15), vcmb: num(line, 23, 27), dm: num(line, 29, 34), edm: num(line, 36, 40), methods, ra: num(line, 138, 145), dec: num(line, 147, 154) });
  }
  const groups = new Map();
  for (const line of gunzipSync(readFileSync('data-raw/cosmos/J_ApJ_944_94/table4.dat.gz')).toString('latin1').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    groups.set(num(line, 1, 7), { dmzp: num(line, 9, 14), edmzp: num(line, 16, 20), v3k: num(line, 40, 44) });
  }
  for (const g of galaxies) {
    const grp = groups.get(g.group);
    g.dmg = grp ? grp.dmzp : NaN;
    g.edmg = grp ? grp.edmzp : NaN;
    g.vg = grp ? grp.v3k : NaN;
    g.sortKey = Number.isFinite(g.dmg) ? g.dmg : g.dm;
  }
  galaxies.sort((a, b) => a.sortKey - b.sortKey || a.group - b.group || a.dm - b.dm || a.pgc - b.pgc);
  // Check the order against the app's file (the same right ascension and declination, row for row), and take the
  // columns the web places its galaxies by from that file, rounded as the app reads them.
  const buf = gunzipSync(readFileSync('public/data/cosmic-web.bin.gz'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(8, true);
  if (n !== galaxies.length) throw new Error(`cosmic-web.bin.gz has ${n} rows, Cosmicflows-4 ${galaxies.length}`);
  const off = (k) => dv.getUint32(16 + 4 * k, true);
  for (let i = 0; i < n; i++) {
    const g = galaxies[i];
    if (Math.fround(g.ra) !== dv.getFloat32(off(0) + 4 * i, true) || Math.fround(g.dec) !== dv.getFloat32(off(1) + 4 * i, true)) {
      throw new Error(`Cosmicflows-4 row ${i} is not the cosmic web's row ${i}`);
    }
    g.web = {
      ra: dv.getFloat32(off(0) + 4 * i, true),
      dec: dv.getFloat32(off(1) + 4 * i, true),
      vcmb: dv.getInt16(off(2) + 2 * i, true),
      vgroup: dv.getInt16(off(3) + 2 * i, true),
      dm: dv.getUint16(off(4) + 2 * i, true),
      dmgroup: dv.getUint16(off(5) + 2 * i, true),
      edm: dv.getUint8(off(7) + i),
    };
  }
  return galaxies;
}

const cosmo = new Cosmology(PLANCK18);
const cf4 = readCf4();
say(`Cosmicflows-4: ${cf4.length.toLocaleString('en')} galaxies, in the cosmic web's row order (checked against cosmic-web.bin.gz)`);

// The cosmic web's placement (src/sim/cosmos/cosmicWeb.ts makeDistanceFn, 'recommended'), from the file's own columns:
// the group's measured distance within 30 Mpc, the group's redshift beyond 60 Mpc, blended between. The tests check that
// the app places these galaxies where the web does.
const CF4_H0 = 74.6;
const NO_VELOCITY = -32768;
const dmToMpc = (dm) => 10 ** ((dm - 25) / 5);
function cf4ComovingMpc(w) {
  const zCmb = w.vcmb !== NO_VELOCITY ? w.vcmb / C_KM_S : NaN;
  const zGroup = w.vgroup !== NO_VELOCITY ? w.vgroup / C_KM_S : zCmb;
  const dm = w.dm ? w.dm / 1000 : NaN;
  const dmg = w.dmgroup ? w.dmgroup / 1000 : NaN;
  const measured = dmToMpc(dm) / (1 + Math.max(0, zCmb || 0));
  const group = Number.isFinite(dmg) ? dmToMpc(dmg) / (1 + Math.max(0, zGroup || 0)) : measured;
  if (group < 30) return group;
  const r = zGroup > 0 ? cosmo.comovingDistanceMpc(zGroup) : NaN;
  if (!Number.isFinite(r)) return group;
  if (!(group < 60)) return r;
  const t = (group - 30) / 30;
  const k = t * t * (3 - 2 * t);
  return (1 - k) * group * (1 + k * (CF4_H0 / cosmo.params.H0 - 1)) + k * r;
}

// Places and anchors of every row, as the web has them (cosmicWeb.ts webAnchors): a run of rows sharing a group is
// anchored at its members' mean place, a lone galaxy at its own; an anchor inside the Local Group's zero-velocity sphere
// at home (the origin). (In the app the groups of the galaxies drawn as bodies are anchored at those bodies, a few
// hundred kiloparsecs from these means at most: it moves nothing at the present, only far from it.)
const cf4Pos = cf4.map((g) => {
  const d = cf4ComovingMpc(g.web);
  const u = worldOfRaDec(g.web.ra, g.web.dec);
  return [u[0] * d, u[1] * d, u[2] * d];
});
const cf4Anchor = new Array(cf4.length);
{
  const b = localGroupBarycentre();
  const lg = [b[0], b[2], -b[1]];
  const home = (p) => Math.hypot(p[0] - lg[0], p[1] - lg[1], p[2] - lg[2]) <= LOCAL_GROUP.zeroVelocityRadiusMpc;
  let first = 0;
  for (let i = 1; i <= cf4.length; i++) {
    const w = cf4[first].web;
    if (i < cf4.length && cf4[i].web.vgroup === w.vgroup && cf4[i].web.dmgroup === w.dmgroup && w.dmgroup !== 0) continue;
    const a = [0, 0, 0];
    let m = 0;
    for (let k = first; k < i; k++) {
      if (!cf4Pos[k].every(Number.isFinite)) continue;
      for (let j = 0; j < 3; j++) a[j] += cf4Pos[k][j];
      m++;
    }
    const anchor = m && !home(a.map((x) => x / m)) ? a.map((x) => x / m) : [0, 0, 0];
    for (let k = first; k < i; k++) cf4Anchor[k] = anchor;
    first = i;
  }
}
const cf4ByPgc = new Map(cf4.map((g, i) => [g.pgc, i]));

/** The survey galaxies within 600 Mpc (comoving), from the built tiles: direction, distance, catalogue. */
function readSurveys() {
  const dir = 'public/data/survey';
  if (!existsSync(`${dir}/${SF.HIERARCHY_FILE}`)) return null;
  const h = SF.decodeHierarchy(gunzipSync(readFileSync(`${dir}/${SF.HIERARCHY_FILE}`)));
  const R = 600;
  const ra = [];
  const dec = [];
  const dist = [];
  const src = [];
  const pos = [];
  for (const node of h.nodes) {
    const b = node.box;
    // The nearest point of the node's galaxies' box to the Sun.
    const near = Math.hypot(Math.max(b[0], 0, -b[3]), Math.max(b[1], 0, -b[4]), Math.max(b[2], 0, -b[5]));
    if (!(near <= R) || node.points === 0) continue;
    const file = `${dir}/${SF.nodeFile(node.path)}`;
    const d = SF.decodeNode(gunzipSync(readFileSync(file)), node.side);
    const c = SF.nodeCentre(node);
    for (let i = 0; i < d.count; i++) {
      const w = [c[0] + d.position[3 * i], c[1] + d.position[3 * i + 1], c[2] + d.position[3 * i + 2]];
      const s = raDecOfWorld(w);
      if (s.r > R) continue;
      ra.push(s.ra);
      dec.push(s.dec);
      dist.push(s.r);
      src.push(SF.kindSource(d.attrs[2 * i]));
      pos.push(w);
    }
  }
  return { ra, dec, dist, src, pos };
}

const survey = readSurveys();
say(survey ? `galaxy surveys (the built tiles): ${survey.ra.length.toLocaleString('en')} galaxies within 600 Mpc` : 'galaxy surveys: public/data/survey/ not built; no survey distances');

/** Survey galaxies on a grid of 0.1° cells, for the match. */
const surveyCells = new Map();
if (survey) {
  for (let i = 0; i < survey.ra.length; i++) {
    const k = `${Math.floor(survey.dec[i] * 10)},${Math.floor(survey.ra[i] * 10)}`;
    const list = surveyCells.get(k);
    if (list) list.push(i);
    else surveyCells.set(k, [i]);
  }
}

function surveyMatch(o) {
  if (!survey) return null;
  const hits = [];
  const di = Math.floor(o.dec * 10);
  const ri = Math.floor(o.ra * 10);
  for (let a = di - 1; a <= di + 1; a++)
    for (let b = ri - 1; b <= ri + 1; b++)
      for (const i of surveyCells.get(`${a},${((b % 3600) + 3600) % 3600}`) ?? []) {
        const s = separationArcsec(o.ra, o.dec, survey.ra[i], survey.dec[i]);
        if (s <= MATCH_SURVEY_ARCSEC) hits.push({ i, s });
      }
  if (hits.length !== 1) return hits.length ? { ambiguous: true } : null;
  const i = hits[0].i;
  // The redshift OpenNGC gives (NED's) must put it where the survey does, within MATCH_SURVEY_KM_S.
  if (Number.isFinite(o.z)) {
    const zc = SF.zHelioToCmb(o.z, o.ra, o.dec);
    const d = cosmo.comovingDistanceMpc(Math.max(0, zc));
    if (Math.abs(d - survey.dist[i]) > MATCH_SURVEY_KM_S / cosmo.params.H0) return { disagrees: true };
  }
  return { i, sep: hits[0].s };
}

// ─── 4. Distances: the Milky Way and the Clouds ─────────────────────────────────────────

/** Hunt & Reffert 2024 (all 7,167 clusters; the columns as scripts/build-clusters.mjs reads them). */
function readHR24() {
  const text = gunzipSync(readFileSync('data-raw/galaxy/HR24_clusters.dat.gz')).toString('utf8');
  const s = (l, a, b) => l.slice(a - 1, b).trim();
  const f = (l, a, b) => {
    const t = s(l, a, b);
    return t === '' ? NaN : Number(t);
  };
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => ({
      name: s(l, 1, 20),
      allNames: s(l, 27, 279),
      type: s(l, 281, 281),
      cst: f(l, 283, 293),
      N: f(l, 295, 300),
      ra: f(l, 320, 331),
      dec: f(l, 333, 344),
      r50pc: f(l, 419, 431),
      d16: f(l, 584, 598),
      d50: f(l, 600, 614),
      d84: f(l, 616, 631),
      age50: f(l, 808, 818),
      massTot: f(l, 1040, 1054),
    }));
}

const hr24 = readHR24();
const hrByName = new Map();
for (const c of hr24) {
  const names = [c.name, ...c.allNames.split(',')].map((n) => n.trim().replace(/_/g, ' ')).filter(Boolean);
  for (const n of names) if (/^(NGC|IC)\s*\d/.test(n) && !hrByName.has(designationKey(n))) hrByName.set(designationKey(n), c);
}
say(`Hunt & Reffert 2024: ${hr24.length.toLocaleString('en')} clusters, ${hrByName.size.toLocaleString('en')} NGC/IC names among their names`);

/** The app's globular clusters (clusters.json.gz) by name. */
const globulars = new Map();
{
  const g = clustersFile.globularClusters;
  const col = (k) => g.columns.indexOf(k);
  for (const r of g.rows) {
    globulars.set(designationKey(r[col('name')]), {
      name: r[col('name')],
      distPc: r[col('distKpc')] * 1000,
      loPc: (r[col('distKpc')] - (r[col('distErrMinusKpc')] ?? 0)) * 1000,
      hiPc: (r[col('distKpc')] + (r[col('distErrPlusKpc')] ?? 0)) * 1000,
      source: r[col('distSource')] === 'BV21' ? 'bv21' : 'harris',
      rhPc: r[col('rhPc')],
      mv: r[col('MV')],
      feh: r[col('FeH')],
    });
  }
}

/** SIMBAD's planetary nebulae with a Gaia EDR3 parallax for the central star, by NGC/IC designation. */
const pnParallax = new Map();
{
  const lines = readFileSync(`${RAW}/simbad_pn_plx.csv`, 'utf8').split(/\r?\n/).filter(Boolean);
  const parse = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = parse(lines[0]);
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  for (const l of lines.slice(1)) {
    const f = parse(l);
    // Gaia EDR3 (I/350) only: DR2's parallaxes are older and less certain.
    if (f[c.plx_bibcode] !== '2020yCat.1350....0G') continue;
    const plx = Number(f[c.plx_value]);
    const err = Number(f[c.plx_err]);
    for (const id of f[c.ids].split('|')) {
      const m = id.trim().match(/^(NGC|IC)\s+(\d+[A-Z]?)$/);
      if (m) pnParallax.set(designationKey(`${m[1]} ${m[2]}`), { plx, err, main: f[c.main_id].replace(/\s+/g, ' ').trim() });
    }
  }
}
say(`SIMBAD: ${pnParallax.size} NGC/IC planetary nebulae with a Gaia EDR3 parallax for the central star`);

/** The Magellanic Clouds as the app places them (named.json). */
const clouds = {};
{
  const named = JSON.parse(readFileSync('src/sim/cosmos/named.json', 'utf8'));
  for (const id of ['lmc', 'smc']) {
    const o = named.objects.find((x) => x.id === id);
    const e = o.positionEclMpc;
    clouds[id] = {
      name: o.name,
      ra: o.ra,
      dec: o.dec,
      distPc: o.distance.mpc * 1e6,
      errPc: o.distance.errMpc * 1e6,
      ref: o.distance.ref,
      // World axes, pc: (x, z, −y) of the ecliptic.
      centre: [e[0] * 1e6, e[2] * 1e6, -e[1] * 1e6],
      normal: o.disc?.axesEcl?.normal && id === 'lmc' ? [o.disc.axesEcl.normal[0], o.disc.axesEcl.normal[2], -o.disc.axesEcl.normal[1]] : null,
    };
  }
}

/** Distance (pc) along the direction of ra, dec to a Cloud: to the LMC's disc plane, or the SMC's own distance. */
function cloudDistancePc(cloud, ra, dec) {
  const u = worldOfRaDec(ra, dec);
  if (!cloud.normal) return cloud.distPc;
  const n = cloud.normal;
  const num = n[0] * cloud.centre[0] + n[1] * cloud.centre[1] + n[2] * cloud.centre[2];
  const den = n[0] * u[0] + n[1] * u[1] + n[2] * u[2];
  return num / den;
}

// ─── 5. Assemble ────────────────────────────────────────────────────────────────────────

const galaxiesOut = [];
const galacticOut = [];
const existingOut = [];
const counts = new Map();
const count = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);
const surveyStats = { matched: 0, ambiguous: 0, disagrees: 0, seps: [] };

/** The names written for an object: its designation first, then Messier, the other catalogue's and common names. */
const namesOf = (o) => [...new Set([...o.common, ...o.aliases])].filter((a) => a !== o.designation);

for (const o of ngc.objects) {
  const isGalaxy = GALAXY_TYPES.has(o.type);
  const isCluster = CLUSTER_TYPES.has(o.type);
  const isNebula = NEBULA_TYPES.has(o.type);
  if (!isGalaxy && !isCluster && !isNebula) {
    count(`skipped: not a deep-sky object (${o.type})`);
    continue;
  }
  const group = isGalaxy ? 'galaxy' : o.type === 'PN' ? 'planetary nebula' : isCluster ? 'cluster' : 'nebula';
  const e = existingOf(o);
  if (e) {
    for (const n of [o.designation, ...o.aliases]) existingOut.push([n, e.key]);
    count(`${group}: already in the app (kept its record)`);
    continue;
  }
  if (isGalaxy) {
    const row = o.pgc !== null ? cf4ByPgc.get(o.pgc) : undefined;
    if (row !== undefined) {
      const g = cf4[row];
      const p = cf4Pos[row];
      const a = cf4Anchor[row];
      const d = Math.hypot(...p);
      // The card's range: the measured modulus's own uncertainty, about the place drawn.
      const k = g.web.edm ? 10 ** (0.2 * (g.web.edm / 100)) : NaN;
      galaxiesOut.push([o.designation, namesOf(o), o.type, o.hubble || null, round(o.ra, 4), round(o.dec, 4), round(o.majArcmin, 2), round(o.minArcmin, 2), Number.isFinite(o.pa) ? o.pa : null, round(Number.isFinite(o.bmag) ? o.bmag : o.vmag, 2), 'cf4', row, g.methods, round(d, 3), round(d / k, 3), round(d * k, 3), g.web.edm ? g.web.edm / 100 : null, ...p.map((x) => round(x, 3)), ...a.map((x) => round(x, 3))]);
      count('galaxy: placed (Cosmicflows-4)');
      continue;
    }
    const m = surveyMatch(o);
    if (m && 'i' in m) {
      const p = survey.pos[m.i];
      const d = survey.dist[m.i];
      const dv = PECULIAR_KM_S / cosmo.params.H0;
      const src = survey.src[m.i] <= 3 ? 'desi' : 'sdss';
      surveyStats.matched++;
      surveyStats.seps.push(m.sep);
      galaxiesOut.push([o.designation, namesOf(o), o.type, o.hubble || null, round(o.ra, 4), round(o.dec, 4), round(o.majArcmin, 2), round(o.minArcmin, 2), Number.isFinite(o.pa) ? o.pa : null, round(Number.isFinite(o.bmag) ? o.bmag : o.vmag, 2), src, survey.src[m.i], 0, round(d, 3), round(Math.max(0, d - dv), 3), round(d + dv, 3), null, ...p.map((x) => round(x, 3)), null, null, null]);
      count(`galaxy: placed (${src === 'desi' ? 'DESI DR1' : 'SDSS DR17'} redshift)`);
      continue;
    }
    if (m?.ambiguous) surveyStats.ambiguous++;
    if (m?.disagrees) surveyStats.disagrees++;
    count('galaxy: skipped, no measured distance');
    continue;
  }

  // The Milky Way's and the Clouds' clusters and nebulae.
  const key = designationKey(o.designation);
  const keys = [key, ...o.aliases.map(designationKey)];
  const g = galactic(o.ra, o.dec);
  const size = Number.isFinite(o.majArcmin) ? o.majArcmin : null;
  const mag = Number.isFinite(o.vmag) ? o.vmag : Number.isFinite(o.bmag) ? o.bmag : NaN;
  const put = (distPc, loPc, hiPc, source, extra) => {
    const x = distPc * g.u[0];
    const y = distPc * g.u[1];
    const z = distPc * g.u[2];
    galacticOut.push([o.designation, namesOf(o), o.type, round(o.ra, 5), round(o.dec, 5), round(distPc, 1), round(loPc, 1), round(hiPc, 1), source, round(x, 2), round(y, 2), round(z, 2), round(size, 2), round(mag, 2), extra]);
    count(`${group}: placed (${source})`);
  };
  if (o.type === 'GCl') {
    const c = keys.map((k) => globulars.get(k)).find(Boolean);
    if (c) {
      put(c.distPc, c.loPc, c.hiPc, c.source, { rh: round(c.rhPc, 2), mv: round(c.mv, 2), feh: round(c.feh, 2) });
      continue;
    }
  }
  if (o.type === 'OCl' || o.type === 'Cl+N' || o.type === 'GCl') {
    const c = keys.map((k) => hrByName.get(k)).find(Boolean);
    if (c && c.type === 'o' && c.cst >= HR_MIN_CST && Number.isFinite(c.d50)) {
      put(c.d50, c.d16, c.d84, 'hr24', { n: c.N, age: round(c.age50, 2), r50: round(c.r50pc, 2), mass: Number.isFinite(c.massTot) ? Math.round(c.massTot) : null });
      continue;
    }
  }
  if (o.type === 'PN') {
    const p = keys.map((k) => pnParallax.get(k)).find(Boolean);
    if (p && p.plx / p.err >= PLX_MIN_SNR) {
      const plx = p.plx - PLX_ZERO_POINT_MAS;
      put(1000 / plx, 1000 / (plx + p.err), 1000 / (plx - p.err), 'gaia-pn', { plx: round(plx, 4), plxErr: round(p.err, 4), star: p.main });
      continue;
    }
  }
  // In a Magellanic Cloud: its clusters and nebulae, never a planetary nebula or remnant without a distance of its own.
  if (o.type !== 'PN' && o.type !== 'SNR') {
    const cloud = ['lmc', 'smc'].find((id) => separationArcsec(o.ra, o.dec, clouds[id].ra, clouds[id].dec) / 3600 <= CLOUD_RADIUS_DEG[id]);
    if (cloud) {
      const d = cloudDistancePc(clouds[cloud], o.ra, o.dec);
      put(d, d - clouds[cloud].errPc, d + clouds[cloud].errPc, cloud, null);
      continue;
    }
  }
  count(`${group}: skipped, no measured distance`);
}

say('');
say('Placed and skipped, by kind of object and source of the distance:');
for (const [k, n] of [...counts].sort()) say(`  ${k}: ${n.toLocaleString('en')}`);
if (survey) {
  const s = surveyStats.seps.sort((a, b) => a - b);
  say(`  survey matches: ${surveyStats.matched} (median ${s.length ? s[s.length >> 1].toFixed(2) : '-'}", 95th percentile ${s.length ? s[Math.floor(0.95 * s.length)].toFixed(2) : '-'}"); ${surveyStats.ambiguous} with two survey galaxies within ${MATCH_SURVEY_ARCSEC}" and ${surveyStats.disagrees} whose redshifts disagree, left out`);
}

// ─── 6. Write ───────────────────────────────────────────────────────────────────────────

const GALAXY_COLUMNS = ['name', 'aliases', 'type', 'hubble', 'raDeg', 'decDeg', 'majArcmin', 'minArcmin', 'paDeg', 'mag', 'source', 'ref', 'methods', 'distMpc', 'distLoMpc', 'distHiMpc', 'edm', 'x', 'y', 'z', 'ax', 'ay', 'az'];
const GALACTIC_COLUMNS = ['name', 'aliases', 'type', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'source', 'xPc', 'yPc', 'zPc', 'sizeArcmin', 'mag', 'extra'];
const meta = {
  credit: 'OpenNGC by Mattia Verga (github.com/mattiaverga/OpenNGC), CC BY-SA 4.0',
  built: new Date().toISOString().slice(0, 10),
  frames: 'galaxies: world axes (x_ecl, z_ecl, −y_ecl), comoving Mpc from the Sun; galactic: heliocentric galactic pc (x → l = 0, y → l = 90°, z → north galactic pole)',
};
const a = writeColumns(
  `${OUT}/ngc-galaxies.json.gz`,
  { ...meta, schema: 'lightspeed.ngc-galaxies/1', distances: 'Cosmicflows-4 (Tully et al. 2023, CC BY 4.0), placed as the cosmic web places it; else DESI DR1 (CC BY 4.0) or SDSS DR17 redshifts, placed as the galaxy surveys place them', existing: existingOut.length },
  GALAXY_COLUMNS,
  galaxiesOut,
);
const b = writeColumns(
  `${OUT}/ngc-galactic.json.gz`,
  {
    ...meta,
    schema: 'lightspeed.ngc-galactic/1',
    distances: 'Hunt & Reffert 2024 (CC BY 4.0); Baumgardt & Vasiliev 2021 (CC BY 4.0) and Harris 2010 via clusters.json; Gaia EDR3 parallaxes of central stars via SIMBAD (ESA/Gaia/DPAC, CC BY-NC 3.0 IGO); the Magellanic Clouds’ distances (Pietrzyński et al. 2019; Graczyk et al. 2020)',
  },
  GALACTIC_COLUMNS,
  galacticOut,
);
// The app's own bodies, found by their NGC/IC designations: [designation, the name the app finds the body by].
const c = writeColumns(`${OUT}/ngc-existing.json.gz`, { ...meta, schema: 'lightspeed.ngc-existing/1' }, ['designation', 'body'], existingOut);
say('');
say(`wrote ${OUT}/ngc-galaxies.json.gz: ${galaxiesOut.length.toLocaleString('en')} galaxies, ${(a.gz / 1024).toFixed(0)} kB (${(a.raw / 1024).toFixed(0)} kB inflated)`);
say(`wrote ${OUT}/ngc-galactic.json.gz: ${galacticOut.length.toLocaleString('en')} clusters and nebulae, ${(b.gz / 1024).toFixed(0)} kB (${(b.raw / 1024).toFixed(0)} kB inflated)`);
say(`wrote ${OUT}/ngc-existing.json.gz: ${existingOut.length} designations of ${new Set(existingOut.map((r) => r[1])).size} bodies the app already has, ${(c.gz / 1024).toFixed(1)} kB`);
writeLog('build-ngc.mjs');
