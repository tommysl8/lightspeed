// Builds public/data/stars.bin from the HYG star database v4.4.
//
// Source: HYG Database by David Nash (astronexus), https://codeberg.org/astronexus/hyg
// License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
// The generated stars.bin is a derivative work and is therefore also CC BY-SA 4.0.
//
// Input : data-raw/hyg_v44.csv.gz (not committed; download from the URL above)
// Output: public/data/stars.bin, public/data/star-names.json
//
// stars.bin layout (little-endian Float32, 5 values per star, sorted brightest first):
//   x, y, z   position in parsecs, heliocentric, in the app's world axes
//             (J2000 ecliptic rotated so ecliptic north is +Y: world = (x_ecl, z_ecl, -y_ecl))
//   vmag      apparent visual magnitude
//   bv        B-V colour index (NaN when unknown)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const MAG_LIMIT = 6.5;
const NAME_MAG_LIMIT = 2.6;
// Obliquity of the J2000 ecliptic, 84381.448 arcsec (IAU 1976). Same value JPL uses for
// "ecliptic of J2000.0" and astronomy-engine uses for its EQJ -> ECL rotation.
const EPS = ((84381.448 / 3600) * Math.PI) / 180;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const text = gunzipSync(readFileSync('data-raw/hyg_v44.csv.gz')).toString('utf8');
const lines = text.split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

const stars = [];
for (let li = 1; li < lines.length; li++) {
  const line = lines[li];
  if (!line) continue;
  const f = parseCsvLine(line);
  const id = Number(f[col.id]);
  if (id === 0) continue; // the Sun
  const mag = Number(f[col.mag]);
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
  // HYG x,y,z: parsecs, equatorial J2000 (ICRS-aligned).
  const xq = Number(f[col.x]);
  const yq = Number(f[col.y]);
  const zq = Number(f[col.z]);
  // Equatorial -> ecliptic J2000.
  const xe = xq;
  const ye = yq * COS_E + zq * SIN_E;
  const ze = -yq * SIN_E + zq * COS_E;
  const bvRaw = f[col.ci];
  const bv = bvRaw === '' ? NaN : Number(bvRaw);
  stars.push({
    x: xe,
    y: ze, // world +Y = ecliptic north
    z: -ye,
    mag,
    bv,
    name: f[col.proper] || '',
  });
}

stars.sort((a, b) => a.mag - b.mag);

const buf = new Float32Array(stars.length * 5);
stars.forEach((s, i) => {
  buf.set([s.x, s.y, s.z, s.mag, s.bv], i * 5);
});

const names = [];
stars.forEach((s, i) => {
  if (s.name && s.mag <= NAME_MAG_LIMIT) names.push({ i, name: s.name, mag: +s.mag.toFixed(2) });
});

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/stars.bin', Buffer.from(buf.buffer));
writeFileSync('public/data/star-names.json', JSON.stringify(names));
console.log(`stars.bin: ${stars.length} stars (V <= ${MAG_LIMIT}), ${buf.byteLength} bytes; ${names.length} named`);
