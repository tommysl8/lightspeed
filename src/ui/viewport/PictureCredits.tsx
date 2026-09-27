/**
 * The credit lines of the nebulae's pictures on screen, in the corner of the view: every picture
 * drawn carries its credit, exactly as its archive gives it, what was changed and the licence (CC BY
 * 4.0 asks for all of it wherever the picture shows). Shown whatever the readouts setting (U), since
 * the pictures show then too, one entry per picture however many there are (the box scrolls). The
 * flight panel, the arrival card and a journey's note keep it clear of them (keepCreditsClear): it
 * narrows to fit beside them, or where there is too little room, it sits above them. On a narrow
 * screen an open body card fills the side of the view the box is in, so the box waits until the
 * card is closed (a picture's own card carries its credit).
 */
import { useSyncExternalStore } from 'react';
import { getBody } from '../../sim/bodies';
import { useUI } from '../../state/ui';
import { shownPictures, shownPicturesVersion, subscribeShownPictures } from '../../scene/Nebulae';
import { creditSentence } from '../deepSkyText';
import { CREDITS_BOTTOM, CREDITS_MAX_W, CREDITS_RIGHT, combineClearances, creditsClearance, type Clearance } from './creditsClearance';

const LINK = 'underline decoration-line-2 underline-offset-2 hover:text-fg';
/** On the view: how far up the box must sit, and how wide it may be, to clear the panels along the bottom (CSS px). */
const LIFT = '--credits-lift';
const ROOM = '--credits-room';
/** Room kept free at the top of the view (the view readout) when the box is lifted. */
const TOP_ROOM = 56;

/** Each bottom panel on screen and the box's clearance from it. */
const panels = new Map<HTMLElement, Clearance>();

function applyClearance(view: HTMLElement): void {
  const { lift, room } = combineClearances(panels.values());
  view.style.setProperty(LIFT, `${lift}px`);
  view.style.setProperty(ROOM, `${room}px`);
}

/**
 * A ref for a panel along the bottom of the view (the flight panel, the arrival card, a journey's
 * note): keeps the picture credits clear of it, beside it or above it, for as long as the panel is
 * in the page. Put it on the panel itself (the box that is drawn, not a full-width wrapper).
 */
export function keepCreditsClear(el: HTMLElement | null): (() => void) | undefined {
  const view = el?.closest<HTMLElement>('.app-view');
  if (!el || !view) return undefined;
  const update = () => {
    panels.set(el, creditsClearance(view.getBoundingClientRect(), el.getBoundingClientRect()));
    applyClearance(view);
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(el);
  ro.observe(view);
  window.addEventListener('resize', update);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', update);
    panels.delete(el);
    applyClearance(view);
  };
}

export function PictureCredits() {
  useSyncExternalStore(subscribeShownPictures, shownPicturesVersion);
  const cardOpen = useUI((s) => !!s.selected && s.bodyCard);
  const images = shownPictures.ids
    .map((id) => ({ id, name: getBody(id)?.name ?? id, image: getBody(id)?.deepSky?.image }))
    .filter((x): x is { id: string; name: string; image: NonNullable<typeof x.image> } => !!x.image);
  if (!images.length) return null;
  return (
    <div
      className={`scroll absolute z-30 overflow-y-auto rounded bg-bg/80 px-1.5 py-0.5 text-right text-[9.5px] leading-[13px] text-fg-3 ${cardOpen ? 'max-[699px]:hidden' : ''}`}
      style={{
        right: CREDITS_RIGHT,
        bottom: `calc(var(${LIFT}, 0px) + ${CREDITS_BOTTOM}px)`,
        maxWidth: `min(var(${ROOM}, ${CREDITS_MAX_W}px), 60%)`,
        maxHeight: `min(40vh, calc(100% - var(${LIFT}, 0px) - ${CREDITS_BOTTOM + TOP_ROOM}px))`,
      }}
      aria-label="Picture credits"
    >
      {images.map((x) => (
        <p key={x.id} className="whitespace-pre-line break-words">
          {x.name}:{' '}
          <a className={LINK} href={x.image.page} target="_blank" rel="noopener noreferrer">
            {creditSentence(x.image.credit)}
          </a>{' '}
          {x.image.modificationNote}{' '}
          <a className={LINK} href={x.image.licenceUrl} target="_blank" rel="noopener noreferrer">
            {x.image.licence}
          </a>
        </p>
      ))}
    </div>
  );
}
