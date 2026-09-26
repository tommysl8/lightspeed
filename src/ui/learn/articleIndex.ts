/**
 * Which Learn articles exist, for buttons outside Learn ("Read" on a body's card) that should
 * only appear when there is something to read. The article index loads with Learn, not with
 * the app, so the first question fetches it; the answer is "no" until it arrives.
 */
import { useEffect, useReducer } from 'react';

let slugs: ReadonlySet<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): void {
  loading ??= import('../../content/learn/library')
    .then((lib) => {
      slugs = new Set(lib.allArticles().map((a) => a.slug));
      listeners.forEach((f) => f());
    })
    .catch(() => {
      loading = null; // offline: try again next time
    });
}

/** True once the index has loaded and lists the article. */
export function useHasArticle(slug: string | undefined): boolean {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!slug || slugs) return;
    listeners.add(bump);
    load();
    return () => {
      listeners.delete(bump);
    };
  }, [slug]);
  return !!slug && !!slugs?.has(slug);
}
