// Builds staging/exoplanets/featured.json: hand-built exoplanet systems with the best published
// orbital solutions, every value cited, unknown angles marked "assumed" with the assumption stated.
//
// Inputs (data-raw/, not committed; never re-downloaded once cached):
//   nea_pscomppars_2026-09-25.csv.gz   NASA Exoplanet Archive PSCompPars (see build-exoplanets.mjs)
//   nea_ps_featured_2026-09-25.csv     NASA Exoplanet Archive PS table rows for the featured hosts:
//       curl -G https://exoplanetarchive.ipac.caltech.edu/TAP/sync --data-urlencode "format=csv" \
//         --data-urlencode "query=select * from ps where hostname in ('TRAPPIST-1','Proxima Cen',
//           'Barnard''s star','51 Peg','HR 8799','KOI-351','TOI-700','Kepler-16','eps Eri','tau Cet')"
//   agol2021_trappist1_times_forecast.csv   Agol et al. 2021 Table 15 (forecast transit times), full
//       electronic version from github.com/ericagol/TRAPPIST1_Spitzer, tex/tables/times_forecast.txt
//       (MIT licence). Columns: planet (1-7 = b-h), epoch, mean time (BJD_TDB - 2450000), sigma (d).
//   shaw2025_kepler90gh_table6.txt     Shaw et al. 2025 Table 6, transcribed (see the file header).
//
// Output: staging/exoplanets/featured.json. Conventions: see staging/exoplanets/exoplanets.md and
// staging/exoplanets/src/orbit.ts. The orbit math here mirrors src/kepler.ts and src/orbit.ts; the
// tests in staging/exoplanets/src/featured.test.ts check that the two agree.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { POSITION_SOURCES, hostPositionJ2000, loadHostAstrometry } from './exoplanet-host-astrometry.mjs';

const OUT = 'staging/exoplanets/featured.json';
/** Stated epoch for every phase: 2026-01-01 00:00 TDB. */
const EPOCH_JD = 2_461_041.5;
const EPOCH_ISO = '2026-01-01T00:00:00 TDB';

// ---------------------------------------------------------------------------------------------
// Math (mirrors staging/exoplanets/src)

const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const GAUSS_K = 0.01720209895;
const GM = GAUSS_K * GAUSS_K; // au^3/day^2 per solar mass
const M_EARTH_MSUN = 3.986004e14 / 1.3271244e20;
const M_JUP_MEARTH = 1.2668653e17 / 3.986004e14;
const R_JUP_REARTH = 71492 / 6378.1;
const JULIAN_YEAR = 365.25;

const wrap360 = (x) => ((x % 360) + 360) % 360;
const wrapTwoPi = (x) => ((x % TAU) + TAU) % TAU;
function solveKepler(M, e) {
  const m0 = wrapTwoPi(M);
  if (e === 0) return m0;
  const m = m0 > Math.PI ? m0 - TAU : m0;
  let E = m + 0.85 * e * Math.sign(Math.sin(m) || 1);
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let k = 0; k < 60; k++) {
    const f = E - e * Math.sin(E) - m;
    if (f > 0) hi = Math.min(hi, E);
    else lo = Math.max(lo, E);
    let next = E - f / (1 - e * Math.cos(E));
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - E) < 1e-15) {
      E = next;
      break;
    }
    E = next;
  }
  return E < 0 ? E + TAU : E;
}
const trueFromEcc = (E, e) => 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
const eccFromTrue = (f, e) => 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
const meanFromTrue = (f, e) => {
  const E = eccFromTrue(f, e);
  return wrapTwoPi(E - e * Math.sin(E));
};
const periodDays = (aAu, M) => TAU * Math.sqrt((aAu * aAu * aAu) / (GM * M));
const smaAu = (P, M) => Math.cbrt((GM * M) / (TAU / P) ** 2);
/** Time of periastron from an inferior-conjunction (transit) time; argPeri is the PLANET's (visual-binary convention). */
const tPeriFromConj = (tc, P, e, argPeri) => tc - (meanFromTrue(wrap360(270 - argPeri) * DEG, e) / TAU) * P;
const conjFromTPeri = (tp, P, e, argPeri) => tp + (meanFromTrue(wrap360(270 - argPeri) * DEG, e) / TAU) * P;

/** Sky offset (au; north, east, away) of the relative orbit at an observed-clock time. */
function skyPos(o, t) {
  const n = TAU / o.periodDays;
  const E = solveKepler(n * (t - o.tPeriJd), o.e);
  const f = trueFromEcc(E, o.e);
  const r = o.aAu * (1 - o.e * Math.cos(E));
  const u = o.argPeriDeg * DEG + f;
  const [cu, su, cO, sO, ci, si] = [Math.cos(u), Math.sin(u), Math.cos(o.nodeDeg * DEG), Math.sin(o.nodeDeg * DEG), Math.cos(o.iDeg * DEG), Math.sin(o.iDeg * DEG)];
  return { north: r * (cu * cO - su * sO * ci), east: r * (cu * sO + su * cO * ci), away: r * su * si };
}

/** FNV-1a (32-bit, over UTF-16 code units) of a host name -> an assumed node PA in [0, 360), 0.1 deg steps. Same as src/catalogue.ts. */
function assumedNodeDeg(hostName) {
  let h = 0x811c9dc5;
  for (let i = 0; i < hostName.length; i++) {
    h ^= hostName.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return Math.round((h / 2 ** 32) * 3600) / 10;
}

/** Chen & Kipping 2017 (ApJ 834, 17) mean mass-radius relation; M, R in Earth units. */
function forecastRadiusEarth(m) {
  const T1 = 2.04; // Terran -> Neptunian
  const T2 = 0.414 * M_JUP_MEARTH; // Neptunian -> Jovian
  const r1 = 1.008 * m ** 0.279;
  if (m <= T1) return r1;
  const rT1 = 1.008 * T1 ** 0.279;
  if (m <= T2) return rT1 * (m / T1) ** 0.589;
  const rT2 = rT1 * (T2 / T1) ** 0.589;
  return rT2 * (m / T2) ** -0.044;
}
/** Equilibrium temperature (K) for zero albedo and full redistribution from the incident flux in Earth units (S_earth = 1361 W/m^2). */
const teqFromFlux = (S) => ((S * 1361) / (4 * 5.670374419e-8)) ** 0.25;
/** Unweighted least-squares line t = T0 + n P. */
function linearFit(pts) {
  const N = pts.length;
  let sn = 0, st = 0, snn = 0, snt = 0;
  for (const [n, t] of pts) {
    sn += n;
    st += t;
    snn += n * n;
    snt += n * t;
  }
  const P = (N * snt - sn * st) / (N * snn - sn * sn);
  const T0 = (st - P * sn) / N;
  const res = pts.map(([n, t]) => t - T0 - n * P);
  return { P, T0, rms: Math.sqrt(res.reduce((s, x) => s + x * x, 0) / N), max: Math.max(...res.map(Math.abs)) };
}
const round = (x, d) => (x === null || x === undefined ? x : Math.round(x * 10 ** d) / 10 ** d);
const julianYearToJd = (y) => 2_451_545.0 + (y - 2000) * JULIAN_YEAR;
function calToJd(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 - 0.5;
}

// ---------------------------------------------------------------------------------------------
// Archive lookups (values quoted with the archive's own reference for each field)

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}
function loadTable(text) {
  const t = parseCsv(text);
  const h = t[0];
  return t.slice(1).filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const comp = loadTable(gunzipSync(readFileSync('data-raw/nea_pscomppars_2026-09-25.csv.gz')).toString('utf8'));
const ps = loadTable(readFileSync('data-raw/nea_ps_featured_2026-09-25.csv', 'utf8'));
const compPlanet = (name) => {
  const r = comp.find((x) => x.pl_name === name);
  if (!r) throw new Error(`not in pscomppars: ${name}`);
  return r;
};
const decodeRef = (s) =>
  s
    .replace(/<a [^>]*>/g, '')
    .replace(/<\/a>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&scaron;/g, 'š')
    .trim();
const refUrl = (s) => s.match(/href=(\S+?)[ >]/)?.[1] ?? null;
/** A value from the composite table, cited to the archive's per-field reference. */
function fromArchive(row, field, scale = 1, digits = 6) {
  const raw = row[field];
  if (raw === '' || raw === undefined) return null;
  const refField = row[`${field}_reflink`] !== undefined ? `${field}_reflink` : field.replace(/^pl_bmasse$/, 'pl_bmasse_reflink');
  const ref = row[refField] ?? '';
  const calc = /CALCULATED_VALUE/.test(ref);
  const out = { v: Number((Number(raw) * scale).toPrecision(digits)), ref: 'nea-pscomppars' };
  const e1 = row[`${field}err1`];
  const e2 = row[`${field}err2`];
  if (e1 !== '' && e1 !== undefined && e2 !== '' && e2 !== undefined) {
    out.err = Math.abs(Number(e1)) === Math.abs(Number(e2)) ? Number((Math.abs(Number(e1)) * scale).toPrecision(3)) : [Number((Number(e2) * scale).toPrecision(3)), Number((Number(e1) * scale).toPrecision(3))];
  }
  out.source = calc ? 'calculated by the NASA Exoplanet Archive (mass-radius relation / derived)' : decodeRef(ref);
  const url = refUrl(ref);
  if (url && !calc) out.url = url;
  return out;
}
const psRow = (plName, refPattern) => {
  const r = ps.find((x) => x.pl_name === plName && refPattern.test(decodeRef(x.pl_refname)));
  if (!r) throw new Error(`no PS row for ${plName} ${refPattern}`);
  return r;
};
const discovery = (row) => ({
  year: Number(row.disc_year),
  method: row.discoverymethod,
  facility: row.disc_facility,
  reference: decodeRef(row.disc_refname),
  url: refUrl(row.disc_refname),
});

// ---------------------------------------------------------------------------------------------
// References

const REFS = {
  'nea-pscomppars': { cite: 'NASA Exoplanet Archive, Planetary Systems Composite Parameters table, retrieved 2026-09-25', doi: '10.26133/NEA13', url: 'https://exoplanetarchive.ipac.caltech.edu/' },
  'nea-ps': { cite: 'NASA Exoplanet Archive, Planetary Systems table (per-reference solutions), retrieved 2026-09-25', doi: '10.26133/NEA12', url: 'https://exoplanetarchive.ipac.caltech.edu/' },
  christiansen2025: { cite: 'Christiansen, J. L., et al. 2025, PSJ, 6, 186 (the NASA Exoplanet Archive)', doi: '10.3847/PSJ/ade3c2' },
  agol2021: { cite: 'Agol, E., et al. 2021, PSJ, 2, 1', ads: '2021PSJ.....2....1A', arxiv: '2010.01074' },
  'agol2021-forecast': { cite: 'Agol, E., et al. 2021, PSJ, 2, 1, Table 15 (forecast transit times, full electronic table from the authors\' repository github.com/ericagol/TRAPPIST1_Spitzer, MIT licence)', ads: '2021PSJ.....2....1A', arxiv: '2010.01074' },
  rathcke2025: { cite: 'Rathcke et al. 2025, ApJL, 979, L19 (JWST transit times of TRAPPIST-1 b and c; used only as a check)', ads: '2025ApJ...979L..19R' },
  suarez2025: { cite: 'Suárez Mascareño, A., et al. 2025, A&A, 700, A11', doi: '10.1051/0004-6361/202553728', arxiv: '2507.21751' },
  damasso2020: { cite: 'Damasso, M., et al. 2020, Science Advances, 6, eaax7467', doi: '10.1126/sciadv.aax7467' },
  kervella2020: { cite: 'Kervella, P., Arenou, F., & Thévenin, F. 2020, A&A, 635, L14', doi: '10.1051/0004-6361/202037551', arxiv: '2003.13106' },
  gratton2020: { cite: 'Gratton, R., et al. 2020, A&A, 638, A120', doi: '10.1051/0004-6361/202037594', arxiv: '2004.06685' },
  artigau2022: { cite: 'Artigau, É., et al. 2022, AJ, 164, 84', doi: '10.3847/1538-3881/ac7ce6', arxiv: '2207.13524' },
  faria2022: { cite: 'Faria, J. P., et al. 2022, A&A, 658, A115', ads: '2022A&A...658A.115F' },
  basant2025: { cite: 'Basant, R., et al. 2025, ApJL, 982, L1', doi: '10.3847/2041-8213/adb8d5', arxiv: '2503.08095' },
  gonzalez2024: { cite: 'González Hernández, J. I., et al. 2024, A&A, 690, A79', ads: '2024A&A...690A..79G' },
  cont2026: { cite: 'Cont, D., et al. 2026, A&A, 710, A345', doi: '10.1051/0004-6361/202558116', arxiv: '2605.23582' },
  mayor1995: { cite: 'Mayor, M., & Queloz, D. 1995, Nature, 378, 355', ads: '1995Natur.378..355M' },
  wang2018: { cite: 'Wang, J. J., et al. 2018, AJ, 156, 192', doi: '10.3847/1538-3881/aae150', arxiv: '1809.04107' },
  ruffio2019: { cite: 'Ruffio, J.-B., et al. 2019, AJ, 158, 200', doi: '10.3847/1538-3881/ab4594', arxiv: '1909.07571' },
  marois2008: { cite: 'Marois, C., et al. 2008, Science, 322, 1348', ads: '2008Sci...322.1348M' },
  cabrera2014: { cite: 'Cabrera, J., et al. 2014, ApJ, 781, 18', doi: '10.1088/0004-637X/781/1/18', arxiv: '1310.6248' },
  shallue2018: { cite: 'Shallue, C. J., & Vanderburg, A. 2018, AJ, 155, 94', doi: '10.3847/1538-3881/aa9e09', arxiv: '1712.05044' },
  shaw2025: { cite: 'Shaw, D. E., et al. 2025, AJ, 170, 146', doi: '10.3847/1538-3881/ade67b', arxiv: '2507.13588' },
  pass2026: { cite: 'Pass, E. K., Charbonneau, D., Vanderburg, A., & Bean, J. L. 2026, AJ, 172, 175', ads: '2026AJ....172..175P', arxiv: '2604.05235' },
  gilbert2023: { cite: 'Gilbert, E. A., et al. 2023, ApJL, 944, L35', doi: '10.3847/2041-8213/acb599', arxiv: '2301.03617' },
  doyle2011: { cite: 'Doyle, L. R., et al. 2011, Science, 333, 1602', doi: '10.1126/science.1210923', arxiv: '1109.3432' },
  keplerEB: { cite: 'Villanova Kepler Eclipsing Binary Catalog, KIC 12644769 (Kirk, B., et al. 2016, AJ, 151, 68)', url: 'https://keplerebs.villanova.edu/overview/?k=12644769' },
  thompson2025: { cite: 'Thompson, W., et al. 2025, AJ, 170, 301', doi: '10.3847/1538-3881/ae0cbd', arxiv: '2502.20561' },
  harada2025: { cite: 'Harada, C. K., et al. 2025, AJ, 170, 343 (values as tabulated in the NASA Exoplanet Archive PS table)', ads: '2025AJ....170..343H' },
  llopsayson2026: { cite: 'Llop-Sayson, J., et al. 2026, arXiv:2609.19131 (submitted; not used for values)', arxiv: '2609.19131' },
  feng2017: { cite: 'Feng, F., et al. 2017, AJ, 154, 135', doi: '10.3847/1538-3881/aa83b4', arxiv: '1708.02051' },
  figueira2025: { cite: 'Figueira, P., et al. 2025, A&A, 700, A174', doi: '10.1051/0004-6361/202553869', arxiv: '2507.07514' },
  lawler2014: { cite: 'Lawler, S. M., et al. 2014, MNRAS, 444, 2665 (Herschel; disc i = 35 ± 10 deg, PA = 105 ± 10 deg, as quoted by MacGregor et al. 2016, ApJ, 828, 113, doi:10.3847/0004-637X/828/2/113)', doi: '10.1093/mnras/stu1641' },
  beichman2025: { cite: 'Beichman, C., Sanghi, A., et al. 2025, ApJL, 989, L22 (Paper I)', doi: '10.3847/2041-8213/adf53f', arxiv: '2508.03814' },
  sanghi2025: { cite: 'Sanghi, A., Beichman, C., et al. 2025, ApJL, 989, L23 (Paper II)', doi: '10.3847/2041-8213/adf53e', arxiv: '2508.03812' },
  wagner2021: { cite: 'Wagner, K., et al. 2021, Nature Communications, 12, 922 (VLT/NEAR candidate C1)', doi: '10.1038/s41467-021-21176-6', arxiv: '2102.05159' },
  akeson2021: { cite: 'Akeson, R., et al. 2021, AJ, 162, 14', doi: '10.3847/1538-3881/abfaff', arxiv: '2104.10086' },
  chen2017: { cite: 'Chen, J., & Kipping, D. 2017, ApJ, 834, 17 (probabilistic mass-radius relation; mean relation used for estimates)', ads: '2017ApJ...834...17C' },
};

// ---------------------------------------------------------------------------------------------
// Value helpers

const V = (v, ref, extra = {}) => ({ v, ref, ...extra });
const ASSUMED = (v, why, extra = {}) => ({ v, assumed: why, ...extra });
const DERIVED = (v, how, extra = {}) => ({ v, derived: how, ...extra });

/**
 * Resolve a planet: inputs -> the numeric orbit used by the evaluator, plus the state at the epoch.
 * inputs.argPeri: { v, convention: 'star' | 'planet', ... } (star = RV/transit omega; planet = visual-binary omega).
 * inputs.phase: { kind: 'transit' | 'conjunction' | 'periastron' | 'meanAnomaly', jd, sigmaDays?, periodSigmaDays?, meanAnomalyDeg?, ... }
 */
function resolvePlanet(p) {
  const i = p.inputs;
  const e = i.e.v;
  const argPeriPlanet = i.argPeri.convention === 'star' ? wrap360(i.argPeri.v + 180) : wrap360(i.argPeri.v);
  const P = i.periodDays.v;
  let tPeri;
  const ph = i.phase;
  if (ph.kind === 'transit' || ph.kind === 'conjunction') tPeri = tPeriFromConj(ph.jd, P, e, argPeriPlanet);
  else if (ph.kind === 'periastron') tPeri = ph.jd;
  else if (ph.kind === 'meanAnomaly') tPeri = ph.jd - (wrap360(ph.meanAnomalyDeg) / 360) * P;
  else throw new Error(`phase kind ${ph.kind}`);
  const orbit = {
    periodDays: P,
    aAu: i.aAu.v,
    e,
    iDeg: i.iDeg.v,
    nodeDeg: round(wrap360(i.nodeDeg.v), 6),
    argPeriDeg: round(argPeriPlanet, 6),
    tPeriJd: round(tPeri, 6),
  };
  const n = (EPOCH_JD - ph.jd) / P;
  const sigma =
    ph.sigmaDays !== undefined || ph.periodSigmaDays !== undefined
      ? Math.hypot(ph.sigmaDays ?? 0, Math.abs(n) * (ph.periodSigmaDays ?? 0))
      : null;
  const M = wrap360((360 * (EPOCH_JD - tPeri)) / P);
  const nextConj = (() => {
    const t0 = conjFromTPeri(tPeri, P, e, argPeriPlanet);
    return t0 + Math.ceil((EPOCH_JD - t0) / P) * P;
  })();
  return {
    ...p,
    orbit,
    atEpoch: {
      jd: EPOCH_JD,
      meanAnomalyDeg: round(M, 3),
      firstConjunctionAfterJd: round(nextConj, 5),
      phaseSigmaDays: sigma === null ? null : round(sigma, 5),
      phaseSigmaOrbits: sigma === null ? null : round(sigma / P, 5),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// TRAPPIST-1 (Agol et al. 2021)

const agolForecast = readFileSync('data-raw/agol2021_trappist1_times_forecast.csv', 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((l) => l.split(',').map(Number));
// Agol et al. 2021 Table 2 (TTV model, osculating Jacobi elements at BJD_TDB 2457257.93115525):
// e cos(omega), e sin(omega); Table 5 (photodynamic): inclination; Table 6: a, R, M, S.
const T1 = {
  b: { ecosw: -0.00215, esinw: 0.00217, i: [89.728, 0.165], a: [1.154e-2, 0.010e-2], R: [1.116, [-0.012, 0.014]], M: [1.374, 0.069], S: 4.153 },
  c: { ecosw: 0.00055, esinw: 0.00001, i: [89.778, 0.118], a: [1.58e-2, 0.013e-2], R: [1.097, [-0.012, 0.014]], M: [1.308, 0.056], S: 2.214 },
  d: { ecosw: -0.00496, esinw: 0.00267, i: [89.896, 0.077], a: [2.227e-2, 0.019e-2], R: [0.788, [-0.01, 0.011]], M: [0.388, 0.012], S: 1.115 },
  e: { ecosw: 0.00433, esinw: -0.00461, i: [89.793, 0.048], a: [2.925e-2, 0.025e-2], R: [0.92, [-0.012, 0.013]], M: [0.692, 0.022], S: 0.646 },
  f: { ecosw: -0.0084, esinw: -0.00051, i: [89.74, 0.019], a: [3.849e-2, 0.033e-2], R: [1.045, [-0.012, 0.013]], M: [1.039, 0.031], S: 0.373 },
  g: { ecosw: 0.0038, esinw: 0.00128, i: [89.742, 0.012], a: [4.683e-2, 0.04e-2], R: [1.129, [-0.013, 0.015]], M: [1.321, 0.038], S: 0.252 },
  h: { ecosw: -0.00365, esinw: -0.00002, i: [89.805, 0.013], a: [6.189e-2, 0.053e-2], R: [0.755, 0.014], M: [0.326, 0.02], S: 0.144 },
};
const trappistNode = assumedNodeDeg('TRAPPIST-1');
const trappistPlanets = Object.entries(T1).map(([id, d], k) => {
  const pts = agolForecast.filter((r) => r[0] === k + 1).map((r) => [r[1], r[2] + 2_450_000]);
  const fit = linearFit(pts);
  const n = Math.round((EPOCH_JD - fit.T0) / fit.P);
  const tNear = fit.T0 + n * fit.P;
  const e = Math.hypot(d.ecosw, d.esinw);
  const w = wrap360(Math.atan2(d.esinw, d.ecosw) / DEG);
  const name = `TRAPPIST-1 ${id}`;
  return resolvePlanet({
    id,
    name,
    archiveName: name,
    status: 'confirmed',
    centre: 'A',
    inputs: {
      periodDays: DERIVED(round(fit.P, 8), `mean period: least-squares line through the ${pts.length} posterior-mean transit times of Agol et al. 2021 Table 15 (BJD ${pts[0][1].toFixed(1)} to ${pts.at(-1)[1].toFixed(1)})`, { ref: 'agol2021-forecast' }),
      aAu: V(d.a[0], 'agol2021', { err: d.a[1], where: 'Table 6' }),
      e: V(round(e, 5), 'agol2021', { where: 'Table 2, sqrt((e cos w)^2 + (e sin w)^2), osculating at BJD 2457257.93; consistent with zero within 1-3 sigma' }),
      argPeri: V(round(w, 2), 'agol2021', {
        where: 'Table 2, atan2(e sin w, e cos w)',
        convention: 'star',
        note: 'The paper does not state the sign convention of its N-body omega; we take the transit convention (omega of the star). With e < 0.01 the choice moves a planet by at most 1% of a and does not change transit times, which come from the ephemeris.',
      }),
      iDeg: V(d.i[0], 'agol2021', { err: d.i[1], where: 'Table 5 (for impact parameter b > 0)' }),
      nodeDeg: ASSUMED(trappistNode, 'The position angle of the orbits on the sky is not measurable from transits. All seven planets share one node (the TTV analysis assumes coplanar orbits); the value is a fixed pseudo-random angle derived from the host name (assumedNodeDeg), identical to the archive fallback.'),
      phase: {
        kind: 'transit',
        jd: round(tNear, 6),
        ref: 'agol2021-forecast',
        how: `transit nearest the epoch on the fitted mean ephemeris (T0 = ${fit.T0.toFixed(6)} BJD_TDB at epoch 0)`,
        ttvRmsMinutes: round(fit.rms * 1440, 1),
        ttvMaxMinutes: round(fit.max * 1440, 1),
        note: 'A fixed Kepler orbit cannot follow the transit-timing variations; over 2015-2023 the forecast times scatter about this mean ephemeris by the rms and maximum quoted here. The JWST transits of b and c on 2024-07-11 (Rathcke et al. 2025) fall 8.8 and -3.3 minutes from it.',
      },
    },
    radiusEarth: V(d.R[0], 'agol2021', { err: d.R[1], where: 'Table 6' }),
    massEarth: V(d.M[0], 'agol2021', { err: d.M[1], where: 'Table 6', kind: 'true' }),
    insolationEarth: V(d.S, 'agol2021', { where: 'Table 6' }),
    teqK: DERIVED(round(teqFromFlux(d.S), 0), 'zero albedo, full heat redistribution, from the insolation S (Table 6)'),
    discovery: discovery(compPlanet(name)),
  });
});

// ---------------------------------------------------------------------------------------------
// Proxima Centauri (Suárez Mascareño et al. 2025, Table 3; circular orbits)

const proxNode = assumedNodeDeg('Proxima Cen');
const proxI = ASSUMED(47, 'Orbits assumed coplanar with the stellar equator, tilted 47 ± 7 deg (Klein et al. 2021, as adopted in Suárez Mascareño et al. 2025 Table 3 for the "mp,47" masses). Only m sin i is measured.', { ref: 'suarez2025' });
const proxNodeV = ASSUMED(proxNode, 'Unknown (RV only). Fixed pseudo-random angle from the host name (assumedNodeDeg).');
function proxPlanet(id, P, sP, T0, sT0, a, sa, msini, smsini, m47, sm47, S, teq) {
  const name = `Proxima Cen ${id}`;
  const mass = m47;
  return resolvePlanet({
    id,
    name,
    archiveName: name,
    status: 'confirmed',
    centre: 'A',
    inputs: {
      periodDays: V(P, 'suarez2025', { err: sP, where: 'Table 3' }),
      aAu: V(a, 'suarez2025', { err: sa, where: 'Table 3' }),
      e: V(0, 'suarez2025', { where: 'Table 3: adopted model is circular (e fixed at 0)' }),
      argPeri: ASSUMED(90, 'Undefined for a circular orbit; any value gives the same positions.', { convention: 'star' }),
      iDeg: proxI,
      nodeDeg: proxNodeV,
      phase: { kind: 'conjunction', jd: T0, sigmaDays: sT0, periodSigmaDays: sP, ref: 'suarez2025', where: 'Table 3, T0 = time of inferior conjunction (eq. 12 and text; the archive lists it as a time of periastron)' },
    },
    radiusEarth: DERIVED(round(forecastRadiusEarth(mass), 3), `estimate from the mass assuming i = 47 deg (${m47} Earth masses) with the Chen & Kipping 2017 mean relation; not measured`, { ref: 'chen2017', estimate: true }),
    massEarth: V(msini, 'suarez2025', { err: smsini, where: 'Table 3', kind: 'minimum', ifInclination47: { v: m47, err: sm47 } }),
    insolationEarth: V(S, 'suarez2025', { where: 'Table 3' }),
    teqK: V(teq, 'suarez2025', { where: 'Table 3, Bond albedo 0.3' }),
    discovery: discovery(compPlanet(name)),
  });
}
const proximaB = proxPlanet('b', 11.18465, 0.00053, 2_460_548.59, 0.12, 0.04848, 0.00029, 1.055, 0.055, 1.44, 0.21, 0.641, 218);
const proximaD = proxPlanet('d', 5.12338, 0.00035, 2_460_557.55, 0.16, 0.02881, 0.00017, 0.26, 0.038, 0.357, 0.072, 1.814, 282);
const proximaC = resolvePlanet({
  id: 'c',
  name: 'Proxima Cen c',
  archiveName: null,
  status: 'disputed',
  showByDefault: false,
  centre: 'A',
  statusNote:
    'Proposed from HARPS and UVES radial velocities by Damasso et al. 2020 (P ~ 1900 d, m sin i = 5.8 ± 1.9 Earth masses). Kervella et al. 2020 combined it with the Gaia DR2 proper-motion anomaly (i = 152 ± 14 deg, m ~ 12 Earth masses) and Gratton et al. 2020 reported a possible SPHERE counterpart. Artigau et al. 2022 found the signal likely instrumental, ESPRESSO (Faria et al. 2022) did not confirm it, and NIRPS (Suárez Mascareño et al. 2025) found only inconclusive hints. The NASA Exoplanet Archive does not list it as confirmed: it appears only as a "Candidate Planet" on the alf Cen overview page (Targets Excluded page, updated 8 July 2026).',
  inputs: {
    periodDays: V(1900, 'damasso2020', { err: [-82, 96], where: 'Table 1' }),
    aAu: V(1.48, 'damasso2020', { err: 0.08, where: 'Table 1' }),
    e: V(0, 'damasso2020', { where: 'Table 1: e fixed at 0' }),
    argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
    iDeg: V(152, 'kervella2020', { err: 14, note: 'Gaia DR2 proper-motion anomaly; i > 90 deg means clockwise on the sky' }),
    nodeDeg: proxNodeV,
    phase: { kind: 'conjunction', jd: 2_455_892, sigmaDays: 102, periodSigmaDays: 89, ref: 'damasso2020', where: 'Table 1, T_c,conj = 2455892 (-102/+101) BJD' },
  },
  radiusEarth: DERIVED(round(forecastRadiusEarth(12), 2), 'estimate for 12 Earth masses (Kervella et al. 2020) from the Chen & Kipping 2017 mean relation', { ref: 'chen2017', estimate: true }),
  massEarth: V(5.8, 'damasso2020', { err: 1.9, kind: 'minimum', alternative: { v: 12, err: [-5, 12], ref: 'kervella2020', kind: 'true (astrometric)' } }),
  teqK: V(39, 'damasso2020', { err: [-18, 16], where: 'Table 1' }),
  discovery: { year: 2020, method: 'Radial Velocity', facility: 'European Southern Observatory', reference: 'Damasso et al. 2020', url: 'https://doi.org/10.1126/sciadv.aax7467' },
});

// ---------------------------------------------------------------------------------------------
// Barnard's Star (Basant et al. 2025, Table 3)

const barnardNode = assumedNodeDeg("Barnard's star");
const barnardI = ASSUMED(60, 'Unknown: RV only and no transits. 60 deg is the median inclination for randomly oriented orbits (cos i uniform); masses are therefore minimum masses.');
function barnardPlanet(id, P, sP, t0, sT0, K, msini, smsini, a, sa, teq) {
  const name = `Barnard ${id}`;
  return resolvePlanet({
    id,
    name,
    archiveName: name,
    status: 'confirmed',
    centre: 'A',
    inputs: {
      periodDays: V(P, 'basant2025', { err: sP, where: 'Table 3' }),
      aAu: V(a, 'basant2025', { err: sa, where: 'Table 3' }),
      e: ASSUMED(0, 'Table 3 eccentricities (0.03-0.08, beta-distribution prior) are consistent with zero and their arguments of periastron are unconstrained (uncertainties > 90 deg); we use circular orbits.'),
      argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
      iDeg: barnardI,
      nodeDeg: ASSUMED(barnardNode, 'Unknown (RV only). Fixed pseudo-random angle from the host name (assumedNodeDeg).'),
      phase: {
        kind: 'conjunction',
        jd: t0,
        sigmaDays: sT0,
        periodSigmaDays: sP,
        ref: 'basant2025',
        where: 'Table 3, t0',
        note: 'The text calls t0 the "time of periastron passage", but the fit uses juliet, whose t0 is the time of inferior conjunction, and a +-0.1 d uncertainty is only possible for a conjunction time when omega is unconstrained. We use it as the conjunction time.',
      },
    },
    radiusEarth: DERIVED(round(forecastRadiusEarth(msini / Math.sin(60 * DEG)), 3), 'estimate from m sin i / sin(60 deg) with the Chen & Kipping 2017 mean relation; not measured', { ref: 'chen2017', estimate: true }),
    massEarth: V(msini, 'basant2025', { err: smsini, where: 'Table 3', kind: 'minimum' }),
    rvSemiAmplitudeMs: V(K, 'basant2025', { where: 'Table 3' }),
    teqK: V(teq, 'basant2025', { where: 'Table 3, zero albedo, full redistribution' }),
    discovery: discovery(compPlanet(name)),
  });
}
const barnard = [
  barnardPlanet('d', 2.3402, 0.0003, 2_460_243.7, 0.08, 0.428, 0.263, 0.024, 0.0188, 0.0003, 483),
  barnardPlanet('b', 3.1542, 0.0004, 2_460_243.38, 0.09, 0.44, 0.299, 0.026, 0.0229, 0.0003, 438),
  barnardPlanet('c', 4.1244, 0.0006, 2_460_242.92, 0.1, 0.452, 0.335, 0.03, 0.0274, 0.0004, 400),
  barnardPlanet('e', 6.7392, 0.0028, 2_460_245.3, 0.37, 0.221, 0.193, 0.033, 0.0381, 0.0005, 340),
];

// ---------------------------------------------------------------------------------------------
// 51 Pegasi b (Cont et al. 2026, Tables 1 and 2)

const peg = resolvePlanet({
  id: 'b',
  name: '51 Peg b',
  archiveName: '51 Peg b',
  status: 'confirmed',
  centre: 'A',
  inputs: {
    periodDays: V(4.2307966, 'cont2026', { err: 0.0000027, where: 'Table 2' }),
    aAu: V(0.052, 'cont2026', { where: 'Table 1' }),
    e: V(0, 'cont2026', { where: 'Table 2: e < 0.0063; circular adopted' }),
    argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
    iDeg: V(49.8, 'cont2026', {
      err: [-5.7, 5.8],
      where: 'abstract and Table 1, from the planet\'s orbital velocity K_p = 102.8 km/s measured with CRIRES+',
      note: 'Only sin i is measured: 49.8 or 130.2 deg (the sense of motion on the sky is unknown; 49.8 assumed). Earlier dayside detections gave K_p ~ 133 km/s and i ~ 70-82 deg (Brogi et al. 2013; Birkby et al. 2017); Cont et al. discuss the discrepancy.',
    }),
    nodeDeg: ASSUMED(assumedNodeDeg('51 Peg'), 'Unknown. Fixed pseudo-random angle from the host name (assumedNodeDeg).'),
    phase: { kind: 'conjunction', jd: 2_456_326.9323, sigmaDays: 0.0013, periodSigmaDays: 0.0000027, ref: 'cont2026', where: 'Table 2, T_C (BJD_TDB)' },
  },
  radiusEarth: DERIVED(round(forecastRadiusEarth(0.61 * M_JUP_MEARTH), 2), 'estimate for 0.61 Jupiter masses with the Chen & Kipping 2017 mean relation; 51 Peg b does not transit, so its radius is not measured', { ref: 'chen2017', estimate: true }),
  massEarth: V(round(0.61 * M_JUP_MEARTH, 1), 'cont2026', { err: [round(-0.05 * M_JUP_MEARTH, 1), round(0.06 * M_JUP_MEARTH, 1)], where: '0.61 (+0.06/-0.05) Jupiter masses', kind: 'true' }),
  teqK: fromArchive(compPlanet('51 Peg b'), 'pl_eqt', 1, 4),
  discovery: discovery(compPlanet('51 Peg b')),
});

// ---------------------------------------------------------------------------------------------
// HR 8799 (Wang et al. 2018, Table 4 "stable coplanar", osculating at MJD 56609)

const WANG_M = 1.47; // solar masses (Table 4)
const WANG_PLX = 24.3; // mas (Table 4)
const WANG = {
  b: { a: [70.8, [-0.18, 0.19]], tau: 0.46, w: [87, 58], e: [0.018, [-0.013, 0.018]] },
  c: { a: [43.1, [-1.4, 1.3]], tau: 0.43, w: [67, [-39, 59]], e: [0.022, [-0.017, 0.023]] },
  d: { a: [26.2, [-0.7, 0.9]], tau: 0.839, w: [17, [-11, 12]], e: [0.129, [-0.025, 0.022]] },
  e: { a: [16.2, 0.5], tau: 0.124, w: [110, 9], e: [0.118, [-0.028, 0.019]] },
};
// Wang et al. 2018 Table 2: GPI astrometry (UT date, separation mas, PA deg).
const GPI = [
  ['c', calToJd(2013, 11, 17), 949.5, 325.18], ['d', calToJd(2013, 11, 17), 654.6, 214.15], ['e', calToJd(2013, 11, 17), 382.6, 265.13],
  ['b', calToJd(2014, 9, 12), 1721.2, 65.46], ['c', calToJd(2014, 9, 12), 949.0, 326.53], ['d', calToJd(2014, 9, 12), 662.5, 216.57],
  ['c', calToJd(2016, 9, 19), 944.2, 330.01], ['d', calToJd(2016, 9, 19), 674.5, 221.81], ['e', calToJd(2016, 9, 19), 384.8, 281.68],
];
const HR_MASS_MJ = { b: [5.8, 0.5], c: [7.2, [-0.7, 0.6]], d: [7.2, [-0.7, 0.6]], e: [7.2, [-0.7, 0.6]] };
const hr8799 = Object.entries(WANG).map(([id, d]) => {
  const P = periodDays(d.a[0], WANG_M);
  const mk = (tau) => ({ periodDays: P, aAu: d.a[0], e: d.e[0], iDeg: 26.8, nodeDeg: 67.9, argPeriDeg: d.w[0], tPeriJd: 2_400_000.5 + 50_000 + tau * P });
  const obs = GPI.filter((o) => o[0] === id);
  const cost = (tau) =>
    obs.reduce((s, [, jd, sep, pa]) => {
      const p = skyPos(mk(tau), jd);
      return s + (p.north - (sep * Math.cos(pa * DEG)) / WANG_PLX) ** 2 + (p.east - (sep * Math.sin(pa * DEG)) / WANG_PLX) ** 2;
    }, 0);
  let best = d.tau;
  let bestC = cost(best);
  for (let tau = 0; tau < 1; tau += 1e-5) {
    const c = cost(tau);
    if (c < bestC) {
      bestC = c;
      best = tau;
    }
  }
  const tp = 2_400_000.5 + 50_000 + best * P;
  const rmsMas = Math.sqrt(bestC / obs.length) * WANG_PLX;
  const name = `HR 8799 ${id}`;
  const row = compPlanet(name);
  return resolvePlanet({
    id,
    name,
    archiveName: name,
    status: 'confirmed',
    centre: 'A',
    inputs: {
      periodDays: DERIVED(round(P, 1), `Kepler's third law from a and the stellar mass ${WANG_M} solar masses (Wang et al. 2018 Table 4; their fits share one total mass). ${(P / JULIAN_YEAR).toFixed(1)} yr.`, { ref: 'wang2018' }),
      aAu: V(d.a[0], 'wang2018', { err: d.a[1], where: 'Table 4 (stable coplanar)' }),
      e: V(d.e[0], 'wang2018', { err: d.e[1], where: 'Table 4' }),
      argPeri: V(d.w[0], 'wang2018', { err: d.w[1], where: 'Table 4', convention: 'planet' }),
      iDeg: V(26.8, 'wang2018', { err: 2.3, where: 'Table 4 (coplanar); i < 90: counterclockwise, as observed' }),
      nodeDeg: V(67.9, 'wang2018', {
        err: [-5.2, 5.9],
        where: 'Table 4',
        note: 'Astrometry alone leaves a 180 deg ambiguity (which half of the orbit is nearer). The planets\' radial velocities (Ruffio et al. 2019: RV_b - RV_c = +2.4 ± 0.7 km/s in 2010) select this branch in our receding-node convention: the model gives +2.6 km/s, the other branch -2.6 km/s (tested).',
        ref2: 'ruffio2019',
      }),
      phase: {
        kind: 'periastron',
        jd: round(tp, 3),
        ref: 'wang2018',
        how: `tau refitted to the GPI astrometry of Wang et al. 2018 Table 2 with the other Table 4 elements fixed (published median tau = ${d.tau}; refit tau = ${round(best, 5)}; rms residual ${rmsMas.toFixed(1)} mas over ${obs.length} epoch(s)). The medians of tau and omega are not a consistent pair for near-circular orbits, so the published tau alone misplaces b and c by up to 60 deg.`,
      },
    },
    radiusEarth: fromArchive(row, 'pl_rade', 1, 4),
    massEarth: V(round(HR_MASS_MJ[id][0] * M_JUP_MEARTH, 0), 'wang2018', {
      err: Array.isArray(HR_MASS_MJ[id][1]) ? HR_MASS_MJ[id][1].map((x) => round(x * M_JUP_MEARTH, 0)) : round(HR_MASS_MJ[id][1] * M_JUP_MEARTH, 0),
      where: `abstract: ${HR_MASS_MJ[id][0]} Jupiter masses from dynamical stability plus hot-start evolution models (age 42 ± 5 Myr)`,
      kind: 'model-dependent',
    }),
    teqK: fromArchive(row, 'pl_eqt', 1, 4),
    discovery: discovery(row),
  });
});

// ---------------------------------------------------------------------------------------------
// Kepler-90 = KOI-351 (Cabrera et al. 2014; Shallue & Vanderburg 2018; Shaw et al. 2025)

const k90Node = assumedNodeDeg('KOI-351');
const k90NodeV = ASSUMED(k90Node, 'Not measurable from transits; all eight planets share one node. Fixed pseudo-random angle from the host name (assumedNodeDeg).');
// Cabrera et al. 2014 Table (epochs in HJD - 2454833; the archive's pl_tranmid adds 2454833).
const CAB = {
  b: { P: [7.008151, 0.000019], T: [137.6906, 0.0017], i: [89.4, 1.5], R: [1.31, 0.17], a: 0.074 },
  c: { P: [8.719375, 0.000027], T: [139.5687, 0.0023], i: [89.68, 0.74], R: [1.19, 0.14], a: 0.089 },
  d: { P: [59.73667, 0.00038], T: [158.9656, 0.0042], i: [89.71, 0.29], R: [2.87, 0.3], a: 0.32 },
  e: { P: [91.93913, 0.00073], T: [134.3127, 0.0063], i: [89.79, 0.19], R: [2.66, 0.29], a: 0.42 },
  f: { P: [124.9144, 0.0019], T: [254.704, 0.014], i: [89.77, 0.31], R: [2.88, 0.52], a: 0.48 },
  g: { i: [89.8, 0.06], R: [8.1, 0.8], a: 0.71 },
  h: { i: [89.6, 1.3], R: [11.3, 1.0], a: 1.01 },
};
const shawTable6 = readFileSync('data-raw/shaw2025_kepler90gh_table6.txt', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/).map(Number));
const SHAW = { g: { e: [0.0292, 0.0038], w: [114.6, [-3.8, 3.5]], M: [15.0, 1.3], col: 1 }, h: { e: [0.0276, 0.0031], w: [119.0, [-3.1, 3.0]], M: [203, 16], col: 2 } };
const k90Name = { b: 'KOI-351 b', c: 'KOI-351 c', d: 'KOI-351 d', e: 'KOI-351 e', f: 'KOI-351 f', g: 'KOI-351 g', h: 'KOI-351 h', i: 'Kepler-90 i' };
const kepler90 = [];
for (const id of ['b', 'c', 'i', 'd', 'e', 'f', 'g', 'h']) {
  const name = `Kepler-90 ${id}`;
  const row = compPlanet(k90Name[id]);
  let inputs;
  let mass = null;
  if (id === 'i') {
    inputs = {
      periodDays: V(14.44912, 'shallue2018', { err: 0.0002 }),
      aAu: fromArchive(row, 'pl_orbsmax', 1, 4) ?? DERIVED(round(smaAu(14.44912, 1.2), 4), 'Kepler III with M = 1.2'),
      e: ASSUMED(0, 'Not measured; circular assumed.'),
      argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
      iDeg: V(89.2, 'shallue2018'),
      nodeDeg: k90NodeV,
      phase: { kind: 'transit', jd: 2_455_644.3488, sigmaDays: 0.0048, periodSigmaDays: 0.0002, ref: 'shallue2018', where: 'as tabulated in the NASA Exoplanet Archive PS table' },
    };
  } else if (id === 'g' || id === 'h') {
    const s = SHAW[id];
    const pts = shawTable6.map((r) => [r[0], r[s.col] + 2_454_900]);
    const fit = linearFit(pts);
    const nearest = pts.reduce((b, p) => (Math.abs(p[1] - EPOCH_JD) < Math.abs(b[1] - EPOCH_JD) ? p : b));
    inputs = {
      periodDays: DERIVED(round(fit.P, 6), `mean period: least-squares line through the 35 predicted transit times of Shaw et al. 2025 Table 6 (BJD ${pts[0][1].toFixed(1)} to ${pts.at(-1)[1].toFixed(1)}; scatter about it ${round(fit.rms * 24, 1)} h rms, ${round(fit.max * 24, 1)} h max)`, { ref: 'shaw2025' }),
      aAu: V(CAB[id].a, 'cabrera2014'),
      e: V(s.e[0], 'shaw2025', { err: s.e[1], where: 'Table 4 (RV + all transits, MCMC)' }),
      argPeri: V(s.w[0], 'shaw2025', { err: s.w[1], where: 'Table 4', convention: 'star', note: 'Joint RV-TTV fit: omega of the RV (stellar) convention.' }),
      iDeg:
        id === 'h'
          ? DERIVED(round(Math.acos(0.36 / 180.7) / DEG, 3), 'from the impact parameter b = 0.36 ± 0.07 and a/R* = 180.7 ± 4.7 (Cabrera et al. 2014): cos i = b / (a/R*). The tabulated i = 89.6 ± 1.3 deg is rounded too coarsely to make the planet transit (it gives b = 1.26).', { ref: 'cabrera2014' })
          : V(CAB[id].i[0], 'cabrera2014', { err: CAB[id].i[1] }),
      nodeDeg: k90NodeV,
      phase: {
        kind: 'transit',
        jd: round(nearest[1], 4),
        sigmaDays: 0.006,
        ref: 'shaw2025',
        where: `Table 6, predicted transit epoch ${nearest[0]} (TTVs included)`,
        note: `Kepler-90 ${id} has large transit-timing variations; the orbit is anchored on this predicted transit and drifts from the true times by up to ${round(fit.max * 24, 1)} h elsewhere.`,
      },
    };
    mass = V(s.M[0], 'shaw2025', { err: s.M[1], where: 'Table 4', kind: 'true' });
  } else {
    const c = CAB[id];
    inputs = {
      periodDays: V(c.P[0], 'cabrera2014', { err: c.P[1] }),
      aAu: V(c.a, 'cabrera2014'),
      e: ASSUMED(0, 'Not measured; circular assumed.'),
      argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
      iDeg: V(c.i[0], 'cabrera2014', { err: c.i[1] }),
      nodeDeg: k90NodeV,
      phase: { kind: 'transit', jd: round(c.T[0] + 2_454_833, 4), sigmaDays: c.T[1], periodSigmaDays: c.P[1], ref: 'cabrera2014', where: 'epoch (HJD - 2454833); HJD and BJD differ by < 1 min here' },
    };
  }
  kepler90.push(
    resolvePlanet({
      id,
      name,
      archiveName: k90Name[id],
      status: 'confirmed',
      centre: 'A',
      inputs,
      radiusEarth: id === 'i' ? V(1.32, 'shallue2018') : V(CAB[id].R[0], 'cabrera2014', { err: CAB[id].R[1] }),
      massEarth: mass ?? { v: null, note: 'not measured' },
      teqK: fromArchive(row, 'pl_eqt', 1, 4),
      discovery: discovery(row),
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// TOI-700 (Pass et al. 2026, Table 2; circular orbits)

const toiNode = ASSUMED(assumedNodeDeg('TOI-700'), 'Not measurable from transits; shared by all four planets. Fixed pseudo-random angle from the host name (assumedNodeDeg).');
function toiPlanet(id, P, sP, T0, sT0, a, sa, R, sR, i, si) {
  const name = `TOI-700 ${id}`;
  const row = compPlanet(name);
  return resolvePlanet({
    id,
    name,
    archiveName: name,
    status: 'confirmed',
    centre: 'A',
    inputs: {
      periodDays: V(P, 'pass2026', { err: sP, where: 'Table 2' }),
      aAu: V(a, 'pass2026', { err: sa, where: 'Table 2' }),
      e: V(0, 'pass2026', { where: 'circular orbits assumed in the fit (Sect. 3.1.4)' }),
      argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
      iDeg: V(i, 'pass2026', { err: si, where: 'Table 2' }),
      nodeDeg: toiNode,
      phase: { kind: 'transit', jd: T0, sigmaDays: sT0, periodSigmaDays: sP, ref: 'pass2026', where: 'Table 2, time of conjunction (BJD)' },
    },
    radiusEarth: V(R, 'pass2026', { err: sR, where: 'Table 2' }),
    massEarth: { v: null, note: 'not measured (no RV mass)' },
    teqK: fromArchive(row, 'pl_eqt', 1, 4),
    discovery: discovery(row),
  });
}
const toi700 = [
  toiPlanet('b', 9.97722, 0.000012, 2_458_880.0994, 0.0013, 0.0678, 0.0011, 0.963, [-0.034, 0.037], 89.63, [-0.21, 0.23]),
  toiPlanet('c', 16.0511039, 0.0000056, 2_458_821.6219, 0.00043, 0.0931, 0.0015, 2.535, [-0.073, 0.084], 88.942, [-0.036, 0.032]),
  toiPlanet('e', 27.810124, 0.000087, 2_460_772.46343, 0.00024, 0.1336, 0.002, 0.919, [-0.024, 0.028], 89.89, [-0.099, 0.076]),
  toiPlanet('d', 37.423457, 0.000018, 2_460_763.01612, 0.00023, 0.1642, [-0.0027, 0.0025], 1.145, [-0.026, 0.032], 89.83, [-0.068, 0.086]),
];

// ---------------------------------------------------------------------------------------------
// Kepler-16 (Doyle et al. 2011, Table 1: osculating Jacobian elements at BJD 2455212.12316)

const K16_EPOCH = 2_455_212.12316;
const k16Node = assumedNodeDeg('Kepler-16');
// Doyle et al. use the transit convention (the epoch is a primary eclipse, star B in front of A, and
// their elements give omega + f = 90 deg there), so omega_visual = omega + 180. Omega_1 = 0 by
// definition; the sky PA of the node line is unknown -> assumed, and the planet's node is +0.003 deg.
function doyleTPeri(P, lambdaDeg, omegaDeg, OmegaDeg) {
  const M = wrap360(lambdaDeg - omegaDeg - OmegaDeg) * DEG;
  return K16_EPOCH - (M / TAU) * P;
}
const k16Binary = {
  periodDays: 41.07922,
  aAu: 0.22431,
  e: 0.15944,
  iDeg: 90.3401,
  nodeDeg: k16Node,
  argPeriDeg: wrap360(263.464 + 180),
  tPeriJd: round(doyleTPeri(41.07922, 92.352, 263.464, 0), 6),
};
// Transits of star A by the planet in the Kepler data: Doyle et al. 2011 text (three "tertiary
// eclipses" separated by 230.3 and 221.5 d) and Figure 1 (the last at BJD 2455425.2).
const K16_TRANSITS_A = [2_455_425.2 - 221.5 - 230.3, 2_455_425.2 - 221.5, 2_455_425.2];
// The osculating Jacobian period (228.776 d) is not the planet's mean period: the binary's
// quadrupole speeds the mean motion up, and the transits recur every ~225.9 d on average. For a
// fixed Kepler orbit we keep Doyle's elements and phase at the epoch and fit only the period to the
// three transits of star A (1-D search; the planet is evaluated about the binary barycentre and A
// from the binary orbit above).
const k16Fit = (() => {
  const tp0 = doyleTPeri(228.776, 106.51, 318, 0.003);
  const M0 = ((K16_EPOCH - tp0) / 228.776) * TAU; // mean anomaly at the epoch, kept fixed
  const fB = 0.20255 / (0.6897 + 0.20255);
  const planetOrbit = (P) => ({ periodDays: P, aAu: 0.7048, e: 0.0069, iDeg: 90.0322, nodeDeg: wrap360(k16Node + 0.003), argPeriDeg: wrap360(318 + 180), tPeriJd: K16_EPOCH - (M0 / TAU) * P });
  const crossingA = (o, t0) => {
    let best = { t: t0, d: Infinity };
    const sep = (t) => {
      const rel = skyPos(k16Binary, t);
      const p = skyPos(o, t);
      return Math.hypot(p.north + fB * rel.north, p.east + fB * rel.east);
    };
    for (let t = t0 - 8; t < t0 + 8; t += 0.01) {
      const d = sep(t);
      if (d < best.d) best = { t, d };
    }
    for (let t = best.t - 0.01; t < best.t + 0.01; t += 0.0002) {
      const d = sep(t);
      if (d < best.d) best = { t, d };
    }
    return best.t;
  };
  let best = { P: 228.776, c: Infinity, res: [] };
  for (let P = 224.5; P <= 229.5; P += 0.01) {
    const res = K16_TRANSITS_A.map((t) => crossingA(planetOrbit(P), t) - t);
    const c = res.reduce((s, x) => s + x * x, 0);
    if (c < best.c) best = { P, c, res };
  }
  return { P: round(best.P, 2), residualsDays: best.res.map((x) => round(x, 3)) };
})();
const k16Planet = resolvePlanet({
  id: 'b',
  name: 'Kepler-16 (AB) b',
  archiveName: 'Kepler-16 b',
  status: 'confirmed',
  centre: 'AB',
  checkTransitsOfA: K16_TRANSITS_A,
  inputs: {
    periodDays: DERIVED(k16Fit.P, `mean period fitted by us to the three transits of star A in the Kepler data (BJD ${K16_TRANSITS_A.map((t) => t.toFixed(1)).join(', ')}; Doyle et al. 2011 text and Figure 1) with Doyle's other elements and phase fixed; timing residuals ${k16Fit.residualsDays.join(', ')} d. The osculating Jacobian period in Table 1 is 228.776 (+0.020/-0.037) d; the binary's quadrupole makes the mean period shorter (the Kepler EB catalogue lists 225.885 d).`, { ref: 'doyle2011', osculatingPeriodDays: 228.776 }),
    aAu: V(0.7048, 'doyle2011', { err: 0.0011, where: 'Table 1' }),
    e: V(0.0069, 'doyle2011', { err: [-0.0015, 0.001], where: 'Table 1' }),
    argPeri: V(318, 'doyle2011', { err: [-22, 10], where: 'Table 1', convention: 'star' }),
    iDeg: V(90.0322, 'doyle2011', { err: [-0.0023, 0.0022], where: 'Table 1' }),
    nodeDeg: { v: wrap360(k16Node + 0.003), assumed: 'Sky PA of the node line unknown (same assumed angle as the binary); the planet\'s node is 0.003 ± 0.013 deg from the binary\'s (Doyle et al. 2011 Table 1).', ref: 'doyle2011' },
    phase: {
      kind: 'meanAnomaly',
      jd: K16_EPOCH,
      meanAnomalyDeg: round(wrap360(106.51 - 318 - 0.003), 4),
      ref: 'doyle2011',
      how: 'mean anomaly at BJD 2455212.12316 from the mean longitude lambda_2 = 106.51 deg: M = lambda - omega - Omega (Table 1)',
    },
  },
  radiusEarth: V(round(0.7538 * R_JUP_REARTH, 3), 'doyle2011', { where: '0.7538 (+0.0026/-0.0023) Jupiter radii' }),
  massEarth: V(round(0.333 * M_JUP_MEARTH, 1), 'doyle2011', { where: '0.333 ± 0.016 Jupiter masses', kind: 'true' }),
  teqK: V(185, 'doyle2011', { where: 'text: 170-200 K averaged over several orbits (Bond albedo 0.2-0.5); midpoint quoted' }),
  discovery: discovery(compPlanet('Kepler-16 b')),
  notes: [
    'The planet orbits the barycentre of the two stars. A fixed Kepler orbit ignores the three-body precession: the planet stopped transiting star A in 2018 and should resume around 2042 (Doyle et al. 2011).',
  ],
});

// ---------------------------------------------------------------------------------------------
// Epsilon Eridani b (Thompson et al. 2025 complete model; phase from Harada et al. 2025)

const harada = psRow('eps Eri b', /Harada/);
const epsEri = resolvePlanet({
  id: 'b',
  name: 'eps Eri b',
  archiveName: 'eps Eri b',
  status: 'confirmed',
  centre: 'A',
  inputs: {
    periodDays: V(round(7.33 * JULIAN_YEAR, 1), 'thompson2025', { err: [round(-0.07 * JULIAN_YEAR, 0), round(0.08 * JULIAN_YEAR, 0)], where: 'Table 3, complete model (RV, HIP, FGS, DR2, DR3): 7.33 (+0.08/-0.07) yr' }),
    aAu: V(3.53, 'thompson2025', { err: 0.04, where: 'Table 3' }),
    e: ASSUMED(0, 'Thompson et al. 2025 find e = 0.06 (+0.06/-0.04), consistent with zero; its periastron time and omega are only marginally constrained and their medians are not a consistent pair, so we use a circular orbit.'),
    argPeri: ASSUMED(90, 'Undefined for a circular orbit.', { convention: 'star' }),
    iDeg: V(40, 'thompson2025', { err: [-5, 6], where: 'Table 3; < 90 deg = counterclockwise, as the Hipparcos data prefer' }),
    nodeDeg: V(186, 'thompson2025', { err: [-9, 8], where: 'Table 3' }),
    phase: {
      kind: 'conjunction',
      jd: Number(harada.pl_tranmid),
      sigmaDays: Math.abs(Number(harada.pl_tranmiderr1)),
      periodSigmaDays: 29,
      ref: 'harada2025',
      where: `time of inferior conjunction ${harada.pl_tranmid} ± ${Math.abs(Number(harada.pl_tranmiderr1))} BJD (RV)`,
      note: 'Check: with Thompson et al.\'s node and inclination this puts the planet south-southwest of the star in early 2025 and north in 2029, as Thompson et al. state (tested).',
    },
  },
  radiusEarth: DERIVED(round(forecastRadiusEarth(1.0 * M_JUP_MEARTH), 2), 'estimate for 1.00 Jupiter mass with the Chen & Kipping 2017 mean relation; not measured', { ref: 'chen2017', estimate: true }),
  massEarth: V(round(1.0 * M_JUP_MEARTH, 0), 'thompson2025', { err: round(0.1 * M_JUP_MEARTH, 0), where: '1.00 ± 0.10 Jupiter masses', kind: 'true' }),
  discovery: discovery(compPlanet('eps Eri b')),
  notes: [
    'A newer joint model (Llop-Sayson et al. 2026, arXiv:2609.19131, submitted) finds 0.91 ± 0.06 Jupiter masses and an orbit consistent with Thompson et al. 2025; it is not used here until refereed.',
  ],
});

// ---------------------------------------------------------------------------------------------
// Tau Ceti (Feng et al. 2017 Table 5; candidates)

const tauNode = ASSUMED(105, 'Assumed coplanar with the debris disc: disc position angle 105 ± 10 deg (Lawler et al. 2014). Which node is ascending, and hence the sense of motion, is unknown.', { ref: 'lawler2014' });
const tauI = ASSUMED(35, 'Assumed coplanar with the debris disc, i = 35 ± 10 deg (Lawler et al. 2014). Feng et al. note that masses would then be about twice m sin i.', { ref: 'lawler2014' });
function tauPlanet(id, P, sP, K, e, wRad, M0Rad, msini, a, status, statusNote) {
  const name = `tau Cet ${id}`;
  return resolvePlanet({
    id,
    name,
    archiveName: id === 'e' ? null : name,
    status,
    showByDefault: status !== 'refuted',
    statusNote,
    centre: 'A',
    inputs: {
      periodDays: V(P, 'feng2017', { err: sP, where: 'Table 5 (MAP; 1%-99% interval)' }),
      aAu: V(a, 'feng2017', { where: 'Table 5' }),
      e: V(e, 'feng2017', { where: 'Table 5' }),
      argPeri: V(round(wRad / DEG, 2), 'feng2017', { where: `Table 5: ${wRad} rad`, convention: 'star' }),
      iDeg: tauI,
      nodeDeg: tauNode,
      phase: {
        kind: 'meanAnomaly',
        jd: EPOCH_JD,
        meanAnomalyDeg: round(wrap360(M0Rad / DEG), 2),
        ref: 'feng2017',
        assumed: `Feng et al. give M0 = ${M0Rad} rad but do not state its reference epoch, so the true phase is unknown. We apply M0 at the stated epoch, which is arbitrary.`,
      },
    },
    radiusEarth: DERIVED(round(forecastRadiusEarth(msini / Math.sin(35 * DEG)), 2), 'estimate from m sin i / sin(35 deg) with the Chen & Kipping 2017 mean relation', { ref: 'chen2017', estimate: true }),
    massEarth: V(msini, 'feng2017', { where: 'Table 5', kind: 'minimum' }),
    rvSemiAmplitudeMs: V(K, 'feng2017', { where: 'Table 5' }),
    discovery: { year: 2017, method: 'Radial Velocity', facility: 'HARPS, AAPS, HIRES (archival)', reference: 'Feng et al. 2017', url: 'https://doi.org/10.3847/1538-3881/aa83b4' },
  });
}
const tauStatusCand =
  'Candidate from a re-analysis of archival HARPS, AAPS and HIRES velocities (Feng et al. 2017). Flagged controversial by the NASA Exoplanet Archive. ESPRESSO (Figueira et al. 2025) could not confirm it: the 20 d signal is compatible but not significant and may be the first harmonic of the stellar rotation; the 49 d signal is near the detection limit; the 636 d signal is below it.';
const tauCeti = [
  tauPlanet('g', 20.0, [-0.01, 0.02], 0.49, 0.06, 6.9, 7.04, 1.75, 0.133, 'disputed', tauStatusCand),
  tauPlanet('h', 49.41, [-0.1, 0.08], 0.39, 0.23, 0.13, -1.27, 1.83, 0.243, 'disputed', tauStatusCand),
  tauPlanet('e', 162.87, [-0.46, 1.08], 0.55, 0.18, 0.39, 6.21, 3.93, 0.538, 'refuted', 'Refuted: ESPRESSO would have detected a 3.93 Earth-mass planet at 162 d and did not (Figueira et al. 2025). The NASA Exoplanet Archive lists tau Cet e as a False Positive Planet (Targets Excluded page, 2026).'),
  tauPlanet('f', 636.13, [-47.69, 11.7], 0.35, 0.16, 2.09, -0.68, 3.93, 1.334, 'disputed', tauStatusCand),
];

// ---------------------------------------------------------------------------------------------
// Alpha Centauri A candidate (Beichman & Sanghi et al. 2025, Papers I and II)

// Illustrative orbit: a, e, i from the "prograde, a < 2 au, S1 + C1 + non-detections, no RV
// constraint" family of Paper I Table 4 (a = 1.66 ± 0.06 au, e = 0.37 ± 0.12, i_sky = 124 ± 13 deg,
// one of the two sky inclinations listed). The paper gives no Omega, omega or epoch; we fitted
// those three to S1 (2024-08-10), C1 (2019-06-01) and the non-detections of 2025-02-20 and
// 2025-04-25 (separation < 0.75 arcsec, the masked region) by grid search plus refinement
// (chi^2 = 0.26 for 4 measured coordinates). The fit's mutual inclination with the AB orbit is 65.5
// deg (paper: 54 ± 11 for this family). The mirror solution (Omega + 180, omega + 180) fits the
// astrometry equally well and is retrograde relative to AB; RVs cannot yet decide.
const ACEN_PLX = 750.81; // mas, Akeson et al. 2021
const acenMassA = 1.0788;
const acenCand = (() => {
  const P = periodDays(1.66, acenMassA);
  return resolvePlanet({
    id: 'S1',
    name: 'alf Cen A candidate (S1)',
    archiveName: null,
    status: 'candidate',
    statusNote:
      'Single JWST/MIRI detection (S1, 10 August 2024, 3.3-4.3 sigma), possibly the same object as the VLT/NEAR source C1 of 2019 (Wagner et al. 2021); not recovered in February and April 2025, which orbits can explain (52% chance). Paper II finds S1 robust against artefacts. A JWST re-observation was planned for August 2026; no result had been published as of 25 September 2026.',
    centre: 'A',
    inputs: {
      periodDays: DERIVED(round(P, 2), `Kepler's third law from a = 1.66 au and M_A = ${acenMassA} solar masses (Akeson et al. 2021); ${(P / JULIAN_YEAR).toFixed(2)} yr`, { ref: 'beichman2025' }),
      aAu: V(1.66, 'beichman2025', { err: 0.06, where: 'Table 4, prograde a < 2 au family (S1, C1 and non-detections, no RV constraint)' }),
      e: V(0.37, 'beichman2025', { err: 0.12, where: 'Table 4, same family' }),
      argPeri: DERIVED(318.75, 'fitted by us to the S1 and C1 astrometry and the 2025 non-detections, with a, e, i fixed', { convention: 'planet', illustrative: true }),
      iDeg: V(124, 'beichman2025', { err: 13, where: 'Table 4, same family: i_sky = 55 ± 15 or 124 ± 13 deg; 124 fits the astrometry better with a, e fixed (chi^2 0.26 vs 7.4)' }),
      nodeDeg: DERIVED(255.5, 'fitted by us (see argPeri); the mirror solution 75.5 deg is equally good', { illustrative: true }),
      phase: { kind: 'periastron', jd: 2_460_048.89, ref: 'beichman2025', how: 'fitted by us (see argPeri): passes within 0.08 arcsec of S1 and 0.03 arcsec of C1', illustrative: true },
    },
    radiusEarth: V(round(1.05 * R_JUP_REARTH, 1), 'beichman2025', { err: round(0.05 * R_JUP_REARTH, 1), where: 'abstract: radius 1-1.1 Jupiter radii (from photometry and models); midpoint' }),
    massEarth: V(120, 'beichman2025', { err: 30, where: 'abstract: 90-150 Earth masses, consistent with RV limits; midpoint', kind: 'model-dependent range' }),
    teqK: V(225, 'beichman2025', { where: 'abstract' }),
    discovery: { year: 2025, method: 'Imaging', facility: 'James Webb Space Telescope (JWST)', reference: 'Beichman et al. 2025; Sanghi et al. 2025', url: 'https://doi.org/10.3847/2041-8213/adf53f' },
    notes: ['Illustrative orbit: one member of a family of orbits consistent with the data. Show it as a candidate with an uncertain orbit.'],
  });
})();
const acenAB = {
  primary: 'A',
  secondary: 'B',
  massFractionSecondary: round(1 - 0.54266, 5),
  orbit: {
    periodDays: round(79.762 * JULIAN_YEAR, 3),
    aAu: round(17.493 / (ACEN_PLX / 1000), 5),
    e: 0.51947,
    iDeg: 79.243,
    nodeDeg: 205.073,
    argPeriDeg: 231.519,
    tPeriJd: round(julianYearToJd(1955.564), 4),
  },
  inputs: {
    periodYears: V(79.762, 'akeson2021', { err: 0.019, where: 'Table 8 (present work, epoch 2019.5)' }),
    aArcsec: V(17.493, 'akeson2021', { err: 0.0096, where: 'Table 8' }),
    parallaxMas: V(ACEN_PLX, 'akeson2021', { err: 0.38, where: 'Table 8' }),
    e: V(0.51947, 'akeson2021', { err: 0.00015, where: 'Table 8' }),
    iDeg: V(79.243, 'akeson2021', { err: 0.0089, where: 'Table 8' }),
    nodeDeg: V(205.073, 'akeson2021', { err: 0.025, where: 'Table 8 (resolved by RVs; tested against the HARPS RVs of A)' }),
    argPeriDeg: V(231.519, 'akeson2021', { err: 0.027, where: 'Table 8 (orbit of B relative to A)' }),
    tPeriYear: V(1955.564, 'akeson2021', { err: 0.015, where: 'Table 8 (Julian year)' }),
    massFractionA: V(0.54266, 'akeson2021', { err: 0.00011, where: 'Table 8: m_A/(m_A + m_B)' }),
  },
  note: 'Orbit of B relative to A. Tested against the ALMA separation and position angle of 2019 (Akeson et al. Table 6) and the HARPS radial velocity of A in 2004.',
};

// ---------------------------------------------------------------------------------------------
// Hosts

function hostFromArchive(archiveHost, id = 'A') {
  const r = comp.find((x) => x.hostname === archiveHost);
  return {
    id,
    name: archiveHost,
    massMsun: fromArchive(r, 'st_mass', 1, 4),
    radiusRsun: fromArchive(r, 'st_rad', 1, 4),
    teffK: fromArchive(r, 'st_teff', 1, 4),
    luminosityLsun: (() => {
      const l = fromArchive(r, 'st_lum', 1, 5);
      return l ? { ...l, v: Number((10 ** l.v).toPrecision(4)), derived: '10^(log L) of the archive value', err: undefined } : null;
    })(),
    spectralType: r.st_spectype ? { v: r.st_spectype, ref: 'nea-pscomppars', source: decodeRef(r.st_spectype_reflink) } : null,
  };
}
const hostAstro = loadHostAstrometry();
/**
 * Host position at epoch J2000.0 (Gaia DR3 or the Hipparcos new reduction carried to J2000; see
 * scripts/exoplanet-host-astrometry.mjs), with the archive's distance, radial velocity and ids.
 */
function positionFromArchive(archiveHost) {
  const r = comp.find((x) => x.hostname === archiveHost);
  const ids = {
    gaiaDr3: r.gaia_dr3_id ? r.gaia_dr3_id.replace(/^Gaia DR3\s+/, '') : null,
    hip: r.hip_name ? Number(r.hip_name.replace(/^HIP\s+/, '')) : null,
    hd: r.hd_name ? r.hd_name.replace(/^HD\s+/, '') : null,
    tic: r.tic_id ? r.tic_id.replace(/^TIC\s+/, '') : null,
  };
  const rv = r.st_radv === '' ? null : Number(r.st_radv);
  const p = hostPositionJ2000(
    { raDeg: Number(r.ra), decDeg: Number(r.dec), distPc: Number(r.sy_dist), pmra: Number(r.sy_pmra), pmdec: Number(r.sy_pmdec), rvKms: rv ?? NaN, gaiaDr3: ids.gaiaDr3, hip: ids.hip },
    hostAstro,
  );
  return {
    raDeg: round(p.raDeg, 7),
    decDeg: round(p.decDeg, 7),
    epoch: p.source === 'archive' ? 'as archived' : 'J2000.0',
    distancePc: Number(r.sy_dist),
    pmRaMasYr: round(p.pmra, 3),
    pmDecMasYr: round(p.pmdec, 3),
    radialVelocityKms: rv,
    ref: 'nea-pscomppars',
    source: `RA/Dec: ${POSITION_SOURCES[p.source]}; distance: ${decodeRef(r.sy_dist_reflink)} (via the NASA Exoplanet Archive)`,
    ids,
  };
}

/** alpha Cen AB barycentre (Akeson et al. 2021 Table 9, epoch J2019.5) carried to J2000.0 along its 3D motion. */
function acenBarycentreJ2000() {
  const ra = 219.85892215 * DEG;
  const dec = -60.83163195 * DEG;
  const d = 1000 / ACEN_PLX;
  const pm = [-3639.95, 700.4];
  const rv = -22.3796;
  const u = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const e = [-Math.sin(ra), Math.cos(ra), 0];
  const n = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const K = 149597870.7 / (365.25 * 86400);
  const v = [0, 1, 2].map((k) => rv * u[k] + ((K * pm[0] * d) / 1000) * e[k] + ((K * pm[1] * d) / 1000) * n[k]);
  const pcPerKmsYr = (365.25 * 86400) / ((149597870.7 * 648000) / Math.PI);
  const p = [0, 1, 2].map((k) => d * u[k] + v[k] * (2000 - 2019.5) * pcPerKmsYr);
  const r = Math.hypot(...p);
  return { raDeg: round(((Math.atan2(p[1], p[0]) / DEG) + 360) % 360, 8), decDeg: round(Math.asin(p[2] / r) / DEG, 8) };
}

const trappistStar = {
  id: 'A',
  name: 'TRAPPIST-1',
  massMsun: V(0.0898, 'agol2021', { err: 0.0023, where: 'Table 7 (from Mann et al. 2019)' }),
  radiusRsun: V(0.1192, 'agol2021', { err: 0.0013, where: 'Table 7' }),
  teffK: V(2566, 'agol2021', { err: 26, where: 'Table 7' }),
  luminosityLsun: V(0.000553, 'agol2021', { err: 0.000019, where: 'Table 7 (from Ducrot et al. 2020)' }),
  spectralType: hostFromArchive('TRAPPIST-1').spectralType,
};

const systems = [
  {
    id: 'trappist-1',
    name: 'TRAPPIST-1',
    archiveHost: 'TRAPPIST-1',
    position: positionFromArchive('TRAPPIST-1'),
    stars: [trappistStar],
    planets: trappistPlanets,
    notes: ['Seven Earth-sized planets in a chain of near-resonances; all transit. Orbits are Keplerian approximations of an N-body system (see each planet\'s phase note).'],
  },
  {
    id: 'proxima-cen',
    name: 'Proxima Centauri',
    archiveHost: 'Proxima Cen',
    position: positionFromArchive('Proxima Cen'),
    stars: [hostFromArchive('Proxima Cen')],
    planets: [proximaD, proximaB, proximaC],
    notes: ['Proxima c is kept for completeness, flagged as disputed and hidden by default.'],
  },
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    archiveHost: "Barnard's star",
    position: positionFromArchive("Barnard's star"),
    stars: [hostFromArchive("Barnard's star")],
    planets: barnard,
    notes: ['b was reported by González Hernández et al. 2024; Basant et al. 2025 confirmed it and added c, d and e. All four are sub-Earths (minimum masses).'],
  },
  {
    id: '51-peg',
    name: '51 Pegasi',
    archiveHost: '51 Peg',
    position: positionFromArchive('51 Peg'),
    stars: [hostFromArchive('51 Peg')],
    planets: [peg],
    notes: ['The first planet found around a Sun-like star (Mayor & Queloz 1995; Nobel Prize in Physics 2019).'],
  },
  {
    id: 'hr-8799',
    name: 'HR 8799',
    archiveHost: 'HR 8799',
    position: positionFromArchive('HR 8799'),
    stars: [{ ...hostFromArchive('HR 8799'), massMsun: V(WANG_M, 'wang2018', { err: [-0.08, 0.11], where: 'Table 4 (dynamical, from the orbits)' }) }],
    planets: hr8799,
    notes: [`Four directly imaged giants (Marois et al. 2008, 2010). Wang et al. 2018 used a parallax of ${WANG_PLX} mas; positions scale by the ratio if the app uses another distance.`],
  },
  {
    id: 'kepler-90',
    name: 'Kepler-90',
    archiveHost: 'KOI-351',
    position: positionFromArchive('KOI-351'),
    stars: [{ ...hostFromArchive('KOI-351'), name: 'Kepler-90 (KOI-351)' }],
    planets: kepler90,
    notes: ['Eight transiting planets, tied with the Solar System for the most known around one star. The archive lists the host as KOI-351 and the planets as KOI-351 b-h and Kepler-90 i.'],
  },
  {
    id: 'toi-700',
    name: 'TOI-700',
    archiveHost: 'TOI-700',
    position: positionFromArchive('TOI-700'),
    stars: [hostFromArchive('TOI-700')],
    planets: toi700,
    notes: ['TOI-700 d and e are Earth-sized planets in the habitable zone (Gilbert et al. 2020, 2023).'],
  },
  {
    id: 'kepler-16',
    name: 'Kepler-16',
    archiveHost: 'Kepler-16',
    position: positionFromArchive('Kepler-16'),
    stars: [
      { id: 'A', name: 'Kepler-16 A', massMsun: V(0.6897, 'doyle2011', { err: [-0.0034, 0.0035] }), radiusRsun: V(0.6489, 'doyle2011', { err: 0.0013 }), teffK: V(4450, 'doyle2011', { err: 150 }) },
      { id: 'B', name: 'Kepler-16 B', massMsun: V(0.20255, 'doyle2011', { err: [-0.00065, 0.00066] }), radiusRsun: V(0.22623, 'doyle2011', { err: [-0.00053, 0.00059] }) },
    ],
    starOrbit: {
      primary: 'A',
      secondary: 'B',
      massFractionSecondary: round(0.20255 / (0.6897 + 0.20255), 6),
      orbit: k16Binary,
      inputs: {
        periodDays: V(41.07922, 'doyle2011', { err: [-0.000077, 0.000078], where: 'Table 1' }),
        aAu: V(0.22431, 'doyle2011', { err: [-0.00034, 0.00035] }),
        e: V(0.15944, 'doyle2011', { err: [-0.00062, 0.00061] }),
        argPeri: V(263.464, 'doyle2011', { err: [-0.027, 0.026], convention: 'star', note: 'transit convention: omega + f = 90 deg at primary eclipse; visual-binary omega = 83.464 deg' }),
        meanLongitudeDeg: V(92.352, 'doyle2011', { err: 0.0011, where: 'at BJD 2455212.12316, a primary eclipse (Kepler EB catalogue ephemeris, tested)' }),
        iDeg: V(90.3401, 'doyle2011', { err: [-0.0019, 0.0016] }),
        nodeDeg: ASSUMED(k16Node, 'Omega_1 = 0 by definition in Doyle et al.; the sky PA of the node line is unknown. Fixed pseudo-random angle from the host name.'),
      },
      note: 'Orbit of B relative to A. The epoch BJD 2455212.12316 is a primary eclipse (star B in front of A), consistent with the Villanova Kepler EB catalogue ephemeris (tested).',
    },
    planets: [k16Planet],
    notes: ['The first transiting circumbinary planet: a Saturn-mass world with two suns.'],
  },
  {
    id: 'eps-eri',
    name: 'Epsilon Eridani',
    archiveHost: 'eps Eri',
    position: positionFromArchive('eps Eri'),
    stars: [{ ...hostFromArchive('eps Eri'), massMsun: V(0.82, 'thompson2025', { err: 0.02, where: 'Table 3 (prior)' }) }],
    planets: [epsEri],
    notes: ['The nearest known Jupiter analogue, orbiting inside a debris disc; the orbit is close to coplanar with the outer disc (Thompson et al. 2025).'],
  },
  {
    id: 'tau-cet',
    name: 'Tau Ceti',
    archiveHost: 'tau Cet',
    position: positionFromArchive('tau Cet'),
    stars: [{ ...hostFromArchive('tau Cet'), massMsun: V(0.783, 'feng2017', { err: 0.012, where: 'as adopted in Table 5 (Teixeira et al. 2009)' }) }],
    planets: tauCeti,
    notes: ['All four are unconfirmed candidates; e is refuted. Show them as candidates.'],
  },
  {
    id: 'alf-cen',
    name: 'Alpha Centauri A and B',
    archiveHost: null,
    position: {
      ...acenBarycentreJ2000(),
      epoch: 'J2000.0',
      distancePc: round(1000 / ACEN_PLX, 6),
      pmRaMasYr: -3639.95,
      pmDecMasYr: 700.4,
      radialVelocityKms: -22.3796,
      ref: 'akeson2021',
      source: 'AB barycentre, ICRS: Table 9 position at J2019.5 (219.85892215, -60.83163195) carried to J2000.0 with the Table 9 proper motion, Table 8 parallax and barycentric RV',
      ids: { hipA: 71683, hipB: 71681, hdA: '128620', hdB: '128621' },
    },
    stars: [
      { id: 'A', name: 'alf Cen A', massMsun: V(1.0788, 'akeson2021', { err: 0.0029 }), radiusRsun: V(1.2175, 'akeson2021', { err: 0.0055 }), luminosityLsun: V(1.5059, 'akeson2021', { err: 0.0019 }) },
      { id: 'B', name: 'alf Cen B', massMsun: V(0.9092, 'akeson2021', { err: 0.0025 }), radiusRsun: V(0.8591, 'akeson2021', { err: 0.0036 }), luminosityLsun: V(0.4981, 'akeson2021', { err: 0.0007 }) },
    ],
    starOrbit: acenAB,
    planets: [acenCand],
    notes: ['Positions are relative to the A-B barycentre; the evaluator also returns each star. Proxima Centauri is a separate system (id proxima-cen).'],
  },
];

for (const s of systems) {
  s.epochJd = EPOCH_JD;
  s.epochIso = EPOCH_ISO;
}

const out = {
  format: 'lightspeed-exoplanets-featured/1',
  generated: '2026-09-25',
  epoch: { jd: EPOCH_JD, iso: EPOCH_ISO, note: 'Every planet\'s phase is set so that the configuration SEEN FROM THE SUN is right at this epoch (and at its reference time). atEpoch gives the mean anomaly then and, where the sources give uncertainties, the propagated timing uncertainty.' },
  conventions: {
    orbit: 'Relative Keplerian orbit of each body about its centre (a star id, or "AB" for the barycentre of a binary). iDeg 0-180 (<90 = counterclockwise on the sky); nodeDeg = position angle (east of north) of the ascending node, the node where the body RECEDES from the Sun; argPeriDeg = argument of periastron of the body\'s own orbit; tPeriJd = time of periastron, JD (TDB) on the observed (barycentric arrival-time) clock. RV/transit omegas were converted with omega_planet = omega_star + 180 deg (inputs.argPeri.convention records which was published).',
    time: 'All JDs are BJD_TDB unless a source note says otherwise (HJD/BJD differences are < 10 min). To get the state at app coordinate time t (TDB, Sun rest frame), evaluate the orbit at t + D/c, where D is the host distance the app uses at t (orbit.ts: observedTimeJd).',
    values: 'Each input is {v, err?, ref, where?, note?}; err is symmetric or [minus, plus]. "assumed": the value is not measured and the text says what was assumed. "derived": computed by us from cited values. "estimate": model estimate (not measured). refs are keys of the refs table.',
  },
  refs: REFS,
  systems,
};

mkdirSync('staging/exoplanets', { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const nPl = systems.reduce((s, x) => s + x.planets.length, 0);
console.log(`${OUT}: ${systems.length} systems, ${nPl} planets`);
for (const s of systems) for (const p of s.planets) console.log(`  ${p.name.padEnd(28)} ${p.status.padEnd(9)} P=${p.orbit.periodDays} tp=${p.orbit.tPeriJd} M@epoch=${p.atEpoch.meanAnomalyDeg} sigma=${p.atEpoch.phaseSigmaDays ?? '-'}`);
