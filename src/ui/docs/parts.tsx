/**
 * Building blocks for the reading pages: chapters with numbered sections, figures, notes,
 * key tables, cross-references and "try it" buttons that act on the simulation.
 */
import type { ReactNode } from 'react';
import { closeDoc, openDoc, type DocPage } from '../../state/route';
import { Icon } from '../icons';

export interface TocEntry {
  id: string;
  title: string;
}

export function Chapter({ id, n, title, lead, children }: { id: string; n?: number; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={`doc-${id}`} data-chapter={id} className="doc-ch" aria-labelledby={`doc-${id}-h`}>
      {n !== undefined && <div className="doc-ch-n">Chapter {String(n).padStart(2, '0')}</div>}
      <h2 id={`doc-${id}-h`}>{title}</h2>
      {lead && <p className="doc-lead">{lead}</p>}
      {children}
    </section>
  );
}

/** Numbered section heading (3.1, 3.2 …, from CSS counters). */
export const H3 = ({ children }: { children: ReactNode }) => <h3>{children}</h3>;

/** Close the page and do something in the simulation. */
export function Try({ run, children }: { run: () => void; children: ReactNode }) {
  return (
    <button
      className="doc-try"
      onClick={() => {
        closeDoc();
        run();
      }}
    >
      <span className="doc-try-k">Try it</span>
      <span className="doc-try-t">{children}</span>
      <Icon name="arrow-right" size={11} />
    </button>
  );
}

/** Cross-reference to a chapter of a reading page. */
export function Ref({ page = 'guide', to, children }: { page?: DocPage; to: string; children: ReactNode }) {
  return (
    <a
      href={`#/${page}/${to}`}
      onClick={(e) => {
        e.preventDefault();
        openDoc(page, to);
      }}
    >
      {children}
    </a>
  );
}

/** External link (new tab). */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function Fig({ n, caption, children, wide }: { n: string; caption: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`doc-fig ${wide ? 'doc-fig-wide' : ''}`}>
      <div className="doc-fig-body">{children}</div>
      <figcaption>
        <b>Figure {n}.</b> {caption}
      </figcaption>
    </figure>
  );
}

export function Note({ title = 'Note', tone, children }: { title?: string; tone?: 'caution' | 'hazard'; children: ReactNode }) {
  return (
    <div className={`note doc-note ${tone ? `note-${tone}` : ''}`}>
      <span className="note-t">{title}</span>
      {children}
    </div>
  );
}

/** Two-column table: keys (or terms) and what they do. */
export function KeyTable({ rows, head }: { rows: [ReactNode, ReactNode][]; head?: [string, string] }) {
  return (
    <table className="doc-tbl">
      {head && (
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th>{head[1]}</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td className="doc-tbl-k">{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Numbered steps with large numerals. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="doc-steps">{children}</ol>;
}

/** An annunciator lamp, as drawn in the viewport. */
export function Lamp({ tone, children }: { tone: 'amber' | 'cyan' | 'white' | 'red'; children: ReactNode }) {
  return (
    <span className={`ann ann-${tone}`}>
      <span className="lamp" />
      {children}
    </span>
  );
}

/** Callout number, matching the numbers in a figure. */
export const Callout = ({ n }: { n: number }) => <span className="doc-callout">{n}</span>;
