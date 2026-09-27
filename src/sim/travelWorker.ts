/**
 * Builds the Planck 2018 model's tables (physics/cosmology: the master table of t, η and the event
 * horizon, and the massive-neutrino table) off the main thread, and sends them back without copying.
 * The main thread adopts them (travelCosmic.ts), so nothing there pays the 45 to 110 ms they take.
 */
import { planck18Tables, type Planck18Tables } from '../physics/cosmology/cosmology.ts';

interface WorkerScope {
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
  postMessage(message: { ok: true; tables: Planck18Tables } | { ok: false; error: string }, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = () => {
  try {
    const tables = planck18Tables();
    const m = tables.master;
    const n = tables.nu;
    scope.postMessage({ ok: true, tables }, [m.t.buffer, m.eta.buffer, m.chiEH.buffer, m.invE.buffer, m.dlnE.buffer, n.g.buffer, n.g1.buffer, n.g2.buffer]);
  } catch (err) {
    scope.postMessage({ ok: false, error: String(err) });
  }
};
