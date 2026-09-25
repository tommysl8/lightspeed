/** The keyboard and mouse, grouped, for the keys sheet and the guide. */
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
      ['Scroll', 'Move in and out; throttle in free flight'],
      ['Click a planet', 'Select it: its card and its numbers'],
      ['Double-click', 'Take the camera there'],
    ],
  },
  {
    title: 'Go places',
    rows: [
      [<><Kbd>0</Kbd>–<Kbd>9</Kbd></>, 'Sun, Mercury … Neptune, Pluto'],
      [<><Kbd>M</Kbd> <Kbd>V</Kbd></>, 'Moon, Voyager 1'],
      [<Kbd key="h">H</Kbd>, 'Back to Earth'],
      [<Kbd key="g">G</Kbd>, 'Plan a flight'],
      [<>Arrows · <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'Orbit · move in and out'],
      [<Kbd key="esc">Esc</Kbd>, 'Close things; clear the selection'],
    ],
  },
  {
    title: 'Time',
    rows: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause and resume (P in free flight)'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd></>, 'Time slower, faster'],
      [<Kbd key="n">N</Kbd>, 'Back to the present'],
    ],
  },
  {
    title: 'The view',
    rows: [
      [<Kbd key="t">T</Kbd>, 'True size or enlarged bodies'],
      [<><Kbd>O</Kbd> <Kbd>L</Kbd> <Kbd>B</Kbd></>, 'Orbits, labels, asteroids'],
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
    ],
  },
  {
    title: 'Panels',
    rows: [
      [<Kbd key="k">K</Kbd>, 'Physics: explanations and the lab'],
      [<Kbd key="i">I</Kbd>, 'Instruments: the numbers'],
      [<Kbd key="e">E</Kbd>, 'Physics explanations'],
      [<Kbd key="r">R</Kbd>, 'Record a reading (Experiments 3, 4)'],
      [<Kbd key="q">?</Kbd>, 'This sheet'],
    ],
  },
];
