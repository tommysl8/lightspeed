/**
 * Flights in words and big numbers: the in-flight readout's speed, the arrival summary and
 * the cost of a trip in the search list.
 */
import { fmtBeta, fmtGamma, sci, sig, superscript } from '../../lib/sci';
import { civilFromMs, formatDurationShort, formatSimDate, isDistantYear } from '../../lib/time';

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
