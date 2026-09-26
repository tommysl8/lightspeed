/**
 * Markdown to HTML for Learn articles: CommonMark with GFM tables, KaTeX maths, footnotes and
 * the article containers (see-it, note, myth, numbers, timeline, figure).
 *
 * Plain strings in and out, with no DOM, so it runs in the unit tests. The page fills the
 * placeholders it leaves for interactive parts: [data-scene] boxes get a "See it in
 * Lightspeed" button and [data-figure] boxes get their drawing.
 *
 * Safety: raw HTML in the source is shown as text (html: false), links keep only http(s)
 * and in-app #/ targets, and images only same-site paths.
 */
import MarkdownIt, { type PluginSimple, type PluginWithParams, type StateCore, type Token } from 'markdown-it';
import containerPlugin from 'markdown-it-container';
import footnotePlugin from 'markdown-it-footnote';
import { parseHash } from '../../state/route';
import { createSlugger, headingSlug, NOTES_ID, splitFrontMatter } from './catalogue';
import { mathPlugin } from './mathPlugin';

export interface RenderEnv {
  /** Articles that exist. A link to any other #/learn/<slug> renders as plain text marked "coming soon". */
  knownSlugs?: ReadonlySet<string>;
}

/** Figure ids the reader can draw (the others show their caption only). */
export const FIGURE_IDS: readonly string[] = ['aberration'];

// The plugins' type packages describe markdown-it's CommonJS build, whose types TypeScript
// keeps apart from the ES module's; at run time they are the same object.
const container = containerPlugin as unknown as PluginWithParams;
const footnote = footnotePlugin as unknown as PluginSimple;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ─── Links ──────────────────────────────────────────────────────────────────────────────

type LinkKind = 'external' | 'app' | 'soon' | 'drop';

function classifyLink(href: string, env: RenderEnv): LinkKind {
  if (/^https?:\/\/[^\s/]/i.test(href)) return 'external';
  if (href.startsWith('#/')) {
    const route = parseHash(href);
    if (!route) return 'drop';
    if (route.page === 'learn' && route.article && env.knownSlugs && !env.knownSlugs.has(route.article)) return 'soon';
    return 'app';
  }
  return 'drop';
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * A bare URL, shortened for reading: DOIs as doi:10.x/y, arXiv papers as arXiv:2401.01234,
 * anything else without its scheme and cut to about 48 characters.
 */
export function compactUrl(href: string): string {
  const doi = href.match(/^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i);
  if (doi) return `doi:${safeDecode(doi[1])}`;
  const arxiv = href.match(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/i);
  if (arxiv) return `arXiv:${arxiv[1]}`;
  const bare = safeDecode(href.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, ''));
  return bare.length > 48 ? `${bare.slice(0, 46)}…` : bare;
}

const isYouTube = (href: string) => /^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(href);

/** Sort out every link: external ones open in a new tab, app ones stay, the rest become text. */
function links(state: StateCore): void {
  const env = state.env as RenderEnv;
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const out: Token[] = [];
    const stack: LinkKind[] = [];
    const kids = block.children;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      if (t.type === 'link_open') {
        const href = t.attrGet('href') ?? '';
        const kind = classifyLink(href, env);
        stack.push(kind);
        if (kind === 'drop') continue;
        if (kind === 'soon') {
          t.tag = 'span';
          t.attrs = [
            ['class', 'learn-xref-soon'],
            ['title', 'Coming soon'],
          ];
        } else if (kind === 'external') {
          t.attrSet('target', '_blank');
          t.attrSet('rel', 'noopener noreferrer');
          if (isYouTube(href)) t.attrJoin('class', 'learn-yt');
          const text = kids[i + 1];
          // A bare URL (linkified, or <https://…>) reads better shortened; the full one is the tooltip.
          if ((t.markup === 'linkify' || t.markup === 'autolink') && text?.type === 'text') {
            text.content = compactUrl(href);
            t.attrSet('title', href);
            t.attrJoin('class', 'learn-url');
          }
        } else {
          t.attrJoin('class', 'learn-xref');
        }
        out.push(t);
      } else if (t.type === 'link_close') {
        const kind = stack.pop();
        if (kind === 'drop') continue;
        if (kind === 'soon') t.tag = 'span';
        out.push(t);
      } else if (t.type === 'image') {
        const src = t.attrGet('src') ?? '';
        if (/^\/(?!\/)/.test(src)) {
          t.attrSet('loading', 'lazy');
          out.push(t);
        } else {
          // Images from elsewhere would track readers: keep the description only.
          const alt = new state.Token('text', '', 0);
          alt.content = t.content;
          out.push(alt);
        }
      } else {
        out.push(t);
      }
    }
    block.children = out;
  }
}

// ─── Headings and the reference list ────────────────────────────────────────────────────

type RefKind = 'paper' | 'book' | 'video' | 'web';

const REF_KINDS: [RegExp, RefKind][] = [
  [/paper|article|journal/i, 'paper'],
  [/book/i, 'book'],
  [/video|watch|film|listen|podcast/i, 'video'],
];

/** Line icons on the 12 px grid of the app's icon set. */
const REF_ICONS: Record<RefKind, string> = {
  paper: '<path d="M3 1.5h4.2L9.5 3.8v6.7H3z"/><path d="M7 1.5v2.5h2.5M4.6 6h3.3M4.6 8h3.3"/>',
  book: '<path d="M6 3C4.8 2 3.2 1.8 1.5 2v8c1.7-.2 3.3 0 4.5 1 1.2-1 2.8-1.2 4.5-1V2C8.8 1.8 7.2 2 6 3z"/><path d="M6 3v8"/>',
  video: '<rect x="1.5" y="2.5" width="9" height="7"/><path d="M5 4.4v3.2L7.6 6z" fill="currentColor"/>',
  web: '<circle cx="6" cy="6" r="4.5"/><path d="M1.5 6h9M6 1.5c-1.6 1.4-1.6 7.6 0 9M6 1.5c1.6 1.4 1.6 7.6 0 9"/>',
};

const icon = (kind: RefKind) =>
  `<svg class="learn-refs-icon" width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">${REF_ICONS[kind]}</svg>`;

/**
 * Ids on headings (h2 `doc-<slug>`, the same slugs as the index's contents; h3
 * `doc-<h2>--<slug>`), '# ' read as '## ', and the "Further reading" section marked up as a
 * reference list: an icon for each '### ' kind and a class on its lists.
 */
function headings(state: StateCore): void {
  const h2 = createSlugger();
  const h3 = new Map<string, number>();
  let section = '';
  let inRefs = false;
  let refKind: RefKind | null = null;
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const raw = tokens[i + 1]?.type === 'inline' ? tokens[i + 1].content : '';
      if (t.tag === 'h1' || t.tag === 'h2') {
        if (t.tag === 'h1') {
          t.tag = 'h2';
          const close = tokens.slice(i).find((x) => x.type === 'heading_close');
          if (close) close.tag = 'h2';
        }
        section = h2(raw);
        t.attrSet('id', `doc-${section}`);
        inRefs = /^further reading/i.test(raw.trim());
        refKind = null;
        if (inRefs) t.attrJoin('class', 'learn-refs-h2');
      } else if (t.tag === 'h3') {
        const base = `${section}--${headingSlug(raw) || 'part'}`;
        const n = (h3.get(base) ?? 0) + 1;
        h3.set(base, n);
        t.attrSet('id', `doc-${n === 1 ? base : `${base}-${n}`}`);
        if (inRefs) {
          refKind = REF_KINDS.find(([re]) => re.test(raw))?.[1] ?? 'web';
          t.attrJoin('class', 'learn-refs-h');
          t.meta = { refIcon: refKind };
        }
      }
    } else if (inRefs && (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && t.level === 0) {
      t.attrJoin('class', `learn-refs learn-refs-${refKind ?? 'web'}`);
    }
  }
}

// ─── Timelines ──────────────────────────────────────────────────────────────────────────

/**
 * In a timeline box, list items that start with a bold date ("- **1676:** Rømer ...") get
 * the date split off, to be set in its own column.
 */
function timelines(state: StateCore): void {
  const tokens = state.tokens;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'container_timeline_open') depth++;
    else if (t.type === 'container_timeline_close') depth--;
    if (!depth) continue;
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') t.attrJoin('class', 'learn-tl');
    if (t.type !== 'list_item_open') continue;
    const inline = tokens.slice(i + 1).find((x) => x.type === 'inline' || x.type === 'list_item_close');
    // (The emphasis rules can leave an empty text token in front.)
    const kids = inline?.type === 'inline' ? inline.children?.filter((k, n) => n > 0 || k.type !== 'text' || k.content !== '') : null;
    if (!inline || !kids || kids[0]?.type !== 'strong_open' || kids[1]?.type !== 'text' || kids[2]?.type !== 'strong_close') continue;
    let date = kids[1].content.trim();
    const after = kids[3];
    if (date.endsWith(':')) date = date.slice(0, -1).trim();
    else if (after?.type === 'text' && after.content.startsWith(':')) after.content = after.content.slice(1);
    if (!date) continue;
    if (after?.type === 'text') after.content = after.content.replace(/^\s+/, '');
    inline.children = kids.slice(3);
    // The item's close is the next list_item_close at this item's level.
    const close = tokens.slice(i + 1).find((x) => x.type === 'list_item_close' && x.level === t.level);
    t.meta = { ...(t.meta ?? {}), date };
    if (close) close.meta = { ...(close.meta ?? {}), date };
  }
}

// ─── Containers ─────────────────────────────────────────────────────────────────────────

const argOf = (info: string, name: string) => info.trim().slice(name.length).trim();

function containers(md: MarkdownIt): void {
  // Titles get a fresh env: the document's env holds its footnotes, and the footnote plugin
  // would append the whole list to anything rendered with it.
  const inline = (s: string, env: unknown) => md.renderInline(s, { knownSlugs: (env as RenderEnv | undefined)?.knownSlugs });
  const box = (name: string, open: (arg: string, env: unknown) => string, close: string) =>
    md.use(container, name, {
      validate: (params: string) => params.trim().split(/\s+/, 1)[0] === name,
      render: (tokens: Token[], idx: number, _o: unknown, env: unknown) =>
        tokens[idx].nesting === 1 ? open(argOf(tokens[idx].info, name), env) : close,
    });

  box(
    'see-it',
    (spec) =>
      `<aside class="learn-seeit" data-scene="${esc(spec)}"><div class="learn-seeit-act"></div><div class="learn-seeit-cap">\n`,
    '</div></aside>\n',
  );
  box('note', (title, env) => `<div class="note doc-note learn-note"><span class="note-t">${inline(title || 'Note', env)}</span>\n`, '</div>\n');
  box(
    'myth',
    (myth, env) =>
      `<div class="learn-myth"><p class="learn-myth-claim"><span class="learn-myth-k">Myth:</span> ${inline(myth, env)}</p><div class="learn-myth-fact">\n`,
    '</div></div>\n',
  );
  box('numbers', (title, env) => `<aside class="learn-numbers"><div class="learn-box-t">${inline(title, env)}</div>\n`, '</aside>\n');
  box('timeline', (title, env) => `<section class="learn-timeline"><div class="learn-box-t">${inline(title, env)}</div>\n`, '</section>\n');
  box(
    'figure',
    (id) =>
      FIGURE_IDS.includes(id)
        ? `<figure class="doc-fig learn-fig" data-figure="${esc(id)}"><div class="doc-fig-body learn-fig-body"></div><figcaption>\n`
        : `<figure class="learn-fig learn-fig-caption"><figcaption>\n`,
    '</figcaption></figure>\n',
  );
}

// ─── Footnotes ──────────────────────────────────────────────────────────────────────────

interface FootnoteMeta {
  id: number;
  subId?: number;
}

/** Numbered superscripts that link to a "Notes" list at the end, each note linking back. */
function footnotes(md: MarkdownIt): void {
  md.use(footnote);
  const r = md.renderer.rules;
  const refId = (m: FootnoteMeta) => `${m.id + 1}${m.subId ? `-${m.subId}` : ''}`;
  r.footnote_ref = (tokens, idx) => {
    const m = tokens[idx].meta as FootnoteMeta;
    const n = m.id + 1;
    // Citations side by side read "3,4", not "34".
    const sep = tokens[idx - 1]?.type === 'footnote_ref' ? '<sup class="learn-fnsep">,</sup>' : '';
    return `${sep}<sup class="learn-fnref"><a href="#doc-fn-${n}" id="doc-fnref-${refId(m)}" aria-label="Note ${n}">${n}</a></sup>`;
  };
  r.footnote_block_open = () =>
    `<section class="learn-notes" id="doc-${NOTES_ID}" aria-labelledby="doc-${NOTES_ID}-h"><h2 id="doc-${NOTES_ID}-h">Notes</h2>\n<ol class="learn-notes-list">\n`;
  r.footnote_block_close = () => '</ol>\n</section>\n';
  r.footnote_open = (tokens, idx) => `<li id="doc-fn-${(tokens[idx].meta as FootnoteMeta).id + 1}">`;
  r.footnote_close = () => '</li>\n';
  r.footnote_anchor = (tokens, idx, _o, env) => {
    const m = tokens[idx].meta as FootnoteMeta;
    const count = (env as { footnotes?: { list?: { count?: number }[] } }).footnotes?.list?.[m.id]?.count ?? 1;
    // One back-link per place the note is cited: ↑, or ↑a ↑b … when there are several.
    const letter = count > 1 ? `<sup>${String.fromCharCode(97 + ((m.subId ?? 0) % 26))}</sup>` : '';
    return ` <a href="#doc-fnref-${refId(m)}" class="learn-fnback" aria-label="Back to the text">↑${letter}</a>`;
  };
}

// ─── Lists and tables ───────────────────────────────────────────────────────────────────

function blocks(md: MarkdownIt): void {
  const r = md.renderer.rules;
  // Tables scroll sideways on a phone rather than squeezing the page.
  r.table_open = () => '<div class="learn-tbl"><table class="doc-tbl">\n';
  r.table_close = () => '</table></div>\n';
  r.list_item_open = (tokens, idx, options, _env, self) => {
    const date = (tokens[idx].meta as { date?: string } | null)?.date;
    if (date) return `<li class="learn-tl-item"><span class="learn-tl-date">${esc(date)}</span><div class="learn-tl-body">`;
    return self.renderToken(tokens, idx, options);
  };
  r.list_item_close = (tokens, idx, options, _env, self) =>
    (tokens[idx].meta as { date?: string } | null)?.date ? '</div></li>\n' : self.renderToken(tokens, idx, options);
  r.heading_open = (tokens, idx, options, _env, self) => {
    const kind = (tokens[idx].meta as { refIcon?: RefKind } | null)?.refIcon;
    return self.renderToken(tokens, idx, options) + (kind ? icon(kind) : '');
  };
}

// ─── The renderer ───────────────────────────────────────────────────────────────────────

let shared: MarkdownIt | null = null;

/** The configured parser (made once). */
export function learnMarkdown(): MarkdownIt {
  if (shared) return shared;
  const md = new MarkdownIt('default', { html: false, linkify: true, typographer: true });
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
  // Smart quotes yes; "(c)" → © and friends no: science writing has (a), (b), (c) lists.
  md.disable('replacements');
  // Every link is vetted by the links rule instead (which drops what it does not allow).
  md.validateLink = () => true;
  md.use(mathPlugin);
  footnotes(md);
  containers(md);
  blocks(md);
  md.core.ruler.push('learn_links', links);
  md.core.ruler.push('learn_headings', headings);
  md.core.ruler.push('learn_timelines', timelines);
  shared = md;
  return md;
}

/** An article body (Markdown without front matter) as HTML. */
export function renderMarkdown(body: string, env: RenderEnv = {}): string {
  // A fresh env per render: footnotes are collected in it.
  return learnMarkdown().render(body, { ...env });
}

/** A whole article file: its front matter (when present) and its body as HTML. */
export function renderArticle(source: string, env: RenderEnv = {}): { data: Record<string, string>; html: string } {
  const fm = splitFrontMatter(source);
  return fm.ok ? { data: fm.data, html: renderMarkdown(fm.body, env) } : { data: {}, html: renderMarkdown(source, env) };
}
