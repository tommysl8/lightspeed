/**
 * How bright the small bodies are drawn, and which sections of them a view needs.
 *
 * Each body's apparent magnitude is real: its H (or a comet's M1, K1), its true distances from the Sun and the
 * camera, and its phase (sim/asteroids/conic.ts). The layer shows them as a deep exposure would: a body of
 * FULL_MAG and brighter at full strength, fainter ones in proportion to their light (so a swarm seen from far away
 * keeps its true surface brightness instead of piling up), fading out over FADE_MAG to nothing at LIMIT_MAG, the
 * layer's limit (the eye's limit of this exposure). Fainter bodies are not drawn at all. The exposure follows the
 * camera's distance from the Sun (exposureShift), as an eye or a camera adapts: shorter inside the belt, where the
 * bodies close by are bright, and longer far out, so the Kuiper belt,
 * a thousand times fainter than the main belt, still shows from out there.
 *
 * Sections are cut by H, so each has a brightest member; with the least perihelion and greatest aphelion of its
 * orbits, that bounds how bright any of them can look from the camera (H + 5 log10(r Δ), the phase only dims). A
 * section whose bound is fainter than the limit cannot hold a body to draw: it is skipped, and not even
 * downloaded. The test (lod.test.ts) holds every body brighter than the limit to a drawn section.
 */

/** The layer's limit, V: fainter bodies are not drawn. About the depth of the deepest surveys of the Solar System. */
export const LIMIT_MAG = 28;
/** Bodies this bright and brighter are drawn at full strength, V. */
export const FULL_MAG = 24;
/** Fainter than the limit by less than this, a body is faded out, magnitudes. */
export const FADE_MAG = 0.75;
/**
 * Bodies drawn at most in a frame: the GPU budget. On the reference laptop (Intel integrated graphics, ANGLE on
 * D3D11, pixel ratio 2) a drawn body costs about 7 ns (3.5 its orbit and brightness, 3.4 its point), so 200,000
 * of them about 1.4 ms, the layer's share of a frame (docs/data/asteroids.md §7).
 */
export const DRAW_BUDGET = 200_000;
/** Files are fetched for a plan this much larger, so the next sections are in before they are wanted. */
export const PREFETCH_BUDGET = 1.5;
/** Bodies the near search (near.ts) adds at most, the brightest-bounded first. */
export const NEAR_CAP = 20_000;
/** Sections are fetched this much before they could first show, magnitudes. */
export const PREFETCH_MAG = 1;
/** The exposure lengthens beyond this distance from the Sun, au… */
export const EXPOSURE_FROM_AU = 8;
/** …by at most this much, magnitudes (reached at 320 au)… */
export const EXPOSURE_MAX_MAG = 8;
/** …and is shorter nearer the Sun, by at most this much (reached at 0.8 au). */
export const EXPOSURE_MIN_MAG = -5;

/**
 * How much deeper the exposure is with the camera `camAu` au from the Sun, magnitudes: 5 log10(d / 8 au), so far out a
 * body's drawn strength falls as 1/d² of the camera's distance from the Sun rather than 1/Δ² of its own from the
 * camera; from EXPOSURE_MIN_MAG inside 0.8 au to EXPOSURE_MAX_MAG beyond 320. LIMIT_MAG and FULL_MAG both move by it.
 */
export function exposureShift(camAu: number): number {
  return Math.min(EXPOSURE_MAX_MAG, Math.max(EXPOSURE_MIN_MAG, 5 * Math.log10(Math.max(camAu, 1e-6) / EXPOSURE_FROM_AU)));
}

/** What a section's bound needs (format.ts SectionHead). */
export interface SectionBounds {
  /** 'comet' sections (comet magnitudes follow M1 + 5 log Δ + K1 log r) are always drawn: a few thousand bodies. */
  comet: boolean;
  hMin: number;
  /** Least perihelion and greatest aphelion, au (Infinity for open orbits). */
  rMin: number;
  rMax: number;
}

/**
 * The faintest magnitude the brightest possible member of a section can have, seen from `camAu` au from the Sun:
 * hMin + 5 log10 of the least r·Δ over the shell rMin ≤ r ≤ rMax (Δ ≥ |d − r| for a camera d from the Sun),
 * minus `slackAu` of room for the barycentre's offset. −Infinity inside the shell, or for comets.
 */
export function sectionBrightest(s: SectionBounds, camAu: number, slackAu = 0.02): number {
  if (s.comet) return -Infinity;
  const lo = Math.max(1e-3, s.rMin - slackAu);
  const hi = s.rMax + slackAu;
  if (camAu >= lo && camAu <= hi) return -Infinity;
  // r (d − r) is concave in r beyond the shell, so its least value is at an end; inside it, r (r − d) grows with r.
  const rd = camAu > hi ? Math.min(lo * (camAu - lo), hi * (camAu - hi)) : lo * (lo - camAu);
  return rd > 0 ? s.hMin + 5 * Math.log10(rd) : -Infinity;
}

/** A section for planDraw: its bound and size. */
export interface PlanSection extends SectionBounds {
  id: number;
  count: number;
}

/**
 * Which sections to draw from `camAu` au, and how many of each (a prefix), within `budget` bodies: those that could
 * show (LIMIT_MAG, moved by the exposure, with `margin` to spare), the brightest-bounded first. `limit` is the
 * magnitude every body brighter than which is drawn: the display's limit, or the bound of the first section the budget
 * left out (in part or whole) when that is brighter. Like an eye adapting, the layer then shows the brightest
 * bodies it can afford, and never leaves out one brighter than `limit`.
 */
export interface DrawPlan {
  /** Bodies drawn of each section (a prefix). */
  counts: Map<number, number>;
  /** Every body brighter than this is drawn (−Infinity: no such promise, the camera being inside a left-out shell). */
  limit: number;
  /** The display's own limit. */
  display: number;
  drawn: number;
  /** The sections the budget cut short or left out, with their first body not drawn and their bound. */
  left: { id: number; from: number; bound: number }[];
}

export function planDraw(list: readonly PlanSection[], camAu: number, budget: number, margin = 0): DrawPlan {
  const display = LIMIT_MAG + exposureShift(camAu) + margin;
  const cand: { s: PlanSection; b: number }[] = [];
  for (const s of list) {
    const b = sectionBrightest(s, camAu);
    if (b <= display) cand.push({ s, b });
  }
  // In order of the bound; a section whose shell holds the camera (no bound) by its brightest H, as if its bodies were
  // an au away from the Sun and the camera: the near search (near.ts) adds those of its bodies that pass close.
  const key = (c: { s: PlanSection; b: number }) => (c.b === -Infinity ? c.s.hMin : c.b);
  cand.sort((x, y) => key(x) - key(y) || x.s.hMin - y.s.hMin);
  const counts = new Map<number, number>();
  const left: DrawPlan['left'] = [];
  let room = budget;
  let limit = display;
  for (const { s, b } of cand) {
    const n = Math.max(0, Math.min(s.count, room));
    if (n > 0) counts.set(s.id, n);
    room -= n;
    if (n < s.count) {
      limit = Math.min(limit, b);
      left.push({ id: s.id, from: n, bound: b });
    }
  }
  return { counts, limit, display, drawn: budget - Math.max(0, room), left };
}

/**
 * The limit once the near search (near.ts) has covered the left-out sections whose shell the camera is inside
 * (`searched`; its own limit `nearLimit`): the least of that and the bounds of the left-out sections it did not cover.
 */
export function limitWithNear(plan: DrawPlan, searched: ReadonlySet<number>, nearLimit: number): number {
  let limit = Math.min(plan.display, nearLimit);
  for (const l of plan.left) if (!searched.has(l.id)) limit = Math.min(limit, l.bound);
  return limit;
}

/**
 * The strength a body of apparent magnitude `mag` is drawn with from `camAu` au, as the shader does it: 1 at
 * FULL_MAG, in proportion to its light below that, faded to 0 over the last FADE_MAG before LIMIT_MAG (both moved
 * by the exposure).
 */
export function drawnStrength(mag: number, camAu = 1): number {
  const shift = exposureShift(camAu);
  const light = Math.pow(10, -0.4 * (mag - FULL_MAG - shift));
  const t = Math.min(1, Math.max(0, (LIMIT_MAG + shift - mag) / FADE_MAG));
  return light * t * t * (3 - 2 * t);
}
