/**
 * Numbers of the data sheet (instruments, "Target") printed to the precision they have: a value
 * read from a data file keeps the digits stored and no more; a value with a stated uncertainty
 * is rounded to it; an estimate gets three figures and "≈". Six padded figures would claim a
 * precision nobody measured (a comet nucleus "1.500 00 km" across).
 */
import type { BodyRecord } from '../sim/bodies';
import { fixed, groupDigits, sig, storedDigits } from '../lib/sci';

export interface Reading {
  /** Row label. */
  l: string;
  v: string;
  u: string;
  /** Why the value is shown as it is, for the row's tooltip. */
  title?: string;
}

/** x and its 1σ, both rounded to σ's first significant figure: "500 ± 40", "2574.76 ± 0.02". */
export function withSigma(x: number, sigma: number): string {
  const p = Math.floor(Math.log10(sigma));
  if (p >= 0) {
    const k = 10 ** p;
    return `${groupDigits(String(Math.round(x / k) * k))} ± ${Math.round(sigma / k) * k}`;
  }
  return `${fixed(x, -p)} ± ${fixed(sigma, -p)}`;
}

/** A value as stored in a data file: up to `digits` significant figures, and no more than it has. */
export const stored = (x: number, digits = 6): string => sig(x, Math.min(digits, storedDigits(x)));

/**
 * The radius row: rough sizes, estimates and measurements each printed as what they are.
 * `label` names the row when the body gives it another name ("Mean radius").
 */
export function radiusReading(r: BodyRecord, label = 'Radius'): Reading {
  const d = r.physical;
  const km = d.radiusKm;
  if (r.kind === 'spacecraft' && km < 0.01) return { l: 'Size (half its length)', v: sig(km * 1000, 3), u: 'm' };
  if (d.radiusRough) {
    return { l: `${label} (rough)`, v: `≈ ${stored(km, 2)}`, u: 'km', title: 'Only its order of magnitude is known: see the card' };
  }
  const star = r.star;
  if (star) {
    const est = star.radiusSource !== 'literature';
    return est
      ? { l: `${label} (estimated)`, v: `≈ ${sig(km, 3)}`, u: 'km', title: 'From its luminosity and temperature (Stefan–Boltzmann)' }
      : { l: label, v: sig(km, 3), u: 'km', title: 'Measured (see the references)' };
  }
  const x = r.exoplanet;
  if (x) {
    if (x.radiusSource === 'measured') return { l: label, v: sig(km, 3), u: 'km', title: 'Measured from its transits' };
    const why = x.radiusSource === 'placeholder' ? 'placeholder' : 'estimated';
    return { l: `${label} (${why})`, v: `≈ ${sig(km, 3)}`, u: 'km', title: x.radiusSource === 'placeholder' ? 'Neither its size nor its mass is measured' : 'Estimated from its mass (Chen & Kipping 2017)' };
  }
  if (d.radiusSigmaKm && d.radiusSigmaKm > 0) return { l: label, v: withSigma(km, d.radiusSigmaKm), u: 'km', title: 'With its 1σ uncertainty' };
  return { l: label, v: stored(km), u: 'km' };
}
