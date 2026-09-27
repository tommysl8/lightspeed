/**
 * What the camera sees of a galaxy beyond its own bound structure, in words for its card: how long
 * ago the light arriving now left it, how old the universe was then, and how much the expansion of
 * space (and the ship's own motion) has shifted that light. From the exact functions of the
 * cosmology module (expansion.ts: cosmicSight), for the camera's place and the clock's time.
 */
import { sig } from '../../lib/sci';
import { planck18Built } from '../../physics/cosmology/cosmology';
import { cosmicSight, cosmicSky } from './expansion';

/** A span of cosmic time in words: "54 million years", "13.4 billion years", "900 years". */
export function gyrWords(gyr: number): string {
  if (gyr >= 1) return `${sig(gyr, 3)} billion years`;
  if (gyr >= 1e-3) return `${sig(gyr * 1e3, 3)} million years`;
  if (gyr >= 1e-6) return `${sig(gyr * 1e6, 3)} thousand years`;
  return `${Math.max(1, Math.round(gyr * 1e9)).toLocaleString('en-GB')} years`;
}

/** How much a redshift stretches light, in words: "by 0.37%", "3.2 times", "15.44 times". */
function stretchWords(z: number): string {
  if (z < 0.1) return `by ${sig(z * 100, 2)}%`;
  return `${sig(1 + z, z >= 10 ? 4 : 3)} times`;
}

/** A redshift to the figures it is known to: "0.0037", "0.352", "10.60", "14.44". */
const zWords = (z: number): string => sig(z, z < 0.01 ? 2 : z >= 10 ? 4 : 3);

/**
 * How long ago the light of a galaxy beyond the camera's bound structure left it, in words ("53.6
 * million years"), or 'none' when none of it has arrived: for such a galaxy distance / c is no
 * light-travel time (its light arriving now left it when it was nearer, and light sent now takes
 * longer still, or never arrives). Null for anything else, whose light-time is distance / c.
 * Undefined while the cosmology is not built yet and `build` is false (lists and labels do not build
 * it on the main thread).
 */
export function lightLeftAgo(id: string, build = true): string | 'none' | null | undefined {
  const m = cosmicSky.byId.get(id);
  if (!m || !(m.chiMpc > 1e-9)) return null;
  if (!build && !planck18Built()) return undefined;
  const s = cosmicSight(id);
  if (!s) return null;
  return s.beyond ? 'none' : gyrWords(s.lookbackGyr);
}

/**
 * The card's line for a galaxy seen now: "Seen as it was 53.9 million years ago, when the universe
 * was 13.7 billion years old: on the way the expansion of space stretched its light by 0.37%
 * (redshift 0.0037)." With the ship's Doppler factor D (≠ 1 in flight), how its frequency arrives
 * overall, D / (1 + z). Null for bodies that are not galaxies, those in the camera's own bound
 * structure (the Local Group seen from home) and redshifts below 10⁻⁵.
 */
export function cosmicSightLine(id: string, doppler = 1): string | null {
  const s = cosmicSight(id);
  if (!s) return null;
  if (s.beyond) return 'None of its light has reached you yet: from here and now it lies beyond the observable universe.';
  if (!(s.z >= 1e-5)) return null;
  const z = zWords(s.z);
  let line = `Seen as it was ${gyrWords(s.lookbackGyr)} ago, when the universe was ${gyrWords(s.emitAgeGyr)} old: on the way the expansion of space stretched its light ${stretchWords(s.z)} (redshift ${z}).`;
  const a = cosmicSky.a;
  if (Math.abs(a - 1) > 1e-4) {
    const size = a >= 10 ? sig(a, 3) : a.toFixed(3);
    line += a > 1 ? ` At this date space has grown ${size} times since the present: the distance above is the present one.` : ` At this date space was ${size} of its present size: the distance above is the present one.`;
  }
  if (Math.abs(doppler - 1) > 1e-4) {
    const f = doppler / (1 + s.z);
    line += ` With your own motion (Doppler factor ${sig(doppler, 3)}) it arrives at ${sig(f, 3)} times the frequency it left with.`;
  }
  return line;
}
