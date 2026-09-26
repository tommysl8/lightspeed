---
slug: the-edge-of-reach
title: The edge of reach
shelf: universe
order: 16
pitch: Webb has seen galaxies that no ship and no radio signal could ever reach, not in a trillion years. Here is where that line runs, and why it moves.
updated: 2026-09-25
---

Between 10 and 12 January 2024 the James Webb Space Telescope held its near-infrared spectrograph, NIRSpec, on one faint smudge for almost ten hours.[^carniani2024][^nasa2024] The JADES team had flagged the smudge a year earlier as a galaxy that might date from less than 300 million years after the Big Bang, and then hesitated. It was too bright for something that far away, and it sat 0.4 arcseconds from an ordinary foreground galaxy that could have been fooling them.[^nasa2024][^carniani2024]

The spectrum settled it. The light stopped dead at about 1.85 micrometres, which is where hydrogen's ultraviolet cut-off at 121.6 nm lands once it has been stretched by a factor of about 15. The smudge was a galaxy, JADES-GS-z14-0, and it was the most distant ever confirmed.[^carniani2024] Later that year the ALMA radio telescopes in Chile caught the glow of its oxygen and pinned the redshift at 14.18.[^carniani2025]

Its light had been travelling for 13.5 billion years. The stranger fact is where the galaxy is now: about 33.7 billion light-years away, with that distance growing at more than twice the speed of light.[^calc] A radio message sent towards it today would never arrive, not in a trillion years, and nor would any ship. We can see JADES-GS-z14-0, and we can never touch it.

The boundary between what we can see and what we could ever reach lies about 16.6 billion light-years away. It exists because the expansion of the universe is speeding up, and, measured in today's distances, it is closing in on us by a light-year every year.[^calc]

::: see-it go:jades-gs-z14-0
The camera glides to JADES-GS-z14-0 and shows its card. What you are looking at left the galaxy 13.5 billion years ago, when it was 2.2 billion light-years from us; it is now 33.7 billion light-years away.
:::

## A universe you could cross

In 1917 the Dutch astronomer Willem de Sitter published a model universe with no matter in it at all, only Einstein's new cosmological constant.[^desitter1917] He wrote it in coordinates in which nothing seemed to change. Rewritten in other coordinates, the same universe expands exponentially, and the unchanging version turns out to describe only the region inside a horizon, beyond which an observer at the centre can see nothing.[^krauss2007] Keep that model in mind, because our universe is slowly turning into it.

Twelve years later Edwin Hubble showed that galaxies are receding at speeds roughly proportional to their distances ([The expanding universe](#/learn/the-expanding-universe) tells that story).[^hubble1929] For decades afterwards "the edge of the universe" meant whatever the speaker wanted: the most distant thing visible, the place where recession reached the speed of light, or the limit of where light could ever go.

The person who sorted this out was Wolfgang Rindler. Born in Vienna in 1924, he reached England in 1938 on the Kindertransport, the rescue of Jewish children from Nazi Germany and Austria, and took his doctorate at Imperial College London.[^utd2019] In December 1956 he published "Visual horizons in world-models", in which he defined a horizon as the frontier between what an observer can observe and what they cannot, and showed that an expanding universe can have two quite different kinds.[^rindler1956][^utd2019]

A *particle horizon* marks the most distant matter whose light has had time to reach us since the beginning; anything beyond it simply hasn't been seen yet. An *event horizon* works the other way round. It marks the most distant places whose light emitted *today* will ever reach us, however long we wait, and by the same token nothing we send today will ever get beyond it. The term "event horizon" was Rindler's coinage in that paper, though it is better known now from black holes.[^utd2019]

Whether a universe has an event horizon depends on its future: on whether the expansion slows down or speeds up. For most of the 20th century the expected answer was that it slows down, because gravity pulls. A decelerating universe has no event horizon. Light sent out today keeps gaining ground, more and more slowly, and given enough time it gets to any galaxy you care to name.[^calc] With patience measured in trillions of years, the whole universe was within reach. An old puzzle shows why that is less obvious than it sounds, and how a small change to the rules breaks it.

## The ant on the rubber rope

An ant sets off along a rubber rope 1 km long at 1 cm per second. As it starts, someone begins stretching the rope evenly by 1 km every second: 2 km long after one second, 3 km after two, and so on. Does the ant ever reach the far end?

It looks hopeless, since the far end is moving away 100,000 times faster than the ant walks. But the ant arrives. Track not how many metres it has walked but what *fraction* of the rope lies behind it, because even stretching doesn't change that fraction. In the first second the ant covers 1 cm of a rope about 1 km long, a fraction of 1/100,000. In the next it covers 1 cm of about 2 km: 1/200,000. Then 1/300,000, and so on. After $n$ seconds it has covered roughly $\tfrac{1}{100{,}000}\left(1 + \tfrac12 + \tfrac13 + \cdots + \tfrac1n\right)$ of the rope.

The sum in the bracket, the harmonic series, grows without limit, but only about as fast as the natural logarithm of $n$. It reaches 100,000, and the ant arrives, after about $e^{100{,}000}$ seconds, a number with 43,430 digits: roughly $9 \times 10^{43{,}421}$ years, in a universe $1.4 \times 10^{10}$ years old.[^calc] The ant is late, but it gets there.

::: note Logarithms in one paragraph
The natural logarithm of $n$, written $\ln n$, answers the question "$e$ to what power gives $n$?", where $e \approx 2.718$. So $\ln 1{,}000 \approx 6.9$ and $\ln 1{,}000{,}000 \approx 13.8$: each extra factor of a thousand adds only 6.9. The sum $1 + \tfrac12 + \tfrac13 + \cdots + \tfrac1n$ stays close to $\ln n + 0.58$, which is why it grows without limit, and so slowly.
:::

Now change one rule: the rope doubles in length every second. To keep the sums simple, let each doubling happen in a sudden jerk at the end of the second. Paint marks on the rubber before the stretching begins, a centimetre apart. In the first second the ant walks past one mark. In the next the rope is twice as long, so its centimetre of walking covers only half the gap between marks. Then a quarter, then an eighth. Counted in marks, the total is

$$1 + \frac{1}{2} + \frac{1}{4} + \frac{1}{8} + \cdots = 2$$

In words: start with one, keep adding half of whatever you added last, and the total creeps up on two without ever passing it.

Worked example: after 4 seconds the ant has covered $1 + 0.5 + 0.25 + 0.125 = 1.875$ cm of the original rope, and after 10 seconds 1.998 cm. It passes the mark that started 1.9 cm away a little after 4 seconds. The mark that started 2 cm away is never reached, and nor is the rest of the kilometre, although the ant never stops walking. (If the rope stretched smoothly instead of in jerks, the limit would be lower, about 1.44 cm, but still finite.)[^calc]

That 2 cm mark is an event horizon. What separates the two ropes is not how fast they stretch but whether the stretching speeds up. Steady stretching gives a series that grows without limit, and the ant arrives; accelerating stretching gives a finite total. In the universe the ant is a beam of light and the marks are galaxies, and the open question after Rindler was which kind of rope we are on.

## 1998: the rope speeds up

In the autumn of 1997 Adam Riess, a postdoctoral fellow at the University of California, Berkeley, was analysing supernovae for the High-z Supernova Search Team led by Brian Schmidt.[^riessnobel][^nobel2011] Type Ia supernovae can be calibrated to nearly the same peak brightness, so how faint one looks tells you its distance, and its redshift tells you how much the universe has stretched since it exploded. Compare distant ones with nearby ones and you can measure how the expansion has changed.[^riess1998]

The team expected to measure how much the expansion had slowed, and from that how much matter the universe contains. The answer Riess wrote in his lab notebook was a matter density of $-0.36 \pm 0.18$: less than nothing.[^riessnobel] Negative mass does not exist. The distant supernovae were 10 to 15% farther away than they should have been in a low-density universe without a cosmological constant, and the only sensible reading was that the expansion had been speeding up.[^riess1998]

He spent a couple of weeks hunting for a mistake and found none. In early January 1998 Schmidt ran the calculation and got the same answer. Riess married on 10 January, and two days later, on the eve of his honeymoon, he emailed the team: "Approach these results not with your heart or head but with your eyes."[^riessnobel] The paper went to the *Astronomical Journal* on 13 March 1998.[^riessnobel] The rival Supernova Cosmology Project, led by Saul Perlmutter and at work since 1988, reached the same conclusion from 42 distant supernovae.[^perlmutter1999][^nobel2011] Perlmutter, Schmidt and Riess shared the 2011 Nobel Prize in Physics.[^nobel2011]

Whatever drives the acceleration is called dark energy. The simplest version is Einstein's cosmological constant, the one ingredient of de Sitter's model: an energy of empty space itself, whose density stays the same as space expands while matter thins out. It now makes up about 69% of the universe's energy.[^planck2018] As the matter keeps thinning, the constant takes over and the universe settles into de Sitter's model, doubling in size every 12 billion years or so.[^calc] That is the doubling rope. Our universe has an event horizon, and most of what we can see lies beyond it.

::: timeline Horizons since 1917
- **1917:** de Sitter's empty universe, with a horizon.
- **1929:** Hubble's relation between distance and speed.
- **1956:** Rindler defines particle and event horizons.
- **1998:** The expansion is found to be accelerating.
- **2004:** Davis and Lineweaver's "Expanding confusion".
- **2007:** Krauss and Scherrer on a future with no other galaxies in view.
- **2024:** Webb confirms JADES-GS-z14-0.
- **2025:** DESI hints that dark energy is weakening; MoM-z14 reaches redshift 14.44.
- **2026:** DESI finishes its planned survey; the Roman Space Telescope launches.
:::

## Three distances to one galaxy

Ask how far away JADES-GS-z14-0 is and there are three honest answers, because the distance kept changing the whole time its light was in flight.

The first is the *light-travel distance*: 13.5 billion light-years, because the light has been travelling for 13.5 billion years. It is the figure most often quoted, and it is not the distance to anything, then or now.

The second is the distance *now*, at this moment of cosmic time, as if measured by a chain of rulers laid between the galaxies. Cosmologists use today's distances as a fixed yardstick and call them *comoving* distances: a galaxy's comoving distance stays the same as the universe expands, like a painted mark on the rubber rope. For JADES-GS-z14-0 it is 33.7 billion light-years.[^calc]

The third is the distance *then*, when the light set out. Redshift measures how much the universe has stretched while the light was on its way: $1 + z$ is the factor by which every wavelength, and every distance between galaxies, has grown since. So:

$$D_{\text{then}} = \frac{D_{\text{now}}}{1+z}$$

In words: the distance to a galaxy when it sent the light we see equals its distance today divided by one plus its redshift.

Worked example: for JADES-GS-z14-0, $1 + z = 15.18$ and $D_{\text{now}} = 33.7$ billion light-years, so $D_{\text{then}} = 33.7 \div 15.18 = 2.2$ billion light-years.[^calc] When the galaxy sent the light it was only 2.2 billion light-years away, and the light still needed 13.5 billion years to get here. For the first 3.8 billion years it was actually carried *away* from us, out to 5.8 billion light-years, because the space it was crossing grew faster than light could cross it. Only when the expansion rate had dropped enough did it start to close in.[^calc][^davis2004]

| Object | Redshift | Light has travelled for | Distance when light left | Distance now |
|---|---|---|---|---|
| Virgo Cluster | 0.004 | 54 million years | 54 million ly | 54 million ly |
| Bullet Cluster | 0.296 | 3.5 billion years | 3.1 billion ly | 4.0 billion ly |
| A galaxy at redshift 1 | 1 | 7.9 billion years | 5.5 billion ly | 11.1 billion ly |
| GN-z11 | 10.60 | 13.35 billion years | 2.7 billion ly | 31.8 billion ly |
| JADES-GS-z14-0 | 14.18 | 13.50 billion years | 2.2 billion ly | 33.7 billion ly |
| Cosmic microwave background | 1,090 | 13.79 billion years | 41 million ly | 45.3 billion ly |

The table starts from the measured distance of the Virgo Cluster and measured redshifts for the rest; everything else is computed with the Planck satellite's parameters.[^mei2007][^clowe2006][^bunker2023][^carniani2025][^calc]

The last row fixes the size of the observable universe. The gas that released the microwave background was 41 million light-years from our position then and is 45 billion now; push back to the very beginning and you reach the particle horizon, about 46 billion light-years away.[^calc][^davis2004]

::: myth The observable universe is 13.8 billion light-years in radius, because the universe is 13.8 billion years old.
The oldest light has been travelling for 13.8 billion years, but the matter that sent it is now about 46 billion light-years away, because space kept expanding while the light was in flight. That distance, the particle horizon, is the radius of the observable universe.[^davis2004][^calc]
:::

::: see-it cmb-map
The cosmic microwave background, with its contrast turned up enormously. Every spot on it is a patch of gas that is now about 45 billion light-years away and receding from us at about three times the speed of light.
:::

## Faster than light, legally

Hubble's law says that a galaxy's recession speed is proportional to its distance:

$$v = H_0 D$$

In words: the rate at which the distance to a galaxy is growing equals the Hubble constant times that distance.

Worked example: the Planck satellite's value of the Hubble constant is $H_0 = 67.66$ km/s per megaparsec, and a megaparsec is 3.26 million light-years, so $H_0$ is 20.74 km/s for each million light-years.[^planck2018] JADES-GS-z14-0 is 33,700 million light-years away, so $v = 20.74 \times 33{,}700 \approx 700{,}000$ km/s, or 2.34 times the speed of light.[^calc]

Nothing in the formula stops at $c$. Set $v = c$ and you get $D = c/H_0 = 14.45$ billion light-years, the radius of the *Hubble sphere*. Every galaxy beyond it is getting farther away faster than light today, which means everything with a redshift above about 1.5.[^calc] DESI's 2025 analysis alone used more than 1.2 million quasars at redshifts above 1.77, every one of them receding faster than light.[^desi2025]

This does not break special relativity. The rule explained in [Why nothing outruns light](#/learn/nothing-outruns-light) is local: nothing overtakes a light beam passing right next to it. Each distant galaxy sits at rest among its own neighbours and is not racing through space at all. What grows is the amount of space in between, and relativity sets no speed limit on that. The clearest account is "Expanding confusion", published in 2004 by Tamara Davis, who had just finished a doctorate on cosmic horizons at the University of New South Wales, and Charles Lineweaver.[^davis2004][^davisthesis] They collected misleading statements from textbooks and popular books, and the examples included Richard Feynman, whose lectures on gravitation had waved away galaxies receding faster than light as unobservable by definition. They also tested the idea that cosmological redshifts are Doppler shifts from motion through space against the supernova data, and rejected it at 23 standard deviations.[^davis2004]

::: myth Galaxies receding faster than light are invisible to us.
We see them all the time. Every galaxy with a redshift above about 1.6 was receding faster than light when it sent the light we now receive, and galaxies such as GN-z11 have receded faster than light for their entire history. Their light first drifted away from us, then the growing Hubble sphere overtook it and it began to close in.[^davis2004][^calc]
:::

So the Hubble sphere is not a horizon at all. The horizons that matter are Rindler's: the particle horizon bounds what we can see, and the event horizon bounds what we can reach.

## The edge of reach

Switch on a lamp today and ask how far its light will ever get, measured in today's distances: the painted marks on the rubber.

Over the next 11 billion years the universe will double in size, and meanwhile the light covers 7.9 billion light-years of today's distance. During the next doubling, which takes 12 billion years, it covers another 4.3 billion. Then 2.2, then 1.1, then 0.54: each doubling leaves the universe twice as stretched, so each light-year the beam travels is worth half as much of today's distance as before.[^calc] It is the doubling rope again, and the sum is finite: $7.9 + 4.3 \times (1 + \tfrac12 + \tfrac14 + \cdots) \approx 16.5$, or just under 16.6 billion light-years when done exactly.[^calc]

That is the cosmic event horizon. Light we send now will eventually reach any galaxy closer than 16.6 billion light-years, and never one farther away. The galaxies sitting on the boundary are the ones we see today at a redshift of about 1.85.[^calc][^davis2004] No ship beats light, so the same budget binds every ship. Three consequences follow.

**Most of what we can see is out of reach.** The observable universe has a radius of 46 billion light-years and the reachable part 16.6. Cube the ratio: the reachable region is under 5% of the observable volume, so more than 95% of the observable universe lies where no signal from us will ever arrive.[^calc]

**The edge is moving in.** Light sent a year from now starts a year late, and that year can never be made up. Measured in today's distances, the event horizon shrinks by one light-year every year: each year a shell 16.6 billion light-years in radius and one light-year thick passes out of reach, a volume equal to a ball about 19 million light-years across.[^calc]

**Round trips are shorter.** The signal and the reply have to fit in the same budget, so the limit for a round trip is half the event horizon: 8.3 billion light-years, galaxies we see today at a redshift of 0.69.[^calc] Jeremy Heyl reached almost the same figure in 2005.[^heyl2005]

::: numbers Four limits, measured in today's distances
| Limit | Distance | Meaning |
|---|---|---|
| Round trip | 8.3 billion ly (redshift 0.69) | A signal sent now can get there and a reply can get back |
| Hubble sphere | 14.5 billion ly (redshift 1.48) | Distances beyond this grow faster than light today |
| Event horizon | 16.6 billion ly (redshift 1.85) | Light sent now reaches anything closer, nothing farther |
| Particle horizon | 46 billion ly | The edge of the observable universe |
:::

::: see-it edge-of-reach
Try to plan a flight to a galaxy beyond the event horizon. The planner refuses and explains why: not even light sent today could get there.
:::

## Flying there anyway

A ship can come surprisingly close to light's budget. The app's standard ship holds a steady 1 g, and [Rockets to the stars](#/learn/rockets-to-the-stars) shows what that buys: Andromeda in 29 years of ship time, thanks to [time dilation](#/learn/time-dilation). Beyond the Local Group the expansion changes the rules.

A ship coasting through an expanding universe slows down, measured against the galaxies it passes. It passes galaxy A at some speed; by the time it reaches galaxy B, B is itself moving away from A, so the ship's speed relative to B is lower. Worked through properly, a coasting ship's momentum falls in proportion to how much the universe has stretched: when the universe doubles in size, the momentum halves.[^kwan2010] Light obeys the same rule, which is why its wavelength stretches.

An engine at 1 g adds momentum at a steady rate, 9.8 kg m/s for each kilogram of ship every second. The expansion takes away a fixed *fraction* of the momentum each second, equal to the Hubble rate. At everyday speeds that loss is negligible, but a ship's momentum grows without limit as its speed approaches $c$, and eventually the loss catches up with the gain. The two balance at

$$\gamma_{\max} \approx \frac{g}{cH}$$

In words: the largest Lorentz factor a ship with steady acceleration $g$ can reach is about its acceleration divided by the speed of light times the Hubble rate.

Worked example: with $g = 9.81$ m/s², $c = 3.00 \times 10^{8}$ m/s and $H_0 = 2.19 \times 10^{-18}$ per second, $\gamma_{\max} = 9.81 \div (3.00 \times 10^{8} \times 2.19 \times 10^{-18}) = 1.5 \times 10^{10}$.[^calc] In practice the Hubble rate falls a little while the ship speeds up, so the limit creeps up to about $1.8 \times 10^{10}$, and the ship gets within a few per cent of it after about 27 years. From then on its clock ticks once for every 18 billion ticks at home.[^calc]

By then the ship is effectively a slightly late beam of light, and it inherits light's limit. Accelerate for ever and you get 81% of the way to the event horizon in 25 years of ship time and 99% in 28, but never all the way.[^calc] Juliana Kwan, Geraint Lewis and Berian James found the same shape in 2010: nearly all the distance is covered between about 20 and 26 years of proper time, and extra years add almost nothing.[^kwan2010]

Stopping at the far end costs about as much time again. Here is the app's 1 g flip-and-burn, accelerating to the halfway point and then braking, calculated with the expansion included:[^calc]

| Destination | Distance now | Ship time | Time at home |
|---|---|---|---|
| Andromeda | 2.5 million ly | 28.6 years | 2.5 million years |
| Virgo Cluster | 54 million ly | 34.6 years | 54 million years |
| Bullet Cluster | 4.0 billion ly | 43.2 years | 4.6 billion years |
| A galaxy at redshift 1 | 11.1 billion ly | 46.0 years | 18.9 billion years |
| A galaxy at redshift 1.5 | 14.6 billion ly | 47.6 years | 36.7 billion years |
| 99% of the way to the edge | 16.4 billion ly | 50.2 years | 78 billion years |
| JADES-GS-z14-0 | 33.7 billion ly | never | never |

The ship times hardly grow. A galaxy at redshift 1 is 200 times farther away than the Virgo Cluster and costs only 11 more years on board; almost all the extra time piles up at home. Every galaxy inside the event horizon can be reached within a human lifetime of ship time. The crew bound for redshift 1 would step out after 46 years into a universe 32.7 billion years old, 35 billion light-years from the Milky Way, and on their own: a message sent home on arrival gets back only from inside the round-trip limit.[^calc]

::: see-it fly:virgo-cluster
A 1 g flight to the Virgo Cluster, the nearest big cluster of galaxies. Watch the two clocks: about 35 years pass on board and about 54 million at home.
:::

### What the target looks like on the way

Point the ship at JADES-GS-z14-0. The expansion stretched its light 15-fold, but your own motion squeezes it back, through the Doppler effect described in [What you would see near the speed of light](#/learn/seeing-near-light-speed). The two effects multiply:

$$1 + z_{\text{seen}} = (1 + z)\sqrt{\frac{1-\beta}{1+\beta}}$$

In words: one plus the redshift you see equals one plus the galaxy's cosmological redshift, multiplied by the Doppler factor for your speed $\beta$, written as a fraction of the speed of light.

Worked example: to cancel the galaxy's redshift completely, the square root must equal $1/15.18$. That happens at $\beta = 0.9914$, a Lorentz factor of 7.6, which a 1 g ship reaches after 2.6 years of ship time.[^calc] At that moment JADES-GS-z14-0 looks as blue as a galaxy next door, with its hydrogen cut-off back at 121.6 nm. None of this brings it within reach: it stopped being reachable before the Sun was born.[^calc]

::: see-it cmb-glow
The same squeeze works on the oldest light there is: on a 1 g flight the microwave background ahead is blueshifted until it glows.
:::

## The farthest things we have seen

The distance record has moved fast. In 2016 Pascal Oesch and colleagues used the Hubble Space Telescope's infrared camera, with a grism spreading the light into a spectrum, to catch a sharp break at 1.47 micrometres in the light of a galaxy called GN-z11. Only one explanation fitted: hydrogen's cut-off at a redshift of 11.09, about 400 million years after the Big Bang.[^oesch2016] In 2023 Webb's spectrograph, reading a whole set of emission lines, revised it to 10.60.[^bunker2023]

Then came JADES-GS-z14-0, first at 14.32 from the shape of its break and then at 14.18 from ALMA's oxygen line.[^carniani2024][^carniani2025] The oxygen line has a wavelength of 88 micrometres when it leaves the galaxy and 1.34 millimetres when it arrives, far enough stretched to be picked up by a radio telescope.[^calc] In May 2025 Rohan Naidu and colleagues confirmed MoM-z14 at redshift 14.44, 280 million years after the Big Bang.[^naidu2025] As of September 2026 that is still the record: a galaxy confirmed in January 2026 at 13.53 was only the fourth most distant known, and a preprint posted this week notes that deeper spectroscopy of fainter candidates keeps finding impostors.[^donnan2026][^zhang2026]

Some impostors are very close to home. In April 2026 Maruša Bradač and colleagues reported that two promising candidates beyond redshift 15, found in Webb images of the Bullet Cluster, had the spectra of brown dwarfs: failed stars a few hundred to about two thousand light-years away in our own galaxy, one of them at 272 to 351 K, roughly the temperature range of liquid water. Images a year apart showed both moving across the sky, which no galaxy at redshift 15 could do.[^bradac2026]

Every one of the real record-holders lies about twice as far away as the edge of reach.[^calc] In 2002 Abraham Loeb pointed out what that means for the pictures we will get. Light from such a galaxy keeps arriving for ever, but it only ever shows the galaxy up to the moment it crossed our event horizon; after that the image freezes, reddens and fades.[^loeb2002] For JADES-GS-z14-0 that moment came when the universe was about 3.3 billion years old. We see it now at 290 million years; watch for a trillion years and it will never look older than 3.3 billion.[^calc]

::: see-it go:gn-z11
GN-z11, the galaxy that held the distance record from 2016 until Webb. It is now nearly twice as far away as anything we could ever reach.
:::

## The long goodbye

Not everything is leaving. Gravity holds the Local Group together against the expansion, and Andromeda is falling towards us at about 110 km/s.[^krauss2007][^vdm2012]

::: myth The Milky Way and Andromeda will collide in about five billion years.
That was the standard forecast after the Hubble Space Telescope measured Andromeda's sideways motion in 2012. In 2025 Till Sawala and colleagues added the pull of the Triangulum Galaxy and the Large Magellanic Cloud, and the uncertainties in all the measurements, and found close to even odds that the two galaxies do not merge at all in the next 10 billion years. In the runs where they do merge, the median time is 7.6 billion years.[^sawala2025][^vdm2012]
:::

Either way the Local Group stays bound. Kentaro Nagamine and Abraham Loeb simulated the neighbourhood's future in 2002 and found that in the far future the only big galaxy left inside our event horizon is the one the Milky Way and Andromeda eventually make together.[^nagamine2003][^krauss2007]

::: see-it local-group
The Local Group from outside: the Milky Way, Andromeda, Triangulum and their small companions. This is everything that will still be in our sky once the rest of the universe has gone.
:::

::: see-it fly:andromeda
The 1 g flight to Andromeda: 28.6 years on board, 2.5 million at home, and the one big galaxy that will stay our neighbour for good.
:::

Everything else fades on a schedule set by the event horizon. Take the Virgo Cluster, the nearest big cluster, which is not bound to us.[^nagamine2003] Treating it as moving purely with the expansion, the last light it sends that will ever reach us leaves it when the universe is about 113 billion years old. Nobody would see it vanish; its image would slow down and redden instead. Seen when the universe is 150 billion years old its light would be stretched ninefold, and at 200 billion years 146-fold.[^calc] Lawrence Krauss and Robert Scherrer put the general case in 2007: over roughly 100 billion years, every structure beyond the Local Group is carried out of view.[^krauss2007]

Their paper then asked what astronomers born in that era would conclude. Their sky would hold one large galaxy, a few satellites and black emptiness: no receding galaxies, so no Hubble's law to find. The microwave background, cooled to about 0.02 K by the time the universe is 100 billion years old, would be a faint radio hiss, and a few hundred billion years later its wavelengths would be too long to pass through the thin gas of their own galaxy at all.[^krauss2007][^calc] The helium made in the Big Bang would be buried under helium made by generations of stars.[^krauss2007] Such astronomers, Krauss and Scherrer argued, would reasonably decide that they lived in a single static island of stars, which is roughly what most astronomers believed in 1900. They called the paper "The return of a static universe and the end of cosmology".

The stars are winding down too. The rate at which the universe makes new stars has been falling for about 11 billion years, and David Sobral and colleagues estimated that if it keeps falling the same way, the total mass in stars will end up only about 5% higher than it is today.[^sobral2013] In 1997 Fred Adams and Gregory Laughlin sketched what comes after. Small red dwarfs shine for trillions of years, but by about $10^{14}$ years, a hundred trillion, the gas for new stars is gone and ordinary starlight ends. Then come eras of dead stars and of evaporating black holes, and, if protons decay as some theories predict, a cold, dark, nearly empty expanse in which nothing more can happen: what physicists call heat death.[^adams1997]

## If dark energy changes

Every distance in this article rests on two measurements: how fast the universe is expanding today, and what dark energy will do in the future.

The first is disputed. Planck's value of 67.66 km/s per megaparsec comes from the microwave background, read through the standard model of the universe. Measure the expansion directly, with Cepheid variable stars and supernovae, and the SH0ES team get $73.04 \pm 1.04$.[^planck2018][^riess2022] All horizon distances scale with $1/H_0$, so using 73 instead of 67.66 shrinks the event horizon from 16.6 to 15.4 billion light-years and the observable universe from 46.2 to 42.8.[^calc] That disagreement, the Hubble tension, is still unresolved.

The second matters far more. The event horizon exists because dark energy wins. Give the universe more matter and less dark energy and the horizon moves out: with 50% matter instead of 31% it would sit at 18.6 billion light-years. Take dark energy away entirely and there is no event horizon at all.[^calc] If dark energy is a true constant, the horizon is permanent. If it fades, the doors could reopen.

That is why a 2025 result caused a stir. The Dark Energy Spectroscopic Instrument, DESI, on the 4-metre Mayall Telescope at Kitt Peak in Arizona, takes the spectra of 5,000 galaxies at a time and uses a ripple in their spacing, about 150 megaparsecs across and imprinted by sound waves in the early universe, as a ruler.[^lbl2025][^desiblog2026] In March 2025, from three years of data and more than 14 million galaxies and quasars, the collaboration reported that a dark energy which weakens with time fitted the combined data better than a constant, at 2.8 to 4.2 standard deviations depending on which supernova sample was added.[^desi2025][^lbl2025] Physicists want five before calling something a discovery, and the Berkeley Lab announcement said plainly that many 3-sigma results fade.[^lbl2025]

Since then the hint has shrunk a little but not vanished. Recalibrating the Dark Energy Survey's supernovae brought the strongest figure down from 4.2 to 3.2 standard deviations; that survey's full six-year analysis, combined with DESI and the microwave background, gives 3.0; a combined sample of 2,884 supernovae released this month gives 3.3.[^popovic2025][^des2026][^camilleri2026] It is a persistent hint, not a discovery.

::: see-it cosmic-web
The large-scale structure of real galaxies from redshift surveys: filaments, walls and voids. Surveys such as DESI read the history of dark energy from the spacing of this pattern at different distances.
:::

What would it mean if it held? The fits use a simple formula for how dark energy changes, designed to describe the past, not to forecast. Run the best-fitting versions forward anyway, as an illustration, and the acceleration stops within about 5 to 10 billion years, the expansion goes back to slowing down, and the event horizon disappears: light sent today would keep gaining ground for ever.[^calc] The opposite possibility was worked out in 2003 by Robert Caldwell, Marc Kamionkowski and Nevin Weinberg. If dark energy grew stronger with time, the expansion could run away to infinity in a finite time. In one of their examples this "Big Rip" comes 22 billion years from now, tears apart the Milky Way 60 million years before the end and breaks up the Earth half an hour before it.[^caldwell2003] The current hints point the other way.

## What comes next

Here is what is running or on its way as of September 2026.

### DESI's full survey

DESI finished its planned five-year survey on the night of 14 to 15 April 2026, ahead of schedule, with more than 47 million galaxies and quasars against a target of 34 million. It will keep observing through 2028 and enlarge its map from 14,000 to 17,000 square degrees.[^lbl2026]

**Status:** the first dark energy results from the full five years of data are expected in 2027; no exact date has been announced.

### Euclid's first big release

ESA's Euclid space telescope is mapping galaxies across a large part of the sky. Its first big data release comes in two stages: images, catalogues and spectra for about 1,900 square degrees in November 2026, then the full release, with the products for galaxy clustering and weak lensing, in mid-2027.[^euclid2026]

**Status:** timetable confirmed in ESA's update of 15 June 2026.

### The Roman Space Telescope

NASA's Nancy Grace Roman Space Telescope launched on a Falcon Heavy on 30 August 2026; its wide, deep surveys are meant partly to pin down dark energy.[^roman2026a] Its first course correction used less than a tenth of the fuel set aside for it, leaving enough for at least 22 years of science, and it should settle into its orbit around the L2 point, about 1.5 million km from Earth, in early December.[^roman2026b][^roman2026c]

**Status:** being commissioned; science operations are due to begin by early 2027.[^roman2026c]

### Rubin's ten-year survey

The Vera C. Rubin Observatory in Chile officially began its ten-year Legacy Survey of Space and Time at the end of June 2026 (announced on 30 June), returning to each point of the southern sky about 800 times; dark energy and dark matter are among its targets.[^noirlab2616]

**Status:** running; data releases will come in stages over the decade.

### Beyond redshift 15

Webb keeps hunting for galaxies beyond the current record, and ESO's 39-metre Extremely Large Telescope is planned to see first light in 2029, with science observations from December 2030.[^elt] Whether galaxies existed in any numbers before redshift 15 is open. One preprint from this week argues the drop-off is real and points to an unusual kind of dark matter; others expect fainter galaxies to turn up as the searches go deeper.[^zhang2026]

**Status:** active research; ELT dates are plans, not guarantees.

### The fate of the edge

Whether the event horizon is permanent depends on whether dark energy is truly constant. If DESI's full data, Euclid and Roman confirm a changing dark energy, every forecast in the long goodbye above will have to be redone. If they don't, the edge stays put and keeps closing in by a light-year a year.

**Status:** open. The next big step is DESI's five-year analysis, expected in 2027, followed by Euclid and Roman results later in the decade; nobody can say when the question will be settled.

## Further reading and watching

### Papers

- W. Rindler, "Visual horizons in world-models", *Monthly Notices of the Royal Astronomical Society* 116, 662-677 (1956). https://doi.org/10.1093/mnras/116.6.662 (republished as a "Golden Oldie" in *General Relativity and Gravitation* 34, 133-153 (2002), https://doi.org/10.1023/A:1015347106729)
- A. G. Riess et al., "Observational evidence from supernovae for an accelerating universe and a cosmological constant", *Astronomical Journal* 116, 1009-1038 (1998). https://doi.org/10.1086/300499 (open access at https://arxiv.org/abs/astro-ph/9805201)
- S. Perlmutter et al., "Measurements of Ω and Λ from 42 high-redshift supernovae", *Astrophysical Journal* 517, 565-586 (1999). https://doi.org/10.1086/307221 (open access at https://arxiv.org/abs/astro-ph/9812133)
- T. M. Davis and C. H. Lineweaver, "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe", *Publications of the Astronomical Society of Australia* 21, 97-109 (2004). https://doi.org/10.1071/AS03040 (open access at https://arxiv.org/abs/astro-ph/0310808; the best single paper on this subject)
- A. Loeb, "Long-term future of extragalactic astronomy", *Physical Review D* 65, 047301 (2002). https://doi.org/10.1103/PhysRevD.65.047301 (open access at https://arxiv.org/abs/astro-ph/0107568)
- L. M. Krauss and R. J. Scherrer, "The return of a static universe and the end of cosmology", *General Relativity and Gravitation* 39, 1545-1550 (2007). https://doi.org/10.1007/s10714-007-0472-9 (open access at https://arxiv.org/abs/0704.0221; short and readable)
- J. S. Heyl, "The long-term future of space travel", *Physical Review D* 72, 107302 (2005). https://doi.org/10.1103/PhysRevD.72.107302 (open access at https://arxiv.org/abs/astro-ph/0509268)
- J. Kwan, G. F. Lewis and J. B. James, "The adventures of the rocketeer: accelerated motion under the influence of expanding space", *Publications of the Astronomical Society of Australia* 27, 15-22 (2010). https://doi.org/10.1071/AS09050 (open access at https://arxiv.org/abs/0909.1551)
- S. Carniani et al., "Spectroscopic confirmation of two luminous galaxies at a redshift of 14", *Nature* 633, 318-322 (2024). https://doi.org/10.1038/s41586-024-07860-9 (open access at https://arxiv.org/abs/2405.18485)
- R. P. Naidu et al., "A cosmic miracle: a remarkably luminous galaxy at z = 14.44 confirmed with JWST", *The Open Journal of Astrophysics* 9 (2026). https://doi.org/10.33232/001c.156033 (open access; also https://arxiv.org/abs/2505.11263)
- DESI Collaboration (M. Abdul Karim et al.), "DESI DR2 results II: measurements of baryon acoustic oscillations and cosmological constraints", *Physical Review D* 112, 083515 (2025). https://doi.org/10.1103/tr6y-kpc6 (open access at https://arxiv.org/abs/2503.14738)
- T. Sawala et al., "No certainty of a Milky Way–Andromeda collision", *Nature Astronomy* 9, 1206-1217 (2025). https://doi.org/10.1038/s41550-025-02563-1 (open access at https://arxiv.org/abs/2408.00064)
- F. C. Adams and G. Laughlin, "A dying universe: the long-term fate and evolution of astrophysical objects", *Reviews of Modern Physics* 69, 337-372 (1997). https://doi.org/10.1103/RevModPhys.69.337 (open access at https://arxiv.org/abs/astro-ph/9701131)
- R. R. Caldwell, M. Kamionkowski and N. N. Weinberg, "Phantom energy: dark energy with w < −1 causes a cosmic doomsday", *Physical Review Letters* 91, 071301 (2003). https://doi.org/10.1103/PhysRevLett.91.071301 (open access at https://arxiv.org/abs/astro-ph/0302506)

### Books

- Tamara M. Davis, *Fundamental Aspects of the Expansion of the Universe and Cosmic Horizons* (PhD thesis, University of New South Wales, 2003). Book-length, clear and free online at https://arxiv.org/abs/astro-ph/0402278
- Edward Harrison, *Cosmology: The Science of the Universe* (Cambridge University Press, 2nd edition 2000). An introductory textbook that Davis's thesis cites among the efforts to clear up the confusion over superluminal recession.
- Barbara Ryden, *Introduction to Cosmology* (Cambridge University Press, 2nd edition 2017). The standard undergraduate text, for when you have some calculus.
- Richard Panek, *The 4 Percent Universe* (Houghton Mifflin Harcourt, 2011). A journalist's account of dark matter, dark energy and the race between the two supernova teams.
- Fred Adams and Greg Laughlin, *The Five Ages of the Universe* (Free Press, 1999). The popular version of their paper on the far future.
- Katie Mack, *The End of Everything (Astrophysically Speaking)* (Scribner, 2020). A cosmologist's funny, careful guide to the possible ends, heat death and Big Rip included.

### Videos

- [How Much Of The Universe Can Humanity Ever See?](https://www.youtube.com/watch?v=eVoh27gJgME), PBS Space Time, 18:03. Works out, step by step, the absolute limit of what we will ever see of the universe beyond our galaxy.
- [TRUE Limits Of Humanity – The Final Border We Will Never Cross](https://www.youtube.com/watch?v=uzkD5SeuwzM), Kurzgesagt – In a Nutshell, 11:40. The reachable universe in beautiful animation, with a public list of its sources.
- [Cosmic Confusion II: Cosmic Event Horizons](https://www.youtube.com/watch?v=WrhsPZt5JtM), CAASTRO, 18:35. Tamara Davis herself explaining the horizons she spent her doctorate untangling.
- [Misconceptions About the Universe](https://www.youtube.com/watch?v=XBr4GkRnY04), Veritasium, 5:46. Can we see things receding faster than light? Six minutes on why the answer is yes.
- [Ant On A Rubber Rope Paradox](https://www.youtube.com/watch?v=OM9KepKsg6U), Vsauce2, 12:09. The puzzle from this article, with a link to a proof that the harmonic series never stops growing and a nod to the expanding universe.
- [JWST SMASHES DISTANCE RECORD! The Current Farthest Galaxy JADES-GS-z14-0](https://www.youtube.com/watch?v=YXRJH4-bOSA), Kevin Hainline, 32:02. One of the JADES astronomers who found the galaxy, explaining how, on the day it was announced.
- [MORE evidence for DARK ENERGY changing with time?! | Night Sky News March 2025](https://www.youtube.com/watch?v=j6HZaaypoSI), Dr. Becky, 32:07. An astrophysicist's monthly news show; the DESI segment is a clear, careful reading of the 2025 results.
- [Simplified DESI Dark Energy Results](https://www.youtube.com/watch?v=NiHgzb8PkYs), Mus Ishak-Boushaki, 4:53. A DESI cosmologist summarises what the survey found in five minutes.
- [How to travel faster than light](https://www.youtube.com/watch?v=BhG_QZl8WVY), Fermilab, 10:59. Don Lincoln on the ways the universe really does get round the speed limit, and why none of them breaks relativity.

### Online

- NASA Science, "NASA's James Webb Space Telescope finds most distant known galaxy" (30 May 2024), the discovery of JADES-GS-z14-0 told by two of the astronomers who made it: https://science.nasa.gov/blogs/webb/2024/05/30/nasas-james-webb-space-telescope-finds-most-distant-known-galaxy/
- Ned Wright's Cosmology Calculator (UCLA): type in a redshift and get the light-travel time and the distances then and now, as in the table above: https://www.astro.ucla.edu/~wright/CosmoCalc.html
- Ned Wright's Cosmology Tutorial, a long-running and careful introduction: https://www.astro.ucla.edu/~wright/cosmo_01.htm
- C. H. Lineweaver and T. M. Davis, "Misconceptions about the Big Bang", *Scientific American* (March 2005), the popular version of "Expanding confusion" (may be paywalled): https://www.scientificamerican.com/article/misconceptions-about-the-2005-03/
- Berkeley Lab, "DESI completes planned 3D map of the universe and continues exploring" (15 April 2026): https://newscenter.lbl.gov/2026/04/15/desi-completes-planned-3d-map-of-the-universe-and-continues-exploring/
- The Physics FAQ, "The relativistic rocket", the formulas behind a 1 g flight in flat space: https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html
- Kurzgesagt's source list for the limits of humanity video, with links to the papers behind each claim: https://sites.google.com/view/sources-truelimitsofhumanity/
- ESA, Euclid data release timeline: https://www.cosmos.esa.int/web/euclid/dr1-timeline

[^calc]: Computed for this article in a flat Λ cold-dark-matter universe with the Planck 2018 parameters (H₀ = 67.66 km/s/Mpc, Ωm = 0.3111, radiation Ωr = 9.07 × 10⁻⁵, ΩΛ = 0.6888), by numerical integration of the expansion history; age 13.79 billion years. Ship flights assume a constant proper acceleration of 9.81 m/s² and include the loss of momentum to the expansion. Illustrative extrapolations of evolving dark energy use the DESI 2025 and later best fits. Planck Collaboration, "Planck 2018 results. VI. Cosmological parameters", *Astronomy & Astrophysics* 641, A6 (2020). https://doi.org/10.1051/0004-6361/201833910
[^carniani2024]: S. Carniani et al., "Spectroscopic confirmation of two luminous galaxies at a redshift of 14", *Nature* 633, 318-322 (2024); observations 10-12 January 2024; no flux blueward of 1.85 µm; the foreground galaxy 0.4 arcsec away. https://doi.org/10.1038/s41586-024-07860-9 (arXiv: https://arxiv.org/abs/2405.18485)
[^nasa2024]: S. Carniani and K. Hainline, "NASA's James Webb Space Telescope finds most distant known galaxy", NASA Science Webb blog (30 May 2024). https://science.nasa.gov/blogs/webb/2024/05/30/nasas-james-webb-space-telescope-finds-most-distant-known-galaxy/
[^carniani2025]: S. Carniani et al., "The eventful life of a luminous galaxy at z = 14: metal enrichment, feedback, and low gas fraction?", *Astronomy & Astrophysics* 696, A87 (2025): [O III] 88 µm at 223.524 GHz, z = 14.1796. https://doi.org/10.1051/0004-6361/202452451
[^desitter1917]: W. de Sitter, "On Einstein's theory of gravitation and its astronomical consequences. Third paper", *Monthly Notices of the Royal Astronomical Society* 78, 3-28 (1917). https://doi.org/10.1093/mnras/78.1.3
[^krauss2007]: L. M. Krauss and R. J. Scherrer, "The return of a static universe and the end of cosmology", *General Relativity and Gravitation* 39, 1545-1550 (2007). https://doi.org/10.1007/s10714-007-0472-9 (arXiv: https://arxiv.org/abs/0704.0221)
[^hubble1929]: E. Hubble, "A relation between distance and radial velocity among extra-galactic nebulae", *Proceedings of the National Academy of Sciences* 15, 168-173 (1929). https://doi.org/10.1073/pnas.15.3.168
[^utd2019]: University of Texas at Dallas, "UT Dallas remembers founding faculty member Wolfgang Rindler" (2019). https://news.utdallas.edu/faculty-staff/ut-dallas-remembers-founding-faculty-member-wolfgang-rindler/
[^rindler1956]: W. Rindler, "Visual horizons in world-models", *Monthly Notices of the Royal Astronomical Society* 116, 662-677 (1956). https://doi.org/10.1093/mnras/116.6.662
[^riessnobel]: A. G. Riess, "My path to the accelerating universe", Nobel Lecture, 8 December 2011. https://www.nobelprize.org/uploads/2018/06/riess_lecture.pdf
[^riess1998]: A. G. Riess et al., "Observational evidence from supernovae for an accelerating universe and a cosmological constant", *Astronomical Journal* 116, 1009-1038 (1998). https://doi.org/10.1086/300499
[^perlmutter1999]: S. Perlmutter et al., "Measurements of Ω and Λ from 42 high-redshift supernovae", *Astrophysical Journal* 517, 565-586 (1999). https://doi.org/10.1086/307221
[^nobel2011]: NobelPrize.org, "The Nobel Prize in Physics 2011", press release. https://www.nobelprize.org/prizes/physics/2011/press-release/
[^planck2018]: Planck Collaboration, "Planck 2018 results. VI. Cosmological parameters", *Astronomy & Astrophysics* 641, A6 (2020): H₀ = 67.66 ± 0.42 km/s/Mpc, ΩΛ = 0.6889 (TT,TE,EE+lowE+lensing+BAO). https://doi.org/10.1051/0004-6361/201833910
[^davis2004]: T. M. Davis and C. H. Lineweaver, "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe", *Publications of the Astronomical Society of Australia* 21, 97-109 (2004). https://doi.org/10.1071/AS03040 (arXiv: https://arxiv.org/abs/astro-ph/0310808)
[^davisthesis]: T. M. Davis, "Fundamental aspects of the expansion of the universe and cosmic horizons", PhD thesis, University of New South Wales (2003). https://arxiv.org/abs/astro-ph/0402278
[^mei2007]: S. Mei et al., "The ACS Virgo Cluster Survey. XIII. SBF distance catalog and the three-dimensional structure of the Virgo Cluster", *Astrophysical Journal* 655, 144-162 (2007): mean distance 16.5 Mpc. https://doi.org/10.1086/509598
[^clowe2006]: D. Clowe et al., "A direct empirical proof of the existence of dark matter", *Astrophysical Journal* 648, L109-L113 (2006): the Bullet Cluster at z = 0.296. https://doi.org/10.1086/508162
[^bunker2023]: A. J. Bunker et al., "JADES NIRSpec spectroscopy of GN-z11: Lyman-α emission and possible enhanced nitrogen abundance in a z = 10.60 luminous galaxy", *Astronomy & Astrophysics* 677, A88 (2023). https://doi.org/10.1051/0004-6361/202346159
[^desi2025]: DESI Collaboration (M. Abdul Karim et al.), "DESI DR2 results II: measurements of baryon acoustic oscillations and cosmological constraints", *Physical Review D* 112, 083515 (2025): more than 14 million galaxies and quasars; more than 1.2 million quasars at z > 1.77; preference for evolving dark energy of 2.8-4.2σ with supernovae. https://doi.org/10.1103/tr6y-kpc6 (arXiv: https://arxiv.org/abs/2503.14738)
[^heyl2005]: J. S. Heyl, "The long-term future of space travel", *Physical Review D* 72, 107302 (2005): round trips limited to galaxies seen today at z ≈ 0.65 in his model. https://doi.org/10.1103/PhysRevD.72.107302
[^kwan2010]: J. Kwan, G. F. Lewis and J. B. James, "The adventures of the rocketeer: accelerated motion under the influence of expanding space", *Publications of the Astronomical Society of Australia* 27, 15-22 (2010). https://doi.org/10.1071/AS09050 (arXiv: https://arxiv.org/abs/0909.1551)
[^oesch2016]: P. A. Oesch et al., "A remarkably luminous galaxy at z = 11.1 measured with Hubble Space Telescope grism spectroscopy", *Astrophysical Journal* 819, 129 (2016). https://doi.org/10.3847/0004-637X/819/2/129
[^naidu2025]: R. P. Naidu et al., "A cosmic miracle: a remarkably luminous galaxy at z_spec = 14.44 confirmed with JWST", *The Open Journal of Astrophysics* 9 (2026); preprint first posted 16 May 2025. https://doi.org/10.33232/001c.156033 (arXiv: https://arxiv.org/abs/2505.11263)
[^donnan2026]: C. T. Donnan et al., "Spectroscopic confirmation of a large and luminous galaxy with weak emission lines at z = 13.53" (January 2026), preprint, accepted by the *Astrophysical Journal*: PAN-z14-1 is "the fourth most distant galaxy known to date". https://arxiv.org/abs/2601.11515
[^zhang2026]: J. Zhang et al., "JWST evidence for a sharp 'Cosmic Daybreak' at z = 15" (23 September 2026), preprint. https://arxiv.org/abs/2609.28257
[^bradac2026]: M. Bradač et al., "Two exciting high-redshift galaxy candidates turn out to be two exciting ultra-cool brown dwarfs" (April 2026), preprint, accepted by the *Astrophysical Journal Letters*: temperatures 272-351 K and 445-525 K, distances of about 150-650 parsecs, proper motions from imaging about a year later. https://arxiv.org/abs/2604.23668
[^loeb2002]: A. Loeb, "Long-term future of extragalactic astronomy", *Physical Review D* 65, 047301 (2002). https://doi.org/10.1103/PhysRevD.65.047301 (arXiv: https://arxiv.org/abs/astro-ph/0107568)
[^vdm2012]: R. P. van der Marel et al., "The M31 velocity vector. II. Radial orbit toward the Milky Way and implied Local Group mass", *Astrophysical Journal* 753, 8 (2012): radial velocity −109.3 ± 4.4 km/s. https://doi.org/10.1088/0004-637X/753/1/8
[^sawala2025]: T. Sawala et al., "No certainty of a Milky Way–Andromeda collision", *Nature Astronomy* 9, 1206-1217 (2025). https://doi.org/10.1038/s41550-025-02563-1 (arXiv: https://arxiv.org/abs/2408.00064)
[^nagamine2003]: K. Nagamine and A. Loeb, "Future evolution of nearby large-scale structures in a universe dominated by a cosmological constant", *New Astronomy* 8, 439-448 (2003). https://doi.org/10.1016/S1384-1076(02)00234-8 (arXiv: https://arxiv.org/abs/astro-ph/0204249)
[^sobral2013]: D. Sobral et al., "A large Hα survey at z = 2.23, 1.47, 0.84 and 0.40: the 11 Gyr evolution of star-forming galaxies from HiZELS", *Monthly Notices of the Royal Astronomical Society* 428, 1128-1146 (2013). https://doi.org/10.1093/mnras/sts096
[^adams1997]: F. C. Adams and G. Laughlin, "A dying universe: the long-term fate and evolution of astrophysical objects", *Reviews of Modern Physics* 69, 337-372 (1997). https://doi.org/10.1103/RevModPhys.69.337
[^riess2022]: A. G. Riess et al., "A comprehensive measurement of the local value of the Hubble constant with 1 km/s/Mpc uncertainty from the Hubble Space Telescope and the SH0ES team", *Astrophysical Journal Letters* 934, L7 (2022). https://doi.org/10.3847/2041-8213/ac5c5b
[^lbl2026]: Berkeley Lab News Center, "DESI completes planned 3D map of the universe and continues exploring" (15 April 2026; the survey's last planned observations were made "last night"). https://newscenter.lbl.gov/2026/04/15/desi-completes-planned-3d-map-of-the-universe-and-continues-exploring/
[^desiblog2026]: DESI Collaboration, blog post on the DR2 Lyman-alpha full-shape results (30 July 2026), describing the 150-megaparsec baryon acoustic oscillation scale. https://www.desi.lbl.gov/2026/07/30/new-desi-dr2-lyman-alpha-results-shed-light-on-dark-energy/
[^lbl2025]: Berkeley Lab News Center, "New DESI results strengthen hints that dark energy may evolve" (19 March 2025). https://newscenter.lbl.gov/2025/03/19/new-desi-results-strengthen-hints-that-dark-energy-may-evolve/
[^popovic2025]: B. Popovic et al., "The Dark Energy Survey supernova program: a reanalysis of cosmology results and evidence for evolving dark energy with an updated type Ia supernova calibration", *Monthly Notices of the Royal Astronomical Society* (2026). https://arxiv.org/abs/2511.07517
[^des2026]: DES Collaboration, "Constraints on dynamical dark energy from multiple probes in the full Dark Energy Survey" (May 2026), preprint: 2.2σ from DES alone, 2.3σ with DESI DR2 BAO, 3.0σ with DESI DR2 BAO and the CMB. https://arxiv.org/abs/2605.27221
[^camilleri2026]: R. Camilleri et al., "Supernovae Unite: combining Pantheon+ and DES-SN5YR" (September 2026), preprint. https://arxiv.org/abs/2609.05053
[^caldwell2003]: R. R. Caldwell, M. Kamionkowski and N. N. Weinberg, "Phantom energy: dark energy with w < −1 causes a cosmic doomsday", *Physical Review Letters* 91, 071301 (2003): for w = −3/2 and H₀ = 70, the Big Rip comes in 22 billion years. https://doi.org/10.1103/PhysRevLett.91.071301
[^euclid2026]: ESA Cosmos, "Euclid DR1 timeline" (update of 15 June 2026). https://www.cosmos.esa.int/web/euclid/dr1-timeline
[^roman2026a]: NASA Science, Roman Space Telescope blog, "NASA concludes Roman Space Telescope launch coverage" (30 August 2026). https://science.nasa.gov/blogs/roman/2026/08/30/nasa-concludes-roman-space-telescope-launch-coverage/
[^roman2026b]: NASA Science, Roman Space Telescope blog, "Fuel savings double potential lifetime for NASA's Roman mission" (14 September 2026). https://science.nasa.gov/blogs/roman/2026/09/14/fuel-savings-double-potential-lifetime-for-nasas-roman-mission/
[^roman2026c]: NASA Science, Roman Space Telescope blog, "NASA's Roman team confirms ground stations receiving data" (25 September 2026). https://science.nasa.gov/blogs/roman/2026/09/25/nasas-roman-team-confirms-ground-stations-receiving-data/
[^noirlab2616]: NSF NOIRLab, "Action! NSF–DOE Vera C. Rubin Observatory begins capturing the greatest cosmic movie ever made", release noirlab2616 (30 June 2026). https://noirlab.edu/public/news/noirlab2616/
[^elt]: ESO, "ELT timeline". https://elt.eso.org/about/timeline/
