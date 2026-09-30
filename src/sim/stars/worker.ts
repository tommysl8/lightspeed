/**
 * The star files' worker: fetches, decompresses (DecompressionStream) and decodes the catalogue (with the head's
 * pinned stars appended), its extra columns, the names table, the extension's index and its band files, off the
 * main thread, and hands the typed arrays back without copying. One request at a time per message; replies carry
 * the request's id.
 */
import { decodeStars3DExtra, fetchGzip, stars3DTransfer } from './catalogue';
import { bandFileTransfer, decodeBandFile, decodeStarIndex, starIndexTransfer } from './extension';
import { buildNameTable, nameTableTransfer, type StarNamesJson } from './names';
import { decodeCatalogue, fetchHead } from './catalogueDecode';

export type StarWorkerRequest = { id: number; kind: 'stars' | 'extra' | 'names' | 'index' | 'band'; url: string; head?: string; base?: number };
export type StarWorkerReply = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<StarWorkerRequest>) => void) | null;
  postMessage(message: StarWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, kind, url, head, base } = e.data;
  void (async () => {
    try {
      const [buf, headBuf] = await Promise.all([fetchGzip(url), kind === 'stars' && head ? fetchHead(head) : Promise.resolve(null)]);
      if (kind === 'stars') {
        const stars = await decodeCatalogue(buf, headBuf);
        scope.postMessage({ id, ok: true, data: stars }, stars3DTransfer(stars));
      } else if (kind === 'extra') {
        const extra = decodeStars3DExtra(buf);
        scope.postMessage({ id, ok: true, data: extra }, [extra.spectralType.buffer as ArrayBuffer, extra.constellation.buffer as ArrayBuffer]);
      } else if (kind === 'index') {
        const index = decodeStarIndex(buf);
        scope.postMessage({ id, ok: true, data: index }, starIndexTransfer(index));
      } else if (kind === 'band') {
        const file = decodeBandFile(buf, base ?? 0);
        scope.postMessage({ id, ok: true, data: file }, bandFileTransfer(file));
      } else {
        const json = JSON.parse(new TextDecoder().decode(buf)) as StarNamesJson;
        if (json.format !== 'lightspeed.star-names') throw new Error('star-names: unexpected format');
        const table = buildNameTable(json);
        scope.postMessage({ id, ok: true, data: table }, nameTableTransfer(table));
      }
    } catch (err) {
      scope.postMessage({ id, ok: false, error: String(err) });
    }
  })();
};
