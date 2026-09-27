/**
 * A deep-sky object's numbers in words, for its card and the data sheet: how far it is and how
 * that was measured, and sizes in parsecs and light-years.
 */
import { LIGHT_YEAR_KM, PARSEC_KM } from '../physics/constants';
import type { DeepSkyInfo } from '../sim/bodies';

const LY_PER_PC = PARSEC_KM / LIGHT_YEAR_KM;

/** A number to `digits` significant figures, with thousands separated: "1,270", "27,000", "0.94". */
export function roundedText(x: number, digits = 3): string {
  if (!(x > 0)) return String(x);
  const step = 10 ** (Math.floor(Math.log10(x)) - digits + 1);
  const r = Math.round(x / step) * step;
  return r.toLocaleString('en-GB', { maximumFractionDigits: Math.max(0, -Math.floor(Math.log10(step))) });
}

/** A length in parsecs as light-years, to `digits` significant figures. */
export const lightYearsText = (pc: number, digits = 3): string => roundedText(pc * LY_PER_PC, digits);

/** A size: "6.8 pc (22 light-years)". */
export function sizeText(pc: number): string {
  if (pc >= 1e5) return `${roundedText(pc / 1e6, 2)} Mpc (${bigLightYears(pc)} light-years)`;
  return `${roundedText(pc, pc < 10 ? 2 : 3)} pc (${lightYearsText(pc, 2)} light-years)`;
}

/**
 * "1,270 light-years (1,250 to 1,280) from the Sun. Distance: VLBA radio parallaxes of young
 * stars (Kounkel et al. 2017)".
 */
export function deepSkyDistanceLine(x: DeepSkyInfo): string | null {
  if (x.distancePc === undefined) return null;
  // Beyond a million light-years: "2.48 million", "33.9 billion".
  const big = x.distancePc * LY_PER_PC >= 1e6;
  const ly = (pc: number) => (big ? bigLightYears(pc) : lightYearsText(pc));
  // The range, unless it rounds to the distance itself ("440 light-years (440 to 440)").
  const lo = x.distanceLoPc !== undefined ? ly(x.distanceLoPc) : '';
  const hi = x.distanceHiPc !== undefined ? ly(x.distanceHiPc) : '';
  const range = lo && hi && x.distanceHiPc! > x.distanceLoPc! && lo !== hi ? ` (${lo} to ${hi})` : '';
  const where = x.hostGalaxy ? ` in the ${x.hostGalaxy}` : '';
  const now = x.distanceNow ? ' now' : '';
  return `${ly(x.distancePc)} light-years${range} from the Sun${now}${where}. Distance: ${x.distanceSource ?? 'catalogue'}`;
}

/** A distance of a million light-years or more in words: "2.48 million", "33.9 billion". */
export function bigLightYears(pc: number): string {
  const l = pc * LY_PER_PC;
  if (l >= 1e9) return `${roundedText(l / 1e9, 3)} billion`;
  if (l >= 1e6) return `${roundedText(l / 1e6, 3)} million`;
  return roundedText(l, 3);
}

/**
 * A picture's credit line to end a sentence with (the card's "Picture: …."): exactly as the archive
 * gives it, its line breaks kept for the page to show (Westerlund 2's has two paragraphs), with a
 * full stop added only where it has none (the Ring Nebula's and Westerlund 2's already end in one).
 */
export function creditSentence(credit: string): string {
  const t = credit.trimEnd();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
