/**
 * The main thread's side of the star worker (worker.ts): one worker for every star file, requests matched to
 * replies by id, the typed arrays handed back without copying. Where there are no workers (the tests) the same
 * decoding runs here.
 */
import { assetUrl } from '../../render/textures';
import { decodeStars3DExtra, fetchGzip } from './catalogue';
import { decodeCatalogue, fetchHead } from './catalogueDecode';
import { decodeBandFile, decodeStarIndex } from './extension';
import { buildNameTable, type StarNamesJson } from './names';
import type { StarWorkerReply, StarWorkerRequest } from './worker';

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

export const absoluteUrl = (path: string): string => (typeof location !== 'undefined' ? new URL(assetUrl(path), location.href).href : assetUrl(path));

/** Options of a request: the head file to append (kind 'stars'), a band file's first global index (kind 'band'). */
export interface StarRequestOptions {
  head?: string;
  base?: number;
}

/** Fetch and decode a star file, in the worker when there is one. */
export async function requestStarFile<T>(kind: StarWorkerRequest['kind'], path: string, opts: StarRequestOptions = {}): Promise<T> {
  const w = starWorker();
  const url = absoluteUrl(path);
  const head = opts.head ? absoluteUrl(opts.head) : undefined;
  if (w) {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, kind, url, head, base: opts.base } satisfies StarWorkerRequest);
    });
  }
  const buf = await fetchGzip(url);
  if (kind === 'stars') return (await decodeCatalogue(buf, head ? await fetchHead(head) : null)) as T;
  if (kind === 'extra') return decodeStars3DExtra(buf) as T;
  if (kind === 'index') return decodeStarIndex(buf) as T;
  if (kind === 'band') return decodeBandFile(buf, opts.base ?? 0) as T;
  return buildNameTable(JSON.parse(new TextDecoder().decode(buf)) as StarNamesJson) as T;
}
