/**
 * The credits of the nebulae's pictures on screen: one small "Credits" button in the bottom-right corner of
 * the view, only while a credited picture is drawn, that opens a short list of them. Each entry carries the
 * picture's credit exactly as its archive gives it, what was changed, and links to its page and the licence:
 * CC BY 4.0 asks for all of it wherever the picture shows, and here it is one click away while it does. The
 * button shows whatever the readouts setting (U), since the pictures show then too. The flight panel, the
 * arrival card and a journey's note keep it clear of them (keepCreditsClear): beside them where there is
 * room, else above them. On a narrow screen an open body card fills the side of the view the button is in,
 * so it waits until the card is closed (a picture's own card carries its credit, under Sources).
 *
 * The list is kit.tsx's Menu: a button with aria-expanded, opening above it; Escape or a click outside closes
 * it, and Escape gives the focus back to the button.
 *
 * In clean full screen (ui/cleanMode.ts), where every other piece of text is hidden, the button is a faint
 * "©" in the corner (marked to stay, data-clean-keep), opening the same list.
 */
import { useSyncExternalStore } from 'react';
import { getBody } from '../../sim/bodies';
import { useUI } from '../../state/ui';
import { shownPictures, shownPicturesVersion, subscribeShownPictures } from '../../scene/Nebulae';
import { Menu } from '../kit';
import { CREDITS_BOTTOM, CREDITS_RIGHT, combineClearances, creditsClearance, type Clearance } from './creditsClearance';
import { PictureCreditLine } from './Sources';

/** On the view: how far up the button must sit to clear the panels along the bottom (CSS px). */
const LIFT = '--credits-lift';
/** Room kept free at the top of the view (the view readout) for the open list. */
const TOP_ROOM = 56;

/** Each bottom panel on screen and the button's clearance from it. */
const panels = new Map<HTMLElement, Clearance>();

function applyClearance(view: HTMLElement): void {
  view.style.setProperty(LIFT, `${combineClearances(panels.values()).lift}px`);
}

/**
 * A ref for a panel along the bottom of the view (the flight panel, the arrival card, a journey's
 * note): keeps the pictures' Credits button clear of it, beside it or above it, for as long as the
 * panel is in the page. Put it on the panel itself (the box that is drawn, not a full-width wrapper).
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
  const clean = useUI((s) => s.clean);
  const images = shownPictures.ids
    .map((id) => ({ id, name: getBody(id)?.name ?? id, image: getBody(id)?.deepSky?.image }))
    .filter((x): x is { id: string; name: string; image: NonNullable<typeof x.image> } => !!x.image);
  if (!images.length) return null;
  return (
    <div
      data-clean-keep
      className={`absolute z-30 ${clean ? 'bottom-1 right-2' : cardOpen ? 'max-[699px]:hidden' : ''}`}
      style={clean ? undefined : { right: CREDITS_RIGHT, bottom: `calc(var(${LIFT}, 0px) + ${CREDITS_BOTTOM}px)` }}
    >
      <Menu
        label={clean ? '©' : 'Credits'}
        ariaLabel="Picture credits"
        title="The credits and licences of the pictures on screen"
        placement="above"
        align="right"
        width={340}
        chevron={false}
        buttonClassName={
          clean
            ? 'rounded px-1 text-[10px] leading-[14px] text-fg-3/60 hover:text-fg-2'
            : 'rounded bg-bg/80 px-1.5 text-[10px] leading-[18px] text-fg-3 hover:text-fg aria-expanded:text-fg'
        }
      >
        {/* Scrolls within the room above the button (lifted over a panel, less of the view is left). */}
        <div
          className="scroll overflow-y-auto px-2.5 py-1 text-[11px] leading-snug text-fg-2"
          style={{ maxHeight: `min(360px, calc(100dvh - var(--hdr, 0px) - var(--ftr, 0px) - var(${LIFT}, 0px) - ${CREDITS_BOTTOM + TOP_ROOM + 24}px))` }}
        >
          {images.map((x) => (
            <p key={x.id} className="mb-1.5 break-words last:mb-0">
              <span className="text-fg">{x.name}</span>: <PictureCreditLine image={x.image} />
            </p>
          ))}
        </div>
      </Menu>
    </div>
  );
}
