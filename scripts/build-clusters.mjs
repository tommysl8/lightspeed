// Builds public/data/clusters.json.gz: open clusters with Gaia DR3 distances and globular clusters.
//
// Inputs (cached in data-raw/galaxy/, never re-downloaded):
//   HR24_clusters.dat.gz   Hunt & Reffert 2024, A&A 686, A42 (VizieR J/A+A/686/A42, clusters.dat): the Hunt &
//                          Reffert 2023 (A&A 673, A114) Gaia DR3 catalogue with masses, Jacobi radii and bound/unbound
//                          classification. Article licence CC BY 4.0.
//   VB21_tablea1.dat       Vasiliev & Baumgardt 2021, MNRAS 505, 5978 (VizieR J/MNRAS/505/5978): globular cluster
//                          positions. Article licence CC BY 4.0.
//   BV21_arXiv2105.09526_findis_tab.tex
//                          Baumgardt & Vasiliev 2021, MNRAS 505, 5957, final distance table from the arXiv source
//                          (arXiv:2105.09526, licensed CC BY 4.0).
//   harris_mwgc2010.dat    Harris 1996, AJ 112, 1487 (2010 edition), https://physics.mcmaster.ca/~harris/mwgc.dat:
//                          integrated magnitudes, half-light radii, metallicities. "Supplied free of charge to all
//                          users"; redistributors must refer to the original website and charge no fee.
//
// Output JSON (gzip; decode with DecompressionStream('gzip') in the browser):
//   { meta, openClusters: { columns, rows }, globularClusters: { columns, rows } }
//   Positions: ICRS RA/Dec (deg) and heliocentric galactic Cartesian x, y, z (pc; x -> l=0, y -> l=90, z -> NGP).
//
// Run: node scripts/build-clusters.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data-raw/galaxy');
const DEG = Math.PI / 180;

// IAU galactic frame in ICRS (Hipparcos, ESA 1997 SP-1200 vol. 1 sec. 1.5.3); rows = galactic axes.
const A = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
function galactic(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  const v = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const g = A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  let l = Math.atan2(g[1], g[0]) / DEG;
  if (l < 0) l += 360;
  return { l, b: Math.asin(g[2]) / DEG, u: g };
}
const r = (x, n) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

// ---------------------------------------------------------------------------------------------
// Open clusters (Hunt & Reffert 2024).
const OC_MAX = 1500;
const OC_NEAR_PC = 1000;
const FAMOUS = {
  Melotte_22: 'Pleiades (M45)', Melotte_25: 'Hyades', NGC_2632: 'Praesepe, the Beehive (M44)',
  NGC_869: 'h Persei (Double Cluster)', NGC_884: 'chi Persei (Double Cluster)', NGC_2682: 'M67',
  NGC_4755: 'Jewel Box', NGC_6705: 'Wild Duck Cluster (M11)', Melotte_111: 'Coma Star Cluster',
  Melotte_20: 'Alpha Persei Cluster', IC_2602: 'Southern Pleiades', IC_2391: 'Omicron Velorum Cluster',
  NGC_3532: 'Wishing Well Cluster', NGC_6475: 'Ptolemy Cluster (M7)', NGC_6405: 'Butterfly Cluster (M6)',
  NGC_2168: 'M35', NGC_2244: 'Rosette Nebula cluster', NGC_6611: 'Eagle Nebula cluster (M16)',
  NGC_6530: 'Lagoon Nebula cluster (M8)', NGC_6514: 'Trifid Nebula cluster (M20)', NGC_6618: 'Omega Nebula cluster (M17)',
  NGC_2264: 'Christmas Tree Cluster', NGC_6231: 'NGC 6231 (Sco OB1 core)', Trumpler_14: 'Trumpler 14 (Carina Nebula)',
  Trumpler_16: 'Trumpler 16 (Carina Nebula)', Westerlund_2: 'Westerlund 2', NGC_3603: 'NGC 3603',
  Collinder_69: 'Lambda Orionis Cluster', NGC_1980: 'NGC 1980 (Orion)', NGC_2516: 'Southern Beehive',
  NGC_3766: 'Pearl Cluster', NGC_457: 'Owl Cluster', Stock_2: 'Stock 2', NGC_7789: "Caroline's Rose",
  NGC_188: 'NGC 188', IC_4665: 'IC 4665', NGC_2547: 'NGC 2547', IC_2944: 'IC 2944 (Running Chicken)',
  NGC_6613: 'M18', NGC_6531: 'M21', NGC_6494: 'M23', IC_4725: 'M25', NGC_6694: 'M26', NGC_6913: 'M29',
  NGC_1039: 'M34', NGC_1960: 'M36', NGC_2099: 'M37', NGC_1912: 'M38', NGC_7092: 'M39', NGC_2287: 'M41',
  NGC_2437: 'M46', NGC_2422: 'M47', NGC_2548: 'M48', NGC_2323: 'M50', NGC_7654: 'M52', NGC_2447: 'M93',
  NGC_581: 'M103', Trumpler_10: 'Trumpler 10', NGC_2362: 'Tau Canis Majoris Cluster', IC_348: 'IC 348',
  NGC_2451A: 'NGC 2451A', Platais_9: 'Platais 9', Blanco_1: 'Blanco 1', Mamajek_1: 'Eta Chamaeleontis Cluster',
};

function parseHR24() {
  const text = gunzipSync(readFileSync(resolve(RAW, 'HR24_clusters.dat.gz'))).toString('utf8');
  const s = (l, a, b) => l.slice(a - 1, b).trim();
  const f = (l, a, b) => { const t = s(l, a, b); return t === '' ? NaN : Number(t); };
  return text.split('\n').filter((l) => l.trim()).map((l) => ({
    name: s(l, 1, 20), allNames: s(l, 27, 279), type: s(l, 281, 281), cst: f(l, 283, 293), N: f(l, 295, 300),
    ra: f(l, 320, 331), dec: f(l, 333, 344), r50pc: f(l, 419, 431), rtpc: f(l, 447, 459),
    d16: f(l, 584, 598), d50: f(l, 600, 614), d84: f(l, 616, 631),
    cmd50: f(l, 759, 768), age16: f(l, 796, 806), age50: f(l, 808, 818), age84: f(l, 820, 831),
    av50: f(l, 843, 853), rJpc: f(l, 978, 990), massJ: f(l, 1008, 1022), massTot: f(l, 1040, 1054),
  }));
}

function buildOpen() {
  const all = parseHR24();
  const ok = (c) => c.type === 'o' && c.cst >= 5 && Number.isFinite(c.d50);
  const quality = (c) => ok(c) && c.cmd50 >= 0.5;
  const famous = all.filter((c) => ok(c) && FAMOUS[c.name]);
  const chosen = new Map(famous.map((c) => [c.name, c]));
  for (const c of all.filter((c) => quality(c) && c.d50 <= OC_NEAR_PC).sort((a, b) => b.massTot - a.massTot)) {
    if (chosen.size >= OC_MAX) break;
    chosen.set(c.name, c);
  }
  for (const c of all.filter((c) => quality(c) && c.d50 > OC_NEAR_PC).sort((a, b) => b.massTot - a.massTot)) {
    if (chosen.size >= OC_MAX) break;
    chosen.set(c.name, c);
  }
  const rows = [...chosen.values()].sort((a, b) => a.d50 - b.d50).map((c) => {
    const g = galactic(c.ra, c.dec);
    return [
      c.name.replace(/_/g, ' '), FAMOUS[c.name] ?? null,
      r(c.ra, 5), r(c.dec, 5), r(g.l, 4), r(g.b, 4),
      r(c.d50, 1), r(c.d16, 1), r(c.d84, 1),
      r(c.d50 * g.u[0], 1), r(c.d50 * g.u[1], 1), r(c.d50 * g.u[2], 1),
      r(c.r50pc, 2), r(Number.isFinite(c.rJpc) ? c.rJpc : NaN, 2), r(c.rtpc, 2),
      c.N, r(c.age16, 3), r(c.age50, 3), r(c.age84, 3), r(c.av50, 3),
      r(c.massTot, 0), r(c.massJ, 0), r(c.cst, 1), r(c.cmd50, 3),
    ];
  });
  const counts = { candidates: all.filter(ok).length, highQuality: all.filter(quality).length, famousIncluded: famous.length };
  return { rows, counts };
}

// ---------------------------------------------------------------------------------------------
// Globular clusters (VB21 positions, BV21 distances, Harris 2010 photometry and structure).
const ALIAS = {
  'Ter 1': 'Terzan 1', 'Ter 2': 'Terzan 2', 'Ter 3': 'Terzan 3', 'Ter 4': 'Terzan 4', 'Ter 5': 'Terzan 5',
  'Ter 6': 'Terzan 6', 'Ter 7': 'Terzan 7', 'Ter 8': 'Terzan 8', 'Ter 9': 'Terzan 9', 'Ter 10': 'Terzan 10',
  'Ter 12': 'Terzan 12', 'Djor 1': 'Djorg 1', 'Djor 2': 'Djorg 2', 'ESO 280': 'ESO 280-06', 'ESO-SC06': 'ESO 280-06',
  'ESO 452': 'ESO 452-11', '1636-283': 'ESO 452-11', '2MASS-GC01': '2MS-GC01', '2MASS-GC02': '2MS-GC02',
  'VVV-CL001': 'VVV CL001', 'Lynga 7': 'BH 184', 'HP 1': 'BH 229', 'IC 1276': 'Pal 7', 'AM 1': 'E 1',
};
const DISPLAY = {
  'BH 184': 'Lynga 7 (BH 184)', 'BH 229': 'HP 1 (BH 229)', 'Pal 7': 'IC 1276 (Pal 7)', 'E 1': 'AM 1 (E 1)',
  'ESO 452-11': 'ESO 452-SC11', 'ESO 280-06': 'ESO 280-SC06',
};
const canon = (n) => ALIAS[n] ?? n;
const MESSIER = {
  'NGC 5139': 'Omega Centauri', 'NGC 104': '47 Tucanae', 'NGC 6205': 'M13 (Hercules Cluster)', 'NGC 7078': 'M15',
  'NGC 6121': 'M4', 'NGC 5272': 'M3', 'NGC 5904': 'M5', 'NGC 6656': 'M22', 'NGC 6341': 'M92', 'NGC 7089': 'M2',
  'NGC 6254': 'M10', 'NGC 6218': 'M12', 'NGC 6266': 'M62', 'NGC 6273': 'M19', 'NGC 6333': 'M9', 'NGC 6402': 'M14',
  'NGC 6626': 'M28', 'NGC 6637': 'M69', 'NGC 6681': 'M70', 'NGC 6715': 'M54', 'NGC 6779': 'M56', 'NGC 6809': 'M55',
  'NGC 6838': 'M71', 'NGC 6864': 'M75', 'NGC 6981': 'M72', 'NGC 7099': 'M30', 'NGC 1904': 'M79', 'NGC 4590': 'M68',
  'NGC 5024': 'M53', 'NGC 6093': 'M80', 'NGC 6171': 'M107', 'NGC 6397': 'NGC 6397', 'NGC 2419': 'Intergalactic Wanderer',
  'NGC 6752': 'NGC 6752', 'NGC 2808': 'NGC 2808',
};
const ML_V = 1.9; // adopted mass-to-light ratio (Baumgardt et al. 2020: 1.4 < M/L_V < 2.5 for Milky Way globulars)
const MV_SUN = 4.83;

function parseHarris() {
  const lines = readFileSync(resolve(RAW, 'harris_mwgc2010.dat'), 'latin1').split(/\r?\n/);
  const parts = { 1: [], 2: [], 3: [] };
  let part = 0;
  for (const l of lines) {
    if (/Part I:\s+Identifications/.test(l)) { part = 1; continue; }
    if (/Part II:\s+Metallicity/.test(l)) { part = 2; continue; }
    if (/Part III:\s+Velocities/.test(l)) { part = 3; continue; }
    if (part && /^ \S/.test(l) && !/^ +ID/.test(l)) parts[part].push(l);
  }
  // Column ends from the fully populated NGC 104 rows; each field spans (previous end, end].
  const spans = (ref, n) => {
    const ends = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(ref))) ends.push(m.index + m[0].length);
    return ends.slice(ends.length - n);
  };
  const field = (l, ends, k) => {
    const t = l.slice(k === 0 ? 12 : ends[k - 1], ends[k]).match(/-?\d+(\.\d+)?/g);
    return t ? Number(t[t.length - 1]) : NaN;
  };
  const out = new Map();
  for (const l of parts[1]) {
    if (!/\d\d \d\d +\d/.test(l)) continue;
    const id = l.slice(1, 12).trim();
    const alt = l.slice(12, 25).trim();
    const t = l.slice(25).trim().split(/\s+/).map(Number);
    const ra = (t[0] + t[1] / 60 + t[2] / 3600) * 15;
    const sign = /-/.test(l.slice(25).trim().split(/\s+/)[3]) ? -1 : 1;
    const dec = sign * (Math.abs(t[3]) + t[4] / 60 + t[5] / 3600);
    out.set(canon(id), { id, alt, ra, dec, Rsun: t[8] });
  }
  // Part II has 13 fields: [Fe/H] wt E(B-V) V_HB (m-M)V V_t M_V,t U-B B-V V-R V-I spt ellip.
  const ends = spans(parts[2].find((x) => x.startsWith(' NGC 104')), 13);
  for (const l of parts[2]) {
    const c = out.get(canon(l.slice(1, 12).trim()));
    if (!c) continue;
    c.feh = field(l, ends, 0);
    c.ebv = field(l, ends, 2);
    c.mMV = field(l, ends, 4);
    c.Vt = field(l, ends, 5);
    c.MVt = field(l, ends, 6);
  }
  const ref3 = parts[3].find((l) => l.startsWith(' NGC 104'));
  const ends3 = spans(ref3, 12);
  for (const l of parts[3]) {
    const c = out.get(canon(l.slice(1, 12).trim()));
    if (!c) continue;
    c.conc = field(l, ends3, 5);
    c.collapsed = /c:/.test(l.slice(ends3[5], ends3[6]));
    c.rc = field(l, ends3, 6);
    c.rh = field(l, ends3, 7);
  }
  return out;
}

function parseBV21() {
  const out = new Map();
  for (const l of readFileSync(resolve(RAW, 'BV21_arXiv2105.09526_findis_tab.tex'), 'utf8').split('\n')) {
    if (!l.includes('&') || !l.includes('[+0.10cm]')) continue;
    const cols = l.split('&').map((x) => x.trim());
    const name = canon(cols[0]);
    const mean = cols[7];
    let m = mean.match(/([\d.]+)\^\{\+([\d.]+)\}_\{-([\d.]+)\}/);
    let d, ep, em;
    if (m) { d = +m[1]; ep = +m[2]; em = +m[3]; }
    else if ((m = mean.match(/([\d.]+)\s*\\pm\s*([\d.]+)/))) { d = +m[1]; ep = em = +m[2]; }
    else continue;
    out.set(name, { d, ep, em, n: Number(cols[8].replace(/\\.*$/, '').trim()) });
  }
  return out;
}

function parseVB21() {
  const out = new Map();
  for (const l of readFileSync(resolve(RAW, 'VB21_tablea1.dat'), 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue;
    const name = l.slice(0, 12).trim();
    out.set(canon(name), {
      name, other: l.slice(12, 22).trim(), ra: Number(l.slice(24, 31)), dec: Number(l.slice(32, 39)),
      rscaleArcmin: Number(l.slice(96, 103)), nstar: Number(l.slice(104, 109)),
    });
  }
  return out;
}

function buildGlobular() {
  const harris = parseHarris();
  const bv = parseBV21();
  const vb = parseVB21();
  const names = new Set([...vb.keys(), ...harris.keys()]);
  const rows = [];
  const skipped = [];
  for (const n of names) {
    const p = vb.get(n), h = harris.get(n), d = bv.get(n);
    const ra = p?.ra ?? h?.ra, dec = p?.dec ?? h?.dec;
    let dist = d?.d, ep = d?.ep, em = d?.em, dsrc = 'BV21';
    if (!Number.isFinite(dist) && Number.isFinite(h?.Rsun)) { dist = h.Rsun; ep = em = null; dsrc = 'Harris2010'; }
    if (!Number.isFinite(ra) || !Number.isFinite(dist)) { skipped.push(n); continue; }
    const g = galactic(ra, dec);
    // Harris's M_V,t assumes his distance; rescale the luminosity to the adopted distance.
    let MV = h?.MVt;
    if (Number.isFinite(MV) && Number.isFinite(h?.Rsun) && dsrc === 'BV21') MV = MV - 5 * Math.log10(dist / h.Rsun);
    const LV = Number.isFinite(MV) ? 10 ** (-0.4 * (MV - MV_SUN)) : NaN;
    const rhPc = Number.isFinite(h?.rh) ? dist * 1000 * Math.tan((h.rh / 60) * DEG) : NaN;
    const rcPc = Number.isFinite(h?.rc) ? dist * 1000 * Math.tan((h.rc / 60) * DEG) : NaN;
    const display = DISPLAY[n] ?? (p?.name || h?.id || n);
    const common = MESSIER[n] ?? (h?.alt || p?.other || null);
    rows.push([
      display, common && common !== display ? common : null,
      r(ra, 5), r(dec, 5), r(g.l, 4), r(g.b, 4),
      r(dist, 3), ep === null ? null : r(ep, 3), em === null ? null : r(em, 3), dsrc,
      r(dist * 1000 * g.u[0], 1), r(dist * 1000 * g.u[1], 1), r(dist * 1000 * g.u[2], 1),
      r(rhPc, 2), r(rcPc, 2), r(h?.conc ?? NaN, 2), h?.collapsed ?? null,
      r(MV, 2), r(LV, -2), r(LV * ML_V, -3),
      r(h?.feh ?? NaN, 2), r(h?.ebv ?? NaN, 2),
    ]);
  }
  rows.sort((a, b) => a[6] - b[6]);
  return { rows, skipped };
}

function main() {
  const oc = buildOpen();
  const gc = buildGlobular();
  const out = {
    meta: {
      schema: 'lightspeed.clusters/1',
      frame: 'ICRS RA/Dec in degrees (open clusters: Gaia DR3 epoch 2016.0 densest point; globulars: J2000 centres). x, y, z: heliocentric galactic Cartesian in parsecs (x towards l = 0, y towards l = 90, z towards the north galactic pole), computed from RA/Dec with the IAU/Hipparcos galactic matrix and the listed median distance.',
      openClusterSelection: `Hunt & Reffert 2024 objects classified as bound open clusters (type 'o') with astrometric S/N (CST) >= 5. From these: named showpiece clusters always; then clusters with CMD class >= 0.5 within ${OC_NEAR_PC} pc, most massive first; then the most massive high-quality clusters beyond, until ${OC_MAX} in total. Sorted by distance.`,
      openClusterCounts: oc.counts,
      globularAdopted: `Positions: Vasiliev & Baumgardt 2021. Distances: Baumgardt & Vasiliev 2021 mean distances (asymmetric 1-sigma), else Harris 2010. rh, rc (pc) = Harris 2010 angular radii at the adopted distance. MV = Harris M_V,t rescaled to the adopted distance; LV with M_V,sun = ${MV_SUN}; massEstimate = ${ML_V} x LV (Baumgardt et al. 2020 find 1.4 < M/L_V < 2.5), a photometric estimate, not a dynamical mass.`,
      globularSkipped: gc.skipped,
      sources: {
        HuntReffert2023: 'Hunt E.L., Reffert S. 2023, A&A 673, A114, doi:10.1051/0004-6361/202346285 (CC BY 4.0)',
        HuntReffert2024: 'Hunt E.L., Reffert S. 2024, A&A 686, A42, doi:10.1051/0004-6361/202348662 (CC BY 4.0); VizieR J/A+A/686/A42',
        VasilievBaumgardt2021: 'Vasiliev E., Baumgardt H. 2021, MNRAS 505, 5978, doi:10.1093/mnras/stab1475 (CC BY 4.0); VizieR J/MNRAS/505/5978',
        BaumgardtVasiliev2021: 'Baumgardt H., Vasiliev E. 2021, MNRAS 505, 5957, doi:10.1093/mnras/stab1474; values from arXiv:2105.09526 (CC BY 4.0)',
        Harris2010: 'Harris W.E. 1996, AJ 112, 1487 (2010 edition), https://physics.mcmaster.ca/~harris/mwgc.dat (free of charge; cite and link the original site)',
        Baumgardt2020: 'Baumgardt H., Sollima A., Hilker M. 2020, PASA 37, e046, doi:10.1017/pasa.2020.38 (range of M/L_V only)',
        Gaia: 'Cluster parameters derived from Gaia DR3 / EDR3: ESA/Gaia/DPAC',
      },
      credit: 'Open clusters: Hunt & Reffert (2023, 2024), based on ESA Gaia DR3. Globular clusters: Vasiliev & Baumgardt (2021), Baumgardt & Vasiliev (2021), Harris (1996, 2010 edition).',
    },
    openClusters: {
      columns: ['name', 'commonName', 'raDeg', 'decDeg', 'lDeg', 'bDeg', 'distPc', 'dist16Pc', 'dist84Pc', 'xPc', 'yPc', 'zPc',
        'r50Pc', 'rJacobiPc', 'rTidalPc', 'members', 'logAge16', 'logAge50', 'logAge84', 'AV', 'massTotalMsun', 'massJacobiMsun', 'cst', 'cmdClass'],
      rows: oc.rows,
    },
    globularClusters: {
      columns: ['name', 'commonName', 'raDeg', 'decDeg', 'lDeg', 'bDeg', 'distKpc', 'distErrPlusKpc', 'distErrMinusKpc', 'distSource',
        'xPc', 'yPc', 'zPc', 'rhPc', 'rcPc', 'concentration', 'coreCollapsed', 'MV', 'LVsun', 'massEstimateMsun', 'FeH', 'EBV'],
      rows: gc.rows,
    },
  };
  const json = JSON.stringify(out);
  const gz = gzipSync(Buffer.from(json), { level: 9 });
  mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
  writeFileSync(resolve(ROOT, 'public/data/clusters.json.gz'), gz);
  console.log(`open clusters: ${oc.rows.length} (candidates ${oc.counts.candidates}, high quality ${oc.counts.highQuality}, named ${oc.counts.famousIncluded})`);
  console.log(`globular clusters: ${gc.rows.length}, skipped (no position or distance): ${gc.skipped.join(', ')}`);
  console.log(`clusters.json.gz: ${json.length} bytes raw, ${gz.length} gzipped`);
}

main();
