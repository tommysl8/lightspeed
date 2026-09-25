/**
 * The Lightspeed manual: how to use the program, from a first look to the experiments.
 * British spelling, SI units, symbols in italics (ital() for plain strings).
 */
import type { ReactNode } from 'react';
import { Vector3 } from 'three';
import { AU_KM, type BodyId } from '../../physics/constants';
import { controller } from '../../controls/cameraController';
import { setPaused, setWarp } from '../../sim/clock';
import { logEvent } from '../../lab/events';
import { useUI } from '../../state/ui';
import { goToBody } from '../navigation';
import { resetPreferences, showWelcome, startExperiment1, startTour } from '../onboarding';
import { Kbd } from '../kit';
import { AberrationFigure, ScreenMap, WorkflowFigure } from './figures';
import { Callout, Chapter, Fig, H3, KeyTable, Lamp, Note, Ref, Steps, Try, type TocEntry } from './parts';

export const MANUAL_TOC: TocEntry[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'screen', title: 'The screen' },
  { id: 'looking', title: 'Looking around' },
  { id: 'time', title: 'Time' },
  { id: 'flying', title: 'Flying' },
  { id: 'lab', title: 'The lab' },
  { id: 'experiments', title: 'The experiments' },
  { id: 'instruments', title: 'Instruments' },
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

const openLab = (tab: 'experiments' | 'notebook' | 'reference') => () => useUI.setState({ leftOpen: true, manualTab: tab });

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

// ─── Chapters ────────────────────────────────────────────────────────────────────────────

function Welcome() {
  return (
    <Chapter
      id="welcome"
      n={1}
      title="Welcome to Lightspeed"
      lead={
        <>
          Lightspeed is a virtual laboratory for special relativity. It shows the Solar System as it is at this moment, at true
          scale, lets you travel through it at nearly the speed of light, and then helps you measure what you saw.
        </>
      }
    >
      <H3>What you can do</H3>
      <ul>
        <li>
          <b>Explore.</b> Look around the real sky, jump from planet to planet, and run time forwards to watch the orbits turn.
        </li>
        <li>
          <b>Fly.</b> Plan a trip at any speed below <i>c</i>. Watch the stars crowd ahead of you and change colour, and compare
          your clock with Earth’s when you arrive.
        </li>
        <li>
          <b>Measure.</b> Five guided experiments take you from timing a light pulse across the Solar System to measuring the
          acceleration of a relativistic rocket. Each ends with fitted results and a printable lab report.
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

      <H3>How to use this manual</H3>
      <p>
        Chapters 2 and 3 are all you need to get started. Chapters 4 to 9 explain each part of the program, and chapters 10 to
        12 are for looking things up. Buttons marked <b>Try it</b> close the manual and do what the text describes. The
        simulation pauses while the manual is open.
      </p>
      <TryRow>
        <Try run={startTour}>Take the tour</Try>
        <Try run={showWelcome}>Show the welcome screen</Try>
      </TryRow>

      <Note title="What you need">
        A desktop or laptop browser with WebGL 2: a recent Chrome, Edge, Firefox or Safari. A mouse or trackpad is easiest;
        phones work, with a simpler layout. Nothing is installed and there is no account. Your readings stay in your browser
        (<Ref to="lab">Chapter 7</Ref>).
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
          <b>Visit a planet.</b> Press <Kbd>6</Kbd>, or click Saturn in the target bar at the bottom. The camera glides there.
          Camera moves are for looking; they are not journeys.
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
          <b>Fly.</b> Flights leave from wherever the camera is, so press <Kbd>H</Kbd> to return to Earth first. Then press{' '}
          <b>Plan flight</b> in the header (or <Kbd>G</Kbd>), choose a destination and a speed, and press <b>Execute</b>. The
          planner shows in advance how long the trip will take by the Sun’s clocks and by yours.
          <TryRow>
            <Try run={planFlight('saturn', 0.9, true)}>Plan a flight from Earth to Saturn at 0.9c</Try>
          </TryRow>
        </li>
        <li>
          <b>Look at the sky.</b> In flight, drag to look around. Stars crowd towards the direction of motion, turn blue ahead
          and red behind, and brighten ahead. Press <Kbd>X</Kbd> to split the screen: the left side shows the sky without
          relativity. The flight recorder along the bottom shows two clocks: <i>t</i>, kept in the Sun’s frame, and <i>τ</i>,
          kept on board. From Earth, at a rate of <P10 n={3} />, the trip to Saturn takes a few seconds; <b>Skip to arrival</b>{' '}
          jumps to the end, and the readings stay exact.
        </li>
        <li>
          <b>Do an experiment.</b> Open the lab (<b>Lab</b>, or <Kbd>K</Kbd>) and start Experiment 1. The procedure ticks itself
          off as you work through it.
          <TryRow>
            <Try run={startExperiment1}>Open Experiment 1</Try>
          </TryRow>
        </li>
      </Steps>
    </Chapter>
  );
}

const SCREEN_PARTS: [number, ReactNode, ReactNode][] = [
  [1, <>Lab button <Kbd>K</Kbd></>, 'Opens the lab panel on the left.'],
  [2, 'Epoch', <>The date and time being simulated, in UTC. Click it to change it (<Ref to="time">Chapter 5</Ref>).</>],
  [3, <>Plan flight <Kbd>G</Kbd></>, <>Opens the trajectory planner (<Ref to="flying">Chapter 6</Ref>).</>],
  [4, 'View · Manual · About', 'Display options; this manual; credits, sources and methods.'],
  [5, <>Instruments button <Kbd>I</Kbd></>, 'Opens the instrument panel on the right.'],
  [6, 'Lab panel', <>Experiments, your notebook and the physics reference (<Ref to="lab">Chapter 7</Ref>).</>],
  [
    7,
    'View',
    'The simulation. Top left: what the camera is doing and its range to the target. Top centre: status lamps. Bottom left: a scale bar.',
  ],
  [8, 'Instrument panel', <>Live readouts of speed, clocks, the target, optics and light-time (<Ref to="instruments">Chapter 9</Ref>).</>],
  [9, 'Time controls', 'Pause, the simulation rate, and Now.'],
  [10, 'Target bar', 'Every body in the simulation. Click one to go there.'],
  [11, 'Status', 'What the camera is doing: orbiting, slewing, in transit or in free flight. Shown on wide screens, and always in free flight; the view’s top-left readout says the same.'],
];

function Screen() {
  return (
    <Chapter
      id="screen"
      n={3}
      title="The screen"
      lead="Everything on screen, numbered as in Figure 3.1. The two side panels start closed; open them when you need them."
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
              <Ref to="flying">Chapter 6</Ref>).
            </>,
          ],
          [<Lamp tone="cyan">Light-time corr.</Lamp>, 'Bodies are drawn where they were when the light now arriving left them.'],
          [<Lamp tone="cyan">Pulse in flight</Lamp>, 'A light pulse from Experiment 1 is still spreading.'],
          [<Lamp tone="red">Non-physical state</Lamp>, 'The fictional faster-than-light drive is engaged.'],
        ]}
      />

      <H3>Messages and notes</H3>
      <p>
        Lab events, such as detections, readings, arrivals and errors, appear for about 14 seconds in the top-left corner of the
        view; the Notebook tab exports the session’s log (the latest 200 events). The first time something new happens (passing 0.1<i>c</i>, say), a
        short note in the top-right corner offers the matching section of the reference. Click <b>Read</b> to open it, or × to
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

      <H3>Choosing a target</H3>
      <p>
        Click a body’s label to <i>select</i> it. Amber brackets mark it, its label shows its range and light-time, and
        Instruments › Target shows its data sheet. To take the camera there, double-click the body, click its name in the
        target bar, or press its key: <Kbd>0</Kbd> for the Sun, <Kbd>1</Kbd> to <Kbd>9</Kbd> for Mercury to Pluto, <Kbd>M</Kbd>{' '}
        for the Moon and <Kbd>V</Kbd> for Voyager 1. Proxima Centauri, 4.2 light-years away, is at the end of the target bar.{' '}
        <Kbd>Esc</Kbd> clears the selection.
      </p>
      <Note title="The camera is not a spaceship">
        Camera moves ignore physics: the camera glides to its target in a few seconds (never more than six), whatever the
        distance. To travel physically, with clocks that obey relativity, plan a flight (<Ref to="flying">Chapter 6</Ref>).
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
          [<>Viewport overlays <Kbd>U</Kbd></>, <>The camera readout and scale bar; in flight also the reticle and the apex markers (<Ref to="instruments">Chapter 9</Ref>).</>],
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
        0.01<i>c</i>, but only planned flights record data.
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
        the view reminds you that time is running fast.
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

      <H3>Chronometers</H3>
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
      title="Flying"
      lead="A flight is a physical journey: a straight line through the Solar System at a speed you choose, with clocks that obey special relativity."
    >
      <H3>Planning a flight</H3>
      <p>
        Press <b>Plan flight</b> in the header (or <Kbd>G</Kbd>), or <b>Plan trajectory…</b> on a target’s data sheet, and
        choose a destination. You leave from wherever the camera is, and the planner aims at the point where the destination
        will be when you arrive, not where it is now.
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
      <p>On arrival a trial report sums up the flight (Δ<i>t</i>, Δ<i>τ</i> and their ratio) and says where it was logged.</p>

      <H3>What you see</H3>
      <p>Above 0.01<i>c</i> the view switches to relativistic optics, which change the sky in three ways.</p>
      <ul>
        <li>
          <b>Aberration.</b> Your motion tilts incoming light, so every direction except dead astern shifts towards the{' '}
          <i>apex</i>, the point you are heading for. At 0.9<i>c</i> the whole forward half of the sky fits within 26° of the
          apex (Figure 6.1).
        </li>
        <li>
          <b>Doppler shift.</b> Light from ahead is compressed to higher frequencies and light from behind is stretched. The
          Doppler factor straight ahead is √((1 + <i>β</i>)/(1 − <i>β</i>)), which is 4.4 at 0.9<i>c</i>: stars ahead turn blue,
          and the Sun’s 5 772 K surface, if it lay dead ahead, would look like a 25 000 K star.
        </li>
        <li>
          <b>Beaming.</b> Light from ahead is also concentrated and brightened, and the sky behind fades.
        </li>
      </ul>
      <Fig
        n="6.1"
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
      <p>
        The View menu offers three optics models: <b>Relativistic</b>; <b>Classical</b>, which draws the sky as it is in the
        Sun’s frame, without aberration or Doppler shift; and <b>Split</b> (<Kbd>X</Kbd>), with classical on the left and
        relativistic on the right of a divider you can drag. <Kbd>Z</Kbd> switches between classical and relativistic. All
        three look the same at rest: the difference appears in flight, above 0.01<i>c</i>. To see aberration on its own, turn
        off <i>Doppler shift and beaming</i> in Instruments › D.
      </p>
      <TryRow>
        <Try run={() => useUI.setState({ relMode: 'split' })}>Split the view (for your next flight)</Try>
      </TryRow>
      <Note title="Faster than light" tone="hazard">
        Nothing with mass can reach <i>c</i>: the energy needed grows without limit as <i>β</i> approaches 1. The superluminal
        drive exists to show why. During it the Lorentz factor is imaginary, proper time has no meaning, and some observers would
        reckon that you arrived before you left. Reference sections 8 and 9 explain.
      </Note>
    </Chapter>
  );
}

function Lab() {
  return (
    <Chapter
      id="lab"
      n={7}
      title="The lab"
      lead="The lab turns the simulator into apparatus. Each experiment is laid out like a university lab script, and the program does the bookkeeping."
    >
      <H3>Opening the lab</H3>
      <p>
        Press <b>Lab</b> in the header, or <Kbd>K</Kbd>. The panel has three tabs: <b>Experiments</b>, the list of experiments
        and their scripts; <b>Notebook</b>, where your readings are kept; and <b>Reference</b>, ten short sections on the
        physics.
      </p>
      <TryRow>
        <Try run={openLab('experiments')}>Open the lab</Try>
      </TryRow>

      <H3>Anatomy of an experiment</H3>
      <p>
        Every experiment page has the same eight sections: Aim, Background (the theory, with numbered equations), Apparatus,
        Procedure, Observations, Analysis, Questions and Conclusion. The first three are reading. Figure 7.1 shows how the rest
        fit together.
      </p>
      <Fig n="7.1" caption="Working through an experiment, from the procedure to the report.">
        <WorkflowFigure />
      </Fig>

      <H3>Following the procedure</H3>
      <p>
        Procedure steps tick themselves off when the simulation reaches the state they ask for: the right rate, a pulse emitted,
        five speeds recorded. Many steps have a button that sets the apparatus up for you. The small boxes beside each
        experiment in the list show how far you have got.
      </p>

      <H3>Recording data</H3>
      <p>
        Experiments 1, 2 and 5 record by themselves: every detector that registers a pulse (1), every constant-speed flight that
        arrives (2), and samples along every 1 g flight (5). Experiments 3 and 4 need you to take readings: open the experiment,
        set up the view as its procedure describes, and press <b>Record</b> or <Kbd>R</Kbd>. If a reading cannot be taken, the
        message in the corner of the view says why.
      </p>
      <p>
        Readings go into the data table under Observations. Point at a row and click × to delete it; <b>Clear</b> deletes them
        all.
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
        <Try run={openLab('notebook')}>Open the notebook</Try>
      </TryRow>

      <H3>The reference</H3>
      <p>
        Ten short sections cover the physics behind what you see: light-travel time, the scale of the Solar System, the Lorentz
        factor, time dilation, length contraction, aberration, the Doppler effect, why nothing reaches <i>c</i>, faster-than-light
        travel, and the relativistic rocket. Press <Kbd>E</Kbd> to open them.
      </p>
      <TryRow>
        <Try run={openLab('reference')}>Open the reference</Try>
      </TryRow>
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

function Experiments() {
  return (
    <Chapter id="experiments" n={8} title="The experiments" lead="Five experiments in order of difficulty, each taking 10 to 20 minutes.">
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

      <H3>Experiment 1 · Time of flight of a light pulse</H3>
      <p>
        Fire a light pulse from Earth and watch it spread through the Solar System as a growing circle. Each body it reaches
        logs the time of flight and the distance the pulse covered. A straight-line fit of distance against time gives <i>c</i>,
        and the intercept should be zero. The experiment follows Ole Rømer, who in 1676 explained the wandering timing of the
        eclipses of Jupiter’s moon Io by the time light takes to cross Earth’s orbit.
      </p>

      <H3>Experiment 2 · Time dilation on inertial trips</H3>
      <p>
        Fly at five or more constant speeds and compare the ship’s clock with the Sun’s on each arrival. The ratio Δ<i>τ</i>/Δ
        <i>t</i> should equal √(1 − <i>β</i>
        <sup className="sup">2</sup>). Plotting the logarithms of both sides gives a straight line whose slope is the exponent
        ½.
      </p>

      <H3>Experiment 3 · The relativistic Doppler factor</H3>
      <p>
        In flight, point the reticle at a set angle from the apex and record the Doppler factor its spectrometer reads, then
        repeat round the sky. Theory predicts that 1/<i>D</i> is a straight line in cos <i>θ</i>′; its slope and intercept give
        your speed.
      </p>

      <H3>Experiment 4 · Aberration of light</H3>
      <p>
        In flight, select bodies one at a time and record where each appears, <i>θ</i>′, and where the ephemeris puts it,{' '}
        <i>θ</i>, both measured from the apex. The relation cos <i>θ</i>′ − cos <i>θ</i> = <i>β</i>(1 − cos <i>θ</i> cos{' '}
        <i>θ</i>′) gives your speed from a fit through the origin. An optional run repeats James Bradley’s discovery of
        1725–29: orbiting with Earth, the shift is only about 20 seconds of arc, yet the fit still recovers Earth’s orbital
        speed.
      </p>

      <H3>Experiment 5 · Constant proper acceleration</H3>
      <p>
        Fly a 1 g flip-and-burn to Proxima Centauri; the flight is sampled at equal steps of ship time. The rapidity{' '}
        <i>φ</i> = artanh <i>β</i> grows in proportion to proper time while the engine pushes forward (the first half of the
        flight), and <i>c</i> times the slope is the acceleration felt on board: 9.81 m/s<sup className="sup">2</sup>.
      </p>
      <p>
        Experiment 1 needs only the pulse emitter and the time controls, and Experiment 2 the planner. Experiments 3 and 4 use
        the relativistic view, and 5 builds on 2.
      </p>
      <TryRow>
        <Try run={startExperiment1}>Open Experiment 1</Try>
      </TryRow>
    </Chapter>
  );
}

function Instruments() {
  return (
    <Chapter
      id="instruments"
      n={9}
      title="Instruments"
      lead="The instrument panel (I) reads the simulation several times a second. Its sections are lettered; click a heading to fold it."
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
          ['Reticle', <>In motion, marks the centre of the view. Its spectrometer reads the angle <i>θ</i>′ from the apex and the Doppler factor <i>D</i> there.</>],
          ['APEX, ANTAPEX', 'The directions you are heading towards and away from.'],
          ['Scale bar', 'A length at the distance of the body named beside it. In the relativistic view it reads “scale undefined”, since the scale varies across the sky.'],
          ['Axis triad', 'The ecliptic axes, X towards the March equinox and Z towards ecliptic north. Shown with the grid.'],
          ['Camera readout', 'What the camera is doing and its range to the target.'],
        ]}
      />
      <p>
        <b>View › Viewport overlays</b> (<Kbd>U</Kbd>) shows or hides all of these.
      </p>
    </Chapter>
  );
}

const KEY_GROUPS: { title: string; rows: [ReactNode, ReactNode][] }[] = [
  {
    title: 'Mouse',
    rows: [
      ['Drag', 'Orbit the target; look around in flight'],
      ['Scroll', 'Range; throttle in free flight'],
      ['Click a label', 'Select a body'],
      ['Double-click a body', 'Take the camera there'],
    ],
  },
  {
    title: 'Targets and camera',
    rows: [
      [<><Kbd>0</Kbd>–<Kbd>9</Kbd></>, 'Sun, Mercury … Neptune, Pluto'],
      [<><Kbd>M</Kbd> <Kbd>V</Kbd></>, 'Moon, Voyager 1'],
      [<Kbd key="h">H</Kbd>, 'Return to Earth'],
      [<>Arrows · <Kbd>+</Kbd> <Kbd>−</Kbd></>, 'Orbit · range'],
      [<Kbd key="f">F</Kbd>, 'Free flight on and off'],
      [<><Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd></>, 'Move (free flight)'],
      [<><Kbd>Space</Kbd>/<Kbd>R</Kbd> · <Kbd>C</Kbd></>, 'Up · down (free flight)'],
      [<><Kbd>Q</Kbd> <Kbd>E</Kbd></>, 'Roll (free flight)'],
      [<Kbd key="esc">Esc</Kbd>, 'Clear the selection; leave free flight'],
    ],
  },
  {
    title: 'Time and flight',
    rows: [
      [<><Kbd>Space</Kbd> <Kbd>P</Kbd></>, 'Pause and resume (P in free flight)'],
      [<><Kbd>[</Kbd> <Kbd>]</Kbd> or <Kbd>,</Kbd> <Kbd>.</Kbd></>, 'Rate down, up'],
      [<Kbd key="n">N</Kbd>, 'Back to the present; zero the chronometers'],
      [<Kbd key="g">G</Kbd>, 'Plan a flight'],
      [<Kbd key="z">Z</Kbd>, 'Classical or relativistic optics'],
      [<Kbd key="x">X</Kbd>, 'Split screen'],
    ],
  },
  {
    title: 'Lab and panels',
    rows: [
      [<Kbd key="k">K</Kbd>, 'Lab panel'],
      [<Kbd key="i">I</Kbd>, 'Instrument panel'],
      [<Kbd key="e">E</Kbd>, 'Reference'],
      [<Kbd key="r">R</Kbd>, 'Record a reading (Experiments 3 and 4)'],
      [<Kbd key="q">?</Kbd>, 'This chapter of the manual'],
    ],
  },
  {
    title: 'Display',
    rows: [
      [<Kbd key="t">T</Kbd>, 'True scale or enlarged bodies'],
      [<><Kbd>O</Kbd> <Kbd>L</Kbd> <Kbd>B</Kbd></>, 'Orbits, labels, small bodies'],
      [<Kbd key="j">J</Kbd>, 'Ecliptic grid'],
      [<Kbd key="u">U</Kbd>, 'Viewport overlays'],
    ],
  },
];

function Controls() {
  return (
    <Chapter
      id="controls"
      n={10}
      title="Keyboard and mouse"
      lead="Single-key shortcuts work whenever you are not typing in a field. If they clash with assistive software, turn them off in View › Keyboard shortcuts."
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
        choice. <Kbd>Esc</Kbd> closes menus, dialogs and this manual. A panel edge takes focus too: the arrow keys resize it, and{' '}
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
        free flight.
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
        Readings by hand belong to Experiments 3 and 4, so one of them must be open in the lab. Experiment 3 needs you to be
        moving, which means in flight. Experiment 4 needs a selected body and a moving observer: a flight, or an orbit round a
        planet, which carries you with it (not the Sun, which is at rest). In free flight <Kbd>R</Kbd> moves you up instead, and
        it does nothing while keyboard shortcuts are off; use the <b>Record</b> button. The message in the top-left corner of the
        view says what is missing.
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
        In this browser’s local storage (<Ref to="lab">Chapter 7</Ref>). Export it before clearing your browsing data or moving
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

export default function ManualDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Manual</div>
        <h1>Using Lightspeed</h1>
        <p>How to explore, fly and measure in the virtual laboratory for special relativity.</p>
      </header>
      <Welcome />
      <QuickStart />
      <Screen />
      <Looking />
      <Time />
      <Flying />
      <Lab />
      <Experiments />
      <Instruments />
      <Controls />
      <Troubleshooting />
      <Glossary />
    </>
  );
}
