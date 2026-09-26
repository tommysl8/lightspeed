import { Vector3 } from 'three';
import { AU_KM, type BodyId } from '../physics/constants';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import { sim } from '../sim/sim';

export const BODY_KEYS: Partial<Record<BodyId, string>> = {
  sun: '0',
  mercury: '1',
  venus: '2',
  earth: '3',
  mars: '4',
  jupiter: '5',
  saturn: '6',
  uranus: '7',
  neptune: '8',
  pluto: '9',
  moon: 'M',
  voyager1: 'V',
};

export function goToBody(id: BodyId) {
  // A body that does not exist at this date (Voyager 1 before 1980) cannot be targeted.
  if (!sim.bodies[id].present) return;
  useUI.getState().select(id);
  controller.goTo(id);
}

const OVER_THE_SYSTEM = new Vector3(0.2, 1, 0.35);

/** Frame the whole Solar System out to Pluto, from above the ecliptic (not in flight). */
export function frameSolarSystem(): void {
  if (useUI.getState().tripActive) return;
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 60 * AU_KM, direction: OVER_THE_SYSTEM });
}
