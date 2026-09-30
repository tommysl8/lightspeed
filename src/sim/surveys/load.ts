/**
 * Loading the galaxy surveys (the tiles of sim/surveys/format.ts) as the camera goes.
 *
 * Nothing is fetched until the layer is wanted (ui/cosmicLayers.ts surveyLoadWanted: 'auto' only once the camera is
 * SURVEY_LOAD_KM from the Sun, beyond the local universe; most visits never go there and download none of it). Then
 * the hierarchy (40 kB) once, and the nodes the frame's selection asks for (lod.ts), most wanted first, FETCHES at a
 * time, each fetched, inflated and decoded in a worker. A failed download is tried again after 2 s, then 4, 8… up to
 * a minute (lib/retry.ts), for as long as it is wanted: the layer never gives up for the session. Beyond
 * MAX_CACHED_POINTS the nodes least recently drawn are dropped (their GPU buffers with them: scene/Surveys.tsx).
 *
 * Where workers are missing (the tests) the same work runs here; surveyIO lets the tests replace the downloads and
 * the clock.
 */
import { retryAfterMs } from '../../lib/retry';
import { decodeHierarchy, decodeNode, HIERARCHY_FILE, nodeFile, type SurveyHierarchy } from './format.ts';
import { fetchTile } from './fetchTile.ts';
import type { SurveyWorkerReply, SurveyWorkerRequest } from './worker';

/**
 * Where the surveys' files are: the one place to change to serve them from another host (a URL ending in '/', whose
 * server lets this site fetch from it). By default the site's own public/data/survey/.
 */
export const SURVEY_BASE_URL: string = `${import.meta.env.BASE_URL}data/survey/`;

/** Files fetched at once. */
export const FETCHES = 6;
/** Galaxies kept decoded at most (about 35 MB of GPU buffers). */
export const MAX_CACHED_POINTS = 2_500_000;

/** A node's galaxies, decoded. */
export interface SurveyNodeData {
  id: number;
  count: number;
  /** Mpc from the node's centre, 3 a galaxy. */
  position: Float32Array;
  /** Kind and luminosity bytes, 2 a galaxy. */
  attrs: Uint8Array;
  /** The octants' glows (format.ts GLOW_FLOATS each). */
  glows: Float32Array;
  /** The frame it was last drawn or wanted in. */
  lastUsed: number;
}

export type SurveyStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** What has loaded. Read it; subscribe to hear of changes. */
export const survey = {
  hierarchy: null as SurveyHierarchy | null,
  status: 'idle' as SurveyStatus,
  hierarchyFailures: 0,
  hierarchyRetryAt: 0,
  nodes: new Map<number, SurveyNodeData>(),
  loading: new Set<number>(),
  /** Failures in a row of each node, and when it may be asked for again (surveyIO.now ms). */
  failures: new Map<number, number>(),
  retryAt: new Map<number, number>(),
  loadedPoints: 0,
  /** Bytes downloaded (as sent, gzip) and files fetched this session. */
  bytes: 0,
  files: 0,
  frame: 0,
  version: 0,
};

const listeners = new Set<() => void>();
function changed(): void {
  survey.version++;
  listeners.forEach((f) => f());
}
export const surveyVersion = (): number => survey.version;
export function subscribeSurvey(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const absolute = (file: string): string => (typeof location !== 'undefined' ? new URL(SURVEY_BASE_URL + file, location.href).href : SURVEY_BASE_URL + file);

// ─── The worker ──────────────────────────────────────────────────────────────────────────

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: SurveyWorkerReply) => void; reject: (e: Error) => void }>();

function surveyWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'surveys' });
    w.onmessage = (e: MessageEvent<SurveyWorkerReply>) => {
      const p = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      p?.resolve(e.data);
    };
    // A worker that failed outside a request is dropped with what it owed; the next request starts a new one.
    w.onerror = (e) => {
      w.terminate();
      worker = undefined;
      for (const p of waiting.values()) p.reject(new Error(e.message || 'surveys worker failed'));
      waiting.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

type Req = SurveyWorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

async function call(req: Req): Promise<SurveyWorkerReply> {
  const w = surveyWorker();
  if (!w) {
    const { buffer, bytes } = await fetchTile(req.url);
    if (req.kind === 'hierarchy') return { id: 0, ok: true, kind: 'hierarchy', buffer, bytes };
    const n = decodeNode(buffer, req.side);
    return { id: 0, ok: true, kind: 'node', ...n, bytes };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as SurveyWorkerRequest);
  });
}

/** The downloads and the clock (the tests replace them). */
export const surveyIO = {
  async hierarchy(): Promise<{ hierarchy: SurveyHierarchy; bytes: number }> {
    const r = await call({ kind: 'hierarchy', url: absolute(HIERARCHY_FILE) });
    if (!r.ok) throw new Error(r.error);
    if (r.kind !== 'hierarchy') throw new Error('surveys worker: unexpected reply');
    return { hierarchy: decodeHierarchy(r.buffer), bytes: r.bytes };
  },
  async node(path: string, side: number): Promise<{ count: number; position: Float32Array; attrs: Uint8Array; glows: Float32Array; bytes: number }> {
    const r = await call({ kind: 'node', url: absolute(nodeFile(path)), side });
    if (!r.ok) throw new Error(r.error);
    if (r.kind !== 'node') throw new Error('surveys worker: unexpected reply');
    return r;
  },
  now: (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

// ─── Loading ─────────────────────────────────────────────────────────────────────────────

let hierarchyPending: Promise<boolean> | null = null;

/** Whether the hierarchy should be asked for now: not yet tried, or failed and its wait is over. */
export const surveyHierarchyDue = (): boolean =>
  !survey.hierarchy && !hierarchyPending && (survey.status === 'idle' || (survey.status === 'failed' && surveyIO.now() >= survey.hierarchyRetryAt));

/** Fetch the hierarchy (once; after a failure, again when surveyHierarchyDue says so). */
export function loadSurveyHierarchy(): Promise<boolean> {
  if (hierarchyPending) return hierarchyPending;
  if (survey.hierarchy) return Promise.resolve(true);
  survey.status = 'loading';
  hierarchyPending = surveyIO
    .hierarchy()
    .then(({ hierarchy, bytes }) => {
      survey.hierarchy = hierarchy;
      survey.status = 'ready';
      survey.hierarchyFailures = 0;
      survey.bytes += bytes;
      survey.files++;
      hierarchyPending = null;
      changed();
      return true;
    })
    .catch((err) => {
      survey.hierarchyFailures++;
      const wait = retryAfterMs(survey.hierarchyFailures);
      survey.hierarchyRetryAt = surveyIO.now() + wait;
      survey.status = 'failed';
      hierarchyPending = null;
      console.warn(`[lightspeed] the galaxy surveys' index did not load (${err}); trying again in ${wait / 1000} s`);
      changed();
      return false;
    });
  return hierarchyPending;
}

/** Whether node i failed and is still waiting to be tried again. */
export const surveyNodeWaiting = (i: number): boolean => (survey.retryAt.get(i) ?? -Infinity) > surveyIO.now();

/** Fetch node i (once at a time); resolves true once it is loaded. */
export function loadSurveyNode(i: number): Promise<boolean> {
  const h = survey.hierarchy;
  if (!h || survey.nodes.has(i) || survey.loading.has(i)) return Promise.resolve(survey.nodes.has(i));
  const node = h.nodes[i];
  survey.loading.add(i);
  return surveyIO
    .node(node.path, node.side)
    .then((n) => {
      survey.loading.delete(i);
      survey.failures.delete(i);
      survey.retryAt.delete(i);
      // The file's size as stored (gzip), which is what a server that sends it as it is transfers (the development
      // server inflates it on the way).
      survey.bytes += node.fileBytes || n.bytes;
      survey.files++;
      if (survey.hierarchy !== h) return false;
      survey.nodes.set(i, { id: i, count: n.count, position: n.position, attrs: n.attrs, glows: n.glows, lastUsed: survey.frame });
      survey.loadedPoints += n.count;
      changed();
      return true;
    })
    .catch((err) => {
      survey.loading.delete(i);
      const f = (survey.failures.get(i) ?? 0) + 1;
      survey.failures.set(i, f);
      const wait = retryAfterMs(f);
      survey.retryAt.set(i, surveyIO.now() + wait);
      console.warn(`[lightspeed] survey file ${nodeFile(node.path)} did not load (${err}); trying again in ${wait / 1000} s`);
      return false;
    });
}

/** Ask for the nodes in `want` (most wanted first) that are not here, not on their way and not waiting after a failure, FETCHES at a time. */
export function requestSurveyNodes(want: readonly number[]): void {
  for (const i of want) {
    if (survey.loading.size >= FETCHES) return;
    if (survey.nodes.has(i) || survey.loading.has(i) || surveyNodeWaiting(i)) continue;
    void loadSurveyNode(i);
  }
}

/** Mark nodes drawn or wanted this frame, so they are kept. */
export function touchSurveyNodes(ids: readonly number[]): void {
  for (const i of ids) {
    const n = survey.nodes.get(i);
    if (n) n.lastUsed = survey.frame;
  }
}

/** Beyond MAX_CACHED_POINTS, drop the nodes least recently used (never those of this frame): returns their ids. */
export function evictSurveyNodes(max = MAX_CACHED_POINTS): number[] {
  if (survey.loadedPoints <= max) return [];
  const old = [...survey.nodes.values()].filter((n) => n.lastUsed < survey.frame).sort((a, b) => a.lastUsed - b.lastUsed);
  const out: number[] = [];
  for (const n of old) {
    if (survey.loadedPoints <= max) break;
    survey.nodes.delete(n.id);
    survey.loadedPoints -= n.count;
    out.push(n.id);
  }
  if (out.length) changed();
  return out;
}

/** Back to nothing loaded (the tests). */
export function resetSurvey(): void {
  survey.hierarchy = null;
  survey.status = 'idle';
  survey.hierarchyFailures = 0;
  survey.hierarchyRetryAt = 0;
  survey.nodes.clear();
  survey.loading.clear();
  survey.failures.clear();
  survey.retryAt.clear();
  survey.loadedPoints = 0;
  survey.bytes = 0;
  survey.files = 0;
  survey.frame = 0;
  hierarchyPending = null;
  changed();
}
