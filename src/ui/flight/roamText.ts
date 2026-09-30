/**
 * Roam's words: distances and speeds in plain units ("12,000 km", "3.2 au", "1.2 light-years a second"),
 * where the nearest thing is ("above the surface", "inside it, 26,000 light-years from its centre") and the
 * multiplier ("×1", "×0.25"). Pure, for ui/flight/RoamPanel.tsx and its tests.
 *
 * Why its own words, not the instruments' units: Roam is for looking around, and its readout should read
 * as a sentence does; the instrument panel keeps the exact figures.
 */
import { AU_KM, C_KM_S, LIGHT_YEAR_KM } from '../../physics/constants';
import type { RoamClass } from '../../controls/roamScale';

/** A number to `digits` significant figures, as words write it: "12,300", "3.2", "0.045". */
export function plainNumber(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '∞';
  const a = Math.abs(x);
  if (a >= 10 ** digits) {
    const step = 10 ** (Math.floor(Math.log10(a)) - digits + 1);
    return (Math.round(x / step) * step).toLocaleString('en-GB');
  }
  return String(Number(x.toPrecision(digits)));
}

/** A length in the unit that reads best: "4.5 mm", "850 m", "12,000 km", "3.2 million km", "5.2 au", "1.2 light-years", "2.5 million light-years". */
export function distanceWords(km: number, digits = 2): string {
  const a = Math.abs(km);
  if (!Number.isFinite(a)) return '∞';
  if (a < 1e-3) return `${plainNumber(km * 1e6, digits)} mm`;
  if (a < 1) return `${plainNumber(km * 1e3, digits)} m`;
  if (a < 1e6) return `${plainNumber(km, digits)} km`;
  if (a < 1e9) return `${plainNumber(km / 1e6, digits)} million km`;
  const ly = km / LIGHT_YEAR_KM;
  if (Math.abs(ly) < 0.05) return `${plainNumber(km / AU_KM, digits)} au`;
  const [v, scale] = Math.abs(ly) >= 1e12 ? [ly / 1e12, ' trillion'] : Math.abs(ly) >= 1e9 ? [ly / 1e9, ' billion'] : Math.abs(ly) >= 1e6 ? [ly / 1e6, ' million'] : [ly, ''];
  const n = plainNumber(v, digits);
  return `${n}${scale} light-${n === '1' && !scale ? 'year' : 'years'}`;
}

/** Roam's pace in words, and whether it is faster than light (then the readout says it is a camera, not a ship). */
export function roamSpeedWords(kmPerS: number): { text: string; fasterThanLight: boolean } {
  return { text: `${distanceWords(kmPerS)} a second`, fasterThanLight: kmPerS > C_KM_S };
}

/** What the readout adds when the pace passes light's. */
export const FASTER_THAN_LIGHT = 'faster than light: this is a camera, not a ship';

/**
 * Where the nearest thing is, from the camera: a black hole's height above its horizon; above a body's
 * surface when close to it (within three radii); inside a galaxy, a cluster or a nebula, from its centre;
 * otherwise how far away. `distKm`: to its centre (a black hole: the height); `radiusKm`: its radius.
 */
export function roamPlaceWords(cls: RoamClass, distKm: number, radiusKm: number): string {
  if (cls === 'hole') return `${distanceWords(distKm)} above the horizon`;
  if (cls === 'edge') return `${distanceWords(distKm)} on; Roam goes no farther`;
  if (cls === 'solid' && radiusKm > 0 && distKm < 3 * radiusKm) return `${distanceWords(Math.max(0, distKm - radiusKm))} above the surface`;
  if (cls === 'extended' && distKm < radiusKm) return `inside it, ${distanceWords(distKm)} from its centre`;
  return `${distanceWords(distKm)} away`;
}

/** How many times the scale Roam covers each second, in words, for the guide: "once", "one and a half times", "twice", "3 times". */
export function rateWords(rate: number): string {
  if (rate === 1) return 'once';
  if (rate === 1.5) return 'one and a half times';
  if (rate === 2) return 'twice';
  return `${plainNumber(rate)} times`;
}

/** The multiplier: "×1", "×0.25", "×40". */
export const roamMulText = (mul: number): string => `×${plainNumber(mul, mul >= 10 ? 3 : 2)}`;
