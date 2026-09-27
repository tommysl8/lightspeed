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
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';

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

/**
 * Where no first stretch of the catalogue will do (away from the Sun, and near it once the stars
 * stand still, a million years or more from 2000), lists of the only stars that can be seen, in
 * catalogue order: the star field draws them in the order it always does, so the picture is the
 * same as drawing them all (render cost, not physics).
 *
 * Away from the Sun: a star p parsecs from the Sun at J2000, moving at v, is never more than
 * v (10⁶ yr + p / c) from there (the shader holds the motion to a million years either side of
 * 2000: motion.ts), and is seen where it was when its light left it, at most v/c of the distance
 * nearer; it shows only within its reach d of the camera (where its apparent magnitude is the end
 * of the fade). So from r parsecs from the Sun it can be seen only if
 * r < p + v (10⁶ yr + p / c) + d / (1 − v / c). The list for FAR_LIST_PC[k] holds the stars for
 * which that sum is above it: from there or farther out, no other star can show.
 *
 * Near the Sun while the stars stand still: each star is where the shader puts it a million years
 * before or after 2000, and the list holds those that come within reach of anywhere within
 * NEAR_SUN_PC of the Sun (as nearSunCounts, for that one date).
 */
export const FAR_LIST_PC = [500, 1000, 2000, 4000, 8000] as const;

export interface StarDrawLists {
  /** Magnitude limit the lists were worked out for (STAR_MAG_LIMIT). */
  magLimit: number;
  /** Distances from the Sun of the far lists, pc (FAR_LIST_PC). */
  farPc: number[];
  /** Catalogue indices, ascending, of the stars that can be seen from farPc[k] or farther from the Sun, at any date. */
  far: Uint32Array[];
  /** Largest camera distance from the Sun for the lists of the stars standing still, pc. */
  radiusPc: number;
  /** Catalogue indices, ascending, of the stars that can be seen from within radiusPc of the Sun while they stand still: before 2000 (0), after (1). */
  frozen: [Uint32Array, Uint32Array];
}

/** The lists for a catalogue (runs in the star worker with nearSunCounts: a few tens of milliseconds). */
export function starDrawLists(
  stars: Stars3D,
  magLimit = STAR_MAG_LIMIT,
  radiusPc = NEAR_SUN_PC,
  farPc: readonly number[] = FAR_LIST_PC,
): StarDrawLists {
  const cut = magLimit + STAR_FADE_MAG + FLOAT_MARGIN_MAG;
  const pos = stars.positions;
  const vel = stars.velocitiesInt16;
  const mag = stars.absMagInt16;
  const velUnit = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const magUnit = stars.absMagUnit;
  const far: number[][] = farPc.map(() => []);
  const before: number[] = [];
  const after: number[] = [];
  for (let i = 0; i < stars.count; i++) {
    const x = pos[3 * i];
    const y = pos[3 * i + 1];
    const z = pos[3 * i + 2];
    const vx = vel[3 * i] * velUnit;
    const vy = vel[3 * i + 1] * velUnit;
    const vz = vel[3 * i + 2] * velUnit;
    const p = Math.sqrt(x * x + y * y + z * z);
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const reach = Math.pow(10, (cut - mag[i] * magUnit) / 5 + 1);
    const beta = Math.min(v / C_PC_PER_YR, 0.5);
    const seenFrom = p + v * (MOTION_VALID_YEARS + p / C_PC_PER_YR) + reach / (1 - beta);
    for (let k = 0; k < farPc.length; k++) if (seenFrom > farPc[k]) far[k].push(i);
    for (const [years, list] of [[-MOTION_VALID_YEARS, before], [MOTION_VALID_YEARS, after]] as const) {
      const t = years + p / C_PC_PER_YR;
      const q = Math.sqrt((x + vx * t) ** 2 + (y + vy * t) ** 2 + (z + vz * t) ** 2);
      const farthest = q + radiusPc;
      const nearest = q - radiusPc - (v * farthest) / C_PC_PER_YR;
      if (nearest < reach) list.push(i);
    }
  }
  return { magLimit, farPc: [...farPc], far: far.map((l) => Uint32Array.from(l)), radiusPc, frozen: [Uint32Array.from(before), Uint32Array.from(after)] };
}

/**
 * The list of stars the star field must draw for a camera `cameraPc` from the Sun, `years` from
 * J2000 as the shader takes them (held to ±MOTION_VALID_YEARS), or null when no list applies (then
 * nearSunDrawCount, or all of them).
 */
export function starDrawList(l: StarDrawLists | undefined, cameraPc: number, years: number, magLimit: number): Uint32Array | null {
  if (!l || !(cameraPc >= 0) || magLimit > l.magLimit) return null;
  if (cameraPc <= l.radiusPc) return Math.abs(years) >= MOTION_VALID_YEARS ? l.frozen[years < 0 ? 0 : 1] : null;
  let out: Uint32Array | null = null;
  for (let k = 0; k < l.farPc.length; k++) if (cameraPc >= l.farPc[k]) out = l.far[k];
  return out;
}
