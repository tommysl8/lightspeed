/**
 * A star's numbers in words, for its card and the data sheet: what it is, how hot, how bright and
 * how big (with "≈" where the value is the app's estimate rather than a measurement), and how far
 * from the Sun, with how the distance was measured.
 */
import { LIGHT_YEAR_KM, PARSEC_KM } from '../physics/constants';
import { sig } from '../lib/sci';
import type { StarInfo } from '../sim/bodies';

const approx = (estimated: boolean) => (estimated ? '≈ ' : '');

/** "A1 V · 9845 K · 24.7 L☉ · 1.71 R☉": the estimates marked with ≈, a colour temperature said so. */
export function starPhysicalLine(s: StarInfo): string {
  const parts: string[] = [];
  if (s.spectralType) parts.push(s.spectralType);
  if (s.teffSource !== 'unknown') parts.push(`${sig(s.teffK, s.teffSource === 'colour' ? 3 : 4, { sciAbove: 7 })} K${s.teffSource === 'colour' ? ' (colour)' : ''}`);
  if (s.luminosityLsun !== undefined) parts.push(`${approx(s.luminositySource === 'estimated')}${sig(s.luminosityLsun, 3, { sciAbove: 7 })} L☉`);
  if (s.radiusRsun !== undefined) parts.push(`${approx(s.radiusSource === 'estimated')}${sig(s.radiusRsun, 3, { sciAbove: 7 })} R☉`);
  return parts.join(' · ');
}

/** "8.61 light-years from the Sun. Distance: the published model of its system, better than 1%". */
export function starDistanceLine(s: StarInfo): string {
  return `${starDistanceWords(s)}. ${starDistanceSource(s)}`;
}

/** The distance alone, for the card: "8.61 light-years from the Sun". */
export function starDistanceWords(s: StarInfo): string {
  const ly = (s.distancePc * PARSEC_KM) / LIGHT_YEAR_KM;
  return `${sig(ly, ly < 100 ? 3 : 4)} light-years from the Sun`;
}

/** How it was measured, for the card's sources: "Distance: the published model of its system, better than 1%". */
export function starDistanceSource(s: StarInfo): string {
  return `Distance: ${s.distanceSource}, ${s.distancePrecision}`;
}
