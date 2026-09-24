import { AU_KM, JULIAN_YEAR_S, LIGHT_YEAR_KM, DAY_S } from '../physics/constants';

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Human-readable duration: "33 ms", "8.4 s", "8 min 19 s", "5 h 28 min", "12.3 days", "4.25 years". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.abs(seconds);
  const sign = seconds < 0 ? '−' : '';
  if (s === 0) return '0 s';
  if (s < 1e-6) return `${sign}${nf0.format(s * 1e9)} ns`;
  if (s < 1e-3) return `${sign}${nf0.format(s * 1e6)} µs`;
  if (s < 1) return `${sign}${nf0.format(s * 1e3)} ms`;
  if (s < 60) return `${sign}${s < 10 ? nf1.format(s) : nf0.format(s)} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s - m * 60);
    return `${sign}${m} min ${sec} s`;
  }
  if (s < DAY_S) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s - h * 3600) / 60);
    return `${sign}${h} h ${m} min`;
  }
  if (s < 2 * DAY_S) {
    const d = Math.floor(s / DAY_S);
    const h = Math.floor((s - d * DAY_S) / 3600);
    return `${sign}${d} day ${h} h`;
  }
  if (s < JULIAN_YEAR_S) return `${sign}${nf1.format(s / DAY_S)} days`;
  const y = s / JULIAN_YEAR_S;
  if (y < 1000) return `${sign}${nf2.format(y)} years`;
  return `${sign}${nf0.format(y)} years`;
}

/** Compact clock-style duration for HUD counters: "00:08:19", "3 d 04:12:07", "4.25 yr". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.max(0, seconds);
  if (s >= 1000 * JULIAN_YEAR_S) return `${nf0.format(s / JULIAN_YEAR_S)} yr`;
  if (s >= JULIAN_YEAR_S) return `${nf2.format(s / JULIAN_YEAR_S)} yr`;
  const d = Math.floor(s / DAY_S);
  const rem = s - d * DAY_S;
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem - h * 3600) / 60);
  const sec = Math.floor(rem - h * 3600 - m * 60);
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return d > 0 ? `${d} d ${hms}` : hms;
}

/** Human-readable distance: "850 m", "384,400 km", "149.6 million km", "30.07 AU", "4.25 ly". */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '∞';
  const d = Math.abs(km);
  if (d < 1) return `${nf0.format(d * 1000)} m`;
  if (d < 1e6) return `${nf0.format(d)} km`;
  if (d < 1e9) return `${nf1.format(d / 1e6)} million km`;
  if (d < 0.1 * LIGHT_YEAR_KM) {
    const au = d / AU_KM;
    return `${au < 100 ? nf2.format(au) : nf1.format(au)} AU`;
  }
  return `${nf2.format(d / LIGHT_YEAR_KM)} ly`;
}

/** Distance with a secondary unit, e.g. "30.07 AU (4.50 billion km)". */
export function formatDistanceLong(km: number): string {
  const d = Math.abs(km);
  const main = formatDistance(km);
  if (d >= 1e9 && d < 0.1 * LIGHT_YEAR_KM) return `${main} · ${nf2.format(d / 1e9)} billion km`;
  if (d >= 1e6 && d < 1e9) return `${main} · ${nf2.format(d / AU_KM)} AU`;
  return main;
}

/** Speed in km/s with sensible precision. */
export function formatSpeed(kmPerS: number): string {
  const v = Math.abs(kmPerS);
  if (v < 10) return `${nf2.format(v)} km/s`;
  if (v < 1000) return `${nf1.format(v)} km/s`;
  return `${nf0.format(v)} km/s`;
}

/** β as a readable fraction of c: "0.1c", "0.99999c", "5.7 × 10⁻⁵ c". */
export function formatBeta(beta: number): string {
  if (beta === 0) return '0c';
  if (beta < 1e-3) {
    const exp = Math.floor(Math.log10(beta));
    const mant = beta / 10 ** exp;
    return `${mant.toFixed(1)} × 10${toSuperscript(exp)} c`;
  }
  if (beta < 0.1) return `${beta.toFixed(4).replace(/0+$/, '')}c`;
  if (beta < 0.99) return `${trimZeros(beta.toFixed(3))}c`;
  // Show enough nines to be honest: 0.99999c, not 1.000c
  const nines = Math.min(12, Math.max(2, Math.floor(-Math.log10(1 - beta)) + 1));
  return `${trimZeros(beta.toFixed(nines))}c`;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

const SUP: Record<string, string> = {
  '-': '⁻',
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
export function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((ch) => SUP[ch] ?? ch)
    .join('');
}

/** Rotation period / day length in hours → readable, e.g. "23 h 56 min", "58.6 days". */
export function formatHours(hours: number): string {
  const h = Math.abs(hours);
  const retro = hours < 0 ? ' (retrograde)' : '';
  if (h < 48) {
    const whole = Math.floor(h);
    const m = Math.round((h - whole) * 60);
    return m === 60 ? `${whole + 1} h${retro}` : `${whole} h ${m} min${retro}`;
  }
  return `${nf1.format(h / 24)} days${retro}`;
}

/** Orbital period in days → "88.0 days" or "164.8 years". */
export function formatPeriodDays(days: number): string {
  if (days < 1000) return `${nf1.format(days)} days`;
  return `${nf1.format(days / 365.25)} years`;
}

/** Generic number with thousands separators. */
export const formatNumber = (x: number, digits = 0): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** UTC date and time strings for the clock display. */
export function formatUtc(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  const y = d.getUTCFullYear();
  return {
    date: `${y} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`,
  };
}
