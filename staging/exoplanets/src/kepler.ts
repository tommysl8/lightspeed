/**
 * Kepler's equation and the two-body relations used by the orbit evaluator.
 * Pure functions, no allocation beyond small result objects.
 */
import { GM_SUN_AU3_D2, TAU } from './constants.ts';

/** Wrap an angle to [0, 2pi). */
export function wrapTwoPi(x: number): number {
  const r = x % TAU;
  return r < 0 ? r + TAU : r;
}

/** Wrap degrees to [0, 360). */
export function wrap360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * Solve Kepler's equation M = E - e sin E for the eccentric anomaly E, 0 <= e < 1.
 * Newton-Raphson from a starting guess that converges for every e < 1 (E0 = M + 0.85 e sign(sin M),
 * Danby 1988), with a bisection safeguard. Accurate to ~1e-15 rad.
 */
export function solveKepler(meanAnomaly: number, e: number): number {
  if (!(e >= 0 && e < 1)) throw new RangeError(`eccentricity must be in [0, 1), got ${e}`);
  const M = wrapTwoPi(meanAnomaly);
  if (e === 0) return M;
  // Work in (-pi, pi] for symmetry, then map back.
  const m = M > Math.PI ? M - TAU : M;
  let E = m + 0.85 * e * Math.sign(Math.sin(m) || 1);
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let k = 0; k < 60; k++) {
    const f = E - e * Math.sin(E) - m;
    if (f > 0) hi = Math.min(hi, E);
    else lo = Math.max(lo, E);
    const fp = 1 - e * Math.cos(E);
    let next = E - f / fp;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi); // bisection safeguard
    if (Math.abs(next - E) < 1e-15) {
      E = next;
      break;
    }
    E = next;
  }
  return E < 0 ? E + TAU : E;
}

/** True anomaly from the eccentric anomaly. */
export function trueFromEccentric(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/** Eccentric anomaly from the true anomaly. */
export function eccentricFromTrue(f: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
}

/** Mean anomaly from the true anomaly. */
export function meanFromTrue(f: number, e: number): number {
  const E = eccentricFromTrue(f, e);
  return wrapTwoPi(E - e * Math.sin(E));
}

/**
 * Semi-major axis (au) of the relative orbit from the period (days) and the total mass (solar
 * masses) by Kepler's third law: a^3 = G(M1 + M2) P^2 / 4pi^2.
 */
export function semiMajorAxisAu(periodDays: number, totalMassMsun: number): number {
  const n = TAU / periodDays;
  return Math.cbrt((GM_SUN_AU3_D2 * totalMassMsun) / (n * n));
}

/** Period (days) of a relative orbit with semi-major axis aAu around a total mass (solar masses). */
export function periodDays(aAu: number, totalMassMsun: number): number {
  return TAU * Math.sqrt((aAu * aAu * aAu) / (GM_SUN_AU3_D2 * totalMassMsun));
}
