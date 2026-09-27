/** Glue between the trip model, the camera and the UI. */
import type { BodyId } from '../sim/bodies';
import { controller } from '../controls/cameraController';
import { sim } from '../sim/sim';
import { abortTrip, launch, planTrip, travel, type Drive, type FlightOptions } from '../sim/travel';
import { warmCosmology } from '../sim/travelCosmic';
import { resetFlightOptions } from './flight/flightOptions';
import { setWarp } from '../sim/clock';
import { useUI } from '../state/ui';
import { chronoLaunch, chronoTripEnd } from '../sim/chronometer';

export function openPlanner(dest?: BodyId): void {
  const ui = useUI.getState();
  // Flights beyond the Local Group need the cosmology's tables (built in a worker if not yet).
  warmCosmology();
  useUI.setState({ plannerOpen: true, journeysOpen: false, searchOpen: false, plannerDest: dest ?? ui.selected ?? ui.plannerDest });
}

/**
 * "Fly here" and "Fly" in search: the planner, set to a 1 g rocket from where you are, so the
 * trip's two clocks are on screen before you press Ignite. Not in flight.
 */
export function planOneG(dest: BodyId): void {
  if (useUI.getState().tripActive) return;
  useUI.setState({ plannerDrive: 'rocket' });
  resetFlightOptions();
  openPlanner(dest);
}

/** What a journey does once its flight arrives (set after starting the trip; dropped if it is aborted). */
let arrivalStep: ((dest: BodyId) => void) | null = null;

/** Run `fn` when the trip under way arrives (not if it is stopped first, or another replaces it). */
export function afterArrival(fn: (dest: BodyId) => void): void {
  arrivalStep = fn;
}

/**
 * Plan and launch a trip from the current camera position. Returns false if unreachable. `opts`: the
 * rocket's acceleration and a limit on the time on board (default 1 g, no limit).
 */
export function startTrip(dest: BodyId, beta: number, drive?: Drive, opts?: FlightOptions): boolean {
  const plan = planTrip(dest, beta, sim.camera.pos.clone(), sim.astroTime, drive, opts);
  if (!plan || plan.distance <= 0) return false;
  arrivalStep = null;
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
  arrivalStep = null;
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
  const step = arrivalStep;
  arrivalStep = null;
  if (there) step?.(dest);
}
