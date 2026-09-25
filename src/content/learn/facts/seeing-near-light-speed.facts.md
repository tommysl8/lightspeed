# Fact file: seeing-near-light-speed

Format: claim | value | source | status. Numbers marked "computed" were recomputed in node (scratch scripts), using c = 299,792,458 m/s, g = 9.80665 m/s², Julian year, T_sun = 5,772 K, T_CMB = 2.7255 K, Wien constant 2.897771955e-3 m K.

## History: Bradley, Doppler, Fizeau

- Molyneux and Bradley began observing gamma Draconis at Kew with a Graham zenith sector | December 1725 | https://www.royalobservatorygreenwich.org/articles.php?article=1065 ; Encyclopedia.com Bradley biography | verified
- Shift peaked in March and September, not June/December as parallax predicts | seasons | https://www.royalobservatorygreenwich.org/articles.php?article=1065 | verified
- Bradley's letter to Halley announcing aberration | Phil. Trans. 35, 637-661 (1729; issue dated 1727-28) | https://doi.org/10.1098/rstl.1727.0064 (Crossref metadata checked) | verified
- Bradley's inferred Sun-Earth light time | 8 min 12 s ("8' 12''") | quoted in Perth Observatory and Encyclopedia.com accounts of the 1729 letter; https://www.perthobservatory.com.au/space-and-astronomy/astronomical-speed-light-part-2 | verified (secondary quotation of a public-domain text)
- Modern Sun-Earth light time | 8 min 19 s | standard (499 s); also in the app's race-sunlight spec | verified
- Annual aberration from Earth's orbital speed 29.78 km/s | beta = 9.93e-5, 20.49 arcsec | computed | verified
- Parker Solar Probe top speed at 24 Dec 2024 perihelion | 430,000 mph = 192.2 km/s; beta 6.4e-4; aberration up to 2.2 arcmin | https://science.nasa.gov/science-research/heliophysics/nasas-parker-solar-probe-makes-history-with-closest-pass-to-sun/ (speed); aberration computed | verified
- Doppler read his paper to the Royal Bohemian Society of Sciences in Prague | 25 May 1842; five regular members present | Nolte, Physics Today 73(3), 30 (2020) https://doi.org/10.1063/PT.3.4429 | verified
- Doppler's paper title and subtitle includes "Versuch einer das Bradley'sche Aberrations-Theorem als integrirenden Theil in sich schliessenden allgemeineren Theorie" | Abh. Kön. Böhm. Ges. Wiss. (5) 2, 465-482 (1842/43) | https://archive.org/details/ueberdasfarbigel00doppuoft ; https://doi.org/10.5281/zenodo.5715929 | verified (title page OCR)
- Doppler calls Bradley's result "Bradley's scharfsinniges Aberrations-Theorem" and says the direction question is already settled by it | text of the 1842 paper | archive.org OCR of Studnicka 1903 reprint | verified
- Doppler wrongly thought stellar motion changes a star's overall colour | - | Nolte 2020 | verified
- Buys Ballot's train test with horn players between Utrecht and Maarssen; February attempt spoiled by hail and snow, repeated in June; half-tone higher approaching, lower receding | 1845 | Nolte 2020; Buys Ballot, Ann. Phys. 142, 321 (1845) https://doi.org/10.1002/andp.18451421102 | verified
- Fizeau's lecture to the Société Philomathique de Paris proposing spectral-line shifts | 29 December 1848 (published in full 1870) | Nolte 2020; MacTutor Fizeau biography | verified
- Huggins reported a shift in Sirius's lines | 1868 | Nolte 2020; Huggins, Phil. Trans. 158, 529 (1868) https://doi.org/10.1098/rstl.1868.0022 | verified
- Vogel, Potsdam, photographic radial velocities | 1887-1892 | Nolte 2020 | verified (not used in detail)

## Einstein, Ives-Stilwell, modern tests

- Einstein's 1905 paper has a section "Theory of Doppler's Principle and of Aberration" (section 7) giving the exact formulas | 1905 | Einstein, Ann. Phys. 17, 891 (1905) https://doi.org/10.1002/andp.19053221004 ; 1923 Perrett & Jeffery translation https://users.physics.ox.ac.uk/~rtaylor/teaching/specrel.pdf | verified
- Einstein 1905 (translation): a sphere "viewed from the stationary system" has the form of an ellipsoid; at v = c objects "shrivel up into plane figures" | section 4 | same translation | verified
- Einstein proposed canal rays as a test of time dilation via the Doppler shift | 1907 | Ann. Phys. 23, 197 (1907) https://doi.org/10.1002/andp.19073280613 | verified
- Ives and Stilwell, Bell Labs, hydrogen canal rays (H2+, H3+), accelerating voltages ~6,788-18,350 V, compared forward and backward shifted lines; midpoint shift = transverse (second-order) Doppler effect | 1938 | J. Opt. Soc. Am. 28, 215 (1938) https://doi.org/10.1364/JOSA.28.000215 ; details via Wikipedia summary pointing to the paper | verified (voltages uncertain, not used)
- Ives (1882-1953) was a staunch opponent of relativity; the experiment was financed by Bell Labs; Ives and Stilwell interpreted the result as confirming Ives's ether-based (Larmor-Lorentz) theory | - | Giuliani, arXiv:1502.05736 (2015), section 2.3 | verified
- Ives-Stilwell used a mirror to observe the beam moving towards and away at once; compared the mean of the shifted lines with the unshifted line | - | Wikipedia summary of the 1938 paper; Giuliani 2015 appendix | verified (secondary)
- H2+ at 18 kV moves at about 0.0044c; transverse effect ~ beta^2/2 ~ 1e-5 at most | computed | computed | verified
- Einstein's 1907 proposal came 31 years before the 1938 result | 1907 -> 1938 | computed | verified
- Botermann et al.: 7Li+ ions at beta = 0.338 in the ESR storage ring, GSI Darmstadt; time dilation confirmed to 2.3 parts per billion | 2014 | PRL 113, 120405 (2014) https://doi.org/10.1103/PhysRevLett.113.120405 ; arXiv:1409.7951 | verified

## Physics numbers (all computed)

- Forward hemisphere compressed into cone of half-angle arccos(beta) | 0.1c: 84.3 deg; 0.5c: 60.0; 0.9c: 25.8; 0.99c: 8.1; 0.999c: 2.6; 0.9999c: 0.81 | computed; matches src/content/reference.tsx | verified
- Fraction of the sky holding the forward half of the stars = (1 - beta)/2 | 0.5c: 25%; 0.9c: 5%; 0.99c: 0.5%; 0.999c: 0.05% | computed | verified
- Star at 90 deg seen at 0.9c | 25.84 deg | computed | verified
- Star at 60 deg seen at 0.5c | 36.87 deg | computed | verified
- Star seen square to the motion at 0.9c comes from 154.2 deg in the rest frame | computed | computed | verified
- Lorentz factor gamma | 0.5c: 1.155; 0.9c: 2.294; 0.99c: 7.089; 0.999c: 22.37 | computed | verified
- Doppler factor dead ahead sqrt((1+b)/(1-b)) | 0.5c: 1.732; 0.9c: 4.359; 0.99c: 14.11; 0.999c: 44.71 | computed | verified
- Dead astern (reciprocal) | 0.9c: 0.229; 0.99c: 0.0709 | computed | verified
- Seen at 90 deg in ship frame D = 1/gamma (transverse Doppler) | 0.9c: 0.436 | computed | verified
- Ring where colours are unchanged (D = 1) | 0.5c: 74.5 deg; 0.9c: 51.2; 0.99c: 29.8; 0.999c: 17.0 | computed | verified
- Blackbody at T seen with Doppler factor D is a blackbody at D*T | - | Rybicki & Lightman (1979) ch. 4; app code src/physics/dopplerColor.ts; Peebles & Wilkinson, Phys. Rev. 174, 2168 (1968) for the CMB case | verified
- Sun's nominal effective temperature | 5,772 K | IAU 2015 Resolution B3, Prsa et al. AJ 152, 41 (2016) https://doi.org/10.3847/0004-6256/152/2/41 | verified
- Sun seen ahead at 0.9c | 25,160 K, Wien peak 115 nm | computed | verified
- Sun seen behind at 0.9c | 1,324 K, Wien peak 2.19 um | computed | verified
- Sun's own Wien peak | 502 nm | computed | verified
- Sun ahead at 0.5c / 0.99c | 10,000 K / 81,400 K | computed | verified
- Bolometric flux of a point source for a moving observer scales as D^2; specific intensity integrated over frequency as D^4; solid angle as D^-2 | - | Rybicki & Lightman ch. 4; src/content/reference.tsx | verified
- At 0.9c ahead: D^2 = 19.0, D^4 = 361; behind: 1/19, 1/361 | computed | verified
- Visible-light (photopic-weighted) brightness of a Sun-like (5,772 K) point star dead ahead, relative to rest: peaks at about x2.9 near D = 2.9 (beta ~ 0.78), back to x1 at D ~ 18 (beta ~ 0.994), x0.44 at 0.999c | computed with a Gaussian fit to the CIE photopic curve | verified (approximate; depends on eye-response model)
- Same for a 3,000 K red dwarf: up to about x48 near D ~ 5.5 (beta ~ 0.94) | computed | verified (approximate)
- Stars hotter than about 20,000 K only get fainter in visible light when blueshifted (as point sources) | computed | verified (approximate)
- Sun-like star behind at 0.9c: visible brightness ~1e-5 of normal | computed | verified (approximate)
- Things dead ahead appear smaller by the factor D (so look farther away) | 0.9c: 4.4 times smaller | Kraus, Eur. J. Phys. 29, 1 (2008) arXiv:0708.3454 (houses ahead "move into the distance" on accelerating); computed | verified
- Terrell rotation angle for small objects seen at right angles: sin(phi) = beta | 0.8c: 53.13 deg; 0.9c: 64.2 deg; 0.999c: 87.4 deg | Hornof et al. 2025 appendix; computed | verified
- Apparent transverse speed beta_app = beta sin(theta)/(1 - beta cos(theta)); max = beta*gamma at cos(theta) = beta | 0.99c at 17 deg: 5.43c; 0.99c max 7.02c at 8.1 deg | computed | verified
- Minimum true speed for apparent 6.3c | 0.9876c (gamma 6.38) | computed | verified
- M87 jet viewing angle adopted in VLBA study | about 17 deg | Walker et al., ApJ 855, 128 (2018) https://doi.org/10.3847/1538-4357/aaafcc | verified

## Seeing is not measuring: Lampa, Terrell, Penrose, Vienna

- Gamow's Mr Tompkins in Wonderland (1940) showed visibly flattened fast objects; Gamow corrected it in 1961 | 1940; PNAS 47, 728 (1961) https://doi.org/10.1073/pnas.47.5.728 | Kraus 2008 (arXiv:0708.3454) | verified
- Anton Lampa, "Wie erscheint nach der Relativitätstheorie ein bewegter Stab einem ruhenden Beobachter?" | Z. Phys. 27, 138-148 (Dec 1924) | https://doi.org/10.1007/BF01328021 (Crossref) | verified
- Lampa's 1924 study "remained largely unnoticed" | - | Kraus 2008 | verified
- Lampa helped bring Einstein to the German University in Prague; born 1868 in Pest, died 1938 in Vienna; later ran adult education in Vienna | 1911 appointment | Kleinert, Hist. Sci. Technol. 54, 188 (2021) https://doi.org/10.70391/7e5.3-4.c ; de.wikipedia Lampa entry for dates | verified
- Penrose, "The apparent shape of a relativistically moving sphere", St John's College, Cambridge | Proc. Camb. Phil. Soc. 55, 137-139 (January 1959) | https://doi.org/10.1017/S0305004100033776 | verified
- Terrell, "Invisibility of the Lorentz contraction", Los Alamos Scientific Laboratory; received 22 June 1959, published 15 Nov 1959 | Phys. Rev. 116, 1041-1045 | https://doi.org/10.1103/PhysRev.116.1041 | verified
- Terrell: a sphere photographs with the same circular outline moving or not; Lorentz transformations act as conformal maps of the celestial sphere | - | APS abstract page | verified
- Weisskopf's Physics Today article popularised the result | Physics Today 13(9), 24 (1960) | https://doi.org/10.1063/1.3057105 | verified
- The "rotated vs sheared" debate (Mathews & Lakshmanan 1972, Sheldon 1988, Terrell 1989) | - | Kraus 2008 | verified
- Hornof, Helm, de Dios Rodriguez, Juffmann, Haslinger, Schattschneider (TU Wien, University of Vienna, Kunstuniversität Linz) | Commun. Phys. 8, 161 (1 May 2025); received 12 Sep 2024, accepted 11 Feb 2025; open access CC BY | https://doi.org/10.1038/s42005-025-02003-6 | verified
- Method: 1035 nm laser frequency-doubled to 517 nm, 1 ps pulses at 2 MHz; LaVision PicoStar HR12 gated camera, gate 300 ps; 32 exposures 400 ps apart = 6 cm depth slices; object moved x = z*v/c between series (4.8 cm for 0.8c) | - | arXiv:2409.04296 and published version | verified
- Objects: 1 m cube built as 1 x 1 x 0.6 m cuboid for 0.8c; 1 m sphere built almost flat for 0.999c | - | Hornof et al. 2025 | verified
- Apparent speed of light in the slow-motion films | 1.8 m/s ("less than 2 m/s") | Hornof et al. 2025 | verified
- Results: cube appears rotated about vertical axis; sphere stays round, its pole (pointing at the camera) appears at the rim; doubled edges from the spherical wavefront (artefact) | - | Hornof et al. 2025 | verified
- Idea came from the art-science collective SEEC Photography | Leonardo 54, 506 (2021) https://doi.org/10.1162/leon_a_01940 | Hornof et al. 2025 | verified
- Authors say extending the method to the "train" thought experiment appears feasible | - | Hornof et al. 2025 | verified
- TU Wien press release date | 2 May 2025 | https://www.tuwien.at/en/all-news/news/spezielle-relativitaetstheorie-sichtbar-gemacht | verified
- An addendum broadening the historical context was published | Commun. Phys. 9, 169 (2026) https://www.nature.com/articles/s42005-026-02637-0 | search-result metadata only | uncertain (content not read)
- Picosecond "light in flight" photography goes back to Duguay & Mattick | Appl. Opt. 10, 2162 (1971) https://doi.org/10.1364/AO.10.002162 | verified
- Femto-photography (MIT Media Lab) | ACM TOG 32, 44 (2013) https://doi.org/10.1145/2461912.2461928 ; TED talk July 2012 | verified

## Starbow

- Eugen Sänger's paper predicted dark regions ahead and behind with a rainbow ring between, assuming all stars emit one yellow colour | JBIS 18, 273-277 (1962); earlier German paper ZAMP 9, 591 (1958) https://doi.org/10.1007/BF02424777 | https://oikofuge.com/the-myth-of-the-starbow/ | verified (JBIS content via secondary source)
- Frederik Pohl's novella "The Gold at the Starbow's End" | 1972 | oikofuge.com | verified
- McKinley & Doherty (Oakland University) modelled real stars as blackbodies weighted by the eye's response and found no starbow | Am. J. Phys. 47, 309-316 (1979) https://doi.org/10.1119/1.11834 | abstract summary via search + oikofuge | verified

## Games and visualisation

- A Slower Speed of Light, MIT Game Lab; orbs lower the speed of light towards walking pace; effects: Doppler, searchlight, time dilation, Lorentz transformation, runtime effect; built with open-source OpenRelativity (Unity) | released November 2012 (Engadget 9 Nov 2012; trailer uploaded 26 Oct 2012) | http://gamelab.mit.edu/games/a-slower-speed-of-light/ ; https://www.engadget.com/2012-11-09-a-slower-speed-of-light-is-an-open-source-game-on-special-rela.html | verified
- Credits include Gerd Kortemeyer (product owner), Philip Tan, Ryan Cheu, Ebae Kim, Zach Sherin, Sonny Sidhu, Abe Stein | - | MIT Game Lab page | verified
- OpenRelativity paper | Am. J. Phys. 84, 369 (2016) https://doi.org/10.1119/1.4938057 | verified
- Real Time Relativity (ANU) | Am. J. Phys. 75, 791 (2007) https://doi.org/10.1119/1.2744048 | verified
- Kraus & Zahn, spacetimetravel.org (Tübingen, later Hildesheim) first-person visualisations | 2002 onwards | https://www.spacetimetravel.org ; Kraus 2008 | verified

## Nature's relativistic sources

- Rees predicted apparent faster-than-light expansion of relativistically moving radio sources | Nature 211, 468 (1966) https://doi.org/10.1038/211468a0 | verified
- Rees was then a Cambridge research student (PhD 1967) | 1966 | general biographical record; not checked against a primary source in this session | uncertain
- Jets look one-sided because the approaching jet is Doppler boosted and the receding one de-boosted | - | Rybicki & Lightman ch. 4; Walker et al. 2018 (counter-jet/jet intensity ratios) | verified
- Goldstone-Haystack VLBI showed 3C 279 components separating at about ten times the speed of light | Science 173, 225 (1971) https://doi.org/10.1126/science.173.3993.225 (abstract via Crossref) | verified
- HST (Faint Object Camera, 1994-1998) found superluminal features in the M87 jet, most at 4c-6c; HST-1 emits features at 6c | ApJ 520, 621 (1999) https://doi.org/10.1086/307499 | verified
- Chandra: M87 X-ray knots at 6.3c (HST-1) and 2.4c (knot D); M87 about 55 million light-years away | Snios et al. ApJ 879, 8 (2019) https://doi.org/10.3847/1538-4357/ab2119 ; Chandra release 6 Jan 2020 https://chandra.si.edu/press/20_releases/press_010620.html | verified
- EHT 2019: brightness asymmetry of the M87* ring explained by relativistic beaming of plasma rotating near light speed | ApJL 875, L1 (2019) https://doi.org/10.3847/2041-8213/ab0ec7 | verified
- Our motion relative to the CMB | 369.82 +/- 0.11 km/s; dipole 3,362.08 uK; v/c = 1.23357e-3 | Planck 2018 I, A&A 641, A1 (2020) https://doi.org/10.1051/0004-6361/201833880 (checked in arXiv:1807.06205 text) | verified
- Planck detected aberration and Doppler modulation of CMB small-scale fluctuations: 384 +/- 78 (stat) +/- 115 (syst) km/s, "Eppur si muove" | A&A 571, A27 (2014) https://doi.org/10.1051/0004-6361/201321556 ; arXiv:1303.5087 | verified
- CMB temperature | 2.72548 +/- 0.00057 K | Fixsen, ApJ 707, 916 (2009) https://doi.org/10.1088/0004-637X/707/2/916 | verified
- CMB Wien peak | 1.06 mm | computed | verified
- CMB energy density | 0.26 eV per cubic centimetre (4.2e-14 J/m^3) | computed | verified
- Draper point: solids begin to glow visibly (dull red) | 977 F = 525 C = 798 K (1847) | Draper, Phil. Mag. 30, 345 (1847) https://doi.org/10.1080/14786444708647190 ; Zenodo 2443505 | verified
- CMB ahead at 0.9c / 0.99c / 0.999c / 0.9999c | 11.9 K / 38 K / 122 K / 385 K | computed | verified
- CMB ahead reaches 798 K | D = 293, gamma = 146, beta = 0.999977; 5.5 years ship time at 1 g from rest; ~141 ly travelled | computed | verified
- CMB ahead reaches 5,772 K (Sun-coloured) | D = 2,118, gamma = 1,059; 7.4 ship years at 1 g; ~1,025 ly | computed | verified
- Angular radius where the CMB's colour temperature has halved ~ 1/gamma radians | 0.39 deg at gamma 146; 0.054 deg at gamma 1,059 | computed | verified
- Power on a forward-facing square metre from the CMB | 0.36 W at gamma 146; 18.7 W at gamma 1,059 (sunlight at Saturn ~15 W) | computed (numerical integral = u c gamma^2 (1 + beta^2/3)) | verified
- Peak CMB temperature ahead on 1 g flip-and-burn flights | Proxima: 17 K (gamma 3.19); galactic centre (26,670 ly): ~75,000 K (gamma ~13,800); Andromeda (2.5 Mly): ~7 million K (gamma ~1.3 million) | computed | verified
- 1 g flip-and-burn ship times | Proxima 3.54 yr; galactic centre 19.8 yr; Andromeda 28.6 yr | computed; matches project brief | verified

## What comes next

- EHT two-month campaign on M87* aimed at the first time-resolved image sequence (movie) | began March 2026 (March-April) | Keuper & Moscibrodzka, arXiv:2609.11609 (Sept 2026) | verified; results date uncertain
- First EHT image: observed April 2017, published 10 April 2019 | two years | EHT Paper I, ApJL 875, L1 | verified
- "2028 would not be a surprise" for movie results | - | inference from the 2017->2019 precedent, stated as such | uncertain
- 5 sigma one-sided corresponds to about 1 chance in 3.5 million | p = 2.9e-7 | computed | verified
- ngEHT: roughly 10 new dishes to allow black-hole movies; no fixed date | - | https://www.ngeht.org/about | verified (timeline uncertain)
- BHEX space-VLBI mission concept; to be proposed as a NASA Small Explorer; team targets 2031 launch | - | https://bhex.cfa.harvard.edu (says proposal 2025); search snippet of CfA page (mid-2026) | uncertain (proposal date and selection status)
- Ellis & Baldwin test: aberration + Doppler boosting of distant sources should give a number-count dipole matching the CMB dipole | MNRAS 206, 377 (1984) https://doi.org/10.1093/mnras/206.2.377 | verified
- Secrest et al.: 1.36 million WISE quasars, dipole over twice expected, 4.9 sigma | ApJL 908, L51 (2021) https://doi.org/10.3847/2041-8213/abdd40 ; arXiv:2009.14826 | verified
- Colloquium: the cosmic dipole anomaly exceeds 5 sigma | Rev. Mod. Phys. 97, 041001 (11 Dec 2025) https://doi.org/10.1103/9ygx-z2yq ; arXiv:2505.23526 | verified
- Reanalysis including clustering dipole: CatWISE anomaly reduced to about 3.3-3.6 sigma | arXiv:2511.00822 (Bashir, Chingangbam, Appleby; revised Apr 2026) | verified
- Rubin Observatory began the ten-year LSST | end of June 2026 (29 or 30 June; sources differ) | https://rubinobservatory.org/news/action-rubin-lsst-begins ; UW News 30 June 2026 | verified (exact day uncertain)
- Euclid DR1-Foundation (about 1,900 square degrees) | November 2026; full DR1 mid-2027 | https://www.cosmos.esa.int/web/euclid/dr1-timeline | verified
- SKA-Mid first fringes | 7 January 2026; science verification planned to begin in 2027 (with SKA-Low) | https://www.skao.int/en/news/693/ska-mid-milestone | verified
- Fastest spacecraft ever: Parker Solar Probe, 0.064% of c | 2024 | NASA (above) | verified

## Videos (checked via YouTube oEmbed and watch page, 25 Sep 2026)

- uu7jA8EHi_0 | "A Slower Speed of Light Official Trailer — MIT Game Lab", channel teamspectrip, 2:54 | verified
- vFNgd3pitAI | "What would we see at the speed of light?", ScienceClic English, 15:01 | verified
- QMuUDEK1c8A | "Relativistic Aberration Pt.1: Delayed perception", Imagining Physics by Anssi Kuha, 7:00 | verified
- m3SCm2L823c | "Relativistic Aberration Pt.2: Beaming Effect", Imagining Physics by Anssi Kuha, 8:53 | verified
- IsEDigUHsOQ | "Superluminal Speeds (faster than light) - Sixty Symbols", Mike Merrifield, 8:25 | verified
- zUyH3XhpLTo | "How to Understand What Black Holes Look Like", Veritasium, 9:18, uploaded 9 April 2019 (EHT image released 10 April 2019); description cites Luminet 1979 | verified

## Books

- Bondi, Relativity and Common Sense: first published 1964, Dover edition 1980, builds relativity on the Doppler factor k | publisher of 1964 edition (Doubleday/Anchor) from memory | uncertain (publisher only)
- Taylor & Wheeler, Spacetime Physics 2nd ed., W. H. Freeman 1992, free PDF at https://www.eftaylor.com/spacetimephysics/ | verified
- Rindler, Relativity: Special, General, and Cosmological, 2nd ed., OUP 2006 | cited in src/content/reference.tsx | verified
- Rybicki & Lightman, Radiative Processes in Astrophysics, Wiley 1979 (Crossref lists the Wiley-VCH reissue, DOI 10.1002/9783527618170) | verified
- Gamow, Mr Tompkins in Wonderland, CUP 1940; reprinted in Mr Tompkins in Paperback 1993 | Kraus 2008 reference list | verified
- Y_9vd4HWlVA | "Imaging at a trillion frames per second", Ramesh Raskar, TED, 11:02 | verified
