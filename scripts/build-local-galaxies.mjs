// Builds public/data/local-galaxies.json.gz (the Local Group and its neighbours out to 3 Mpc) and
// staging/cosmos/named.json (the galaxies, clusters and record-holders the Learn articles name).
//
// Sources (full list, licences and credit lines in staging/cosmos/cosmos.md):
//   The Local Volume Database (LVDB; Pace, A. B. 2025, The Open Journal of Astrophysics 8, 142,
//     doi:10.33232/001c.144859, arXiv:2411.07424), release v1.1.1 (12 August 2026), comb_all.ecsv from
//     https://github.com/apace7/local_volume_database/releases/tag/v1.1.1, cached in data-raw/cosmos/lvdb/.
//     Released under CC0 1.0 (the repository's LICENSE). Every value in it cites its paper by author +
//     ADS bibcode (columns ref_*), and those references are carried into the output.
//     (An earlier version of this file used the updated catalogue of McConnachie 2012 from the CADC; no
//     redistribution licence could be confirmed for it, so it was replaced.)
//   RC3 (de Vaucouleurs et al. 1991) via VizieR VII/155: D25, R25, B_T, A_g, types of the big galaxies.
//   Cosmicflows-4 (Tully et al. 2023, ApJ 944, 94; CC BY 4.0) for M81 and Centaurus A distances and
//     for the index of each named galaxy in public/data/cosmic-web.bin.gz (run build-cosmic-web first).
//   Positions of named objects: SIMBAD (Wenger et al. 2000) through the CDS Sesame resolver; each
//     entry keeps the bibcode SIMBAD gives for its position. Distances, redshifts and disc angles:
//     the papers cited next to each value below.
//
// Frames: positions are heliocentric, in the J2000 ecliptic frame (x to the March equinox, z to the
// ecliptic north pole), obtained from ICRS by a rotation of +epsilon about x, epsilon = 84381.448".
// The app's world axes are world = (x_ecl, z_ecl, -y_ecl).
//
// Run: node scripts/build-cosmic-web.mjs && node scripts/build-local-galaxies.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const RAW = 'data-raw/cosmos';
const OUT_LOCAL = 'public/data/local-galaxies.json.gz';
const OUT_NAMED = 'staging/cosmos/named.json';
const LVDB_VERSION = 'v1.1.1';
const LVDB_FILE = `${RAW}/lvdb/lvdb_${LVDB_VERSION}_comb_all.ecsv`;
const LVDB_URL = `https://github.com/apace7/local_volume_database/releases/download/${LVDB_VERSION}/comb_all.ecsv`;
const LVDB_LICENSE_URL = `https://raw.githubusercontent.com/apace7/local_volume_database/${LVDB_VERSION}/LICENSE`;
const BUILD_DATE = '2026-09-25';

async function ensure(path, url) {
  if (existsSync(path)) return;
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}
mkdirSync(`${RAW}/lvdb`, { recursive: true });
await ensure(LVDB_FILE, LVDB_URL);
await ensure(`${RAW}/lvdb/LICENSE`, LVDB_LICENSE_URL);
if (!/CC0 1\.0 Universal/.test(readFileSync(`${RAW}/lvdb/LICENSE`, 'utf8'))) throw new Error('LVDB licence is not CC0 1.0: check before shipping');
if (!existsSync(`${RAW}/cosmic-web-index.json`)) {
  throw new Error('run node scripts/build-cosmic-web.mjs first (it writes data-raw/cosmos/cosmic-web-index.json)');
}

// ------------------------------------------------------------------------------------------------
// Constants and frames

const DEG = Math.PI / 180;
const C_KM_S = 299792.458;
const K_PM = 4.740470463533348; // km/s per (mas/yr * kpc): 1 au/yr in km/s
const EPS = (84381.448 / 3600) * DEG; // obliquity of the J2000 ecliptic (IAU 1976), as in build-stars
const CE = Math.cos(EPS);
const SE = Math.sin(EPS);
/** ICRS -> ecliptic J2000. */
const eqToEcl = ([x, y, z]) => [x, CE * y + SE * z, -SE * y + CE * z];
/** Galactic (IAU 1958 realised in ICRS, Hipparcos vol. 1 eq. 1.5.11): rows are galactic axes in ICRS. */
const A_G = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
const eqToGal = (v) => A_G.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const unit = (raDeg, decDeg) => {
  const a = raDeg * DEG;
  const d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
const lonLat = ([x, y, z]) => {
  let lon = Math.atan2(y, x) / DEG;
  if (lon < 0) lon += 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, z))) / DEG];
};
const scale = (v, s) => v.map((c) => c * s);
const add = (a, b) => a.map((c, i) => c + b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r6 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e3) / 1e3);
const vec6 = (v) => v.map(r6);

/** Sky basis at (ra, dec): north, east, line of sight (away from the Sun), all in ICRS. */
function skyBasis(ra, dec) {
  const a = ra * DEG;
  const d = dec * DEG;
  return {
    r: [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)],
    e: [-Math.sin(a), Math.cos(a), 0],
    n: [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
  };
}

/**
 * Orientation of a thin disc from its inclination i (0 = face-on), the position angle PA of its
 * major axis (degrees east of north) and, when known, the PA of the near side of the minor axis and
 * the sense of rotation. Returns unit vectors in ICRS:
 *   major  in-plane, along PA (toward the receding end when `recedingPA` is given)
 *   minor  in-plane, perpendicular to major, toward the side at PA + 90 deg as projected on the sky
 *   normal the disc normal on the observer's side (normal . lineOfSight = -cos i)
 *   spin   the angular momentum direction, or null if the rotation sense is unknown
 * If the near side is unknown the plane is ambiguous (mirror image in the sky plane); we then assume
 * the side at PA + 90 deg is near and flag it.
 */
function discOrientation(ra, dec, d) {
  const { r, e, n } = skyBasis(ra, dec);
  const pa = (d.recedingPA ?? d.pa) * DEG;
  const i = d.inclination * DEG;
  const a = add(scale(n, Math.cos(pa)), scale(e, Math.sin(pa)));
  const b = add(scale(n, -Math.sin(pa)), scale(e, Math.cos(pa)));
  let sNear = 1;
  let assumed = true;
  if (d.nearSidePA != null) {
    sNear = Math.cos((d.nearSidePA - ((d.recedingPA ?? d.pa) + 90)) * DEG) >= 0 ? 1 : -1;
    assumed = false;
  }
  // In-plane unit vector projecting onto +b: going toward the near side brings you closer (-r).
  const m = add(scale(b, Math.cos(i)), scale(r, -sNear * Math.sin(i)));
  const normal = cross(a, m); // observer-side normal: dot(normal, r) = -cos i
  let spin = null;
  if (d.recedingPA != null && d.nearSidePA != null) spin = scale(normal, -sNear);
  else if (d.rotationOnSky === 'counterclockwise') spin = normal;
  else if (d.rotationOnSky === 'clockwise') spin = scale(normal, -1);
  return { major: a, minor: m, normal, spin, nearSideAssumed: assumed };
}

// ------------------------------------------------------------------------------------------------
// Cosmology: flat Lambda-CDM with Planck 2018 TT,TE,EE+lowE+lensing+BAO parameters (Planck
// Collaboration 2020, A&A 641, A6, table 2, last column). One massive neutrino (0.06 eV) is counted
// in Omega_m; photons and two massless neutrino species are radiation (N_eff = 3.046).

const H0 = 67.66; // km/s/Mpc
const OMEGA_M = 0.3111;
const T_CMB = 2.7255; // K (Fixsen 2009)
const N_EFF = 3.046;
const OMEGA_R = (() => {
  const sigmaSB = 5.670374419e-8;
  const c = 299792458;
  const G = 6.6743e-11;
  const mpcM = 3.0856775814913673e22;
  const rhoGamma = (4 * sigmaSB * T_CMB ** 4) / c ** 3; // kg/m^3
  const h0Si = (H0 * 1000) / mpcM;
  const rhoCrit = (3 * h0Si * h0Si) / (8 * Math.PI * G);
  const omegaGamma = rhoGamma / rhoCrit;
  return omegaGamma * (1 + (7 / 8) * (4 / 11) ** (4 / 3) * N_EFF * (2 / 3));
})();
const OMEGA_L = 1 - OMEGA_M - OMEGA_R;
const HUBBLE_DIST_MPC = C_KM_S / H0;
const HUBBLE_TIME_GYR = 977.7922216807891 / H0; // 1/H0 in Gyr (977.79 = Mpc/(km/s) in Gyr)

// Gauss-Legendre (16 nodes) over n sub-intervals.
const GL_X = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003, -0.6178762444026438,
  -0.4580167776572274, -0.2816035507792589, -0.0950125098376374, 0.0950125098376374, 0.2816035507792589,
  0.4580167776572274, 0.6178762444026438, 0.755404408355003, 0.8656312023878318, 0.9445750230732326,
  0.9894009349916499,
];
const GL_W = [
  0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339, 0.1495959888165767,
  0.1691565193950025, 0.1826034150449236, 0.1894506104550685, 0.1894506104550685, 0.1826034150449236,
  0.1691565193950025, 0.1495959888165767, 0.1246289712555339, 0.0951585116824928, 0.0622535239386479,
  0.0271524594117541,
];
function integrate(f, a, b, n = 64) {
  let s = 0;
  const h = (b - a) / n;
  for (let k = 0; k < n; k++) {
    const m = a + (k + 0.5) * h;
    for (let j = 0; j < 16; j++) s += GL_W[j] * f(m + 0.5 * h * GL_X[j]);
  }
  return 0.5 * h * s;
}
// Integrals in the scale factor a = 1/(1+z), which keep the integrands finite at high z.
const aE = (a) => Math.sqrt(OMEGA_R + OMEGA_M * a + OMEGA_L * a ** 4); // a^2 E(a)
const comovingMpc = (z) => HUBBLE_DIST_MPC * integrate((a) => 1 / aE(a), 1 / (1 + z), 1);
const ageGyr = (z) => HUBBLE_TIME_GYR * integrate((a) => a / aE(a), 0, 1 / (1 + z), 256);
const cosmo = (z) => {
  const dc = comovingMpc(z);
  const t0 = ageGyr(0);
  const te = ageGyr(z);
  return {
    comovingDistanceMpc: r3(dc),
    luminosityDistanceMpc: r3(dc * (1 + z)),
    angularDiameterDistanceMpc: r3(dc / (1 + z)),
    lookbackTimeGyr: r4(t0 - te),
    ageAtEmissionGyr: r4(te),
    lightTravelDistanceGly: r4(t0 - te),
  };
};

/** CMB dipole (Planck 2018 I, A&A 641, A1): the Sun moves at 369.82 km/s toward (l, b) = (264.021, 48.253). */
const DIPOLE_V = 369.82;
const DIPOLE_DIR_EQ = (() => {
  const l = 264.021 * DEG;
  const b = 48.253 * DEG;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  // galactic -> ICRS is the transpose of A_G
  return [0, 1, 2].map((i) => A_G[0][i] * g[0] + A_G[1][i] * g[1] + A_G[2][i] * g[2]);
})();
/** 1 + z_cmb = (1 + z_hel) * gamma * (1 + beta cos theta), theta between the source and the apex. */
function zHelioToCmb(zHel, ra, dec) {
  const beta = DIPOLE_V / C_KM_S;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const cosT = dot(unit(ra, dec), DIPOLE_DIR_EQ);
  return (1 + zHel) * gamma * (1 + beta * cosT) - 1;
}
// Velocities quoted as cz (km/s) by the sources are converted with z = v/c, the optical convention
// those catalogues use; no relativistic Doppler formula is applied to them.

// ------------------------------------------------------------------------------------------------
// Local Volume Database (LVDB, Pace 2025), release v1.1.1: a minimal ECSV reader

function readEcsv(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const split = (line) => {
    const out = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === ' ') {
        i++;
        continue;
      }
      if (line[i] === '"') {
        let j = i + 1;
        let v = '';
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') {
            v += '"';
            j += 2;
          } else if (line[j] === '"') break;
          else v += line[j++];
        }
        out.push(v);
        i = j + 1;
      } else {
        let j = i;
        while (j < line.length && line[j] !== ' ') j++;
        out.push(line.slice(i, j));
        i = j;
      }
    }
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const v = split(l);
    return Object.fromEntries(header.map((h, k) => [h, v[k] ?? '']));
  });
}
const numOrNull = (s) => (s === '' || s == null || !Number.isFinite(Number(s)) ? null : Number(s));

const LOCAL_MAX_KPC = 3000;
const lvdb = readEcsv(LVDB_FILE);
/**
 * M31 system on the Savino et al. (2022) RR Lyrae scale. That study measured M31 and 38 of its satellites
 * homogeneously and anchored their relative geometry on its own M31 distance, mu = 24.45 +- 0.06
 * (776.2 kpc). This catalogue places M31 at the Cepheid distance of Li et al. (2021), 761 kpc (mu = 24.407),
 * so the satellites measured by Savino et al. are scaled by 761/776.2 (-0.043 mag, within both errors):
 * they keep Savino et al.'s positions relative to M31 (M32 3.5 kpc in front of M31 rather than 11.7 kpc
 * behind it). Satellites with distances from other studies are left as published.
 */
const M31_KPC = 761;
const SAVINO_M31_KPC = 776.2;
const SAVINO_REF = 'Savino2022ApJ...938..101S';
const SAVINO_SCALE = M31_KPC / SAVINO_M31_KPC;
const SAVINO_DMU = 5 * Math.log10(SAVINO_SCALE);
/** Named overrides of the render class where the gas content is not the right guide (the four dwarf ellipticals). */
const CLASS_BY_KEY = {
  m_032: ['compact-elliptical', 'cE (compact elliptical)'],
  ngc_0205: ['dwarf-elliptical', 'dE (dwarf elliptical)'],
  ngc_0185: ['dwarf-elliptical', 'dE (dwarf elliptical)'],
  ngc_0147: ['dwarf-elliptical', 'dE (dwarf elliptical)'],
};
const LVDB_BIBCODE = (key) => (key && key.length > 19 ? key.slice(-19) : null);

const local = [];
for (const r of lvdb) {
  if (!r.table.startsWith('dwarf')) continue;
  const d0 = numOrNull(r.distance);
  if (d0 == null || d0 > LOCAL_MAX_KPC) continue;
  if (r.confirmed_real !== '1') continue; // unconfirmed candidates are left out
  const ra = Number(r.ra);
  const dec = Number(r.dec);
  const savino = r.table === 'dwarf_m31' && r.ref_distance === SAVINO_REF;
  // No distance of its own: LVDB places it at its host's distance (distance_measurement_method = host).
  const atHost = r.distance_measurement_method === 'host';
  if (atHost && r.host !== 'm_031') throw new Error(`${r.key}: placed at host ${r.host}, not handled`);
  const dmodRaw = numOrNull(r.distance_modulus);
  const dmod = atHost ? 5 * Math.log10(M31_KPC * 100) : dmodRaw == null ? null : dmodRaw + (savino ? SAVINO_DMU : 0);
  const dKpc = atHost ? M31_KPC : savino ? d0 * SAVINO_SCALE : d0;
  const mHIdex = numOrNull(r.mass_HI);
  const [cls, morph] =
    CLASS_BY_KEY[r.key] ??
    (r.confirmed_galaxy !== '1'
      ? ['unknown', 'not confirmed as a galaxy (may be a star cluster)']
      : mHIdex != null && mHIdex >= 6
        ? ['dwarf-irregular', `gas-rich dwarf (HI ${(10 ** mHIdex).toPrecision(2)} Msun)`]
        : mHIdex != null
          ? ['transition', `dwarf with little gas (HI ${(10 ** mHIdex).toPrecision(2)} Msun)`]
          : ['dwarf-spheroidal', 'gas-poor dwarf (no HI detected)']);
  const refs = [...new Set([r.ref_distance, r.ref_structure, r.ref_m_v, r.ref_vlos, r.ref_proper_motion, r.ref_metallicity_spectroscopic, r.ref_metallicity_photometric, r.ref_flux_HI].filter(Boolean))];
  const Mv = numOrNull(r.M_V);
  const feh = numOrNull(r.metallicity);
  local.push({
    id: `lg-${r.key}`,
    key: r.key,
    name: r.name,
    catalogueName: `LVDB ${r.key}`,
    host: r.host,
    subgroup: null, // set below from the host and the Local Group's zero-velocity surface
    morphology: morph,
    class: cls,
    ambiguous: r.confirmed_galaxy !== '1',
    ra: r6(ra),
    dec: r6(dec),
    dmod: dmod == null ? null : r4(dmod),
    dmodErr: [numOrNull(r.distance_modulus_ep), numOrNull(r.distance_modulus_em)],
    distanceKpc: dKpc,
    distanceRef: atHost
      ? 'no distance of its own: placed at the distance of its host, M31 (as the LVDB does)'
      : savino
        ? `${SAVINO_REF} (scaled by 761/776.2 to M31 at Li et al. 2021's distance)`
        : r.ref_distance || null,
    vHelio: numOrNull(r.vlos_systemic),
    vHelioErr: [numOrNull(r.vlos_systemic_ep), numOrNull(r.vlos_systemic_em)],
    vmag: numOrNull(r.apparent_magnitude_v),
    absMagV: Mv == null ? null : r3(Mv - (dmodRaw != null && dmod != null ? dmod - dmodRaw : 0)),
    pa: numOrNull(r.position_angle),
    ellipticity: numOrNull(r.ellipticity),
    rhArcmin: numOrNull(r.rhalf),
    muVHalf: numOrNull(r.surface_brightness_rhalf),
    sigmaStar: numOrNull(r.vlos_sigma),
    mHI: mHIdex == null ? null : Number((10 ** mHIdex / 1e6).toPrecision(4)),
    feh,
    fehType: feh == null ? null : r.metallicity_type || null,
    pmra: numOrNull(r.pmra),
    pmdec: numOrNull(r.pmdec),
    pmraErr: numOrNull(r.pmra) == null ? null : [numOrNull(r.pmra_ep), numOrNull(r.pmra_em)],
    pmdecErr: numOrNull(r.pmdec) == null ? null : [numOrNull(r.pmdec_ep), numOrNull(r.pmdec_em)],
    pmRef: numOrNull(r.pmra) == null ? null : r.ref_proper_motion || null,
    refs,
  });
}

// ------------------------------------------------------------------------------------------------
// Curated values for the named objects. Every number carries its source.

const NAMED = [
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    aliases: ['M31', 'NGC 224', 'UGC 454', 'PGC 2557'],
    kind: 'galaxy',
    local: true,
    ra: 10.68470833,
    dec: 41.26875,
    posRef: 'SIMBAD; position from 2MASS (Skrutskie et al. 2006, AJ 131, 1163)',
    vHelio: { value: -300, err: 4, ref: 'McConnachie 2012, AJ 144, 4' },
    distance: {
      mpc: 0.761,
      errMpc: 0.011,
      dmod: 24.407,
      dmodErr: 0.032,
      method: 'Cepheid period-luminosity relations in the near-infrared (HST)',
      ref: 'Li, Riess et al. 2021, ApJ 920, 84 (arXiv:2107.08029)',
    },
    morphology: { type: 'SA(s)b', class: 'spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 77.7,
      recedingPA: 37.7,
      nearSidePA: 307.7,
      ref: 'Corbelli et al. 2010, A&A 511, A89: i = 77.7, PA = 37.7 deg (HI, R = 10-13 kpc); the north-east half recedes, the west half is the near side',
      note: 'The HI disc is warped: Chemin, Carignan & Foster 2009 (ApJ 705, 1395) find a mean i = 74.3 +/- 1.1 deg and PA = 37.7 +/- 0.9 deg for R = 6-27 kpc.',
    },
    pgc: 2557,
  },
  {
    id: 'triangulum',
    name: 'Triangulum Galaxy',
    aliases: ['M33', 'NGC 598', 'UGC 1117', 'PGC 5818'],
    kind: 'galaxy',
    local: true,
    ra: 23.46206906,
    dec: 30.66017511,
    posRef: 'SIMBAD; position from Gaia (2020yCat.1350....0G)',
    vHelio: { value: -179.2, err: 1.7, ref: 'McConnachie 2012, AJ 144, 4' },
    distance: {
      dmod: 24.622,
      dmodErr: 0.03,
      method: 'Cepheid period-luminosity relation (HST, PHATTER)',
      ref: 'Breuval et al. 2023, ApJ 951, 118 (arXiv:2304.00037)',
    },
    morphology: { type: 'SA(s)cd', class: 'spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 52,
      recedingPA: 202,
      nearSidePA: null,
      ref: 'Kam et al. 2017, AJ 154, 41: optical i = 52 +/- 3 deg and major-axis PA = 22.5 +/- 1 deg (Warner, Wright & Baldwin 1973); inner HI disc kinematic PA = 202 deg (the southern half recedes)',
      note: 'The near side is not established in these sources, so the plane is ambiguous up to a mirror image in the sky plane. The outer HI disc is warped (PA ~ 165 deg).',
    },
    pgc: 5818,
  },
  {
    id: 'lmc',
    name: 'Large Magellanic Cloud',
    aliases: ['LMC', 'Nubecula Major', 'PGC 17223'],
    kind: 'galaxy',
    local: true,
    ra: 80.89416667,
    dec: -69.75611111,
    posRef: 'SIMBAD (2003A&A...412...45P)',
    vHelio: { value: 262.2, err: 3.4, ref: 'McConnachie 2012, AJ 144, 4' },
    distance: {
      mpc: 0.04959,
      errMpc: 0.00055,
      dmod: 18.477,
      dmodErr: 0.026,
      method: 'Late-type detached eclipsing binaries (49.59 +/- 0.09 stat +/- 0.54 sys kpc)',
      ref: 'Pietrzynski et al. 2019, Nature 567, 200 (arXiv:1903.08096)',
    },
    morphology: { type: 'SB(s)m', class: 'magellanic-spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 34.0,
      pa: 139.1,
      nearSidePA: 49.1,
      rotationOnSky: 'clockwise',
      ref: 'van der Marel & Kallivayalil 2014, ApJ 781, 121: i = 34.0 +/- 7.0 deg, line of nodes 139.1 +/- 4.1 deg (proper motions + old-star velocities); near side at PA = line of nodes - 90 deg; the disc rotates clockwise on the sky',
      note: 'Published viewing angles depend on the tracer: i = 26-40 deg and line of nodes 130-155 deg.',
    },
    // Centre-of-mass proper motion (mu_W, mu_N) = (-1.9103, 0.2292) mas/yr, i.e. mu_alpha* = +1.9103
    pm: { pmra: 1.9103, pmdec: 0.2292, ref: 'van der Marel & Kallivayalil 2014, ApJ 781, 121 (LMC centre-of-mass proper motion)' },
    pgc: 17223,
  },
  {
    id: 'smc',
    name: 'Small Magellanic Cloud',
    aliases: ['SMC', 'Nubecula Minor', 'NGC 292', 'PGC 3085'],
    kind: 'galaxy',
    local: true,
    ra: 13.15833333,
    dec: -72.80027778,
    posRef: 'SIMBAD (2003A&A...412...45P)',
    vHelio: { value: 145.6, err: 0.6, ref: 'McConnachie 2012, AJ 144, 4' },
    distance: {
      mpc: 0.06244,
      errMpc: 0.00093,
      dmod: 18.977,
      dmodErr: 0.032,
      method: 'Late-type detached eclipsing binaries (62.44 +/- 0.47 stat +/- 0.81 sys kpc)',
      ref: 'Graczyk et al. 2020, ApJ 904, 13 (arXiv:2010.08754)',
    },
    morphology: { type: 'SB(s)m pec', class: 'magellanic-irregular', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 51,
      recedingPA: 66,
      nearSidePA: null,
      ref: 'Di Teodoro et al. 2019, MNRAS 483, 392: HI kinematic model, i = 51 deg, PA of the receding line of nodes = 66 deg',
      note: 'Applies to the gas only. The older stars form a spheroid or ellipsoid stretched along the line of sight, with the north-eastern end of the bar nearer to us than the south-western end (Di Teodoro et al. 2019 and references there); whether the HI is a rotating disc is debated.',
    },
    pgc: 3085,
  },
  {
    id: 'm81',
    name: "Bode's Galaxy",
    aliases: ['M81', 'NGC 3031', 'UGC 5318', 'PGC 28630'],
    kind: 'galaxy',
    ra: 148.8882194,
    dec: 69.06529514,
    posRef: 'SIMBAD; position from Gaia (2020yCat.1350....0G)',
    vHelio: { value: -39.8, ref: 'de Blok et al. 2008, AJ 136, 2648 (THINGS HI systemic velocity)' },
    distance: {
      dmod: 27.797,
      dmodErr: 0.116,
      method: 'Cosmicflows-4 group distance (TRGB, Cepheids and other methods in the M81 group)',
      ref: 'Tully et al. 2023, ApJ 944, 94 (group 1PGC 28630)',
    },
    morphology: { type: 'SA(s)ab', class: 'spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 59.0,
      recedingPA: 330.2,
      nearSidePA: null,
      ref: 'de Blok et al. 2008, AJ 136, 2648 (THINGS tilted-ring fit: i = 59.0 deg, PA of the receding half = 330.2 deg)',
      note: 'The near side is not given in this source; the plane is ambiguous up to a mirror image in the sky plane.',
    },
    pgc: 28630,
  },
  {
    id: 'm87',
    name: 'Messier 87 (Virgo A)',
    aliases: ['M87', 'NGC 4486', 'Virgo A', 'UGC 7654', 'PGC 41361'],
    kind: 'galaxy',
    ra: 187.70593077,
    dec: 12.39112325,
    posRef: 'SIMBAD (2020A&A...644A.159C)',
    zHelio: { value: 0.004283, err: 0.000017, ref: 'NED preferred redshift (1284 +- 5 km/s): Cappellari et al. 2011, MNRAS 413, 813 (ATLAS3D)' },
    distance: {
      mpc: 16.8,
      errMpc: [0.8, 0.7],
      method: 'Average of stellar-population distances (SBF and others) adopted by the EHT',
      ref: 'Event Horizon Telescope Collaboration 2019, ApJL 875, L6 (arXiv:1906.11243)',
    },
    morphology: { type: 'E+0-1 pec (cD)', class: 'elliptical', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    pgc: 41361,
  },
  {
    id: 'centaurus-a',
    name: 'Centaurus A',
    aliases: ['NGC 5128', 'Cen A', 'PGC 46957'],
    kind: 'galaxy',
    ra: 201.36506338,
    dec: -43.01911251,
    posRef: 'SIMBAD (2020A&A...644A.159C)',
    zHelio: { value: 0.0018246, err: 0.0000167, ref: 'NED preferred redshift (547 +- 5 km/s), from Baer-Way et al. 2024, ApJ 964, 172' },
    distance: {
      dmod: 27.804,
      dmodErr: 0.038,
      method: 'Cosmicflows-4 (TRGB, SBF and other methods combined)',
      ref: 'Tully et al. 2023, ApJ 944, 94',
    },
    morphology: {
      type: 'S0 pec',
      class: 'lenticular-peculiar',
      ref: 'RC3 (de Vaucouleurs et al. 1991); an elliptical-like body crossed by a warped dust disc, with radio jets and lobes',
    },
    pgc: 46957,
  },
  {
    id: 'sombrero',
    name: 'Sombrero Galaxy',
    aliases: ['M104', 'NGC 4594', 'PGC 42407'],
    kind: 'galaxy',
    ra: 189.99763275,
    dec: -11.62305449,
    posRef: 'SIMBAD (2020A&A...644A.159C)',
    vHelio: { value: 1095, ref: 'SIMBAD; Kourkchi et al. 2020, ApJ 902, 145' },
    distance: {
      mpc: 9.55,
      errMpc: 0.34,
      dmod: 29.9,
      dmodErr: 0.08,
      method: 'Tip of the red giant branch (HST); 9.55 +/- 0.13 stat +/- 0.31 sys Mpc',
      ref: 'McQuinn, Skillman, Dolphin et al. 2016, AJ 152, 144 (arXiv:1610.03857)',
    },
    morphology: { type: 'SA(s)a sp', class: 'spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 84,
      pa: 90,
      nearSidePA: null,
      approximate: true,
      ref: 'Major-axis PA = 90 deg from RC3. Jardel et al. 2011 (ApJ 739, 21) describe the disc as inclined "very close to 90 deg"; the 84 deg adopted here is an approximate value that keeps the dust ring visible as in images',
      note: 'Inclination is approximate (modelling choice); the near side is not set from a source.',
    },
    pgc: 42407,
  },
  {
    id: 'whirlpool',
    name: 'Whirlpool Galaxy',
    aliases: ['M51', 'M51a', 'NGC 5194', 'UGC 8493', 'PGC 47404'],
    kind: 'galaxy',
    ra: 202.469575,
    dec: 47.19525833,
    posRef: 'SIMBAD (2006AJ....131.1163S)',
    vHelio: { value: 472, ref: 'Systemic velocity adopted by Colombo et al. 2014, ApJ 784, 4' },
    distance: {
      mpc: 8.58,
      errMpc: 0.1,
      method: 'Tip of the red giant branch (HST)',
      ref: 'McQuinn, Skillman, Dolphin et al. 2016, ApJ 826, 21 (arXiv:1606.04120)',
    },
    morphology: { type: 'SA(s)bc pec', class: 'spiral', ref: 'RC3 (de Vaucouleurs et al. 1991)' },
    disc: {
      inclination: 22,
      pa: 173,
      nearSidePA: null,
      ref: 'Colombo et al. 2014, ApJ 784, 4 (PAWS): PA = 173 +/- 3 deg, i = 22 +/- 5 deg',
      note: 'The near side is not given in this source; the plane is ambiguous up to a mirror image in the sky plane. Colombo et al. model the arms as trailing, S-shaped on the sky. Interacting with NGC 5195 (M51b) to the north.',
    },
    pgc: 47404,
  },
  {
    id: 'virgo-cluster',
    name: 'Virgo Cluster',
    aliases: ['Virgo I', 'Cosmicflows-4 group 1PGC 41220'],
    kind: 'cluster',
    ra: 187.6991,
    dec: 12.3852,
    posRef: 'SIMBAD "NAME Virgo Cluster" (2022A&A...661A..38P); essentially the position of M87',
    distance: {
      mpc: 16.5,
      errMpc: 1.1,
      method: 'Surface brightness fluctuations of 79 early-type members (16.5 +/- 0.1 random +/- 1.1 systematic Mpc)',
      ref: 'Mei et al. 2007, ApJ 655, 144 (ACS Virgo Cluster Survey XIII)',
    },
    vHelio: {
      value: 1257,
      ref: 'Cosmicflows-4 group 1PGC 41220, mean heliocentric velocity (Tully et al. 2023, ApJ 944, 94, table 4)',
    },
    cf4Group: 41220,
    morphology: { type: 'cluster (irregular, several sub-clusters)', class: 'cluster', ref: 'Binggeli, Tammann & Sandage 1987, AJ 94, 251' },
  },
  {
    id: 'coma-cluster',
    name: 'Coma Cluster',
    aliases: ['Abell 1656', 'Cosmicflows-4 group 1PGC 44715'],
    kind: 'cluster',
    ra: 194.93502,
    dec: 27.91246,
    posRef: 'SIMBAD "ACO 1656" (2020ApJS..246....2A)',
    zHelio: { value: 0.0234, ref: 'SIMBAD; Rines et al. 2016, ApJ 819, 63' },
    distance: {
      mpc: 98.5,
      errMpc: 2.2,
      method: '12 type Ia supernovae calibrated on the HST (Cepheid) distance ladder',
      ref: 'Scolnic, Riess et al. 2025, ApJL 979, L9 (arXiv:2409.14546)',
      note: 'The same data calibrated to the Planck Lambda-CDM value H0 = 67.4 give 111.8 +/- 1.8 Mpc: the Hubble tension, measured on one cluster.',
    },
    cf4Group: 44715,
    morphology: { type: 'rich cluster, Bautz-Morgan II', class: 'cluster', ref: 'Abell 1958' },
  },
  {
    id: 'bullet-cluster',
    name: 'Bullet Cluster',
    aliases: ['1E 0657-56', '1E 0657-558', 'ClG 0657-56'],
    kind: 'cluster',
    ra: 104.612,
    dec: -55.9725,
    posRef: 'SIMBAD "ClG 0657-56" (2022A&A...661A..38P)',
    zHelio: { value: 0.296, ref: 'Clowe et al. 2006, ApJ 648, L109' },
    morphology: { type: 'merging cluster pair', class: 'cluster', ref: 'Clowe et al. 2006, ApJ 648, L109' },
  },
  {
    id: 'gn-z11',
    name: 'GN-z11',
    aliases: ['[OBV2016] GN-z11'],
    kind: 'high-z-galaxy',
    ra: 189.106054,
    dec: 62.242049,
    posRef: 'SIMBAD (2025MNRAS.542.1952M)',
    zHelio: {
      value: 10.603,
      ref: 'Bunker et al. 2023, A&A 677, A88 (JWST/NIRSpec; arXiv:2302.07256)',
      note: 'Discovered by Oesch et al. 2016 (ApJ 819, 129) with an HST grism redshift of 11.09.',
    },
    morphology: { type: 'compact star-forming galaxy', class: 'high-z', ref: 'Tacchella et al. 2023, ApJ 952, 74' },
  },
  {
    id: 'jades-gs-z14-0',
    name: 'JADES-GS-z14-0',
    aliases: [],
    kind: 'high-z-galaxy',
    ra: 53.082937,
    dec: -27.855632,
    posRef: 'SIMBAD (2025MNRAS.542.1952M)',
    zHelio: {
      value: 14.1796,
      err: 0.0007,
      ref: 'Carniani et al. 2025, A&A 696, A87 (ALMA [OIII] 88 micron; arXiv:2409.20533). Schouws et al. 2025, ApJ (arXiv:2409.20549) find 14.1793 +/- 0.0007',
      note: 'Discovered by Carniani et al. 2024, Nature 633, 318 (JWST/NIRSpec prism, z = 14.32 +0.08 -0.20). Record holder from May 2024 until MoM-z14.',
    },
    morphology: { type: 'extended, luminous star-forming galaxy', class: 'high-z', ref: 'Carniani et al. 2024, Nature 633, 318' },
  },
  {
    id: 'mom-z14',
    name: 'MoM-z14',
    aliases: [],
    kind: 'high-z-galaxy',
    record: true,
    ra: 150.0933255,
    dec: 2.2731627,
    posRef: 'Naidu et al. 2026, table 1',
    zHelio: {
      value: 14.44,
      err: 0.02,
      ref: 'Naidu, Oesch et al. 2026, The Open Journal of Astrophysics 9, doi:10.33232/001c.156033 (arXiv:2505.11263): JWST/NIRSpec prism, Lyman break plus rest-UV lines',
      note: 'Most distant spectroscopically confirmed galaxy known on 2026-09-25 (checked against the literature and news up to that date).',
    },
    morphology: { type: 'compact, luminous (M_UV = -20.2) star-forming galaxy', class: 'high-z', ref: 'Naidu et al. 2026' },
  },
];

// RC3 rows for the big galaxies (VizieR VII/155), cached.
const RC3_FILE = `${RAW}/rc3_named.json`;
let rc3 = existsSync(RC3_FILE) ? JSON.parse(readFileSync(RC3_FILE, 'utf8')) : {};
for (const o of NAMED.filter((x) => x.kind === 'galaxy')) {
  if (rc3[o.id]) continue;
  const url =
    'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII/155/rc3&-out=name,altname,PGC,type,T,D25,R25,PA,BT,Ag' +
    `&-c=${o.ra}%20${o.dec >= 0 ? '%2B' : ''}${o.dec}&-c.rs=120&-sort=_r&-out.max=1`;
  const text = await (await fetch(url)).text();
  const rows = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const head = rows[0].split('\t').map((s) => s.trim());
  const cells = rows[3].split('\t').map((s) => s.trim());
  rc3[o.id] = Object.fromEntries(head.map((h, i) => [h, cells[i]]));
}
writeFileSync(RC3_FILE, JSON.stringify(rc3, null, 1));

// Cosmicflows-4 index into cosmic-web.bin.gz: pgc -> [row, group]
const cwIndex = JSON.parse(readFileSync(`${RAW}/cosmic-web-index.json`, 'utf8'));
const groupRanges = new Map();
for (const [, [i, g]] of Object.entries(cwIndex)) {
  const r = groupRanges.get(g);
  if (!r) groupRanges.set(g, [i, i]);
  else {
    r[0] = Math.min(r[0], i);
    r[1] = Math.max(r[1], i);
  }
}

function describe(o) {
  const u = unit(o.ra, o.dec);
  const [l, b] = lonLat(eqToGal(u));
  const [elon, elat] = lonLat(eqToEcl(u));
  const out = {
    id: o.id,
    name: o.name,
    aliases: o.aliases,
    kind: o.kind,
    ...(o.record ? { recordHolder: true } : {}),
    ra: o.ra,
    dec: o.dec,
    positionRef: o.posRef,
    galactic: { l: r4(l), b: r4(b) },
    ecliptic: { lon: r4(elon), lat: r4(elat) },
    morphology: o.morphology,
  };
  let zh = null;
  if (o.vHelio) {
    out.vHelio = o.vHelio;
    zh = o.vHelio.value / C_KM_S; // cz convention used by the sources
  }
  if (o.zHelio) {
    out.zHelio = o.zHelio;
    zh = o.zHelio.value;
  }
  if (zh != null && !o.local) {
    out.zCmb = r6(zHelioToCmb(zh, o.ra, o.dec));
  }
  // Distance: measured where available (luminosity distance from a distance modulus), else from z.
  let dL = null;
  if (o.distance) {
    const d = { ...o.distance };
    if (d.mpc == null && d.dmod != null) d.mpc = r6(10 ** ((d.dmod - 25) / 5));
    if (d.dmod == null && d.mpc != null) d.dmod = r4(5 * Math.log10(d.mpc) + 25);
    out.distance = d;
    dL = d.mpc;
  }
  const zc = out.zCmb ?? zh;
  if (zc != null && zc > 0.01) {
    out.cosmology = cosmo(zc);
  }
  // Position: heliocentric ecliptic J2000, in Mpc. Measured distance (converted to comoving with the
  // CMB-frame redshift where z > 0) or, for objects without one, the comoving distance from z.
  let dc = null;
  let basis = null;
  if (dL != null && o.local) {
    // Bound to the Local Group: not carried by the Hubble flow, so the measured distance is used as it is.
    dc = dL;
    basis = 'measured distance (bound to the Local Group: no expansion correction)';
  } else if (dL != null) {
    dc = out.zCmb != null && out.zCmb > 0 ? dL / (1 + out.zCmb) : dL;
    basis = out.zCmb != null && out.zCmb > 0 ? 'measured distance / (1 + z_cmb)' : 'measured distance';
  } else if (out.cosmology) {
    dc = out.cosmology.comovingDistanceMpc;
    basis = 'comoving distance from z_cmb (Planck 2018 flat Lambda-CDM)';
  }
  if (dc != null) {
    out.positionEclMpc = vec6(scale(eqToEcl(u), dc));
    out.positionBasis = basis;
  }
  if (o.disc) {
    const d = o.disc;
    const or = discOrientation(o.ra, o.dec, d);
    out.disc = {
      inclination: d.inclination,
      ...(d.recedingPA != null ? { recedingPA: d.recedingPA } : { majorAxisPA: d.pa }),
      nearSidePA: d.nearSidePA,
      ...(d.rotationOnSky ? { rotationOnSky: d.rotationOnSky } : {}),
      ...(d.approximate ? { approximate: true } : {}),
      ref: d.ref,
      note: d.note,
      axesEcl: {
        major: vec6(eqToEcl(or.major)),
        minor: vec6(eqToEcl(or.minor)),
        normal: vec6(eqToEcl(or.normal)),
        spin: or.spin ? vec6(eqToEcl(or.spin)) : null,
      },
      normalGalactic: (() => {
        const [ll, bb] = lonLat(eqToGal(or.normal));
        return { l: r3(ll), b: r3(bb) };
      })(),
      spinGalactic: or.spin
        ? (() => {
            const [ll, bb] = lonLat(eqToGal(or.spin));
            return { l: r3(ll), b: r3(bb) };
          })()
        : null,
      nearSideAssumed: or.nearSideAssumed,
    };
  }
  const rc = rc3[o.id];
  if (rc && rc.D25) {
    const d25 = 0.1 * 10 ** Number(rc.D25); // arcmin
    const ba = rc.R25 ? 10 ** -Number(rc.R25) : null;
    out.size = {
      d25Arcmin: r3(d25),
      axisRatio: r3(ba),
      pa: rc.PA ? Number(rc.PA) : null,
      bT: rc.BT ? Number(rc.BT) : null,
      aG: rc.Ag ? Number(rc.Ag) : null,
      ref: 'RC3 (de Vaucouleurs et al. 1991), VizieR VII/155; D25 is the B = 25 mag/arcsec^2 isophotal diameter',
    };
    if (dL != null) {
      out.size.r25Kpc = r3(1000 * dL * Math.tan((d25 / 2 / 60) * DEG));
      if (rc.BT && rc.Ag) out.size.absMagB = r3(Number(rc.BT) - Number(rc.Ag) - (5 * Math.log10(dL) + 25));
    }
  }
  // Cosmicflows-4 cross-reference into public/data/cosmic-web.bin.gz
  const cw = o.pgc != null ? cwIndex[o.pgc] : null;
  if (cw) out.cosmicWeb = { index: cw[0], groupPgc: cw[1] };
  if (o.cf4Group != null && groupRanges.has(o.cf4Group)) {
    const [a, b] = groupRanges.get(o.cf4Group);
    out.cosmicWeb = { groupPgc: o.cf4Group, members: { first: a, count: b - a + 1 } };
  }
  return out;
}

const named = NAMED.map(describe);

// ------------------------------------------------------------------------------------------------
// Local galaxies: LVDB dwarfs within 3 Mpc plus M31 and M33; the LMC and SMC get the modern distances
// and disc geometry of their named entries.

const BIG = { lmc: 'lmc', smc: 'smc' };
// Local Group zero-velocity surface: radius 0.96 Mpc about the barycentre at 0.55 of the way from the
// Milky Way to M31 (Karachentsev et al. 2009, MNRAS 393, 1265), the same rule as staging/cosmology/policy.ts.
const M31_ECL_KPC = scale(eqToEcl(unit(10.68470833, 41.26875)), M31_KPC);
const LG_BARY_KPC = scale(M31_ECL_KPC, 0.55);
const subgroupOf = (host, posEclKpc) => {
  if (host === 'mw' || host === 'lmc' || host === 'smc') return 'MW';
  if (host === 'm_031' || host === 'm_033') return 'M31';
  const dx = posEclKpc.map((c, k) => c - LG_BARY_KPC[k]);
  return Math.hypot(...dx) <= 960 ? 'LG' : 'nearby';
};
const localOut = [];
const addLocal = (g, nd) => {
  const u = unit(g.ra, g.dec);
  const dKpc = nd?.distance?.mpc != null ? nd.distance.mpc * 1000 : g.distanceKpc;
  const [l, b] = lonLat(eqToGal(u));
  const posEcl = scale(eqToEcl(u), dKpc);
  const out = {
    id: nd ? nd.id : g.id,
    name: nd ? nd.name : g.name,
    catalogueName: g.catalogueName,
    ...(nd ? { aliases: nd.aliases } : {}),
    subgroup: g.subgroup ?? subgroupOf(g.host, posEcl),
    morphology: nd ? nd.morphology.type : g.morphology,
    class: nd ? nd.morphology.class : g.class,
    ...(g.ambiguous ? { ambiguous: true } : {}),
    ra: g.ra,
    dec: g.dec,
    l: r4(l),
    b: r4(b),
    distanceKpc: r3(dKpc),
    dmod: nd?.distance?.dmod ?? g.dmod,
    dmodErr: nd?.distance?.dmodErr != null ? [nd.distance.dmodErr, nd.distance.dmodErr] : g.dmodErr,
    distanceRef: nd ? nd.distance.ref : g.distanceRef,
    positionEclKpc: vec6(posEcl).map(r4),
  };
  const put = (k, v) => {
    if (v != null && !(Array.isArray(v) && v.every((x) => x == null))) out[k] = v;
  };
  put('vHelio', g.vHelio);
  put('vHelioErr', g.vHelioErr);
  put('vmag', g.vmag);
  if (g.vmag != null && out.dmod != null) {
    const MV = nd ? g.vmag - out.dmod : g.absMagV ?? g.vmag - out.dmod;
    out.absMagV = r3(MV);
    out.lumV = Number((10 ** (-0.4 * (MV - 4.83))).toPrecision(4));
  }
  put('pa', g.pa);
  put('ellipticity', g.ellipticity);
  if (g.rhArcmin != null) {
    out.rhArcmin = g.rhArcmin;
    out.rhPc = r3(dKpc * 1000 * Math.tan((g.rhArcmin / 60) * DEG));
  }
  put('muVHalf', g.muVHalf);
  put('sigmaStar', g.sigmaStar);
  put('mHI', g.mHI);
  put('feh', g.feh);
  put('fehType', g.fehType);
  const src = NAMED.find((x) => x.id === nd?.id);
  if (g.pmra == null && src?.pm) {
    g = { ...g, pmra: src.pm.pmra, pmdec: src.pm.pmdec, pmraErr: null, pmdecErr: null, pmRef: src.pm.ref };
  }
  if (g.pmra != null && g.pmdec != null && g.vHelio != null) {
    out.pmra = g.pmra;
    out.pmdec = g.pmdec;
    if (g.pmraErr) out.pmraErr = g.pmraErr;
    if (g.pmdecErr) out.pmdecErr = g.pmdecErr;
    out.pmRef = g.pmRef;
    const { r, e, n } = skyBasis(g.ra, g.dec);
    const v = add(scale(r, g.vHelio), scale(add(scale(e, g.pmra), scale(n, g.pmdec)), K_PM * dKpc));
    out.velocityHelioEclKmS = eqToEcl(v).map((c) => Math.round(c * 10) / 10);
  }
  if (nd) {
    if (nd.disc) out.disc = nd.disc;
    if (nd.size) out.size = nd.size;
    if (nd.cosmicWeb) out.cosmicWeb = nd.cosmicWeb;
  }
  if (g.refs?.length) out.refs = g.refs;
  localOut.push(out);
};

for (const g of local) {
  const nd = BIG[g.key] ? named.find((x) => x.id === BIG[g.key]) : null;
  addLocal(g, nd);
}
// M31 and M33 are hosts, not dwarfs, so the LVDB dwarf tables do not list them: build their rows from the
// named entries (Cepheid distances of Li et al. 2021 and Breuval et al. 2023).
for (const [id, catName] of [
  ['andromeda', 'Andromeda (M31), from the named-galaxy entry'],
  ['triangulum', 'Triangulum (M33), from the named-galaxy entry'],
]) {
  const nd = named.find((x) => x.id === id);
  addLocal(
    {
      id,
      name: nd.name,
      catalogueName: catName,
      subgroup: 'M31',
      ra: nd.ra,
      dec: nd.dec,
      vHelio: nd.vHelio.value,
      vHelioErr: [nd.vHelio.err, nd.vHelio.err],
      refs: [],
    },
    nd,
  );
}
localOut.sort((a, b) => a.distanceKpc - b.distanceKpc);

const usedRefs = [...new Set(localOut.flatMap((g) => g.refs || []))].sort();

const frames = {
  positions: 'heliocentric, J2000 ecliptic axes (x to the March equinox, z to the ecliptic north pole)',
  eqToEcl: 'v_ecl = R_x(+eps) v_icrs with eps = 84381.448 arcsec',
  appWorld: 'world = (x_ecl, z_ecl, -y_ecl)',
  radec: 'ICRS (J2000), degrees',
};

const localDoc = {
  format: 'lightspeed-local-galaxies',
  version: 1,
  generated: BUILD_DATE,
  description:
    'Galaxies of the Local Group and its surroundings out to 3 Mpc: every confirmed dwarf galaxy (and dwarf-galaxy candidate that may be a star cluster, flagged ambiguous) within 3 Mpc in the Local Volume Database v1.1.1, plus M31 and M33. The LMC, SMC, M31 and M33 carry the modern distances and disc angles cited in their rows. Satellites of M31 measured by Savino et al. (2022) are scaled to M31 at 761 kpc (see distanceRef). The render class of the dwarfs comes from their neutral-gas content (morphology says how), because the database lists no morphological types.',
  credit:
    'This work has made use of the Local Volume Database (https://github.com/apace7/local_volume_database; Pace 2025, The Open Journal of Astrophysics 8, 142), release v1.1.1, CC0 1.0; each value cites its paper (refs, as author + ADS bibcode). Big-galaxy distances and disc angles: see each row. Sizes: RC3 (de Vaucouleurs et al. 1991).',
  licence: 'CC0 1.0 (Local Volume Database); the rows built from the named entries carry their own citations',
  frames,
  units: {
    ra: 'deg',
    dec: 'deg',
    l: 'deg',
    b: 'deg',
    distanceKpc: 'kpc',
    positionEclKpc: 'kpc',
    vHelio: 'km/s',
    pmra: 'mas/yr (mu_alpha* = mu_alpha cos dec)',
    pmdec: 'mas/yr',
    velocityHelioEclKmS: 'km/s, heliocentric (includes the reflex of the solar motion)',
    vmag: 'mag, V, corrected for foreground extinction',
    absMagV: 'mag (vmag - dmod)',
    lumV: 'L_sun in V (M_V,sun = 4.83)',
    rhArcmin: 'arcmin, half-light (or Plummer) radius along the major axis',
    rhPc: 'pc',
    pa: 'deg east of north',
    ellipticity: '1 - b/a',
    muVHalf: 'mag/arcsec^2, mean V surface brightness within the half-light radius',
    mHI: '10^6 M_sun (neutral hydrogen)',
    sigmaStar: 'km/s, line-of-sight velocity dispersion',
    feh: 'dex ([Fe/H]; fehType says spectroscopic or photometric)',
  },
  referencesNote:
    'refs are LVDB reference keys (first author + year + ADS bibcode); references maps each to its ADS bibcode, https://ui.adsabs.harvard.edu/abs/<bibcode>.',
  references: Object.fromEntries(usedRefs.map((k) => [k, LVDB_BIBCODE(k)])),
  galaxies: localOut,
};

const namedDoc = {
  format: 'lightspeed-named-extragalactic',
  version: 1,
  generated: BUILD_DATE,
  description:
    'Named galaxies, clusters and redshift-record galaxies used by the Learn articles. Values carry their sources; derived quantities (positions, CMB-frame redshifts, cosmological distances and times, disc axes) are computed by scripts/build-local-galaxies.mjs.',
  frames: {
    ...frames,
    positionsUnit: 'Mpc',
    disc:
      'axesEcl: unit vectors in the ecliptic frame. major = in-plane major axis (toward the receding end when known); minor = in-plane minor axis toward the side at PA+90 deg; normal = disc normal on the observer side; spin = angular-momentum direction (null if the rotation sense is unknown). If nearSideAssumed is true the plane could also be its mirror image in the sky plane.',
  },
  cosmology: {
    model: 'flat Lambda-CDM, Planck 2018 (TT,TE,EE+lowE+lensing+BAO)',
    H0: H0,
    OmegaM: OMEGA_M,
    OmegaR: Number(OMEGA_R.toPrecision(6)),
    OmegaL: Number(OMEGA_L.toPrecision(8)),
    TcmbK: T_CMB,
    Neff: N_EFF,
    ageGyr: r4(ageGyr(0)),
    ref: 'Planck Collaboration 2020, A&A 641, A6',
  },
  cmbDipole: {
    speedKmS: DIPOLE_V,
    l: 264.021,
    b: 48.253,
    ref: 'Planck Collaboration 2020, A&A 641, A1',
    zCmbFormula: '1 + z_cmb = (1 + z_helio) * gamma * (1 + beta cos theta)',
  },
  redshiftRecord: {
    asOf: BUILD_DATE,
    id: 'mom-z14',
    z: 14.44,
    previous: { id: 'jades-gs-z14-0', z: 14.1796 },
  },
  objects: named,
};

mkdirSync('public/data', { recursive: true });
mkdirSync('staging/cosmos', { recursive: true });
const localJson = JSON.stringify(localDoc);
writeFileSync(OUT_LOCAL, gzipSync(Buffer.from(localJson), { level: 9 }));
writeFileSync(OUT_NAMED, `${JSON.stringify(namedDoc, null, 2)}\n`);
console.log(
  `${OUT_LOCAL}: ${localOut.length} galaxies, ${localJson.length} bytes JSON, ${gzipSync(Buffer.from(localJson), { level: 9 }).length} gzipped`,
);
console.log(`${OUT_NAMED}: ${named.length} objects`);
const bySub = {};
for (const g of localOut) bySub[g.subgroup] = (bySub[g.subgroup] ?? 0) + 1;
const byClass = {};
for (const g of localOut) byClass[g.class] = (byClass[g.class] ?? 0) + 1;
console.log(`local galaxies by subgroup ${JSON.stringify(bySub)}, by class ${JSON.stringify(byClass)}; Savino-scaled M31 satellites ${local.filter((g) => g.distanceRef?.includes('scaled')).length}; ambiguous ${localOut.filter((g) => g.ambiguous).length}`);
