// Builds public/data/asteroids/: every asteroid and comet in JPL's Small-Body Database whose orbit is good enough to
// draw, about 1.4 million, in the format of src/sim/asteroids/format.ts (the method in docs/data/asteroids.md).
//
// Source: JPL Small-Body Database Query API, https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html (NASA/JPL-Caltech,
// US public domain). Elements are heliocentric osculating ones, J2000 ecliptic, at each body's epoch.
//
// What is done to them:
//   1. kept: asteroids with an orbit condition code of 7 or better (0 is best, 9 worst: codes 8 and 9 are orbits
//      from arcs of days, whose bodies could be tens of degrees from where they would be drawn within a year) and an
//      absolute magnitude; comets with code 7 or better or none (JPL gives none for most single-apparition comets),
//      not lost or defunct (D/, X/), periodic ones (period under 200 years) only with an epoch since 1990 (older
//      orbits have been bent by Jupiter since), the others only with perihelion after 1900 (telescopic orbits).
//      Bodies the app's registry already draws with an accurate track (REGISTRY below) are left out.
//   2. moved to the reference epoch: an ellipse's mean anomaly carried from its epoch along its own two-body orbit
//      (the same motion the shader draws, so nothing changes but the numbers); orbits wholly beyond Jupiter (q ≥ 7
//      au) re-fitted about the Solar System's barycentre from their state at the epoch (astronomy-engine's barycentre),
//      which tracks them far better (docs/data/asteroids.md §3).
//   3. grouped: near-Earth (JPL classes IEO, ATE, APO, AMO), main belt (IMB, MBA, OMB, MCA), Hildas (a 3.7-4.2 au,
//      e < 0.3, i < 20°), Jupiter Trojans (TJN), Centaurs (CEN, and AST beyond 5 au), trans-Neptunian objects (TNO),
//      comets (and the few asteroids on open orbits).
//   4. sorted: each group by absolute magnitude (comets by M1), cut into sections; the brightest of every group go in
//      the first file, which the app loads at start (as it did belts.bin).
//
// Inputs: the raw Query API chunks, fetched when missing (about 450 MB of JSON), in the folder given as the first
// argument or by ASTEROIDS_RAW, else data-raw/asteroids.
// Output: public/data/asteroids/index.json, NN.bin.gz, labels/<section>.txt.gz, names.bin.gz;
// docs/data/asteroids-build-log.txt.
//
// Run: npm run data:asteroids [-- <raw folder>]   (about 3 GB of memory, a minute once downloaded)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fetchAll, readChunk } from './asteroids/fetch.mjs';
import * as F from '../src/sim/asteroids/format.ts';
import { K_GAUSS } from '../src/sim/asteroids/conic.ts';
import { toBarycentric } from '../src/sim/asteroids/barycentre.ts';

const RAW = process.argv[2] ?? process.env.ASTEROIDS_RAW ?? 'data-raw/asteroids';
const OUT = 'public/data/asteroids';
const LOG = 'docs/data/asteroids-build-log.txt';

/** The reference epoch: SBDB's standard epoch for this solution set (2026-07-?), where most elements already are. */
const REF_EPOCH_JD = 2461200.5;
/** The worst orbit condition code kept. */
const MAX_CC = 7;
/** Orbits with perihelion at least this far out are fitted about the barycentre, au. */
const BARY_Q_AU = 7;
/** Periodic comets: under this period, years, and only with elements from this date on. */
const PERIODIC_YEARS = 200;
const PERIODIC_SINCE_JD = 2447892.5; // 1990-01-01
/** Other comets: perihelion after this date. */
const OPEN_SINCE_JD = 2415020.5; // 1900-01-01
/** Most bodies in one section. */
const SECTION_MAX = 90_000;
/** Most bytes (raw) packed into one file of small sections. */
const FILE_MAX_RAW = 1_400_000;
/** The first file: each group's bodies brighter than this (H; comets all). */
const FIRST = { neo: 18, main: 14, hilda: 14, trojan: 14, centaur: Infinity, tno: 9, comet: Infinity };

/**
 * Bodies the registry draws already (public/data/tracks.json and the planets' data): Ceres, Vesta, the dwarf planets
 * and candidates, Arrokoth, Pluto, the comets with tails and the interstellar objects. By SBDB primary designation.
 */
const REGISTRY = new Set([
  '1', '4', '134340', '136199', '136108', '136472', '225088', '50000', '90377', '90482', '486958',
  '1P', '2P', '67P', '1995 O1', '2017 U1', '2019 Q4', '2025 N1',
]);

const NEO = new Set(['IEO', 'ATE', 'APO', 'AMO']);
const MAIN = new Set(['IMB', 'MBA', 'OMB', 'MCA']);
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const wrap = (x) => ((x % TAU) + TAU) % TAU;
const num = (x) => (x == null || x === '' ? null : Number(x));

// ─── Reading and filtering ─────────────────────────────────────────────────────────────────

const files = await fetchAll(RAW);
const reasons = new Map();
const drop = (why) => reasons.set(why, (reasons.get(why) ?? 0) + 1);
const seen = new Set();
const bodies = [];
let rows = 0;

for (const path of files) {
  const j = readChunk(path);
  const ix = Object.fromEntries(j.fields.map((f, i) => [f, i]));
  for (const r of j.data) {
    rows++;
    const spk = r[ix.spkid];
    if (seen.has(spk)) {
      drop('listed twice (a chunk boundary moved while downloading)');
      continue;
    }
    seen.add(spk);
    const comet = r[ix.kind][0] === 'c';
    const pdes = r[ix.pdes];
    if (REGISTRY.has(pdes)) {
      drop('drawn by the registry with an accurate track');
      continue;
    }
    const cls = r[ix.class] ?? '';
    const cc = num(r[ix.condition_code]);
    const q = num(r[ix.q]);
    const e = num(r[ix.e]);
    const i = num(r[ix.i]);
    const om = num(r[ix.om]);
    const w = num(r[ix.w]);
    const tp = num(r[ix.tp]);
    const epoch = num(r[ix.epoch]);
    if (![q, e, i, om, w, tp, epoch].every((x) => x != null && Number.isFinite(x)) || !(q > 0) || !(e >= 0)) {
      drop('elements incomplete');
      continue;
    }
    const H = num(r[ix.H]);
    const M1 = num(r[ix.M1]);
    const K1 = num(r[ix.K1]);
    if (comet) {
      const prefix = r[ix.prefix];
      if (prefix === 'D' || prefix === 'X') {
        drop('comet lost, defunct or without a reliable orbit (D/, X/)');
        continue;
      }
      if (cc != null && cc > MAX_CC) {
        drop(`orbit condition code 8 or 9`);
        continue;
      }
      const periodYears = e < 1 ? Math.pow(q / (1 - e), 1.5) : Infinity;
      if (periodYears < PERIODIC_YEARS ? epoch < PERIODIC_SINCE_JD : tp < OPEN_SINCE_JD) {
        drop(periodYears < PERIODIC_YEARS ? 'periodic comet with elements from before 1990' : 'comet with perihelion before 1900');
        continue;
      }
    } else {
      if (cc == null || cc > MAX_CC) {
        drop(cc == null ? 'asteroid without a condition code' : 'orbit condition code 8 or 9');
        continue;
      }
      if (H == null) {
        drop('asteroid without an absolute magnitude');
        continue;
      }
    }
    const a = e < 1 ? q / (1 - e) : null;
    let group;
    if (comet || e >= 1) group = 'comet';
    else if (NEO.has(cls)) group = 'neo';
    else if (cls === 'TJN') group = 'trojan';
    else if (cls === 'TNO') group = 'tno';
    else if (cls === 'CEN' || (cls === 'AST' && a > 5)) group = 'centaur';
    else if ((MAIN.has(cls) || cls === 'AST') && a > 3.7 && a < 4.2 && e < 0.3 && i < 20) group = 'hilda';
    else group = 'main';

    const helio = { q, e, i: i * DEG, node: wrap(om * DEG), peri: wrap(w * DEG), tp: tp - REF_EPOCH_JD, mu: 1 };
    const bary = q >= BARY_Q_AU;
    const el = bary ? toBarycentric(helio, epoch, REF_EPOCH_JD) : helio;
    // Comets, and any orbit near or beyond parabolic, are kept as conics about perihelion; the rest as ellipses.
    const shape = group === 'comet' || el.e >= 0.98 ? F.SHAPE_CONIC : F.SHAPE_ELLIPSE;
    const name = r[ix.name];
    const full = r[ix.full_name].trim();
    const number = r[ix.kind][1] === 'n' && !comet ? Number(pdes) : 0;
    // A numbered asteroid's provisional designation is in brackets in its full name: "433 Eros (A898 PA)".
    const designation = comet ? full : number ? (full.match(/\(([^)]+)\)\s*$/)?.[1] ?? pdes) : pdes;
    bodies.push({
      group,
      shape,
      frame: bary ? F.FRAME_BARY : F.FRAME_SUN,
      el,
      mag: comet ? M1 : H,
      M1,
      K1,
      number,
      named: !comet && !!name,
      label: {
        number,
        name: comet ? null : (name ?? null),
        designation,
        diameterKm: num(r[ix.diameter]),
        albedo: num(r[ix.albedo]),
        orbitClass: cls,
      },
      spk,
    });
  }
}

// ─── Sections and files ────────────────────────────────────────────────────────────────────

// A section's bound on how bright its bodies can look rests on its least perihelion and greatest aphelion
// (src/sim/asteroids/lod.ts): a few wide orbits in a group (Mars-crossers out to 7 au in the main belt) would loosen
// it for the whole group. So each group's orbits beyond its central 99.6% in q or Q get sections of their own.
const OUTLIER_SHARE = 0.002;
const spread = new Map();
for (const g of F.GROUPS) {
  if (g === 'comet' || g === 'neo') continue;
  const list = bodies.filter((b) => b.group === g && b.shape === F.SHAPE_ELLIPSE);
  if (list.length < 1000) continue;
  const qs = list.map((b) => b.el.q).sort((x, y) => x - y);
  const Qs = list.map((b) => (b.el.q * (1 + b.el.e)) / (1 - b.el.e)).sort((x, y) => x - y);
  spread.set(g, { qLo: qs[Math.floor(qs.length * OUTLIER_SHARE)], QHi: Qs[Math.ceil(Qs.length * (1 - OUTLIER_SHARE)) - 1] });
}
const wide = (b) => {
  const s = spread.get(b.group);
  if (!s || b.shape !== F.SHAPE_ELLIPSE) return false;
  return b.el.q < s.qLo || (b.el.q * (1 + b.el.e)) / (1 - b.el.e) > s.QHi;
};
const byKey = new Map();
for (const b of bodies) {
  const key = `${F.GROUPS.indexOf(b.group)}/${b.shape}/${b.frame}${wide(b) ? '/wide' : ''}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(b);
}
const magOf = (b) => b.mag ?? 99;
const first = [];
const rest = [];
for (const [, list] of [...byKey].sort((x, y) => x[0].localeCompare(y[0]))) {
  list.sort((x, y) => magOf(x) - magOf(y) || x.spk - y.spk);
  const cut = FIRST[list[0].group];
  const head = list.filter((b) => magOf(b) < cut);
  const tail = list.filter((b) => magOf(b) >= cut);
  if (head.length) first.push(head);
  // Even pieces, so the last is not a sliver.
  const pieces = Math.ceil(tail.length / SECTION_MAX);
  const size = Math.ceil(tail.length / Math.max(1, pieces));
  for (let p = 0; p < pieces; p++) rest.push(tail.slice(p * size, (p + 1) * size));
}

let nextId = 0;
const sectionsOut = [];
function makeSection(list) {
  // The numbered bodies first, by number (so a number's place can be found from the names file), then the rest by H.
  const numbered = list.filter((b) => b.number > 0).sort((x, y) => x.number - y.number);
  const others = list.filter((b) => !(b.number > 0));
  const ordered = [...numbered, ...others];
  const n = ordered.length;
  const b0 = ordered[0];
  const mags = ordered.map(magOf).filter((m) => m < 99);
  const hMin = mags.length ? Math.min(...mags) : 99;
  const hMax = mags.length ? Math.max(...mags) : 99;
  let rMin = Infinity;
  let rMax = 0;
  for (const b of ordered) {
    rMin = Math.min(rMin, b.el.q);
    rMax = Math.max(rMax, b.el.e < 1 ? (b.el.q * (1 + b.el.e)) / (1 - b.el.e) : Infinity);
  }
  const head = { group: F.GROUPS.indexOf(b0.group), shape: b0.shape, frame: b0.frame, count: n, numbered: numbered.length, hMin, hMax, rMin, rMax, id: nextId++ };
  let section;
  if (b0.shape === F.SHAPE_ELLIPSE) {
    const cols = { a: new Float32Array(n), e: new Uint16Array(n), i: new Uint16Array(n), node: new Uint16Array(n), peri: new Uint16Array(n), M: new Uint16Array(n), H: new Uint8Array(n) };
    ordered.forEach((b, k) => {
      const { q, e, mu } = b.el;
      const a = q / (1 - e);
      const nDay = (K_GAUSS * Math.sqrt(mu)) / (a * Math.sqrt(a));
      cols.a[k] = a;
      cols.e[k] = F.quantU16(e);
      cols.i[k] = F.quantU16(b.el.i / Math.PI);
      cols.node[k] = F.quantU16(b.el.node / TAU);
      cols.peri[k] = F.quantU16(b.el.peri / TAU);
      // Mean anomaly at the reference epoch: n (t − tp), from the time of perihelion nearest it.
      cols.M[k] = F.quantU16(wrap(nDay * (0 - b.el.tp)) / TAU) % 65535;
      cols.H[k] = F.quantH(b.mag, hMin, hMax);
    });
    section = { ...head, cols };
  } else {
    const cols = { q: new Float32Array(n), e: new Float32Array(n), tp: new Float32Array(n), i: new Uint16Array(n), node: new Uint16Array(n), peri: new Uint16Array(n), M1: new Uint8Array(n), K1: new Uint8Array(n) };
    ordered.forEach((b, k) => {
      cols.q[k] = b.el.q;
      cols.e[k] = b.el.e;
      cols.tp[k] = b.el.tp;
      cols.i[k] = F.quantU16(b.el.i / Math.PI);
      cols.node[k] = F.quantU16(b.el.node / TAU);
      cols.peri[k] = F.quantU16(b.el.peri / TAU);
      // Asteroids on open orbits have an H, not a comet's M1, K1: their reflected light goes as 5 log10(r Δ).
      cols.M1[k] = F.quantM1(b.group === 'comet' && b.M1 == null && b.mag == null ? null : (b.M1 ?? b.mag));
      cols.K1[k] = F.quantK1(b.K1 ?? (b.M1 == null && b.mag != null ? 5 : null));
    });
    section = { ...head, cols };
  }
  sectionsOut.push({ section, ordered });
  return section;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/labels`, { recursive: true });
const index = { format: 'skyfold-asteroids', version: 1, refEpochJd: REF_EPOCH_JD, files: [] };

function writeFile(sections) {
  const name = `${String(index.files.length).padStart(2, '0')}.bin.gz`;
  const raw = F.encodeOrbitFile({ refEpochJd: REF_EPOCH_JD, sections });
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(`${OUT}/${name}`, gz);
  index.files.push({
    file: name,
    bytes: gz.length,
    sections: sections.map(({ cols: _c, ...h }) => ({ ...h, rMax: Number.isFinite(h.rMax) ? h.rMax : null })),
  });
}

writeFile(first.map(makeSection));
// The rest, brightest sections first across groups, small ones packed together.
rest.sort((x, y) => magOf(x[0]) - magOf(y[0]));
let pack = [];
let packBytes = 0;
for (const list of rest) {
  const s = makeSection(list);
  const bytes = s.count * (s.shape === F.SHAPE_ELLIPSE ? 15 : 22);
  if (pack.length && packBytes + bytes > FILE_MAX_RAW) {
    writeFile(pack);
    pack = [];
    packBytes = 0;
  }
  pack.push(s);
  packBytes += bytes;
}
if (pack.length) writeFile(pack);
if (nextId >= F.NO_SECTION) throw new Error(`${nextId} sections: the names file holds section ids in a byte`);

// Labels, one file per section.
for (const { section, ordered } of sectionsOut) {
  const text = ordered.map((b) => F.formatLabel(b.label)).join('\n') + '\n';
  writeFileSync(`${OUT}/labels/${section.id}.txt.gz`, gzipSync(Buffer.from(text, 'utf8'), { level: 9 }));
}

// Names: every numbered body's section, the named ones' names and the comets' designations.
let maxNumber = 0;
for (const b of bodies) maxNumber = Math.max(maxNumber, b.number);
const sectionOf = new Uint8Array(maxNumber + 1).fill(F.NO_SECTION);
const named = new Map();
const comets = [];
for (const { section, ordered } of sectionsOut) {
  ordered.forEach((b, k) => {
    if (b.number > 0) sectionOf[b.number] = section.id;
    if (b.named) named.set(b.number, b.label.name);
    if (b.group === 'comet' && !b.number && /[/]/.test(b.label.designation)) comets.push([b.label.designation, section.id, k]);
  });
}
const namesGz = gzipSync(F.encodeNames({ sectionOf, named, comets }), { level: 9 });
writeFileSync(`${OUT}/names.bin.gz`, namesGz);

// Counts for the index and the log.
const counts = {};
for (const b of bodies) counts[b.group] = (counts[b.group] ?? 0) + 1;
index.counts = counts;
index.total = bodies.length;
writeFileSync(`${OUT}/index.json`, JSON.stringify(index) + '\n');

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
const log = [
  `Small bodies (scripts/build-asteroids.mjs), built ${new Date().toISOString().slice(0, 10)} from the JPL SBDB Query API`,
  `rows read: ${rows}`,
  `kept: ${bodies.length}`,
  ...F.GROUPS.map((g) => `  ${F.GROUP_TEXT[g]}: ${counts[g] ?? 0}`),
  `  about the barycentre (q >= ${BARY_Q_AU} au): ${bodies.filter((b) => b.frame === F.FRAME_BARY).length}`,
  `left out:`,
  ...[...reasons].sort((x, y) => y[1] - x[1]).map(([why, n]) => `  ${why}: ${n}`),
  `files: ${index.files.length}, sections: ${nextId}, ${kb(index.files.reduce((s, f) => s + f.bytes, 0))} gzip in all`,
  ...index.files.map((f) => `  ${f.file}: ${kb(f.bytes)}, ${f.sections.map((s) => `${F.GROUPS[s.group]} ${s.count} (H ${s.hMin.toFixed(1)}-${s.hMax.toFixed(1)})`).join(', ')}`),
  `names: ${named.size} named, ${comets.length} comets, numbers to ${maxNumber}: ${kb(namesGz.length)}`,
];
mkdirSync('docs/data', { recursive: true });
writeFileSync(LOG, log.join('\n') + '\n');
console.log(log.join('\n'));
