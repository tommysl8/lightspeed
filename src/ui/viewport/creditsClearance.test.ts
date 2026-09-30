import { describe, expect, it } from 'vitest';
import { CREDITS_BOTTOM, CREDITS_GAP, CREDITS_RIGHT, CREDITS_W, combineClearances, creditsClearance } from './creditsClearance';

/** A view (the part of the page under the header) and a panel centred along its bottom, as the app lays them out. */
const view = (width: number, height: number, top = 48) => ({ top, right: width, bottom: top + height, width });
const centred = (v: ReturnType<typeof view>, width: number, height: number) => {
  const w = Math.min(width, v.width - 24);
  const left = (v.width - w) / 2;
  return { top: v.bottom - 12 - height, right: left + w, bottom: v.bottom - 12, width: w };
};

describe('the pictures’ Credits button beside the panels along the bottom', () => {
  it('stays in the corner beside a journey’s note and beside the flight panel on a laptop screen', () => {
    // A journey's note (at most 640 px wide) in a 1536 px view.
    const v = view(1536, 756);
    expect(creditsClearance(v, centred(v, 526, 40))).toEqual({ lift: 0 });
    // 1536 × 864 CSS px (a 1920 × 1080 screen at 125%): the 780 px flight panel leaves 378 px.
    const w = view(1536, 756, 56);
    expect(creditsClearance(w, centred(w, 780, 461))).toEqual({ lift: 0 });
  });

  it('stays in the corner while the panel leaves the button its width, and not a pixel less', () => {
    const v = view(1000, 700);
    const panel = (right: number) => ({ top: v.bottom - 200, right, bottom: v.bottom - 12, width: 600 });
    const edge = v.right - CREDITS_RIGHT - CREDITS_GAP - CREDITS_W;
    expect(creditsClearance(v, panel(edge)).lift).toBe(0);
    expect(creditsClearance(v, panel(edge + 1)).lift).toBeGreaterThan(0);
  });

  it('sits above the flight panel where there is too little room beside it, with a gap', () => {
    // 800 px wide: the panel spans the view but for 12 px either side.
    const v = view(800, 704);
    const p = centred(v, 780, 455);
    const c = creditsClearance(v, p);
    // The button's bottom (8 px up from the view's bottom, plus the lift) is 8 px above the panel's top.
    expect(v.bottom - (c.lift + CREDITS_BOTTOM)).toBe(p.top - CREDITS_GAP);
  });

  it('ignores a panel not laid out yet, and takes the most room needed of several panels', () => {
    const v = view(968, 704);
    expect(creditsClearance(v, { top: 0, right: 0, bottom: 0, width: 0 })).toEqual({ lift: 0 });
    expect(combineClearances([])).toEqual({ lift: 0 });
    expect(combineClearances([{ lift: 80 }, { lift: 0 }, { lift: 468 }])).toEqual({ lift: 468 });
  });
});
