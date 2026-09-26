/**
 * The reading view: the guide, Learn and the About page, full screen over the view, with a
 * table of contents that follows the reading position. Each page supplies its own contents.
 * Loaded on first use.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { closeDoc, hashOf, openDoc, openLearn, replaceDocSection, type DocPage, type DocRoute } from '../../state/route';
import { findArticle, useArticles } from '../../content/learn/library';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { LogoMark } from '../Logo';
import { useModal } from '../useModal';
import GuideDoc, { GUIDE_TOC } from './GuideDoc';
import AboutDoc, { ABOUT_TOC } from './AboutDoc';
import type { TocEntry } from './parts';
import { articleToc, hubToc, LearnArticle, LearnHub, LearnMissing } from '../learn/LearnPages';

const TABS: { page: DocPage; title: string }[] = [
  { page: 'guide', title: 'Guide' },
  { page: 'learn', title: 'Learn' },
  { page: 'about', title: 'About' },
];

interface PageView {
  /** Name of the dialog, for assistive technology. */
  label: string;
  toc: TocEntry[];
  /** Chapters numbered 01, 02 … (the guide). */
  numbered: boolean;
  /** Extra class on the article: its typography. */
  className?: string;
  /** Record the section in the address as the reader moves (not on the hub, whose ids are not routes). */
  sectionsInUrl: boolean;
  body: ReactNode;
  foot: ReactNode;
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** An element's offset from the top of the scrolled content (whatever its offset parent). */
const topIn = (sc: HTMLElement, el: HTMLElement) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;

function FootLink({ href, to, children }: { href: string; to: () => void; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        to();
      }}
    >
      {children}
    </a>
  );
}

/** What each page shows: its contents, its text and the link under the contents. */
function usePage(route: DocRoute, onReady: () => void): PageView {
  useArticles(); // the index can change under an open page in development
  if (route.page === 'guide')
    return {
      label: 'Guide',
      toc: GUIDE_TOC,
      numbered: true,
      sectionsInUrl: true,
      body: <GuideDoc />,
      foot: (
        <FootLink href="#/about" to={() => openDoc('about')}>
          About Lightspeed →
        </FootLink>
      ),
    };
  if (route.page === 'about')
    return {
      label: 'About Lightspeed',
      toc: ABOUT_TOC,
      numbered: false,
      sectionsInUrl: true,
      body: <AboutDoc />,
      foot: (
        <FootLink href="#/guide" to={() => openDoc('guide')}>
          Read the guide →
        </FootLink>
      ),
    };
  if (!route.article)
    return {
      label: 'Learn',
      toc: hubToc(),
      numbered: false,
      className: 'learn-doc',
      sectionsInUrl: false,
      body: <LearnHub />,
      foot: (
        <FootLink href="#/guide" to={() => openDoc('guide')}>
          Read the guide →
        </FootLink>
      ),
    };
  const meta = findArticle(route.article);
  return {
    label: meta ? meta.title : 'Learn',
    toc: meta ? articleToc(meta) : [],
    numbered: false,
    className: 'learn-doc learn-article',
    sectionsInUrl: true,
    body: meta ? <LearnArticle key={meta.slug} meta={meta} onReady={onReady} /> : <LearnMissing slug={route.article} />,
    foot: (
      <FootLink href="#/learn" to={() => openLearn()}>
        ← All articles
      </FootLink>
    ),
  };
}

export default function DocView({ route }: { route: DocRoute }) {
  const ref = useModal<HTMLDivElement>(closeDoc);
  const scroller = useRef<HTMLDivElement>(null);
  // Bumped when a page's text arrives after the page itself (a Learn article), so the section
  // in the address can be scrolled to once it exists.
  const [ready, setReady] = useState(0);
  const onReady = useCallback(() => setReady((n) => n + 1), []);
  const page = usePage(route, onReady);
  const { toc } = page;
  const first = toc[0]?.id ?? '';
  // The contents are rebuilt on each render; the scroll listener only needs a new copy when they change.
  const tocRef = useRef(toc);
  tocRef.current = toc;
  const tocKey = toc.map((t) => t.id).join(' ');
  const [active, setActive] = useState(route.section ?? first);
  const pageKey = `${route.page}/${route.article ?? ''}`;

  // Go to the section named in the route (or the top of the page), once per navigation: each
  // openDoc or openLearn gives a new route object, while the contents only rewrite the address
  // (replaceDocSection) and a page whose text arrives again (an article saved in development)
  // leaves the reader where they are.
  const placed = useRef<DocRoute | null>(null);
  useEffect(() => {
    if (placed.current === route) return;
    const sc = scroller.current;
    const el = route.section ? document.getElementById(`doc-${route.section}`) : null;
    if (el && sc) {
      sc.scrollTop = topIn(sc, el) - 12;
      placed.current = route;
    } else if (!route.section) {
      sc?.scrollTo({ top: 0 });
      placed.current = route;
    } else if (!ready) sc?.scrollTo({ top: 0 }); // the section's text has not arrived yet
    setActive(route.section ?? first);
  }, [route, ready]);

  // A new page starts without its text.
  useEffect(() => setReady(0), [pageKey]);

  // The contents follow the reading position: the last chapter whose heading has scrolled past a line near the top.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !tocKey) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const toc = tocRef.current;
        const line = sc.scrollTop + sc.clientHeight * 0.25;
        let cur = toc[0].id;
        for (const t of toc) {
          const el = document.getElementById(`doc-${t.id}`);
          if (el && topIn(sc, el) <= line) cur = t.id;
          else if (el) break; // in page order, so the rest are further down
        }
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = toc[toc.length - 1].id;
        setActive(cur);
      });
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pageKey, tocKey]);

  const go = (id: string) => {
    const el = document.getElementById(`doc-${id}`);
    const sc = scroller.current;
    if (el && sc) sc.scrollTo({ top: topIn(sc, el) - 12, behavior: reduced() ? 'auto' : 'smooth' });
    if (page.sectionsInUrl) replaceDocSection(id);
    setActive(id);
  };

  return createPortal(
    <div ref={ref} className="doc-overlay" role="dialog" aria-modal="true" aria-label={page.label}>
      <header className="doc-bar">
        <LogoMark size={18} className="text-fg" />
        <span className="mono text-[12px] font-semibold tracking-[0.2em] text-fg max-sm:hidden">LIGHTSPEED</span>
        <nav className="doc-tabs" aria-label="Pages">
          {TABS.map((t) => (
            <a
              key={t.page}
              href={hashOf({ page: t.page })}
              aria-current={route.page === t.page ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (t.page === 'learn') {
                  // From an article, the tab goes back to the shelves.
                  if (route.page !== 'learn' || route.article) openLearn();
                } else if (route.page !== t.page) openDoc(t.page);
              }}
            >
              {t.title}
            </a>
          ))}
        </nav>
        <span className="ml-auto" />
        {toc.length > 0 && (
          <select className="fld min-w-0 max-w-[46vw] min-[900px]:hidden" value={active} onChange={(e) => go(e.target.value)} aria-label="Go to section">
            {toc.map((t, i) => (
              <option key={t.id} value={t.id}>
                {page.numbered ? `${i + 1}. ` : ''}
                {t.title}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-q max-sm:hidden" onClick={() => window.print()} title="Print, or save as PDF">
          <Icon name="print" />
          Print
        </button>
        <button className="btn" onClick={closeDoc} title="Back to the view (Esc)" data-autofocus>
          <CloseIcon />
          <span className="max-sm:hidden">Close</span>
        </button>
      </header>
      <div className="doc-main">
        <nav className="doc-toc" aria-label="Contents">
          <div className="cap px-5 pb-2">Contents</div>
          <ol>
            {toc.map((t, i) => (
              <li key={t.id}>
                <a
                  href={hashOf({ ...route, section: page.sectionsInUrl ? t.id : undefined })}
                  aria-current={active === t.id ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(t.id);
                  }}
                >
                  {page.numbered && <span className="doc-toc-n">{String(i + 1).padStart(2, '0')}</span>}
                  {t.title}
                </a>
              </li>
            ))}
          </ol>
          <div className="doc-toc-foot">{page.foot}</div>
        </nav>
        <div ref={scroller} className="doc-scroll scroll" tabIndex={-1}>
          <article key={pageKey} className={`doc ${page.numbered ? 'doc-numbered' : ''} ${page.className ?? ''}`}>
            {page.body}
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
