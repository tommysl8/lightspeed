// Builds public/data/moons.json: compact orbit models for 25 planetary moons and for Pluto about the
// Pluto–Charon barycentre, fitted to JPL Horizons state vectors over 1976–2204 (where Horizons has
// data) and precise over 1981-01-01 to 2199-12-31 TDB.
//
//   node scripts/build-moons.mjs                 fetch what is missing, fit everything, write outputs
//   node scripts/build-moons.mjs --only mimas,titan   refit some bodies (others are kept from moons.json)
//   node scripts/build-moons.mjs --jobs 3        number of worker threads (default: cores - 1)
//
// Outputs
//   public/data/moons.json                                     the models (format: staging/phase2/moons.md)
//   staging/phase2/src/sim/__fixtures__/moon-checkpoints.json  independent Horizons checkpoints for tests
//
// Source: JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api), geometric state vectors of
// each moon relative to its centre in the ecliptic J2000 frame, TDB. Satellite ephemerides behind
// Horizons: MAR099 (Mars), JUP365 (Jupiter), SAT441 (Saturn), URA182/URA184 (Uranus), NEP097/NEP105
// (Neptune), PLU060 (Pluto). Laplace-plane poles from JPL's planetary satellite mean elements page
// (https://ssd.jpl.nasa.gov/sats/elem/). NASA/JPL data.
//
// Raw responses are cached (gzipped, one file per request) in data-raw/moons/ and never fetched
// twice; requests are sequential and paced. Delete a cache file to refetch it.
//
// Method (details in staging/phase2/moons.md): the Horizons states are turned into equinoctial
// elements (a, λ, k + ih = e·e^{iϖ}, q + ip = sin(i/2)·e^{iΩ}) in a per-moon reference plane, using
// an effective GM chosen so that the planet's oblateness does not show up as a spurious
// orbital-frequency term. Each element series is then modelled as a polynomial plus quasi-periodic
// terms found by frequency analysis (windowed FFT, golden-section refinement, joint least squares,
// Gauss–Newton frequency polishing). Terms may be phase-modulated by the moon's own mean longitude
// (argument ντ + kΛ), which keeps resonant librations (Mimas–Tethys, Titan–Hyperion) compact and lets
// short-period terms be fitted exactly from samples taken slower than the orbital period; aliases are
// resolved against an independent densely sampled year. A last stage fits small periodic position
// corrections. Accuracy is measured inside the precise window against every fitted sample, the dense
// window and random checkpoints that were not used in the fit. A full run takes about 45 minutes on
// 5 worker threads (Hyperion and Nereid about 20 minutes each).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'moons');
const OUT_JSON = join(ROOT, 'public', 'data', 'moons.json');
const OUT_FIXTURES = join(ROOT, 'staging', 'phase2', 'src', 'sim', '__fixtures__', 'moon-checkpoints.json');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const JD2000 = 2451545.0;
const WIN0 = 2444605.5; // 1981-01-01 00:00 TDB
const WIN1 = 2524593.5; // 2200-01-01 00:00 TDB (end of 2199-12-31)
// Days fitted beyond the precise window on each side, where Horizons has data (fetched as two
// shells). Fitting beyond the window keeps the end effects of the fit out of the window.
const MARGINS = [730, 1826];
const OBLIQUITY = (84381.448 / 3600) * DEG; // IAU 1976, the obliquity Horizons uses for its J2000 ecliptic
const DENSE_START = 2458849.5; // 2020-01-01: start of the independent densely sampled window

// Last epochs Horizons serves for these centres (checked 2026-09): JUP365 to 2200-01-09,
// NEP098 to 2199-12-30, PLU060 to 2199-12-29. The others extend well beyond the window.
const HZ_CORE_END = { 899: 2524591.5, 9: 2524590.5 };
const HZ_LIMIT = { 599: 2524601.0, 899: 2524591.5, 9: 2524590.5 };

const UR_POLE = [257.311, -15.175]; // IAU WGCCRE 2015 Uranus pole (RA, Dec)
const PL_POLE = [132.993, -6.163]; // IAU WGCCRE 2015 Pluto pole

/*
 * Bodies. P: sidereal period (days) used only for sampling and unwrapping; step: sample step of the
 * fitted grid, minutes (chosen from the spectrum of each moon's short-period perturbations);
 * pole: [RA, Dec] of the reference plane's pole (JPL Laplace plane, or the planet's equator), or null
 * for the mean orbit plane (the fit frame uses whichever sign of it makes the orbit prograde);
 * retrograde: the orbit runs against the planet's rotation; opt: fit options.
 */
const BODIES = [
  { id: 'phobos', name: 'Phobos', planet: 'mars', centre: 'mars', hz: 401, c: 499, eph: 'MAR099', P: 0.31891, step: 2887, pole: [317.7, 52.9], ref: 'laplace', sync: true, opt: { lq: true } },
  { id: 'deimos', name: 'Deimos', planet: 'mars', centre: 'mars', hz: 402, c: 499, eph: 'MAR099', P: 1.26244, step: 1009, pole: [316.6, 53.5], ref: 'laplace', sync: true },
  { id: 'io', name: 'Io', planet: 'jupiter', centre: 'jupiter', hz: 501, c: 599, eph: 'JUP365', P: 1.769138, step: 1009, pole: [268.1, 64.5], ref: 'laplace', sync: true },
  { id: 'europa', name: 'Europa', planet: 'jupiter', centre: 'jupiter', hz: 502, c: 599, eph: 'JUP365', P: 3.551181, step: 1009, pole: [268.1, 64.5], ref: 'laplace', sync: true },
  { id: 'ganymede', name: 'Ganymede', planet: 'jupiter', centre: 'jupiter', hz: 503, c: 599, eph: 'JUP365', P: 7.154553, step: 1009, pole: [268.2, 64.6], ref: 'laplace', sync: true },
  { id: 'callisto', name: 'Callisto', planet: 'jupiter', centre: 'jupiter', hz: 504, c: 599, eph: 'JUP365', P: 16.689017, step: 1009, pole: [268.7, 64.8], ref: 'laplace', sync: true },
  { id: 'mimas', name: 'Mimas', planet: 'saturn', centre: 'saturn', hz: 601, c: 699, eph: 'SAT441', P: 0.942422, step: 577, pole: [40.6, 83.5], ref: 'laplace', sync: true },
  { id: 'enceladus', name: 'Enceladus', planet: 'saturn', centre: 'saturn', hz: 602, c: 699, eph: 'SAT441', P: 1.370218, step: 1009, pole: [40.6, 83.5], ref: 'laplace', sync: true },
  { id: 'tethys', name: 'Tethys', planet: 'saturn', centre: 'saturn', hz: 603, c: 699, eph: 'SAT441', P: 1.887802, step: 1009, pole: [40.6, 83.5], ref: 'laplace', sync: true },
  { id: 'dione', name: 'Dione', planet: 'saturn', centre: 'saturn', hz: 604, c: 699, eph: 'SAT441', P: 2.736916, step: 1297, pole: [40.6, 83.5], ref: 'laplace', sync: true },
  { id: 'rhea', name: 'Rhea', planet: 'saturn', centre: 'saturn', hz: 605, c: 699, eph: 'SAT441', P: 4.517503, step: 1297, pole: [40.6, 83.5], ref: 'laplace', sync: true },
  { id: 'titan', name: 'Titan', planet: 'saturn', centre: 'saturn', hz: 606, c: 699, eph: 'SAT441', P: 15.945448, step: 1447, pole: [36.4, 84.0], ref: 'laplace', sync: true },
  { id: 'hyperion', name: 'Hyperion', planet: 'saturn', centre: 'saturn', hz: 607, c: 699, eph: 'SAT441', P: 21.276658, step: 1447, pole: [40.2, 83.6], ref: 'laplace', sync: false,
    opt: { ksReal: [0, 1, 2, 3, 4], ksCplx: [0, 1, -1, 2, -2, 3, -3, 4, -4], maxTerms: 150, thrFrac: 0.008 } },
  { id: 'iapetus', name: 'Iapetus', planet: 'saturn', centre: 'saturn', hz: 608, c: 699, eph: 'SAT441', P: 79.331002, step: 2887, pole: [288.7, 78.9], ref: 'laplace', sync: true },
  { id: 'miranda', name: 'Miranda', planet: 'uranus', centre: 'uranus', hz: 705, c: 799, eph: 'URA184', P: 1.413479, step: 719, pole: UR_POLE, ref: 'equator', sync: true },
  { id: 'ariel', name: 'Ariel', planet: 'uranus', centre: 'uranus', hz: 701, c: 799, eph: 'URA184', P: 2.520379, step: 1009, pole: UR_POLE, ref: 'equator', sync: true },
  { id: 'umbriel', name: 'Umbriel', planet: 'uranus', centre: 'uranus', hz: 702, c: 799, eph: 'URA184', P: 4.144177, step: 1297, pole: UR_POLE, ref: 'equator', sync: true },
  { id: 'titania', name: 'Titania', planet: 'uranus', centre: 'uranus', hz: 703, c: 799, eph: 'URA184', P: 8.705869, step: 1447, pole: UR_POLE, ref: 'equator', sync: true },
  { id: 'oberon', name: 'Oberon', planet: 'uranus', centre: 'uranus', hz: 704, c: 799, eph: 'URA184', P: 13.463237, step: 1447, pole: UR_POLE, ref: 'equator', sync: true },
  { id: 'triton', name: 'Triton', planet: 'neptune', centre: 'neptune', hz: 801, c: 899, eph: 'NEP098', P: 5.876994, step: 2887, pole: [299.8, 43.1], ref: 'laplace', sync: true, retrograde: true },
  { id: 'nereid', name: 'Nereid', planet: 'neptune', centre: 'neptune', hz: 802, c: 899, eph: 'NEP098', P: 360.133, step: 2887, pole: null, ref: 'mean orbit', sync: false,
    opt: { ksReal: [0, 1, 2, 3, 4, 5, 6, 7, 8], ksCplx: [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8], maxTerms: 150, freeZ: false } },
  { id: 'proteus', name: 'Proteus', planet: 'neptune', centre: 'neptune', hz: 808, c: 899, eph: 'NEP098', P: 1.122315, step: 2887, pole: [299.8, 42.6], ref: 'laplace', sync: true },
  { id: 'charon', name: 'Charon', planet: 'pluto', centre: 'pluto-barycenter', hz: 901, c: 9, eph: 'PLU060', P: 6.387222, step: 2887, pole: PL_POLE, ref: 'equator', sync: true },
  { id: 'nix', name: 'Nix', planet: 'pluto', centre: 'pluto-barycenter', hz: 902, c: 9, eph: 'PLU060', P: 24.85, step: 1009, pole: PL_POLE, ref: 'equator', sync: false },
  { id: 'hydra', name: 'Hydra', planet: 'pluto', centre: 'pluto-barycenter', hz: 903, c: 9, eph: 'PLU060', P: 38.2, step: 1009, pole: PL_POLE, ref: 'equator', sync: false },
  { id: 'pluto', name: 'Pluto', planet: 'pluto', centre: 'pluto-barycenter', hz: 999, c: 9, eph: 'PLU060', P: 6.387222, step: 2887, pole: PL_POLE, ref: 'equator', sync: true },
];

// ---------------------------------------------------------------------------------------------
// Horizons access (cached, sequential, paced)
// ---------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
let offline = false;

async function horizonsText(key, params) {
  const file = join(RAW, `${key}.txt.gz`);
  if (existsSync(file)) return gunzipSync(readFileSync(file)).toString('utf8');
  if (offline) throw new Error(`missing cache file ${file} (worker threads never download)`);
  mkdirSync(RAW, { recursive: true });
  const q = {
    format: 'text',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    VEC_LABELS: 'NO',
    CSV_FORMAT: 'YES',
    OUT_UNITS: 'KM-S',
    VEC_CORR: 'NONE',
    OBJ_DATA: 'NO',
    ...params,
  };
  const qs = Object.entries(q)
    .map(([k, v]) => `${k}=${encodeURIComponent(k === 'format' ? v : `'${v}'`)}`)
    .join('&');
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    let text;
    try {
      res = await fetch(`${API}?${qs}`);
      text = await res.text();
    } catch (e) {
      if (attempt < 4) {
        await sleep(10000 * (attempt + 1));
        continue;
      }
      throw e;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      throw new Error(`${key}: HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}\n${text.slice(0, 500)}`);
    if (!text.includes('$$SOE')) throw new Error(`${key}: Horizons returned no data\n${text.slice(0, 800)}`);
    writeFileSync(file, gzipSync(Buffer.from(text, 'utf8'), { level: 9 }));
    console.log(`  fetched ${key}`);
    return text;
  }
}

function parseVectors(text) {
  const a = text.indexOf('$$SOE');
  const b = text.indexOf('$$EOE');
  const lines = text
    .slice(a + 5, b)
    .split('\n')
    .filter((l) => l.trim());
  const n = lines.length;
  const ncol = lines[0].split(',').length - 3;
  const t = new Float64Array(n);
  const cols = Array.from({ length: ncol }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const p = lines[i].split(',');
    t[i] = Number(p[0]);
    for (let c = 0; c < ncol; c++) cols[c][i] = Number(p[2 + c]);
  }
  return { t, cols };
}

function concatVectors(parts) {
  const n = parts.reduce((s, p) => s + p.t.length, 0);
  const t = new Float64Array(n);
  const cols = Array.from({ length: parts[0].cols.length }, () => new Float64Array(n));
  let o = 0;
  for (const p of parts) {
    t.set(p.t, o);
    p.cols.forEach((c, k) => cols[k].set(c, o));
    o += p.t.length;
  }
  return { t, cols };
}

/** State vectors at explicit JD (TDB) epochs, 50 per request. */
async function vectorsList(target, centre, jds, name, table = 2) {
  const out = [];
  for (let i = 0; i < jds.length; i += 50) {
    const chunk = jds.slice(i, i + 50);
    const text = await horizonsText(`L${table}_${target}_${centre}_${name}_${i}`, {
      COMMAND: String(target),
      CENTER: `@${centre}`,
      TLIST: chunk.map((x) => x.toFixed(6)).join("','"),
      TLIST_TYPE: 'JD',
      VEC_TABLE: String(table),
    });
    out.push(parseVectors(text));
  }
  return concatVectors(out);
}

/** Uniform grid jd0 + k·step (integer minutes) up to jd1, in chunks under Horizons' 90 024-line limit. */
async function vectorsRange(target, centre, jd0, jd1, stepMin, table = 2) {
  const stepD = stepMin / 1440;
  const total = Math.floor((jd1 - jd0) / stepD + 1e-9);
  const maxPer = 85000;
  const parts = [];
  for (let k0 = 0; k0 <= total; k0 += maxPer) {
    const k1 = Math.min(total, k0 + maxPer - 1);
    const s = jd0 + k0 * stepD;
    const e = jd0 + k1 * stepD;
    const key = `v${table}_${target}_${centre}_${s.toFixed(5)}_${e.toFixed(5)}_${stepMin}m`;
    const text = await horizonsText(key, {
      COMMAND: String(target),
      CENTER: `@${centre}`,
      START_TIME: `JD${s.toFixed(6)}`,
      STOP_TIME: `JD${e.toFixed(6)}`,
      STEP_SIZE: `${stepMin} m`,
      VEC_TABLE: String(table),
    });
    parts.push(parseVectors(text));
  }
  await fillGaps(parts, stepD, target, centre, stepMin, table);
  return concatVectors(parts);
}

/** Horizons drops the last grid point of a chunk when STOP_TIME rounds down; fetch such points. */
async function fillGaps(parts, stepD, target, centre, stepMin, table) {
  for (let j = 0; j + 1 < parts.length; j++) {
    const last = parts[j].t[parts[j].t.length - 1];
    const next = parts[j + 1].t[0];
    const missing = [];
    for (let x = last + stepD; x < next - 0.5 * stepD; x += stepD) missing.push(x);
    if (missing.length) {
      parts.splice(j + 1, 0, await vectorsList(target, centre, missing, `gap${stepMin}m_${last.toFixed(5)}`, table));
      j++;
    }
  }
}

/** The fitted grid: the precise window plus up to five years either side where Horizons has data. */
async function loadFull(b) {
  const stepD = b.step / 1440;
  const end = Math.min(WIN1, HZ_CORE_END[b.c] ?? WIN1);
  const core = await vectorsRange(b.hz, b.c, WIN0, end, b.step, 2);
  const parts = [core];
  let covered = 0; // steps before WIN0 already fetched
  for (const M of MARGINS) {
    const K = Math.ceil(M / stepD);
    parts.unshift(await vectorsRange(b.hz, b.c, WIN0 - K * stepD, WIN0 - (covered + 1) * stepD, b.step, 2));
    covered = K;
  }
  let last = core.t[core.t.length - 1];
  for (const M of MARGINS) {
    const afterEnd = Math.min(WIN1 + M, HZ_LIMIT[b.c] ?? Infinity);
    if (afterEnd < last + 2 * stepD) continue;
    const p = await vectorsRange(b.hz, b.c, last + stepD, afterEnd, b.step, 2);
    parts.push(p);
    last = p.t[p.t.length - 1];
  }
  await fillGaps(parts, stepD, b.hz, b.c, b.step, 2);
  const d = concatVectors(parts);
  for (let i = 1; i < d.t.length; i++) {
    if (Math.abs(d.t[i] - d.t[i - 1] - stepD) > 1e-5) throw new Error(`${b.id}: grid gap at JD ${d.t[i]}`);
  }
  return { ...d, window: [WIN0, end] };
}

/** Independent dense window: 2020-01-01 onwards, max(1 yr, 24 periods) at P/16. */
function denseSpec(b) {
  const P = Math.abs(b.P);
  return { span: Math.max(365, 24 * P), step: Math.max(1, Math.round((P * 1440) / 16)) };
}
async function loadDense(b) {
  const { span, step } = denseSpec(b);
  return vectorsRange(b.hz, b.c, DENSE_START, DENSE_START + span, step, 2);
}

// Random checkpoints (seeded, reproducible): 64 epochs inside the window plus a few outside.
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const AFTER_EPOCHS = { 499: [2528247.5, 2539204.5, 2557467.5], 699: [2528247.5, 2539204.5], 799: [2528247.5, 2539204.5, 2557467.5] };
function checkpointEpochs(b) {
  const rnd = mulberry32(hashStr(b.id));
  const end = Math.min(WIN1, HZ_CORE_END[b.c] ?? WIN1);
  const inside = [];
  for (let i = 0; i < 64; i++) inside.push(Math.round((WIN0 + rnd() * (end - WIN0)) * 1e5) / 1e5);
  inside.sort((x, y) => x - y);
  const before = [2415020.5, 2426000.5, 2437000.5, 2442000.5, 2444400.5].map((x) => Math.round((x + rnd() * 10) * 1e5) / 1e5);
  const after = (AFTER_EPOCHS[b.c] ?? []).map((x) => Math.round((x + rnd() * 10) * 1e5) / 1e5);
  return { jds: [...inside, ...before, ...after], end };
}
async function loadCheckpoints(b) {
  const { jds, end } = checkpointEpochs(b);
  const v = await vectorsList(b.hz, b.c, jds, 'fixture', 1);
  if (v.t.length !== jds.length) throw new Error(`${b.id}: ${v.t.length} of ${jds.length} checkpoints`);
  const rows = Array.from(v.t, (t, i) => [Number((t - JD2000).toFixed(6)), v.cols[0][i], v.cols[1][i], v.cols[2][i]]);
  return {
    inside: rows.filter((r) => r[0] >= WIN0 - JD2000 && r[0] <= end - JD2000),
    outside: rows.filter((r) => r[0] < WIN0 - JD2000 || r[0] > end - JD2000),
  };
}

/**
 * Independent validation grid: positions every 6007 minutes (4.17 d) over the precise window,
 * starting 0.3137 d after its start, so no epoch falls on a fitted sample (those are whole minutes
 * from the window start). About 19,000 epochs per body; never used by the fit. Its RMS is the
 * out-of-sample RMS reported as accuracy.rmsKm.
 */
const VALID_STEP_MIN = 6007;
const VALID_OFFSET_D = 0.3137;
async function loadValidation(b) {
  const end = Math.min(WIN1, HZ_CORE_END[b.c] ?? WIN1);
  return vectorsRange(b.hz, b.c, WIN0 + VALID_OFFSET_D, end, VALID_STEP_MIN, 1);
}

/** Round up to two significant figures. */
function ceil2(x) {
  if (!(x > 0)) return x;
  const e = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / e - 1e-9) * e).toPrecision(2));
}

/**
 * Out-of-sample statistics on the validation grid, and the final accuracy block:
 *   rmsKm      RMS on the validation grid (out of sample)
 *   fitRmsKm   RMS on the fitted grid (in sample; lower, because the fit sees those epochs)
 *   maxKm      largest error seen on any set (fitted grid, dense window, checkpoints, validation)
 *   boundKm    stated bound: 1.25 × maxKm rounded up to two figures. Not a proof, a margin over
 *              the largest of 60,000–230,000 comparisons per body.
 */
function applyValidation(model, v) {
  let mx = 0;
  let rs = 0;
  let at = 0;
  for (let i = 0; i < v.t.length; i++) {
    const t = v.t[i] - JD2000;
    const p = evalMoon(model, t);
    const e = Math.hypot(p[0] - v.cols[0][i], p[1] - v.cols[1][i], p[2] - v.cols[2][i]);
    rs += e * e;
    if (e > mx) (mx = e), (at = t);
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const A = model.accuracy;
  const fitRms = A.fitRmsKm ?? A.rmsKm;
  const maxKm = r2(Math.max(A.fitMaxKm, A.denseMaxKm, A.checkpointMaxKm, mx));
  model.accuracy = {
    maxKm,
    boundKm: ceil2(1.25 * maxKm),
    rmsKm: r2(Math.sqrt(rs / v.t.length)),
    fitRmsKm: fitRms,
    fitMaxKm: A.fitMaxKm,
    denseMaxKm: A.denseMaxKm,
    checkpointMaxKm: A.checkpointMaxKm,
    validation: { points: v.t.length, stepMinutes: VALID_STEP_MIN, startTdb: r2(v.t[0] - JD2000), maxKm: r2(mx), maxAtTdb: Math.round(at * 100) / 100, rmsKm: r2(Math.sqrt(rs / v.t.length)) },
    targetKm: A.targetKm,
    illustrativeOutsideKm: A.illustrativeOutsideKm,
  };
  return model.accuracy;
}

/** Positions only, every 3001 minutes over the window: the Galilean check of astronomy-engine. */
async function loadGalileanCheck(b) {
  return vectorsRange(b.hz, b.c, WIN0, WIN1, 3001, 1);
}

// ---------------------------------------------------------------------------------------------
// Orbit geometry
// ---------------------------------------------------------------------------------------------

function raDecToEcl(ra, dec) {
  const a = ra * DEG;
  const d = dec * DEG;
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  return [x, y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)];
}

/** Row-major matrix whose columns are the fit-frame axes in ecliptic coordinates (ecl = M·fit). */
function frameFromPole(px, py, pz) {
  const n = Math.hypot(px, py, pz);
  const z = [px / n, py / n, pz / n];
  let x = [-z[1], z[0], 0];
  let xn = Math.hypot(x[0], x[1]);
  if (xn < 1e-12) {
    x = [1, 0, 0];
    xn = 1;
  }
  x = x.map((v) => v / xn);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
const toFit = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const wrapPi = (x) => x - TAU * Math.round(x / TAU);

/** State (km, km/day) → equinoctial elements [a, λ, k, h, q, p]; μ in km³/day². */
function stateToElem(r, v, mu) {
  const [x, y, z] = r;
  const [vx, vy, vz] = v;
  const rn = Math.hypot(x, y, z);
  const v2 = vx * vx + vy * vy + vz * vz;
  const a = 1 / (2 / rn - v2 / mu);
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const hz = x * vy - y * vx;
  const hn = Math.hypot(hx, hy, hz);
  const wx = hx / hn;
  const wy = hy / hn;
  const wz = hz / hn;
  const c = Math.sqrt((1 + wz) / 2);
  const q = -wy / (2 * c);
  const p = wx / (2 * c);
  const f = [1 - 2 * p * p, 2 * q * p, -2 * c * p];
  const g = [2 * q * p, 1 - 2 * q * q, 2 * c * q];
  const ex = (vy * hz - vz * hy) / mu - x / rn;
  const ey = (vz * hx - vx * hz) / mu - y / rn;
  const ez = (vx * hy - vy * hx) / mu - z / rn;
  const k = ex * f[0] + ey * f[1] + ez * f[2];
  const h = ex * g[0] + ey * g[1] + ez * g[2];
  const X = x * f[0] + y * f[1] + z * f[2];
  const Y = x * g[0] + y * g[1] + z * g[2];
  const s = Math.sqrt(1 - h * h - k * k);
  const beta = 1 / (1 + s);
  const cosF = k + ((1 - k * k * beta) * X - h * k * beta * Y) / (a * s);
  const sinF = h + ((1 - h * h * beta) * Y - h * k * beta * X) / (a * s);
  const F = Math.atan2(sinF, cosF);
  return [a, F + h * cosF - k * sinF, k, h, q, p];
}

function framePole(b, d) {
  const H = [0, 0, 0];
  for (let i = 0; i < d.t.length; i++) {
    const r = [d.cols[0][i], d.cols[1][i], d.cols[2][i]];
    const v = [d.cols[3][i], d.cols[4][i], d.cols[5][i]];
    const s = Math.hypot(...r) * Math.hypot(...v);
    H[0] += (r[1] * v[2] - r[2] * v[1]) / s;
    H[1] += (r[2] * v[0] - r[0] * v[2]) / s;
    H[2] += (r[0] * v[1] - r[1] * v[0]) / s;
  }
  const hn = Math.hypot(...H);
  const Hn = H.map((x) => x / hn);
  let pole = b.pole ? raDecToEcl(...b.pole) : Hn;
  const dot = pole[0] * Hn[0] + pole[1] * Hn[1] + pole[2] * Hn[2];
  const flipped = dot < 0;
  if (flipped) pole = pole.map((x) => -x);
  return { pole, flipped, angle: Math.acos(Math.min(1, Math.abs(dot))) / DEG };
}

function elements(d, M, mu, nEst) {
  const n = d.t.length;
  const E = Array.from({ length: 6 }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const r = toFit(M, [d.cols[0][i], d.cols[1][i], d.cols[2][i]]);
    const v = toFit(M, [d.cols[3][i] * 86400, d.cols[4][i] * 86400, d.cols[5][i] * 86400]);
    const el = stateToElem(r, v, mu);
    for (let k = 0; k < 6; k++) E[k][i] = el[k];
    if (i > 0) {
      const pred = E[1][i - 1] + nEst * (d.t[i] - d.t[i - 1]);
      E[1][i] = pred + wrapPi(el[1] - pred);
    }
  }
  return E;
}

/**
 * Effective GM: the value for which the osculating eccentricity vector has no term rotating with
 * the moon (for an oblate planet the point-mass GM gives a spurious e ≈ 1.5 J2 (R/a)²).
 * Estimated on the dense window; also returns the mean motion there.
 */
function calibrateMu(dd, M, P) {
  const n = dd.t.length;
  let rs = 0;
  for (let i = 0; i < n; i++) rs += Math.hypot(dd.cols[0][i], dd.cols[1][i], dd.cols[2][i]);
  rs /= n;
  const nn = TAU / Math.abs(P);
  let mu = nn * nn * rs * rs * rs;
  let E;
  for (let iter = 0; iter < 6; iter++) {
    E = elements(dd, M, mu, nn);
    let cr = 0;
    let ws = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((TAU * i) / (n - 1));
      cr += w * (E[2][i] * Math.cos(E[1][i]) + E[3][i] * Math.sin(E[1][i]));
      ws += w;
    }
    cr /= ws;
    mu /= 1 - cr;
    if (Math.abs(cr) < 1e-12) break;
  }
  const tm = (dd.t[0] + dd.t[n - 1]) / 2;
  let st = 0, sl = 0, stt = 0, stl = 0;
  for (let i = 0; i < n; i++) {
    const t = dd.t[i] - tm;
    st += t; sl += E[1][i]; stt += t * t; stl += t * E[1][i];
  }
  return { mu, n: (n * stl - st * sl) / (n * stt - st * st) };
}

// ---------------------------------------------------------------------------------------------
// Numerics: FFT, Cholesky, quasi-periodic series with modulated terms
// ---------------------------------------------------------------------------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + half] * cr - im[i + j + half] * ci;
        const bi = re[i + j + half] * ci + im[i + j + half] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + half] = ar - br;
        im[i + j + half] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function cholSolve(N, rhs, P) {
  const L = new Float64Array(P * P);
  for (let i = 0; i < P; i++) {
    for (let j = 0; j <= i; j++) {
      let s = N[i * P + j];
      for (let k = 0; k < j; k++) s -= L[i * P + k] * L[j * P + k];
      if (i === j) L[i * P + i] = Math.sqrt(s > 0 ? s : 1e-300);
      else L[i * P + j] = s / L[j * P + j];
    }
  }
  const y = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    let s = rhs[i];
    for (let k = 0; k < i; k++) s -= L[i * P + k] * y[k];
    y[i] = s / L[i * P + i];
  }
  const x = new Float64Array(P);
  for (let i = P - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < P; k++) s -= L[k * P + i] * x[k];
    x[i] = s / L[i * P + i];
  }
  return x;
}

function makeWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = (0.5 - 0.5 * Math.cos((TAU * (i + 0.5)) / n)) ** 2;
  return w;
}

/** Hann²-windowed FFT peaks of a (complex) uniformly sampled signal. */
function spectrumPeaks(re, im, h, win, { numin = 0, numax = Infinity, count = 1, ampFac = 1, positiveOnly = false } = {}) {
  const n = re.length;
  let N2 = 1;
  while (N2 < 2 * n) N2 <<= 1;
  const R = new Float64Array(N2);
  const I = new Float64Array(N2);
  let ws = 0;
  for (let i = 0; i < n; i++) {
    R[i] = re[i] * win[i];
    I[i] = im ? im[i] * win[i] : 0;
    ws += win[i];
  }
  fft(R, I);
  const amp = new Float64Array(N2);
  for (let j = 0; j < N2; j++) amp[j] = (Math.hypot(R[j], I[j]) * ampFac) / ws;
  const bin = TAU / (N2 * h);
  const peaks = [];
  for (let j = 0; j < N2; j++) {
    const jj = j >= N2 / 2 ? j - N2 : j;
    if (positiveOnly && jj < 0) continue;
    const nu = jj * bin;
    if (Math.abs(nu) < numin || Math.abs(nu) > numax) continue;
    const a = amp[j];
    if (a >= amp[(j - 1 + N2) % N2] && a >= amp[(j + 1) % N2]) peaks.push({ nu, amp: a, bin });
  }
  peaks.sort((x, y) => y.amp - x.amp);
  return peaks.slice(0, count);
}

function projection(re, im, tau0, h, win, nu) {
  let cr = Math.cos(nu * tau0);
  let ci = -Math.sin(nu * tau0);
  const dr = Math.cos(nu * h);
  const di = -Math.sin(nu * h);
  let sr = 0;
  let si = 0;
  for (let i = 0; i < re.length; i++) {
    const xr = re[i];
    const xi = im ? im[i] : 0;
    sr += win[i] * (xr * cr - xi * ci);
    si += win[i] * (xr * ci + xi * cr);
    const t = cr * dr - ci * di;
    ci = cr * di + ci * dr;
    cr = t;
    if ((i & 1023) === 1023) {
      const m = Math.hypot(cr, ci);
      cr /= m;
      ci /= m;
    }
  }
  return Math.hypot(sr, si);
}

function refineNu(re, im, tau0, h, win, nu0, dnu) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = nu0 - dnu;
  let b = nu0 + dnu;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = projection(re, im, tau0, h, win, c);
  let fd = projection(re, im, tau0, h, win, d);
  for (let it = 0; it < 60; it++) {
    if (fc > fd) {
      b = d; d = c; fd = fc; c = b - g * (b - a); fc = projection(re, im, tau0, h, win, c);
    } else {
      a = c; c = d; fc = fd; d = a + g * (b - a); fd = projection(re, im, tau0, h, win, d);
    }
  }
  return (a + b) / 2;
}

const theta = (T, t, Li) => T[0] * t + (T[3] ? T[3] * Li : 0);

/** Joint linear least squares for polynomial + term amplitudes (frequencies fixed). */
function jointLsq(tau, yr, yi, deg, terms, tscale, L, stride = 1) {
  const cplx = !!yi;
  const n = tau.length;
  const nt = terms.length;
  const np = deg + 1;
  const P = np * (cplx ? 2 : 1) + 2 * nt;
  const N = new Float64Array(P * P);
  const rhs = new Float64Array(P);
  const b = new Float64Array(P);
  const bi = new Float64Array(P);
  for (let i = 0; i < n; i += stride) {
    const t = tau[i];
    const tp = t / tscale;
    const Li = L ? L[i] : 0;
    if (!cplx) {
      let p = 1;
      for (let k = 0; k < np; k++) { b[k] = p; p *= tp; }
      let o = np;
      for (let j = 0; j < nt; j++) {
        const th = theta(terms[j], t, Li);
        b[o++] = Math.cos(th);
        b[o++] = Math.sin(th);
      }
      const y = yr[i];
      for (let r = 0; r < P; r++) {
        const br = b[r];
        rhs[r] += br * y;
        const row = r * P;
        for (let c = 0; c <= r; c++) N[row + c] += br * b[c];
      }
    } else {
      let p = 1;
      for (let k = 0; k < np; k++) {
        b[2 * k] = p; b[2 * k + 1] = 0; bi[2 * k] = 0; bi[2 * k + 1] = p;
        p *= tp;
      }
      let o = 2 * np;
      for (let j = 0; j < nt; j++) {
        const th = theta(terms[j], t, Li);
        const c = Math.cos(th);
        const s = Math.sin(th);
        b[o] = c; bi[o] = s; o++;
        b[o] = -s; bi[o] = c; o++;
      }
      const y1 = yr[i];
      const y2 = yi[i];
      for (let r = 0; r < P; r++) {
        const br = b[r];
        const bir = bi[r];
        rhs[r] += br * y1 + bir * y2;
        const row = r * P;
        for (let c = 0; c <= r; c++) N[row + c] += br * b[c] + bir * bi[c];
      }
    }
  }
  for (let r = 0; r < P; r++) for (let c = 0; c < r; c++) N[c * P + r] = N[r * P + c];
  const sc = new Float64Array(P);
  for (let r = 0; r < P; r++) sc[r] = N[r * P + r] > 0 ? 1 / Math.sqrt(N[r * P + r]) : 1;
  for (let r = 0; r < P; r++) {
    for (let c = 0; c < P; c++) N[r * P + c] *= sc[r] * sc[c];
    N[r * P + r] += 1e-12;
    rhs[r] *= sc[r];
  }
  const x = cholSolve(N, rhs, P);
  for (let r = 0; r < P; r++) x[r] *= sc[r];
  const out = { poly: [], terms: [] };
  let o = 0;
  for (let k = 0; k < np; k++) {
    const f = tscale ** k;
    if (cplx) { out.poly.push([x[o] / f, x[o + 1] / f]); o += 2; } else { out.poly.push(x[o] / f); o += 1; }
  }
  for (let j = 0; j < nt; j++) {
    out.terms.push([terms[j][0], x[o], x[o + 1], terms[j][3] ?? 0]);
    o += 2;
  }
  return out;
}

function evalSeries(ser, tau, cplx, L) {
  const n = tau.length;
  const re = new Float64Array(n);
  const im = cplx ? new Float64Array(n) : null;
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (const c of ser.poly) {
      if (cplx) { re[i] += c[0] * p; im[i] += c[1] * p; } else re[i] += c * p;
      p *= tau[i];
    }
  }
  for (const T of ser.terms) {
    for (let i = 0; i < n; i++) {
      const th = theta(T, tau[i], L ? L[i] : 0);
      const c = Math.cos(th);
      const s = Math.sin(th);
      if (cplx) { re[i] += T[1] * c - T[2] * s; im[i] += T[1] * s + T[2] * c; } else re[i] += T[1] * c + T[2] * s;
    }
  }
  return { re, im };
}

function solve3(M, v) {
  const a = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < 3; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = a[r][3];
    for (let k = r + 1; k < 3; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

/**
 * Coordinate Gauss–Newton refinement of each term's frequency and amplitude (residual in place).
 * A frequency never moves closer than half a Rayleigh resolution to another term with the same k,
 * nor below numin (for k = 0): such pairs are degenerate and would make the joint fit singular.
 */
function refineFreqs(tau, rr, ri, terms, L, sweeps, numin) {
  const cplx = !!ri;
  const n = tau.length;
  const rayleigh = TAU / (tau[n - 1] - tau[0]);
  const maxStep = 0.25 * rayleigh;
  for (let sw = 0; sw < sweeps; sw++) {
    const order = terms.map((t, j) => [Math.hypot(t[1], t[2]), j]).sort((a, b) => b[0] - a[0]);
    for (const [, j] of order) {
      const T = terms[j];
      const [nu, A, B, k] = T;
      let N11 = 0, N12 = 0, N13 = 0, N22 = 0, N23 = 0, N33 = 0, b1 = 0, b2 = 0, b3 = 0;
      for (let i = 0; i < n; i++) {
        const t = tau[i];
        const th = theta(T, t, L ? L[i] : 0);
        const c = Math.cos(th);
        const s = Math.sin(th);
        if (!cplx) {
          const y = rr[i] + A * c + B * s;
          const g3 = t * (-A * s + B * c);
          N11 += c * c; N12 += c * s; N13 += c * g3; N22 += s * s; N23 += s * g3; N33 += g3 * g3;
          b1 += c * y; b2 += s * y; b3 += g3 * y;
        } else {
          const yr = rr[i] + A * c - B * s;
          const yi = ri[i] + A * s + B * c;
          const g3r = t * (-A * s - B * c);
          const g3i = t * (A * c - B * s);
          N11 += 1; N13 += c * g3r + s * g3i; N22 += 1; N23 += -s * g3r + c * g3i; N33 += g3r * g3r + g3i * g3i;
          b1 += c * yr + s * yi; b2 += -s * yr + c * yi; b3 += g3r * yr + g3i * yi;
        }
      }
      let nA = A;
      let nB = B;
      let dnu = 0;
      if (N33 > 0) {
        const x = solve3([[N11, N12, N13], [N12, N22, N23], [N13, N23, N33]], [b1, b2, b3]);
        if (x.every(Number.isFinite)) [nA, nB, dnu] = x;
        if (Math.abs(dnu) > maxStep) dnu = Math.sign(dnu) * maxStep;
        if (!k && Math.abs(nu + dnu) < numin) dnu = 0;
        if (terms.some((o, jj) => jj !== j && o[3] === k && Math.abs(o[0] - nu - dnu) < 0.5 * rayleigh)) dnu = 0;
      }
      const T2 = [nu + dnu, nA, nB, k];
      for (let i = 0; i < n; i++) {
        const Li = L ? L[i] : 0;
        const th = theta(T, tau[i], Li);
        const th2 = theta(T2, tau[i], Li);
        const c = Math.cos(th), s = Math.sin(th), c2 = Math.cos(th2), s2 = Math.sin(th2);
        if (!cplx) rr[i] += A * c + B * s - (nA * c2 + nB * s2);
        else {
          rr[i] += A * c - B * s - (nA * c2 - nB * s2);
          ri[i] += A * s + B * c - (nA * s2 + nB * c2);
        }
      }
      terms[j] = T2;
    }
  }
}

/**
 * Iterative frequency search on one element series (real: yi = null; complex: yr + i·yi).
 * Terms are [ν, A, B, k] with argument ντ + kΛ. Each step takes the strongest peak of the
 * residual demodulated by e^{-ikΛ} over k ∈ ks, maps it to the alias whose total frequency
 * |ν + k n| is below the grid's Nyquist limit — or to another alias if the independent dense
 * window clearly shows that one — and adds it; frequencies and amplitudes are polished jointly.
 */
function searchSeries(tau, yr, yi, opts) {
  const { deg = 1, scale = 1, thr = 1, maxTerms = 50, h, tscale, refitEvery = 6, init = [], ks = [0], L = null, nLam = 0, dense: D = null } = opts;
  const n = tau.length;
  const rayleigh = TAU / (tau[n - 1] - tau[0]);
  const numin = opts.numin ?? rayleigh; // slower terms are left to the polynomial / free terms
  const numax = opts.numax ?? Infinity;
  const cplx = !!yi;
  const stride = n > 120000 ? 2 : 1;
  const win = makeWindow(n);
  let fit = jointLsq(tau, yr, yi, deg, init, tscale, L, stride);
  const resid = () => {
    const m = evalSeries(fit, tau, cplx, L);
    return [Float64Array.from(yr, (y, i) => y - m.re[i]), cplx ? Float64Array.from(yi, (y, i) => y - m.im[i]) : null];
  };
  let [rr, ri] = resid();
  const polish = (sweeps) => {
    refineFreqs(tau, rr, ri, fit.terms, L, sweeps, numin);
    fit = jointLsq(tau, yr, yi, deg, fit.terms, tscale, L, stride);
    [rr, ri] = resid();
  };
  if (fit.terms.length) polish(3);
  let added = 0;
  const dr = new Float64Array(n);
  const di = new Float64Array(n);
  const Pg = TAU / h;
  let lastPolish = 0;
  while (added < maxTerms) {
    // candidate peaks over all modulation multipliers, strongest first
    const cands = [];
    for (const k of ks) {
      if (k === 0) {
        for (const pk of spectrumPeaks(rr, ri, h, win, { numin, numax, count: 6, ampFac: cplx ? 1 : 2, positiveOnly: !cplx })) cands.push({ ...pk, k, re: rr, im: ri });
      } else {
        for (let i = 0; i < n; i++) {
          const c = Math.cos(k * L[i]);
          const s = -Math.sin(k * L[i]);
          const xr = rr[i];
          const xi = cplx ? ri[i] : 0;
          dr[i] = xr * c - xi * s;
          di[i] = xr * s + xi * c;
        }
        const pks = spectrumPeaks(dr, di, h, win, { numax, count: 6, ampFac: cplx ? 1 : 2 });
        if (pks.length) {
          const re = Float64Array.from(dr);
          const im = Float64Array.from(di);
          for (const pk of pks) cands.push({ ...pk, k, re, im });
        }
      }
    }
    cands.sort((x, y) => y.amp - x.amp);
    if (!cands.length || cands[0].amp * scale < thr) break;
    // take the strongest peak that is not a near-duplicate of an existing term
    let pick = null;
    for (const c of cands) {
      if (c.amp * scale < thr) break;
      let nu0 = c.nu;
      if (c.k !== 0 && nLam) nu0 += Pg * Math.round((-c.k * nLam - nu0) / Pg);
      let nu = refineNu(c.re, c.im, tau[0], h, win, nu0, c.bin);
      if (D) nu = resolveAlias(D, fit, cplx, nu, c.k, nLam, Pg, c.amp);
      const dup = (!c.k && Math.abs(nu) < numin) || fit.terms.some((t) => t[3] === c.k && Math.abs(t[0] - nu) < 0.5 * rayleigh);
      if (!dup) { pick = { nu, k: c.k }; break; }
      if (added - lastPolish >= 3) { polish(1); lastPolish = added; pick = 'retry'; break; }
    }
    if (pick === 'retry') continue;
    if (!pick) break;
    const { nu, k } = pick;
    added++;
    const T = [nu, 0, 0, k];
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const th = theta(T, tau[i], L ? L[i] : 0);
      const c = Math.cos(th);
      const s = Math.sin(th);
      if (cplx) { b1 += rr[i] * c + ri[i] * s; b2 += -rr[i] * s + ri[i] * c; a11 += 1; a22 += 1; } else { a11 += c * c; a12 += c * s; a22 += s * s; b1 += rr[i] * c; b2 += rr[i] * s; }
    }
    const det = a11 * a22 - a12 * a12;
    T[1] = (b1 * a22 - b2 * a12) / det;
    T[2] = (a11 * b2 - a12 * b1) / det;
    fit.terms.push(T);
    for (let i = 0; i < n; i++) {
      const th = theta(T, tau[i], L ? L[i] : 0);
      const c = Math.cos(th);
      const s = Math.sin(th);
      if (cplx) { rr[i] -= T[1] * c - T[2] * s; ri[i] -= T[1] * s + T[2] * c; } else rr[i] -= T[1] * c + T[2] * s;
    }
    if (added % refitEvery === 0) polish(1);
  }
  polish(2);
  return { fit, rr, ri };
}

/** Pick among the aliases ν + j·2π/h the one the dense window actually contains (default j = 0). */
function resolveAlias(D, fit, cplx, nu, k, nLam, Pg, mainAmp) {
  const nD = D.tau.length;
  const m = evalSeries(fit, D.tau, cplx, D.L);
  const dR = Float64Array.from(D.yr, (y, i) => y - m.re[i]);
  const dI = cplx ? Float64Array.from(D.yi, (y, i) => y - m.im[i]) : null;
  const denseAmp = (cand) => {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < nD; i++) {
      const th = cand * D.tau[i] + (k ? k * D.L[i] : 0);
      const c = Math.cos(th);
      const s = Math.sin(th);
      if (cplx) { b1 += dR[i] * c + dI[i] * s; b2 += -dR[i] * s + dI[i] * c; a11 += 1; a22 += 1; } else { a11 += c * c; a12 += c * s; a22 += s * s; b1 += dR[i] * c; b2 += dR[i] * s; }
    }
    const det = a11 * a22 - a12 * a12;
    return Math.hypot((b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det);
  };
  const nyqD = Math.PI / (D.tau[1] - D.tau[0]);
  const spanD = D.tau[nD - 1] - D.tau[0];
  let bestC = null;
  let amp0 = 0;
  for (let j = -40; j <= 40; j++) {
    const cand = nu + j * Pg;
    const tot = cand + k * nLam;
    if (Math.abs(tot) > 0.9 * nyqD) continue;
    if (j !== 0 && (Math.abs(tot) * spanD) / TAU < 2) continue;
    const amp = denseAmp(cand);
    if (j === 0) amp0 = amp;
    if (!bestC || amp > bestC.amp) bestC = { j, amp, cand };
  }
  if (bestC && bestC.j !== 0 && bestC.amp > 0.4 * mainAmp && bestC.amp > 1.5 * amp0) return bestC.cand;
  return nu;
}

/** Best slow complex exponential on a polynomial (the free precession): FFT seeds + grid + golden section. */
function fitFree(tau, yr, yi, deg, tscale, h, stride) {
  const n = tau.length;
  const Tw = tau[n - 1] - tau[0];
  const cost = (nu) => {
    const f = jointLsq(tau, yr, yi, deg, [[nu, 0, 0, 0]], tscale, null, stride);
    const m = evalSeries(f, tau, true, null);
    let s = 0;
    for (let i = 0; i < n; i += stride) s += (yr[i] - m.re[i]) ** 2 + (yi[i] - m.im[i]) ** 2;
    return s;
  };
  let mr = 0;
  let mi = 0;
  for (let i = 0; i < n; i++) { mr += yr[i]; mi += yi[i]; }
  mr /= n;
  mi /= n;
  const dr = Float64Array.from(yr, (x) => x - mr);
  const di = Float64Array.from(yi, (x) => x - mi);
  const win = makeWindow(n);
  const cands = spectrumPeaks(dr, di, h, win, { numin: TAU / Tw, count: 3 }).map((p) => refineNu(dr, di, tau[0], h, win, p.nu, p.bin));
  const slow = TAU / Tw;
  for (let j = -60; j <= 60; j++) if (j) cands.push((j / 60) * 4 * slow);
  const best = cands.map((nu) => [nu, cost(nu)]).sort((x, y) => x[1] - y[1])[0][0];
  const dnu = Math.abs(best) > 4 * slow ? TAU / (4 * Tw) : (4 * slow) / 60;
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = best - dnu;
  let hi = best + dnu;
  let c = hi - g * (hi - lo);
  let d = lo + g * (hi - lo);
  let fc = cost(c);
  let fd = cost(d);
  for (let it = 0; it < 50; it++) {
    if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = cost(c); } else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = cost(d); }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------------------
// Evaluator (mirror of staging/phase2/src/sim/moonModels.ts)
// ---------------------------------------------------------------------------------------------

function taperAt(model, t) {
  const [w0, w1] = model.window;
  const L = model.taper;
  const d = t < w0 ? w0 - t : t > w1 ? t - w1 : 0;
  if (d <= 0) return { w: 1, tc: t - model.epoch };
  const x = d / L;
  const w = x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x));
  const s = x >= 1 ? 0.5 * L : L * (x - 0.5 * x * x);
  return { w, tc: (t < w0 ? w0 - s : w1 + s) - model.epoch };
}
function realSum(terms, tau, Lm) {
  let s = 0;
  for (const T of terms) {
    const a = T[0] * tau + (T[3] ? T[3] * Lm : 0);
    s += T[1] * Math.cos(a) + T[2] * Math.sin(a);
  }
  return s;
}
function cplxSum(terms, tau, Lm, out, wgt) {
  let re = 0;
  let im = 0;
  for (const T of terms) {
    const a = T[0] * tau + (T[3] ? T[3] * Lm : 0);
    const c = Math.cos(a);
    const s = Math.sin(a);
    re += T[1] * c - T[2] * s;
    im += T[1] * s + T[2] * c;
  }
  out[0] += wgt * re;
  out[1] += wgt * im;
}
function moonElements(model, t, secularOnly = false) {
  const tau = t - model.epoch;
  const tp = taperAt(model, t);
  const tc = tp.tc;
  const w = secularOnly ? 0 : tp.w;
  const lp = model.l.p;
  let Lm = lp[1] * tau;
  let pw = tc * tc;
  for (let k = 2; k < lp.length; k++) {
    Lm += lp[k] * (k === 2 && model.l.q ? tau * tau : pw);
    pw *= tc;
  }
  if (w) Lm += w * realSum(model.l.t, tau, 0);
  let lam = lp[0] + Lm;
  if (w) lam += w * realSum(model.l.m, tau, Lm);
  const ap = model.a.p;
  let a = ap[0];
  pw = tc;
  for (let k = 1; k < ap.length; k++) { a += ap[k] * pw; pw *= tc; }
  if (w) a += w * realSum(model.a.m, tau, Lm);
  const z = [0, 0];
  const s = [0, 0];
  for (const [src, out] of [[model.z, z], [model.s, s]]) {
    let pp = 1;
    for (let k = 0; k < src.p.length; k++) { out[0] += src.p[k][0] * pp; out[1] += src.p[k][1] * pp; pp *= tc; }
    cplxSum(src.f, tau, 0, out, 1);
    if (w) cplxSum(src.m, tau, Lm, out, w);
  }
  return { a, lam, k: z[0], h: z[1], q: s[0], p: s[1], w, Lm };
}
function keplerFit(a, lam, k, h, q, p) {
  let F = lam;
  for (let it = 0; it < 50; it++) {
    const sF = Math.sin(F);
    const cF = Math.cos(F);
    const d = (F - k * sF + h * cF - lam) / (1 - k * cF - h * sF);
    F -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  const sF = Math.sin(F);
  const cF = Math.cos(F);
  const beta = 1 / (1 + Math.sqrt(Math.max(0, 1 - h * h - k * k)));
  const X = a * ((1 - h * h * beta) * cF + h * k * beta * sF - k);
  const Y = a * ((1 - k * k * beta) * sF + h * k * beta * cF - h);
  const c = Math.sqrt(Math.max(0, 1 - q * q - p * p));
  return [X * (1 - 2 * p * p) + Y * 2 * q * p, X * 2 * q * p + Y * (1 - 2 * q * q), 2 * c * (Y * q - X * p)];
}
function evalMoonFit(model, t) {
  const el = moonElements(model, t);
  const r = keplerFit(el.a, el.lam, el.k, el.h, el.q, el.p);
  if (el.w) {
    const tau = t - model.epoch;
    const o = [0, 0];
    cplxSum(model.xy, tau, el.Lm, o, el.w);
    r[0] += o[0];
    r[1] += o[1];
    r[2] += el.w * realSum(model.zz, tau, el.Lm);
  }
  return r;
}
function evalMoon(model, t) {
  const r = evalMoonFit(model, t);
  const F = model.frame;
  return [F[0] * r[0] + F[1] * r[1] + F[2] * r[2], F[3] * r[0] + F[4] * r[1] + F[5] * r[2], F[6] * r[0] + F[7] * r[1] + F[8] * r[2]];
}

// ---------------------------------------------------------------------------------------------
// Fitting one body
// ---------------------------------------------------------------------------------------------

// Rounding for the JSON: amplitudes to 1 m equivalent, and each frequency to the digits that keep
// its phase error over ±45 000 days below 1 m equivalent (at most 15 significant digits).
const ROUND_KM = 1e-3;
const roundTo = (x, dec) => Number(x.toFixed(Math.max(0, Math.min(20, dec))));
const decFor = (scale) => Math.ceil(-Math.log10(ROUND_KM / scale));
function fqFor(nu, ampKm) {
  if (!nu) return 0;
  const dnu = ROUND_KM / (Math.max(ampKm, 1e-9) * 45000);
  const digits = Math.min(15, Math.max(6, Math.ceil(Math.log10(Math.abs(nu) / dnu)) + 1));
  return Number(nu.toPrecision(digits));
}

/**
 * Mean orbit for orbit lines and labels, from the secular part of a model at its epoch.
 * Precession periods are given only where they mean something: the free (or resonance-locked)
 * rotation of the pericentre for e ≥ 0.001 and of the node for i ≥ 0.02°, and only when slower
 * than half a year; otherwise 0 (for nearly circular orbits the slowest term in e·e^{iϖ} can be a
 * forced short-period term, e.g. Charon's or Oberon's).
 */
function orbitSummary(model, b) {
  const M = model.frame;
  const zf = model.z.f[0] ?? [0, 0, 0];
  const sf = model.s.f[0] ?? [0, 0, 0];
  const zsec = [model.z.p[0][0] + zf[1], model.z.p[0][1] + zf[2]];
  const ssec = [model.s.p[0][0] + sf[1], model.s.p[0][1] + sf[2]];
  const cq = Math.sqrt(1 - ssec[0] ** 2 - ssec[1] ** 2);
  const wFit = [2 * cq * ssec[1], -2 * cq * ssec[0], 1 - 2 * (ssec[0] ** 2 + ssec[1] ** 2)];
  const rot = (v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const r9 = (v) => v.map((x) => Number(x.toFixed(9)));
  const e = Math.hypot(...zsec);
  const iDeg = (2 * Math.asin(Math.min(1, Math.hypot(...ssec)))) / DEG;
  const years = (nu) => (nu ? TAU / nu / 365.25 : 0);
  const pA = years(zf[0]);
  const pN = years(sf[0]);
  return {
    a: Math.round(model.a.p[0] * 10) / 10,
    e: Number(e.toPrecision(4)),
    i: Number(iDeg.toPrecision(4)),
    period: Number((TAU / model.l.p[1]).toPrecision(10)),
    retrograde: !!b.retrograde,
    normal: r9(rot(wFit)),
    refPole: r9([M[2], M[5], M[8]]),
    refPlane: b.ref,
    apsidalPeriodYears: e >= 1e-3 && Math.abs(pA) >= 0.5 ? Number(pA.toPrecision(5)) : 0,
    nodalPeriodYears: iDeg >= 0.02 && Math.abs(pN) >= 0.5 ? Number(pN.toPrecision(5)) : 0,
  };
}

async function fitBody(b, log) {
  const T0 = Date.now();
  const opt = { thrFrac: 0.004, maxTerms: 100, ksReal: [0, 1, 2], ksCplx: [0, 1, -1, 2, -2], ...(b.opt ?? {}) };
  const d = await loadFull(b);
  const dd = await loadDense(b);
  const ck = await loadCheckpoints(b);
  const fp = framePole(b, d);
  const M = frameFromPole(...fp.pole);
  const cal = calibrateMu(dd, M, b.P);
  const E = elements(d, M, cal.mu, cal.n);
  const n = d.t.length;
  const tmid = Math.round((d.t[0] + d.t[n - 1]) / 2);
  const tau = Float64Array.from(d.t, (t) => t - tmid);
  const tscale = (d.t[n - 1] - d.t[0]) / 2;
  const h = d.t[1] - d.t[0];
  let a = 0;
  for (let i = 0; i < n; i++) a += E[0][i];
  a /= n;
  const target = Math.max(100, 5e-4 * a);
  const thr = opt.thr ?? opt.thrFrac * target;
  const base = { thr, h, tscale, nLam: 0 };
  const maxT = opt.maxTerms;

  // Stage 1: slow part of the mean longitude; Λ = mean longitude − l0 is the modulation argument.
  const S1 = searchSeries(tau, E[1], null, { ...base, deg: 2, scale: a, maxTerms: maxT, numax: 0.2 * cal.n, ks: [0] });
  const l1 = S1.fit.poly[1];
  const Lam = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = l1 * tau[i] + S1.fit.poly[2] * tau[i] * tau[i];
    for (const [nu, A, B] of S1.fit.terms) s += A * Math.cos(nu * tau[i]) + B * Math.sin(nu * tau[i]);
    Lam[i] = s;
  }
  base.nLam = l1;
  // Dense window, in the same frame and with λ unwrapped consistently with the fitted grid.
  const ED = elements(dd, M, cal.mu, cal.n);
  const nD = dd.t.length;
  const tauD = Float64Array.from(dd.t, (t) => t - tmid);
  const s1D = evalSeries(S1.fit, tauD, false, null).re;
  const shift = TAU * Math.round((s1D[0] - ED[1][0]) / TAU);
  for (let i = 0; i < nD; i++) ED[1][i] += shift;
  const LD = Float64Array.from(s1D, (x) => x - S1.fit.poly[0]);
  const dense = (yr, yi) => ({ tau: tauD, yr, yi, L: LD });

  // Stage 2: all element series, with modulated terms.
  const S2 = searchSeries(tau, S1.rr, null, { ...base, deg: -1, scale: a, maxTerms: maxT, ks: opt.ksReal, L: Lam, dense: dense(Float64Array.from(ED[1], (y, i) => y - s1D[i]), null) });
  const A = searchSeries(tau, E[0], null, { ...base, deg: 1, scale: 1, maxTerms: maxT, ks: opt.ksReal, L: Lam, dense: dense(ED[0], null) });
  const stride = Math.max(1, Math.floor(n / 20000));
  // Free precession of the pericentre and node: the dominant slow rotation of k+ih and q+ip,
  // kept (untapered) outside the window. Nereid's apsidal period (~8000 yr) is far longer than the
  // window, so it has none and its eccentricity vector is held fixed outside.
  const nuZ = opt.freeZ === false ? null : fitFree(tau, E[2], E[3], 0, tscale, h, stride);
  const Z = searchSeries(tau, E[2], E[3], { ...base, deg: 0, scale: 2 * a, init: nuZ === null ? [] : [[nuZ, 0, 0, 0]], maxTerms: maxT, ks: opt.ksCplx, L: Lam, dense: dense(ED[2], ED[3]) });
  const nuS = opt.freeS === false ? null : fitFree(tau, E[4], E[5], 0, tscale, h, stride);
  const S = searchSeries(tau, E[4], E[5], { ...base, deg: 0, scale: 2 * a, init: nuS === null ? [] : [[nuS, 0, 0, 0]], maxTerms: maxT, ks: opt.ksCplx, L: Lam, dense: dense(ED[4], ED[5]) });

  const decL = decFor(a);
  const decA = decFor(1);
  const decZ = decFor(2 * a);
  // scale: km per unit of the series (a·δλ, δa, 2a·δe, 2a·δ sin(i/2), or 1 for positions)
  const rows = (terms, dec, scale) => terms.map(([nu, x, y, k]) => [fqFor(nu, Math.hypot(x, y) * scale), roundTo(x, dec), roundTo(y, dec), k]);
  const cblock = (fit, dec, hasFree) => {
    const rest = fit.terms.slice(hasFree ? 1 : 0);
    const f = hasFree ? [fit.terms[0]].map(([nu, x, y]) => [Number(nu.toPrecision(15)), roundTo(x, dec + 2), roundTo(y, dec + 2)]) : [];
    return { p: fit.poly.map((c) => [roundTo(c[0], dec + 4), roundTo(c[1], dec + 4)]), f, m: rows(rest, dec, 2 * a) };
  };
  const model = {
    id: b.id,
    name: b.name,
    planet: b.planet,
    centre: b.centre,
    horizons: { target: b.hz, centre: b.c, ephemeris: b.eph },
    synchronous: b.sync,
    epoch: tmid - JD2000,
    // While fitting, the whole fitted span counts as the window (no fade in the margins); the
    // precise window is set just before the accuracy is measured.
    window: [d.t[0] - JD2000, d.t[n - 1] - JD2000],
    taper: 7305,
    frame: M.map((x) => Number(x.toPrecision(16))),
    mu: Number(cal.mu.toPrecision(12)),
    a: { p: A.fit.poly.map((c) => Number(c.toPrecision(16))), m: rows(A.fit.terms, decA, 1) },
    l: {
      p: S1.fit.poly.map((c) => Number(c.toPrecision(17))),
      t: S1.fit.terms.map(([nu, x, y]) => [fqFor(nu, Math.hypot(x, y) * a), roundTo(x, decL), roundTo(y, decL)]),
      m: rows(S2.fit.terms, decL, a),
      ...(opt.lq ? { q: 1 } : {}),
    },
    z: cblock(Z.fit, decZ, nuZ !== null),
    s: cblock(S.fit, decZ, nuS !== null),
    xy: [],
    zz: [],
  };

  // Stage 3: periodic position corrections in the fit frame.
  const posResid = (dat) => {
    const m = dat.t.length;
    const rx = new Float64Array(m);
    const ry = new Float64Array(m);
    const rz = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const pf = evalMoonFit(model, dat.t[i] - JD2000);
      const r = toFit(M, [dat.cols[0][i], dat.cols[1][i], dat.cols[2][i]]);
      rx[i] = r[0] - pf[0];
      ry[i] = r[1] - pf[1];
      rz[i] = r[2] - pf[2];
    }
    return [rx, ry, rz];
  };
  const [rx, ry, rz] = posResid(d);
  const [dx, dy, dz] = posResid(dd);
  const XY = searchSeries(tau, rx, ry, { ...base, deg: -1, scale: 1, maxTerms: maxT, ks: opt.ksCplx, L: Lam, dense: dense(dx, dy) });
  const ZZ = searchSeries(tau, rz, null, { ...base, deg: -1, scale: 1, maxTerms: maxT, ks: opt.ksReal, L: Lam, dense: dense(dz, null) });
  model.xy = rows(XY.fit.terms, 3, 1);
  model.zz = rows(ZZ.fit.terms, 3, 1);

  // Accuracy, measured with the rounded model exactly as shipped.
  model.window = [d.window[0] - JD2000, d.window[1] - JD2000];
  const stats = (t, x, y, z) => {
    let mx = 0;
    let rs = 0;
    let at = 0;
    for (let i = 0; i < t.length; i++) {
      const p = evalMoon(model, t[i]);
      const e = Math.hypot(p[0] - x[i], p[1] - y[i], p[2] - z[i]);
      rs += e * e;
      if (e > mx) { mx = e; at = t[i]; }
    }
    return { max: mx, rms: Math.sqrt(rs / t.length), at };
  };
  const inWin = [];
  for (let i = 0; i < n; i++) if (d.t[i] >= d.window[0] && d.t[i] <= d.window[1]) inWin.push(i);
  const pick = (arr) => inWin.map((i) => arr[i]);
  const sFit = stats(pick(d.t).map((t) => t - JD2000), pick(d.cols[0]), pick(d.cols[1]), pick(d.cols[2]));
  const sDense = stats(Float64Array.from(dd.t, (t) => t - JD2000), ...dd.cols.slice(0, 3));
  const cki = ck.inside;
  const sCk = stats(cki.map((r) => r[0]), cki.map((r) => r[1]), cki.map((r) => r[2]), cki.map((r) => r[3]));
  const outside = ck.outside.map(([t, x, y, z]) => {
    const p = evalMoon(model, t);
    return { tdb: t, errKm: Math.round(Math.hypot(p[0] - x, p[1] - y, p[2] - z)) };
  });

  model.orbit = orbitSummary(model, b);
  const r2 = (x) => Math.round(x * 100) / 100;
  model.accuracy = {
    maxKm: r2(Math.max(sFit.max, sDense.max, sCk.max)),
    fitRmsKm: r2(sFit.rms),
    fitMaxKm: r2(sFit.max),
    denseMaxKm: r2(sDense.max),
    checkpointMaxKm: r2(sCk.max),
    targetKm: r2(target),
    illustrativeOutsideKm: outside,
  };
  const nTerms = model.l.t.length + model.l.m.length + model.a.m.length + model.z.m.length + model.s.m.length + model.xy.length + model.zz.length + 2;
  model.source = `JPL Horizons ${b.eph}, ${b.hz} relative to @${b.c}; ${nTerms} periodic terms`;
  log(
    `${b.id.padEnd(9)} max ${model.accuracy.maxKm.toFixed(1).padStart(7)} km (fit ${sFit.max.toFixed(1)}, dense ${sDense.max.toFixed(1)}, checkpoints ${sCk.max.toFixed(1)}), in-sample rms ${sFit.rms.toFixed(1)}, target ${target.toFixed(0)}; ${nTerms} terms, ${JSON.stringify(model).length} B, ${((Date.now() - T0) / 1000).toFixed(0)} s`,
  );
  return { model, checkpoints: { horizons: { target: b.hz, centre: b.c }, inside: ck.inside, outside: ck.outside } };
}

// ---------------------------------------------------------------------------------------------
// Main / workers
// ---------------------------------------------------------------------------------------------

async function galileanReport() {
  let A;
  try {
    A = await import(pathToFileURL(join(ROOT, 'node_modules', 'astronomy-engine', 'esm', 'astronomy.js')).href);
  } catch {
    return null;
  }
  const AU = 149597870.7;
  const rot = A.Rotation_EQJ_ECL();
  const out = {};
  for (const b of BODIES.filter((x) => x.planet === 'jupiter')) {
    const d = await loadGalileanCheck(b);
    let mx = 0;
    let rs = 0;
    for (let i = 0; i < d.t.length; i++) {
      const t = A.AstroTime.FromTerrestrialTime(d.t[i] - JD2000);
      const s = A.JupiterMoons(t)[b.id];
      const v = A.RotateVector(rot, new A.Vector(s.x, s.y, s.z, t));
      const e = Math.hypot(v.x * AU - d.cols[0][i], v.y * AU - d.cols[1][i], v.z * AU - d.cols[2][i]);
      mx = Math.max(mx, e);
      rs += e * e;
    }
    out[b.id] = { maxKm: Math.round(mx), rmsKm: Math.round(Math.sqrt(rs / d.t.length)), samples: d.t.length };
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.indexOf('--only');
  const only = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
  const jobsArg = args.indexOf('--jobs');
  const jobs = jobsArg >= 0 ? Number(args[jobsArg + 1]) : Math.max(1, availableParallelism() - 1);
  const todo = BODIES.filter((b) => !only || only.includes(b.id));

  // --validate-only: re-measure the shipped models on the validation grid, without refitting.
  if (args.includes('--validate-only')) {
    const catalog = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
    console.log('body         max km  bound km  rms km (out of sample)  fit rms km  validation max km  points');
    for (const m of catalog.moons) {
      const b = BODIES.find((x) => x.id === m.id);
      if (!todo.includes(b)) continue;
      const A = applyValidation(m, await loadValidation(b));
      console.log(`${m.id.padEnd(10)} ${A.maxKm.toFixed(2).padStart(8)} ${String(A.boundKm).padStart(9)} ${A.rmsKm.toFixed(2).padStart(23)} ${A.fitRmsKm.toFixed(2).padStart(11)} ${A.validation.maxKm.toFixed(2).padStart(18)} ${String(A.validation.points).padStart(7)}`);
    }
    writeFileSync(OUT_JSON, JSON.stringify(catalog));
    console.log(`\nUpdated the accuracy blocks in ${OUT_JSON}`);
    return;
  }

  // 1. Make sure everything is cached (sequential requests), before any worker starts.
  console.log('Checking the Horizons cache ...');
  for (const b of todo) {
    await loadFull(b);
    await loadDense(b);
    await loadCheckpoints(b);
    await loadValidation(b);
    if (b.planet === 'jupiter') await loadGalileanCheck(b);
  }

  // 2. Fit in worker threads.
  console.log(`Fitting ${todo.length} bodies with ${jobs} worker(s) ...`);
  const results = {};
  const queue = [...todo].sort((x, y) => (y.opt?.maxTerms ?? 0) - (x.opt?.maxTerms ?? 0));
  await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) {
        const b = queue.shift();
        results[b.id] = await new Promise((res, rej) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { id: b.id } });
          w.on('message', (m) => (m.log ? console.log(m.log) : res(m.result)));
          w.on('error', rej);
          w.on('exit', (code) => code && rej(new Error(`${b.id}: worker exit ${code}`)));
        });
      }
    }),
  );

  // 3. Merge with the existing file when refitting a subset.
  let previous = {};
  if (only && existsSync(OUT_JSON)) for (const m of JSON.parse(readFileSync(OUT_JSON, 'utf8')).moons) previous[m.id] = m;
  const moons = BODIES.map((b) => results[b.id]?.model ?? previous[b.id]).filter(Boolean);
  for (const m of moons) m.orbit = orbitSummary(m, BODIES.find((b) => b.id === m.id));
  for (const b of todo) applyValidation(results[b.id].model, await loadValidation(b));
  const galilean = await galileanReport();
  const catalog = {
    format: 'lightspeed-moons/1',
    description: 'Fitted orbit models for planetary moons: position relative to the centre body. See staging/phase2/moons.md.',
    frame: 'Ecliptic and mean equinox of J2000 (ICRF axes; IAU 1976 obliquity 84381.448"), km',
    time: 'TDB days since J2000.0 (JD 2451545.0 TDB)',
    preciseWindow: 'Each model is precise inside its `window`: 1981-01-01 to 2200-01-01 TDB (to 2199-12-30 for Neptune and 2199-12-29 for the Pluto system, where the Horizons ephemerides end). Outside it the model fades to the mean precessing orbit (illustrative).',
    source: 'JPL Horizons (https://ssd.jpl.nasa.gov/horizons/) satellite ephemerides MAR099, JUP365, SAT441, URA184, NEP098, PLU060; Laplace planes from https://ssd.jpl.nasa.gov/sats/elem/. NASA/JPL.',
    astronomyEngineJupiterMoons: galilean,
    moons,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(catalog));

  // 4. Test fixtures: independent checkpoints (never used by the fit).
  let fixtures = { bodies: {} };
  if (only && existsSync(OUT_FIXTURES)) fixtures = JSON.parse(readFileSync(OUT_FIXTURES, 'utf8'));
  for (const b of todo) fixtures.bodies[b.id] = results[b.id].checkpoints;
  fixtures.description = 'Independent JPL Horizons checkpoints for the moon models: random epochs inside the precise window (64 per body) and a few outside it.';
  fixtures.source = 'JPL Horizons API, geometric positions (VEC_TABLE=1), ecliptic J2000 (ICRF), km, relative to the Horizons centre given per body';
  fixtures.time = 'TDB days since J2000.0';
  mkdirSync(dirname(OUT_FIXTURES), { recursive: true });
  writeFileSync(OUT_FIXTURES, JSON.stringify(fixtures));

  const size = readFileSync(OUT_JSON).length;
  console.log(`\nWrote ${OUT_JSON} (${(size / 1024).toFixed(1)} KB) and ${OUT_FIXTURES}`);
  console.log('\nbody       max km  bound km  target km  checkpoints km  rms km (out of sample)  fit rms km');
  for (const m of moons) {
    const A = m.accuracy;
    console.log(`${m.id.padEnd(10)} ${A.maxKm.toFixed(1).padStart(7)} ${String(A.boundKm).padStart(9)} ${A.targetKm.toFixed(0).padStart(10)} ${A.checkpointMaxKm.toFixed(1).padStart(14)} ${A.rmsKm.toFixed(1).padStart(23)} ${A.fitRmsKm.toFixed(1).padStart(11)}`);
  }
  if (galilean) {
    console.log('\nastronomy-engine JupiterMoons() vs Horizons, 1981-2199:');
    for (const [id, g] of Object.entries(galilean)) console.log(`  ${id.padEnd(9)} max ${g.maxKm} km, rms ${g.rmsKm} km`);
  }
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  offline = true;
  const b = BODIES.find((x) => x.id === workerData.id);
  fitBody(b, (s) => parentPort.postMessage({ log: s })).then((result) => parentPort.postMessage({ result }));
}
