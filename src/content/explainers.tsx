/**
 * Physics explainers. Short, accurate, and honest about simplifications. Numbers are
 * computed from the constants in src/physics (the unit tests check the key ones).
 */
import type { ReactNode } from 'react';

export type ExplainerId =
  | 'light-time'
  | 'scale'
  | 'lorentz'
  | 'time-dilation'
  | 'length-contraction'
  | 'aberration'
  | 'doppler'
  | 'mass-limit'
  | 'ftl'
  | 'rocket';

export interface Explainer {
  id: ExplainerId;
  title: string;
  /** Key equation, TeX. */
  equation: string;
  body: ReactNode;
  /** "Simplified here" note, when the app or the text simplifies something. */
  note?: ReactNode;
}

const P = ({ children }: { children: ReactNode }) => <p className="mb-3 last:mb-0">{children}</p>;

export const EXPLAINERS: Explainer[] = [
  {
    id: 'light-time',
    title: 'Light is fast, space is big',
    equation: 't = \\dfrac{d}{c}, \\qquad c = 299\\,792\\,458\\ \\text{m/s}',
    body: (
      <>
        <P>
          The speed of light is exactly 299,792,458 m/s. Since 1983 the metre has been defined by it. Even so, the
          Solar System is big enough that light takes noticeable time to cross it: <b>8 min 19 s</b> from the Sun to
          Earth, about <b>43 minutes</b> to Jupiter, <b>4 h 10 min</b> to Neptune and <b>5.5 hours</b> to Pluto.
          Voyager 1 is now almost a full light-day away.
        </P>
        <P>
          So you always see the past. From Pluto, Earth appears as it was hours ago. A rover on Mars gets its
          commands 3 to 22 minutes after they are sent, which is why it can’t be driven in real time.
        </P>
      </>
    ),
    note: (
      <>
        Times here are measured in the Sun’s rest frame. Observers moving relative to the Sun measure different
        times and distances, and that is the rest of this story.
      </>
    ),
  },
  {
    id: 'scale',
    title: 'The scale of the Solar System',
    equation: '1\\ \\text{au} = 149\\,597\\,870.7\\ \\text{km} \\approx 499.0\\ \\text{light-seconds}',
    body: (
      <>
        <P>Shrink the Sun to a ball 1 metre across and keep everything in proportion:</P>
        <ul className="mb-3 list-disc space-y-1 pl-5">
          <li>Earth is a 9 mm marble, 107 m away.</li>
          <li>Jupiter is a 10 cm ball, 560 m away.</li>
          <li>Neptune is a 3.6 cm ball, 3.2 km away.</li>
          <li>Voyager 1, a speck of dust, is about 18.5 km away.</li>
          <li>The nearest star, Proxima Centauri, is about 29,000 km away, more than twice Earth’s diameter.</li>
        </ul>
        <P>
          That is why planets drawn at true scale are specks: from Earth, Neptune is about 2.3 arcseconds across.
          “Visible” mode enlarges bodies so you can see them, but keeps every distance true.
        </P>
      </>
    ),
  },
  {
    id: 'lorentz',
    title: 'The Lorentz factor γ',
    equation: '\\gamma = \\frac{1}{\\sqrt{1 - v^2/c^2}}',
    body: (
      <>
        <P>
          Special relativity’s effects all scale with one number, γ. It stays within a hair of 1 at everyday speeds,
          then climbs without limit as v approaches c:
        </P>
        <table className="mb-3 w-full text-[12.5px] tabular-nums">
          <tbody className="[&_td]:py-0.5">
            <tr><td className="text-white/60">Earth’s orbit (30 km/s)</td><td className="text-right">1.000000005</td></tr>
            <tr><td className="text-white/60">0.1c</td><td className="text-right">1.005</td></tr>
            <tr><td className="text-white/60">0.5c</td><td className="text-right">1.155</td></tr>
            <tr><td className="text-white/60">0.9c</td><td className="text-right">2.294</td></tr>
            <tr><td className="text-white/60">0.99c</td><td className="text-right">7.09</td></tr>
            <tr><td className="text-white/60">0.9999c</td><td className="text-right">70.7</td></tr>
            <tr><td className="text-white/60">0.99999c</td><td className="text-right">224</td></tr>
          </tbody>
        </table>
        <P>Time dilation, length contraction and the energy of motion all grow with γ.</P>
      </>
    ),
  },
  {
    id: 'time-dilation',
    title: 'Time dilation and the twin paradox',
    equation: '\\Delta\\tau = \\frac{\\Delta t}{\\gamma}',
    body: (
      <>
        <P>
          A clock moving relative to you ticks slow, as measured by you, by the factor γ. At 0.99c, 7.09 years pass on
          Earth for every year aboard the ship. The HUD shows both clocks: Earth time <i>t</i> and ship (proper) time
          <i> τ</i>.
        </P>
        <P>
          <b>The twin paradox.</b> One twin flies out and back at high speed and comes home younger. Isn’t each twin
          moving relative to the other? The situation isn’t symmetric. The traveller changes inertial frames when she
          turns around, and the stay-at-home twin doesn’t. Each twin’s age is the length of their own path through
          spacetime, and the unaccelerated path between the two meetings is always the longest.
        </P>
        <P>
          This has been measured: cosmic-ray muons live long enough to reach the ground, atomic clocks flown around the
          world (Hafele and Keating, 1971) came back out of step, and GPS corrects for relativity every day.
        </P>
      </>
    ),
    note: <>Trips here use an instant boost to cruise speed, so the ship clock simply runs at 1/γ the whole way.</>,
  },
  {
    id: 'length-contraction',
    title: 'Length contraction',
    equation: 'L = \\frac{L_0}{\\gamma}',
    body: (
      <>
        <P>
          Measured from the ship, distances along the direction of travel are shorter by γ. Earth explains the crew’s
          short trip with slow ship clocks. The crew explains it with a shortened distance: the destination is closer
          and comes toward them at speed v. Both accounts give the same ship time. The HUD shows the remaining distance
          both ways.
        </P>
        <P>
          <b>Contraction is measured, not seen.</b> Light from different parts of a fast object leaves at different times,
          so a moving sphere still looks round (the Terrell–Penrose effect). What changes visibly is where things
          appear. That is aberration.
        </P>
      </>
    ),
  },
  {
    id: 'aberration',
    title: 'Aberration: the sky crowds ahead',
    equation: '\\cos\\theta\' = \\frac{\\cos\\theta + \\beta}{1 + \\beta\\cos\\theta}, \\qquad \\beta = v/c',
    body: (
      <>
        <P>
          Moving through light is like running through rain: the drops seem to come from ahead. Here θ is a star’s
          angle from your direction of motion in the Sun’s frame, and θ′ is where you see it. At 0.5c, everything in the
          forward half of the sky appears within 60° of straight ahead. At 0.99c it fits within 8°, and at 0.99999c
          within a quarter of a degree.
        </P>
        <P>
          It isn’t exotic. In the 1720s James Bradley found stars shifting by up to 20.5 arcseconds as Earth orbits at
          30 km/s. Relativity adds the factor that makes the formula correct at any speed. Try the split view to
          compare it with the classical picture.
        </P>
      </>
    ),
  },
  {
    id: 'doppler',
    title: 'Doppler shift and beaming',
    equation: 'D = \\frac{1}{\\gamma(1 - \\beta\\cos\\theta\')}, \\qquad T\' = D\\,T',
    body: (
      <>
        <P>
          Light’s frequency is multiplied by D. Dead ahead, D = √((1+β)/(1−β)): 4.4 at 0.9c, 14 at 0.99c. Behind you it is
          the inverse. At 90° (in the ship’s frame), D = 1/γ, a redshift that comes purely from time dilation, the
          transverse Doppler effect.
        </P>
        <P>
          A blackbody at temperature T looks like a blackbody at D·T. Stars ahead turn blue-white, those behind turn red,
          and at extreme speeds much of their light shifts out of the visible band altogether.
        </P>
        <P>
          <b>Beaming.</b> Surface brightness scales as D⁴ (because I<sub>ν</sub>/ν³ is invariant). The total flux from a
          point source like a star scales as D² for a moving observer, because aberration also squeezes its patch of sky.
          What the eye sees depends on how much of the shifted spectrum falls in the visible.
        </P>
      </>
    ),
    note: (
      <>
        Stars are treated exactly, as blackbodies. Planets, the Sun’s disc and other rendered surfaces use an
        approximation: each pixel’s colour is modelled as sunlight reflected by a smooth reflectance, then shifted. The
        view also applies automatic exposure, like a camera, so it stays readable. Not modelled: the cosmic microwave
        background, which would be blueshifted toward visible light ahead of a fast enough ship.
      </>
    ),
  },
  {
    id: 'mass-limit',
    title: 'Why nothing with mass reaches c',
    equation: 'E = \\gamma m c^2, \\qquad K = (\\gamma - 1)\\,m c^2 \\;\\to\\; \\infty \\ \\text{as}\\ v \\to c',
    body: (
      <>
        <P>
          As v approaches c, γ grows without bound, and so does the energy needed to go any faster. Getting 1 kg up to
          0.99c takes about 5.5 × 10¹⁷ J, roughly 130 megatons of TNT or a thousandth of humanity’s yearly energy use.
          0.99999c takes 37 times more. Reaching c itself would take infinitely much.
        </P>
        <P>
          The 1 g rocket shows the same thing from inside: accelerate forever and your speed, β = tanh(aτ/c), creeps
          toward 1 without ever reaching it.
        </P>
        <P>
          <b>What about light itself?</b> Photons are massless and always move at c. They have no rest frame, so there is
          no valid “photon’s point of view”. Saying “no time passes for a photon” describes a limit (τ → 0 as v → c),
          not an experience.
        </P>
      </>
    ),
  },
  {
    id: 'ftl',
    title: 'Why faster than light breaks causality',
    equation: '\\Delta t\' = \\gamma\\left(\\Delta t - \\frac{v\\,\\Delta x}{c^2}\\right)',
    body: (
      <>
        <P>
          Suppose a signal travels from event A to event B faster than light, so Δx &gt; cΔt. Any observer moving at
          v &gt; c²Δt/Δx (a speed below c) then finds Δt′ &lt; 0: for them, B happens before A. Relativity says every
          inertial observer’s account is equally valid. So with faster-than-light signals you could arrange for a reply
          to arrive before the original message was sent, a causality paradox sometimes called the tachyonic
          antitelephone.
        </P>
        <P>
          <b>The Alcubierre drive.</b> In 1994 Miguel Alcubierre found a solution of general relativity in which a bubble
          of ordinary space rides a wave of spacetime that contracts ahead and expands behind. Nothing inside outruns
          light locally, yet the bubble could cross space faster than light. The catch: it needs negative energy
          density (“exotic matter”) in quantities early estimates put far beyond anything imaginable, and nobody knows
          how to create or steer such a bubble. It is speculation, not engineering.
        </P>
        <P>
          This app’s warp mode simply moves the camera faster than c. That is fiction, so relativistic effects are
          switched off there: the formulas would give an imaginary γ.
        </P>
      </>
    ),
  },
  {
    id: 'rocket',
    title: 'The relativistic rocket',
    equation: 't = \\frac{c}{a}\\sinh\\frac{a\\tau}{c}, \\qquad d = \\frac{c^2}{a}\\left(\\cosh\\frac{a\\tau}{c} - 1\\right)',
    body: (
      <>
        <P>
          A realistic trip: accelerate at a steady 1 g (Earth-like gravity aboard), flip at the halfway point, and
          decelerate. To Proxima Centauri, 4.25 light-years away, <b>3.54 years</b> pass aboard and <b>5.87 years</b>{' '}
          on Earth, with a top speed of 0.95c. Because rapidity grows linearly with ship time, long trips shrink
          dramatically: the centre of the Milky Way, about 26,000 light-years away, is about 20 years away by ship clock
          (though 26,000 years pass at home).
        </P>
        <P>
          The catch is fuel. Even a perfect photon rocket, with exhaust at the speed of light, needs about 39 kg of
          propellant for every kilogram delivered to Proxima and brought to rest there.
        </P>
      </>
    ),
    note: <>The formulas assume constant proper acceleration from rest and flat spacetime (no gravity).</>,
  },
];

export const explainerById = (id: ExplainerId): Explainer => EXPLAINERS.find((e) => e.id === id)!;
