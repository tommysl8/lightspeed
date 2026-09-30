/**
 * The black-hole HUD's words, which face it shows and whether as the whole panel or the chip that opens it
 * (ui/flight/HoleStrip.tsx), and the footer's rate near a hole (ui/layout/Footer.tsx): pure functions of the
 * state they are given, so no scene is needed.
 */
import { describe, expect, it } from 'vitest';
import { END_CARD_MS, holeChipText, holeStripFace, holeStripForm, isInnermostStable, snapshotDeg, timesText, type HoleStripInputs } from './HoleStrip';
import { stripPlace } from './FlightStrip';
import { hoverPaceText, moonsOrBodies } from '../layout/Footer';

/** Hovering 10 r_s above Sgr A*, centred on it, the clock paced by its gravity, no note, no fall behind. */
const hover: HoleStripInputs = { falling: false, flight: false, hole: 'sgr-a-star', paced: true, mode: 'orbit', focus: 'sgr-a-star', lastEnd: null, note: false };

describe('which face the black-hole HUD shows', () => {
  it('hovers only while centred on the hole itself; beside another body near it (S2) it is moving', () => {
    expect(holeStripFace(hover)).toBe('hovering');
    expect(holeStripFace({ ...hover, focus: 's2' })).toBe('beside');
    expect(holeStripFace({ ...hover, mode: 'free' })).toBe('free');
    expect(holeStripFace({ ...hover, mode: 'roam' })).toBe('roam');
    expect(holeStripFace({ ...hover, mode: 'roam', paced: false })).toBeNull();
    expect(holeStripFace({ ...hover, mode: 'circular' })).toBe('circular');
    expect(holeStripFace({ ...hover, mode: 'hold' })).toBe('snapshot');
    // Slewing through, or beyond the hole's pacing: nothing.
    expect(holeStripFace({ ...hover, mode: 'transition' })).toBeNull();
    expect(holeStripFace({ ...hover, paced: false })).toBeNull();
    expect(holeStripFace({ ...hover, hole: null })).toBeNull();
    // A fall wins over everything; a trip or its arrival card hides the rest.
    expect(holeStripFace({ ...hover, falling: true, flight: true })).toBe('falling');
    expect(holeStripFace({ ...hover, flight: true })).toBeNull();
  });

  it('keeps the card after a fall for a minute, near that hole, until a scene brings its own note', () => {
    const ended = { ...hover, lastEnd: { hole: 'sgr-a-star', agoMs: 5_000 } };
    expect(holeStripFace(ended)).toBe('end');
    expect(holeStripFace({ ...ended, lastEnd: { hole: 'sgr-a-star', agoMs: END_CARD_MS + 1 } })).toBe('hovering');
    // A scene started after the fall (the fall clears the note as it ends, so any note is newer): its note shows.
    expect(holeStripFace({ ...ended, note: true })).toBe('hovering');
    // Gone with the camera: at another hole, or at Earth (no hole at all).
    expect(holeStripFace({ ...ended, hole: 'm87-star', focus: 'm87-star' })).toBe('hovering');
    expect(holeStripFace({ ...ended, hole: null, paced: false })).toBeNull();
  });
});

describe('the panel or its chip', () => {
  it('is closed by default: a chip in its place', () => {
    expect(holeStripForm(hover)).toBe('chip');
    expect(holeStripForm({ ...hover, mode: 'roam' })).toBe('chip');
    expect(holeStripForm({ ...hover, mode: 'circular' })).toBe('chip');
    // No face, no chip.
    expect(holeStripForm({ ...hover, paced: false })).toBeNull();
    expect(holeStripForm({ ...hover, flight: true })).toBeNull();
  });

  it('opens by itself with the View menu’s option, and when opened (the chip, a scene, a fall) for this hole', () => {
    expect(holeStripForm({ ...hover, panelAuto: true })).toBe('panel');
    expect(holeStripForm({ ...hover, choice: { hole: 'sgr-a-star', open: true } })).toBe('panel');
    // A choice made for another hole does not count here.
    expect(holeStripForm({ ...hover, choice: { hole: 'm87-star', open: true } })).toBe('chip');
    // Hidden by the visitor: the chip, even with the option on.
    expect(holeStripForm({ ...hover, panelAuto: true, choice: { hole: 'sgr-a-star', open: false } })).toBe('chip');
    expect(holeStripForm({ ...hover, panelAuto: true, choice: { hole: 'm87-star', open: false } })).toBe('panel');
  });

  it('always shows a fall whole, so Stop the fall stays in reach, and the card after it', () => {
    expect(holeStripForm({ ...hover, falling: true, choice: { hole: 'sgr-a-star', open: false } })).toBe('panel');
    expect(holeStripForm({ ...hover, lastEnd: { hole: 'sgr-a-star', agoMs: 5_000 } })).toBe('panel');
  });

  it('says on the chip what and where, and how much slower your clock runs', () => {
    expect(holeChipText('hovering', 'Sagittarius A*', '1.054×')).toBe('Sagittarius A* · your clock 1.054× slower');
    expect(holeChipText('roam', 'Gaia BH1', '0.013 %')).toBe('Gaia BH1 · your clock 0.013 % slower');
    expect(holeChipText('circular', 'Sagittarius A*', '1.414×')).toBe('In orbit round Sagittarius A* · your clock 1.414× slower');
    expect(holeChipText('snapshot', 'Sagittarius A*', '1.054×')).toBe('Snapshot above Sagittarius A*');
  });
});

describe('the HUD’s words', () => {
  it('says how much slower your clock runs as the card does: a share within 1 % of home’s, else a factor', () => {
    // 4,000 r_s above Sgr A*: n − 1 = 1.25 × 10⁻⁴, the card's "0.013 %".
    const n1 = 1 / Math.sqrt(1 - 1 / 4000) - 1;
    expect(timesText(1 + n1, n1)).toBe('0.013 %');
    expect(timesText(1.0541, 0.0541)).toBe('1.054×');
    expect(timesText(10.0499, 9.0499)).toBe('10.05×');
    expect(timesText(1, 0)).toBe('1×');
    expect(timesText(Infinity, Infinity)).toBe('∞');
  });

  it('writes a float64 residue of an exact 0 as 0°, and knows the innermost stable orbit however it was reached', () => {
    expect(snapshotDeg(3.28e-15 * (Math.PI / 180))).toBe('0°');
    expect(snapshotDeg((28.54 * Math.PI) / 180)).toBe('28.5°');
    expect(isInnermostStable(5.999999999999999)).toBe(true);
    expect(isInnermostStable(6)).toBe(true);
    expect(isInnermostStable(7)).toBe(false);
  });

  it('moves to the left of an open body card only where the two would overlap', () => {
    expect(stripPlace(false, 780)).toBe('left-1/2 -translate-x-1/2');
    const wide = stripPlace(true, 780);
    expect(wide).toMatch(/sm:left-3 sm:translate-x-0 sm:max-w-\[calc\(100%-340px\)\]/);
    // 2 × (390 + 16 + 300 + 8) = 1,428 px: from there both fit side by side, centred.
    expect(wide).toMatch(/min-\[1428px\]:left-1\/2/);
    expect(stripPlace(true, 560)).toMatch(/min-\[1208px\]:left-1\/2/);
  });
});

describe('the footer near a black hole', () => {
  it('reads a hovering clock’s rate, home’s as a share within a thousandth of 1, and names the hovering clock when you are not it', () => {
    // One per cent above the horizon: home's clock 10.05 times as fast.
    const a = Math.sqrt(1 - 1 / 1.01);
    expect(hoverPaceText(1, a, 1 - a, true)).toBe('1 s here · 10 s at home');
    // 4,000 r_s out, at 30 minutes a second: home's is faster by 0.013 %, which "30 min" twice would hide.
    const far = Math.sqrt(1 - 1 / 4000);
    const oneMinus = 1 / 4000 / (1 + far);
    expect(hoverPaceText(1800, far, oneMinus, true)).toBe('30 min here · home 0.013 % faster');
    // On a circular orbit your own clock is not the paced one.
    const isco = Math.sqrt(1 - 1 / 3);
    expect(hoverPaceText(1, isco, 1 - isco, false)).toBe('1 s hovering here · 1.22 s at home');
  });

  it('calls what is folded under a planet moons, and under a system or a galaxy bodies', () => {
    expect(moonsOrBodies('sun-planets')).toBe('moons');
    expect(moonsOrBodies('dwarf-planets')).toBe('moons');
    expect(moonsOrBodies('milky-way')).toBe('bodies');
    expect(moonsOrBodies('galaxies')).toBe('bodies');
    expect(moonsOrBodies('stars')).toBe('bodies');
  });
});
