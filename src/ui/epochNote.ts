/**
 * What a card says about home far from the present. The clock runs to billions of years ahead
 * (the universe expands with it: sim/cosmicTime.ts), but the Sun, the planets and the stars are drawn
 * as they are today: this says so, and what the Sun and the Earth have become by then (the home
 * clock of physics/cosmology/future.ts: the Sun's future from Schröder & Connon Smith 2008).
 */
import { FUTURE, sunAt } from '../physics/cosmology/future';
import { PRESENT_AGE_GYR, cosmicNow } from '../sim/cosmicTime';
import { gyrWords } from '../sim/cosmos/sight';
import { getBody, rootOf, type BodyId } from '../sim/bodies';

/** Further from the present than this (Gyr), a card says the body is drawn as it is today. */
export const FAR_EPOCH_GYR = 0.01;

/** The Sun's phases (future.json) as the note words them. */
const SUN_WORDS: Record<string, string> = {
  'main-sequence': 'still a main-sequence star',
  'subgiant-red-giant': 'swelling into a red giant',
  'helium-burning': 'a helium-burning giant',
  'white-dwarf': 'a white dwarf',
};

const ENGULFED_GYR = FUTURE.earth.events.find((e) => e.id === 'engulfed')!.fromNowGyr;

/** The Earth at `fromNow` Gyr ahead, in a few words (after homeAt's thresholds). */
function earthWords(fromNow: number): string {
  if (fromNow < 0.5) return 'the Earth is still habitable';
  if (fromNow < 1.5) return 'the Earth is losing its oceans to the brightening Sun';
  if (fromNow < ENGULFED_GYR) return 'the Earth is a hot, dry world';
  return 'the Earth is gone, swallowed by the red-giant Sun';
}

/**
 * The note for a body's card at the clock's date, or null near the present. Galaxies have none: the
 * expansion that carries them is modelled (their own cards say what is not).
 */
export function farEpochNote(id: BodyId, ageGyr: number = cosmicNow().ageGyr): string | null {
  const fromNow = ageGyr - PRESENT_AGE_GYR;
  if (!(Math.abs(fromNow) >= FAR_EPOCH_GYR)) return null;
  const b = getBody(id);
  if (!b || b.kind === 'galaxy' || (b.kind === 'cluster' && /galax/i.test(b.deepSky?.type ?? b.kindText ?? ''))) return null;
  const span = gyrWords(Math.abs(fromNow));
  if (rootOf(id)?.id === 'sun') {
    if (fromNow < 0) return `${cap(span)} ago: the Solar System is drawn as it is today.`;
    const sun = SUN_WORDS[sunAt(fromNow).phaseId] ?? `a ${sunAt(fromNow).phaseName}`;
    return `${cap(span)} from now the Sun is ${sun} and ${earthWords(fromNow)} (Schröder & Connon Smith 2008); the Solar System is drawn as it is today.`;
  }
  return `Drawn as it is today: what becomes of it over ${span} is not modelled.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
