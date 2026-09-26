# Fact file: nothing-outruns-light

Format: claim | value | source | status. Numbers marked "computed" were recomputed in node (scratch scripts) with c = 299,792,458 m/s, g = 9.80665 m/s², Julian year = 365.25 d, 1 ly = 9.4607e15 m, proton rest energy 938.272 MeV.

## Opening: OPERA, 2011

- OPERA seminar "New results from OPERA on neutrino properties", speaker Dario Autiero (IPN Lyon), Main Auditorium, CERN | Fri 23 September 2011, 16:00-18:00 Geneva time | https://indico.cern.ch/event/155620/ | verified
- Seminar webcast live; CERN press release same day; over 15,000 events; 730 km baseline; distance known to 20 cm, time to under 10 ns | 23 Sept 2011 | https://home.cern/opera-experiment-reports-anomaly-in-flight-time-of-neutrinos-from-cern-to-gran-sasso/ | verified
- Ereditato: "we have not found any instrumental effect that could explain the result"; Bertolucci: "we need to be sure that there are no other, more mundane, explanations" | quotes | CERN press release (above) | verified
- v1 result: early arrival (60.7 ± 6.9 stat ± 7.4 sys) ns; (v-c)/c = (2.48 ± 0.28 ± 0.30) x 10^-5 | 60.7 ns | https://arxiv.org/abs/1109.4897v1 | verified
- 60.7 ns x c = 18.2 m; light time over 730 km = 2.435 ms; 60.7 ns / 2.435 ms = 2.49e-5 | computed | node | verified
- Cohen and Glashow: superluminal neutrinos (7.5 km/s or 25 ppm above c) would lose energy by e+e- pair emission; submitted 29 Sept 2011 | PRL 107, 181803 | https://arxiv.org/abs/1109.6562 ; https://doi.org/10.1103/PhysRevLett.107.181803 | verified

## Galileo and Newton

- Galileo discussed experiments below decks on a uniformly moving ship (Dialogue, 1632) | 1632 | https://galileoandeinstein.phys.virginia.edu/lectures/spec_rel.html (Fowler, UVA) | verified (year from the Dialogue's standard publication date)
- Footnote source for the ship passage | corrected: old footnote pointed to Fowler's page, which mentions gnats, fish and dripping bottles but not butterflies or the Dialogue -> new footnote cites the Drake translation (Univ. of California Press, 1953), pp. 186-187, plus the Italian original ("Riserratevi con qualche amico ... mosche, farfalle") | https://it.wikisource.org/wiki/Dialogo_sopra_i_due_massimi_sistemi_del_mondo_tolemaico_e_copernicano/Giornata_seconda ; page numbers from https://en.wikipedia.org/w/index.php?title=Galileo%27s_ship&action=raw | corrected (footnote only)
- Salviati's ship passage (Drake translation): flies, butterflies, a bowl of fish, a bottle emptying drop by drop into a vessel beneath; drops fall into the vessel, butterflies fly indifferently to every side | text | Drake translation as quoted at https://en.wikipedia.org/w/index.php?title=Galileo%27s_ship&action=raw (used only to check the wording) | verified
- Newton, Principia Scholium: absolute time "flows equably without relation to anything external" | 1687; Motte translation 1729 | https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Definitions | verified
- Train 30 m/s + ball 20 m/s: relativistic sum falls short of 50 m/s by 3.3e-13 m/s; uv/c^2 = 6.7e-15 | computed | node | verified

## Weber, Kohlrausch, Maxwell

- Weber and Kohlrausch measured the ratio of electromagnetic to electrostatic units of charge (a speed) in 1855, published 1856-57 | c about 3.1e8 m/s | Assis 2003, https://www.ifi.unicamp.br/~assis/Weber-Kohlrausch(2003).pdf | verified
- Maxwell, Phil. Mag. 23, 12-24 (1862), Part III of "On Physical Lines of Force": V from Kohlrausch and Weber = 310,740,000,000 mm/s = 193,088 mi/s; Fizeau's light speed = 314,858,000,000 mm/s = 195,647 mi/s; "we can scarcely avoid the inference that light consists in the transverse undulations of the same medium..." | 310,740 km/s vs 314,858 km/s | https://en.wikisource.org/wiki/On_Physical_Lines_of_Force ; https://doi.org/10.1080/14786446208643207 | verified
- Maxwell to Faraday, 19 Oct 1861, from 8 Palace Gardens Terrace, Kensington: "I worked out the formulae in the country, before seeing Webers number, which is in millimetres" | letter | https://epsilon.ac.uk/view/faraday/letters/Faraday4081 | verified
- Which Fizeau figure Maxwell compared in the letter | corrected: old text said he compared Weber's number with Fizeau's 314,858 km/s in the October letter and they agreed to about 1% -> in the letter he compared 193,088 mi/s with 193,118 mi/s (a conversion of Fizeau's result from Galbraith and Haughton's Manual of Astronomy; agreement 0.02%); only the printed paper (Phil. Mag. 23, p. 22, footnote) gives Fizeau's own 70,843 leagues/s = 314,858,000,000 mm/s = 195,647 mi/s, agreement 1.3% | https://epsilon.ac.uk/view/faraday/letters/Faraday4081 ; https://en.wikisource.org/w/index.php?title=Page:Philosophical_magazine_23_series_4.djvu/38&action=raw | corrected
- 310,740/314,858 = 0.9869 (1.3% apart); 193,088/193,118 = 0.99984 | computed | node | verified
- Maxwell's family home was Glenlair, Kirkcudbrightshire; King's College London chair from 1860; died 5 Nov 1879 in Cambridge | dates | https://mathshistory.st-andrews.ac.uk/Biographies/Maxwell/ | verified
- Maxwell, "A Dynamical Theory of the Electromagnetic Field", Phil. Trans. 155, 459-512 (1865) | 1865 | https://doi.org/10.1098/rstl.1865.0008 | verified
- CODATA: mu0 = 1.25663706127e-6 N A^-2; eps0 = 8.8541878188e-12 F/m; c = 299,792,458 m/s exact | values | https://physics.nist.gov/cgi-bin/cuu/Value?mu0 ; ?ep0 ; ?c | verified
- 1/sqrt(mu0 eps0) = 299,792,458 m/s; mu0*eps0 = 1.1127e-17 s^2/m^2 | computed | node | verified
- "Nothing about light went into the sum" | corrected: NIST gives eps0 = 1/(mu0 c^2), so today's official values already contain c -> "Nothing about light need go into the sum: today's official values are tied together through c, but Weber and Kohlrausch got their ratio from charged jars and magnetised needles" | https://physics.nist.gov/cgi-bin/cuu/Value?eqep0 | corrected
- Weber and Kohlrausch: charge of a small Leyden jar measured electrostatically (torsion balance), then discharged through a multiplier (coil) deflecting a magnetic needle | | Assis 2003 (translation of Weber & Kohlrausch 1856), https://www.ifi.unicamp.br/~assis/Weber-Kohlrausch(2003).pdf | verified
- 17th CGPM (1983) Resolution 1: metre = distance light travels in vacuum in 1/299,792,458 s | 1983 | https://www.bipm.org/en/committees/cg/cgpm/17-1983/resolution-1 | verified

## Michelson and Morley

- Maxwell's letter to D. P. Todd, 19 March 1879: in terrestrial measurements the effect depends on the square of v/c "and this is quite too small to be observed"; published 1880 (Proc. R. Soc. 30, 108-110; Nature 21, 314) after his death | quote | https://en.wikisource.org/wiki/Motion_of_the_Solar_System_through_the_Luminiferous_Ether ; https://doi.org/10.1098/rspl.1879.0093 | verified
- Michelson born 1852 in Strelno; graduated US Naval Academy 1873; built interferometer while in Berlin | biography | https://www.aps.org/apsnews/2007/11/november-1887-michelson-uminiferous-ether | verified
- First attempt April 1881 (Potsdam); error in the expected size pointed out by Potier (winter 1881) and analysed by Lorentz: effect only half that supposed | 1881 | Michelson & Morley 1887 text, https://en.wikisource.org/wiki/On_the_Relative_Motion_of_the_Earth_and_the_Luminiferous_Ether ; Potsdam from https://case.edu/ech/articles/m/michelson-morley-experiment | verified
- April 1881: MM 1887 and ECH do not give the month (ECH says "Potsdam in 1880-81"); Michelson's own 1881 paper says the apparatus moved from the Physical Institute, Berlin to the Astrophysikalisches Observatorium, Potsdam, and observations were made "early in April" | Am. J. Sci. 22, 120-129 (1881) | https://doi.org/10.2475/ajs.s3-22.128.120 ; https://en.wikisource.org/wiki/The_Relative_Motion_of_the_Earth_and_the_Luminiferous_Ether | verified; new footnote [^michelson1881] added
- Case Main building fire, night of 26-27 October 1886 | date | https://pressbooks.ulib.csuohio.edu/history-of-university-circle-in-cleveland/chapter/6-the-michelson-morley-experiment/ | verified
- Where the 1887 experiment was done | corrected: "the basement of a Western Reserve dormitory, Adelbert Hall" -> "the basement of Western Reserve's Adelbert Dormitory, later renamed Pierce Hall and demolished in 1962" (the CSU chapter calls it "Adelbert Hall" but says it stood about a hundred yards south of today's Adelbert Hall, which was then called Adelbert College; ECH names it Adelbert Dormitory, later Pierce Hall, demolished 1962) | https://case.edu/ech/articles/m/michelson-morley-experiment ; CSU pressbook | corrected
- Michelson at Case School of Applied Science from 1882; Morley (chemist) | | APS 2007 ("In 1882 Michelson took a position at the Case School of Applied Science") | verified
- Morley's institution | corrected: "Western Reserve College" -> "Western Reserve University" (ECH: "Western Reserve Univ."; the college moved to Cleveland in 1882 and was part of WRU by the time of the collaboration) | https://case.edu/ech/articles/m/michelson-morley-experiment | corrected
- Apparatus: stone about 1.5 m square, 0.3 m thick, on annular wooden float (1.5 m outer diameter) in mercury in a cast-iron trough; four mirrors per corner; path lengthened by repeated reflection to about 11 m (about ten times the 1881 path); argand burner light | numbers | MM 1887 (Wikisource) | verified
- Rotation one turn in six minutes; readings at sixteen marks; observations near noon and near 6 pm; 8, 9, 11, 12 July 1887 | dates | MM 1887; CSU pressbook | verified
- Expected displacement 0.4 fringe (D = 11 m = 2e7 wavelengths; 2D(v/c)^2 with (v/c)^2 = 1e-8); observed "certainly less than the twentieth part of this, and probably less than the fortieth part"; relative velocity "probably less than one sixth the earth's orbital velocity, and certainly less than one-fourth" | 0.4 fringe | MM 1887 | verified
- (v/c)^2 for 29.78 km/s = 9.87e-9; N = 0.395 fringe; one sixth of orbital speed = 4.96 km/s | computed | node | verified
- Aether-wind limit wording | corrected: "it was blowing at less than a sixth of the Earth's orbital speed" -> "it was probably blowing at less than a sixth ... and certainly at less than a quarter" (MM 1887: "probably less than one sixth ... and certainly less than one-fourth") | MM 1887 (Wikisource) | corrected
- "first American to win a Nobel Prize in science" (Roosevelt's 1906 Peace Prize makes "first American Nobel" wrong, so the "in science" qualifier is needed) | 1907 | APS 2007; prize motivation re-read from nobelprize.org page source | verified
- Nobel Prize 1907 to Michelson "for his optical precision instruments and the spectroscopic and metrological investigations carried out with their aid" | 1907 | https://www.nobelprize.org/prizes/physics/1907/summary/ | verified
- Needed contraction of an 11 m arm at 29.78 km/s: (gamma-1) x 11 m = 5.4e-8 m = 54 nm, about a tenth of a wavelength of yellow light | computed | node | verified

## FitzGerald, Lorentz, Poincare

- FitzGerald letter "The Ether and the Earth's Atmosphere", dated Dublin, May 2 [1889], Science 13, 390: length of material bodies changes by an amount depending on square of v/c | 1889 | https://en.wikisource.org/wiki/The_Ether_and_the_Earth%27s_Atmosphere ; https://doi.org/10.1126/science.ns-13.328.390.a | verified
- FitzGerald letter virtually unknown until Brush (1967); FitzGerald himself not sure it had appeared in print; Lorentz hit on the idea independently in 1892 | | Brown, Am. J. Phys. 69, 1044 (2001), https://arxiv.org/abs/gr-qc/0104032 ; Linda Hall Library page | verified
- Lorentz letter to Rayleigh, Aug 1892: "Can there be some point in the theory of Mr. Michelson's experiment which has yet been overlooked?" | quote | Brown 2001 (epigraph) | verified (secondary; not used as a quote in the article)
- Lorentz 1895 Versuch (Leiden, Brill) introduced "local time" t - vx/c^2 | 1895 | https://en.wikisource.org/wiki/Translation:Attempt_of_a_Theory_of_Electrical_and_Optical_Phenomena_in_Moving_Bodies | verified
- Lorentz 1904, "Electromagnetic phenomena in a system moving with any velocity smaller than that of light", Proc. KNAW 6, 809-831 | 1904 | https://dwc.knaw.nl/DL/publications/PU00014148.pdf ; https://en.wikisource.org/wiki/Electromagnetic_phenomena | verified
- Lorentz 1904 exactness | corrected: "the complete set of formulas ... that made the equations work exactly" -> "for any speed below that of light, though a few of his equations for moving charges still needed corrections that Poincare supplied the next year" (Poincare, June 1905: "These formulas differ somewhat from those which had been found by Lorentz") | https://en.wikisource.org/wiki/Translation:On_the_Dynamics_of_the_Electron_(June) | corrected
- Poincare 1904 (St. Louis lecture, in The Value of Science): "The most ingenious idea was that of local time"; clocks set by crossed optical signals read local time; principle of relativity | 1904 | https://en.wikisource.org/wiki/The_Foundations_of_Science/The_Value_of_Science/Chapter_8 ; MacTutor Special relativity | verified
- "local time is exactly what two moving observers would read" | corrected: dropped "exactly" (Poincare's argument works to first order in v/c) -> "local time is what two moving observers would read" | Value of Science ch. 8 | corrected
- Poincare, "Sur la dynamique de l'electron", C. R. Acad. Sci. 140, 1504-1508, session of 5 June 1905: "this inability to demonstrate absolute motion is a general law of nature"; transformations form a group; uses "Lorentz transformation" | 5 June 1905 | https://en.wikisource.org/wiki/Translation:On_the_Dynamics_of_the_Electron_(June) ; MacTutor | verified
- Long Poincare paper received 23 July 1905, Rend. Circ. Mat. Palermo 21, 129-175 (1906) | | https://doi.org/10.1007/BF03013466 | verified

## Einstein, 1905

- Einstein appointed technical expert class III at Swiss patent office, June 1902, CHF 3,500 a year; promoted class II on 1 April 1906 | dates | https://www.ige.ch/en/about-us/the-history-of-the-ipi/einstein/einstein-at-the-patent-office | verified
- Einstein born 14 March 1879 (so 26 in June 1905) | date | https://mathshistory.st-andrews.ac.uk/Biographies/Einstein/ | verified
- Chasing-light thought experiment, age sixteen (late 1895-early 1896, Aarau); frozen "electromagnetic field at rest though spatially oscillating" | | Norton, "Chasing the Light" (2013 preprint), https://sites.pitt.edu/~jdnorton/papers/Chasing.pdf | verified
- "Zur Elektrodynamik bewegter Korper", Ann. Phys. 17 (322), 891-921; received 30 June 1905; published 26 September 1905 | dates | https://doi.org/10.1002/andp.19053221004 ; Wiley/ADS records | verified
- Paper opens with magnet-and-conductor asymmetry; mentions "unsuccessful attempts to discover any motion of the earth relatively to the 'light medium'" without naming Michelson; two postulates; "luminiferous ether" "will prove to be superfluous"; thanks M. Besso; no reference list | text | https://www.fourmilab.ch/etexts/einstein/specrel/www/ (Perrett & Jeffery 1923 translation) | verified
- "It opens with a magnet and a coil of wire" | corrected: Einstein writes "a magnet and a conductor" -> "a magnet and a conductor, such as a coil of wire"; myth box "the magnet and the coil" -> "the magnet and the conductor" | Fourmilab translation | corrected
- Einstein 1905: Y and Z dimensions unaffected by motion; "For velocities greater than that of light our deliberations become meaningless"; c "plays the part, physically, of an infinitely great velocity"; kinetic energy W infinite at v = c | text | Fourmilab translation | verified
- Einstein to Mileva, 10 Sept 1899: idea for experiment on bodies' motion relative to the ether | 1899 | van Dongen 2009, https://arxiv.org/abs/0908.1545 | verified
- Einstein to F. G. Davenport, 9 Feb 1954: Michelson's result "has not had a considerable influence" on his development | 1954 | van Dongen 2009 (quoting Einstein Archive 17 199) | verified
- Chicago lecture 1921: Einstein referred to MM experiment and hinted at its influence | 1921 | van Dongen 2009 | verified
- What Einstein said in Chicago | corrected: "recalled thinking about it as a student" -> "recalled learning of it as a student" (transcript: "But when I was a student, I saw that experiments of this kind had already been made, in particular by your compatriot, Michelson") | van Dongen 2009, arXiv:0908.1545 full text | corrected
- 1954 letter wording: "In my own development Michelson's result has not had a considerable influence" (to F. G. Davenport, 9 Feb 1954); 1899 letter to Mileva of 10 Sept 1899 on "a way of investigating how the bodies' relative motion with respect to the luminiferous ether affects the velocity of propagation of light" | | van Dongen 2009 full text | verified
- Holton, "Einstein, Michelson, and the 'Crucial' Experiment", Isis 60, 133-197 (1969) | | https://doi.org/10.1086/350468 | verified
- "Ist die Tragheit eines Korpers von seinem Energieinhalt abhangig?", Ann. Phys. 18 (323), 639-641; dated 27 September 1905; "If a body gives off the energy L in the form of radiation, its mass diminishes by L/c^2"; "The mass of a body is a measure of its energy-content" | | https://doi.org/10.1002/andp.19053231314 ; https://www.fourmilab.ch/etexts/einstein/E_mc2/e_mc2.pdf | verified

## Light clock and gamma (computed)

- Mirrors 4 m apart: tick 13.34 ns at rest; at 0.6c light path 5 m, clock moves 3 m, tick 16.68 ns; ratio 1.25 | computed | node | verified
- gamma: 0.1c 1.00504; 0.5c 1.1547; 0.6c 1.25; 0.8c 1.6667; 0.9c 2.2942; 0.95c 3.2026; 0.99c 7.0888; 0.999c 22.366; 0.9999c 70.71 | computed | node | verified
- Earth's orbital speed 29.78 km/s: gamma - 1 = 4.93e-9 | computed | node | verified
- Saturn is 8.0-11.1 AU from Earth (66-92 light-minutes); at 0.9c home time 74-103 min, ship time 32-45 min (factor 1/2.294) | computed | node | verified (range depends on date)

## Minkowski

- "Raum und Zeit" lecture, 80th Assembly of German Natural Scientists and Physicians, Cologne, 21 September 1908; published 1909 | | https://en.wikisource.org/wiki/Translation:Space_and_Time | verified
- Perrett-Jeffery translation: "Henceforth space by itself, and time by itself, are doomed to fade away into mere shadows, and only a kind of union of the two will preserve an independent reality" | quote | The Principle of Relativity (Methuen, 1923); wording confirmed via search of reprints; Wikisource gives a different translation | verified (translation wording from secondary reprints)
- "His opening line has been quoted ever since" | corrected: the sentence is the third sentence of the opening paragraph (after "The views of space and time ... are radical") -> "A line from his opening paragraph has been quoted ever since" | https://en.wikisource.org/wiki/Translation:Space_and_Time (Saha translation: "Henceforth, space for itself, and time for itself shall completely reduce to a mere shadow...") | corrected
- Footnote [^minkowski1909] | corrected: now says the Wikisource link is a different (Saha-based) open translation, since the quoted Perrett-Jeffery wording is not on that page | Wikisource page | corrected (footnote only)
- Minkowski taught Einstein at ETH Zurich; died 12 January 1909 in Gottingen of a ruptured appendix, aged 44; Einstein "did not think much of" the 4D reformulation at first | | https://mathshistory.st-andrews.ac.uk/Biographies/Minkowski/ | verified
- 1 AU / c = 499.0 s (8 min 19 s) | computed | node | verified

## Velocity addition

- 0.9c + 0.9c = 1.8/1.81 = 0.994475c = 298,136 km/s (1,656 km/s short of c); 0.5c + 0.5c = 0.8c; 0.99c + 0.99c = 0.99995c | computed | node | verified
- Fizeau 1851: tubes 1.487 m long, 5.3 mm bore; water speed 7.069 m/s; double fringe displacement 0.46 (19 observations); full-drag prediction 0.92; Fresnel prediction 0.40; Comptes Rendus 29 Sept 1851 | numbers | https://en.wikisource.org/wiki/The_Hypotheses_Relating_to_the_Luminous_Aether | verified
- Relativistic addition for n = 1.333, v = 7.069 m/s: c/n = 224,900.6 km/s; light gains 3.09 m/s; Fresnel factor 1 - 1/n^2 = 0.437 | computed | node | verified
- von Laue 1907 derived Fresnel drag from relativistic velocity addition, Ann. Phys. 23 (328), 989-990 | 1907 | https://doi.org/10.1002/andp.19073281015 | verified
- Alvager, Farley, Kjellman, Wallin 1964 (CERN): gamma rays from pi0 decays with pion speed ~0.99975c move at c within 400 ppm | Phys. Lett. 12, 260 | https://doi.org/10.1016/0031-9163(64)91095-9 ; https://math.ucr.edu/home/baez/physics/Relativity/SR/experiments.html | verified

## Energy

- 1 kg: mc^2 = 8.988e16 J; KE (relativity vs Newton): 0.1c 4.53e14 vs 4.49e14; 0.5c 1.39e16 vs 1.12e16; 0.9c 1.16e17 vs 3.64e16; 0.99c 5.47e17 vs 4.40e16; 0.999c 1.92e18 vs 4.49e16; 0.9999c 6.27e18 vs 4.49e16 | computed | node | verified
- World total energy supply 2025 about 600 EJ (Energy Institute Statistical Review 2026, released 2 July 2026) | 600 EJ | https://dieselnet.com/news/2026/07energyreview.php | verified (secondary report of EI data; EI site blocked automated fetch)
- 1 kg given 600 EJ: gamma = 6,677; speed c - 3.36 m/s | computed | node | verified
- LHC Run 3 collision energy 13.6 TeV (6.8 TeV per beam); final proton collisions 16 May 2026; LS3 then HL-LHC around 2030 | | https://cerncourier.com/a/the-lhc-completes-its-third-run/ ; https://home.cern/cern-bids-farewell-to-the-lhc-and-enters-long-shutdown-3/ | verified
- 6.8 TeV proton: gamma = 7,247; c - v = 2.85 m/s (10.3 km/h) | computed | node | verified
- Fly's Eye (Dugway, Utah) cosmic ray of 320 ± 90 EeV (51 J), 7:34:16 on 15 October 1991 | | Bird et al., ApJ 441, 144 (1995), https://arxiv.org/abs/astro-ph/9410067 | verified
- If a proton: gamma = 3.4e11; 1 - beta = 4.3e-24; trails light by 4 mm after 100,000 ly; 51 J = baseball (145 g) at about 26.5 m/s (95 km/h) | computed | node | verified
- Bertozzi (MIT): electrons 0.5-15 MeV from Van de Graaff and linac; speed by time of flight, kinetic energy by calorimetry; limiting speed c; film "The Ultimate Speed" made 1962 | Am. J. Phys. 32, 551 (1964) | https://doi.org/10.1119/1.1970770 ; YouTube description of film | verified
- Bertozzi calorimetry scope | corrected: "stopped them in an aluminium target to measure their energy from the heat they left" (implies every run) -> "for some runs checked their energy from the heat they left in an aluminium target" (time of flight in all five runs at 0.5, 1, 1.5, 4.5, 15 MeV; energy otherwise from the accelerating fields, with calorimetry on "some electrons") | https://en.wikipedia.org/w/index.php?title=Tests_of_relativistic_energy_and_momentum&action=raw (AJP abstract page blocked, 403) | corrected
- Rainville et al. 2005 (MIT, NIST, ILL): E = mc^2 holds to within 4 parts in 10 million (0.00004%), 55 times better than before | Nature 438, 1096 | https://www.nist.gov/news-events/news/2005/12/einstein-was-right-again-experiments-confirm-e-mc2 ; https://doi.org/10.1038/4381096a | verified
- Okun 1989: "In the modern language of relativity theory there is only one mass, the Newtonian mass m, which does not vary with velocity"; Einstein 1948 letter to Lincoln Barnett advising against relativistic mass | Physics Today 42(6), 31 | https://doi.org/10.1063/1.881171 | verified (Barnett letter via secondary reports of Okun's article)
- 1 g flight to Proxima (4.2465 ly): peak gamma 3.19, peak speed 0.9497c; ship time 3.54 yr; home time 5.87 yr | computed | node | verified

## Causality

- Einstein 1907 (Jahrbuch der Radioaktivitat und Elektronik 4, 411; p. 424): with W > c one can choose v so that T < 0; "a transfer mechanism whereby the achieved effect would precede the cause" | quote (translation) | Weinstein, https://arxiv.org/abs/1203.4954 | verified (translation as given by Weinstein)
- Benford, Book, Newcomb, "The Tachyonic Antitelephone", Phys. Rev. D 2, 263 (1970) | | https://doi.org/10.1103/PhysRevD.2.263 | verified
- Feinberg, "Possibility of Faster-Than-Light Particles", Phys. Rev. 159, 1089 (1967) | | https://doi.org/10.1103/PhysRev.159.1089 | verified
- Worked example: ship passes Earth at t = 0 moving away at 0.9c (gamma 2.294); Earth sends a 2c signal at t = 1 yr; ship receives at Earth-frame t = 1.818 yr, x = 1.636 ly; ship clock times: sent 2.294 yr, received 0.793 yr; reply at 2c in ship frame reaches Earth at Earth time 0.628 yr (0.37 yr before sending). Breakeven v = 2uc^2/(c^2+u^2) = 0.8c for u = 2c | computed | node | verified
- Cherenkov effect Nobel 1958 (Cherenkov, Frank, Tamm) "for the discovery and the interpretation of the Cherenkov effect" | | https://www.nobelprize.org/prizes/physics/1958/summary/ | verified
- Light speed in water c/1.333 = 224,900 km/s | computed | node | verified
- Davis & Lineweaver 2004: we observe galaxies that have always had recession velocities greater than c; not a violation of special relativity | PASA 21, 97 | https://arxiv.org/abs/astro-ph/0310808 ; https://doi.org/10.1071/AS03040 | verified
- Eberhard 1978: Bell-type correlations cannot be used for faster-than-light signalling | Nuovo Cimento B 46, 392 | https://doi.org/10.1007/BF02728628 | verified

## Modern tests

- Kennedy & Thorndike, Phys. Rev. 42, 400 (1932): unequal-arm interferometer, temperature held to 0.001 C, observations over seasons | | Roberts & Schleif FAQ | verified
- Ives & Stilwell, JOSA 28, 215 (1938): time dilation via Doppler shift of fast hydrogen ions | | Roberts & Schleif FAQ; sibling article | verified
- Brillet & Hall, PRL 42, 549 (1979): anisotropy of round-trip light speed below 3 parts in 10^15 | | Roberts & Schleif FAQ | verified
- Nagel et al. 2015: rotating cryogenic sapphire oscillators; orientation-dependent Delta nu/nu = (9.2 ± 10.7) x 10^-19 | Nat. Commun. 6, 8174 | https://arxiv.org/abs/1412.6954 ; https://doi.org/10.1038/ncomms9174 | verified
- MM 1887 sensitivity: shift < 0.01 fringe -> (v/c)^2 < 2.5e-10; comparison with 1e-18 gives a factor of order 1e8 | computed | node | verified (order of magnitude)
- Sanner et al. 2019: two Yb+ single-ion clocks agree at 1e-18; limits on electron Lorentz violation around 1e-21 | Nature 567, 204 | https://arxiv.org/abs/1809.10742 | verified
- Amelino-Camelia et al. 1998 proposed GRB timing tests of quantum gravity | Nature 393, 763 | https://doi.org/10.1038/31647 | verified
- GRB 090510: 10 May 2009, 00:22:59.97 UT; short burst, T90 = 2.1 s; z = 0.903; 31 GeV photon at T0 + 0.829 s; most conservative M_QG,1 > 1.19 M_Planck; Planck energy 1.22e19 GeV | | Abdo et al., Nature 462, 331 (2009), https://arxiv.org/abs/0908.1832 | verified
- NASA 28 Oct 2009: galaxy 7.3 billion light-years away; two photons with energies differing by a million times arrived 0.9 s apart; Peter Michelson (LAT PI, Stanford): "To one part in 100 million billion, these two photons traveled at the same speed. Einstein still rules." | | https://www.nasa.gov/universe/fermi-telescope-caps-first-year-with-glimpse-of-space-time | verified
- LHAASO, GRB 221009A (9 Oct 2022): E_QG,1 > 10 E_Pl; E_QG,2 > 6e-8 E_Pl | PRL 133, 071501 (2024) | https://arxiv.org/abs/2402.06009 | verified
- GW170817 / GRB 170817A: delay +1.74 ± 0.05 s; speed of gravity minus speed of light between -3e-15 and +7e-16 of c; conservative distance 26 Mpc; host NGC 4993 at 42.9 ± 3.2 Mpc (about 140 million ly) | ApJL 848, L13 (2017) | https://arxiv.org/abs/1710.05834 | verified
- OPERA final paper: December 2011 two-way measurement of 8.3 km fibre (GPS to Master Clock) gave delay 73.2 ns larger than 2006-07; by mid-February 2012 traced to an optical cable not properly connected, reducing light reaching the optical/electrical converter; Master Clock oscillator 0.124 ppm fast | | https://arxiv.org/abs/1109.4897v4 ; JHEP 10 (2012) 093 | verified
- OPERA final: delta t = (6.5 ± 7.4 stat +8.3 -8.0 sys) ns; (v-c)/c = (2.7 ± 3.1 +3.4 -3.3) x 10^-6 | | arXiv 1109.4897v4 | verified
- The cable delay led to an underestimate of the neutrino time of flight (neutrinos look early); the oscillator offset overestimated time stamps (pushes the other way, up to 74 ns depending on position in the DAQ cycle); OPERA-LVD horizontal cosmic muons showed a 73.2 ± 9 ns step around August 2008 and its disappearance in December 2011 | | arXiv 1109.4897v4, section 6.1 | verified
- Sixty Symbols videos feature Tony Padilla and Ed Copeland; the Feb 2012 video was filmed while "at Cern, in Geneva, when the story broke" | | YouTube descriptions of qJ0m13iJw0k and cezltcn9Mv0 | verified
- ICARUS measured with low-intensity bunched CNGS beam, consistent with c; arXiv v1 15 March 2012 | Phys. Lett. B 713, 17 | https://arxiv.org/abs/1203.3433 | verified
- 8 June 2012, Kyoto (Neutrino 2012): Bertolucci presented Borexino, ICARUS, LVD, OPERA all consistent with c | | https://www.sciencedaily.com/releases/2012/06/120608152339.htm | verified
- Ereditato resigned as OPERA spokesperson after 55% of the collaboration backed no confidence (67% needed for formal motion) | 30 March 2012 | https://physicsworld.com/a/spokesperson-for-the-opera-col/ | verified

## What comes next (status as of September 2026)

- CTAO: four Large-Sized Telescopes (23 m reflectors, ~45 m tall, ~100 t) at CTAO-North, La Palma, to be inaugurated 15 October 2026; LST-1 expected to be first accepted during 2027; CTAO ERIC established January 2025 | | https://www.ifae.es/news/2026/09/17/four-large-sized-telescopes-to-be-inaugurated-at-ctao-north-in-la-palma/ ; https://press.ifj.edu.pl/en/news/2025/01/10/ (not opened; ERIC date from search summary) | verified (ERIC date uncertain, not used)
- Who inaugurates the LSTs | corrected: "the Cherenkov Telescope Array Observatory will inaugurate four Large-Sized Telescopes" -> "the four Large-Sized Telescopes of the CTAO ... are due to be inaugurated" (IFAE: "the Large-Sized Telescope Collaboration will officially inaugurate the complete four-telescope LST array") | IFAE page (re-opened 25 Sep 2026) | corrected
- "Catching many bursts at tens to hundreds of GeV is the best route to testing a light speed that changes with the square of photon energy" | removed/softened: no source supports "best route", and the current quadratic limit comes from LHAASO's TeV photons, where a quadratic effect is largest -> "More bursts caught at high energies will sharpen the test..." | LHAASO abstract, https://arxiv.org/abs/2402.06009 (E_QG,2 > 6e-8 E_Pl, "exceptional TeV photon statistics") | corrected
- ACES on ISS: launched 21 April 2025 (CRS-32), installed on Columbus 25 April, switched on 28 April; 6-month commissioning then ~2-year science; 30 months total; aims include SME/Lorentz tests | | https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/ACES_Atomic_Clock_Ensemble_in_Space ; https://arxiv.org/abs/2411.02912 (abstract: "perform Standard Model Extension tests") | verified
- ACES results status | softened: "results had not been published as of September 2026" -> "no results from those tests had appeared as of September 2026"; arXiv API searches on 25 Sep 2026 ("Atomic Clock Ensemble in Space", "PHARAO", "ACES AND clock") found no ACES science results, only a simulation study posted 18 Sep 2026 | http://export.arxiv.org/api/query?search_query=all:%22Atomic%20Clock%20Ensemble%20in%20Space%22&sortBy=submittedDate | verified as far as checked (journal literature beyond arXiv not searched; web-search budget exhausted)
- LIGO-Virgo-KAGRA: O4 ended 18 Nov 2025; six-month run IR1 planned to begin early-to-mid November 2026; O5 timeline under discussion (page updated 3 Sept 2026) | | https://observing.docs.ligo.org/plan/ | verified (re-opened 25 Sep 2026)
- Who takes part in IR1 | corrected: "LIGO, Virgo and KAGRA plan a six-month run" -> "LIGO and Virgo, with KAGRA joining later, plan..." (page: both LIGO detectors observe, Virgo joins with possible interruptions, KAGRA joins later as available) | https://observing.docs.ligo.org/plan/ | corrected
- LISA adopted by ESA 25 January 2024; launch planned 2035 on Ariane 6; arms 2.5 million km | | https://www.esa.int/Science_Exploration/Space_Science/LISA/Capturing_the_ripples_of_spacetime_LISA_gets_go-ahead | verified
- Kostelecky & Russell, Data Tables for Lorentz and CPT Violation, latest arXiv version v19 (5 Feb 2026) | Rev. Mod. Phys. 83, 11 (2011) | https://arxiv.org/abs/0801.0287 | verified
- Colladay & Kostelecky SME papers: PRD 55, 6760 (1997); PRD 58, 116002 (1998) | | https://doi.org/10.1103/PhysRevD.58.116002 | verified

## Videos checked (title | channel | duration | published)

- https://www.youtube.com/watch?v=B0BOpiMQXQA | The Ultimate Speed - An Exploration with High Energy Electrons | Tom Jeff (upload of 1962 film) | 37:40 | 2014 | verified
- https://www.youtube.com/watch?v=Ip_jdcA8fcw | Episode 41: The Michelson morley Experiment - The Mechanical Universe | caltech | 29:02 | 2016 | verified
- https://www.youtube.com/watch?v=lZUrLq0LLIU | Episode 44: Energy, Momentum And Mass - The Mechanical Universe | caltech | 28:46 | 2016 | verified
- https://www.youtube.com/watch?v=msVuCEs8Ydo | The Speed of Light is NOT About Light | PBS Space Time | 12:46 | 2015 | verified
- https://www.youtube.com/watch?v=R5oCXHWEL9A | Relativistic Addition of Velocity, Special Relativity Ch. 6 | minutephysics | 5:06 | 2018 | verified
- https://www.youtube.com/watch?v=an0M-wcHw5A | Why Going Faster-Than-Light Leads to Time Paradoxes | Cool Worlds | 25:07 | 2022 | verified
- https://www.youtube.com/watch?v=A2JCoIGyGxc | Why can't you go faster than light? | Fermilab | 8:36 | 2017 | verified
- https://www.youtube.com/watch?v=BhG_QZl8WVY | How to travel faster than light | Fermilab | 10:59 | 2018 | verified
- https://www.youtube.com/watch?v=qJ0m13iJw0k | Neutrinos faster than light - Sixty Symbols | Sixty Symbols | 9:38 | 28 Sept 2011 | verified
- Sixty Symbols Sept 2011 blurb | corrected: "talking through the OPERA paper five days after the announcement" (filming date unknown) -> "in a video posted five days after the announcement" (publishDate 2011-09-28; seminar 23 Sept) | YouTube page metadata | corrected
- https://www.youtube.com/watch?v=cezltcn9Mv0 | Neutrinos slower than light - Sixty Symbols | Sixty Symbols | 9:14 | 29 Feb 2012 | verified
- https://www.youtube.com/watch?v=1Yk5LrJnuXw | TEDxSalford - Dario Autiero - The Neutrino Anomaly | TEDx Talks | 21:12 | 2012 | verified
- https://www.youtube.com/watch?v=pTn6Ewhb27k | Why No One Has Measured The Speed Of Light | Veritasium | 19:05 | 2020 | verified

## Adversarial fact-check pass (25 September 2026)

Every claim below was re-opened against the source named (not carried over from the earlier pass). Corrections are recorded inline in the sections above; this list covers re-verification of everything else.

- OPERA seminar: Indico gives Fri 23 Sept 2011, 16:00, Main Auditorium, speaker Dario Autiero (IPN Lyon); CERN release: webcast, "over 15,000" events, "many months of studies and cross checks", Bertolucci (Research Director) "more mundane, explanations" | https://indico.cern.ch/event/155620/ ; CERN release | verified
- OPERA v1 PDF: 730 km baseline; data from the 2009, 2010 and 2011 runs; 16,111 events; delta t = 60.7 ns; (v-c)/c = 2.48e-5 | https://arxiv.org/pdf/1109.4897v1 | verified
- OPERA v4 PDF section 6.1: December 2011 two-way measurement, 73.2 ns larger than 2006-07; investigations "until mid February 2012"; "optical cable not properly connected thus reducing the amount of light received by the optical/electrical converter of the Master Clock"; oscillator 0.124 ppm; OPERA-LVD muons show steps around August 2008 and December 2011; final (6.5 +- 7.4) ns, (v-c)/c = (2.7 +- 3.1) x 10^-6; 15,223 events | https://arxiv.org/pdf/1109.4897v4 | verified
- Cohen and Glashow v1 posted 29 Sept 2011 15:40 UTC; abstract: "exceeding that of light by about 7.5 km/s or 25 ppm"; e+e- bremsstrahlung would deplete the higher-energy neutrinos | https://arxiv.org/abs/1109.6562 | verified
- Physics World, 30 March 2012: Ereditato resigned; "55% of the collaboration" backed no confidence; 67% needed for a formal motion | https://physicsworld.com/a/spokesperson-for-the-opera-col/ | verified
- ScienceDaily/CERN, 8 June 2012: Bertolucci at Neutrino 2012, Kyoto; Borexino, ICARUS, LVD and OPERA "all measure a neutrino time of flight consistent with the speed of light" | https://www.sciencedaily.com/releases/2012/06/120608152339.htm | verified
- Newton, Motte 1729: "flows equably without relation to anything external" | Wikisource | verified
- Maxwell Part III, Phil. Mag. 23 (1862): E = 310,740,000,000 mm/s = 193,088 mi/s; Fizeau V = 314,858,000,000 mm/s = 195,647 mi/s; "we can scarcely avoid the inference" | Wikisource page scans 37-38 | verified
- Maxwell's letter to D. P. Todd, "Nautical Almanac Office, Washington", 19 March 1879; "quite too small to be observed"; Proc. R. Soc. 30, 108-110 (Crossref) | Wikisource; https://doi.org/10.1098/rspl.1879.0093 | verified
- Maxwell appointed to the King's College London chair in 1860 | MacTutor | verified
- MM 1887 re-read: Lorentz shows Stokes's conditions "incompatible"; Potier (winter 1881) and Lorentz: "one-half the value supposed"; stone 1.5 m square, 0.3 m thick; one turn in six minutes; sixteen marks; noon on July 8, 9, 11 and evening on July 8, 9, 12; about 11 m = 2e7 wavelengths; 0.4 fringe; less than 1/20, probably less than 1/40 | Wikisource | verified
- APS 2007: Michelson invented the interferometer while working in Berlin; Naval Academy appointment | APS News | verified
- Brown 2001: FitzGerald's letter "virtually unknown until the historian Steven G. Brush drew attention to it in 1967", and not even its author was sure it had appeared; Lorentz "independently hit on essentially the same idea in 1892" (the historian is Stephen G. Brush; Brown spells it Steven) | https://arxiv.org/abs/gr-qc/0104032 | verified
- Poincare, 5 June 1905 note: "this inability to demonstrate absolute motion is a general law of nature"; names the Lorentz transformation | Wikisource | verified
- IGE: technical expert class III from June 1902, CHF 3,500 a year | IGE page | verified
- Norton: chasing-light thought experiment "at the age of sixteen", late 1895 to early 1896 | https://sites.pitt.edu/~jdnorton/papers/Chasing.pdf | verified
- Einstein 1905 (Fourmilab): Y and Z dimensions "do not appear modified by the motion"; c "plays the part, physically, of an infinitely great velocity"; Besso acknowledgment | verified
- Einstein 1907 causality quote: Jahrbuch der Radioaktivitat 4 (1907), p. 424, as translated in Weinstein; Einstein adds that the result is not a logical contradiction but conflicts with all experience, which "seems sufficient to prove the impossibility of the assumption W > c" | https://arxiv.org/pdf/1203.4954 | verified
- MacTutor Minkowski: born 22 June 1864, died 12 January 1909 of a ruptured appendix aged 44; Einstein a student in his Zurich courses; Einstein "did not think much of" the 4D reformulation at first | verified
- Okun 1989 and the 19 June 1948 Einstein letter to Lincoln Barnett ("It is not good to introduce the concept of the mass M = m/sqrt(1 - v^2/c^2)...") | Wikipedia "Mass in special relativity" citing Okun 1989; Physics Today page confirms the article (PDF only) | verified (via secondary citation)
- Rainville et al. 2005 / NIST: E and mc^2 agree to 4 parts in 10 million (0.00004%); MIT, NIST, ILL; silicon and sulfur; Penning-trap masses and gamma-ray wavelengths after neutron capture | NIST release | verified
- Fly's Eye: 51 J (320 +- 90 EeV), "7:34:16 on October 15, 1991" | Bird et al. arXiv PDF | verified
- CERN Courier (23 July 2026): Run 3 at 13.6 TeV collisions (6.8 TeV per beam); last proton collisions 16 May 2026; last lead-lead 14 June 2026; beams off 27 June 2026; LS3 of about four years | https://cerncourier.com/a/the-lhc-completes-its-third-run/ | verified
- Energy Institute Statistical Review 2026 (75th edition, 2 July 2026): total energy supply "exceeded 600 EJ in 2025" | DieselNet | verified
- Roberts and Schleif FAQ: Alvager et al. pi0 at ~0.99975c, gamma speed c "with a resolution of 400 parts per million"; Brillet and Hall limit "3 parts in 10^15"; Kennedy and Thorndike temperature constant to 0.001 C, "observations during several seasons" | FAQ | verified
- Fizeau 1851 (Wikisource): tubes 1.487 m, bore 5.3 mm, water 7.069 m/s, double displacement 0.46, full drag 0.92, Fresnel 0.40, nineteen observations | verified
- Nagel et al. 2015 abstract: orientation-dependent delta nu/nu = (9.2 +- 10.7) x 10^-19 | arXiv API | verified
- Sanner et al. 2019 abstract: two Yb+ single-ion clocks agree at 1e-18 over "a half-year long comparison period"; nonparallel quantization axes; electron limits "in the range of 10^-21" | arXiv API | verified
- Abdo et al. 2009 PDF: T0 = 00:22:59.97 UT on 10 May 2009; T90 = 2.1 s; z = 0.903; 31 GeV photon at T0 + 0.829 s; most conservative M_QG,1/M_Planck > 1.19; "in most quantum gravity scenarios, M_QG,n <~ M_Planck" | https://arxiv.org/pdf/0908.1832 | verified
- NASA, 28 Oct 2009: galaxy 7.3 billion ly; Peter Michelson, principal investigator of the LAT at Stanford: "Einstein still rules." | NASA page | verified
- LHAASO abstract: E_QG,1 > 10 E_Pl (linear), E_QG,2 > 6e-8 E_Pl (quadratic) | https://arxiv.org/abs/2402.06009 | verified
- GW170817/GRB 170817A: delay (+1.74 +- 0.05) s; speed difference between -3e-15 and +7e-16 of c; LIGO and Virgo; Fermi GBM and INTEGRAL SPI-ACS; NGC 4993 at (42.9 +- 3.2) Mpc = 140 million ly | arXiv API and PDF | verified
- ESA LISA: adopted 25 January 2024; launch 2035 on Ariane 6; arms 2.5 million km | ESA page | verified
- Kostelecky and Russell data tables: v19 dated 5 Feb 2026 | arXiv listing | verified
- Davis and Lineweaver abstract: galaxies observed with recession velocities greater than c; no violation of special relativity | arXiv API | verified
- Numbers recomputed in node (scratch script C:/Users/tommy/AppData/Local/Temp/claude/fc-nol/calc.js): mu0*eps0; OPERA 18.2 m, 2.49e-5, 7.43 km/s; MM 0.395 fringe; 54 nm contraction; gamma table and ship-hour conversions; 30 km/s gives 18.0 microseconds per hour; 4 m and 5 m light-clock ticks; Saturn at 0.9c 74-103 min home, 32-45 min ship; 1 AU/c = 499.0 s; 0.9c + 0.9c = 298,136 km/s; ball-train deficit 3.3e-13 m/s; Fizeau gain 3.09 m/s; kinetic-energy table; 600 EJ gives gamma 6,677 and 3.36 m/s short; LHC gamma 7,247, 2.85 m/s (10.3 km/h); OMG proton gamma 3.41e11, 4.07 mm per 100,000 ly; 51 J baseball 95.5 km/h; causality example 2.294 / 0.793 / 0.628 yr (4.5 months early); 0.95c 1.98e17 J/kg; 1 g Proxima peak 0.9497c, 3.54 yr ship, 5.87 yr home; laser spot 301,900 km/s; MM vs 2015 ratio 2.5e8 | computed | verified
- All 31 DOIs in the article, plus the new Michelson 1881 DOI, resolve through the doi.org handle API; Crossref metadata checked for Maxwell 1862 (Phil. Mag. 23, 12-24), Maxwell 1880 (Proc. R. Soc. 30, 108-110), Alvager 1964 (Phys. Lett. 12, 260-262) and Michelson 1881 (title "The relative motion of the Earth and of the luminiferous ether", pp. 120-129) | verified
- YouTube durations re-read from page metadata (lengthSeconds 2260, 1742, 1726, 766, 306, 1507, 659, 578, 554, 1272, 1145 = 37:40, 29:02, 28:46, 12:46, 5:06, 25:07, 10:59, 9:38, 9:14, 21:12, 19:05); channels and titles match; Mechanical Universe ep. 41 blurb "the most brilliant failure in scientific history"; Fermilab video presented by Don Lincoln; Feb 2012 Sixty Symbols: "We happened to be at Cern, in Geneva, when the story broke", with Ed Copeland and Tony Padilla | verified
- Online and book links opened: Fowler's Michelson page (swimmer and river analogy); Buckley's physicsmatt post (spacetime diagrams, "Effect precedes cause"); Taylor and Wheeler free under CC BY 4.0; Gutenberg 5001 is Lawson's translation of Relativity; Norton's Einstein for Everyone; Fourmilab E=mc2 PDF; Mattingly LRR DOI | verified
