/** The keyboard and mouse, grouped, for the keys sheet and the guide. Matches useShortcuts.ts. */
import type { ReactNode } from 'react';
import { WARP_STEPS } from '../sim/clock';
import { formatDurationShort } from '../lib/time';
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
      ['Drag', 'Orbit the target; look around in flight'],
      ['Scroll', 'Move in and out, from a moon to the cosmic web (Shift: faster); throttle in free flight'],
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
      [<Kbd key="esc">Esc</Kbd>, 'Close things; clear the selection; leave free flight'],
    ],
  },
  {
    title: 'Time',
    rows: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause and resume (P in free flight)'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd> or <Kbd>,</Kbd> <Kbd>.</Kbd></>, `Slower, faster, up to ${FASTEST} a second (in flight: the pace of the trip)`],
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
      ['View menu', 'Planet hosts, the cosmic web and the CMB map'],
    ],
  },
  {
    title: 'Free flight',
    rows: [
      [<Kbd key="f">F</Kbd>, 'Free flight on and off'],
      [<><Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd></>, 'Move'],
      [<><Kbd>Space</Kbd>/<Kbd>R</Kbd> · <Kbd>C</Kbd></>, 'Up · down'],
      [<><Kbd>Q</Kbd> <Kbd>E</Kbd></>, 'Roll'],
      ['While flying', 'These letters steer: E and R do not open Learn or record'],
    ],
  },
  {
    title: 'Reading and panels',
    rows: [
      [<Kbd key="e">E</Kbd>, 'Learn: the long reads'],
      [<Kbd key="i">I</Kbd>, 'Instrument panel: every number'],
      [<Kbd key="k">K</Kbd>, 'Lab: experiments, for students'],
      [<Kbd key="r">R</Kbd>, 'Record a reading (lab, Experiments 3 and 4)'],
      [<Kbd key="q">?</Kbd>, 'This sheet'],
    ],
  },
];
