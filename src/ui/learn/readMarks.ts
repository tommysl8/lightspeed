/**
 * Which Learn articles this reader has finished, kept in localStorage so the hub can tick
 * them. Storage can be unavailable (private windows, blocked site data): then ticks last for
 * the visit only.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'lightspeed.learnRead';

function load(): ReadonlySet<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

let marks = load();
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const isRead = (slug: string): boolean => marks.has(slug);

export function setRead(slug: string, read: boolean): void {
  if (marks.has(slug) === read) return;
  const next = new Set(marks);
  if (read) next.add(slug);
  else next.delete(slug);
  marks = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* storage unavailable: the tick lasts for this visit */
  }
  listeners.forEach((f) => f());
}

const snapshot = () => marks;
/** The slugs marked read (a new set after every change). */
export const useReadMarks = (): ReadonlySet<string> => useSyncExternalStore(subscribe, snapshot, snapshot);
