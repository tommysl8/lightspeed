/**
 * Where the picture credits (ui/viewport/PictureCredits.tsx) go beside a panel along the bottom of
 * the view (the flight panel, the arrival card, a journey's note): at the bottom right as usual when
 * the panel leaves them room, narrowed to fit beside it when it leaves less, and above it when it
 * leaves too little.
 */

/** The box's widest (CSS px), its gaps from the view's right and bottom edges, and from a panel beside or below it. */
export const CREDITS_MAX_W = 460;
export const CREDITS_RIGHT = 12;
export const CREDITS_BOTTOM = 8;
export const CREDITS_GAP = 8;
/** Narrower than this beside a panel, the box goes above it instead. */
export const CREDITS_MIN_W = 240;

export interface Clearance {
  /** How far up the box's usual place it must sit (CSS px). */
  lift: number;
  /** How wide it may be (CSS px). */
  room: number;
}

interface Rect {
  top: number;
  right: number;
  bottom: number;
  width: number;
}

/** The box's clearance from one panel, from the view's and the panel's client rectangles. */
export function creditsClearance(view: Rect, panel: Rect): Clearance {
  const free = Math.floor(view.right - panel.right) - CREDITS_RIGHT - CREDITS_GAP;
  if (panel.width <= 0 || free >= CREDITS_MAX_W) return { lift: 0, room: CREDITS_MAX_W };
  if (free >= CREDITS_MIN_W) return { lift: 0, room: free };
  return { lift: Math.max(0, Math.ceil(view.bottom - panel.top) + CREDITS_GAP - CREDITS_BOTTOM), room: CREDITS_MAX_W };
}

/** The clearance from every panel on screen at once: above the tallest that needs it, as narrow as the narrowest. */
export function combineClearances(all: Iterable<Clearance>): Clearance {
  let lift = 0;
  let room = CREDITS_MAX_W;
  for (const c of all) {
    lift = Math.max(lift, c.lift);
    room = Math.min(room, c.room);
  }
  return { lift, room };
}
