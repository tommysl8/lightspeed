// Builds public/data/constellations.json: the 88 IAU constellations with their stick figures, each line vertex
// resolved to a star of public/data/stars3d.bin.gz so the figures are drawn between real 3D stars and distort
// correctly when you fly away from the Sun.
//
// Source: d3-celestial (Olaf Frohn), data/constellations.lines.json and data/constellations.json,
// https://github.com/ofrohn/d3-celestial, BSD 3-Clause licence. Its figures follow the IAU constellation charts
// ("IAU and Sky & Telescope"), with some line modifications by Frohn. Names and genitives are the IAU forms.
//
// Run after scripts/build-stars3d.mjs:   node scripts/build-constellations.mjs
//
// Inputs (data-raw/): d3celestial_constellations.lines.json, d3celestial_constellations.json, d3celestial_LICENSE
// (downloaded from https://raw.githubusercontent.com/ofrohn/d3-celestial/master/...)

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const DEG = Math.PI / 180;
const EPS = (84381.448 / 3600) * DEG;
const MATCH_ARCSEC = 90; // vertices are given to 0.0001 deg; high-proper-motion stars move ~20" between epochs
const MAX_V = 6.5; // figure stars are naked-eye stars
const PAIR_ARCSEC = 15;
// Vertices where d3-celestial's position is on the wrong star of a pair, resolved by HIP number instead.
const VERTEX_OVERRIDES = [
  {
    near: [194.0019, 38.3149],
    hip: 63125,
    why: 'Canes Venatici: d3-celestial places the vertex on alpha-1 CVn (HIP 63121, V 5.6); the figure star is Cor Caroli, alpha-2 CVn (HIP 63125, V 2.9), 19.4" away',
  },
];

function unshuffle(buf, offset, n, width) {
  const src = new Uint8Array(buf, offset, n * width);
  const out = new Uint8Array(n * width);
  for (let k = 0; k < width; k++) for (let i = 0; i < n; i++) out[i * width + k] = src[k * n + i];
  return out.buffer;
}

function loadStars() {
  const b = gunzipSync(readFileSync(join(ROOT, 'public', 'data', 'stars3d.bin.gz')));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const dv = new DataView(buf);
  const n = dv.getUint32(8, true);
  const off = [0, 1, 2].map((k) => dv.getUint32(28 + 4 * k, true));
  const pos = new Float32Array(unshuffle(buf, off[0], 3 * n, 4));
  const absQ = new Int16Array(unshuffle(buf, off[2], n, 2));
  const unit = dv.getFloat32(20, true);
  const V = new Float32Array(n);
  const dir = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i];
    const y = pos[3 * i + 1];
    const z = pos[3 * i + 2];
    const r = Math.hypot(x, y, z);
    V[i] = absQ[i] * unit + 5 * Math.log10(r) - 5;
    // ecliptic -> equatorial
    dir[3 * i] = x / r;
    dir[3 * i + 1] = (Math.cos(EPS) * y - Math.sin(EPS) * z) / r;
    dir[3 * i + 2] = (Math.sin(EPS) * y + Math.cos(EPS) * z) / r;
  }
  return { n, V, dir };
}

function main() {
  const stars = loadStars();
  const names = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'public', 'data', 'star-names.json.gz'))).toString('utf8'));
  const hipOf = new Map();
  let idx = 0;
  names.hip.indexDelta.forEach((d, k) => {
    idx += d;
    hipOf.set(idx, names.hip.id[k]);
  });
  const properOf = new Map();
  for (const [i, n] of names.proper) if (!properOf.has(i)) properOf.set(i, n);
  const indexOfHip = new Map([...hipOf].map(([i, h]) => [h, i]));
  const overridesUsed = [];

  // candidate stars: naked-eye stars only, for speed and to avoid faint neighbours
  const cand = [];
  for (let i = 0; i < stars.n; i++) if (stars.V[i] <= MAX_V) cand.push(i);

  const lines = JSON.parse(readFileSync(join(RAW, 'd3celestial_constellations.lines.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(RAW, 'd3celestial_constellations.json'), 'utf8'));
  const metaById = new Map();
  for (const f of meta.features) if (!metaById.has(f.id)) metaById.set(f.id, f);

  const cosLim = Math.cos((MATCH_ARCSEC / 3600) * DEG);
  const cosPair = Math.cos((PAIR_ARCSEC / 3600) * DEG);
  const seps = [];
  const failures = [];
  const byAbbr = new Map();
  for (const f of lines.features) {
    const polylines = [];
    for (const line of f.geometry.coordinates) {
      const poly = [];
      for (const [lon, lat] of line) {
        const ra = (lon < 0 ? lon + 360 : lon) * DEG;
        const dec = lat * DEG;
        const u = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
        const ov = VERTEX_OVERRIDES.find((o) => Math.hypot((((o.near[0] - lon + 540) % 360) - 180) * Math.cos(dec), o.near[1] - lat) * 3600 < 2);
        if (ov) {
          const i = indexOfHip.get(ov.hip);
          if (i === undefined) throw new Error(`override star HIP ${ov.hip} not in the catalogue`);
          const c = u[0] * stars.dir[3 * i] + u[1] * stars.dir[3 * i + 1] + u[2] * stars.dir[3 * i + 2];
          seps.push((Math.acos(Math.min(1, c)) / DEG) * 3600);
          overridesUsed.push(`${f.id}: ${ov.why}`);
          if (poly[poly.length - 1] !== i) poly.push(i);
          continue;
        }
        // Nearest star within the tolerance, except that among stars within PAIR_ARCSEC of the vertex the brightest
        // wins (close pairs such as Alpha Centauri A/B or Dubhe A/B: the figure means the bright component).
        let best = -1;
        let bestDot = cosLim;
        let pair = -1;
        let pairDot = -1;
        for (const i of cand) {
          const c = u[0] * stars.dir[3 * i] + u[1] * stars.dir[3 * i + 1] + u[2] * stars.dir[3 * i + 2];
          if (c > bestDot) {
            bestDot = c;
            best = i;
          }
          if (c > cosPair && (pair < 0 || stars.V[i] < stars.V[pair])) {
            pair = i;
            pairDot = c;
          }
        }
        if (pair >= 0) {
          best = pair;
          bestDot = pairDot;
        }
        if (best < 0) {
          failures.push(`${f.id} (${lon}, ${lat})`);
          continue;
        }
        seps.push((Math.acos(Math.min(1, bestDot)) / DEG) * 3600);
        if (poly[poly.length - 1] !== best) poly.push(best);
      }
      if (poly.length >= 2) polylines.push(poly);
    }
    const prev = byAbbr.get(f.id);
    if (prev) prev.push(...polylines);
    else byAbbr.set(f.id, polylines);
  }

  const out = [];
  for (const [abbr, polylines] of byAbbr) {
    const m = metaById.get(abbr);
    const starSet = [...new Set(polylines.flat())];
    out.push({
      abbr,
      name: m.properties.name,
      genitive: m.properties.gen,
      english: m.properties.en,
      rank: Number(m.properties.rank),
      // label position used by d3-celestial [ra deg, dec deg] (J2000)
      label: [((m.geometry.coordinates[0] % 360) + 360) % 360, m.geometry.coordinates[1]],
      lines: polylines,
      stars: starSet.map((i) => ({ i, hip: hipOf.get(i) ?? null, name: properOf.get(i) ?? null, v: +stars.V[i].toFixed(2) })),
    });
  }
  out.sort((a, b) => a.abbr.localeCompare(b.abbr));
  if (out.length !== 88) throw new Error(`expected 88 constellations, got ${out.length}`);

  seps.sort((a, b) => a - b);
  const segments = out.reduce((s, c) => s + c.lines.reduce((t, l) => t + l.length - 1, 0), 0);
  const json = {
    format: 'lightspeed.constellations',
    version: 1,
    catalogue: 'stars3d.bin.gz',
    note:
      'lines: polylines of star indices into stars3d.bin.gz (0-based). Draw each polyline between the stars\' 3D ' +
      'positions. Serpens (Ser) has two parts (Caput and Cauda), kept as separate polylines. label: J2000 RA/Dec (deg) ' +
      'of the label position used by d3-celestial.',
    source:
      'Figures and names: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial), BSD 3-Clause; ' +
      'figures after the IAU constellation charts (IAU and Sky & Telescope) with some modifications by Frohn.',
    licence: 'BSD-3-Clause (d3-celestial, Copyright (c) 2015, Olaf Frohn); star indices refer to stars3d.bin.gz (see its licence in CREDITS.md)',
    match: {
      vertices: seps.length,
      failures: failures.length,
      medianArcsec: +seps[Math.floor(seps.length / 2)].toFixed(2),
      maxArcsec: +seps[seps.length - 1].toFixed(2),
      segments,
      overrides: overridesUsed,
    },
    constellations: out,
  };
  writeFileSync(join(ROOT, 'public', 'data', 'constellations.json'), JSON.stringify(json));
  console.log(`constellations.json: 88 constellations, ${segments} segments, ${seps.length} vertices matched (median ${json.match.medianArcsec}", max ${json.match.maxArcsec}"), ${failures.length} unmatched`);
  if (failures.length) console.log('unmatched:', failures.join('; '));
  if (overridesUsed.length) console.log('overrides:', overridesUsed.join('; '));
  const worst = [];
  for (const c of out) for (const s of c.stars) if (s.v > 5.5) worst.push(`${c.abbr}:${s.name ?? 'HIP ' + s.hip}(${s.v})`);
  console.log(`figure stars fainter than V 5.5: ${worst.join(', ')}`);
}

main();
