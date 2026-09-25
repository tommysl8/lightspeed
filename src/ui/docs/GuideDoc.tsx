/**
 * The Lightspeed guide: how to explore, fly and understand what you see, with a chapter for
 * students on the lab. British spelling, SI units, symbols in italics (ital() for plain strings).
 */
import type { ReactNode } from 'react';
import { Vector3 } from 'three';
import { AU_KM, type BodyId } from '../../physics/constants';
import { controller } from '../../controls/cameraController';
import { setPaused, setWarp } from '../../sim/clock';
import { logEvent } from '../../lab/events';
import { JOURNEYS } from '../../content/journeys';
import { sectionNo, type ExplainerId } from '../../content/explainers';
import { useUI } from '../../state/ui';
import { goToBody } from '../navigation';
import { openExplainer } from '../explainerActions';
import { openJourneys, openPhysics, resetPreferences, showWelcome, startExperiment1, startTour } from '../onboarding';
import { KEY_GROUPS } from '../keys';
import { Kbd } from '../kit';
import { AberrationFigure, ScreenMap, WorkflowFigure } from './figures';
import { Callout, Chapter, Fig, H3, KeyTable, Lamp, Note, Ref, Steps, Try, type TocEntry } from './parts';

export const GUIDE_TOC: TocEntry[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'screen', title: 'The screen' },
  { id: 'looking', title: 'Looking around' },
  { id: 'time', title: 'Time' },
  { id: 'flying', title: 'Journeys and flights' },
  { id: 'seeing', title: 'What you are seeing' },
  { id: 'readings', title: 'Readings' },
  { id: 'lab', title: 'For students: the lab' },
  { id: 'controls', title: 'Keyboard and mouse' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
  { id: 'glossary', title: 'Glossary' },
];

// ─── Actions for the "Try it" buttons ────────────────────────────────────────────────────

/** Actions that move the camera or plan a trip wait until the ship is back. */
const docked =
  (fn: () => void) =>
  (): void => {
    if (useUI.getState().tripActive) {
      logEvent('ERR', 'Not available in flight: finish or abort the trip first.');
      return;
    }
    fn();
  };

const planFlight = (dest: BodyId, beta: number, fromEarth = false) =>
  docked(() => {
    // Flights leave from the camera, so start from home when the text assumes it.
    if (fromEarth) goToBody('earth');
    useUI.setState({ plannerOpen: true, plannerDest: dest, plannerDrive: 'cruise', plannerBeta: beta });
  });

const frameSystem = docked(() => {
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 60 * AU_KM, direction: new Vector3(0.2, 1, 0.35) });
});

/** Open the physics panel on one of its sections. */
const readPhysics = (id: ExplainerId) => () => openExplainer(id);

// ─── Typography helpers ──────────────────────────────────────────────────────────────────

/** Power of ten, typeset: 10ⁿ. */
const P10 = ({ n }: { n: ReactNode }) => (
  <>
    10<sup className="sup">{n}</sup>
  </>
);
const TryRow = ({ children }: { children: ReactNode }) => <div className="doc-tryrow">{children}</div>;

/** Set the symbols of a plain string (Greek letters, and v, c, t standing alone) in italics, as in print. */
function ital(s: string): ReactNode {
  return s.split(/([βγτφθχνσλ]′?|(?<![A-Za-z])[vct](?![A-Za-z]))/).map((part, k) => (k % 2 ? <i key={k}>{part}</i> : part));
}

/** "§3 The Lorentz factor", as a button that opens the section. */
const ReadPhysics = ({ id, title }: { id: ExplainerId; title: string }) => (
  <Try run={readPhysics(id)}>
    Read the physics: §{sectionNo(id)} {title}
  </Try>
);

// ─── Chapters ────────────────────────────────────────────────────────────────────────────

function Welcome() {
  return (
    <Chapter
      id="welcome"
      n={1}
      title="Welcome to Lightspeed"
      lead={
        <>
          Lightspeed is a space exploration tool with real physics. It shows the Solar System as it is at this moment, at true
          scale, and lets you fly through it at nearly the speed of light, with the sky and the clocks behaving exactly as
          relativity says they must.
        </>
      }
    >
      <H3>What you can do</H3>
      <ul>
        <li>
          <b>Explore.</b> Look around the real sky, jump from planet to planet, read about each one, and run time forwards to watch
          the orbits turn.
        </li>
        <li>
          <b>Fly.</b> Take a one-click journey, or plan your own flight to any body at any speed below <i>c</i>. Watch the stars
          crowd ahead of you and change colour, and compare your clock with Earth’s when you arrive.
        </li>
        <li>
          <b>Understand.</b> The numbers are always a click away in the instruments, and the physics panel explains what you are
          seeing in ten short sections. A note appears in the corner the first time each applies.
        </li>
        <li>
          <b>Measure.</b> For students, the lab holds five guided experiments, from timing a light pulse across the Solar System to
          measuring the acceleration of a relativistic rocket, each ending in a printable report (<Ref to="lab">Chapter 9</Ref>).
        </li>
      </ul>

      <H3>What is real, and what is not</H3>
      <p>
        Planet positions come from published ephemerides for the date shown at the top of the screen. Distances are never
        compressed, light travels at 299 792.458 km/s, and what you see in flight follows the transformation laws of special
        relativity exactly.
      </p>
      <p>
        Two things are idealised, and the program says so where it matters: the constant-speed drive starts and stops
        instantly, and gravity is ignored. A third drive, faster than light, is outright fiction, offered only for comparison.
        It is marked in red and none of its readings are recorded. The full list is under{' '}
        <Ref page="about" to="limitations">
          Model limitations
        </Ref>{' '}
        on the About page.
      </p>

      <H3>How to use this guide</H3>
      <p>
        Chapters 2 and 3 are all you need to get started. Chapters 4 to 8 explain each part of the program, chapter 9 is for
        students, and chapters 10 to 12 are for looking things up. Buttons marked <b>Try it</b> close the guide and do what the
        text describes. The simulation pauses while the guide is open.
      </p>
      <TryRow>
        <Try run={startTour}>Take the tour</Try>
        <Try run={openJourneys}>See the journeys</Try>
        <Try run={showWelcome}>Show the welcome screen</Try>
      </TryRow>

      <Note title="What you need">
        A desktop or laptop browser with WebGL 2: a recent Chrome, Edge, Firefox or Safari. A mouse or trackpad is easiest;
        phones work, with a simpler layout. Nothing is installed and there is no account. Anything you record stays in your
        browser (<Ref to="lab">Chapter 9</Ref>).
      </Note>
    </Chapter>
  );
}

function QuickStart() {
  return (
    <Chapter id="quick-start" n={2} title="Quick start" lead="Ten minutes, seven steps. Most have a button that sets them up for you.">
      <Steps>
        <li>
          <b>Look around.</b> Drag in the view to orbit Earth, and scroll to move in and out. The distance scale is logarithmic,
          so the same gesture takes you from the Moon’s orbit to the edge of the Solar System.
        </li>
        <li>
          <b>Visit a planet.</b> Press <Kbd>6</Kbd>, or click Saturn in the target bar at the bottom. The camera glides there, and
          a card in the corner tells you about it. Camera moves are for looking; they are not journeys.
          <TryRow>
            <Try run={docked(() => goToBody('saturn'))}>Go to Saturn</Try>
          </TryRow>
        </li>
        <li>
          <b>See the scale.</b> Zoom out until the planets’ orbits fit on screen. At true scale even Jupiter, seen from Earth,
          is smaller than a pixel, so rings and labels mark where the planets are. Press <Kbd>T</Kbd> to draw every body at
          least a few pixels across; the distances stay the same.
          <TryRow>
            <Try run={frameSystem}>Frame the Solar System</Try>
          </TryRow>
        </li>
        <li>
          <b>Speed up time.</b> Press <Kbd>]</Kbd> a few times, or choose <P10 n={4} /> in the time controls: one real second
          is then 2.8 simulated hours. Press <Kbd>N</Kbd> to return to the present.
          <TryRow>
            <Try
              run={() => {
                setWarp(10_000);
                setPaused(false);
              }}
            >
              Run time at <P10 n={4} />
            </Try>
          </TryRow>
        </li>
        <li>
          <b>Take a journey.</b> Press <b>Journeys</b> in the header. Each of the seven is one click, and says what to look for
          while it runs. Start with <i>Race sunlight to Earth</i> or <i>Earth to Saturn at 0.9c</i>.
          <TryRow>
            <Try run={openJourneys}>Open the journeys</Try>
          </TryRow>
        </li>
        <li>
          <b>Fly somewhere yourself.</b> Flights leave from wherever the camera is, so press <Kbd>H</Kbd> to return to Earth
          first. Then press <b>Plan flight</b> in the header (or <Kbd>G</Kbd>), choose a destination and a speed, and press{' '}
          <b>Execute</b>. The planner shows in advance how long the trip will take by the Sun’s clocks and by yours.
          <TryRow>
            <Try run={planFlight('saturn', 0.9, true)}>Plan a flight from Earth to Saturn at 0.9c</Try>
          </TryRow>
        </li>
        <li>
          <b>Look at the sky.</b> In flight, drag to look around. Stars crowd towards the direction of motion, turn blue ahead
          and red behind, and brighten ahead. Press <Kbd>X</Kbd> to split the screen: the left side shows the sky without
          relativity. The flight recorder along the bottom shows two clocks: <i>t</i>, kept in the Sun’s frame, and <i>τ</i>,
          kept on board. <b>Skip to arrival</b> jumps to the end, and the readings stay exact.
        </li>
      </Steps>
      <Note title="For students">
        The lab’s first experiment measures the speed of light in about 15 minutes, using nothing but the time controls.
        <TryRow>
          <Try run={startExperiment1}>Open Experiment 1</Try>
        </TryRow>
      </Note>
    </Chapter>
  );
}

const SCREEN_PARTS: [number, ReactNode, ReactNode][] = [
  [1, <>Physics <Kbd>K</Kbd></>, <>Opens the physics panel on the left (<Ref to="seeing">Chapter 7</Ref>).</>],
  [2, 'Epoch', <>The date and time being simulated, in UTC. Click it to change it (<Ref to="time">Chapter 5</Ref>).</>],
  [3, 'Journeys', <>Seven one-click trips and scenes (<Ref to="flying">Chapter 6</Ref>).</>],
  [4, <>Plan flight <Kbd>G</Kbd></>, <>Opens the flight planner (<Ref to="flying">Chapter 6</Ref>).</>],
  [5, 'View · Guide', 'Display options; this guide. About Lightspeed is under the name at the left, and in the View menu.'],
  [6, <>Instruments <Kbd>I</Kbd></>, 'Opens the instrument panel on the right.'],
  [7, 'Physics panel', <>What you are seeing, explained; the lab’s experiments; your notebook (<Ref to="seeing">Chapter 7</Ref>).</>],
  [
    8,
    'View',
    'The simulation. Top left: what the camera is doing and its range to the target. Top centre: status lamps. Top right: the card of the selected body. Bottom left: a scale bar.',
  ],
  [9, 'Instrument panel', <>Live readouts of speed, clocks, the target, optics and light-time (<Ref to="readings">Chapter 8</Ref>).</>],
  [10, 'Time controls', 'Pause, the simulation rate, and Now.'],
  [11, 'Target bar', 'Every body in the simulation. Click one to go there.'],
  [12, <>Keys <Kbd>?</Kbd></>, 'The keyboard and mouse on one sheet. On wide screens the status beside it says what the camera is doing.'],
];

function Screen() {
  return (
    <Chapter
      id="screen"
      n={3}
      title="The screen"
      lead="Everything on screen, numbered as in Figure 3.1. The two side panels start closed; open them when you want them."
    >
      <Fig n="3.1" wide caption="The Lightspeed screen with both side panels open. On a first visit only the header, the view and the footer are shown.">
        <ScreenMap />
      </Fig>
      <table className="doc-tbl doc-tbl-parts">
        <tbody>
          {SCREEN_PARTS.map(([n, name, text]) => (
            <tr key={n}>
              <td className="w-8">
                <Callout n={n} />
              </td>
              <td className="doc-tbl-k">{name}</td>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H3>Panels</H3>
      <p>
        Drag the inner edge of a panel to resize it, or double-click the edge to reset it. From the keyboard, Tab to the edge and
        use the arrow keys. Close a panel with its × or with the button that opened it. On screens narrower than 900 pixels the
        panels open over the view, one at a time, and get out of the way when you plan a flight.
      </p>

      <H3>Status lamps</H3>
      <p>Lamps along the top of the view light up when something changes what you see.</p>
      <KeyTable
        rows={[
          [<Lamp tone="white">Paused</Lamp>, 'The simulation clock is stopped.'],
          [
            <Lamp tone="amber">
              Rate <P10 n={3} />
            </Lamp>,
            'Time runs faster than real time. The view also gets an amber border.',
          ],
          [<Lamp tone="amber">Free flight</Lamp>, <>You are flying the camera by hand (<Ref to="looking">Chapter 4</Ref>).</>],
          [
            <Lamp tone="cyan">Relativistic optics</Lamp>,
            <>
              The view shows aberration and Doppler shift; in split screen the lamp reads <i>Split optics</i> (
              <Ref to="seeing">Chapter 7</Ref>).
            </>,
          ],
          [<Lamp tone="cyan">Light-time corr.</Lamp>, 'Bodies are drawn where they were when the light now arriving left them.'],
          [<Lamp tone="cyan">Pulse in flight</Lamp>, 'A light pulse is still spreading.'],
          [<Lamp tone="red">Non-physical state</Lamp>, 'The fictional faster-than-light drive is engaged.'],
        ]}
      />

      <H3>Messages and notes</H3>
      <p>
        Events, such as pulse detections, readings, arrivals and errors, appear for about 14 seconds in the top-left corner of
        the view. The first time something new happens (passing 0.1<i>c</i>, say), a short note in the top-right corner says in
        a sentence what is going on and offers the matching section of the physics. Click <b>Read more</b> to open it, or × to
        dismiss it.
      </p>
    </Chapter>
  );
}

function Looking() {
  return (
    <Chapter
      id="looking"
      n={4}
      title="Looking around"
      lead="The camera normally orbits one body. It can go anywhere, at any distance, without that counting as a journey."
    >
      <H3>Orbiting a body</H3>
      <KeyTable
        rows={[
          ['Drag', 'Orbit around the target'],
          [
            <>
              Scroll, <Kbd>+</Kbd> <Kbd>−</Kbd>
            </>,
            'Move in and out (the scale is logarithmic)',
          ],
          ['Arrow keys', 'Orbit'],
          [<Kbd key="h">H</Kbd>, 'Return to Earth'],
        ]}
      />

      <H3>Choosing a body</H3>
      <p>
        Click a body or its label to <i>select</i> it. Amber brackets mark it, its label shows its range and light-time, and a
        card in the top-right corner of the view says what it is, how far away it is, how long its light took to reach you, and
        three things worth knowing about it. <b>Go there</b> takes the camera to it, <b>Fly here</b> plans a flight, and{' '}
        <b>Numbers</b> opens its full data sheet in the instruments. To take the camera there directly, double-click the body,
        click its name in the target bar, or press its key: <Kbd>0</Kbd> for the Sun, <Kbd>1</Kbd> to <Kbd>9</Kbd> for Mercury
        to Pluto, <Kbd>M</Kbd> for the Moon and <Kbd>V</Kbd> for Voyager 1. Proxima Centauri, 4.2 light-years away, is at the
        end of the target bar. <Kbd>Esc</Kbd> clears the selection.
      </p>
      <Note title="The camera is not a spaceship">
        Camera moves ignore physics: the camera glides to its target in a few seconds (never more than six), whatever the
        distance. To travel physically, with clocks that obey relativity, take a journey or plan a flight (
        <Ref to="flying">Chapter 6</Ref>).
      </Note>

      <H3>True scale and enlarged</H3>
      <p>
        At true scale the Solar System is almost entirely empty. Seen from Earth, Jupiter is less than a minute of arc across,
        smaller than one pixel of your screen, while the Sun is half a degree. Labels and rings therefore mark where the bodies
        are. <b>View › Body size › Enlarged</b> (<Kbd>T</Kbd>) draws every body at least 8 pixels across without moving it:
        useful for finding planets from far away, misleading about their size.
      </p>
      <TryRow>
        <Try run={() => useUI.getState().setSizeMode('visible')}>Draw bodies enlarged</Try>
      </TryRow>

      <H3>Display layers</H3>
      <p>These are all in the View menu.</p>
      <KeyTable
        rows={[
          [<>Orbits <Kbd>O</Kbd></>, 'Each body’s orbit, computed from its current position and velocity.'],
          [<>Labels <Kbd>L</Kbd></>, 'Names, and the range and light-time of the selected body.'],
          [<>Small bodies <Kbd>B</Kbd></>, '31 930 asteroids, Trojans and trans-Neptunian objects from the JPL Small-Body Database.'],
          [<>Ecliptic grid <Kbd>J</Kbd></>, 'Lines of ecliptic longitude and latitude every 15°, labelled, with an axis triad in the corner.'],
          [<>Readouts over the view <Kbd>U</Kbd></>, <>The camera readout and scale bar; in flight also the reticle and the apex markers (<Ref to="readings">Chapter 8</Ref>).</>],
          ['Light-time correction', 'Draw each body where it was when the light now reaching you left it.'],
        ]}
      />

      <H3>Free flight</H3>
      <p>
        Press <Kbd>F</Kbd> to fly the camera by hand. The pointer is captured so that the mouse steers; <Kbd>Esc</Kbd> releases
        it and ends free flight.
      </p>
      <KeyTable
        rows={[
          ['Mouse', 'Look'],
          [
            <>
              <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd>
            </>,
            'Forward, left, back, right',
          ],
          [
            <>
              <Kbd>Space</Kbd> or <Kbd>R</Kbd> · <Kbd>C</Kbd>
            </>,
            'Up · down',
          ],
          [
            <>
              <Kbd>Q</Kbd> <Kbd>E</Kbd>
            </>,
            'Roll',
          ],
          ['Scroll', 'Throttle, from 0.3 m/s to 0.999 99c'],
        ]}
      />
      <p>
        Free flight is for sightseeing. The throttle is shown in the status bar, and the relativistic optics switch on above
        0.01<i>c</i>, but only planned flights are recorded.
      </p>
    </Chapter>
  );
}

function Time() {
  return (
    <Chapter
      id="time"
      n={5}
      title="Time"
      lead="The simulation starts at the present moment and runs in real time. You can stop it, speed it up a million-fold, or jump to another date."
    >
      <H3>The epoch</H3>
      <p>
        The header shows the <i>epoch</i>: the instant being simulated, in UTC, followed on wide screens by the Julian Date.
        Click it to type any instant between 1981 and 2199, or to load the date of the next opposition of Mars, Jupiter or
        Saturn, when that planet stands opposite the Sun in Earth’s sky and is near its closest. Press <b>Set epoch</b> (or{' '}
        <Kbd>Enter</Kbd>) to go there: every body moves at once, the chronometers are zeroed and any light pulses still in
        flight are discarded.
      </p>

      <H3>Rate</H3>
      <p>
        The rate is how much simulated time passes per real second, from <P10 n={0} /> (real time) to <P10 n={6} />. Choose it
        in the time controls, or step with <Kbd>[</Kbd> and <Kbd>]</Kbd> (or <Kbd>,</Kbd> and <Kbd>.</Kbd>). Point at a rate button to
        see it in everyday units (on very wide screens a readout beside the buttons shows it too), and an amber border round
        the view reminds you that time is running fast. Journeys set the rate for you.
      </p>
      <table className="doc-tbl doc-tbl-narrow">
        <thead>
          <tr>
            <th>Rate</th>
            <th>One real second is</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              [0, '1 s'],
              [1, '10 s'],
              [2, '100 s'],
              [3, '16.7 min'],
              [4, '2.78 h'],
              [5, '27.8 h'],
              [6, '11.6 d'],
            ] as const
          ).map(([n, t]) => (
            <tr key={n}>
              <td className="doc-tbl-k">
                <P10 n={n} />
              </td>
              <td className="mono">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H3>Pause and Now</H3>
      <p>
        <Kbd>Space</Kbd> or <Kbd>P</Kbd> pauses and resumes (in free flight only <Kbd>P</Kbd>, since Space is up). <b>Now</b>{' '}
        (<Kbd>N</Kbd>) returns to the present at real time and
        zeroes the chronometers. It is unavailable during a flight: a traveller’s clock cannot be wound back.
      </p>

      <H3>Two clocks</H3>
      <p>
        Instruments › B holds two clocks. <i>t</i> is <i>coordinate time</i>, kept by clocks at rest relative to the Sun. <i>τ</i>{' '}
        is <i>proper time</i>, kept by a clock travelling with you. Even while you orbit Earth, <i>τ</i> falls behind <i>t</i> by
        about 5 parts in <P10 n={9} />, because Earth carries you round the Sun at 30 km/s. In flight the difference grows to
        minutes, hours or years. <b>Zero</b> sets both clocks to zero.
      </p>
    </Chapter>
  );
}

function Flying() {
  return (
    <Chapter
      id="flying"
      n={6}
      title="Journeys and flights"
      lead="A flight is a physical journey: a straight line through the Solar System at a speed you choose, with clocks that obey special relativity. Journeys are flights and scenes set up for you."
    >
      <H3>Journeys</H3>
      <p>
        <b>Journeys</b> in the header lists seven set pieces. Each is one click: the camera is placed, the clock is set so that
        a trip takes about half a minute of real time, and a line says what to look for. Flights leave from Earth and show
        their predicted times, by Earth’s clocks and by yours, before you go.
      </p>
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>Journey</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          {JOURNEYS.map((j) => (
            <tr key={j.id}>
              <td className="doc-tbl-k">{j.title}</td>
              <td>{j.sub}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TryRow>
        <Try run={openJourneys}>Open the journeys</Try>
      </TryRow>

      <H3>Planning a flight</H3>
      <p>
        Press <b>Plan flight</b> in the header (or <Kbd>G</Kbd>), or <b>Fly here</b> on a body’s card, and choose a destination.
        You leave from wherever the camera is, and the planner aims at the point where the destination will be when you arrive,
        not where it is now.
      </p>
      <TryRow>
        <Try run={planFlight('mars', 0.5)}>Plan a flight to Mars at 0.5c</Try>
      </TryRow>

      <H3>Three drives</H3>
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>Drive</th>
            <th>What it does</th>
            <th>Logged by</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="doc-tbl-k">Constant speed</td>
            <td>
              Jumps instantly to the chosen speed, coasts, and stops instantly on arrival. Idealised, but the clock readings
              between the jumps are exact.
            </td>
            <td>Experiment 2</td>
          </tr>
          <tr>
            <td className="doc-tbl-k">1 g flip-and-burn</td>
            <td>
              Accelerates at one Earth gravity, turns round halfway and decelerates, arriving at rest. A real rocket could in
              principle fly this.
            </td>
            <td>Experiment 5</td>
          </tr>
          <tr>
            <td className="doc-tbl-k !text-hazard">Superluminal (fiction)</td>
            <td>
              Faster than light, for comparison only. The planner and the view are hatched in red, proper time is undefined, and
              nothing is recorded.
            </td>
            <td>Nothing</td>
          </tr>
        </tbody>
      </table>

      <H3>Choosing a speed</H3>
      <p>
        Speeds are given as <i>β</i> = <i>v</i>/<i>c</i>. Type a value (0.9, or 0.999 99), drag the slider, or use a preset:
        Voyager 1 (16.9 km/s), the Parker Solar Probe (192 km/s), or 0.1 to 0.9999. The slider is spaced so that 0.9, 0.99 and
        0.999 are equally far apart, because most of relativity happens in the last few nines.
      </p>

      <H3>Predictions</H3>
      <p>
        Before you launch, the planner lists what the flight will involve: the path length; the time Δ<i>t</i> it takes by the
        Sun’s clocks; the time Δ<i>τ</i> that will pass on board; their difference; for the constant-speed drive, the length of
        the path as measured on the ship; and how long light would take over the same path. For 1 g flights it adds the peak speed and the mass ratio a
        perfect photon rocket would need. The worldline preview plots the trip on a spacetime diagram in which light travels at
        45°.
      </p>

      <H3>In flight</H3>
      <p>
        The flight recorder along the bottom of the view shows your progress, both clocks, and the distance left, measured in
        the Sun’s frame and in yours. Drag to look around, or use <b>Ahead</b> and <b>Astern</b>. <b>Skip to arrival</b>{' '}
        advances the clock to the end of the trip, and the readings stay exact. <b>Abort</b> stops the ship where it is
        (instantly, which no real ship could do). You can still select bodies and read their data, but the camera stays with
        the ship.
      </p>
      <p>
        On arrival a report sums up the flight (Δ<i>t</i>, Δ<i>τ</i> and their ratio). For students, every constant-speed and
        1 g flight is also kept as a reading in the lab.
      </p>
      <Note title="Faster than light" tone="hazard">
        Nothing with mass can reach <i>c</i>: the energy needed grows without limit as <i>β</i> approaches 1. The superluminal
        drive exists to show why. During it the Lorentz factor is imaginary, proper time has no meaning, and some observers would
        reckon that you arrived before you left. Physics sections 8 and 9 explain.
      </Note>
    </Chapter>
  );
}

function Seeing() {
  return (
    <Chapter
      id="seeing"
      n={7}
      title="What you are seeing"
      lead="The strange things that happen near the speed of light, in plain words. The physics panel (Physics, or K) has the same ten topics with their equations and further reading."
    >
      <H3>Light takes time</H3>
      <p>
        Nothing you see is current. Sunlight is 8 minutes 19 seconds old when it reaches Earth, 43 minutes old at Jupiter, and
        about a day old at Voyager 1. The instruments’ light-time section says how old your view of Earth is from wherever you
        are, and <b>Light-time correction</b> in the View menu draws every body where it was when its light left it.
      </p>
      <TryRow>
        <ReadPhysics id="light-time" title="Light-travel time" />
      </TryRow>

      <H3>The scale of things</H3>
      <p>
        Shrink the Sun to a ball one metre across and Earth becomes a 9 mm bead 107 m away; Neptune is 3 km off and the nearest
        star 29 000 km. That is why the planets are specks at true scale, and why the target bar exists.
      </p>
      <TryRow>
        <ReadPhysics id="scale" title="The scale of the Solar System" />
      </TryRow>

      <H3>Past a tenth of the speed of light</H3>
      <p>
        Below about 0.1<i>c</i> relativity is invisible. Above it one number takes over: the Lorentz factor <i>γ</i>, which is
        1.15 at 0.5<i>c</i>, 2.3 at 0.9<i>c</i>, 7.1 at 0.99<i>c</i> and 22 at 0.999<i>c</i>. Everything below scales with it.
      </p>
      <TryRow>
        <ReadPhysics id="lorentz" title="The Lorentz factor" />
      </TryRow>

      <H3>Your clock runs slow</H3>
      <p>
        On board, time passes <i>γ</i> times more slowly than for Earth. The flight recorder shows both clocks side by side: on
        the Saturn journey at 0.9<i>c</i>, Earth counts about an hour and a half while you count under forty minutes. To Proxima
        Centauri at a steady 1 g, 5.9 years pass on Earth and 3.5 on board. That is the twin paradox, and it is real.
      </p>
      <TryRow>
        <ReadPhysics id="time-dilation" title="Time dilation and the twin paradox" />
      </TryRow>

      <H3>Distances shrink</H3>
      <p>
        Measured from the ship, the road ahead is <i>γ</i> times shorter. The planner lists the path length in both frames, and
        the recorder shows the distance still to go in both.
      </p>
      <TryRow>
        <ReadPhysics id="length-contraction" title="Length contraction" />
      </TryRow>

      <H3>The sky crowds ahead</H3>
      <p>
        Your motion tilts the light coming in, the way rain seems to come from ahead when you run through it. Every direction
        except dead astern shifts towards the <i>apex</i>, the point you are heading for. At 0.9<i>c</i> the whole forward half
        of the sky fits within 26° of the apex (Figure 7.1); at 0.999<i>c</i>, within 2.6°. Press <Kbd>X</Kbd> for a split
        screen with the undistorted sky on the left.
      </p>
      <Fig
        n="7.1"
        caption={
          <>
            Twenty-four stars spaced every 15° round a circle, seen at rest (left) and from a ship moving towards the top at{' '}
            <i>β</i> = 0.9 (right). Aberration gathers the forward half of the sky within arccos <i>β</i> = 25.8° of the apex.
            Colour shows the Doppler factor, blue for light shifted to higher frequency and red for lower; larger dots are
            brighter.
          </>
        }
      >
        <AberrationFigure beta={0.9} />
      </Fig>
      <TryRow>
        <ReadPhysics id="aberration" title="Aberration of light" />
        <Try run={() => useUI.setState({ relMode: 'split' })}>Split the view (for your next flight)</Try>
      </TryRow>

      <H3>Colours shift and the view brightens</H3>
      <p>
        Light from ahead is squeezed to higher frequencies and light from behind is stretched. The Doppler factor straight ahead
        is √((1 + <i>β</i>)/(1 − <i>β</i>)): 4.4 at 0.9<i>c</i>, so stars ahead turn blue and the Sun, if it lay dead ahead, would
        look like a 25 000 K star. Light from ahead is also concentrated and brightened, and the sky behind fades: that is
        beaming. To see the crowding on its own, turn off <i>Doppler shift and beaming</i> in Instruments › D.
      </p>
      <p>
        The View menu offers three optics models: <b>Relativistic</b>; <b>Classical</b>, which draws the sky as it is in the
        Sun’s frame, without aberration or Doppler shift; and <b>Split</b> (<Kbd>X</Kbd>), with classical on the left and
        relativistic on the right of a divider you can drag. <Kbd>Z</Kbd> switches between classical and relativistic. All
        three look the same at rest: the difference appears in flight, above 0.01<i>c</i>.
      </p>
      <TryRow>
        <ReadPhysics id="doppler" title="Doppler shift and relativistic beaming" />
      </TryRow>

      <H3>Why not faster?</H3>
      <p>
        Each extra nine in your speed costs far more energy than the last, and the speed of light stays out of reach for anything
        with mass. A rocket pushing at 1 g feels perfectly normal on board and yet never quite gets there. The fictional drive
        beyond <i>c</i> is included to show what would break: causality itself.
      </p>
      <TryRow>
        <ReadPhysics id="mass-limit" title="Why no massive body reaches c" />
        <ReadPhysics id="rocket" title="The relativistic rocket" />
      </TryRow>
    </Chapter>
  );
}

function Readings() {
  return (
    <Chapter
      id="readings"
      n={8}
      title="Readings"
      lead="The card tells you about a body; the instrument panel (I) gives every number, several times a second. Its sections are lettered; click a heading to fold it."
    >
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>Section</th>
            <th>What it shows</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['A', 'Observer', 'Your distance from the Sun and your direction; speed v and β = v/c; the Lorentz factor γ; rapidity; how fast your clock runs; kinetic energy per kilogram.'],
              ['B', 'Chronometers', 'Coordinate time t, your proper time τ, their difference and their ratio (Chapter 5).'],
              ['C', 'Target', 'For the selected body: range, light-time, range rate, angular size and brightness; in motion, its angle from the apex in both frames and its Doppler factor; physical data and a short description. Buttons slew the camera, plan a flight, or emit a light pulse from the body.'],
              ['D', 'Relativistic optics', 'Whether the relativistic view is active; the Doppler factor ahead, abeam and astern; the angle within which the forward half of the sky appears; the colour temperature of the Sun if it lay dead ahead; the reticle’s spectrometer reading.'],
              ['E', 'Light-time', 'How old your view of Earth is, how long a signal to Earth would take, and how long ago the sunlight reaching you left the Sun.'],
              ['F', 'Spacetime diagram', 'In flight only: your worldline, with ticks of ship time and your current line of simultaneity.'],
              ['G', 'Ephemeris', 'Every body’s distance from the Sun and from you, and its light-time. Click a row to select the body.'],
              ['H', 'Strip-chart recorder', 'The last 30 seconds of β, γ, the Doppler factor ahead, the clock rate, or range.'],
            ] as const
          ).map(([k, name, text]) => (
            <tr key={k}>
              <td className="doc-tbl-k whitespace-nowrap">
                <span className="mono mr-2 text-accent">{k}</span>
                {name}
              </td>
              <td>{ital(text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TryRow>
        <Try run={() => useUI.setState({ rightOpen: true })}>Open the instruments</Try>
      </TryRow>

      <H3>In the view</H3>
      <KeyTable
        rows={[
          ['Body card', 'Top right, for the selected body: what it is, its range and light-time, three facts, and buttons to go there, fly there or open its numbers. × closes it; the next selection brings it back.'],
          ['Reticle', <>In motion, marks the centre of the view. Its spectrometer reads the angle <i>θ</i>′ from the apex and the Doppler factor <i>D</i> there.</>],
          ['APEX, ANTAPEX', 'The directions you are heading towards and away from.'],
          ['Scale bar', 'A length at the distance of the body named beside it. In the relativistic view it reads “scale undefined”, since the scale varies across the sky.'],
          ['Axis triad', 'The ecliptic axes, X towards the March equinox and Z towards ecliptic north. Shown with the grid.'],
          ['Camera readout', 'What the camera is doing and its range to the target.'],
        ]}
      />
      <p>
        <b>View › Readouts over the view</b> (<Kbd>U</Kbd>) shows or hides the reticle, markers, scale bar and camera readout.
      </p>
    </Chapter>
  );
}

const EXPERIMENT_ROWS: [number, string, ReactNode, string][] = [
  [1, 'Time of flight of a light pulse', 'The speed of light, from distance against time of flight', '15 min'],
  [2, 'Time dilation on inertial trips', <>How ship time depends on speed: Δ<i>τ</i>/Δ<i>t</i> = (1 − <i>β</i><sup className="sup">2</sup>)<sup className="sup"><i>p</i></sup></>, '15 min'],
  [3, 'The relativistic Doppler factor', 'Your own speed, from the Doppler factor at different angles', '20 min'],
  [4, 'Aberration of light', 'Your speed again, from where bodies appear to be', '20 min'],
  [5, 'Constant proper acceleration', 'The acceleration of a 1 g rocket, from its speed and its clock', '10 min'],
];

function Lab() {
  return (
    <Chapter
      id="lab"
      n={9}
      title="For students: the lab"
      lead="The lab turns the simulator into apparatus. Five experiments are laid out like a university lab script, and the program does the bookkeeping. Anyone else can skip this chapter."
    >
      <H3>Opening the lab</H3>
      <p>
        Press <b>Physics</b> in the header, or <Kbd>K</Kbd>, and choose the <b>Experiments</b> tab. The panel’s other tabs are{' '}
        <b>Reference</b>, the physics behind what you see (<Ref to="seeing">Chapter 7</Ref>), and <b>Notebook</b>, where your
        readings are kept.
      </p>
      <TryRow>
        <Try run={() => openPhysics('experiments')}>Open the experiments</Try>
      </TryRow>

      <H3>The experiments</H3>
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>No.</th>
            <th>Experiment</th>
            <th>You measure</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {EXPERIMENT_ROWS.map(([n, title, what, time]) => (
            <tr key={n}>
              <td className="mono text-accent">{n}</td>
              <td className="doc-tbl-k">{title}</td>
              <td>{what}</td>
              <td className="mono whitespace-nowrap">{time}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <b>Experiment 1</b> fires a light pulse from Earth and watches it spread through the Solar System as a growing circle;
        each body it reaches logs the time of flight, and a straight-line fit of distance against time gives <i>c</i>, as Ole
        Rømer first did in 1676 from the eclipses of Jupiter’s moon Io. <b>Experiment 2</b> flies at five or more constant speeds
        and compares the ship’s clock with the Sun’s on each arrival; the logarithms give a straight line whose slope is ½.{' '}
        <b>Experiment 3</b> points the reticle at set angles from the apex in flight and records the Doppler factor; 1/<i>D</i> is
        a straight line in cos <i>θ</i>′ whose slope and intercept give your speed. <b>Experiment 4</b> records where bodies
        appear against where the ephemeris puts them, and an optional run repeats James Bradley’s discovery of 1725–29 from
        Earth’s own 20 arcsecond shift. <b>Experiment 5</b> samples a 1 g flight to Proxima Centauri: the rapidity grows in
        proportion to proper time, and <i>c</i> times the slope is the acceleration felt on board.
      </p>
      <TryRow>
        <Try run={startExperiment1}>Open Experiment 1</Try>
      </TryRow>

      <H3>Anatomy of an experiment</H3>
      <p>
        Every experiment page has the same eight sections: Aim, Background (the theory, with numbered equations), Apparatus,
        Procedure, Observations, Analysis, Questions and Conclusion. The first three are reading. Figure 9.1 shows how the rest
        fit together.
      </p>
      <Fig n="9.1" caption="Working through an experiment, from the procedure to the report.">
        <WorkflowFigure />
      </Fig>

      <H3>Following the procedure</H3>
      <p>
        Procedure steps tick themselves off when the simulation reaches the state they ask for: the right rate, a pulse emitted,
        five speeds recorded. Many steps have a button that sets the apparatus up for you. The small boxes beside each
        experiment in the list show how far you have got, and the <b>Next step</b> box at the top of each experiment shows the
        one you are on.
      </p>

      <H3>Recording data</H3>
      <p>
        Experiments 1, 2 and 5 record by themselves: every detector that registers a pulse (1), every constant-speed flight that
        arrives (2), and samples along every 1 g flight (5). Experiments 3 and 4 need you to take readings: open the experiment,
        set up the view as its procedure describes, and press <b>Record</b> or <Kbd>R</Kbd>. If a reading cannot be taken, the
        message in the corner of the view says why. Readings go into the data table under Observations; point at a row and click
        × to delete it, or <b>Clear</b> to delete them all.
      </p>

      <H3>Uncertainty and fits</H3>
      <p>
        By default the instruments are perfect. Tick <i>Simulated instrument uncertainty</i> to add random errors of a stated,
        realistic size to new readings; the table then shows ± values. The analysis fits a straight line (or a line through the
        origin) by least squares and gives each parameter with its standard error. With uncertainties on, the fit is weighted by
        them and also reports the reduced chi-squared, <i>χ</i>
        <sup className="sup">2</sup>/<i>ν</i>: near 1 means the scatter of your points matches their error bars, and much larger
        means that the model or the error bars are wrong. Point at a data point on a graph to read its values.
      </p>

      <H3>Writing up</H3>
      <p>
        Type your answers to the questions, and your conclusion, in the boxes; they are saved as you type. <b>Prepare lab
        report</b> lays out the whole experiment as a printable A4 document: aim, theory, method, the data table, both figures,
        the fitted results and your answers. Add your name, then print it, or choose <i>Save as PDF</i> in the print dialog.
      </p>

      <H3>Your data</H3>
      <p>
        The notebook lives in this browser’s storage. It survives a reload but not clearing your browsing data, and it does not
        follow you to another computer. The Notebook tab exports each experiment as CSV (in fixed units: s, km, km/s and
        degrees, named in each column header, with a 1<i>σ</i> column for each when uncertainty was on), all readings with your
        written answers as JSON, and the session’s event log as text.
      </p>
      <TryRow>
        <Try run={() => openPhysics('notebook')}>Open the notebook</Try>
      </TryRow>
    </Chapter>
  );
}

function Controls() {
  return (
    <Chapter
      id="controls"
      n={10}
      title="Keyboard and mouse"
      lead="Single-key shortcuts work whenever you are not typing in a field. Press ? at any time for this list on one sheet. If the keys clash with assistive software, turn them off in View › Keyboard shortcuts."
    >
      <div className="doc-keygrid">
        {KEY_GROUPS.map((g) => (
          <div key={g.title}>
            <h4>{g.title}</h4>
            <KeyTable rows={g.rows} />
          </div>
        ))}
      </div>
      <H3>Using the keyboard alone</H3>
      <p>
        <Kbd>Tab</Kbd> moves between controls. Within a set of options, such as the rate buttons, the arrow keys move the
        choice. <Kbd>Esc</Kbd> closes menus, dialogs and this guide. A panel edge takes focus too: the arrow keys resize it, and{' '}
        <Kbd>Home</Kbd> resets it.
      </p>
    </Chapter>
  );
}

function Troubleshooting() {
  const faq: [string, ReactNode][] = [
    [
      'The view is black',
      <>
        Lightspeed needs WebGL 2. Check that hardware acceleration is on in your browser’s settings, update the browser, and
        reload. On a laptop, plugging in the charger lets the graphics chip run at full speed.
      </>,
    ],
    [
      'It is slow or jerky',
      <>
        The program lowers its resolution by itself to keep the frame rate up. It also helps to close other tabs, turn off
        small bodies (<Kbd>B</Kbd>), and use classical optics in flight: the relativistic view draws the scene six times per
        frame, once for each face of a cube. <b>View › Performance readout</b> shows the frame rate.
      </>,
    ],
    [
      'I can’t see any planets',
      <>
        At true scale they are smaller than a pixel. Look for their labels, or press <Kbd>T</Kbd> for enlarged bodies. If the
        labels are off, press <Kbd>L</Kbd>.
      </>,
    ],
    [
      'I’m lost',
      <>
        <Kbd>H</Kbd> takes the camera back to Earth, and <Kbd>N</Kbd> sets the clock back to the present. <Kbd>Esc</Kbd> leaves
        free flight. A journey always starts from a known place.
      </>,
    ],
    [
      'A journey will not start',
      <>
        Journeys wait until you are not in flight: finish the current trip with <b>Skip to arrival</b>, or <b>Abort</b> it, on
        the flight recorder.
      </>,
    ],
    [
      'A procedure step won’t tick',
      <>
        Each step waits for a particular state, so read it again. Step 2 of Experiment 1, for example, needs a rate of{' '}
        <P10 n={2} /> or more with the clock running. Many steps have a button that does it for you, and the <b>Next step</b>{' '}
        box at the top of each experiment shows the one you are on.
      </>,
    ],
    [
      'Pressing R does nothing',
      <>
        Readings by hand belong to Experiments 3 and 4, so one of them must be open under Physics › Experiments. Experiment 3
        needs you to be moving, which means in flight. Experiment 4 needs a selected body and a moving observer: a flight, or an
        orbit round a planet, which carries you with it (not the Sun, which is at rest). In free flight <Kbd>R</Kbd> moves you
        up instead, and it does nothing while keyboard shortcuts are off; use the <b>Record</b> button. The message in the
        top-left corner of the view says what is missing.
      </>,
    ],
    [
      'Printing a lab report',
      <>
        Use <b>Prepare lab report</b>, then <b>Print / Save as PDF</b>. The report is laid out for A4; in the print dialog, turn
        off the browser’s headers and footers for a clean page.
      </>,
    ],
    [
      'Where is my data?',
      <>
        In this browser’s local storage (<Ref to="lab">Chapter 9</Ref>). Export it before clearing your browsing data or moving
        to another computer.
      </>,
    ],
  ];
  return (
    <Chapter id="troubleshooting" n={11} title="Troubleshooting" lead="Common problems and what to do about them.">
      {faq.map(([q, a]) => (
        <div key={q}>
          <H3>{q}</H3>
          <p>{a}</p>
        </div>
      ))}
      <H3>Starting again</H3>
      <p>
        The button below resets the layout, the display settings and the welcome screen, and reloads the page. It keeps your
        notebook; to delete readings as well, use <b>Clear notebook</b> in the Notebook tab.
      </p>
      <TryRow>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('Reset the layout and preferences and reload? Your notebook is kept.')) resetPreferences();
          }}
        >
          Reset layout and preferences
        </button>
      </TryRow>
    </Chapter>
  );
}

const GLOSSARY: [ReactNode, ReactNode][] = [
  ['Aberration', 'The change in the apparent direction of light caused by the observer’s motion.'],
  ['Apex, antapex', 'The points on the sky towards which, and away from which, the observer is moving.'],
  ['Astronomical unit (au)', 'A defined length, 149 597 870.7 km, close to the mean distance from Earth to the Sun: about 8 minutes 19 seconds of light-time.'],
  [<><i>β</i> (beta)</>, <>Speed as a fraction of the speed of light, <i>v</i>/<i>c</i>.</>],
  ['Beaming', 'The brightening of light from ahead, and dimming of light from behind, seen by a fast observer.'],
  [<>Coordinate time, <i>t</i></>, 'Time kept by clocks at rest in the Sun’s frame S.'],
  [<>Doppler factor, <i>D</i></>, <>The ratio of observed to emitted frequency. <i>D</i> greater than 1 is a blueshift.</>],
  ['Ecliptic', 'The plane of Earth’s orbit, and the circle it traces on the sky; the reference plane for the coordinates used here.'],
  ['Epoch', 'The instant being simulated.'],
  ['Frame, S and S′', 'S is the rest frame of the Sun; S′ is the frame moving with the observer.'],
  [<><i>γ</i> (gamma), Lorentz factor</>, <>1/√(1 − <i>β</i><sup className="sup">2</sup>): the factor by which moving clocks run slow and moving lengths contract.</>],
  ['Journey', 'One of the seven set pieces under Journeys: a flight from Earth, or a scene with the clock set, with a line on what to look for.'],
  ['Light-time', 'How long light takes to cover a given distance.'],
  ['Light-year (ly)', <>The distance light travels in a Julian year, 9.46 × 10<sup className="sup">12</sup> km.</>],
  ['Opposition', 'The time when a planet stands opposite the Sun in Earth’s sky, near its closest to Earth.'],
  [<>Proper time, <i>τ</i> (tau)</>, 'Time kept by a clock travelling with the observer.'],
  [<>Rapidity, <i>φ</i> (phi)</>, <>artanh <i>β</i>: a measure of speed that adds simply for successive boosts along a line, and grows in proportion to proper time at constant acceleration.</>],
  [<>Reduced chi-squared, <i>χ</i><sup className="sup">2</sup>/<i>ν</i></>, 'The sum of squared residuals, each divided by its variance, over the degrees of freedom. About 1 for a good fit with honest error bars.'],
  ['Simulation rate', 'Simulated seconds per real second.'],
  ['True scale', 'Every body drawn at its real size and at its real distance.'],
  ['Worldline', 'The path of an object through spacetime.'],
];

function Glossary() {
  return (
    <Chapter id="glossary" n={12} title="Glossary">
      <dl className="doc-dl">
        {GLOSSARY.map(([t, d], i) => (
          <div key={i}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
      <p className="doc-end">
        Questions or corrections? See <Ref page="about" to="author">the About page</Ref> for how to get in touch.
      </p>
    </Chapter>
  );
}

export default function GuideDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Guide</div>
        <h1>Exploring with Lightspeed</h1>
        <p>How to look around, fly, and understand what you see. Chapter 9 is for students using the lab.</p>
      </header>
      <Welcome />
      <QuickStart />
      <Screen />
      <Looking />
      <Time />
      <Flying />
      <Seeing />
      <Readings />
      <Lab />
      <Controls />
      <Troubleshooting />
      <Glossary />
    </>
  );
}
