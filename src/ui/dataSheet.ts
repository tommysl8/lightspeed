/**
 * Numbers of the data sheet (instruments, "Target") printed to the precision they have: a value
 * read from a data file keeps the digits stored and no more; a value with a stated uncertainty
 * is rounded to it; an estimate gets three figures and "≈". Six padded figures would claim a
 * precision nobody measured (a comet nucleus "1.500 00 km" across).
 *
 * Also the sheet's notes (sheetNotes): what the card says is a model, and for a black hole what its card
 * leaves out (the card shows at most three notes and links here; docs/data/blackholes.md §3 lists where each shows),
 * each subject once: where the record has a fuller note than the card's (the spin, the gas, the star cluster,
 * an assumed orbit), the sheet gives the fuller one. A black hole's "radius" is its horizon's. Cost: a few
 * string operations when the sheet renders.
 */
import type { BodyRecord } from '../sim/bodies';
import { fixed, groupDigits, sig, storedDigits } from '../lib/sci';

export interface Reading {
  /** Row label. */
  l: string;
  v: string;
  u: string;
  /** Why the value is shown as it is, for the row's tooltip. */
  title?: string;
}

/** x and its 1σ, both rounded to σ's first significant figure: "500 ± 40", "2574.76 ± 0.02". */
export function withSigma(x: number, sigma: number): string {
  const p = Math.floor(Math.log10(sigma));
  if (p >= 0) {
    const k = 10 ** p;
    return `${groupDigits(String(Math.round(x / k) * k))} ± ${Math.round(sigma / k) * k}`;
  }
  return `${fixed(x, -p)} ± ${fixed(sigma, -p)}`;
}

/** A value as stored in a data file: up to `digits` significant figures, and no more than it has. */
export const stored = (x: number, digits = 6): string => sig(x, Math.min(digits, storedDigits(x)));

/**
 * The radius row: rough sizes, estimates and measurements each printed as what they are.
 * `label` names the row when the body gives it another name ("Mean radius").
 */
export function radiusReading(r: BodyRecord, label = 'Radius'): Reading {
  const d = r.physical;
  const km = d.radiusKm;
  if (r.kind === 'spacecraft' && km < 0.01) return { l: 'Size (half its length)', v: sig(km * 1000, 3), u: 'm' };
  // A black hole's size is its horizon, 2GM/c² for one that does not spin (it has no surface to measure).
  if (r.kind === 'black-hole') return { l: 'Horizon radius', v: sig(r.blackHole?.rsKm ?? km, 4), u: 'km', title: '2GM/c², for a black hole that does not spin' };
  if (d.radiusRough) {
    return { l: `${label} (rough)`, v: `≈ ${stored(km, 2)}`, u: 'km', title: 'Only its order of magnitude is known: see the card' };
  }
  const star = r.star;
  if (star) {
    const est = star.radiusSource !== 'literature';
    return est
      ? { l: `${label} (estimated)`, v: `≈ ${sig(km, 3)}`, u: 'km', title: 'From its luminosity and temperature (Stefan–Boltzmann)' }
      : { l: label, v: sig(km, 3), u: 'km', title: 'Measured (see the references)' };
  }
  const x = r.exoplanet;
  if (x) {
    if (x.radiusSource === 'measured') return { l: label, v: sig(km, 3), u: 'km', title: 'Measured from its transits' };
    const why = x.radiusSource === 'placeholder' ? 'placeholder' : 'estimated';
    return { l: `${label} (${why})`, v: `≈ ${sig(km, 3)}`, u: 'km', title: x.radiusSource === 'placeholder' ? 'Neither its size nor its mass is measured' : 'Estimated from its mass (Chen & Kipping 2017)' };
  }
  if (d.radiusSigmaKm && d.radiusSigmaKm > 0) return { l: label, v: withSigma(km, d.radiusSigmaKm), u: 'km', title: 'With its 1σ uncertainty' };
  return { l: label, v: stored(km), u: 'km' };
}

// ─── What is a model: the notes of the data sheet ────────────────────────────────────────

/**
 * Near every black hole's lens (label 4 of docs/data/blackholes.md §3): the diffuse light is resampled, the stars
 * are exact. On each hole's data sheet.
 */
export const LENS_SHEET_NOTE =
  'Near its ring of light the Milky Way’s glow, the Galaxy’s particles and the galaxies are resampled from quarter-resolution pictures as if their light came from very far away (the nuclear star cluster’s own glow partly does not), and in flight recoloured with an approximate spectral model; the stars keep their exact colours.';

/**
 * The statistical stars round Sgr A* (label 14), on the Milky Way's data sheet: they are the Galaxy's nuclear
 * cluster and disc, drawn as a model.
 */
export const NSC_SHEET_NOTE =
  'The stars within a few parsecs of Sagittarius A* are a statistical model of the nuclear star cluster and disc: their numbers, brightness and colours follow published fits, but none is a real star except S2, S29, S38 and S55; stars fainter than those drawn, and any within 0.01 pc of you, are a smooth glow.';

const lowerFirst = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
/**
 * A note as a sentence: a full stop added unless it ends in one (or in one inside a closing bracket). A closing
 * bracket alone ends no sentence: "… (Ramachandran et al. 2025)."
 */
export const sentence = (s: string): string => (/[.!?]\)?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/**
 * A black hole's card notes that its data sheet says more fully in a note of its own: [the card note's start, the
 * fuller note's start]. The sheet gives the fuller one only. (The spin is merged apart: holeSpinLine.)
 */
const FULLER_ON_SHEET: readonly (readonly [RegExp, RegExp])[] = [
  [/^The glow round it\b/, /^The accretion flow is a model\b/],
  [/^The stars within a few parsecs\b/, /^The stars round it within a few parsecs\b/],
  [/^The orientation of its orbit\b/, /^Assumed, not measured: /],
];

/** The card's spin note (always its first: label 1). */
const CARD_SPIN = /^Drawn without spin\b/;

/**
 * The sheet's one line on a black hole's spin, from the record's spin note and the card's: that it is drawn without
 * spin, what is measured (the record's note, less its own "drawn without"), and what a spin would change (the
 * record's note says it for Sgr A* and M87*; else the card's clause on the shadow, "a fast spin would make its
 * shadow up to 12 % narrower …").
 */
export function holeSpinLine(spinNote: string, cardSpin: string | undefined): string {
  const measured = sentence(spinNote.trim().replace(/;\s*drawn without\.?$/i, '.'));
  const effect = /\bshadow\b/.test(spinNote) || !cardSpin ? undefined : /(?:^|[:;,]\s)([^:;,]*\bshadow\b.*)$/.exec(cardSpin)?.[1];
  return `Drawn without spin (Schwarzschild). Spin ${lowerFirst(measured)}${effect ? ` ${upperFirst(sentence(effect))}` : ''}`;
}

/**
 * Every note of a body's data sheet, in order: how far to trust its position, what else is a model (the card's
 * notes), and for a black hole the notes its card leaves out (the card shows at most three):
 * its spin (with the card's note, one line), a mass another study disputes, the orbital elements assumed rather
 * than measured, its record's sheet notes, and the lens's own caveat. Each note once, and each subject once: a
 * card note the record says more fully (FULLER_ON_SHEET) gives way to the fuller note.
 */
export function sheetNotes(r: BodyRecord): string[] {
  const h = r.blackHole;
  const once = (a: (string | undefined)[]): string[] => [...new Set(a.filter((n): n is string => !!n))];
  if (!h) return once([r.positionNote, ...(r.modelNotes ?? []), r.id === 'milky-way' ? NSC_SHEET_NOTE : undefined]);
  const more = h.sheetNotes ?? [];
  const extra: string[] = [];
  // A contested mass the record's own notes do not already discuss (label 22).
  if (h.massNote && !more.some((n) => /\bmass\b/i.test(n))) extra.push(`Mass: ${lowerFirst(sentence(h.massNote))}`);
  if (h.assumed?.length) extra.push(`Assumed, not measured: ${h.assumed.join('; ')}.`);
  extra.push(...more, LENS_SHEET_NOTE);
  const card = r.modelNotes ?? [];
  const spin = holeSpinLine(h.spin.note, card.find((n) => CARD_SPIN.test(n)));
  const kept = card.filter((n) => !CARD_SPIN.test(n) && !FULLER_ON_SHEET.some(([c, f]) => c.test(n) && extra.some((x) => f.test(x))));
  return once([r.positionNote, spin, ...kept, ...extra]);
}

/** Whether a card note of `r` is on its data sheet, itself or as the fuller note on its subject (for the tests). */
export function cardNoteOnSheet(r: BodyRecord, note: string): boolean {
  const sheet = sheetNotes(r);
  if (sheet.includes(note)) return true;
  if (CARD_SPIN.test(note)) return sheet.some((n) => n.startsWith('Drawn without spin (Schwarzschild). Spin '));
  return FULLER_ON_SHEET.some(([c, f]) => c.test(note) && sheet.some((n) => f.test(n)));
}
