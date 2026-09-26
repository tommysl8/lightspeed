/**
 * Simulation time for any date from the Big Bang to ten trillion years ahead.
 *
 * sim.timeMs is a plain float64: milliseconds since 1970-01-01 00:00 UTC. It is never turned
 * into a JavaScript Date for the simulation or for display, because a Date only covers
 * ±8.64 × 10¹⁵ ms (±275,760 years) and astronomy-engine throws on an invalid Date. Calendar
 * dates come from Howard Hinnant's days-from-civil algorithms on the proleptic Gregorian
 * calendar (https://howardhinnant.github.io/date_algorithms.html). They are integer
 * arithmetic, so in float64 they stay exact while the day count is below 2⁵³, about 2.5 × 10¹³
 * years.
 *
 * Years use astronomical numbering internally: year 0 is 1 BCE and year −1 is 2 BCE.
 *
 * Resolution: a float64 keeps about 16 significant digits, so the clock's resolution grows with
 * the date: 0.24 µs today, 1 ms near year 275,000, 4 s at year 10⁹ and about 19 hours at
 * 10¹³. The simulation clock carries the sub-resolution remainder forward (see
 * sim/clock.ts), so time never stalls, it only advances in coarser steps.
 */
import { DeltaT_EspenakMeeus, MakeTime, SetDeltaTFunction, type AstroTime } from 'astronomy-engine';
import { exponentOf } from './sci';

export const SECOND_MS = 1000;
export const DAY_MS = 86_400_000;
/** Julian year (365.25 days), ms. */
export const JULIAN_YEAR_MS = 365.25 * DAY_MS;
/**
 * 2000-01-01 12:00 UT in ms since 1970: astronomy-engine's zero of `ut`. (The J2000.0 epoch
 * proper is 12:00 TT, which is 11:58:55.816 UTC; astronomy-engine applies ΔT itself.)
 */
export const J2000_MS = 946_728_000_000;

// ─── Calendar (proleptic Gregorian, Hinnant) ─────────────────────────────────────────────

export interface CivilDate {
  /** Astronomical year: 0 is 1 BCE. */
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

export interface CivilDateTime extends CivilDate {
  hour: number;
  minute: number;
  /** Seconds including the fraction, 0 ≤ second < 60. */
  second: number;
}

/**
 * Days since 1970-01-01 of a proleptic Gregorian date (Hinnant's days_from_civil). Exact for
 * integer inputs while the result stays below 2⁵³ in magnitude.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  let era = Math.floor(y / 400);
  let yoe = y - era * 400; // [0, 399]
  // Float division can land an era off by one for huge years; integer fix-ups keep it exact.
  if (yoe < 0) {
    era -= 1;
    yoe += 400;
  } else if (yoe >= 400) {
    era += 1;
    yoe -= 400;
  }
  const mp = month > 2 ? month - 3 : month + 9; // March = 0
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146_097 + doe - 719_468;
}

/** Proleptic Gregorian date of a day count since 1970-01-01 (Hinnant's civil_from_days). */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719_468;
  let era = Math.floor(z / 146_097);
  let doe = z - era * 146_097; // [0, 146096]
  if (doe < 0) {
    era -= 1;
    doe += 146_097;
  } else if (doe >= 146_097) {
    era += 1;
    doe -= 146_097;
  }
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365); // [0, 399]
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export const isLeapYear = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Calendar date and time of day (UTC) of a simulation time. */
export function civilFromMs(ms: number): CivilDateTime {
  let days = Math.floor(ms / DAY_MS);
  let rem = ms - days * DAY_MS;
  // At very large |ms| the product rounds, which can push the remainder just outside a day.
  if (rem < 0) {
    days -= 1;
    rem += DAY_MS;
  } else if (rem >= DAY_MS) {
    days += 1;
    rem -= DAY_MS;
  }
  rem = Math.min(Math.max(rem, 0), DAY_MS - 1e-6);
  const hour = Math.floor(rem / 3_600_000);
  const minute = Math.floor((rem - hour * 3_600_000) / 60_000);
  const second = (rem - hour * 3_600_000 - minute * 60_000) / 1000;
  return { ...civilFromDays(days), hour, minute, second };
}

/** Simulation time (ms since 1970, UTC) of a proleptic Gregorian date and time. */
export function msFromCivil(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0): number {
  return daysFromCivil(year, month, day) * DAY_MS + hour * 3_600_000 + minute * 60_000 + second * 1000;
}

// ─── astronomy-engine ────────────────────────────────────────────────────────────────────

/** Universal Time in days since J2000.0 (astronomy-engine's `ut`). */
export const utDaysSinceJ2000 = (ms: number): number => (ms - J2000_MS) / DAY_MS;
export const msFromUtDays = (ut: number): number => ut * DAY_MS + J2000_MS;

/** astronomy-engine time for a simulation time. Built from a day count, never from a Date. */
export const astroTimeAt = (ms: number): AstroTime => MakeTime(utDaysSinceJ2000(ms));
/** Simulation time (ms) of an astronomy-engine time. */
export const msFromAstroTime = (t: AstroTime): number => msFromUtDays(t.ut);

/**
 * ΔT = TT − UT. astronomy-engine uses Espenak & Meeus's polynomials, whose long-term branch is
 * the parabola −20 + 32u² s (u in centuries from 1820; Morrison & Stephenson 2004). Left alone
 * it reaches 10⁸ years at year 10⁹ and turns TT negative before year −10⁹. Beyond the settable
 * calendar (years −10,000 to +10,000, where ΔT is about 5.2 and 2.5 days) it is held at its
 * edge value, so far from the present the clock runs as uniform time, which is what the
 * simulation needs. Inside that span the function is astronomy-engine's own, unchanged.
 * https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html
 */
const DELTA_T_UT_MIN = utDaysSinceJ2000(msFromCivil(-10_000, 1, 1));
const DELTA_T_UT_MAX = utDaysSinceJ2000(msFromCivil(10_000, 1, 1));
export const deltaTSeconds = (ut: number): number =>
  DeltaT_EspenakMeeus(Math.min(DELTA_T_UT_MAX, Math.max(DELTA_T_UT_MIN, ut)));
SetDeltaTFunction(deltaTSeconds);

/**
 * A day count for a float32 shader uniform. float32 resolves 0.06 days at 2²⁰ days and nothing
 * useful at 10¹¹, so within ±2²¹ days (about ±5,700 years) the count goes in as is; beyond, it
 * is wrapped into [0, 2²¹). Anything the shader moves along an orbit then sits somewhere
 * illustrative on it (as it would anyway after millennia of unmodelled perturbations), but
 * keeps moving smoothly instead of freezing or flickering.
 */
export function shaderDays(days: number): number {
  const W = 2 ** 21;
  return Math.abs(days) < W ? days : days - Math.floor(days / W) * W;
}

// ─── Numbers in words ────────────────────────────────────────────────────────────────────

const nfCache = new Map<number, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  let f = nfCache.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    nfCache.set(decimals, f);
  }
  return f;
}

/** |x| to `digits` significant figures, trailing zeros dropped, thousands grouped with commas. */
function sigText(x: number, digits: number): string {
  const a = Math.abs(x);
  if (a === 0) return '0';
  const r = Number(a.toPrecision(digits));
  const decimals = Math.max(0, digits - 1 - exponentOf(r));
  return nf(Math.min(20, decimals)).format(r);
}

const SCALES: [number, string][] = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
];

/** A large count in words: "12,345", "2.54 million", "3.1 trillion". */
function bigNumber(n: number, digits = 3): string {
  for (const [k, word] of SCALES) {
    // The scale is chosen from the value as written, so 999.95 million reads "1 billion", not
    // "1,000 million". Below a million the count is written in full, so only a count that
    // rounds to 1,000,000 moves up.
    const v = Number((n / k).toPrecision(digits));
    if (k === 1e6 ? Math.round(n) >= k : v >= 1) return `${sigText(v, digits)} ${word}`;
  }
  return nf(0).format(Math.round(n));
}

// ─── Dates ───────────────────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const pad2 = (n: number) => String(n).padStart(2, '0');
const hms = (c: CivilDateTime) => `${pad2(c.hour)}:${pad2(c.minute)}:${pad2(Math.floor(c.second))}`;

/**
 * How a simulation time is written:
 *  - datetime  "2026-09-25 14:03:27"; "12 Mar 2,000 BCE 14:03:27"; "year 12,345" (|year| ≥ 10,000)
 *  - date      "2026-09-25"; "12 Mar 2,000 BCE"; "year 2.54 million"; "13.8 billion BCE"
 *  - time      "14:03:27"
 *  - long      "25 September 2026, 14:03:27 UTC" at any year (for tooltips)
 *  - iso       ISO 8601, with expanded years outside 0000–9999: "+012345-03-03T14:03:27.000Z"
 *  - input     editable and parsed back by parseSimDate: "2026-09-25 14:03:27", "-1999-03-12 00:00:00"
 */
export type SimDateStyle = 'datetime' | 'date' | 'time' | 'long' | 'iso' | 'input';

/** Historical label of an astronomical year: "2026", "44 BCE", "12,345", "2.54 million BCE". */
export function yearLabel(year: number): string {
  if (year >= 1) return year < 10_000 ? String(year) : bigNumber(year);
  const bce = 1 - year;
  return `${bce < 10_000 ? nf(0).format(bce) : bigNumber(bce)} BCE`;
}

/** Years too far off for a month and day to mean much at a glance ("year 12,345"). */
export const isDistantYear = (year: number): boolean => year >= 10_000 || year <= -9_999;

export function formatSimDate(ms: number, style: SimDateStyle = 'datetime'): string {
  if (!Number.isFinite(ms)) return '—';
  const c = civilFromMs(ms);
  const y = c.year;
  switch (style) {
    case 'time':
      return hms(c);
    case 'iso': {
      const yy = y >= 0 && y <= 9999 ? String(y).padStart(4, '0') : `${y < 0 ? '-' : '+'}${String(Math.abs(y)).padStart(6, '0')}`;
      const s = Math.floor(c.second);
      const msPart = Math.min(999, Math.floor((c.second - s) * 1000));
      return `${yy}-${pad2(c.month)}-${pad2(c.day)}T${pad2(c.hour)}:${pad2(c.minute)}:${pad2(s)}.${String(msPart).padStart(3, '0')}Z`;
    }
    case 'input': {
      const yy = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
      return `${yy}-${pad2(c.month)}-${pad2(c.day)} ${hms(c)}`;
    }
    case 'long': {
      // The full year, however large: this is the style for tooltips.
      const yearText =
        y >= 1000 && y < 10_000 ? String(y) : y >= 1 ? `${nf(0).format(y)} CE` : `${nf(0).format(1 - y)} BCE`;
      return `${c.day} ${MONTHS[c.month - 1]} ${yearText}, ${hms(c)} UTC`;
    }
    default: {
      if (y >= 10_000) return `year ${bigNumber(y)}`;
      if (y <= -9_999) return yearLabel(y);
      if (y >= 1) {
        const date = `${String(y).padStart(4, '0')}-${pad2(c.month)}-${pad2(c.day)}`;
        return style === 'date' ? date : `${date} ${hms(c)}`;
      }
      const date = `${c.day} ${MONTHS_SHORT[c.month - 1]} ${yearLabel(y)}`;
      return style === 'date' ? date : `${date} ${hms(c)}`;
    }
  }
}

/**
 * Parse a date typed by a person: "YYYY-MM-DD[ hh:mm[:ss]]". A leading minus is an
 * astronomical year (−1999 is 2000 BCE); a trailing "BCE" or "BC" is a historical one
 * ("2000-03-12 BCE"). Years of up to 14 digits read back, as far as the clock reaches (the
 * 'input' style writes them in full); callers apply their own range. Rejects impossible
 * dates such as 2026-02-31. NaN when invalid.
 */
export function parseSimDate(text: string): number {
  const m = text
    .trim()
    .match(/^([+-]?)(\d{1,14})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?\s*(BCE|BC|CE|AD)?$/i);
  if (!m) return NaN;
  const [, sign, ys, mos, ds, hs = '0', mis = '0', ss = '0', era = ''] = m;
  let year = Number(ys);
  const bce = /^BC/i.test(era);
  if (bce) {
    if (sign === '-' || year < 1) return NaN;
    year = 1 - year;
  } else if (sign === '-') year = -year;
  const month = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mis);
  const second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return NaN;
  if (hour > 23 || minute > 59 || second >= 60) return NaN;
  return msFromCivil(year, month, day, hour, minute, second);
}

// ─── Durations ───────────────────────────────────────────────────────────────────────────

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86_400;
const YEAR_S = 365.25 * DAY_S;
const MONTH_S = YEAR_S / 12;

const plural = (v: string, one: string, many: string) => `${v} ${v === '1' ? one : many}`;

/**
 * An elapsed time in plain units, from nanoseconds to trillions of years: "33 ms", "8.4 s",
 * "8 min 19 s", "5 h 28 min", "1 day 4 h", "12.3 days", "3.4 months", "4.25 years",
 * "31,700 years", "13.8 billion years".
 */
export function formatDuration(seconds: number): string {
  if (Number.isNaN(seconds)) return '—';
  if (!Number.isFinite(seconds)) return '∞';
  const sign = seconds < 0 ? '−' : '';
  const s = Math.abs(seconds);
  if (s === 0) return '0 s';
  const small = (v: number, unit: string) => `${sign}${v < 10 ? nf(1).format(v) : nf(0).format(v)} ${unit}`;
  // A value as `small` writes it, so a unit is only used while its written value stays below
  // the next unit up ("1 s", never "1,000 ms"; "1 min 0 s", never "60 s").
  const written = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
  if (s < 1e-9) return `${sign}${sigText(s * 1e9, 3)} ns`;
  if (written(s * 1e9) < 1000) return small(s * 1e9, 'ns');
  if (written(s * 1e6) < 1000) return small(s * 1e6, 'µs');
  if (written(s * 1e3) < 1000) return small(s * 1e3, 'ms');
  if (written(s) < MINUTE_S) return small(s, 's');
  if (s < HOUR_S) {
    // From 59.5 s, which rounds to a whole minute.
    const t = Math.max(s, MINUTE_S);
    const m = Math.floor(t / 60);
    return `${sign}${m} min ${Math.floor(t - m * 60)} s`;
  }
  if (s < DAY_S) {
    const h = Math.floor(s / HOUR_S);
    return `${sign}${h} h ${Math.floor((s - h * HOUR_S) / 60)} min`;
  }
  if (s < 2 * DAY_S) {
    const d = Math.floor(s / DAY_S);
    return `${sign}${d} day ${Math.floor((s - d * DAY_S) / HOUR_S)} h`;
  }
  const tenths = (v: number) => Math.round(v * 10) / 10;
  if (tenths(s / DAY_S) < 60) return `${sign}${nf(1).format(s / DAY_S)} days`;
  if (tenths(s / MONTH_S) < 12) return `${sign}${nf(1).format(s / MONTH_S)} months`;
  return sign + yearsText(s / YEAR_S, 3);
}

function yearsText(years: number, digits: number): string {
  // Decided on the rounded value: 999,960 years to three figures is "1 million years".
  const r = Number(years.toPrecision(digits));
  if (r >= 1e6) return `${bigNumber(r, digits)} years`;
  return plural(sigText(years, digits), 'year', 'years');
}

/** formatDurationShort's units: size in seconds, the value at which the next unit takes over, names. */
const SHORT_UNITS: [number, number, string, string][] = [
  [1e-9, 1000, 'ns', 'ns'],
  [1e-6, 1000, 'µs', 'µs'],
  [1e-3, 1000, 'ms', 'ms'],
  [1, MINUTE_S, 's', 's'],
  [MINUTE_S, 60, 'min', 'min'],
  [HOUR_S, 24, 'h', 'h'],
  [DAY_S, 60, 'day', 'days'],
  [MONTH_S, 12, 'month', 'months'],
];

/**
 * A time span in a single unit to `digits` significant figures, for rates and captions:
 * "10 s", "1.7 min", "2.8 h", "12 days", "3.8 months", "3.2 years", "32,000 years",
 * "320 million years".
 */
export function formatDurationShort(seconds: number, digits = 2): string {
  if (Number.isNaN(seconds)) return '—';
  if (!Number.isFinite(seconds)) return '∞';
  const sign = seconds < 0 ? '−' : '';
  const s = Math.abs(seconds);
  if (s === 0) return '0 s';
  // Each unit is used while the value, rounded to `digits`, stays below the next unit up:
  // 59.97 s is "1 min", not "60 s".
  for (const [size, limit, one, many] of SHORT_UNITS) {
    const v = Number((s / size).toPrecision(digits));
    if (v < limit) return sign + plural(sigText(v, digits), one, many);
  }
  return sign + yearsText(s / YEAR_S, digits);
}

/** A clock rate in words: "real time", "10 s/s", "3.2 years/s", "320 million years/s". */
export function formatRate(simSecondsPerRealSecond: number): string {
  if (simSecondsPerRealSecond === 1) return 'real time';
  return `${formatDurationShort(simSecondsPerRealSecond, 2)}/s`;
}
