/**
 * Rows of the ephemeris table (instruments, "Ephemeris"): the bodies with a key (the Sun, the
 * planets, Pluto, the Moon, Voyager 1), the stars people fly to (Proxima Centauri, the stars of
 * the five systems, the named stars and the featured planet hosts), the moons of the system in
 * focus, and the focus and the target themselves; never hundreds of rows, however many bodies
 * are registered. A star registered on demand (found in search, approached, or an archive host)
 * is listed only while it is the focus or the target.
 */
import { getBody, isWithin, systemOf, bodyRecords, type BodyId, type BodyRecord } from '../../sim/bodies';

/** A star at the top of its system: no parent, or a barycentre (the stars of a binary). */
const topStar = (r: BodyRecord): boolean => r.kind === 'star' && (r.parent === null || getBody(r.parent)?.kind === 'barycentre');

export function ephemerisRows(focus: BodyId, selected: BodyId | null): BodyId[] {
  const system = systemOf(focus)?.id;
  return bodyRecords()
    .filter(
      (r) =>
        r.key ||
        (topStar(r) && !r.onDemand) ||
        r.id === focus ||
        r.id === selected ||
        (system && system !== 'sun' && isWithin(r.id, system)),
    )
    .map((r) => r.id);
}
