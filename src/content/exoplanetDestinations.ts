/**
 * Every planet of the NASA Exoplanet Archive, and every star that hosts one, as a "Where to?"
 * destination, without registering 6,372 bodies: the archive's names are searched as you type
 * ("K2-18 b", "K2-18", "HD 209458"), and a planet's star becomes a body, with its planets, only
 * when one of them is chosen or planned for (sim/exoplanets ensureHost). Planets and hosts that
 * are bodies already (the featured systems, the planets of a star in view) come back as their
 * registry entries. Going to a planet takes the camera to its star, framing the planets' orbits,
 * with the planet selected.
 */
import { bodyName, getBody, isBody } from '../sim/bodies';
import { sim } from '../sim/sim';
import { ensureHost, exoplanetData, greekBayer, hostBodyId, hostDistanceKm, isNamedHost, known, planetBodyId, planetDisplayName } from '../sim/exoplanets';
import { starData, starDisplayName } from '../sim/stars';
import { useUI } from '../state/ui';
import { goToSystem } from '../ui/navigation';
import { findDestination, matchScore, normalise, type Destination } from './destinations';

/** Normalised names of the archive's planets and hosts, built on the first search. */
let index: { cat: unknown; planets: string[]; hosts: string[] } | null = null;

function names(): { planets: string[]; hosts: string[] } | null {
  const cat = exoplanetData.catalogue;
  if (!cat) return null;
  if (index?.cat !== cat) index = { cat, planets: cat.planets.name.map(normalise), hosts: cat.hosts.name.map(normalise) };
  return index;
}

/** Why the camera cannot go to host h: no distance in the archive, or the data are still loading. */
function hostUnavailable(h: number): string | null {
  const cat = exoplanetData.catalogue;
  if (!cat) return 'Loading the exoplanet catalogue…';
  if (!known(cat.hosts.dist[h])) return 'The archive gives no distance to its star';
  const id = hostBodyId(h);
  if (sim.bodies[id] && !sim.bodies[id].present) return `${cat.hosts.name[h]} is not there at the date shown`;
  return null;
}

/** The name host h goes by: its body's once it is one, else the archive's, with a Greek Bayer letter ("ι Dra"). */
function hostName(h: number): string {
  const id = hostBodyId(h);
  return isBody(id) ? bodyName(id) : greekBayer(exoplanetData.catalogue!.hosts.name[h]);
}

/** Other names host h is found by: the archive's, and its star's in the star catalogue ("Edasich" for "iot Dra"). */
function hostAliases(h: number, name: string): string[] {
  const s = exoplanetData.matches?.star[h] ?? -1;
  const star = s >= 0 && starData.names ? starDisplayName(starData.names, s) : null;
  return [...new Set([exoplanetData.catalogue!.hosts.name[h], star])].filter((a): a is string => !!a && a !== name);
}

/** Take the camera to host h's planetary system, with `select` selected. */
function goToHost(h: number, select?: (hostId: string) => string | null): void {
  const host = ensureHost(h);
  if (!host) return;
  goToSystem(host);
  const planet = select?.(host);
  if (planet && isBody(planet)) useUI.getState().select(planet);
}

/** An archive planet as a destination (its registry entry when it has one). */
function planetDestination(i: number): Destination | undefined {
  const cat = exoplanetData.catalogue!;
  const id = planetBodyId(i);
  if (getBody(id)) return findDestination(id);
  const h = cat.planets.host[i];
  const star = hostName(h);
  const archiveName = cat.planets.name[i];
  const name = planetDisplayName(archiveName, cat.hosts.name[h], { id: hostBodyId(h), name: star, named: isNamedHost(hostBodyId(h)) }, cat.planets.letter[i]);
  return {
    id,
    name,
    aliases: [...new Set([archiveName, star, ...hostAliases(h, star)])].filter((a) => a !== name),
    kind: `Planet of ${star}`,
    group: 'exoplanets',
    body: hostBodyId(h),
    distanceKm: () => hostDistanceKm(h),
    unavailable: () => hostUnavailable(h),
    prepare: () => {
      ensureHost(h);
    },
    go: () => goToHost(h, () => planetBodyId(i)),
  };
}

/** An archive host as a destination (its registry entry when it is a body). */
function hostDestination(h: number): Destination | undefined {
  const cat = exoplanetData.catalogue!;
  const id = hostBodyId(h);
  if (isBody(id)) return findDestination(id);
  const n = cat.hosts.planetCount[h];
  const name = hostName(h);
  return {
    id,
    name,
    aliases: hostAliases(h, name),
    kind: `Star with ${n === 1 ? 'a planet' : `${n} planets`}`,
    group: 'stars',
    body: id,
    distanceKm: () => hostDistanceKm(h),
    unavailable: () => hostUnavailable(h),
    prepare: () => {
      ensureHost(h);
    },
    go: () => goToHost(h),
  };
}

/**
 * The archive's planets and hosts whose names match the query (the whole name, its start, the
 * start of a later word, or anywhere inside: no fuzzy matches among 11,000 names), best first,
 * as destinations; empty until the catalogue has loaded.
 */
export function exoplanetDestinations(query: string, limit = 8): Destination[] {
  const q = normalise(query);
  const idx = names();
  if (!q || !idx) return [];
  const hits: { score: number; planet: number; host: number }[] = [];
  const consider = (list: string[], planet: boolean) => {
    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      if (!t.includes(q)) continue;
      const score = matchScore(q, t) - (planet ? 0 : 1);
      hits.push({ score, planet: planet ? k : -1, host: planet ? -1 : k });
    }
  };
  consider(idx.planets, true);
  consider(idx.hosts, false);
  hits.sort((a, b) => b.score - a.score);
  const out: Destination[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (out.length >= limit) break;
    const d = hit.planet >= 0 ? planetDestination(hit.planet) : hostDestination(hit.host);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}
