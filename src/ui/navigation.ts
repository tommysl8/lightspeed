import { Vector3 } from 'three';
import { AU_KM } from '../physics/constants';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { systemFramingDistance } from '../controls/framing';
import { bodyRecords, getBody, registryVersion, type BodyId } from '../sim/bodies';
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

const OVER_THE_SYSTEM = new Vector3(0.2, 1, 0.35);

/** Frame the whole Solar System out to Pluto, from above the ecliptic (not in flight). */
export function frameSolarSystem(): void {
  if (useUI.getState().tripActive) return;
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 60 * AU_KM, direction: OVER_THE_SYSTEM });
}
