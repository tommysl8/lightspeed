// Shared by the deep-sky build scripts (scripts/build-ngc.mjs, build-pulsars.mjs, build-snrs.mjs, build-gw-events.mjs):
// fetching raw files once, the sky's frames, and writing the column files the app reads (src/sim/deepsky/format.ts).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

export const DEG = Math.PI / 180;

/** Fetch `url` to `path` unless it is there already (raw downloads are kept in data-raw/, never re-fetched). */
export async function ensure(path, url, init) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

// IAU galactic frame in ICRS (Hipparcos, ESA 1997 SP-1200 vol. 1 sec. 1.5.3); rows are the galactic axes. The same
// matrix as scripts/build-clusters.mjs and src/sim/galaxy/frames.ts.
const A_G = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

export function unitRaDec(raDeg, decDeg) {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/** Galactic longitude and latitude (deg) and the galactic unit vector of an ICRS direction. */
export function galactic(raDeg, decDeg) {
  const v = unitRaDec(raDeg, decDeg);
  const g = A_G.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  let l = Math.atan2(g[1], g[0]) / DEG;
  if (l < 0) l += 360;
  return { l, b: Math.asin(Math.max(-1, Math.min(1, g[2]))) / DEG, u: g };
}

/** ICRS right ascension and declination (deg) of galactic l, b (deg). */
export function icrsOfGalactic(lDeg, bDeg) {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  // A_G is orthogonal: its transpose takes galactic to ICRS.
  const v = [0, 1, 2].map((k) => A_G[0][k] * g[0] + A_G[1][k] * g[1] + A_G[2][k] * g[2]);
  let ra = Math.atan2(v[1], v[0]) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG };
}

/** Mean obliquity of the J2000 ecliptic (IAU 1976), as src/sim/surveys/format.ts. */
const EPS = ((84_381.448 / 3600) * Math.PI) / 180;
const CE = Math.cos(EPS);
const SE = Math.sin(EPS);

/** The app's world axes, world = (x_ecl, z_ecl, −y_ecl), of an ICRS direction (deg). */
export function worldOfRaDec(raDeg, decDeg) {
  const [x, y, z] = unitRaDec(raDeg, decDeg);
  return [x, -SE * y + CE * z, -(CE * y + SE * z)];
}

/** ICRS right ascension and declination (deg) of a world-axes vector. */
export function raDecOfWorld(w) {
  // world → ecliptic (x, −z, y) → equatorial.
  const xe = w[0];
  const ye = -w[2];
  const ze = w[1];
  const x = xe;
  const y = CE * ye - SE * ze;
  const z = SE * ye + CE * ze;
  const r = Math.hypot(x, y, z);
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(z / r) / DEG, r };
}

/** Angle between two ICRS directions, arcsec. */
export function separationArcsec(ra1, dec1, ra2, dec2) {
  const a = unitRaDec(ra1, dec1);
  const b = unitRaDec(ra2, dec2);
  const c = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
  return (Math.atan2(c, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / DEG) * 3600;
}

/** "12:34:56.7" → degrees (hours × 15 when `hours`). */
export function sexagesimal(s, hours) {
  const t = s.trim();
  if (!t) return NaN;
  const sign = t.startsWith('-') ? -1 : 1;
  const [a, b = '0', c = '0'] = t.replace(/^[+-]/, '').split(':');
  const v = Number(a) + Number(b) / 60 + Number(c) / 3600;
  return sign * v * (hours ? 15 : 1);
}

/** A number rounded to `n` decimals (null for anything not finite: JSON has no NaN). */
export const round = (x, n) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

/** Write a column file: { meta, columns, rows } as gzipped JSON, the rows' values in the columns' order. */
export function writeColumns(path, meta, columns, rows) {
  for (const r of rows) if (r.length !== columns.length) throw new Error(`${path}: a row has ${r.length} values for ${columns.length} columns`);
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  const json = JSON.stringify({ meta, columns, rows });
  const gz = gzipSync(Buffer.from(json), { level: 9 });
  writeFileSync(path, gz);
  return { raw: json.length, gz: gz.length };
}

/** "NGC0224" → "NGC 224", "IC0700 NED02" → "IC 700 NED02". */
export function ngcDesignation(name) {
  const m = name.match(/^(NGC|IC)0*(\d+)([A-Z]?)(?:\s+(.*))?$/);
  if (!m) return name;
  return `${m[1]} ${m[2]}${m[3]}${m[4] ? ` ${m[4]}` : ''}`;
}

/** A designation tidied for comparison: no spaces, no leading zeros in numbers, upper case ("NGC  7293" = "ngc7293"). */
export const designationKey = (s) =>
  s
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/(^|[^0-9])0+(?=\d)/g, '$1');
