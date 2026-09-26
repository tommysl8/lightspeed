---
slug: seeing-near-light-speed
title: What you would see near the speed of light
shelf: light
order: 4
pitch: Forget hyperspace streaks. Near light speed the stars pile up ahead in a blue-white knot, the sky behind goes dark and red, and a sphere still looks round.
updated: 2026-09-25
---

In 2024, for the hundredth anniversary of a paper almost nobody had read, a group of physicists in Vienna photographed a box that had been built squashed. It was a metre tall and a metre wide but only 60 cm deep, which is the shape special relativity says a one-metre cube has while it passes you at 80% of the speed of light. They lit it with flashes of green laser light one picosecond long, opened the camera for 300 picoseconds at a time, slid the box along by 4.8 cm, and did it all again. When Dominik Hornof, Victoria Helm, Peter Schattschneider and their colleagues stitched the slices into a single frame, the squashed box did not look squashed. It looked like an ordinary cube, turned so that you could see its back.[^hornof2025]

That picture was predicted in 1959, and half-predicted in 1924. It is the least intuitive item on a short list of things that happen to your eyes near the speed of light, and the rest of the list is just as far from the films. Fly fast enough and the stars do not streak past. They slide forward and pile into a bright blue-white knot ahead of you, while the sky behind empties and fades to a dim red. At extreme speeds the cold afterglow of the Big Bang, invisible at home, turns into a glowing spot dead ahead. None of it needs exotic physics. It is what light does when you run into it, and the core of it was worked out by an English astronomer in 1729, a professor of mathematics and practical geometry in Prague in 1842, and a patent clerk in Bern in 1905.

::: timeline Seeing at speed
- **1725:** Bradley and Molyneux start watching γ Draconis from Kew and find it moving on the wrong timetable.
- **1729:** Bradley explains the motion as aberration of starlight.
- **1842:** Christian Doppler reads his paper on the coloured light of double stars in Prague.
- **1905:** Einstein derives the exact aberration and Doppler formulas.
- **1924:** Anton Lampa asks how a fast rod would actually look. Almost nobody reads it.
- **1938:** Ives and Stilwell measure the Doppler shift caused by time dilation alone.
- **1959:** Penrose and Terrell show that a fast sphere still looks like a sphere.
- **1966:** Martin Rees predicts radio sources that appear to move faster than light.
- **1979:** McKinley and Doherty show that the science-fiction "starbow" does not exist.
- **2012:** MIT Game Lab releases A Slower Speed of Light.
- **2025:** The Vienna group publishes the first photographs of the Terrell-Penrose rotation.
- **2026:** From March, the Event Horizon Telescope spends two months trying to film the black hole in M87.
:::

## Starlight that leans

In December 1725 James Bradley and his friend Samuel Molyneux began watching one star from Molyneux's house at Kew, west of London. A telescope more than 24 feet long, made by the instrument maker George Graham, was fixed to a chimney stack, pointing straight up, because γ Draconis passes almost exactly overhead there and light coming from the zenith is not bent by the air.[^rog1065][^perth2017] They were after parallax, the tiny yearly shuffle of a nearby star that would give its distance and prove that the Earth moves. [How far are the stars?](#/learn/how-far-are-the-stars) tells that part of the story.

The star did move. Over a year it swung about 20 arcseconds either side of its average position, but on the wrong timetable. Parallax should have pushed it furthest in June and December; γ Draconis was furthest out in March and September.[^rog1065] Bradley worked out why. The shift followed not where the Earth was, but which way it was going. A telescope carried sideways at orbital speed has to lean slightly forward to catch light falling in from a star, the way you tilt an umbrella forward when you walk through rain that falls straight down.

The lean is roughly the ratio of the two speeds. The Earth orbits at 29.78 km/s and light moves at 299,792 km/s, a ratio of about 1 to 10,000, which is an angle of 20.5 arcseconds. Bradley ran the sum backwards from the angle he measured and told Edmond Halley, in a letter printed in 1729, that light "moves, or is propagated as far as from the Sun to the Earth in 8′ 12″".[^bradley1729] The modern figure is 8 min 19 s. [Light takes time](#/learn/light-takes-time) has the rest of that story. What matters here is the umbrella: aberration is the first thing your own motion does to the sky, and at high speed it rearranges all of it.

Nothing we have built comes close to high speed. NASA's Parker Solar Probe, the fastest spacecraft ever flown, passed the Sun on 24 December 2024 at 430,000 mph, about 192 km/s.[^nasa2024] That is 0.064% of the speed of light, enough to lean the sky forward by at most 2.2 arcminutes, about a fourteenth of the width of the full Moon.

## The sky folds forward

Bradley's shortcut (angle equals speed ratio) fails at high speed, and the exact rule came from Einstein. Section 7 of his 1905 relativity paper is titled "Theory of Doppler's Principle and of Aberration", and it contains both formulas this article runs on.[^einstein1905] The idea behind the aberration formula is easy to say. In your frame, every incoming ray picks up an extra backward slant from your motion, so it seems to arrive from further forward. Stars near the point you are heading for hardly move. Stars off to the side move most.

$$
\cos\theta' = \frac{\cos\theta + \beta}{1 + \beta\cos\theta}
$$

In words: take the cosine of the star's true angle from your direction of travel, add your speed as a fraction of light's, and divide by one plus that speed fraction times the same cosine. What comes out is the cosine of the angle at which you see the star. Here θ is the angle someone at rest relative to the stars would measure from the same spot, θ′ is the angle you see, and β is your speed divided by c, so β = 0.9 means 0.9c.

Try β = 0.9 and a star exactly at right angles to your path. Then cos θ = 0, so cos θ′ = 0.9 ÷ 1 = 0.9, and θ′ = 25.8°. A star that was square to your motion now sits less than 26° from the point ahead. At half light speed, a star at 60° (cos θ = 0.5) gives cos θ′ = (0.5 + 0.5) ÷ (1 + 0.25) = 0.8, so θ′ = 36.9°. Now put in the Earth's orbital speed, β = 0.0000993. A star at right angles moves by 0.0057°, which is Bradley's 20.5 arcseconds. One formula covers the Kew chimney and a starship.

Setting θ = 90° shows where the whole forward half of the sky ends up: inside a cone around the point ahead whose half-angle has a cosine equal to β. That cone covers a share (1 − β)/2 of your sky.

| Your speed | Forward half of the sky squeezed within | Share of your sky it covers |
|---|---|---|
| 0.1c | 84.3° of dead ahead | 45% |
| 0.5c | 60.0° | 25% |
| 0.9c | 25.8° | 5% |
| 0.99c | 8.1° | 0.5% |
| 0.999c | 2.6° | 0.05% |

At 0.9c half of all the stars in the sky are packed into a twentieth of it. At 0.99c they fit in a circle 16° across, which you could hide behind two fists held at arm's length. The stars left in your rear hemisphere at 0.9c are the ones that were within 26° of the point directly behind you, spread thinly across half the sky.

::: figure aberration
Twenty-four evenly spaced stars, at rest (left) and seen from a ship moving at 0.9c towards the top of the page (right). The twelve stars that filled the forward half now sit inside the 25.8° cone, tinted blue. Most of the other twelve have been pulled forward too: only the four that were within 26° of dead astern are still behind you, and the six that started furthest back are tinted red.
:::

The same squeezing shrinks everything in front of you. A planet dead ahead at 0.9c looks 4.4 times narrower than it would to someone at rest at the same spot, so it seems farther away. Ute Kraus, who has built many of the best simulations of this, noticed that whenever you accelerate in one, the buildings in front of you seem to back away.[^kraus2008]

::: myth At the jump to light speed, the stars stretch into streaks that rush outwards past you.
They would move the other way. As you speed up, aberration pulls every star towards the point you are heading for, so the view contracts inwards, and the stars stay points. Simulations built on the exact formula show the sky shrinking into a knot ahead, not bursting past.[^kraus2008][^mckinley1979]
:::

::: myth Behind a near-light-speed ship the sky is black because light cannot catch up.
Light from behind reaches you at exactly c, however fast you go (see [Why nothing outruns light](#/learn/nothing-outruns-light)). The rear sky darkens because aberration has moved most of its stars forward, and the Doppler effect reddens and dims the few that remain.[^einstein1905][^mckinley1979]
:::

::: see-it split-0.999c
Left of the divider is the sky as it really lies, with none of the effects of your speed; right of it is what you actually see at 0.999c. On the right, half of all the stars are crammed into a circle about 5° across ahead, and the rear is nearly empty.
:::

::: see-it fly:proxima
A 1 g flight to Proxima Centauri. Watch the stars ahead creep inwards as the ship works up to about 95% of light speed at the halfway point, then spread out again as it slows down.
:::

## Doppler's coloured stars

On 25 May 1842 Christian Doppler read a paper to the Royal Bohemian Society of Sciences in Prague. Five regular members turned up.[^nolte2020] Its title promised to explain the coloured light of double stars, and its subtitle billed it as an attempt at a more general theory that would contain Bradley's aberration theorem as one of its parts.[^doppler1842] In the text Doppler treats the direction of incoming light as settled by Bradley's work, which he calls ingenious. What he wanted to know was what motion does to the timing of light. If you move towards a source, wave crests reach you more often and the frequency you measure goes up. Move away and it goes down.

The physics was right and the application was wrong. Doppler argued that the reds and blues of double stars came from their orbits carrying them towards or away from us.[^nolte2020] Stars move at tens of kilometres per second, about a ten-thousandth of light speed, which shifts their light by a hundredth of a percent. A star's light also spreads across the whole spectrum, so sliding all of it a tiny amount changes the colour you see by almost nothing. Star colours come from temperature, as [What stars are made of](#/learn/what-stars-are-made-of) explains.

The first test used sound. In February 1845 the Dutch scientist Christoph Buys Ballot put horn players on an open railway wagon between Utrecht and Maarssen. Hail and snow ruined the first attempt. In June they tried again, and musicians standing by the track heard the approaching note a half-tone high and the receding one a half-tone low.[^buysballot1845][^nolte2020]

On 29 December 1848 Hippolyte Fizeau told the Société Philomathique in Paris what astronomers should really look for: not colour, but the sharp lines in a star's spectrum, which would slide as a set, like the marks on a ruler.[^nolte2020] In 1868 William Huggins reported such a shift for Sirius.[^huggins1868] His velocity was not reliable, but the method was, and it is how every radial velocity since has been measured, including the tiny wobbles that give away planets around other stars ([Other worlds](#/learn/other-worlds)).

::: myth Doppler worked out his effect by listening to trains going past.
Doppler's 1842 paper was about starlight. The trains came three years later, when Buys Ballot put horn players on a railway wagon to test the idea with sound.[^doppler1842][^buysballot1845]
:::

## Clocks in the headlights

Einstein's 1905 paper added something Doppler could not have known about. A moving source is a moving clock, and moving clocks run slow by the Lorentz factor γ ([Time dilation is real](#/learn/time-dilation)). So even light arriving from the side, from a source that is neither approaching nor receding along your line of sight, is shifted. Einstein proposed a test in 1907: watch the light of fast-moving ions in a gas discharge tube.[^einstein1907]

It took 31 years. At Bell Telephone Laboratories, Herbert Ives and G. R. Stilwell sent a beam of hydrogen ions down a tube at under half a percent of light speed and used a mirror to see the beam coming towards the spectrograph and going away from it at the same time. The ordinary Doppler shifts, one blue and one red, cancel when you average them. What survives is the shift from time dilation alone, at most about one part in 100,000, and it matched the prediction.[^ives1938] The twist is that Ives was a committed opponent of relativity. He read the result as support for his own ether theory, which descended from the older work of Larmor and Lorentz.[^giuliani2015] Nature did not mind whose theory it was confirming. In 2014 a team at the GSI laboratory in Darmstadt ran a modern version with lithium ions circling a storage ring at 0.338c and matched Einstein's prediction to 2.3 parts per billion.[^botermann2014]

Here is the full Doppler formula for a ship moving through a field of stars.

$$
D = \frac{f_{\text{seen}}}{f_{\text{sent}}} = \frac{1}{\gamma\,(1 - \beta\cos\theta')}, \qquad \gamma = \frac{1}{\sqrt{1 - \beta^2}}
$$

In words: the Doppler factor D is the number that multiplies every frequency you receive. It equals one divided by the Lorentz factor times one minus your speed fraction times the cosine of the angle at which you see the source. D above 1 means bluer, D below 1 means redder, and wavelengths are divided by D. Dead ahead, where the cosine is 1, the formula tidies up to $D = \sqrt{(1+\beta)/(1-\beta)}$.

Take 0.9c. The Lorentz factor is 1 ÷ √(1 − 0.81) = 2.294. Dead ahead, D = 1 ÷ (2.294 × 0.1) = 4.36, so every frequency is multiplied by 4.36. Dead astern the cosine is −1 and D = 1 ÷ (2.294 × 1.9) = 0.229. At right angles the cosine is 0 and D = 1 ÷ 2.294 = 0.436. That last one is the transverse Doppler effect: light reaching you from the side is redshifted, because in your frame the stars are the ones moving and their atoms tick slowly. Somewhere between side and front the two effects balance. Setting D = 1 puts that neutral ring at 51° from dead ahead at 0.9c and at 30° at 0.99c. Inside the ring the sky is blueshifted, outside it redshifted, and the ring closes in as you speed up.

::: note Sideways depends on whose sideways
The star you see at right angles is redshifted. The star that is at right angles in the stars' own frame is blueshifted, by the factor γ, because aberration has moved it to 25.8° in front of you. Both statements are true; they are about different stars.
:::

## Colour is temperature

A star shines roughly like a blackbody, an ideal glowing object whose spectrum has a shape fixed entirely by its temperature. Doppler-shift a blackbody spectrum by a factor D and something tidy happens: you get another blackbody spectrum, at temperature D × T. The whole curve slides and rescales without changing shape.[^rybicki1979][^peebles1968] So the colour of a Doppler-shifted star is simply the colour of a hotter or cooler star. Wien's law, peak wavelength = 2.898 mm·K ÷ T, tells you where each curve peaks.

The Sun's surface temperature is 5,772 K, and its spectrum peaks at 502 nm, in the blue-green.[^prsa2016] Fly towards the Sun at 0.9c and it looks like a star at 5,772 × 4.36 = 25,200 K, with its peak pushed to 115 nm in the far ultraviolet. In visible light it is blue-white, the colour of the hottest stars in the sky. Fly away from it at the same speed and it looks like a 1,320 K object with its peak at 2.2 µm in the infrared: a dull orange glow, like iron in a forge.

The obvious guess is that stars ahead should run through the rainbow into the ultraviolet as you accelerate, and stars behind through red into the infrared. In a 1962 paper for the British Interplanetary Society, the rocket engineer Eugen Sänger worked out what the sky would look like if that were true, simplifying by treating every star as emitting one shade of yellow. His answer was a dark hole ahead, a dark hole behind, and a ring of rainbow-coloured stars between them.[^sanger1962] Frederik Pohl loved the idea and built a 1972 novella around it, The Gold at the Starbow's End.[^oikofuge]

In 1979 John McKinley and Paul Doherty of Oakland University did the sum properly. They treated each star as a blackbody, shifted its whole spectrum, weighted the result by the sensitivity of the human eye and drew the real sky at a range of speeds. No starbow. The stars ahead simply bunch into a patch that turns hot and blue-white.[^mckinley1979]

Run the same kind of calculation yourself and a twist turns up. Weight the shifted spectrum by the eye's sensitivity and a Sun-like star dead ahead gets brighter in visible light only up to a point: about three times brighter near 0.78c, back to its normal brightness near 0.994c, and fainter after that, because most of its extra light has gone into the ultraviolet. A star hotter than about 17,000 K only fades as you approach it. A cool red dwarf at 3,000 K does the opposite, brightening about fifty-fold by 0.94c. At very high speed, the knot ahead is lit mostly by stars you could barely see from home, and then by things that were never visible at all.

::: myth Near light speed you would see a rainbow ring of stars, the "starbow".
The starbow came from treating every star as a single yellow wavelength. Real stars have broad spectra that Doppler-shift into other broad spectra, so they change colour temperature rather than cycling through the rainbow. McKinley and Doherty's calculation for the real sky found no ring.[^mckinley1979]
:::

## The searchlight

Colour is only half of it. Moving through starlight also changes how bright things are, and the effect is steep. Physicists call it relativistic beaming, or the searchlight effect.

$$
F_{\text{seen}} = D^2\,F_{\text{rest}}, \qquad I_{\text{seen}} = D^4\,I_{\text{rest}}
$$

In words: the total brightness F of a single star, counting all wavelengths, goes up by the Doppler factor squared. The brightness I of each small patch of sky goes up by the Doppler factor to the fourth power. One factor of D comes from each photon arriving with D times its energy. A second comes from running into D times as many photons per second of your time. That makes D² for a star. For a patch of sky, aberration adds two more: it squeezes the patch into an area D² times smaller, so the same light is concentrated into less of your view.[^rybicki1979]

At 0.9c, D = 4.36 ahead, so a star dead ahead delivers D² = 19 times its normal total power, and each patch of sky there is D⁴ = 361 times brighter than before. Dead astern everything runs in reverse: a nineteenth of the power per star and 1/361 of the brightness per patch. Combine that with the table above: half the stars in the sky, each up to nineteen times brighter in total, crammed into a twentieth of the view. That is the searchlight.

These are totals over all wavelengths. Your eye sees only the slice between about 400 and 700 nm, and at high speed most of the power ahead lands outside it, which is why the visible-light numbers in the last section were so much smaller. Behind you the loss is brutal. The Sun, seen at 0.9c from behind, keeps a nineteenth of its total power but only about a hundred-thousandth of its visible light.

## Why a fast sphere still looks round

In section 4 of the 1905 paper Einstein wrote that a moving sphere, "viewed from the stationary system", has the shape of a flattened ellipsoid, and that at the speed of light every moving object would be squashed flat.[^einstein1905] By "viewed" he meant measured, with rulers and synchronised clocks. A generation of readers took him to mean seen. George Gamow's 1940 book Mr Tompkins in Wonderland, set in a town where light is so slow that a cyclist can nearly catch it, drew the cyclists visibly flattened, and textbook illustrations followed.[^kraus2008]

One person asked the right question early. In 1924 Anton Lampa, the physicist who had helped bring Einstein to a professorship in Prague in 1911 and who was by then back in Vienna, published a paper asking how a moving rod would actually appear to someone watching it.[^lampa1924][^kleinert2021] Almost nobody noticed.[^kraus2008] The Vienna experiment was carried out to mark its hundredth birthday.[^hornof2025]

In 1959 two people noticed independently. Roger Penrose, then at St John's College, Cambridge, published a three-page note in January showing that a fast sphere always presents a circular outline.[^penrose1959] James Terrell at Los Alamos submitted a longer paper in June making the same point about any small object: it looks rotated, not contracted.[^terrell1959] Victor Weisskopf spread the news in Physics Today the next year,[^weisskopf1960] and in 1961 Gamow published a correction to his own famous pictures.[^gamow1961]

The explanation is about timing. A camera records the light that arrives at the lens at one instant. Light from the far parts of an object has farther to travel, so it must have left earlier, when the object was somewhere else. Take a cube of side L moving left to right at speed βc, seen from far away at right angles to its motion.

The face turned towards you is contracted: its width is L/γ. The face on the trailing end would normally be edge-on and invisible. But light from its far edge, a distance L deeper, had to leave a time L/c earlier to arrive together with light from its near edge, and in that time the cube moved βL. So the trailing face shows up as a strip of width βL. You see two faces:

$$
\left(\beta L\right)^2 + \left(\frac{L}{\gamma}\right)^2 = \beta^2 L^2 + \left(1 - \beta^2\right)L^2 = L^2
$$

In words: the width of the back face you can now see, squared, plus the width of the squashed front face, squared, adds up to the cube's true width squared. That is Pythagoras, and it is exactly what a cube at rest looks like when it is turned about a vertical axis by an angle whose sine is β.

At 0.8c the back face appears 0.8 m wide and the front face 0.6 m wide: the 3-4-5 triangle. The cube looks like an ordinary one-metre cube turned through 53.1°, because sin 53.1° = 0.8. This is the cube in Vienna. For a sphere, Penrose used a deeper fact: aberration maps circles on the sky to circles, so the outline of a sphere stays a circle at any speed, while the markings on its surface slide round as if it had turned.[^penrose1959]

Two caveats. The result is exact only for objects that look small, far enough away that all their light arrives nearly parallel; up close, straight edges also appear curved.[^hornof2025] And physicists argued for years about whether the moving cube should be described as rotated or as sheared. Kraus found that in simulations both impressions can be produced, but it takes real effort to make a cube look sheared.[^kraus2008]

::: myth A spaceship flashing past at near light speed would look squashed.
Length contraction is real and measurable, but a snapshot does not show it. Light from the far side left earlier, which stretches the image back out, and for small objects the stretch cancels the contraction exactly, leaving an object that looks rotated. Penrose and Terrell showed this in 1959, and the Vienna group published photographs of it in 2025.[^penrose1959][^terrell1959][^hornof2025]
:::

::: see-it fly:saturn?beta=0.9
A flight to Saturn at a steady 0.9c. Ahead, Saturn looks smaller than you expect and blue-white rather than butterscotch, and neither the globe nor the rings look squashed. Look back towards the Sun: it is redder and dimmer than you have ever seen it.
:::

## Photographing an invisible contraction

Terrell's paper had one problem as a scientific claim: nobody could test it. Nothing big enough to photograph moves at a large fraction of light speed. The Vienna group got round that by slowing light down, in effect.

The trick came from art. The artist Enar de Dios Rodriguez and physicists in Vienna had built an art-science collective called SEEC Photography, using a pulsed laser and a camera with an ultrafast electronic shutter to film a pulse of light sweeping across a still object.[^seec2021] Photographs of light in flight are older than that, going back to Duguay and Mattick's picosecond pictures of 1971,[^duguay1971] and the idea reached a wide audience through the MIT Media Lab's "femto-photography" of 2011 to 2013.[^velten2013]

The Vienna experiment added motion. A laser produced 1-picosecond pulses of infrared light, frequency-doubled to green at 517 nm. A gated camera opened for 300 picoseconds at a time, 32 times per series, each shot 400 picoseconds later than the last. Because the light has to travel out and back, each delay picks out a slice of the object 6 cm deeper than the previous one. After each series they moved the object by the distance it would cover, at the chosen speed, in the time light takes to cross one 6 cm slice: 4.8 cm for the cube at 0.8c. Picking one slice from each series and adding them up builds a single snapshot of a moving object. Played back at 30 frames per second, the sequence is a film in which light crawls along at 1.8 m/s, about walking pace.[^hornof2025]

The objects had to be pre-contracted by hand, since nothing was really moving fast. The cube was a 1 × 1 × 0.6 m frame. The sphere, meant to be doing 0.999c, had to be built almost flat. In the synthesised snapshots the cube looks rotated about a vertical axis. The sphere stays round, but the pole that was pointing at the camera appears at its rim, so you are looking at a sphere that seems to have turned by nearly a right angle. Some edges appear doubled, an artefact of the laser's spherical wavefront that the authors reproduced in simulation.[^hornof2025] Their paper ends by suggesting the same method could stage Einstein's train thought experiment for real.

Before the laboratory came the software. Kraus and Corvin Zahn's simulations, begun in Tübingen, have shown flights past Saturn and through city streets at near light speed since the early 2000s, and in 2007 a team in Australia described Real Time Relativity, a program for flying through a simple world with the effects switched on.[^savage2007] In late 2012 the MIT Game Lab released A Slower Speed of Light, a free first-person game in which each orb you pick up lowers the speed of light until it approaches your own walking pace.[^mitgamelab] It shows the Doppler shift, the searchlight effect, time dilation, the warping from the Lorentz transformation and the delay from light's travel time all at once, and it was built on OpenRelativity, an open-source toolkit that anyone can use for their own experiments.[^mitgamelab][^sherin2016]

## Nature's own fast movers

We cannot fly at 0.9c, but some things in the universe do, and the effects in this article are how we know.

In 1966 Martin Rees, then a Cambridge research student, worked out what a cloud of radio-emitting gas would look like if it expanded at nearly the speed of light. Parts moving towards us could appear to cross the sky faster than light.[^rees1966] Five years later, radio astronomers linking dishes at Goldstone in California and Haystack in Massachusetts found the quasar 3C 279 changing its structure at an apparent speed about ten times that of light.[^whitney1971]

No rule is broken (see [Why nothing outruns light](#/learn/nothing-outruns-light)). A blob moving towards us at nearly c almost keeps up with its own light, so the light it gives off later arrives only a little after the light it gave off earlier. Its sideways movement gets squeezed into a short span of our time.

$$
\beta_{\text{apparent}} = \frac{\beta\sin\theta}{1 - \beta\cos\theta}
$$

In words: the apparent sideways speed, as a fraction of c, is the true speed fraction times the sine of the angle between the motion and our line of sight, divided by one minus the true speed fraction times the cosine of that angle. The top is how fast the blob moves across our view. The bottom is how much its approach compresses the arrival times of its light.

The jet from the giant black hole in M87 points about 17° from our line of sight.[^walker2018] A blob moving along it at 0.99c gives 0.99 × sin 17° ÷ (1 − 0.99 × cos 17°) = 0.289 ÷ 0.0533 = 5.4. It appears to cross the sky at 5.4 times the speed of light. The largest possible value at 0.99c comes when the cosine of the angle equals 0.99, at 8.1°, and works out at 7.0c. The Hubble Space Telescope measured features in the M87 jet moving at apparent speeds of four to six times light between 1994 and 1998,[^biretta1999] and in 2019 a team using the Chandra X-ray Observatory clocked an X-ray knot at 6.3c.[^snios2019] Turning the formula round, an apparent 6.3c needs a true speed of at least 98.8% of c.

Beaming explains the rest of the picture. Many jets look one-sided because the jet coming towards us is boosted by a large power of D while the one heading away is dimmed by the same power, often below detection.[^rybicki1979] And when the Event Horizon Telescope published the first image of the black hole at the centre of M87 in 2019, the ring was brighter on one side. The collaboration explained the lopsidedness as relativistic beaming from gas orbiting close to the speed of light.[^eht2019]

::: see-it go:m87
The camera glides to M87, 55 million light-years away in the Virgo cluster. Its jet is the one Hubble and Chandra clocked at apparent speeds of up to about six times the speed of light.
:::

## A glow from the Big Bang

We are moving too. The Sun travels at 369.82 km/s relative to the cosmic microwave background, the leftover glow from the early universe, and the Planck satellite measured the result: the background is 3.36 thousandths of a kelvin hotter in the direction we are heading and cooler behind.[^planck2018] That is the Doppler effect. In 2013 the Planck team went further and detected aberration too: the small hot and cold spots in the background are very slightly crowded together ahead of us and spread out behind. From that squeezing, together with the matching brightening, they measured our speed as 384 km/s, with an uncertainty of about a third. They subtitled the paper "Eppur si muove", the words Galileo is said to have muttered: "and yet it moves".[^planck2013]

The background has a temperature of 2.7255 K.[^fixsen2009] Its spectrum is an almost perfect blackbody peaking at a wavelength of 1.06 mm, in microwaves, which is why you cannot see it. But you now know what happens to a blackbody seen from a moving ship: dead ahead it looks like a blackbody at D × 2.7255 K. At 0.99c that is 38 K, still invisible. At 0.9999c it is 385 K, a hot oven, still invisible. Solid objects start to glow a visible dull red at about 798 K, a threshold John William Draper measured in 1847.[^draper1847]

To reach it, D has to be 798 ÷ 2.7255 = 293, which needs γ ≈ 146, a speed of 0.999977c. A ship holding 1 g from rest gets there after 5.5 years of ship time, having covered about 141 light-years. At that moment a dull red spot appears dead ahead where there was nothing. It is small, because D falls away quickly off-axis: the spot's colour temperature halves within about 0.4° of the centre, so the warm patch, out to where it is half as hot as the middle, is only about one and a half times the width of the full Moon, and the part hot enough to glow is smaller still. Keep accelerating and it whitens. It matches the Sun's colour at D ≈ 2,100 (γ ≈ 1,060), after 7.4 years of ship time and about 1,000 light-years. By then that small disc, together with its fading halo, delivers about 19 watts to each square metre of the ship's nose, a little more than sunlight gives at the distance of Saturn.

::: numbers The cosmic microwave background, seen dead ahead
| Speed | Doppler factor ahead | Background temperature ahead | Visible? |
|---|---|---|---|
| At rest | 1 | 2.7 K | No |
| 0.99c | 14.1 | 38 K | No |
| 0.9999c | 141 | 385 K | No |
| 0.999977c (5.5 ship years at 1 g) | 293 | 798 K | Dull red |
| 0.9999996c (7.4 ship years at 1 g) | 2,120 | 5,770 K | Sun-coloured |
| Midpoint of a 1 g flight to the galactic centre | about 27,500 | about 75,000 K | Blue-white, mostly ultraviolet |
| Midpoint of a 1 g flight to Andromeda | about 2.6 million | about 7 million K | Almost all X-rays |
:::

The last two rows are flights you can take in this app ([Rockets to the stars](#/learn/rockets-to-the-stars) explains how they work). On the way to the galactic centre the glow ahead peaks at around 75,000 K. On the way to Andromeda it passes through visible light and out the other side into X-rays. [The expanding universe](#/learn/the-expanding-universe) explains where the background comes from.

::: see-it cmb-glow
A 1 g flight in which the ship clock runs past five years. Watch the point dead ahead: a dull red spot appears where the sky was black, shrinks to a point and whitens as the years tick by. It is the Big Bang's afterglow, blueshifted by a factor of hundreds, then thousands.
:::

## What comes next

Nobody will look out of a window at 0.9c soon. Parker Solar Probe holds the record at 0.064% of light speed, and nothing planned comes anywhere near the speeds in this article. The work on this topic is happening at the other end: watching nature's fast movers more closely, and testing the aberration and Doppler formulas at cosmic scale.

**Filming a beamed black hole.** Beginning in March 2026 the Event Horizon Telescope ran a two-month campaign on M87 aimed at the first time-resolved sequence of images of a supermassive black hole: in effect, a film of the beamed, lopsided ring changing.[^keuper2026] No date has been given for results. The April 2017 observations took two years to become the first image,[^eht2019] so 2028 would not be a surprise. Further out, the next-generation EHT plans about ten new dishes to make such films routine, with no fixed schedule,[^ngeht] and the Black Hole Explorer team plans to propose a radio dish in orbit, extending the EHT into space, to NASA's Small Explorer programme in 2026, aiming for a 2031 launch.[^bhex] Whether BHEX is selected, and when, is not settled.

**The cosmic dipole anomaly.** In 1984 George Ellis and John Baldwin pointed out that our motion should affect distant galaxies the way it affects the microwave background. Aberration crowds them together ahead of us and Doppler boosting brightens them, so a survey should count slightly more of them in the direction we are heading, by an amount fixed by our 369.82 km/s.[^ellis1984] In 2021 a count of 1.36 million quasars found that excess, but more than twice as large as predicted, at a significance of 4.9σ (5σ, about a one-in-3.5-million chance of a fluke, is physicists' usual bar for a discovery).[^secrest2021] A review published in Reviews of Modern Physics in December 2025 put the combined discrepancy above 5σ;[^secrest2025] a reanalysis that allows for the way galaxies cluster brings the quasar result down to between 3.3σ and 3.6σ, but does not remove it.[^bashir2025] Either our motion is not all of it, or the universe on the largest scales is less even than the standard model assumes, or something subtle is wrong with the surveys. The Vera C. Rubin Observatory began its ten-year survey at the end of June 2026;[^rubin2026] Euclid's first large data release, about 1,900 square degrees of sky, is due in November 2026, with the full release in mid-2027;[^euclid2026] and SKA-Low, the low-frequency half of the SKA radio observatory, plans to begin science verification in 2027.[^skao2026] Between them they should help settle it, though not this year.

**More laboratory relativity.** The Vienna group says the same slicing method could stage Einstein's thought experiment of lightning striking a moving train.[^hornof2025] They have not announced a date.

## Further reading and watching

### Papers

- Bradley, J., "A letter ... giving an account of a new discovered motion of the fix'd stars", Phil. Trans. R. Soc. 35, 637–661 (1729). https://doi.org/10.1098/rstl.1727.0064 (the discovery of aberration, in Bradley's words)
- Doppler, C., "Ueber das farbige Licht der Doppelsterne und einiger anderer Gestirne des Himmels", Abh. Königl. Böhm. Ges. Wiss. (5) 2, 465–482 (1842). https://doi.org/10.5281/zenodo.5715929 (open access scan, in German)
- Einstein, A., "Zur Elektrodynamik bewegter Körper", Annalen der Physik 17, 891–921 (1905). https://doi.org/10.1002/andp.19053221004 (sections 4 and 7; a [free English translation of 1923](https://users.physics.ox.ac.uk/~rtaylor/teaching/specrel.pdf))
- Lampa, A., "Wie erscheint nach der Relativitätstheorie ein bewegter Stab einem ruhenden Beobachter?", Zeitschrift für Physik 27, 138–148 (1924). https://doi.org/10.1007/BF01328021
- Ives, H. E. & Stilwell, G. R., "An experimental study of the rate of a moving atomic clock", J. Opt. Soc. Am. 28, 215 (1938). https://doi.org/10.1364/JOSA.28.000215
- Penrose, R., "The apparent shape of a relativistically moving sphere", Proc. Camb. Phil. Soc. 55, 137–139 (1959). https://doi.org/10.1017/S0305004100033776
- Terrell, J., "Invisibility of the Lorentz contraction", Physical Review 116, 1041–1045 (1959). https://doi.org/10.1103/PhysRev.116.1041
- Weisskopf, V. F., "The visual appearance of rapidly moving objects", Physics Today 13 (9), 24–27 (1960). https://doi.org/10.1063/1.3057105
- Rees, M. J., "Appearance of relativistically expanding radio sources", Nature 211, 468–470 (1966). https://doi.org/10.1038/211468a0
- McKinley, J. M. & Doherty, P., "In search of the 'starbow': the appearance of the starfield from a relativistic spaceship", Am. J. Phys. 47, 309–316 (1979). https://doi.org/10.1119/1.11834
- Kraus, U., "First-person visualizations of the special and general theory of relativity", Eur. J. Phys. 29, 1–13 (2008). https://doi.org/10.1088/0143-0807/29/1/001 (open access: [arXiv:0708.3454](https://arxiv.org/abs/0708.3454))
- Botermann, B. et al., "Test of time dilation using stored Li+ ions as clocks at relativistic speed", Phys. Rev. Lett. 113, 120405 (2014). https://doi.org/10.1103/PhysRevLett.113.120405 (open access: [arXiv:1409.7951](https://arxiv.org/abs/1409.7951))
- Planck Collaboration, "Planck 2013 results. XXVII. Doppler boosting of the CMB: Eppur si muove", A&A 571, A27 (2014). https://doi.org/10.1051/0004-6361/201321556 (open access: [arXiv:1303.5087](https://arxiv.org/abs/1303.5087))
- Snios, B. et al., "Detection of superluminal motion in the X-ray jet of M87", ApJ 879, 8 (2019). https://doi.org/10.3847/1538-4357/ab2119 (open access: [arXiv:1905.04330](https://arxiv.org/abs/1905.04330))
- Nolte, D. D., "The fall and rise of the Doppler effect", Physics Today 73 (3), 30–35 (2020). https://doi.org/10.1063/PT.3.4429 (open access; the best short history of Doppler, Buys Ballot and Fizeau)
- Hornof, D. et al., "A snapshot of relativistic motion: visualizing the Terrell-Penrose effect", Communications Physics 8, 161 (2025). https://doi.org/10.1038/s42005-025-02003-6 (open access)
- Secrest, N. et al., "Colloquium: The cosmic dipole anomaly", Rev. Mod. Phys. 97, 041001 (2025). https://doi.org/10.1103/9ygx-z2yq (open access: [arXiv:2505.23526](https://arxiv.org/abs/2505.23526))

### Books

- Hermann Bondi, Relativity and Common Sense (Doubleday, 1964; Dover reprint, 1980). Builds all of special relativity from the Doppler factor, with nothing harder than algebra.
- Edwin F. Taylor and John Archibald Wheeler, Spacetime Physics, 2nd edition (W. H. Freeman, 1992). Free to download from the authors at https://www.eftaylor.com/spacetimephysics/
- Wolfgang Rindler, Relativity: Special, General, and Cosmological, 2nd edition (Oxford University Press, 2006). The standard careful treatment of aberration, Doppler and the Terrell rotation, for when you have learned calculus.
- George B. Rybicki and Alan P. Lightman, Radiative Processes in Astrophysics (Wiley, 1979). Chapter 4 is the reference for beaming and how intensity transforms. University level.
- George Gamow, Mr Tompkins in Wonderland (Cambridge University Press, 1940; reprinted in Mr Tompkins in Paperback, Cambridge University Press, 1993). Read it for the fun, and for the famous mistake.

### Videos

- [What would we see at the speed of light?](https://www.youtube.com/watch?v=vFNgd3pitAI), ScienceClic English, 15:01. Clean animations of take-off, aberration and the Doppler shift, in much the same order as this article.
- [Relativistic Aberration Pt.1: Delayed perception (slow speed of light)](https://www.youtube.com/watch?v=QMuUDEK1c8A), Imagining Physics by Anssi Kuha, 7:00. Shows carefully why you never see a moving thing where it is now, the root of the Terrell rotation.
- [Relativistic Aberration Pt.2: Beaming Effect (slow speed of light)](https://www.youtube.com/watch?v=m3SCm2L823c), Imagining Physics by Anssi Kuha, 8:53. Works out where aberration comes from and how the relativistic version differs from the old one, with beaming as the payoff.
- [A Slower Speed of Light Official Trailer — MIT Game Lab](https://www.youtube.com/watch?v=uu7jA8EHi_0), teamspectrip, 2:54. Three minutes of what a world with slow light looks like; then go and play the game.
- [Superluminal Speeds (faster than light) - Sixty Symbols](https://www.youtube.com/watch?v=IsEDigUHsOQ), Sixty Symbols, 8:25. Mike Merrifield of the University of Nottingham on how things in the sky can appear to move faster than light without doing so.
- [How to Understand What Black Holes Look Like](https://www.youtube.com/watch?v=zUyH3XhpLTo), Veritasium, 9:18. Made for the release of the first EHT image in April 2019; uses Jean-Pierre Luminet's 1979 simulated black hole to explain what such an image shows.
- [Imaging at a trillion frames per second | Ramesh Raskar](https://www.youtube.com/watch?v=Y_9vd4HWlVA), TED, 11:02. Films of light itself in motion, the family of techniques the Vienna experiment grew from.

### Online

- [Space Time Travel: Relativity visualized](https://www.spacetimetravel.org), Ute Kraus and Corvin Zahn. Films and explanations of flights past the Sun and Saturn, through the streets of Tübingen and towards black holes, with the physics spelled out.
- [A Slower Speed of Light](https://gamelab.mit.edu/games/a-slower-speed-of-light/), MIT Game Lab. Free downloads for Windows, Mac and Linux, plus the papers behind it.
- [A Snapshot of Relativistic Motion: Special relativity made visible](https://www.tuwien.at/en/all-news/news/spezielle-relativitaetstheorie-sichtbar-gemacht), TU Wien press release, 2 May 2025.
- [Chandra press release on superluminal motion in the M87 jet](https://chandra.si.edu/press/20_releases/press_010620.html), Chandra X-ray Observatory, 6 January 2020.
- [Black Hole Accretion Disk Visualization](https://svs.gsfc.nasa.gov/13326/), NASA Goddard Scientific Visualization Studio, 2019. Shows why the side of a disc coming towards you is brighter.
- [The Myth of the Starbow](https://oikofuge.com/the-myth-of-the-starbow/), The Oikofuge. A long, careful blog post on Sänger, Pohl, McKinley and Doherty, with simulated skies.
- [Doppler's 1842 paper, scanned](https://archive.org/details/ueberdasfarbigel00doppuoft), Internet Archive (the 1903 reprint made for the centenary of Doppler's birth).

[^hornof2025]: D. Hornof, V. Helm, E. de Dios Rodriguez, T. Juffmann, P. Haslinger and P. Schattschneider, "A snapshot of relativistic motion: visualizing the Terrell-Penrose effect", Communications Physics 8, 161 (2025). https://doi.org/10.1038/s42005-025-02003-6
[^rog1065]: Royal Observatory Greenwich, "Telescope: Bradley's 12.5-foot zenith sector (1727)". https://www.royalobservatorygreenwich.org/articles.php?article=1065
[^perth2017]: Perth Observatory, "The astronomical speed of light, part 2" (26 April 2017). https://www.perthobservatory.com.au/space-and-astronomy/astronomical-speed-light-part-2
[^bradley1729]: J. Bradley, "A letter from the Reverend Mr. James Bradley ... to Dr. Edmond Halley ... giving an account of a new discovered motion of the fix'd stars", Phil. Trans. R. Soc. 35, 637–661 (1729). https://doi.org/10.1098/rstl.1727.0064
[^nasa2024]: NASA, "NASA's Parker Solar Probe makes history with closest pass to Sun" (December 2024). https://science.nasa.gov/science-research/heliophysics/nasas-parker-solar-probe-makes-history-with-closest-pass-to-sun/
[^einstein1905]: A. Einstein, "Zur Elektrodynamik bewegter Körper", Annalen der Physik 17, 891–921 (1905). https://doi.org/10.1002/andp.19053221004 (quotations from the 1923 Perrett and Jeffery translation, https://users.physics.ox.ac.uk/~rtaylor/teaching/specrel.pdf)
[^kraus2008]: U. Kraus, "First-person visualizations of the special and general theory of relativity", Eur. J. Phys. 29, 1–13 (2008). https://doi.org/10.1088/0143-0807/29/1/001
[^mckinley1979]: J. M. McKinley and P. Doherty, "In search of the 'starbow': the appearance of the starfield from a relativistic spaceship", Am. J. Phys. 47, 309–316 (1979). https://doi.org/10.1119/1.11834
[^nolte2020]: D. D. Nolte, "The fall and rise of the Doppler effect", Physics Today 73 (3), 30–35 (2020). https://doi.org/10.1063/PT.3.4429
[^doppler1842]: C. Doppler, "Ueber das farbige Licht der Doppelsterne und einiger anderer Gestirne des Himmels. Versuch einer das Bradley'sche Aberrations-Theorem als integrirenden Theil in sich schliessenden allgemeineren Theorie", Abh. Königl. Böhm. Ges. Wiss. (5) 2, 465–482 (1842). https://doi.org/10.5281/zenodo.5715929
[^buysballot1845]: C. H. D. Buys Ballot, "Akustische Versuche auf der Niederländischen Eisenbahn, nebst gelegentlichen Bemerkungen zur Theorie des Hrn. Prof. Doppler", Annalen der Physik 142, 321–351 (1845). https://doi.org/10.1002/andp.18451421102
[^huggins1868]: W. Huggins, "Further observations on the spectra of some of the stars and nebulae, with an attempt to determine therefrom whether these bodies are moving towards or from the Earth", Phil. Trans. R. Soc. 158, 529–564 (1868). https://doi.org/10.1098/rstl.1868.0022
[^einstein1907]: A. Einstein, "Über die Möglichkeit einer neuen Prüfung des Relativitätsprinzips", Annalen der Physik 23, 197–198 (1907). https://doi.org/10.1002/andp.19073280613
[^ives1938]: H. E. Ives and G. R. Stilwell, "An experimental study of the rate of a moving atomic clock", J. Opt. Soc. Am. 28, 215 (1938). https://doi.org/10.1364/JOSA.28.000215
[^giuliani2015]: G. Giuliani, "Experiment and theory: the case of the Doppler effect for photons", Eur. J. Phys. 34, 1035–1047 (2013). https://doi.org/10.1088/0143-0807/34/4/1035 (free version: https://arxiv.org/abs/1502.05736)
[^botermann2014]: B. Botermann et al., "Test of time dilation using stored Li+ ions as clocks at relativistic speed", Phys. Rev. Lett. 113, 120405 (2014). https://doi.org/10.1103/PhysRevLett.113.120405
[^rybicki1979]: G. B. Rybicki and A. P. Lightman, Radiative Processes in Astrophysics, chapter 4 (Wiley, 1979). https://doi.org/10.1002/9783527618170
[^peebles1968]: P. J. E. Peebles and D. T. Wilkinson, "Comment on the anisotropy of the primeval fireball", Physical Review 174, 2168 (1968). https://doi.org/10.1103/PhysRev.174.2168
[^prsa2016]: A. Prša et al., "Nominal values for selected solar and planetary quantities: IAU 2015 Resolution B3", Astronomical Journal 152, 41 (2016). https://doi.org/10.3847/0004-6256/152/2/41
[^sanger1962]: E. Sänger, "Some optical and kinematical effects in interstellar astronautics", J. Brit. Interplanet. Soc. 18, 273–277 (1962); an earlier German version is "Einige optische und kinematische Effekte in der interstellaren Raumfahrt", ZAMP 9, 591–600 (1958). https://doi.org/10.1007/BF02424777
[^oikofuge]: The Oikofuge (blog), "The myth of the starbow". https://oikofuge.com/the-myth-of-the-starbow/
[^lampa1924]: A. Lampa, "Wie erscheint nach der Relativitätstheorie ein bewegter Stab einem ruhenden Beobachter?", Zeitschrift für Physik 27, 138–148 (1924). https://doi.org/10.1007/BF01328021
[^kleinert2021]: A. Kleinert, "Anton Lampa: the man who brought Einstein to Prague", Dějiny věd a techniky (History of Sciences and Technology) 54, 188–198 (2021). https://doi.org/10.70391/7e5.3-4.c
[^penrose1959]: R. Penrose, "The apparent shape of a relativistically moving sphere", Proc. Camb. Phil. Soc. 55, 137–139 (1959). https://doi.org/10.1017/S0305004100033776
[^terrell1959]: J. Terrell, "Invisibility of the Lorentz contraction", Physical Review 116, 1041–1045 (1959). https://doi.org/10.1103/PhysRev.116.1041
[^weisskopf1960]: V. F. Weisskopf, "The visual appearance of rapidly moving objects", Physics Today 13 (9), 24–27 (1960). https://doi.org/10.1063/1.3057105
[^gamow1961]: G. Gamow, "Remarks on Lorentz contraction", Proc. Natl Acad. Sci. USA 47, 728–729 (1961). https://doi.org/10.1073/pnas.47.5.728
[^seec2021]: E. de Dios Rodríguez, B. B. Klopfer, P. Haslinger and T. Juffmann, "SEEC: Photography at the speed of light", Leonardo 54, 506–509 (2021). https://doi.org/10.1162/leon_a_01940
[^duguay1971]: M. A. Duguay and A. T. Mattick, "Ultrahigh speed photography of picosecond light pulses and echoes", Applied Optics 10, 2162–2170 (1971). https://doi.org/10.1364/AO.10.002162
[^velten2013]: A. Velten et al., "Femto-photography: capturing and visualizing the propagation of light", ACM Transactions on Graphics 32, 44 (2013). https://doi.org/10.1145/2461912.2461928
[^savage2007]: C. M. Savage, A. Searle and L. McCalman, "Real Time Relativity: exploratory learning of special relativity", Am. J. Phys. 75, 791–798 (2007). https://doi.org/10.1119/1.2744048
[^mitgamelab]: MIT Game Lab, "A Slower Speed of Light" (2012). https://gamelab.mit.edu/games/a-slower-speed-of-light/
[^sherin2016]: Z. W. Sherin, R. Cheu, P. Tan and G. Kortemeyer, "Visualizing relativity: the OpenRelativity project", Am. J. Phys. 84, 369–374 (2016). https://doi.org/10.1119/1.4938057
[^rees1966]: M. J. Rees, "Appearance of relativistically expanding radio sources", Nature 211, 468–470 (1966). https://doi.org/10.1038/211468a0
[^whitney1971]: A. R. Whitney et al., "Quasars revisited: rapid time variations observed via very-long-baseline interferometry", Science 173, 225–230 (1971). https://doi.org/10.1126/science.173.3993.225
[^walker2018]: R. C. Walker, P. E. Hardee, F. B. Davies, C. Ly and W. Junor, "The structure and dynamics of the subparsec jet in M87 based on 50 VLBA observations over 17 years at 43 GHz", ApJ 855, 128 (2018). https://doi.org/10.3847/1538-4357/aaafcc
[^biretta1999]: J. A. Biretta, W. B. Sparks and F. Macchetto, "Hubble Space Telescope observations of superluminal motion in the M87 jet", ApJ 520, 621–626 (1999). https://doi.org/10.1086/307499
[^snios2019]: B. Snios et al., "Detection of superluminal motion in the X-ray jet of M87", ApJ 879, 8 (2019). https://doi.org/10.3847/1538-4357/ab2119
[^eht2019]: Event Horizon Telescope Collaboration, "First M87 Event Horizon Telescope results. I. The shadow of the supermassive black hole", ApJL 875, L1 (2019). https://doi.org/10.3847/2041-8213/ab0ec7
[^planck2018]: Planck Collaboration, "Planck 2018 results. I. Overview and the cosmological legacy of Planck", A&A 641, A1 (2020). https://doi.org/10.1051/0004-6361/201833880
[^planck2013]: Planck Collaboration, "Planck 2013 results. XXVII. Doppler boosting of the CMB: Eppur si muove", A&A 571, A27 (2014). https://doi.org/10.1051/0004-6361/201321556
[^fixsen2009]: D. J. Fixsen, "The temperature of the cosmic microwave background", ApJ 707, 916–920 (2009). https://doi.org/10.1088/0004-637X/707/2/916
[^draper1847]: J. W. Draper, "On the production of light by heat", Philosophical Magazine 30, 345–360 (1847). https://doi.org/10.1080/14786444708647190
[^keuper2026]: J. G. J. Keuper and M. Mościbrodzka, "Probing the details of relativistic electrons with multifrequency observations of M87 black hole", arXiv:2609.11609 (2026). https://arxiv.org/abs/2609.11609
[^ngeht]: ngEHT, "Concept". https://www.ngeht.org/about
[^bhex]: The Black Hole Explorer (BHEX) mission team, "The Black Hole Explorer" (mission site, checked September 2026). https://www.blackholeexplorer.org
[^ellis1984]: G. F. R. Ellis and J. E. Baldwin, "On the expected anisotropy of radio source counts", MNRAS 206, 377–381 (1984). https://doi.org/10.1093/mnras/206.2.377
[^secrest2021]: N. J. Secrest et al., "A test of the cosmological principle with quasars", ApJL 908, L51 (2021). https://doi.org/10.3847/2041-8213/abdd40
[^secrest2025]: N. Secrest, S. von Hausegger, M. Rameez, R. Mohayaee and S. Sarkar, "Colloquium: The cosmic dipole anomaly", Rev. Mod. Phys. 97, 041001 (2025). https://doi.org/10.1103/9ygx-z2yq
[^bashir2025]: M. Bashir, P. Chingangbam and S. Appleby, "The CatWISE2020 quasar dipole: a reassessment of the cosmic dipole anomaly", arXiv:2511.00822 (2025, revised 2026; accepted for publication in the Astrophysical Journal). https://arxiv.org/abs/2511.00822
[^rubin2026]: Rubin Observatory, "Action! NSF–DOE Vera C. Rubin Observatory begins capturing the greatest cosmic movie ever made" (June 2026). https://rubinobservatory.org/news/action-rubin-lsst-begins
[^euclid2026]: ESA, "Euclid DR1 timeline". https://www.cosmos.esa.int/web/euclid/dr1-timeline
[^skao2026]: SKAO, "SKAO's telescope in South Africa 'comes alive' with first fringes milestone" (7 January 2026). https://www.skao.int/en/news/693/ska-mid-milestone
