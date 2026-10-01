/**
 * The near search's worker (near.ts): it fetches and decodes its own copy of each orbit file the layer has (the
 * browser's cache serves it again), and answers each search with index lists, off the main thread.
 */
import { fetchTile } from '../surveys/fetchTile.ts';
import { decodeOrbitFile, type Section } from './format.ts';
import { nearSelect, type NearQuery } from './near.ts';

export type NearWorkerRequest =
  | { kind: 'file'; url: string }
  | { kind: 'select'; id: number; query: Omit<NearQuery, 'from'> & { from: [number, number][] } };
export type NearWorkerReply = { id: number; picks: [number, Uint32Array][]; limit: number; searched: number[] };

interface WorkerScope {
  onmessage: ((e: MessageEvent<NearWorkerRequest>) => void) | null;
  postMessage(message: NearWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
const sections = new Map<number, Section>();
const files = new Map<string, Promise<void>>();

scope.onmessage = (e) => {
  const req = e.data;
  if (req.kind === 'file') {
    if (!files.has(req.url))
      files.set(
        req.url,
        fetchTile(req.url)
          .then(({ buffer }) => {
            for (const s of decodeOrbitFile(buffer).sections) sections.set(s.id, s);
          })
          .catch(() => {
            files.delete(req.url);
          }),
      );
    return;
  }
  void Promise.all(files.values()).then(() => {
    const from = new Map(req.query.from);
    const { picks, limit } = nearSelect(sections.values(), { ...req.query, from });
    const list = [...picks];
    // The sections searched: those asked for that are here.
    const searched = [...from.keys()].filter((id) => sections.has(id));
    scope.postMessage({ id: req.id, picks: list, limit, searched }, list.map(([, a]) => a.buffer));
  });
};
