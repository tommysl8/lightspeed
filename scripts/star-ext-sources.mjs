// Inputs of the star catalogue's extension (scripts/build-stars3d-ext.mjs): where each comes from, how it is
// fetched (only with --fetch, only when missing, resumable), and readers. All cached in data-raw/ (not
// redistributed). docs/data/stars.md §12 lists them with their licences and checksums.
//
//   athyg_40.csv.gz                    AT-HYG v4.0, the whole catalogue (astronexus, CC BY-SA 4.0), Codeberg LFS
//   gcns_table1c.dat.gz                Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021), CDS J/A+A/649/A6
//   reyle2021_tablea1.dat.gz           The 10 parsec sample (Reylé et al. 2021, update of 2023), CDS J/A+A/650/A201
//   zari2021_filtered.dat.gz           Luminous hot stars, filtered sample (Zari et al. 2021), CDS J/A+A/650/A112
//   hr23_members_1kpc.csv.gz           Open-cluster members, P >= 0.7, clusters within 1 kpc (Hunt & Reffert 2023),
//                                      VizieR J/A+A/673/A114 (TAP query below)
//   gaia_dr3_luminous.csv.gz           Gaia DR3 stars with M_G < 0 within 5 kpc, or M_G < -1 with parallax/error >= 10
//                                      within 8 kpc (parallax/error >= 5, RUWE < 1.4), fetched in 48 slices of the sky
//   gaia_dr3_ext_columns.csv.gz        Gaia DR3 columns for every other new star (AT-HYG, GCNS, 10 pc, Zari, clusters,
//                                      exoplanet hosts, Gaia BH companions), IN lists of 5,000 ids
//   gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz   (cached by the exoplanet build) the hosts' Gaia DR3 ids

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';

export const EXT_GAIA_COLUMNS =
  'source_id, ra, dec, parallax, parallax_error, pmra, pmdec, radial_velocity, radial_velocity_error, grvs_mag, ' +
  'rv_template_teff, ruwe, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, nu_eff_used_in_astrometry, ' +
  'pseudocolour, ecl_lat, astrometric_params_solved';

/** Gaia DR3 source ids of the visible companions of Gaia BH1, BH2 and BH3 (El-Badry et al. 2023a, b; Gaia Collaboration, Panuzzo et al. 2024). */
export const GAIA_BH_COMPANIONS = [
  ['gaia-bh1', '4373465352415301632'],
  ['gaia-bh2', '5870569352746779008'],
  ['gaia-bh3', '4318465066420528000'],
];

const GAIA_TAP = 'https://gea.esac.esa.int/tap-server/tap';
const VIZIER_TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function syncTap(endpoint, query, maxrec = 500000) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 240000);
      const r = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: String(maxrec), QUERY: query }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (t.startsWith('<')) throw new Error(t.slice(0, 300));
      return t;
    } catch (e) {
      console.warn(`  retry ${attempt + 1}: ${String(e.message).slice(0, 200)}`);
      await sleep(5000 * (attempt + 1));
    }
  }
  throw new Error('TAP query failed');
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

export function readCsvText(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((s) => s.replace(/^"|"$/g, ''));
  return { header, rows: lines.slice(1) };
}
/** A Gaia-style CSV (no quoted commas) as a map source_id -> row object. */
export function readGaiaCsv(file) {
  const { header, rows } = readCsvText(gunzipSync(readFileSync(file)).toString());
  const out = new Map();
  for (const l of rows) {
    const f = l.split(',');
    const o = {};
    header.forEach((h, k) => (o[h] = f[k] ?? ''));
    out.set(o.source_id, o);
  }
  return out;
}

// --- fixed-width CDS readers ------------------------------------------------------------------------------------
const cut = (l, a, b) => l.slice(a - 1, b).trim();
export function readGcns(file) {
  return gunzipSync(readFileSync(file))
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => ({
      source_id: cut(l, 3, 21),
      ra: cut(l, 23, 36),
      dec: cut(l, 46, 59),
      parallax: cut(l, 69, 77),
      parallax_error: cut(l, 79, 85),
      pmra: cut(l, 87, 95),
      pmdec: cut(l, 105, 113),
      phot_g_mean_mag: cut(l, 123, 130),
      phot_bp_mean_mag: cut(l, 142, 149),
      phot_rp_mean_mag: cut(l, 161, 168),
      ruwe: cut(l, 189, 193),
      adoptedrv: cut(l, 199, 206),
      wd_prob: cut(l, 246, 250),
      dist_50: cut(l, 278, 289),
      jmag: cut(l, 629, 635),
      ksmag: cut(l, 661, 667),
    }));
}
export function readReyle(file) {
  const num = (s) => (s === '' || s === '---' ? NaN : Number(s));
  return gunzipSync(readFileSync(file))
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => ({
      seq: cut(l, 1, 4),
      system: cut(l, 11, 39),
      type: cut(l, 41, 46),
      name: cut(l, 48, 76),
      ra: num(cut(l, 79, 91)),
      dec: num(cut(l, 94, 106)),
      epoch: num(cut(l, 108, 113)),
      plx: num(cut(l, 115, 122)),
      e_plx: num(cut(l, 124, 131)),
      pmra: num(cut(l, 165, 180)),
      pmdec: num(cut(l, 199, 214)),
      rv: num(cut(l, 264, 271)),
      spt: cut(l, 302, 309),
      gmag: num(cut(l, 353, 361)),
      gest: num(cut(l, 363, 368)),
      bp: num(cut(l, 370, 378)),
      rp: num(cut(l, 380, 388)),
      vmag: num(cut(l, 406, 412)),
      jmag: num(cut(l, 430, 436)),
      ksmag: num(cut(l, 446, 452)),
      gaia: /^\d+$/.test(cut(l, 498, 516)) ? cut(l, 498, 516) : '',
      simbad: cut(l, 518, 543),
      common: cut(l, 545, 561),
    }));
}
export function readZariIds(file) {
  return gunzipSync(readFileSync(file))
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.slice(0, 19).trim());
}
export function readHr23(file) {
  const { header, rows } = readCsvText(gunzipSync(readFileSync(file)).toString());
  const ix = Object.fromEntries(header.map((h, k) => [h, k]));
  return rows.map((l) => {
    const f = l.split(',');
    return { source_id: f[ix.GaiaDR3], cluster: f[ix.Name].replace(/"/g, ''), prob: Number(f[ix.Prob]) };
  });
}

/**
 * Join the parts (gzipped CSV, a header each) into one gzipped CSV, one gzip member a part (a gzip file may hold
 * several members in a row; zlib inflates them in turn), so no string holds it all. Returns the data rows.
 */
function joinParts(partsDir, outFile) {
  const members = [];
  let rows = 0;
  for (const f of readdirSync(partsDir).sort()) {
    const t = gunzipSync(readFileSync(join(partsDir, f))).toString();
    const body = members.length ? t.slice(t.indexOf('\n') + 1) : t;
    rows += body.split('\n').filter(Boolean).length - (members.length ? 0 : 1);
    members.push(gzipSync(Buffer.from(body.endsWith('\n') ? body : body + '\n')));
  }
  writeFileSync(outFile, Buffer.concat(members));
  rmSync(partsDir, { recursive: true });
  return rows;
}

// --- fetching -------------------------------------------------------------------------------------------------------
/** Gaia DR3 columns for a list of ids, 5,000 a query, four at a time; resumable (parts kept until the end). */
async function gaiaColumnsFor(ids, outFile, partsDir) {
  mkdirSync(partsDir, { recursive: true });
  const batches = [];
  for (let i = 0; i < ids.length; i += 5000) batches.push(ids.slice(i, i + 5000));
  let next = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const k = next++;
      if (k >= batches.length) return;
      const part = join(partsDir, `${String(k).padStart(5, '0')}.csv.gz`);
      if (existsSync(part)) {
        done++;
        continue;
      }
      const t = await syncTap(`${GAIA_TAP}/sync`, `SELECT ${EXT_GAIA_COLUMNS} FROM gaiadr3.gaia_source WHERE source_id IN (${batches[k].join(',')})`);
      if (!t.startsWith('source_id')) throw new Error(`unexpected reply ${t.slice(0, 200)}`);
      writeFileSync(part, gzipSync(Buffer.from(t)));
      if (++done % 20 === 0) console.log(`  ${done} / ${batches.length}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`  ${outFile}: ${joinParts(partsDir, outFile)} rows for ${ids.length} ids`);
}

/** The luminous stars (group 3b), in 48 slices of the sky (HEALPix level 1 by source id), 3 queries at a time. */
async function gaiaLuminous(outFile, partsDir) {
  mkdirSync(partsDir, { recursive: true });
  const step = 144115188075855872n; // 2^35 * 4^11: one level-1 HEALPix pixel of source ids
  const slices = [];
  for (let k = 0n; k < 48n; k++) slices.push([k * step, (k + 1n) * step]);
  const where = (a, b) =>
    `source_id >= ${a} AND source_id < ${b} AND parallax >= 0.125 AND parallax_over_error >= 5 AND ruwe < 1.4 AND phot_g_mean_mag < 13.6 AND (` +
    `(parallax >= 0.2 AND phot_g_mean_mag + 5*LOG10(ABS(parallax) + 1e-9) - 10 < 0.0) OR ` +
    `(parallax_over_error >= 10 AND phot_g_mean_mag + 5*LOG10(ABS(parallax) + 1e-9) - 10 < -1.0))`;
  let next = 0;
  async function worker() {
    for (;;) {
      const k = next++;
      if (k >= slices.length) return;
      const part = join(partsDir, `${String(k).padStart(3, '0')}.csv.gz`);
      if (existsSync(part)) continue;
      const [a, b] = slices[k];
      for (let attempt = 0; ; attempt++) {
        try {
          // Synchronous: a slice takes seconds (the source-id range uses the table's index), where async jobs can wait in a queue for hours.
          const t = await syncTap(`${GAIA_TAP}/sync`, `SELECT ${EXT_GAIA_COLUMNS} FROM gaiadr3.gaia_source WHERE ${where(a, b)}`);
          if (!t.startsWith('source_id')) throw new Error(t.slice(0, 200));
          writeFileSync(part, gzipSync(Buffer.from(t)));
          console.log(`  luminous slice ${k + 1} / 48: ${t.split('\n').length - 2} stars`);
          break;
        } catch (e) {
          console.warn(`  luminous slice ${k + 1}: ${String(e.message).slice(0, 200)}`);
          if (attempt >= 4) throw e;
          await sleep(20000);
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  console.log(`  ${outFile}: ${joinParts(partsDir, outFile)} rows`);
}

/**
 * Fetch whatever is missing. `athygExtGaiaIds` are the Gaia ids of the AT-HYG rows the core does not use (the
 * caller reads AT-HYG); the other id lists come from the cached tables.
 */
export async function fetchExtension(RAW, athygExtGaiaIds) {
  // athygExtGaiaIds: the Gaia ids of the AT-HYG rows the core does not use
  const has = (f) => existsSync(join(RAW, f));
  const simple = [
    ['athyg_40.csv.gz', 'https://codeberg.org/astronexus/athyg/media/branch/main/data/athyg_40.csv.gz'],
    ['gcns_table1c.dat.gz', 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/649/A6/table1c.dat.gz'],
    ['reyle2021_tablea1.dat.gz', 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/650/A201/tablea1.dat.gz'],
    ['zari2021_filtered.dat.gz', 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/650/A112/filtered.dat.gz'],
  ];
  for (const [f, url] of simple) {
    if (has(f)) continue;
    console.log(`fetch ${f}`);
    await download(url, join(RAW, f));
  }
  if (!has('hr23_members_1kpc.csv.gz')) {
    console.log('fetch hr23_members_1kpc.csv.gz (TAPVizieR)');
    const t = await syncTap(
      VIZIER_TAP,
      'SELECT m.GaiaDR3, m.Name, m.Prob, m.Plx, m.e_Plx, c.dist50 FROM "J/A+A/673/A114/members" AS m JOIN "J/A+A/673/A114/clusters" AS c ON m.Name = c.Name ' +
        "WHERE c.dist50 < 1000 AND c.Type = 'o' AND m.Prob >= 0.7",
    );
    writeFileSync(join(RAW, 'hr23_members_1kpc.csv.gz'), gzipSync(Buffer.from(t)));
  }
  const jobs = [];
  if (!has('gaia_dr3_luminous.csv.gz')) {
    console.log('fetch gaia_dr3_luminous.csv.gz (Gaia archive, 48 async jobs)');
    jobs.push(gaiaLuminous(join(RAW, 'gaia_dr3_luminous.csv.gz'), join(RAW, '.parts-gaia-luminous')));
  }
  if (!has('gaia_dr3_ext_columns.csv.gz')) {
    const ids = new Set(athygExtGaiaIds);
    for (const r of readGcns(join(RAW, 'gcns_table1c.dat.gz'))) if (Number(r.dist_50) <= 0.1) ids.add(r.source_id);
    for (const r of readReyle(join(RAW, 'reyle2021_tablea1.dat.gz'))) if (r.gaia) ids.add(r.gaia);
    for (const id of readZariIds(join(RAW, 'zari2021_filtered.dat.gz'))) ids.add(id);
    for (const r of readHr23(join(RAW, 'hr23_members_1kpc.csv.gz'))) ids.add(r.source_id);
    const hosts = readCsvText(gunzipSync(readFileSync(join(RAW, 'gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz'))).toString());
    for (const l of hosts.rows) ids.add(l.split(',')[0]);
    for (const [, id] of GAIA_BH_COMPANIONS) ids.add(id);
    const list = [...ids].filter((s) => /^\d+$/.test(s)).sort();
    console.log(`fetch gaia_dr3_ext_columns.csv.gz (${list.length} ids, IN lists of 5,000)`);
    jobs.push(gaiaColumnsFor(list, join(RAW, 'gaia_dr3_ext_columns.csv.gz'), join(RAW, '.parts-gaia-ext')));
  }
  await Promise.all(jobs);
}
