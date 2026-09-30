/**
 * Flights in words and big numbers: the in-flight readout's speed, the arrival summary and
 * the cost of a trip in the search list; for flights through the expanding universe also the
 * planner's summary, the reasons a flight is refused and the home clock on arrival.
 */
import { fmtBeta, fmtGamma, qty, sci, sig, superscript } from '../../lib/sci';
import { civilFromMs, formatDurationShort, formatSimDate, isDistantYear } from '../../lib/time';
import { LIGHT_YEAR_KM } from '../../physics/constants';
import { appearance, MPC_KM, planck18, type HomeReport } from '../../physics/cosmology';
import type { HomeLight, Refusal, TripPlan } from '../../sim/travel';
import { bodyName } from '../../sim/bodies';

/**
 * 1 − β from the rapidity φ: 2/(e^{2φ} + 1), which is 1 − tanh φ without cancellation. Near c,
 * β itself rounds to 1 in float64 (at γ ≈ 10⁸ and beyond) while this stays exact.
 */
export function oneMinusBeta(phi: number): number {
  if (!Number.isFinite(phi)) return NaN;
  return 2 / (Math.exp(2 * Math.abs(phi)) + 1);
}

/**
 * Speed as a fraction of c with as many nines as it has ("0.999 990 0"), or "1 − 5.0 × 10⁻¹⁹"
 * once the nines no longer fit; and the Lorentz factor, from cosh φ, exact at any size.
 * The fictional warp has a speed above c and no real γ.
 */
export function speedText(s: { beta: number; phi: number }, warp: boolean): { beta: string; gamma: string } {
  if (warp) return { beta: sig(s.beta, 3), gamma: 'imaginary' };
  const gap = oneMinusBeta(s.phi);
  let beta: string;
  if (!Number.isFinite(gap)) beta = fmtBeta(s.beta);
  // Past φ ≈ 355, e^{2φ} overflows: give the order of magnitude, log10(2e^{−2φ}).
  else if (gap === 0) beta = `1 − 10${superscript(Math.round((Math.LN2 - 2 * Math.abs(s.phi)) / Math.LN10))}`;
  else if (gap < 1e-9) beta = `1 − ${sci(gap, 2)}`;
  else beta = fmtBeta(s.beta);
  return { beta, gamma: Number.isFinite(s.phi) ? fmtGamma(Math.cosh(s.phi)) : '—' };
}

/**
 * A duration rounded the way people say it: "8.4 s", "34 min", "1 h 18 min", "12 days",
 * "3.4 months", "5.9 years", "2.5 million years".
 */
export function roughDuration(seconds: number): string {
  const s = Math.abs(seconds);
  if (!Number.isFinite(s)) return formatDurationShort(seconds);
  if (s < 59.5) return formatDurationShort(seconds, 2);
  if (s < 3570) return `${Math.round(s / 60)} min`;
  if (s < 86_400) {
    let h = Math.floor(s / 3600);
    let m = Math.round((s - h * 3600) / 60);
    if (m === 60) {
      h += 1;
      m = 0;
    }
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return formatDurationShort(seconds, 2);
}

/** The date at home in words: "11 April 2032", "14 March 4,995 BCE"; far from now, "year 2.54 million". */
export function homeDateText(ms: number): string {
  if (isDistantYear(civilFromMs(ms).year)) return formatSimDate(ms, 'date');
  // Only the time of day comes off: the year itself may contain a comma ("4,995 BCE").
  return formatSimDate(ms, 'long').replace(/, \d{2}:\d{2}:\d{2} UTC$/, '');
}

export interface ArrivalFacts {
  destName: string;
  /** Sun-frame (home) duration of the trip, s. */
  earthTime: number;
  /** Ship (proper) time, s; NaN for the fictional warp. */
  shipTime: number;
  warp: boolean;
  /** Home time at arrival (simulation ms). */
  endMs: number;
}

const YEAR_S = 365.25 * 86_400;

/**
 * The arrival card's words: "Arrived at Saturn. The trip took 34 min for you and 1 h 18 min at
 * home." and, for trips of a year or more at home, "You are 29 years older. At home it is now
 * year 2.54 million."
 */
export function arrivalText(a: ArrivalFacts): { headline: string; more: string | null } {
  if (a.warp) {
    return {
      headline: `Arrived at ${a.destName}. The trip took ${roughDuration(a.earthTime)} at home.`,
      more: 'On board the time is undefined: nothing can travel faster than light, and this drive is fiction.',
    };
  }
  const headline = `Arrived at ${a.destName}. The trip took ${roughDuration(a.shipTime)} for you and ${roughDuration(a.earthTime)} at home.`;
  if (a.earthTime < YEAR_S) return { headline, more: null };
  return { headline, more: `You are ${formatDurationShort(a.shipTime, 2)} older. At home it is now ${homeDateText(a.endMs)}.` };
}

/** What a trip costs, for the search list: "3.5 years for you · 5.9 years at home". */
export const tripCostText = (plan: { shipTime: number; earthTime: number }): string =>
  `${roughDuration(plan.shipTime)} for you · ${roughDuration(plan.earthTime)} at home`;

// ─── The expanding universe ──────────────────────────────────────────────────────────────

/** An acceleration in g, as people write it: "1 g", "0.1 g", "2.5 g". */
export const gText = (g: number): string => `${Number(g.toPrecision(3))} g`;

/** A speed as a fraction of c, as people write it: "0.5", "0.999 99" (no padding). */
const betaWords = (b: number): string => fmtBeta(b).replace(/(\.\d[\d\s]*?)[\s0]+$/, '$1');

/** The label every flight beyond the Local Group carries: what is a model. */
export const FLRW_MODEL_NOTE =
  'The standard model of cosmology (flat Lambda-CDM, Planck 2018). A model: a perfect engine that never runs out, and galaxies carried along by the expansion or held in their group or cluster (their own motions are left out).';

/** A distance in light-years, in words: "0.97 light-years", "25,900 light-years", "53.8 million light-years", "16.6 billion light-years". */
export function lightYearsText(km: number, digits = 3): string {
  const ly = km / LIGHT_YEAR_KM;
  if (!Number.isFinite(ly)) return '—';
  if (ly >= 1e12) return `${sig(ly / 1e12, digits)} trillion light-years`;
  if (ly >= 1e9) return `${sig(ly / 1e9, digits)} billion light-years`;
  if (ly >= 1e6) return `${sig(ly / 1e6, digits)} million light-years`;
  if (ly >= 1000) {
    const step = 10 ** Math.max(0, Math.floor(Math.log10(ly)) - digits + 1);
    return `${(Math.round(ly / step) * step).toLocaleString('en-GB')} light-years`;
  }
  return `${sig(ly, Math.min(digits, 2))} light-years`;
}

/** A span of years in words ("55 years", "54 million years", "1.6 billion years"). */
export const yearsText = (yr: number, digits = 2): string => formatDurationShort(yr * YEAR_S, digits);

/** A number of years as a value and a unit for the big readouts: "18.93" "billion yr". */
export function yearsParts(yr: number): { v: string; u: string } {
  const a = Math.abs(yr);
  if (a >= 1e12) return { v: sig(yr / 1e12, 4), u: 'trillion yr' };
  if (a >= 1e9) return { v: sig(yr / 1e9, 4), u: 'billion yr' };
  if (a >= 1e6) return { v: sig(yr / 1e6, 4), u: 'million yr' };
  return { v: sig(yr, 5), u: 'yr' };
}

/** A length as a value and a unit in light-years for the big readouts: "53.8" "million ly". */
export function lightYearsParts(km: number): { v: string; u: string } {
  const ly = km / LIGHT_YEAR_KM;
  if (ly >= 1e9) return { v: sig(ly / 1e9, 4), u: 'billion ly' };
  if (ly >= 1e6) return { v: sig(ly / 1e6, 4), u: 'million ly' };
  return { v: sig(ly, 4), u: 'ly' };
}

/** A redshift: "0.0037", "2.157", "1.9 × 10⁹", "0" (below a part in a billion). */
export function redshiftText(z: number): string {
  if (!Number.isFinite(z)) return z > 0 ? '∞' : '—';
  if (z < 1e-9) return '0';
  if (z < 1e-3) return sci(z, 2);
  if (z < 1e4) return sig(z, 4, { group: false });
  return sci(z, 2);
}

/** How much bigger the universe is: "0.37% larger", "3.16 times as large". */
export function growthText(ratio: number): string {
  const pct = (ratio - 1) * 100;
  if (pct < 0.001) return 'hardly any larger';
  if (pct < 100) return `${sig(pct, 2)}% larger`;
  return `${sig(ratio, 3)} times as large`;
}

/** The same compared with the start: "0.37% larger than when you left", "3.16 times as large as when you left". */
const grownSince = (ratio: number): string => `${growthText(ratio)} ${ratio >= 2 ? 'as' : 'than'} when you left`;

/**
 * The planner's sentence for a flight through expanding space: "You arrive 35 years older; the
 * universe is 54 million years older too."
 */
export function flrwSentence(plan: Pick<TripPlan, 'shipTime' | 'earthTime'>): string {
  return `You arrive ${roughDuration(plan.shipTime).replace(/^1 years$/, '1 year')} older; the universe is ${roughDuration(plan.earthTime)} older too.`;
}

/** A destination's distance now and when its light left it (the planner and the refusals). */
function seenFrom(chiMpc: number, aDep: number): { now: string; lookback: string; then: string } | null {
  const app = appearance(planck18(), aDep, chiMpc);
  if (app.hidden === 'beyond-particle-horizon') return null;
  return { now: lightYearsText(app.properDistanceNowMpc * MPC_KM), lookback: yearsText(app.lookbackGyr * 1e9, 3), then: lightYearsText(app.properDistanceThenMpc * MPC_KM, 2) };
}

/**
 * Why a flight is refused, in plain words, with the event horizon's distance where it matters.
 * `name` is the destination's as a sentence uses it ("the Coma Cluster").
 */
export function refusalText(r: Refusal, name: string): { title: string; text: string } {
  const g = gText(r.accelG);
  // Distances as they are at departure (proper): the comoving ones times the scale factor then.
  const d = lightYearsText(r.distanceKm * r.aDep);
  const h = lightYearsText(r.horizonKm * r.aDep);
  switch (r.reason) {
    case 'beyond-event-horizon': {
      const seen = seenFrom(r.distanceKm / MPC_KM, r.aDep);
      const light = seen ? ` The light we see from it set out ${seen.lookback} ago, when it was only ${seen.then} away.` : '';
      return {
        title: 'Beyond the cosmic event horizon',
        text: `${cap(name)} is ${d} away now, beyond the cosmic event horizon, which is ${h} away. The expansion of the universe is speeding up, so the space between here and anything beyond the horizon grows faster than light can cross it: light sent from here today will never get there, and no ship can do better than light, however long it flies.${light}`,
      };
    }
    case 'beyond-reach':
      return {
        title: 'Too close to the cosmic event horizon',
        text: `${cap(name)} is ${d} away, just inside the cosmic event horizon (${h} away). A ship that sets out from rest falls behind a flash of light sent at the same moment, and at ${g} it stays at least ${lightYearsText(Math.max(0, r.horizonKm - r.maxKm) * r.aDep)} behind for ever: it can never get closer to the horizon than that, even with unlimited time.`,
      };
    case 'ship-time-limit':
      return {
        title: 'Too far for the time on board',
        text: `At ${Number.isFinite(r.beta) ? `a steady ${betaWords(r.beta)}c` : g}, ${yearsText(r.maxShipTimeYr, 3)} on board take you at most ${lightYearsText(r.maxKm * r.aDep)}; ${name} is ${d} away. Allow more time on board${Number.isFinite(r.beta) ? ' or go faster' : ' or push harder'}.${r.model === 'flrw' ? ` (The cosmic event horizon is ${h} away.)` : ''}`,
      };
    case 'beyond-reach-at-cruise-speed':
      return {
        title: 'Out of reach at this speed',
        text: `At a steady ${betaWords(r.beta)}c the ship can never cover the ${d} to ${name}: the universe keeps growing while you cruise, and the farthest you could ever get is ${lightYearsText(r.maxKm * r.aDep)}. Go faster, or take the rocket. (The cosmic event horizon is ${h} away.)`,
      };
    case 'cruise-speed-unattainable':
      return {
        title: 'The engine cannot hold that speed',
        text: `Out here the expansion drags a ship back towards the galaxies it passes, and at ${g} the engine cannot hold ${betaWords(r.beta)}c against it. Choose a lower speed, or the rocket.`,
      };
    case 'recedes':
      return { title: 'Out of reach at this speed', text: `${cap(name)} recedes faster than the ship can close.` };
    case 'gravity-well':
      return { title: 'Climb out first', text: gravityWellText(r) };
    default:
      return { title: 'No flight', text: `The flight could not be worked out: ${r.detail}` };
  }
}

/**
 * Why the planner will not set out from deep in a black hole's gravity (under the title "Climb out first"): it
 * leaves gravity out, which within 30 times the horizon's radius would be wrong.
 */
export function gravityWellText(r: Pick<Refusal, 'hole' | 'wellKm'>): string {
  const hole = r.hole ? bodyName(r.hole) : 'the black hole';
  const far = r.wellKm && Number.isFinite(r.wellKm) ? ` (${distanceWords(r.wellKm)} from its centre)` : '';
  return `The planner leaves out gravity, which within 30 horizon radii of ${hole}${far} would be wrong. Move the camera farther out and plan the flight from there.`;
}

/** A distance for a sentence: "2.5 au", "19 million km", "3.1 light-years". */
function distanceWords(km: number): string {
  const q = qty(km, 'length', 2);
  return `${q.v} ${q.u}`;
}

/** The home clock on arrival, in sentences: the Sun, the Earth, the Local Group, the sky from home, the universe. */
export function homeClockText(home: HomeReport, arrivalAgeGyr: number): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const s = home.sun;
  out.push({ label: 'The Sun', text: `A ${s.phaseName}. ${s.text}` });
  out.push({ label: 'The Earth', text: home.earth });
  out.push({ label: 'Milky Way and Andromeda', text: home.andromeda });
  out.push({ label: 'Large Magellanic Cloud', text: home.lmc });
  out.push({ label: 'The sky from home', text: skyFromHome(home) });
  out.push({
    label: 'The universe',
    text: `${sig(arrivalAgeGyr, 4)} billion years old; the cosmic microwave background has cooled to ${home.cmbTemperatureK < 0.01 ? sci(home.cmbTemperatureK, 2) : sig(home.cmbTemperatureK, 3)} K.`,
  });
  return out;
}

/** Which of the nearby groups and clusters home can still see, and at what redshift. */
function skyFromHome(home: HomeReport): string {
  const sky = home.sky;
  if (!sky.length) return '';
  const inside = sky.filter((v) => !v.crossed);
  const crossed = sky.filter((v) => v.crossed);
  const list = (xs: typeof sky) => (xs.length === 1 ? xs[0].name : `${xs.slice(0, -1).map((x) => x.name).join(', ')} and ${xs[xs.length - 1].name}`);
  const parts: string[] = [];
  if (inside.length) {
    const next = inside.reduce((a, b) => (b.crossesHorizonFromNowGyr < a.crossesHorizonFromNowGyr ? b : a));
    const left = next.crossesHorizonFromNowGyr - home.fromNowGyr;
    parts.push(
      `Home can still see ${list(inside.map((v) => ({ ...v, name: `${v.name} (z = ${zShort(v.redshiftSeen)})` })))}, all still inside the cosmic event horizon. ${cap(next.name)} will be first to slip over it, in about ${yearsText(left * 1e9, 2)}.`,
    );
  }
  // The horizon meant is the cosmic one (not a black hole's): named so in the sentence before.
  if (crossed.length)
    parts.push(
      `${inside.length ? '' : 'The nearby groups and clusters are all beyond the cosmic event horizon now. '}${cap(list(crossed.map((v) => ({ ...v, name: `${v.name} (z = ${zShort(v.redshiftSeen)})` }))))} ${crossed.length === 1 ? 'has' : 'have'} crossed the event horizon: home still receives ${crossed.length === 1 ? 'its' : 'their'} old light, ever redder and fainter, but nothing ${crossed.length === 1 ? 'it sends' : 'they send'} now will ever arrive.`,
    );
  return parts.join(' ');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A redshift to two figures, for lists: "0.00082", "0.022", "1.2", "321", "3 × 10²²". */
function zShort(z: number): string {
  if (!Number.isFinite(z)) return '∞';
  if (z >= 1e4) return sci(z, 1);
  if (z >= 100) return String(Math.round(z));
  return String(Number(z.toPrecision(2)));
}

export interface ArrivalCosmicFacts {
  shipTime: number;
  cosmicYears: number;
  ageGyr: number;
  growth: number;
  /** Home's light where the flight ended (travel.ts HomeLight). */
  home: HomeLight;
  /** The light of where the ship set out, seen there (the module's plan.home): its redshift, and when it left, years after the ship did. */
  departure: { z: number; afterDepartureYr: number };
}

/**
 * The arrival card's words after a flight through expanding space: how much older you are, the age
 * and size of the universe, and home as its light now shows it (and, after a flight that did not set
 * out from home, where you set out).
 */
export function arrivalCosmicText(a: ArrivalCosmicFacts): string {
  return `You are ${formatDurationShort(a.shipTime, 2)} older; at home ${yearsText(a.cosmicYears, 3)} have passed. The universe is now ${sig(a.ageGyr, 4)} billion years old and ${grownSince(a.growth)}. ${homeLight(a)}`;
}

/** What the light from home (and from where you set out) shows on arrival. */
function homeLight(a: ArrivalCosmicFacts): string {
  const stretched = (z: number) => `stretched by the expansion to z = ${redshiftText(z)}`;
  // A fast ship arrives right behind the light that left as it did.
  const soon = (yr: number) => yr < 1e-3 * a.cosmicYears;
  const h = a.home;
  if (h.fromHome) {
    const when = yearsText(h.afterDepartureYr, 2);
    if (soon(h.afterDepartureYr)) return `The light from home reaching you left it only ${when} after you did, ${stretched(h.z)}: through a telescope, home still looks as it did when you set out.`;
    return `The light from home reaching you left it ${when} after you did, ${stretched(h.z)}.`;
  }
  const d = a.departure;
  const there = `The light reaching you from where you set out left it ${soon(d.afterDepartureYr) ? 'only ' : ''}${yearsText(d.afterDepartureYr, 2)} after you did, ${stretched(d.z)}.`;
  if (h.inLocalGroup) return `You are back in the Local Group, where space does not expand: home’s light is not stretched. ${there}`;
  const when = h.afterDepartureYr >= 0 ? `${yearsText(h.afterDepartureYr, 2)} after you set out` : `${yearsText(-h.afterDepartureYr, 2)} before you set out`;
  return `The light from home reaching you left it ${when}, ${stretched(h.z)}. ${there}`;
}
