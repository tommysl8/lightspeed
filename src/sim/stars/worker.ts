/**
 * The star files' worker: fetches, decompresses (DecompressionStream) and decodes the catalogue,
 * its extra columns and the names table off the main thread, and hands the typed arrays back
 * without copying. One request at a time per message; replies carry the request's id.
 */
import { borrowCompanionTemperatures, decodeStars3D, decodeStars3DExtra, fetchGzip, stars3DTransfer } from './catalogue';
import { buildNameTable, nameTableTransfer, type StarNamesJson } from './names';
import { nearSunCounts, starDrawLists } from './visibility';

export type StarWorkerRequest = { id: number; kind: 'stars' | 'extra' | 'names'; url: string };
export type StarWorkerReply = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<StarWorkerRequest>) => void) | null;
  postMessage(message: StarWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, kind, url } = e.data;
  void (async () => {
    try {
      const buf = await fetchGzip(url);
      if (kind === 'stars') {
        const stars = decodeStars3D(buf);
        borrowCompanionTemperatures(stars);
        stars.nearSun = nearSunCounts(stars);
        stars.drawLists = starDrawLists(stars);
        scope.postMessage({ id, ok: true, data: stars }, stars3DTransfer(stars));
      } else if (kind === 'extra') {
        const extra = decodeStars3DExtra(buf);
        scope.postMessage({ id, ok: true, data: extra }, [extra.spectralType.buffer as ArrayBuffer, extra.constellation.buffer as ArrayBuffer]);
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
