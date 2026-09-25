/**
 * One-click journeys: set-piece trips and scenes that show the program at its best, each
 * with a line on what to look for. Flights leave from Earth and play by ship time, about a
 * minute each whatever their length (see sim/travel.ts); scenes set the time warp.
 */
import { Vector3 } from 'three';
import { AU_KM, type BodyId } from '../physics/constants';
import { controller } from '../controls/cameraController';
import { setPaused, setWarp } from '../sim/clock';
import { sim } from '../sim/sim';
import { planTrip, type Drive, type TripPlan } from '../sim/travel';
import { useUI } from '../state/ui';
import { emitLightPulse } from '../lab/logger';
import { startTrip } from '../ui/tripActions';

export interface Flight {
  dest: BodyId;
  drive: Drive;
  /** Cruise speed as a fraction of c (ignored by the rocket drive). */
  beta: number;
  /** Show the classical sky beside the relativistic one. */
  split?: boolean;
}

export interface Journey {
  id: string;
  title: string;
  /** Where and how, in a few words. */
  sub: string;
  /** What to look for, shown while the journey is under way. */
  look: string;
  /** A flight (predicted below the title) or a scene (the camera moves and time runs). */
  flight?: Flight;
  /** For scenes: what the clock is set to. */
  clock?: string;
  run: () => boolean;
}

/** Predict a journey's flight as it would leave Earth now. */
export function predictFlight(f: Flight): TripPlan | null {
  return planTrip(f.dest, f.beta, sim.bodies.earth.pos.clone(), sim.astroTime, f.drive);
}

/** Leave orbit and free flight behind; false when a trip is under way. */
function ready(): boolean {
  const ui = useUI.getState();
  if (ui.tripActive) return false;
  if (ui.controlMode === 'free') controller.exitFreeFlight();
  return true;
}

/** Run `fn` once the camera has finished its slew (at once if it is not slewing). */
function afterSlew(fn: () => void): void {
  if (useUI.getState().controlMode !== 'transition') {
    fn();
    return;
  }
  const unsub = useUI.subscribe((s) => {
    if (s.controlMode === 'transition') return;
    unsub();
    fn();
  });
}

const ABOVE = new Vector3(0.18, 1, 0.32);

function fly(f: Flight, look: string): boolean {
  if (!ready()) return false;
  // Journeys leave from Earth: put the camera there now (a flight departs from the camera).
  controller.placeAt('earth', 26_000);
  controller.update(0, 0);
  // The trip paces itself by ship time (about a minute); only the pause needs lifting.
  if (!startTrip(f.dest, f.beta, f.drive)) return false;
  setPaused(false);
  useUI.setState((s) => ({ journeyNote: look, journeysOpen: false, relMode: f.split ? 'split' : s.relMode === 'off' ? 'on' : s.relMode }));
  return true;
}

function scene(look: string, setUp: () => void): boolean {
  if (!ready()) return false;
  useUI.setState({ journeyNote: look, journeysOpen: false, selected: null });
  setUp();
  return true;
}

const SUNLIGHT: Journey = {
  id: 'sunlight',
  title: 'Race sunlight to Earth',
  sub: 'A pulse of light leaves the Sun; time runs 100× faster than real',
  clock: '1 s here = 100 s',
  look: 'The growing ring is a pulse of light leaving the Sun. It reaches Earth after 8 minutes 19 seconds, Mars a few minutes later and Jupiter after 43 minutes.',
  run: () =>
    scene(SUNLIGHT.look, () => {
      setWarp(1);
      setPaused(false);
      controller.goTo('sun', { distance: 13 * AU_KM, direction: ABOVE });
      afterSlew(() => {
        emitLightPulse('sun');
        setWarp(100);
      });
    }),
};

const SATURN: Journey = {
  id: 'saturn',
  title: 'Earth to Saturn at 0.9c',
  sub: 'Constant speed, nine tenths of the speed of light',
  flight: { dest: 'saturn', drive: 'cruise', beta: 0.9 },
  look: 'The stars gather ahead of you and turn blue. On the recorder your clock, τ, runs at less than half the rate of Earth’s, t. Drag to look around; Astern shows the Sun reddened.',
  run: () => fly(SATURN.flight!, SATURN.look),
};

const SPLIT: Journey = {
  id: 'split',
  title: 'The sky at 0.999c, split screen',
  sub: 'To Neptune, with the classical sky left of the divider',
  flight: { dest: 'neptune', drive: 'cruise', beta: 0.999, split: true },
  look: 'Left of the divider is the sky as it really lies; right of it is what you see at 0.999c: the whole sky squeezed into a cone ahead of you. Drag the divider.',
  run: () => fly(SPLIT.flight!, SPLIT.look),
};

const VOYAGER: Journey = {
  id: 'voyager',
  title: 'Catch up with Voyager 1',
  sub: 'The most distant human-made object, at 0.99c',
  flight: { dest: 'voyager1', drive: 'cruise', beta: 0.99 },
  look: 'Voyager 1 is almost a light-day from Earth. At 0.99c the trip takes about a day by Earth’s clocks and under four hours by yours. Look astern: the Sun has become a faint red star.',
  run: () => fly(VOYAGER.flight!, VOYAGER.look),
};

const PROXIMA: Journey = {
  id: 'proxima',
  title: 'Proxima Centauri at 1 g',
  sub: 'A rocket pushing at one Earth gravity, turning round halfway',
  flight: { dest: 'proxima', drive: 'rocket', beta: 0 },
  look: 'A steady push of one Earth gravity takes you to the nearest star in 3.5 years of your time while 5.9 years pass on Earth. Each second here is three weeks on board; Skip to arrival when you have seen enough.',
  run: () => fly(PROXIMA.flight!, PROXIMA.look),
};

const YEAR: Journey = {
  id: 'year',
  title: 'A year in half a minute',
  sub: 'The planets from above, a million times faster than real',
  clock: '1 s here = 11.6 days',
  look: 'Mercury laps the Sun every 88 days and Earth once in the 31 seconds a year takes here. Bodies are drawn enlarged (T for true size). Space pauses; N comes back to today.',
  run: () =>
    scene(YEAR.look, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      controller.goTo('sun', { distance: 30 * AU_KM, direction: new Vector3(0.05, 1, 0.12) });
      afterSlew(() => setWarp(1_000_000));
    }),
};

const MOON: Journey = {
  id: 'moon',
  title: 'Watch the Moon go round',
  sub: 'A month over Earth, 100 000× faster than real',
  clock: '1 s here = 28 hours',
  look: 'A month passes in 25 seconds. The Moon keeps the same face towards Earth as it goes. Bodies are drawn enlarged (T for true size); the Moon is 1.3 light-seconds away.',
  run: () =>
    scene(MOON.look, () => {
      useUI.setState({ sizeMode: 'visible', showOrbits: true, showLabels: true });
      setWarp(1);
      setPaused(false);
      controller.goTo('earth', { distance: 1.3e6, direction: ABOVE });
      afterSlew(() => setWarp(100_000));
    }),
};

export const JOURNEYS: Journey[] = [SUNLIGHT, SATURN, SPLIT, VOYAGER, PROXIMA, YEAR, MOON];
