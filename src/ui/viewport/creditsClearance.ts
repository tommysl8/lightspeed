/**
 * Where the pictures' Credits button (ui/viewport/PictureCredits.tsx) goes beside a panel along the bottom
 * of the view (the flight panel, the arrival card, a journey's note): in the bottom-right corner as usual
 * when the panel leaves it room beside it, and above the panel when it does not. The button is small, so
 * it never has to narrow: it stays or it moves up.
 */

/** The button's widest (CSS px: "Credits" at 10 px with its padding is about 50), its gaps from the view's right and bottom edges, and from a panel beside or below it. */
export const CREDITS_W = 64;
export const CREDITS_RIGHT = 12;
export const CREDITS_BOTTOM = 8;
export const CREDITS_GAP = 8;

export interface Clearance {
  /** How far up its usual place the button must sit (CSS px). */
  lift: number;
}

interface Rect {
  top: number;
  right: number;
  bottom: number;
  width: number;
}

/** The button's clearance from one panel, from the view's and the panel's client rectangles. */
export function creditsClearance(view: Rect, panel: Rect): Clearance {
  const free = Math.floor(view.right - panel.right) - CREDITS_RIGHT - CREDITS_GAP;
  if (panel.width <= 0 || free >= CREDITS_W) return { lift: 0 };
  return { lift: Math.max(0, Math.ceil(view.bottom - panel.top) + CREDITS_GAP - CREDITS_BOTTOM) };
}

/** The clearance from every panel on screen at once: above the tallest that needs it. */
export function combineClearances(all: Iterable<Clearance>): Clearance {
  let lift = 0;
  for (const c of all) lift = Math.max(lift, c.lift);
  return { lift };
}
