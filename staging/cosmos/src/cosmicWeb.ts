// Decoder and distance helpers for public/data/cosmic-web.bin.gz (built by
// scripts/build-cosmic-web.mjs from Cosmicflows-4, Tully et al. 2023, CC BY 4.0, with 2MASS Ks).
// Layout: see staging/cosmos/cosmos.md, "cosmic-web.bin.gz". All multi-byte values little-endian.

import { dmToComovingMpc, C_KM_S, makeDistanceTable, PLANCK18, type Cosmology } from './cosmology.ts';
import { ICRS_TO_ECL, apply, raDecToUnit, type Vec3 } from './frames.ts';
import { fetchGzipped } from './gz.ts';

export const COSMIC_WEB_MAGIC = 'LSCW';
export const NO_VELOCITY = -32768;
export const NO_BYTE = 255;

/** Bits of the `methods` column: which distance methods fed the galaxy's distance modulus. */
export const METHOD = {
  snIa: 1,
  tullyFisher: 2,
  fundamentalPlane: 4,
  sbf: 8,
  snII: 16,
  trgb: 32,
  cepheids: 64,
  maser: 128,
} as const;

export interface CosmicWeb {
  count: number;
  /** ICRS right ascension, deg. */
  ra: Float32Array;
  /** ICRS declination, deg. */
  dec: Float32Array;
  /** CMB-frame velocity cz of the galaxy, km/s; NO_VELOCITY if unknown. */
  vcmb: Int16Array;
  /** CMB-frame velocity of the galaxy's group, km/s; NO_VELOCITY if none. */
  vgroup: Int16Array;
  /** Distance modulus x 1000 (0 = none). */
  dm: Uint16Array;
  /** Group distance modulus x 1000 (0 = none). */
  dmgroup: Uint16Array;
  /** 2MASS Ks total magnitude x 1000 (0 = no 2MASS match). Not corrected for Galactic extinction. */
  ks: Uint16Array;
  /** Uncertainty of dm x 100 (mag). */
  edm: Uint8Array;
  /** Uncertainty of dmgroup x 100 (mag). */
  edmgroup: Uint8Array;
  methods: Uint8Array;
  /** 2MASS b/a x 100, NO_BYTE if unknown. */
  axisratio: Uint8Array;
  /** 2MASS major-axis position angle, deg east of north in [0, 180), NO_BYTE if unknown. */
  pa: Uint8Array;
}

const COLUMNS = [
  ['ra', Float32Array],
  ['dec', Float32Array],
  ['vcmb', Int16Array],
  ['vgroup', Int16Array],
  ['dm', Uint16Array],
  ['dmgroup', Uint16Array],
  ['ks', Uint16Array],
  ['edm', Uint8Array],
  ['edmgroup', Uint8Array],
  ['methods', Uint8Array],
  ['axisratio', Uint8Array],
  ['pa', Uint8Array],
] as const;

/** Decode the (already gunzipped) file. Views share the buffer; on a little-endian host (every
 * browser in practice) no copy is made. */
export function decodeCosmicWeb(buffer: ArrayBuffer): CosmicWeb {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== COSMIC_WEB_MAGIC) throw new Error(`not a cosmic-web file (magic ${magic})`);
  const version = dv.getUint16(4, true);
  if (version !== 1) throw new Error(`unsupported cosmic-web version ${version}`);
  const count = dv.getUint32(8, true);
  const ncol = dv.getUint32(12, true);
  if (ncol !== COLUMNS.length) throw new Error(`expected ${COLUMNS.length} columns, found ${ncol}`);
  const littleEndianHost = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const out: Record<string, unknown> = { count };
  COLUMNS.forEach(([name, T], i) => {
    const offset = dv.getUint32(16 + 4 * i, true);
    if (littleEndianHost || T.BYTES_PER_ELEMENT === 1) {
      out[name] = new T(buffer, offset, count);
    } else {
      const arr = new T(count);
      for (let k = 0; k < count; k++) {
        const p = offset + k * T.BYTES_PER_ELEMENT;
        (arr as Float32Array)[k] =
          T === Float32Array ? dv.getFloat32(p, true) : T === Int16Array ? dv.getInt16(p, true) : dv.getUint16(p, true);
      }
      out[name] = arr;
    }
  });
  return out as unknown as CosmicWeb;
}

/** Fetch and decode (browser or Node >= 18). Vercel serves the .gz as-is, so we gunzip here. */
export async function loadCosmicWeb(url = '/data/cosmic-web.bin.gz'): Promise<CosmicWeb> {
  return decodeCosmicWeb(await fetchGzipped(url));
}

// ---------------------------------------------------------------------------------------------
// Per-galaxy quantities

export const hasVelocity = (cw: CosmicWeb, i: number): boolean => cw.vcmb[i] !== NO_VELOCITY;
export const distanceModulus = (cw: CosmicWeb, i: number): number => (cw.dm[i] ? cw.dm[i] / 1000 : NaN);
export const groupDistanceModulus = (cw: CosmicWeb, i: number): number =>
  cw.dmgroup[i] ? cw.dmgroup[i] / 1000 : NaN;
export const ksMagnitude = (cw: CosmicWeb, i: number): number => (cw.ks[i] ? cw.ks[i] / 1000 : NaN);
/** CMB-frame redshift z = cz/c of the galaxy (NaN if unknown). */
export const zCmb = (cw: CosmicWeb, i: number): number => (hasVelocity(cw, i) ? cw.vcmb[i] / C_KM_S : NaN);
export const zGroup = (cw: CosmicWeb, i: number): number =>
  cw.vgroup[i] !== NO_VELOCITY ? cw.vgroup[i] / C_KM_S : zCmb(cw, i);

/**
 * How to place a galaxy along its line of sight:
 *   'measured'        its own distance modulus (CF4 DM): true positions, but single-galaxy errors
 *                     are 15-25 % for Tully-Fisher and Fundamental Plane distances.
 *   'group'           its group's distance modulus (CF4 DMzp): errors averaged over members; the
 *                     members of a group share one distance.
 *   'redshift'        comoving distance from the galaxy's CMB-frame redshift (Planck 2018): smooth
 *                     structure but "fingers of God" in clusters, and wrong inside ~30 Mpc where
 *                     peculiar velocities are comparable to the Hubble flow.
 *   'group-redshift'  comoving distance from the group's redshift: fingers of God collapsed.
 *   'recommended'     'group' inside 30 Mpc (by the group distance), 'group-redshift' beyond.
 * The first two are measured (model-independent up to the distance-ladder calibration, which
 * corresponds to H0 ~ 75 km/s/Mpc); the redshift modes assume Planck 2018 (H0 = 67.66), so the two
 * scales differ by ~10 % at large distance: the Hubble tension.
 */
export type DistanceMode = 'measured' | 'group' | 'redshift' | 'group-redshift' | 'recommended';

export const RECOMMENDED_SWITCH_MPC = 30;

export function makeDistanceFn(cosmology: Cosmology = PLANCK18) {
  const table = makeDistanceTable(1, 4096, cosmology);
  return function comovingMpc(cw: CosmicWeb, i: number, mode: DistanceMode = 'recommended'): number {
    switch (mode) {
      case 'measured':
        return dmToComovingMpc(distanceModulus(cw, i), Math.max(0, zCmb(cw, i) || 0));
      case 'group': {
        const dm = groupDistanceModulus(cw, i);
        return Number.isFinite(dm) ? dmToComovingMpc(dm, Math.max(0, zGroup(cw, i) || 0)) : comovingMpc(cw, i, 'measured');
      }
      case 'redshift': {
        const z = zCmb(cw, i);
        return z > 0 ? table.comovingMpc(z) : NaN;
      }
      case 'group-redshift': {
        const z = zGroup(cw, i);
        return z > 0 ? table.comovingMpc(z) : NaN;
      }
      case 'recommended': {
        const g = comovingMpc(cw, i, 'group');
        if (g < RECOMMENDED_SWITCH_MPC) return g;
        const r = comovingMpc(cw, i, 'group-redshift');
        return Number.isFinite(r) ? r : g;
      }
    }
  };
}

/** Heliocentric ecliptic (J2000) position in Mpc for a given line-of-sight distance. */
export function positionEcl(cw: CosmicWeb, i: number, distanceMpc: number): Vec3 {
  const u = apply(ICRS_TO_ECL, raDecToUnit(cw.ra[i], cw.dec[i]));
  return [u[0] * distanceMpc, u[1] * distanceMpc, u[2] * distanceMpc];
}

/**
 * Fill a Float32Array (3 per galaxy) with app-world positions (world = (x_ecl, z_ecl, -y_ecl)) in
 * the given unit (Mpc by default). Galaxies without a usable distance get NaN.
 */
export function worldPositions(
  cw: CosmicWeb,
  mode: DistanceMode = 'recommended',
  unitPerMpc = 1,
  cosmology: Cosmology = PLANCK18,
): Float32Array {
  const dist = makeDistanceFn(cosmology);
  const out = new Float32Array(cw.count * 3);
  const ce = ICRS_TO_ECL[1][1];
  const se = ICRS_TO_ECL[1][2];
  const D = Math.PI / 180;
  for (let i = 0; i < cw.count; i++) {
    const d = dist(cw, i, mode) * unitPerMpc;
    const a = cw.ra[i] * D;
    const b = cw.dec[i] * D;
    const x = Math.cos(b) * Math.cos(a);
    const y = Math.cos(b) * Math.sin(a);
    const z = Math.sin(b);
    const ye = ce * y + se * z;
    const ze = -se * y + ce * z;
    out[3 * i] = x * d;
    out[3 * i + 1] = ze * d;
    out[3 * i + 2] = -ye * d;
  }
  return out;
}

/**
 * Absolute Ks magnitude from the 2MASS magnitude and a luminosity distance (no K-correction or
 * extinction correction; both are < 0.1 mag for z < 0.1 and |b| > 10 deg).
 */
export const absoluteKs = (ks: number, luminosityDistanceMpc: number): number =>
  ks - (5 * Math.log10(luminosityDistanceMpc) + 25);

/**
 * Runs of consecutive rows sharing a group (rows are sorted so that group members are contiguous).
 * A group is identified by its (vgroup, dmgroup) pair.
 */
export function groupRuns(cw: CosmicWeb): Array<{ first: number; count: number }> {
  const runs: Array<{ first: number; count: number }> = [];
  let first = 0;
  for (let i = 1; i <= cw.count; i++) {
    if (
      i === cw.count ||
      cw.vgroup[i] !== cw.vgroup[first] ||
      cw.dmgroup[i] !== cw.dmgroup[first] ||
      cw.dmgroup[first] === 0
    ) {
      runs.push({ first, count: i - first });
      first = i;
    }
  }
  return runs;
}

