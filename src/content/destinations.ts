/**
 * Destinations: everything "Where to?" can find and the Bodies list can show.
 *
 * The list is built from providers. The first is the body registry (sim/bodies): every
 * registered body is a destination, so the moons, dwarf planets, comets, spacecraft and stars
 * that later data registers appear in search and in the Bodies list by themselves. Places that
 * are not bodies can be added with registerDestinations.
 *
 * Matching is fuzzy and forgiving: prefixes and whole words first, then letters in order
 * ("jptr"), then one slip of the keyboard ("satrun").
 */
import { bodyRecords, getBody, kindText, registryVersion, subscribeRegistry, type BodyId, type BodyRecord } from '../sim/bodies';
import { sim } from '../sim/sim';
import { goToBody } from '../ui/navigation';

// ─── The registry ───────────────────────────────────────────────────────────────────────

/** How the Bodies list groups destinations, in the order it shows them. */
export const DESTINATION_GROUPS = [
  { id: 'sun-planets', title: 'Sun and planets' },
  { id: 'dwarf-planets', title: 'Dwarf planets' },
  { id: 'moons', title: 'Moons' },
  { id: 'small-bodies', title: 'Asteroids, comets and interstellar objects' },
  { id: 'spacecraft', title: 'Spacecraft' },
  { id: 'stars', title: 'Stars' },
  { id: 'exoplanets', title: 'Exoplanets' },
  { id: 'deep-sky', title: 'Clusters and nebulae' },
  { id: 'galaxies', title: 'Galaxies' },
] as const;

export type DestinationGroup = (typeof DESTINATION_GROUPS)[number]['id'];

export interface Destination {
  /** Unique id. For bodies, the body id (which is also its scene target id). */
  id: string;
  name: string;
  /** A shorter name where room is tight ("Proxima"). */
  shortName?: string;
  /** Other names people type: "Luna", "red planet", "Alpha Centauri C". */
  aliases: readonly string[];
  /** What it is, in a word or two: "Planet", "Moon of Earth", "Spacecraft". */
  kind: string;
  group: DestinationGroup;
  /** The body the camera and the flight planner use (destinations that are not bodies have none yet). */
  body?: BodyId;
  /** The destination it orbits, for nesting in lists (Jupiter for Io). */
  parent?: string;
  /** The single key that goes there ("6"), if any. */
  key?: string;
  /** Distance from the camera now, km (NaN when not known). */
  distanceKm: () => number;
  /** Why the camera cannot go there now, or null when it can. */
  unavailable: () => string | null;
  /** Take the camera there (a camera move, not a journey). */
  go: () => void;
}

export type DestinationProvider = () => readonly Destination[];

const providers: DestinationProvider[] = [];

let version = 0;
const listeners = new Set<() => void>();

/** Bumped whenever the destinations may have changed (for lists that are open meanwhile). */
export const destinationsVersion = (): number => version;
export function subscribeDestinations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/**
 * Tell open lists that the destinations changed: called on registering a provider, and by a
 * provider whose list grows after it registered (data that loads later).
 */
export function destinationsChanged(): void {
  version++;
  listeners.forEach((f) => f());
}

/**
 * Add destinations (a later update's moons, stars or galaxies). A provider registered later
 * wins when two give the same id, so an update can replace a body's entry with a richer one.
 * Returns a function that removes the provider again.
 */
export function registerDestinations(provider: DestinationProvider): () => void {
  providers.unshift(provider);
  destinationsChanged();
  return () => {
    const i = providers.indexOf(provider);
    if (i >= 0) providers.splice(i, 1);
    destinationsChanged();
  };
}

/** Every destination, each id once, in the order of the groups (then as each provider lists them). */
export function allDestinations(): Destination[] {
  // From the first provider registered to the last: a later entry replaces an earlier one
  // with the same id but keeps its place (Map.set on an existing key does not move it).
  const byId = new Map<string, Destination>();
  for (let i = providers.length - 1; i >= 0; i--) for (const d of providers[i]()) byId.set(d.id, d);
  const rank = new Map<string, number>(DESTINATION_GROUPS.map((g, i) => [g.id, i]));
  // Array sort is stable, so each group keeps the providers' order.
  return [...byId.values()].sort((a, b) => rank.get(a.group)! - rank.get(b.group)!);
}

export const findDestination = (id: string): Destination | undefined => allDestinations().find((d) => d.id === id);

/** The destinations shown before anything is typed. */
export const FEATURED_IDS = ['moon', 'mars', 'saturn', 'pluto', 'voyager1', 'proxima'] as const;

export function featuredDestinations(list: readonly Destination[] = allDestinations()): Destination[] {
  return FEATURED_IDS.map((id) => list.find((d) => d.id === id)).filter((d): d is Destination => !!d);
}

/** The destinations in each group, in order, leaving out empty groups. */
export function groupedDestinations(list: readonly Destination[] = allDestinations()): { id: DestinationGroup; title: string; items: Destination[] }[] {
  return DESTINATION_GROUPS.map((g) => ({ id: g.id, title: g.title, items: list.filter((d) => d.group === g.id) })).filter((g) => g.items.length > 0);
}

/** Groups whose members are listed under what they orbit when that is listed too (moons under their planet). */
const NESTED_GROUPS: ReadonlySet<DestinationGroup> = new Set(['moons', 'exoplanets']);

export interface NestedItem {
  destination: Destination;
  /** 0 for the top level, 1 for a moon under its planet, and so on. */
  depth: number;
  /** How many listed destinations sit directly under this one. */
  children: number;
}

/**
 * The Bodies list: grouped by kind, and within that by what each body orbits: Jupiter's moons
 * right under Jupiter, Charon under Pluto. Moons whose planet is not listed keep a group of
 * their own. Empty groups are left out.
 */
export function nestedDestinations(list: readonly Destination[] = allDestinations()): { id: DestinationGroup; title: string; items: NestedItem[] }[] {
  const byId = new Map(list.map((d) => [d.id, d]));
  const nests = (d: Destination) => NESTED_GROUPS.has(d.group) && !!d.parent && d.parent !== d.id && byId.has(d.parent);
  const under = new Map<string, Destination[]>();
  for (const d of list) {
    if (!nests(d)) continue;
    const arr = under.get(d.parent!) ?? [];
    arr.push(d);
    under.set(d.parent!, arr);
  }
  const placed = new Set<string>();
  const add = (d: Destination, depth: number, out: NestedItem[]) => {
    if (placed.has(d.id)) return;
    placed.add(d.id);
    const kids = under.get(d.id) ?? [];
    out.push({ destination: d, depth, children: kids.length });
    for (const k of kids) add(k, depth + 1, out);
  };
  return DESTINATION_GROUPS.map((g) => {
    const items: NestedItem[] = [];
    for (const d of list) if (d.group === g.id && !nests(d)) add(d, 0, items);
    return { id: g.id, title: g.title, items };
  }).filter((g) => g.items.length > 0);
}

// ─── The registered bodies ──────────────────────────────────────────────────────────────

/** What a body is, in a word or two: "Planet", "Moon of Earth", "Our star". */
export const bodyKindText = (id: BodyId): string => kindText(id);

/** The Bodies-list group of a registered body. */
export function bodyGroup(r: BodyRecord): DestinationGroup {
  switch (r.kind) {
    case 'star':
      return r.id === 'sun' ? 'sun-planets' : 'stars';
    case 'planet':
      return 'sun-planets';
    case 'dwarf-planet':
      return 'dwarf-planets';
    case 'moon':
      return 'moons';
    case 'asteroid':
    case 'comet':
    case 'interstellar':
      return 'small-bodies';
    case 'spacecraft':
      return 'spacecraft';
    case 'exoplanet':
      return 'exoplanets';
    case 'cluster':
    case 'nebula':
      return 'deep-sky';
    case 'galaxy':
      return 'galaxies';
    default:
      return 'stars';
  }
}

function bodyDestination(r: BodyRecord): Destination {
  const id = r.id;
  const parent = r.parent !== null && getBody(r.parent)?.kind !== 'barycentre' ? r.parent : undefined;
  return {
    id,
    name: r.name,
    shortName: r.shortName,
    aliases: r.aliases ?? [],
    kind: kindText(id),
    group: bodyGroup(r),
    body: id,
    parent,
    key: r.key,
    distanceKm: () => sim.bodies[id]?.distTrue ?? NaN,
    // Voyager 1 before its 1980 Saturn flyby, say: not modelled at the date shown.
    unavailable: () => (sim.bodies[id]?.present ? null : `${r.name} is not there at the date shown`),
    go: () => goToBody(id),
  };
}

/** Every registered body that is a destination, rebuilt when the registry changes. */
const fromRegistry = { version: -1, list: [] as readonly Destination[] };
function bodyDestinations(): readonly Destination[] {
  const v = registryVersion();
  if (fromRegistry.version !== v) {
    fromRegistry.list = bodyRecords()
      .filter((r) => r.destination !== false)
      .map(bodyDestination);
    fromRegistry.version = v;
  }
  return fromRegistry.list;
}

registerDestinations(bodyDestinations);
subscribeRegistry(destinationsChanged);

// ─── Matching ───────────────────────────────────────────────────────────────────────────

/** Lower case, accents and apostrophes gone, anything else that is not a letter or digit a single space. */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’'ʻ‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Restricted Damerau–Levenshtein distance (a swap of neighbours counts as one slip). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/**
 * Letters of the query in order through the text ("jptr" in "jupiter"): 1–199, higher for
 * runs of consecutive letters and for letters that start words; 0 when they are not all there.
 */
function subsequenceScore(q: string, t: string): number {
  let score = 0;
  let j = 0;
  let last = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    while (j < t.length && t[j] !== ch) j++;
    if (j >= t.length) return 0;
    if (j === last + 1) score += 3;
    if (j === 0 || t[j - 1] === ' ') score += 4;
    score -= Math.min(3, j - last - 1);
    last = j;
    j++;
  }
  return Math.max(1, Math.min(199, 100 + score));
}

/**
 * How well a normalised query matches a normalised name: 0 for not at all; otherwise higher
 * is better. The whole name beats its start, which beats the start of a later word, which
 * beats anywhere inside, which beats letters in order, which beats a near miss.
 */
export function matchScore(q: string, t: string): number {
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(99, t.length - q.length);
  const w = t.indexOf(` ${q}`);
  if (w >= 0) return 800 - Math.min(99, w);
  const i = t.indexOf(q);
  if (i >= 0) return 700 - Math.min(99, i);
  if (q.length >= 3) {
    const s = subsequenceScore(q, t);
    if (s > 0) return 300 + s;
  }
  if (q.length >= 4) {
    // A slip of the keyboard: compare with the start of each word, as long as the query.
    const allowed = q.length >= 7 ? 2 : 1;
    let best = Infinity;
    for (let k = 0; k < t.length; k++) {
      if (k > 0 && t[k - 1] !== ' ') continue;
      for (const len of [q.length - 1, q.length, q.length + 1]) {
        if (k + len > t.length) continue;
        best = Math.min(best, editDistance(q, t.slice(k, k + len)));
      }
    }
    if (best <= allowed) return 200 - 50 * best;
  }
  return 0;
}

export interface DestinationMatch {
  destination: Destination;
  score: number;
}

/** The destinations matching a query, best first (names count a little more than aliases). */
export function searchDestinations(query: string, list: readonly Destination[] = allDestinations(), limit = 30): DestinationMatch[] {
  const q = normalise(query);
  if (!q) return [];
  const out: DestinationMatch[] = [];
  for (const d of list) {
    let score = matchScore(q, normalise(d.name));
    if (d.shortName) score = Math.max(score, matchScore(q, normalise(d.shortName)) - 1);
    for (const a of d.aliases) score = Math.max(score, matchScore(q, normalise(a)) - 10);
    if (score > 0) out.push({ destination: d, score });
  }
  // Stable: equal scores keep the registry's order (Sun outwards).
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.score - a.m.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.m);
}
