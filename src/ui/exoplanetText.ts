/**
 * A planet of another star in words, for its card and the data sheet: its size, mass and
 * temperature (with "≈" for estimates and "≥" for minimum masses), its orbit, how it was found,
 * and whether it is confirmed.
 */
import { sig } from '../lib/sci';
import type { ExoplanetInfo } from '../sim/bodies';

/** Jupiter's radius and mass in Earth units (the archive's: IAU 2015 B3 nominal values). */
const R_JUP_EARTH = 71_492 / 6_378.1;
const M_JUP_EARTH = 1.266_865_3e17 / 3.986_004e14;

/** "1.12 R⊕" for small planets, "1.26 Jupiter radii" for giants. */
export function radiusText(rEarth: number): string {
  return rEarth >= 6 ? `${sig(rEarth / R_JUP_EARTH, 3)} Jupiter radii` : `${sig(rEarth, 3)} R⊕`;
}

/** "1.37 M⊕", or "0.610 Jupiter masses" from 50 Earth masses. */
export function massText(mEarth: number): string {
  return mEarth >= 50 ? `${sig(mEarth / M_JUP_EARTH, 3)} Jupiter masses` : `${sig(mEarth, 3)} M⊕`;
}

/** "1.51 days", "7.33 years". */
export function periodText(days: number): string {
  if (days < 1) return `${sig(days * 24, 3)} hours`;
  if (days < 1000) return `${sig(days, 3)} days`;
  return `${sig(days / 365.25, 3)} years`;
}

/**
 * "1.12 R⊕ · ≥ 1.06 M⊕ · 218 K": the size, the mass and the equilibrium temperature ("1,200 K
 * glow" for a young giant hot from its formation).
 */
export function exoplanetPhysicalLine(x: ExoplanetInfo): string {
  const parts: string[] = [];
  if (x.radiusSource !== 'placeholder') parts.push(`${x.radiusSource === 'estimated' ? '≈ ' : ''}${radiusText(x.radiusEarth)}`);
  if (x.massEarth !== undefined) parts.push(`${x.massKind === 'minimum' ? '≥ ' : x.massKind === 'estimated' ? '≈ ' : ''}${massText(x.massEarth)}`);
  if (x.teqK !== undefined) parts.push(`${x.teqSource === 'computed' ? '≈ ' : ''}${sig(x.teqK, 3, { group: false })} K${x.teqSource === 'own-heat' ? ' glow' : ''}`);
  return parts.join(' · ');
}

/** The temperature's row name and what it means, for the data sheet. */
export function temperatureWords(x: ExoplanetInfo): { label: string; title: string } {
  if (x.teqSource === 'own-heat')
    return {
      label: 'Temperature (its own glow)',
      title: 'Measured from its spectrum: a young giant still hot from its formation, far warmer than its star’s light alone would make it',
    };
  if (x.teqSource === 'computed')
    return { label: 'Equilibrium temperature (computed)', title: 'From its star’s temperature and radius and its distance: no albedo, heat spread all round' };
  return { label: 'Equilibrium temperature', title: 'As published: the warmth its star’s light alone would give it' };
}

/** "A year of 1.51 days, 0.0115 au from its star". */
export function exoplanetOrbitLine(x: ExoplanetInfo): string {
  const e = x.ecc > 0.01 ? `, eccentricity ${sig(x.ecc, 2)}` : '';
  return `A year of ${periodText(x.periodD)}, ${sig(x.smaAu, 3)} au from ${x.circumbinary ? 'its stars' : 'its star'}${e}`;
}

/**
 * "Found in 2016 by the transit method, La Silla Observatory", with the discovery paper in brackets unless
 * `withReference` is false (the card keeps the paper among its sources).
 */
export function exoplanetDiscoveryLine(x: ExoplanetInfo, withReference = true): string | null {
  if (!x.method && !x.year) return null;
  const method = x.method ? ` by ${methodWords(x.method)}` : '';
  const facility = x.facility ? `, ${x.facility}` : '';
  const ref = withReference && x.reference ? ` (${x.reference})` : '';
  return `Found${x.year ? ` in ${x.year}` : ''}${method}${facility}${ref}.`;
}

/** "Transit" → "the transit method", "Radial Velocity" → "radial velocities". */
export function methodWords(method: string): string {
  const m = method.toLowerCase();
  if (m === 'transit') return 'the transit method';
  if (m === 'radial velocity') return 'radial velocities';
  if (m === 'imaging') return 'direct imaging';
  if (m === 'microlensing') return 'gravitational microlensing';
  if (m === 'astrometry') return 'astrometry';
  return m;
}

/** "Candidate planet", "Disputed", or null for a confirmed planet. */
export function exoplanetStatusText(x: ExoplanetInfo): string | null {
  if (x.status === 'confirmed') return null;
  return x.status === 'candidate' ? 'Candidate: not confirmed' : x.status === 'disputed' ? 'Disputed: may not exist' : 'Refuted';
}
