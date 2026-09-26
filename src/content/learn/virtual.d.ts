/** The Learn article index, made from src/content/learn/articles/*.md by vite.config.ts. */
declare module 'virtual:learn-index' {
  /** Every article that parses, in reading order (shelf, then order). */
  export const ARTICLES: import('./catalogue').ArticleMeta[];
  /** Files skipped or questionable, with the reason (development builds only; empty otherwise). */
  export const WARNINGS: string[];
}
