import { Vector3 } from 'three';
import { AU_KM, PARSEC_KM } from '../physics/constants';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { systemFramingDistance } from '../controls/framing';
import { bodyRecords, childrenOf, getBody, registryVersion, type BodyId } from '../sim/bodies';
import { sim } from '../sim/sim';

/** The single key that goes to a body ("6" for Saturn), from its registry record. */
export const bodyKey = (id: BodyId): string | undefined => getBody(id)?.key;

const keyMap = { version: -1, map: new Map<string, BodyId>() };

/** The body a key goes to (0–9, M, V for the built-in bodies), case-insensitive. */
export function bodyForKey(key: string): BodyId | undefined {
  if (keyMap.version !== registryVersion()) {
    keyMap.map = new Map(bodyRecords().filter((r) => r.key).map((r) => [r.key!.toLowerCase(), r.id]));
    keyMap.version = registryVersion();
  }
  return keyMap.map.get(key.toLowerCase());
}

export function goToBody(id: BodyId, opts: { distance?: number } = {}) {
  // A body that does not exist at this date (Voyager 1 before 1980) cannot be targeted.
  if (!sim.bodies[id]?.present) return;
  useUI.getState().select(id);
  controller.goTo(id, opts.distance ? { distance: opts.distance } : {});
}

/** Go to a body far enough out to see the orbits of its moons (Jupiter with Callisto's orbit in view). */
export function goToSystem(id: BodyId) {
  goToBody(id, { distance: systemFramingDistance(id) });
}

/**
 * A planet of another star, from Where to? or the Bodies list: its star's whole system framed,
 * with the planet selected (at true scale the planet itself is a speck; its card's Go there
 * goes closer).
 */
export function goToPlanetarySystem(planet: BodyId) {
  const host = getBody(planet)?.parent;
  if (!host || !sim.bodies[host]?.present) return goToBody(planet);
  goToSystem(host);
  if (sim.bodies[planet]?.present) useUI.getState().select(planet);
}

/**
 * A star system from its brightest star: far enough out to see the star it pairs with (Sirius B
 * about Sirius A) and the orbits of its planets.
 */
export function goToStarSystem(primary: BodyId) {
  const at = sim.bodies[primary];
  const pair = getBody(primary)?.parent;
  let reach = 0;
  if (at && pair && getBody(pair)?.kind === 'barycentre') {
    for (const s of childrenOf(pair)) {
      const b = sim.bodies[s.id];
      if (s.id !== primary && s.kind === 'star' && b) reach = Math.max(reach, b.pos.distanceTo(at.pos));
    }
  }
  goToBody(primary, { distance: Math.max(systemFramingDistance(primary), reach * 3) });
}

const OVER_THE_SYSTEM = new Vector3(0.2, 1, 0.35);

/** Frame the whole Solar System out to Pluto, from above the ecliptic (not in flight). */
export function frameSolarSystem(): void {
  if (useUI.getState().tripActive) return;
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 60 * AU_KM, direction: OVER_THE_SYSTEM });
}

const OVER_THE_NEIGHBOURHOOD = new Vector3(0.35, 0.55, 0.75);

/**
 * Frame the stars around the Sun: from 8 pc (26 light-years), where the nearest stars stand out
 * in depth around a faint Sun and the constellations come apart (not in flight).
 */
export function frameNeighbourhood(): void {
  if (useUI.getState().tripActive) return;
  // No card over the view: the Sun is labelled "Sun (home)" from here.
  useUI.getState().select(null);
  controller.goTo('sun', { distance: 8 * PARSEC_KM, direction: OVER_THE_NEIGHBOURHOOD });
}
