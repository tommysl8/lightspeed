/**
 * Star clusters: public/data/clusters.json.gz, built by scripts/build-clusters.mjs
 * (docs/data/galaxy.md).
 *
 *  - 1,500 open clusters from Hunt & Reffert (2023, 2024; Gaia DR3): bound clusters with good
 *    astrometry, the 60 famous ones always, then the most massive, nearest first.
 *  - 164 globular clusters: positions from Vasiliev & Baumgardt (2021), distances from Baumgardt &
 *    Vasiliev (2021) (Harris 2010 for five), and integrated magnitudes, radii and metallicities from
 *    the Harris catalogue (1996, 2010 edition).
 *
 * The renderer draws the globulars as clumps of light with their measured integrated magnitude
 * (their stars are far below the star catalogue's limit), and the open clusters as rings of their
 * half-member radius: the bright stars of an open cluster are already in the star catalogue, and
 * its total light is not in the data, so nothing is added to it.
 */
import { bvToTemperature, blackbodyRgb } from '../../physics/blackbody';
import { TEMP_MIN_K, TEMP_STEPS_PER_OCTAVE } from './particles';

export interface ClustersFile {
  meta: Record<string, unknown> & { schema?: string; credit?: string };
  openClusters: { columns: string[]; rows: (string | number | boolean | null)[][] };
  globularClusters: { columns: string[]; rows: (string | number | boolean | null)[][] };
}

interface ClusterBase {
  /** Catalogue name ("Melotte 22", "NGC 5139"). */
  name: string;
  /** Common name as the file gives it ("Pleiades (M45)", "Omega Centauri"), or null. */
  commonName: string | null;
  raDeg: number;
  decDeg: number;
  lDeg: number;
  bDeg: number;
  /** Adopted distance, pc, with its 16th and 84th percentiles (open) or 1σ range (globular). */
  distPc: number;
  distLoPc: number;
  distHiPc: number;
  /** Heliocentric galactic position, pc (x → l = 0, y → l = 90°, z → north galactic pole). */
  xPc: number;
  yPc: number;
  zPc: number;
  /** Radius drawn: r50 (open), the half-light radius r_h (globular), pc. */
  radiusPc: number;
}

export interface OpenCluster extends ClusterBase {
  kind: 'open';
  rJacobiPc: number | null;
  rTidalPc: number | null;
  members: number;
  logAge: [number, number, number];
  av: number | null;
  massTotalMsun: number | null;
  massJacobiMsun: number | null;
}

export interface GlobularCluster extends ClusterBase {
  kind: 'globular';
  /** Where the distance comes from ('BV21', 'Harris'). */
  distSource: string;
  rcPc: number | null;
  concentration: number | null;
  coreCollapsed: boolean;
  /** Integrated absolute magnitude (Harris, rescaled to the adopted distance), or null. */
  mv: number | null;
  /** Photometric mass estimate (1.9 L_V), M☉. */
  massEstimateMsun: number | null;
  feH: number | null;
  ebv: number | null;
  /** r_h was missing and a default is drawn. */
  radiusDefault: boolean;
  /** M_V was missing and a default is drawn. */
  mvDefault: boolean;
}

export type Cluster = OpenCluster | GlobularCluster;

/** Defaults for globulars the Harris catalogue gives no radius or magnitude (galaxy.md). */
export const GLOBULAR_DEFAULT_RH_PC = 3;
export const GLOBULAR_DEFAULT_MV = -6;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

/** The clusters of the file, open clusters first (both nearest first). */
export function parseClusters(file: ClustersFile): Cluster[] {
  const out: Cluster[] = [];
  const oc = file.openClusters;
  const o = (n: string) => {
    const i = oc.columns.indexOf(n);
    if (i < 0) throw new Error(`clusters.json: open clusters lack ${n}`);
    return i;
  };
  const O = {
    name: o('name'), common: o('commonName'), ra: o('raDeg'), dec: o('decDeg'), l: o('lDeg'), b: o('bDeg'),
    d: o('distPc'), d16: o('dist16Pc'), d84: o('dist84Pc'), x: o('xPc'), y: o('yPc'), z: o('zPc'), r50: o('r50Pc'),
    rJ: o('rJacobiPc'), rT: o('rTidalPc'), n: o('members'), a16: o('logAge16'), a50: o('logAge50'), a84: o('logAge84'),
    av: o('AV'), m: o('massTotalMsun'), mJ: o('massJacobiMsun'),
  };
  for (const r of oc.rows) {
    out.push({
      kind: 'open',
      name: String(r[O.name]),
      commonName: str(r[O.common]),
      raDeg: num(r[O.ra])!,
      decDeg: num(r[O.dec])!,
      lDeg: num(r[O.l])!,
      bDeg: num(r[O.b])!,
      distPc: num(r[O.d])!,
      distLoPc: num(r[O.d16]) ?? num(r[O.d])!,
      distHiPc: num(r[O.d84]) ?? num(r[O.d])!,
      xPc: num(r[O.x])!,
      yPc: num(r[O.y])!,
      zPc: num(r[O.z])!,
      radiusPc: num(r[O.r50])!,
      rJacobiPc: num(r[O.rJ]),
      rTidalPc: num(r[O.rT]),
      members: num(r[O.n]) ?? 0,
      logAge: [num(r[O.a16])!, num(r[O.a50])!, num(r[O.a84])!],
      av: num(r[O.av]),
      massTotalMsun: num(r[O.m]),
      massJacobiMsun: num(r[O.mJ]),
    });
  }
  const gc = file.globularClusters;
  const g = (n: string) => {
    const i = gc.columns.indexOf(n);
    if (i < 0) throw new Error(`clusters.json: globular clusters lack ${n}`);
    return i;
  };
  const G = {
    name: g('name'), common: g('commonName'), ra: g('raDeg'), dec: g('decDeg'), l: g('lDeg'), b: g('bDeg'),
    d: g('distKpc'), dp: g('distErrPlusKpc'), dm: g('distErrMinusKpc'), src: g('distSource'), x: g('xPc'), y: g('yPc'),
    z: g('zPc'), rh: g('rhPc'), rc: g('rcPc'), c: g('concentration'), cc: g('coreCollapsed'), mv: g('MV'),
    m: g('massEstimateMsun'), fe: g('FeH'), ebv: g('EBV'),
  };
  for (const r of gc.rows) {
    const d = num(r[G.d])! * 1000;
    const rh = num(r[G.rh]);
    const mv = num(r[G.mv]);
    out.push({
      kind: 'globular',
      name: String(r[G.name]),
      commonName: str(r[G.common]),
      raDeg: num(r[G.ra])!,
      decDeg: num(r[G.dec])!,
      lDeg: num(r[G.l])!,
      bDeg: num(r[G.b])!,
      distPc: d,
      distLoPc: d - (num(r[G.dm]) ?? 0) * 1000,
      distHiPc: d + (num(r[G.dp]) ?? 0) * 1000,
      xPc: num(r[G.x])!,
      yPc: num(r[G.y])!,
      zPc: num(r[G.z])!,
      radiusPc: rh ?? GLOBULAR_DEFAULT_RH_PC,
      radiusDefault: rh === null,
      distSource: String(r[G.src] ?? ''),
      rcPc: num(r[G.rc]),
      concentration: num(r[G.c]),
      coreCollapsed: r[G.cc] === true,
      mv,
      mvDefault: mv === null,
      massEstimateMsun: num(r[G.m]),
      feH: num(r[G.fe]),
      ebv: num(r[G.ebv]),
    });
  }
  return out;
}

// ─── Names and ids ───────────────────────────────────────────────────────────────────────

/** Globulars with a proper name (not only a catalogue code) that get a body of their own. */
const NAMED_GLOBULARS = new Set(['Omega Centauri', '47 Tucanae', 'Intergalactic Wanderer']);

/**
 * Whether a cluster gets a body (a label, a card, a place in search): the 60 open clusters the
 * catalogue keeps as famous showpieces, and the globulars with a Messier number or a proper name.
 */
export function isFamousCluster(c: Cluster): boolean {
  if (!c.commonName) return false;
  if (c.kind === 'open') return true;
  return NAMED_GLOBULARS.has(c.commonName) || /^M\s?\d+\b/.test(c.commonName);
}

/** The display name: the common name's first part ("Pleiades", "Praesepe", "M13"). */
export function clusterDisplayName(c: Cluster): string {
  const common = c.commonName;
  if (!common) return c.name;
  const first = common.split(/\s*\(|,\s*/)[0].trim();
  return first || c.name;
}

/** Other names people type: the catalogue name, the parts of the common name ("M45", "the Beehive"). */
export function clusterAliases(c: Cluster): string[] {
  const out = new Set<string>([c.name]);
  const common = c.commonName ?? '';
  for (const part of common.split(/\s*[(),]\s*/)) {
    const p = part.replace(/^the\s+/i, '').trim();
    if (p) out.add(p);
  }
  // "M 45" as well as "M45"; "Messier 45".
  for (const a of [...out]) {
    const m = a.match(/^M\s?(\d+)$/);
    if (m) {
      out.add(`M ${m[1]}`);
      out.add(`Messier ${m[1]}`);
    }
  }
  out.delete(clusterDisplayName(c));
  return [...out];
}

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The body id of a famous cluster ("pleiades", "omega-centauri", "47-tucanae", "m13"). */
export function clusterId(c: Cluster, taken: ReadonlySet<string> = new Set()): string {
  const id = slug(clusterDisplayName(c));
  return taken.has(id) ? `${id}-cluster` : id;
}

// ─── The globulars' light ────────────────────────────────────────────────────────────────

/** Integrated colour of a globular cluster, B−V (typical of the Milky Way's globulars; their colours are not in the file). */
export const GLOBULAR_BV = 0.72;

/** L_V of a globular, L☉ (M_V of the Sun 4.83). */
export const globularLuminosity = (c: GlobularCluster): number => 10 ** (-0.4 * ((c.mv ?? GLOBULAR_DEFAULT_MV) - 4.83));

/** Sub-points of each globular's clump (the rest of its light is one smooth glow). */
export const CLUMP_POINTS = 48;
/** Share of a globular's light in the smooth glow. */
export const CLUMP_GLOW_SHARE = 0.6;
/** Population code of the clump particles (after the ten of the Galaxy model). */
export const GLOBULAR_POPULATION = 11;
/** Size codes of cluster particles start at a sixteenth of a parsec: h = 2^(code/16 − 4) pc. */
export const CLUSTER_SIZE_OCTAVES = 4;

/** The clumps, in the Galaxy particles' layout but with float32 positions (kpc) and finer sizes. */
export interface ClumpBuffers {
  count: number;
  /** float32 × 3: heliocentric galactic position, kpc. */
  positionKpc: Float32Array;
  color: Uint8Array;
  /** population, luminosity code (2^(c/8) L☉), size code (2^(c/16 − CLUSTER_SIZE_OCTAVES) pc), temperature code. */
  attrs: Uint8Array;
}

export const clumpTransfer = (c: ClumpBuffers): ArrayBuffer[] => [c.positionKpc.buffer as ArrayBuffer, c.color.buffer as ArrayBuffer, c.attrs.buffer as ArrayBuffer];

/** Small deterministic generator (mulberry32), so every run draws the same clumps. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The globulars as particles in the Galaxy's format (particles.ts), to be drawn with it: for each
 * cluster, a smooth glow of Gaussian 1σ = r_h / 1.177 (the half-light radius of a projected
 * Gaussian) holding CLUMP_GLOW_SHARE of its light, and CLUMP_POINTS points drawn from a Plummer
 * sphere of the same half-light radius, each a small glow holding an equal share of the rest.
 * The points are illustrative: they show a cluster's concentration, not its stars.
 */
export function globularClumps(clusters: readonly Cluster[]): ClumpBuffers {
  const globs = clusters.filter((c): c is GlobularCluster => c.kind === 'globular');
  const per = 1 + CLUMP_POINTS;
  const count = globs.length * per;
  const positionKpc = new Float32Array(3 * count);
  const color = new Uint8Array(3 * count);
  const attrs = new Uint8Array(4 * count);
  const T = bvToTemperature(GLOBULAR_BV);
  const rgb = blackbodyRgb(T);
  const max = Math.max(...rgb);
  const col = rgb.map((c) => Math.round((255 * c) / max));
  const tCode = Math.round(TEMP_STEPS_PER_OCTAVE * Math.log2(T / TEMP_MIN_K));
  const lumCode = (L: number) => Math.min(255, Math.max(0, Math.round(8 * Math.log2(Math.max(L, 1)))));
  const sizeCode = (pc: number) => Math.min(255, Math.max(0, Math.round(16 * (Math.log2(pc) + CLUSTER_SIZE_OCTAVES))));
  let k = 0;
  globs.forEach((c, gi) => {
    const L = globularLuminosity(c);
    const rh = c.radiusPc;
    const next = rng(0x9e3779b9 ^ (gi * 2654435761));
    const put = (x: number, y: number, z: number, lum: number, sizePc: number) => {
      positionKpc[3 * k] = x / 1000;
      positionKpc[3 * k + 1] = y / 1000;
      positionKpc[3 * k + 2] = z / 1000;
      color.set(col, 3 * k);
      attrs[4 * k] = GLOBULAR_POPULATION;
      attrs[4 * k + 1] = lumCode(lum);
      attrs[4 * k + 2] = sizeCode(sizePc);
      attrs[4 * k + 3] = tCode;
      k++;
    };
    put(c.xPc, c.yPc, c.zPc, CLUMP_GLOW_SHARE * L, rh / 1.1774);
    const each = ((1 - CLUMP_GLOW_SHARE) * L) / CLUMP_POINTS;
    for (let i = 0; i < CLUMP_POINTS; i++) {
      // Plummer: the projected half-mass radius equals the scale a; cut at 8a.
      const m = Math.min(0.992, Math.max(1e-4, next()));
      const r = rh / Math.sqrt(m ** (-2 / 3) - 1);
      const u = 2 * next() - 1;
      const phi = 2 * Math.PI * next();
      const s = Math.sqrt(1 - u * u);
      put(c.xPc + r * s * Math.cos(phi), c.yPc + r * s * Math.sin(phi), c.zPc + r * u, each, Math.max(0.0625, 0.12 * rh));
    }
  });
  return { positionKpc, color, attrs, count };
}
