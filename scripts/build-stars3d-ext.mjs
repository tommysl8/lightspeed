// Builds the star catalogue's extension: about three million stars beyond the 329,770 of stars3d.bin.gz, which is
// not touched (its stars keep their indices).
//
//   public/data/stars3d-head.bin.gz   the pinned stars, appended to the core in the app (LSS3 layout + origin,
//                                     spectral type and constellation sections): every exoplanet host, the 10-pc
//                                     census objects Gaia lacks, the Gaia black holes' companions, the Gliese stars,
//                                     and every new star that can be seen from near the Sun at any date
//   public/data/stars3d-index.bin.gz  the band files and their cells (for choosing what to fetch)
//   public/data/stars3d/NNNN.bin.gz   band files: the stars of one absolute-magnitude band in one region, in cells
//                                     of <= 512 stars sorted by M_V (docs/data/stars.md §12)
//   public/data/star-names.json.gz    the core's names, with the new stars' HD, HIP, GJ and variable-star names appended
//   docs/data/stars-ext-build-log.txt
//
// Run after scripts/build-stars3d.mjs:   node --max-old-space-size=6000 scripts/build-stars3d-ext.mjs [--fetch]
// Inputs: data-raw/ (scripts/star-ext-sources.mjs lists them). Deterministic: the same inputs give the same bytes.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, createReadStream } from 'node:fs';
import { gunzipSync, gzipSync, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseCsvLine,
  bvToTemperature,
  unitFromRaDec,
  eqToEcl,
  stateFromAstrometry,
  propagate,
  zeroPoint,
  CON_INDEX,
  readSptTable,
  sptToBv,
  roundMantissa,
  shuffle,
} from './build-stars3d.mjs';
import { fetchExtension, readGcns, readReyle, readZariIds, readHr23, readCsvText, GAIA_BH_COMPANIONS } from './star-ext-sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const OUT_DATA = join(ROOT, 'public', 'data');
const OUT_BANDS = join(OUT_DATA, 'stars3d');
const OUT_DOCS = join(ROOT, 'docs', 'data');

const DEG = Math.PI / 180;
const PC_KM = (149597870.7 * 648000) / Math.PI;
const KMS_TO_PC_PER_YR = (365.25 * 86400) / PC_KM;
const C_PC_PER_YR = 0.30660139378555057;
const POS_MANTISSA_BITS = 19;
const VEL_REJECT_KMS = 1000;
const MIN_PLAUSIBLE_ABS_V = -10;
/** V_T above which Gaia G, BP, RP give an AT-HYG star's V and colour (Tycho-2 photometry grows noisy there). */
const GAIA_PHOT_FROM_VT = 10.5;
/** Absolute-magnitude bands of the band files (upper edges). */
export const BANDS = [-3, 0, 3, 6, 9];
const FILE_STARS = 16384;
const CELL_STARS = 512;
/** The shader's cut (STAR_MAG_LIMIT 6.5 + fade 0.5) and a margin, for the stars pinned because they can be seen from near the Sun. */
const NEAR_SUN_CUT = 7.02 + 0.5;
const NEAR_SUN_PC = 0.05;
const MOTION_YEARS = 1e6;

/** Origin codes (low 4 bits of the origin byte; docs/data/stars.md §12.3). */
const ORIGIN = { core: 0, athyg: 1, gcns: 2, census: 3, zari: 4, luminous: 5, cluster: 6, host: 7, bhCompanion: 8 };
const ORIGIN_V_GAIA = 0x10;
const ORIGIN_BV_GAIA = 0x20;
const ORIGIN_COMPANION = 0x40;
const ORIGIN_WHITE_DWARF = 0x80;

const log = [];
const note = (s) => {
  log.push(s);
  console.log(s);
};
const num = (s) => (s === '' || s == null || s === '---' ? NaN : Number(s));

// ─── Photometry ─────────────────────────────────────────────────────────────────────────────────────────────────

/** G − V of Riello et al. (2021, A&A 649, A3, Table C.2) for −0.5 < BP−RP < 2.75. */
const rielloGminusV = (x) => -0.02704 + 0.01424 * x - 0.2156 * x * x + 0.01426 * x * x * x;

/** The Pecaut & Mamajek dwarf sequence's colour columns, for BP−RP beyond Riello's range and for stars without BP/RP. */
function readEem() {
  const lines = readFileSync(join(RAW, 'EEM_dwarf_UBVIJHK_colors_Teff.txt'), 'utf8').split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const l of lines) {
    if (l.startsWith('#SpT')) {
      if (inTable) break;
      inTable = true;
      continue;
    }
    if (!inTable || !l.trim()) continue;
    const f = l.trim().split(/\s+/);
    rows.push({ spt: f[0], teff: num(f[1]), mv: num(f[7]), bv: num(f[8]), gv: num(f[10]), bprp: num(f[11]), vks: num(f[18]), mj: num(f[21]) });
  }
  return rows;
}
function interpolator(pairs) {
  const p = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0]);
  // keep x strictly increasing (the sequence has repeats)
  const xs = [];
  const ys = [];
  for (const [x, y] of p) {
    if (xs.length && x <= xs[xs.length - 1]) continue;
    xs.push(x);
    ys.push(y);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m;
      else hi = m;
    }
    return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
  };
}

function median(a) {
  const s = Float64Array.from(a).sort();
  return s.length % 2 ? s[(s.length - 1) >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
}

// ─── Gaia DR3 columns ─────────────────────────────────────────────────────────────────────────────────────────────

const GCOLS = ['ra', 'dec', 'parallax', 'parallax_error', 'pmra', 'pmdec', 'radial_velocity', 'grvs_mag', 'rv_template_teff', 'ruwe', 'phot_g_mean_mag', 'phot_bp_mean_mag', 'phot_rp_mean_mag', 'nu_eff_used_in_astrometry', 'pseudocolour', 'ecl_lat', 'astrometric_params_solved'];

/** Gaia rows as columns (Float64Array per column) and a map id -> row, read line by line (little memory). */
async function readGaiaColumns(files) {
  const ids = [];
  const cols = GCOLS.map(() => []);
  for (const file of files) {
    const rl = createInterface({ input: createReadStream(join(RAW, file)).pipe(createGunzip()), crlfDelay: Infinity });
    let ix = null;
    for await (const line of rl) {
      if (!line) continue;
      const f = line.split(',');
      if (!ix) {
        ix = GCOLS.map((c) => f.indexOf(c));
        continue;
      }
      ids.push(f[0]);
      for (let k = 0; k < GCOLS.length; k++) cols[k].push(ix[k] >= 0 ? num(f[ix[k]]) : NaN);
    }
  }
  const out = { n: ids.length, row: new Map() };
  GCOLS.forEach((c, k) => (out[c] = Float64Array.from(cols[k])));
  ids.forEach((id, k) => {
    if (!out.row.has(id)) out.row.set(id, k);
  });
  return out;
}

// ─── AT-HYG ─────────────────────────────────────────────────────────────────────────────────────────────────────────

async function readAthygRest(coreIds) {
  const rl = createInterface({ input: createReadStream(join(RAW, 'athyg_40.csv.gz')).pipe(createGunzip()), crlfDelay: Infinity });
  let H = null;
  const rows = [];
  for await (const line of rl) {
    if (!line) continue;
    if (!H) {
      H = Object.fromEntries(parseCsvLine(line).map((n, i) => [n, i]));
      continue;
    }
    // Most rows have no quotes: split fast, else parse.
    const f = line.includes('"') ? parseCsvLine(line) : line.split(',');
    const id = f[H.id];
    if (id === '1' || coreIds.has(id)) continue;
    rows.push({
      id,
      tyc: f[H.tyc],
      gaia: f[H.gaia],
      hyg: f[H.hyg],
      hip: f[H.hip],
      hd: f[H.hd],
      gl: f[H.gl],
      bayer: f[H.bayer],
      flam: f[H.flam],
      con: f[H.con],
      proper: f[H.proper],
      ra: num(f[H.ra]) * 15,
      dec: num(f[H.dec]),
      pos_src: f[H.pos_src],
      dist: num(f[H.dist]),
      dist_src: f[H.dist_src],
      mag: num(f[H.mag]),
      ci: num(f[H.ci]),
      mag_src: f[H.mag_src],
      rv: num(f[H.rv]),
      rv_src: f[H.rv_src],
      pmra: num(f[H.pmra]),
      pmdec: num(f[H.pmdec]),
      spect: f[H.spect],
    });
  }
  return rows;
}

function readCsvGzRows(file) {
  const { header, rows } = readCsvText(gunzipSync(readFileSync(join(RAW, file))).toString());
  return rows.map((l) => {
    const f = parseCsvLine(l);
    const o = {};
    header.forEach((h, k) => (o[h] = (f[k] ?? '').trim()));
    return o;
  });
}

// ─── The core, for duplicates ─────────────────────────────────────────────────────────────────────────────────────

function readCore() {
  const raw = gunzipSync(readFileSync(join(OUT_DATA, 'stars3d.bin.gz')));
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = dv.getUint32(8, true);
  const off = [0, 1, 2, 3, 4].map((k) => dv.getUint32(28 + 4 * k, true));
  const un = (o, cnt, w) => {
    const out = new Uint8Array(cnt * w);
    for (let k = 0; k < w; k++) for (let i = 0; i < cnt; i++) out[i * w + k] = raw[o + k * cnt + i];
    return out.buffer;
  };
  return { n, pos: new Float32Array(un(off[0], 3 * n, 4)), absMag: new Int16Array(un(off[2], n, 2)) };
}

/** A hash of directions (unit vectors, J2000 ecliptic) with each star's V from the Sun, for the positional duplicate test. */
class DirectionHash {
  constructor(cellRad = 2e-4) {
    this.cell = cellRad;
    this.map = new Map();
  }
  key(u) {
    return `${Math.floor(u[0] / this.cell)},${Math.floor(u[1] / this.cell)},${Math.floor(u[2] / this.cell)}`;
  }
  add(pos, V) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    const u = [pos[0] / r, pos[1] / r, pos[2] / r];
    const k = this.key(u);
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(u[0], u[1], u[2], V);
  }
  /** The brightest neighbour within radArcsec: { V, sep } or null. */
  nearest(pos, radArcsec) {
    const r = Math.hypot(pos[0], pos[1], pos[2]);
    const u = [pos[0] / r, pos[1] / r, pos[2] / r];
    const c = u.map((x) => Math.floor(x / this.cell));
    const lim = (radArcsec / 206264.806) ** 2;
    let best = null;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let d = -1; d <= 1; d++) {
          const arr = this.map.get(`${c[0] + a},${c[1] + b},${c[2] + d}`);
          if (!arr) continue;
          for (let q = 0; q < arr.length; q += 4) {
            const dx = arr[q] - u[0];
            const dy = arr[q + 1] - u[1];
            const dz = arr[q + 2] - u[2];
            const s2 = dx * dx + dy * dy + dz * dz;
            if (s2 < lim && (!best || arr[q + 3] < best.V)) best = { V: arr[q + 3], sep: Math.sqrt(s2) * 206264.806 };
          }
        }
    return best;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  // Core ids (the m10 rows) and the rest of AT-HYG.
  const m10 = gunzipSync(readFileSync(join(RAW, 'athyg_40_reduced_m10.csv.gz'))).toString().split(/\r?\n/);
  const idCol = parseCsvLine(m10[0]).indexOf('id');
  const gaiaCol = parseCsvLine(m10[0]).indexOf('gaia');
  const coreIds = new Set();
  const coreGaia = new Set();
  for (let k = 1; k < m10.length; k++) {
    if (!m10[k]) continue;
    const f = m10[k].includes('"') ? parseCsvLine(m10[k]) : m10[k].split(',');
    coreIds.add(f[idCol]);
    if (f[gaiaCol]) coreGaia.add(f[gaiaCol]);
  }
  m10.length = 0;
  const athyg = await readAthygRest(coreIds);
  note(`AT-HYG v4.0: ${athyg.length} rows beyond the core's ${coreIds.size} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  if (process.argv.includes('--fetch')) await fetchExtension(RAW, athyg.map((r) => r.gaia).filter(Boolean));
  for (const f of ['gaia_dr3_ext_columns.csv.gz', 'gaia_dr3_luminous.csv.gz', 'gcns_table1c.dat.gz', 'reyle2021_tablea1.dat.gz', 'zari2021_filtered.dat.gz', 'hr23_members_1kpc.csv.gz'])
    if (!existsSync(join(RAW, f))) throw new Error(`data-raw/${f} is missing: run with --fetch`);

  const G = await readGaiaColumns(['gaia_dr3_ext_columns.csv.gz', 'gaia_dr3_luminous.csv.gz']);
  note(`Gaia DR3 rows: ${G.n} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const hip1 = new Map(readCsvGzRows('hip1_phot.csv.gz').map((r) => [r.HIP, r]));
  const hip2 = new Map(readCsvGzRows('hip2_plx.csv.gz').map((r) => [r.HIP, r]));
  const hyg = new Map();
  for (const r of readCsvGzRows('hyg_v44.csv.gz')) if (r.var) hyg.set(r.id, { var: r.var, con: r.con });
  const tycho = JSON.parse(readFileSync(join(OUT_DOCS, 'stars-tycho-calibration.json'), 'utf8'));
  const bvTycho = interpolator(tycho.bvKnots.map((k) => [k.x, k.y]));
  const vMinusVt = interpolator(tycho.vMinusVtKnots.map((k) => [k.x, k.y]));
  const tMin = tycho.bvKnots[0].x;
  const tMax = tycho.bvKnots[tycho.bvKnots.length - 1].x;
  const eem = readEem();
  const eemGv = interpolator(eem.map((r) => [r.bprp, r.gv]));
  const eemBv = interpolator(eem.map((r) => [r.bprp, r.bv]));
  const sptTable = readSptTable();
  const hosts = new Set(readCsvText(gunzipSync(readFileSync(join(RAW, 'gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz'))).toString()).rows.map((l) => l.split(',')[0]));
  const bhCompanion = new Map(GAIA_BH_COMPANIONS.map(([hole, id]) => [id, hole]));

  // ── BP−RP → B−V, calibrated on the AT-HYG stars beyond the core with Tycho-2 colours (10 < V_T < 11: noisy one by
  //    one, but binned by the precise BP−RP the median is not biased), per 0.05 mag of BP−RP; the dwarf sequence
  //    beyond the calibrated range.
  const bvFromBpRp = (() => {
    const bins = new Map();
    for (const r of athyg) {
      if (!(r.mag > 10 && r.mag < 11) || r.mag_src !== 'T' || !Number.isFinite(r.ci)) continue;
      const k = G.row.get(r.gaia);
      if (k === undefined) continue;
      const x = G.phot_bp_mean_mag[k] - G.phot_rp_mean_mag[k];
      if (!Number.isFinite(x)) continue;
      const b = Math.round(x / 0.05);
      if (!bins.has(b)) bins.set(b, { x: [], y: [] });
      bins.get(b).x.push(x);
      bins.get(b).y.push(bvTycho(Math.min(tMax, Math.max(tMin, r.ci))));
    }
    const knots = [...bins.values()].filter((b) => b.x.length >= 50).map((b) => [median(b.x), median(b.y), b.x.length]).sort((a, b) => a[0] - b[0]);
    const cal = interpolator(knots.map(([x, y]) => [x, y]));
    const lo = knots[0][0];
    const hi = knots[knots.length - 1][0];
    note(`BP−RP → B−V: ${knots.length} knots from ${knots.reduce((s, k) => s + k[2], 0)} AT-HYG stars (BP−RP ${lo.toFixed(2)} to ${hi.toFixed(2)}); beyond, the Pecaut & Mamajek dwarf sequence`);
    return { f: (x) => (x >= lo && x <= hi ? cal(x) : eemBv(x)), knots };
  })();

  /** V and B−V from Gaia photometry: [V, BV] (BV NaN without BP/RP). */
  function gaiaVBv(g, bp, rp) {
    if (!Number.isFinite(g)) return [NaN, NaN];
    const x = bp - rp;
    if (!Number.isFinite(x)) return [NaN, NaN];
    const gv = x < -0.5 ? rielloGminusV(-0.5) : x <= 2.75 ? rielloGminusV(x) : eemGv(x);
    return [g - gv, bvFromBpRp.f(x)];
  }

  // ── Photometric check on the overlap: Tycho-derived V against Gaia-derived V for AT-HYG stars.
  {
    const d = [];
    for (const r of athyg) {
      if (!(r.mag > 9 && r.mag < 10.5) || r.mag_src !== 'T' || !Number.isFinite(r.ci) || r.mag < 1.9) continue;
      const k = G.row.get(r.gaia);
      if (k === undefined) continue;
      const [vg] = gaiaVBv(G.phot_g_mean_mag[k], G.phot_bp_mean_mag[k], G.phot_rp_mean_mag[k]);
      if (Number.isFinite(vg)) d.push(r.mag + vMinusVt(r.ci) - vg);
    }
    const m = median(d);
    note(`V from Tycho-2 minus V from Gaia (AT-HYG stars with 9 < V_T < 10.5): median ${m.toFixed(3)} mag, MAD ${median(d.map((x) => Math.abs(x - m))).toFixed(3)}, ${d.length} stars`);
  }

  // ── Duplicates: the core and every AT-HYG star kept, by direction.
  const core = readCore();
  const dirs = new DirectionHash();
  for (let i = 0; i < core.n; i++) {
    const p = [core.pos[3 * i], core.pos[3 * i + 1], core.pos[3 * i + 2]];
    dirs.add(p, core.absMag[i] * 0.01 + 5 * Math.log10(Math.hypot(...p) / 10));
  }

  const out = []; // new stars
  const seenGaia = new Set(coreGaia);
  const stats = {};
  const bump = (k, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

  /** Radial velocity with the Gaia DR3 corrections (Katz et al. 2023; Blomme et al. 2023). */
  function gaiaRv(k) {
    let rv = G.radial_velocity[k];
    if (!Number.isFinite(rv)) return NaN;
    const grvs = G.grvs_mag[k];
    const tt = G.rv_template_teff[k];
    if (Number.isFinite(tt) && tt >= 8500 && tt <= 14500 && grvs >= 6 && grvs <= 12) rv = rv - 7.98 + 1.135 * grvs;
    else if (!(tt >= 8500) && grvs >= 11) rv -= 0.02755 * grvs * grvs - 0.55863 * grvs + 2.81129;
    return rv;
  }
  /** Parallax corrected for the Lindegren et al. (2021) zero-point: { plx, valid } (valid: inside the recipe's range). */
  function gaiaParallax(k) {
    const zpr = zeroPoint(G.phot_g_mean_mag[k], G.nu_eff_used_in_astrometry[k], G.pseudocolour[k], G.ecl_lat[k], G.astrometric_params_solved[k]);
    return { plx: G.parallax[k] - (zpr ? zpr.zp : -0.017), valid: !!(zpr && zpr.valid) };
  }
  const precClass = (rel) => (!Number.isFinite(rel) ? 3 : rel < 0.01 ? 0 : rel < 0.05 ? 1 : rel < 0.2 ? 2 : 3);

  /**
   * One star from its astrometry: J2000 position (the epoch-`epoch` place carried along the star's own motion) and
   * velocity, J2000 ecliptic. Returns null when the speed is implausible (velocity set to zero instead, flagged).
   */
  function place({ raDeg, decDeg, epoch, plx, pmra, pmdec, rv }) {
    const hasPm = Number.isFinite(pmra) && Number.isFinite(pmdec);
    const s = stateFromAstrometry({ raDeg, decDeg, parallaxMas: plx, pmRaMasYr: hasPm ? pmra : 0, pmDecMasYr: hasPm ? pmdec : 0, rvKms: Number.isFinite(rv) ? rv : 0 });
    const at = propagate(s, 2000 - epoch);
    let velStatus = !hasPm ? 2 : Number.isFinite(rv) ? 0 : 1;
    let vel = at.vel;
    if (velStatus === 2) vel = [0, 0, 0];
    if (Math.hypot(...vel) > VEL_REJECT_KMS) {
      velStatus = 3;
      vel = [0, 0, 0];
    }
    return { pos: eqToEcl(at.pos), vel: eqToEcl(vel), velStatus };
  }

  function push(star) {
    out.push(star);
    bump(`kept:${star.group}`);
  }

  // ── 1. The rest of AT-HYG ───────────────────────────────────────────────────────────────────────────────────
  for (const r of athyg) {
    const k = r.gaia ? G.row.get(r.gaia) : undefined;
    if (r.gaia && seenGaia.has(r.gaia)) {
      bump('athyg: Gaia id already used');
      continue;
    }
    const designated = !!(r.hd || r.hip || r.gl || r.proper || r.bayer || r.flam);
    // Distance.
    let plx = NaN;
    let rel = NaN;
    let distSrc = 6;
    if (k !== undefined && G.parallax[k] > 0) {
      const p = gaiaParallax(k);
      if (p.plx > 0) {
        plx = p.plx;
        rel = G.parallax_error[k] / p.plx;
        distSrc = p.valid ? 0 : 1;
      }
    }
    const h2 = r.hip ? hip2.get(r.hip) : null;
    if (h2 && num(h2.Plx) > 0) {
      const relH = num(h2.e_Plx) / num(h2.Plx);
      if (!(relH >= rel) && (Number.isFinite(rel) || relH < 0.2)) {
        plx = num(h2.Plx);
        rel = relH;
        distSrc = 3;
      }
    }
    if (!(plx > 0) && r.dist_src === 'G_R2' && r.dist > 0 && r.dist < 99999) {
      plx = 1000 / r.dist + 0.029;
      distSrc = 2;
    }
    if (!(plx > 0)) {
      bump('athyg: no usable parallax');
      continue;
    }
    const prec = precClass(rel);
    if (prec === 3 && !designated) {
      bump('athyg: distance error 20% or more, no designation');
      continue;
    }
    // Photometry.
    let V;
    let BV;
    let colSrc = 3;
    let origin = ORIGIN.athyg;
    let vTycho = false;
    const h1raw = r.hip ? hip1.get(r.hip) : null;
    // Hipparcos photometry only for the star itself: a faint Tycho-2 companion can carry its primary's HIP number.
    const h1 = h1raw && h1raw.Vmag !== '' && !(Math.abs(num(h1raw.Vmag) - r.mag) > 1) ? h1raw : null;
    const gk = k;
    // Gaia photometry beyond V_T 10.5, where it agrees with Tycho-2 to 0.75 mag: a larger difference means the Gaia
    // source linked is not the Tycho-2 star (a blend or a neighbour), and Tycho-2's own V is kept.
    const vGaia = gk !== undefined ? gaiaVBv(G.phot_g_mean_mag[gk], G.phot_bp_mean_mag[gk], G.phot_rp_mean_mag[gk])[0] : NaN;
    const vTyc = r.mag_src === 'T' && Number.isFinite(r.ci) ? r.mag + vMinusVt(r.ci) : r.mag;
    const useGaia = r.mag > GAIA_PHOT_FROM_VT && Number.isFinite(vGaia) && Math.abs(vGaia - vTyc) < 0.75;
    if (r.mag > GAIA_PHOT_FROM_VT && Number.isFinite(vGaia) && !useGaia) bump('athyg: Gaia and Tycho-2 V differ by 0.75 mag or more (Tycho-2 kept)');
    if (h1 && h1.Vmag !== '' && h1.r_Vmag !== 'T') {
      V = num(h1.Vmag);
    } else if (useGaia) {
      [V] = gaiaVBv(G.phot_g_mean_mag[gk], G.phot_bp_mean_mag[gk], G.phot_rp_mean_mag[gk]);
      origin |= ORIGIN_V_GAIA;
    } else if (r.mag_src === 'T' && Number.isFinite(r.ci) && r.mag >= 1.9) {
      V = r.mag + vMinusVt(r.ci);
      vTycho = true;
    } else V = r.mag;
    if (h1 && h1['r_B-V'] === 'G' && h1['B-V'] !== '') {
      BV = num(h1['B-V']);
      colSrc = 0;
    } else if (useGaia) {
      [, BV] = gaiaVBv(G.phot_g_mean_mag[gk], G.phot_bp_mean_mag[gk], G.phot_rp_mean_mag[gk]);
      colSrc = 1;
      origin |= ORIGIN_BV_GAIA;
    } else if (r.mag_src === 'T' && Number.isFinite(r.ci)) {
      BV = bvTycho(Math.min(tMax, Math.max(tMin, r.ci)));
      colSrc = 1;
    } else if (r.mag_src === 'GJ' && Number.isFinite(r.ci)) {
      BV = r.ci;
      colSrc = 0;
    } else {
      const s = sptToBv(r.spect, sptTable);
      if (Number.isFinite(s)) {
        BV = s;
        colSrc = 2;
      }
    }
    if (!Number.isFinite(V)) {
      bump('athyg: no magnitude');
      continue;
    }
    // Position and motion: Gaia DR3 carried to J2000 where Gaia has the star, else AT-HYG's J2000 place.
    let rv = NaN;
    let rvGaia = false;
    if (gk !== undefined && Number.isFinite(gaiaRv(gk))) {
      rv = gaiaRv(gk);
      rvGaia = true;
    } else if (r.rv_src && r.rv_src !== 'N' && Number.isFinite(r.rv) && !(r.rv === 0 && r.rv_src === 'HYG')) rv = r.rv;
    const useGaiaPos = gk !== undefined && Number.isFinite(G.ra[gk]) && Number.isFinite(G.pmra[gk]);
    const st = useGaiaPos
      ? place({ raDeg: G.ra[gk], decDeg: G.dec[gk], epoch: 2016, plx, pmra: G.pmra[gk], pmdec: G.pmdec[gk], rv })
      : place({ raDeg: r.ra, decDeg: r.dec, epoch: 2000, plx, pmra: r.pmra, pmdec: r.pmdec, rv });
    const d = Math.hypot(...st.pos);
    const M = V - 5 * Math.log10(d / 10);
    if (M < MIN_PLAUSIBLE_ABS_V) {
      bump('athyg: implausibly luminous');
      continue;
    }
    if (V < NEAR_SUN_CUT) {
      bump(`athyg: brighter than V = ${NEAR_SUN_CUT} from the Sun (dropped: the core has the sky to V = 10)`);
      log.push(`    dropped AT-HYG ${r.id} (HIP ${r.hip || '-'}, TYC ${r.tyc || '-'}): V ${V.toFixed(2)} from the Sun, V_T ${r.mag}`);
      continue;
    }
    const ruwe = gk !== undefined ? G.ruwe[gk] : NaN;
    const flags =
      distSrc | (prec << 3) | (st.velStatus << 5) | ((rvGaia && st.velStatus !== 3 ? 1 : 0) << 7) | (colSrc << 8) | ((ruwe > 1.4 ? 1 : 0) << 11) | ((r.hyg && hyg.has(r.hyg) ? 1 : 0) << 13) | ((vTycho ? 1 : 0) << 15);
    if (r.gaia) seenGaia.add(r.gaia);
    dirs.add(st.pos, V);
    push({
      group: 'athyg',
      gaia: r.gaia,
      pos: st.pos,
      vel: st.vel,
      M,
      V,
      teff: Number.isFinite(BV) ? Math.round(bvToTemperature(BV) / 10) * 10 : 0,
      flags,
      origin,
      host: hosts.has(r.gaia),
      pin: !!r.gl || hosts.has(r.gaia),
      names: { hip: r.hip, hd: r.hd, gl: r.gl, proper: r.proper, variable: r.hyg && hyg.has(r.hyg) ? `${hyg.get(r.hyg).var} ${hyg.get(r.hyg).con || r.con}`.trim() : '' },
      spect: r.spect,
      con: CON_INDEX.get((r.con || '').toLowerCase()) ?? 0,
    });
  }
  athyg.length = 0;
  note(`AT-HYG done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // ── Gaia-only stars: one function for every group ─────────────────────────────────────────────────────────────
  /**
   * A Gaia DR3 star of `group`: parallax/error >= minPoe after the zero-point (hosts and black-hole companions: any
   * positive parallax), photometry from G, BP, RP (or 2MASS for GCNS stars without BP/RP), duplicates removed.
   */
  function gaiaStar(id, group, { minPoe = 5, pin = false, gcns = null, wd = false } = {}) {
    if (seenGaia.has(id)) {
      bump(`${group}: already in (Gaia id)`);
      return;
    }
    const k = G.row.get(id);
    if (k === undefined) {
      bump(`${group}: no Gaia DR3 row`);
      return;
    }
    const p = gaiaParallax(k);
    if (!(p.plx > 0) || p.plx / G.parallax_error[k] < minPoe) {
      bump(`${group}: parallax/error below ${minPoe}`);
      return;
    }
    let [V, BV] = gaiaVBv(G.phot_g_mean_mag[k], G.phot_bp_mean_mag[k], G.phot_rp_mean_mag[k]);
    let origin = ORIGIN[group] | ORIGIN_V_GAIA;
    let colSrc = 1;
    if (Number.isFinite(BV)) origin |= ORIGIN_BV_GAIA;
    if (!Number.isFinite(V)) {
      const g = G.phot_g_mean_mag[k];
      const ks = gcns ? num(gcns.ksmag) : NaN;
      if (Number.isFinite(g) && Number.isFinite(ks)) {
        // G − Ks → G − V and B−V along the dwarf sequence.
        const gks = g - ks;
        const byGks = interpolator(eem.map((r) => [r.gv + r.vks, r.gv]));
        const bvByGks = interpolator(eem.map((r) => [r.gv + r.vks, r.bv]));
        V = g - byGks(gks);
        BV = bvByGks(gks);
        colSrc = 2;
        bump(`${group}: V from G and 2MASS Ks`);
      } else if (Number.isFinite(g)) {
        V = g;
        BV = NaN;
        colSrc = 3;
        bump(`${group}: no colour (V = G)`);
      } else {
        bump(`${group}: no G magnitude`);
        return;
      }
    }
    const rvG = gaiaRv(k);
    const rv = Number.isFinite(rvG) ? rvG : gcns ? num(gcns.adoptedrv) : NaN;
    const st = place({ raDeg: G.ra[k], decDeg: G.dec[k], epoch: 2016, plx: p.plx, pmra: G.pmra[k], pmdec: G.pmdec[k], rv });
    const d = Math.hypot(...st.pos);
    const M = V - 5 * Math.log10(d / 10);
    if (M < MIN_PLAUSIBLE_ABS_V) {
      bump(`${group}: implausibly luminous`);
      return;
    }
    // Duplicates by position: within 3″ (+16 years of proper motion) of a catalogue star of similar V.
    if (V < 12.5) {
      const pm = Math.hypot(G.pmra[k] || 0, G.pmdec[k] || 0) / 1000;
      const nb = dirs.nearest(st.pos, 3 + 16 * pm);
      if (nb && Math.abs(nb.V - V) < 1.5) {
        bump(`${group}: duplicate by position`);
        return;
      }
      if (nb) origin |= ORIGIN_COMPANION;
    }
    if (V < NEAR_SUN_CUT) {
      // Tycho-2 is complete to V ≈ 11: a new star this bright from the Sun is a duplicate the position test missed.
      bump(`${group}: brighter than V = ${NEAR_SUN_CUT} from the Sun (dropped as a probable duplicate)`);
      log.push(`    dropped ${group} Gaia DR3 ${id}: V ${V.toFixed(2)} from the Sun`);
      return;
    }
    if (wd) origin |= ORIGIN_WHITE_DWARF;
    const rel = G.parallax_error[k] / p.plx;
    const ruwe = G.ruwe[k];
    const flags =
      (p.valid ? 0 : 1) | (precClass(rel) << 3) | (st.velStatus << 5) | ((Number.isFinite(rvG) && st.velStatus !== 3 ? 1 : 0) << 7) | (colSrc << 8) | ((ruwe > 1.4 ? 1 : 0) << 11) | (1 << 14);
    seenGaia.add(id);
    dirs.add(st.pos, V);
    push({
      group,
      gaia: id,
      pos: st.pos,
      vel: st.vel,
      M,
      V,
      teff: Number.isFinite(BV) ? Math.round(bvToTemperature(BV) / 10) * 10 : 0,
      flags,
      origin,
      host: hosts.has(id),
      pin: pin || hosts.has(id),
      names: null,
      spect: '',
      con: 0,
    });
  }

  // ── 2. GCNS within 100 pc ─────────────────────────────────────────────────────────────────────────────────────
  const gcns = readGcns(join(RAW, 'gcns_table1c.dat.gz'));
  let gcnsIn = 0;
  for (const r of gcns) {
    if (!(num(r.dist_50) <= 0.1)) continue;
    gcnsIn++;
    gaiaStar(r.source_id, 'gcns', { gcns: r, wd: num(r.wd_prob) > 0.5 });
  }
  note(`GCNS: ${gcns.length} rows, ${gcnsIn} with median distance <= 100 pc`);

  // ── 2b. The 10-pc census: objects with Gaia ids through gaiaStar; the others from the census's own values.
  const reyle = readReyle(join(RAW, 'reyle2021_tablea1.dat.gz')).filter((r) => r.type !== 'Planet');
  for (const r of reyle) if (r.gaia) gaiaStar(r.gaia, 'gcns', { minPoe: 3 });
  let census = 0;
  const eemByType = (spt) => {
    const m = /^([OBAFGKMLTY])\s*(\d+(?:\.\d+)?)/.exec(spt || '');
    if (!m) return null;
    const key = `${m[1]}${Number(m[2]) % 1 ? m[2] : Math.round(Number(m[2]))}`;
    return eem.find((e) => e.spt.startsWith(key)) ?? eem.find((e) => e.spt.startsWith(m[1])) ?? null;
  };
  for (const r of reyle) {
    if (r.gaia && G.row.has(r.gaia)) continue;
    if (!(r.plx > 0)) continue;
    const epoch = Number.isFinite(r.epoch) ? r.epoch : 2000;
    const st = place({ raDeg: r.ra, decDeg: r.dec, epoch, plx: r.plx, pmra: r.pmra, pmdec: r.pmdec, rv: r.rv });
    const d = Math.hypot(...st.pos);
    const e = eemByType(r.spt);
    let V = r.vmag;
    let colSrc = 2;
    if (!Number.isFinite(V) && Number.isFinite(r.gmag) && Number.isFinite(r.bp) && Number.isFinite(r.rp)) V = gaiaVBv(r.gmag, r.bp, r.rp)[0];
    if (!Number.isFinite(V) && e && Number.isFinite(e.mv)) V = e.mv + 5 * Math.log10(d / 10);
    if (!Number.isFinite(V) && e && Number.isFinite(e.mj) && Number.isFinite(r.jmag)) V = r.jmag + (e.mv - e.mj);
    if (!Number.isFinite(V)) {
      bump('census: no way to its V');
      log.push(`    census object without V: ${r.name} (${r.type}, ${r.spt})`);
      continue;
    }
    // The bright stars of the census are core stars (Hipparcos) or parts of them: skip anything as bright as the
    // core's limit near the Sun, and anything near a catalogue star of similar V.
    const nb = dirs.nearest(st.pos, 20);
    if (V < NEAR_SUN_CUT || (nb && Math.abs(nb.V - V) < 1.5)) {
      bump('census: in the catalogue already');
      continue;
    }
    const teff = e && Number.isFinite(e.teff) ? Math.round(e.teff / 10) * 10 : 0;
    dirs.add(st.pos, V);
    census++;
    push({
      group: 'census',
      gaia: '',
      pos: st.pos,
      vel: st.vel,
      M: V - 5 * Math.log10(d / 10),
      V,
      teff,
      flags: 5 | (precClass(r.e_plx / r.plx) << 3) | (st.velStatus << 5) | (colSrc << 8) | (1 << 14),
      origin: ORIGIN.census,
      host: false,
      pin: true,
      names: { census: r.name },
      spect: r.spt,
      con: 0,
    });
  }
  note(`10-pc census: ${reyle.length} stars and brown dwarfs; ${census} added from the census's own values`);

  // ── 3a. Zari et al. (2021) OBA; 3b. Gaia luminous; 4. cluster members; 5. hosts; Gaia BH companions ───────────
  for (const id of readZariIds(join(RAW, 'zari2021_filtered.dat.gz'))) gaiaStar(id, 'zari');
  {
    const rl = createInterface({ input: createReadStream(join(RAW, 'gaia_dr3_luminous.csv.gz')).pipe(createGunzip()), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first || !line) {
        first = false;
        continue;
      }
      gaiaStar(line.slice(0, line.indexOf(',')), 'luminous');
    }
  }
  for (const r of readHr23(join(RAW, 'hr23_members_1kpc.csv.gz'))) gaiaStar(r.source_id, 'cluster');
  for (const id of hosts) gaiaStar(id, 'host', { minPoe: 0, pin: true });
  for (const [hole, id] of GAIA_BH_COMPANIONS) {
    gaiaStar(id, 'bhCompanion', { minPoe: 0, pin: true });
    const s = out.find((x) => x.gaia === id);
    if (s) s.bhHole = hole;
  }
  // Hosts found in any group are pinned.
  for (const s of out) if (hosts.has(s.gaia)) s.pin = true;

  // ── The stars that can be seen from within 0.05 pc of the Sun at some date within ±1 Myr: pinned too.
  let nearSun = 0;
  for (const s of out) {
    if (s.pin) continue;
    const p = s.pos;
    const v = s.vel.map((x) => x * KMS_TO_PC_PER_YR);
    const lt = Math.hypot(...p) / C_PC_PER_YR;
    const p0 = p.map((x, k) => x + v[k] * lt);
    const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    let t = vv > 0 ? -(p0[0] * v[0] + p0[1] * v[1] + p0[2] * v[2]) / vv : 0;
    t = Math.max(-MOTION_YEARS, Math.min(MOTION_YEARS, t));
    const dmin = Math.max(Math.hypot(...p0.map((x, k) => x + v[k] * t)) - NEAR_SUN_PC, 1e-6);
    // …and the light-time from the camera (at most v/c of the distance nearer).
    const beta = Math.sqrt(vv) / C_PC_PER_YR;
    if (s.M + 5 * Math.log10((dmin * (1 - beta)) / 10) < NEAR_SUN_CUT) {
      s.pin = true;
      s.nearSun = true;
      nearSun++;
    }
  }
  note(`pinned for the Sun's sky at any date: ${nearSun}`);
  note(`kept: ${Object.entries(stats).filter(([k]) => k.startsWith('kept:')).map(([k, v]) => `${k.slice(5)} ${v}`).join(', ')}; total ${out.length}`);
  for (const [k, v] of Object.entries(stats)) if (!k.startsWith('kept:')) note(`  ${k}: ${v}`);

  // ── Names and spectral types ─────────────────────────────────────────────────────────────────────────────────────
  const names = JSON.parse(gunzipSync(readFileSync(join(OUT_DATA, 'star-names.json.gz'))).toString());
  const coreCount = names.coreCount ?? names.count;
  if (coreCount !== core.n) throw new Error(`star-names.json.gz has ${coreCount} core stars, stars3d.bin.gz ${core.n}`);
  // Undo an earlier extension of the names file.
  const spectralTypes = names.spectralTypes.slice(0, names.coreSpectralTypes ?? names.spectralTypes.length);
  const coreSpectralTypes = spectralTypes.length;
  const strip = (arr) => arr.filter((e) => e[0] < coreCount);
  const decodeCol = (c) => {
    let i = 0;
    const pairs = [];
    c.indexDelta.forEach((d, k) => {
      i += d;
      if (i < coreCount) pairs.push([i, c.id[k]]);
    });
    return pairs;
  };
  const spectIndex = new Map(spectralTypes.map((s, k) => [s, k]));
  const spectOf = (s) => {
    if (!s) return 0;
    if (!spectIndex.has(s)) {
      spectIndex.set(s, spectralTypes.length);
      spectralTypes.push(s);
    }
    return spectIndex.get(s);
  };

  // ── Head: the pinned stars, brightest from the Sun first ───────────────────────────────────────────────────────
  const pinned = out.filter((s) => s.pin).sort((a, b) => a.V - b.V || (a.gaia < b.gaia ? -1 : 1));
  const rest = out.filter((s) => !s.pin);
  const headCount = core.n + pinned.length;
  pinned.forEach((s, k) => (s.index = core.n + k));

  // ── Band files: absolute-magnitude bands; per band an octree with <= FILE_STARS stars a leaf; cells inside ───────
  const bandOf = (m) => {
    let b = 0;
    while (b < BANDS.length && m >= BANDS[b]) b++;
    return b;
  };
  function octLeaves(list, cap) {
    const outLeaves = [];
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (const s of list)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], s.pos[k]);
        hi[k] = Math.max(hi[k], s.pos[k]);
      }
    const half = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 1;
    const c0 = [0, 1, 2].map((k) => 0.5 * (lo[k] + hi[k]) + 0.123);
    lo = c0.map((x) => x - half);
    hi = c0.map((x) => x + half);
    (function rec(l, a, b, depth) {
      if (l.length <= cap || depth > 40) {
        outLeaves.push(l);
        return;
      }
      const c = [0, 1, 2].map((k) => 0.5 * (a[k] + b[k]));
      const buckets = [[], [], [], [], [], [], [], []];
      for (const s of l) buckets[(s.pos[0] >= c[0] ? 1 : 0) | (s.pos[1] >= c[1] ? 2 : 0) | (s.pos[2] >= c[2] ? 4 : 0)].push(s);
      for (let q = 0; q < 8; q++)
        if (buckets[q].length)
          rec(
            buckets[q],
            [0, 1, 2].map((k) => ((q >> k) & 1 ? c[k] : a[k])),
            [0, 1, 2].map((k) => ((q >> k) & 1 ? b[k] : c[k])),
            depth + 1,
          );
    })(list, lo, hi, 0);
    return outLeaves;
  }
  const byBand = BANDS.map(() => []).concat([[]]);
  for (const s of rest) byBand[bandOf(s.M)].push(s);
  const files = [];
  let base = headCount;
  byBand.forEach((list, band) => {
    for (const leaf of octLeaves(list, FILE_STARS)) {
      const cells = octLeaves(leaf, CELL_STARS).map((c) => c.sort((a, b) => a.M - b.M || (a.gaia < b.gaia ? -1 : a.gaia > b.gaia ? 1 : 0)));
      const stars = cells.flat();
      stars.forEach((s, k) => (s.index = base + k));
      files.push({ band, base, stars, cells });
      base += stars.length;
    }
  });
  const total = base;
  note(`head: ${core.n} + ${pinned.length} pinned = ${headCount}; band files: ${files.length} with ${total - headCount} stars; total ${total}`);

  // ── Writers ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const shuffled = (typed, width) => Buffer.from(shuffle(typed, width));
  function columns(list, deltaCells) {
    const n = list.length;
    const pos = new Float32Array(3 * n);
    const vel = new Int16Array(3 * n);
    const mag = new Int16Array(n);
    const teff = new Uint16Array(n);
    const flags = new Uint16Array(n);
    const origin = new Uint8Array(n);
    const spt = new Uint16Array(n);
    const con = new Uint8Array(n);
    list.forEach((s, k) => {
      for (let c = 0; c < 3; c++) {
        pos[3 * k + c] = s.pos[c];
        vel[3 * k + c] = Math.max(-32767, Math.min(32767, Math.round(s.vel[c] * 10)));
      }
      mag[k] = Math.round(s.M * 100);
      teff[k] = Math.min(65535, s.teff);
      flags[k] = s.flags;
      origin[k] = s.origin;
      spt[k] = spectOf(s.spect);
      con[k] = s.con;
    });
    roundMantissa(pos, POS_MANTISSA_BITS);
    if (deltaCells) {
      // M_V delta-coded within each cell (the first of a cell absolute).
      let k = 0;
      for (const len of deltaCells) {
        for (let j = len - 1; j > 0; j--) mag[k + j] -= mag[k + j - 1];
        k += len;
      }
    }
    return { pos, vel, mag, teff, flags, origin, spt, con };
  }
  /** Header + sections, each 4-byte aligned. */
  function pack(magic, count, sections, headerSize = 64) {
    const offsets = [];
    let size = headerSize;
    for (const s of sections) {
      size = (size + 3) & ~3;
      offsets.push(size);
      size += s.length;
    }
    const buf = Buffer.alloc(size);
    buf.write(magic, 0, 'ascii');
    buf.writeUInt16LE(1, 4);
    buf.writeUInt16LE(headerSize, 6);
    buf.writeUInt32LE(count, 8);
    buf.writeFloatLE(2000, 12);
    buf.writeFloatLE(0.1, 16);
    buf.writeFloatLE(0.01, 20);
    buf.writeUInt32LE(sections.length, 24);
    offsets.forEach((o, k) => buf.writeUInt32LE(o, 28 + 4 * k));
    sections.forEach((s, k) => s.copy(buf, offsets[k]));
    return buf;
  }
  const gz = (b) => gzipSync(b, { level: 9, memLevel: 9 });

  // Head: LSS3 (the core's layout) + origin, spectral type and constellation.
  {
    const c = columns(pinned, null);
    const buf = pack('LSS3', pinned.length, [shuffled(c.pos, 4), shuffled(c.vel, 2), shuffled(c.mag, 2), shuffled(c.teff, 2), shuffled(c.flags, 2), Buffer.from(c.origin), shuffled(c.spt, 2), Buffer.from(c.con)]);
    const g = gz(buf);
    writeFileSync(join(OUT_DATA, 'stars3d-head.bin.gz'), g);
    note(`stars3d-head.bin.gz: ${pinned.length} stars, ${buf.length} bytes raw, ${g.length} gzipped`);
    const why = { host: pinned.filter((s) => s.host).length, census: pinned.filter((s) => s.group === 'census').length, gliese: pinned.filter((s) => s.names?.gl).length, nearSun: pinned.filter((s) => s.nearSun).length, bh: pinned.filter((s) => s.bhHole).length };
    note(`  pinned: ${why.host} exoplanet hosts, ${why.census} census objects, ${why.gliese} Gliese stars, ${why.nearSun} seen from near the Sun at some date, ${why.bh} black-hole companions`);
    // The black holes' companions: src/sim/blackholes/blackholes.json points at them (its companion "<hole>-star").
    const bhFile = join(ROOT, 'src', 'sim', 'blackholes', 'blackholes.json');
    let bh = readFileSync(bhFile, 'utf8');
    for (const s of pinned) {
      if (!s.bhHole) continue;
      note(`  ${s.bhHole} companion: Gaia DR3 ${s.gaia} -> star index ${s.index}`);
      const at = bh.indexOf(`"id": "${s.bhHole}-star"`);
      const ci = bh.indexOf('"catalogueIndex": ', at);
      if (at < 0 || ci < 0) throw new Error(`blackholes.json: no companion ${s.bhHole}-star`);
      const end = bh.indexOf(',', ci);
      bh = bh.slice(0, ci) + `"catalogueIndex": ${s.index}` + bh.slice(end);
    }
    writeFileSync(bhFile, bh);
  }

  // Band files and the index.
  if (existsSync(OUT_BANDS)) rmSync(OUT_BANDS, { recursive: true });
  mkdirSync(OUT_BANDS, { recursive: true });
  const fileRecs = [];
  const cellRecs = [];
  const KV = KMS_TO_PC_PER_YR;
  files.forEach((f, fi) => {
    const counts = f.cells.map((c) => c.length);
    const c = columns(f.stars, counts);
    const cellTable = Buffer.from(new Uint16Array(counts).buffer);
    const buf = pack('LSB1', f.stars.length, [cellTable, shuffled(c.pos, 4), shuffled(c.vel, 2), shuffled(c.mag, 2), shuffled(c.teff, 2), shuffled(c.flags, 2), Buffer.from(c.origin), shuffled(c.spt, 2), Buffer.from(c.con)]);
    const g = gz(buf);
    writeFileSync(join(OUT_BANDS, `${String(fi).padStart(4, '0')}.bin.gz`), g);
    // Boxes: J2000 (each star at its place plus its light-time's motion, as the shader draws it) and ±1 Myr.
    const box = () => ({ lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const grow = (b, p) => {
      for (let k = 0; k < 3; k++) {
        if (p[k] < b.lo[k]) b.lo[k] = p[k];
        if (p[k] > b.hi[k]) b.hi[k] = p[k];
      }
    };
    const fb = [box(), box(), box()];
    let mMin = Infinity;
    let vmax = 0;
    let k0 = 0;
    for (const cell of f.cells) {
      const cb = box();
      let cm = Infinity;
      for (let j = 0; j < cell.length; j++) {
        const q = k0 + j;
        const p = [c.pos[3 * q], c.pos[3 * q + 1], c.pos[3 * q + 2]];
        const v = [c.vel[3 * q] * 0.1, c.vel[3 * q + 1] * 0.1, c.vel[3 * q + 2] * 0.1];
        const lt = Math.hypot(...p) / C_PC_PER_YR;
        const p0 = p.map((x, a) => x + v[a] * KV * lt);
        grow(cb, p0);
        grow(fb[0], p0);
        grow(fb[1], p0.map((x, a) => x + v[a] * KV * MOTION_YEARS));
        grow(fb[2], p0.map((x, a) => x - v[a] * KV * MOTION_YEARS));
        cm = Math.min(cm, cell[j].M);
        vmax = Math.max(vmax, Math.hypot(...v));
      }
      k0 += cell.length;
      mMin = Math.min(mMin, cm);
      cellRecs.push({ file: fi, count: cell.length, mMin: cm, box: cb });
    }
    fileRecs.push({ base: f.base, count: f.stars.length, cells: f.cells.length, bytes: g.length, band: f.band, mMin, vmax, boxes: fb });
  });
  {
    // Index: files, then cells with their boxes quantised outward to 8 bits inside the file's J2000 box.
    const nF = fileRecs.length;
    const nC = cellRecs.length;
    const u32 = (arr) => shuffled(Uint32Array.from(arr), 4);
    const fBoxes = new Float32Array(nF * 18);
    fileRecs.forEach((r, i) => r.boxes.forEach((b, j) => [...b.lo, ...b.hi].forEach((x, q) => (fBoxes[18 * i + 6 * j + q] = x))));
    // Outward float32 rounding of the boxes.
    for (let i = 0; i < nF; i++)
      for (let j = 0; j < 3; j++)
        for (let q = 0; q < 6; q++) {
          const x = fileRecs[i].boxes[j][q < 3 ? 'lo' : 'hi'][q % 3];
          let f = Math.fround(x);
          if (q < 3 && f > x) f = Math.fround(x - Math.abs(x) * 1e-6 - 1e-6);
          if (q >= 3 && f < x) f = Math.fround(x + Math.abs(x) * 1e-6 + 1e-6);
          fBoxes[18 * i + 6 * j + q] = f;
        }
    const cMin = new Int16Array(nC);
    const cCount = new Uint16Array(nC);
    const cBox = new Uint8Array(nC * 6);
    cellRecs.forEach((c, k) => {
      cMin[k] = Math.floor(c.mMin * 100);
      cCount[k] = c.count;
      const o = 18 * c.file;
      for (let a = 0; a < 3; a++) {
        const lo = fBoxes[o + a];
        const span = fBoxes[o + 3 + a] - lo || 1;
        cBox[6 * k + a] = Math.max(0, Math.min(255, Math.floor(((c.box.lo[a] - lo) / span) * 255)));
        cBox[6 * k + 3 + a] = Math.max(0, Math.min(255, Math.ceil(((c.box.hi[a] - lo) / span) * 255)));
      }
    });
    const sections = [
      u32(fileRecs.map((r) => r.base)),
      u32(fileRecs.map((r) => r.count)),
      u32(fileRecs.map((r) => r.cells)),
      u32(fileRecs.map((r) => r.bytes)),
      Buffer.from(Uint8Array.from(fileRecs.map((r) => r.band))),
      shuffled(Int16Array.from(fileRecs.map((r) => Math.floor(r.mMin * 100))), 2),
      shuffled(Float32Array.from(fileRecs.map((r) => Math.fround(r.vmax * 1.000001 + 0.01))), 4),
      shuffled(fBoxes, 4),
      shuffled(cMin, 2),
      shuffled(cCount, 2),
      Buffer.from(cBox),
    ];
    const buf = pack('LSI1', nF, sections, 128);
    buf.writeUInt32LE(headCount, 72);
    buf.writeUInt32LE(total, 76);
    buf.writeUInt32LE(nC, 80);
    buf.writeUInt32LE(core.n, 84);
    const g = gz(buf);
    writeFileSync(join(OUT_DATA, 'stars3d-index.bin.gz'), g);
    const bytes = fileRecs.map((r) => r.bytes).sort((a, b) => a - b);
    note(`stars3d-index.bin.gz: ${nF} files, ${nC} cells, ${buf.length} bytes raw, ${g.length} gzipped`);
    note(`band files: ${bytes.reduce((a, b) => a + b, 0)} bytes in all; median ${bytes[bytes.length >> 1]}, 90% ${bytes[Math.floor(bytes.length * 0.9)]}, largest ${bytes[bytes.length - 1]}`);
    for (let b = 0; b <= BANDS.length; b++) {
      const fr = fileRecs.filter((r) => r.band === b);
      note(`  band ${b} (M_V ${b ? BANDS[b - 1] : '−∞'} to ${BANDS[b] ?? '∞'}): ${fr.reduce((s, r) => s + r.count, 0)} stars in ${fr.length} files, ${fr.reduce((s, r) => s + r.bytes, 0)} bytes`);
    }
  }

  // ── Names appended ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    const all = [...pinned, ...files.flatMap((f) => f.stars)];
    const hipP = decodeCol(names.hip);
    const hdP = decodeCol(names.hd);
    const hrP = decodeCol(names.hr);
    const proper = strip(names.proper);
    const gliese = strip(names.gliese);
    const variable = strip(names.variable);
    for (const s of all) {
      const nm = s.names;
      if (!nm) continue;
      if (nm.hip) hipP.push([s.index, Number(nm.hip)]);
      if (nm.hd) hdP.push([s.index, Number(nm.hd)]);
      if (nm.gl) gliese.push([s.index, nm.gl]);
      if (nm.proper) proper.push([s.index, nm.proper, 0]);
      if (nm.census) proper.push([s.index, nm.census, 0]);
      if (nm.variable) variable.push([s.index, nm.variable]);
    }
    const col = (pairs) => {
      pairs.sort((a, b) => a[0] - b[0]);
      let prev = 0;
      const di = [];
      for (const [i] of pairs) {
        di.push(i - prev);
        prev = i;
      }
      return { indexDelta: di, id: pairs.map((p) => p[1]) };
    };
    const outNames = {
      ...names,
      count: total,
      coreCount,
      coreSpectralTypes,
      note: 'Indices refer to the stars as the app numbers them: stars3d.bin.gz (0-based, brightest first), then stars3d-head.bin.gz, then the band files in stars3d-index.bin.gz order. See docs/data/stars.md.',
      spectralTypes,
      proper: proper.sort((a, b) => a[0] - b[0]),
      gliese: gliese.sort((a, b) => a[0] - b[0]),
      variable: variable.sort((a, b) => a[0] - b[0]),
      hip: col(hipP),
      hd: col(hdP),
      hr: col(hrP),
    };
    const g = gzipSync(Buffer.from(JSON.stringify(outNames)), { level: 9 });
    writeFileSync(join(OUT_DATA, 'star-names.json.gz'), g);
    note(`star-names.json.gz: ${g.length} bytes gzipped; ${hipP.length} HIP, ${hdP.length} HD, ${gliese.length} Gliese, ${variable.length} variable, ${proper.length} proper names; ${spectralTypes.length} spectral types`);
  }

  // Distances.
  {
    const shells = [10, 30.66, 100, 500, 1000, 2000, 3000, 5000, 8000];
    const cnt = shells.map(() => 0);
    for (let i = 0; i < core.n; i++) {
      const d = Math.hypot(core.pos[3 * i], core.pos[3 * i + 1], core.pos[3 * i + 2]);
      shells.forEach((r, k) => d <= r && cnt[k]++);
    }
    for (const s of out) {
      const d = Math.hypot(...s.pos);
      shells.forEach((r, k) => d <= r && cnt[k]++);
    }
    note(`all stars by distance (cumulative): ${shells.map((r, k) => `<= ${r} pc ${cnt[k]}`).join(', ')}`);
  }
  writeFileSync(join(OUT_DOCS, 'stars-ext-build-log.txt'), log.join('\n') + '\n');
  note(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
