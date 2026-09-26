# Fact file: clockwork-and-chaos

One line per fact: claim | value | source | status. "computed" means recomputed here from the cited inputs (node, or JPL Horizons API queried 25 Sep 2026).

## Kepler and Tycho
- Kepler moved to Prague in 1600 to work with Tycho Brahe; Tycho died October 1601 and Kepler succeeded him as Imperial Mathematician | 1600; 1601 | Stanford Encyclopedia of Philosophy, "Johannes Kepler" (D. A. Di Liscia, rev. 14 Sep 2025), https://plato.stanford.edu/entries/kepler/ | verified
- Kepler called his Mars work "my war with Mars" | n/a | MacTutor, Kepler biography, https://mathshistory.st-andrews.ac.uk/Biographies/Kepler/ | verified (secondary)
- Kepler inherited ten Mars oppositions from Tycho (1580-1600), added two (1602, 1604); his vicarious (circular) hypothesis matched longitudes to 2 arcmin but failed by 8 arcmin elsewhere; he trusted Tycho's data; "these eight minutes alone will have led the way to the reformation of all of astronomy" (Donahue translation) | 8' | SEP Kepler entry (citing Astronomia Nova, KGW 3 p. 286) | verified (paraphrased in article, not quoted)
- Astronomia Nova (Heidelberg, 1609) contains first law (ellipse, Sun at focus) and second law (equal areas) | 1609 | MacTutor Kepler; SEP | verified
- Third law conceived 8 March 1618, rejected after a bad calculation, recovered 15 May 1618; published in Harmonices Mundi (Linz, 1619) | 1618-1619 | MacTutor Kepler (Kepler's own account translated) | verified
- 8 arcmin is about a quarter of the Moon's apparent width (~31 arcmin) | ~1/4 | computed | verified
- Mercury orbital speed 58.97 km/s at perihelion, 38.86 km/s at aphelion; e = 0.2056; a = 57.909 million km; period 87.969 d | n/a | NASA NSSDCA Mercury fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html | verified
- Earth orbital speed 30.29 (max) / 29.29 (min) / 29.78 (mean) km/s; escape velocity 11.186 km/s | n/a | NSSDCA Earth fact sheet | verified
- Kepler III check: Halley a = 17.93 au gives T = 75.9 yr (JPL period 75.9 yr); Le Verrier's a = 36.154 au gives 217.39 yr (he gave 217.387 yr) | n/a | computed; JPL Horizons 1P elements; Le Verrier letter (Krajnovic 2021) | verified

## Newton and Halley
- In 1684 Halley asked Newton what orbit a body follows under an inverse-square force; Newton replied at once that it would be an ellipse | 1684 | MacTutor, Newton biography (quoting Nauenberg), https://mathshistory.st-andrews.ac.uk/Biographies/Newton/ | verified (secondary)
- Principia published 1687; Halley urged Newton to write it and paid for publication himself because the Royal Society was short of money | 1687 | MacTutor Halley biography, https://mathshistory.st-andrews.ac.uk/Biographies/Halley/ ; MacTutor Newton | verified (secondary)
- Newton, Opticks (1717/1730): irregularities "which will be apt to increase, till this system wants a reformation" | n/a | quoted in J. Laskar, "Is the Solar System stable?", arXiv:1209.5996 (2013), p. 2 | verified (quote via Laskar)
- Sun GM = 1.32712440018e20 m^3/s^2; circular speed at 1 au = 29.785 km/s; at 30.07 au = 5.43 km/s | n/a | computed (IAU/JPL GM) | verified
- Escape speed at 1 au from Sun = 42.12 km/s | n/a | computed | verified
- 3I/ATLAS first reported 1 July 2025 by ATLAS (Rio Hurtado, Chile); third known interstellar object; hyperbolic orbit | 2025 | NASA Science, 3I/ATLAS page, https://science.nasa.gov/solar-system/comets/3i-atlas/ | verified
- 3I/ATLAS e = 6.14, q = 1.36 au; speed at perihelion 68.2 km/s vs local escape 36.1 km/s; speed far from Sun 57.9 km/s | n/a | JPL SBDB API (C/2025 N1) + computed | verified

## Halley's comet
- Halley linked the comets of 1531, 1607, 1682; wrote (Gregory 1726 version) return "about the end of the year 1758, or the beginning of the next" | n/a | D. W. Hughes, Phil. Trans. R. Soc. A 323, 349-367 (1987), https://doi.org/10.1098/rsta.1987.0091 | verified
- Halley died 14 January 1742 | 1742 | MacTutor Halley | verified
- Lalande began in June 1757; Clairaut set the scheme; Lepaute computed with Lalande; "During six months we calculated from morning to night, sometimes even at meals" | 1757-58 | MacTutor, Lepaute biography (quoting Lalande 1803), https://mathshistory.st-andrews.ac.uk/Biographies/Lepaute/ | verified (note: same page wrongly gives perihelion as 13 April; not used)
- Clairaut announced to the Paris Academy on 14 November 1758 a perihelion in mid-April 1759 (15 April per MacTutor), within about a month | 1758 | MacTutor Clairaut biography, https://mathshistory.st-andrews.ac.uk/Biographies/Clairaut/ ; Hughes 1987 ("mid-April") | verified
- Clairaut omitted Lepaute from his 1760 list of helpers; Lalande credited her | n/a | MacTutor Lepaute | verified (secondary)
- Actual perihelion 13 March 1759 (13.06) | 1759 | Hughes 1987; JPL Horizons (q = 0.5845 au on 13 Mar 1759) | verified
- Palitzsch, German amateur astronomer, found the comet on Christmas night (25-26 December) 1758 | 1758 | SEDS, Charles Messier biography (H. Frommert), http://www.messier.seds.org/xtra/history/biograph.html | verified
- Messier hunted the comet on a path computed by Delisle that was wrong; found M1 (Crab Nebula) position 12 Sep 1758 while observing another comet; independently found Halley 21 Jan 1759; Delisle withheld announcement until 1 April 1759 | n/a | SEDS Messier biography | verified
- The name "Halley's Comet" first suggested by La Caille in May 1759 | 1759 | Hughes 1987 | verified
- Earliest identified record of Halley's comet: 240 BCE | 240 BCE | Hughes 1987 (Fig. 2 caption) | verified
- 1910 prediction off by 2.7 days (led to jet-effect hypothesis); 1986 prediction by Yeomans Feb 9.66 vs actual Feb 9.46 (~5 h); comet recovered 16 Oct 1982 | n/a | Hughes 1987 | verified
- 1986 perihelion 0.587 au, 9 Feb 1986 | n/a | NASA Science 1P/Halley page, https://science.nasa.gov/solar-system/comets/1p-halley/ | verified
- Aphelion reached about 9-10 December 2023 at 35.14 au | 2023 | JPL Horizons (1P, JPL#75) | verified (computed)
- Next perihelion 28 July 2061 (~17h TDB), q = 0.593 au | 2061 | JPL Horizons (range-rate sign change between 28.0 and 29.0 July) | verified (computed); orbit solution uses 1835-1994 data, so timing uncertain by hours to days
- 2061 geometry: ~0.48 au from Earth around 30 July 2061, ~21 deg from the Sun; 1986 perihelion geometry: 1.55 au from Earth, ~7 deg from Sun; closest 1986 approach 0.42 au around 9-10 April | n/a | JPL Horizons observer tables | verified (computed)
- Orbit: e = 0.968, a = 17.93 au, i = 162 deg (retrograde), period 75.9 yr (osculating 1968) | n/a | JPL SBDB/Horizons | verified

## Uranus
- Herschel: "On Tuesday the 13th of March, between ten and eleven in the evening", near H Geminorum; magnifications 227, 460, 932; disc grew with power; "suspected it to be a comet"; he was then observing for stellar parallax; paper read 26 April 1781 | 1781 | W. Herschel, "Account of a Comet", Phil. Trans. 71, 492-501 (1781), https://doi.org/10.1098/rstl.1781.0056 | verified (primary)
- Herschel lived at 19 New King Street, Bath; musician (organist of the Octagon Chapel); built his own telescopes | n/a | Herschel Museum of Astronomy, https://herschelmuseum.org.uk/about/history/ | verified
- Lexell computed an orbit showing it was a planet twice as far from the Sun as Saturn; his calculations also suggested it was being perturbed by a more distant planet | 1781 | MacTutor, Lexell biography, https://mathshistory.st-andrews.ac.uk/Biographies/Lexell/ | verified (secondary)
- Herschel proposed Georgium Sidus; name Uranus suggested by Bode | n/a | NASA Science, Uranus facts, https://science.nasa.gov/uranus/facts/ | verified
- Uranus a = 19.17 au (2,867 million km), period 30,685 d (84.0 yr); Saturn ~9.5 au; ratio ~2 | n/a | NSSDCA Uranus fact sheet; computed | verified

## Neptune
- Bouvard published tables of Uranus in 1821 and could not fit all observations; quote "I leave it to the future the task of discovering whether the difficulty..." | 1821 | MacTutor, "Mathematical discovery of planets" (O'Connor & Robertson), https://mathshistory.st-andrews.ac.uk/HistTopics/Neptune_and_Pluto/ | verified (translation)
- Airy believed the inverse-square law might break down at great distances | n/a | MacTutor Neptune_and_Pluto | verified
- Adams's memorandum 3 July 1841 | 1841 | MacTutor Neptune_and_Pluto; MacTutor Adams | verified
- Adams called at Greenwich on 21 October 1845; Airy was at dinner (he dined at 3.30 pm); Adams left a manuscript; Airy's 5 November question about the radius vector went unanswered | 1845 | MacTutor Neptune_and_Pluto; MacTutor Adams | verified
- Le Verrier memoirs 10 November 1845, 1 June 1846, 31 August 1846; Paris Observatory searched only briefly | 1845-46 | MacTutor Neptune_and_Pluto | verified
- Le Verrier born 11 March 1811 | n/a | MacTutor Le Verrier | verified
- Challis searched from 29 July 1846 and recorded Neptune twice in August without recognising it | 1846 | MacTutor Neptune_and_Pluto; Kollerstrom chronology (Wayback), https://web.archive.org/web/20051119031753/http://www.ucl.ac.uk/sts/nk/neptune/chron.htm | verified (dates of the two records differ between sources: 4 & 12 Aug vs 8 & 12 Aug; article says "twice in August")
- Heliocentric conjunction of Uranus and Neptune ~late 1821 (Uranus 271.6 deg vs Neptune 273.1 deg on 1821 Jan 1; 275.8 vs 275.3 on 1822 Jan 1); separation ~10.9 au | 1821 | JPL Horizons | verified (computed)
- Neptune's pull on Uranus at conjunction ~1.6e-4 of the Sun's (mass ratio 1/19,412, distances 19.33 and 10.9 au) | ~1/6,000 | computed | verified
- Le Verrier's letter to Galle dated 18 September 1846; opened by thanking Galle for his reductions of Rømer's observations; elements: a = 36.154 au, period 217.387 yr, e = 0.10761, mass 1/9300 of Sun, true heliocentric longitude 1 Jan 1847 326 deg 32', distance 33.06 au; disc more than 3" | 1846 | D. Krajnovic, "That star is not on the map", arXiv:2108.06305 (2021), chapter in Sheehan et al. (eds), Neptune (Springer 2021) | verified
- Letter arrived 23 September 1846, Encke's 55th birthday; Encke went to his party; d'Arrest (a student, born 1822) overheard and joined; first used Harding's chart; after about an hour d'Arrest remembered Hora XXI among Encke's papers | 1846 | Krajnovic 2021 | verified
- Hora XXI begun 1826, completed 1844, printed 1845, by Carl Bremiker | n/a | Leibniz-Institut für Astrophysik Potsdam, "The history behind the AIP logo", https://www.aip.de/en/institute/history/the-history-behind-the-aip-logo/ ; Krajnovic 2021 | verified
- Discovery after 22:00 local time; Encke's report lists first measured position at 22:52 | 1846 | Krajnovic 2021 | verified (legend of "just after midnight" is from Kollerstrom's chronology "24th 0h 15min"; article avoids exact time)
- d'Arrest: "that star is not on the map!" (Dreyer 1882 account) | n/a | Krajnovic 2021 | verified
- Next night motion of 4' in RA confirmed a planet; disc measured 2.7-2.9" | n/a | Krajnovic 2021 | verified
- Galle to Le Verrier, 25 September 1846: "The planet whose position you had indicated really exists" (Lequeux translation) | 1846 | Krajnovic 2021 | verified
- Neptune found 1 deg 03' 06.7" from Le Verrier's predicted position (Gapaillard 2015) | 1.05 deg | Krajnovic 2021 | verified; Horizons check: Neptune ~329.70 deg J2000 on 1 Jan 1847, minus ~2.1 deg precession to 1847 equinox = ~327.6 deg vs 326.5 predicted, ~1.0 deg | verified (computed)
- Neptune on 23 Sep 1846: 30.01 au from Sun, magnitude ~7.8 | n/a | JPL Horizons | verified (computed)
- Real Neptune: a = 30.07 au (JPL mean), period 60,189 d = 164.8 yr, e = 0.0097; NSSDC gives a = 4,514.953 million km (30.18 au) | n/a | NSSDCA Neptune fact sheet | verified (article uses 30.07 au, JPL mean value, consistent with the period)
- Both predicted orbits much too large; both close to real Neptune only around 1840-1850 | n/a | MacTutor Neptune_and_Pluto | verified
- Galileo recorded Neptune on 28 December 1612 and 27-28 January 1613 | n/a | Kowal & Drake, Nature 287, 311-313 (1980), https://doi.org/10.1038/287311a0 ; MacTutor Neptune_and_Pluto | verified (MacTutor; Nature metadata)
- British Neptune file (1837-1848 correspondence) went missing from the Royal Greenwich Observatory and was found in Chile in 1999; Kollerstrom: Adams's predictions ranged over as much as 20 degrees | 1999; 2003 | BBC News, "Lost letters' Neptune revelations" (10 April 2003), http://news.bbc.co.uk/2/hi/science/nature/2936663.stm ; Kollerstrom site (Wayback) | verified
- Olin Eggen as the holder of the file | n/a | Wikipedia only | uncertain (not used)

## Mercury and Vulcan
- Le Verrier, letter to Faye, Comptes rendus 49, 379-383 (12 September 1859): adding 38" per century to Mercury's perihelion motion fits all transit observations within 1" (most within 0.5"); an inner planet at a little under half Mercury's distance would need Mercury's mass; preferred a ring of small bodies | 1859 | Comptes rendus 49 (1859), https://archive.org/details/comptesrendusheb49acad | verified (primary, French)
- Lescarbault wrote claiming a transit seen nine months earlier; Le Verrier visited Orgères; quote "It is then you, Sir, who pretend to have observed the intra-Mercurial planet..."; name Vulcan; Le Verrier led an eclipse expedition to Spain in July 1860 | 1859-60 | MacTutor Le Verrier biography, https://mathshistory.st-andrews.ac.uk/Biographies/Le_Verrier/ | verified (secondary)
- Lescarbault date 26 March 1859; announcement 2 January 1860 | n/a | Wikipedia only | uncertain (not used)
- Lick Observatory eclipse searches 1901, 1905, 1908 (Perrine): ~300 stars to 9th magnitude, all known; Campbell: closes the observational side of the intramercurial planet problem | 1908 | W. W. Campbell, PASP 20, 63 (1908), https://doi.org/10.1086/121793 | verified (primary)
- Mercury's perihelion advances ~5,600"/century as seen from Earth; 5,026" from precession of the equinoxes, 531" from the planets, 43" unexplained | n/a | MacTutor Le Verrier | verified
- GR prediction 42.98"/century; modern discrepancy 43"/century | n/a | C. M. Will, Living Rev. Relativ. 17, 4 (2014), https://doi.org/10.12942/lrr-2014-4 | verified
- Einstein's perihelion paper, Sitzungsberichte der Preussischen Akademie der Wissenschaften 1915, 831-839, November 1915 | 1915 | bibliographic; Einstein Papers Project | verified (date "18 November" not independently opened; article says "November 1915")
- GR formula 6 pi GM / (c^2 a (1-e^2)) = 5.019e-7 rad = 0.1035" per orbit; 415.2 orbits per century; 42.98"/century | n/a | computed | verified

## Poincaré
- Oscar II competition announced mid-1885 (Acta Mathematica), prize a gold medal and 2,500 crowns; entries before 1 June 1888; for the King's 60th birthday, 21 January 1889; commission Hermite, Weierstrass, Mittag-Leffler | n/a | J. Barrow-Green, Arch. Hist. Exact Sci. 48, 107-131 (1994), https://doi.org/10.1007/BF00374436 | verified
- Phragmén's queries July 1889; Poincaré found a serious error, told Mittag-Leffler in early December; printed copies recalled; Poincaré paid the bill of just over 3,500 crowns, about 1,000 more than the prize | 1889 | Barrow-Green 1994 | verified
- Revised memoir published 1890, Acta Math. 13 | 1890 | MacTutor Poincaré; Crossref (Acta Math. 13, DOI 10.1007/BF02392506 for introduction) | verified
- Error regarded as the birth of chaos theory; first description of homoclinic points | n/a | MacTutor Poincaré | verified (secondary)
- "it may happen that small differences in the initial conditions produce very great ones in the final phenomena" | 1908 (trans. 1914) | H. Poincaré, Science and Method, trans. F. Maitland (Nelson, 1914), p. 68, https://archive.org/details/sciencemethod00poinuoft | verified (primary)

## Chaos
- Lagrange and Laplace proved stability only in a linear approximation; orbits precess with periods 45,000 yr to a few Myr | n/a | Laskar 2013 review, arXiv:1209.5996 | verified
- Sussman & Wisdom (1988): Pluto chaotic, Lyapunov time 20 Myr | 1988 | Laskar 2013; Science 241, 433-437, https://doi.org/10.1126/science.241.4864.433 | verified
- Laskar (1989): inner Solar System chaotic, Lyapunov time ~5 Myr; error of 15 m in Earth's initial position becomes ~150 m after 10 Myr and 150 million km after 100 Myr | 1989 | Laskar 2013 review; Nature 338, 237-238, https://doi.org/10.1038/338237a0 | verified
- Sussman & Wisdom (1992) 100 Myr integration confirmed ~5 Myr | 1992 | Laskar 2013; Science 257, 56-62 | verified
- Laskar & Gastineau: 2,501 solutions over 5 Gyr on the JADE supercomputer (CINES, started August 2008, ~6 months); ~1% show large Mercury eccentricity leading to collision with Venus or Sun; one case destabilised inner planets ~3.4 Gyr; of 201 follow-ups, 5 ejected Mars, 1 Mercury-Earth, 29 Mars-Earth, 18 Venus-Earth collisions | 2009 | Laskar 2013 review; Nature 459, 817-819, https://doi.org/10.1038/nature08096 | verified
- GR raises Mercury's perihelion precession from 5.15"/yr to 5.58"/yr, away from Jupiter's 4.25"/yr; pure Newtonian model: collision probability within 5 Gyr ~60% | n/a | Laskar 2013 review | verified
- Batygin & Laughlin (2008) found similar Mercury instability | 2008 | ApJ 683, 1207-1216, https://doi.org/10.1086/589232 ; Laskar 2013 | verified
- Worked example: 15 m x 10^(t/10 Myr): 150 m at 10 Myr, 1.5e8 km at 100 Myr | n/a | computed, matches Laskar's stated numbers | verified

## Resonances
- Kirkwood (Meteoric Astronomy, 1867): table of ~90 asteroids; the widest intervals fall where periods are commensurable with Jupiter's; at ~2.5 au a particle makes 3 laps per Jupiter lap, meets Jupiter at the same points, eccentricity grows; compares with the gap in Saturn's ring | 1867 | D. Kirkwood, Meteoric Astronomy (Lippincott, 1867), pp. 105-110, https://archive.org/details/meteoricastronom00kirk | verified (primary)
- First noticed 1866 (Proc. AAAS 1866, pp. 8-14) | 1866 | Wikipedia citation only | uncertain (article uses the 1867 book)
- JPL histogram of 156,929 numbered asteroids (June 2007) shows gaps labelled 3:1, 5:2, 7:3, 2:1 caused by mean-motion resonances with Jupiter | n/a | JPL SSD, https://ssd.jpl.nasa.gov/diagrams/mb_hist.html | verified
- Resonance distances 2.50, 2.82, 2.96, 3.28 au | n/a | computed (Kepler III with Jupiter a = 5.2026 au) | verified
- Wisdom (1982): chaotic zone at the 3:1 resonance | 1982 | AJ 87, 577, https://doi.org/10.1086/113132 | verified (metadata)
- Moons & Morbidelli (1995): secular resonances inside mean-motion resonances make orbits chaotic; planet-crossing within a few Myr | 1995 | Icarus 114, 33-50, https://doi.org/10.1006/icar.1995.1041 | verified (as quoted on Wikipedia; metadata checked)
- Pluto-Neptune libration (3:2) | 1965 | Cohen & Hubbard, AJ 70, 10, https://doi.org/10.1086/109674 | verified (metadata); period ratio 247.94/164.79 = 1.505 computed
- Galilean periods Io 1.769138 d, Europa 3.551181 d, Ganymede 7.154553 d; Laplace relation n_Io - 3 n_Eu + 2 n_Ga = 0 to 0.00003 deg/day | n/a | NSSDCA Jovian satellite fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html ; computed | verified
- Hyperion tumbles chaotically; resonance with Titan; orbit ~21 days (21.28 d) vs Titan 15.95 d (ratio 1.334 = 4:3) | n/a | NASA Science Hyperion page, https://science.nasa.gov/saturn/moons/hyperion/ ; NSSDCA Saturnian satellite sheet; Wisdom, Peale & Mignard, Icarus 58, 137 (1984), https://doi.org/10.1016/0019-1035(84)90032-0 | verified

- Io is the most volcanically active world in the Solar System; Voyager 1 spotted the first signs of its volcanism in 1979; Io is pulled by Europa and Ganymede | 1979 | NASA Science, Io, https://science.nasa.gov/jupiter/moons/io/ | verified
- Peale, Cassen & Reynolds predicted melting of Io by tidal dissipation, Science 203, 892-894, published 2 March 1979 | 1979 | https://doi.org/10.1126/science.203.4383.892 (Crossref metadata) | verified (metadata)
- Hyperion radii 180 x 133 x 103 km, so about 360 km long; density just over half that of water, porosity >40%; heavily cratered | n/a | NSSDCA Saturnian satellite fact sheet; NASA Hyperion page | verified
- Jupiter a = 5.2029 au (JPL mean elements), period from third law 11.87 yr; one third = 3.96 yr, giving a = 2.50 au | n/a | JPL SSD, https://ssd.jpl.nasa.gov/planets/approx_pos.html ; computed | verified
- Neptune JPL mean elements: a = 30.0699 au, e = 0.0086 (used in article table as 30.07 au, 0.009) | n/a | JPL SSD approx_pos | verified

## Gravity assists
- Gravity assist transfers angular momentum from the planet; planet loses a tiny amount; train/tennis-ball analogy; Voyagers' launch energy only enough to reach Jupiter | n/a | NASA Science, Basics of Space Flight, "A Gravity Assist Primer", https://science.nasa.gov/learn/basics-of-space-flight/primer/ | verified
- Mariner 10: first spacecraft to use the gravity of one planet (Venus) to reach another | 1974 | NASA Science, Mariner 10, https://science.nasa.gov/mission/mariner-10/ | verified
- Grand Tour alignment of Jupiter, Saturn, Uranus, Neptune occurs about every 175 years | n/a | NASA Science, Voyager "Planetary Voyage", https://science.nasa.gov/mission/voyager/planetary-voyage/ | verified
- Voyager 2: launched 20 Aug 1977; mass 721.9 kg; Uranus 24 Jan 1986; Neptune 25 Aug 1989 | n/a | NSSDCA Voyager 2, https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-076A | verified
- Voyager 2 heliocentric speed: 9.9 km/s on 30 Jun 1979 (local escape 18.3) -> 20.9 km/s on 20 Jul 1979; Saturn 15.6 -> 21.1; Uranus 17.9 -> 19.8; Neptune 18.9 -> 16.8 km/s | n/a | JPL Horizons vectors | verified (computed)
- Voyager 1 on 25 Sep 2026: 171.9 au, 16.92 km/s vs local escape 3.21 km/s | n/a | JPL Horizons | verified (computed)
- Jupiter's velocity change from Voyager 2 ~4e-21 m/s (721.9 kg x ~11 km/s / 1.898e27 kg); ~13 cm drift per trillion years | n/a | computed | verified (order of magnitude)
- BepiColombo: launched 20 Oct 2018; 9 flybys (Earth 1, Venus 2, Mercury 6); ESA: entering orbit around Mercury needs more energy than going to Pluto | n/a | ESA BepiColombo factsheet, https://www.esa.int/Science_Exploration/Space_Science/BepiColombo/BepiColombo_factsheet | verified

## Planet Nine
- Lowell predicted Planet X (1915 memoir); Tombaugh found Pluto 18 Feb 1930; Pluto's mass ~0.002 Earth masses vs Lowell's required 7 | n/a | MacTutor Neptune_and_Pluto | verified
- Sedna: discovered 14 Nov 2003 (Brown, Trujillo, Rabinowitz, Palomar); q = 76.2 au, a = 544 au | n/a | JPL SBDB | verified
- 2012 VP113: q = 80.6 au; Trujillo & Sheppard 2014 noted clustering of arguments of perihelion | 2014 | Nature 507, 471-474, https://doi.org/10.1038/nature13156 ; JPL SBDB | verified (metadata; clustering statement via Batygin & Brown abstract)
- Batygin & Brown (20 Jan 2016): orbits cluster in physical space, 0.007% chance; planet > ~10 Earth masses, perihelion 180 deg from the objects' | 2016 | AJ 151, 22, arXiv:1601.05438 | verified
- 2019 review: m ~5-10 Earth masses, a ~400-800 au, e 0.2-0.5, i 15-25 deg | 2019 | Batygin et al., Phys. Rep. 805, 1-53, arXiv:1902.10103 | verified
- Brown & Batygin (2021): clustering significant at 99.6%; m = 6.2 (+2.2/-1.3) Earth masses, a = 380 (+140/-80) au, i = 16 +/- 5 deg, q = 300 au; closer and brighter than expected | 2021 | AJ 162, 219, arXiv:2108.09868 | verified
- Napier et al. (2021): 14 ETNOs from DES, OSSOS and Sheppard-Trujillo, consistent with uniform distribution (17-94%); no evidence for clustering | 2021 | PSJ 2, 59, arXiv:2102.05601 | verified
- Brown, Holman & Batygin (2024): Pan-STARRS1 rules out P9 to V = 21.5; with ZTF and DES rules out 78% of parameter space; remainder mostly V > 21 near the northern galactic plane crossing | 2024 | arXiv:2401.17977 | verified
- Siraj, Chyba & Tremaine: ~3 sigma clustering for a > 170 au in longitude of perihelion; best fit 4.4 +/- 1.1 Earth masses, a = 290 +/- 30 au, i = 6.8 deg | 2024-25 | arXiv:2410.18170 | verified
- Chen et al. (2025): 2023 KQ14 "Ammonite", q = 66 au, a = 252 au, i = 11 deg, orbit does not align with other sednoids; favours a distant planet (~500 au) if any | 2025 | Nature Astronomy, arXiv:2508.02162, https://doi.org/10.1038/s41550-025-02595-7 | verified
- Phan et al. (2025): IRAS/AKARI search, candidate pairs, none confirmed | 2025 | PASA 42, e064, arXiv:2504.17288 | verified (abstract)
- Socas-Navarro & Trujillo (2026): targeted parallax search, no candidates to r ~21.3 | 2026 | OJAp 9, arXiv:2504.05473 | verified
- Planet Nine still undetected as of September 2026 | n/a | Wikipedia Planet Nine (fetched 25 Sep 2026) describes it as hypothetical; no announcement found on Rubin news pages | uncertain (absence of evidence)

## Future work (status 25 Sep 2026)
- Rubin Observatory first images released 23 June 2025 | 2025 | Rubin, https://rubinobservatory.org/gallery/image-releases/rubin-first-look | verified
- LSST started in late June 2026, 10 years | 2026 | Rubin, https://rubinobservatory.org/for-scientists/rubin-101/the-legacy-survey-of-space-and-time-lsst (updated 22 Jul 2026); https://rubinobservatory.org/explore/how-rubin-works/lsst | verified (brief said 2025; corrected)
- 8.4 m mirror, 3.2-gigapixel camera, ~10 million alerts per night, ~6 million Solar System orbits expected by DR11; ~800 visits per field; single-visit depth r ~24.5 | n/a | Rubin key numbers page; Ivezic et al., ApJ 873, 111 (2019), arXiv:0805.2366 | verified
- BepiColombo MTM separation 3 Sep 2026 (15:49 CEST confirmation); Mercury orbit entry 21 Nov 2026; MPO/Mio separation 9-10 Dec 2026; science April 2027 | 2026-27 | ESA, https://www.esa.int/Science_Exploration/Space_Science/BepiColombo/Latest_updates_BepiColombo_s_arrival_at_Mercury ; ESA operations news | verified
- BepiColombo MORE radio science experiment to test general relativity | n/a | ESA factsheet (MORE); Milani et al., PRD 66, 082001 (2002), https://doi.org/10.1103/PhysRevD.66.082001 | verified
- Apophis passes ~32,000 km from Earth's surface on 13 April 2029; discovered 19 June 2004; OSIRIS-APEX to study it (June 2029 listed); OSIRIS-APEX Earth flyby 23 Sep 2025 | 2029 | NASA Science Apophis and OSIRIS-APEX pages | verified
- Halley perihelion 28 July 2061 | 2061 | JPL Horizons | verified (computed)

## Videos (checked via YouTube oEmbed and watch page, 25 Sep 2026)
- xdIjYBtnvZU, minutephysics, "Feynman's Lost Lecture (ft. 3Blue1Brown)", 21:43 | verified
- fDek6cYijxI, Veritasium, "Chaos: The Science of the Butterfly Effect", 12:51 | verified
- Am7EwmxBAW8, NASA STI Program, "Space Flight: The Application of Orbital Mechanics", 36:04 (1989 primer) | verified
- cypN_4NUD3w, Ecole polytechnique, "Episode 5 - Urbain Le Verrier", 4:27 | verified
- 6poHQ2h00ZA, caltech, "Evidence of a Ninth Planet", 2:58 | verified
- v-ktWBtt7sc, Mike Brown, "Lecture 3.20: Planet Nine", 20:35 | verified
- MptrypvBTag, TEDx Talks, "The Search for Planet 9 | Dr. Renu Malhotra | TEDxPortland", 14:52 | verified
- xGfv3Oay_pY, PBS Space Time, "Planet X Discovered?? + Challenge Winners!", 8:37 | verified
- 5TUQRJLfNzs, Scott Manley, "Millions of New Asteroids - How The Vera Rubin Telescope Changes Everything", 20:58 | verified
- Zw5MDh_wpnI, Caltech Astro, "Planet Nine from Outer Space - Mike Brown - 03/15/2019", 1:49:43 | verified
- oC7lQngNG3o, European Space Agency, "BepiColombo's Mercury arrival begins (Official ESA broadcast)", 2:25:40 | verified
