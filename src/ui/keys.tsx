/** The keyboard and mouse, grouped, for the keys sheet and the guide. Matches useShortcuts.ts. */
import type { ReactNode } from 'react';
import { Kbd } from './kit';

export interface KeyGroup {
  title: string;
  rows: [ReactNode, ReactNode][];
}

export const KEY_GROUPS: KeyGroup[] = [
  {
    title: 'Mouse',
    rows: [
      ['Drag', 'Orbit the target; look around in flight'],
      ['Scroll', 'Move in and out (Shift: faster); throttle in free flight'],
      ['Click a planet', 'Select it: its card'],
      ['Double-click', 'Take the camera there'],
    ],
  },
  {
    title: 'Go places',
    rows: [
      [<><Kbd>/</Kbd> or <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd></>, 'Where to? Find anything and go there'],
      [<><Kbd>0</Kbd>–<Kbd>9</Kbd></>, 'Sun, Mercury … Neptune, Pluto (in flight: select it)'],
      [<><Kbd>M</Kbd> <Kbd>V</Kbd></>, 'Moon, Voyager 1'],
      [<Kbd key="h">H</Kbd>, 'Back to Earth'],
      [<Kbd key="g">G</Kbd>, 'Plan a flight'],
      [<>Arrows · <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'Orbit (in flight: look around) · move in and out (Shift+−: faster)'],
      [<Kbd key="esc">Esc</Kbd>, 'Close things; clear the selection; leave free flight'],
    ],
  },
  {
    title: 'Time',
    rows: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause and resume (P in free flight)'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd> or <Kbd>,</Kbd> <Kbd>.</Kbd></>, 'Slower, faster (in flight: the pace of the trip)'],
      [<Kbd key="n">N</Kbd>, 'Back to the present'],
    ],
  },
  {
    title: 'The view',
    rows: [
      [<Kbd key="t">T</Kbd>, 'True size or enlarged bodies'],
      [<><Kbd>O</Kbd> <Kbd>L</Kbd> <Kbd>B</Kbd></>, 'Orbits, labels, small bodies'],
      [<Kbd key="j">J</Kbd>, 'Ecliptic grid'],
      [<Kbd key="u">U</Kbd>, 'Readouts over the view'],
      [<Kbd key="z">Z</Kbd>, 'Relativistic or classical sky'],
      [<Kbd key="x">X</Kbd>, 'Split screen'],
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
