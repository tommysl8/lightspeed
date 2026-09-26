/**
 * The Learn library in the app: the article index (made at build time, so the hub never
 * loads an article) and lazy loading of one article's Markdown at a time.
 *
 * In development the index updates in place when an article is added, changed or removed,
 * and an open article reloads when its file is saved (see the learn-index plugin in
 * vite.config.ts).
 */
import { useSyncExternalStore } from 'react';
import { ARTICLES, WARNINGS } from 'virtual:learn-index';
import { SHELVES, type ArticleMeta, type ShelfId } from './catalogue';

/** One loader per article file; each article is its own small chunk, fetched on first read. */
const LOADERS = import.meta.glob<string>('./articles/*.md', { query: '?raw', import: 'default' });

let articles: readonly ArticleMeta[] = ARTICLES;
/** Bumped when a file changes in development, so an open article reloads. */
let revision = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

function warn(list: readonly string[]) {
  for (const w of list) console.warn(`[learn] ${w}`);
}
if (import.meta.env.DEV) warn(WARNINGS);

if (import.meta.hot) {
  import.meta.hot.accept('virtual:learn-index', (mod) => {
    if (!mod) return;
    articles = mod.ARTICLES as ArticleMeta[];
    revision++;
    warn(mod.WARNINGS as string[]);
    emit();
  });
}

/** Every listed article, in reading order (shelf by shelf). */
export const allArticles = (): readonly ArticleMeta[] => articles;
export const useArticles = (): readonly ArticleMeta[] => useSyncExternalStore(subscribe, allArticles, allArticles);
/** Changes whenever the index is reloaded in development. */
export const useLibraryRevision = (): number => {
  const get = () => revision;
  return useSyncExternalStore(subscribe, get, get);
};

export const findArticle = (slug: string | undefined): ArticleMeta | undefined =>
  slug ? articles.find((a) => a.slug === slug) : undefined;
export const hasArticle = (slug: string): boolean => articles.some((a) => a.slug === slug);

/** The articles on each shelf, in order (every shelf present, perhaps empty). */
export function shelves(list: readonly ArticleMeta[] = articles): { id: ShelfId; title: string; articles: ArticleMeta[] }[] {
  return SHELVES.map((s) => ({ ...s, articles: list.filter((a) => a.shelf === s.id) }));
}

/** The articles before and after one in reading order (across shelves). */
export function neighbours(slug: string, list: readonly ArticleMeta[] = articles): { prev?: ArticleMeta; next?: ArticleMeta } {
  const i = list.findIndex((a) => a.slug === slug);
  if (i < 0) return {};
  return { prev: list[i - 1], next: list[i + 1] };
}

/** The Markdown source of an article. */
export async function loadArticle(meta: ArticleMeta): Promise<string> {
  if (import.meta.env.DEV) {
    // Straight from the dev server as a file rather than a module: a saved edit shows on the
    // next load, and an article being written never triggers a module reload of the app.
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}src/content/learn/articles/${encodeURIComponent(meta.file)}`, { cache: 'no-store' });
      if (res.ok && !res.headers.get('content-type')?.includes('text/html')) return await res.text();
    } catch {
      /* fall back to the bundled module */
    }
  }
  const load = LOADERS[`./articles/${meta.file}`];
  if (!load) throw new Error(`No file for the article "${meta.slug}"`);
  return load();
}
