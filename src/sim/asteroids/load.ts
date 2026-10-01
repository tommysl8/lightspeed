/**
 * Loading the small bodies (format.ts) as the camera goes.
 *
 * At start, with the rest of the Solar System: the index (6 kB) and the first file (451 kB: each group's brightest
 * members and every comet, 34,234 bodies), what belts.bin was. The other 18 files (17.6 MB, 1.43 million bodies)
 * only once the layer is on and the camera is out where the belt matters: no nearer than STREAM_FROM_PLANET_KM to a
 * planet (so a visit to Earth or Saturn downloads only the near-Earth asteroids'), and only those whose sections could hold a body
 * bright enough to show from the camera (lod.ts, PREFETCH_MAG to spare), brightest first, FETCHES at a time. A
 * clicked or found body's file is fetched whatever the view. A failed download is tried again after 2 s, then 4,
 * 8… up to a minute (lib/retry.ts), for as long as it is wanted. Nothing is dropped: all of it is 21 MB of arrays.
 */
import { retryAfterMs } from '../../lib/retry';
import { gunzipIfNeeded } from '../stars/catalogue';
import { decodeOrbitFile, GROUPS, type Section } from './format';
import { DRAW_BUDGET, planDraw, PREFETCH_BUDGET, PREFETCH_MAG, type PlanSection } from './lod';

/** Where the files are (public/data/asteroids/). */
export const ASTEROID_BASE_URL = `${import.meta.env.BASE_URL}data/asteroids/`;

/** Files fetched at once. */
const FETCHES = 2;
/** Nothing beyond the first file is fetched until this long after it arrived, ms: the start belongs to the rest of the app. */
export const STREAM_AFTER_MS = 5000;
/** The camera at least this far from every planet before the full catalogue streams in, km (0.05 au). */
export const STREAM_FROM_PLANET_KM = 7.5e6;

/** A section as the index lists it (format.ts SectionHead, rMax null for open orbits). */
export interface IndexSection {
  id: number;
  group: number;
  shape: number;
  frame: number;
  count: number;
  numbered: number;
  hMin: number;
  hMax: number;
  rMin: number;
  rMax: number | null;
}

export interface AsteroidIndex {
  refEpochJd: number;
  files: { file: string; bytes: number; sections: IndexSection[] }[];
  counts: Record<string, number>;
  total: number;
}

/** A loaded section: its columns, and the file it came in. */
export type LoadedSection = Section & { file: number };

type FileState = 'loading' | 'ready';

/** What has loaded. Read it; subscribe to hear of changes. */
export const smallBodies = {
  index: null as AsteroidIndex | null,
  indexFailures: 0,
  indexRetryAt: 0,
  /** Loaded sections by id. */
  sections: new Map<number, LoadedSection>(),
  files: new Map<number, FileState>(),
  failures: new Map<number, number>(),
  retryAt: new Map<number, number>(),
  /** Files wanted whatever the view (a clicked or found body's). */
  pinned: new Set<number>(),
  /** When the first file arrived (performance.now ms). */
  firstAt: Infinity,
  /** Bodies loaded, and bytes downloaded (gzip). */
  loaded: 0,
  bytes: 0,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  smallBodies.version++;
  listeners.forEach((f) => f());
}
export const smallBodiesVersion = (): number => smallBodies.version;
export function subscribeSmallBodies(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The section's bound for lod.ts. */
export const boundsOf = (s: IndexSection | Section) => ({
  comet: GROUPS[s.group] === 'comet',
  hMin: s.hMin,
  rMin: s.rMin,
  rMax: s.rMax == null ? Infinity : s.rMax,
});

let planned: { ix: AsteroidIndex; list: PlanSection[] } | null = null;
/** Every section of the index, with its bound, for planDraw. */
function planSections(ix: AsteroidIndex): PlanSection[] {
  if (planned?.ix !== ix) planned = { ix, list: ix.files.flatMap((f) => f.sections.map((s) => ({ ...boundsOf(s), id: s.id, count: s.count }))) };
  return planned.list;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let indexPromise: Promise<AsteroidIndex | null> | null = null;

/** The index, fetched once (again after a failure, once its wait is over). */
export function loadAsteroidIndex(): Promise<AsteroidIndex | null> {
  if (smallBodies.index) return Promise.resolve(smallBodies.index);
  if (indexPromise) return indexPromise;
  if (now() < smallBodies.indexRetryAt) return Promise.resolve(null);
  indexPromise = fetch(`${ASTEROID_BASE_URL}index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`asteroids index: HTTP ${r.status}`);
      return r.json() as Promise<AsteroidIndex>;
    })
    .then((ix) => {
      smallBodies.index = ix;
      changed();
      return ix;
    })
    .catch((err) => {
      smallBodies.indexFailures++;
      smallBodies.indexRetryAt = now() + retryAfterMs(smallBodies.indexFailures);
      console.warn('[lightspeed] asteroid index failed to load', err);
      return null;
    })
    .finally(() => {
      indexPromise = null;
    });
  return indexPromise;
}

const waiting = new Map<number, Promise<boolean>>();

/** Fetch, inflate and decode file `k` (once; again after a failure, once its wait is over). True when it is in. */
export function loadAsteroidFile(k: number): Promise<boolean> {
  const ix = smallBodies.index;
  if (!ix || k < 0 || k >= ix.files.length) return Promise.resolve(false);
  if (smallBodies.files.get(k) === 'ready') return Promise.resolve(true);
  const w = waiting.get(k);
  if (w) return w;
  if (now() < (smallBodies.retryAt.get(k) ?? 0)) return Promise.resolve(false);
  smallBodies.files.set(k, 'loading');
  const p = fetch(`${ASTEROID_BASE_URL}${ix.files[k].file}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${ix.files[k].file}: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then(async (raw) => {
      smallBodies.bytes += raw.byteLength;
      const file = decodeOrbitFile(await gunzipIfNeeded(raw));
      for (const s of file.sections) {
        smallBodies.sections.set(s.id, { ...s, file: k } as LoadedSection);
        smallBodies.loaded += s.count;
      }
      smallBodies.files.set(k, 'ready');
      if (k === 0) smallBodies.firstAt = now();
      smallBodies.failures.delete(k);
      changed();
      return true;
    })
    .catch((err) => {
      smallBodies.files.delete(k);
      const n = (smallBodies.failures.get(k) ?? 0) + 1;
      smallBodies.failures.set(k, n);
      smallBodies.retryAt.set(k, now() + retryAfterMs(n));
      console.warn('[lightspeed] asteroid file failed to load', err);
      return false;
    })
    .finally(() => waiting.delete(k));
  waiting.set(k, p);
  return p;
}

/** The file that holds section `id`, or −1. */
export function fileOfSection(id: number): number {
  const ix = smallBodies.index;
  if (!ix) return -1;
  return ix.files.findIndex((f) => f.sections.some((s) => s.id === id));
}

/** Section `id`, loading its file if need be (for a body clicked or found: its file stays wanted). */
export async function ensureSection(id: number): Promise<LoadedSection | null> {
  const have = smallBodies.sections.get(id);
  if (have) return have;
  if (!(await loadAsteroidIndex())) return null;
  const k = fileOfSection(id);
  if (k < 0) return null;
  smallBodies.pinned.add(k);
  await loadAsteroidFile(k);
  return smallBodies.sections.get(id) ?? null;
}

/**
 * Called each frame by the layer: the index and the first file once the layer is on; the rest while `stream` (the
 * camera out where the belt matters), each file one of whose sections could show from `camAu` au from the Sun with
 * PREFETCH_MAG to spare, brightest first, at most FETCHES at a time.
 */
export function updateAsteroidLoads(on: boolean, stream: boolean, camAu: number): void {
  if (!on && !smallBodies.pinned.size) return;
  const ix = smallBodies.index;
  if (!ix) {
    void loadAsteroidIndex();
    return;
  }
  if (!smallBodies.files.has(0)) void loadAsteroidFile(0);
  let busy = waiting.size;
  if (busy >= FETCHES) return;
  for (const k of smallBodies.pinned) {
    if (busy >= FETCHES) return;
    if (!smallBodies.files.has(k) && now() >= (smallBodies.retryAt.get(k) ?? 0)) {
      void loadAsteroidFile(k);
      busy++;
    }
  }
  if (!on || now() < smallBodies.firstAt + STREAM_AFTER_MS) return;
  // The files the draw would want with a larger budget and PREFETCH_MAG to spare (lod.ts planDraw), brightest
  // first, and those of the sections it leaves out whose shell the camera is inside (the near search reads them:
  // near.ts). Near a planet only the near-Earth asteroids' (370 kB): the small ones that pass close matter there.
  const full = planDraw(planSections(ix), camAu, DRAW_BUDGET * PREFETCH_BUDGET, PREFETCH_MAG);
  const plan = new Set(full.counts.keys());
  for (const l of full.left) if (l.bound === -Infinity) plan.add(l.id);
  for (let k = 1; k < ix.files.length && busy < FETCHES; k++) {
    if (smallBodies.files.has(k) || now() < (smallBodies.retryAt.get(k) ?? 0)) continue;
    if (!stream && !ix.files[k].sections.every((s) => GROUPS[s.group] === 'neo')) continue;
    if (!ix.files[k].sections.some((s) => plan.has(s.id))) continue;
    void loadAsteroidFile(k);
    busy++;
  }
}
