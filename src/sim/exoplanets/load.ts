/**
 * Loads the planets of other stars and registers them (docs/data/exoplanets.md, docs/bodies.md).
 *
 *  1. exoplanets-featured.json.gz (19 kB), once the star catalogue is in: the eleven featured
 *     systems join the registry, about their star bodies (and three hosts of their own).
 *  2. exoplanets.json.gz (400 kB), lazily: when "Where to?" opens, the camera leaves the Sun
 *     for the stars, or a star other than the Sun is looked at. A worker inflates, parses and
 *     packs it and matches its 4,779 hosts to the star catalogue. From then on:
 *      - every star body the catalogue matches (a named star, a star registered on demand or
 *        approached) gets its archive planets as bodies;
 *      - any host can be registered by name (search), from the star catalogue when the star is
 *        there, else from the archive's host data (the faint Kepler, K2, TESS and microlensing
 *        stars); those registered from the archive go again when left behind.
 */
import { assetUrl } from '../../render/textures';
import { PARSEC_KM } from '../../physics/constants';
import {
  bodyName,
  bodyRecords,
  getBody,
  isBody,
  registerBodies,
  replaceBodies,
  subscribeRegistry,
  unregisterBodies,
  type BodyId,
  type BodyRecord,
} from '../bodies';
import { updateEphemeris } from '../ephemeris';
import { sim } from '../sim';
import { fetchGzip } from '../stars/catalogue';
import { bodyOfCatalogueStar, loadStarNames, loadStars, registerCatalogueStar, starData } from '../stars/load';
import { catalogueStarId } from '../stars/records';
import { archiveOrbit, known, matchHosts, packCatalogue, type ExoplanetCatalogue, type ExoplanetCatalogueJson, type HostMatches, type StarCatalogueKeys } from './catalogue';
import type { FeaturedFile } from './featured';
import {
  FEATURED_HOSTS,
  cataloguePlanetId,
  cataloguePlanetRecord,
  catalogueHostId,
  featuredPlanetId,
  featuredRecords,
  featuredShown,
  hostRecordFromCatalogue,
} from './records';
import type { ExoplanetWorkerReply, ExoplanetWorkerRequest } from './worker';

export type ExoplanetStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The exoplanet data loaded so far. Read it; do not replace its members (subscribe to hear of changes). */
export const exoplanetData = {
  featuredStatus: 'idle' as ExoplanetStatus,
  featured: null as FeaturedFile | null,
  catalogueStatus: 'idle' as ExoplanetStatus,
  catalogue: null as ExoplanetCatalogue | null,
  /** Host → its star in the star catalogue (−1: not there). */
  matches: null as HostMatches | null,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  exoplanetData.version++;
  listeners.forEach((f) => f());
}
/** Bumped whenever exoplanet data arrive. */
export const exoplanetsVersion = (): number => exoplanetData.version;
/** Hear about exoplanet data arriving. Returns the unsubscribe function. */
export function subscribeExoplanets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Where the featured systems stand ('ready' once registered). */
export const featuredStatus = (): ExoplanetStatus => exoplanetData.featuredStatus;

// ─── The featured systems ────────────────────────────────────────────────────────────────

let featuredIds: string[] = [];
/** Ids of the bodies the featured systems registered (hosts and planets). */
export const featuredBodyIds = (): readonly string[] => featuredIds;

/**
 * Register the featured systems (the tests call this with the file from disk). Hosts that are
 * not registered yet (the star catalogue has not loaded) leave their planets out; registering
 * again adds them and replaces the rest in place.
 */
export function registerFeatured(file: FeaturedFile): void {
  const records = featuredRecords(file, (id) => isBody(id), bodyName);
  const add = records.filter((r) => !getBody(r.id));
  const replace = records.filter((r) => getBody(r.id));
  registerBodies(add);
  if (replace.length) replaceBodies(replace);
  featuredIds = records.map((r) => r.id);
  exoplanetData.featured = file;
  indexFeatured(file);
}

let featuredPending: Promise<boolean> | null = null;

/** Resolves in a later task (a message to self: not held back in a hidden tab as timers are). */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Fetch the featured systems once the star catalogue is in (later calls return the same
 * promise) and register them. Resolves to whether it worked.
 */
export function loadFeaturedExoplanets(): Promise<boolean> {
  if (featuredPending) return featuredPending;
  exoplanetData.featuredStatus = 'loading';
  changed();
  featuredPending = (async () => {
    try {
      const [buf] = await Promise.all([fetchGzip(absolute('data/exoplanets-featured.json.gz')), loadStars({ idle: true })]);
      // The star catalogue has just registered its bodies in this task: register the planets in
      // the next, so the two (each with the re-render it brings) are not one long task.
      await nextTask();
      const file = JSON.parse(new TextDecoder().decode(buf)) as FeaturedFile;
      if (file.format !== 'lightspeed-exoplanets-featured/1') throw new Error('exoplanets-featured: unexpected format');
      registerFeatured(file);
      exoplanetData.featuredStatus = 'ready';
      changed();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the featured exoplanet systems did not load (${err})`);
      exoplanetData.featuredStatus = 'failed';
      changed();
      featuredPending = null;
      return false;
    }
  })();
  return featuredPending;
}

// ─── Indexes ─────────────────────────────────────────────────────────────────────────────

/** Archive host index → the featured host's registry id; archive planet name → featured planet id. */
const featuredHostOf = new Map<number, string>();
const featuredPlanetOf = new Map<string, string>();
/** Star catalogue index → archive host. */
const hostOfStar = new Map<number, number>();
/** Every archive planet's id (for hosts registered from the archive, whose ids must differ). */
let planetIds: ReadonlySet<string> = new Set();

/** Archive host names of the featured systems (checked against the featured file by a test). */
export const FEATURED_ARCHIVE_HOSTS: Readonly<Record<string, string>> = {
  'TRAPPIST-1': 'trappist-1',
  'Proxima Cen': 'proxima-cen',
  "Barnard's star": 'barnards-star',
  '51 Peg': '51-peg',
  'HR 8799': 'hr-8799',
  'KOI-351': 'kepler-90',
  'TOI-700': 'toi-700',
  'Kepler-16': 'kepler-16',
  'eps Eri': 'eps-eri',
  'tau Cet': 'tau-cet',
};

function indexFeatured(file: FeaturedFile | null): void {
  featuredPlanetOf.clear();
  if (!file) return;
  for (const sys of file.systems)
    for (const p of sys.planets) if (p.archiveName && featuredShown(p)) featuredPlanetOf.set(p.archiveName, featuredPlanetId(sys, p));
}

function indexCatalogue(cat: ExoplanetCatalogue, matches: HostMatches | null): void {
  featuredHostOf.clear();
  hostOfStar.clear();
  for (let h = 0; h < cat.hosts.count; h++) {
    const sys = FEATURED_ARCHIVE_HOSTS[cat.hosts.name[h]];
    if (sys) featuredHostOf.set(h, FEATURED_HOSTS[sys]);
    const s = matches?.star[h] ?? -1;
    if (s >= 0) hostOfStar.set(s, h);
  }
  const ids = new Set<string>();
  for (let i = 0; i < cat.planets.count; i++) ids.add(cataloguePlanetId(cat, i));
  planetIds = ids;
}

/**
 * Take in a loaded catalogue and its host matches (the tests call this with the file from disk),
 * then give every matched star body its planets.
 */
export function setCatalogue(cat: ExoplanetCatalogue, matches: HostMatches | null): void {
  exoplanetData.catalogue = cat;
  exoplanetData.matches = matches;
  indexFeatured(exoplanetData.featured);
  indexCatalogue(cat, matches);
  syncPlanets();
  changed();
}

/** The archive host a star catalogue index is, if any. */
export const hostOfCatalogueStar = (starIndex: number): number | undefined => hostOfStar.get(starIndex);

/** The featured host body of an archive host, if it is one. */
export const featuredHostOfHost = (h: number): string | undefined => featuredHostOf.get(h);

/** The body id an archive planet has (a featured planet's own id), registered or not. */
export function planetBodyId(i: number): string {
  const cat = exoplanetData.catalogue!;
  return featuredPlanetOf.get(cat.planets.name[i]) ?? cataloguePlanetId(cat, i);
}

/** The body id an archive host has or would have (a featured host, its star's body, or one of its own). */
export function hostBodyId(h: number): string {
  const cat = exoplanetData.catalogue!;
  const f = featuredHostOf.get(h);
  if (f) return f;
  const s = exoplanetData.matches?.star[h] ?? -1;
  if (s >= 0) return bodyOfCatalogueStar(s) ?? catalogueStarId(s);
  return catalogueHostId(cat, h, planetIds);
}

// ─── Registering planets and hosts ───────────────────────────────────────────────────────

/** The archive planets of host h not registered yet, about the body `hostId` (none for a featured host). */
function planetRecordsOf(h: number, hostId: BodyId, hostName = bodyName(hostId)): BodyRecord[] {
  const cat = exoplanetData.catalogue;
  if (!cat || featuredHostOf.has(h)) return [];
  const host = { id: hostId, name: hostName, named: isNamedHost(hostId) };
  const out: BodyRecord[] = [];
  const first = cat.hosts.firstPlanet[h];
  for (let i = first; i < first + cat.hosts.planetCount[h]; i++) {
    if (featuredPlanetOf.has(cat.planets.name[i]) || getBody(cataloguePlanetId(cat, i))) continue;
    const r = cataloguePlanetRecord(cat, i, archiveOrbit(cat, i), host);
    if (r) out.push(r);
  }
  return out;
}

/** Hosts registered from the archive (not the star catalogue), by id. */
const fileHosts = new Set<string>();

/** One of the app's named stars (not a catalogue star or an archive host registered on demand). */
export function isNamedHost(id: BodyId): boolean {
  const r = isBody(id) ? getBody(id) : undefined;
  return !!r && r.kind === 'star' && !r.onDemand;
}

/**
 * The body of archive host h, registering it (and its planets) if need be: a featured host, the
 * star catalogue's star, or a star record from the archive. Null when it cannot be placed (the
 * archive gives no distance), the star catalogue is not in yet, or the featured systems are not.
 */
export function ensureHost(h: number): BodyId | null {
  const cat = exoplanetData.catalogue;
  if (!cat || h < 0 || h >= cat.hosts.count) return null;
  const f = featuredHostOf.get(h);
  if (f) return isBody(f) ? f : null;
  const s = exoplanetData.matches?.star[h] ?? -1;
  let id: BodyId | null;
  let added = false;
  if (s >= 0) {
    id = bodyOfCatalogueStar(s) ?? null;
    if (!id) {
      id = registerCatalogueStar(s);
      added = !!id;
    }
    if (!id) return null;
    const planets = planetRecordsOf(h, id);
    if (planets.length) {
      registerBodies(planets);
      added = true;
    }
  } else {
    id = catalogueHostId(cat, h, planetIds);
    if (!isBody(id)) {
      if (getBody(id)) return null; // the id is some other registry entry's
      const rec = hostRecordFromCatalogue(cat, h, id);
      if (!rec) return null;
      registerBodies([rec, ...planetRecordsOf(h, id, rec.name)]);
      fileHosts.add(id);
      added = true;
    }
  }
  // Place what was just registered, so the camera can go there this frame.
  if (added) updateEphemeris();
  return id;
}

let syncQueued = false;
/**
 * Give every registered star body that the archive lists as a host its planets (a named star, a
 * star registered on demand or approached). Runs after registry changes, once they settle.
 */
function syncPlanets(): void {
  const cat = exoplanetData.catalogue;
  if (!cat || !hostOfStar.size) return;
  const add: BodyRecord[] = [];
  for (const r of bodyRecords()) {
    const s = r.star?.catalogueIndex;
    if (s === undefined || r.kind !== 'star') continue;
    const h = hostOfStar.get(s);
    if (h === undefined || featuredHostOf.has(h)) continue;
    add.push(...planetRecordsOf(h, r.id));
  }
  if (add.length) registerBodies(add);
}

subscribeRegistry(() => {
  if (syncQueued || !exoplanetData.catalogue) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncPlanets();
  });
});

/** Hosts registered from the archive are dropped past this distance from the camera, unless kept. */
export const RELEASE_HOST_PC = 0.15;
let frame = 0;

/**
 * Once a frame: start loading the catalogue when it is wanted (the camera among the stars, or a
 * star other than the Sun in view), and every second or so release hosts registered from the
 * archive that were left behind (`keep`: the focus, the selection, a destination, or what orbits them).
 */
export function updateExoplanets(keep: (id: BodyId) => boolean, focus: BodyId): void {
  if (exoplanetData.catalogueStatus === 'idle') {
    const far = sim.camera.pos.length() > 0.2 * PARSEC_KM;
    const star = focus !== 'sun' && getBody(focus)?.kind === 'star';
    if (far || star) void loadExoplanetCatalogue();
  }
  if (++frame % 60 !== 0 || !fileHosts.size) return;
  const release: string[] = [];
  const far = RELEASE_HOST_PC * PARSEC_KM;
  for (const id of fileHosts) {
    const b = sim.bodies[id];
    if (!b) {
      fileHosts.delete(id);
      continue;
    }
    if (!keep(id) && b.pos.distanceTo(sim.camera.pos) > far) release.push(id);
  }
  if (release.length) {
    for (const id of release) fileHosts.delete(id);
    unregisterBodies(release);
  }
}

/** Hosts registered from the archive (for the tests). */
export const archiveHosts = (): ReadonlySet<string> => fileHosts;

// ─── Loading the catalogue ───────────────────────────────────────────────────────────────

const absolute = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

/** What the host matcher needs from the star catalogue, copied for the worker. */
function starKeys(): StarCatalogueKeys | null {
  const stars = starData.stars;
  if (!stars || !starData.full) return null;
  const names = starData.names;
  return {
    count: stars.count,
    positions: stars.positions.slice(),
    absMag: stars.absMag.slice(),
    hip: names ? { star: names.hip.star.slice(), id: names.hip.id.slice() } : undefined,
    hd: names ? { star: names.hd.star.slice(), id: names.hd.id.slice() } : undefined,
  };
}

/** Fetch, parse and match in a worker (here, where there are none: the tests). */
async function fetchCatalogue(stars: StarCatalogueKeys | null): Promise<{ catalogue: ExoplanetCatalogue; matches: HostMatches | null }> {
  const url = absolute('data/exoplanets.json.gz');
  if (typeof Worker !== 'undefined' && typeof window !== 'undefined') {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'exoplanets' });
    } catch {
      worker = null;
    }
    if (worker) {
      const w = worker;
      try {
        return await new Promise((resolve, reject) => {
          w.onmessage = (e: MessageEvent<ExoplanetWorkerReply>) => (e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)));
          w.onerror = (e) => reject(new Error(e.message));
          const transfer: ArrayBuffer[] = stars ? [stars.positions.buffer as ArrayBuffer, stars.absMag.buffer as ArrayBuffer] : [];
          w.postMessage({ url, stars } satisfies ExoplanetWorkerRequest, transfer);
        });
      } finally {
        w.terminate();
      }
    }
  }
  const buf = await fetchGzip(url);
  const catalogue = packCatalogue(JSON.parse(new TextDecoder().decode(buf)) as ExoplanetCatalogueJson);
  return { catalogue, matches: stars ? matchHosts(catalogue, stars) : null };
}

let cataloguePending: Promise<boolean> | null = null;

/**
 * Fetch the archive catalogue (once; later calls return the same promise), after the featured
 * systems, the star catalogue and the star names it is matched against. Resolves to whether it
 * worked.
 */
export function loadExoplanetCatalogue(): Promise<boolean> {
  if (cataloguePending) return cataloguePending;
  exoplanetData.catalogueStatus = 'loading';
  changed();
  cataloguePending = (async () => {
    try {
      await loadFeaturedExoplanets();
      const starsOk = await loadStars();
      if (starsOk) await loadStarNames();
      const { catalogue, matches } = await fetchCatalogue(starsOk ? starKeys() : null);
      exoplanetData.catalogueStatus = 'ready';
      setCatalogue(catalogue, matches);
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the exoplanet catalogue did not load (${err})`);
      exoplanetData.catalogueStatus = 'failed';
      changed();
      cataloguePending = null;
      return false;
    }
  })();
  return cataloguePending;
}

/** Where the archive catalogue stands. */
export const catalogueStatus = (): ExoplanetStatus => exoplanetData.catalogueStatus;

/** Distance of archive host h from the camera, km (its J2000 place; NaN without a distance). */
export function hostDistanceKm(h: number): number {
  const cat = exoplanetData.catalogue;
  if (!cat) return NaN;
  const id = featuredHostOf.get(h) ?? bodyOfCatalogueStar(exoplanetData.matches?.star[h] ?? -1);
  const b = id ? sim.bodies[id] : undefined;
  if (b) return b.pos.distanceTo(sim.camera.pos);
  const d = cat.hosts.dist[h];
  if (!known(d)) return NaN;
  const ra = (cat.hosts.ra[h] * Math.PI) / 180;
  const dec = (cat.hosts.dec[h] * Math.PI) / 180;
  // ICRS → world axes (x, z_ecl, −y_ecl) via the ecliptic.
  const eps = (84_381.448 / 3600 / 180) * Math.PI;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const ye = Math.cos(eps) * y + Math.sin(eps) * z;
  const ze = -Math.sin(eps) * y + Math.cos(eps) * z;
  const k = d * PARSEC_KM;
  const c = sim.camera.pos;
  return Math.hypot(x * k - c.x, ze * k - c.y, -ye * k - c.z);
}
