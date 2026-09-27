import { describe, expect, it } from 'vitest';
import { CREDITS_MAX_W, CREDITS_MIN_W, combineClearances, creditsClearance } from './creditsClearance';

/** A view (the part of the page under the header) and a panel centred along its bottom, as the app lays them out. */
const view = (width: number, height: number, top = 48) => ({ top, right: width, bottom: top + height, width });
const centred = (v: ReturnType<typeof view>, width: number, height: number) => {
  const w = Math.min(width, v.width - 24);
  const left = (v.width - w) / 2;
  return { top: v.bottom - 12 - height, right: left + w, bottom: v.bottom - 12, width: w };
};

describe('the picture credits beside the panels along the bottom', () => {
  it('stay in the corner when a panel leaves them their full width', () => {
    // A journey's note (at most 640 px wide) in a 1536 px view.
    const v = view(1536, 756);
    expect(creditsClearance(v, centred(v, 526, 40))).toEqual({ lift: 0, room: CREDITS_MAX_W });
  });

  it('narrow to fit beside the flight panel on a laptop screen', () => {
    // 1536 × 864 CSS px (a 1920 × 1080 screen at 125%): the 780 px flight panel leaves 378 px.
    const v = view(1536, 756, 56);
    const c = creditsClearance(v, centred(v, 780, 461));
    expect(c.lift).toBe(0);
    expect(c.room).toBe(358);
    expect(c.room).toBeGreaterThanOrEqual(CREDITS_MIN_W);
  });

  it('sit above the flight panel where there is too little room beside it, with a gap', () => {
    // 968 px wide: the panel spans the view but for 94 px either side.
    const v = view(968, 704);
    const p = centred(v, 780, 455);
    const c = creditsClearance(v, p);
    expect(c.room).toBe(CREDITS_MAX_W);
    // The box's bottom (8 px up from the view's bottom, plus the lift) is 8 px above the panel's top.
    expect(v.bottom - (c.lift + 8)).toBe(p.top - 8);
  });

  it('ignore a panel not laid out yet, and take the most room needed of several panels', () => {
    const v = view(968, 704);
    expect(creditsClearance(v, { top: 0, right: 0, bottom: 0, width: 0 })).toEqual({ lift: 0, room: CREDITS_MAX_W });
    expect(combineClearances([])).toEqual({ lift: 0, room: CREDITS_MAX_W });
    expect(
      combineClearances([
        { lift: 80, room: CREDITS_MAX_W },
        { lift: 0, room: 300 },
        { lift: 468, room: CREDITS_MAX_W },
      ]),
    ).toEqual({ lift: 468, room: 300 });
  });
});
