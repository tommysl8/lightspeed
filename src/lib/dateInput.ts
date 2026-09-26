/**
 * Dates typed into the date chip. (Whether the clock shows the present is sim.live.)
 */
import { msFromCivil, parseSimDate } from './time';

/**
 * A date as a person types it: anything parseSimDate reads ("2026-09-25 14:03", "-1999-03-12",
 * "2000-03-12 BCE"), or a year on its own ("1969", "-500", "500 BCE", "44 BC", "1066 CE"),
 * which means 1 January of that year at midnight UTC. NaN when it is neither.
 */
export function parseDateInput(text: string): number {
  const full = parseSimDate(text);
  if (Number.isFinite(full)) return full;
  const m = text.trim().match(/^([+-]?)(\d{1,14})\s*(BCE|BC|CE|AD)?$/i);
  if (!m) return NaN;
  const [, sign, digits, era = ''] = m;
  let year = Number(digits);
  if (/^BC/i.test(era)) {
    if (sign === '-' || year < 1) return NaN;
    year = 1 - year; // 1 BCE is astronomical year 0
  } else if (sign === '-') year = -year;
  return msFromCivil(year, 1, 1);
}
