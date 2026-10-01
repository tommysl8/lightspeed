// Downloads every asteroid and comet orbit in the JPL Small-Body Database, in chunks, to a raw folder.
// Each chunk is one Query API response saved as JSON; a chunk already on disk is not fetched again.
//
// API: https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html (NASA/JPL, US public domain).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';

/** Everything the build reads. full-prec matters: the default rounding (four figures in a) drifts by degrees in decades. */
export const FIELDS = [
  'spkid', 'full_name', 'pdes', 'name', 'prefix', 'kind',
  'a', 'q', 'e', 'i', 'om', 'w', 'ma', 'tp', 'epoch',
  'H', 'M1', 'K1', 'diameter', 'albedo', 'class', 'condition_code', 'data_arc',
].join(',');

/** Rows per request: about 14 MB of JSON and a few seconds each. */
export const CHUNK = 50_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(params, label) {
  const url = `${API}?${new URLSearchParams({ fields: FIELDS, 'full-prec': 'true', sort: 'spkid', ...params })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 5) throw new Error(`${label}: ${err.message}`);
      const wait = 2000 * 2 ** attempt;
      console.log(`  ${label}: ${err.message}, retrying in ${wait / 1000} s`);
      await sleep(wait);
    }
  }
}

function save(path, json) {
  // Written whole and then renamed, so a run cut off half-way never leaves a truncated chunk behind.
  writeFileSync(`${path}.part`, JSON.stringify(json));
  renameSync(`${path}.part`, path);
}

/** Fetches what is missing and returns the chunk file paths, asteroids first, then comets. */
export async function fetchAll(raw) {
  mkdirSync(raw, { recursive: true });
  const files = [];
  const head = await getJson({ 'sb-kind': 'a', limit: '1' }, 'asteroid count');
  const n = head.count;
  const chunks = Math.ceil(n / CHUNK);
  console.log(`SBDB lists ${n} asteroids: ${chunks} chunks of ${CHUNK}`);
  for (let k = 0; k < chunks; k++) {
    const path = `${raw}/sbdb_a_${String(k).padStart(3, '0')}.json`;
    files.push(path);
    if (existsSync(path)) continue;
    const t0 = Date.now();
    const json = await getJson({ 'sb-kind': 'a', limit: String(CHUNK), 'limit-from': String(k * CHUNK) }, `chunk ${k}`);
    save(path, json);
    console.log(`  chunk ${k + 1}/${chunks}: ${json.data?.length ?? 0} rows, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const cometPath = `${raw}/sbdb_c.json`;
  files.push(cometPath);
  if (!existsSync(cometPath)) {
    const json = await getJson({ 'sb-kind': 'c' }, 'comets');
    save(cometPath, json);
    console.log(`  comets: ${json.data.length} rows`);
  }
  return files;
}

export function readChunk(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Run directly: node scripts/asteroids/fetch.mjs [raw folder]
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const raw = process.argv[2] ?? process.env.ASTEROIDS_RAW ?? 'data-raw/asteroids';
  await fetchAll(raw);
}
