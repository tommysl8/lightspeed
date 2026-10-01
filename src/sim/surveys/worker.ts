/**
 * The surveys' worker: fetches a tile, inflates it and decodes it (a node's 16,384 galaxies in about half a
 * millisecond), off the main thread. The arrays go back without copying, with the bytes the download took.
 */
import { decodeNode } from './format.ts';
import { fetchTile } from './fetchTile.ts';

export type SurveyWorkerRequest = { id: number; kind: 'hierarchy'; url: string } | { id: number; kind: 'node'; url: string; side: number };
export type SurveyWorkerReply =
  | { id: number; ok: true; kind: 'hierarchy'; buffer: ArrayBuffer; bytes: number }
  | { id: number; ok: true; kind: 'node'; position: Float32Array; attrs: Uint8Array; extra: Uint8Array; extraPer: number; glows: Float32Array; count: number; bytes: number }
  | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<SurveyWorkerRequest>) => void) | null;
  postMessage(message: SurveyWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const req = e.data;
  void (async () => {
    try {
      const { buffer, bytes } = await fetchTile(req.url);
      if (req.kind === 'hierarchy') {
        scope.postMessage({ id: req.id, ok: true, kind: 'hierarchy', buffer, bytes }, [buffer]);
        return;
      }
      const n = decodeNode(buffer, req.side);
      scope.postMessage({ id: req.id, ok: true, kind: 'node', position: n.position, attrs: n.attrs, extra: n.extra, extraPer: n.extraPer, glows: n.glows, count: n.count, bytes }, [
        n.position.buffer as ArrayBuffer,
        n.attrs.buffer as ArrayBuffer,
        n.extra.buffer as ArrayBuffer,
        n.glows.buffer as ArrayBuffer,
      ]);
    } catch (err) {
      scope.postMessage({ id: req.id, ok: false, error: String(err) });
    }
  })();
};
