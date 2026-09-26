/**
 * The text of a Learn article: its Markdown rendered to HTML, with the interactive parts
 * (the "See it in Lightspeed" buttons and the figures) mounted into the placeholders the
 * renderer leaves. Loaded on first read with markdown-it and KaTeX, which the rest of the app
 * does not need.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import 'katex/dist/katex.min.css';
import type { ArticleMeta } from '../../content/learn/catalogue';
import { loadArticle, useArticles, useLibraryRevision } from '../../content/learn/library';
import { renderArticle } from '../../content/learn/markdown';
import { runScene, sceneStatus } from '../../content/scenes';
import { registryVersion, subscribeRegistry } from '../../sim/bodies';
import { closeDoc, openDoc, openLearn, parseHash } from '../../state/route';
import { useUI } from '../../state/ui';
import { AberrationFigure } from '../docs/figures';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Scroll the reading page to an element and give it focus (for footnotes and their back-links). */
function scrollToElement(el: HTMLElement): void {
  const sc = el.closest<HTMLElement>('.doc-scroll');
  if (sc) {
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16;
    sc.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
  }
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  el.focus({ preventScroll: true });
  el.classList.remove('learn-target');
  void el.offsetWidth; // restart the highlight if it is already showing
  el.classList.add('learn-target');
  window.setTimeout(() => el.classList.remove('learn-target'), 1600);
}

/** "See it in Lightspeed": close the page and set the scene up, or say why it cannot. */
function SeeIt({ spec }: { spec: string }) {
  useUI((s) => s.tripActive); // a flight under way blocks every scene
  // Bodies registered after the page opened (the moons' data arriving) make scenes possible.
  useSyncExternalStore(subscribeRegistry, registryVersion);
  const status = sceneStatus(spec);
  return (
    <>
      <button
        type="button"
        className="learn-seeit-btn"
        disabled={!status.ok}
        title={status.ok ? status.label : status.reason}
        onClick={() => {
          closeDoc();
          runScene(spec);
        }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
        </svg>
        See it in Lightspeed
      </button>
      <span className={`learn-seeit-what ${status.ok ? '' : 'is-off'}`}>{status.ok ? status.label : status.reason}</span>
    </>
  );
}

function Figure({ id }: { id: string }) {
  return id === 'aberration' ? <AberrationFigure /> : null;
}

interface Slot {
  el: HTMLElement;
  kind: 'scene' | 'figure';
  value: string;
}

export default function ArticleBody({
  meta,
  onReady,
  onFinished,
}: {
  meta: ArticleMeta;
  /** The text is in the page (so a section can be scrolled to). */
  onReady: () => void;
  /** The reader has reached the end of the text proper (the reading list or the notes). */
  onFinished: () => void;
}) {
  const articles = useArticles();
  const revision = useLibraryRevision();
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    let live = true;
    setError(null);
    loadArticle(meta).then(
      (s) => live && setSource(s),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [meta, revision]);

  const known = useMemo(() => new Set(articles.map((a) => a.slug)), [articles]);
  const html = useMemo(() => {
    if (source === null) return null;
    try {
      return renderArticle(source, { knownSlugs: known }).html;
    } catch (e) {
      // A half-written file must not take the reading view down with it.
      console.warn(`[learn] ${meta.file} could not be rendered`, e);
      return '<p class="learn-status">This article could not be shown. It may be in the middle of an edit.</p>';
    }
  }, [source, known, meta.file]);

  // Find the placeholders the renderer left, to mount the buttons and figures into.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || html === null) return;
    const found: Slot[] = [];
    root.querySelectorAll<HTMLElement>('[data-scene]').forEach((box) => {
      const el = box.querySelector<HTMLElement>('.learn-seeit-act');
      if (el) found.push({ el, kind: 'scene', value: box.dataset.scene ?? '' });
    });
    root.querySelectorAll<HTMLElement>('[data-figure]').forEach((box) => {
      const el = box.querySelector<HTMLElement>('.learn-fig-body');
      if (el) found.push({ el, kind: 'figure', value: box.dataset.figure ?? '' });
    });
    setSlots(found);
  }, [html]);

  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (html !== null) ready.current();
  }, [html, slots]);

  // Reaching the reading list (or the notes, or the very end) counts as having read it.
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    const root = ref.current;
    if (!root || html === null || typeof IntersectionObserver === 'undefined') return;
    const mark = root.querySelector('.learn-refs-h2, .learn-notes') ?? root.lastElementChild;
    if (!mark) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        finished.current();
      }
    });
    io.observe(mark);
    return () => io.disconnect();
  }, [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href');
    if (!href?.startsWith('#')) return;
    e.preventDefault();
    if (href.startsWith('#/')) {
      const route = parseHash(href);
      if (route?.page === 'learn') openLearn(route.article, route.section);
      else if (route) openDoc(route.page, route.section);
      return;
    }
    // In-page links (footnotes and their way back): the hash is the reading page's route,
    // so scroll instead of changing it.
    const target = document.getElementById(decodeURIComponent(href.slice(1)));
    if (target) scrollToElement(target);
  };

  if (error)
    return (
      <p className="learn-status">
        This article could not be loaded ({error}). Check your connection and open it again.
      </p>
    );
  if (html === null) return <p className="learn-status">Loading…</p>;
  return (
    <>
      {/* The HTML comes from markdown-it with raw HTML off and links vetted (content/learn/markdown.ts). */}
      <div ref={ref} className="learn-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {slots.map((s, i) =>
        createPortal(s.kind === 'scene' ? <SeeIt spec={s.value} /> : <Figure id={s.value} />, s.el, `${s.kind}-${i}-${s.value}`),
      )}
    </>
  );
}
