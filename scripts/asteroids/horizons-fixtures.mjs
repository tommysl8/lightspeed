// Fetches the check positions for the small-body layer's accuracy test (src/sim/asteroids/conic.test.ts): each test
// body's SBDB elements (from the raw chunks the build reads) and its heliocentric position from JPL Horizons, which
// integrates the same orbit solution with the planets, the big asteroids and (for comets) the solution's
// non-gravitational forces, at times from 30 years before its epoch to 30 years after.
//
// Run: node scripts/asteroids/horizons-fixtures.mjs [raw folder]   (the raw folder as for build-asteroids.mjs)
// Output: src/sim/asteroids/__fixtures__/horizons.json

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAW = process.argv[2] ?? process.env.ASTEROIDS_RAW ?? 'data-raw/asteroids';
const OUT = 'src/sim/asteroids/__fixtures__/horizons.json';
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/** [SBDB full name, Horizons command, what it stands for]. */
const BODIES = [
  ['2 Pallas (A802 FA)', '2;', 'main belt, inclined'],
  ['10 Hygiea (A849 GA)', '10;', 'outer main belt'],
  ['153 Hilda (A875 VC)', '153;', 'Hilda, 3:2 with Jupiter'],
  ['433 Eros (A898 PA)', '433;', 'near-Earth (Amor)'],
  ['3200 Phaethon (1983 TB)', '3200;', 'near-Earth, e = 0.89'],
  ['99942 Apophis (2004 MN4)', '99942;', 'near-Earth, passes Earth in 2029'],
  ['624 Hektor (A907 CF)', '624;', 'Jupiter Trojan'],
  ['2060 Chiron (1977 UB)', '2060;', 'Centaur'],
  ['28978 Ixion (2001 KX76)', '28978;', 'plutino'],
  ['15760 Albion (1992 QB1)', '15760;', 'classical Kuiper belt'],
  ['12P/Pons-Brooks', 'DES=12P;CAP', 'Halley-type comet'],
  ['29P/Schwassmann-Wachmann 1', 'DES=29P;CAP', 'Jupiter-family comet'],
  ['C/2020 F3 (NEOWISE)', 'DES=2020 F3;CAP', 'long-period comet, e = 0.9992'],
  ['C/2023 A3 (Tsuchinshan-ATLAS)', 'DES=2023 A3;CAP', 'hyperbolic comet, e = 1.0001'],
  ['C/2017 K2 (PANSTARRS)', 'DES=2017 K2;CAP', 'hyperbolic comet, e = 1.0006'],
  ['C/1980 E1 (Bowell)', 'DES=1980 E1;CAP', 'hyperbolic comet, e = 1.058, thrown out by Jupiter'],
];
const OFFSETS_YR = [-30, -20, -10, -5, -1, 0, 1, 5, 10, 20, 30];

const FIELDS = ['full_name', 'prefix', 'a', 'q', 'e', 'i', 'om', 'w', 'ma', 'tp', 'epoch', 'class', 'H', 'M1', 'K1'];

const rows = new Map();
for (const f of readdirSync(RAW).filter((f) => /^sbdb_.*\.json$/.test(f))) {
  const j = JSON.parse(readFileSync(`${RAW}/${f}`, 'utf8'));
  const ix = Object.fromEntries(j.fields.map((x, i) => [x, i]));
  for (const r of j.data) {
    const name = r[ix.full_name].trim();
    if (BODIES.some((b) => b[0] === name)) rows.set(name, Object.fromEntries(FIELDS.map((k) => [k, r[ix[k]]])));
  }
}

async function vectors(command, jds) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@10'",
    TLIST_TYPE: 'JD',
    TIME_TYPE: 'TDB',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    VEC_TABLE: '1',
    OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES',
    OBJ_DATA: 'NO',
  });
  const url = `${API}?${params}&TLIST=${jds.map((t) => `'${t}'`).join(',')}`;
  const res = await fetch(url);
  const j = await res.json();
  const text = j.result ?? '';
  const m = text.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
  if (!m) return { error: (text.match(/No ephemeris[^\n]*|Cannot[^\n]*|ERROR[^\n]*/) ?? [text.slice(0, 200)])[0] };
  const solution = (text.match(/Target body name:[^\n]*\{source: ([^}]+)\}/) ?? [])[1] ?? null;
  const out = [];
  for (const line of m[1].trim().split('\n')) {
    const c = line.split(',').map((s) => s.trim());
    const row = { jd: Number(c[0]), x: Number(c[2]), y: Number(c[3]), z: Number(c[4]) };
    // A date outside the solution's span comes back as NaN (and spoils the whole list): the caller asks again one by one.
    if (![row.x, row.y, row.z].every(Number.isFinite)) return { error: 'NaN outside the span' };
    out.push(row);
  }
  return { solution, out };
}

const fixtures = [];
for (const [name, command, note] of BODIES) {
  const el = rows.get(name);
  if (!el) {
    console.log(`${name}: not in the raw chunks`);
    continue;
  }
  const epoch = Number(el.epoch);
  const jds = OFFSETS_YR.map((y) => epoch + Math.round(y * 365.25));
  let got = await vectors(command, jds);
  if (got.error) {
    // Some solutions are refused at dates outside their span: ask one date at a time and keep what comes.
    const out = [];
    let solution = null;
    for (const jd of jds) {
      const one = await vectors(command, [jd]);
      if (one.out) {
        out.push(...one.out);
        solution = one.solution;
      }
    }
    got = { solution, out };
  }
  console.log(`${name}: ${got.out.length} positions (${got.solution})`);
  fixtures.push({ name, note, horizons: command, solution: got.solution, elements: el, positions: got.out });
}

mkdirSync('src/sim/asteroids/__fixtures__', { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'JPL Horizons API (heliocentric, ecliptic of J2000, au, TDB) and the JPL SBDB elements of the same solution',
      fetched: new Date().toISOString().slice(0, 10),
      bodies: fixtures,
    },
    null,
    1,
  ) + '\n',
);
console.log(`wrote ${OUT}`);
