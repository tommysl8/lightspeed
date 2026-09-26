// Builds the 3D star catalogue, its names table and the star-systems file.
//
//   public/data/stars3d.bin.gz     ~330,000 stars: position, space velocity, absolute magnitude, temperature, flags
//   public/data/star-names.json.gz names and catalogue numbers for search, spectral types
//   staging/stars/systems.json     Alpha Centauri, Sirius, Procyon, 61 Cygni and Capella as orbiting systems, plus
//                                  radii, temperatures, luminosities and masses of ~40 named stars
//
// The byte layout, frames, units and methods are documented in staging/stars/stars.md. Run from the repo root:
//
//   node scripts/build-stars3d.mjs            build from the cached downloads in data-raw/
//   node scripts/build-stars3d.mjs --fetch    first download any missing input (never re-downloads a cached file)
//
// Inputs (data-raw/, not redistributed):
//   athyg_40_reduced_m10.csv.gz   AT-HYG v4.0 "reduced m10" subset (astronexus, CC BY-SA 4.0)
//   gaia_dr3_athyg40_m10.csv.gz   Gaia DR3 columns for those stars (ESA/Gaia/DPAC; queried from the Gaia archive TAP)
//   gaia_dr3_positions_athyg40_m10.csv.gz  Gaia DR3 positions for the ~1,700 stars whose AT-HYG position is not a
//                                 J2000 mean position (Tycho-2 "non-mean" and Gliese positions)
//   hip1_phot.csv.gz              Hipparcos Catalogue V, B-V and their source flags (ESA 1997; VizieR I/239)
//   hip2_plx.csv.gz               Hipparcos new reduction parallaxes (van Leeuwen 2007; VizieR I/311)
//   hip2_pos.csv.gz               Hipparcos new reduction positions (epoch J1991.25) and proper motions (VizieR I/311),
//                                 used where AT-HYG's position is not a J2000 position (see "positions" below)
//   orb6orbits_2026-09-25.txt     Sixth Catalog of Orbits of Visual Binary Stars (USNO/GSU): the xi UMa AB orbit
//   hyg_v44.csv.gz                HYG v4.4 (astronexus, CC BY-SA 4.0): variable-star designations
//   exopla_modern_iau_star_names_2026-09-25.html  IAU WGSN star-name list as published at exopla.net
//   EEM_dwarf_UBVIJHK_colors_Teff.txt             Pecaut & Mamajek (2013) dwarf colour sequence, v2022.04.16
//   scripts/star-literature.mjs   published orbits and stellar parameters (with references)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync, constants as zc } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEMS, STARS, REFS, SUN } from './star-literature.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const OUT_DATA = join(ROOT, 'public', 'data');
const OUT_STAGING = join(ROOT, 'staging', 'stars');

// ---------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;
const AU_KM = 149597870.7; // IAU 2012 B2, exact
const PC_KM = (AU_KM * 648000) / Math.PI; // 3.0856775814913673e13 km
const JYEAR_S = 365.25 * 86400; // Julian year
const KMS_TO_PC_PER_YR = JYEAR_S / PC_KM; // 1.0227121650537077e-6
const K_PM = AU_KM / JYEAR_S; // 4.740470463533348 km/s per (arcsec/yr * pc), i.e. v_t = K * mu[mas/yr] / plx[mas]
const GM_SUN_KM3S2 = SUN.gmM3s2 / 1e9;
const JD_J2000 = 2451545.0;
const RSUN_AU = SUN.radiusKm / AU_KM;
const SIGMA_SB = 5.670374419e-8;
// Obliquity of the J2000 ecliptic, 84381.448 arcsec (IAU 1976), as used by JPL for "ecliptic of J2000" and by the app.
const EPS = (84381.448 / 3600) * DEG;
const COS_E = Math.cos(EPS);
const SIN_E = Math.sin(EPS);

const POS_MANTISSA_BITS = 19; // float32 positions keep 19 of 23 mantissa bits (max relative error 2^-20 per axis)
const VEL_UNIT = 0.1; // km/s per int16 step
const ABSMAG_UNIT = 0.01; // mag per int16 step
const TEFF_STEP = 10; // K; temperatures are rounded to this
const VEL_REJECT_KMS = 1000; // heliocentric speeds above this are treated as bad data (see stars.md)
const NEIGHBOUR_ARCSEC = 10; // companions closer than this are assumed to be inside Hipparcos' combined photometry
const MIN_PLAUSIBLE_ABS_V = -10; // no known star is brighter than M_V ~ -10; poor parallaxes implying more are dropped
const KEEP_WITHOUT_DISTANCE_V = 4.5; // prominent stars (constellation figures) are kept even without a usable parallax

const jyToJd = (y) => JD_J2000 + (y - 2000) * 365.25;

// ---------------------------------------------------------------------------------------------------------------
// Downloads (only with --fetch, and only when missing)
// ---------------------------------------------------------------------------------------------------------------

const GAIA_COLUMNS =
  'source_id, parallax, parallax_error, pmra, pmdec, radial_velocity, radial_velocity_error, grvs_mag, ' +
  'rv_template_teff, ruwe, phot_g_mean_mag, nu_eff_used_in_astrometry, pseudocolour, ecl_lat, astrometric_params_solved';

const GAIA_POS_COLUMNS = 'source_id, ref_epoch, ra, dec, parallax, pmra, pmdec, radial_velocity';

async function tap(endpoint, query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: '500000', QUERY: query }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      console.warn(`  retry ${attempt + 1}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
    }
  }
  throw new Error(`TAP query failed: ${endpoint}`);
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function fetchMissing() {
  mkdirSync(RAW, { recursive: true });
  const has = (f) => existsSync(join(RAW, f));
  const simple = [
    ['athyg_40_reduced_m10.csv.gz', 'https://codeberg.org/astronexus/athyg/media/branch/main/data/subsets/athyg_40_reduced_m10.csv.gz'],
    ['EEM_dwarf_UBVIJHK_colors_Teff.txt', 'https://www.pas.rochester.edu/~emamajek/EEM_dwarf_UBVIJHK_colors_Teff.txt'],
    ['exopla_modern_iau_star_names_2026-09-25.html', 'https://exopla.net/star-names/modern-iau-star-names/'],
  ];
  for (const [f, url] of simple) {
    if (has(f)) continue;
    console.log(`fetch ${f}`);
    await download(url, join(RAW, f));
  }
  if (!has('hyg_v44.csv.gz')) throw new Error('data-raw/hyg_v44.csv.gz is missing: download HYG v4.4 from https://codeberg.org/astronexus/hyg');
  const vizier = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
  if (!has('hip1_phot.csv.gz')) {
    console.log('fetch hip1_phot.csv.gz (VizieR I/239)');
    const t = await tap(vizier, 'SELECT HIP, Vmag, r_Vmag, "B-V", "e_B-V", "r_B-V", VarFlag, MultFlag FROM "I/239/hip_main"');
    writeFileSync(join(RAW, 'hip1_phot.csv.gz'), gzipSync(Buffer.from(t)));
  }
  if (!has('hip2_plx.csv.gz')) {
    console.log('fetch hip2_plx.csv.gz (VizieR I/311)');
    const t = await tap(vizier, 'SELECT HIP, Plx, e_Plx, pmRA, pmDE, Hpmag FROM "I/311/hip2"');
    writeFileSync(join(RAW, 'hip2_plx.csv.gz'), gzipSync(Buffer.from(t)));
  }
  if (!has('hip2_pos.csv.gz')) {
    console.log('fetch hip2_pos.csv.gz (VizieR I/311, positions at epoch J1991.25)');
    const t = await tap(vizier, 'SELECT HIP, RArad, DErad, pmRA, pmDE FROM "I/311/hip2"');
    writeFileSync(join(RAW, 'hip2_pos.csv.gz'), gzipSync(Buffer.from(t)));
  }
  if (!has('gaia_dr3_athyg40_m10.csv.gz')) {
    console.log('fetch gaia_dr3_athyg40_m10.csv.gz (Gaia archive TAP, 5,000 ids per query)');
    const ids = [...new Set(readAthyg().rows.map((r) => r.gaia).filter(Boolean))];
    let header = null;
    const lines = [];
    for (let i = 0; i < ids.length; i += 5000) {
      const q = `SELECT ${GAIA_COLUMNS} FROM gaiadr3.gaia_source WHERE source_id IN (${ids.slice(i, i + 5000).join(',')})`;
      const t = (await tap('https://gea.esac.esa.int/tap-server/tap/sync', q)).split(/\r?\n/).filter(Boolean);
      if (!t[0].startsWith('source_id')) throw new Error(`unexpected Gaia reply: ${t[0].slice(0, 200)}`);
      header ??= t[0];
      lines.push(...t.slice(1));
      console.log(`  ${Math.min(i + 5000, ids.length)} / ${ids.length}`);
    }
    writeFileSync(join(RAW, 'gaia_dr3_athyg40_m10.csv.gz'), gzipSync(Buffer.from([header, ...lines].join('\n') + '\n')));
  }
  if (!has('gaia_dr3_positions_athyg40_m10.csv.gz')) {
    console.log('fetch gaia_dr3_positions_athyg40_m10.csv.gz (Gaia archive TAP)');
    const ids = [...new Set(readAthyg().rows.filter((r) => r.gaia && (r.pos_src === 'T_X' || r.pos_src === 'GJ')).map((r) => r.gaia))];
    let header = null;
    const lines = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const q = `SELECT ${GAIA_POS_COLUMNS} FROM gaiadr3.gaia_source WHERE source_id IN (${ids.slice(i, i + 1000).join(',')})`;
      const t = (await tap('https://gea.esac.esa.int/tap-server/tap/sync', q)).split(/\r?\n/).filter(Boolean);
      if (!t[0].startsWith('source_id')) throw new Error(`unexpected Gaia reply: ${t[0].slice(0, 200)}`);
      header ??= t[0];
      lines.push(...t.slice(1));
    }
    writeFileSync(join(RAW, 'gaia_dr3_positions_athyg40_m10.csv.gz'), gzipSync(Buffer.from([header, ...lines].join('\n') + '\n')));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------------------------------------------

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

function readCsvGz(file) {
  const lines = gunzipSync(readFileSync(join(RAW, file))).toString('utf8').split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    const o = {};
    header.forEach((h, k) => (o[h] = (f[k] ?? '').trim()));
    rows.push(o);
  }
  return rows;
}

const num = (s) => (s === '' || s == null ? NaN : Number(s));

function readAthyg() {
  const rows = readCsvGz('athyg_40_reduced_m10.csv.gz');
  return { rows };
}

// ---------------------------------------------------------------------------------------------------------------
// Physics helpers
// ---------------------------------------------------------------------------------------------------------------

/** B-V -> colour temperature, Ballesteros (2012), EPL 97, 34008; same clamp as src/physics/blackbody.ts. */
function bvToTemperature(bv) {
  const x = Math.min(2.0, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * x + 1.7) + 1 / (0.92 * x + 0.62));
}

const unitFromRaDec = (raDeg, decDeg) => {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};

/** ICRS equatorial -> J2000 ecliptic (rotation about x by the J2000 obliquity). */
const eqToEcl = (v) => [v[0], COS_E * v[1] + SIN_E * v[2], -SIN_E * v[1] + COS_E * v[2]];

/** Heliocentric position (pc) and velocity (km/s), ICRS axes, from astrometry. */
function stateFromAstrometry({ raDeg, decDeg, parallaxMas, pmRaMasYr, pmDecMasYr, rvKms }) {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const r = unitFromRaDec(raDeg, decDeg);
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const dist = 1000 / parallaxMas;
  const va = Number.isFinite(pmRaMasYr) ? (K_PM * pmRaMasYr) / parallaxMas : 0;
  const vd = Number.isFinite(pmDecMasYr) ? (K_PM * pmDecMasYr) / parallaxMas : 0;
  const vr = Number.isFinite(rvKms) ? rvKms : 0;
  return {
    pos: r.map((x) => x * dist),
    vel: [0, 1, 2].map((k) => vr * r[k] + va * east[k] + vd * north[k]),
  };
}

const propagate = (s, dtYr) => ({ pos: s.pos.map((x, k) => x + s.vel[k] * dtYr * KMS_TO_PC_PER_YR), vel: [...s.vel] });
const add = (a, b) => a.map((x, k) => x + b[k]);
const sub = (a, b) => a.map((x, k) => x - b[k]);
const scale = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

function solveKepler(M, e) {
  let m = M % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  if (m < -Math.PI) m += 2 * Math.PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - m;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-15) break;
  }
  return E;
}

/** Campbell (visual-binary) elements -> orbit basis vectors P, Q in ICRS for a system at (ra, dec). */
function campbellBasis({ iDeg, OmegaDeg, omegaDeg }, raDeg, decDeg) {
  const i = iDeg * DEG;
  const O = OmegaDeg * DEG;
  const w = omegaDeg * DEG;
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const s = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; // away from the observer
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  // Thiele-Innes constants per unit semi-major axis (x = north, y = east, z = away from the observer)
  const A = Math.cos(w) * Math.cos(O) - Math.sin(w) * Math.sin(O) * Math.cos(i);
  const B = Math.cos(w) * Math.sin(O) + Math.sin(w) * Math.cos(O) * Math.cos(i);
  const F = -Math.sin(w) * Math.cos(O) - Math.cos(w) * Math.sin(O) * Math.cos(i);
  const G = -Math.sin(w) * Math.sin(O) + Math.cos(w) * Math.cos(O) * Math.cos(i);
  const C = Math.sin(w) * Math.sin(i);
  const H = Math.cos(w) * Math.sin(i);
  const P = [0, 1, 2].map((k) => A * north[k] + B * east[k] + C * s[k]);
  const Q = [0, 1, 2].map((k) => F * north[k] + G * east[k] + H * s[k]);
  return { P, Q, north, east, s };
}

/** Relative position (AU) and velocity (km/s) of an orbit given as {aAu, e, periodDays, tPeriJD, P, Q}. */
function orbitState(o, jd) {
  const n = (2 * Math.PI) / o.periodDays; // rad/day
  const E = solveKepler(n * (jd - o.tPeriJD), o.e);
  const cE = Math.cos(E);
  const sE = Math.sin(E);
  const b = Math.sqrt(1 - o.e * o.e);
  const x = o.aAu * (cE - o.e);
  const y = o.aAu * b * sE;
  const Edot = n / (1 - o.e * cE); // rad/day
  const vx = -o.aAu * sE * Edot;
  const vy = o.aAu * b * cE * Edot;
  const auPerDayToKms = AU_KM / 86400;
  return {
    pos: [0, 1, 2].map((k) => x * o.P[k] + y * o.Q[k]),
    vel: [0, 1, 2].map((k) => (vx * o.P[k] + vy * o.Q[k]) * auPerDayToKms),
  };
}

/** Osculating orbit from a relative state (pos AU, vel km/s) at jd0 with mu = G*M (M in solar masses). */
function orbitFromState(posAu, velKms, massMsun, jd0) {
  const mu = GM_SUN_KM3S2 * massMsun; // km^3/s^2
  const r = posAu.map((x) => x * AU_KM);
  const v = velKms;
  const rn = norm(r);
  const vn2 = dot(v, v);
  const a = 1 / (2 / rn - vn2 / mu); // km
  if (!(a > 0)) throw new Error('unbound relative orbit');
  const h = cross(r, v);
  const evec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rn));
  const e = norm(evec);
  const P = scale(evec, 1 / e);
  const Q = cross(scale(h, 1 / norm(h)), P);
  const cosE = (1 - rn / a) / e;
  const sinE = dot(r, v) / (e * Math.sqrt(mu * a));
  const E0 = Math.atan2(sinE, cosE);
  const M0 = E0 - e * Math.sin(E0);
  const nRadPerS = Math.sqrt(mu / (a * a * a));
  const periodDays = (2 * Math.PI) / nRadPerS / 86400;
  const tPeriJD = jd0 - M0 / nRadPerS / 86400;
  return { aAu: a / AU_KM, e, periodDays, tPeriJD, P, Q };
}

/** Classical angles of an orbit basis in the frame whose z axis is the reference pole (here: ecliptic). */
function anglesFromBasis(P, Q) {
  const hvec = cross(P, Q);
  const i = Math.acos(Math.max(-1, Math.min(1, hvec[2])));
  const node = [-hvec[1], hvec[0], 0];
  const nn = norm(node);
  let Omega = nn > 1e-12 ? Math.atan2(node[1], node[0]) : 0;
  const nhat = nn > 1e-12 ? scale(node, 1 / nn) : [1, 0, 0];
  let omega = Math.atan2(dot(cross(nhat, P), hvec), dot(nhat, P));
  const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { iDeg: i / DEG, OmegaDeg: wrap(Omega) / DEG, omegaDeg: wrap(omega) / DEG };
}

// ---------------------------------------------------------------------------------------------------------------
// Gaia DR3 parallax zero-point (Lindegren et al. 2021, A&A 649, A4, Tables 9 and 10; Z5 and Z6 functions).
// Port of the reference implementation (gaiadr3_zeropoint, coefficient tables dated 2020-07-20). Returns mas.
// ---------------------------------------------------------------------------------------------------------------

const Z5 = {
  j: [0, 0, 0, 1, 1, 2, 3, 4],
  k: [0, 1, 2, 0, 1, 0, 0, 0],
  g: [6.0, 10.8, 11.2, 11.8, 12.2, 12.9, 13.1, 15.9, 16.1, 17.5, 19.0, 20.0, 21.0],
  q: [
    [-26.98, -9.62, 27.4, -25.1, -0.0, -1257, 0, 0],
    [-27.23, -3.07, 23.04, 35.3, 15.7, -1257, 0, 0],
    [-30.33, -9.23, 9.08, -88.4, -11.8, -1257, 0, 0],
    [-33.54, -10.08, 13.28, -126.7, 11.6, -1257, 0, 0],
    [-13.65, -0.07, 9.35, -111.4, 40.6, -1257, 0, 0],
    [-19.53, -1.64, 15.86, -66.8, 20.6, -1257, 0, 0],
    [-37.99, 2.63, 16.14, -5.7, 14.0, -1257, 107.9, 104.3],
    [-38.33, 5.61, 15.42, 0, 18.7, -1189, 243.8, 155.2],
    [-31.05, 2.83, 8.59, 0, 15.5, -1404, 105.5, 170.7],
    [-29.18, -0.09, 2.41, 0, 24.5, -1165, 189.7, 325.0],
    [-18.4, 5.98, -6.46, 0, 5.5, 0, 0, 276.6],
    [-12.65, -4.57, -7.46, 0, 97.9, 0, 0, 0],
    [-18.22, -15.24, -18.54, 0, 128.2, 0, 0, 0],
  ],
};
const Z6 = {
  j: [0, 0, 0, 1, 1, 1, 2],
  k: [0, 1, 2, 0, 1, 2, 0],
  g: Z5.g,
  q: [
    [-27.85, -7.78, 27.47, -32.1, 14.4, 9.5, -67],
    [-28.91, -3.57, 22.92, 7.7, 12.6, 1.6, -572],
    [-26.72, -8.74, 9.36, -30.3, 5.6, 17.2, -1104],
    [-29.04, -9.69, 13.63, -49.4, 36.3, 17.7, -1129],
    [-12.39, -2.16, 10.23, -92.6, 19.8, 27.6, -365],
    [-18.99, -1.93, 15.9, -57.2, -8.0, 19.9, -554],
    [-38.29, 2.59, 16.2, -10.5, 1.4, 0.4, -960],
    [-36.83, 4.2, 15.76, 22.3, 11.1, 10.0, -1367],
    [-28.37, 1.99, 9.28, 50.4, 17.2, 13.7, -1351],
    [-24.68, -1.37, 3.52, 86.8, 19.8, 21.3, -1380],
    [-15.32, 4.01, -6.03, 29.2, 14.1, 0.4, -563],
    [-13.73, -10.92, -8.3, -74.4, 196.4, -42.0, 536],
    [-29.53, -20.34, -18.74, -39.5, 326.8, -262.3, 1598],
  ],
};

/** Returns { zp (mas), valid } for a 5p (31) or 6p (95) solution; valid=false outside 6<G<21 / colour range. */
function zeroPoint(G, nuEff, pseudocolour, eclLatDeg, paramsSolved) {
  let tab;
  let colour;
  if (paramsSolved === 31) {
    tab = Z5;
    colour = nuEff;
  } else if (paramsSolved === 95) {
    tab = Z6;
    colour = pseudocolour;
  } else return null;
  if (!Number.isFinite(G) || !Number.isFinite(colour) || !Number.isFinite(eclLatDeg)) return null;
  const valid =
    G > 6 && G < 21 && (paramsSolved === 31 ? colour > 1.1 && colour < 1.9 : colour > 1.24 && colour < 1.72);
  const c = [
    1,
    Math.max(-0.24, Math.min(0.24, colour - 1.48)),
    Math.min(0.24, Math.max(0, 1.48 - colour)) ** 3,
    Math.min(0, colour - 1.24),
    Math.max(0, colour - 1.72),
  ];
  const sb = Math.sin(eclLatDeg * DEG);
  const b = [1, sb, sb * sb - 1 / 3];
  const g = tab.g;
  const n = g.length;
  // bin such that g[ig] <= G < g[ig+1], clamped to [0, n-2] (numpy.digitize(right=False) - 1)
  let ig = 0;
  while (ig < n && G >= g[ig]) ig++;
  ig = Math.max(0, Math.min(n - 2, ig - 1));
  const h = Math.max(0, Math.min(1, (G - g[ig]) / (g[ig + 1] - g[ig])));
  let zp = 0;
  for (let m = 0; m < tab.j.length; m++) {
    const q = (1 - h) * tab.q[ig][m] + h * tab.q[ig + 1][m];
    zp += q * c[tab.j[m]] * b[tab.k[m]];
  }
  return { zp: zp / 1000, valid };
}

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ',
  Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ',
  Psi: 'ψ', Ome: 'ω',
};

// The 88 IAU constellations: abbreviation, name, genitive (from d3-celestial's constellations.json, which lists
// Serpens twice, once per part; the duplicate is dropped).
const CONSTELLATIONS = (() => {
  const seen = new Set();
  const out = [];
  for (const f of JSON.parse(readFileSync(join(RAW, 'd3celestial_constellations.json'), 'utf8')).features) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push({ abbr: f.id, name: f.properties.name, genitive: f.properties.gen });
  }
  if (out.length !== 88) throw new Error(`expected 88 constellations, got ${out.length}`);
  return out;
})();
const CON_INDEX = new Map(CONSTELLATIONS.map((c, i) => [c.abbr.toLowerCase(), i + 1]));

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
}

function readIauNames() {
  const html = readFileSync(join(RAW, 'exopla_modern_iau_star_names_2026-09-25.html'), 'utf8');
  const decode = (s) =>
    s
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  const out = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => decode(m[1]));
    if (cells.length < 11 || cells[0] === 'proper names' || !cells[0]) continue;
    out.push({ name: cells[0], designation: cells[2], hip: cells[3], bayer: cells[4], con: cells[6], date: cells[10] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Spectral type -> B-V (dwarf sequence of Pecaut & Mamajek 2013, table v2022.04.16), used only when a star has no
// measured colour.
// ---------------------------------------------------------------------------------------------------------------

function readSptTable() {
  const lines = readFileSync(join(RAW, 'EEM_dwarf_UBVIJHK_colors_Teff.txt'), 'utf8').split(/\r?\n/);
  const out = [];
  let inTable = false;
  for (const l of lines) {
    if (l.startsWith('#SpT')) {
      if (inTable) break;
      inTable = true;
      continue;
    }
    if (!inTable || !l.trim()) continue;
    const f = l.trim().split(/\s+/);
    const m = /^([OBAFGKM])(\d+(?:\.\d+)?)V$/.exec(f[0]);
    const bv = Number(f[8]);
    if (m && Number.isFinite(bv)) out.push({ x: 'OBAFGKM'.indexOf(m[1]) * 10 + Number(m[2]), bv });
  }
  return out;
}

function sptToBv(spect, table) {
  const m = /^\s*([OBAFGKM])\s*(\d+(?:\.\d+)?)?/.exec(spect ?? '');
  if (!m) return NaN;
  const x = 'OBAFGKM'.indexOf(m[1]) * 10 + (m[2] ? Number(m[2]) : 5);
  if (x <= table[0].x) return table[0].bv;
  for (let k = 1; k < table.length; k++) {
    if (x <= table[k].x) {
      const t = (x - table[k - 1].x) / (table[k].x - table[k - 1].x);
      return table[k - 1].bv + t * (table[k].bv - table[k - 1].bv);
    }
  }
  return table[table.length - 1].bv;
}

// ---------------------------------------------------------------------------------------------------------------
// Binary packing
// ---------------------------------------------------------------------------------------------------------------

function roundMantissa(f32, bits) {
  const u = new Uint32Array(f32.buffer, f32.byteOffset, f32.length);
  const drop = 23 - bits;
  if (drop <= 0) return;
  const half = 1 << (drop - 1);
  const mask = ~((1 << drop) - 1) >>> 0;
  for (let i = 0; i < u.length; i++) {
    const exp = (u[i] >>> 23) & 0xff;
    if (exp === 0 || exp === 0xff) continue; // zero, denormal, inf, NaN: leave alone
    u[i] = ((u[i] + half) & mask) >>> 0;
  }
}

/** Byte-shuffle: element i's byte k goes to k*n + i (improves deflate on numeric columns). */
function shuffle(typed, width) {
  const b = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const n = b.length / width;
  const out = new Uint8Array(b.length);
  for (let i = 0; i < n; i++) for (let k = 0; k < width; k++) out[k * n + i] = b[i * width + k];
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------

async function main() {
  if (process.argv.includes('--fetch')) await fetchMissing();

  const log = [];
  const note = (s) => {
    log.push(s);
    console.log(s);
  };

  // --- inputs ---------------------------------------------------------------------------------------------------
  const athyg = readAthyg().rows;
  const gaia = new Map(readCsvGz('gaia_dr3_athyg40_m10.csv.gz').map((r) => [r.source_id, r]));
  const hip1 = new Map(readCsvGz('hip1_phot.csv.gz').map((r) => [r.HIP, r]));
  const hip2 = new Map(readCsvGz('hip2_plx.csv.gz').map((r) => [r.HIP, r]));
  const hip2pos = existsSync(join(RAW, 'hip2_pos.csv.gz')) ? new Map(readCsvGz('hip2_pos.csv.gz').map((r) => [r.HIP, r])) : new Map();
  if (!hip2pos.size) console.warn('warning: hip2_pos.csv.gz missing; AT-HYG positions at epoch J1991.25 are not corrected (run with --fetch)');
  const hygById = new Map();
  for (const r of readCsvGz('hyg_v44.csv.gz')) hygById.set(r.id, r);
  const gaiaPos = existsSync(join(RAW, 'gaia_dr3_positions_athyg40_m10.csv.gz'))
    ? new Map(readCsvGz('gaia_dr3_positions_athyg40_m10.csv.gz').map((r) => [r.source_id, r]))
    : new Map();
  if (!gaiaPos.size) console.warn('warning: gaia_dr3_positions_athyg40_m10.csv.gz missing; non-mean positions left as in AT-HYG (run with --fetch)');
  const sptTable = readSptTable();
  const iauNames = readIauNames();
  note(`inputs: AT-HYG ${athyg.length} rows, Gaia ${gaia.size}, HIP ${hip1.size}, HIP2 ${hip2.size}, IAU names ${iauNames.length}`);

  const litById = new Map(STARS.map((s) => [s.id, s]));
  const litByAthyg = new Map(STARS.filter((s) => s.athygId).map((s) => [String(s.athygId), s]));

  // --- Tycho-2 -> Johnson calibration from stars with ground-based Johnson photometry in the Hipparcos Catalogue ---
  const calib = (() => {
    const bins = new Map();
    for (const r of athyg) {
      if (r.mag_src !== 'T' || r.ci === '' || !r.hip) continue;
      const h = hip1.get(r.hip);
      if (!h || (h.MultFlag ?? '').trim()) continue;
      const t = num(r.ci);
      const vt = num(r.mag);
      if (!Number.isFinite(t) || !Number.isFinite(vt) || vt < 2.5) continue;
      const k = Math.round(t * 10);
      if (!bins.has(k)) bins.set(k, { t: [], bv: [], dv: [] });
      const b = bins.get(k);
      if (h['r_B-V'] === 'G' && h['B-V'] !== '') {
        b.t.push(t);
        b.bv.push(num(h['B-V']));
      }
      if (h.r_Vmag === 'G' && h.Vmag !== '') b.dv.push({ t, dv: num(h.Vmag) - vt });
    }
    const median = (a) => {
      const s = [...a].sort((x, y) => x - y);
      return s.length % 2 ? s[(s.length - 1) / 2] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]);
    };
    const bvKnots = [];
    const dvKnots = [];
    for (const k of [...bins.keys()].sort((a, b) => a - b)) {
      const b = bins.get(k);
      if (b.bv.length >= 20) bvKnots.push({ x: median(b.t), y: median(b.bv), n: b.bv.length, mad: median(b.bv.map((v) => Math.abs(v - median(b.bv)))) });
      if (b.dv.length >= 20) dvKnots.push({ x: median(b.dv.map((d) => d.t)), y: median(b.dv.map((d) => d.dv)), n: b.dv.length });
    }
    const interp = (knots, x) => {
      if (x <= knots[0].x) return knots[0].y + ((knots[1].y - knots[0].y) / (knots[1].x - knots[0].x)) * (x - knots[0].x);
      for (let k = 1; k < knots.length; k++) {
        if (x <= knots[k].x) return knots[k - 1].y + ((knots[k].y - knots[k - 1].y) / (knots[k].x - knots[k - 1].x)) * (x - knots[k - 1].x);
      }
      const a = knots[knots.length - 2];
      const b = knots[knots.length - 1];
      return b.y + ((b.y - a.y) / (b.x - a.x)) * (x - b.x);
    };
    const tMin = bvKnots[0].x;
    const tMax = bvKnots[bvKnots.length - 1].x;
    return {
      bvKnots,
      dvKnots,
      bv: (t) => interp(bvKnots, Math.min(tMax, Math.max(tMin, t))),
      dv: (t) => interp(dvKnots, Math.min(dvKnots[dvKnots.length - 1].x, Math.max(dvKnots[0].x, t))),
    };
  })();
  note(`Tycho-2 calibration: ${calib.bvKnots.length} B-V knots (${calib.bvKnots.reduce((s, k) => s + k.n, 0)} stars), ${calib.dvKnots.length} V-VT knots`);

  // --- spatial index for companion detection: 0.05-deg declination bands, RA bins ~0.05 deg wide ---
  const BAND = 0.05;
  const raBins = (band) => Math.max(1, Math.floor((360 * Math.cos(Math.min(89.99, Math.abs((band + 0.5) * BAND)) * DEG)) / BAND));
  const binOf = (band, raDeg) => Math.floor((((raDeg % 360) + 360) % 360) / (360 / raBins(band)));
  const grid = new Map();
  for (const r of athyg) {
    if (r.id === '1') continue;
    r._ra = num(r.ra) * 15;
    r._dec = num(r.dec);
    const band = Math.floor(r._dec / BAND);
    const key = band + ':' + binOf(band, r._ra);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(r);
  }
  const neighbours = (r, arcsec) => {
    const out = [];
    const u = unitFromRaDec(r._ra, r._dec);
    const cosLim = Math.cos((arcsec / 3600) * DEG);
    const b0 = Math.floor(r._dec / BAND);
    for (let band = b0 - 1; band <= b0 + 1; band++) {
      const nb = raBins(band);
      const c = binOf(band, r._ra);
      for (const k of new Set([(c - 1 + nb) % nb, c, (c + 1) % nb])) {
        for (const o of grid.get(band + ':' + k) ?? []) {
          if (o !== r && dot(u, unitFromRaDec(o._ra, o._dec)) >= cosLim) out.push(o);
        }
      }
    }
    return out;
  };

  // --- per-star photometry (V, B-V) --------------------------------------------------------------------------
  const DROP = new Map([['1421101', 'Tycho-2 1472-1436-2 ("Arcturus B"): unconfirmed companion suggested by Hipparcos; its Tycho photometry next to a V = -0.05 star is unreliable']]);

  function ownPhotometry(r) {
    const h = r.hip ? hip1.get(r.hip) : null;
    const tycho = r.mag_src === 'T';
    const vt = num(r.mag);
    const btvt = tycho ? num(r.ci) : NaN;
    const tychoUsable = tycho && Number.isFinite(vt) && vt >= 1.9 && Number.isFinite(btvt);
    let V = NaN;
    let vSrc = 'none';
    let BV = NaN;
    let colSrc = 3;
    if (h && h.Vmag !== '' && !(h.r_Vmag === 'T' && tychoUsable)) {
      V = num(h.Vmag);
      vSrc = h.r_Vmag === 'G' ? 'hip-ground' : 'hip';
    } else if (tychoUsable) {
      V = vt + calib.dv(btvt);
      vSrc = 'tycho';
    } else if (r.mag_src === 'GJ') {
      V = vt;
      vSrc = 'gliese';
    } else if (Number.isFinite(vt)) {
      V = vt; // Tycho VT without colour (or saturated): no transformation possible
      vSrc = 'tycho-raw';
    }
    if (h && h['r_B-V'] === 'G' && h['B-V'] !== '') {
      BV = num(h['B-V']);
      colSrc = 0;
    } else if (tychoUsable) {
      BV = calib.bv(btvt);
      colSrc = 1;
    } else if (h && h['B-V'] !== '') {
      BV = num(h['B-V']);
      colSrc = 1; // Hipparcos B-V derived from Tycho(-1) photometry
    } else if (r.mag_src === 'GJ' && r.ci !== '') {
      BV = num(r.ci);
      colSrc = 0;
    } else {
      const s = sptToBv(r.spect, sptTable);
      if (Number.isFinite(s)) {
        BV = s;
        colSrc = 2;
      }
    }
    return { V, vSrc, BV, colSrc, variable: !!(h && (h.VarFlag ?? '').trim()) };
  }

  const phot = new Map();
  for (const r of athyg) if (r.id !== '1' && !DROP.has(r.id)) phot.set(r, ownPhotometry(r));

  // Split combined Hipparcos photometry: subtract companions without their own HIP entry within 10".
  let splitCount = 0;
  const splitLog = [];
  for (const [r, p] of phot) {
    if (!r.hip || !(p.vSrc === 'hip' || p.vSrc === 'hip-ground')) continue;
    const comps = neighbours(r, NEIGHBOUR_ARCSEC).filter((o) => !o.hip && phot.has(o) && Number.isFinite(phot.get(o).V) && phot.get(o).V < p.V + 5);
    if (!comps.length) continue;
    const fTot = 10 ** (-0.4 * p.V);
    const fComp = comps.reduce((s, o) => s + 10 ** (-0.4 * phot.get(o).V), 0);
    if (fComp >= 0.95 * fTot) {
      splitLog.push(`  skip ${r.proper || 'HIP ' + r.hip}: companions brighter than the combined light`);
      continue;
    }
    const Vnew = -2.5 * Math.log10(fTot - fComp);
    const label = r.proper || (r.bayer ? r.bayer + ' ' + r.con : r.flam ? r.flam + ' ' + r.con : 'HIP ' + r.hip);
    if (p.V < 4) splitLog.push(`  ${label}: V ${p.V.toFixed(2)} -> ${Vnew.toFixed(2)} (${comps.map((o) => o.proper || o.tyc || o.id).join(', ')})`);
    p.V = Vnew;
    p.split = true;
    splitCount++;
  }
  note(`combined Hipparcos photometry split for ${splitCount} stars; bright ones:`);
  splitLog.forEach((s) => note(s));

  // --- distances, positions, velocities -------------------------------------------------------------------------
  const stats = { gaiaPositions: 0, distSrc: {}, prec: [0, 0, 0, 0], vel: [0, 0, 0, 0], rvGaia: 0, dropped: { noDistance: 0, manual: 0, implausible: 0 }, capped: [], hipBetter: 0, placeholder: 0, zpInvalid: 0, rvCorrFaint: 0, rvCorrHot: 0, hip2Rescued: 0, hip2Positions: 0, hip2PositionsAt1991: 0, hip2PositionLog: [], pmFill: { hip2: 0, gaia: 0, athygUnsourced: 0, none: 0 } };
  const stars = [];

  for (const r of athyg) {
    if (r.id === '1') continue; // the Sun
    if (DROP.has(r.id)) {
      stats.dropped.manual++;
      continue;
    }
    const p = phot.get(r);
    const g = r.gaia ? gaia.get(r.gaia) : null;
    let d = NaN;
    let distSrc = 6;
    let relErr = NaN;
    if (r.dist_src === 'G_R3' && g && g.parallax !== '') {
      const plx = num(g.parallax);
      const zpr = zeroPoint(num(g.phot_g_mean_mag), num(g.nu_eff_used_in_astrometry), num(g.pseudocolour), num(g.ecl_lat), Number(g.astrometric_params_solved));
      // Outside the L21 recipe's validity (G <= 6 or colour out of range) its value is clamped at the table edge;
      // for solutions it does not cover, the global offset -0.017 mas is used.
      const zp = zpr ? zpr.zp : -0.017;
      const plxc = plx - zp;
      if (plxc > 0) {
        d = 1000 / plxc;
        relErr = num(g.parallax_error) / plxc;
        distSrc = zpr && zpr.valid ? 0 : 1;
        if (!(zpr && zpr.valid)) stats.zpInvalid++;
      }
    } else if (r.dist_src === 'G_R3') {
      // Gaia DR3 distance in AT-HYG whose parallax row was not returned by the archive: global zero-point -0.017 mas
      const plx = 1000 / num(r.dist) + 0.017;
      d = 1000 / plx;
      distSrc = 1;
      stats.zpInvalid++;
    } else if (r.dist_src === 'G_R2') {
      // Gaia DR2 parallax (from AT-HYG's distance) corrected by the DR2 global zero-point, -0.029 mas (Lindegren et al. 2018)
      const plx = 1000 / num(r.dist) + 0.029;
      d = 1000 / plx;
      distSrc = 2;
    } else if (r.dist_src === 'H') {
      // Hipparcos. AT-HYG carries HYG's distance, where 100000 pc is HYG's placeholder for "no parallax".
      const placeholder = num(r.dist) >= 99999;
      const h2 = hip2.get(r.hip);
      const plx2 = h2 ? num(h2.Plx) : NaN;
      const rel2 = h2 ? num(h2.e_Plx) / plx2 : NaN;
      if (plx2 > 0 && rel2 < (placeholder ? 0.2 : 1)) {
        d = 1000 / plx2;
        relErr = rel2;
        distSrc = 3;
      } else if (!placeholder) {
        d = num(r.dist); // HYG's Hipparcos distance where the new reduction failed (e.g. some binaries)
        distSrc = 3;
      } else {
        stats.placeholder++;
      }
    } else if (r.dist_src === 'GJ') {
      d = num(r.dist);
      distSrc = 4;
    } else if (r.dist_src === 'OTHER') {
      d = num(r.dist);
      distSrc = 6;
    } else if (r.dist_src === 'N' && r.hip) {
      const h2 = hip2.get(r.hip);
      if (h2 && num(h2.Plx) > 0 && num(h2.Plx) / num(h2.e_Plx) >= 5) {
        d = 1000 / num(h2.Plx);
        relErr = num(h2.e_Plx) / num(h2.Plx);
        distSrc = 3;
        stats.hip2Rescued++;
      }
    }
    // Bright stars are often measured better by Hipparcos than by Gaia (which saturates near G = 6): use whichever
    // parallax has the smaller relative error.
    if ((distSrc === 0 || distSrc === 1) && r.hip) {
      const h2 = hip2.get(r.hip);
      const relHip = h2 && num(h2.Plx) > 0 ? num(h2.e_Plx) / num(h2.Plx) : Infinity;
      if (relHip < relErr) {
        d = 1000 / num(h2.Plx);
        relErr = relHip;
        distSrc = 3;
        stats.hipBetter++;
      }
    }
    if (!(d > 0) || !Number.isFinite(d)) {
      // No parallax at all: prominent stars are kept at the M_V = -10 upper limit below (flagged), others dropped.
      if (Number.isFinite(p.V) && p.V <= KEEP_WITHOUT_DISTANCE_V) {
        d = Infinity;
      } else {
        stats.dropped.noDistance++;
        continue;
      }
    }
    let prec = !Number.isFinite(relErr) ? 3 : relErr < 0.01 ? 0 : relErr < 0.05 ? 1 : relErr < 0.2 ? 2 : 3;
    // A parallax consistent with zero can imply a luminosity no star has. Prominent stars (V <= 4.5) are kept at the
    // largest distance that is still plausible (M_V = -10) and flagged (distance source 7); fainter ones are dropped.
    if (prec === 3 && Number.isFinite(p.V) && (d === Infinity || p.V - 5 * Math.log10(d / 10) < MIN_PLAUSIBLE_ABS_V)) {
      if (p.V > KEEP_WITHOUT_DISTANCE_V) {
        stats.dropped.implausible++;
        continue;
      }
      d = 10 * 10 ** ((p.V - MIN_PLAUSIBLE_ABS_V) / 5);
      distSrc = 7;
      prec = 3;
      stats.capped.push(`${r.proper || (r.bayer ? r.bayer + ' ' + r.con : '') || 'HIP ' + r.hip} (V ${p.V.toFixed(2)}) -> ${Math.round(d)} pc`);
    }

    // velocity. AT-HYG rows with pm_src "N" carry proper motions without a recorded source (mostly the original
    // Hipparcos values inherited from HYG, or a primary's values copied to its companion). Use the Hipparcos new
    // reduction where it has the star, else Gaia DR3, else AT-HYG's unsourced value; only rows with none stay at rest.
    let pmra = num(r.pmra);
    let pmdec = num(r.pmdec);
    const pmMissing = !Number.isFinite(pmra) || !Number.isFinite(pmdec);
    if (r.pm_src === 'N' || pmMissing) {
      const h2 = r.hip ? hip2.get(r.hip) : null;
      if (h2 && Number.isFinite(num(h2.pmRA)) && Number.isFinite(num(h2.pmDE))) {
        pmra = num(h2.pmRA);
        pmdec = num(h2.pmDE);
        stats.pmFill.hip2++;
      } else if (g && Number.isFinite(num(g.pmra)) && Number.isFinite(num(g.pmdec))) {
        pmra = num(g.pmra);
        pmdec = num(g.pmdec);
        stats.pmFill.gaia++;
      } else if (!pmMissing) {
        stats.pmFill.athygUnsourced++;
      } else {
        stats.pmFill.none++;
      }
    }
    let rv = NaN;
    let rvGaia = false;
    if (g && g.radial_velocity !== '') {
      rv = num(g.radial_velocity);
      const grvs = num(g.grvs_mag);
      const tt = num(g.rv_template_teff);
      if (Number.isFinite(tt) && tt >= 8500 && tt <= 14500 && grvs >= 6 && grvs <= 12) {
        rv = rv - 7.98 + 1.135 * grvs; // Blomme et al. 2023, A&A 674, A7
        stats.rvCorrHot++;
      } else if (!(tt >= 8500) && grvs >= 11) {
        rv -= 0.02755 * grvs * grvs - 0.55863 * grvs + 2.81129; // Katz et al. 2023, A&A 674, A5, eq. 5
        stats.rvCorrFaint++;
      }
      rvGaia = true;
    } else if (r.rv_src && r.rv_src !== 'N' && r.rv !== '' && !(num(r.rv) === 0 && r.rv_src === 'HYG')) {
      rv = num(r.rv);
    }
    let velStatus;
    if (!Number.isFinite(pmra) || !Number.isFinite(pmdec)) velStatus = 2;
    else velStatus = Number.isFinite(rv) ? 0 : 1;

    // Parallaxes refer to their mission's epoch (Gaia DR3 J2016.0, DR2 J2015.5, Hipparcos J1991.25); move the
    // distance to J2000 along the line of sight (matters only for fast nearby stars: Barnard's Star +0.0018 pc).
    const plxEpoch = distSrc <= 1 ? 2016.0 : distSrc === 2 ? 2015.5 : distSrc === 3 ? 1991.25 : NaN; // not for 4-7
    if (Number.isFinite(rv) && Number.isFinite(plxEpoch)) d += rv * (2000 - plxEpoch) * KMS_TO_PC_PER_YR;

    let ra = r._ra;
    let dec = r._dec;
    // AT-HYG positions flagged T_X (Tycho-2 observed, not mean, epoch ~1991) or GJ (Gliese) are not J2000 mean
    // positions; replace them by the Gaia DR3 position moved to J2000 with the star's own motion.
    const gp = (r.pos_src === 'T_X' || r.pos_src === 'GJ') && r.gaia ? gaiaPos.get(r.gaia) : null;
    if (gp && gp.ra !== '' && gp.pmra !== '' && num(gp.parallax) > 0) {
      const sg = stateFromAstrometry({ raDeg: num(gp.ra), decDeg: num(gp.dec), parallaxMas: num(gp.parallax), pmRaMasYr: num(gp.pmra), pmDecMasYr: num(gp.pmdec), rvKms: Number.isFinite(rv) ? rv : 0 });
      const p2000 = propagate(sg, 2000 - num(gp.ref_epoch)).pos;
      const rr = norm(p2000);
      ra = ((Math.atan2(p2000[1], p2000[0]) / DEG) + 360) % 360;
      dec = Math.asin(p2000[2] / rr) / DEG;
      stats.gaiaPositions++;
    }
    // Hipparcos stars whose AT-HYG position is not a J2000 mean position: the Tycho-2 supplement carries the
    // Hipparcos position at epoch J1991.25 for stars missing from Tycho-2 proper (Arcturus 19.9" off, Altair 5.8",
    // Vega 3.1"), and some positions inherited from HYG (pos_src HIP_X) are off by up to several arcseconds. Where the
    // AT-HYG position differs by more than 0.1" from the Hipparcos new-reduction position carried to J2000 along the
    // star's own motion, use the latter. (Checked against Gaia DR3 carried to J2000 for 2,480 of these stars: median
    // difference 0.02", against 0.05-0.8" for the AT-HYG positions.)
    const h2p = !gp && r.hip ? hip2pos.get(r.hip) : null;
    if (h2p && h2p.RArad !== '' && Number.isFinite(num(h2p.pmRA)) && Number.isFinite(num(h2p.pmDE))) {
      const ra91 = num(h2p.RArad);
      const dec91 = num(h2p.DErad);
      const s91 = stateFromAstrometry({ raDeg: ra91, decDeg: dec91, parallaxMas: 1000 / d, pmRaMasYr: num(h2p.pmRA), pmDecMasYr: num(h2p.pmDE), rvKms: Number.isFinite(rv) ? rv : 0 });
      const p2000 = propagate(s91, 2000 - 1991.25).pos;
      const rr = norm(p2000);
      const u00 = p2000.map((x) => x / rr);
      const sepArcsec = (Math.acos(Math.min(1, dot(u00, unitFromRaDec(ra, dec)))) / DEG) * 3600;
      if (sepArcsec > 0.1) {
        const at1991 = (Math.acos(Math.min(1, dot(unitFromRaDec(ra91, dec91), unitFromRaDec(ra, dec)))) / DEG) * 3600 < 0.1;
        if (at1991) stats.hip2PositionsAt1991++;
        if (Number.isFinite(p.V) && p.V < 3.5)
          stats.hip2PositionLog.push(`${r.proper || (r.bayer ? r.bayer + ' ' + r.con : 'HIP ' + r.hip)} ${sepArcsec.toFixed(2)}"${at1991 ? ' (J1991.25)' : ''}`);
        ra = ((Math.atan2(u00[1], u00[0]) / DEG) + 360) % 360;
        dec = Math.asin(u00[2]) / DEG;
        stats.hip2Positions++;
      }
    }
    const s = stateFromAstrometry({ raDeg: ra, decDeg: dec, parallaxMas: 1000 / d, pmRaMasYr: velStatus === 2 ? 0 : pmra, pmDecMasYr: velStatus === 2 ? 0 : pmdec, rvKms: rv });
    if (velStatus === 2) s.vel = [0, 0, 0];
    if (norm(s.vel) > VEL_REJECT_KMS) {
      velStatus = 3;
      s.vel = [0, 0, 0];
    }
    const ruwe = g ? num(g.ruwe) : NaN;

    stars.push({
      src: r,
      raDeg: ra,
      decDeg: dec,
      d,
      distSrc,
      prec,
      pos: eqToEcl(s.pos),
      vel: eqToEcl(s.vel),
      V: p.V,
      vSrc: p.vSrc,
      BV: p.BV,
      colSrc: p.colSrc,
      teff: Number.isFinite(p.BV) ? bvToTemperature(p.BV) : 0,
      velStatus,
      rvGaia: rvGaia && velStatus !== 3,
      ruweHigh: ruwe > 1.4,
      split: !!p.split,
      variable: p.variable || !!(r.hyg && hygById.get(r.hyg)?.var),
      spect: r.spect,
      con: r.con,
      lit: litByAthyg.get(r.id) ?? null,
      added: false,
    });
  }

  fixXiUMa(stars, note);

  // --- systems and literature ---------------------------------------------------------------------------------
  const systemsOut = buildSystems({ stars, litById, note });

  // Stars added from the literature (not in AT-HYG)
  for (const L of STARS) {
    if (!L.addToCatalogue) continue;
    const a = L.addToCatalogue;
    const s0 = stateFromAstrometry(a);
    const s = propagate(s0, 2000 - a.epochJyr);
    const d = norm(s.pos);
    stars.push({
      src: { id: `lit:${L.id}`, proper: L.name, gaia: L.gaiaDr3 ?? '', hip: '', hd: '', hr: '', gl: '', bayer: '', flam: '', con: '', spect: L.spectralType ?? '' },
      raDeg: Math.atan2(s.pos[1], s.pos[0]) / DEG,
      decDeg: Math.asin(s.pos[2] / d) / DEG,
      d,
      distSrc: 5,
      prec: a.parallaxErrMas / a.parallaxMas < 0.01 ? 0 : 1,
      pos: eqToEcl(s.pos),
      vel: eqToEcl(s.vel),
      V: a.vMag,
      vSrc: 'literature',
      BV: NaN,
      colSrc: 3,
      teff: L.teffK,
      velStatus: Number.isFinite(a.rvKms) ? 0 : 1,
      rvGaia: false,
      ruweHigh: false,
      split: false,
      variable: false,
      spect: L.spectralType ?? '',
      con: a.con ?? '',
      lit: L,
      added: true,
    });
  }

  // Apply literature overrides (system members: position/velocity from the system model; named stars: Teff, V)
  const memberState = systemsOut.memberStates; // id -> {pos, vel} ecliptic, J2000
  for (const st of stars) {
    const L = st.lit;
    if (!L) continue;
    if (memberState.has(L.id)) {
      const m = memberState.get(L.id);
      st.pos = m.pos;
      st.vel = m.vel;
      st.d = norm(m.pos);
      st.distSrc = 5;
      st.prec = m.prec ?? st.prec;
      st.velStatus = 0;
    }
    if (Number.isFinite(L.teffK)) {
      st.teff = L.teffK;
      st.colSrc = 3;
    }
    if (Number.isFinite(L.vMag)) st.V = L.vMag;
    if (Number.isFinite(L.absVMag)) st.V = L.absVMag + 5 * Math.log10(st.d / 10);
    st.inSystems = true;
  }
  for (const st of stars) if (st.lit) st.inSystems = true;

  // --- sort (brightest first, as seen from the Sun at J2000) ---
  for (const st of stars) {
    if (!Number.isFinite(st.V)) st.V = 99; // should not happen; counted below
  }
  stars.sort((a, b) => a.V - b.V || a.d - b.d);
  const N = stars.length;
  const badV = stars.filter((s) => s.V === 99).length;

  // --- spectral types dictionary ---
  const spectIndex = new Map([['', 0]]);
  const spectList = [''];
  for (const st of stars) {
    const s = (st.spect ?? '').trim();
    if (!spectIndex.has(s)) {
      spectIndex.set(s, spectList.length);
      spectList.push(s);
    }
  }
  if (spectList.length > 65535) throw new Error('too many spectral types for uint16');

  // --- pack ---
  const pos = new Float32Array(3 * N);
  const vel = new Int16Array(3 * N);
  const absMag = new Int16Array(N);
  const teff = new Uint16Array(N);
  const flags = new Uint16Array(N);
  const spect = new Uint16Array(N);
  const con = new Uint8Array(N);
  let velClipped = 0;
  stars.forEach((st, i) => {
    pos[3 * i] = st.pos[0];
    pos[3 * i + 1] = st.pos[1];
    pos[3 * i + 2] = st.pos[2];
    for (let k = 0; k < 3; k++) {
      const q = Math.round(st.vel[k] / VEL_UNIT);
      if (q > 32767 || q < -32767) velClipped++;
      vel[3 * i + k] = Math.max(-32767, Math.min(32767, q));
    }
    const M = st.V - 5 * Math.log10(st.d / 10);
    absMag[i] = Math.round(M / ABSMAG_UNIT);
    teff[i] = Math.max(0, Math.min(65530, Math.round(st.teff / TEFF_STEP) * TEFF_STEP));
    let f = st.distSrc & 7;
    f |= (st.prec & 3) << 3;
    f |= (st.velStatus & 3) << 5;
    if (st.rvGaia && st.velStatus === 0) f |= 1 << 7;
    f |= ((st.teff > 0 ? st.colSrc : 3) & 3) << 8;
    if (st.inSystems) f |= 1 << 10;
    if (st.ruweHigh) f |= 1 << 11;
    if (st.split) f |= 1 << 12;
    if (st.variable) f |= 1 << 13;
    if (st.added) f |= 1 << 14;
    if (st.vSrc === 'tycho' || st.vSrc === 'tycho-raw') f |= 1 << 15;
    flags[i] = f;
    spect[i] = spectIndex.get((st.spect ?? '').trim());
    con[i] = CON_INDEX.get((st.con ?? '').toLowerCase()) ?? 0;
    stats.distSrc[st.distSrc] = (stats.distSrc[st.distSrc] ?? 0) + 1;
    stats.prec[st.prec]++;
    stats.vel[st.velStatus]++;
    if (st.rvGaia && st.velStatus === 0) stats.rvGaia++;
    st.index = i;
  });
  roundMantissa(pos, POS_MANTISSA_BITS);

  // Main file: what rendering and motion need. Extra file: descriptive columns for body cards.
  const pack = (magic, sections, headerFloats) => {
    const HEADER = 64;
    const offsets = [];
    let off = HEADER;
    for (const sec of sections) {
      off = (off + 3) & ~3;
      offsets.push(off);
      off += sec.byteLength;
    }
    const buf = new Uint8Array(off);
    const dv = new DataView(buf.buffer);
    buf.set([...magic].map((c) => c.charCodeAt(0)), 0);
    dv.setUint16(4, 1, true); // version
    dv.setUint16(6, HEADER, true);
    dv.setUint32(8, N, true);
    headerFloats.forEach((v, k) => dv.setFloat32(12 + 4 * k, v, true));
    dv.setUint32(24, sections.length, true);
    offsets.forEach((o, k) => dv.setUint32(28 + 4 * k, o, true));
    sections.forEach((sec, k) => buf.set(sec, offsets[k]));
    return buf;
  };
  const sectionSizes = (secs) => secs.map((x) => gzipSync(x, { level: 9 }).byteLength);
  const mainSections = [shuffle(pos, 4), shuffle(vel, 2), shuffle(absMag, 2), shuffle(teff, 2), shuffle(flags, 2)];
  const buf = pack('LSS3', mainSections, [2000.0, VEL_UNIT, ABSMAG_UNIT]);
  const extraSections = [shuffle(spect, 2), con];
  const extra = pack('LSX1', extraSections, [0, 0, 0]);

  mkdirSync(OUT_DATA, { recursive: true });
  mkdirSync(OUT_STAGING, { recursive: true });
  const gz = gzipSync(buf, { level: 9, memLevel: 9, strategy: zc.Z_DEFAULT_STRATEGY });
  writeFileSync(join(OUT_DATA, 'stars3d.bin.gz'), gz);
  const gzx = gzipSync(extra, { level: 9, memLevel: 9 });
  writeFileSync(join(OUT_DATA, 'stars3d-extra.bin.gz'), gzx);
  note(`stars3d.bin.gz: ${N} stars, ${buf.byteLength} bytes raw, ${gz.byteLength} bytes gzipped (${badV} without V); sections gz ${JSON.stringify(sectionSizes(mainSections))}`);
  note(`stars3d-extra.bin.gz: ${extra.byteLength} bytes raw, ${gzx.byteLength} bytes gzipped`);
  note(`  distance sources ${JSON.stringify(stats.distSrc)} precision classes ${JSON.stringify(stats.prec)}`);
  note(`  velocity status ${JSON.stringify(stats.vel)}; Gaia RV ${stats.rvGaia} (faint-star corr ${stats.rvCorrFaint}, hot-star corr ${stats.rvCorrHot}); clipped components ${velClipped}`);
  note(`  dropped: ${JSON.stringify(stats.dropped)}; zero-point outside L21 validity ${stats.zpInvalid}; HIP2 parallax more precise than Gaia DR3 for ${stats.hipBetter} stars; HIP2 distances used for AT-HYG "no distance" stars ${stats.hip2Rescued}`);
  note(`  positions replaced by Gaia DR3 (moved to J2000) for ${stats.gaiaPositions} stars with non-mean AT-HYG positions`);
  note(`  positions replaced by the Hipparcos new reduction moved to J2000 for ${stats.hip2Positions} stars whose AT-HYG position was more than 0.1" off (${stats.hip2PositionsAt1991} of them at the Hipparcos epoch J1991.25); V < 3.5: ${stats.hip2PositionLog.join(', ')}`);
  note(`  proper motions filled for AT-HYG rows without a recorded source: Hipparcos new reduction ${stats.pmFill.hip2}, Gaia DR3 ${stats.pmFill.gaia}, AT-HYG's unsourced value kept ${stats.pmFill.athygUnsourced}, none available ${stats.pmFill.none}`);
  note(`  distances capped at M_V = -10 (${stats.capped.length}): ${stats.capped.join('; ')}; HYG 100000-pc placeholders met: ${stats.placeholder}`);

  // --- names ---
  const namesOut = buildNames({ stars, iauNames, hygById, spectList, note });
  const namesGz = gzipSync(Buffer.from(JSON.stringify(namesOut)), { level: 9 });
  writeFileSync(join(OUT_DATA, 'star-names.json.gz'), namesGz);
  note(`star-names.json.gz: ${namesGz.byteLength} bytes gzipped`);

  // --- systems.json (with catalogue indices) ---
  const indexByLit = new Map(stars.filter((s) => s.lit).map((s) => [s.lit.id, s.index]));
  for (const s of systemsOut.json.stars) s.catalogueIndex = indexByLit.get(s.id) ?? null;
  writeFileSync(join(OUT_STAGING, 'systems.json'), JSON.stringify(systemsOut.json, null, 2) + '\n');
  note(`systems.json: ${systemsOut.json.systems.length} systems, ${systemsOut.json.stars.length} stars`);

  writeFileSync(join(OUT_STAGING, 'build-log.txt'), log.join('\n') + '\n');
  writeFileSync(
    join(OUT_STAGING, 'tycho-calibration.json'),
    JSON.stringify(
      {
        note: 'Median Johnson B-V and V-VT per 0.1-mag bin of Tycho-2 BT-VT, from Hipparcos stars with ground-based Johnson photometry (single stars only). x = median BT-VT of the bin, y = median B-V (or V-VT), n = stars, mad = median absolute deviation of B-V.',
        bvKnots: calib.bvKnots.map((k) => ({ x: +k.x.toFixed(4), y: +k.y.toFixed(4), n: k.n, mad: +k.mad.toFixed(4) })),
        vMinusVtKnots: calib.dvKnots.map((k) => ({ x: +k.x.toFixed(4), y: +k.y.toFixed(4), n: k.n })),
      },
      null,
      1,
    ) + '\n',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// xi Ursae Majoris (Alula Australis, a vertex of the Ursa Major figure)
// ---------------------------------------------------------------------------------------------------------------

/**
 * AT-HYG gives xi UMa A and B (Tycho-2 2520-2634-1 and -2) the same position, Tycho-2's photocentre of the pair, and
 * gives A the Gliese distance 10.42 pc while B has 8.73 pc, so A sat 1.7 pc behind its own companion; A also had no
 * HIP number (HIP 55203 is the pair) and no velocity. Neither Hipparcos nor Gaia DR3 has a parallax for A (Gaia DR3
 * gives both stars two-parameter solutions). Here:
 *   distance  both at B's Gaia DR2 parallax 114.4867 +- 0.4316 mas (via SIMBAD) corrected by the DR2 zero point
 *             -0.029 mas (Lindegren et al. 2018): 8.732 pc. The pair's dynamical mass with the orbit below is then
 *             2.9 Msun, as expected for two G0 V spectroscopic binaries.
 *   position  the Tycho-2 photocentre at J2000 (169.54548201, +31.52919433; Hog et al. 2000, flag "P") split along the
 *             Sixth Orbit Catalog's grade-1 orbit (P 59.8903 yr, a 2.50442", i 122.187 deg, Omega
 *             100.939 deg, T 1935.17, e 0.40432, omega 126.964 deg; Izmailov 2019, Astron. Lett. 45, 30) with the V-band light fraction of B, 0.393
 *             (V 4.33 and 4.80): A = photocentre - 0.393 rel, B = photocentre + 0.607 rel.
 *   velocity  both stars move with the pair's centre, so that straight-line motion keeps them together (their
 *             instantaneous orbital velocities would make them drift apart). Proper motion of the centre: from the
 *             Tycho-2 photocentre at J2000 and the light-weighted centre of the Gaia DR3 two-parameter positions of A
 *             (756853643638639104) and B (756853643637996160) at J2016.0, after removing the orbital motion; this
 *             differs from Tycho-2's own photocentre proper motion (-453.7, -591.4) mas/yr, which the 60-year orbit
 *             biases, by about 50 mas/yr. Radial velocity -18.2 km/s (Nordstrom et al. 2004, via SIMBAD).
 * Uncertainties: position ~0.3" (photocentre vs centre of mass), proper motion ~20 mas/yr (0.8 km/s).
 */
function fixXiUMa(stars, note) {
  const A = stars.find((s) => s.src.id === '1178641');
  const B = stars.find((s) => s.src.id === '1178642');
  if (!A || !B) {
    note('xi UMa: rows 1178641/1178642 not found; not fixed');
    return;
  }
  const orbitText = readFileSync(join(RAW, 'orb6orbits_2026-09-25.txt'), 'utf8').split(/\r?\n/).find((l) => /11182\+3132 STF1523AB/.test(l));
  if (!orbitText) throw new Error('xi UMa AB orbit (11182+3132 STF1523AB) not found in the ORB6 file');
  const o = { P: 59.8903, a: 2.50442, i: 122.187, Omega: 100.939, T: 1935.17, e: 0.40432, omega: 126.964 };
  for (const v of [o.P, o.a, o.i, o.Omega, o.T, o.e, o.omega]) if (!orbitText.includes(String(v))) throw new Error(`ORB6 xi UMa line does not contain ${v}`);
  // Relative position of B about A (arcsec east, north) at Julian year t, Thiele-Innes constants.
  const rel = (t) => {
    const M = (2 * Math.PI * (t - o.T)) / o.P;
    let E = M;
    for (let k = 0; k < 50; k++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
    const X = Math.cos(E) - o.e;
    const Y = Math.sqrt(1 - o.e * o.e) * Math.sin(E);
    const [w, W, I] = [o.omega * DEG, o.Omega * DEG, o.i * DEG];
    const tA = o.a * (Math.cos(w) * Math.cos(W) - Math.sin(w) * Math.sin(W) * Math.cos(I));
    const tB = o.a * (Math.cos(w) * Math.sin(W) + Math.sin(w) * Math.cos(W) * Math.cos(I));
    const tF = o.a * (-Math.sin(w) * Math.cos(W) - Math.cos(w) * Math.sin(W) * Math.cos(I));
    const tG = o.a * (-Math.sin(w) * Math.sin(W) + Math.cos(w) * Math.cos(W) * Math.cos(I));
    return { east: tB * X + tG * Y, north: tA * X + tF * Y };
  };
  const fB = 10 ** (-0.4 * 4.8) / (10 ** (-0.4 * 4.33) + 10 ** (-0.4 * 4.8));
  const photo = { ra: 169.54548201, dec: 31.52919433 };
  const at = (frac, t, base) => {
    const r = rel(t);
    const cosd = Math.cos(base.dec * DEG);
    return { ra: base.ra + (frac * r.east) / 3600 / cosd, dec: base.dec + (frac * r.north) / 3600 };
  };
  const plx = 114.4867 + 0.029;
  const d = 1000 / plx;
  const rv = -18.2;
  // Centre of light at J2016.0 from Gaia DR3 (A + fB (B - A)), minus the orbit's contribution, gives the motion.
  const gaia = { A: [169.54328528175262, 31.526916851645016], B: [169.543380115591, 31.526414900460445] };
  const centre16 = { ra: gaia.A[0] + fB * (gaia.B[0] - gaia.A[0]), dec: gaia.A[1] + fB * (gaia.B[1] - gaia.A[1]) };
  const cosd = Math.cos(photo.dec * DEG);
  const pm = { ra: ((centre16.ra - photo.ra) * cosd * 3.6e6) / 16, dec: ((centre16.dec - photo.dec) * 3.6e6) / 16 };
  for (const [st, frac] of [[A, -fB], [B, 1 - fB]]) {
    const pos = at(frac, 2000, photo);
    const s = stateFromAstrometry({ raDeg: pos.ra, decDeg: pos.dec, parallaxMas: plx, pmRaMasYr: pm.ra, pmDecMasYr: pm.dec, rvKms: rv });
    st.raDeg = pos.ra;
    st.decDeg = pos.dec;
    st.d = d;
    st.distSrc = 2;
    st.prec = 0.4316 / plx < 0.01 ? 0 : 1;
    st.pos = eqToEcl(s.pos);
    st.vel = eqToEcl(s.vel);
    st.velStatus = 0;
    st.rvGaia = false;
  }
  A.src.hip = '55203';
  // Check: carry the model to J2016.0 (centre along the proper motion, pair along the orbit) and compare with Gaia DR3.
  const photo16 = { ra: photo.ra + (pm.ra * 16) / 3.6e6 / cosd, dec: photo.dec + (pm.dec * 16) / 3.6e6 };
  const sep = (p, q) => Math.hypot((p.ra - q[0]) * Math.cos(q[1] * DEG), p.dec - q[1]) * 3600;
  const a16 = at(-fB, 2016, photo16);
  const b16 = at(1 - fB, 2016, photo16);
  const r00 = rel(2000);
  note(`xi UMa: A and B placed at ${d.toFixed(3)} pc (B's Gaia DR2 parallax); separation at J2000 ${Math.hypot(r00.east, r00.north).toFixed(3)}" (ORB6); centre proper motion (${pm.ra.toFixed(1)}, ${pm.dec.toFixed(1)}) mas/yr (Tycho-2 photocentre: -453.7, -591.4); vs Gaia DR3 at J2016.0: A ${sep(a16, gaia.A).toFixed(3)}", B ${sep(b16, gaia.B).toFixed(3)}", B-A ${Math.hypot(((b16.ra - a16.ra) * Math.cos(31.53 * DEG)) * 3600, (b16.dec - a16.dec) * 3600).toFixed(3)}" (model) vs ${Math.hypot((gaia.B[0] - gaia.A[0]) * Math.cos(31.53 * DEG) * 3600, (gaia.B[1] - gaia.A[1]) * 3600).toFixed(3)}" (Gaia)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------------------------------------------

function buildSystems({ stars, litById, note }) {
  const memberStates = new Map();
  const json = {
    format: 'lightspeed.star-systems',
    version: 1,
    generatedBy: 'scripts/build-stars3d.mjs',
    frame:
      'Positions: parsecs from the Sun, J2000 ecliptic axes (x to the J2000 equinox, z to the ecliptic north pole; ' +
      'ICRS rotated by the IAU 1976 obliquity 84381.448"). Velocities: km/s, same axes, heliocentric.',
    epoch: 'J2000.0 (JD 2451545.0 TT). Barycentres move in straight lines; members follow the listed Kepler orbits.',
    orbitModel:
      'Each orbit links two groups of members. Relative position of group 2 about group 1: r = aAu*[(cos E - e) pHat + sqrt(1-e^2) sin E qHat], ' +
      'E - e sin E = 2 pi (JD - tPeriJD) / periodDays. Members of group 1 are displaced by -m2/(m1+m2) r, members of ' +
      'group 2 by +m1/(m1+m2) r (m = total mass of each group). A member position is the system barycentre plus the ' +
      'sum of its displacements over all orbits. pHat, qHat are unit vectors in the J2000 ecliptic frame.',
    refs: REFS,
    systems: [],
    stars: [],
  };

  const massOf = (id) => litById.get(id).massMsun;
  const groupMass = (ids) => ids.reduce((s, id) => s + massOf(id), 0);

  for (const S of SYSTEMS) {
    const out = { id: S.id, name: S.name, note: S.note, members: S.members, barycentre: null, orbits: [], checks: [] };
    let bary; // {pos, vel} ICRS pc, km/s at J2000 — barycentre of the whole system
    const orbitsIcrs = [];

    if (S.barycentreFromMembers) {
      // 61 Cygni: mass-weighted Gaia DR3 astrometry of both stars at J2016.0
      // Gaia DR3 (J2016.0) astrometry of both stars, as returned by the Gaia archive for these source ids
      const astro = {
        '61-cyg-a': { raDeg: 316.7484792940004, decDeg: 38.76386244649797, parallaxMas: 285.99494829578117, pmRaMasYr: 4164.2086922846665, pmDecMasYr: 3249.613883848584, rvKms: -65.97495 },
        '61-cyg-b': { raDeg: 316.753662752556, decDeg: 38.75607277205679, parallaxMas: 286.0053518616485, pmRaMasYr: 4105.976428209489, pmDecMasYr: 3155.9416398273515, rvKms: -64.593544 },
      };
      const st = S.members.map((id) => ({ id, m: massOf(id), s: propagate(stateFromAstrometry(astro[id]), 2000 - 2016) }));
      const M = st.reduce((s, x) => s + x.m, 0);
      bary = {
        pos: st.reduce((acc, x) => add(acc, scale(x.s.pos, x.m / M)), [0, 0, 0]),
        vel: st.reduce((acc, x) => add(acc, scale(x.s.vel, x.m / M)), [0, 0, 0]),
      };
      out.barycentre = {
        source: 'Mass-weighted mean of the Gaia DR3 astrometry (J2016.0) of 61 Cyg A and B, masses from Kervella et al. 2008 via Heiter et al. 2015',
        refs: ['gaiaDr3', 'kervella2008', 'heiter2015'],
        gaiaDr3: astro,
      };
      // measured relative state (B - A) at J2016 for the checks below
      const sA = stateFromAstrometry(astro['61-cyg-a']);
      const sB = stateFromAstrometry(astro['61-cyg-b']);
      out._measuredRel2016 = { pos: sub(sB.pos, sA.pos), vel: sub(sB.vel, sA.vel), plx: (astro['61-cyg-a'].parallaxMas * massOf('61-cyg-a') + astro['61-cyg-b'].parallaxMas * massOf('61-cyg-b')) / M };
    } else {
      const B = S.barycentre;
      const s0 = stateFromAstrometry(B);
      bary = propagate(s0, 2000 - B.epochJyr); // barycentre of B.of
      out.barycentre = {
        source: 'Astrometry of the barycentre of ' + B.of.join(' + '),
        astrometry: { raDeg: B.raDeg, decDeg: B.decDeg, epochJyr: B.epochJyr, parallaxMas: B.parallaxMas, parallaxErrMas: B.parallaxErrMas, pmRaMasYr: B.pmRaMasYr, pmDecMasYr: B.pmDecMasYr, rvKms: +B.rvKms.toFixed(4), rvNote: B.rvNote },
        refs: B.refs,
      };
    }

    // Build orbits in ICRS
    const dirRaDec = (() => {
      const p = bary.pos;
      const r = norm(p);
      return { ra: Math.atan2(p[1], p[0]) / DEG, dec: Math.asin(p[2] / r) / DEG, d: r };
    })();

    for (const O of S.orbits) {
      const m1 = groupMass(O.primary);
      const m2 = groupMass(O.secondary);
      let orb;
      let published;
      if (O.kind === 'visual') {
        const plx = O.parallaxMas ?? (S.barycentreFromMembers ? out._measuredRel2016.plx : S.barycentre.parallaxMas);
        const basis = campbellBasis(O, dirRaDec.ra, dirRaDec.dec);
        orb = {
          aAu: O.aArcsec / (plx / 1000),
          e: O.e,
          periodDays: O.periodYr * 365.25,
          tPeriJD: O.tPeriJD ?? jyToJd(O.tPeriYr),
          P: basis.P,
          Q: basis.Q,
        };
        const mDyn = orb.aAu ** 3 / O.periodYr ** 2;
        published = {
          kind: 'visual-binary (Campbell) elements, relative orbit of the secondary',
          periodYr: O.periodYr,
          aArcsec: O.aArcsec,
          e: O.e,
          iDeg: O.iDeg,
          OmegaDeg: O.OmegaDeg,
          omegaDeg: O.omegaDeg,
          tPeri: O.tPeriJD ? { JD: O.tPeriJD } : { decimalYear: O.tPeriYr },
          parallaxMas: +plx.toFixed(4),
          uncertainty: O.uncertainty,
          grade: O.grade,
          refs: O.refs,
        };
        out.checks.push(`Kepler's third law with these a, P and parallax: M1+M2 = ${mDyn.toFixed(4)} M_sun (members' masses sum to ${(m1 + m2).toFixed(4)})`);
        orbitsIcrs.push({ O, orb, m1, m2 });
      } else if (O.kind === 'state') {
        // Proxima: relative state from present-day astrometry (both propagated to J2000 in straight lines)
        const sec = propagate(stateFromAstrometry(O.secondaryAstrometry), 2000 - O.secondaryAstrometry.epochJyr);
        const dp = sub(sec.pos, bary.pos); // pc (bary here = barycentre of the primary group)
        const dvel = sub(sec.vel, bary.vel);
        const dpAu = scale(dp, 648000 / Math.PI);
        orb = orbitFromState(dpAu, dvel, m1 + m2, JD_J2000);
        const vEsc = Math.sqrt((2 * GM_SUN_KM3S2 * (m1 + m2)) / (norm(dpAu) * AU_KM));
        out.checks.push(
          `Proxima relative to the AB barycentre at J2000: separation ${Math.round(norm(dpAu))} au, relative speed ${(norm(dvel) * 1000).toFixed(0)} m/s, ` +
            `escape speed ${(vEsc * 1000).toFixed(0)} m/s -> bound; a = ${Math.round(orb.aAu)} au, e = ${orb.e.toFixed(3)}, P = ${(orb.periodDays / 365.25 / 1000).toFixed(0)} kyr, ` +
            `last periastron ${((JD_J2000 - orb.tPeriJD) / 365.25 / 1000).toFixed(0)} kyr before J2000, next ${((orb.tPeriJD + orb.periodDays - JD_J2000) / 365.25 / 1000).toFixed(0)} kyr after (published: a = 8.7 kau, e = 0.50, P = 547 kyr, next periastron in 283 kyr)`,
        );
        published = { kind: 'Kervella et al. 2017, Table 3', ...O.published, secondaryAstrometry: O.secondaryAstrometry };
        orbitsIcrs.push({ O, orb, m1, m2, secondaryState: sec });
      }
      const eclOrb = { ...orb, P: eqToEcl(orb.P), Q: eqToEcl(orb.Q) };
      out.orbits.push({
        id: O.id,
        primary: O.primary,
        secondary: O.secondary,
        massPrimaryMsun: +m1.toFixed(5),
        massSecondaryMsun: +m2.toFixed(5),
        aAu: +orb.aAu.toPrecision(10),
        e: +orb.e.toPrecision(8),
        periodDays: +orb.periodDays.toPrecision(10),
        tPeriJD: +orb.tPeriJD.toFixed(4),
        pHat: eclOrb.P.map((x) => +x.toFixed(10)),
        qHat: eclOrb.Q.map((x) => +x.toFixed(10)),
        eclipticAngles: Object.fromEntries(Object.entries(anglesFromBasis(eclOrb.P, eclOrb.Q)).map(([k, v]) => [k, +v.toFixed(5)])),
        source: O.kind === 'visual' ? 'published visual orbit' : 'osculating orbit from present-day astrometry',
        published,
      });
    }

    // Barycentre of the whole system (for Alpha Cen: add Proxima)
    const stateOrbit = orbitsIcrs.find((x) => x.O.kind === 'state');
    if (stateOrbit) {
      const { m1, m2, secondaryState } = stateOrbit;
      const M = m1 + m2;
      bary = { pos: add(scale(bary.pos, m1 / M), scale(secondaryState.pos, m2 / M)), vel: add(scale(bary.vel, m1 / M), scale(secondaryState.vel, m2 / M)) };
      out.barycentre.source += ' (listed); the system barycentre below also includes Proxima';
    }
    const baryEcl = { pos: eqToEcl(bary.pos), vel: eqToEcl(bary.vel) };
    out.barycentre.posPc = baryEcl.pos.map((x) => +x.toPrecision(12));
    out.barycentre.velKms = baryEcl.vel.map((x) => +x.toPrecision(10));
    out.barycentre.distancePc = +norm(bary.pos).toPrecision(8);
    out.barycentre.massMsun = +S.members.reduce((s, id) => s + massOf(id), 0).toFixed(5);

    // Member states at J2000 (ecliptic)
    const memberOffset = (id, jd) => {
      let off = [0, 0, 0];
      let vOff = [0, 0, 0];
      for (const { O, orb, m1, m2 } of orbitsIcrs) {
        const inP = O.primary.includes(id);
        const inS = O.secondary.includes(id);
        if (!inP && !inS) continue;
        const st = orbitState(orb, jd);
        const f = inP ? -m2 / (m1 + m2) : m1 / (m1 + m2);
        off = add(off, scale(st.pos, f / (648000 / Math.PI)));
        vOff = add(vOff, scale(st.vel, f));
      }
      return { off, vOff };
    };
    for (const id of S.members) {
      const { off } = memberOffset(id, JD_J2000);
      // catalogue members carry the barycentre velocity; the orbit supplies the rest
      memberStates.set(id, { pos: eqToEcl(add(bary.pos, off)), vel: baryEcl.vel, prec: 0 });
    }

    // Checks against independent measurements
    const skyOffset = (id, jyr) => {
      const jd = jyToJd(jyr);
      const bp = add(bary.pos, scale(bary.vel, (jyr - 2000) * KMS_TO_PC_PER_YR));
      const p = add(bp, memberOffset(id, jd).off);
      const r = norm(p);
      return { ra: Math.atan2(p[1], p[0]) / DEG, dec: Math.asin(p[2] / r) / DEG, d: r };
    };
    const sepPa = (a, b) => {
      const dRa = ((b.ra - a.ra + 540) % 360) - 180;
      const x = dRa * Math.cos(((a.dec + b.dec) / 2) * DEG) * 3600;
      const y = (b.dec - a.dec) * 3600;
      return { sep: Math.hypot(x, y), pa: ((Math.atan2(x, y) / DEG) + 360) % 360 };
    };
    // Relative orbit versus the ORB6 ephemerides (same published elements; tests this file's orbit geometry)
    for (const { O, orb } of orbitsIcrs) {
      if (!O.orb6Ephemeris && !O.measured) continue;
      const basis = campbellBasis(O, dirRaDec.ra, dirRaDec.dec);
      const rows = [];
      const plx = O.parallaxMas ?? (orb.aAu > 0 ? (O.aArcsec / orb.aAu) * 1000 : NaN);
      // ORB6 tabulates Besselian epochs and position angles for the equinox of date; convert the model's J2000
      // position angle with the precession term 20.04"/yr * sin(ra) * sec(dec) * (t - 2000).
      const besselToJd = (b) => 2415020.31352 + (b - 1900) * 365.242198781;
      for (const [yr, th, rho, label] of [...(O.orb6Ephemeris ?? []).map((e) => [...e, 'ORB6']), ...(O.measured ?? [])]) {
        const isOrb6 = label === 'ORB6';
        const rel = orbitState(orb, isOrb6 ? besselToJd(yr) : jyToJd(yr)).pos;
        const x = dot(rel, basis.north) * (plx / 1000);
        const y = dot(rel, basis.east) * (plx / 1000);
        const precess = isOrb6 ? ((20.04 / 3600) * Math.sin(dirRaDec.ra * DEG) * (yr - 2000)) / Math.cos(dirRaDec.dec * DEG) : 0;
        const pa = ((Math.atan2(y, x) / DEG) + precess + 360) % 360;
        const dpa = ((pa - th + 540) % 360) - 180;
        rows.push(yr + ': model ' + pa.toFixed(2) + ' deg ' + Math.hypot(x, y).toFixed(4) + '" vs ' + label + ' ' + th + ' deg ' + rho + '" (dPA ' + dpa.toFixed(2) + ' deg, dSep ' + (Math.hypot(x, y) - rho).toFixed(4) + '")');
      }
      out.checks.push(O.id + ' relative orbit: ' + rows.join('; '));
    }
    if (S.id === 'sirius') {
      const B = skyOffset('sirius-b', 2016.0);
      const gaiaB = { ra: 101.28662552099249, dec: -16.720932526023173 };
      const diff = sepPa(gaiaB, B);
      out.checks.push(`Model position of Sirius B at J2016.0 differs from Gaia DR3 (source 2947050466531873024) by ${diff.sep.toFixed(3)}" (Gaia DR3 flags this source with RUWE 2.4; the orbit's 1-sigma is ~0.01")`);
      const B2 = skyOffset('sirius-b', 2016.5);
      const B1 = skyOffset('sirius-b', 2015.5);
      const pmRa = (((B2.ra - B1.ra + 540) % 360) - 180) * Math.cos(B.dec * DEG) * 3.6e6;
      const pmDec = (B2.dec - B1.dec) * 3.6e6;
      out.checks.push(`Model proper motion of Sirius B at J2016.0: (${pmRa.toFixed(1)}, ${pmDec.toFixed(1)}) mas/yr; Gaia DR3 (-461.6 +- 0.3, -914.5 +- 0.3) mas/yr`);
    }
    if (S.id === 'alpha-centauri') {
      const A = skyOffset('alpha-cen-a', 1991.25);
      const B = skyOffset('alpha-cen-b', 1991.25);
      const hipA = { ra: 219.92040813, dec: -60.83514522 };
      const hipB = { ra: 219.9141246, dec: -60.83948046 };
      out.checks.push(`Model vs Hipparcos (1991.25) positions quoted by Akeson et al. 2021: A off by ${sepPa(hipA, A).sep.toFixed(3)}", B off by ${sepPa(hipB, B).sep.toFixed(3)}"`);
      const P = skyOffset('proxima', 2016.0);
      out.checks.push(`Model position of Proxima at J2016.0 differs from Gaia DR3 by ${sepPa({ ra: 217.39232147200883, dec: -62.67607511676666 }, P).sep.toFixed(4)}" and its distance by ${((P.d - 1000 / 768.0665391873573) * 206264.806).toFixed(1)} au`);
    }
    if (S.id === '61-cygni') {
      const rel = sepPa(skyOffset('61-cyg-a', 2016.0), skyOffset('61-cyg-b', 2016.0));
      const m = out._measuredRel2016;
      const n = unitFromRaDec(316.75, 38.76);
      const east = [-Math.sin(316.75 * DEG), Math.cos(316.75 * DEG), 0];
      const north = cross(n, east);
      const gSep = Math.hypot(dot(m.pos, east), dot(m.pos, north)) * (m.plx / 1000) * (648000 / Math.PI);
      const gPa = ((Math.atan2(dot(m.pos, east), dot(m.pos, north)) / DEG) + 360) % 360;
      const o = orbitsIcrs[0];
      const relVel = orbitState(o.orb, jyToJd(2016)).vel;
      out.checks.push(`61 Cyg B relative to A at J2016.0: orbit ${rel.sep.toFixed(3)}", ${rel.pa.toFixed(2)} deg; Gaia DR3 ${gSep.toFixed(3)}", ${gPa.toFixed(2)} deg`);
      out.checks.push(
        `Relative velocity B-A at J2016.0: orbit radial ${dot(relVel, n).toFixed(2)} km/s, tangential ${Math.hypot(dot(relVel, east), dot(relVel, north)).toFixed(2)} km/s; ` +
          `Gaia DR3 radial ${dot(m.vel, n).toFixed(2)} km/s, tangential ${Math.hypot(dot(m.vel, east), dot(m.vel, north)).toFixed(2)} km/s`,
      );
      delete out._measuredRel2016;
    }
    if (S.id === 'capella') {
      out.checks.push(`Orbit semi-major axis ${orbitsIcrs[0].orb.aAu.toFixed(5)} au (Torres et al. 2015: 0.74272 +- 0.00069 au). The ORB6 ephemeris is 180 deg from this model: ORB6 lists Torres et al.'s omega of star A (342.6 deg) as the relative-orbit omega, while the relative orbit of B about A has omega_A + 180 deg, which is what reproduces Torres et al.'s radial-velocity curves.`);
    }
    out.checks.forEach((c) => note(`[${S.id}] ${c}`));
    json.systems.push(out);
  }

  // Stars with literature parameters
  for (const L of STARS) {
    const st = stars.find((s) => s.lit === L);
    const dPc =
      L.id === 'sun'
        ? 0
        : memberStates.has(L.id)
          ? norm(memberStates.get(L.id).pos)
          : st
            ? st.d
            : L.addToCatalogue
              ? norm(propagate(stateFromAstrometry(L.addToCatalogue), 2000 - L.addToCatalogue.epochJyr).pos)
              : NaN;
    const out = {
      id: L.id,
      name: L.name,
      altNames: L.altNames ?? [],
      system: SYSTEMS.find((S) => S.members.includes(L.id))?.id ?? null,
      catalogueIndex: null,
      hip: L.hip ?? (st?.src.hip ? Number(st.src.hip) : null),
      gaiaDr3: L.gaiaDr3 ?? (st?.src.gaia || null),
      spectralType: L.spectralType ?? null,
      catalogueDistancePc: Number.isFinite(dPc) ? +dPc.toPrecision(7) : null,
    };
    const copy = (k) => {
      if (L[k] !== undefined) out[k] = L[k];
    };
    [
      'massMsun', 'massErr', 'massErrPlus', 'massErrMinus', 'massMsunRange',
      'radiusRsun', 'radiusErr', 'radiusErrPlus', 'radiusErrMinus', 'radiusPolarRsun', 'radiusPolarErr',
      'teffK', 'teffErr', 'teffPolarK', 'teffPolarErr', 'teffEquatorK', 'teffEquatorErr',
      'luminosityLsun', 'luminosityErr', 'luminosityErrPlus', 'luminosityErrMinus', 'logLErr',
      'inclinationDeg', 'angularDiameterMas', 'angularDiameterErr', 'fbolWm2', 'fbolErr',
      'distancePc', 'distanceErr', 'distanceErrPlus', 'distanceErrMinus', 'vMag', 'absVMag', 'companion',
    ].forEach(copy);
    if (out.luminosityLsun !== undefined) out.luminosityLsun = +out.luminosityLsun.toPrecision(6);
    // Derive what the literature gives only as angular diameter + bolometric flux, at the catalogue distance.
    const derived = {};
    if (Number.isFinite(L.angularDiameterMas) && Number.isFinite(dPc) && dPc > 0) {
      const dUse = Number.isFinite(L.distancePc) && L.id === 'polaris' ? L.distancePc : dPc;
      const R = ((L.angularDiameterMas / 2 / 1000) * dUse) / RSUN_AU;
      if (out.radiusRsun === undefined) {
        out.radiusRsun = +R.toPrecision(4);
        out.radiusErr = +(R * Math.hypot(L.angularDiameterErr / L.angularDiameterMas, 0)).toPrecision(2);
        derived.radiusRsun = `theta_LD/2 x ${dUse.toFixed(3)} pc (catalogue distance); error excludes the distance error`;
      } else derived.radiusCheckRsun = +R.toPrecision(4);
    }
    if (Number.isFinite(L.fbolWm2) && Number.isFinite(dPc) && dPc > 0) {
      const dm = dPc * PC_KM * 1000;
      const Lsun = (4 * Math.PI * dm * dm * L.fbolWm2) / SUN.luminosityW;
      if (out.luminosityLsun === undefined) {
        out.luminosityLsun = +Lsun.toPrecision(4);
        derived.luminosityLsun = `4 pi d^2 F_bol at ${dPc.toFixed(3)} pc`;
      } else derived.luminosityCheckLsun = +Lsun.toPrecision(4);
      if (Number.isFinite(L.angularDiameterMas)) {
        const th = (L.angularDiameterMas / 1000 / 3600) * DEG;
        const T = ((4 * L.fbolWm2) / (SIGMA_SB * th * th)) ** 0.25;
        if (out.teffK === undefined) {
          out.teffK = Math.round(T);
          derived.teffK = '(4 F_bol / (sigma theta_LD^2))^(1/4)';
        } else derived.teffCheckK = Math.round(T);
      }
    }
    if (Object.keys(derived).length) out.derived = derived;
    out.refs = L.refs;
    if (L.notes) out.notes = L.notes;
    json.stars.push(out);
  }
  return { json, memberStates };
}

// ---------------------------------------------------------------------------------------------------------------
// Names table
// ---------------------------------------------------------------------------------------------------------------

function buildNames({ stars, iauNames, hygById, spectList, note }) {
  const proper = [];
  const bayer = [];
  const flam = [];
  const variable = [];
  const gliese = [];
  const hip = [];
  const hd = [];
  const hr = [];
  const properSeen = new Set();
  const iauSet = new Map(iauNames.map((n) => [stripDiacritics(n.name), n]));
  const byHip = new Map();
  const byHd = new Map();
  const byHr = new Map();
  const byGl = new Map();

  for (const st of stars) {
    const r = st.src;
    const i = st.index;
    if (r.proper) {
      const k = `${i}|${stripDiacritics(r.proper)}`;
      if (!properSeen.has(k)) {
        properSeen.add(k);
        proper.push([i, r.proper, iauSet.has(stripDiacritics(r.proper)) ? 1 : 0]);
      }
    }
    if (st.lit) {
      for (const n of [st.lit.name, ...(st.lit.altNames ?? [])]) {
        const k = `${i}|${stripDiacritics(n)}`;
        if (!properSeen.has(k)) {
          properSeen.add(k);
          proper.push([i, n, iauSet.has(stripDiacritics(n)) ? 1 : 0]);
        }
      }
    }
    if (r.bayer) {
      const m = /^([A-Za-z]+)(?:-(\d+))?$/.exec(r.bayer);
      if (m) bayer.push([i, GREEK[m[1]] ?? m[1], m[2] ? Number(m[2]) : 0, r.con]);
    }
    if (r.flam) flam.push([i, Number(r.flam), r.con]);
    if (r.gl) {
      gliese.push([i, r.gl]);
      byGl.set(r.gl.replace(/\s+/g, '').toUpperCase(), i);
    }
    if (r.hip) {
      hip.push([i, Number(r.hip)]);
      byHip.set(r.hip, i);
    }
    if (r.hd) {
      hd.push([i, Number(r.hd)]);
      byHd.set(r.hd, i);
    }
    if (r.hr) {
      hr.push([i, Number(r.hr)]);
      byHr.set(r.hr, i);
    }
    const hyg = r.hyg ? hygById.get(r.hyg) : null;
    if (hyg && hyg.var && hyg.var !== r.bayer && !/^\d+$/.test(hyg.var)) {
      variable.push([i, `${hyg.var} ${hyg.con || r.con}`.trim()]);
    }
  }

  // IAU WGSN names not yet attached (names approved after AT-HYG v4.0, or on components)
  let added = 0;
  const unmatched = [];
  for (const n of iauNames) {
    let i;
    if (n.hip && byHip.has(n.hip)) i = byHip.get(n.hip);
    else {
      const m = /^(HR|HD|GJ|Gl)\s*(\S+)$/i.exec(n.designation ?? '');
      if (m && /^HR$/i.test(m[1])) i = byHr.get(m[2]);
      else if (m && /^HD$/i.test(m[1])) i = byHd.get(m[2]);
      else if (m) i = byGl.get(m[2].toUpperCase());
    }
    if (i === undefined) {
      if (![...properSeen].some((k) => k.endsWith('|' + stripDiacritics(n.name)))) unmatched.push(`${n.name} (${n.designation || '?'})`);
      continue;
    }
    const k = `${i}|${stripDiacritics(n.name)}`;
    if (properSeen.has(k)) continue;
    properSeen.add(k);
    proper.push([i, n.name, 1]);
    added++;
  }
  note(`names: ${proper.length} proper (${added} IAU names added beyond AT-HYG; ${unmatched.length} IAU names without a catalogue star), ${bayer.length} Bayer, ${flam.length} Flamsteed, ${variable.length} variable, ${gliese.length} Gliese, ${hip.length} HIP, ${hd.length} HD, ${hr.length} HR`);
  note(`  IAU names without a catalogue star: ${unmatched.join('; ')}`);

  const columns = (pairs) => {
    pairs.sort((a, b) => a[0] - b[0]);
    const di = [];
    let prev = 0;
    for (const [i] of pairs) {
      di.push(i - prev);
      prev = i;
    }
    return { indexDelta: di, id: pairs.map((p) => p[1]) };
  };

  return {
    format: 'lightspeed.star-names',
    version: 1,
    catalogue: 'stars3d.bin.gz',
    count: stars.length,
    note: 'Indices refer to stars3d.bin.gz (0-based, brightest first). See staging/stars/stars.md.',
    constellations: CONSTELLATIONS.map((c) => [c.abbr, c.name, c.genitive]),
    spectralTypes: spectList,
    proper: proper.sort((a, b) => a[0] - b[0]),
    bayer: bayer.sort((a, b) => a[0] - b[0]),
    flamsteed: flam.sort((a, b) => a[0] - b[0]),
    variable: variable.sort((a, b) => a[0] - b[0]),
    gliese: gliese.sort((a, b) => a[0] - b[0]),
    hr: columns(hr),
    hip: columns(hip),
    hd: columns(hd),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
