/** The keyboard and mouse, grouped, for the keys sheet and the guide. Matches useShortcuts.ts and the camera controller's own keys (Roam's among them). */
import type { ReactNode } from 'react';
import { WARP_STEPS } from '../sim/clock';
import { formatDurationShort } from '../lib/time';
import { countWordStart } from '../lib/words';
import { ROAM_BOOST } from '../controls/roamScale';
import { Kbd } from './kit';

export interface KeyGroup {
  title: string;
  rows: [ReactNode, ReactNode][];
}

/** The fastest rate of time, in words ("320 million years"). */
const FASTEST = formatDurationShort(WARP_STEPS[WARP_STEPS.length - 1], 2);

export const KEY_GROUPS: KeyGroup[] = [
  {
    title: 'Mouse',
    rows: [
      ['Drag', 'Orbit the target; look around in flight and in Roam (on a touch screen, one finger)'],
      ['Scroll', 'Move in and out, from a moon to the cosmic web (Shift: faster); in Roam, the pace; in the ship, the throttle'],
      ['Click', 'Select a planet, star, nebula or galaxy: its card'],
      ['Double-click', 'Take the camera there'],
      ['The trail', 'Click a level to see it whole: Solar System, Milky Way, Local Group…'],
    ],
  },
  {
    title: 'Go places',
    rows: [
      [<><Kbd>/</Kbd> or <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd></>, 'Where to? Find anything by name, from the Moon to Andromeda'],
      [<><Kbd>0</Kbd>–<Kbd>9</Kbd></>, 'Sun, Mercury … Neptune, Pluto (in flight: select it)'],
      [<><Kbd>M</Kbd> <Kbd>V</Kbd></>, 'Moon, Voyager 1'],
      [<Kbd key="h">H</Kbd>, 'Back to Earth'],
      [<Kbd key="g">G</Kbd>, 'Plan a flight to the selected body'],
      [<>Arrows · <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'Orbit (in flight: look around) · move in and out (Shift+−: faster)'],
      [<Kbd key="esc">Esc</Kbd>, 'Leave clean full screen; close things; clear the selection; leave Roam (not a fall: use Stop the fall)'],
    ],
  },
  {
    title: 'Time',
    rows: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause and resume (P in Roam and the ship, where Space is up)'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd> or <Kbd>,</Kbd> <Kbd>.</Kbd></>, `Slower, faster, up to ${FASTEST} a second (in flight: the pace of the trip; in a fall, its pace)`],
      [<Kbd key="n">N</Kbd>, 'Back to the present'],
    ],
  },
  {
    title: 'The view',
    rows: [
      [<Kbd key="t">T</Kbd>, 'True size or enlarged bodies'],
      [<><Kbd>O</Kbd> <Kbd>L</Kbd> <Kbd>B</Kbd></>, 'Orbits, labels, small bodies'],
      [<Kbd key="j">J</Kbd>, 'Ecliptic grid'],
      [<Kbd key="y">Y</Kbd>, 'Constellations'],
      [<Kbd key="u">U</Kbd>, 'Readouts over the view'],
      [<Kbd key="z">Z</Kbd>, 'Relativistic or classical sky'],
      [<Kbd key="x">X</Kbd>, 'Split screen'],
      [<><Kbd>Shift</Kbd>+<Kbd>F</Kbd></>, 'Clean full screen: the view alone, no text (Esc or Shift+F leaves)'],
      ['View menu', 'Planet hosts, the cosmic web, the CMB map, gravitational lensing and the accretion flow; whether the black-hole panel opens by itself'],
    ],
  },
  {
    title: 'Roam',
    rows: [
      [<Kbd key="f">F</Kbd>, 'Roam on and off: fly the camera anywhere, nothing in focus, no speed limit'],
      [<><Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or arrows</>, 'Move'],
      [<><Kbd>Space</Kbd>/<Kbd>R</Kbd> · <Kbd>C</Kbd></>, 'Up · down'],
      [<><Kbd>Q</Kbd> <Kbd>E</Kbd></>, 'Roll'],
      [<Kbd key="shift">Shift</Kbd>, `${countWordStart(ROAM_BOOST)} times faster, while held`],
      [<>Scroll, <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'The pace: ×1 is the one the surroundings set'],
      ['Drag', 'Look round (Mouse look on the panel: no drag; Esc frees the mouse)'],
      ['Fly the ship', 'On the panel: the light-speed limit and relativity, the wheel as throttle; Esc comes back to Roam'],
      ['While flying', 'These letters steer: E does not open Learn'],
    ],
  },
  {
    title: 'Reading and panels',
    rows: [
      [<Kbd key="e">E</Kbd>, 'Learn: the long reads'],
      [<Kbd key="i">I</Kbd>, 'Instrument panel: every number'],
      [<Kbd key="q">?</Kbd>, 'This sheet'],
    ],
  },
];
