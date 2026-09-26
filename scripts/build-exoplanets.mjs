// Builds public/data/exoplanets.json.gz from the NASA Exoplanet Archive's Planetary Systems
// Composite Parameters table (pscomppars).
//
// Source: NASA Exoplanet Archive, operated by the California Institute of Technology under contract
//   with NASA under the Exoplanet Exploration Program. Table DOI 10.26133/NEA13; archive paper
//   Christiansen et al. 2025, PSJ 6, 186 (doi:10.3847/PSJ/ade3c2). The archive's data are freely
//   available; it asks users to acknowledge it (see staging/exoplanets/exoplanets.md for the text).
//
// Input : data-raw/nea_pscomppars_2026-09-25.csv.gz (not committed). Downloaded once with
//   curl -G https://exoplanetarchive.ipac.caltech.edu/TAP/sync \
//        --data-urlencode "query=select * from pscomppars" --data-urlencode "format=csv"
//   and gzipped. Pass another file as the first argument to rebuild from a newer download.
//   Host positions are rebuilt at epoch J2000.0 from Gaia DR3 or Hipparcos (scripts/exoplanet-host-astrometry.mjs);
//   run once with --fetch to download data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz (never re-downloaded).
// Output: public/data/exoplanets.json.gz (gzip of a compact, column-oriented JSON; format below)
//         staging/exoplanets/build-stats.json (counts quoted in exoplanets.md)
//
// Format (all arrays in a table have the same length; null = not in the archive):
// {
//   format: "lightspeed-exoplanets/1", source, doi, retrieved, counts, units, enums,
//   hosts:   { name, hip, hd, gaia, ra, dec, dist, pmra, pmdec, rv, teff, radius, mass, logL,
//              spType, vmag, nStars, nPlanets, posRef },
//   planets: { name, host, letter, period, sma, ecc, incl, impact, omega, node, tperi, tperiSys, tconj, tconjSys,
//              radius, mass, massKind, teq, method, year, facility, flags }
// }
// Units and meanings are written into the file (`units`) and documented in exoplanets.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { POSITION_SOURCES, fetchGaiaHosts, hostPositionJ2000, loadHostAstrometry } from './exoplanet-host-astrometry.mjs';

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FETCH = process.argv.includes('--fetch');
const INPUT = ARGS[0] ?? 'data-raw/nea_pscomppars_2026-09-25.csv.gz';
const RETRIEVED = (INPUT.match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? 'unknown';
const OUT = 'public/data/exoplanets.json.gz';
const STATS = 'staging/exoplanets/build-stats.json';
const ATHYG = 'data-raw/athyg_40_reduced_m10.csv.gz'; // optional, only for match statistics (not shipped)

// ---------------------------------------------------------------------------------------------
// CSV

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
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

const raw = gunzipSync(readFileSync(INPUT)).toString('utf8');
const table = parseCsv(raw);
const header = table[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const bodyRows = table.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));
const rows = bodyRows.filter((r) => r.length === header.length);
if (rows.length !== bodyRows.length) console.warn(`warning: ${bodyRows.length - rows.length} malformed rows skipped`);

const str = (r, k) => {
  const v = r[col[k]];
  return v === undefined || v === '' ? null : v.trim();
};
const num = (r, k) => {
  const v = str(r, k);
  if (v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const int = (r, k) => {
  const x = num(r, k);
  return x === null ? null : Math.round(x);
};
/** Round to n significant digits (for quantities whose archive precision far exceeds their accuracy). */
const sig = (x, n) => (x === null ? null : Number(x.toPrecision(n)));
/** Round to d decimals. */
const dec = (x, d) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const isCalc = (r, k) => /CALCULATED_VALUE/.test(r[col[k]] ?? '');
const refText = (r, k) =>
  (r[col[k]] ?? '')
    .replace(/<a [^>]*>/g, '')
    .replace(/<\/a>/g, '')
    .replace(/&[a-z]+;/g, (m) => ({ '&amp;': '&', '&aacute;': 'a', '&eacute;': 'e', '&ntilde;': 'n', '&scaron;': 's' })[m] ?? '')
    .trim();

// ---------------------------------------------------------------------------------------------
// Enumerations

function enumerator() {
  const list = [];
  const index = new Map();
  return {
    list,
    id(v) {
      const key = v ?? '';
      if (!index.has(key)) {
        index.set(key, list.length);
        list.push(key);
      }
      return index.get(key);
    },
  };
}
const METHOD = enumerator();
const FACILITY = enumerator();
const MASSKIND = enumerator();
const TIMESYS = enumerator();
const POSREF = enumerator();
TIMESYS.id(''); // 0 = not stated
MASSKIND.id(''); // 0 = no mass

const FLAG = {
  CONTROVERSIAL: 1, // pl_controv_flag: the planet's existence is disputed in the literature
  CIRCUMBINARY: 2, // cb_flag
  TRANSITS: 4, // tran_flag: detected by transits (so i ~ 90 deg and tconj is a transit time)
  TTV: 8, // ttv_flag: shows transit-timing variations (a fixed Kepler orbit drifts)
  RADIUS_CALCULATED: 16, // radius from the archive's mass-radius relation, not measured
  MASS_CALCULATED: 32, // mass from the archive's mass-radius relation, not measured
  TEQ_CALCULATED: 64, // equilibrium temperature calculated by the archive
  MASS_LIMIT: 128, // mass is an upper/lower limit
  ECC_LIMIT: 256, // eccentricity is an upper/lower limit
  IMAGED: 512, // ima_flag
  RV: 1024, // rv_flag
  ASTROMETRY: 2048, // ast_flag
  MICROLENSING: 4096, // micro_flag
  INCL_LIMIT: 8192, // inclination is a limit
  RADIUS_LIMIT: 16384, // radius is a limit
};

// ---------------------------------------------------------------------------------------------
// Hosts. In the composite table stellar values are chosen per planet row, so rows of one host can
// disagree. We take, per field, the value that appears in most rows of the host (ties: first row).

const byHost = new Map();
for (const r of rows) {
  const h = str(r, 'hostname');
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(r);
}

let hostFieldDisagreements = 0;
function consensus(hrows, getter) {
  const counts = new Map();
  for (const r of hrows) {
    const v = getter(r);
    if (v === null) continue;
    const k = JSON.stringify(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  if (counts.size > 1) hostFieldDisagreements++;
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return JSON.parse(best);
}

const posRefName = (r) => {
  const t = refText(r, 'ra_reflink');
  if (/TICv8/.test(t)) return 'TICv8';
  if (/Gaia DR3|2023A&A...674A...1G/.test(t)) return 'Gaia DR3';
  if (/Gaia DR2|2018A&A...616A...1G/.test(t)) return 'Gaia DR2';
  return 'other'; // a discovery paper (mostly microlensing hosts)
};

const hostNames = [...byHost.keys()].sort((a, b) => a.localeCompare(b, 'en'));
if (FETCH) {
  const ids = new Set();
  for (const r of rows) {
    const g = str(r, 'gaia_dr3_id');
    if (g) ids.add(g.replace(/^Gaia DR3\s+/, ''));
  }
  await fetchGaiaHosts(ids);
}
const astro = loadHostAstrometry();
const posStats = { hipparcos: 0, gaia: 0, archive: 0, maxShiftArcsec: 0, maxShiftHost: '', archiveEpochFastHosts: [] };
const hostIndex = new Map(hostNames.map((h, i) => [h, i]));
const H = {
  name: [],
  hip: [],
  hd: [],
  gaia: [],
  ra: [],
  dec: [],
  dist: [],
  pmra: [],
  pmdec: [],
  rv: [],
  teff: [],
  radius: [],
  mass: [],
  logL: [],
  spType: [],
  vmag: [],
  nStars: [],
  nPlanets: [],
  posRef: [],
};
for (const h of hostNames) {
  const hr = byHost.get(h);
  const c = (g) => consensus(hr, g);
  H.name.push(h);
  const hip = c((r) => str(r, 'hip_name'));
  H.hip.push(hip ? Number(hip.replace(/^HIP\s+/, '').match(/^\d+/)?.[0] ?? NaN) || null : null);
  const hd = c((r) => str(r, 'hd_name'));
  H.hd.push(hd ? hd.replace(/^HD\s+/, '') : null); // string: may carry a component suffix, e.g. "41004 B"
  const gaia = c((r) => str(r, 'gaia_dr3_id'));
  H.gaia.push(gaia ? gaia.replace(/^Gaia DR3\s+/, '') : null); // string: 19-digit ids exceed 2^53
  const arch = { raDeg: c((r) => num(r, 'ra')), decDeg: c((r) => num(r, 'dec')), distPc: c((r) => num(r, 'sy_dist')), pmra: c((r) => num(r, 'sy_pmra')), pmdec: c((r) => num(r, 'sy_pmdec')), rvKms: c((r) => num(r, 'st_radv')) };
  const j2000 = hostPositionJ2000({ ...arch, gaiaDr3: H.gaia[H.gaia.length - 1], hip: H.hip[H.hip.length - 1] }, astro);
  posStats[j2000.source]++;
  if (j2000.source === 'archive' && Math.hypot(arch.pmra ?? 0, arch.pmdec ?? 0) > 20)
    posStats.archiveEpochFastHosts.push(`${h} (${Math.hypot(arch.pmra ?? 0, arch.pmdec ?? 0).toFixed(0)} mas/yr)`);
  if (arch.raDeg !== null && j2000.source !== 'archive') {
    const shift = Math.hypot((((j2000.raDeg - arch.raDeg + 540) % 360) - 180) * Math.cos((arch.decDeg * Math.PI) / 180), j2000.decDeg - arch.decDeg) * 3600;
    if (shift > posStats.maxShiftArcsec) {
      posStats.maxShiftArcsec = shift;
      posStats.maxShiftHost = h;
    }
  }
  H.ra.push(dec(j2000.raDeg, 6)); // 1e-6 deg = 3.6 mas
  H.dec.push(dec(j2000.decDeg, 6));
  H.dist.push(sig(arch.distPc, 6));
  H.pmra.push(Number.isFinite(j2000.pmra) ? sig(j2000.pmra, 5) : null);
  H.pmdec.push(Number.isFinite(j2000.pmdec) ? sig(j2000.pmdec, 5) : null);
  H.rv.push(sig(arch.rvKms, 5));
  H.teff.push(sig(c((r) => num(r, 'st_teff')), 5));
  H.radius.push(sig(c((r) => num(r, 'st_rad')), 4));
  H.mass.push(sig(c((r) => num(r, 'st_mass')), 4));
  H.logL.push(dec(c((r) => num(r, 'st_lum')), 4));
  H.spType.push(c((r) => str(r, 'st_spectype')));
  H.vmag.push(dec(c((r) => num(r, 'sy_vmag')), 2));
  H.nStars.push(c((r) => int(r, 'sy_snum')));
  H.nPlanets.push(c((r) => int(r, 'sy_pnum')));
  H.posRef.push(POSREF.id(j2000.source === 'archive' ? `archive: ${c((r) => posRefName(r))}` : j2000.source));
}

// ---------------------------------------------------------------------------------------------
// Planets, sorted by host then period (null periods last) then name.

const planetRows = [...rows].sort((a, b) => {
  const ha = hostIndex.get(str(a, 'hostname'));
  const hb = hostIndex.get(str(b, 'hostname'));
  if (ha !== hb) return ha - hb;
  const pa = num(a, 'pl_orbper') ?? Infinity;
  const pb = num(b, 'pl_orbper') ?? Infinity;
  if (pa !== pb) return pa - pb;
  return str(a, 'pl_name').localeCompare(str(b, 'pl_name'), 'en');
});

const P = {
  name: [],
  host: [],
  letter: [],
  period: [],
  sma: [],
  ecc: [],
  incl: [],
  impact: [],
  omega: [],
  node: [],
  tperi: [],
  tperiSys: [],
  tconj: [],
  tconjSys: [],
  radius: [],
  mass: [],
  massKind: [],
  teq: [],
  method: [],
  year: [],
  facility: [],
  flags: [],
};

for (const r of planetRows) {
  let flags = 0;
  if (int(r, 'pl_controv_flag') === 1) flags |= FLAG.CONTROVERSIAL;
  if (int(r, 'cb_flag') === 1) flags |= FLAG.CIRCUMBINARY;
  if (int(r, 'tran_flag') === 1) flags |= FLAG.TRANSITS;
  if (int(r, 'ttv_flag') === 1) flags |= FLAG.TTV;
  if (isCalc(r, 'pl_rade_reflink')) flags |= FLAG.RADIUS_CALCULATED;
  if (str(r, 'pl_bmassprov') === 'M-R relationship') flags |= FLAG.MASS_CALCULATED;
  if (isCalc(r, 'pl_eqt_reflink')) flags |= FLAG.TEQ_CALCULATED;
  if ((int(r, 'pl_bmasselim') ?? 0) !== 0) flags |= FLAG.MASS_LIMIT;
  if ((int(r, 'pl_orbeccenlim') ?? 0) !== 0) flags |= FLAG.ECC_LIMIT;
  if (int(r, 'ima_flag') === 1) flags |= FLAG.IMAGED;
  if (int(r, 'rv_flag') === 1) flags |= FLAG.RV;
  if (int(r, 'ast_flag') === 1) flags |= FLAG.ASTROMETRY;
  if (int(r, 'micro_flag') === 1) flags |= FLAG.MICROLENSING;
  if ((int(r, 'pl_orbincllim') ?? 0) !== 0) flags |= FLAG.INCL_LIMIT;
  if ((int(r, 'pl_radelim') ?? 0) !== 0) flags |= FLAG.RADIUS_LIMIT;

  const massProv = str(r, 'pl_bmassprov');
  const mass = num(r, 'pl_bmasse');
  P.name.push(str(r, 'pl_name'));
  P.host.push(hostIndex.get(str(r, 'hostname')));
  P.letter.push(str(r, 'pl_letter'));
  P.period.push(num(r, 'pl_orbper')); // full archive precision: phases need it
  P.sma.push(sig(num(r, 'pl_orbsmax'), 6));
  P.ecc.push(num(r, 'pl_orbeccen'));
  P.incl.push(num(r, 'pl_orbincl'));
  P.impact.push(sig(num(r, 'pl_imppar'), 4));
  P.omega.push(num(r, 'pl_orblper'));
  P.node.push(null); // the archive has no longitude-of-node column (checked in TAP_SCHEMA, 2026-09-25)
  P.tperi.push(num(r, 'pl_orbtper'));
  P.tperiSys.push(TIMESYS.id(str(r, 'pl_orbtper') === null ? '' : str(r, 'pl_orbtper_systemref') ?? ''));
  P.tconj.push(num(r, 'pl_tranmid'));
  P.tconjSys.push(TIMESYS.id(str(r, 'pl_tranmid') === null ? '' : str(r, 'pl_tranmid_systemref') ?? ''));
  P.radius.push(sig(num(r, 'pl_rade'), 5));
  P.mass.push(sig(mass, 5));
  P.massKind.push(MASSKIND.id(mass === null ? '' : massProv ?? ''));
  P.teq.push(sig(num(r, 'pl_eqt'), 4));
  P.method.push(METHOD.id(str(r, 'discoverymethod')));
  P.year.push(int(r, 'disc_year'));
  P.facility.push(FACILITY.id(str(r, 'disc_facility')));
  P.flags.push(flags);
}

// ---------------------------------------------------------------------------------------------
// Counts

const countBy = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
const nonNull = (arr) => arr.filter((v) => v !== null).length;
const counts = {
  planets: P.name.length,
  hosts: H.name.length,
  multiPlanetHosts: H.nPlanets.filter((n) => n > 1).length,
  hostsWithMultipleStars: H.nStars.filter((n) => n > 1).length,
  controversial: P.flags.filter((f) => f & FLAG.CONTROVERSIAL).length,
  circumbinary: P.flags.filter((f) => f & FLAG.CIRCUMBINARY).length,
  transiting: P.flags.filter((f) => f & FLAG.TRANSITS).length,
  byMethod: Object.fromEntries(
    Object.entries(countBy(P.method.map((i) => METHOD.list[i]))).sort((a, b) => b[1] - a[1]),
  ),
  byYear: countBy(P.year),
  withPeriod: nonNull(P.period),
  withSemiMajorAxis: nonNull(P.sma),
  withEccentricity: nonNull(P.ecc),
  withInclination: nonNull(P.incl),
  withArgPeriastron: nonNull(P.omega),
  withTimeOfPeriastron: nonNull(P.tperi),
  withTransitOrConjunctionTime: nonNull(P.tconj),
  withLongitudeOfNode: 0,
  withRadius: nonNull(P.radius),
  withMeasuredRadius: P.radius.filter((v, i) => v !== null && !(P.flags[i] & FLAG.RADIUS_CALCULATED)).length,
  withMass: nonNull(P.mass),
  withMassKind: countBy(P.massKind.map((i) => MASSKIND.list[i] || 'none')),
  withEquilibriumTemperature: nonNull(P.teq),
  hostsWithDistance: nonNull(H.dist),
  hostsWithHip: nonNull(H.hip),
  hostsWithHd: nonNull(H.hd),
  hostsWithGaiaDr3: nonNull(H.gaia),
  hostsWithNoCatalogueId: H.name.filter((_, i) => H.hip[i] === null && H.hd[i] === null && H.gaia[i] === null).length,
  nearestHostsPc: H.name
    .map((n, i) => [n, H.dist[i]])
    .filter((x) => x[1] !== null)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 12),
  hostFieldDisagreementsResolved: hostFieldDisagreements,
};

// ---------------------------------------------------------------------------------------------
// Optional: how many hosts the AT-HYG v4.0 star catalogue (used by the star build) contains, by
// key. Statistics only; nothing from AT-HYG is written to the output.

let starMatch = null;
if (existsSync(ATHYG)) {
  const t = parseCsv(gunzipSync(readFileSync(ATHYG)).toString('utf8'));
  const hc = Object.fromEntries(t[0].map((h, i) => [h, i]));
  const gaiaSet = new Set();
  const hipSet = new Set();
  const hdSet = new Set();
  for (let i = 1; i < t.length; i++) {
    const r = t[i];
    if (r.length < t[0].length) continue;
    if (r[hc.gaia]) gaiaSet.add(r[hc.gaia]);
    if (r[hc.hip]) hipSet.add(Number(r[hc.hip]));
    if (r[hc.hd]) hdSet.add(Number(r[hc.hd]));
  }
  let byGaia = 0;
  let byHip = 0;
  let byHd = 0;
  let none = 0;
  let hipOrHd = 0; // what the app's star-names.json.gz (HIP and HD columns, no Gaia ids) can match directly
  for (let i = 0; i < H.name.length; i++) {
    const hipHit = H.hip[i] && hipSet.has(H.hip[i]);
    const hdHit = H.hd[i] && hdSet.has(Number(H.hd[i].match(/^\d+/)?.[0]));
    if (hipHit || hdHit) hipOrHd++;
    if (H.gaia[i] && gaiaSet.has(H.gaia[i])) byGaia++;
    else if (hipHit) byHip++;
    else if (hdHit) byHd++;
    else none++;
  }
  starMatch = { catalogue: ATHYG, rows: t.length - 1, byGaia, byHipOnly: byHip, byHdOnly: byHd, notFoundById: none, byHipOrHd: hipOrHd };
}

// ---------------------------------------------------------------------------------------------
// Write

const out = {
  format: 'lightspeed-exoplanets/1',
  source:
    'NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars). This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.',
  doi: '10.26133/NEA13',
  citation: 'Christiansen, J. L., et al. 2025, PSJ, 6, 186, doi:10.3847/PSJ/ade3c2',
  retrieved: RETRIEVED,
  counts: {
    planets: counts.planets,
    hosts: counts.hosts,
    transiting: counts.transiting,
    controversial: counts.controversial,
    circumbinary: counts.circumbinary,
  },
  units: {
    'hosts.ra/dec': 'deg, ICRS, epoch J2000.0: Gaia DR3 or the Hipparcos new reduction carried to J2000 along the star\'s 3D motion; posRef says which. Hosts with neither keep the archive position at its original epoch (posRef "archive: ...": TICv8 entries are J2015.5 when Gaia-based, J2000 otherwise; "other" is the discovery paper)',
    'hosts.dist': 'pc',
    'hosts.pmra/pmdec': 'mas/yr (pmra includes cos dec), from the same source as the position (the archive value where the position is the archive\'s)',
    'hosts.rv': 'km/s, systemic radial velocity',
    'hosts.teff': 'K',
    'hosts.radius': 'solar radii',
    'hosts.mass': 'solar masses',
    'hosts.logL': 'log10(L/Lsun)',
    'hosts.vmag': 'Johnson V magnitude of the system',
    'hosts.hip/hd/gaia': 'catalogue ids: HIP number; HD designation without "HD " (may end in a component letter); Gaia DR3 source_id as a decimal string',
    'planets.host': 'index into hosts',
    'planets.period': 'days',
    'planets.sma': 'au',
    'planets.incl': 'deg (90 = edge-on)',
    'planets.impact': 'transit impact parameter, stellar radii',
    'planets.omega': 'deg, argument of periastron exactly as published (for RV and transit solutions this is the STAR\'s omega; see exoplanets.md)',
    'planets.tperi': 'JD, time of periastron (time system in tperiSys)',
    'planets.tconj': 'JD, transit mid-time or time of inferior conjunction (time system in tconjSys)',
    'planets.radius': 'Earth radii (6378.1 km)',
    'planets.mass': 'Earth masses; massKind says whether it is a true mass, m sin i, or from a mass-radius relation',
    'planets.teq': 'K',
    'planets.flags': 'bitfield, see enums.flags',
  },
  positionSources: POSITION_SOURCES,
  enums: {
    method: METHOD.list,
    facility: FACILITY.list,
    massKind: MASSKIND.list,
    timeSystem: TIMESYS.list,
    posRef: POSREF.list,
    flags: FLAG,
  },
  hosts: H,
  planets: P,
};

const json = JSON.stringify(out);
const gz = gzipSync(Buffer.from(json), { level: 9 });
mkdirSync('public/data', { recursive: true });
writeFileSync(OUT, gz);
mkdirSync('staging/exoplanets', { recursive: true });
writeFileSync(
  STATS,
  JSON.stringify({ input: INPUT, retrieved: RETRIEVED, rawBytes: json.length, gzipBytes: gz.length, counts, positions: posStats, starMatch }, null, 2) + '\n',
);
console.log(`${OUT}: ${counts.planets} planets, ${counts.hosts} hosts; ${json.length} bytes JSON, ${gz.length} bytes gzipped`);
console.log(`host positions at J2000: Gaia DR3 ${posStats.gaia}, Hipparcos ${posStats.hipparcos}, archive epoch kept ${posStats.archive}; largest shift from the archive position ${posStats.maxShiftArcsec.toFixed(1)}" (${posStats.maxShiftHost})`);
if (starMatch) console.log('AT-HYG match:', starMatch);
