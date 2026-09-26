/**
 * Reading pages (the guide, Learn and the About page) live in the URL hash, so they can be
 * linked to, bookmarked and closed with the browser's Back button:
 *
 *   #/guide, #/guide/flying          the guide, at a chapter
 *   #/learn                          the Learn hub
 *   #/learn/<slug>[/<section>]       an article, at a section
 *   #/about
 *
 * Everything else is ordinary application state.
 */
import { useSyncExternalStore } from 'react';

export type DocPage = 'guide' | 'learn' | 'about';
export interface DocRoute {
  page: DocPage;
  /** Learn only: the article open (none: the hub). */
  article?: string;
  /** Chapter or section to show. */
  section?: string;
}

const ID = '[\\w-]+';
const DOC_RE = new RegExp(`^#/(guide|manual|about)(?:/(${ID}))?/?$`);
const LEARN_RE = new RegExp(`^#/learn(?:/(${ID})(?:/(${ID}))?)?/?$`);

/** The reading page a hash names, or null. */
export function parseHash(hash: string): DocRoute | null {
  const l = hash.match(LEARN_RE);
  if (l) return { page: 'learn', article: l[1], section: l[1] ? l[2] : undefined };
  // "manual" is the guide's old name; old links still open it.
  const m = hash.match(DOC_RE);
  return m ? { page: m[1] === 'about' ? 'about' : 'guide', section: m[2] } : null;
}

/** The hash for a reading page. */
export function hashOf(route: DocRoute): string {
  if (route.page === 'learn') {
    if (!route.article) return '#/learn';
    return `#/learn/${route.article}${route.section ? `/${route.section}` : ''}`;
  }
  return `#/${route.page}${route.section ? `/${route.section}` : ''}`;
}

const hasWindow = typeof window !== 'undefined';
let current: DocRoute | null = hasWindow ? parseHash(window.location.hash) : null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/**
 * History entries pushed by the app carry how many of them sit on top of the view
 * ({ docDepth: n }), so closing can go straight back to the view (history.go(-n)) and the
 * browser's Back button walks back through the articles read.
 */
const depthOf = (state: unknown): number => {
  const d = (state as { docDepth?: unknown } | null)?.docDepth;
  return typeof d === 'number' && d > 0 ? d : 0;
};
/** Set while closeDoc waits for the browser to go back. */
let closing = false;

const same = (a: DocRoute | null, b: DocRoute | null) =>
  a?.page === b?.page && a?.article === b?.article && a?.section === b?.section;

function sync() {
  let next = parseHash(window.location.hash);
  if (closing) {
    closing = false;
    // Went back to an entry that is still a reading page (one typed or linked into, which the
    // app did not push): clear it, so closing always ends on the view.
    if (next) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      next = null;
    }
  }
  if (!same(next, current)) {
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

/**
 * Show a reading page. From the view this adds one history entry (Back closes the page);
 * between pages it replaces the entry, unless `push` asks for a new one (an article opened
 * from the hub or from another article, so Back returns to it). Every call gives a new route
 * object, so the reading view goes to its section even when the address has not changed (a
 * link to the section already named, after the reader scrolled away from it).
 */
function navigate(route: DocRoute, push: boolean): void {
  const hash = hashOf(route);
  if (!current) {
    window.history.pushState({ docDepth: 1 }, '', hash);
  } else if (push) {
    window.history.pushState({ docDepth: depthOf(window.history.state) + 1 }, '', hash);
  } else {
    window.history.replaceState(window.history.state, '', hash);
  }
  closing = false;
  current = route;
  emit();
}

/** Open a reading page (or move within one without adding history entries). */
export function openDoc(page: DocPage, section?: string): void {
  navigate({ page, section }, false);
}

/**
 * Open Learn: the hub, or an article (at a section). Opening an article from Learn adds a
 * history entry so the browser's Back button returns to where the reader was.
 */
export function openLearn(slug?: string, section?: string): void {
  const route: DocRoute = { page: 'learn', article: slug, section: slug ? section : undefined };
  const push = !!slug && current?.page === 'learn' && current.article !== slug;
  navigate(route, push);
}

/**
 * Record the section being read in the address, without moving or adding history. The open
 * route follows it in place (the same object, and no listener is told), so nothing re-renders
 * or scrolls: the reader is already there. A later link to another section, or back to this
 * one, is then a real change.
 */
export function replaceDocSection(section: string | undefined): void {
  if (!current) return;
  current.section = section;
  window.history.replaceState(window.history.state, '', hashOf(current));
}

/** Close the reading page and return to the view. */
export function closeDoc(): void {
  // (Twice in a row, say Escape and a click, must not take the browser back twice.)
  if (!current || closing) return;
  const depth = depthOf(window.history.state);
  if (depth > 0) {
    closing = true;
    window.history.go(-depth); // the popstate closes the page
    return;
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  current = null;
  emit();
}
