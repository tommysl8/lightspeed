---
slug: rockets-to-the-stars
title: Rockets to the stars
shelf: light
order: 5
pitch: At 1 g a ship reaches the nearest star in 3.5 years of its own time. Physics allows it. The fuel bill is the problem, and it compounds like interest.
updated: 2026-09-25
---

On Christmas Eve 2024, Parker Solar Probe skimmed 6.1 million km above the surface of the Sun at 192 km/s, faster than any object people have ever built. Its operators waited until late on 26 December for a beacon tone saying it had come through the pass in working order.[^nasa2024] At that speed Parker would reach Proxima Centauri, the nearest star, in about 6,600 years, if it were heading that way. It is not, and it never will be.

The ship in this app makes the same trip in 3.5 years by its own clock. It pushes at a steady one Earth gravity, turns round at the halfway point and brakes for the rest of the way, touching 95% of the speed of light in the middle. Special relativity describes that flight exactly, down to the 5.9 years that pass at home ([Time dilation is real](#/learn/time-dilation) explains why the clocks disagree). No law of physics forbids it. What stands between Parker Solar Probe and that ship is a fuel bill, and the bill has an unpleasant shape: it compounds, like interest on a loan.

A handful of people wrote that bill down. Others designed machines to pay it: ships riding hydrogen bombs, fusion engines fed with frozen pellets, a magnetic scoop wider than the Moon and sails pushed by lasers.

::: timeline Rockets and the stars
- **1810:** William Moore in Woolwich works out how a rocket moves in empty space, and finds a logarithm.
- **1897:** Konstantin Tsiolkovsky writes down the rocket equation in Kaluga.
- **1903:** Tsiolkovsky publishes it. Nearly every copy of the journal is confiscated.
- **1920:** The New York Times mocks Robert Goddard for thinking a rocket can work in a vacuum.
- **1926:** Goddard flies the first liquid-fuel rocket, for 2.5 seconds.
- **1946:** Jakob Ackeret publishes the rocket equation for speeds near that of light.
- **1960:** Robert Bussard proposes the interstellar ramjet.
- **1963:** The Test Ban Treaty outlaws nuclear explosions in space, dooming Project Orion.
- **1973:** British Interplanetary Society volunteers start designing Daedalus, a fusion probe to Barnard's Star.
- **2016:** Breakthrough Starshot announces gram-scale probes to be pushed by lasers to 20% of light speed.
- **2024:** Parker Solar Probe reaches 192 km/s. Starshot is put on hold.
- **2026:** Physicists at CERN drive 92 antiprotons round the laboratory in a truck.
:::

## A logarithm from Woolwich

On 3 November 1810 William Moore of the Royal Military Academy in Woolwich sent a paper to William Nicholson's Journal of Natural Philosophy in London, "On the Motion of Rockets both in Nonresisting and Resisting Mediums". It had a practical motive. British forces had recently fired William Congreve's war rockets into Copenhagen and Flushing, and Moore complained that the theory of rockets was "a subject, which has never yet engaged the attention of mathematicians".[^moore1810] His answer for a rocket in empty space contained a natural logarithm, which he called by its old name, the hyperbolic logarithm. He expanded the work into a book in 1813, reputedly the first ever written on the motion of rockets.[^johnson1995] Then the subject went quiet for most of a century.

The equation carries somebody else's name. Konstantin Tsiolkovsky lost most of his hearing to scarlet fever at the age of ten and had to leave school. He taught himself mathematics and physics, taught at a school in Borovsk and, from 1892, in Kaluga, a provincial town south-west of Moscow.[^esa] In a manuscript he called Rocket he wrote out the formula for a rocket's final speed and dated it 10 May 1897, by the old Russian calendar; by ours it was 22 May.[^naukarf]

He published it in the May 1903 issue of Nauchnoe Obozrenie (Scientific Review), a St Petersburg journal, under the title "Exploration of cosmic space by means of reaction devices". The same issue carried a politically revolutionary article, and the authorities confiscated almost every copy.[^hoi1903] The paper also proposed a rocket burning liquid hydrogen with liquid oxygen,[^hoi1903] the pairing that drove the Space Shuttle's main engines eight decades later.[^l3harris] Tsiolkovsky went on to argue that a rocket fast enough to leave the Earth would have to be a train of rockets that drop away as they empty.[^hoi1903] Both ideas come straight out of the logarithm.

## Nothing to push against

Robert Goddard, a professor of physics at Clark College in Worcester, Massachusetts, knew the equation too, and he meant to test it. In 1919 the Smithsonian Institution published his 69-page report "A Method of Reaching Extreme Altitudes", on using rockets to lift instruments far above the reach of balloons.[^goddard1919] Near the end he allowed himself one flourish. A big enough rocket, he calculated, could deliver a few pounds of flash powder to the dark face of the new Moon, where the flash of impact would show up in a telescope. He had even fired flash powder in evacuated glass tubes and watched it from 2.24 miles (3.6 km) away.[^goddard1919]

The New York Times was not impressed. An editorial on 13 January 1920 insisted that a rocket in a vacuum would have nothing to push against, and said that Goddard "only seems to lack the knowledge ladled out daily in high schools."[^nyt] On 16 March 1926, on his Aunt Effie's farm in Auburn, Massachusetts, he lit the first rocket to burn liquid fuel: petrol with liquid oxygen, the engine mounted on top and the tanks hanging below. It flew for 2.5 seconds, climbed 41 feet (12.5 m) and came down 184 feet (56 m) away in a cabbage field.[^nasa1926][^clark] On 17 July 1969, with Apollo 11 on its way to the Moon, the Times printed a short correction admitting that rockets work in a vacuum, and said it regretted the error.[^nyt]

In Germany, the University of Heidelberg rejected Hermann Oberth's doctoral thesis on rockets in 1922. He paid to have it printed anyway in 1923 as Die Rakete zu den Planetenräumen (The Rocket into Planetary Space), and it inspired the amateur rocket society to which most of the early German rocket engineers belonged.[^hoi1923] Some of them went on to build the V-2 missile, and the V-2 is what sent a Swiss aerodynamicist back to Tsiolkovsky's equation.

::: myth A rocket works by pushing against the air behind it.
A rocket pushes on its own exhaust. It throws mass backwards and recoils forwards, as Newton's third law requires, and air only gets in the way. The RS-25, the Space Shuttle's main engine, gives 418,000 lb (1.86 million newtons) of thrust at sea level and 512,300 lb (2.28 million newtons) in a vacuum.[^l3harris] The New York Times withdrew its 1920 claim in July 1969.[^nyt]
:::

## Interest on a loan

A rocket moves by throwing pieces of itself backwards. Each kilogram of propellant that leaves the nozzle at the exhaust speed u gives the rest of the rocket a kick, and the kick is bigger when the rocket is lighter, because the same push is shared among less mass. Burn 10% of the rocket's mass and it gains about a tenth of u. Burn 10% of what is left and it gains the same again. The speed goes up in equal steps while the mass shrinks by equal fractions. That is compound interest running backwards.

First, a refresher on logarithms. The number e = 2.71828... is what you get from compounding growth continuously, and $e^x$ means e multiplied by itself x times, where x need not be a whole number. The natural logarithm, ln, undoes it: $\ln(e^x) = x$. So ln 2.718 = 1, ln 7.389 = 2 and ln 20.09 = 3. Logarithms turn multiplication into addition, $\ln(ab) = \ln a + \ln b$, and that is why one turns up in the motion of a rocket: equal fractions of mass, multiplied together, become equal steps of speed, added together.

$$
\frac{M_0}{M_1} = e^{\,\Delta v/u}
$$

In words: the rocket's mass at the start, divided by its mass once the propellant is gone, equals e raised to the power of the change in speed divided by the exhaust speed. The ratio $M_0/M_1$ is called the mass ratio. Taking logarithms of both sides gives the form Tsiolkovsky wrote, $\Delta v = u \ln(M_0/M_1)$.

The best chemical engines burn hydrogen with oxygen. The RS-25 has a vacuum specific impulse of 452.3 seconds,[^l3harris] which is how engineers quote exhaust speed: multiply by g, 9.81 m/s², and you get 4.44 km/s. To gain 8.9 km/s with that engine, $\Delta v/u = 2$ and $e^2 = 7.4$, so the fuelled rocket must weigh 7.4 times as much as the empty one. The bill grows fast:

| Change in speed | Mass ratio (exhaust 4.44 km/s) | Share of the starting mass that is propellant |
|---|---|---|
| 4.4 km/s | 2.7 | 63% |
| 8.9 km/s | 7.4 | 86% |
| 13.3 km/s | 20 | 95% |
| 30 km/s | 870 | 99.9% |
| 100 km/s | 6.2 billion | 99.99999998% |

The first 4.4 km/s costs a factor of 2.7. The next 4.4 km/s costs another factor of 2.7, because the first step now has to speed up the propellant for the second as well. This is why rockets have stages: dropping empty tanks stops you paying to speed up dead weight. It is also why getting to orbit is so costly. An astronaut circling the Earth at 7.7 km/s carries about seven times as much energy per kilogram as TNT, as NASA's Don Pettit pointed out in 2012.[^pettit2012]

Now aim at the stars. Proxima Centauri is 4.25 light-years away.[^gaia] To get there in a thousand years, without even trying to stop, a probe needs 1,273 km/s. With the RS-25's exhaust the mass ratio is $e^{287}$, roughly $10^{125}$. The propellant for a one-tonne probe would outweigh $10^{97}$ Suns. No engineering fixes a number like that. The one lever is the exhaust speed u, because it sits in the denominator of the exponent. The rest of this story is a hunt for faster exhaust.

::: myth Parker Solar Probe, the fastest spacecraft ever built, is our best bet for reaching another star.
Its speed is on loan from the Sun. Parker is fastest where it has fallen deepest, and slows as it climbs away. At its closest pass the Sun's escape speed is about 197 km/s, so even at 192 km/s it stays in orbit.[^nasa2024] The fastest object actually leaving the Solar System is Voyager 1, at about 17 km/s after swinging past Jupiter and Saturn,[^jpl2010][^svs4139] and at that speed Alpha Centauri is about 75,000 years away.[^lapointe2024]
:::

::: see-it go:voyager1
Look for Voyager 1, launched in 1977 and now almost a light-day from Earth. In 49 years it has covered less than a thousandth of the way to the nearest star.
:::

## When the exhaust is light

In February 1946 Jakob Ackeret, professor of aerodynamics at ETH Zurich and the man who had coined the term Mach number,[^ethz] sent a short paper to Helvetica Physica Acta. It opens with the V-2: now that heavy rockets had reached great heights, and nuclear energy promised fuel of a new order of magnitude, he asked what the rocket equation says when the exhaust is very fast.[^ackeret1946] Very fast means relativity, so Ackeret redid the calculation with Einstein's rules. The old equation, he found, is fine for exhausts up to a tenth of light speed; for a rocket whose exhaust is light, it goes wrong much sooner; and no rocket, whatever its fuel, reaches c. As for fission, he estimated that a reactor heating a gas might push a rocket to about 50 km/s.[^ackeret1946]

The key is an idea that Alfred Robb had named in 1911. Velocities near light do not add in the ordinary way: 0.5c on top of 0.5c gives 0.8c ([Why nothing outruns light](#/learn/nothing-outruns-light) explains why). Robb found a quantity that does add, called it rapidity, and wrote that "it is the rapidity and not the velocity which follows the additive law."[^robb1911] The easiest way in is the Doppler factor $D = \sqrt{(1+\beta)/(1-\beta)}$, where β is your speed as a fraction of c. D is how much the light ahead of you is squeezed in frequency, and when speeds combine, their Doppler factors multiply. At 0.5c, D = √3 = 1.732. Stack two of those and D = 3, the Doppler factor of 0.8c. Rapidity is ln D, so multiplying Doppler factors means adding rapidities. Near light, the speed stalls just under c while the rapidity keeps climbing.

A rocket gains rapidity the way a slow rocket gains speed: equal fractions of mass burned give equal steps. That turns Tsiolkovsky's exponential into a power:

$$
\frac{M_0}{M_1} = \left(\frac{1+\beta}{1-\beta}\right)^{c/(2u)}
$$

In words: the mass ratio needed to reach speed β from rest equals the ratio (1 + β) over (1 − β), raised to the power of the speed of light divided by twice the exhaust speed. At low speed this is the old equation in disguise. For a hydrogen-oxygen rocket gaining 3 km/s, β = 0.00001, the bracket is 1.00002 and the power is 33,800, which gives a mass ratio of 1.97, the same as $e^{3/4.44}$.

The extreme case is a rocket whose exhaust is light itself, u = c. The power becomes one half and the mass ratio is simply the Doppler factor. To reach 0.5c, a photon rocket needs a mass ratio of 1.73: 42% of it turns into light, and 58% is left moving at half light speed. To reach 0.95c it needs 6.2. The same speed would cost a fusion rocket with a 10,000 km/s exhaust a mass ratio of about $7 \times 10^{23}$, and a hydrogen-oxygen rocket a number with about 54,000 digits.

Two engineers soon worked out what a photon rocket would demand. In February 1952 Les Shepherd read a paper called "Interstellar Flight" to the British Interplanetary Society in London, one of the first technical studies of the subject. He worked out that a photon ship accelerating at 1 g must radiate 3 billion watts for every tonne of its mass, using the old British billion of a million million.[^shepherd1952] That is $3 \times 10^{12}$ W per tonne, so a modest 100-tonne ship would pour out 294 terawatts from its tail, about fifteen times the average power used by all of humanity in 2025.[^ei2026]

In May 1953 Eugen Sänger published a full theory of the photon rocket.[^sanger1953] He proposed nuclear lamps, reactors turning their energy into light, with mirrors to throw that light backwards, and he saw that the mirrors were the first problem: they must reflect almost perfectly or melt. Worse, the only way to turn matter completely into light, annihilating it with antimatter, produces gamma rays, whose wavelengths are far too short for any mirror to reflect.[^sanger1953] Nobody has solved that since.

## Flip and burn

Now the flight in this app. The engines push hard enough that everyone aboard feels their normal weight, 1 g = 9.80665 m/s², the whole way. Halfway there the ship turns round and pushes the other way, so that it arrives at rest. Seen from Earth, the speed creeps up towards c and never reaches it. On board, the rapidity climbs by 1.03 for every year of ship time.

The peak speed has a neat shortcut. A stone falling through a height h gains g × h of energy per kilogram. A ship with constant acceleration (as felt on board) obeys the same rule exactly, if you count its energy the relativistic way: its kinetic energy per kilogram, (γ − 1)c², equals g times the distance covered. Here γ is the Lorentz factor, the amount by which the ship's clock runs slow as seen from home. At the turnaround the distance covered is half the total distance d:

$$
\gamma_{\max} = 1 + \frac{g\,d}{2c^2}
$$

In words: the Lorentz factor at the turnaround is one plus the acceleration times half the distance, divided by the speed of light squared. The quantity c²/g is almost exactly a light-year: 0.9687 light-years. So for Proxima, with d = 4.2465 light-years, γ = 1 + 2.123/0.9687 = 3.19, which is a speed of 0.9497c. For the centre of the Milky Way, 26,700 light-years away,[^gravity2019] γ is about 13,800 and the speed falls short of c by less than three parts in a billion.

The ship's own clock needs the logarithm again, because on board the rapidity grows evenly with time:

$$
\tau = \frac{2c}{g}\,\ln\!\left(\gamma_{\max} + \sqrt{\gamma_{\max}^2 - 1}\right)
$$

In words: the time on the ship's clock is twice c over g, which is 1.937 years, times the natural logarithm of the peak Lorentz factor plus the square root of (its square minus one). For Proxima, $\sqrt{3.192^2 - 1} = 3.031$, the bracket is 6.223, its logarithm is 1.828, and τ = 1.937 × 1.828 = 3.54 years. Clocks at home follow a simpler rule, $t = (2c/g)\sqrt{\gamma_{\max}^2 - 1}$, which gives 1.937 × 3.031 = 5.87 years. On long trips the home clock reads the distance in light-years plus about two years, because the ship spends nearly all its time just short of c.

Now look at the number inside the logarithm, 6.223. It is the Doppler factor at the turnaround, which makes it the mass ratio a photon rocket needs to get there. Braking costs the same factor again, so the whole trip needs 6.223² = 38.7. Each year of ship time at 1 g multiplies a photon rocket's starting mass by $e^{1.032}$ = 2.81: every year, 64% of whatever mass is left has to be turned into light. Not even a perfect engine gets out of that. Sänger and Walter Peschka had the headline numbers in the 1950s: about 20 years of ship time to the galactic centre at 1 g, for a photon-rocket mass ratio of the order of a hundred million.[^bussard1960]

::: numbers A 1 g flip-and-burn flight in a perfect photon rocket
| Destination | Distance | Top speed | Ship time | Home time | Mass ratio |
|---|---|---|---|---|---|
| Proxima Centauri | 4.25 ly | 0.950c | 3.54 yr | 5.87 yr | 38.7 |
| Barnard's Star | 5.96 ly | 0.969c | 4.04 yr | 7.66 yr | 64.5 |
| TRAPPIST-1 | 40.7 ly | 0.99897c | 7.33 yr | 42.6 yr | 1,930 |
| Galactic centre | 26,700 ly | c less 2.6 parts in a billion | 19.8 yr | 26,700 yr | 760 million |
| Andromeda Galaxy | 2.5 million ly | c less 3 parts in 10 trillion | 28.6 yr | 2.5 million yr | 6.7 trillion |

Distances: Gaia, GRAVITY and NASA.[^gaia][^gravity2019][^m31]
:::

::: see-it fly:proxima
The 1 g flight to the nearest star. Watch the two clocks: they tick together at first, then the ship clock falls behind as the speed climbs, and at arrival it reads 3.5 years against 5.9 at home.
:::

A mass ratio of 38.7 sounds almost reasonable. It is not. For a 100-tonne ship, 3,770 tonnes of fuel must be turned entirely into light, and half of it, 1,890 tonnes, has to be antimatter. The energy released is $3.4 \times 10^{23}$ J, about 565 years of the world's entire energy supply.[^ei2026] CERN's Antimatter Factory, running non-stop for a year, makes antiprotons whose annihilation would release about 500 J, enough to light a 100 W bulb for five seconds.[^cern] For Andromeda the mass ratio is 6.7 trillion: a 100-tonne ship would need about $6.7 \times 10^{14}$ tonnes of fuel, as much as a rocky asteroid 86 km across, half of it antimatter. ([Island universes](#/learn/island-universes) is about where it would be going.)

::: see-it fly:andromeda
2.5 million light-years in 28.6 years of ship time, nearly all of it a hair's breadth under light speed, while 2.5 million years pass at home.
:::

::: myth Hold 1 g for a year and you pass the speed of light.
Newton's physics says so: 9.81 m/s² kept up for 354 days adds up to 299,792 km/s. Relativity says otherwise. After a year by the ship's clock the speed is 0.775c; after a year by Earth's clocks it is 0.718c. The speed approaches c ever more slowly while the rapidity keeps climbing, which is how the ship can go on shortening its trip without ever reaching light speed.[^physfaq]
:::

## Bombs and pellets

The first serious starship design rode on hydrogen bombs. Nuclear pulse propulsion goes back to an idea of Stanislaw Ulam's in 1947. After Sputnik, a team at General Atomics led by Ted Taylor started Project Orion: a ship with a thick pusher plate at its base, which would throw small nuclear bombs out behind it and ride the blasts one after another.[^long2009][^dyson1968] Freeman Dyson joined them. Their plan was to send ships to Mars and Venus by 1968.[^dyson1968] In 1959 a test model nicknamed Hot Rod flew at Point Loma, California, on five rapid blasts of ordinary high explosive, and came down by parachute. It now belongs to the Smithsonian.[^nasm]

Orion died of politics. The Test Ban Treaty, signed in Moscow on 5 August 1963, outlawed nuclear explosions of any kind in the atmosphere, in outer space and under water,[^archives1963] and the project was cancelled in 1965.[^nasm] Dyson wrote its obituary in Science that July, under the title "Death of a Project".[^dyson1965]

Three years later, in Physics Today, he asked what bomb-driven ships could do between the stars.[^dyson1968] The cautious design, limited by how much heat its surfaces could soak up, was a structure 20 km across, weighing 40 million tons and carrying 30 million one-megaton bombs. It could take a town the size of Princeton at 1,000 km/s, a parsec (3.26 light-years) every thousand years. The optimistic design let a thin layer of its surface boil away with each blast, dropped a bomb every three seconds for ten days, and reached 10,000 km/s, a parsec per century: Proxima in about 130 years.

Dyson was frank about his motives. Hydrogen bombs burn deuterium, heavy hydrogen with a neutron in its nucleus, which makes their energy about a thousand times cheaper than power from oil or uranium, and he wanted "to put this factor of 1000 to a more constructive use."[^dyson1968] He predicted that the first interstellar voyages would begin about two hundred years after he wrote. When Breakthrough Starshot was announced in 2016, Dyson, then 92, was on the stage.[^sciam2025]

In January 1973 members of the British Interplanetary Society began meeting to design a probe to another star with technology that existed or soon might. Led by Alan Bond, Tony Martin and Bob Parkinson, thirteen core designers, all volunteers, put in about 10,000 hours and published their final report on 15 May 1978.[^long2009][^daedalus1978] Project Daedalus was a two-stage robot probe nearly 200 m long and about 53,000 tonnes at departure, almost all of it frozen pellets of deuterium and helium-3 (a light helium with one neutron instead of two), the helium to be mined from the atmosphere of Jupiter. Electron beams would crush 250 pellets a second into tiny fusion explosions, and a magnetic nozzle would turn them into exhaust at about 10,000 km/s. After nearly four years of burning, the 450-tonne payload would coast past Barnard's Star at 12% of light speed, about 6 light-years and under 50 years from launch.[^long2009] It was a flyby. Nothing was left to stop with.

The team chose Barnard's Star partly because Peter van de Kamp had reported, from decades of photographic plates, a wobble that suggested planets.[^vandekamp1963] Those planets are now considered spurious.[^long2009] Then, in March 2025, astronomers using the MAROON-X and ESPRESSO spectrographs confirmed four real planets around Barnard's Star, each less massive than the Earth.[^basant2025] Daedalus was aimed at the right star for the wrong reason ([Other worlds](#/learn/other-worlds) explains how such planets are found).

::: see-it fly:barnards-star?beta=0.12
A constant-speed flight to Barnard's Star at Daedalus's cruising speed, 12% of light. Almost 50 years pass on both clocks, which barely disagree: at this speed time dilation is under 1%.
:::

Daedalus rested on laser- or beam-driven pellet fusion, which in 1978 had never worked. It works now, just. On 5 December 2022 the National Ignition Facility in California got more energy out of a fuel capsule, 3.15 MJ, than its lasers put in, 2.05 MJ.[^llnl2022] By April 2025 it had done so eight times, with a best of 8.6 MJ.[^llnl2025] Daedalus needed 250 such explosions every second for almost four years. A successor study, Project Icarus, started in 2009 and presented its final designs at the BIS in September 2023.[^long2009][^bis2023]

## A scoop wider than the Moon

Every design so far carries its fuel and pays compound interest on it. In 1960 Robert Bussard, a physicist at Los Alamos, proposed not carrying it at all.[^bussard1960] The space between the stars holds a thin gas, mostly hydrogen. Bussard's ship would sweep it up with an enormous magnetic funnel, fuse it in a reactor and throw it out behind. With free fuel there is no mass ratio, and the ship could in principle hold 1 g indefinitely.

Bussard knew the scale. For a 1,000-tonne ship at 1 g in a dense cloud, with 1,000 hydrogen atoms in every cubic centimetre, his intake needed an area of 10,000 km², a collector nearly 60 km in radius, and he noted that "interstellar travel is inherently a rather grand undertaking."[^bussard1960] Around the Sun the gas is much thinner, about 0.2 neutral hydrogen atoms and 0.1 free electrons (with as many protons) per cubic centimetre.[^frisch2003] At that density the intake for the same ship has to be thousands of kilometres across.

Then the physics piles on. Most of the gas is neutral and has to be ionised, stripped of its electrons, before a magnetic field can grab it. Plain hydrogen is a poor fusion fuel, and Bussard himself noted that burning protons would be much harder than burning deuterium.[^bussard1960] In 1969 John Ford Fishback worked out what magnetic field a real scoop would need, and found a speed beyond which the forces in that field would tear any material structure apart. Fishback was about 22 at the time, and he died the following year.[^jackson] In 2021 Peter Schattschneider of TU Wien, one of the Vienna physicists who later photographed the Terrell rotation,[^hornof2025] and Albert Jackson revisited Fishback's design with software written to calculate fields in electron microscopes. The scoop works on paper. To give ten million newtons of thrust, though, the funnel would have to be about 4,000 km across, wider than the Moon, and about 150 million km long, the distance from the Earth to the Sun.[^tuwien2021][^schattschneider2022]

A magnetic field that catches interstellar gas also drags on it, like a brake. In 1991 Robert Zubrin and Dana Andrews analysed the magnetic sail, a loop of superconducting wire that pushes against charged particles in space,[^zubrin1991] and later studies suggested using that drag deliberately, to slow a starship at the end of its trip.[^perakis2016]

::: myth A Bussard ramjet scoops up free fuel, so it can keep accelerating for ever.
The fuel is free; the scoop is not. The magnetic field that gathers the gas also slows the ship, and it has to be held by some physical structure, which sets a top speed. Revisiting the best-studied scoop design in 2021, Schattschneider and Jackson found that it needs magnetic coils of absurd length and judged it very unlikely that even a civilisation harnessing the entire output of its star could build one.[^schattschneider2022][^tuwien2021]
:::

## Sailing on light

A sail carries no fuel at all. Light carries momentum, and a beam of power P reflecting off a mirror pushes it with a force of 2P/c. That is feeble: a full gigawatt of light gives under 7 newtons. In 1966 the Hungarian physicist György Marx pointed out in Nature that the power station could stay at home, with a laser on Earth pushing a starship's sail.[^marx1966] In 1984 Robert Forward worked out laser-pushed sails in detail, including schemes that could, in principle, bring a crew back.[^forward1984]

Sails pushed by sunlight have flown. Japan's IKAROS, launched on 21 May 2010, unfurled a sail 14 m square on the way to Venus and became the first solar sail to work between the planets.[^ikaros] The Planetary Society's LightSail 2, with 32 m² of sail, spent three and a half years in Earth orbit from 2019 and at times raised its orbit on sunlight alone.[^planetary] NASA's ACS3, launched in April 2024, unfurled about 80 m² to test lightweight composite booms.[^acs3]

On 12 April 2016, in New York, Yuri Milner and Stephen Hawking announced Breakthrough Starshot, a 100-million-dollar research programme aimed at probes weighing a few grams that a 100-gigawatt array of lasers on the ground would push to 20% of the speed of light, arriving in the Alpha Centauri system about 20 years after launch.[^breakthrough2016] A system study by Kevin Parkin in 2018 settled on a sail 4.1 m across, accelerated for nine minutes by a beam director costing about 8 billion dollars.[^parkin2018] Nine minutes to reach 0.2c is an acceleration of about 11,000 g.

The lasers were never built. In September 2025 Scientific American reported an estimate by Philip Lubin, whose laboratory worked on the project, that only about 4.5 million dollars had gone out, in some 30 contracts, and quoted an e-mail from Pete Worden, Starshot's executive director: "We have put the program on hold and are working to transition portions to others."[^sciam2025] Jim Benford, who worked on the project, counters that Phase I cost about 25 million dollars, produced about 50 papers and settled most of the conceptual questions, and that the project was paused in 2024, not cancelled.[^benford2026] Laboratory work goes on. In January 2025 a group at Caltech reported measuring directly how hard a laser pushes on a candidate sail material, a silicon nitride membrane 50 nanometres thick: 80 femtonewtons, or $8 \times 10^{-14}$ N, from a beam of 100 W per square centimetre.[^michaeli2025]

::: see-it fly:proxima?beta=0.2
A Starshot-style trip at a constant 20% of light speed. It takes 21 years by the home clock and only about 2% less on board, and the probe does not stop.
:::

## What hits you on the way

At 0.95c the thin gas between the stars stops being thin. In the ship's frame every atom comes at it at 0.95c, carrying (γ − 1) times its rest energy $mc^2$, and length contraction crowds them γ times closer together than they are at rest.[^edelstein2012] The power arriving on each square metre of the ship's nose is:

$$
\frac{P}{A} = \gamma\,n\,v\,(\gamma - 1)\,m_{p}c^{2}
$$

In words: the power per square metre equals the Lorentz factor, times the number of hydrogen nuclei in each cubic metre, times the speed at which they arrive, times the kinetic energy each one carries. The first γ is the crowding from length contraction. Here $m_p c^2$ is the rest energy of a proton, 938 MeV. (Particle physicists measure energy in electronvolts: an MeV is a million of them, a GeV a billion and a TeV a trillion.) At the midpoint of the flight to Proxima, with n = 0.3 per cubic centimetre (300,000 per cubic metre), v = 0.95c and γ = 3.19, each nucleus arrives with 2.06 GeV, 27 billion of them strike every square centimetre every second, and the total is 90 kW per square metre. That is about 66 times the sunlight falling on the Earth,[^prsa2016] and it comes as a particle beam that drives deep into matter.

Shepherd saw this coming in 1952: near light speed, he warned, nuclei from the interstellar gas would go through more than 10 cm of solid metal.[^shepherd1952] A rough estimate of the dose to an unshielded person at the Proxima midpoint comes to about 9 grays per second (a gray is one joule of radiation absorbed by each kilogram of tissue),[^dose] and a dose of 2.5 to 5 grays, taken in minutes, kills about half of the people who receive it.[^cdc] William and Arthur Edelstein, analysing the problem in 2012 for gas six times denser than the Sun's neighbourhood, concluded that passengers would be killed quickly and suggested half the speed of light as a practical limit.[^edelstein2012][^semyonov2020]

On the flight to the galactic centre it becomes absurd. At the midpoint γ is about 13,800, so each hydrogen nucleus strikes with 12.9 TeV, nearly twice the energy of a proton in the beams of the Large Hadron Collider,[^lhc] and, with the crowding factor of 13,800 on top, the nose takes about 2.6 million megawatts per square metre.

::: see-it fly:sgr-a-star
The 1 g flight to the black hole at the centre of the Milky Way: 19.8 years on board, about 26,700 at home, nearly half of it (by the home clock) spent in a headwind more energetic than anything made at CERN.
:::

Dust is worse, one grain at a time. A grain of rock a micrometre across has a mass of about $10^{-15}$ kg. At the Proxima midpoint it strikes with about 200 J, the energy of a baseball pitched at 190 km/h, delivered to a spot a micrometre wide. At the midpoint of the flight to Andromeda a single grain carries 116 MJ, as much as 28 kg of TNT. Even Starshot's sails, at 0.2c, would be worn: Thiem Hoang and colleagues calculated in 2017 that gas would damage the front surface to a depth of about 0.1 mm over the trip, and dust would erode about 0.5 mm.[^hoang2017]

## The limit no rocket beats

Suppose all of this were solved: a perfect photon rocket, a perfect shield and a mountain of antimatter. There is still a wall, and the universe builds it. Because the expansion of the universe is speeding up, light we send out today can only ever reach galaxies that are now closer than a certain distance, the cosmic event horizon. Anything beyond it is being carried away too fast for any signal from us to catch up.[^davis2004] A rocket never beats light, so the same horizon limits every ship. With the cosmological parameters measured by the Planck satellite,[^planck2018] the horizon is about 16.6 billion light-years away today; the galaxies sitting on it are the ones we now see at a redshift of about 1.85, their light stretched to 2.85 times its original wavelength. Everything we see at higher redshift, including the most distant galaxies found by the James Webb Space Telescope at redshifts near 14,[^carniani2024] is out of reach for good, however long the crew is willing to fly. [The expanding universe](#/learn/the-expanding-universe) and [The edge of reach](#/learn/the-edge-of-reach) map the boundary.

::: see-it edge-of-reach
Ask for a flight to a galaxy beyond the cosmic event horizon. The planner refuses, and explains why no ship, however long it burns, could get there.
:::

## What comes next

Nothing being built today will go to another star. The next steps are under way, some on shaky schedules.

**Nuclear rockets, again.** In January 2023 NASA and DARPA announced DRACO, a nuclear thermal rocket to be tested in space as soon as 2027.[^draco2023] A reactor heating hydrogen gives about twice the propellant efficiency, in effect twice the exhaust speed, of the best chemical engines.[^ntp] DRACO was cancelled in 2025; the news broke in June, after NASA's budget request for 2026 removed the money, and DARPA's deputy director said falling launch costs had eroded the case.[^bd2025] NASA's newer plan, announced on 24 March 2026, is Space Reactor-1 Freedom: a 20-kilowatt reactor making electricity for an electric thruster, with launch targeted for late 2028 and a Mars flyby in 2029, when it would drop three helicopters.[^sr1][^ans2026] It would be the first spacecraft to use a fission reactor for propulsion beyond Earth orbit. The schedule is tight; treat the date as a target.

**A probe to interstellar space.** The Interstellar Probe concept from the Johns Hopkins Applied Physics Laboratory would swing past Jupiter and leave the Solar System on a 50-year mission at 5 to 10 astronomical units (Earth–Sun distances) a year: 24 to 47 km/s, up to nearly three times as fast as Voyager 1. The US decadal survey for solar and space physics endorsed developing a mission to interstellar space in late 2024, and the study proposes a launch between 2036 and 2042, but the mission has not been approved or funded.[^iac2025] Voyager 1 itself will be one light-day from Earth on 18 November 2026, still returning data from two instruments as its power runs down.[^voyagerld][^voyager1] [The edges of the Solar System](#/learn/edges-of-the-solar-system) follows it out.

**Sails and beams.** ACS3's booms were a test for much larger sails. Starshot has announced no second phase, and no one has a date for a 100-gigawatt laser array; some of its research continues in university laboratories.[^benford2026][^michaeli2025]

**Antimatter on the road.** On 24 March 2026 physicists from CERN's BASE experiment drove 92 antiprotons 7.5 km round the laboratory in a portable trap without losing one.[^leonhardt2026][^cern2026] Next they want to take antiprotons to a quieter laboratory in Düsseldorf, at least eight hours away by road; CERN gave no date.[^cern2026] A 100-tonne photon rocket to Proxima would need 1,890 tonnes of the stuff.

**Open problems.** Nobody has measured the gas density along the whole route to Proxima, and the Sun itself sits in a transition zone between two interstellar clouds with different properties.[^redfield2008][^frisch1998] Shielding a crew against the headwind at 0.95c remains an unsolved design problem.[^semyonov2020] And a fast probe has no easy way to stop at the other end, where nobody is pointing a laser back at it. One proposal is to drag against the target star's wind with magnetic and electric sails; so far it exists only on paper.[^perakis2016]

## Further reading and watching

### Papers

- Moore, W., "On the motion of rockets both in nonresisting and resisting mediums", Journal of Natural Philosophy, Chemistry and the Arts 27, 276–285 (1810). https://archive.org/details/journalofnatural27lond (open access scan of the volume; reputedly the first mathematical treatment of rocket flight)
- Goddard, R. H., "A method of reaching extreme altitudes", Smithsonian Miscellaneous Collections 71 (2) (1919). https://archive.org/details/methodreachinge00Godd (open access; Goddard's typescript, possibly a proof copy for the printed paper, with the flash-powder experiment)
- Ackeret, J., "Zur Theorie der Raketen", Helvetica Physica Acta 19, 103–112 (1946). https://archive.org/details/helvetica-physica-acta_1946_19 (open access scan, in German; the first relativistic rocket equation)
- Shepherd, L. R., "Interstellar flight", Journal of the British Interplanetary Society 11, 149–167 (1952). https://archive.org/details/sim_journal-of-the-british-interplanetary-society_1952-07_11_4 (open access scan)
- Sänger, E., "Zur Theorie der Photonenraketen", Ingenieur-Archiv 21, 213–226 (1953). https://doi.org/10.1007/BF00535829 (in German)
- Bade, W. L., "Relativistic rocket theory", American Journal of Physics 21, 310–312 (1953). https://doi.org/10.1119/1.1933430 (a short, clear derivation of the relativistic rocket equation)
- Bussard, R. W., "Galactic matter and interstellar flight", Astronautica Acta 6, 179–195 (1960). Author's reprint: http://large.stanford.edu/courses/2013/ph241/micks1/docs/bussard.pdf (open access)
- Marx, G., "Interstellar vehicle propelled by terrestrial laser beam", Nature 211, 22–23 (1966). https://doi.org/10.1038/211022a0
- Dyson, F. J., "Interstellar transport", Physics Today 21 (10), 41–45 (1968). https://doi.org/10.1063/1.3034534 (free PDF from the publisher: https://aip.brightspotcdn.com/PTO.v21.i10.41_1.online.pdf)
- Forward, R. L., "Roundtrip interstellar travel using laser-pushed lightsails", Journal of Spacecraft and Rockets 21, 187–195 (1984). https://doi.org/10.2514/3.8632
- Long, K. F. et al., "Project Icarus: Son of Daedalus – flying closer to another star", Journal of the British Interplanetary Society 62, 403–414 (2009). Open access: https://arxiv.org/abs/1005.3833 (includes a compact summary of Daedalus)
- Lubin, P., "A roadmap to interstellar flight", Journal of the British Interplanetary Society 69, 40–72 (2016). Open access: https://arxiv.org/abs/1604.01356 (the paper behind Starshot)
- Hoang, T., Lazarian, A., Burkhart, B. & Loeb, A., "The interaction of relativistic spacecrafts with the interstellar medium", ApJ 837, 5 (2017). https://doi.org/10.3847/1538-4357/aa5da6 (open access: https://arxiv.org/abs/1608.05284)
- Parkin, K. L. G., "The Breakthrough Starshot system model", Acta Astronautica 152, 370–384 (2018). https://doi.org/10.1016/j.actaastro.2018.08.035 (open access: https://arxiv.org/abs/1805.01306)
- Schattschneider, P. & Jackson, A. A., "The Fishback ramjet revisited", Acta Astronautica 191, 227–234 (2022). https://doi.org/10.1016/j.actaastro.2021.10.039 (open access)
- Edelstein, W. A. & Edelstein, A. D., "Speed kills: highly relativistic spaceflight would be fatal for passengers and instruments", Natural Science 4, 749–754 (2012). https://doi.org/10.4236/ns.2012.410099 (open access)
- Davis, T. M. & Lineweaver, C. H., "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe", PASA 21, 97–109 (2004). https://doi.org/10.1071/AS03040 (open access: https://arxiv.org/abs/astro-ph/0310808)
- Michaeli, L. et al., "Direct radiation pressure measurements for lightsail membranes", Nature Photonics 19, 369–377 (2025). https://doi.org/10.1038/s41566-024-01605-w (open access preprint: https://arxiv.org/abs/2403.00117)
- Basant, R. et al., "Four sub-Earth planets orbiting Barnard's Star from MAROON-X and ESPRESSO", ApJ Letters 982, L1 (2025). https://doi.org/10.3847/2041-8213/adb8d5 (open access)
- Leonhardt, M. et al., "Road transport of trapped antiprotons", Nature 657, 906–911 (2026). https://doi.org/10.1038/s41586-026-11019-z (open access)

### Books

- Eugene F. Mallove and Gregory L. Matloff, The Starflight Handbook: A Pioneer's Guide to Interstellar Travel (Wiley, 1989). The classic survey of every propulsion scheme in this article, with the equations.
- Paul Gilster, Centauri Dreams: Imagining and Planning Interstellar Exploration (Copernicus Books, 2004). A readable history of the ideas and the people, by the author of the blog of the same name.
- George Dyson, Project Orion: The True Story of the Atomic Spaceship (Henry Holt, 2002). Written by Freeman Dyson's son, from interviews with the people who built Hot Rod.
- John D. Clark, Ignition! An Informal History of Liquid Rocket Propellants (Rutgers University Press, 1972; reissued by Rutgers University Press Classics). The funniest book ever written about chemistry, and the best on why chemical exhaust speeds stop where they do.
- Les Johnson and Kenneth Roy (eds.), Interstellar Travel: Propulsion, Life Support, Communications, and the Long Journey (Elsevier, 2024). Current reviews by working researchers; the first chapter, by Michael LaPointe, covers propulsion.
- Alfred A. Robb, Optical Geometry of Motion: A New View of the Theory of Relativity (W. Heffer and Sons, Cambridge, 1911). Where rapidity got its name. Free online at https://archive.org/details/opticalgeometryo00robbuoft

### Videos

- [The tyranny of the rocket equation | Don Pettit | TEDxHouston 2013](https://www.youtube.com/watch?v=uWjdnvYok4I), TEDx Talks, 12:16. An astronaut who has ridden the equation explains, with props, why most of a rocket is fuel.
- [The Story of Robert Goddard, Father of Modern Rocketry](https://www.youtube.com/watch?v=sGZZ2QHprHw), NASA Goddard, 2:49. Archive film of Goddard and his rockets, from the NASA centre named after him.
- [Project Orion Nuclear Propulsion - 1950s Tests | Unclassified Video](https://www.youtube.com/watch?v=Q8Sv5y6iHUM), VideoFromSpace, 4:18. Raw National Archives footage of the explosive-driven test flights.
- [Freeman Dyson - Project Orion: Dyson's work (117/157)](https://www.youtube.com/watch?v=ToeGbhJDiU4), Web of Stories - Life Stories of Remarkable People, 5:00. Dyson himself, remembering what he worked on at General Atomics.
- [Freeman Dyson - The nuclear test ban and the end of Project Orion (120/157)](https://www.youtube.com/watch?v=LUhc3TyG4uA), Web of Stories - Life Stories of Remarkable People, 3:34. Dyson on why he ended up supporting the treaty that killed his own project.
- [Project Daedalus: Our 1970s Plan for Interstellar Travel](https://www.youtube.com/watch?v=7fdHN-DNjK8), SciShow Space, 5:14. A quick, accurate walk through the Daedalus design.
- [Interstellar Engine Bussard Ramjet Is Possible But May Require Insane Magnetic Fields](https://www.youtube.com/watch?v=wpjoxsWBCUc), Anton Petrov, 11:21. A clear explainer of the 2021 TU Wien calculation, made just after it came out.
- [Is Interstellar Travel Impossible?](https://www.youtube.com/watch?v=wdP_UDSsuro), PBS Space Time, 20:33. The hazards of fast flight, gas, dust and radiation, taken seriously.
- [Interstellar Propulsion Technologies - RANKED!](https://www.youtube.com/watch?v=5KkNXUlpK10), Cool Worlds, 23:24. Columbia astronomer David Kipping sorts 14 propulsion ideas into a tier list and argues with himself about each.
- [Is The Anti-Matter Rocket The Ultimate Engine?](https://www.youtube.com/watch?v=nhBwageJ75M), Scott Manley, 17:44. What actually comes out when matter meets antimatter, and why that makes a real photon rocket so hard.
- [Will NASA's Nuclear Powered Spacecraft Revolutionize Space Exploration?](https://www.youtube.com/watch?v=eS8FYnq-ECI), Scott Manley, 22:46. A careful look at Space Reactor-1 Freedom and what nuclear electric propulsion can and cannot do.
- [Breakthrough Starshot Animation (Full)](https://www.youtube.com/watch?v=xRFXV4Z6x8s), Breakthrough, 1:41. The official picture of how a Starshot launch would work.
- [The Dream of Solar Sailing | LightSail 2](https://www.youtube.com/watch?v=fCMQEUU4LHs), The Planetary Society, 2:12. Two minutes on the history of solar sailing, just before LightSail 2 flew.

### Online

- [The Relativistic Rocket](https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html), Physics FAQ, by Philip Gibbs with fuel figures by Don Koks. The 1 g formulas and tables, with the algebra behind them.
- [Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/), NASA Glenn Research Center. A step-by-step derivation of Tsiolkovsky's equation.
- [The Tyranny (and Power) of Rocket Travel](https://www.smithsonianmag.com/air-space-magazine/the-tyranny-and-power-of-rocket-travel-78586310/), Don Pettit, Air & Space/Smithsonian (2012). An astronaut's short essay on the rocket equation, written in orbit.
- [Interstellar Transport](https://aip.brightspotcdn.com/PTO.v21.i10.41_1.online.pdf), Freeman Dyson, Physics Today (1968), free PDF. Five pages that still repay reading.
- [Propulsion Test Vehicle, Project Orion](https://airandspace.si.edu/collection-objects/propulsion-test-vehicle-project-orion/nasm_A19721008000), National Air and Space Museum. Photographs of Hot Rod itself.
- [Science Fiction Revisited: Ramjet Propulsion](https://www.tuwien.at/en/tu-wien/news/news-articles/news/science-fiction-nachgerechnet-der-ramjet-antrieb), TU Wien (2021). The ramjet calculation explained by the university that did it.
- [Starshot](https://breakthroughinitiatives.org/initiative/3), Breakthrough Initiatives. The original goals and challenges of the programme.
- [LightSail](https://www.planetary.org/sci-tech/lightsail), The Planetary Society. The full story of LightSail 1 and 2, with images from orbit.
- [Space Reactor-1 Freedom](https://www.nasa.gov/mission/space-reactor-1-freedom/), NASA. The mission page for the 2028 nuclear electric flight.
- [Antimatter](https://home.cern/science/physics/antimatter/), CERN. How antimatter is made and why there is so little of it.
- [Atomic Rockets](https://www.projectrho.com/public_html/rocket/), Winchell Chung. A vast, opinionated and well-referenced site on realistic spacecraft engines.
- [Centauri Dreams](https://www.centauri-dreams.org/), Paul Gilster. Twenty years of posts on interstellar research, including the 2026 debate over Starshot.
- [Essays on the History of Rocketry and Astronautics, Volume 1](https://ntrs.nasa.gov/citations/19770026086), NASA Technical Reports Server (1977). Includes an essay on Tsiolkovsky's and Meshchersky's first work on rocket dynamics.

[^nasa2024]: NASA, "NASA's Parker Solar Probe makes history with closest pass to Sun" (27 December 2024). https://science.nasa.gov/science-research/heliophysics/nasas-parker-solar-probe-makes-history-with-closest-pass-to-sun/ (escape speed at perihelion computed from the stated distance)
[^moore1810]: W. Moore, "On the motion of rockets both in nonresisting and resisting mediums", Journal of Natural Philosophy, Chemistry and the Arts 27, 276–285 (1810). https://archive.org/details/journalofnatural27lond
[^johnson1995]: W. Johnson, "Contents and commentary on William Moore's A treatise on the motion of rockets and an essay on naval gunnery", International Journal of Impact Engineering 16, 499–521 (1995). https://doi.org/10.1016/0734-743X(94)00052-X
[^esa]: ESA, "Konstantin Tsiolkovsky". https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Konstantin_Tsiolkovsky
[^naukarf]: Наука.рф, "Константин Циолковский вывел формулу прямолинейного движения ракеты" (in Russian): the offprint note and the 10 May 1897 (Old Style) date. https://xn--80aa3ak5a.xn--p1ai/science/4879/ ; the manuscript "Ракета" (Rocket), dated 10 May 1897, is held by the Archive of the Russian Academy of Sciences (ARAN f. 555, op. 1, d. 32), shown in its online exhibition "Konstantin Eduardovich Tsiolkovsky", part 1 (in Russian). http://web.archive.org/web/20190120093625/http://arran.ru/?q=ru%2Fexposition3_1
[^hoi1903]: History of Information, "Tsiolkovsky begins modern spaceflight theory", quoting F. H. Winter, "Planning for spaceflight: 1880s to 1930s", in Blueprint for Space (1992), and W. von Braun and F. I. Ordway, History of Rocketry and Space Travel (1975). https://www.historyofinformation.com/detail.php?entryid=3031
[^l3harris]: L3Harris, "RS-25 propulsion system" specification sheet (2024). https://www.l3harris.com/sites/default/files/2024-07/l3harris-ar-rs-25-spec-sheet.pdf
[^goddard1919]: R. H. Goddard, "A method of reaching extreme altitudes", Smithsonian Miscellaneous Collections 71 (2) (1919); typescript, possibly a manuscript proof copy. https://archive.org/details/methodreachinge00Godd
[^nyt]: The 13 January 1920 editorial and the 17 July 1969 correction, reproduced at Astronautics Now, "Robert H. Goddard. The New York Times." http://www.astronauticsnow.com/history/goddard/index.html
[^nasa1926]: NASA History, "95 years ago: Goddard's first liquid-fueled rocket" (2021). https://www.nasa.gov/history/95-years-ago-goddards-first-liquid-fueled-rocket/
[^clark]: Clark University, "History", Robert H. Goddard Centennial. https://www.clarku.edu/goddard/history/
[^hoi1923]: History of Information, "From Oberth's 'The rocket in interplanetary space' to Fritz Lang's 'Frau im Mond'". https://www.historyofinformation.com/detail.php?entryid=3008
[^dyson1968]: F. J. Dyson, "Interstellar transport", Physics Today 21 (10), 41–45 (1968). https://doi.org/10.1063/1.3034534
[^pettit2012]: D. Pettit, "The tyranny (and power) of rocket travel", Air & Space/Smithsonian (2 May 2012). https://www.smithsonianmag.com/air-space-magazine/the-tyranny-and-power-of-rocket-travel-78586310/
[^gaia]: Gaia EDR3 parallaxes via SIMBAD: Proxima Centauri 768.07 mas (4.2465 ly), Barnard's Star 546.98 mas (5.963 ly), TRAPPIST-1 80.21 mas (40.66 ly). https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Proxima+Centauri
[^jpl2010]: NASA JPL, "NASA probe sees solar wind decline" (2010). https://www.jpl.nasa.gov/news/nasa-probe-sees-solar-wind-decline/
[^svs4139]: NASA Scientific Visualization Studio, "Voyager 1 trajectory through the Solar System". https://svs.gsfc.nasa.gov/4139
[^lapointe2024]: M. R. LaPointe, "Interstellar propulsion" (NASA Marshall; published as "Propulsion options", pp. 1–46), chapter in L. Johnson and K. Roy (eds.), Interstellar Travel (Elsevier, 2024): "nearly 75 thousand years" for Voyager 1 to cover the distance to Alpha Centauri. https://ntrs.nasa.gov/citations/20230018678
[^ethz]: ETH Library, "Jakob Ackeret (1898–1981)". https://library.ethz.ch/en/collections-and-archives/short-portraits/jakob-ackeret-1898-1981.html
[^ackeret1946]: J. Ackeret, "Zur Theorie der Raketen", Helvetica Physica Acta 19, 103–112 (1946), received 22 February 1946. https://archive.org/details/helvetica-physica-acta_1946_19
[^robb1911]: A. A. Robb, Optical Geometry of Motion: A New View of the Theory of Relativity (W. Heffer and Sons, Cambridge, 1911). https://archive.org/details/opticalgeometryo00robbuoft
[^shepherd1952]: L. R. Shepherd, "Interstellar flight", Journal of the British Interplanetary Society 11, 149–167 (1952), read in London on 2 February 1952. https://archive.org/details/sim_journal-of-the-british-interplanetary-society_1952-07_11_4
[^ei2026]: Energy Institute, Statistical Review of World Energy 2026 (released 2 July 2026): total energy supply exceeded 600 EJ in 2025; reported by DieselNet. https://dieselnet.com/news/2026/07energyreview.php
[^sanger1953]: E. Sänger, "Zur Theorie der Photonenraketen", Ingenieur-Archiv 21, 213–226 (1953). https://doi.org/10.1007/BF00535829
[^bussard1960]: R. W. Bussard, "Galactic matter and interstellar flight", Astronautica Acta 6, 179–195 (1960); the introduction summarises Sänger's 1 g results. Author's reprint: http://large.stanford.edu/courses/2013/ph241/micks1/docs/bussard.pdf
[^gravity2019]: GRAVITY Collaboration, "A geometric distance measurement to the Galactic center black hole with 0.3% uncertainty", A&A 625, L10 (2019): R₀ = 8,178 pc. https://doi.org/10.1051/0004-6361/201935656
[^m31]: NASA Science, "Messier 31". https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-31/
[^cern]: CERN, "Antimatter". https://home.cern/science/physics/antimatter/
[^physfaq]: P. Gibbs and D. Koks, "The relativistic rocket", Physics FAQ (1996, updated 2004). https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html
[^long2009]: K. F. Long, M. Fogg, R. Obousy, A. Tziolas, A. Mann, R. Osborne and A. Presby, "Project Icarus: Son of Daedalus – flying closer to another star", Journal of the British Interplanetary Society 62, 403–414 (2009). https://arxiv.org/abs/1005.3833
[^nasm]: National Air and Space Museum, "Propulsion test vehicle, Project Orion". https://airandspace.si.edu/collection-objects/propulsion-test-vehicle-project-orion/nasm_A19721008000
[^archives1963]: US National Archives, "Test Ban Treaty (1963)". https://www.archives.gov/milestone-documents/test-ban-treaty
[^dyson1965]: F. J. Dyson, "Death of a project", Science 149, 141–144 (1965). https://doi.org/10.1126/science.149.3680.141
[^sciam2025]: S. Scoles, "The quiet demise of Breakthrough Starshot, a billionaire's interstellar mission to Alpha Centauri", Scientific American (16 September 2025): the 4.5 million dollar figure is Philip Lubin's calculation; the photo caption places Freeman Dyson at the April 2016 announcement. https://www.scientificamerican.com/article/the-quiet-demise-of-breakthrough-starshot-a-billionaires-interstellar/
[^daedalus1978]: Project Daedalus Study Group (A. Bond et al.), Project Daedalus: The Final Report on the BIS Starship Study (Space Educational Aids for the British Interplanetary Society, 1978), 192 pp. https://books.google.com/books/about/Project_Daedalus.html?id=nEXpnAEACAAJ
[^vandekamp1963]: P. van de Kamp, "Astrometric study of Barnard's star from plates taken with the 24-inch Sproul refractor", Astronomical Journal 68, 515 (1963). https://doi.org/10.1086/109001
[^basant2025]: R. Basant et al., "Four sub-Earth planets orbiting Barnard's Star from MAROON-X and ESPRESSO", ApJ Letters 982, L1 (2025). https://doi.org/10.3847/2041-8213/adb8d5
[^llnl2022]: Lawrence Livermore National Laboratory, "Achieving fusion ignition". https://lasers.llnl.gov/science/achieving-fusion-ignition
[^llnl2025]: Lawrence Livermore National Laboratory, "Target breakthrough enabled fusion record at NIF". https://lasers.llnl.gov/news/target-breakthrough-enabled-fusion-record-nif
[^bis2023]: British Interplanetary Society, "Project Icarus – Son of Daedalus – final conclusions of the starship design study" (symposium, 30 September 2023). https://www.bis-space.com/event/project-icarus-the-latest-on-an-interstellar-design/
[^frisch2003]: P. C. Frisch, "Boundary conditions of the heliosphere", Journal of Geophysical Research 108 (A10) (2003): best models give n(HI) ≈ 0.2 cm⁻³ and n(e) ≈ 0.1 cm⁻³. https://doi.org/10.1029/2003JA009909
[^jackson]: A. A. Jackson and P. Schattschneider, "The interstellar ramjet: engineering nightmare" (presentation, AIAA Houston Section). http://www.aiaahouston.org/Horizons/Ramjet_IRG.pdf ; J. F. Fishback, "Relativistic interstellar spaceflight", Astronautica Acta 15, 25–35 (1969).
[^tuwien2021]: TU Wien, "Science fiction revisited: ramjet propulsion" (20 December 2021). https://www.tuwien.at/en/tu-wien/news/news-articles/news/science-fiction-nachgerechnet-der-ramjet-antrieb
[^schattschneider2022]: P. Schattschneider and A. A. Jackson, "The Fishback ramjet revisited", Acta Astronautica 191, 227–234 (2022). https://doi.org/10.1016/j.actaastro.2021.10.039
[^zubrin1991]: R. M. Zubrin and D. G. Andrews, "Magnetic sails and interplanetary travel", Journal of Spacecraft and Rockets 28, 197–203 (1991). https://doi.org/10.2514/3.26230
[^perakis2016]: N. Perakis and A. M. Hein, "Combining magnetic and electric sails for interstellar deceleration", Acta Astronautica 128, 13–20 (2016). https://doi.org/10.1016/j.actaastro.2016.07.005 (open access: https://arxiv.org/abs/1603.03015)
[^marx1966]: G. Marx (Eötvös University, Budapest), "Interstellar vehicle propelled by terrestrial laser beam", Nature 211, 22–23 (1966). https://doi.org/10.1038/211022a0 ; affiliation from https://www.osti.gov/biblio/4519885
[^forward1984]: R. L. Forward, "Roundtrip interstellar travel using laser-pushed lightsails", Journal of Spacecraft and Rockets 21, 187–195 (1984). https://doi.org/10.2514/3.8632
[^ikaros]: JAXA ISAS, "IKAROS small scale solar powered sail demonstration satellite". https://www.isas.jaxa.jp/en/missions/spacecraft/past/ikaros.html ; Y. Tsuda et al., "Achievement of IKAROS: Japanese deep space solar sail demonstration mission", Acta Astronautica 82, 183–188 (2013). https://doi.org/10.1016/j.actaastro.2012.03.032
[^planetary]: The Planetary Society, "LightSail". https://www.planetary.org/sci-tech/lightsail
[^acs3]: NASA, "Advanced Composite Solar Sail System (ACS3)". https://www.nasa.gov/mission/acs3/
[^breakthrough2016]: Breakthrough Initiatives, "Breakthrough Starshot" announcement (12 April 2016). https://breakthroughinitiatives.org/news/4
[^parkin2018]: K. L. G. Parkin, "The Breakthrough Starshot system model", Acta Astronautica 152, 370–384 (2018). https://doi.org/10.1016/j.actaastro.2018.08.035
[^benford2026]: J. Benford, "Starshot is a success: part I", Centauri Dreams (3 March 2026). https://www.centauri-dreams.org/2026/03/03/starshot-is-a-success-part-i/
[^michaeli2025]: L. Michaeli, R. Gao, M. D. Kelzenberg, C. U. Hail, A. Merkt, J. E. Sader and H. A. Atwater, "Direct radiation pressure measurements for lightsail membranes", Nature Photonics 19, 369–377 (2025). https://doi.org/10.1038/s41566-024-01605-w
[^prsa2016]: A. Prša et al., "Nominal values for selected solar and planetary quantities: IAU 2015 Resolution B3", Astronomical Journal 152, 41 (2016): solar irradiance 1,361 W/m². https://doi.org/10.3847/0004-6256/152/2/41
[^dose]: Estimate for this article: 2.7 × 10¹⁰ protons of 2.06 GeV per cm² per second (γnv, with the ship-frame crowding factor γ = 3.19 included, as in Edelstein and Edelstein 2012 and Semyonov 2020), each losing about 2 MeV per g/cm² in tissue (close to minimum ionisation), deposit about 9 J per kg per second. Nuclear collisions and secondary particles would add to this. Treat it as an order of magnitude.
[^cdc]: US Centers for Disease Control and Prevention, "Acute radiation syndrome: information for clinicians": the LD50/60 is about 2.5 to 5 Gy. https://www.cdc.gov/radiation-emergencies/hcp/clinical-guidance/ars.html
[^edelstein2012]: W. A. Edelstein and A. D. Edelstein, "Speed kills: highly relativistic spaceflight would be fatal for passengers and instruments", Natural Science 4, 749–754 (2012). https://doi.org/10.4236/ns.2012.410099
[^semyonov2020]: O. G. Semyonov, "Radiation conditions in relativistic interstellar flight", arXiv:2004.10079 (2020). https://arxiv.org/abs/2004.10079
[^lhc]: CERN, "The Large Hadron Collider": nominal proton energy 6.8 TeV. https://home.cern/science/accelerators/large-hadron-collider
[^hoang2017]: T. Hoang, A. Lazarian, B. Burkhart and A. Loeb, "The interaction of relativistic spacecrafts with the interstellar medium", ApJ 837, 5 (2017). https://doi.org/10.3847/1538-4357/aa5da6
[^davis2004]: T. M. Davis and C. H. Lineweaver, "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe", PASA 21, 97–109 (2004). https://doi.org/10.1071/AS03040
[^planck2018]: Planck Collaboration, "Planck 2018 results. VI. Cosmological parameters", A&A 641, A6 (2020): H₀ = 67.66 km/s/Mpc, Ωm = 0.3111, ΩΛ = 0.6889 (TT,TE,EE+lowE+lensing+BAO); horizon distance and redshift computed from these. https://doi.org/10.1051/0004-6361/201833910
[^draco2023]: NASA, "NASA, DARPA will test nuclear engine for future Mars missions" (24 January 2023). https://www.nasa.gov/news-release/nasa-darpa-will-test-nuclear-engine-for-future-mars-missions/
[^ntp]: NASA, "Space Nuclear Propulsion". https://www.nasa.gov/space-technology-mission-directorate/tdm/space-nuclear-propulsion/
[^bd2025]: T. Hitchens, "DARPA's DRACO nuclear propulsion project ROARs no more", Breaking Defense (27 June 2025): the demise was first reported earlier that month, based on NASA's fiscal 2026 budget request; quotes DARPA deputy director Rob McHenry. https://breakingdefense.com/2025/06/darpas-draco-nuclear-propulsion-project-roars-no-more/
[^sr1]: NASA, "Space Reactor-1 Freedom" (updated 15 September 2026). https://www.nasa.gov/mission/space-reactor-1-freedom/
[^ans2026]: American Nuclear Society, "NASA announces plan for space nuclear propulsion by 2028" (25 March 2026). https://www.ans.org/news/2026-03-25/article-7879/nasa-announces-plan-for-space-nuclear-propulsion-by-2028/
[^iac2025]: P. Brandt, R. L. McNutt, E. Provornikova et al., "Interstellar Probe: US decadal survey recommendations and strategic next steps", International Astronautical Congress 2025. https://dl.iafastro.directory/event/IAC-2025/paper/102212/
[^voyagerld]: NASA Science, "Voyager 1: what is a light-day". https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/
[^voyager1]: NASA Science, "Voyager 1: the farthest spacecraft". https://science.nasa.gov/mission/voyager/voyager-1/
[^leonhardt2026]: M. Leonhardt et al., "Road transport of trapped antiprotons", Nature 657, 906–911 (2026). https://doi.org/10.1038/s41586-026-11019-z
[^cern2026]: CERN, "BASE experiment at CERN succeeds in transporting antimatter" (24 March 2026). https://home.cern/base-experiment-cern-succeeds-transporting-antimatter/
[^frisch1998]: P. C. Frisch, "Interstellar matter and the boundary conditions of the heliosphere", Space Science Reviews 86, 107–126 (1998). https://doi.org/10.1023/A:1005067511216
[^redfield2008]: S. Redfield and J. L. Linsky, "The structure of the local interstellar medium. IV. Dynamics, morphology, physical properties, and implications of cloud-cloud interactions", ApJ 673, 283–314 (2008). https://doi.org/10.1086/524002
[^hornof2025]: D. Hornof, V. Helm, E. de Dios Rodriguez, T. Juffmann, P. Haslinger and P. Schattschneider, "A snapshot of relativistic motion: visualizing the Terrell-Penrose effect", Communications Physics 8, 161 (2025). https://doi.org/10.1038/s42005-025-02003-6
[^carniani2024]: S. Carniani et al., "Spectroscopic confirmation of two luminous galaxies at a redshift of 14", Nature 633, 318–322 (2024). https://doi.org/10.1038/s41586-024-07860-9
