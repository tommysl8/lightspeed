// Builds public/data/deepsky/snrs.json.gz: the Milky Way's supernova remnants that have a distance (the format in
// src/sim/deepsky/format.ts; the method in docs/data/deepsky.md).
//
// Source: Ranasinghe & Leahy 2022, "Distances, Radial Distribution, and Total Number of Galactic Supernova Remnants",
// ApJ 940, 63 (doi:10.3847/1538-4357/ac940a), table 1 via CDS/VizieR J/ApJ/940/63: 215 remnants of Green's catalogue
// (Green 2019) and a few newer ones, each with a distance from the literature, recalculated on one rotation curve
// (Reid et al. 2014) where it rests on a velocity. The article is published under CC BY 4.0, so is this file.
//
// Green's catalogue itself (Green 2025, J. Astrophys. Astron. 46, 14; mrao.cam.ac.uk/surveys/snrs) is copyright D. A.
// Green with no licence for redistribution, so nothing of it is copied here: a remnant's place is the galactic longitude
// and latitude its Green name carries (to 0.1°, or 0.01° for the few named so), and its size, flux and type are left out.
// Common names are added for the best-known remnants (as SIMBAD lists them).
//
// Kept: every remnant with a distance or a range of distances; left out: those with only a limit (one, "> 7 kpc").
// The distance is the paper's revised one where it gives one, else the literature's (the middle of a range).
//
// Input: data-raw/deepsky/RL22_table1.dat (fetched when missing).
// Output: public/data/deepsky/snrs.json.gz; its section of docs/data/deepsky-build-log.txt.
//
// Run: node scripts/build-snrs.mjs

import { readFileSync } from 'node:fs';
import { ensure, galactic, icrsOfGalactic, round, writeColumns } from './deepsky/common.mjs';
import { say, writeLog } from './deepsky/log.mjs';

const RAW = 'data-raw/deepsky';
await ensure(`${RAW}/RL22_table1.dat`, 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/940/63/table1.dat');
await ensure(`${RAW}/RL22_refs.dat`, 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/940/63/refs.dat');

/** Common names of the best-known remnants, by Green name (SIMBAD). */
const COMMON = {
  'G0.0+0.0': ['Sgr A East'],
  'G4.5+6.8': ["Kepler's Supernova Remnant", 'SN 1604', 'Kepler SNR'],
  'G6.4-0.1': ['W28'],
  'G21.8-0.6': ['Kes 69'],
  'G31.9+0.0': ['3C 391'],
  'G33.6+0.1': ['Kes 79'],
  'G34.7-0.4': ['W44'],
  'G39.7-2.0': ['W50', 'Manatee Nebula'],
  'G41.1-0.3': ['3C 397'],
  'G43.3-0.2': ['W49B'],
  'G49.2-0.7': ['W51C'],
  'G69.0+2.7': ['CTB 80'],
  'G74.0-8.5': ['Cygnus Loop', 'Veil Nebula'],
  'G78.2+2.1': ['Gamma Cygni SNR', 'DR4'],
  'G82.2+5.3': ['W63'],
  'G89.0+4.7': ['HB 21'],
  'G93.7-0.2': ['CTB 104A'],
  'G106.3+2.7': ['Boomerang'],
  'G109.1-1.0': ['CTB 109'],
  'G111.7-2.1': ['Cassiopeia A', 'Cas A'],
  'G116.9+0.2': ['CTB 1'],
  'G119.5+10.2': ['CTA 1'],
  'G120.1+1.4': ["Tycho's Supernova Remnant", 'SN 1572', 'Tycho SNR', '3C 10'],
  'G130.7+3.1': ['3C 58'],
  'G160.9+2.6': ['HB 9'],
  'G166.0+4.3': ['VRO 42.05.01'],
  'G180.0-1.7': ['Simeis 147', 'Spaghetti Nebula', 'Sh2-240'],
  'G184.6-5.8': ['Crab Nebula', 'M1'],
  'G189.1+3.0': ['IC 443', 'Jellyfish Nebula'],
  'G205.5+0.5': ['Monoceros Loop'],
  'G260.4-3.4': ['Puppis A'],
  'G263.9-3.3': ['Vela Supernova Remnant', 'Vela SNR'],
  'G266.2-1.2': ['Vela Junior', 'RX J0852.0-4622'],
  'G284.3-1.8': ['MSH 10-53'],
  'G290.1-0.8': ['MSH 11-61A'],
  'G292.0+1.8': ['MSH 11-54'],
  'G296.5+10.0': ['PKS 1209-51/52'],
  'G315.4-2.3': ['RCW 86', 'SN 185'],
  'G320.4-1.2': ['MSH 15-52', 'RCW 89'],
  'G326.3-1.8': ['MSH 15-56'],
  'G327.6+14.6': ['SN 1006'],
  'G330.0+15.0': ['Lupus Loop'],
  'G332.4-0.4': ['RCW 103'],
  'G347.3-0.5': ['RX J1713.7-3946'],
};

/**
 * The remnants the app already has, as nebulae with pictures (src/sim/galaxy/nebulae.json): they keep their records,
 * and their Green names lead "Where to?" to them.
 */
const EXISTING = { 'G184.6-5.8': 'Crab Nebula', 'G111.7-2.1': 'Cassiopeia A', 'G74.0-8.5': 'Cygnus Loop (Veil Nebula)' };

/** How each method of the table is put on a card, and whether it is a model's estimate rather than a measurement. */
const METHODS = {
  'Kinematic distance': ['the velocity of its gas and the Galaxy’s rotation (a kinematic distance)', false],
  'Optical extinction': ['the dimming of the stars towards it (optical extinction)', false],
  'Absorption column': ['the absorption of its X-rays by the gas in front of it', false],
  'MC association': ['the molecular cloud it strikes', false],
  GC: ['its place in the Galactic Centre', false],
  'Pulsar association': ['the distance of its pulsar', false],
  'Proper motion + v _shock': ['the expansion of its shell: the shock’s speed and its motion on the sky', false],
  'Proper motion + v _exp': ['the expansion of its shell: the gas’s speed and its motion on the sky', false],
  'Proper motion': ['the expansion of its shell on the sky', false],
  'Parallax measurement': ['a parallax', false],
  PWN: ['its pulsar wind nebula', false],
  'PWN association': ['its pulsar wind nebula', false],
  'H II distance': ['the H II region beside it', false],
  'CO observations': ['the molecular gas beside it (CO)', false],
  '^26Al gamma-ray emission': ['the gamma rays of its radioactive aluminium-26', true],
  'High-V H I clouds': ['fast hydrogen clouds beside it', false],
  'H I column density': ['the hydrogen in front of it', false],
  'Object associations': ['objects associated with it', false],
  Estimation: ['an estimate from models of how remnants grow, not a measurement', true],
  'Sedov estimates': ['an estimate from a model of its blast wave (Sedov), not a measurement', true],
  'Diameter estimation': ['an estimate from its size, not a measurement', true],
  'Estimation (z distance)': ['an estimate from its height above the Galaxy’s plane, not a measurement', true],
  'C IV luminosity estimation': ['an estimate from the brightness of its ultraviolet carbon lines, not a measurement', true],
  'Stats+optical color excess': ['the reddening of the stars towards it, with statistics', true],
  'Scutum-Crux arm': ['the spiral arm it is taken to lie in (Scutum–Crux), an inference', true],
  'Crux-Scutum arm': ['the spiral arm it is taken to lie in (Scutum–Crux), an inference', true],
  'Norma arm': ['the spiral arm it is taken to lie in (Norma), an inference', true],
  'Perseus arm': ['the spiral arm it is taken to lie in (Perseus), an inference', true],
  'Sagittarius-Carina arm': ['the spiral arm it is taken to lie in (Sagittarius–Carina), an inference', true],
  '3 kpc arm': ['the spiral arm it is taken to lie in (the 3 kpc arm), an inference', true],
  '': ['the literature, as compiled by Ranasinghe & Leahy (2022)', false],
};

const refs = new Map();
for (const l of readFileSync(`${RAW}/RL22_refs.dat`, 'latin1').split(/\r?\n/)) {
  const m = l.match(/^\s*(\d+)\s+(.+?)\s{2,}(\S+)/);
  if (m) refs.set(m[1], { who: m[2].trim(), bib: m[3] });
}

const rows = [];
const existing = [];
const counts = new Map();
const count = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);
const num = (s) => (s.trim() === '' ? NaN : Number(s));
for (const line of readFileSync(`${RAW}/RL22_table1.dat`, 'latin1').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const f = line.split('|');
  const name = f[1].trim();
  const flag = f[2].trim();
  const lit = { lim: f[3].trim(), d1: num(f[4]), d2: num(f[5]), lo: num(f[6]), hi: num(f[7]) };
  const method = f[9].trim();
  const ref = f[14].trim();
  const rev = { lim: f[15].trim(), d: num(f[16]), e: num(f[17]) };
  const m = name.match(/^G(\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`unexpected remnant name ${name}`);
  if (EXISTING[name]) {
    for (const n of [name, ...(COMMON[name] ?? [])]) existing.push([n, EXISTING[name]]);
    count('already in the app (kept its record)');
    continue;
  }
  let d;
  let lo;
  let hi;
  if (Number.isFinite(rev.d) && !rev.lim) {
    d = rev.d;
    lo = Number.isFinite(rev.e) ? d - rev.e : NaN;
    hi = Number.isFinite(rev.e) ? d + rev.e : NaN;
  } else if (Number.isFinite(lit.d1) && !lit.lim) {
    if (Number.isFinite(lit.d2)) {
      d = (lit.d1 + lit.d2) / 2;
      lo = lit.d1;
      hi = lit.d2;
    } else {
      d = lit.d1;
      lo = Number.isFinite(lit.lo) ? d - lit.lo : NaN;
      hi = Number.isFinite(lit.hi) ? d + lit.hi : NaN;
    }
  } else {
    count('skipped: only a limit on its distance');
    continue;
  }
  const how = METHODS[method];
  if (!how) throw new Error(`no words for the method "${method}" (${name})`);
  const l = Number(m[1]);
  const b = Number(m[2]);
  const { ra, dec } = icrsOfGalactic(l, b);
  const g = galactic(ra, dec);
  const pc = d * 1000;
  const refText = ref
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((k) => refs.get(k))
    .filter(Boolean)
    .map((r) => `${r.who} ${r.bib.slice(0, 4)}`)
    .join('; ');
  rows.push([
    name,
    COMMON[name] ?? [],
    round(l, 3),
    round(b, 3),
    round(ra, 4),
    round(dec, 4),
    round(pc, 0),
    Number.isFinite(lo) ? round(Math.max(0, lo) * 1000, 0) : null,
    Number.isFinite(hi) ? round(hi * 1000, 0) : null,
    method || null,
    flag === 'D' ? 'uncertain' : flag === 'd' ? 'new' : null,
    refText || null,
    round(pc * g.u[0], 1),
    round(pc * g.u[1], 1),
    round(pc * g.u[2], 1),
  ]);
  count(`placed${how[1] ? ' (a model estimate or an inference)' : ''}${flag === 'D' ? ', its nature uncertain' : ''}`);
}

say(`run on ${new Date().toISOString().slice(0, 10)}: Ranasinghe & Leahy 2022, table 1`);
for (const [k, n] of [...counts].sort()) say(`  ${k}: ${n}`);
const COLUMNS = ['name', 'aliases', 'lDeg', 'bDeg', 'raDeg', 'decDeg', 'distPc', 'distLoPc', 'distHiPc', 'method', 'flag', 'ref', 'xPc', 'yPc', 'zPc'];
const out = writeColumns(
  'public/data/deepsky/snrs.json.gz',
  {
    schema: 'lightspeed.snrs/1',
    credit: 'Ranasinghe & Leahy 2022, ApJ 940, 63 (CC BY 4.0), via CDS/VizieR J/ApJ/940/63; names after Green 2025 (J. Astrophys. Astron. 46, 14) and SIMBAD',
    built: new Date().toISOString().slice(0, 10),
    frames: 'heliocentric galactic pc (x → l = 0, y → l = 90°, z → north galactic pole)',
    methods: Object.fromEntries(Object.entries(METHODS).map(([k, [text, estimate]]) => [k, { text, estimate }])),
    existing,
  },
  COLUMNS,
  rows,
);
say(`wrote public/data/deepsky/snrs.json.gz: ${rows.length} remnants, ${(out.gz / 1024).toFixed(1)} kB`);
writeLog('build-snrs.mjs');
