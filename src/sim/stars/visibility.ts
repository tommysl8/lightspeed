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
 * them all does. It does not hold as it is in the relativistic view (beaming brightens stars ahead) or
 * near a black hole (its gravity blueshifts the light): there the star field draws a far list worked out
 * for a fainter limit, by the most any star can brighten (flightDrawList, starBoostLn), or all of them.
 */
import type { Stars3D } from './catalogue';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';
import { sampleBlackbody, type BlackbodySample } from '../../physics/blackbody';

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

// ─── Brighter than at rest: the relativistic view and black holes ──────────────────────────────────

/** Magnitudes per unit of ln flux, 2.5 / ln 10. */
const MAG_PER_LN = 2.5 / Math.LN10;

/**
 * The coolest star the brightening bound below allows for, K: the catalogue's coolest is 2,570 K (a star of
 * unknown temperature is drawn at 5,772 K) and the nuclear cluster's cool giants are warmer. The bound grows
 * as the temperature falls, so a floor under every star keeps it a bound.
 */
export const STAR_BOOST_T_MIN_K = 2000;

const bbScratch: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };
const lnY = (lnT: number): number => sampleBlackbody(lnT, bbScratch).lnY;

/**
 * The most a star's visible flux can grow, ln, besides a lens's magnification: over the view's Doppler
 * factors e^x with |x| ≤ phi (the ship's rapidity and any frame boost; 0 at rest) and every temperature
 * T ≥ tMinK, of ln Y(T e^(x + lnG)) − ln Y(T) − 2x: the blackbody seen at the shifted temperature and the
 * boost's solid angle D⁻² (the lens's solid angle, its magnification, is left to the caller), with lnG the
 * largest gravitational blueshift of the light at the observer (0 far from black holes; the lens's
 * solid angle takes the place of g⁻²). Exact for the blackbody table the GPU reads (sampleBlackbody):
 *  - where x + lnG < 0 the shifted light is redder, and for any T the flux grows by at most lnG − x (the
 *    Rayleigh–Jeans limit, which a cooler star falls short of), largest at x = −phi;
 *  - where x + lnG ≥ 0 the coolest star gains the most (ln Y's slope in ln T falls with T), and in x the
 *    gain is concave (ln Y is concave in ln T), so its largest value is found by a ternary search.
 * Returns 0 or more (exactly 0 at rest far from a hole). Cost: about 160 table reads, a few microseconds.
 */
export function starBoostLn(phi: number, lnG: number, tMinK: number = STAR_BOOST_T_MIN_K): number {
  const p = Number.isFinite(phi) ? Math.abs(phi) : 0;
  const g = Number.isFinite(lnG) ? lnG : 0;
  if (p === 0 && g <= 0) return 0;
  let best = 0;
  // Redder than the source (x < −lnG): the Rayleigh–Jeans limit lnG − x, largest at x = −phi.
  if (-p < -g) best = Math.max(best, g + p);
  // Bluer: the coolest star, concave in x on [max(−phi, −lnG), phi].
  const lo = Math.max(-p, -g);
  const hi = p;
  if (lo <= hi) {
    const lnTMin = Math.log(tMinK);
    const y0 = lnY(lnTMin);
    const f = (x: number): number => lnY(lnTMin + x + g) - y0 - 2 * x;
    let a = lo;
    let b = hi;
    for (let i = 0; i < 80 && b - a > 1e-12 * (1 + Math.abs(a) + Math.abs(b)); i++) {
      const m1 = a + (b - a) / 3;
      const m2 = b - (b - a) / 3;
      if (f(m1) < f(m2)) a = m1;
      else b = m2;
    }
    // The ends too, and a hair for the search's last step.
    best = Math.max(best, f(lo), f(hi), f(a), f(b) + 1e-9);
  }
  return best;
}

/** starBoostLn in magnitudes (MAG_PER_LN of it). */
export const starBoostMag = (phi: number, lnG: number, tMinK: number = STAR_BOOST_T_MIN_K): number => MAG_PER_LN * starBoostLn(phi, lnG, tMinK);

/**
 * The list of stars the star field must draw when stars may be up to `maxBoostMag` magnitudes brighter than
 * at rest (the relativistic view, where beaming brightens stars ahead, and near a black hole, where gravity
 * blueshifts their light: starBoostMag, with the exposure's dimming taken off), or null when all must be.
 *
 * A limit raised by B magnitudes reaches k = 10^(B/5) times as far, and a star that shows from r with it,
 * r < p + v(T + p/c) + k·reach/(1 − β), has p + v(T + p/c) + reach/(1 − β) > r/k (k ≥ 1): it is in the far
 * list of any distance up to r/k (starDrawLists). So the list for the largest FAR_LIST_PC at or below r/k
 * holds every star that can show, and drawn in catalogue order it shows exactly what drawing all of them does.
 * From within FAR_LIST_PC[0]·k of the Sun (and near the Sun) no list applies. Arriving at Sgr A* (β 0.04,
 * with the hole's blueshift) this is the 4 kpc list of 1,218 stars instead of all 329,770: measured on the
 * target laptop by whole frames A/B (2,048 × 1,320), the frame 0.84–0.97 ms cheaper (best against best) and the
 * picture the same pixel for pixel. `years` is where the stars are (the lists hold for any date the shader moves
 * them to).
 */
export function flightDrawList(l: StarDrawLists | undefined, cameraPc: number, years: number, magLimit: number, maxBoostMag: number): Uint32Array | null {
  if (!l || !(cameraPc >= 0) || !(maxBoostMag >= 0) || !Number.isFinite(years)) return null;
  const raise = magLimit + maxBoostMag - l.magLimit;
  if (!(raise < 100)) return null;
  const r = cameraPc / Math.pow(10, Math.max(0, raise) / 5);
  if (!(r > l.radiusPc)) return null;
  let out: Uint32Array | null = null;
  for (let k = 0; k < l.farPc.length; k++) if (r >= l.farPc[k]) out = l.far[k];
  return out;
}
