/**
 * One-click journeys: set-piece trips and scenes that show the program at its best. Each is
 * a scene spec (content/scenes.ts sets it up) with a title and a line on where and how;
 * what to look for comes with the scene. Flights leave from Earth and play by ship time,
 * about a minute each whatever their length (see sim/travel.ts); scenes set the time warp.
 */
import { flightOf, runScene, sceneNote, type Flight } from './scenes';

export { predictFlight, type Flight } from './scenes';

export interface Journey {
  id: string;
  title: string;
  /** Where and how, in a few words. */
  sub: string;
  /** The scene spec it runs ("fly:saturn?beta=0.9", "race-sunlight"). */
  scene: string;
  /** What to look for, shown while the journey is under way. */
  look: string;
  /** A flight (predicted below the title) or a scene (the camera moves and time runs). */
  flight?: Flight;
  /** For scenes: what the clock is set to. */
  clock?: string;
  run: () => boolean;
}

function journey(j: { id: string; title: string; sub: string; scene: string; clock?: string }): Journey {
  const look = sceneNote(j.scene) ?? '';
  return { ...j, look, flight: flightOf(j.scene) ?? undefined, run: () => runScene(j.scene, { note: look }) };
}

export const JOURNEYS: Journey[] = [
  journey({
    id: 'sunlight',
    title: 'Race sunlight to Earth',
    sub: 'A pulse of light leaves the Sun; time runs 100× faster than real',
    scene: 'race-sunlight',
    clock: '1 s here = 100 s',
  }),
  journey({ id: 'saturn', title: 'Earth to Saturn at 0.9c', sub: 'Constant speed, nine tenths of the speed of light', scene: 'fly:saturn?beta=0.9' }),
  journey({
    id: 'split',
    title: 'The sky at 0.999c, split screen',
    sub: 'To Neptune, with the classical sky left of the divider',
    scene: 'split-0.999c',
  }),
  journey({ id: 'voyager', title: 'Catch up with Voyager 1', sub: 'The most distant human-made object, at 0.99c', scene: 'fly:voyager1?beta=0.99' }),
  journey({
    id: 'proxima',
    title: 'Proxima Centauri at 1 g',
    sub: 'A rocket pushing at one Earth gravity, turning round halfway',
    scene: 'fly:proxima',
  }),
  journey({
    id: 'year',
    title: 'A year in half a minute',
    sub: 'The planets from above, a million times faster than real',
    scene: 'year-in-30s',
    clock: '1 s here = 11.6 days',
  }),
  journey({ id: 'moon', title: 'Watch the Moon go round', sub: 'A month over Earth, 100,000× faster than real', scene: 'moon-month', clock: '1 s here = 28 hours' }),
];
