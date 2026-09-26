/**
 * Which model places the bodies at a given date, and how much to trust it.
 *
 *  precise       1700–2200 CE. astronomy-engine as is: truncated VSOP87 planets, a numerical
 *                Pluto from TOP2013 state vectors and the Improved Lunar Ephemeris (Brown) for
 *                the Moon. Its generator truncates VSOP87 by testing against JPL's DE405 over
 *                exactly this span (MIN_YEAR 1700, MAX_YEAR 2200 in generate/generate.c), and
 *                the library is verified to about 1′ there
 *                (https://github.com/cosinekitty/astronomy#readme).
 *  approximate   3000 BCE–3000 CE outside that. Planets from Standish's JPL Keplerian elements
 *                (physics/meanElements.ts), fitted to DE200 over this span: errors from 20″
 *                (Mercury) to 2000″ (Uranus). The Moon still comes from astronomy-engine,
 *                whose series in mean arguments degrade gently rather than diverge.
 *                astronomy-engine's own planets are not used here: VSOP87's polynomial terms
 *                grow without bound, and its Pluto outside 0–4000 CE integrates step by step
 *                from the table edge (far too slow for a frame).
 *  illustrative  Everything beyond. The Standish elements are frozen at the nearer edge of
 *                their span and the mean anomalies keep running; the Moon moves on mean
 *                elements; pole directions are frozen and bodies keep spinning at their edge
 *                rates. The orbits are right; the places along them are not.
 *
 * Changes of model are blended over a few years just outside each boundary, so positions stay
 * continuous. The quality reported inside a blend is the lower of the two.
 */
import { msFromCivil } from '../lib/time';

export type EphemerisQuality = 'precise' | 'approximate' | 'illustrative';

/** astronomy-engine's checked span (UTC ms): 1700-01-01 to 2200-01-01. */
export const PRECISE_START_MS = msFromCivil(1700, 1, 1);
export const PRECISE_END_MS = msFromCivil(2200, 1, 1);
/** Standish's fit span: 1 January 3000 BCE (astronomical −2999) to 1 January 3000 CE. */
export const APPROX_START_MS = msFromCivil(-2999, 1, 1);
export const APPROX_END_MS = msFromCivil(3000, 1, 1);

const YEAR_MS = 365.25 * 86_400_000;
/** Blend from astronomy-engine's planets to Standish's, just outside 1700–2200. */
export const PLANET_BLEND_MS = 20 * YEAR_MS;
/** Blend from astronomy-engine's Moon to mean elements, just outside 3000 BCE–3000 CE. */
export const MOON_BLEND_MS = 10 * YEAR_MS;

export function ephemerisQuality(ms: number): EphemerisQuality {
  if (ms >= PRECISE_START_MS && ms < PRECISE_END_MS) return 'precise';
  if (ms >= APPROX_START_MS && ms < APPROX_END_MS) return 'approximate';
  return 'illustrative';
}

/** One plain sentence per quality level, for the interface. */
export const QUALITY_NOTES: Record<EphemerisQuality, string> = {
  precise: 'Planet and Moon positions are accurate to about an arcminute (checked against JPL’s DE405 for 1700–2200).',
  approximate: 'Planet positions between 3000 BCE and 3000 CE come from JPL’s approximate orbital elements and are good to about half a degree.',
  illustrative: 'Planet positions beyond 3000 CE are illustrative: the orbits are right, the places along them are not.',
};

/** The note for a date, naming the right side of the span when it is illustrative. */
export function qualityNote(ms: number): string {
  const q = ephemerisQuality(ms);
  if (q === 'illustrative' && ms < APPROX_START_MS)
    return 'Planet positions before 3000 BCE are illustrative: the orbits are right, the places along them are not.';
  return QUALITY_NOTES[q];
}

/** Smoothstep with its derivative. */
function smooth(x: number): [number, number] {
  if (x <= 0) return [0, 0];
  if (x >= 1) return [1, 0];
  return [x * x * (3 - 2 * x), 6 * x * (1 - x)];
}

export interface Blend {
  /** Weight of the far-date model: 0 inside the span, 1 once the blend window is behind. */
  w: number;
  /** dw/dt, per second (for blending velocities consistently). */
  dw: number;
}

function blendOutside(ms: number, start: number, end: number, width: number, out: Blend): Blend {
  let x: number;
  let sign: number;
  if (ms >= end) {
    x = (ms - end) / width;
    sign = 1;
  } else if (ms < start) {
    x = (start - ms) / width;
    sign = -1;
  } else {
    out.w = 0;
    out.dw = 0;
    return out;
  }
  const [w, dwdx] = smooth(x);
  out.w = w;
  out.dw = (sign * dwdx * 1000) / width;
  return out;
}

/** Planets: 0 = astronomy-engine, 1 = Standish elements. */
export const planetBlend = (ms: number, out: Blend = { w: 0, dw: 0 }): Blend =>
  blendOutside(ms, PRECISE_START_MS, PRECISE_END_MS, PLANET_BLEND_MS, out);

/** Moon: 0 = astronomy-engine, 1 = mean elements. */
export const moonBlend = (ms: number, out: Blend = { w: 0, dw: 0 }): Blend =>
  blendOutside(ms, APPROX_START_MS, APPROX_END_MS, MOON_BLEND_MS, out);

/** Orientation models: astronomy-engine's rotation elements inside 3000 BCE–3000 CE, frozen poles beyond. */
export const orientationEdge = (ms: number): -1 | 0 | 1 => (ms >= APPROX_END_MS ? 1 : ms < APPROX_START_MS ? -1 : 0);
