/**
 * Axis ticks for the plots: "nice" linear steps (1, 2, 5 × 10ⁿ) and decade ticks on log
 * axes, plus the common-exponent factor that keeps tick labels short ("× 10⁵").
 */
import { exponentOf } from '../../lib/sci';

/** A step of 1, 2 or 5 × 10ⁿ giving about `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1;
  const raw = span / count;
  const e = Math.floor(Math.log10(raw));
  const f = raw / 10 ** e;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * 10 ** e;
}

/** Tick values from lo to hi (inclusive, within rounding) at a nice step. */
export function linearTicks(lo: number, hi: number, count = 5): { ticks: number[]; step: number } {
  if (!(hi > lo)) return { ticks: [lo], step: 1 };
  const step = niceStep(hi - lo, count);
  const start = Math.ceil(lo / step - 1e-9);
  const end = Math.floor(hi / step + 1e-9);
  const ticks: number[] = [];
  for (let i = start; i <= end && ticks.length < 200; i++) {
    const v = i * step;
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return { ticks, step };
}

/** Minor ticks between the major ones: 5 per step for steps of 1 and 5, 4 for 2. */
export function linearMinor(lo: number, hi: number, step: number): number[] {
  const lead = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
  const div = Math.round(lead) === 2 ? 4 : 5;
  const m = step / div;
  const out: number[] = [];
  const start = Math.ceil(lo / m - 1e-9);
  const end = Math.floor(hi / m + 1e-9);
  for (let i = start; i <= end && out.length < 1000; i++) {
    if (i % div !== 0) out.push(i * m);
  }
  return out;
}

/** Expand [lo, hi] outward to whole nice steps. */
export function niceDomain(lo: number, hi: number, count = 5): [number, number] {
  if (lo === hi) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - d, hi + d];
  }
  const step = niceStep(hi - lo, count);
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}

/** Decades covering [lo, hi] (lo > 0) with 2…9 minor ticks. */
export function logTicks(lo: number, hi: number): { major: number[]; minor: number[] } {
  const e0 = Math.floor(Math.log10(lo) + 1e-9);
  const e1 = Math.ceil(Math.log10(hi) - 1e-9);
  const span = e1 - e0;
  const every = span > 12 ? Math.ceil(span / 8) : 1;
  const major: number[] = [];
  const minor: number[] = [];
  for (let e = e0; e <= e1; e++) {
    const d = 10 ** e;
    if (d >= lo * (1 - 1e-9) && d <= hi * (1 + 1e-9) && (e - e0) % every === 0) major.push(d);
    if (span <= 6) {
      for (let k = 2; k <= 9; k++) {
        const v = k * d;
        if (v > lo && v < hi) minor.push(v);
      }
    }
  }
  return { major, minor };
}

/** Log domain snapped to decades. */
export function logDomain(lo: number, hi: number): [number, number] {
  const a = 10 ** Math.floor(Math.log10(lo) + 1e-9);
  const b = 10 ** Math.ceil(Math.log10(hi) - 1e-9);
  return a === b ? [a / 10, b * 10] : [a, b];
}

/**
 * Common power of ten to factor out of tick labels, or 0 when the labels are short enough.
 * Ticks 0 … 3 × 10⁵ read better as 0 … 3 with "× 10⁵" on the axis.
 */
export function commonExponent(ticks: number[]): number {
  const max = Math.max(...ticks.map((t) => Math.abs(t)));
  if (!(max > 0)) return 0;
  const e = exponentOf(max);
  return e >= 4 || e <= -3 ? e : 0;
}

/** Decimals needed to print ticks at `step` after dividing by 10^exp. */
export function tickDecimals(step: number, exp = 0): number {
  const s = step / 10 ** exp;
  return Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
}
