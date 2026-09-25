/**
 * The laboratory event log: detector hits, logged readings, arrivals. Shown as a console
 * in the viewport and kept (last 200 entries) for the session.
 */
import { useSyncExternalStore } from 'react';
import { sim } from '../sim/sim';

export type EventKind = 'DET' | 'REC' | 'ARR' | 'EMIT' | 'SYS' | 'ERR';

export interface LabEvent {
  id: number;
  kind: EventKind;
  text: string;
  /** Simulation time, ms. */
  simMs: number;
  /** Wall-clock time (performance.now()), for fading. */
  at: number;
}

let list: LabEvent[] = [];
let seq = 0;
const subs = new Set<() => void>();

export function logEvent(kind: EventKind, text: string): void {
  list = [...list.slice(-199), { id: ++seq, kind, text, simMs: sim.timeMs, at: performance.now() }];
  for (const s of subs) s();
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const useLabEvents = (): LabEvent[] => useSyncExternalStore(subscribe, () => list);
