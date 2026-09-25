/**
 * Reading pages (the manual and the About page) live in the URL hash, so they can be linked
 * to, bookmarked and closed with the browser's Back button: #/manual, #/manual/flying,
 * #/about. Everything else is ordinary application state.
 */
import { useSyncExternalStore } from 'react';

export type DocPage = 'manual' | 'about';
export interface DocRoute {
  page: DocPage;
  section?: string;
}

function parse(hash: string): DocRoute | null {
  const m = hash.match(/^#\/(manual|about)(?:\/([\w-]+))?\/?$/);
  return m ? { page: m[1] as DocPage, section: m[2] } : null;
}

const hasWindow = typeof window !== 'undefined';
let current: DocRoute | null = hasWindow ? parse(window.location.hash) : null;
/** True when the open page was pushed by the app, so closing it can simply go back. */
let pushed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function sync() {
  const next = parse(window.location.hash);
  if (!next) pushed = false;
  if (next?.page !== current?.page || next?.section !== current?.section) {
    current = next;
    emit();
  }
}

if (hasWindow) {
  // Back/forward over pushState entries fires popstate; typed or linked hashes fire hashchange.
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** The open reading page, or null. */
export const useDocRoute = (): DocRoute | null => useSyncExternalStore(subscribe, () => current);
export const docRoute = (): DocRoute | null => current;

const hashOf = (page: DocPage, section?: string) => `#/${page}${section ? `/${section}` : ''}`;

/** Open a reading page (or move within one without adding history entries). */
export function openDoc(page: DocPage, section?: string): void {
  const hash = hashOf(page, section);
  if (current) {
    window.history.replaceState(null, '', hash);
  } else {
    window.history.pushState(null, '', hash);
    pushed = true;
  }
  current = { page, section };
  emit();
}

/** Close the reading page and return to the laboratory. */
export function closeDoc(): void {
  if (!current) return;
  if (pushed) {
    pushed = false;
    window.history.back(); // the hashchange closes the page
    return;
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  current = null;
  emit();
}
