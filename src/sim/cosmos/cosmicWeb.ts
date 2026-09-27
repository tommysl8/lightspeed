/**
 * The cosmic web: 55,877 galaxies with measured distances from Cosmicflows-4 (Tully et al. 2023,
 * ApJ 944, 94, CC BY 4.0), with 2MASS Ks magnitudes, axis ratios and position angles
 * (public/data/cosmic-web.bin.gz, built by scripts/build-cosmic-web.mjs; docs/data/cosmos.md).
 * The decoder, the ways to place a galaxy along its line of sight, and the arrays the GPU takes.
 * All multi-byte values in the file are little-endian.
 */
import { C_KM_S } from '../../physics/constants';
import { dmToComovingMpc, dmToMpc, type Cosmology } from './cosmology';
import { ICRS_TO_ECL, type Vec3 } from './frames';

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
  /** CMB-frame velocity of its group, km/s; NO_VELOCITY if none. */
  vgroup: Int16Array;
  /** Distance modulus × 1000 (0: none). */
  dm: Uint16Array;
  /** Group distance modulus × 1000 (0: none). */
  dmgroup: Uint16Array;
  /** 2MASS Ks total magnitude × 1000 (0: no 2MASS match). Not corrected for Galactic extinction. */
  ks: Uint16Array;
  /** Uncertainty of dm × 100 (mag). */
  edm: Uint8Array;
  /** Uncertainty of dmgroup × 100 (mag). */
  edmgroup: Uint8Array;
  methods: Uint8Array;
  /** 2MASS b/a × 100, NO_BYTE if unknown. */
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

/**
 * Decode the (inflated) file. The columns view the buffer (every browser is little-endian); on a
 * big-endian host they are copied.
 */
export function decodeCosmicWeb(buffer: ArrayBuffer): CosmicWeb {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== COSMIC_WEB_MAGIC) throw new Error(`not a cosmic-web file (magic ${magic})`);
  const version = dv.getUint16(4, true);
  if (version !== 1) throw new Error(`unsupported cosmic-web version ${version}`);
  const count = dv.getUint32(8, true);
  const ncol = dv.getUint32(12, true);
  if (ncol !== COLUMNS.length) throw new Error(`expected ${COLUMNS.length} columns, found ${ncol}`);
  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const out: Record<string, unknown> = { count };
  COLUMNS.forEach(([name, T], i) => {
    const offset = dv.getUint32(16 + 4 * i, true);
    if (littleEndian || T.BYTES_PER_ELEMENT === 1) {
      out[name] = new T(buffer, offset, count);
      return;
    }
    const arr = new T(count);
    for (let k = 0; k < count; k++) {
      const p = offset + k * T.BYTES_PER_ELEMENT;
      arr[k] = T === Float32Array ? dv.getFloat32(p, true) : T === Int16Array ? dv.getInt16(p, true) : dv.getUint16(p, true);
    }
    out[name] = arr;
  });
  return out as unknown as CosmicWeb;
}

// ─── Per-galaxy quantities ───────────────────────────────────────────────────────────────

export const hasVelocity = (cw: CosmicWeb, i: number): boolean => cw.vcmb[i] !== NO_VELOCITY;
export const distanceModulus = (cw: CosmicWeb, i: number): number => (cw.dm[i] ? cw.dm[i] / 1000 : NaN);
export const groupDistanceModulus = (cw: CosmicWeb, i: number): number => (cw.dmgroup[i] ? cw.dmgroup[i] / 1000 : NaN);
export const ksMagnitude = (cw: CosmicWeb, i: number): number => (cw.ks[i] ? cw.ks[i] / 1000 : NaN);
/** CMB-frame redshift z = cz / c of the galaxy (NaN if unknown). */
export const zCmb = (cw: CosmicWeb, i: number): number => (hasVelocity(cw, i) ? cw.vcmb[i] / C_KM_S : NaN);
export const zGroup = (cw: CosmicWeb, i: number): number => (cw.vgroup[i] !== NO_VELOCITY ? cw.vgroup[i] / C_KM_S : zCmb(cw, i));

/**
 * How to place a galaxy along its line of sight:
 *   'measured'        its own distance modulus: true places, but single Tully–Fisher and Fundamental
 *                     Plane distances are 15–25 % uncertain.
 *   'group'           its group's distance modulus: errors averaged over the members, who share it.
 *   'redshift'        comoving distance of its CMB-frame redshift (Planck 2018): smooth, but with the
 *                     "fingers of God" in clusters, and wrong inside ~30 Mpc, where peculiar
 *                     velocities rival the expansion.
 *   'group-redshift'  comoving distance of its group's redshift: the fingers collapsed.
 *   'recommended'     'group' inside 30 Mpc (by the group distance), 'group-redshift' beyond 60, and
 *                     between the two blended smoothly, the measured distance brought to the Planck
 *                     scale as the blend goes (so there is no empty shell where the scales meet).
 * The first two are measured (their zero point corresponds to H0 = 74.6 km/s/Mpc, Tully et al. 2023);
 * the redshift modes assume Planck 2018 (H0 = 67.66), so the two scales differ by about 10 %: the
 * Hubble tension. Switching from one to the other at 30 Mpc would leave a shell about 3 Mpc deep empty.
 */
export type DistanceMode = 'measured' | 'group' | 'redshift' | 'group-redshift' | 'recommended';

export const RECOMMENDED_SWITCH_MPC = 30;
/** …and blends into the redshift distances by here (Mpc). */
export const RECOMMENDED_BLEND_END_MPC = 60;
/** Cosmicflows-4's own Hubble constant, km/s/Mpc (Tully et al. 2023, ApJ 944, 94: 74.6 ± 0.8), the scale of its measured distances. */
export const CF4_H0 = 74.6;

/** A function placing galaxy i at its comoving distance, Mpc, in a mode (NaN where it has none). */
export function makeDistanceFn(cosmo: Cosmology) {
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
        return z > 0 ? cosmo.comovingDistanceMpc(z) : NaN;
      }
      case 'group-redshift': {
        const z = zGroup(cw, i);
        return z > 0 ? cosmo.comovingDistanceMpc(z) : NaN;
      }
      case 'recommended': {
        const g = comovingMpc(cw, i, 'group');
        if (g < RECOMMENDED_SWITCH_MPC) return g;
        const r = comovingMpc(cw, i, 'group-redshift');
        if (!Number.isFinite(r)) return g;
        if (!(g < RECOMMENDED_BLEND_END_MPC)) return r;
        // Across the blend the measured distance goes over to the Planck scale (×74.6/67.66) as its weight goes to the redshift's.
        const t = (g - RECOMMENDED_SWITCH_MPC) / (RECOMMENDED_BLEND_END_MPC - RECOMMENDED_SWITCH_MPC);
        const w = t * t * (3 - 2 * t);
        return (1 - w) * g * (1 + w * (CF4_H0 / cosmo.params.H0 - 1)) + w * r;
      }
    }
  };
}

/**
 * App-world positions (world = (x_ecl, z_ecl, −y_ecl)), 3 per galaxy, in Mpc (comoving), in one
 * mode. Galaxies without a usable distance get NaN.
 */
export function worldPositions(cw: CosmicWeb, cosmo: Cosmology, mode: DistanceMode = 'recommended'): Float32Array {
  const dist = makeDistanceFn(cosmo);
  const out = new Float32Array(cw.count * 3);
  const ce = ICRS_TO_ECL[1][1];
  const se = ICRS_TO_ECL[1][2];
  const D = Math.PI / 180;
  for (let i = 0; i < cw.count; i++) {
    const d = dist(cw, i, mode);
    const a = cw.ra[i] * D;
    const b = cw.dec[i] * D;
    const x = Math.cos(b) * Math.cos(a);
    const y = Math.cos(b) * Math.sin(a);
    const z = Math.sin(b);
    out[3 * i] = x * d;
    out[3 * i + 1] = (-se * y + ce * z) * d;
    out[3 * i + 2] = -(ce * y + se * z) * d;
  }
  return out;
}

/**
 * Absolute Ks magnitude from the 2MASS magnitude and a luminosity distance (no K-correction or
 * extinction correction; both are under 0.1 mag for z < 0.1 and |b| > 10°).
 */
export const absoluteKs = (ks: number, luminosityDistanceMpc: number): number => ks - (5 * Math.log10(luminosityDistanceMpc) + 25);

/**
 * What kind of galaxy the distance method says it is: the Fundamental Plane and surface-brightness
 * fluctuations measure elliptical and lenticular galaxies ('early'), the Tully–Fisher relation
 * rotating gas-rich discs, spirals and irregulars ('late'); the rest (supernovae, the tip of the
 * red giant branch, Cepheids, masers) could be either ('other').
 */
export type WebType = 'early' | 'late' | 'other';
export function webType(methods: number): WebType {
  if (methods & (METHOD.fundamentalPlane | METHOD.sbf)) return 'early';
  if (methods & METHOD.tullyFisher) return 'late';
  return 'other';
}
export const WEB_TYPE_CODE: Record<WebType, number> = { early: 0, late: 1, other: 2 };

/**
 * Runs of consecutive rows sharing a group (rows are sorted so that the members of a group are
 * contiguous); a group is its (vgroup, dmgroup) pair.
 */
export function groupRuns(cw: CosmicWeb): { first: number; count: number }[] {
  const runs: { first: number; count: number }[] = [];
  let first = 0;
  for (let i = 1; i <= cw.count; i++) {
    if (i === cw.count || cw.vgroup[i] !== cw.vgroup[first] || cw.dmgroup[i] !== cw.dmgroup[first] || cw.dmgroup[first] === 0) {
      runs.push({ first, count: i - first });
      first = i;
    }
  }
  return runs;
}

// ─── What the GPU takes ──────────────────────────────────────────────────────────────────

/**
 * The cosmic web ready to draw: world positions (Mpc, comoving, 'recommended' distances) and per
 * galaxy its type code and its Ks luminosity relative to a typical bright galaxy, L/L* (L* at
 * M_Ks = −24.2, Kochanek et al. 2001; a galaxy without a Ks magnitude gets the median). Galaxies
 * the app draws as bodies of their own (skip) and those without a distance are left out: `row`
 * gives each drawn point's row in the file.
 */
export interface WebBuffers {
  count: number;
  position: Float32Array;
  /**
   * Per point, its anchor in the expanding universe (Mpc, comoving, world axes): the centre of its
   * group if it has one (groups of galaxies are bound), its own place if not, home (the origin)
   * inside the Local Group. At scale factor a the point is at position + (a − 1) anchor.
   */
  anchor: Float32Array;
  /** Per point: type code (0 early, 1 late, 2 other), log10 L/L* (clamped to ±4). */
  attrs: Float32Array;
  row: Uint32Array;
}

/**
 * Which structures are bound, for the anchors: the Local Group's zero-velocity sphere (world Mpc),
 * and the places of the galaxies and clusters drawn as bodies (world Mpc, comoving), each the
 * anchor of the group its row belongs to, so that a named galaxy and the rest of its group, or a
 * cluster and its members, stay together.
 */
export interface WebBound {
  localGroup: { centre: Vec3; radius: number };
  rowAnchors: { row: number; anchor: Vec3 }[];
  /**
   * Galaxies drawn as bodies of their own that the file does not link to a row (the Local Volume
   * Database's): the rows that are the same galaxy are left out of the points (duplicateRows).
   */
  bodies?: { ra: number; dec: number; mpc: number }[];
}

/** A row within this of a galaxy drawn as a body, on the sky… */
export const DUPLICATE_DEG = 0.05;

/**
 * The rows of the web that are galaxies already drawn as bodies of their own: within DUPLICATE_DEG
 * of one on the sky, and at a like distance (within half its distance, or 2 Mpc), so a background
 * galaxy that happens to lie behind one is kept. `pos` are the rows' places (Mpc).
 */
export function duplicateRows(cw: CosmicWeb, pos: Float32Array, bodies: readonly { ra: number; dec: number; mpc: number }[]): Set<number> {
  const out = new Set<number>();
  if (!bodies.length) return out;
  const D = Math.PI / 180;
  const unit = (ra: number, dec: number): Vec3 => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  const cosMax = Math.cos(DUPLICATE_DEG * D);
  // Bodies in bands of declination as wide as the match, so each row looks at three bands.
  const bands = new Map<number, { u: Vec3; mpc: number }[]>();
  for (const b of bodies) {
    const k = Math.floor(b.dec / DUPLICATE_DEG);
    const list = bands.get(k) ?? [];
    list.push({ u: unit(b.ra, b.dec), mpc: b.mpc });
    bands.set(k, list);
  }
  for (let i = 0; i < cw.count; i++) {
    const k = Math.floor(cw.dec[i] / DUPLICATE_DEG);
    const u = unit(cw.ra[i], cw.dec[i]);
    const d = Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    for (let j = k - 1; j <= k + 1 && !out.has(i); j++) {
      for (const b of bands.get(j) ?? []) {
        if (u[0] * b.u[0] + u[1] * b.u[1] + u[2] * b.u[2] < cosMax) continue;
        if (Number.isFinite(d) && Math.abs(d - b.mpc) > Math.max(2, 0.5 * b.mpc)) continue;
        out.add(i);
        break;
      }
    }
  }
  return out;
}

/**
 * Each row's anchor (Mpc, world axes) from the rows' places `pos` (NaN where none): a group of two
 * or more rows (groupRuns) is anchored at the anchor given for any of its rows, else at the mean
 * place of its members; a row alone at its own place; anything whose anchor falls inside the Local
 * Group at home (the origin).
 */
export function webAnchors(cw: CosmicWeb, pos: Float32Array, bound?: WebBound): Float32Array {
  const out = new Float32Array(cw.count * 3);
  const given = new Map<number, Vec3>();
  for (const r of bound?.rowAnchors ?? []) given.set(r.row, r.anchor);
  const lg = bound?.localGroup;
  const home = (x: number, y: number, z: number) => !!lg && Math.hypot(x - lg.centre[0], y - lg.centre[1], z - lg.centre[2]) <= lg.radius;
  for (const run of groupRuns(cw)) {
    let ax = 0;
    let ay = 0;
    let az = 0;
    let fixed: Vec3 | undefined;
    for (let i = run.first; i < run.first + run.count && !fixed; i++) fixed = given.get(i);
    if (fixed) [ax, ay, az] = fixed;
    else {
      let n = 0;
      for (let i = run.first; i < run.first + run.count; i++) {
        const x = pos[3 * i];
        const y = pos[3 * i + 1];
        const z = pos[3 * i + 2];
        if (!Number.isFinite(x + y + z)) continue;
        ax += x;
        ay += y;
        az += z;
        n++;
      }
      if (n > 0) {
        ax /= n;
        ay /= n;
        az /= n;
      }
    }
    if (home(ax, ay, az)) ax = ay = az = 0;
    for (let i = run.first; i < run.first + run.count; i++) {
      out[3 * i] = ax;
      out[3 * i + 1] = ay;
      out[3 * i + 2] = az;
    }
  }
  return out;
}

/** M_Ks of an L* galaxy (Kochanek et al. 2001, ApJ 560, 566: −23.39 + 5 log h, h = 0.7). */
export const MKS_STAR = -24.2;

export function webBuffers(cw: CosmicWeb, cosmo: Cosmology, skip: ReadonlySet<number> = new Set(), bound?: WebBound): WebBuffers {
  const pos = worldPositions(cw, cosmo, 'recommended');
  const anchors = webAnchors(cw, pos, bound);
  if (bound?.bodies?.length) {
    const dups = duplicateRows(cw, pos, bound.bodies);
    if (dups.size) skip = new Set([...skip, ...dups]);
  }
  const position = new Float32Array(cw.count * 3);
  const anchor = new Float32Array(cw.count * 3);
  const attrs = new Float32Array(cw.count * 2);
  const row = new Uint32Array(cw.count);
  const lum = new Float32Array(cw.count).fill(NaN);
  const known: number[] = [];
  for (let i = 0; i < cw.count; i++) {
    const ks = ksMagnitude(cw, i);
    const d = Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    if (!(d > 0) || !Number.isFinite(ks)) continue;
    const z = Math.max(0, zCmb(cw, i) || 0);
    lum[i] = -0.4 * (absoluteKs(ks, d * (1 + z)) - MKS_STAR);
    known.push(lum[i]);
  }
  known.sort((a, b) => a - b);
  const median = known.length ? known[known.length >> 1] : 0;
  let n = 0;
  for (let i = 0; i < cw.count; i++) {
    if (skip.has(i)) continue;
    const x = pos[3 * i];
    const y = pos[3 * i + 1];
    const z = pos[3 * i + 2];
    if (!Number.isFinite(x + y + z) || x * x + y * y + z * z === 0) continue;
    position[3 * n] = x;
    position[3 * n + 1] = y;
    position[3 * n + 2] = z;
    anchor[3 * n] = anchors[3 * i];
    anchor[3 * n + 1] = anchors[3 * i + 1];
    anchor[3 * n + 2] = anchors[3 * i + 2];
    attrs[2 * n] = WEB_TYPE_CODE[webType(cw.methods[i])];
    attrs[2 * n + 1] = Math.max(-4, Math.min(4, Number.isFinite(lum[i]) ? lum[i] : median));
    row[n] = i;
    n++;
  }
  return { count: n, position: position.slice(0, 3 * n), anchor: anchor.slice(0, 3 * n), attrs: attrs.slice(0, 2 * n), row: row.slice(0, n) };
}

/** The points of a cluster's members (a run of rows of the file) in the drawn buffers: [start, count]. */
export function memberRange(web: Pick<WebBuffers, 'row' | 'count'>, first: number, count: number): [number, number] {
  const lowerBound = (r: number) => {
    let lo = 0;
    let hi = web.count;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (web.row[m] < r) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  const a = lowerBound(first);
  return [a, lowerBound(first + count) - a];
}

export const webTransfer = (b: WebBuffers): ArrayBuffer[] => [b.position.buffer as ArrayBuffer, b.anchor.buffer as ArrayBuffer, b.attrs.buffer as ArrayBuffer, b.row.buffer as ArrayBuffer];

/** Luminosity distance, Mpc, of a distance modulus (re-exported for the tests). */
export { dmToMpc };
