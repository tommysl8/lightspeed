/**
 * The Learn catalogue: the shelves, and everything the article index needs from one article's
 * Markdown source (front matter, section titles, word count).
 *
 * Pure string functions with no DOM and no Node APIs: vite.config.ts runs them at build and
 * dev time to make the index (the virtual module 'virtual:learn-index'), and the reader uses
 * the same heading slugs, so the contents list and the rendered headings always agree.
 */

export type ShelfId = 'light' | 'solar-system' | 'stars' | 'galaxies' | 'universe';

/** The shelves, in the order the hub shows them. */
export const SHELVES: readonly { id: ShelfId; title: string }[] = [
  { id: 'light', title: 'Light and relativity' },
  { id: 'solar-system', title: 'The Solar System' },
  { id: 'stars', title: 'Stars' },
  { id: 'galaxies', title: 'Galaxies' },
  { id: 'universe', title: 'The universe' },
];

const SHELF_IDS = new Set<string>(SHELVES.map((s) => s.id));

export interface ArticleSection {
  /** Heading slug; the rendered heading's element id is `doc-${id}`. */
  id: string;
  title: string;
}

export interface ArticleMeta {
  slug: string;
  title: string;
  shelf: ShelfId;
  order: number;
  pitch: string;
  /** YYYY-MM-DD. */
  updated: string;
  /** Words of prose (see countWords). */
  words: number;
  /** The '## ' sections, in order: the table of contents. */
  sections: ArticleSection[];
  /** True when the article has footnotes, which render as a "Notes" list at the end. */
  notes: boolean;
  /** File name in src/content/learn/articles/. */
  file: string;
}

/** Id of the footnote list at the end of an article (element id `doc-notes`). */
export const NOTES_ID = 'notes';

// ─── Front matter ───────────────────────────────────────────────────────────────────────

export type FrontMatter = { ok: true; data: Record<string, string>; body: string } | { ok: false; reason: string };

/**
 * Split "---\nkey: value\n---\nbody". Only simple `key: value` lines (values may be quoted);
 * blank lines and lines starting with # are ignored.
 */
export function splitFrontMatter(source: string): FrontMatter {
  const src = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (lines[i]?.trim() !== '---') return { ok: false, reason: 'no front matter (the file must start with a --- line)' };
  const data: Record<string, string> = {};
  for (i++; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') return { ok: true, data, body: lines.slice(i + 1).join('\n') };
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s?(.*)$/);
    if (!m) return { ok: false, reason: `front matter line ${i + 1} is not "key: value"` };
    data[m[1]] = unquote(m[2].trim());
  }
  return { ok: false, reason: 'the front matter is not closed with a --- line' };
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1);
  return v;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= days;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09-25" → "25 September 2026". */
export function formatIsoDate(s: string): string {
  if (!isIsoDate(s)) return s;
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ─── Headings ───────────────────────────────────────────────────────────────────────────

/** A heading's text without Markdown: emphasis marks, code ticks, link targets, maths dollars. */
export function plainHeading(raw: string): string {
  return raw
    .replace(/\[\^[^\]]*\]/g, '') // footnote references
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images: keep the text
    .replace(/\\([\\`*_{}[\]()#+\-.!$])/g, '$1') // backslash escapes
    .replace(/(\*\*|__|\*|_|`|\$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Curly quotes and apostrophes for straight ones, as the reader's Markdown renderer sets them
 * in the text, so titles in lists match the headings: "Newton's" → "Newton’s".
 */
export function smartQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{\-–—])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{\-–—])'/g, '$1‘')
    .replace(/'/g, '’');
}

/**
 * ASCII slug for a heading: "Doppler's coloured stars" → "dopplers-coloured-stars",
 * "Paris and Cayenne, 1672" → "paris-and-cayenne-1672", "Rømer" → "romer". Letters with no
 * ASCII form (γ) are dropped. Never contains "--", which h3 ids use as a separator.
 */
export function headingSlug(raw: string): string {
  return plainHeading(raw)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/['’‘]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Unique ids for a document's sections. "notes" is taken by the footnote list, so a section
 * called Notes becomes notes-2; repeated titles get -2, -3.
 */
export function createSlugger(reserved: readonly string[] = [NOTES_ID]): (raw: string) => string {
  const seen = new Map<string, number>(reserved.map((r) => [r, 1]));
  return (raw) => {
    const base = headingSlug(raw) || 'section';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
/** ATX headings of level 1 or 2 ('# ' is read as '## ': an article's only h1 is its title). */
const H2_RE = /^ {0,3}#{1,2}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/** The '## ' sections of a Markdown body, outside fenced code. */
export function sectionsOf(body: string): ArticleSection[] {
  const slug = createSlugger();
  const out: ArticleSection[] = [];
  let fence: string | null = null;
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const h = line.match(H2_RE);
    if (h && h[1].trim()) out.push({ id: slug(h[1]), title: smartQuotes(plainHeading(h[1])) });
  }
  return out;
}

// ─── Words and reading time ─────────────────────────────────────────────────────────────

/** Words read per minute, for reading times. */
export const WORDS_PER_MINUTE = 230;

/**
 * Words of prose in a Markdown body: what a reader actually reads. The reference list (from
 * '## Further reading' on), footnote definitions, URLs, display maths and the directive
 * lines of see-it and figure boxes are left out; numbers such as 299,792 count as one word.
 */
export function countWords(body: string): number {
  let text = body.replace(/\r\n?/g, '\n');
  const further = text.search(/^ {0,3}#{1,2}[ \t]+Further reading\b/im);
  if (further >= 0) text = text.slice(0, further);
  text = text
    .replace(/^\[\^[^\]]+\]:.*(?:\n(?: {2,}|\t).*)*/gm, '') // footnote definitions (and indented continuations)
    .replace(/^ {0,3}:::[ \t]*(?:see-it|figure)\b.*$/gm, '') // scene specs and figure ids are not prose
    .replace(/^ {0,3}:::[ \t]*(?:note|myth|numbers|timeline)\b/gm, '') // keep their titles
    .replace(/^ {0,3}:::[ \t]*$/gm, '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\]\([^)]*\)/g, ']') // link targets
    .replace(/<https?:[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[\^[^\]]+\]/g, ' ');
  return text.match(/[\p{L}\p{N}]+(?:['’.,\-–][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** Whole minutes at WORDS_PER_MINUTE, at least one. */
export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / WORDS_PER_MINUTE));

// ─── One article, and the index of all of them ──────────────────────────────────────────

export type ParsedArticle = { ok: true; meta: ArticleMeta } | { ok: false; reason: string };

/** Front matter, sections and word count of one article, or why it cannot be listed yet. */
export function parseArticle(source: string, file: string): ParsedArticle {
  const fm = splitFrontMatter(source);
  if (!fm.ok) return fm;
  const d = fm.data;
  const missing = ['slug', 'title', 'shelf', 'order', 'pitch', 'updated'].filter((k) => !d[k]);
  if (missing.length) return { ok: false, reason: `missing ${missing.join(', ')} in the front matter` };
  if (!SLUG_RE.test(d.slug)) return { ok: false, reason: `slug "${d.slug}" must be lower-case words joined by hyphens` };
  if (!SHELF_IDS.has(d.shelf)) return { ok: false, reason: `shelf "${d.shelf}" is not one of ${[...SHELF_IDS].join(', ')}` };
  if (!/^-?\d+$/.test(d.order)) return { ok: false, reason: `order "${d.order}" is not a whole number` };
  if (!isIsoDate(d.updated)) return { ok: false, reason: `updated "${d.updated}" is not a date written YYYY-MM-DD` };
  if (!fm.body.trim()) return { ok: false, reason: 'no text after the front matter' };
  return {
    ok: true,
    meta: {
      slug: d.slug,
      title: smartQuotes(d.title),
      shelf: d.shelf as ShelfId,
      order: Number(d.order),
      pitch: smartQuotes(d.pitch),
      updated: d.updated,
      words: countWords(fm.body),
      sections: sectionsOf(fm.body),
      notes: /^\[\^[^\]\s]+\]:/m.test(fm.body) && /\[\^[^\]\s]+\](?!:)/.test(fm.body),
      file,
    },
  };
}

/** Shelf order, then each article's order, then title. */
export function compareArticles(a: ArticleMeta, b: ArticleMeta): number {
  const shelf = SHELVES.findIndex((s) => s.id === a.shelf) - SHELVES.findIndex((s) => s.id === b.shelf);
  return shelf || a.order - b.order || a.title.localeCompare(b.title);
}

/**
 * The index: every article that parses, in reading order, and a warning for each file that
 * was skipped (half-written, malformed, or a second use of a slug).
 */
export function buildIndex(files: readonly { file: string; source: string }[]): { articles: ArticleMeta[]; warnings: string[] } {
  const articles: ArticleMeta[] = [];
  const warnings: string[] = [];
  const bySlug = new Map<string, string>();
  for (const { file, source } of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    let parsed: ParsedArticle;
    try {
      parsed = parseArticle(source, file);
    } catch (e) {
      parsed = { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (!parsed.ok) {
      warnings.push(`${file} skipped: ${parsed.reason}`);
      continue;
    }
    const { meta } = parsed;
    const taken = bySlug.get(meta.slug);
    if (taken) {
      warnings.push(`${file} skipped: slug "${meta.slug}" is already used by ${taken}`);
      continue;
    }
    if (file.replace(/\.md$/, '') !== meta.slug) warnings.push(`${file}: slug "${meta.slug}" differs from the file name`);
    bySlug.set(meta.slug, file);
    articles.push(meta);
  }
  articles.sort(compareArticles);
  return { articles, warnings };
}
