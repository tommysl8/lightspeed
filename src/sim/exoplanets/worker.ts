/**
 * The exoplanet catalogue's worker: fetches public/data/exoplanets.json.gz, inflates it
 * (DecompressionStream), parses and packs it into typed arrays, matches its hosts to the star
 * catalogue (catalogue.ts matchHosts, ~50 ms), and hands everything back without copying. One
 * request per worker: the app starts it once and closes it after the reply.
 */
import { fetchGzip } from '../stars/catalogue';
import { catalogueTransfer, matchHosts, packCatalogue, type ExoplanetCatalogue, type ExoplanetCatalogueJson, type HostMatches, type StarCatalogueKeys } from './catalogue';

export type ExoplanetWorkerRequest = { url: string; stars: StarCatalogueKeys | null };
export type ExoplanetWorkerReply = { ok: true; catalogue: ExoplanetCatalogue; matches: HostMatches | null } | { ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<ExoplanetWorkerRequest>) => void) | null;
  postMessage(message: ExoplanetWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { url, stars } = e.data;
  void (async () => {
    try {
      const buf = await fetchGzip(url);
      const catalogue = packCatalogue(JSON.parse(new TextDecoder().decode(buf)) as ExoplanetCatalogueJson);
      const matches = stars ? matchHosts(catalogue, stars) : null;
      const transfer = catalogueTransfer(catalogue);
      if (matches) transfer.push(matches.star.buffer as ArrayBuffer, matches.by.buffer as ArrayBuffer);
      scope.postMessage({ ok: true, catalogue, matches }, transfer);
    } catch (err) {
      scope.postMessage({ ok: false, error: String(err) });
    }
  })();
};
