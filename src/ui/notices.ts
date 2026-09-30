/**
 * Notices: one-line messages that say why something asked for did not happen (Roam refused during a
 * trip, a guide's button pressed in flight). The view shows the last few in its corner, fading out, and
 * screen readers hear them at once. The last 50 are kept for the session.
 */
import { useSyncExternalStore } from 'react';
import { sim } from '../sim/sim';

export interface Notice {
  id: number;
  text: string;
  /** Simulation time, ms. */
  simMs: number;
  /** Wall-clock time (performance.now()), for fading. */
  at: number;
}

let list: Notice[] = [];
let seq = 0;
const subs = new Set<() => void>();

/** Say why something did not happen. */
export function notice(text: string): void {
  list = [...list.slice(-49), { id: ++seq, text, simMs: sim.timeMs, at: performance.now() }];
  for (const s of subs) s();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const useNotices = (): Notice[] => useSyncExternalStore(subscribe, () => list);

/** The notices so far (outside React: the tests). */
export const notices = (): readonly Notice[] => list;
