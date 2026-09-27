/**
 * The Guide's section on flights beyond the Local Group, through the expanding universe (sim/travel.ts,
 * sim/travelCosmic.ts, physics/cosmology). Kept in a file of its own; GuideDoc.tsx places it in the
 * chapter on flights. Numbers are the cosmology module's (docs/data/cosmology.md, section 6).
 */
import type { BodyId } from '../../sim/bodies';
import { logEvent } from '../../lab/events';
import { useUI } from '../../state/ui';
import { runScene } from '../../content/scenes';
import { planOneG } from '../tripActions';
import type { ReactNode } from 'react';
import { H3, KeyTable, Note, Try } from './parts';

const TryRow = ({ children }: { children: ReactNode }) => <div className="doc-tryrow">{children}</div>;

/** Plan a 1 g flight from Earth, unless a trip is under way. */
function planFromHome(dest: BodyId): () => void {
  return () => {
    if (useUI.getState().tripActive) {
      logEvent('ERR', 'Not available in flight: finish or abort the trip first.');
      return;
    }
    planOneG(dest);
  };
}

export function GuideFlightsBeyond() {
  return (
    <>
      <H3>Beyond the Local Group</H3>
      <p>
        Gravity holds the Local Group together: inside its zero-velocity surface, about 3 million light-years (0.96 million
        parsecs) round its centre, space does not expand, and flights are special relativity as above. Beyond it the
        galaxies are carried apart by the expansion of the universe, and a flight that leaves the Local Group, or starts out
        beyond it, crosses expanding space. The planner then solves the rocket’s motion in a flat, expanding universe with the
        Planck 2018 parameters (the standard model of cosmology), where the space ahead grows while you fly and a drag of the
        expansion slows you relative to the galaxies you pass. Both ends of the flight decide: from Andromeda to Triangulum is
        static, home from the Virgo Cluster crosses expanding space.
      </p>
      <p>
        On these flights the clock at home is cosmic time, the time every galaxy at rest in the expansion keeps, and it runs on
        by millions or billions of years while a few decades pass aboard. The planner shows your time and the cosmic time, the
        age of the universe when you arrive, how far home’s light is stretched (its redshift) as seen from the destination, the
        peak Lorentz factor, and a sentence such as <i>You arrive 35 years older; the universe is 54 million years older too.</i>{' '}
        The peak <i>γ</i> is measured against the galaxies you pass: the expansion caps it, at 1 g below 1.8 × 10<sup>10</sup>{' '}
        however long the engine runs. <b>There and back</b> gives the return flight, leaving on arrival; it takes longer,
        because the universe has grown meanwhile, and from far enough out there is no way back at all. The plot beside the
        numbers sets the two clocks against each other: most of the time at home passes near the flip, at the highest speed.
      </p>
      <KeyTable
        head={['1 g, from home today', 'On board · at home']}
        rows={[
          ['Andromeda, 2.5 million light-years (static space)', '28.6 years · 2.5 million years'],
          ['The Virgo Cluster, 53.5 million light-years', '34.5 years · 54 million years'],
          ['A galaxy seen at redshift 0.5, 6.3 billion light-years now', '44.3 years · 8.2 billion years'],
          ['A galaxy seen at redshift 1, 11.1 billion light-years now', '46.0 years · 18.9 billion years'],
          ['A galaxy seen at redshift 3, 21.2 billion light-years now', 'Out of reach: beyond the event horizon'],
        ]}
      />
      <p>
        A galaxy, a cluster or a nebula has no surface to stop short of, so a flight to one goes all the way in, to near its
        centre (the numbers above are the planner’s), and the view then pulls back to show all of it. A flight into
        expanding space is aimed at where the destination will be on arrival: a galaxy carried along by the expansion, a
        galaxy held in its cluster, or, on the way home, the Earth on its orbit millions of years on.
      </p>
      <p>
        For a rocket, the planner lets you change the acceleration (0.1 g to 10 g) and set a limit on the time on board. A
        flight that would take longer than the limit is refused, with the farthest distance the engine could cover in that
        time.
      </p>

      <H3>The edge of reach</H3>
      <p>
        Because the expansion is speeding up, light sent from here today will only ever reach galaxies now closer than the{' '}
        <b>cosmic event horizon</b>, 16.6 billion light-years away. No ship can do better than light, so anything beyond it is
        out of reach for ever, however long you fly: that includes every galaxy we now see at a redshift above about 1.85, the
        most distant galaxies known among them. The planner refuses such a flight and says why. Everything inside the horizon
        can be reached at 1 g in under 75 years aboard, except the last 0.97 light-years, which a ship starting from rest
        never makes up on the light that left with it.
      </p>
      <TryRow>
        <Try run={() => runScene('edge-of-reach')}>Try to fly to JADES-GS-z14-0</Try>
        <Try run={planFromHome('virgo-cluster')}>Plan a 1 g flight to the Virgo Cluster</Try>
      </TryRow>

      <H3>Flying through the expansion</H3>
      <p>
        The camera rides the ship through the growing universe, and the view is worked out from the ship’s speed relative to
        the galaxies it is passing, which sets the aberration and the Doppler shift. The flight panel adds two numbers to the
        usual four: <b>Universe age</b>, with how much larger the universe is than today, and <b>Redshift of home</b>, how
        stretched the light from home is as you see it, the part due to the expansion under it and the rest due to your own
        speed. On the way home, with home ahead, your speed squeezes its light instead, and the panel shows the{' '}
        <b>Blueshift of home</b>. <b>Distance left</b> is the distance now, which the expansion keeps stretching. At high speed the cosmic
        microwave background ahead is shifted from 2.7 K up to thousands of kelvin and more, and glows.
      </p>
      <TryRow>
        <Try run={() => runScene('cmb-glow')}>See the Big Bang’s glow at speed</Try>
      </TryRow>
      <p>
        On arrival the card says how much older you are, how old and how large the universe now is, and what has become of
        home meanwhile: whether the Sun is still on the main sequence, a red giant or a white dwarf, what has become of the
        Earth, how likely it is by then that the Milky Way and Andromeda have merged, which nearby groups and clusters home can
        still see, and how cold the cosmic background has become. The light from home reaching you, though, left it only a year
        or two after you did: through a telescope, home still looks as you left it. After a flight that set out from somewhere
        else, the card says the same of where you set out.
      </p>
      <Note title="What is a model here">
        The flights assume a perfect engine that never runs out (a real photon rocket to a galaxy at redshift 1 would need a
        starting mass about 4 × 10<sup>20</sup> times its final mass), galaxies carried along by the expansion or held in their
        group or cluster (their own motions of a few hundred km/s are left out) and an exactly smooth universe along the way. The Planck parameters carry
        uncertainties: the event horizon is known to about 1%. The Local Group’s boundary is sharp in the code and fuzzy in
        nature, but changing model there changes flight times by 1 part in 100,000 at most. The home clock quotes published
        models: the Sun’s future from Schröder and Connon Smith (2008), and the Milky Way and Andromeda from Sawala and
        colleagues (2025), whose study stops 10 billion years from now.
      </Note>
    </>
  );
}
