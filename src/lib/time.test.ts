import { describe, expect, it } from 'vitest';
import { MakeTime } from 'astronomy-engine';
import { julianDate } from './sci';
import {
  DAY_MS,
  J2000_MS,
  astroTimeAt,
  civilFromDays,
  civilFromMs,
  daysFromCivil,
  deltaTSeconds,
  formatDuration,
  formatDurationShort,
  formatRate,
  formatSimDate,
  msFromAstroTime,
  msFromCivil,
  parseSimDate,
  yearLabel,
} from './time';

/** Independent oracle for years JavaScript's Date can hold (setUTCFullYear avoids the 0–99 → 1900s quirk). */
function dateOracleMs(y: number, m: number, d: number): number {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime();
}

const YEAR_S = 365.25 * 86_400;

describe('proleptic Gregorian calendar (Hinnant)', () => {
  it('pins known epochs', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(msFromCivil(2000, 1, 1, 12)).toBe(J2000_MS);
    // J2000.0 is JD 2451545.0
    expect(julianDate(msFromCivil(2000, 1, 1, 12))).toBe(2_451_545);
    // The first Gregorian day, 1582-10-15, began at JD 2299160.5
    expect(julianDate(msFromCivil(1582, 10, 15))).toBe(2_299_160.5);
    // JD 0 is noon on 1 January 4713 BC in the Julian calendar = −4713-11-24 proleptic Gregorian,
    // so noon on −4712-01-01 (Gregorian) is 38 days later.
    expect(julianDate(msFromCivil(-4713, 11, 24, 12))).toBe(0);
    expect(julianDate(msFromCivil(-4712, 1, 1, 12))).toBe(38);
  });

  it('agrees with JavaScript dates across their whole range', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
    for (let i = 0; i < 2000; i++) {
      const y = Math.floor(-270_000 + rand() * 540_000);
      const m = 1 + Math.floor(rand() * 12);
      const d = 1 + Math.floor(rand() * 28);
      const ms = msFromCivil(y, m, d);
      expect(ms).toBe(dateOracleMs(y, m, d));
      expect(civilFromDays(ms / DAY_MS)).toEqual({ year: y, month: m, day: d });
    }
  });

  it('round-trips every day across leap-year boundaries', () => {
    for (let z = daysFromCivil(1599, 1, 1); z < daysFromCivil(1601, 12, 31); z++) {
      const c = civilFromDays(z);
      expect(daysFromCivil(c.year, c.month, c.day)).toBe(z);
    }
    for (let z = -800; z < 800; z++) {
      const c = civilFromDays(z + daysFromCivil(0, 1, 1));
      expect(daysFromCivil(c.year, c.month, c.day)).toBe(z + daysFromCivil(0, 1, 1));
    }
  });

  it('stays exact for huge and negative years', () => {
    for (const y of [1e9, 1e12, 9.999e12, -13.8e9, -1e12, -4712, 0, -1]) {
      for (const [m, d] of [
        [1, 1],
        [2, 29],
        [12, 31],
      ] as const) {
        if (m === 2 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) continue;
        const z = daysFromCivil(y, m, d);
        expect(Number.isInteger(z)).toBe(true);
        expect(civilFromDays(z)).toEqual({ year: y, month: m, day: d });
        // 400 Gregorian years are always 146,097 days.
        expect(daysFromCivil(y + 400, m, d) - z).toBe(146_097);
      }
    }
    // One trillion years is 365.2425 × 10¹² days, give or take the calendar's phase.
    const span = daysFromCivil(1e12, 1, 1) - daysFromCivil(0, 1, 1);
    expect(span).toBe(365.2425e12);
  });

  it('splits the time of day, also for negative times', () => {
    const c = civilFromMs(msFromCivil(-500, 6, 15, 23, 59, 58.5));
    expect(c).toEqual({ year: -500, month: 6, day: 15, hour: 23, minute: 59, second: 58.5 });
    // At year 10⁹ a float64 millisecond count resolves 4.096 s, so 06:00 comes back within that.
    const late = civilFromMs(msFromCivil(1e9, 7, 4, 6, 0, 0));
    expect([late.year, late.month, late.day]).toEqual([1e9, 7, 4]);
    expect(Math.abs(late.hour * 3600 + late.minute * 60 + late.second - 6 * 3600)).toBeLessThanOrEqual(4.096);
  });
});

describe('astronomy-engine time', () => {
  it('builds AstroTime from a day count, beyond what Date can hold', () => {
    const now = msFromCivil(2026, 9, 25, 14, 3, 27);
    expect(astroTimeAt(now).ut).toBeCloseTo(MakeTime(new Date(now)).ut, 12);
    expect(msFromAstroTime(astroTimeAt(now))).toBeCloseTo(now, 3);
    const far = msFromCivil(1e12, 1, 1);
    const t = astroTimeAt(far);
    expect(Number.isFinite(t.tt)).toBe(true);
    expect(t.tt).toBeGreaterThan(t.ut); // ΔT stays small and positive, not 10¹⁴ years
    expect(t.tt - t.ut).toBeLessThan(3);
  });

  it('keeps astronomy-engine’s ΔT inside ±10,000 years and holds it beyond', () => {
    expect(deltaTSeconds(0)).toBeGreaterThan(63);
    expect(deltaTSeconds(0)).toBeLessThan(65);
    const edge = (msFromCivil(10_000, 1, 1) - J2000_MS) / DAY_MS;
    expect(deltaTSeconds(edge * 10)).toBe(deltaTSeconds(edge));
    expect(deltaTSeconds(-1e13)).toBeLessThan(5.3 * 86_400);
  });
});

describe('dates in words', () => {
  it('writes ordinary dates as ISO-style text', () => {
    expect(formatSimDate(Date.UTC(2026, 8, 25, 14, 3, 27))).toBe('2026-09-25 14:03:27');
    expect(formatSimDate(Date.UTC(2026, 8, 25, 14, 3, 27), 'date')).toBe('2026-09-25');
    expect(formatSimDate(Date.UTC(2026, 8, 25, 14, 3, 27), 'time')).toBe('14:03:27');
    expect(formatSimDate(Date.UTC(2026, 8, 25, 14, 3, 27), 'long')).toBe('25 September 2026, 14:03:27 UTC');
  });

  it('writes BCE years historically (year 0 is 1 BCE)', () => {
    expect(yearLabel(0)).toBe('1 BCE');
    expect(yearLabel(-1999)).toBe('2,000 BCE');
    expect(formatSimDate(msFromCivil(-1999, 3, 12), 'date')).toBe('12 Mar 2,000 BCE');
    expect(formatSimDate(msFromCivil(-43, 3, 15, 11), 'datetime')).toBe('15 Mar 44 BCE 11:00:00');
    expect(formatSimDate(msFromCivil(-1999, 3, 12), 'long')).toBe('12 March 2,000 BCE, 00:00:00 UTC');
  });

  it('switches to "year …" for distant years', () => {
    expect(formatSimDate(msFromCivil(12_345, 3, 3))).toBe('year 12,345');
    expect(formatSimDate(msFromCivil(12_345, 3, 3), 'long')).toBe('3 March 12,345 CE, 00:00:00 UTC');
    expect(formatSimDate(msFromCivil(2_540_000, 1, 1))).toBe('year 2.54 million');
    expect(formatSimDate(msFromCivil(1.21e9, 1, 1))).toBe('year 1.21 billion');
    expect(formatSimDate(msFromCivil(3.1e12, 1, 1))).toBe('year 3.1 trillion');
    expect(formatSimDate(msFromCivil(-13.8e9 + 1, 1, 1))).toBe('13.8 billion BCE');
    expect(formatSimDate(msFromCivil(-12_344, 1, 1))).toBe('12,345 BCE');
  });

  it('writes ISO 8601 with expanded years like Date does', () => {
    for (const ms of [Date.UTC(2026, 8, 24, 0, 0, 1, 250), msFromCivil(-1999, 3, 12, 6), msFromCivil(12_345, 3, 3), msFromCivil(0, 1, 1)]) {
      expect(formatSimDate(ms, 'iso')).toBe(new Date(ms).toISOString());
    }
    expect(formatSimDate(msFromCivil(1e9, 1, 1), 'iso')).toBe('+1000000000-01-01T00:00:00.000Z');
  });

  it('parses what it writes, and BCE dates', () => {
    for (const ms of [msFromCivil(2026, 9, 25, 14, 3, 27), msFromCivil(-1999, 3, 12, 0, 0, 0), msFromCivil(9999, 12, 31, 23, 59, 59)]) {
      expect(parseSimDate(formatSimDate(ms, 'input'))).toBe(ms);
    }
    expect(parseSimDate('2000-03-12 BCE')).toBe(msFromCivil(-1999, 3, 12));
    expect(parseSimDate('44-03-15 12:00 BC')).toBe(msFromCivil(-43, 3, 15, 12));
    expect(parseSimDate('2024-02-29')).toBe(msFromCivil(2024, 2, 29));
    expect(parseSimDate('2026-02-29')).toBeNaN();
    expect(parseSimDate('2026-13-01')).toBeNaN();
    expect(parseSimDate('-5-01-01 BCE')).toBeNaN();
    expect(parseSimDate('yesterday')).toBeNaN();
  });
});

describe('durations in words', () => {
  it('keeps the familiar forms', () => {
    expect(formatDuration(499.005)).toBe('8 min 19 s');
    expect(formatDuration(19_702)).toBe('5 h 28 min');
    expect(formatDuration(0.0331)).toBe('33 ms');
    expect(formatDuration(4.2465 * YEAR_S)).toBe('4.25 years');
    expect(formatDuration(1.5 * 86_400)).toBe('1 day 12 h');
    expect(formatDuration(12.34 * 86_400)).toBe('12.3 days');
  });

  it('runs from nanoseconds to trillions of years', () => {
    expect(formatDuration(3.3e-9)).toBe('3.3 ns');
    expect(formatDuration(4.2e-10)).toBe('0.42 ns');
    expect(formatDuration(2.5e-5)).toBe('25 µs');
    expect(formatDuration(103 * 86_400)).toBe('3.4 months');
    expect(formatDuration(YEAR_S)).toBe('1 year');
    expect(formatDuration(31_688.7 * YEAR_S)).toBe('31,700 years');
    expect(formatDuration(13.8e9 * YEAR_S)).toBe('13.8 billion years');
    expect(formatDuration(1e12 * YEAR_S)).toBe('1 trillion years');
    expect(formatDuration(-90)).toBe('−1 min 30 s');
    expect(formatDuration(Infinity)).toBe('∞');
  });

  it('writes rates in a single unit', () => {
    expect(formatRate(1)).toBe('real time');
    expect(formatRate(10)).toBe('10 s/s');
    expect(formatRate(100)).toBe('1.7 min/s');
    expect(formatRate(1e4)).toBe('2.8 h/s');
    expect(formatRate(1e5)).toBe('1.2 days/s');
    expect(formatRate(1e7)).toBe('3.8 months/s');
    expect(formatRate(1e8)).toBe('3.2 years/s');
    expect(formatRate(1e12)).toBe('32,000 years/s');
    expect(formatRate(1e14)).toBe('3.2 million years/s');
    expect(formatRate(1e16)).toBe('320 million years/s');
    expect(formatDurationShort(86_400)).toBe('1 day');
  });
});
