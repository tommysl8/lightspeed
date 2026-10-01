// Builds public/data/deepsky/gw-events.json.gz: the compact-binary mergers of the Gravitational-Wave Transient Catalog
// with their masses, distances and how well the sky places them (the format in src/sim/deepsky/format.ts; the method in
// docs/data/deepsky.md).
//
// Sources (all CC BY 4.0; the LIGO, Virgo and KAGRA collaborations, via the Gravitational Wave Open Science Center):
//   The GWOSC event portal's cumulative GWTC list (https://gwosc.org/eventapi/json/GWTC/) and each event's own record:
//   the preferred parameter estimate's source-frame masses, final mass, luminosity distance and effective spin, with
//   their 90 % credible intervals.
//   The sky maps of the parameter-estimation data releases on Zenodo: GWTC-2.1 (doi:10.5281/zenodo.6513631), GWTC-3
//   (doi:10.5281/zenodo.8177023), GWTC-4.1 (doi:10.5281/zenodo.20275769) and GWTC-5.0 (doi:10.5281/zenodo.20348005),
//   multi-order HEALPix maps of each merger's probable direction. GW170817's map is replaced by the place of its
//   kilonova's galaxy, NGC 4993 (OpenNGC), and its area by the catalogue's (GWOSC: 16 deg²).
//
// What is kept of each map: its most probable direction (the pixel of highest probability density), the area of its
// 90 % credible region, and how much of that region lies near the most probable direction (a map in two or more
// patches, as many are, says so on the card). The app draws each merger as a soft region of that area, centred on that
// direction, between the comoving distances of its distance's 90 % interval: where the merger probably was, not a point.
//
// Kept: every event of the list with a parameter estimate (masses and a distance). Its kind follows its masses, as the
// catalogue's papers class them: a component under 3 M☉ counts as a neutron star, one above as a black hole.
//
// Inputs (data-raw/deepsky/gw/, fetched when missing; about 700 MB of maps). Output: public/data/deepsky/gw-events.json.gz;
// its section of docs/data/deepsky-build-log.txt.
//
// Run: node scripts/build-gw-events.mjs

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ensure, round, worldOfRaDec, writeColumns } from './deepsky/common.mjs';
import { say, writeLog } from './deepsky/log.mjs';
import { Cosmology, PLANCK18 } from '../src/physics/cosmology/cosmology.ts';

const RAW = 'data-raw/deepsky/gw';
const LIST = 'https://gwosc.org/eventapi/json/GWTC/';
const MAPS = [
  ['GWTC2p1-PESkyMaps.tar.gz', 'https://zenodo.org/api/records/6513631/files/IGWN-GWTC2p1-v2-PESkyMaps.tar.gz/content'],
  ['GWTC3p0-PESkyLocalizations.tar.gz', 'https://zenodo.org/api/records/8177023/files/IGWN-GWTC3p0-v2-PESkyLocalizations.tar.gz/content'],
  ['GWTC4p1-Archived_Skymaps.tar.gz', 'https://zenodo.org/api/records/20275769/files/IGWN-GWTC4p1-18965dda8_5-Archived_Skymaps.tar.gz/content'],
  ['GWTC5p0-Archived_Skymaps.tar.gz', 'https://zenodo.org/api/records/20348005/files/IGWN-GWTC5p0-29ebe06b7_25-Archived_Skymaps.tar.gz/content'],
];
/** NGC 4993, GW170817's galaxy (OpenNGC: 13h 09m 47.70s, −23° 23′ 02.0″). */
const GW170817_HOST = { ra: 197.44875, dec: -23.38389 };
/** A component lighter than this (M☉) counts as a neutron star, as GWTC-3 and GWTC-4 class mergers. */
const NS_MAX_MSUN = 3;
/** A credible region is "in one patch" when this share of its probability lies within 1.5 radii of its peak. */
const ONE_PATCH = 0.75;

await ensure(`${RAW}/gwtc.json`, LIST);
for (const [file, url] of MAPS) await ensure(`${RAW}/${file}`, url);

const list = JSON.parse(readFileSync(`${RAW}/gwtc.json`, 'utf8')).events;
const events = [];
for (const [key, e] of Object.entries(list)) {
  if (e.mass_1_source === null || e.luminosity_distance === null) continue;
  const path = `${RAW}/events/${key}.json`;
  await ensure(path, e.jsonurl);
  const full = Object.values(JSON.parse(readFileSync(path, 'utf8')).events)[0];
  const pref = Object.entries(full.parameters).find(([, v]) => v.is_preferred && v.pipeline_type === 'pe');
  events.push({ key, e: full, pe: pref ? pref[1] : null, peKey: pref ? pref[0] : '' });
}
say(`run on ${new Date().toISOString().slice(0, 10)}: GWOSC GWTC list, ${Object.keys(list).length} entries, ${events.length} with a parameter estimate`);

// ─── The sky maps ───────────────────────────────────────────────────────────────────────

/**
 * Each regular file of a .tar.gz, by name. Names longer than the header's 100 bytes come in a GNU long-name entry ('L')
 * or a POSIX extended header ('x', its "path" record) just before their file.
 */
function* tarFiles(path) {
  const tar = gunzipSync(readFileSync(path));
  const text = (b) => b.toString('latin1').replace(/\0.*$/s, '');
  let longName = null;
  for (let p = 0; p + 512 <= tar.length; ) {
    const short = text(tar.subarray(p, p + 100));
    if (!short) break;
    const size = parseInt(text(tar.subarray(p + 124, p + 136)).trim(), 8) || 0;
    const type = tar.toString('latin1', p + 156, p + 157);
    const body = tar.subarray(p + 512, p + 512 + size);
    if (type === 'L') longName = text(body);
    else if (type === 'x') longName = (body.toString('utf8').match(/\d+ path=([^\n]*)\n/) ?? [])[1] ?? null;
    else {
      if (type === '0' || type === '\0') yield { name: longName ?? short, data: body };
      longName = null;
    }
    p += 512 + Math.ceil(size / 512) * 512;
  }
}

/** A multi-order sky map (a FITS binary table of UNIQ and PROBDENSITY): its pixels' orders, indices and densities. */
function readMoc(buf) {
  const data = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  const cardsAt = (offset) => {
    const cards = {};
    for (let p = offset; ; p += 80) {
      const card = data.toString('latin1', p, p + 80);
      const k = card.slice(0, 8).trim();
      if (k === 'END') return { cards, end: Math.ceil((p + 80) / 2880) * 2880 };
      if (card[8] === '=') cards[k] = card.slice(10).split('/')[0].trim().replace(/^'|'$/g, '').trim();
    }
  };
  const primary = cardsAt(0);
  const table = cardsAt(primary.end);
  const h = table.cards;
  if (h.ORDERING !== 'NUNIQ') throw new Error(`sky map ordering ${h.ORDERING}`);
  const cols = [];
  let off = 0;
  for (let i = 1; i <= Number(h.TFIELDS); i++) {
    cols.push({ name: h[`TTYPE${i}`], type: h[`TFORM${i}`], off });
    off += h[`TFORM${i}`] === 'K' || h[`TFORM${i}`] === 'D' ? 8 : 4;
  }
  const width = Number(h.NAXIS1);
  const n = Number(h.NAXIS2);
  const uniq = cols.find((c) => c.name === 'UNIQ');
  const prob = cols.find((c) => c.name === 'PROBDENSITY');
  const order = new Uint8Array(n);
  const ipix = new Float64Array(n);
  const dens = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const row = table.end + i * width;
    const u = data.readBigInt64BE(row + uniq.off);
    // UNIQ = 4 · 4^order + ipix.
    let o = 0;
    while (4n << (2n * BigInt(o + 1)) <= u) o++;
    order[i] = o;
    ipix[i] = Number(u - (4n << (2n * BigInt(o))));
    dens[i] = prob.type === 'D' ? data.readDoubleBE(row + prob.off) : data.readFloatBE(row + prob.off);
  }
  return { n, order, ipix, dens };
}

const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
/** Every other bit of x (the nested scheme's interleaved x or y), for x below 2^30 (orders up to 15). */
function compressBits(x) {
  let r = 0;
  for (let b = 0; b < 15; b++) if (x & (1 << (2 * b))) r |= 1 << b;
  return r;
}
/** The direction of nested HEALPix pixel `pix` of order `order` (Górski et al. 2005), as colatitude and longitude (rad). */
function nestToAngle(order, pix) {
  if (order > 15) throw new Error(`HEALPix order ${order}: deeper than this reader handles`);
  const nside = 2 ** order;
  const npface = nside * nside;
  const face = Math.floor(pix / npface);
  const ipf = pix - face * npface;
  const ix = compressBits(ipf);
  const iy = compressBits(Math.floor(ipf / 2));
  const npix = 12 * npface;
  const fact2 = 4 / npix;
  const fact1 = 2 * nside * fact2;
  const jr = JRLL[face] * nside - ix - iy - 1;
  let nr;
  let z;
  let kshift;
  if (jr < nside) {
    nr = jr;
    z = 1 - nr * nr * fact2;
    kshift = 0;
  } else if (jr > 3 * nside) {
    nr = 4 * nside - jr;
    z = nr * nr * fact2 - 1;
    kshift = 0;
  } else {
    nr = nside;
    z = (2 * nside - jr) * fact1;
    kshift = (jr - nside) & 1;
  }
  let jp = (JPLL[face] * nr + ix - iy + 1 + kshift) / 2;
  if (jp > 4 * nside) jp -= 4 * nside;
  if (jp < 1) jp += 4 * nside;
  return { theta: Math.acos(Math.max(-1, Math.min(1, z))), phi: (jp - (kshift + 1) * 0.5) * (Math.PI / 2 / nr) };
}

/** What the app keeps of a map: the peak's direction, the 90 % area and how much of it lies near the peak. */
function mapStats(m) {
  const idx = [...Array(m.n).keys()].sort((a, b) => m.dens[b] - m.dens[a]);
  const area = (i) => (4 * Math.PI) / (12 * 4 ** m.order[i]);
  const dirs = new Float64Array(3 * m.n);
  for (let i = 0; i < m.n; i++) {
    const { theta, phi } = nestToAngle(m.order[i], m.ipix[i]);
    dirs[3 * i] = Math.sin(theta) * Math.cos(phi);
    dirs[3 * i + 1] = Math.sin(theta) * Math.sin(phi);
    dirs[3 * i + 2] = Math.cos(theta);
  }
  let total = 0;
  for (let i = 0; i < m.n; i++) total += m.dens[i] * area(i);
  let cum = 0;
  let sr = 0;
  const region = [];
  for (const i of idx) {
    if (cum >= 0.9 * total) break;
    cum += m.dens[i] * area(i);
    sr += area(i);
    region.push(i);
  }
  const peak = idx[0];
  const radius = Math.sqrt(sr / Math.PI);
  const cosNear = Math.cos(Math.min(Math.PI, 1.5 * radius));
  let near = 0;
  for (const i of region) {
    const c = dirs[3 * i] * dirs[3 * peak] + dirs[3 * i + 1] * dirs[3 * peak + 1] + dirs[3 * i + 2] * dirs[3 * peak + 2];
    if (c >= cosNear) near += m.dens[i] * area(i);
  }
  let ra = (Math.atan2(dirs[3 * peak + 1], dirs[3 * peak]) * 180) / Math.PI;
  if (ra < 0) ra += 360;
  const dec = (Math.asin(dirs[3 * peak + 2]) * 180) / Math.PI;
  return { ra, dec, areaDeg2: sr * (180 / Math.PI) ** 2, onePatch: near / cum, total };
}

/** The maps of every archive, by the event's full name ("GW150914_095045"), each with its waveform model's name. */
const maps = new Map();
for (const [file] of MAPS) {
  for (const f of tarFiles(`${RAW}/${file}`)) {
    const base = f.name.split('/').pop();
    const m = base.match(/(GW\d{6}_\d{6})[_-](?:PEDataRelease_cosmo_reweight_C01:)?(.+?)(?:_Skymap_PEDataRelease)?\.fits(?:\.gz)?$/);
    if (!m) continue;
    const list = maps.get(m[1]) ?? [];
    list.push({ model: m[2], data: f.data, archive: file });
    maps.set(m[1], list);
  }
}
say(`sky maps: ${[...maps.values()].reduce((s, l) => s + l.length, 0)} files for ${maps.size} events`);

// ─── Distances ──────────────────────────────────────────────────────────────────────────

const cosmo = new Cosmology(PLANCK18);
/** The comoving distance (Mpc) of a luminosity distance, in the app's cosmology (Planck 2018): D_C = D_L / (1 + z). */
function comovingOfLuminosity(dl) {
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const z = (lo + hi) / 2;
    if (cosmo.luminosityDistanceMpc(z) < dl) lo = z;
    else hi = z;
  }
  const z = (lo + hi) / 2;
  return { z, dc: dl / (1 + z) };
}

// ─── Assemble ───────────────────────────────────────────────────────────────────────────

const kindOf = (m) => (m < NS_MAX_MSUN ? 'ns' : 'bh');
const rows = [];
const counts = new Map();
const count = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);
for (const { e, pe, peKey } of events) {
  const full = ((pe?.data_url ?? '').match(/(GW\d{6}_\d{6})/) ?? [])[1] ?? (/_\d{6}$/.test(e.commonName) ? e.commonName : null);
  let sky;
  let mapNote;
  if (e.commonName === 'GW170817') {
    sky = { ra: GW170817_HOST.ra, dec: GW170817_HOST.dec, areaDeg2: pe?.sky_area ?? 16, onePatch: 1 };
    mapNote = 'host';
  } else {
    const list = full ? maps.get(full) : undefined;
    if (!list) {
      count('skipped: no sky map');
      continue;
    }
    // The preferred estimate's waveform model, else the mixture of models, else the first.
    const want = (peKey.match(/C0\d:([^_]+?)(?:_OO\d)?(?:_PE)?$/) ?? [])[1]?.replace(/-/g, '_') ?? 'Mixed';
    const pick = list.find((x) => x.model.replace(/-/g, '_') === want) ?? list.find((x) => x.model === 'Mixed') ?? list[0];
    sky = mapStats(readMoc(pick.data));
    if (Math.abs(sky.total - 1) > 0.01) throw new Error(`${e.commonName}: sky map sums to ${sky.total}`);
    mapNote = pick.model;
  }
  const v = (k) => (pe && pe[k] !== undefined && pe[k] !== null ? pe[k] : e[k]);
  const dl = v('luminosity_distance');
  const dlLo = dl + v('luminosity_distance_lower');
  const dlHi = dl + v('luminosity_distance_upper');
  const mid = comovingOfLuminosity(dl);
  const near = comovingOfLuminosity(Math.max(dlLo, 0.1));
  const far = comovingOfLuminosity(dlHi);
  const m1 = v('mass_1_source');
  const m2 = v('mass_2_source');
  const kind = `${kindOf(m1)}${kindOf(m2)}`;
  const u = worldOfRaDec(sky.ra, sky.dec);
  rows.push([
    e.commonName,
    e['catalog.shortName'],
    e.GPS,
    round(m1, 2),
    round(v('mass_1_source_lower'), 2),
    round(v('mass_1_source_upper'), 2),
    round(m2, 2),
    round(v('mass_2_source_lower'), 2),
    round(v('mass_2_source_upper'), 2),
    v('final_mass_source') === null ? null : round(v('final_mass_source'), 1),
    round(dl, 1),
    round(dlLo, 1),
    round(dlHi, 1),
    round(mid.z, 4),
    v('chi_eff') === null ? null : round(v('chi_eff'), 2),
    v('network_matched_filter_snr') === null ? null : round(v('network_matched_filter_snr'), 1),
    e.p_astro ?? null,
    round(sky.ra, 3),
    round(sky.dec, 3),
    round(sky.areaDeg2, 1),
    round(sky.onePatch, 2),
    kind,
    round(mid.dc, 3),
    round(near.dc, 3),
    round(far.dc, 3),
    ...u.map((x) => round(x * mid.dc, 4)),
  ]);
  count(`placed: ${kind === 'bhbh' ? 'black hole + black hole' : kind === 'nsns' ? 'neutron star + neutron star' : 'black hole + neutron star'}`);
}

rows.sort((a, b) => a[2] - b[2]);
say('Placed and skipped:');
for (const [k, n] of [...counts].sort()) say(`  ${k}: ${n}`);
{
  const areas = rows.map((r) => r[19]).sort((a, b) => a - b);
  const split = rows.filter((r) => r[20] < ONE_PATCH).length;
  say(`  90 % sky areas: median ${areas[areas.length >> 1]} deg², from ${areas[0]} to ${areas[areas.length - 1]} deg²; ${split} in two or more patches (under ${ONE_PATCH * 100} % of the region within 1.5 radii of its peak)`);
}
const COLUMNS = ['name', 'catalog', 'gps', 'm1', 'm1Lo', 'm1Hi', 'm2', 'm2Lo', 'm2Hi', 'mFinal', 'dlMpc', 'dlLoMpc', 'dlHiMpc', 'z', 'chiEff', 'snr', 'pAstro', 'raDeg', 'decDeg', 'area90Deg2', 'onePatch', 'kind', 'dcMpc', 'dcLoMpc', 'dcHiMpc', 'x', 'y', 'z3'];
const out = writeColumns(
  'public/data/deepsky/gw-events.json.gz',
  {
    schema: 'lightspeed.gw-events/1',
    credit: 'LIGO Scientific Collaboration, Virgo Collaboration and KAGRA Collaboration, via the Gravitational Wave Open Science Center (gwosc.org): GWTC-2.1, GWTC-3, GWTC-4.1 and GWTC-5.0 parameter-estimation data releases, CC BY 4.0',
    built: new Date().toISOString().slice(0, 10),
    frames: 'world axes (x_ecl, z_ecl, −y_ecl), comoving Mpc from the Sun (Planck 2018); masses source-frame M☉ with 90 % intervals as offsets; distances Mpc',
    onePatch: ONE_PATCH,
    nsMaxMsun: NS_MAX_MSUN,
  },
  COLUMNS,
  rows,
);
say(`wrote public/data/deepsky/gw-events.json.gz: ${rows.length} mergers, ${(out.gz / 1024).toFixed(1)} kB`);
writeLog('build-gw-events.mjs');
