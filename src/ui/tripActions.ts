/** Glue between the trip model, the camera and the UI. */
import type { BodyId } from '../sim/bodies';
import { controller } from '../controls/cameraController';
import { sim } from '../sim/sim';
import { abortTrip, launch, planTrip, travel, type Drive } from '../sim/travel';
import { setWarp } from '../sim/clock';
import { useUI } from '../state/ui';
import { chronoLaunch, chronoTripEnd } from '../sim/chronometer';

export function openPlanner(dest?: BodyId): void {
  const ui = useUI.getState();
  useUI.setState({ plannerOpen: true, journeysOpen: false, searchOpen: false, plannerDest: dest ?? ui.selected ?? ui.plannerDest });
}

/**
 * "Fly here" and "Fly" in search: the planner, set to a 1 g rocket from where you are, so the
 * trip's two clocks are on screen before you press Ignite. Not in flight.
 */
export function planOneG(dest: BodyId): void {
  if (useUI.getState().tripActive) return;
  useUI.setState({ plannerDrive: 'rocket' });
  openPlanner(dest);
}

/** Plan and launch a trip from the current camera position. Returns false if unreachable. */
export function startTrip(dest: BodyId, beta: number, drive?: Drive): boolean {
  const plan = planTrip(dest, beta, sim.camera.pos.clone(), sim.astroTime, drive);
  if (!plan || plan.distance <= 0) return false;
  launch(plan);
  chronoLaunch();
  controller.startTravel(travel.trip!.dir);
  useUI.setState({ tripActive: true, plannerOpen: false, selected: null, journeyNote: null });
  return true;
}

/** After a journey's flight, time runs at real time again (a scene before it may have left the clock racing). */
function endJourney(): void {
  if (useUI.getState().journeyNote) setWarp(1);
  useUI.setState({ journeyNote: null });
}

/** Stop mid-course: the ship halts (instantly, idealised) and the camera orbits the nearest body. */
export function stopTrip(): void {
  abortTrip();
  chronoTripEnd();
  sim.camera.pos.copy(travel.shipPos);
  endJourney();
  useUI.setState({ tripActive: false });
  controller.exitTravelToNearest();
}

/** Called by the simulation driver on the frame the ship arrives. */
export function onArrival(dest: BodyId): void {
  sim.camera.pos.copy(travel.shipPos);
  // The destination may have left the registry during the flight: the camera then orbits the
  // nearest body, and nothing is selected.
  const there = !!sim.bodies[dest]?.present;
  controller.finishTravel(dest);
  endJourney();
  useUI.setState({ tripActive: false, selected: there ? dest : null });
}
