/**
 * The laboratory manual: aim, background, apparatus, procedure and questions for each
 * experiment. Procedure steps carry a check that ticks them off from the simulation state,
 * and some carry an action that sets the apparatus up.
 *
 * Physics and history references: Taylor & Wheeler, Spacetime Physics (2nd ed., 1992);
 * Rindler, Relativity: Special, General, and Cosmological (2nd ed., 2006); J. R. Taylor,
 * An Introduction to Error Analysis (2nd ed., 1997).
 */
import type { ReactNode } from 'react';
import { Vector3 } from 'three';
import { AU_KM, type BodyId } from '../physics/constants';
import { controller } from '../controls/cameraController';
import { setPaused, setWarp } from '../sim/clock';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { useUI, type UIState } from '../state/ui';
import { Eq, M } from '../ui/TeX';
import { emitLightPulse, labFlags } from './logger';
import { num, type DataRow, type ExperimentId } from './notebook';

export interface StepCtx {
  rows: DataRow[];
  ui: UIState;
}

export interface Step {
  text: ReactNode;
  done: (c: StepCtx) => boolean;
  action?: { label: string; run: () => void };
  /** Not needed to finish the experiment (the "next step" guide passes over it). */
  optional?: boolean;
}

export interface ManualEntry {
  aim: ReactNode;
  background: ReactNode;
  apparatus: ReactNode[];
  procedure: Step[];
  questions: ReactNode[];
  /** Typical time needed. */
  duration: string;
}

// ─── Shared step helpers ─────────────────────────────────────────────────────────────────

const tripDrive = () => travel.trip?.drive ?? null;
const distinct = (rows: DataRow[], key: string, digits = 4) => new Set(rows.map((r) => num(r, key).toPrecision(digits))).size;

function openPlanner(dest: BodyId, drive: 'cruise' | 'rocket', beta?: number) {
  if (useUI.getState().tripActive) return;
  useUI.setState({ plannerOpen: true, plannerDest: dest, plannerDrive: drive, ...(beta ? { plannerBeta: beta } : {}) });
}

function frameInnerSystem() {
  if (useUI.getState().tripActive) return;
  useUI.getState().select('sun');
  controller.goTo('sun', { distance: 13 * AU_KM, direction: new Vector3(0.2, 1, 0.35) });
}

// ─── Experiment 1 ────────────────────────────────────────────────────────────────────────

const E1: ManualEntry = {
  duration: '15 min',
  aim: (
    <p>
      Determine the speed of light by timing a light pulse from Earth to other bodies of the Solar System, and test
      whether path length and time of flight are proportional.
    </p>
  ),
  background: (
    <>
      <p>
        In 1676 Ole Rømer noticed that eclipses of Jupiter’s moon Io came later when Earth was farther from Jupiter, and
        concluded that light takes a finite time to cross the extra distance. Modern time-of-flight measurements, such
        as lunar laser ranging and spacecraft radio ranging, use the same principle. A pulse covering a path of length{' '}
        <M t="d" /> in a time <M t="\Delta t" /> has travelled at
      </p>
      <Eq n="1.1" tex="c = \frac{d}{\Delta t}." />
      <p>
        The pulse leaves Earth’s position <M t="\mathbf r_\oplus(t_0)" /> at time <M t="t_0" /> and spreads as a sphere of
        radius <M t="c(t - t_0)" /> in the Sun’s rest frame S, whatever Earth’s own motion (Einstein’s second postulate).
        The detector on body B registers it at the time <M t="t_1" /> that solves
      </p>
      <Eq n="1.2" tex="\left|\mathbf r_B(t_1) - \mathbf r_\oplus(t_0)\right| = c\,(t_1 - t_0)." />
      <p>
        The receiver moves during the flight, so <M t="d" /> is measured to where B is on arrival. Fit the straight line
      </p>
      <Eq n="1.3" tex="d = a + b\,\Delta t" />
      <p>
        by least squares. The slope <M t="b" /> estimates <M t="c" />, and the intercept <M t="a" /> should be zero within its
        uncertainty. With uncertainties <M t="\sigma_i" /> on each reading, the weighted slope and its standard error are
      </p>
      <Eq
        n="1.4"
        tex="\begin{aligned} b &= \frac{\sum_i w_i (x_i-\bar x)(y_i-\bar y)}{\sum_i w_i (x_i-\bar x)^2}, \\[2pt] \sigma_b^2 &= \frac{1}{\sum_i w_i (x_i-\bar x)^2}, \qquad w_i = \sigma_i^{-2}. \end{aligned}"
      />
      <div className="note">
        <span className="note-t">Note</span>
        Since 1983 the metre has been defined so that <M t="c = 299\,792\,458\ \mathrm{m\,s^{-1}}" /> exactly. A
        time-of-flight measurement therefore really calibrates distance, which is how spacecraft are ranged today.
      </div>
    </>
  ),
  apparatus: [
    'Pulse emitter, fired from any body’s current position or from the observer.',
    'Photodetectors on all thirteen bodies. Each time-stamps the arrival in S coordinate time; the crossing is solved to 0.1 µs.',
    'Ephemeris rangefinder: distance from the emission point to the detector at arrival.',
    <>
      Simulation clock with rate control, 10<sup>0</sup> to 10<sup>6</sup>.
    </>,
    <>
      Simulated uncertainty (optional): <M t="\sigma_t = 0.3\ \mathrm{s} + 2\times10^{-4}\,\Delta t" />,{' '}
      <M t="\sigma_d = 2000\ \mathrm{km} + 5\times10^{-4}\,d" />.
    </>,
  ],
  procedure: [
    {
      text: 'Frame the inner Solar System from above the ecliptic, so that the orbits of Mars and Jupiter are in view.',
      done: ({ ui }) => ui.focus === 'sun' && sim.bodies.sun.distCamera > 6 * AU_KM && sim.bodies.sun.distCamera < 60 * AU_KM,
      action: { label: 'Frame view', run: frameInnerSystem },
    },
    {
      text: (
        <>
          Set the simulation rate to 10² (press <kbd className="kbd">]</kbd> twice). The pulse front will reach 1 au in about
          5 s of real time.
        </>
      ),
      done: ({ ui }) => ui.warp >= 100 && !ui.paused,
      action: {
        label: 'Rate 10²',
        run: () => {
          setWarp(100);
          setPaused(false);
        },
      },
    },
    {
      text: 'Emit a pulse from Earth with the emitter under Observations (or Instruments › Target › Emit pulse). The cyan circle is the front’s cross-section in the ecliptic plane; the faint circle is its outline on the sky.',
      done: ({ rows }) => labFlags.pulsesEmitted > 0 || rows.length > 0,
      action: { label: 'Emit from Earth', run: () => emitLightPulse('earth') },
    },
    {
      text: 'Each detector logs its reading when the front arrives. Raise the rate to 10³–10⁴ once Mars has been detected. Collect at least six readings, including one beyond 5 au.',
      done: ({ rows }) => rows.length >= 6 && rows.some((r) => num(r, 'd') > 5 * AU_KM),
      action: { label: 'Rate 10³', run: () => setWarp(1000) },
    },
    {
      text: 'Optional: switch on simulated uncertainty (Observations) and repeat with a second pulse. Compare χ²/ν and the error on the slope.',
      optional: true,
      done: ({ rows }) => rows.some((r) => !!r.s),
    },
    {
      text: 'In Analysis, read the fitted slope with its standard error and compare with the defined value of c. Inspect the residuals.',
      done: ({ rows }) => rows.length >= 3,
    },
  ],
  questions: [
    <>
      The Sun is detected about 8 min 19 s after emission, but not at exactly <M t="1\ \mathrm{au}/c = 499.005\ \mathrm{s}" />. Why?
    </>,
    <>
      Estimate how far Jupiter moves while the pulse is in flight. How large an error would you make by using its distance at
      emission instead of at arrival?
    </>,
    <>
      Rømer’s contemporaries estimated a delay of 22 minutes across the diameter of Earth’s orbit. What delay does your result
      predict, and what value of <M t="c" /> did 22 minutes imply?
    </>,
    <>Why can this experiment not distinguish a change in the speed of light from a mis-calibrated clock or ruler?</>,
  ],
};

// ─── Experiment 2 ────────────────────────────────────────────────────────────────────────

const E2: ManualEntry = {
  duration: '15 min',
  aim: (
    <p>
      Compare the time elapsed on board a spacecraft with the time elapsed in the Sun’s frame for trips at different
      constant speeds, and test the prediction <M t="\Delta\tau = \Delta t\sqrt{1-\beta^2}" />.
    </p>
  ),
  background: (
    <>
      <p>
        A clock carried along a worldline measures its proper time. In an inertial frame S in which the clock moves at speed{' '}
        <M t="v = \beta c" />,
      </p>
      <Eq n="2.1" tex="d\tau = dt\,\sqrt{1 - v^2/c^2}." />
      <p>For a trip at constant speed this integrates to</p>
      <Eq n="2.2" tex="\Delta\tau = \Delta t\,\sqrt{1-\beta^2} = \frac{\Delta t}{\gamma}, \quad \gamma = \frac{1}{\sqrt{1-\beta^2}}" />
      <p>
        The ship clock reads less than the clocks of S on arrival. This is not symmetric between the traveller and Earth: the
        ship changes inertial frame when it departs and again when it stops, and the clocks of S do not. Taking logarithms of
        (2.2) gives a linear relation,
      </p>
      <Eq n="2.3" tex="\ln\frac{\Delta\tau}{\Delta t} = p\,\ln(1-\beta^2), \qquad p = \tfrac12," />
      <p>
        so a plot of <M t="\ln(\Delta\tau/\Delta t)" /> against <M t="\ln(1-\beta^2)" /> is a line through the origin with slope ½.
      </p>
      <div className="note">
        <span className="note-t">Model</span>
        The constant-speed drive boosts instantly to <M t="\beta" /> at departure and stops instantly on arrival. Real engines
        cannot do this (see Experiment 5), but the clock readings between the boosts are exact.
      </div>
    </>
  ),
  apparatus: [
    'Flight planner with the constant-speed drive (straight line in S, aimed at where the target will be on arrival).',
    <>
      Ship chronometer (proper time <M t="\tau" />) and the coordinate clocks of S (<M t="\Delta t" />).
    </>,
    <>
      Flight recorder (in transit) and trial report: <M t="\Delta t" /> and <M t="\Delta\tau" /> are logged on every
      arrival.
    </>,
    <>
      Simulated uncertainty (optional): <M t="\sigma = 0.1\,\%" /> on each clock reading.
    </>,
  ],
  procedure: [
    {
      text: (
        <>
          Open the flight planner (<kbd className="kbd">G</kbd>) and choose a distant destination. Proxima Centauri gives trips
          of years; Neptune gives hours.
        </>
      ),
      done: ({ ui, rows }) => ui.plannerOpen || ui.tripActive || rows.length > 0,
      action: { label: 'Planner → Proxima', run: () => openPlanner('proxima', 'cruise', 0.5) },
    },
    {
      text: 'Select the constant-speed drive, enter β = 0.5 and execute.',
      done: ({ rows }) => tripDrive() === 'cruise' || rows.length > 0,
    },
    {
      text: 'Skip to arrival. The clocks are integrated exactly, so skipping does not affect the readings. The trial is logged on arrival.',
      done: ({ rows }) => rows.length >= 1,
    },
    {
      text: 'Repeat for at least five speeds between 0.1 and 0.9999, for example 0.1, 0.5, 0.8, 0.9, 0.99 and 0.999. From Proxima, fly back to Earth or on to another body.',
      done: ({ rows }) => distinct(rows, 'beta') >= 5,
    },
    {
      text: 'Compare Fig. 2.1 with eq. (2.2), then fit the linearised plot (Fig. 2.2) and compare the exponent with ½.',
      done: ({ rows }) => rows.length >= 5,
    },
  ],
  questions: [
    <>At what speed does the crew age at half the rate of Earth? Check it with a trial.</>,
    <>
      For your trip to Proxima Centauri at <M t="\beta = 0.99" />, how much younger than a stay-at-home twin is the traveller on
      arrival?
    </>,
    <>
      Muons made by cosmic rays about 15 km up have a mean lifetime of 2.2 µs at rest. With <M t="\gamma = 10" />, how far do
      they travel in one mean lifetime, as measured on the ground?
    </>,
    <>The idealised drive needs infinite acceleration at departure. Why does that not change the clock readings in this model?</>,
  ],
};

// ─── Experiment 3 ────────────────────────────────────────────────────────────────────────

const E3: ManualEntry = {
  duration: '20 min',
  aim: (
    <p>
      Measure the Doppler factor of light arriving from different directions while moving at high speed. Verify its angular
      dependence, and determine your speed from the Doppler data alone.
    </p>
  ),
  background: (
    <>
      <p>
        Light of frequency <M t="\nu" /> in S reaches an observer moving at <M t="\beta" /> with frequency{' '}
        <M t="\nu' = D\,\nu" />. For a line of sight at angle <M t="\theta'" /> from the apex (the direction of motion), measured
        in the observer’s frame S′,
      </p>
      <Eq n="3.1" tex="\begin{aligned} D = \frac{\nu'}{\nu} &= \frac{1}{\gamma\,(1-\beta\cos\theta')} \\ &= \gamma\,(1+\beta\cos\theta). \end{aligned}" />
      <p>
        Dead ahead, <M t="D = \sqrt{(1+\beta)/(1-\beta)} = e^{\varphi}" />, where <M t="\varphi = \operatorname{artanh}\beta" /> is
        the rapidity. At <M t="\theta' = 90^\circ" />, <M t="D = 1/\gamma" />: light arriving at right angles is redshifted by
        time dilation alone. This is the transverse Doppler effect, first measured by Ives and Stilwell in 1938. Inverting (3.1),
      </p>
      <Eq n="3.2" tex="\frac1D = \gamma - \gamma\beta\cos\theta'," />
      <p>
        which is linear in <M t="\cos\theta'" />. The intercept is <M t="\gamma" /> and <M t="\beta = -\text{slope}/\text{intercept}" />.
      </p>
    </>
  ),
  apparatus: [
    <>
      Spectrometer at the reticle (centre of the view). It reports <M t="\theta'" />, the angle between the line of sight and the
      apex in S′, and <M t="D" />.
    </>,
    'APEX / ANTAPEX markers in the view (overlays on).',
    <>
      Constant-speed drive and speedometer (<M t="\beta" />).
    </>,
    <>
      Simulated uncertainty (optional): <M t="\sigma_{\theta'} = 0.2^\circ" />, <M t="\sigma_D = 0.5\,\%" />.
    </>,
  ],
  procedure: [
    {
      text: 'Plan a constant-speed trip at β = 0.8 to a distant destination (Proxima Centauri) and execute.',
      done: ({ rows }) => (tripDrive() === 'cruise' && (travel.trip?.beta ?? 0) >= 0.1) || rows.length > 0,
      action: { label: 'Planner β = 0.8', run: () => openPlanner('proxima', 'cruise', 0.8) },
    },
    {
      text: (
        <>
          Pause time (<kbd className="kbd">Space</kbd>). The geometry stays fixed, but you can still look around by dragging.
        </>
      ),
      done: ({ ui, rows }) => (ui.paused && ui.tripActive) || rows.length >= 3,
      action: { label: 'Pause', run: () => setPaused(true) },
    },
    {
      text: (
        <>
          Put the reticle at different angles from the APEX marker (drag the view, or use <i>Point reticle</i> under
          Observations) and press <kbd className="kbd">R</kbd> (or Record) at each. Cover 0° to 180° with at least eight
          readings.
        </>
      ),
      done: ({ rows }) => {
        if (rows.length < 8) return false;
        const th = rows.map((r) => num(r, 'thS'));
        return Math.max(...th) - Math.min(...th) >= 120;
      },
    },
    {
      text: 'Optional: repeat at a second speed (β = 0.95) and compare the curves.',
      optional: true,
      done: ({ rows }) => distinct(rows, 'beta', 3) >= 2,
    },
    {
      text: 'Compare Fig. 3.1 with eq. (3.1). Fit the linearised Fig. 3.2 and compare the fitted β with the speedometer.',
      done: ({ rows }) => rows.length >= 8,
    },
  ],
  questions: [
    <>
      At what angle <M t="\theta'" /> is <M t="D = 1" /> for <M t="\beta = 0.8" />? Find it from your data and from (3.1).
    </>,
    <>
      Why is light arriving at <M t="\theta' = 90^\circ" /> redshifted, when its source is moving neither towards nor away from
      you in your own frame?
    </>,
    <>
      The Sun radiates like a blackbody at 5772 K. What colour temperature does it have dead astern at <M t="\beta = 0.8" />?
      (A blackbody spectrum shifted by <M t="D" /> is a blackbody at <M t="DT" />.)
    </>,
  ],
};

// ─── Experiment 4 ────────────────────────────────────────────────────────────────────────

const E4: ManualEntry = {
  duration: '20 min',
  aim: (
    <p>
      Measure how far the apparent positions of Solar System bodies are displaced towards the direction of motion at high speed,
      and verify the relativistic aberration formula.
    </p>
  ),
  background: (
    <>
      <p>
        The direction from which light arrives depends on the observer’s velocity. James Bradley reported it in 1729: stars
        shift by up to 20.5″ as Earth orbits at 30 km/s. If a source lies at angle <M t="\theta" /> from the apex in S, an observer
        moving at <M t="\beta" /> sees it at <M t="\theta'" />, where
      </p>
      <Eq n="4.1" tex="\cos\theta' = \frac{\cos\theta + \beta}{1 + \beta\cos\theta}." />
      <p>
        Everything crowds towards the apex. At <M t="\beta = 0.9" /> the whole forward hemisphere of S (<M t="\theta \le 90^\circ" />)
        appears within <M t="\theta' \le 25.8^\circ" />. Rearranging (4.1),
      </p>
      <Eq n="4.2" tex="\cos\theta' - \cos\theta = \beta\,\bigl(1 - \cos\theta\cos\theta'\bigr)," />
      <p>which is a line through the origin with slope <M t="\beta" />.</p>
      <p>
        The catalogue angle <M t="\theta" /> comes from the ephemeris: the target’s position in S, corrected for light-time
        when <i>Light-time correction</i> is on. The observed angle <M t="\theta'" /> is where the target appears in the ship’s
        view.
      </p>
    </>
  ),
  apparatus: [
    <>
      Goniometer on the selected body, reporting <M t="\theta" /> (catalogue, S) and <M t="\theta'" /> (observed, S′).
    </>,
    'Split-screen optics: the classical view left of the divider, the relativistic view right of it.',
    <>
      Constant-speed drive and speedometer (<M t="\beta" />).
    </>,
    <>
      Simulated uncertainty (optional): <M t="\sigma = 0.05^\circ" /> on each angle.
    </>,
  ],
  procedure: [
    {
      text: 'Plan a constant-speed trip at β ≥ 0.5 (0.9 recommended) to Neptune or Proxima Centauri and execute.',
      done: ({ rows }) => (tripDrive() === 'cruise' && (travel.trip?.beta ?? 0) >= 0.3) || rows.length > 0,
      action: { label: 'Planner β = 0.9', run: () => openPlanner('proxima', 'cruise', 0.9) },
    },
    {
      text: (
        <>
          Pause time (<kbd className="kbd">Space</kbd>).
        </>
      ),
      done: ({ ui, rows }) => (ui.paused && ui.tripActive) || rows.length >= 3,
      action: { label: 'Pause', run: () => setPaused(true) },
    },
    {
      text: (
        <>
          Select a body (click its label, or press <kbd className="kbd">0</kbd>–<kbd className="kbd">9</kbd>) and press{' '}
          <kbd className="kbd">R</kbd>. Repeat for at least six bodies in different directions. The Sun and the planets behind
          you give large θ.
        </>
      ),
      done: ({ rows }) => new Set(rows.map((r) => r.v.target)).size >= 6,
    },
    {
      text: (
        <>
          Switch the optics to Split (<kbd className="kbd">X</kbd>) and drag the divider across a body to see the displacement
          directly.
        </>
      ),
      done: () => labFlags.splitUsed,
      action: { label: 'Split view', run: () => useUI.setState({ relMode: 'split' }) },
    },
    {
      text: 'Fit Fig. 4.2 and compare the slope with the speedometer.',
      done: ({ rows }) => rows.length >= 6,
    },
    {
      text: (
        <>
          Optional, Bradley’s experiment: Abort the trip, orbit Earth (<kbd className="kbd">H</kbd>) and switch simulated
          uncertainty off. Select five bodies by clicking their labels (the number keys would fly you to them and change your
          velocity) and record each. The observer now moves with Earth at about 30 km/s, the shift <M t="\theta - \theta'" /> is at
          most about 20″, and the fit gives Earth’s orbital speed.
        </>
      ),
      optional: true,
      done: ({ rows }) => rows.filter((r) => num(r, 'beta') < 1e-3).length >= 5,
    },
  ],
  questions: [
    <>
      At <M t="\beta = 0.9" />, where does a body at <M t="\theta = 90^\circ" /> appear? What about one at{' '}
      <M t="\theta = 170^\circ" />?
    </>,
    <>Which directions are not displaced at all? Why?</>,
    <>
      For small <M t="\beta" />, (4.1) gives <M t="\theta - \theta' \approx \beta\sin\theta" />. Check Bradley’s 20.5″ for Earth’s
      orbital speed of 29.8 km/s.
    </>,
  ],
};

// ─── Experiment 5 ────────────────────────────────────────────────────────────────────────

const E5: ManualEntry = {
  duration: '10 min',
  aim: (
    <p>
      Record the flight of a spacecraft that accelerates at a constant 1 g as felt by its crew. Confirm the hyperbolic-motion
      solution, and measure the proper acceleration from the growth of the rapidity.
    </p>
  ),
  background: (
    <>
      <p>
        An accelerometer on board measures the proper acceleration <M t="a" />. When it is constant the worldline in S is a
        hyperbola. The motion is simplest in terms of the rapidity <M t="\varphi" />, defined by <M t="\beta = \tanh\varphi" />,
        because collinear boosts add rapidities:
      </p>
      <Eq n="5.1" tex="\frac{d\varphi}{d\tau} = \frac{a}{c} \quad\Rightarrow\quad \varphi = \frac{a\tau}{c}." />
      <p>From rest, therefore,</p>
      <Eq
        n="5.2"
        tex="\begin{aligned} \beta &= \tanh\frac{a\tau}{c}, \qquad t = \frac{c}{a}\sinh\frac{a\tau}{c}, \\ x &= \frac{c^2}{a}\left(\cosh\frac{a\tau}{c} - 1\right). \end{aligned}"
      />
      <p>
        The speed approaches <M t="c" /> but never reaches it, however long the engine runs. A flip-and-burn flight reverses the
        thrust at the midpoint, so the rapidity rises and then falls linearly:
      </p>
      <Eq n="5.3" tex="\varphi(\tau) = \frac{a}{c}\,\min(\tau,\; T - \tau)." />
      <p>
        At <M t="a = g_0 = 9.806\,65\ \mathrm{m\,s^{-2}}" />, <M t="c/a = 0.969" /> yr. After one year of ship time,{' '}
        <M t="\beta = \tanh 1.032 = 0.775" />.
      </p>
    </>
  ),
  apparatus: [
    '1 g flip-and-burn drive: constant proper acceleration, thrust reversed at the midpoint.',
    <>
      Data logger: samples <M t="\tau" />, <M t="t" />, <M t="x" /> and <M t="\beta" /> at fixed steps of ship time, about 40
      per flight, exactly on the trajectory.
    </>,
    <>
      Simulated uncertainty (optional): <M t="\sigma_\varphi = 0.002" />, and 0.05 % on the clocks and the distance.
    </>,
  ],
  procedure: [
    {
      text: (
        <>
          Open the planner (<kbd className="kbd">G</kbd>), choose Proxima Centauri and the 1 g flip-and-burn drive.
        </>
      ),
      done: ({ ui, rows }) => (ui.plannerOpen && ui.plannerDrive === 'rocket') || tripDrive() === 'rocket' || rows.length > 0,
      action: { label: 'Planner → 1 g', run: () => openPlanner('proxima', 'rocket') },
    },
    {
      text: 'Ignite. The logger starts automatically.',
      done: ({ rows }) => tripDrive() === 'rocket' || rows.length > 0,
    },
    {
      text: 'Skip to arrival (the samples are computed exactly along the trajectory), or raise the rate to 10⁶ and watch the flight.',
      done: ({ rows }) => rows.some((r) => num(r, 'T') > 0 && num(r, 'tau') >= num(r, 'T') * (1 - 1e-9)),
    },
    {
      text: 'Fit the accelerating phase in Fig. 5.2 and compute a = c dφ/dτ. Compare with g₀.',
      done: ({ rows }) => rows.length >= 10,
    },
    {
      text: 'Optional: return to Earth (H), fly a second flight to a nearer target (Mars, or Pluto) and compare the peak speeds.',
      optional: true,
      done: ({ rows }) => new Set(rows.map((r) => r.v.flight)).size >= 2,
    },
  ],
  questions: [
    <>
      How much ship time does it take to reach <M t="\beta = 0.99" /> at 1 g? How much Earth time?
    </>,
    <>
      Show from (5.2) that <M t="(x + c^2/a)^2 - (ct)^2 = (c^2/a)^2" />. What curve is the worldline in a spacetime diagram?
    </>,
    <>
      A perfect photon rocket needs a mass ratio <M t="m_i/m_f = e^{\Delta\varphi}" />, where <M t="\Delta\varphi" /> is the
      total change of rapidity. Estimate it for your flight to Proxima Centauri, which accelerates and then brakes.
    </>,
  ],
};

export const MANUAL: Record<ExperimentId, ManualEntry> = { E1, E2, E3, E4, E5 };
