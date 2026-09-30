/**
 * The physics reference's sections: the physics behind what the simulator shows, with
 * the key equation, a short derivation or discussion, what the model simplifies, and further
 * reading. Numerical values follow from the constants in src/physics (the unit tests check
 * the key ones). The last three are about black holes: the blueshift and slow clocks near one,
 * lensing, and the shadow's size.
 */
import type { ReactNode } from 'react';
import { M } from '../ui/TeX';
import type { ExplainerId } from './explainers';

export interface ReferenceSection {
  id: ExplainerId;
  /** Key equation (TeX), shown numbered. */
  equation: string;
  body: ReactNode;
  /** What the simulator simplifies. */
  note?: ReactNode;
  reading?: string[];
}

export const REFERENCE: Record<ExplainerId, ReferenceSection> = {
  'light-time': {
    id: 'light-time',
    equation: 't = \\frac{d}{c}, \\qquad c = 299\\,792\\,458\\ \\mathrm{m\\,s^{-1}}',
    body: (
      <>
        <p>
          Since 1983 the metre has been defined by the speed of light, so <M t="c" /> is exact. Across the Solar System the
          light-travel times are not small: <M t="499.0\ \mathrm{s}" /> (8 min 19 s) from the Sun to Earth at 1 au, about 43 min
          to Jupiter, 4 h 10 min to Neptune and 5.5 h to Pluto at their mean distances. Voyager 1 is now almost a light-day from
          the Sun.
        </p>
        <p>
          Every observation is therefore of the past. A rover on Mars receives commands 3 to 22 minutes after they are sent, which
          is why it cannot be driven in real time. With <i>light-time correction</i> on, the simulator draws each body at its
          retarded position <M t="\mathbf r(t - \tau)" />, where <M t="\tau" /> solves{' '}
          <M t="|\mathbf r(t-\tau) - \mathbf r_\text{obs}| = c\tau" />.
        </p>
      </>
    ),
    note: (
      <>
        Times here are coordinate times in the Sun’s rest frame S. Observers moving relative to S measure different times and
        distances; that is the subject of the sections that follow.
      </>
    ),
    reading: ['Rømer, O. (1676). Journal des Sçavans, 7 December.', 'BIPM (2019), The International System of Units, 9th ed., §2.3.1.'],
  },

  scale: {
    id: 'scale',
    equation: '\\begin{aligned} 1\\ \\mathrm{au} &= 149\\,597\\,870.7\\ \\mathrm{km} \\\\ &\\approx 499.005\\ \\text{light-seconds} \\end{aligned}',
    body: (
      <>
        <p>Scale the Sun to a sphere 1 m across and keep every length in proportion:</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Body</th>
              <th>Diameter</th>
              <th>Distance from the Sun</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Earth</td>
              <td>9.2 mm</td>
              <td>107 m</td>
            </tr>
            <tr>
              <td>Jupiter</td>
              <td>10 cm</td>
              <td>560 m</td>
            </tr>
            <tr>
              <td>Neptune</td>
              <td>3.5 cm</td>
              <td>3.2 km</td>
            </tr>
            <tr>
              <td>Voyager 1</td>
              <td>2.7 nm</td>
              <td>18 km</td>
            </tr>
            <tr>
              <td>Proxima Centauri</td>
              <td>15 cm</td>
              <td>29 000 km</td>
            </tr>
          </tbody>
        </table>
        <p>
          At true scale the planets are specks: from Earth, Neptune subtends about 2.3″. <i>Enlarged</i> mode draws every body at
          least 8 px across but leaves all distances unchanged.
        </p>
      </>
    ),
  },

  lorentz: {
    id: 'lorentz',
    equation: '\\gamma = \\frac{1}{\\sqrt{1 - \\beta^2}}, \\qquad \\beta = \\frac{v}{c}, \\qquad \\gamma = \\cosh\\varphi',
    body: (
      <>
        <p>
          Every effect of special relativity is governed by <M t="\gamma" />. It differs from 1 by <M t="\beta^2/2" /> at everyday
          speeds and diverges as <M t="\beta \to 1" />:
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Speed</th>
              <th>
                <span className="sym">β</span>
              </th>
              <th>
                <span className="sym">γ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Earth’s orbital speed, 29.8 km/s</td>
              <td>9.9 × 10<sup>−5</sup></td>
              <td>1 + 4.9 × 10<sup>−9</sup></td>
            </tr>
            <tr>
              <td>Parker Solar Probe, 192 km/s</td>
              <td>6.4 × 10<sup>−4</sup></td>
              <td>1 + 2.1 × 10<sup>−7</sup></td>
            </tr>
            <tr>
              <td />
              <td>0.5</td>
              <td>1.1547</td>
            </tr>
            <tr>
              <td />
              <td>0.9</td>
              <td>2.2942</td>
            </tr>
            <tr>
              <td />
              <td>0.99</td>
              <td>7.0888</td>
            </tr>
            <tr>
              <td />
              <td>0.9999</td>
              <td>70.712</td>
            </tr>
          </tbody>
        </table>
        <p>
          The rapidity <M t="\varphi = \operatorname{artanh}\beta" /> is often the better variable: collinear boosts add
          rapidities (<M t="\varphi_{13} = \varphi_{12} + \varphi_{23}" />), whereas velocities combine as{' '}
          <M t="(\beta_1 + \beta_2)/(1 + \beta_1\beta_2)" />.
        </p>
      </>
    ),
    reading: ['Taylor, E. F. & Wheeler, J. A. (1992). Spacetime Physics, 2nd ed., ch. 1 and L.'],
  },

  'time-dilation': {
    id: 'time-dilation',
    equation: '\\begin{aligned} \\Delta\\tau &= \\int \\sqrt{1 - \\frac{v(t)^2}{c^2}}\\;dt \\\\ &= \\frac{\\Delta t}{\\gamma} \\quad (v\\ \\text{constant}) \\end{aligned}',
    body: (
      <>
        <p>
          A clock measures the proper time along its own worldline. In an inertial frame in which it moves at speed{' '}
          <M t="v" />, it advances by <M t="d\tau = dt/\gamma" />: at <M t="\beta = 0.99" />, 7.09 years pass on Earth for each
          year aboard. The chronometers in the instrument panel show both <M t="t" /> and <M t="\tau" />.
        </p>
        <p>
          <b>The twin paradox.</b> A traveller who flies out and back returns younger than a twin who stayed home. The situation
          is not symmetric: the traveller changes inertial frame, the stay-at-home twin does not. Proper time is the Minkowski
          length of a worldline, and between two events the unaccelerated worldline is the longest.
        </p>
        <p>
          The effect is measured routinely: cosmic-ray muons survive to sea level (Rossi &amp; Hall 1941; Frisch &amp; Smith
          1963); caesium clocks flown around the world came back out of step (Hafele &amp; Keating 1972); and GPS satellite clocks
          are offset for a net +38 µs per day (−7 µs from their speed, +45 µs from their weaker gravity).
        </p>
      </>
    ),
    note: (
      <>
        Constant-speed trips boost to <M t="\beta" /> instantaneously, so the ship clock runs at <M t="1/\gamma" /> for the whole
        trip. The 1 g drive (§10) is the realisable profile.
      </>
    ),
    reading: [
      'Rossi, B. & Hall, D. B. (1941). Phys. Rev. 59, 223.',
      'Frisch, D. H. & Smith, J. H. (1963). Am. J. Phys. 31, 342.',
      'Hafele, J. C. & Keating, R. E. (1972). Science 177, 166–170.',
    ],
  },

  'length-contraction': {
    id: 'length-contraction',
    equation: 'L = \\frac{L_0}{\\gamma}',
    body: (
      <>
        <p>
          Measured in the ship’s frame, lengths along the direction of motion are shorter by <M t="\gamma" />. The two accounts of
          a trip agree: Earth attributes the short ship time to the slow ship clock; the crew attributes it to a contracted
          distance that approaches at speed <M t="v" />. Both give the same <M t="\Delta\tau" />. The flight recorder shows the
          remaining distance in both frames.
        </p>
        <p>
          <b>Contraction is measured, not seen.</b> Light from different parts of a fast object leaves at different times. A moving
          sphere still looks circular; it appears rotated (Terrell 1959; Penrose 1959). What changes visibly is where things
          appear, which is aberration (§6).
        </p>
      </>
    ),
    reading: ['Terrell, J. (1959). Phys. Rev. 116, 1041.', 'Penrose, R. (1959). Proc. Camb. Phil. Soc. 55, 137.'],
  },

  aberration: {
    id: 'aberration',
    equation: "\\cos\\theta' = \\frac{\\cos\\theta + \\beta}{1 + \\beta\\cos\\theta}",
    body: (
      <>
        <p>
          <M t="\theta" /> is a source’s angle from the apex (the direction of motion) in S; <M t="\theta'" /> is the angle at which
          a moving observer sees it. Directions crowd towards the apex. The half of the sky with <M t="\theta \le 90^\circ" /> appears
          within <M t="\theta' \le \arccos\beta" />: 60° at <M t="\beta = 0.5" />, 8.1° at 0.99 and 0.26° at 0.99999.
        </p>
        <p>
          James Bradley found the effect in observations begun in 1725 and published it in 1729: annual shifts of up to 20.5″
          in the positions of stars, caused by Earth’s orbital motion. To first order in <M t="\beta" />, <M t="\theta - \theta' \approx \beta\sin\theta" />. The relativistic
          formula holds at any speed. The split view compares it with the classical picture.
        </p>
      </>
    ),
    reading: ['Bradley, J. (1729). Phil. Trans. R. Soc. 35, 637–661.', 'Rindler, W. (2006). Relativity: Special, General, and Cosmological, 2nd ed., ch. 4.'],
  },

  doppler: {
    id: 'doppler',
    equation: "D = \\frac{\\nu'}{\\nu} = \\frac{1}{\\gamma(1 - \\beta\\cos\\theta')}, \\quad T' = D\\,T",
    body: (
      <>
        <p>
          Dead ahead <M t="D = \sqrt{(1+\beta)/(1-\beta)} = e^{\varphi}" />: 4.36 at <M t="\beta = 0.9" /> and 14.1 at 0.99. Dead
          astern it is the reciprocal. At <M t="\theta' = 90^\circ" /> in the ship frame, <M t="D = 1/\gamma" />: a redshift
          caused by time dilation alone, the transverse Doppler effect (Ives &amp; Stilwell 1938).
        </p>
        <p>
          A blackbody spectrum at temperature <M t="T" /> Doppler-shifts into a blackbody at <M t="DT" />. Stars ahead turn blue-white,
          stars behind turn red, and at high enough speeds most of their light leaves the visible band.
        </p>
        <p>
          <b>Beaming.</b> Because <M t="I_\nu/\nu^3" /> is a Lorentz invariant, bolometric radiance scales as <M t="D^4" />. Aberration
          shrinks a source’s solid angle by <M t="D^{-2}" />, so the flux from a point source scales as <M t="D^2" /> for a moving
          observer. What the eye sees depends on how much of the shifted spectrum falls in the visible band.
        </p>
      </>
    ),
    note: (
      <>
        Stars are rendered exactly, as blackbodies. Planets and the solar disc use an approximation: each pixel’s colour is treated
        as sunlight reflected by a smooth reflectance, then shifted. The view applies automatic exposure, as a camera would. The
        cosmic microwave background, which would be blueshifted towards visible light ahead of a fast enough ship, is not modelled.
      </>
    ),
    reading: ['Ives, H. E. & Stilwell, G. R. (1938). J. Opt. Soc. Am. 28, 215.', 'Rybicki, G. B. & Lightman, A. P. (1979). Radiative Processes in Astrophysics, ch. 4.'],
  },

  'mass-limit': {
    id: 'mass-limit',
    equation: '\\begin{gathered} E = \\gamma m c^2, \\\\ K = (\\gamma - 1)\\,m c^2 \\;\\longrightarrow\\; \\infty \\quad (\\beta \\to 1) \\end{gathered}',
    body: (
      <>
        <p>
          The energy needed to go faster grows without bound as <M t="\beta \to 1" />. Bringing 1 kg to <M t="0.99c" /> takes{' '}
          <M t="K \approx 5.5\times10^{17}\ \mathrm{J}" />, about 130 Mt of TNT or a thousandth of humanity’s annual energy use.
          Reaching <M t="0.99999c" /> takes 37 times as much, and <M t="c" /> itself would take infinitely much.
        </p>
        <p>
          The 1 g rocket shows the same limit from the inside: under constant thrust the speed <M t="\beta = \tanh(a\tau/c)" />{' '}
          creeps towards 1 without reaching it (§10).
        </p>
        <p>
          <b>Photons.</b> Massless particles always move at <M t="c" /> and have no rest frame. “No time passes for a photon”
          describes a limit (<M t="\tau \to 0" /> as <M t="v \to c" />), not the viewpoint of an observer.
        </p>
      </>
    ),
  },

  ftl: {
    id: 'ftl',
    equation: "\\Delta t' = \\gamma\\left(\\Delta t - \\frac{v\\,\\Delta x}{c^2}\\right)",
    body: (
      <>
        <p>
          Let a signal connect event A to event B faster than light, so that <M t="\Delta x > c\,\Delta t" />. For any observer with{' '}
          <M t="c^2\Delta t/\Delta x < v < c" />, the Lorentz transformation gives <M t="\Delta t' < 0" />: B happens before A. Every
          inertial observer’s description is equally valid, so faster-than-light signalling would allow a reply to arrive before the
          message was sent. This is the “tachyonic antitelephone” (Tolman 1917).
        </p>
        <p>
          <b>The Alcubierre metric</b> (1994) is a solution of general relativity in which a region of flat space is carried along by
          a distortion of spacetime, contracting ahead and expanding behind. Nothing inside it moves faster than light locally.
          Sustaining it requires negative energy density in amounts far beyond anything known to exist, and there is no known way
          to create or steer it.
        </p>
        <p>
          The simulator’s superluminal drive simply moves the camera faster than <M t="c" />. It is fiction, and no quantity
          measured during it has a physical meaning: <M t="\gamma" /> would be imaginary.
        </p>
      </>
    ),
    reading: ['Tolman, R. C. (1917). The Theory of the Relativity of Motion, p. 54.', 'Alcubierre, M. (1994). Class. Quantum Grav. 11, L73.'],
  },

  rocket: {
    id: 'rocket',
    equation: '\\begin{aligned} t &= \\frac{c}{a}\\sinh\\frac{a\\tau}{c}, \\qquad \\beta = \\tanh\\frac{a\\tau}{c}, \\\\ x &= \\frac{c^2}{a}\\left(\\cosh\\frac{a\\tau}{c} - 1\\right) \\end{aligned}',
    body: (
      <>
        <p>
          A realisable trip accelerates at a steady 1 g, which the crew feels as Earth gravity, turns around at the midpoint and
          decelerates. To Proxima Centauri, 4.25 ly away, the flight takes 3.54 years aboard and 5.87 years on Earth, with a peak
          speed of <M t="0.95c" />. Because the rapidity grows linearly with ship time, long trips shrink dramatically: the Galactic
          Centre, about 26 000 ly away, is about 20 years away by the ship’s clock, while 26 000 years pass at home.
        </p>
        <p>
          The obstacle is propellant. An ideal photon rocket, with exhaust at <M t="c" />, has mass ratio{' '}
          <M t="m_i/m_f = e^{\Delta\varphi}" />. For the Proxima flight, with <M t="\Delta\varphi = 2\varphi_\text{peak} \approx 3.66" />,
          a mass ratio of about 39: some 38 kg of propellant for every kilogram delivered and brought to rest.
        </p>
      </>
    ),
    note: <>The formulas assume constant proper acceleration from rest in flat spacetime; gravity is neglected.</>,
    reading: ['Rindler, W. (2006). Relativity: Special, General, and Cosmological, 2nd ed., ch. 3 (hyperbolic motion).', 'Gibbs, P. & Koks, D. (2006). The Relativistic Rocket. Usenet Physics FAQ.'],
  },

  // ── Near a black hole ────────────────────────────────────────────────────────────────────
  // Numbers: Schwarzschild, for Sagittarius A* (4.297 × 10⁶ solar masses) where one is named; the key ones are
  // checked against physics/schwarzschild.ts in ui/viewport/bodyCard.test.ts.

  'gravitational-blueshift': {
    id: 'gravitational-blueshift',
    equation: '\\frac{\\nu_\\text{here}}{\\nu_\\infty} = \\frac{dt}{d\\tau} = \\frac{1}{\\sqrt{1 - r_s/r}}, \\qquad r_s = \\frac{2GM}{c^2}',
    body: (
      <>
        <p>
          Light falling towards a black hole gains energy. To an observer hovering at radius <M t="r" />, light that left a
          source far away arrives with its frequency raised by <M t="1/\sqrt{1 - r_s/r}" />, and the observer’s own clock runs
          slow against clocks far away by the same factor: both follow from the same geometry. At ten times the horizon’s
          radius the factor is 1.054; at <M t="1.01\,r_s" />, 10.05; at the lowest hover Skyfold allows,{' '}
          <M t="r_s(1 + 10^{-6})" />, it is 1,000.
        </p>
        <p>
          A star’s blackbody spectrum at temperature <M t="T" /> arrives as a blackbody at <M t="gT" />, as with a Doppler shift
          (§7): every star looks hotter and bluer, and brighter, its bolometric surface brightness raised by <M t="g^4" />. For a
          hovering observer the shift is the same in every direction; moving past them adds the Doppler shift and aberration of
          your own motion. Someone falling from rest far away sees the sky straight overhead reddened instead, at the horizon by
          a factor of 2: the speed of the fall there outweighs the blueshift.
        </p>
        <p>
          On Earth the effect is tiny but measured: Pound and Rebka (1960) found gamma rays climbing a 22.5 m tower at Harvard
          shifted by 2.5 parts in <M t="10^{15}" />, and GPS clocks run 45 µs a day fast from their weaker gravity (§4).
        </p>
      </>
    ),
    note: (
      <>
        Only the black hole’s gravity is included, and only where <M t="r_s/r" /> passes 5 parts in <M t="10^{10}" />; home’s
        clock is one far from every mass. The Sun’s own potential (parts in <M t="10^{8}" />) and the Galaxy’s (parts in{' '}
        <M t="10^{6}" />) are left out. Within 5,000 horizon radii the time warp paces the clock of an observer hovering where
        you are.
      </>
    ),
    reading: [
      'Pound, R. V. & Rebka, G. A. (1960). Phys. Rev. Lett. 4, 337.',
      'Hartle, J. B. (2003). Gravity: An Introduction to Einstein’s General Relativity, ch. 9 and 12.',
      'Hamilton, A. J. S. & Lisle, J. P. (2008). Am. J. Phys. 76, 519 (falling observers).',
    ],
  },

  'double-images': {
    id: 'double-images',
    equation: '\\theta_\\pm = \\tfrac12\\left(\\beta \\pm \\sqrt{\\beta^2 + 4\\theta_E^2}\\right), \\qquad \\theta_E \\approx \\sqrt{\\frac{2 r_s}{d}}',
    body: (
      <>
        <p>
          A star behind a black hole, a little off the line through it, is seen twice: its light passes the hole on both sides.{' '}
          <M t="\beta" /> is where the star would appear without the hole, <M t="\theta_\pm" /> where its two images appear, all
          measured from the hole. The brighter image lies outside the Einstein ring, on the star’s own side; the fainter lies
          inside it, on the opposite side, mirrored. A star exactly behind becomes a ring of radius <M t="\theta_E" />, for an
          observer at distance <M t="d" /> and a source much farther away. From 4,000 au from Sagittarius A* the ring of the sky
          behind is 0.374° in radius (the formula gives 0.373°); from 1,000 au, 0.750°.
        </p>
        <p>
          Close to the hole the formula fails, and light can go round the hole before reaching you. Each further half turn puts
          an image about <M t="e^{\pi} \approx 23" /> times closer to the edge of the shadow and makes it about as many times
          fainter, so the images crowd into a thin photon ring. Hovering at ten horizon radii, the Einstein ring is 29.8° in
          radius and the second ring, where the sky behind you appears, 14.61°, just outside the shadow’s 14.27°.
        </p>
        <p>
          Lensing stretches or squeezes each image: its brightness changes with its area, but the surface brightness of the sky
          does not (apart from the colour shift, §11). The first double image found was of a quasar (Walsh, Carswell and
          Weymann 1979); a lone black hole was found in 2022 only by how it bent a star’s light.
        </p>
      </>
    ),
    note: (
      <>
        Skyfold traces the light exactly (Schwarzschild) for one black hole at a time, the one whose lens matters most.
        Constellation figures, planet-host rings and orbit lines follow the primary image only; nebula pictures have no second
        image; a star exactly behind a hole shows as two points, and only the Sun, the S-stars and the black holes’ companions
        are drawn as rings.
      </>
    ),
    reading: [
      'Einstein, A. (1936). Science 84, 506.',
      'Darwin, C. (1959). Proc. R. Soc. A 249, 180.',
      'Virbhadra, K. S. & Ellis, G. F. R. (2000). Phys. Rev. D 62, 084003.',
      'Bozza, V. (2002). Phys. Rev. D 66, 103001.',
      'Walsh, D., Carswell, R. F. & Weymann, R. J. (1979). Nature 279, 381.',
    ],
  },

  'shadow-size': {
    id: 'shadow-size',
    equation: '\\sin\\alpha_\\text{sh} = \\frac{3\\sqrt{3}\\,GM}{c^2\\,r}\\sqrt{1 - \\frac{r_s}{r}}',
    body: (
      <>
        <p>
          Light aimed within <M t="b_c = 3\sqrt3\,GM/c^2" /> of a black hole, 2.6 times the horizon’s radius, spirals in and is
          lost. Seen from far away, the dark disc this leaves, the shadow, has that radius: <M t="\alpha_\text{sh} \approx b_c/d" />.
          From 8,277 pc Sagittarius A*’s shadow is 53.3 µas across while its horizon would span only 20.5 µas; the Event Horizon
          Telescope measured a ring of light round it 51.8 ± 2.3 µas across.
        </p>
        <p>
          Close to, Synge’s formula above gives the shadow’s angular radius <M t="\alpha_\text{sh}" /> for an observer hovering
          at <M t="r" /> (the obtuse solution inside the photon sphere, <M t="r < 1.5\,r_s" />). At ten horizon radii the shadow
          is 28.5° across; at the photon sphere it is exactly half the sky; at <M t="1.01\,r_s" /> all the sky but a disc 29.7°
          across overhead is dark.
        </p>
        <p>
          Motion changes it, through aberration (§6): at ten horizon radii, diving in at <M t="0.9c" /> shrinks the shadow to
          6.6° across, and climbing out at <M t="0.9c" /> it is 114° across. Someone falling from rest far away sees, as they
          cross the horizon, a dark patch 84.2° across ahead of them, not total darkness.
        </p>
      </>
    ),
    note: (
      <>
        Drawn without spin (Schwarzschild). Sagittarius A*’s spin is not measured: seen as we see it, about 25° from its axis,
        a spin of 0.9 to 0.94 would make its shadow about 5–7 % smaller and shift it by about 1 <M t="GM/c^2" />; seen
        edge-on a fast spin makes a shadow up to about 12 % narrower, one side flattened. That agrees with the Event Horizon
        Telescope’s finding that spin changes the shadow’s size by less than about 8 %.
      </>
    ),
    reading: [
      'Synge, J. L. (1966). Mon. Not. R. Astron. Soc. 131, 463.',
      'Bardeen, J. M. (1973). In Black Holes (Les Houches 1972), ed. C. DeWitt & B. S. DeWitt, p. 215.',
      'Falcke, H., Melia, F. & Agol, E. (2000). Astrophys. J. 528, L13.',
      'Event Horizon Telescope Collaboration (2022). Astrophys. J. Lett. 930, L12.',
      'Perlick, V. & Tsupko, O. Yu. (2022). Phys. Rep. 947, 1.',
    ],
  },
};
