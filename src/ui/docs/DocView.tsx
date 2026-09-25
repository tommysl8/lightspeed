/**
 * The reading view: the guide and the About page, full screen over the view, with a table
 * of contents that follows the reading position. Loaded on first use.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { closeDoc, openDoc, type DocPage, type DocRoute } from '../../state/route';
import { CloseIcon } from '../kit';
import { Icon } from '../icons';
import { LogoMark } from '../Logo';
import { useModal } from '../useModal';
import GuideDoc, { GUIDE_TOC } from './GuideDoc';
import AboutDoc, { ABOUT_TOC } from './AboutDoc';

const PAGES: Record<DocPage, { title: string; toc: typeof GUIDE_TOC; numbered: boolean }> = {
  guide: { title: 'Guide', toc: GUIDE_TOC, numbered: true },
  about: { title: 'About', toc: ABOUT_TOC, numbered: false },
};

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function DocView({ route }: { route: DocRoute }) {
  const page = PAGES[route.page];
  const ref = useModal<HTMLDivElement>(closeDoc);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(route.section ?? page.toc[0].id);

  // Go to the section named in the route (or the top of the page).
  useEffect(() => {
    const el = route.section ? document.getElementById(`doc-${route.section}`) : null;
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 12;
    else scroller.current?.scrollTo({ top: 0 });
    setActive(route.section ?? page.toc[0].id);
  }, [route.page, route.section, page.toc]);

  // The contents follow the reading position: the last chapter whose heading has scrolled past a line near the top.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = sc.scrollTop + sc.clientHeight * 0.25;
        let cur = page.toc[0].id;
        for (const t of page.toc) {
          const el = document.getElementById(`doc-${t.id}`);
          if (el && el.offsetTop <= line) cur = t.id;
        }
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = page.toc[page.toc.length - 1].id;
        setActive(cur);
      });
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [route.page, page.toc]);

  const go = (id: string) => {
    const el = document.getElementById(`doc-${id}`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 12, behavior: reduced() ? 'auto' : 'smooth' });
    window.history.replaceState(null, '', `#/${route.page}/${id}`);
    setActive(id);
  };

  return createPortal(
    <div ref={ref} className="doc-overlay" role="dialog" aria-modal="true" aria-label={route.page === 'guide' ? 'Guide' : 'About Lightspeed'}>
      <header className="doc-bar">
        <LogoMark size={18} className="text-fg" />
        <span className="mono text-[12px] font-semibold tracking-[0.2em] text-fg max-sm:hidden">LIGHTSPEED</span>
        <nav className="doc-tabs" aria-label="Pages">
          {(['guide', 'about'] as const).map((p) => (
            <a
              key={p}
              href={`#/${p}`}
              aria-current={route.page === p ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (route.page !== p) openDoc(p);
              }}
            >
              {PAGES[p].title}
            </a>
          ))}
        </nav>
        <span className="ml-auto" />
        <select
          className="fld min-w-0 max-w-[46vw] min-[900px]:hidden"
          value={active}
          onChange={(e) => go(e.target.value)}
          aria-label="Go to section"
        >
          {page.toc.map((t, i) => (
            <option key={t.id} value={t.id}>
              {page.numbered ? `${i + 1}. ` : ''}
              {t.title}
            </option>
          ))}
        </select>
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
            {page.toc.map((t, i) => (
              <li key={t.id}>
                <a
                  href={`#/${route.page}/${t.id}`}
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
          <div className="doc-toc-foot">
            {route.page === 'guide' ? (
              <a
                href="#/about"
                onClick={(e) => {
                  e.preventDefault();
                  openDoc('about');
                }}
              >
                About Lightspeed →
              </a>
            ) : (
              <a
                href="#/guide"
                onClick={(e) => {
                  e.preventDefault();
                  openDoc('guide');
                }}
              >
                Read the guide →
              </a>
            )}
          </div>
        </nav>
        <div ref={scroller} className="doc-scroll scroll" tabIndex={-1}>
          <article className={`doc ${page.numbered ? 'doc-numbered' : ''}`}>{route.page === 'guide' ? <GuideDoc /> : <AboutDoc />}</article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
