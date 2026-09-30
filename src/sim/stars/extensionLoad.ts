/**
 * Loading the catalogue's extension (extension.ts) as the camera goes: the index once the camera leaves the Sun's
 * neighbourhood (or a search or a star needs it), then each band file whose cells could hold a star bright enough
 * to be seen from the camera, or that lies within PROXIMITY_PC of it.
 *
 * Rules (docs/data/stars.md §12.5):
 *  - within NEAR_SUN_PC of the Sun nothing is fetched: the head holds every star that can be seen from there at any
 *    date (scripts/build-stars3d-ext.mjs pins them);
 *  - elsewhere a file is fetched when one of its cells passes M_min + 5 log10(d_min / 10 pc) < cut + PREFETCH_MAG,
 *    d_min the distance to the cell's box at the date (the index's J2000 boxes, grown by the file's fastest star's
 *    travel; past 20,000 years the file's own boxes, exact at any date), or when a cell lies within PROXIMITY_PC;
 *  - brightest first (the largest margin), FETCHES at a time; beyond MAX_LOADED_STARS the files least recently needed
 *    are dropped.
 */
import { STAR_MAG_LIMIT, NEAR_SUN_PC } from './visibility';
import { CUT_ABOVE_LIMIT, reachMag } from './cells';
import { bandFilePath, STAR_INDEX_PATH, type BandFile, type StarIndex } from './extension';
import { KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';
import { requestStarFile } from './workerClient';

/** Fetch margin beyond the eye's cut, magnitudes: a file arrives before its brightest star can show. */
export const PREFETCH_MAG = 0.5;
/** Files with a cell this close to the camera are fetched whatever their brightness (nearby promotion, Roam), pc. */
export const PROXIMITY_PC = 2;
/** Files fetched at once. */
const FETCHES = 4;
/** Loaded stars kept at most (about 40 MB of typed arrays). */
export const MAX_LOADED_STARS = 1_500_000;
/** Beyond this many years from 2000 the files' own boxes (exact) decide instead of the cells' grown ones. */
const CELL_TEST_YEARS = 20_000;

export const extData = {
  index: null as StarIndex | null,
  indexStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  /** Loaded band files by number. */
  files: new Map<number, BandFile>(),
  /** Files on their way. */
  loading: new Map<number, Promise<BandFile | null>>(),
  /** Files that failed (not asked again this session). */
  failed: new Set<number>(),
  /** The evaluation count at which each loaded file was last needed. */
  lastNeeded: new Map<number, number>(),
  evaluations: 0,
  loadedStars: 0,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  extData.version++;
  listeners.forEach((f) => f());
}
export const extensionVersion = (): number => extData.version;
export function subscribeExtension(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let indexPending: Promise<StarIndex | null> | null = null;
/** The extension's index (fetched once). */
export function loadStarIndex(): Promise<StarIndex | null> {
  if (indexPending) return indexPending;
  extData.indexStatus = 'loading';
  indexPending = requestStarFile<StarIndex>('index', STAR_INDEX_PATH)
    .then((x) => {
      extData.index = x;
      extData.indexStatus = 'ready';
      changed();
      return x;
    })
    .catch((err) => {
      console.warn(`[lightspeed] the star index did not load (${err}); the head catalogue goes on alone`);
      extData.indexStatus = 'failed';
      indexPending = null;
      return null;
    });
  return indexPending;
}

/** The band file holding global star index i (−1 if none). */
export function fileOfStar(x: StarIndex, i: number): number {
  if (i < x.headCount || i >= x.total) return -1;
  let lo = 0;
  let hi = x.files - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (x.base[mid] <= i) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Fetch band file k (once). */
export function loadBandFile(k: number): Promise<BandFile | null> {
  const x = extData.index;
  if (!x) return Promise.resolve(null);
  const have = extData.files.get(k);
  if (have) return Promise.resolve(have);
  const p0 = extData.loading.get(k);
  if (p0) return p0;
  const p = requestStarFile<BandFile>('band', bandFilePath(k), { base: x.base[k] })
    .then((f) => {
      extData.loading.delete(k);
      extData.files.set(k, f);
      extData.lastNeeded.set(k, extData.evaluations);
      extData.loadedStars += f.stars.count;
      evict();
      changed();
      return f;
    })
    .catch((err) => {
      extData.loading.delete(k);
      extData.failed.add(k);
      console.warn(`[lightspeed] star file ${k} did not load (${err})`);
      return null;
    });
  extData.loading.set(k, p);
  return p;
}

/** Drop the files least recently needed while more than MAX_LOADED_STARS are loaded. */
function evict(): void {
  if (extData.loadedStars <= MAX_LOADED_STARS) return;
  const byAge = [...extData.lastNeeded.entries()].filter(([k]) => extData.files.has(k)).sort((a, b) => a[1] - b[1]);
  for (const [k, when] of byAge) {
    if (extData.loadedStars <= MAX_LOADED_STARS || when >= extData.evaluations) break;
    const f = extData.files.get(k)!;
    extData.files.delete(k);
    extData.lastNeeded.delete(k);
    extData.loadedStars -= f.stars.count;
  }
}

/** A star of the extension: its loaded file and its row there, or null (not an extension star, or not loaded). */
export function extensionStar(i: number): { file: BandFile; local: number } | null {
  const x = extData.index;
  if (!x) return null;
  const k = fileOfStar(x, i);
  const f = k >= 0 ? extData.files.get(k) : undefined;
  return f ? { file: f, local: i - f.base } : null;
}

/** The same, fetching the index and the file if need be. */
export async function ensureExtensionStar(i: number): Promise<{ file: BandFile; local: number } | null> {
  const x = extData.index ?? (await loadStarIndex());
  if (!x) return null;
  const k = fileOfStar(x, i);
  if (k < 0) return null;
  const f = await loadBandFile(k);
  if (!f) return null;
  extData.lastNeeded.set(k, extData.evaluations + 1_000_000); // a star asked for keeps its file for now
  return { file: f, local: i - f.base };
}

/** Distance from p to a box [lo x y z, hi x y z] at offset o of `B`, grown by g, pc. */
function boxDistance(B: Float32Array, o: number, x: number, y: number, z: number, g: number): number {
  const dx = Math.max(0, B[o] - g - x, x - B[o + 3] - g);
  const dy = Math.max(0, B[o + 1] - g - y, y - B[o + 4] - g);
  const dz = Math.max(0, B[o + 2] - g - z, z - B[o + 5] - g);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Distance from p to file f's box at `years` (exact blend of its J2000 and ±1 Myr boxes). */
function fileDistance(x: StarIndex, f: number, px: number, py: number, pz: number, years: number): number {
  const B = x.boxes;
  const o = 18 * f;
  const t = Math.min(1, Math.abs(years) / MOTION_VALID_YEARS);
  const e = years >= 0 ? o + 6 : o + 12;
  const s = 1 - t;
  const dx = Math.max(0, s * B[o] + t * B[e] - px, px - s * B[o + 3] - t * B[e + 3]);
  const dy = Math.max(0, s * B[o + 1] + t * B[e + 1] - py, py - s * B[o + 4] - t * B[e + 4]);
  const dz = Math.max(0, s * B[o + 2] + t * B[e + 2] - pz, pz - s * B[o + 5] - t * B[e + 5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The files the camera at (x, y, z) pc, `years` from J2000 (held to ±1 Myr), needs, with a priority each (larger
 * first): exported for the tests.
 */
export function neededFiles(x: StarIndex, px: number, py: number, pz: number, years: number, magLimit = STAR_MAG_LIMIT): [number, number][] {
  const cut = magLimit + CUT_ABOVE_LIMIT + PREFETCH_MAG;
  const out: [number, number][] = [];
  const y = Math.max(-MOTION_VALID_YEARS, Math.min(MOTION_VALID_YEARS, years));
  for (let f = 0; f < x.files; f++) {
    const d = fileDistance(x, f, px, py, pz, y);
    let margin = reachMag(cut, d) - x.mMin[f];
    if (margin < 0 && d >= PROXIMITY_PC) continue;
    if (Math.abs(y) < CELL_TEST_YEARS) {
      const g = x.vmax[f] * KMS_TO_PC_PER_YR * Math.abs(y);
      margin = -Infinity;
      for (let c = x.cellFirst[f]; c < x.cellFirst[f + 1]; c++) {
        const dc = boxDistance(x.cellBox, 6 * c, px, py, pz, g);
        const m = dc < PROXIMITY_PC ? Math.max(0, reachMag(cut, dc) - x.cellMin[c]) : reachMag(cut, dc) - x.cellMin[c];
        if (m > margin) margin = m;
      }
      if (margin < 0) continue;
    }
    out.push([f, margin]);
  }
  return out;
}

let lastCam = { x: NaN, y: NaN, z: NaN, years: NaN };
let frames = 0;
/** The files the last evaluation found needed and not yet loaded, brightest first: fetched FETCHES at a time. */
let queue: number[] = [];

/**
 * Once a frame: re-evaluate what the camera needs when it has moved (or every 30 frames) and fetch it. Camera in pc,
 * J2000 ecliptic; `years` from J2000.
 */
export function updateExtensionLoading(px: number, py: number, pz: number, years: number): void {
  const r = Math.hypot(px, py, pz);
  if (!(r > NEAR_SUN_PC)) return;
  const x = extData.index;
  if (!x) {
    if (extData.indexStatus === 'idle') void loadStarIndex();
    return;
  }
  frames++;
  const moved = Math.hypot(px - lastCam.x, py - lastCam.y, pz - lastCam.z);
  if (moved > 0.002 * r + 1e-3 || Math.abs(years - lastCam.years) >= 50 || frames % 30 === 0) {
    lastCam = { x: px, y: py, z: pz, years };
    extData.evaluations++;
    const need = neededFiles(x, px, py, pz, years).sort((a, b) => b[1] - a[1]);
    for (const [f] of need) if (extData.files.has(f)) extData.lastNeeded.set(f, Math.max(extData.lastNeeded.get(f) ?? 0, extData.evaluations));
    queue = need.map(([f]) => f).filter((f) => !extData.files.has(f) && !extData.failed.has(f));
  }
  // Keep FETCHES files on their way while the queue lasts.
  while (queue.length && extData.loading.size < FETCHES) {
    const f = queue.shift()!;
    if (extData.files.has(f) || extData.loading.has(f) || extData.failed.has(f)) continue;
    void loadBandFile(f);
  }
}
