/** Glue between the trip model, the camera and the UI. */
import type { BodyId } from '../physics/constants';
import { controller } from '../controls/cameraController';
import { sim } from '../sim/sim';
import { abortTrip, launch, planTrip, travel, type Drive } from '../sim/travel';
import { useUI } from '../state/ui';
import { chronoLaunch, chronoTripEnd } from '../sim/chronometer';

export function openPlanner(dest?: BodyId): void {
  const ui = useUI.getState();
  useUI.setState({ plannerOpen: true, plannerDest: dest ?? ui.selected ?? ui.plannerDest });
}

/** Plan and launch a trip from the current camera position. Returns false if unreachable. */
export function startTrip(dest: BodyId, beta: number, drive?: Drive): boolean {
  const plan = planTrip(dest, beta, sim.camera.pos.clone(), sim.astroTime, drive);
  if (!plan || plan.distance <= 0) return false;
  launch(plan);
  chronoLaunch();
  controller.startTravel(travel.trip!.dir);
  useUI.setState({ tripActive: true, plannerOpen: false, selected: null });
  return true;
}

/** Stop mid-course: the ship halts (instantly, idealised) and the camera orbits the nearest body. */
export function stopTrip(): void {
  abortTrip();
  chronoTripEnd();
  sim.camera.pos.copy(travel.shipPos);
  useUI.setState({ tripActive: false });
  controller.exitTravelToNearest();
}

/** Called by the simulation driver on the frame the ship arrives. */
export function onArrival(dest: BodyId): void {
  sim.camera.pos.copy(travel.shipPos);
  controller.finishTravel(dest);
  useUI.setState({ tripActive: false, selected: dest });
}
