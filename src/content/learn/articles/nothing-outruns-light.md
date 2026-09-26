---
slug: nothing-outruns-light
title: Why nothing outruns light
shelf: light
order: 2
pitch: A speed hidden in the equations of electricity broke Newton's physics, made time elastic, and has beaten every challenger since, including a loose cable.
updated: 2026-09-25
---

At four o'clock on the afternoon of Friday 23 September 2011, Dario Autiero stood up in the Main Auditorium at CERN, outside Geneva, to present a result his collaboration had spent months failing to explain away.[^indico2011] Their detector, OPERA, sat under the Gran Sasso massif in central Italy, catching neutrinos that CERN fired at it through 730 km of rock. Neutrinos barely interact with matter, so the rock is no obstacle. Over three years OPERA had timed more than 15,000 of them. On average they turned up 60.7 nanoseconds earlier than light would have: a lead of 25 parts per million, about 18 metres over the whole trip.[^opera2011]

CERN's director of research, Sergio Bertolucci, said they needed to be sure there were no "more mundane" explanations.[^cern2011] Six days later Andrew Cohen and Sheldon Glashow pointed out that neutrinos going 7.5 km/s faster than light should have lost energy on the way by shedding pairs of electrons and positrons (anti-electrons). OPERA's had not.[^cohen2011]

Almost nobody expected the result to survive, and that was not snobbery. By 2011 the speed of light was no longer a fact about light. It was a fact about how space and time fit together, and it had come through more than a century of attempts to break it.

## Speeds that simply add

In his *Dialogue* of 1632, Galileo told his readers to shut themselves below decks in a large ship with some flies, a few butterflies and a dripping bottle. While the ship sails smoothly, the drips fall straight down and the butterflies fly as easily towards the bow as towards the stern. Nothing you can do in the cabin tells you the ship is moving.[^galileo1632] Physics, he argued, is the same for anyone moving steadily.

Isaac Newton built his mechanics on that idea and on a second one he thought too obvious to defend: a single time, shared by the whole universe, which "flows equably without relation to anything external".[^newton1687] Put the two together and speeds simply add. Throw a ball forwards at 20 m/s from a train doing 30 m/s and someone on the platform sees it pass at 50 m/s. Nothing in this rulebook sets an upper limit, and light gets no special treatment: a beam from a lamp ought to look slower to someone chasing it.

By the mid-1800s light's speed had been measured, first from astronomy and then on the ground, at close to 300,000 km/s ([Light takes time](#/learn/light-takes-time) tells those stories). Nobody thought the number was special. It was the speed of one kind of wave, as 343 m/s is the speed of sound in air.

## A speed hidden in electricity

In the mid-1850s two German physicists, Wilhelm Weber and Rudolf Kohlrausch, did something that looks like bookkeeping. They charged a Leyden jar, a glass jar lined with metal foil, and measured the same charge two ways: by how hard it pushed on other charges, and, after dumping it through a coil, by how hard the burst of current kicked a magnetised needle.[^assis2003] The ratio of the two has the units of a speed. In the units James Clerk Maxwell later used, it was 310,740 km/s.[^maxwell1862]

In 1861 Maxwell, then at King's College London, was building a mechanical model of electric and magnetic fields: whirling cells separated by layers of tiny particles that turned like the idle wheels in a gearbox. The model told him how fast a sideways wobble would run through it, and the answer depended on exactly the ratio Weber and Kohlrausch had measured. That October he looked up their number, set it beside Hippolyte Fizeau's 1849 measurement of the speed of light, and wrote to Michael Faraday: "I worked out the formulae in the country, before seeing Webers number".[^faraday1861] In print a few months later, using Fizeau's figure of 314,858 km/s, the two agreed to about one per cent, and Maxwell concluded that light is a wave in the same medium that carries electric and magnetic effects.[^maxwell1862]

In 1865 he threw away the gears and kept the equations.[^maxwell1865] They predict electromagnetic waves that all travel at one speed, fixed by two constants you can measure on a bench:

$$c = \frac{1}{\sqrt{\mu_0\,\varepsilon_0}}$$

In words: the speed of an electromagnetic wave is one divided by the square root of the product of two numbers. The first, $\mu_0$ ("mu nought"), says how strongly an electric current makes a magnetic field; the second, $\varepsilon_0$ ("epsilon nought"), says how strongly a charge makes an electric field.

Worked example: with today's values, $\mu_0 = 1.2566 \times 10^{-6}$ N/A² and $\varepsilon_0 = 8.8542 \times 10^{-12}$ F/m, the product is $1.1127 \times 10^{-17}$ s²/m². Its square root is $3.3356 \times 10^{-9}$ s/m, and one divided by that is $2.9979 \times 10^{8}$ m/s, or 299,792 km/s.[^codata] Today's official values are linked through $c$, so this sum is a little circular. Weber and Kohlrausch's was not: they got the speed of light out of a charged jar and a magnetised needle.

::: note Why the number is exact
Since 1983 the metre has been defined as the distance light travels in a vacuum in 1/299,792,458 of a second, so the speed of light is exactly 299,792,458 m/s by definition.[^bipm1983] A modern "measurement of the speed of light" is really a measurement of how long your metre stick is.
:::

The equations carried a problem that took forty years to see clearly. They give one speed and say nothing about who is measuring it. Sound's speed is measured relative to the air, so the natural reading was that $c$ is the speed of light relative to its own medium, the luminiferous ("light-carrying") aether, an invisible something filling space. The Earth orbits the Sun at about 30 km/s, so a laboratory ought to feel an aether wind, with light slower upwind than across the wind. Someone only had to measure the difference.

## Looking for the aether wind

Maxwell thought it could not be done on Earth. In March 1879 he wrote to David Peck Todd of the US Nautical Almanac Office that in any measurement where light goes out and comes back, the aether wind changes the round trip by an amount depending on the square of $v/c$, "and this is quite too small to be observed".[^maxwell1880] He died that November; the letter was published the following year.[^mactutormaxwell] At 30 km/s, $v/c$ is one part in 10,000, and its square is one part in 100 million.

Albert Michelson, a young US Navy officer, tried anyway. While working in Berlin he designed what is now called the Michelson interferometer.[^aps2007] It splits a beam of light in two, sends the halves along two arms at right angles, bounces them back and lets them overlap. Where the waves line up the light is bright and where they cancel it is dark, giving a set of stripes called fringes. Delay one half by a fraction of a wavelength and the stripes slide sideways.

The test works like a swimming race. Swimming 100 m up a river and back takes longer than swimming 100 m across and back. In an aether wind, the arm lying along the wind is the upstream swim. Turn the instrument through 90° and the arms swap roles, so the fringes should drift as it turns. For arms of length $L$ and light of wavelength $\lambda$, the expected drift is $N = 2(L/\lambda)(v/c)^2$ fringes. Michelson's first attempt, at Potsdam in April 1881, saw nothing,[^michelson1881] but the French physicist Alfred Potier and then Hendrik Lorentz showed he had overestimated the effect by a factor of two, so the null result proved little.[^mm1887]

By then Michelson was teaching at the Case School of Applied Science in Cleveland, Ohio, and had teamed up with Edward Morley, a chemist at Western Reserve University next door.[^aps2007][^ech] Their first laboratory burned with the Case Main building on the night of 26 to 27 October 1886, so they rebuilt the apparatus in a Western Reserve dormitory basement.[^csu][^ech] It sat on a block of stone about 1.5 m square and 0.3 m thick, on a wooden ring floating in a trough of mercury, so it could be turned without shaking the mirrors. Mirrors at the corners bounced each beam back and forth to stretch its path to about 11 m. They pushed the stone round once every six minutes, reading the fringes at sixteen marks, around noon and around six in the evening on four days in July 1887.[^mm1887]

Eleven metres is about 20 million wavelengths of yellow light, so the expected drift was $N = 2 \times (2 \times 10^{7}) \times 10^{-8} = 0.4$ of a fringe. They saw less than a twentieth of that, and probably less than a fortieth. If the aether wind existed at all, it was probably blowing at less than a sixth of the Earth's orbital speed, under 5 km/s, and certainly at less than a quarter.[^mm1887] In 1907 Michelson became the first American to win a Nobel Prize in science. The citation praised his precision instruments and did not mention the aether.[^nobel1907][^aps2007]

## Shrinking arms and local time

The obvious escape, an aether dragged along by the Earth, had problems of its own: Lorentz had shown the leading version to be inconsistent.[^mm1887] In May 1889 George FitzGerald, in Dublin, sent a few lines to the American journal *Science* with a stranger suggestion. Perhaps the forces holding a solid together are altered by motion through the aether, so that "the length of material bodies changes", by an amount depending on the square of $v/c$.[^fitzgerald1889] Shorten the upwind arm by just the right amount and the fringes never move.

The shortening needed is about $\tfrac{1}{2}(v/c)^2$, five parts in a billion: 54 nanometres over an 11 m light path, a tenth of a wavelength of yellow light. Almost nobody read the letter. FitzGerald himself was not sure it had been printed, and it stayed buried until the historian Stephen Brush dug it out in 1967. Lorentz, in Leiden, reached the same idea on his own in 1892.[^brown2001]

Lorentz then needed a second trick. To keep Maxwell's equations in (nearly) the same form for an observer moving through the aether at speed $v$, he gave that observer a shifted time, $t'$ ("t prime"), equal to $t - vx/c^2$, where $x$ is the distance along the direction of motion. It depends on where you are as well as when. He called it local time.[^lorentz1895] By 1904 he had the full set of formulas for converting one observer's positions and times into another's, valid for any speed below that of light and now called the Lorentz transformation; Poincaré corrected a few of his equations for moving charges the next year.[^lorentz1904][^poincare1905]

Henri Poincaré, in Paris, saw further. At a 1904 congress in St Louis he pointed out that local time is what two moving observers would read if they set their watches by exchanging light signals: their clocks would be off, and they could never tell.[^poincare1904] On 5 June 1905 he told the Paris Academy of Sciences that the failure of every attempt to detect the Earth's absolute motion looked like a general law of nature, and gave the Lorentz transformation its name.[^poincare1905]

By mid-1905, then, nearly all the equations were on the table. What was missing was a reason. For Lorentz and Poincaré the aether was still real, the contraction was a physical squeeze, and local time was a useful fiction running alongside the "true" time of clocks at rest in the aether.

## Bern, 1905

Albert Einstein was 26 and a technical expert, third class, at the Swiss patent office in Bern, paid 3,500 francs a year to judge other people's inventions.[^ige] He had been worrying at light since he was sixteen, when he tried to picture running alongside a light beam at speed $c$. He would see a wave frozen in place, and nothing in Maxwell's equations allows a frozen electromagnetic wave.[^norton2013]

On 30 June 1905 the journal *Annalen der Physik* received his paper "On the electrodynamics of moving bodies".[^einstein1905a] It opens with a magnet and a conductor, say a coil of wire. Move the magnet, and the theory of the day said an electric field appears around it and drives a current in the coil. Move the coil instead, and the theory told a different story, about a force on charges moving through a magnetic field. The current is the same either way: only the relative motion matters, yet the theory needed two explanations.

Einstein took two statements as postulates, rules to be assumed and followed wherever they led. First, the laws of physics, electricity and light included, are the same for everyone moving steadily: Galileo's ship, extended to light. Second, light in empty space always travels at the same speed $c$, however its source is moving. Put a headlight on a ship moving at half the speed of light. The first rule says the passengers measure the beam at $c$; the second says people on the shore measure the same beam at $c$ too. In Newton's rulebook that is impossible. Einstein concluded that the rulebook was wrong about time.

From the two postulates, plus a careful definition of what it means for two distant clocks to agree, he derived Lorentz's transformation, the contraction, the slowing of moving clocks and a new rule for adding speeds. The aether, he wrote, "will prove to be superfluous".[^einstein1905a] Nothing was being squeezed. Observers in relative motion simply measure lengths and times differently, and each is right. The paper has no reference list; the only person it thanks is his friend and colleague Michele Besso.

::: myth Einstein invented relativity to explain the Michelson–Morley experiment.
His 1905 paper mentions the failed attempts to detect the Earth's motion through the aether only in passing, without naming Michelson.[^einstein1905a] In 1954 Einstein wrote that Michelson's result had not had much influence on him; yet in a 1921 lecture in Chicago he recalled learning of it as a student, and in 1899 he had mentioned an idea for an aether-drift experiment of his own in a letter to Mileva Marić.[^vandongen2009] Historians since Gerald Holton treat the experiment as one ingredient among several, not the spark.[^holton1969]
:::

## The light clock

Time dilation, the slowing of moving clocks, takes nothing more than Pythagoras to derive. Build a clock from two mirrors, one 4 m above the other, with a pulse of light bouncing between them. Each crossing is one tick. Light covers 4 m in $4 \div 299{,}792{,}458$ s, or 13.3 ns, so a clock at rest ticks every 13.3 ns.

Now let the clock fly past you sideways at speed $v$. Distances across the direction of motion do not change (Einstein showed this in 1905), so the mirrors stay 4 m apart.[^einstein1905a] But from where you stand, the light cannot go straight up, because by the time it reaches the top mirror that mirror has moved on. It runs along a slant: the long side of a right-angled triangle whose upright side is the 4 m gap and whose base is how far the clock moved during the tick. Here the second postulate bites. In Newton's world the slanted pulse would pick up the clock's sideways speed, move faster than $c$ and take the same time as before. In Einstein's it still moves at exactly $c$, and a longer path at the same speed takes longer.

If you see one tick take a time $t$, the slanted path is $ct$ long, the clock moves $vt$, and the gap is $ct_0$, where $t_0$ is the tick at rest. Pythagoras says:

$$(ct)^2 = (ct_0)^2 + (vt)^2$$

In words: the square of the distance the light travels in the moving clock equals the square of the distance it travels in a clock at rest, plus the square of how far the moving clock has gone in the meantime.

Worked example: let the clock move at $0.6c$. In the time the light runs 5 m along the slant, the clock moves $0.6 \times 5 = 3$ m sideways, and the gap is 4 m: the 3-4-5 triangle from every geometry class. Light needs 16.7 ns for 5 m, against 13.3 ns for 4 m at rest. The moving clock's tick is longer by a factor of 5/4, or 1.25.

For any speed, rearrange: $c^2t^2 - v^2t^2 = c^2t_0^2$, so $t^2(1 - v^2/c^2) = t_0^2$, and

$$\gamma = \frac{t}{t_0} = \frac{1}{\sqrt{1 - v^2/c^2}}$$

In words: γ (gamma), the Lorentz factor, is the number of your seconds that pass for each second on the passing clock, and it equals one over the square root of one minus the speed squared, with the speed written as a fraction of $c$.

Worked example: at $0.6c$, $v^2/c^2 = 0.36$, so $1 - 0.36 = 0.64$, whose square root is 0.8, and $\gamma = 1/0.8 = 1.25$, as the triangle said. At $0.9c$: $1 - 0.81 = 0.19$, $\sqrt{0.19} = 0.436$ and $\gamma = 2.29$.

A light clock is a special case, but the first postulate forces every other clock on board to keep in step with it: if wristwatches and heartbeats did not slow too, a passenger could compare them and work out the ship's speed. So everything on board slows together, decaying particles included. Muons, heavier cousins of the electron, show it routinely, and [Time dilation is real](#/learn/time-dilation) has the evidence.

As $v$ approaches $c$, $1 - v^2/c^2$ shrinks towards zero and γ grows without limit. At $v = c$ you would be dividing by zero; beyond it you would need the square root of a negative number. A formula going haywire is a warning, not yet a proof. The proof comes from energy and from cause and effect.

::: see-it fly:saturn?beta=0.9
A flight to Saturn at a steady 0.9c: roughly 75 to 100 minutes on the home clock, depending on the date. The ship clock ticks 2.29 times slower and finishes at a bit under half the home total.
:::

## Space and time become spacetime

On 21 September 1908 Hermann Minkowski, a mathematician at Göttingen who had taught Einstein at the polytechnic in Zurich, gave a lecture in Cologne called "Space and Time". A line from his opening paragraph has been quoted ever since: "Henceforth space by itself, and time by itself, are doomed to fade away into mere shadows".[^minkowski1909]

His point was geometric. Measure time in metres by multiplying it by $c$ (one nanosecond is 30 cm of light travel), and treat it as a fourth direction. Observers in relative motion slice this four-dimensional world into "space" and "time" differently, the way two people facing different ways disagree about which way is left. Yet for any two events (things that happen at one place and one moment) separated by a time $t$ and a distance $x$, the quantity $(ct)^2 - x^2$, called the interval, comes out the same whoever measures it. It is Pythagoras with a minus sign, and the minus sign is where the speed limit lives.

A flare leaves the Sun and its light reaches Earth, 149.6 million km away, 499 seconds later. Here $ct = 499 \times 299{,}792$ km, which is 149.6 million km, equal to $x$, so $(ct)^2 - x^2 = 0$ for every observer, however fast. When $(ct)^2$ is bigger than $x^2$, something slower than light can get from one event to the other, and all observers agree which came first. When $x^2$ is bigger, nothing moving at or below $c$ can join them, and observers do not even agree on their order. The events light can reach from here and now form a cone in spacetime, the future light cone. Everything you can ever affect lies inside it; everything that could ever have affected you lies inside a matching cone pointing into the past.

Minkowski died of a ruptured appendix on 12 January 1909, aged 44. Einstein, at first, did not think much of his old teacher's four-dimensional repackaging.[^mactutorminkowski]

::: see-it race-sunlight
A pulse of light leaves the Sun and sweeps past the planets. Nothing that happens on the Sun can affect the Earth until that front arrives, 8 minutes 19 seconds later; any planet it has not yet reached is still outside that moment's light cone.
:::

## Adding speeds the new way

If a ship moving at $0.9c$ fires a probe forwards at $0.9c$, Newton says the probe moves at $1.8c$. Einstein's rule for combining a speed $u$ with a speed $v$ is

$$w = \frac{u + v}{1 + uv/c^2}$$

In words: add the two speeds as Newton would, then divide by one plus their product, with the product measured in units of $c^2$.

Worked example: with $u = v = 0.9c$ the top is $1.8c$ and the bottom is $1 + 0.81 = 1.81$, so $w = 0.99448c$, or 298,136 km/s, still 1,656 km/s short of light. For the ball and the train, $uv/c^2 = (30 \times 20) \div (299{,}792{,}458)^2 = 6.7 \times 10^{-15}$, and the ball passes at 50 m/s minus a third of a trillionth of a metre per second, which is why nobody noticed for two centuries. Put $u = c$ and the formula gives $(c + v) \div (1 + v/c) = c$ whatever $v$ is. No two speeds below $c$ can ever add up to $c$ or more.[^einstein1905a]

The rule had been measured before anyone knew it existed. In 1851 Fizeau sent light both ways through two glass tubes, each 1.487 m long, while water rushed through them at 7.069 m/s. If the water carried the light fully along, the fringes should have moved by 0.92 of a fringe. He measured 0.46: the water dragged the light only partly, close to what Augustin Fresnel had predicted from an elaborate aether theory.[^fizeau1851] In 1907 Max von Laue showed that Einstein's rule gives Fresnel's answer with no aether at all.[^laue1907] Light crosses still water at $c/n$ = 224,900 km/s, where $n = 1.333$ is water's refractive index, the factor by which it slows light. Combine that with the water's 7.069 m/s by Einstein's rule and the light gains 3.09 m/s, not 7.07 m/s. Fizeau had measured relativistic velocity addition 54 years early.

A cleaner test came at CERN in 1964. Neutral pions, short-lived subatomic particles, were moving at 0.99975c when they decayed into pairs of gamma-ray photons. If a moving source added its speed to its light, those photons would have moved at nearly $2c$. They moved at $c$, to within 0.04 per cent.[^alvager1964][^roberts2007] Applied to the direction of starlight, the same rule crowds the stars forwards in front of a fast ship; see [What you would see near the speed of light](#/learn/seeing-near-light-speed).

## The price of speed

In September 1905 Einstein sent the *Annalen* a three-page follow-up: if a body gives off energy $L$ as light, its mass drops by $L/c^2$.[^einstein1905b] Written the modern way, a mass $m$ at rest holds an energy $E = mc^2$, which for one kilogram is $8.99 \times 10^{16}$ J. In 2005 a team from MIT, NIST and the Institut Laue-Langevin weighed silicon and sulfur atoms with and without one extra neutron and compared the difference with the energy of the gamma rays given off when the neutron is captured. They matched to four parts in ten million.[^nist2005]

A mass $m$ moving with Lorentz factor γ has kinetic energy

$$E_{\text{k}} = (\gamma - 1)\,mc^2$$

In words: a moving body's energy of motion is its rest energy multiplied by gamma minus one.

Worked example: one kilogram at $0.1c$ has $\gamma = 1.00504$, so $E_\text{k} = 0.00504 \times 8.99 \times 10^{16} = 4.53 \times 10^{14}$ J. Newton's $\tfrac{1}{2}mv^2$ gives $4.49 \times 10^{14}$ J, less than one per cent lower, which is why Newton's formula works for everything we have ever launched. At $0.9c$, $\gamma = 2.294$, so $E_\text{k} = 1.294 \times 8.99 \times 10^{16} = 1.16 \times 10^{17}$ J, more than three times Newton's figure. After that the gap runs away.

::: numbers What it takes to move one kilogram
| Speed | γ | Kinetic energy, Einstein | Kinetic energy, Newton |
|---|---|---|---|
| 0.1c | 1.005 | $4.53 \times 10^{14}$ J | $4.49 \times 10^{14}$ J |
| 0.9c | 2.294 | $1.16 \times 10^{17}$ J | $3.64 \times 10^{16}$ J |
| 0.99c | 7.09 | $5.47 \times 10^{17}$ J | $4.40 \times 10^{16}$ J |
| 0.999c | 22.4 | $1.92 \times 10^{18}$ J | $4.49 \times 10^{16}$ J |
| c | infinite | infinite | $4.49 \times 10^{16}$ J |

For scale: the whole world's energy supply in 2025 was about $6 \times 10^{20}$ J.[^ei2026]
:::

Newton's column stops growing because the last few speeds hardly differ. Einstein's heads for infinity: every extra joule buys less extra speed than the one before. This is what Einstein meant when he wrote that the speed of light "plays the part, physically, of an infinitely great velocity".[^einstein1905a] Give a one-kilogram bag of sugar the planet's entire energy supply for 2025 and it would reach γ ≈ 6,700: still 3.4 m/s slower than light, a jogging pace.

Particle physicists measure energy in electronvolts (eV), the energy an electron picks up crossing one volt; MeV, GeV and TeV mean a million, a billion and a million million eV. In its third run, which ended in 2026, the Large Hadron Collider gave each proton 6.8 TeV.[^courier2026] That is γ ≈ 7,250, leaving each proton 2.85 m/s, about 10 km/h, slower than light. The most energetic particle ever recorded, caught by the Fly's Eye detector in Utah on 15 October 1991, carried 51 J, about the energy of a baseball thrown at 95 km/h.[^bird1995] If it was a proton, its γ was about $3.4 \times 10^{11}$, and in a race with a light beam lasting 100,000 years it would lose by about 4 mm.

In 1962 William Bertozzi at MIT accelerated electrons to kinetic energies between 0.5 and 15 MeV and timed them over a measured path. The energy went up thirty times; the speed crept towards $c$ and flattened out just below it.[^bertozzi1964] For a starship the curve is brutal: at 0.95c every kilogram carries about $2 \times 10^{17}$ J. [Rockets to the stars](#/learn/rockets-to-the-stars) does the fuel sums.

::: see-it fly:proxima
The 1 g flip-and-burn to Proxima Centauri. Watch the speed climb quickly, then more and more slowly, and peak near 0.95c at the halfway flip, although the engine pushes just as hard the whole time.
:::

::: myth An object's mass increases as it speeds up, and that is why it can never reach c.
Older textbooks called $\gamma m$ the "relativistic mass". Most physicists dropped the idea long ago: mass means the rest mass $m$, the same for every observer, and what grows without limit is energy and momentum. Lev Okun made the case in 1989, citing a 1948 letter in which Einstein himself advised against the concept.[^okun1989]
:::

## Faster than light would mean effect before cause

Suppose someone found a signal that went faster than light. The trouble would not be the speed. It would be the order of events.

In relativity, "at the same time" depends on who is asking. An observer moving at speed $v$ along a line, with $x$ measured along that line, gives an event at place $x$ and time $t$ the time $t' = \gamma\,(t - vx/c^2)$: Lorentz's local time with γ in front.

Here it is with numbers, in years and light-years; light covers one light-year per year, so $c = 1$. A ship passes Earth heading outwards at $0.9c$, so $\gamma = 2.294$. One year later Earth sends it a message by an imaginary signal that travels at twice the speed of light. The message catches the ship 1.818 years after it passed, 1.636 light-years out. By the ship's clocks, the sending happened at $t' = 2.294 \times (1 - 0) = 2.29$ years, and the arrival at $t' = 2.294 \times (1.818 - 0.9 \times 1.636) = 0.79$ years. So by the ship's own perfectly good clocks, the message arrived a year and a half before it was sent.

That might be written off as bookkeeping. But the principle of relativity lets the crew use the same kind of signal. If they reply at once, at twice light speed by their own clocks, the answer reaches Earth 0.63 years after the ship passed: more than four months before Earth sent the question. You could receive a reply to a message you had not yet written, and then decide not to write it.

Einstein spotted this in 1907. A faster-than-light signal, he wrote, would allow "a transfer mechanism whereby the achieved effect would precede the cause", which clashed so badly with experience that he took it as proof that no such signal exists.[^einstein1907] Gerald Feinberg named hypothetical faster-than-light particles tachyons in 1967,[^feinberg1967] and three years later Gregory Benford and two colleagues called the paradox the "tachyonic antitelephone".[^benford1970] Nobody has found a tachyon.

::: myth Nothing can ever move faster than light, anywhere.
The real rule is narrower: nothing carries energy or information through space faster than $c$, the speed of light in a vacuum. In water light slows to about 225,000 km/s, and fast electrons can outrun it there, giving off the blue Cherenkov glow that won Pavel Cherenkov, Ilya Frank and Igor Tamm the 1958 Nobel Prize.[^nobel1958] Flick a laser pointer through 45° in one second and its spot sweeps across the Moon at about 300,000 km/s, but nothing travels along the spot's path. And distant galaxies are carried away from us faster than light by the expansion of space, which special relativity does not forbid;[^davis2004] see [The expanding universe](#/learn/the-expanding-universe) and [The edge of reach](#/learn/the-edge-of-reach).
:::

::: myth Quantum entanglement lets you send messages faster than light.
Measurements on two entangled particles can be correlated however far apart they are. But each side, on its own, sees only random results, and the pattern appears only when the two lists are compared, which takes an ordinary, slower-than-light message. Philippe Eberhard showed in 1978 that such correlations cannot carry a signal.[^eberhard1978]
:::

## A century of trying to break it

::: timeline The classic tests
- **1887:** Michelson and Morley find no aether wind.
- **1932:** Kennedy and Thorndike repeat the test with unequal arms.[^roberts2007]
- **1938:** Ives and Stilwell see moving clocks run slow in the light of fast hydrogen ions.[^roberts2007]
- **1979:** Brillet and Hall find light's round-trip speed the same in every direction to 3 parts in $10^{15}$.[^roberts2007]
:::

The rule under test is called Lorentz symmetry: the laws of physics are the same whichever way you face and however fast you move steadily. Modern versions of Michelson and Morley's experiment use blocks of sapphire or glass in which light or microwaves ring at a frequency set by the block's size and the speed of light inside it. Put two at right angles on a turntable, spin it, and compare their frequencies. In 2015 a team from Berlin and Perth found no change with direction bigger than about one part in $10^{18}$.[^nagel2015] Michelson and Morley's limit, written the same way, was a few parts in $10^{10}$, so the modern test is roughly a hundred million times tighter. At Germany's national measurement institute, PTB, two ytterbium-ion clocks with their atoms lined up in different directions stayed in step for half a year, limiting any direction-dependence for electrons to around $10^{-21}$.[^sanner2019]

The sharpest tests use the universe as a racetrack. Some attempts to combine quantum theory with gravity suggest that space might be grainy at the Planck scale, the tiny distances and huge energies at which gravity's quantum effects should become strong. Then high-energy photons would travel very slightly slower than low-energy ones, and over billions of light-years the lag would add up. In 1998 Giovanni Amelino-Camelia and colleagues proposed timing gamma-ray bursts, brief flashes of gamma rays from distant explosions.[^amelino1998] On 10 May 2009 NASA's Fermi telescope caught GRB 090510, a burst from a galaxy 7.3 billion light-years away. A photon carrying 31 GeV arrived 0.829 s after the burst began, in step with the rest.[^abdo2009] If the slowdown grew in proportion to a photon's energy, it could only become important above 1.2 times the Planck energy, higher than most such theories allow. "Einstein still rules," said the scientist in charge of Fermi's main instrument, a Stanford physicist who happened to be called Peter Michelson.[^nasa2009] In 2024 China's LHAASO observatory, using the exceptionally bright burst GRB 221009A, raised that limit to more than ten times the Planck energy.[^lhaaso2024]

Gravity obeys the same limit. On 17 August 2017 the LIGO and Virgo detectors recorded gravitational waves from two neutron stars merging in the galaxy NGC 4993, about 130 million light-years away,[^ligo2017] and 1.74 seconds after the waves peaked, the Fermi and INTEGRAL satellites caught gamma rays from the same event. After a trip of over a hundred million years, a two-second gap means gravity and light travel at the same speed to within about one part in $10^{15}$.[^abbott2017]

As for OPERA: in December 2011 the team re-measured the link that carried GPS time 8.3 km down an optical fibre into the underground laboratory and found its delay 73.2 ns longer than at its calibration in 2006 and 2007. By mid-February 2012 they had traced it to an optical cable that was not properly connected. Less light reached the receiver at the master clock, so its timing pulse registered late, and every neutrino looked early. A second fault, a clock oscillator running 0.124 parts per million fast, pushed partly the other way.[^opera2012] In March 2012 the ICARUS experiment, also under Gran Sasso, reported neutrinos from a specially bunched CERN beam arriving on time.[^icarus2012] At the end of that month OPERA's spokesperson resigned after 55 per cent of the collaboration backed a vote of no confidence.[^physicsworld2012] In June CERN reported that four Gran Sasso experiments had all clocked the neutrinos at the speed of light.[^sciencedaily2012] OPERA's corrected result put the neutrinos within a few parts per million of $c$, consistent with no difference at all.[^opera2012]

## What comes next

No experiment has caught Lorentz symmetry failing. The tests keep getting sharper anyway, because attempts at a quantum theory of gravity either predict effects just beyond today's reach or make no firm prediction at all.

- **Bigger gamma-ray telescopes (from 2026).** On 15 October 2026 the four Large-Sized Telescopes of the Cherenkov Telescope Array Observatory, each with a 23 m reflector, are due to be inaugurated on La Palma. The first is expected to be formally accepted during 2027; the full observatory, including a southern array in Chile, is years away and has no firm completion date.[^ifae2026] More high-energy bursts will sharpen the test for a slowdown that grows with the square of a photon's energy, where the best limit so far is only about $6 \times 10^{-8}$ of the Planck energy.[^lhaaso2024]
- **Clocks in orbit (2025 to about 2027).** ESA's Atomic Clock Ensemble in Space was installed on the International Space Station in April 2025 and, after six months of commissioning, is comparing its clocks with laboratories on the ground for about two years. Its goals include tests of Lorentz symmetry; no results from those tests had appeared as of September 2026.[^esaaces][^cacciapuoti2024]
- **Gravitational waves (next run from November 2026; LISA in 2035).** Every neutron-star merger seen in both gravitational waves and light re-measures the speed of gravity. LIGO and Virgo, with KAGRA joining later, plan a six-month run starting in early to mid November 2026; the date of the next full run, O5, is still under discussion.[^ligo2026] ESA's LISA, adopted in January 2024 and due to launch in 2035, will listen from space with laser arms 2.5 million km long.[^esalisa]
- **A checklist for breaking relativity (ongoing).** Since the late 1990s Alan Kostelecký and colleagues have built the Standard-Model Extension, which lists every way Lorentz symmetry could fail that is consistent with known physics.[^colladay1998] Their data tables record the tightest limit on each; the latest version is dated February 2026.[^kostelecky2011]
- **The open question (no date).** Nobody knows whether Lorentz symmetry holds exactly at the Planck scale. Some approaches to quantum gravity predict tiny violations, some none. One convincing violation would be the first experimental clue to how gravity and quantum theory fit together.[^addazi2022]

## Further reading and watching

### Papers

- J. C. Maxwell, "A dynamical theory of the electromagnetic field", *Philosophical Transactions of the Royal Society of London* 155, 459–512 (1865). https://doi.org/10.1098/rstl.1865.0008
- A. A. Michelson and E. W. Morley, "On the relative motion of the Earth and the luminiferous ether", *American Journal of Science* 34, 333–345 (1887). https://doi.org/10.2475/ajs.s3-34.203.333 (full text free on [Wikisource](https://en.wikisource.org/wiki/On_the_Relative_Motion_of_the_Earth_and_the_Luminiferous_Ether))
- A. Einstein, "Zur Elektrodynamik bewegter Körper", *Annalen der Physik* 17, 891–921 (1905). https://doi.org/10.1002/andp.19053221004 (English translation free at [Fourmilab](https://www.fourmilab.ch/etexts/einstein/specrel/www/))
- A. Einstein, "Ist die Trägheit eines Körpers von seinem Energieinhalt abhängig?", *Annalen der Physik* 18, 639–641 (1905). https://doi.org/10.1002/andp.19053231314 (English translation free at [Fourmilab](https://www.fourmilab.ch/etexts/einstein/E_mc2/e_mc2.pdf))
- H. Minkowski, "Space and Time", lecture at Cologne, 21 September 1908, published 1909. Open access English translation: https://en.wikisource.org/wiki/Translation:Space_and_Time
- G. Holton, "Einstein, Michelson, and the 'crucial' experiment", *Isis* 60, 133–197 (1969). https://doi.org/10.1086/350468
- J. van Dongen, "On the role of the Michelson–Morley experiment: Einstein in Chicago", *Archive for History of Exact Sciences* 63, 655–663 (2009). Open access: https://arxiv.org/abs/0908.1545
- H. R. Brown, "The origins of length contraction: I. The FitzGerald–Lorentz deformation hypothesis", *American Journal of Physics* 69, 1044–1054 (2001). Open access: https://arxiv.org/abs/gr-qc/0104032
- W. Bertozzi, "Speed and kinetic energy of relativistic electrons", *American Journal of Physics* 32, 551–555 (1964). https://doi.org/10.1119/1.1970770
- D. Mattingly, "Modern tests of Lorentz invariance", *Living Reviews in Relativity* 8, 5 (2005). Open access: https://doi.org/10.12942/lrr-2005-5
- V. A. Kostelecký and N. Russell, "Data tables for Lorentz and CPT violation", *Reviews of Modern Physics* 83, 11–31 (2011), updated most years. Open access: https://arxiv.org/abs/0801.0287
- A. A. Abdo et al., "A limit on the variation of the speed of light arising from quantum gravity effects", *Nature* 462, 331–334 (2009). https://doi.org/10.1038/nature08574 (open access preprint, under the title "Testing Einstein's special relativity with Fermi's short hard gamma-ray burst GRB090510": https://arxiv.org/abs/0908.1832)
- OPERA collaboration, "Measurement of the neutrino velocity with the OPERA detector in the CNGS beam", *Journal of High Energy Physics* 10, 093 (2012). <https://doi.org/10.1007/JHEP10(2012)093> (open access preprint: https://arxiv.org/abs/1109.4897; compare version 1 with version 4 to see the anomaly appear and vanish)
- T. M. Davis and C. H. Lineweaver, "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the Universe", *Publications of the Astronomical Society of Australia* 21, 97–109 (2004). Open access: https://arxiv.org/abs/astro-ph/0310808
- A. Addazi et al., "Quantum gravity phenomenology at the dawn of the multi-messenger era: a review", *Progress in Particle and Nuclear Physics* 125, 103948 (2022). Open access: https://arxiv.org/abs/2111.05659

### Books

- Albert Einstein, *Relativity: The Special and the General Theory* (1916; English translation by Robert W. Lawson, Methuen, 1920). Einstein's own explanation for general readers, with almost no maths. Free on [Project Gutenberg](https://www.gutenberg.org/ebooks/5001).
- N. David Mermin, *It's About Time: Understanding Einstein's Relativity* (Princeton University Press, 2005). A short, careful book on special relativity for non-specialists, by a Cornell physicist.
- Edwin F. Taylor and John Archibald Wheeler, *Spacetime Physics* (2nd edition, W. H. Freeman, 1992). The classic student text on spacetime diagrams and the interval; now free under a Creative Commons licence from [the authors' site](https://www.eftaylor.com/spacetimephysics/).
- Peter Galison, *Einstein's Clocks, Poincaré's Maps: Empires of Time* (W. W. Norton, 2003). A historian's account of how the practical business of synchronising clocks, for telegraphs, maps and railways, fed into the physics of Poincaré and Einstein.
- Abraham Pais, *"Subtle is the Lord...": The Science and the Life of Albert Einstein* (Oxford University Press, 1982). The standard scientific biography, written by a physicist who knew him.
- John D. Norton, *Einstein for Everyone* (University of Pittsburgh, free online): https://sites.pitt.edu/~jdnorton/teaching/HPS_0410/chapters/index.html

### Videos

- [The Ultimate Speed: An Exploration with High Energy Electrons](https://www.youtube.com/watch?v=B0BOpiMQXQA), Tom Jeff (upload of the 1962 MIT film), 37:40. Bertozzi's real experiment, filmed at the time: you watch the electrons' energy climb while their speed refuses to pass $c$.
- [Episode 41: The Michelson-Morley Experiment](https://www.youtube.com/watch?v=Ip_jdcA8fcw), caltech (The Mechanical Universe), 29:02. Caltech's 1980s television course on the 1887 experiment, which its own blurb calls the most brilliant failure in scientific history.
- [Episode 44: Energy, Momentum and Mass](https://www.youtube.com/watch?v=lZUrLq0LLIU), caltech (The Mechanical Universe), 28:46. The same series on why the new space and time force a new mechanics, and where $E = mc^2$ comes from.
- [The Speed of Light is NOT About Light](https://www.youtube.com/watch?v=msVuCEs8Ydo), PBS Space Time, 12:46. Argues that $c$ is really the speed of cause and effect, and light simply travels at it.
- [Relativistic Addition of Velocity (Special Relativity Ch. 6)](https://www.youtube.com/watch?v=R5oCXHWEL9A), minutephysics, 5:06. The velocity rule drawn out on spacetime diagrams in five minutes.
- [Why Going Faster-Than-Light Leads to Time Paradoxes](https://www.youtube.com/watch?v=an0M-wcHw5A), Cool Worlds, 25:07. The Columbia astronomer David Kipping walks through the antitelephone argument for any kind of faster-than-light travel.
- [How to travel faster than light](https://www.youtube.com/watch?v=BhG_QZl8WVY), Fermilab, 10:59. Don Lincoln on the things that really do beat $c$, and why none of them break the rule.
- [Neutrinos faster than light](https://www.youtube.com/watch?v=qJ0m13iJw0k), Sixty Symbols, 9:38. The Nottingham physicists Tony Padilla and Ed Copeland talking through the OPERA paper in a video posted five days after the announcement, before anyone knew about the cable.
- [Neutrinos slower than light](https://www.youtube.com/watch?v=cezltcn9Mv0), Sixty Symbols, 9:14. The same pair in February 2012, filmed at CERN as news of the timing fault broke.
- [TEDxSalford: Dario Autiero, The Neutrino Anomaly](https://www.youtube.com/watch?v=1Yk5LrJnuXw), TEDx Talks, 21:12. The man who gave the 2011 seminar, speaking a few months later.
- [Why No One Has Measured The Speed Of Light](https://www.youtube.com/watch?v=pTn6Ewhb27k), Veritasium, 19:05. Every measurement of $c$ is a round trip; this explains why the one-way speed is a matter of convention.

### Online

- APS News, "November 1887: Michelson and Morley report their failure to detect the luminiferous ether": https://www.aps.org/apsnews/2007/11/november-1887-michelson-uminiferous-ether
- Encyclopedia of Cleveland History, "Michelson-Morley Experiment": https://case.edu/ech/articles/m/michelson-morley-experiment
- Maxwell's letter to Faraday of 19 October 1861, transcribed by the Epsilon correspondence project: https://epsilon.ac.uk/view/faraday/letters/Faraday4081
- Tom Roberts and Siegmar Schleif, "What is the experimental basis of Special Relativity?", a long annotated list of experiments with references: https://math.ucr.edu/home/baez/physics/Relativity/SR/experiments.html
- Michael Fowler, "The Michelson-Morley Experiment", University of Virginia lecture notes with a clear worked version of the swimmer argument: https://galileoandeinstein.phys.virginia.edu/lectures/michelson.html
- Matt Buckley, "Why FTL implies time travel", a step-by-step spacetime-diagram version of the causality argument: https://www.physicsmatt.com/blog/2016/8/25/why-ftl-implies-time-travel
- NASA, "Fermi telescope caps first year with glimpse of space-time" (2009), on GRB 090510: https://www.nasa.gov/universe/fermi-telescope-caps-first-year-with-glimpse-of-space-time
- CERN, "OPERA experiment reports anomaly in flight time of neutrinos from CERN to Gran Sasso" (2011): https://home.cern/opera-experiment-reports-anomaly-in-flight-time-of-neutrinos-from-cern-to-gran-sasso/
- ESA, "ACES: Atomic Clock Ensemble in Space": https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/ACES_Atomic_Clock_Ensemble_in_Space

[^indico2011]: CERN Indico, "New results from OPERA on neutrino properties", seminar by Dario Autiero (IPN Lyon), Main Auditorium, 23 September 2011, 16:00. https://indico.cern.ch/event/155620/
[^opera2011]: OPERA collaboration (T. Adam et al.), "Measurement of the neutrino velocity with the OPERA detector in the CNGS beam", arXiv:1109.4897v1 (22 September 2011). https://arxiv.org/abs/1109.4897v1
[^cern2011]: CERN, "OPERA experiment reports anomaly in flight time of neutrinos from CERN to Gran Sasso", press release (23 September 2011). https://home.cern/opera-experiment-reports-anomaly-in-flight-time-of-neutrinos-from-cern-to-gran-sasso/
[^cohen2011]: A. G. Cohen and S. L. Glashow, "Pair creation constrains superluminal neutrino propagation", Physical Review Letters 107, 181803 (2011); submitted 29 September 2011. https://doi.org/10.1103/PhysRevLett.107.181803
[^galileo1632]: G. Galilei, Dialogue Concerning the Two Chief World Systems (1632), Second Day, trans. S. Drake (University of California Press, 1953), pp. 186–187; Italian original on Wikisource: https://it.wikisource.org/wiki/Dialogo_sopra_i_due_massimi_sistemi_del_mondo_tolemaico_e_copernicano/Giornata_seconda
[^newton1687]: I. Newton, The Mathematical Principles of Natural Philosophy (1687), trans. A. Motte (1729), Definitions, Scholium. <https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Definitions>
[^assis2003]: A. K. T. Assis, "On the first electromagnetic measurement of the velocity of light by Wilhelm Weber and Rudolf Kohlrausch", in Volta and the History of Electricity, 267–286 (2003). <https://www.ifi.unicamp.br/~assis/Weber-Kohlrausch(2003).pdf>
[^maxwell1862]: J. C. Maxwell, "On physical lines of force. Part III", Philosophical Magazine 23, 12–24 (1862). https://doi.org/10.1080/14786446208643207 (text: https://en.wikisource.org/wiki/On_Physical_Lines_of_Force)
[^faraday1861]: J. C. Maxwell, letter to M. Faraday, 19 October 1861, IET archives MS SC 2; Epsilon letter 4081. https://epsilon.ac.uk/view/faraday/letters/Faraday4081
[^maxwell1865]: J. C. Maxwell, "A dynamical theory of the electromagnetic field", Philosophical Transactions of the Royal Society of London 155, 459–512 (1865). https://doi.org/10.1098/rstl.1865.0008
[^codata]: NIST, CODATA 2022 recommended values of the vacuum magnetic permeability, vacuum electric permittivity and speed of light; NIST gives the permittivity as $\varepsilon_0 = 1/\mu_0 c^2$. https://physics.nist.gov/cgi-bin/cuu/Value?mu0
[^bipm1983]: BIPM, "Resolution 1 of the 17th CGPM (1983): Definition of the metre". https://www.bipm.org/en/committees/cg/cgpm/17-1983/resolution-1
[^maxwell1880]: J. C. Maxwell, "On a possible mode of detecting a motion of the solar system through the luminiferous ether" (letter to D. P. Todd, 19 March 1879), Proceedings of the Royal Society of London 30, 108–110 (1880). https://doi.org/10.1098/rspl.1879.0093 (text: https://en.wikisource.org/wiki/Motion_of_the_Solar_System_through_the_Luminiferous_Ether)
[^mactutormaxwell]: J. J. O'Connor and E. F. Robertson, "James Clerk Maxwell", MacTutor History of Mathematics archive. https://mathshistory.st-andrews.ac.uk/Biographies/Maxwell/
[^aps2007]: APS News, "November 1887: Michelson and Morley report their failure to detect the luminiferous ether" (November 2007). https://www.aps.org/apsnews/2007/11/november-1887-michelson-uminiferous-ether
[^michelson1881]: A. A. Michelson, "The relative motion of the Earth and of the luminiferous ether", American Journal of Science 22, 120–129 (1881). https://doi.org/10.2475/ajs.s3-22.128.120 (text: https://en.wikisource.org/wiki/The_Relative_Motion_of_the_Earth_and_the_Luminiferous_Ether)
[^mm1887]: A. A. Michelson and E. W. Morley, "On the relative motion of the Earth and the luminiferous ether", American Journal of Science 34, 333–345 (1887). https://doi.org/10.2475/ajs.s3-34.203.333
[^ech]: Encyclopedia of Cleveland History, "Michelson-Morley Experiment", Case Western Reserve University. https://case.edu/ech/articles/m/michelson-morley-experiment
[^csu]: "The Michelson-Morley Experiment", chapter 6 of A History of University Circle in Cleveland (Cleveland State University Pressbooks). https://pressbooks.ulib.csuohio.edu/history-of-university-circle-in-cleveland/chapter/6-the-michelson-morley-experiment/
[^nobel1907]: Nobel Prize Outreach, "The Nobel Prize in Physics 1907". https://www.nobelprize.org/prizes/physics/1907/summary/
[^fitzgerald1889]: G. F. FitzGerald, "The ether and the Earth's atmosphere", Science 13, 390 (1889). https://doi.org/10.1126/science.ns-13.328.390.a
[^brown2001]: H. R. Brown, "The origins of length contraction: I. The FitzGerald–Lorentz deformation hypothesis", American Journal of Physics 69, 1044–1054 (2001). https://doi.org/10.1119/1.1379733
[^lorentz1895]: H. A. Lorentz, Versuch einer Theorie der electrischen und optischen Erscheinungen in bewegten Körpern (E. J. Brill, Leiden, 1895); English translation on Wikisource. https://en.wikisource.org/wiki/Translation:Attempt_of_a_Theory_of_Electrical_and_Optical_Phenomena_in_Moving_Bodies
[^lorentz1904]: H. A. Lorentz, "Electromagnetic phenomena in a system moving with any velocity smaller than that of light", Proceedings of the Royal Netherlands Academy of Arts and Sciences 6, 809–831 (1904). https://dwc.knaw.nl/DL/publications/PU00014148.pdf
[^poincare1904]: H. Poincaré, lecture at the Congress of Arts and Science, St Louis (1904), printed in The Value of Science (1905), chapter 8, trans. G. B. Halsted. https://en.wikisource.org/wiki/The_Foundations_of_Science/The_Value_of_Science/Chapter_8
[^poincare1905]: H. Poincaré, "Sur la dynamique de l'électron", Comptes Rendus de l'Académie des Sciences 140, 1504–1508 (1905), session of 5 June 1905. <https://en.wikisource.org/wiki/Translation:On_the_Dynamics_of_the_Electron_(June)>
[^ige]: Swiss Federal Institute of Intellectual Property, "Einstein at the patent office". https://www.ige.ch/en/about-us/the-history-of-the-ipi/einstein/einstein-at-the-patent-office
[^norton2013]: J. D. Norton, "Chasing the light: Einstein's most famous thought experiment", in Thought Experiments in Philosophy, Science and the Arts, eds. J. R. Brown, M. Frappier and L. Meynell (Routledge, 2013). https://sites.pitt.edu/~jdnorton/papers/Chasing.pdf
[^einstein1905a]: A. Einstein, "Zur Elektrodynamik bewegter Körper", Annalen der Physik 17, 891–921 (1905); received 30 June 1905. https://doi.org/10.1002/andp.19053221004 (English translation by W. Perrett and G. B. Jeffery: https://www.fourmilab.ch/etexts/einstein/specrel/www/)
[^vandongen2009]: J. van Dongen, "On the role of the Michelson–Morley experiment: Einstein in Chicago", Archive for History of Exact Sciences 63, 655–663 (2009). https://doi.org/10.1007/s00407-009-0050-5
[^holton1969]: G. Holton, "Einstein, Michelson, and the 'crucial' experiment", Isis 60, 133–197 (1969). https://doi.org/10.1086/350468
[^minkowski1909]: H. Minkowski, "Raum und Zeit", lecture at the 80th Assembly of German Natural Scientists and Physicians, Cologne, 21 September 1908 (published 1909); quoted from the translation by W. Perrett and G. B. Jeffery in The Principle of Relativity (Methuen, 1923); a different, open English translation is on Wikisource: https://en.wikisource.org/wiki/Translation:Space_and_Time
[^mactutorminkowski]: J. J. O'Connor and E. F. Robertson, "Hermann Minkowski", MacTutor History of Mathematics archive. https://mathshistory.st-andrews.ac.uk/Biographies/Minkowski/
[^fizeau1851]: H. Fizeau, "Sur les hypothèses relatives à l'éther lumineux", Comptes Rendus 33, 349–355 (1851); English translation on Wikisource. https://en.wikisource.org/wiki/The_Hypotheses_Relating_to_the_Luminous_Aether
[^laue1907]: M. Laue, "Die Mitführung des Lichtes durch bewegte Körper nach dem Relativitätsprinzip", Annalen der Physik 23, 989–990 (1907). https://doi.org/10.1002/andp.19073281015
[^alvager1964]: T. Alväger, F. J. M. Farley, J. Kjellman and I. Wallin, "Test of the second postulate of special relativity in the GeV region", Physics Letters 12, 260–262 (1964). <https://doi.org/10.1016/0031-9163(64)91095-9>
[^roberts2007]: T. Roberts and S. Schleif, "What is the experimental basis of Special Relativity?", Usenet Physics FAQ (2007). https://math.ucr.edu/home/baez/physics/Relativity/SR/experiments.html
[^einstein1905b]: A. Einstein, "Ist die Trägheit eines Körpers von seinem Energieinhalt abhängig?", Annalen der Physik 18, 639–641 (1905); dated 27 September 1905. https://doi.org/10.1002/andp.19053231314
[^nist2005]: S. Rainville et al., "A direct test of E=mc²", Nature 438, 1096–1097 (2005). https://doi.org/10.1038/4381096a (NIST summary: https://www.nist.gov/news-events/news/2005/12/einstein-was-right-again-experiments-confirm-e-mc2)
[^ei2026]: Energy Institute, Statistical Review of World Energy 2026 (released 2 July 2026), as reported by DieselNet. https://dieselnet.com/news/2026/07energyreview.php
[^courier2026]: CERN Courier, "The LHC completes its third run" (23 July 2026), which gives Run 3's proton–proton collision energy as 13.6 TeV, that is 6.8 TeV per proton. https://cerncourier.com/a/the-lhc-completes-its-third-run/
[^bird1995]: D. J. Bird et al., "Detection of a cosmic ray with measured energy well beyond the expected spectral cutoff due to cosmic microwave radiation", Astrophysical Journal 441, 144–150 (1995). https://doi.org/10.1086/175344
[^bertozzi1964]: W. Bertozzi, "Speed and kinetic energy of relativistic electrons", American Journal of Physics 32, 551–555 (1964). https://doi.org/10.1119/1.1970770
[^okun1989]: L. B. Okun, "The concept of mass", Physics Today 42(6), 31–36 (1989). https://doi.org/10.1063/1.881171
[^einstein1907]: A. Einstein, "Über das Relativitätsprinzip und die aus demselben gezogenen Folgerungen", Jahrbuch der Radioaktivität und Elektronik 4, 411–462 (1907), p. 424; English translation as quoted in G. Weinstein, "Einstein on the impossibility of superluminal velocities", arXiv:1203.4954 (2012). https://arxiv.org/abs/1203.4954
[^feinberg1967]: G. Feinberg, "Possibility of faster-than-light particles", Physical Review 159, 1089–1105 (1967). https://doi.org/10.1103/PhysRev.159.1089
[^benford1970]: G. A. Benford, D. L. Book and W. A. Newcomb, "The tachyonic antitelephone", Physical Review D 2, 263–265 (1970). https://doi.org/10.1103/PhysRevD.2.263
[^nobel1958]: Nobel Prize Outreach, "The Nobel Prize in Physics 1958". https://www.nobelprize.org/prizes/physics/1958/summary/
[^davis2004]: T. M. Davis and C. H. Lineweaver, "Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the Universe", Publications of the Astronomical Society of Australia 21, 97–109 (2004). https://doi.org/10.1071/AS03040
[^eberhard1978]: P. H. Eberhard, "Bell's theorem and the different concepts of locality", Il Nuovo Cimento B 46, 392–419 (1978). https://doi.org/10.1007/BF02728628
[^nagel2015]: M. Nagel et al., "Direct terrestrial test of Lorentz symmetry in electrodynamics to 10⁻¹⁸", Nature Communications 6, 8174 (2015). https://doi.org/10.1038/ncomms9174
[^sanner2019]: C. Sanner et al., "Optical clock comparison for Lorentz symmetry testing", Nature 567, 204–208 (2019). https://doi.org/10.1038/s41586-019-0972-2
[^amelino1998]: G. Amelino-Camelia, J. Ellis, N. E. Mavromatos, D. V. Nanopoulos and S. Sarkar, "Tests of quantum gravity from observations of γ-ray bursts", Nature 393, 763–765 (1998). https://doi.org/10.1038/31647
[^abdo2009]: A. A. Abdo et al. (Fermi LAT and GBM collaborations), "A limit on the variation of the speed of light arising from quantum gravity effects", Nature 462, 331–334 (2009). https://doi.org/10.1038/nature08574
[^nasa2009]: NASA, "Fermi telescope caps first year with glimpse of space-time" (28 October 2009). https://www.nasa.gov/universe/fermi-telescope-caps-first-year-with-glimpse-of-space-time
[^lhaaso2024]: LHAASO collaboration (Z. Cao et al.), "Stringent tests of Lorentz invariance violation from LHAASO observations of GRB 221009A", Physical Review Letters 133, 071501 (2024). https://doi.org/10.1103/PhysRevLett.133.071501
[^abbott2017]: B. P. Abbott et al. (LIGO, Virgo, Fermi GBM and INTEGRAL), "Gravitational waves and gamma-rays from a binary neutron star merger: GW170817 and GRB 170817A", Astrophysical Journal Letters 848, L13 (2017). https://doi.org/10.3847/2041-8213/aa920c
[^ligo2017]: LIGO Caltech, "GW170817 press release" (16 October 2017). https://www.ligo.caltech.edu/page/press-release-gw170817
[^opera2012]: OPERA collaboration, "Measurement of the neutrino velocity with the OPERA detector in the CNGS beam", Journal of High Energy Physics 10, 093 (2012), section 6.1 and abstract of the final version. https://arxiv.org/abs/1109.4897v4
[^icarus2012]: ICARUS collaboration (M. Antonello et al.), "Measurement of the neutrino velocity with the ICARUS detector at the CNGS beam", Physics Letters B 713, 17–22 (2012). https://doi.org/10.1016/j.physletb.2012.05.033
[^physicsworld2012]: T. Commissariat, "Spokesperson for the OPERA collaboration resigns", Physics World (30 March 2012). https://physicsworld.com/a/spokesperson-for-the-opera-col/
[^sciencedaily2012]: CERN, "Neutrinos sent from CERN to Gran Sasso respect the cosmic speed limit, experiments confirm" (8 June 2012), via ScienceDaily. https://www.sciencedaily.com/releases/2012/06/120608152339.htm
[^ifae2026]: IFAE, "Four Large-Sized Telescopes to be inaugurated at CTAO-North in La Palma" (17 September 2026). https://www.ifae.es/news/2026/09/17/four-large-sized-telescopes-to-be-inaugurated-at-ctao-north-in-la-palma/
[^esaaces]: ESA, "ACES: Atomic Clock Ensemble in Space". https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/ACES_Atomic_Clock_Ensemble_in_Space
[^cacciapuoti2024]: L. Cacciapuoti et al., "Atomic Clock Ensemble in Space", arXiv:2411.02912 (2024). https://arxiv.org/abs/2411.02912
[^ligo2026]: LIGO, Virgo and KAGRA, "Observing run plans" (page updated 3 September 2026). https://observing.docs.ligo.org/plan/
[^esalisa]: ESA, "Capturing the ripples of spacetime: LISA gets go-ahead" (25 January 2024). https://www.esa.int/Science_Exploration/Space_Science/LISA/Capturing_the_ripples_of_spacetime_LISA_gets_go-ahead
[^colladay1998]: D. Colladay and V. A. Kostelecký, "Lorentz-violating extension of the standard model", Physical Review D 58, 116002 (1998). https://doi.org/10.1103/PhysRevD.58.116002
[^kostelecky2011]: V. A. Kostelecký and N. Russell, "Data tables for Lorentz and CPT violation", Reviews of Modern Physics 83, 11–31 (2011); arXiv version 19, February 2026. https://arxiv.org/abs/0801.0287
[^addazi2022]: A. Addazi et al., "Quantum gravity phenomenology at the dawn of the multi-messenger era: a review", Progress in Particle and Nuclear Physics 125, 103948 (2022). https://doi.org/10.1016/j.ppnp.2022.103948
