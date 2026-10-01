/**
 * The small bodies' names and numbers for "Where to?" (format.ts names.bin.gz, 640 kB): loaded when the palette first
 * opens, never at start. Every numbered body is found by its number, the 26,000 named ones by name, the comets by
 * designation or name ("NEOWISE").
 */
import { retryAfterMs } from '../../lib/retry';
import { gunzipIfNeeded } from '../stars/catalogue';
import { decodeNames, type NamesFile } from './format';
import { ASTEROID_BASE_URL } from './load';

export const smallNames = {
  file: null as NamesFile | null,
  /** Named bodies as [number, name, normalised name]; comets as [designation, section, index, normalised]. */
  named: [] as [number, string, string][],
  comets: [] as [string, number, number, string][],
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  failures: 0,
  retryAt: 0,
  version: 0,
};

const listeners = new Set<() => void>();
export const smallNamesVersion = (): number => smallNames.version;
export function subscribeSmallNames(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let pending: Promise<NamesFile | null> | null = null;

/** The names, fetched once (again after a failure, once its wait is over). `normalise` is the search's own. */
export function loadSmallNames(normalise: (s: string) => string): Promise<NamesFile | null> {
  if (smallNames.file) return Promise.resolve(smallNames.file);
  if (pending) return pending;
  if (performance.now() < smallNames.retryAt) return Promise.resolve(null);
  smallNames.status = 'loading';
  pending = fetch(`${ASTEROID_BASE_URL}names.bin.gz`)
    .then((r) => {
      if (!r.ok) throw new Error(`asteroid names: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then(async (raw) => {
      const f = decodeNames(await gunzipIfNeeded(raw));
      smallNames.file = f;
      smallNames.named = [...f.named].map(([n, name]) => [n, name, normalise(name)]);
      smallNames.comets = f.comets.map(([d, s, i]) => [d, s, i, normalise(d)]);
      smallNames.status = 'ready';
      smallNames.version++;
      listeners.forEach((l) => l());
      return f;
    })
    .catch((err) => {
      console.warn('[lightspeed] asteroid names failed to load', err);
      smallNames.status = 'failed';
      smallNames.failures++;
      smallNames.retryAt = performance.now() + retryAfterMs(smallNames.failures);
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
