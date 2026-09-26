/**
 * Learn in the reading view: the hub (five shelves of articles) and an article's page (its
 * masthead, text and the way on). The text itself, with markdown-it and KaTeX, loads on first
 * read (ArticleBody).
 */
import { lazy, Suspense, useCallback, type MouseEvent, type ReactNode } from 'react';
import { formatIsoDate, NOTES_ID, readingMinutes, SHELVES, type ArticleMeta } from '../../content/learn/catalogue';
import { neighbours, shelves, useArticles } from '../../content/learn/library';
import { closeDoc, openLearn } from '../../state/route';
import { openLab } from '../onboarding';
import { Icon } from '../icons';
import type { TocEntry } from '../docs/parts';
import { setRead, useReadMarks } from './readMarks';
import './learn.css';

const ArticleBody = lazy(() => import('./ArticleBody'));

export const ISSUES_URL = 'https://github.com/tommysl8/lightspeed/issues';

/** The hub's contents: its shelves. */
export const hubToc = (): TocEntry[] => SHELVES.map((s) => ({ id: `shelf-${s.id}`, title: s.title }));

/** An article's contents: its '## ' sections, then its notes. */
export const articleToc = (meta: ArticleMeta): TocEntry[] =>
  meta.notes ? [...meta.sections, { id: NOTES_ID, title: 'Notes' }] : meta.sections;

const minutes = (meta: ArticleMeta) => `${readingMinutes(meta.words)} min read`;

/** A link to an article that opens it in place (and still works as a link: new tab, copy). */
function ArticleLink({ meta, className, children }: { meta: ArticleMeta; className?: string; children: ReactNode }) {
  const go = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openLearn(meta.slug);
    },
    [meta.slug],
  );
  return (
    <a href={`#/learn/${meta.slug}`} className={className} onClick={go}>
      {children}
    </a>
  );
}

// ─── The hub ────────────────────────────────────────────────────────────────────────────

function Card({ meta, read }: { meta: ArticleMeta; read: boolean }) {
  return (
    <li className="learn-card" data-read={read || undefined}>
      <ArticleLink meta={meta} className="learn-card-link">
        <span className="learn-card-t">{meta.title}</span>
        <span className="learn-card-p">{meta.pitch}</span>
        <span className="learn-card-m">
          {minutes(meta)}
          {read && <span className="learn-card-read"> · Read</span>}
        </span>
      </ArticleLink>
      <button
        type="button"
        className="learn-tick"
        aria-pressed={read}
        aria-label={read ? `Read. Mark “${meta.title}” as not read` : `Mark “${meta.title}” as read`}
        title={read ? 'Read (click to clear)' : 'Mark as read'}
        onClick={() => setRead(meta.slug, !read)}
      >
        <Icon name="check" size={12} />
      </button>
    </li>
  );
}

export function LearnHub() {
  const articles = useArticles();
  const read = useReadMarks();
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Learn</div>
        <h1>How we know</h1>
        <p>
          Long reads on the science behind the view: how it was worked out, what the physics says and what comes next. Every
          claim has a source, and most articles can show you their subject in Lightspeed.
        </p>
      </header>
      {shelves(articles).map((s) => (
        <section key={s.id} id={`doc-shelf-${s.id}`} className="doc-ch learn-shelf" aria-labelledby={`doc-shelf-${s.id}-h`}>
          <h2 id={`doc-shelf-${s.id}-h`}>{s.title}</h2>
          {s.articles.length ? (
            <ol className="learn-cards">
              {s.articles.map((a) => (
                <Card key={a.slug} meta={a} read={read.has(a.slug)} />
              ))}
            </ol>
          ) : (
            <p className="learn-soon">Coming soon</p>
          )}
        </section>
      ))}
      <LabCard />
    </>
  );
}

/** The way into the lab from Learn, at the end of the shelves, for students who want it. */
function LabCard() {
  return (
    <aside className="learn-lab" aria-labelledby="learn-lab-t">
      <div className="learn-box-t">For students</div>
      <p id="learn-lab-t" className="learn-lab-t">
        The lab
      </p>
      <p>
        Five guided experiments in special relativity, set out like a university lab script. Time a pulse of light across the
        Solar System, compare clocks after fast flights, and work out your own speed from the Doppler shift and from where the
        planets appear. Lightspeed keeps the notebook and lays out a printable report.
      </p>
      <button
        type="button"
        className="learn-seeit-btn"
        onClick={() => {
          closeDoc();
          openLab();
        }}
      >
        <Icon name="flask" size={13} />
        Open the lab
      </button>
    </aside>
  );
}

// ─── An article ─────────────────────────────────────────────────────────────────────────

export function LearnArticle({ meta, onReady }: { meta: ArticleMeta; onReady: () => void }) {
  const articles = useArticles();
  const shelf = SHELVES.find((s) => s.id === meta.shelf);
  const { prev, next } = neighbours(meta.slug, articles);
  const finished = useCallback(() => setRead(meta.slug, true), [meta.slug]);
  return (
    <>
      <header className="doc-mast learn-mast">
        <div className="doc-mast-k">
          <a
            href="#/learn"
            onClick={(e) => {
              e.preventDefault();
              openLearn();
            }}
          >
            Learn
          </a>
          <span aria-hidden> / </span>
          {shelf?.title}
        </div>
        <h1>{meta.title}</h1>
        <p>{meta.pitch}</p>
        <div className="doc-mast-meta learn-meta">
          <span>{minutes(meta)}</span>
          <span>Updated {formatIsoDate(meta.updated)}</span>
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            Found a mistake?
          </a>
        </div>
      </header>
      <Suspense fallback={<p className="learn-status">Loading…</p>}>
        <ArticleBody meta={meta} onReady={onReady} onFinished={finished} />
      </Suspense>
      <footer className="learn-end">
        <nav className="learn-pager" aria-label="More articles">
          {prev ? (
            <ArticleLink meta={prev} className="learn-pager-prev">
              <span className="learn-pager-k">
                <Icon name="arrow-left" size={11} /> Previous
              </span>
              <span className="learn-pager-t">{prev.title}</span>
            </ArticleLink>
          ) : (
            <span />
          )}
          {next ? (
            <ArticleLink meta={next} className="learn-pager-next">
              <span className="learn-pager-k">
                Next{next.shelf !== meta.shelf && `: ${SHELVES.find((s) => s.id === next.shelf)?.title}`} <Icon name="arrow-right" size={11} />
              </span>
              <span className="learn-pager-t">{next.title}</span>
            </ArticleLink>
          ) : (
            <span />
          )}
        </nav>
        <p className="learn-fix">
          Found a mistake, or a source that says otherwise?{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
            Open an issue on GitHub
          </a>
          .
        </p>
      </footer>
    </>
  );
}

/** A #/learn/<slug> that is not (or not yet) an article. */
export function LearnMissing({ slug }: { slug: string }) {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Learn</div>
        <h1>Not written yet</h1>
        <p>There is no article called “{slug}” yet. New ones are added as the universe in Lightspeed grows.</p>
      </header>
      <p className="learn-status">
        <a
          href="#/learn"
          onClick={(e) => {
            e.preventDefault();
            openLearn();
          }}
        >
          All articles
        </a>
      </p>
    </>
  );
}
