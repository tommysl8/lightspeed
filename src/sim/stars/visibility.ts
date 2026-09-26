/**
 * Which stars can be seen at all from near the Sun, so the star field need not run its vertex
 * shader over all 329,770 stars there (render cost, not physics: the stars drawn are the same).
 *
 * The star shader (render/shaders/stars.vert.glsl) drops a star once its apparent magnitude from
 * the camera reaches STAR_MAG_LIMIT + STAR_FADE_MAG. The catalogue is sorted by apparent V from
 * the Sun at J2000, brightest first, so from near the Sun, and not long before or after 2000,
 * only a first stretch of it can pass that cut. For each star this bounds how bright it could be
 * from anywhere within `radiusPc` of the Sun at any date within `years` of J2000, with the same
 * motion the shader applies (its velocity over the years since J2000 plus its light-time, and
 * the light-time from the camera when stars are drawn where they are seen), and keeps the index
 * after the last star that could be seen: drawing that many stars shows exactly what drawing
 * them all does. It does not hold in the relativistic view (beaming brightens stars ahead), and
 * the star field draws them all there.
 */
import type { Stars3D } from './catalogue';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';

/** The eye's limit: stars fainter than this fade out (render/materials.ts uses it). */
export const STAR_MAG_LIMIT = 6.5;
/** Stars fade out over ± this many magnitudes about the limit (limitFade in shaders/psf.glsl). */
export const STAR_FADE_MAG = 0.5;
/** Headroom for the shader's float32 arithmetic, magnitudes. */
const FLOAT_MARGIN_MAG = 0.02;

/** The camera stays within this distance of the Sun for the shortened star field: 10,300 au. */
export const NEAR_SUN_PC = 0.05;
/** Spans of years from J2000 the counts are worked out for (the shortest one that holds is used). */
export const NEAR_SUN_YEARS = [1000, 3000] as const;

export interface NearSunCounts {
  /** Magnitude limit the counts were worked out for (STAR_MAG_LIMIT). */
  magLimit: number;
  /** Largest camera distance from the Sun, pc. */
  radiusPc: number;
  /** Largest |years since J2000| of each count. */
  years: number[];
  /** How many of the first stars can be seen from within radiusPc within ±years[k] of J2000. */
  counts: number[];
}

/**
 * The counts for a catalogue (runs in the star worker: a few tens of milliseconds for the whole
 * catalogue).
 */
export function nearSunCounts(
  stars: Stars3D,
  magLimit = STAR_MAG_LIMIT,
  radiusPc = NEAR_SUN_PC,
  years: readonly number[] = NEAR_SUN_YEARS,
): NearSunCounts {
  const cut = magLimit + STAR_FADE_MAG + FLOAT_MARGIN_MAG;
  const pos = stars.positions;
  const vel = stars.velocitiesInt16;
  const mag = stars.absMagInt16;
  const velUnit = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const magUnit = stars.absMagUnit;
  const counts = years.map(() => 0);
  for (let i = 0; i < stars.count; i++) {
    const x = pos[3 * i];
    const y = pos[3 * i + 1];
    const z = pos[3 * i + 2];
    const vx = vel[3 * i];
    const vy = vel[3 * i + 1];
    const vz = vel[3 * i + 2];
    const p = Math.sqrt(x * x + y * y + z * z);
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz) * velUnit;
    // M_V + 5 log10(d / 10 pc) < cut  ⇔  d < 10^((cut − M_V) / 5 + 1): the farthest the star can be and still show.
    const reach = Math.pow(10, (cut - mag[i] * magUnit) / 5 + 1);
    for (let k = 0; k < years.length; k++) {
      // Nearest the star can come to the camera: its J2000 place, less the camera's distance from
      // the Sun, less its motion over the years and its light-time from the Sun, less the
      // light-time correction from the camera (at most v/c of the distance).
      const shift = v * (years[k] + p / C_PC_PER_YR);
      const farthest = p + radiusPc + shift;
      const nearest = p - radiusPc - shift - (v * farthest) / C_PC_PER_YR;
      if (nearest < reach) counts[k] = i + 1;
    }
  }
  return { magLimit, radiusPc, years: [...years], counts };
}

/**
 * How many of the first stars the star field must draw for a camera `cameraPc` from the Sun,
 * `years` from J2000 (null: all of them).
 */
export function nearSunDrawCount(c: NearSunCounts | undefined, cameraPc: number, years: number, magLimit: number): number | null {
  if (!c || !(cameraPc <= c.radiusPc) || magLimit > c.magLimit) return null;
  const y = Math.abs(years);
  for (let k = 0; k < c.years.length; k++) if (y <= c.years[k]) return c.counts[k];
  return null;
}
