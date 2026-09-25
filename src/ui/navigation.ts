import type { BodyId } from '../physics/constants';
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
