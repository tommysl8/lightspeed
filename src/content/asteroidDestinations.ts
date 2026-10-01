/**
 * Every named or numbered asteroid and every comet of the small-body layer as a "Where to?" destination, without
 * registering 900,000 bodies: the names (sim/asteroids/names.ts, loaded when the palette opens) are searched as you
 * type ("Eros", "433", "NEOWISE", "12P"), and a body becomes a body of the registry only when it is chosen
 * (sim/asteroids/bodies.ts ensureSmallBody: its file and labels are fetched then, so going there takes a moment).
 * Bodies the registry has already (Ceres, Halley's Comet, one clicked earlier) come back as their own entries.
 */
import { getBody, isBody } from '../sim/bodies';
import { ensureSmallBody, type SmallRef } from '../sim/asteroids/bodies';
import { locateNumber } from '../sim/asteroids/format';
import { smallNames } from '../sim/asteroids/names';
import { sim } from '../sim/sim';
import { goToBody } from '../ui/navigation';
import { findDestination, matchScore, normalise, type Destination, type DestinationMatch } from './destinations';

/** A body of the layer as a destination: its registry entry once it has one. */
function smallDestination(id: string, name: string, kind: string, comet: boolean, ref: SmallRef, aliases: string[]): Destination {
  if (getBody(id)) {
    const d = findDestination(id);
    if (d) return d;
  }
  return {
    id,
    name,
    aliases,
    kind,
    group: comet ? 'comets' : 'small-bodies',
    // Not a body yet (like a catalogue star found by name): prepare makes it one, and until then it is loading.
    body: id,
    distanceKm: () => (isBody(id) ? (sim.bodies[id]?.distTrue ?? NaN) : NaN),
    unavailable: () => (isBody(id) ? null : 'Loading its orbit…'),
    // Highlighted in the palette, it becomes a body (its file and labels fetched), so its distance and a flight's
    // cost can be shown; the palette's results then hold its registry entry.
    prepare: () => {
      void ensureSmallBody(ref);
    },
    go: () => {
      void ensureSmallBody(ref).then((got) => {
        if (got) goToBody(got);
      });
    },
  };
}

/**
 * The layer's bodies whose number or name matches the query (the whole name, its start, the start of a later word,
 * or anywhere inside), best first, with their scores (destinations.ts matchScore, as the registry's are scored);
 * empty until the names have loaded.
 */
export function asteroidMatches(query: string, limit = 8): DestinationMatch[] {
  const f = smallNames.file;
  const q = normalise(query);
  if (!f || !q) return [];
  const out: DestinationMatch[] = [];
  // A number: that numbered body ("433", "(433)").
  const num = /^\(?(\d{1,7})\)?$/.exec(q)?.[1];
  if (num) {
    const n = Number(num);
    const at = locateNumber(f.sectionOf, n);
    if (at) {
      const name = f.named.get(n);
      out.push({ score: 1000, destination: smallDestination(`asteroid-${n}`, name ? `${n} ${name}` : `(${n})`, 'Asteroid', false, at, [String(n)]) });
    }
  }
  const hits: { score: number; d: () => Destination }[] = [];
  for (const [n, name, t] of smallNames.named) {
    if (!t.includes(q)) continue;
    hits.push({
      score: matchScore(q, t),
      d: () => smallDestination(`asteroid-${n}`, `${n} ${name}`, 'Asteroid', false, locateNumber(f.sectionOf, n)!, [String(n), name]),
    });
  }
  for (const [des, section, index, t] of smallNames.comets) {
    if (!t.includes(q)) continue;
    const slug = des
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    hits.push({ score: matchScore(q, t) - 1, d: () => smallDestination(`comet-${slug}`, des, 'Comet', true, { section, index }, []) });
  }
  hits.sort((a, b) => b.score - a.score);
  const seen = new Set(out.map((m) => m.destination.id));
  for (const h of hits) {
    if (out.length >= limit) break;
    const d = h.d();
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ score: h.score, destination: d });
  }
  return out;
}

/** The same as destinations alone. */
export const asteroidDestinations = (query: string, limit = 8): Destination[] => asteroidMatches(query, limit).map((m) => m.destination);
