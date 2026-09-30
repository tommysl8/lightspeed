/**
 * Loads the stars once the app has started, off the main thread, and registers the star bodies.
 *
 *  1. stars3d-bright.bin.gz (170 kB): the 9,959 stars down to V = 6.6, so the sky is there
 *     within the first second;
 *  2. stars3d.bin.gz (5.3 MB): all 329,770 stars, which replace the subset (star i is the same
 *     star in both, so nothing moves or flickers), then the star systems and named stars of
 *     systems.json join the body registry (Proxima's built-in record is replaced by its orbit),
 *     and with them the black holes in binaries and the lone one (sim/blackholes);
 *  3. constellations.json (50 kB) for the constellation figures.
 *
 * The names (star-names.json.gz, 1.2 MB) load when "Where to?" opens or a star needs a name, and
 * the spectral types and constellations of every star (stars3d-extra.bin.gz, 0.6 MB) when a
 * catalogue star is registered. Decompression (DecompressionStream) and decoding run in a
 * worker (worker.ts); where workers are missing (the tests) they run here.
 */
import { getBody, isBody, bodyRecords, registerBodies, registryVersion, replaceBodies, unregisterBodies, type BodyId } from '../bodies';
import { assetUrl } from '../../render/textures';
import { updateEphemeris } from '../ephemeris';
import { borrowCompanionTemperatures, decodeStars3D, decodeStars3DExtra, fetchGzip, type Stars3D, type Stars3DExtra } from './catalogue';
import { buildNameTable, type StarNameTable, type StarNamesJson } from './names';
import type { SystemsFile } from './orbits';
import type { ConstellationsFile } from './constellations';
import { catalogueStarId, catalogueStarRecord, mergeCoreProxima, starRecords } from './records';
import type { StarWorkerReply, StarWorkerRequest } from './worker';
import { nearSunCounts, starDrawLists } from './visibility';
import { registerBinaryHoles, registerIsolatedHoles } from '../blackholes/load';
import { holeCompanionIndices } from '../blackholes/records';

export type StarStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The star data loaded so far. Read it; do not replace its members (subscribe to hear of changes). */
export const starData = {
  status: 'idle' as StarStatus,
  /** The catalogue drawn: the bright subset first, then the full one. */
  stars: null as Stars3D | null,
  /** `stars` is the full catalogue. */
  full: false,
  systems: null as SystemsFile | null,
  constellations: null as ConstellationsFile | null,
  names: null as StarNameTable | null,
  extra: null as Stars3DExtra | null,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  starData.version++;
  listeners.forEach((f) => f());
}

/** Bumped whenever star data arrive. */
export const starsVersion = (): number => starData.version;
/** Hear about star data arriving. Returns the unsubscribe function. */
export function subscribeStars(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── The worker ──────────────────────────────────────────────────────────────────────────

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function starWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'stars' });
    worker.onmessage = (e: MessageEvent<StarWorkerReply>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.data);
      else w.reject(new Error(e.data.error));
    };
  } catch {
    worker = null;
  }
  return worker;
}

const absolute = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

/** Fetch and decode a star file, in the worker when there is one. */
async function request<T>(kind: StarWorkerRequest['kind'], path: string): Promise<T> {
  const w = starWorker();
  if (w) {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, kind, url: absolute(path) } satisfies StarWorkerRequest);
    });
  }
  const buf = await fetchGzip(absolute(path));
  if (kind === 'stars') {
    const stars = decodeStars3D(buf);
    borrowCompanionTemperatures(stars);
    stars.nearSun = nearSunCounts(stars);
    stars.drawLists = starDrawLists(stars);
    return stars as T;
  }
  if (kind === 'extra') return decodeStars3DExtra(buf) as T;
  return buildNameTable(JSON.parse(new TextDecoder().decode(buf)) as StarNamesJson) as T;
}

// ─── Registration ────────────────────────────────────────────────────────────────────────

/** Ids this module registered from systems.json (not the built-in bodies it replaced). */
let added: string[] = [];

/**
 * Register the star systems and named stars (the tests call this with the files from disk).
 * The built-in Proxima is replaced by its place in the Alpha Centauri system. Registering again
 * replaces the records in place.
 */
export function registerStars(file: SystemsFile, stars: Stars3D): void {
  const core = getBody('proxima');
  const records = core ? mergeCoreProxima(starRecords(file, stars), core) : starRecords(file, stars);
  // A catalogue star registered on demand that is now a named star: the named record takes over.
  const named = records.map((r) => r.star?.catalogueIndex).filter((i): i is number => i !== undefined);
  releaseCatalogueStars(named);
  const replace = records.filter((r) => isBody(r.id) || getBody(r.id));
  const add = records.filter((r) => !isBody(r.id) && !getBody(r.id));
  registerBodies(add);
  if (replace.length) replaceBodies(replace);
  if (!added.length) added = add.map((r) => r.id);
  starData.systems = file;
  // The black holes in binaries and the lone one (sim/blackholes), with ids of their own (not in starIds):
  // Cygnus X-1's companion is catalogue star 111021, which a search may have registered on demand.
  releaseCatalogueStars(holeCompanionIndices());
  registerBinaryHoles(stars);
  registerIsolatedHoles();
}

/** Ids of the star bodies registered from systems.json. */
export const starIds = (): readonly string[] => added;

// ─── Loading ─────────────────────────────────────────────────────────────────────────────

let pending: Promise<boolean> | null = null;

/** Resolves once the browser is idle (the first frames drawn), or after `ms` at the latest. */
function whenIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (idle) idle(() => resolve(), { timeout: ms });
    else setTimeout(resolve, Math.min(ms, 300));
  });
}

/** Where loading stands ('ready' once the full catalogue and the star bodies are in). */
export const starStatus = (): StarStatus => starData.status;

/**
 * Fetch the stars (once; later calls return the same promise) and register the star bodies.
 * Resolves to whether it worked. With `idle`, the first fetch waits for the browser to be idle.
 */
export function loadStars(opts: { idle?: boolean } = {}): Promise<boolean> {
  if (pending) return pending;
  starData.status = 'loading';
  changed();
  pending = (async () => {
    try {
      if (opts.idle) await whenIdle(1200);
      const full = request<Stars3D>('stars', 'data/stars3d.bin.gz');
      const systems = import('./systems.json').then((m) => m.default as unknown as SystemsFile);
      try {
        const bright = await request<Stars3D>('stars', 'data/stars3d-bright.bin.gz');
        if (!starData.full) {
          starData.stars = bright;
          changed();
        }
        // The figures join naked-eye stars only: they can show with the subset.
        void loadConstellations();
      } catch (err) {
        console.warn(`[lightspeed] the bright-star subset did not load (${err}); waiting for the full catalogue`);
      }
      const [stars, file] = await Promise.all([full, systems]);
      starData.stars = stars;
      starData.full = true;
      registerStars(file, stars);
      starData.status = 'ready';
      changed();
      void loadConstellations();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the star catalogue did not load; the Solar System is unaffected (${err})`);
      starData.status = 'failed';
      changed();
      pending = null;
      return false;
    }
  })();
  return pending;
}

let constellationsPending: Promise<ConstellationsFile | null> | null = null;
/** The constellation figures (fetched once). */
export function loadConstellations(): Promise<ConstellationsFile | null> {
  constellationsPending ??= fetch(assetUrl('data/constellations.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`constellations.json: HTTP ${r.status}`);
      return r.json() as Promise<ConstellationsFile>;
    })
    .then((file) => {
      starData.constellations = file;
      changed();
      return file;
    })
    .catch((err) => {
      console.warn(`[lightspeed] constellations did not load (${err})`);
      constellationsPending = null;
      return null;
    });
  return constellationsPending;
}

let namesPending: Promise<StarNameTable | null> | null = null;
/** The star names (fetched and indexed once, in the worker). */
export function loadStarNames(): Promise<StarNameTable | null> {
  namesPending ??= request<StarNameTable>('names', 'data/star-names.json.gz')
    .then((t) => {
      starData.names = t;
      renameLazyStars();
      changed();
      return t;
    })
    .catch((err) => {
      console.warn(`[lightspeed] star names did not load (${err})`);
      namesPending = null;
      return null;
    });
  return namesPending;
}

let extraPending: Promise<Stars3DExtra | null> | null = null;
/** Spectral types and constellations of every star (fetched once). */
export function loadStarExtra(): Promise<Stars3DExtra | null> {
  extraPending ??= request<Stars3DExtra>('extra', 'data/stars3d-extra.bin.gz')
    .then((x) => {
      starData.extra = x;
      renameLazyStars();
      changed();
      return x;
    })
    .catch((err) => {
      console.warn(`[lightspeed] star spectral types did not load (${err})`);
      extraPending = null;
      return null;
    });
  return extraPending;
}

// ─── Catalogue stars on demand ───────────────────────────────────────────────────────────

const byIndex = { version: -1, map: new Map<number, BodyId>() };
/** The registered body of a catalogue star, if it has one (a named star, or one registered on demand). */
export function bodyOfCatalogueStar(i: number): BodyId | undefined {
  if (byIndex.version !== registryVersion()) {
    byIndex.map.clear();
    for (const r of bodyRecords()) if (r.star?.catalogueIndex !== undefined) byIndex.map.set(r.star.catalogueIndex, r.id);
    byIndex.version = registryVersion();
  }
  return byIndex.map.get(i);
}

/** Catalogue stars registered on demand, by index. */
const lazyStars = new Set<number>();
export const onDemandStars = (): ReadonlySet<number> => lazyStars;

/**
 * Register catalogue star i as a body now (the full catalogue must be in), named with what has
 * loaded, and placed.
 */
export function registerCatalogueStar(i: number): BodyId | null {
  const stars = starData.stars;
  if (!starData.full || !stars || i < 0 || i >= stars.count) return null;
  const had = bodyOfCatalogueStar(i);
  if (had) return had;
  const rec = catalogueStarRecord(stars, i, starData.names, starData.extra);
  registerBodies([rec]);
  lazyStars.add(i);
  // Place it now: whatever asked for it (Go, a flight plan, the camera's path) reads where it is
  // straight away, not the origin a new body starts at before its first frame.
  updateEphemeris();
  return rec.id;
}

/**
 * The body of catalogue star i, registering it if need be, once its name and spectral type have
 * loaded (null if the catalogue is not in).
 */
export async function ensureCatalogueStar(i: number): Promise<BodyId | null> {
  const had = bodyOfCatalogueStar(i);
  if (had) return had;
  await Promise.all([starData.names ?? loadStarNames(), starData.extra ?? loadStarExtra()]);
  return registerCatalogueStar(i);
}

/** Remove catalogue stars registered on demand. */
export function releaseCatalogueStars(indices: readonly number[]): void {
  const ids = indices.filter((i) => lazyStars.has(i)).map(catalogueStarId);
  for (const i of indices) lazyStars.delete(i);
  if (ids.length) unregisterBodies(ids.filter((id) => isBody(id)));
}

/** Give stars registered before the names or spectral types arrived their names now. */
function renameLazyStars(): void {
  const stars = starData.stars;
  if (!stars || !starData.full || !lazyStars.size) return;
  const recs = [...lazyStars].filter((i) => isBody(catalogueStarId(i))).map((i) => catalogueStarRecord(stars, i, starData.names, starData.extra));
  if (recs.length) replaceBodies(recs);
}
