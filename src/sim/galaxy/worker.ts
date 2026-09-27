/**
 * The Galaxy's worker: fetches and inflates the particle model and the star clusters, splits the
 * particles into the arrays the GPU takes, draws the globular clusters' clumps and works out the
 * face-on dust maps and the young arm stars' map for the glow (about half a second), all off the
 * main thread. The arrays go back without copying.
 */
import { buildGalaxyData, galaxyTransfer, type GalaxyWorkerReply, type GalaxyWorkerRequest } from './galaxyData';

interface WorkerScope {
  onmessage: ((e: MessageEvent<GalaxyWorkerRequest>) => void) | null;
  postMessage(message: GalaxyWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, particlesUrl, clustersUrl } = e.data;
  void (async () => {
    try {
      const data = await buildGalaxyData(particlesUrl, clustersUrl);
      scope.postMessage({ id, ok: true, data }, galaxyTransfer(data));
    } catch (err) {
      scope.postMessage({ id, ok: false, error: String(err) });
    }
  })();
};
