/**
 * Loads the complete Solar System into the registry once the app has started: the data files
 * (bodies.json 180 kB, rings.json 14 kB, moons.json 150 kB, tracks.json 90 kB and tracks.bin
 * 1 MB, all compressed on the wire) are fetched in parallel, parsed and registered in one call.
 * Nothing waits for them: until they arrive the Solar System is the built-in bodies, and
 * everything that lists, finds or draws bodies picks the new ones up when they register.
 *
 * Parsing is light (JSON, and the tracks' coefficients viewed in place), so it runs on the main
 * thread: a few milliseconds.
 */
import { getBody, isBody, registerBodies, replaceBodies, unregisterBodies } from '../bodies';
import { indexMoonCatalog, type MoonCatalog } from '../moonModels';
import { parseTracks, type TracksIndex } from '../tracks';
import { assetUrl } from '../../render/textures';
import type { BodiesFile, RingsFile } from './data';
import { solarSystemRecords, type CoreRecords, type SolarSystemData } from './records';

export type SolarSystemStatus = 'idle' | 'loading' | 'ready' | 'failed';

let status: SolarSystemStatus = 'idle';
let pending: Promise<boolean> | null = null;
/** Ids this module registered (so a second registration replaces them). */
let added: string[] = [];

const listeners = new Set<() => void>();
const setStatus = (s: SolarSystemStatus) => {
  status = s;
  listeners.forEach((f) => f());
};

/** Where loading stands. */
export const solarSystemStatus = (): SolarSystemStatus => status;

/** Hear about status changes. Returns the unsubscribe function. */
export function subscribeSolarSystem(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register the Solar System from parsed data (tests call this directly). Registering again
 * replaces what an earlier call added.
 */
export function registerSolarSystem(data: SolarSystemData): void {
  const core = (id: keyof CoreRecords) => {
    const r = getBody(id);
    if (!r) throw new Error(`solar system: the built-in body '${id}' is missing`);
    return r;
  };
  const records = solarSystemRecords(data, {
    pluto: core('pluto'),
    voyager1: core('voyager1'),
    jupiter: core('jupiter'),
    uranus: core('uranus'),
    neptune: core('neptune'),
  });
  const again = records.add.filter((r) => isBody(r.id)).map((r) => r.id);
  if (again.length) unregisterBodies(again);
  registerBodies(records.add);
  replaceBodies(records.replace);
  added = records.add.map((r) => r.id);
}

/** Ids of the bodies the Solar System data added (not the built-in ones it enriched). */
export const solarSystemIds = (): readonly string[] => added;

async function fetchOk(path: string): Promise<Response> {
  const r = await fetch(assetUrl(path));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}

/** Resolves once the browser is idle (the first frames drawn), or after `ms` at the latest. */
function whenIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (idle) idle(() => resolve(), { timeout: ms });
    else setTimeout(resolve, Math.min(ms, 300));
  });
}

/**
 * Fetch and register the Solar System (once; later calls return the same promise). Resolves to
 * whether it worked. A failure leaves the built-in bodies as they were and says so in the console.
 * With `idle`, the fetches wait for the browser to be idle (so the first frames come first); the
 * status is 'loading' from the call on either way.
 */
export function loadSolarSystem(opts: { idle?: boolean } = {}): Promise<boolean> {
  if (pending) return pending;
  setStatus('loading');
  pending = (async () => {
    try {
      if (opts.idle) await whenIdle(1500);
      const [bodies, rings, moons, index, bin] = await Promise.all([
        fetchOk('data/bodies.json').then((r) => r.json() as Promise<BodiesFile>),
        fetchOk('data/rings.json').then((r) => r.json() as Promise<RingsFile>),
        fetchOk('data/moons.json').then((r) => r.json() as Promise<MoonCatalog>),
        fetchOk('data/tracks.json').then((r) => r.json() as Promise<TracksIndex>),
        fetchOk('data/tracks.bin').then((r) => r.arrayBuffer()),
      ]);
      registerSolarSystem({ bodies, rings, moons: indexMoonCatalog(moons), tracks: parseTracks(index, bin) });
      setStatus('ready');
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the Solar System data did not load; showing the planets only (${err})`);
      setStatus('failed');
      pending = null;
      return false;
    }
  })();
  return pending;
}
