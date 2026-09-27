/**
 * The Lightspeed guide: how to explore, fly and find your way around, with a chapter for
 * students on the lab. British spelling, SI units, symbols in italics (ital() for plain
 * strings). Everything here describes the interface as the code builds it: when a control
 * moves, this file moves with it.
 */
import type { ReactNode } from 'react';
import type { BodyId } from '../../sim/bodies';
import { setPaused, setWarp, WARP_STEPS } from '../../sim/clock';
import { TRIP_PLAYBACK_S } from '../../sim/travel';
import { logEvent } from '../../lab/events';
import { JOURNEYS } from '../../content/journeys';
import { FEATURED_IDS, findDestination } from '../../content/destinations';
import { findArticle, useArticles } from '../../content/learn/library';
import { formatDurationShort } from '../../lib/time';
import { superscript } from '../../lib/sci';
import { countWord, countWordStart } from '../../lib/words';
import { openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { frameSolarSystem, goToBody } from '../navigation';
import { runScene } from '../../content/scenes';
import { openJourneys, openLab, openSearch, resetPreferences, showWelcome, startExperiment1, startTour } from '../onboarding';
import { KEY_GROUPS } from '../keys';
import { Kbd } from '../kit';
import { rich } from '../rich';
import { GuideFlightsBeyond } from './GuideFlightsBeyond';
import { AberrationFigure, ScreenMap, WorkflowFigure } from './figures';
import { Callout, Chapter, Fig, H3, KeyTable, Lamp, Note, Ref, Steps, Try, type TocEntry } from './parts';

export const GUIDE_TOC: TocEntry[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'screen', title: 'The screen' },
  { id: 'looking', title: 'Looking around' },
  { id: 'universe', title: 'What is out there' },
  { id: 'time', title: 'Time' },
  { id: 'flying', title: 'Journeys and flights' },
  { id: 'seeing', title: 'What you are seeing' },
  { id: 'readings', title: 'Readings' },
  { id: 'lab', title: 'For students: the lab' },
  { id: 'controls', title: 'Keyboard and mouse' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
  { id: 'glossary', title: 'Glossary' },
];

/** A chapter's number, from its place in the contents. */
const chapterNo = (id: string): number => GUIDE_TOC.findIndex((c) => c.id === id) + 1;

/** A cross-reference to a chapter by its number ("Chapter 7"), which follows the contents. */
function Ch({ to }: { to: string }) {
  return <Ref to={to}>Chapter {chapterNo(to)}</Ref>;
}

/** Two chapters at once: "Chapters 5 and 8", each number a link. */
function Chs({ to: [a, b] }: { to: [string, string] }) {
  return (
    <>
      Chapters <Ref to={a}>{chapterNo(a)}</Ref> and <Ref to={b}>{chapterNo(b)}</Ref>
    </>
  );
}

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

/** A link into Learn that closes nothing: the reading view simply turns to the article. */
function LearnLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <a
      href={`#/learn/${slug}`}
      onClick={(e) => {
        e.preventDefault();
        openLearn(slug);
      }}
    >
      {children}
    </a>
  );
}

// ─── Chapters ────────────────────────────────────────────────────────────────────────────

function Welcome() {
  return (
    <Chapter
      id="welcome"
      n={chapterNo('welcome')}
      title="Welcome to Lightspeed"
      lead={
        <>
          Lightspeed is a space exploration tool with real physics. It shows the universe as it is at this moment, from the
          planets at true scale to the stars, the Milky Way and the galaxies beyond, and lets you fly through it at nearly the
          speed of light, with the sky and the clocks behaving exactly as relativity says they must.
        </>
      }
    >
      <H3>What you can do</H3>
      <ul>
        <li>
          <b>Explore.</b> Press <b>Where to?</b> and name a place: a planet, the Moon, Voyager 1, a star, a nebula, the Andromeda
          Galaxy. Read each card, run time forwards to watch the orbits turn, or go to any date from 10,000 BCE to 9999.
        </li>
        <li>
          <b>Fly.</b> Take a one-click journey, or fly anywhere at 1 g or at any speed below <i>c</i>. Watch the stars crowd ahead
          of you and change colour, and see how much less time passes for you than at home. Go beyond the Local Group and space
          itself expands while you travel.
        </li>
        <li>
          <b>Read.</b> <b>Learn</b> has long reads on the science behind the view: how it was found out, what the physics says and
          what comes next, with sources to go further (<Chs to={['universe', 'seeing']} />).
        </li>
        <li>
          <b>Measure, if you want to.</b> Every number is live in the instrument panel (<Ch to="readings" />). For students, the
          lab holds five guided experiments, each ending in a printable report (<Ch to="lab" />). Neither opens unless you ask
          for it.
        </li>
      </ul>

      <H3>What is real, and what is a model</H3>
      <p>
        Planet positions come from published ephemerides for the date shown at the top of the screen: to about an arcminute
        between 1700 and 2200, to about half a degree between 3000 BCE and 3000 CE, and only illustrative beyond (the orbits are
        right, the places along them are not). The stars, the star clusters, the nebulae and the galaxies are at their measured
        distances (the farthest galaxies at the distance their redshift gives). Distances are never compressed, light travels at 299,792.458 km/s, and what you see in flight follows the
        transformation laws of special relativity exactly.
      </p>
      <p>
        Where the measurements run out, a model takes over, and the card says so. The Milky Way seen from outside is a model
        built from published measurements, its spiral arms carried on beyond the parallax data. Other galaxies are drawn from
        their measured size, brightness and tilt, with the shape typical of their type. The cosmic web is a survey, with gaps,
        and the map of the oldest light is contrast enhanced. <Ch to="universe" /> says what each of them is.
      </p>
      <p>
        Some things are idealised, and the program says so where it matters: the constant-speed drive starts and stops
        instantly, gravity is ignored on a flight, and flights beyond the Local Group assume a perfect engine and a destination
        that moves with the expansion of the universe. A third drive, faster than light, is outright fiction, offered only for
        comparison. It is marked in red and none of its readings are recorded. The full list is under{' '}
        <Ref page="about" to="limitations">
          Model limitations
        </Ref>{' '}
        on the About page.
      </p>

      <H3>How to use this guide</H3>
      <p>
        Chapters 2 and 3 are all you need to get started. Chapters 4 to {chapterNo('readings')} explain each part of the
        program and what you are looking at, chapter {chapterNo('lab')} is for students, and chapters {chapterNo('controls')} to{' '}
        {chapterNo('glossary')} are for looking things up. Buttons marked <b>Try it</b> close the guide and do what the text
        describes. The simulation pauses while the guide is open.
      </p>
      <TryRow>
        <Try run={startTour}>Take the tour</Try>
        <Try run={openSearch}>Where to?</Try>
        <Try run={showWelcome}>Show the welcome screen</Try>
      </TryRow>

      <Note title="What you need">
        A desktop or laptop browser with WebGL 2: a recent Chrome, Edge, Firefox or Safari. A mouse or trackpad is easiest;
        phones work, with a simpler layout. Nothing is installed and there is no account. Anything you record stays in your
        browser.
      </Note>
    </Chapter>
  );
}

function QuickStart() {
  return (
    <Chapter id="quick-start" n={chapterNo('quick-start')} title="Quick start" lead="Ten minutes, eight steps. Most have a button that sets them up for you.">
      <Steps>
        <li>
          <b>Look around.</b> Drag in the view to orbit Earth, and scroll to move in and out. The distance scale is logarithmic,
          so the same gesture takes you from the Moon’s orbit to the edge of the Solar System, and on out to the stars.
        </li>
        <li>
          <b>Go somewhere.</b> Press <b>Where to?</b> (or <Kbd>/</Kbd>), type <i>sat</i> and press <Kbd>Enter</Kbd>. The camera
          glides to Saturn and a card in the corner tells you about it. Camera moves are for looking; they are not journeys.
          <TryRow>
            <Try run={openSearch}>Open Where to?</Try>
            <Try run={docked(() => goToBody('saturn'))}>Go to Saturn</Try>
          </TryRow>
        </li>
        <li>
          <b>See the scale.</b> Click <b>Solar System</b> at the bottom of the screen to see the whole of it. At true scale even
          Jupiter, seen from Earth, is smaller than a pixel, so rings and labels mark where the planets are. Press <Kbd>T</Kbd>{' '}
          to draw every body at least a few pixels across; the distances stay the same.
          <TryRow>
            <Try run={docked(frameSolarSystem)}>Frame the Solar System</Try>
          </TryRow>
        </li>
        <li>
          <b>Speed up time.</b> Press <Kbd>]</Kbd> four times, or click the arrow to the right of the rate at the bottom left:
          each real second is then 2.8 hours. Press <Kbd>N</Kbd> to return to the present.
          <TryRow>
            <Try
              run={() => {
                setWarp(10_000);
                setPaused(false);
              }}
            >
              Run time at 2.8 hours a second
            </Try>
          </TryRow>
        </li>
        <li>
          <b>Take a journey.</b> Press <b>Journeys</b> in the header. Each of the {countWord(JOURNEYS.length)} is one click, and says what to look for
          while it runs. Start with <i>Race sunlight to Earth</i> or <i>Earth to Saturn at 0.9c</i>.
          <TryRow>
            <Try run={openJourneys}>Open the journeys</Try>
          </TryRow>
        </li>
        <li>
          <b>Fly somewhere yourself.</b> Select a planet and press <b>Fly here</b> on its card, or <b>Fly</b> beside it in Where
          to?. The flight planner opens, set to a rocket pushing at 1 g from where you are, and shows how long the trip will
          take for you and at home. Press <b>Ignite</b>. To fly at a steady speed instead, choose <b>Constant speed</b> in the
          planner and pick the speed.
          <TryRow>
            <Try run={planFlight('saturn', 0.9, true)}>Plan a flight from Earth to Saturn at 0.9c</Try>
          </TryRow>
        </li>
        <li>
          <b>Look at the sky.</b> In flight, drag to look around. Stars crowd towards the direction of motion, turn blue ahead
          and red behind, and brighten ahead. Press <Kbd>X</Kbd> to split the screen: the left side shows the sky without
          relativity. The panel along the bottom shows your speed, your clock, the clock at home and the distance left.{' '}
          <b>Skip to arrival</b> jumps to the end, and the readings stay exact.
        </li>
        <li>
          <b>Leave the Galaxy.</b> Click <b>Milky Way</b> in the trail at the bottom of the screen (on wide screens) to see the
          Galaxy from 100,000 light-years: a model built from published measurements. <b>Local Group</b> goes out to Andromeda
          and its neighbours, and <b>Where to?</b> finds any galaxy by name. A 1 g flight to Andromeda takes under 30 years by
          your clock, and over two million at home.
          <TryRow>
            <Try run={() => runScene('milky-way-outside')}>See the Milky Way from outside</Try>
            <Try run={() => runScene('local-group')}>See the Local Group</Try>
          </TryRow>
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
  [1, 'Lightspeed', 'The name opens the About page.'],
  [
    2,
    'Date',
    <>
      The date and time being shown, in UTC. Amber, with a dot, when it is not the present. Click it to go to another date (
      <Ch to="time" />).
    </>,
  ],
  [3, <>Where to? <Kbd>/</Kbd></>, <>Find any place by name, from the Moon to Andromeda, and go there or fly there (<Ch to="looking" />).</>],
  [4, 'Journeys', <>{countWordStart(JOURNEYS.length)} one-click trips and scenes (<Ch to="flying" />).</>],
  [5, <>Learn <Kbd>E</Kbd></>, <>Long reads on the science behind the view, from relativity to the galaxies (<Chs to={['universe', 'seeing']} />).</>],
  [6, <>Lab <Kbd>K</Kbd></>, <>For students: five guided experiments, in a panel on the left (<Ch to="lab" />).</>],
  [
    7,
    'View',
    'Display layers (the constellations, planet hosts, the cosmic web, the CMB map), body size and optics; the instrument panel and physics hints; the guide, the keys and About. Below 900 pixels it shows as an icon.',
  ],
  [
    8,
    'The view',
    'The simulation. Top left: what the camera is doing and its range to the target, and the cards of the cosmic web and the CMB map while they show. Top centre: status lamps. Top right: the card of the selected body. Bottom left: a scale bar; bottom right, the credits of the nebulae’s pictures in view. In flight, a panel along the bottom.',
  ],
  [9, 'Time', <>Pause; slower and faster, with the rate in words; Now (<Ch to="time" />).</>],
  [
    10,
    'Where you are',
    'Where the camera is, as a trail from the observable universe down to the body in view: … › Local Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Earth. Click a level to go there; the outer levels show on wide screens. Bodies lists everything you can visit, by kind, from the planets to the galaxies.',
  ],
  [11, <>Keys <Kbd>?</Kbd></>, 'The keyboard and mouse on one sheet. On wide screens the status beside it says what the camera is doing.'],
  [12, <>Instrument panel <Kbd>I</Kbd></>, <>Every number, live: speed, clocks, the target, optics and light-time (<Ch to="readings" />).</>],
];

function Screen() {
  return (
    <Chapter
      id="screen"
      n={chapterNo('screen')}
      title="The screen"
      lead="Everything on screen, numbered as in Figure 3.1. A first visit shows only the header, the view and the footer; the two side panels open when you ask for them."
    >
      <Fig
        n="3.1"
        wide
        caption="The Lightspeed screen with the instrument panel open on the right (View › Instrument panel, or I). The lab, when you open it, sits on the left."
      >
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
      <p>
        On narrow screens the header keeps its icons and drops their words, <b>Where to?</b> last; <b>Lab</b> leaves the header
        below 640 pixels. Point at an icon to see its name.
      </p>

      <H3>Panels</H3>
      <p>
        The instrument panel opens on the right from <b>View › Instrument panel</b>, from <b>Details</b> on a body’s card, or
        with <Kbd>I</Kbd>. The lab opens on the left from <b>Lab</b> or <Kbd>K</Kbd>. Nothing opens either panel by itself, and
        the lab stays closed when you reload the page. Drag the inner edge of a panel to resize it, or double-click the edge to
        reset it; from the keyboard, Tab to the edge and use the arrow keys. On screens narrower than 900 pixels the panels open
        over the view, one at a time, and get out of the way when you plan a flight.
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
          [<Lamp tone="amber">1 s = 3.4 months on board</Lamp>, <>In flight: how much of your time passes each second (<Ch to="flying" />).</>],
          [<Lamp tone="amber">Free flight</Lamp>, <>You are flying the camera by hand (<Ch to="looking" />).</>],
          [
            <Lamp tone="cyan">Relativistic optics</Lamp>,
            <>
              The view shows aberration and Doppler shift; in split screen the lamp reads <i>Split optics</i> (
              <Ch to="seeing" />).
            </>,
          ],
          [<Lamp tone="cyan">Light-time corr.</Lamp>, 'Bodies are drawn where they were when the light now arriving left them.'],
          [<Lamp tone="cyan">Pulse in flight</Lamp>, 'A light pulse is still spreading.'],
          [<Lamp tone="red">Non-physical state</Lamp>, 'The fictional faster-than-light drive is engaged.'],
        ]}
      />

      <H3>Messages and hints</H3>
      <p>
        When something you asked for cannot be done, a message says why for about 14 seconds in the top-left corner of the
        view. Once you have opened the lab, its records appear there too: pulse detections and arrivals as they are logged.
        If you turn on <b>View › Physics hints</b> (it starts off), a short note in the top-right corner says in a sentence
        what is going on the first time something new happens, passing 0.1<i>c</i> say, and <b>Read more</b> opens the Learn
        article that tells the whole story. Each note appears once.
      </p>
    </Chapter>
  );
}

function Looking() {
  return (
    <Chapter
      id="looking"
      n={chapterNo('looking')}
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
            'Move in and out (the scale is logarithmic; hold Shift to go five times faster)',
          ],
          ['Arrow keys', 'Orbit'],
          [<Kbd key="h">H</Kbd>, 'Return to Earth'],
        ]}
      />

      <H3>Where to?</H3>
      <p>
        <b>Where to?</b> in the header (or <Kbd>/</Kbd>, or <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>) finds any place by name: a planet or a
        moon, a spacecraft, any of the 330,000 stars, a planet of another star, a star cluster, a nebula, a galaxy, the cosmic
        web. It forgives
        part of a name (<i>prox</i>), a nickname (<i>Luna</i>, <i>the red planet</i>) and a slip of the keyboard (
        <i>Satrun</i>). Each result gives what it is, how far away it is and how long its light takes to reach you (for a
        galaxy in the expanding universe, how long ago the light now arriving left it); the
        highlighted one also shows what a flight there at 1 g would take for you and at home. A planet of another star has a
        small letter and a star of a system a capital, as astronomers write them: <i>Kepler-16 b</i> is the planet,{' '}
        <i>Kepler-16 B</i> the second star. Choose with the arrow keys.{' '}
        <Kbd>Enter</Kbd> (or <b>Go</b>) takes the camera there; <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> (or <b>Fly</b>) opens the
        flight planner set to that 1 g flight. Before you type, it offers {countWord(FEATURED_IDS.length)} places from the Moon
        out to the centre of the Galaxy and Andromeda ({featuredNames()}), each with what a 1 g flight there would take, and
        the journeys.
      </p>
      <TryRow>
        <Try run={openSearch}>Open Where to?</Try>
      </TryRow>

      <H3>Choosing a body</H3>
      <p>
        Click a body (a planet, a star, a nebula, a galaxy) or its label to <i>select</i> it. Amber brackets mark it, its label shows its range and light-time, and a
        card in the top-right corner of the view says what it is, how far away it is, how long its light took to reach you, and
        three things worth knowing about it. On the card, <b>Go there</b> takes the camera to it, <b>Fly here</b> plans a 1 g
        flight, <b>Read</b> opens its story in Learn where there is one, and <b>Details</b> opens the instrument panel with its
        full data sheet. <Kbd>Esc</Kbd> clears the selection.
      </p>
      <p>
        To take the camera somewhere directly, double-click the body, click it in <b>Bodies</b> at the bottom of the screen, or
        press its key: <Kbd>0</Kbd> for the Sun, <Kbd>1</Kbd> to <Kbd>9</Kbd> for Mercury to Pluto, <Kbd>M</Kbd> for the Moon
        and <Kbd>V</Kbd> for Voyager 1. In <b>Bodies</b> the moons sit under their planets (the ▸ beside a planet opens its
        moons), followed by the dwarf planets, asteroids and Kuiper belt objects, comets, interstellar visitors, spacecraft,
        stars, planets of other stars, and then the Milky Way (the Galaxy itself, Sagittarius A* with its stars, and the
        galaxies that orbit it), the star clusters (open, then globular), the nebulae (where stars are born, what dying stars
        shed, and those in the Magellanic Clouds), the other galaxies (the Local Group, those beyond it and the most distant
        known) and the clusters, the cosmic web and the CMB map. Under <b>Bodies › Stars</b> the named stars are sorted into those within 16 light-years, those with planets and
        the bright ones, and a star system (Alpha Centauri, Sirius) has a row of its own with its stars and planets under it;
        stars you found in search come last. <b>Where to?</b> finds any of the 330,000 stars in the sky by name or catalogue
        number (Vega, α Lyrae, HIP 91262). The trail beside <b>Bodies</b> says where the camera is (Observable universe › Local
        Universe › Local Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Saturn › Titan); click a level to
        see it all at once: <b>Solar neighbourhood</b> steps back 26 light-years from the Sun, among the nearest stars,{' '}
        <b>Milky Way</b> goes out to see the Galaxy from 100,000 light-years, <b>Local Group</b> to 3 million parsecs and{' '}
        <b>Local Universe</b> to the cosmic web. The spiral arm is named only where the arms have been measured: within two of
        their widths of an arm’s ridge, on the stretch that radio parallaxes of star-forming regions trace (Reid et al. 2019).
        The Local Group is what lies inside its zero-velocity surface, where gravity has stopped the expansion; the local
        universe reaches redshift 0.1, about as far as distances are measured galaxy by galaxy. On narrow screens these
        levels are left out of the trail.
      </p>
      <Note title="The camera is not a spaceship">
        Camera moves ignore physics: the camera glides to its target in a few seconds (never more than six), whatever the
        distance. To travel physically, with clocks that obey relativity, take a journey or fly (<Ch to="flying" />).
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
          [<>Small bodies <Kbd>B</Kbd></>, '31,930 asteroids, Trojans and trans-Neptunian objects from the JPL Small-Body Database.'],
          [<>Ecliptic grid <Kbd>J</Kbd></>, 'Lines of ecliptic longitude and latitude every 15°, labelled, with an axis triad in the corner.'],
          [
            <>Constellations <Kbd>Y</Kbd></>,
            'The 88 constellation figures and their names, drawn between the real stars, so they come apart as you fly away. They show by themselves once you are among the stars (0.65 light-years or more from the Sun), each fading away once it has come apart; Y turns them all on or off for good.',
          ],
          [
            'Planet hosts',
            'A small ring around each star of the catalogue with known planets, within 130 light-years (40 parsecs) of you. Point at one for the star’s name; click it to select the star. Like the constellations, they show by themselves once you are among the stars.',
          ],
          ['Cosmic web', 'The 55,877 galaxies of Cosmicflows-4 as a map, coloured by kind and sized by infrared luminosity. It shows by itself beyond the Local Group; its card lists what the survey misses.'],
          [
            'CMB map',
            <>
              The cosmic microwave background over the sky (WMAP), contrast enhanced about 10,000 times, with its label. Drawn
              whenever the relativistic view is off: below 0.01<i>c</i>, in classical optics, and on the classical side of the split
              screen.
            </>,
          ],
          [<>Readouts over the view <Kbd>U</Kbd></>, <>The camera readout and scale bar; in flight also the reticle and the apex markers (<Ch to="readings" />).</>],
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
        Free flight is for sightseeing. The throttle is shown in the status bar at the bottom right, and the relativistic
        optics switch on above 0.01<i>c</i>, but only planned flights count as trips.
      </p>
    </Chapter>
  );
}

/** Learn articles about what is out there, in the order to read them. */
const OUT_THERE: Reading[] = [
  { slug: 'how-far-are-the-stars', title: 'How far are the stars?', what: 'Parallax, and how the distances behind the star map were measured, down to Gaia.' },
  { slug: 'what-stars-are-made-of', title: 'What stars are made of', what: 'Spectra, what makes a star shine, and how stars live and die.' },
  { slug: 'other-worlds', title: 'Other worlds', what: 'How the planets of other stars were found, from wobbles and shadows to pictures.' },
  { slug: 'our-galaxy', title: 'Our galaxy', what: 'How the Milky Way was mapped from inside, and the black hole at its centre weighed.' },
  { slug: 'island-universes', title: 'Island universes', what: 'How the spiral nebulae turned out to be other galaxies, and Andromeda’s approach.' },
  { slug: 'the-expanding-universe', title: 'The expanding universe', what: 'Redshifts, the expansion, and the oldest light there is.' },
  { slug: 'the-edge-of-reach', title: 'The edge of reach', what: 'Why some galaxies we can see could never be reached, even at the speed of light.' },
];

function Universe() {
  return (
    <Chapter
      id="universe"
      n={chapterNo('universe')}
      title="What is out there"
      lead="From the Moon to the most distant galaxies known, everything is where it has been measured to be. Where the measurements stop, a model takes over, and the card says which is which."
    >
      <H3>The Solar System</H3>
      <p>
        The Sun, the planets and the Moon follow published ephemerides. The other moons, the dwarf planets, the comets, the
        interstellar visitors and the spacecraft follow fits to JPL’s Horizons, and 31,930 asteroids, Trojans and
        trans-Neptunian objects their catalogued orbits (<Kbd>B</Kbd>). Each body’s card says how far to trust what you see:
        where its position comes from and how accurate it is at the date shown, and what else is a model, such as a rotation no
        one can predict or a surface never mapped. Its facts link to their sources.
      </p>

      <H3>Stars and their planets</H3>
      <p>
        The stars are where they really are, in three dimensions: each at its measured distance (mostly from ESA’s Gaia
        mission), moving with its measured velocity, as bright and as coloured as it looks from where you are. From Earth they
        make the familiar sky; fly among them and the constellations come apart. Come within a third of a light-year of a star
        and it becomes a body you can orbit, a glowing disc at its measured (or estimated) size. The sky shows stars down to
        magnitude 6.5, as the eye would; the catalogue goes to 10, so fainter stars appear as you approach them.
      </p>
      <p>
        Many stars have planets. <b>Where to?</b> finds any of the 6,372 confirmed planets of NASA’s Exoplanet Archive by name
        (<i>K2-18 b</i>, <i>51 Pegasi b</i>) and takes you to its star, which joins the view with its planets even when it is
        too faint for the star catalogue. Eleven systems are built from their papers, among them TRAPPIST-1’s seven planets and
        HR 8799’s four giants on their measured orbits. Each planet goes round on a fixed Kepler orbit, timed so that from the
        Sun transits happen at their published times. Nobody has seen the surface of any of them, so their colours are
        illustrative, and the card says so, along with what else is assumed (often the orbit’s orientation on the sky). Once
        you are among the stars, a small ring marks each star of the catalogue with known planets, within 130 light-years (
        <b>View › Planet hosts</b>). Point at a ring to see the star’s name and how many planets it has; click it to select the
        star, and its planets join the view.
      </p>
      <TryRow>
        <Try run={() => runScene('go:proxima')}>Go to Proxima Centauri</Try>
      </TryRow>

      <H3>The Milky Way</H3>
      <p>
        From anywhere near the Sun the glow of the Milky Way behind the stars is the real sky: the light of the stars too faint
        to draw one by one, mapped by ESA’s Gaia satellite and rendered by NASA’s Scientific Visualization Studio, with its
        dark dust lanes (the Great Rift through Cygnus and Aquila, the Coalsack beside the Southern Cross) where they really
        are. The light of the star catalogue’s own faint stars, down to magnitude 10, is added to it. It is drawn as bright, for its size, as the faint stars are, and it fades out where the eye would lose it, about
        as faint as the darkest skies on Earth. In flight it is squeezed ahead of you and shifted in colour like everything
        else.
      </p>
      <p>
        That sky is the view from the Sun, so it fades out a few hundred parsecs away, and a model of the whole Galaxy takes
        over: 200,000 points of light drawn from the laws that describe its disc, its bar and bulge, its halo and its spiral
        arms, dimmed by a model of its dust along each line of sight. It is a <b>model built from published measurements</b>{' '}
        (Reid et al. 2019 arms, Wegg et al. bar, Drimmel and Spergel dust): the points are not real stars, and the far side of
        the Galaxy has never been mapped directly, so the arms there are carried on beyond the parallax data. Close to the
        camera each point would stand for hundreds of thousands of suns spread over hundreds of parsecs, so there the discs
        and the young stars of the arms are drawn as a smooth glow worked out from the same laws, and the points take over 1
        to 4 kiloparsecs out. From 100,000 light-years it is a barred spiral with the Sun about halfway out. Seen from the Sun
        the model is within half a magnitude of the real sky towards the Galaxy’s anticentre and poles, but over a magnitude
        fainter towards the star clouds of Sagittarius and Scutum: its dust is smooth, without the gaps that let their light
        through.
      </p>
      <p>
        Among the stars are 1,664 star clusters. The open clusters’ stars are the star catalogue’s own; a ring marks each
        famous one (the Pleiades, the Hyades, Praesepe…) by the radius holding half its members. The 164 globular clusters are
        drawn as glows with their measured brightness and size, speckled with points that show how their light gathers to
        the middle (the points are illustrative, not their real stars). The 45 nebulae are photographs from ESO, ESA/Hubble,
        ESA/Webb and NSF NOIRLab placed at their measured distances and true sizes. A photograph is the view from Earth only,
        so from anywhere else it is drawn as a flat card facing the Sun: it fades away seen edge-on, and from the far side it
        shows the picture mirrored. Its brightness is set for display, as in a long-exposure photograph. Every picture in
        view carries its credit and a note of how it was changed, on its body card and in the corner of the view.
      </p>
      <p>
        At the centre is Sagittarius A*, a black hole of 4.3 million solar masses 27,000 light-years away, drawn as a black
        disc the size of its shadow, with the four stars whose orbits round it are published under an open licence (S2 goes
        round every 16 years). Other published orbits exist but are not licensed for reuse.
      </p>
      <TryRow>
        <Try run={() => runScene('milky-way-outside')}>See the Milky Way from outside</Try>
        <Try run={() => runScene('galactic-centre-orbits')}>Watch S2 go round</Try>
      </TryRow>

      <H3>Other galaxies</H3>
      <p>
        Beyond the Milky Way are 169 galaxies of the Local Group and its surroundings out to 3 million parsecs, from the Local
        Volume Database (Andromeda, Triangulum, the Magellanic Clouds and the dwarf galaxies round them, each at its measured
        distance), the nearby galaxies the Learn articles talk about (M81, M87, Centaurus A, the Sombrero and the Whirlpool),
        the Virgo, Coma and Bullet clusters, and three of the most distant galaxies confirmed (GN-z11 at redshift 10.6,
        JADES-GS-z14-0 at 14.18 and MoM-z14, at 14.44 the record).
      </p>
      <p>
        No galaxy but ours has been mapped in three dimensions, so each is drawn as a <b>model</b>: a few thousand points
        following the light of its type (a spiral, a barred or Magellanic spiral, an irregular, a dwarf spheroidal, an
        elliptical; the Sombrero as a disc dominated by its bulge), scaled to its measured size and brightness and tilted as
        it lies. Its arms, clumps and dust are typical of its type, not a map of that galaxy. Where a disc’s near side is not
        known the tilt drawn is one of two mirror images; where only its outline on the sky is measured, its depth is taken as
        its width. Each card says which. From Earth Andromeda is a tilted oval 3° long, six full Moons, at its real angle on the
        sky; from above it is a spiral. Seen from far off most galaxies are faint or invisible, as they would be to the eye.
      </p>
      <p>
        The young galaxies are placed where they are now, more than 30 billion light-years away as space has stretched. What
        you would see from there is their light of 13.5 billion years ago, the galaxy as it was a few hundred million years
        after the Big Bang: they are drawn that way, and what they have become since, nobody knows. Space has stretched while their light
        travelled and is stretching still, so they lie beyond the edge of reach: no ship could ever get there, not even light
        sent now (<LearnLink slug="the-edge-of-reach">The edge of reach</LearnLink> tells why).
      </p>
      <TryRow>
        <Try run={() => runScene('local-group')}>See the Local Group</Try>
        <Try run={() => runScene('go:andromeda')}>Go to Andromeda</Try>
      </TryRow>

      <H3>The cosmic web and the oldest light</H3>
      <p>
        <b>View › Cosmic web</b> shows 55,877 galaxies with measured distances (Cosmicflows-4) as a map, at their places now:
        walls and filaments round empty voids. Nearby each sits at its group’s measured distance, farther out at the distance
        its group’s redshift gives. From out there no galaxy is bright enough to see, so the points show where they
        are, orange for ellipticals, blue for spirals, sized by their infrared luminosity. It is a survey, not a census: most of
        its galaxies are in the northern galactic sky, almost none behind the Milky Way’s disc, and single distances are 15 to
        25% uncertain; its card says so. It shows by itself from beyond the Local Group. <b>View › CMB map</b> lays the
        cosmic microwave background over the sky: the oldest light there is, mapped by WMAP, blue colder and red warmer by up
        to 250 millionths of a kelvin. Its contrast is enhanced about 10,000 times: to the eye it is perfectly even.
      </p>
      <p>
        The universe expands with the clock. Run it billions of years ahead, or fly far, and the galaxies beyond the Local
        Group recede: each is held at its place in the expanding universe, so the space between them grows, while the Local
        Group, the groups and the clusters, held together by gravity, keep their size. Their light is the light that arrives:
        reddened and dimmed as space stretches it on the way, and in flight shifted again by your own motion; a galaxy’s card
        says how long ago that light left it and how much it was stretched. The background’s temperature falls as the
        universe grows, 2.72548 K now and 1.45 K ten billion years from now. The CMB map is the pattern seen from the Solar
        System today: from far away, or at another time, the sky shows a different shell of the early universe, so the map
        fades out.
      </p>
      <TryRow>
        <Try run={() => runScene('cosmic-web')}>See the cosmic web</Try>
        <Try run={() => runScene('cmb-map')}>Show the CMB map</Try>
      </TryRow>

      <H3>What is a model</H3>
      <p>Wherever you look, the card says what is measured and what is a model. In short:</p>
      <ul>
        <li>
          <b>The Milky Way seen from outside</b> is a model built from published measurements. Its points are not real stars,
          and its spiral arms are extrapolated beyond the parallax data.
        </li>
        <li>
          <b>Nebulae</b> are their photographs from Earth, at a brightness set for display. From anywhere else they are flat
          cards facing the Sun, mirrored when seen from behind.
        </li>
        <li>
          <b>Globular clusters</b> are glows with their measured brightness and size; the points speckling them are
          illustrative. <b>The S-stars</b> are drawn where their orbits carry them now, 27,000 years beyond the positions whose
          light we see.
        </li>
        <li>
          <b>Other galaxies</b> are modelled from their measured size, brightness and orientation, with the arms, clumps and dust
          typical of their type. Where a disc’s near side is not known, which side is nearer is assumed.
        </li>
        <li>
          <b>The young galaxies</b> are drawn as they were when the light we see left them, with the spectrum of a hot black body
          (their ultraviolet brightness standing in for their visible one), redshifted and dimmed by the expansion. In truth
          hydrogen in the young universe absorbed all their visible light: to the eye they are dark.
        </li>
        <li>
          <b>The cosmic web</b> places each galaxy of Cosmicflows-4 at its group’s measured distance nearby and at the distance
          of its group’s redshift farther out (a single galaxy’s measured distance is 15 to 25% uncertain), and the survey covers
          the sky unevenly: almost nothing behind the Milky Way’s disc.
        </li>
        <li>
          <b>The CMB map</b> is contrast enhanced about 10,000 times; to the eye the oldest light is perfectly even. It is the
          pattern seen from the Solar System today.
        </li>
        <li>
          <b>The expanding universe</b> follows the Planck 2018 cosmology. Galaxies beyond the Local Group are held at their
          places in it (their own motions are not followed), groups and clusters keep their size, and the redshift of their
          light is drawn as if it were a black body’s.
        </li>
        <li>
          <b>Planets of other stars</b> have illustrative colours, and often an assumed orientation.
        </li>
        <li>
          <b>Flights beyond the Local Group</b> assume a perfect engine and a destination that moves with the expansion of the
          universe.
        </li>
      </ul>
      <p>
        The full list is under{' '}
        <Ref page="about" to="limitations">
          Model limitations
        </Ref>{' '}
        on the About page.
      </p>

      <H3>Reading on</H3>
      <Reads list={OUT_THERE} />
    </Chapter>
  );
}

/** The rate steps, from clock.ts, in powers of ten and in words. */
function RateTable() {
  return (
    <table className="doc-tbl doc-tbl-narrow">
      <thead>
        <tr>
          <th>Rate</th>
          <th>One real second is</th>
        </tr>
      </thead>
      <tbody>
        {WARP_STEPS.map((w) => (
          <tr key={w}>
            <td className="doc-tbl-k">
              <P10 n={Math.round(Math.log10(w))} />
            </td>
            <td className="mono">{w === 1 ? '1 s (real time)' : formatDurationShort(w, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Time() {
  return (
    <Chapter
      id="time"
      n={chapterNo('time')}
      title="Time"
      lead="The simulation starts at the present moment and runs in real time. You can stop it, run it up to hundreds of millions of years a second, or jump to another date."
    >
      <H3>The date</H3>
      <p>
        The chip beside the name shows the instant being simulated, in UTC. It turns amber, with a dot, whenever that is not the
        present: while the clock is paused or running fast, and after a pause, a date you set or a flight, until <b>Now</b>{' '}
        brings it back. Point at it to see how exact the planets’ positions are at that date.
      </p>
      <p>
        Click it to type any date and time from 10,000 BCE to the end of 9999 (years −9999 to 9999 in astronomers’ numbering),
        or just a year: <i>1969</i>, <i>500 BCE</i>. Between 1700 and 2200 it also offers the next oppositions of Mars, Jupiter
        and Saturn, when each stands opposite the Sun in Earth’s sky and is near its closest. Press <b>Go to date</b> (or{' '}
        <Kbd>Enter</Kbd>): every body moves at once, both clocks on the instrument panel restart from zero and any light
        pulse still in flight is discarded. Spacecraft appear from their launch (Voyager 1 from 5 September 1977).
      </p>
      <KeyTable
        head={['Dates', 'Planet positions']}
        rows={[
          ['1700 to 2200', 'Precise: about an arcminute, checked against JPL’s DE405.'],
          ['3000 BCE to 3000 CE', 'Approximate: about half a degree, from JPL’s approximate orbital elements.'],
          ['Beyond', 'Illustrative: the orbits are right, the places along them are not.'],
        ]}
      />

      <H3>Rate</H3>
      <p>
        The rate is how much simulated time passes per real second. The arrows either side of it at the bottom left (or{' '}
        <Kbd>[</Kbd> and <Kbd>]</Kbd>, or <Kbd>,</Kbd> and <Kbd>.</Kbd>) step it from real time to{' '}
        {formatDurationShort(WARP_STEPS[WARP_STEPS.length - 1], 2)} a second, and it is written out in words, such as{' '}
        <i>2.8 h/s</i>. When time runs fast a lamp at the top of the view shows the power of ten and an amber border goes round
        the view. Journeys set the rate for you.
      </p>
      <RateTable />
      <p>
        However far time runs, the clock stays exact from the Big Bang, 13.8 billion years ago, to ten trillion years ahead;
        far from the present it simply advances in coarser steps.
      </p>

      <H3>The age of the universe</H3>
      <p>
        The clock is the universe’s clock too. Its date fixes the age of the universe, 13.8 billion years today, how far space
        has stretched since the Big Bang, and the temperature of the cosmic background radiation, from the standard model of
        cosmology with the Planck 2018 parameters. Run the clock billions of years ahead and the universe expands with it,
        whether or not you are flying, and a flight moves the clock on as it goes. The Local Group, held together by its own
        gravity, does not take part in the expansion. The bodies themselves do not age: more than ten million years from the
        present the Sun, the planets, the stars and the nebulae are still drawn as they are today. Their cards say so, and
        for times ahead they say what the Sun and the Earth will have become.
      </p>

      <H3>In flight</H3>
      <p>
        A flight plays by the clock on board. The same arrows then set how much of your time passes each second, shown as, say,{' '}
        <i>1 s = 3.4 months aboard</i>; the clock at home follows from the trip. By default any trip plays in about{' '}
        {Math.round(TRIP_PLAYBACK_S)} seconds, and never slower than real time on board. The fictional faster-than-light drive
        has no time on board, so it follows the ordinary rate.
      </p>

      <H3>Pause and Now</H3>
      <p>
        <Kbd>Space</Kbd> or <Kbd>P</Kbd> pauses and resumes (in free flight only <Kbd>P</Kbd>, since Space is up). <b>Now</b>{' '}
        (<Kbd>N</Kbd>) returns to the present at real time and restarts both clocks on the instrument panel from zero. It is
        unavailable during a flight: a traveller’s clock cannot be wound back.
      </p>

      <H3>Two clocks</H3>
      <p>
        Section B of the instrument panel holds two clocks. <i>t</i> is <i>coordinate time</i>, kept by clocks at rest relative
        to the Sun. <i>τ</i> is <i>proper time</i>, kept by a clock travelling with you. Even while you orbit Earth, <i>τ</i>{' '}
        falls behind <i>t</i> by about 5 parts in <P10 n={9} />, because Earth carries you round the Sun at 30 km/s. In flight
        the difference grows to minutes, hours or years. <b>Zero</b> sets both clocks to zero.
      </p>
    </Chapter>
  );
}

function Flying() {
  return (
    <Chapter
      id="flying"
      n={chapterNo('flying')}
      title="Journeys and flights"
      lead="A flight is a physical journey: a straight line through space at 1 g or at a speed you choose, with clocks that obey relativity, and beyond the Local Group through space that expands as you go. Journeys are flights and scenes set up for you."
    >
      <H3>Journeys</H3>
      <p>
        <b>Journeys</b> in the header lists {countWord(JOURNEYS.length)} set pieces. Each is one click: the camera is placed, the clock is set, and a
        line says what to look for. Flights leave from Earth and show their predicted times, by Earth’s clocks and by yours,
        before you go.
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
        <b>Fly here</b> on a body’s card and <b>Fly</b> in Where to? open the flight planner set to a 1 g rocket to that body.{' '}
        <Kbd>G</Kbd> opens it for the selected body, with the drive and speed chosen last. You leave from wherever the camera is, and the planner aims at the
        point where the destination will be when you arrive, not where it is now. A flight ends a few radii from a planet, a
        moon or a star; to a galaxy, a cluster or a nebula it goes in almost to the centre, and the view then pulls back to show the
        whole of it. Press <b>Ignite</b> (or <b>Execute</b> for a constant speed) to go.
      </p>
      <TryRow>
        <Try run={planFlight('mars', 0.5)}>Plan a flight to Mars at 0.5c</Try>
      </TryRow>

      <H3>Three drives</H3>
      <KeyTable
        head={['Drive', 'What it does']}
        rows={[
          [
            'Flip-and-burn',
            'A rocket that accelerates at one Earth gravity (or at 0.1, 2 or 10 g, if you choose), turns round halfway and decelerates, arriving at rest. A real rocket could in principle fly this, and at 1 g the crew would feel their normal weight all the way. In expanding space the turn comes after the halfway point, since the expansion also slows the ship. You can set a limit on the time on board: a longer flight is refused.',
          ],
          [
            'Constant speed',
            'Jumps instantly to the chosen speed, coasts, and stops instantly on arrival. Idealised, but the clock readings between the jumps are exact. Through expanding space it cannot simply coast: it burns up to the speed at the chosen acceleration, holds it against the expansion, and brakes.',
          ],
          [
            <span key="w" className="!text-hazard">
              Superluminal (fiction)
            </span>,
            'Faster than light, for comparison only. The planner and the view are hatched in red, time on board is undefined, and nothing is recorded.',
          ],
        ]}
      />

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
        the path as measured on the ship; and how long light would take over the same path. For rocket flights it adds the
        peak speed and the mass ratio a perfect photon rocket would need. The worldline preview plots the trip on a spacetime
        diagram in which light travels at 45°. Flights through expanding space have numbers of their own, and a plot of the
        two clocks in place of the worldline (below).
      </p>

      <H3>In flight</H3>
      <p>
        A panel along the bottom of the view shows where you are going, a progress bar and four big numbers: your <b>speed</b>{' '}
        as a fraction of <i>c</i>, with as many nines as it has, and the Lorentz factor <i>γ</i> under it; <b>your clock</b>,
        the time passed on board; the time passed <b>at home</b>, with the date there on long trips; and the distance still to
        go, with how long light would take to cover it. On a journey it also says what to look for.
      </p>
      <p>
        Drag to look around, or use <b>Ahead</b> and <b>Astern</b>. The arrows beside <i>1 s = …</i> set the pace (
        <Ch to="time" />). <b>Skip to arrival</b> advances the clocks to the end of the trip, and the readings stay
        exact. <b>Abort</b> stops the ship where it is (instantly, which no real ship could do). <b>Details</b> opens the full
        flight recorder: both clocks to more figures, their difference, the distance left measured in the Sun’s frame and in
        yours, a ruler of the path, and the optics. You can still select bodies and read their cards, but the camera stays with
        the ship.
      </p>
      <p>
        On arrival a card sums the trip up: for example, <i>Arrived at Saturn. The trip took 34 min for you and 1 h 18 min at
        home.</i> After a trip of a year or more at home it adds how much older you are and the date at home.
      </p>
      <p>
        Inside the Milky Way space is taken as static: the flights are special relativity, with no expansion of the universe to
        allow for (it does not stretch gravitationally bound systems). A 1 g flight to the black hole at the centre takes about
        20 years by your clock and about 27,000 years at home. The same holds within the Local Group: a 1 g flight to
        Andromeda takes about 29 years aboard and 2.5 million years at home. Farther out, the expansion of the universe matters.
      </p>
      <GuideFlightsBeyond />
      <Note title="Faster than light" tone="hazard">
        Nothing with mass can reach <i>c</i>: the energy needed grows without limit as <i>β</i> approaches 1. The superluminal
        drive exists to show why. During it the Lorentz factor is imaginary, time on board has no meaning, and some observers
        would reckon that you arrived before you left. <LearnLink slug="nothing-outruns-light">Why nothing outruns light</LearnLink>{' '}
        tells the story.
      </Note>
    </Chapter>
  );
}

/** The Learn articles about what you see, in the order to read them. */
interface Reading {
  slug: string;
  title: string;
  what: string;
}

const SEEING: Reading[] = [
  { slug: 'light-takes-time', title: 'Light takes time', what: 'Why nothing you see is current, and how the speed of light was first timed.' },
  { slug: 'how-big-is-the-solar-system', title: 'How big is the Solar System?', what: 'The scale of it all, and why the planets are specks at true scale.' },
  { slug: 'nothing-outruns-light', title: 'Why nothing outruns light', what: 'The Lorentz factor, the energy cost of each extra nine, and what faster than light would break.' },
  { slug: 'time-dilation', title: 'Time dilation is real', what: 'Why your clock falls behind Earth’s in flight, the twin paradox, and the experiments that prove it.' },
  { slug: 'seeing-near-light-speed', title: 'What you would see near the speed of light', what: `Aberration, the Doppler shift and beaming: the sky of Figure ${chapterNo('seeing')}.1.` },
  { slug: 'rockets-to-the-stars', title: 'Rockets to the stars', what: 'The 1 g flip-and-burn, and the fuel it would need.' },
];

/** A list of Learn articles, each with a line on what it tells. */
function Reads({ list }: { list: readonly Reading[] }) {
  useArticles(); // the list follows the article index as articles are added
  return (
    <dl className="doc-dl">
      {list.map((a) => {
        const meta = findArticle(a.slug);
        return (
          <div key={a.slug}>
            <dt>{meta ? <LearnLink slug={a.slug}>{meta.title}</LearnLink> : <span className="text-fg-3">{a.title} (coming soon)</span>}</dt>
            <dd>{a.what}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Seeing() {
  return (
    <Chapter
      id="seeing"
      n={chapterNo('seeing')}
      title="What you are seeing"
      lead="Near the speed of light the sky and the clocks behave strangely, and every bit of it is real physics. Learn tells the full stories; this chapter points to them."
    >
      <Reads list={SEEING} />
      <TryRow>
        <button type="button" className="doc-try" onClick={() => openLearn()}>
          <span className="doc-try-k">Learn</span>
          <span className="doc-try-t">All the articles</span>
        </button>
      </TryRow>

      <H3>The sky in flight</H3>
      <p>
        Your motion tilts the light coming in, the way rain seems to come from ahead when you run through it. At 0.9<i>c</i> the
        whole forward half of the sky fits within 26° of the point you are heading for (Figure {chapterNo('seeing')}.1); at
        0.999<i>c</i>, within 2.6°. Light from ahead is shifted to the blue and brightened, and the sky behind fades to red. The
        glow of the Milky Way, the nebulae and the galaxies change in the same way as the stars.
      </p>
      <Fig
        n={`${chapterNo('seeing')}.1`}
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
        <b>View › Optics</b> offers three models: <b>Relativistic</b>; <b>Classical</b>, which draws the sky as it is in the
        Sun’s frame; and <b>Split</b> (<Kbd>X</Kbd>), with classical on the left and relativistic on the right of a divider you
        can drag. <Kbd>Z</Kbd> switches between classical and relativistic. All three look the same at rest: the difference
        appears in flight, above 0.01<i>c</i>. To see the crowding on its own, turn off <i>Doppler shift and beaming</i> in
        section D of the instrument panel.
      </p>
      <TryRow>
        <Try run={() => useUI.setState({ relMode: 'split' })}>Split the view (for your next flight)</Try>
      </TryRow>
      <p>
        With <b>View › Physics hints</b> on, a note in the corner points to the right article the first time each of these
        things happens. For students, the lab’s <b>Reference</b> tab has the same physics in ten short sections with their
        equations (<Ch to="lab" />).
      </p>
    </Chapter>
  );
}

function Readings() {
  return (
    <Chapter
      id="readings"
      n={chapterNo('readings')}
      title="Readings"
      lead="The card tells you about a body; the instrument panel gives every number, several times a second. Open it from View › Instrument panel, from Details on a card, or with I. Its sections are lettered; click a heading to fold it."
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
              ['B', 'Chronometers', `Coordinate time t, your proper time τ, their difference and their ratio (Chapter ${chapterNo('time')}).`],
              ['C', 'Target', 'For the selected body: range, light-time, range rate, angular size and brightness; in motion, its angle from the apex in both frames and its Doppler factor; physical data and a short description. Buttons slew the camera, plan a flight, or emit a light pulse from the body.'],
              ['D', 'Relativistic optics', 'Whether the relativistic view is active; the Doppler factor ahead, abeam and astern; the angle within which the forward half of the sky appears; the colour temperature of the Sun if it lay dead ahead; the reticle’s spectrometer reading.'],
              ['E', 'Light-time', 'How old your view of Earth is, how long a signal to Earth would take, and how long ago the sunlight reaching you left the Sun.'],
              ['F', 'Spacetime diagram', 'In flight through static space only: your worldline, with ticks of ship time and your current line of simultaneity.'],
              ['G', 'Ephemeris', 'The distance from the Sun and from you, and the light-time, of the Sun, the planets, Pluto, the Moon, Voyager 1, the stars of the named systems, the moons of the system in view, and the target. Click a row to select the body.'],
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
        <Try run={() => useUI.setState({ rightOpen: true })}>Open the instrument panel</Try>
      </TryRow>

      <H3>In the view</H3>
      <KeyTable
        rows={[
          ['Body card', 'Top right, for the selected body: what it is, its range and light-time, three facts, and Go there, Fly here, Read and Details. × closes it; the next selection brings it back.'],
          ['Flight panel', <>Along the bottom in flight: speed, your clock, the clock at home and the distance left (<Ch to="flying" />).</>],
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
      n={chapterNo('lab')}
      title="For students: the lab"
      lead="The lab turns the simulator into apparatus. Five experiments are laid out like a university lab script, and the program does the bookkeeping. Anyone else can skip this chapter: the lab never opens by itself."
    >
      <H3>Opening the lab</H3>
      <p>
        Press <b>Lab</b> in the header (on screens 640 pixels wide or more), or <Kbd>K</Kbd>; the same way closes it. It is also
        at the end of the Learn shelves and at the foot of the welcome screen. The lab opens on the left, on its{' '}
        <b>Experiments</b> tab. Its other tabs are <b>Notebook</b>, where your readings are kept, and <b>Reference</b>, the
        physics behind what you see in ten short sections with equations.
      </p>
      <p>
        The lab keeps every constant-speed and rocket flight as a reading, whether or not it is open. Once you have opened it,
        the arrival card also says which experiment logged the flight, and the planner says which experiment will. Flights
        through expanding space are not logged: the experiments are about special relativity.
      </p>
      <TryRow>
        <Try run={() => openLab()}>Open the lab</Try>
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
      <p>
        Constant-speed flights are logged by Experiment 2 and rocket flights by Experiment 5. Journeys count too. Flights with
        the fictional drive, and flights through expanding space, are never logged.
      </p>
      <TryRow>
        <Try run={startExperiment1}>Open Experiment 1</Try>
      </TryRow>

      <H3>Anatomy of an experiment</H3>
      <p>
        Every experiment page has the same eight sections: Aim, Background (the theory, with numbered equations), Apparatus,
        Procedure, Observations, Analysis, Questions and Conclusion. The first three are reading. Figure {chapterNo('lab')}.1 shows how the rest
        fit together.
      </p>
      <Fig n={`${chapterNo('lab')}.1`} caption="Working through an experiment, from the procedure to the report.">
        <WorkflowFigure />
      </Fig>

      <H3>Following the procedure</H3>
      <p>
        Procedure steps tick themselves off when the simulation reaches the state they ask for: the right rate, a pulse emitted,
        five speeds recorded. Many steps have a button that sets the apparatus up for you. The small boxes beside each
        experiment in the list show how far you have got, and the <b>Next step</b> box at the top of each experiment shows the
        one you are on. Where a step asks for a rate such as <P10 n={2} />, step the rate with <Kbd>]</Kbd> or the footer’s
        arrows until its lamp shows that power of ten.
      </p>

      <H3>Recording data</H3>
      <p>
        Experiments 1, 2 and 5 record by themselves: every detector that registers a pulse (1), every constant-speed flight that
        arrives (2), and samples along every rocket flight (5). Experiments 3 and 4 need you to take readings: open the experiment,
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
        <Try run={() => openLab('notebook')}>Open the notebook</Try>
      </TryRow>
    </Chapter>
  );
}

function Controls() {
  return (
    <Chapter
      id="controls"
      n={chapterNo('controls')}
      title="Keyboard and mouse"
      lead="Single-key shortcuts work whenever you are not typing in a field. Press ? at any time for this list on one sheet. If the keys clash with assistive software, turn them off in View › Single-key shortcuts (or on the keys sheet); Ctrl+K still opens Where to?."
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
        <Kbd>Tab</Kbd> moves between controls. Within a set of options, such as the optics models, the arrow keys move the
        choice. In Where to?, the arrow keys move through the list. <Kbd>Esc</Kbd> closes menus, dialogs and this guide. A panel
        edge takes focus too: the arrow keys resize it, and <Kbd>Home</Kbd> resets it.
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
      'I can’t see the galaxies',
      <>
        Seen from far off most galaxies are too faint to see, as they would be to the eye. Go closer (<b>Where to?</b> finds
        any of them by name), or turn on <b>View › Cosmic web</b> to see where they are as a map.
      </>,
    ],
    [
      'I’m lost',
      <>
        <Kbd>H</Kbd> takes the camera back to Earth, <b>Solar System</b> at the bottom of the screen shows the whole system, and{' '}
        <Kbd>N</Kbd> sets the clock back to the present. <Kbd>Esc</Kbd> leaves free flight. A journey always starts from a
        known place.
      </>,
    ],
    [
      'The date is amber',
      <>
        It is not the present: the clock is paused, running fast, set to another date, or behind after a pause or a flight.
        Press <Kbd>N</Kbd> (or <b>Now</b>) to come back.
      </>,
    ],
    [
      'A journey will not start',
      <>
        Journeys wait until you are not in flight: finish the current trip with <b>Skip to arrival</b>, or <b>Abort</b> it, on
        the flight panel.
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
        Readings by hand belong to Experiments 3 and 4, so one of them must be open under Lab › Experiments. Experiment 3 needs
        you to be moving, which means in flight. Experiment 4 needs a selected body and a moving observer: a flight, or an orbit
        round a planet, which carries you with it (not the Sun, which is at rest). In free flight <Kbd>R</Kbd> moves you up
        instead, and it does nothing while keyboard shortcuts are off; use the <b>Record</b> button. The message in the top-left
        corner of the view says what is missing.
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
        In this browser’s local storage (<Ch to="lab" />). Export it before clearing your browsing data or moving
        to another computer.
      </>,
    ],
  ];
  return (
    <Chapter id="troubleshooting" n={chapterNo('troubleshooting')} title="Troubleshooting" lead="Common problems and what to do about them.">
      {faq.map(([q, a]) => (
        <div key={q}>
          <H3>{q}</H3>
          <p>{a}</p>
        </div>
      ))}
      <H3>Starting again</H3>
      <p>
        The button below resets the layout, the display settings and the welcome screen, and reloads the page. It keeps your
        notebook; to delete readings as well, use <b>Clear notebook</b> in the lab’s Notebook tab.
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
  ['Astronomical unit (au)', 'A defined length, 149,597,870.7 km, close to the mean distance from Earth to the Sun: about 8 minutes 19 seconds of light-time.'],
  [<><i>β</i> (beta)</>, <>Speed as a fraction of the speed of light, <i>v</i>/<i>c</i>.</>],
  ['Beaming', 'The brightening of light from ahead, and dimming of light from behind, seen by a fast observer.'],
  ['Comoving distance', 'The distance between two galaxies carried along by the expansion, with the expansion taken out: their distance at any moment divided by the scale factor then. Today it is their distance now.'],
  [<>Coordinate time, <i>t</i></>, 'Time kept by clocks at rest in the Sun’s frame S: the clock “at home”.'],
  ['Cosmic event horizon', 'The distance beyond which light sent today will never arrive, because the expansion of the universe is speeding up: about 16.6 billion light-years. No ship can reach anything beyond it.'],
  ['Cosmic microwave background (CMB)', 'The oldest light there is, set free about 370,000 years after the Big Bang and stretched since into microwaves; it fills the sky at 2.725 K.'],
  ['Cosmic time', 'Time since the Big Bang, as kept by clocks at rest in the expanding universe: 13.8 billion years today. On flights through expanding space it is the clock at home.'],
  ['Cosmic web', 'The pattern of galaxies on the largest scales: walls and filaments round nearly empty voids.'],
  [<>Doppler factor, <i>D</i></>, <>The ratio of observed to emitted frequency. <i>D</i> greater than 1 is a blueshift.</>],
  ['Ecliptic', 'The plane of Earth’s orbit, and the circle it traces on the sky; the reference plane for the coordinates used here.'],
  ['Epoch', 'The instant being simulated: the date on the chip in the header.'],
  ['Frame, S and S′', 'S is the rest frame of the Sun; S′ is the frame moving with the observer.'],
  [<><i>γ</i> (gamma), Lorentz factor</>, <>1/√(1 − <i>β</i><sup className="sup">2</sup>): the factor by which moving clocks run slow and moving lengths contract.</>],
  ['Journey', `One of the ${countWord(JOURNEYS.length)} set pieces under Journeys: a flight from Earth, or a scene with the clock set, with a line on what to look for.`],
  [<>Lambda-CDM (<i>Λ</i>CDM)</>, 'The standard model of cosmology: a flat universe of ordinary matter, cold dark matter and dark energy in the form of a cosmological constant, Λ. Lightspeed uses it with the values measured by the Planck satellite (2018).'],
  ['Light-time', 'How long light takes to cover a given distance.'],
  ['Light-year (ly)', <>The distance light travels in a Julian year, 9.46 × 10<sup className="sup">12</sup> km.</>],
  ['Local Group', 'The Milky Way, Andromeda, Triangulum and dozens of smaller galaxies, held together by gravity within about a megaparsec; inside it space does not expand.'],
  ['Opposition', 'The time when a planet stands opposite the Sun in Earth’s sky, near its closest to Earth.'],
  ['Parsec (pc)', 'The distance at which one astronomical unit spans one second of arc: 3.26 light-years. A kiloparsec (kpc) is a thousand parsecs, a megaparsec (Mpc) a million.'],
  [<>Proper time, <i>τ</i> (tau)</>, 'Time kept by a clock travelling with the observer: “your clock”.'],
  [<>Rapidity, <i>φ</i> (phi)</>, <>artanh <i>β</i>: a measure of speed that adds simply for successive boosts along a line, and grows in proportion to proper time at constant acceleration.</>],
  [<>Redshift, <i>z</i></>, <>How much light has been stretched on its way: 1 + <i>z</i> is the wavelength received over the wavelength sent. For distant galaxies most of it is the expansion of space.</>],
  [<>Reduced chi-squared, <i>χ</i><sup className="sup">2</sup>/<i>ν</i></>, 'The sum of squared residuals, each divided by its variance, over the degrees of freedom. About 1 for a good fit with honest error bars.'],
  [<>Scale factor, <i>a</i></>, 'How far space has stretched: distances between galaxies far apart grow in proportion to it. It is 1 today.'],
  ['Simulation rate', <>Simulated seconds per real second, from 1 to {rich(`10${superscript(Math.round(Math.log10(WARP_STEPS[WARP_STEPS.length - 1])))}`)}.</>],
  ['True scale', 'Every body drawn at its real size and at its real distance.'],
  ['Worldline', 'The path of an object through spacetime.'],
];

function Glossary() {
  return (
    <Chapter id="glossary" n={chapterNo('glossary')} title="Glossary">
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

/** The featured destinations, named as in Where to?, for the guide's opening line. */
function featuredNames(): string {
  const names = FEATURED_IDS.map((id) => findDestination(id)?.name).filter(Boolean) as string[];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

export default function GuideDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Guide</div>
        <h1>Exploring with Lightspeed</h1>
        <p>
          How to look around, fly and find your way, from the Moon to the cosmic web, and what everything on the screen does.
          Chapter {chapterNo('lab')} is for students using the lab.
        </p>
      </header>
      <Welcome />
      <QuickStart />
      <Screen />
      <Looking />
      <Universe />
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

