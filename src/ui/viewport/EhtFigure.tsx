/**
 * The Event Horizon Telescope's picture of a black hole on its card (Sgr A* and M87*): the image, a caption that
 * says what it is and what Lightspeed's own view is not, and its credit as CC BY 4.0 asks: "EHT Collaboration",
 * the licence, the page it comes from and how it was changed (resized).
 *
 * How: the record's `blackHole.ehtImage` (sim/blackholes/blackholes.json) names the file in
 * public/images/eht/ and carries the credit, the modification note and the ring's published size; the caption
 * for Sgr A* is the flow model's (sim/blackholes/accretion.ts FLOW_TEXTS.figureCaption: the 1.3 mm view beside it is a
 * model, not this image), for a hole drawn without gas ui/deepSkyText.ts ehtCaption's. Only a file that ships
 * (EHT_SHIPPED, checked against public/images/eht/ by the tests) is shown; otherwise, or if it cannot be loaded
 * (offline), the caption stays with a link to the picture on its own page, and the note of how a copy was changed
 * goes (no copy is shown). No empty frame, and no error.
 *
 * Why: the one picture of a black hole's surroundings there is; set beside the lens and the flow model so the
 * comparison is made where it is honest.
 *
 * Cost: one small image, loaded lazily when a card with it opens.
 *
 * Twins: ui/viewport/BodyCard.tsx PictureCredit (the nebulae's credits, the same form); ui/viewport/FlowControls.tsx
 * (the switches beside it).
 */
import { useState } from 'react';
import type { DeepSkyImage } from '../../sim/bodies';
import { assetUrl } from '../../render/textures';
import { creditSentence, ehtCaption } from '../deepSkyText';

/** The EHT's picture as a black hole's record carries it (BlackHoleInfo.ehtImage). */
export type EhtImage = DeepSkyImage & { ringDiameterUas: number; ringSource: string };

/**
 * The EHT pictures in public/images/eht/ (their `file` as the records name it). None ships yet: the resized copies
 * wait on the author's download (docs/data/blackholes.md §1); the tests keep this list equal to the folder.
 */
export const EHT_SHIPPED: ReadonlySet<string> = new Set<string>([]);

const LINK = 'underline decoration-line-2 underline-offset-2 hover:text-fg';

export function EhtFigure({ image, name, flowCaption }: { image: EhtImage; name: string; flowCaption: string | null }) {
  // The file that failed to load (not a flag: a card showing another hole's picture tries its own).
  const [failed, setFailed] = useState<string | null>(null);
  const shown = EHT_SHIPPED.has(image.file) && failed !== image.file;
  return (
    <figure className="mb-2">
      {shown && (
        <img
          className="max-h-[132px] w-full rounded-sm bg-black object-contain"
          src={assetUrl(image.file)}
          alt={`${name} as the Event Horizon Telescope saw it in 2017: a ring of light at 1.3 mm round a dark centre`}
          loading="lazy"
          onError={() => setFailed(image.file)}
        />
      )}
      <figcaption className={shown ? 'mt-1' : ''}>
        <p className="text-[11px] leading-snug text-fg-2">{ehtCaption(image.ringDiameterUas, image.ringSource, flowCaption)}</p>
        {shown ? (
          <p className="mt-0.5 text-[10.5px] leading-snug text-fg-3">
            Picture: {creditSentence(image.credit)} <span>{image.modificationNote}</span>{' '}
            <a className={LINK} href={image.page} target="_blank" rel="noopener noreferrer">
              {image.source}
            </a>
            {' · '}
            <a className={LINK} href={image.licenceUrl} target="_blank" rel="noopener noreferrer">
              {image.licence}
            </a>
          </p>
        ) : (
          <p className="mt-0.5 text-[10.5px] leading-snug text-fg-3">
            See it at{' '}
            <a className={LINK} href={image.page} target="_blank" rel="noopener noreferrer">
              {image.source}
            </a>{' '}
            ({image.credit},{' '}
            <a className={LINK} href={image.licenceUrl} target="_blank" rel="noopener noreferrer">
              {image.licence}
            </a>
            ).
          </p>
        )}
      </figcaption>
    </figure>
  );
}
