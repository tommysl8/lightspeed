/**
 * The sources behind a card, folded away: one quiet "Sources" line at the bottom of a card on the view (the
 * body card, the layers' cards, the arrival card) that opens to its references, its notes on how a thing is
 * placed and what is modelled, and the credits of its pictures. A card shows what a thing is and its few numbers;
 * where each came from stays one click away. The full references are on the reading pages (Learn, the Guide,
 * About, CREDITS.md).
 *
 * Closed whenever a card opens: a native <details> without `open`, and nothing is remembered. A card that stays
 * mounted while it shows something else (the body card) keys it by what it shows, so it starts closed there too.
 *
 * Also the one form of a picture's credit, for the cards and the view's Credits list (PictureCredits.tsx): the
 * credit exactly as its archive gives it, what was changed, and links to the picture's page and the licence, as
 * CC BY 4.0 asks.
 */
import type { ReactNode } from 'react';
import type { DeepSkyImage } from '../../sim/bodies';
import { creditSentence } from '../deepSkyText';
import { Chevron } from '../kit';

/** A link among the sources and credits. */
export const SOURCE_LINK = 'underline decoration-line-2 underline-offset-2 hover:text-fg';

/** The card's sources, closed until asked for. `children` are its lines (paragraphs, SourceLinks, a picture's credit). */
export function Sources({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <details className={`group text-[10.5px] leading-snug text-fg-3 ${className}`}>
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 hover:text-fg-2 [&::-webkit-details-marker]:hidden">
        Sources
        <Chevron className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1 space-y-1">{children}</div>
    </details>
  );
}

/** Links, each once, on one line: "science.nasa.gov · GRAVITY 2022". */
export function SourceLinks({ links }: { links: readonly { url: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <p>
      {links.map((l, i) => (
        <span key={l.url}>
          {i > 0 && ' · '}
          <a className={SOURCE_LINK} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}>
            {l.label}
          </a>
        </span>
      ))}
    </p>
  );
}

/** A picture's credit: its credit line, what was changed, then the picture's page and the licence, linked ("… ESO … · CC BY 4.0"). */
export function PictureCreditLine({ image }: { image: DeepSkyImage }) {
  return (
    <>
      {/* An archive's credit may run over two lines. */}
      <span className="whitespace-pre-line">{creditSentence(image.credit)}</span> {image.modificationNote}{' '}
      <a className={SOURCE_LINK} href={image.page} target="_blank" rel="noopener noreferrer">
        {image.source}
      </a>
      {' · '}
      <a className={SOURCE_LINK} href={image.licenceUrl} target="_blank" rel="noopener noreferrer">
        {image.licence}
      </a>
    </>
  );
}
