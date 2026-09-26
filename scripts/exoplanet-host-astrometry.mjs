// J2000 positions for exoplanet host stars, shared by build-exoplanets.mjs and build-exoplanets-featured.mjs.
//
// The NASA Exoplanet Archive gives host coordinates as it received them: for most hosts the TESS Input Catalog v8
// position, which is the Gaia DR2 position at epoch J2015.5 for Gaia-based TIC entries and a J2000 position for
// entries from Hipparcos or Tycho-2 (checked on the 498 hosts with proper motions above 100 mas/yr that are also in
// the star catalogue: median implied epoch 2015.50, with a handful of bright stars at 2000). Mixed epochs put fast
// stars in the wrong place: Barnard's Star 161" and Proxima 60" from their J2000 positions. Every host position is
// therefore rebuilt at epoch J2000.0 from one astrometric source:
//
//   1. Hipparcos new reduction (van Leeuwen 2007; VizieR I/311; positions at J1991.25), for Hipparcos stars that
//      Gaia DR3 does not measure well (no five- or six-parameter solution, or G < 6, where Gaia saturates);
//   2. Gaia DR3 (ESA/Gaia/DPAC; positions at J2016.0), for hosts with a five- or six-parameter solution;
//   3. Hipparcos, for Hipparcos stars without a usable Gaia DR3 solution;
//   4. otherwise the archive's own position, at its original epoch (mostly microlensing hosts from the discovery
//      papers, whose proper motions are small or unknown).
//
// Positions are carried to J2000 along straight-line 3D motion (proper motion, distance and radial velocity), the
// same rigorous propagation the star catalogue uses. Inputs (data-raw/, not redistributed):
//   gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz   Gaia archive TAP, gaiadr3.gaia_source for the archive's
//                                                gaia_dr3_id values (downloaded once with --fetch)
//   hip2_pos.csv.gz                              VizieR I/311 positions and proper motions (also used by the stars)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const PC_KM = (AU_KM * 648000) / Math.PI;
const KMS_TO_PC_PER_YR = (365.25 * 86400) / PC_KM;
const K_PM = AU_KM / (365.25 * 86400); // km/s per (arcsec/yr * pc)

export const GAIA_HOSTS_FILE = 'data-raw/gaia_dr3_exoplanet_hosts_2026-09-25.csv.gz';
export const HIP2_POS_FILE = 'data-raw/hip2_pos.csv.gz';
const GAIA_COLUMNS = 'source_id, ref_epoch, ra, dec, parallax, parallax_error, pmra, pmdec, radial_velocity, phot_g_mean_mag, ruwe, astrometric_params_solved';

function parseSimpleCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((l) => {
    const v = l.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (v[i] ?? '').trim().replace(/^"|"$/g, '')]));
  });
}

/** Download the Gaia DR3 rows for the given source ids (only when the cache file is missing). */
export async function fetchGaiaHosts(ids) {
  if (existsSync(GAIA_HOSTS_FILE)) return;
  const out = [];
  let header = null;
  const list = [...ids];
  for (let i = 0; i < list.length; i += 1000) {
    const q = `SELECT ${GAIA_COLUMNS} FROM gaiadr3.gaia_source WHERE source_id IN (${list.slice(i, i + 1000).join(',')})`;
    const r = await fetch('https://gea.esac.esa.int/tap-server/tap/sync', {
      method: 'POST',
      body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: q }),
    });
    if (!r.ok) throw new Error(`Gaia TAP: HTTP ${r.status}`);
    const t = (await r.text()).split(/\r?\n/).filter(Boolean);
    if (!t[0].startsWith('source_id')) throw new Error(`unexpected Gaia reply: ${t[0].slice(0, 200)}`);
    header ??= t[0];
    out.push(...t.slice(1));
    console.log(`  Gaia DR3 hosts ${Math.min(i + 1000, list.length)} / ${list.length}`);
  }
  writeFileSync(GAIA_HOSTS_FILE, gzipSync(Buffer.from([header, ...out].join('\n') + '\n')));
}

/** Load the cached Gaia DR3 host rows and Hipparcos positions. Missing files give empty maps (with a warning). */
export function loadHostAstrometry() {
  const gaia = new Map();
  const hip2 = new Map();
  if (existsSync(GAIA_HOSTS_FILE)) for (const r of parseSimpleCsv(gunzipSync(readFileSync(GAIA_HOSTS_FILE)).toString('utf8'))) gaia.set(r.source_id, r);
  else console.warn(`warning: ${GAIA_HOSTS_FILE} missing (run with --fetch); host positions stay at their archive epochs`);
  if (existsSync(HIP2_POS_FILE)) for (const r of parseSimpleCsv(gunzipSync(readFileSync(HIP2_POS_FILE)).toString('utf8'))) hip2.set(Number(r.HIP), r);
  else console.warn(`warning: ${HIP2_POS_FILE} missing (run node scripts/build-stars3d.mjs --fetch)`);
  return { gaia, hip2 };
}

const num = (s) => (s === '' || s == null ? NaN : Number(s));

/** ICRS position (deg) at epoch t0 carried to J2000 along straight-line 3D motion. */
function toJ2000(raDeg, decDeg, distPc, pmra, pmdec, rv, t0) {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  const u = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const e = [-Math.sin(a), Math.cos(a), 0];
  const n = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const vt = (mu) => (K_PM * mu * distPc) / 1000; // mu in mas/yr
  const v = [0, 1, 2].map((k) => rv * u[k] + vt(pmra) * e[k] + vt(pmdec) * n[k]);
  const dt = 2000 - t0;
  const p = [0, 1, 2].map((k) => distPc * u[k] + v[k] * dt * KMS_TO_PC_PER_YR);
  const r = Math.hypot(p[0], p[1], p[2]);
  return { raDeg: ((Math.atan2(p[1], p[0]) / DEG) + 360) % 360, decDeg: Math.asin(p[2] / r) / DEG };
}

export const POSITION_SOURCES = {
  hipparcos: 'Hipparcos new reduction (van Leeuwen 2007), carried from J1991.25 to J2000.0',
  gaia: 'Gaia DR3 (ESA/Gaia/DPAC), carried from J2016.0 to J2000.0',
  archive: 'NASA Exoplanet Archive position at its original epoch (not corrected: no Gaia DR3 or Hipparcos astrometry)',
};

/**
 * J2000 position and the proper motion used, for one host.
 * host: { raDeg, decDeg, distPc, pmra, pmdec, rvKms, gaiaDr3 (string id or null), hip (number or null) }.
 */
export function hostPositionJ2000(host, astro) {
  const g = host.gaiaDr3 ? astro.gaia.get(host.gaiaDr3) : null;
  const g5 = g && (g.astrometric_params_solved === '31' || g.astrometric_params_solved === '95') && Number.isFinite(num(g.pmra)) ? g : null;
  const hp = host.hip ? astro.hip2.get(host.hip) : null;
  const hpOk = hp && Number.isFinite(num(hp.pmRA)) && Number.isFinite(num(hp.pmDE)) && hp.RArad !== '';
  const rvGaia = g ? num(g.radial_velocity) : NaN;
  const rv = Number.isFinite(rvGaia) ? rvGaia : Number.isFinite(host.rvKms) ? host.rvKms : 0;
  const dist = (plx, err) => (plx > 0 && plx / err > 5 ? 1000 / plx : Number.isFinite(host.distPc) && host.distPc > 0 ? host.distPc : 1000);
  const useHip = hpOk && (!g5 || num(g5.phot_g_mean_mag) < 6);
  if (useHip || (!g5 && hpOk)) {
    const d = Number.isFinite(host.distPc) && host.distPc > 0 ? host.distPc : 1000;
    const p = toJ2000(num(hp.RArad), num(hp.DErad), d, num(hp.pmRA), num(hp.pmDE), rv, 1991.25);
    return { ...p, pmra: num(hp.pmRA), pmdec: num(hp.pmDE), source: 'hipparcos' };
  }
  if (g5) {
    const d = dist(num(g5.parallax), num(g5.parallax_error));
    const p = toJ2000(num(g5.ra), num(g5.dec), d, num(g5.pmra), num(g5.pmdec), rv, num(g5.ref_epoch));
    return { ...p, pmra: num(g5.pmra), pmdec: num(g5.pmdec), source: 'gaia' };
  }
  return { raDeg: host.raDeg, decDeg: host.decDeg, pmra: host.pmra, pmdec: host.pmdec, source: 'archive' };
}
