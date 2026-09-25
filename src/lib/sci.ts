/**
 * Number formatting for instrument readouts and data tables.
 *
 * Conventions follow the SI Brochure (BIPM, 9th ed., §5.4): significant figures are kept
 * (trailing zeros included), long digit strings are grouped in threes with a space, the minus
 * sign is U+2212, and large or small values use "× 10ⁿ". A value and its unit are separate
 * strings, so tables and readouts can set units in their own column.
 */
import { AU_KM, DAY_S, JULIAN_YEAR_S, LIGHT_YEAR_KM } from '../physics/constants';

export const MINUS = '\u2212';
/** Group separator. A no-break space: monospace fonts give it a full cell, which reads well. */
const GROUP = '\u00a0';

const SUP: Record<string, string> = {
  '-': '⁻',
  '+': '',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

export function superscript(n: number | string): string {
  return String(n)
    .split('')
    .map((ch) => SUP[ch] ?? ch)
    .join('');
}

function groupInt(s: string): string {
  if (s.length < 5) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += GROUP;
    out += s[i];
  }
  return out;
}

function groupFrac(s: string): string {
  if (s.length <= 4) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && i % 3 === 0) out += GROUP;
    out += s[i];
  }
  return out;
}

/** Group a plain decimal string ("-1234567.123456") SI-style. */
export function groupDigits(s: string, group = true): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int, frac] = body.split('.');
  const g = group ? groupInt(int) + (frac !== undefined ? '.' + groupFrac(frac) : '') : body;
  return (neg ? MINUS : '') + g;
}

/** Fixed number of decimals, SI grouping, true minus sign. */
export function fixed(x: number, decimals: number, group = true): string {
  if (!Number.isFinite(x)) return nonFinite(x);
  const s = x.toFixed(Math.max(0, Math.min(20, decimals)));
  // Avoid "−0.000"
  if (/^-0\.?0*$/.test(s)) return groupDigits(s.slice(1), group);
  return groupDigits(s, group);
}

function nonFinite(x: number): string {
  if (Number.isNaN(x)) return '—';
  return x > 0 ? '∞' : `${MINUS}∞`;
}

/** Decimal exponent of |x| (floor(log10 |x|)), robust to rounding at powers of ten. */
export function exponentOf(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return 0;
  let e = Math.floor(Math.log10(Math.abs(x)));
  // Math.log10 can land a hair below an exact power of ten.
  if (Math.abs(x) >= 10 ** (e + 1)) e += 1;
  return e;
}

/** Scientific notation: "2.998 × 10⁵". */
export function sci(x: number, digits = 4): string {
  if (!Number.isFinite(x)) return nonFinite(x);
  if (x === 0) return (0).toFixed(Math.max(0, digits - 1));
  let e = exponentOf(x);
  let m = x / 10 ** e;
  let ms = m.toFixed(Math.max(0, digits - 1));
  // Rounding can carry the mantissa to 10.0.
  if (Math.abs(Number(ms)) >= 10) {
    e += 1;
    m = x / 10 ** e;
    ms = m.toFixed(Math.max(0, digits - 1));
  }
  return `${groupDigits(ms)} × 10${superscript(e)}`;
}

export interface SigOptions {
  /** Use scientific notation when the exponent is below this (default −3). */
  sciBelow?: number;
  /** Use scientific notation when the exponent is at or above this (default 6). */
  sciAbove?: number;
  group?: boolean;
}

/** x rounded to a multiple of 10^p (p ≥ 0). */
const roundTo = (x: number, p: number): number => Math.round(x / 10 ** p) * 10 ** p;

/**
 * x to `digits` significant figures, trailing zeros kept. Switches to scientific notation
 * outside [10^sciBelow, 10^sciAbove).
 */
export function sig(x: number, digits = 4, opts: SigOptions = {}): string {
  if (!Number.isFinite(x)) return nonFinite(x);
  if (x === 0) return fixed(0, Math.max(0, digits - 1));
  const { sciBelow = -3, sciAbove = 6, group = true } = opts;
  let e = exponentOf(x);
  if (e < sciBelow || e >= sciAbove) return sci(x, digits);
  // Integers with more digits than requested are rounded to the last significant place.
  if (digits - 1 - e < 0) return groupDigits(roundTo(x, e - digits + 1).toFixed(0), group);
  let decimals = digits - 1 - e;
  let s = x.toFixed(decimals);
  // Rounding up can add a digit (9.9996 → 10.000): drop one decimal to keep the count.
  const e2 = exponentOf(Number(s));
  if (e2 > e && decimals > 0) {
    e = e2;
    decimals = Math.max(0, digits - 1 - e);
    s = x.toFixed(decimals);
  }
  return groupDigits(s, group);
}

/**
 * A speed ratio β = v/c shown with enough digits to be honest: 0.5000, 0.990 00, 0.999 990 0.
 * Keeps three significant digits of (1 − β) near c.
 */
export function fmtBeta(beta: number): string {
  if (!Number.isFinite(beta)) return nonFinite(beta);
  if (beta === 0) return '0';
  const b = Math.abs(beta);
  if (b < 1e-3) return sci(beta, 3);
  if (b < 0.9) return sig(beta, 4);
  if (b >= 1) return sig(beta, 4);
  // Three significant digits of (1 − β), rounded first so 1 − 0.99999 counts as 1e-5.
  const gap = Number((1 - b).toPrecision(9));
  return fixed(beta, Math.min(15, Math.max(4, 2 - exponentOf(gap))));
}

/** Lorentz factor: 1 + 4.94 × 10⁻⁹ near 1, otherwise 5 significant figures. */
export function fmtGamma(g: number): string {
  if (!Number.isFinite(g)) return nonFinite(g);
  const eps = g - 1;
  if (eps < 1e-5) return eps <= 0 ? '1' : `1 + ${sci(eps, 3)}`;
  if (g < 10) return sig(g, 6);
  return sig(g, 5, { sciAbove: 7 });
}

// ─── Units ───────────────────────────────────────────────────────────────────────────────

export type Dim = 'time' | 'length' | 'speed' | 'angle' | 'none';

export interface Unit {
  sym: string;
  /** SI-base (s, km, km/s, deg) per unit. */
  factor: number;
}

export const TIME_UNITS: Unit[] = [
  { sym: 's', factor: 1 },
  { sym: 'min', factor: 60 },
  { sym: 'h', factor: 3600 },
  { sym: 'd', factor: DAY_S },
  { sym: 'yr', factor: JULIAN_YEAR_S },
];
export const LENGTH_UNITS: Unit[] = [
  { sym: 'km', factor: 1 },
  { sym: 'au', factor: AU_KM },
  { sym: 'ly', factor: LIGHT_YEAR_KM },
];

const NONE: Unit = { sym: '', factor: 1 };

/** The natural unit for a magnitude: the largest unit in which it is at least ~1. */
export function pickUnit(dim: Dim, magnitude: number): Unit {
  const m = Math.abs(magnitude);
  if (dim === 'time') {
    if (!(m >= 120)) return TIME_UNITS[0];
    if (m < 2 * 3600) return TIME_UNITS[1];
    if (m < 2 * DAY_S) return TIME_UNITS[2];
    if (m < JULIAN_YEAR_S) return TIME_UNITS[3];
    return TIME_UNITS[4];
  }
  if (dim === 'length') {
    if (!(m >= 0.01 * AU_KM)) return LENGTH_UNITS[0];
    if (m < 0.05 * LIGHT_YEAR_KM) return LENGTH_UNITS[1];
    return LENGTH_UNITS[2];
  }
  if (dim === 'speed') return { sym: 'km/s', factor: 1 };
  if (dim === 'angle') return { sym: '°', factor: 1 };
  return NONE;
}

export function unitBySym(dim: Dim, sym: string): Unit {
  const list = dim === 'time' ? TIME_UNITS : dim === 'length' ? LENGTH_UNITS : [];
  return list.find((u) => u.sym === sym) ?? pickUnit(dim, 1);
}

/** A quantity in its natural unit: { v: "5.8706", u: "yr" }. */
export function qty(x: number, dim: Dim, digits = 5, opts?: SigOptions): { v: string; u: string } {
  const u = pickUnit(dim, x);
  return { v: sig(x / u.factor, digits, opts), u: u.sym };
}

/** Angle in degrees with a fixed number of decimals, e.g. "12.34°". */
export const fmtDeg = (deg: number, decimals = 2): string => `${fixed(deg, decimals)}°`;

/** Julian Date from a Unix epoch in ms (UTC-based; no ΔT). */
export const julianDate = (ms: number): number => ms / 86_400_000 + 2_440_587.5;

/**
 * A measured value with its standard uncertainty, rounded the conventional way: σ to two
 * significant figures and the value to the same decimal place. "299 792.46 ± 0.35",
 * "(1.0003 ± 0.0021) × 10⁵". When σ is negligible next to the value (ideal instruments),
 * the value is shown to `maxDigits` and σ in scientific notation.
 */
export function fmtPM(v: number, s: number, maxDigits = 8): string {
  if (!Number.isFinite(v)) return nonFinite(v);
  if (!Number.isFinite(s) || s <= 0) return sig(v, 6);
  // Ideal instruments: the scatter is floating-point rounding, not a measurement error.
  if (s <= 1e-11 * Math.abs(v)) return `${sig(v, 9)} (σ ≈ 0)`;
  const es = exponentOf(s) - 1; // last kept decimal exponent (two figures of σ)
  const ev = v === 0 ? es + 1 : exponentOf(v);
  if (ev - es + 1 > maxDigits) return `${sig(v, maxDigits)} ± ${sci(s, 2)}`;
  if (ev >= 6 || ev <= -4 || es >= 4) {
    const k = 10 ** ev;
    const dec = Math.max(0, ev - es);
    return `(${fixed(v / k, dec)} ± ${fixed(s / k, dec)}) × 10${superscript(ev)}`;
  }
  if (es > 0) {
    // σ ≥ 100: round both to σ's second significant figure (123 456 ± 2345 → 123 500 ± 2300).
    return `${fixed(roundTo(v, es), 0)} ± ${fixed(roundTo(s, es), 0)}`;
  }
  const dec = -es;
  return `${fixed(v, dec)} ± ${fixed(s, dec)}`;
}
