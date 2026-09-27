/**
 * Loads the Milky Way layer and registers its bodies.
 *
 *  1. At once: the Milky Way itself, Sagittarius A* and the S-stars (sstars.json, 7 kB, bundled).
 *  2. Then the 45 nebulae (nebulae.json, 89 kB, a chunk of its own).
 *  3. Once the stars are in and the browser is idle: the particle model (1.7 MB) and the clusters
 *     (111 kB), inflated, decoded and turned into GPU arrays and dust maps in a worker (worker.ts);
 *     the famous clusters then join the registry.
 *
 * Where workers are missing (the tests) the same work runs here.
 */
import { bodyIds, isBody, registerBodies, type BodyRecord } from '../bodies';
import { assetUrl } from '../../render/textures';
import { loadStars } from '../stars/load';
import { buildGalaxyData, type GalaxyData, type GalaxyWorkerReply, type GalaxyWorkerRequest } from './galaxyData';
import { clusterRecords, milkyWayRecord, nebulaRecords, sgrAFrom, sgrARecord, sStarRecords, type NebulaeFile } from './records';
import sstarsJson from './sstars.json';
import type { SStarsJson } from './sstars';

export type GalaxyStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** What has loaded so far. Read it; subscribe to hear of changes. */
export const galaxyState = {
  /** The particle model and clusters. */
  status: 'idle' as GalaxyStatus,
  data: null as GalaxyData | null,
  /** The nebulae file (their bodies are registered with it). */
  nebulae: null as NebulaeFile | null,
  nebulaStatus: 'idle' as GalaxyStatus,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  galaxyState.version++;
  listeners.forEach((f) => f());
}
export const galaxyVersion = (): number => galaxyState.version;
export function subscribeGalaxy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Where loading the particle model and clusters stands. */
export const galaxyStatus = (): GalaxyStatus => galaxyState.status;
/** Where loading the nebulae stands. */
export const nebulaStatus = (): GalaxyStatus => galaxyState.nebulaStatus;

export const SSTARS = sstarsJson as unknown as SStarsJson;

// ─── Registration ────────────────────────────────────────────────────────────────────────

/** The Milky Way, Sgr A* and the S-stars (once). */
export function registerGalaxyCore(): void {
  if (isBody('sgr-a-star')) return;
  const s = sgrAFrom(SSTARS as Parameters<typeof sgrAFrom>[0]);
  registerBodies([milkyWayRecord(s), sgrARecord(s), ...sStarRecords(SSTARS)]);
}

/** The nebulae (once). */
export function registerNebulae(file: NebulaeFile): void {
  galaxyState.nebulae = file;
  const records = nebulaRecords(file).filter((r) => !isBody(r.id));
  if (records.length) registerBodies(records);
}

/** The famous clusters (once), with ids clear of every body registered. */
export function registerClusters(data: Pick<GalaxyData, 'clusters'>): BodyRecord[] {
  const taken = new Set([...bodyIds(), ...(galaxyState.nebulae?.objects.map((o) => o.id) ?? [])]);
  const records = clusterRecords(data.clusters, taken).filter((r) => !isBody(r.id));
  if (records.length) registerBodies(records);
  return records;
}

// ─── The worker ──────────────────────────────────────────────────────────────────────────

const absolute = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

function viaWorker(particlesUrl: string, clustersUrl: string): Promise<GalaxyData> {
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return buildGalaxyData(particlesUrl, clustersUrl);
  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'galaxy' });
  } catch {
    return buildGalaxyData(particlesUrl, clustersUrl);
  }
  return new Promise<GalaxyData>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<GalaxyWorkerReply>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.data);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ id: 1, particlesUrl, clustersUrl } satisfies GalaxyWorkerRequest);
  });
}

/** Resolves once the browser is idle, or after `ms` at the latest. */
function whenIdle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (idle) idle(() => resolve(), { timeout: ms });
    else setTimeout(resolve, Math.min(ms, 300));
  });
}

let nebulaePending: Promise<boolean> | null = null;
/** Register the nebulae (their file is a chunk of its own). */
export function loadNebulae(): Promise<boolean> {
  nebulaePending ??= (async () => {
    galaxyState.nebulaStatus = 'loading';
    changed();
    try {
      const file = (await import('./nebulae.json')).default as unknown as NebulaeFile;
      registerNebulae(file);
      galaxyState.nebulaStatus = 'ready';
      changed();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the nebulae did not load (${err})`);
      galaxyState.nebulaStatus = 'failed';
      nebulaePending = null;
      changed();
      return false;
    }
  })();
  return nebulaePending;
}

let pending: Promise<boolean> | null = null;

/**
 * Register the Galaxy's bodies and load its particle model and clusters (once; later calls
 * return the same promise). With `idle`, the big files wait for the stars and an idle moment.
 */
export function loadGalaxy(opts: { idle?: boolean } = {}): Promise<boolean> {
  if (pending) return pending;
  registerGalaxyCore();
  galaxyState.status = 'loading';
  changed();
  pending = (async () => {
    const nebulae = loadNebulae();
    try {
      if (opts.idle) {
        await loadStars({ idle: true });
        await whenIdle(2000);
      }
      const data = await viaWorker(absolute('data/galaxy-particles.bin.gz'), absolute('data/clusters.json.gz'));
      await nebulae;
      galaxyState.data = data;
      registerClusters(data);
      galaxyState.status = 'ready';
      changed();
      return true;
    } catch (err) {
      console.warn(`[lightspeed] the Milky Way model did not load; the rest of the sky is unaffected (${err})`);
      galaxyState.status = 'failed';
      pending = null;
      changed();
      return false;
    }
  })();
  return pending;
}
