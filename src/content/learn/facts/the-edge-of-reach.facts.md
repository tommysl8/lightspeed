# Fact file: the-edge-of-reach

One line per fact: claim | value | source | status. "computed" means recomputed in node for this article (scratch scripts cosmo.js, rocket.js, more.js, fb.js, photon.js, cpl.js) from flat LCDM with Planck 2018 (TT,TE,EE+lowE+lensing+BAO): H0 = 67.66 km/s/Mpc, Omega_m = 0.3111, Omega_r h^2 = 4.15e-5 (photons + 3.046 neutrino species, so Omega_r = 9.07e-5), Omega_Lambda = 1 - Omega_m - Omega_r = 0.6888; 1 Mpc = 3.261564 million ly; Simpson integration in ln a. Rocket: proper acceleration g = 9.80665 m/s^2 (c/g = 0.9687 yr); equations d(gamma*beta)/dt = +/- g/c - H(t) gamma*beta, d(chi)/dt = beta c / a, d(tau)/dt = 1/gamma, integrated with RK4 in ship time. All web sources opened on 25-26 September 2026 unless stated.

## Cosmological parameters and horizons (computed)
- Planck 2018 base-LCDM parameters (TT,TE,EE+lowE+lensing+BAO): H0 = 67.66 +/- 0.42, Omega_m = 0.3111, Omega_Lambda = 0.6889 | 2018/2020 | Planck Collaboration, A&A 641, A6 (2020), https://doi.org/10.1051/0004-6361/201833910 (Crossref checked; values as used in sibling rockets-to-the-stars fact file, PDF table checked there) | verified
- Age of the universe | 13.79 Gyr | computed | computed
- Hubble time 1/H0 and Hubble radius c/H0 | 14.45 Gyr; 14.45 Gly (4,431 Mpc) | computed | computed
- H0 in handy units | 20.74 km/s per million ly; 2.193e-18 per second | computed | computed
- Particle horizon (radius of observable universe, comoving) | 46.19 Gly (14.16 Gpc) | computed | computed
- Cosmic event horizon today (comoving = proper distance today) | 16.58 Gly (5.08 Gpc) | computed; sibling article gives 16.6 | computed
- Fraction of observable universe's volume inside event horizon | (16.58/46.19)^3 = 4.6%; so >95% of the volume is beyond reach | computed | computed
- Redshift of galaxies now on the event horizon | z = 1.85 | computed; Davis & Lineweaver 2004 give z ~ 1.8 for (0.3, 0.7) | computed
- Redshift beyond which recession speed now exceeds c (Hubble sphere today) | z = 1.48 | computed; Davis & Lineweaver give 1.46 | computed
- Redshift beyond which light we see was emitted while source receded faster than c | z = 1.59 | computed | computed
- Maximum proper distance of anything on our past light cone (the "teardrop") | 5.85 Gly, at z = 1.59, cosmic time 4.05 Gyr | computed | computed
- Light from JADES-GS-z14-0: emitted 2.22 Gly from us at t = 290 Myr, carried outward to 5.85 Gly by t = 4.05 Gyr, then approached | computed | computed
- Future: H tends to H0*sqrt(Omega_L) = 56.15 km/s/Mpc; e-folding time 17.41 Gyr; doubling time 12.07 Gyr; asymptotic Hubble/event radius 17.41 Gly | computed | computed
- Universe doubles in size (a = 2) at cosmic age 24.9 Gyr (11.1 Gyr from now); a = 4 at 36.8; a = 8 at 48.9; a = 16 at 60.9; a = 32 at 73.0 | computed | computed
- Light leaving now covers (comoving): 7.94 Gly by a = 2, then +4.30, +2.17, +1.09, +0.54 in successive doublings (ratios 0.54, 0.51, 0.50, 0.50); total 16.58 | computed | computed
- Light leaving now: 30.8% of its total reach by age 20 Gyr; 87.7% by 50 Gyr; 99.3% by 100 Gyr | computed | computed
- Comoving event horizon shrinks at c/a(t): today exactly 1 light-year (in today's comoving units) per year | computed (d chi_e/dt = -c/a) | computed
- Volume crossing out of reach per year today: 4 pi (16.58e9 ly)^2 x 1 ly = 3.45e21 ly^3 = ball 18.8 million ly across | computed | computed
- Round-trip limit for light (and for a 1 g ship, whose comoving lag is negligible): comoving 8.29 Gly, z = 0.69 | computed; Heyl 2005 got z = 0.65 one-way-and-back for his parameters | computed
- 1 g flip-and-burn to the round-trip limit: 45.1 yr ship time, arrives 11.8 Gyr from now | computed | computed
- Maximum comoving Hubble radius ever: 16.5 Gly at z = 0.64 (t = 7.6 Gyr); so galaxies now > 16.5 Gly comoving (e.g. GN-z11, JADES-GS-z14-0) have always receded faster than c | computed | computed
- Sensitivity: H0 = 73.04 (other parameters fixed) gives Hubble radius 13.39 Gly, event horizon 15.36 Gly, particle horizon 42.85 Gly (all scale as 1/H0) | computed | corrected: article said 46.2 -> 42.9 "all horizon distances scale with 1/H0"; strict 1/H0 scaling gives 46.19 x 67.66/73.04 = 42.79, so article now says 42.8 (the 42.85 figure holds Omega_r h^2 fixed, which is not pure 1/H0 scaling). Recomputed in fact-check (sens.js): EH 15.36, PH 42.85 with Omega_r h^2 fixed
- Sensitivity: Omega_m = 0.25 -> event horizon 16.08 Gly; 0.35 -> 16.93; 0.5 -> 18.59; Omega_Lambda -> 0 -> horizon grows without limit (no event horizon in a matter-only universe) | computed | computed

## Distances to named objects (computed from redshift, Planck 2018)
- Virgo Cluster mean distance 16.5 +/- 0.1 (random) +/- 1.1 (sys) Mpc = 53.8 million ly; M87 subcluster 16.7 Mpc | 2007 | Mei et al., ApJ 655, 144 (2007), https://doi.org/10.1086/509598 (arXiv:astro-ph/0702510 abstract) | verified
- Bullet Cluster 1E0657-558 redshift z = 0.296 | 2006 | Clowe et al., ApJ 648, L109 (2006), https://doi.org/10.1086/508162 (arXiv abstract) | verified
- Bullet Cluster comoving distance 3.97 Gly; z = 0.5 -> 6.35 Gly; z = 1 -> 11.08 Gly (light-travel 7.94 Gyr; distance at emission 5.54 Gly); z = 1.5 -> 14.60 Gly; z = 2 -> 17.31 Gly | computed | computed
- GN-z11 (z = 10.60): comoving 31.84 Gly; at emission 2.74 Gly; lookback 13.35 Gyr; universe 435 Myr old; recession now 2.20c; at emission 4.2c | computed | computed
- JADES-GS-z14-0 (z = 14.18): comoving 33.75 Gly; at emission 2.22 Gly; lookback 13.50 Gyr; universe 290 Myr old; recession now 2.34c (= 700,000 km/s); at emission 5.1c | computed | computed
- MoM-z14 (z = 14.44): comoving 33.86 Gly; universe 283 Myr old | computed (paper says 280 Myr) | computed
- CMB (z = 1089.8): source matter now 45.27 Gly away, was 41.5 million ly away at emission; recedes at 3.1c now, 66c at emission (Davis & Lineweaver: 3.2c and 58.1c for 0.3/0.7) | computed | computed
- Andromeda distance 2.5 million ly | - | NASA Messier 31 page (sibling fact files) | verified

## History
- de Sitter 1917 proposed a matter-free model with a cosmological constant which he presented in static coordinates; in fact it expands exponentially; the static form covers only the region inside a cosmological horizon; all models with a positive cosmological constant approach de Sitter in the far future | 1917 | W. de Sitter, MNRAS 78, 3-28 (1917), https://doi.org/10.1093/mnras/78.1.3 (Crossref); description from Krauss & Scherrer 2007 (read in full) | verified (via Krauss & Scherrer)
- Hubble 1929 velocity-distance relation | 1929 | E. Hubble, PNAS 15, 168-173 (1929), https://doi.org/10.1073/pnas.15.3.168 (Crossref) | verified
- Rindler, "Visual horizons in world-models", MNRAS 116, 662-677 (1 Dec 1956): defines a horizon as "a frontier between things observable and things unobservable"; distinguishes event-horizons and particle-horizons in Robertson-Walker models | 1956 | https://doi.org/10.1093/mnras/116.6.662 (OUP page abstract); republished Gen. Rel. Grav. 34, 133-153 (2002), https://doi.org/10.1023/A:1015347106729 | verified
- Rindler coined the term "event horizon" in the 1956 paper; born Vienna 18 May 1924; Kindertransport to England 1938; Liverpool BSc/MSc; Imperial College PhD; Cornell 1956-63; Dallas from Sept 1963 (founding faculty, UT Dallas); died 8 Feb 2019 aged 94 | - | UT Dallas, "UT Dallas Remembers Founding Faculty Member Wolfgang Rindler", https://news.utdallas.edu/faculty-staff/ut-dallas-remembers-founding-faculty-member-wolfgang-rindler/ | verified
- Riess, fall 1997: lab notebook gives mass density Omega_m = -0.36 +/- 0.18 with no cosmological constant, i.e. acceleration; checked for weeks; Schmidt confirmed at beginning of Jan 1998; Riess married 10 Jan 1998; email 12 Jan 1998 "Approach these results not with your heart or head but with your eyes."; teleconference 20 Feb 1998; paper submitted 13 March 1998, accepted 6 May; Science Breakthrough of the Year 1998 | 1997-98 | A. G. Riess, Nobel Lecture "My Path to the Accelerating Universe" (8 Dec 2011), https://www.nobelprize.org/uploads/2018/06/riess_lecture.pdf (PDF read) | verified
- Riess et al. 1998: 16 high-z + 34 nearby SNe Ia; high-z SNe 10-15% farther than expected in an Omega_m = 0.2 universe without Lambda; favour q0 < 0 | 1998 | AJ 116, 1009-1038 (1998), https://doi.org/10.1086/300499; arXiv:astro-ph/9805201 (abstract read) | verified
- Perlmutter et al. 1999: 42 high-redshift supernovae | 1999 | ApJ 517, 565-586 (1999), https://doi.org/10.1086/307221 (Crossref title) | verified
- Nobel Prize in Physics 2011: half to Perlmutter, half shared by Schmidt and Riess; Perlmutter's team began 1988; Schmidt's team launched end of 1994; "The discovery came as a complete surprise even to the Laureates themselves" | 2011 | NobelPrize.org press release, https://www.nobelprize.org/prizes/physics/2011/press-release/ | verified
- Davis & Lineweaver 2004 "Expanding confusion": we can observe galaxies that have always had recession velocities > c; Hubble sphere is not a horizon; all objects with z > ~1.46 recede faster than light now (0.3/0.7); galaxies at z ~ 1.8 are now crossing our event horizon; particle horizon ~46 Glyr; CMB-emitting points recede at 3.2c now, 58.1c at emission; SR Doppler interpretation of cosmological redshift rejected at 23 sigma; myth that superluminal galaxies are unobservable listed and refuted | 2004 | PASA 21, 97-109 (2004), https://doi.org/10.1071/AS03040 ; arXiv:astro-ph/0310808 (full text read) | verified
- Lineweaver & Davis, "Misconceptions about the Big Bang", Scientific American 292(3), March 2005 | 2005 | https://www.scientificamerican.com/article/misconceptions-about-the-2005-03/ (page opened) | verified
- Loeb 2002: with a cosmological constant, a high-z source stays visible only up to a finite age in its rest frame; its image freezes and redshift grows exponentially; sources at z = 5-10 visible only up to an age of 4-6 billion years | 2002 | Phys. Rev. D 65, 047301 (2002), https://doi.org/10.1103/PhysRevD.65.047301 ; arXiv:astro-ph/0107568 (abstract) | verified
- Krauss & Scherrer 2007: Local Group stays bound; all more distant structures driven beyond the event horizon on a timescale of order 100 billion years; observers will see a single merged galaxy, an "island universe", and conclude a static universe; at ~100 Gyr CMB peak ~1 m and intensity down ~12 orders of magnitude; later screened by interstellar plasma (plasma frequency ~1 kHz; expansion factor ~1e8, reached at < 50 times present age) | 2007 | Gen. Rel. Grav. 39, 1545-1550 (2007), https://doi.org/10.1007/s10714-007-0472-9 ; arXiv:0704.0221 (full text read) | verified
- Nagamine & Loeb 2003: within ~2 Hubble times large-scale structure freezes; Local Group pulled away from Virgo in physical coordinates; in the distant future only one massive galaxy (merged Milky Way + Andromeda) inside our event horizon | 2003 | New Astronomy 8, 439-448 (2003), https://doi.org/10.1016/S1384-1076(02)00234-8 ; arXiv:astro-ph/0204249 (abstract) | verified
- Kwan, Lewis & James 2010: 1 g rocketeer in concordance model (0.27/0.73, H0 ~ 72) covers 99% of the maximum reachable comoving distance (4.63 Gpc) in ~27 years of proper time; most of the distance covered between ~20 and 26 years | 2010 | PASA 27, 15-22 (2010), https://doi.org/10.1071/AS09050 ; arXiv:0909.1551 (full text read) | verified
- Heyl 2005: with a cosmological constant a rocket could reach a galaxy seen today at z = 1.7 one-way, or 0.65 on a round trip; nearly reachable within ~100 years | 2005 | Phys. Rev. D 72, 107302 (2005), https://doi.org/10.1103/PhysRevD.72.107302 ; arXiv:astro-ph/0509268 (abstract) | verified
- Ant on a rubber rope: rope 1 km stretching 1 km/s, ant 1 cm/s; continuous solution T = (c/v)(e^(v/alpha) - 1) = e^100000 - 1 s ~ 8.9e43421 years | - | formula and number checked (e^100000 = 10^43429.45); puzzle attributed to Martin Gardner's writing (aha! Gotcha, 1982) only via Wikipedia, book text not accessible | computed; attribution uncertain (not used)
- Doubling rope: ant covers 1 + 1/2 + 1/4 + ... = 2 cm of original marks; reaches 1.9 cm mark after 4.3 s | computed | corrected: the series 1 + 1/2 + 1/4 + ... = 2 holds only if the rope doubles in a jerk at the end of each second (the article's step-by-step reasoning); with smooth doubling the limit is 1/ln 2 = 1.44 cm and the ant never reaches the 1.9 cm mark. Article now states the jerk model explicitly and notes the smooth-stretch limit of 1.44 cm. In the jerk model the 1.9 cm mark is passed at 4 + (1.9 - 1.875)/(1/16) = 4.4 s (not 4.3); article's "a little after 4 seconds" stands
- Harmonic sum 1 + 1/2 + ... + 1/n ~ ln n + 0.577 | standard mathematics | verified

## 1 g rocket in the expanding universe (computed)
- Terminal proper speed of a 1 g ship: gamma*beta -> g/(cH): 1.49e10 with H0, rising to 1.80e10 as H -> 56.15 | computed | computed
- In flat space gamma would reach 1.5e10 after (c/g) ln(2 gamma) = 23.4 yr; with expansion gamma = 6.3e9 at 23 yr, 1.45e10 at 25 yr | computed | computed
- Accelerating without stopping from today: 60.99% of horizon distance at 24 yr, 81% at 25 yr, 92% at 26 yr, 97% at 27 yr, 99% at 28.0 yr (arriving 79 Gyr from now), 16.56 Gly at 30 yr (115 Gyr from now); limit 16.58 Gly | computed | computed
- Flip-and-burn at 1 g (ship years / cosmic time elapsed at home): Andromeda 2.5 Mly 28.6 yr / 2.5 Myr; Virgo 53.8 Mly 34.6 yr / 53.9 Myr; Bullet Cluster (3.97 Gly) 43.2 yr / 4.6 Gyr; z = 0.5 (6.35 Gly) 44.3 yr / 8.2 Gyr; z = 1 (11.08 Gly) 46.0 yr / 18.9 Gyr (arrives when universe is 32.7 Gyr old, galaxy then 35 Gly away); z = 1.5 (14.60 Gly) 47.6 yr / 36.7 Gyr; 16.4 Gly 50.2 yr / 78 Gyr; 16.55 Gly 51.9 yr / 109 Gyr | computed; static-SR values for comparison 28.6, 34.55, 42.9, 43.8, 44.9, 45.4 | computed; independently recomputed in fact-check (rocket.js, RK4 in ship time, shooting on the switch point so the ship arrives at rest): 28.60 / 34.55 / 43.18 / 44.32 / 46.04 / 47.60 / 50.15 yr and 0.0025 / 0.0539 / 4.61 / 8.19 / 18.93 / 36.73 / 78.4 Gyr, arrival distance for z = 1 34.97 Gly; corrected: article table had "80 billion years" for the 16.4 Gly row, now 78
- Message sent home on arrival reaches Earth only if destination < 8.29 Gly comoving (z = 0.69) | computed | computed
- Doppler shift toward a target: 1 + z_seen = (1 + z) sqrt((1 - beta)/(1 + beta)); for JADES-GS-z14-0 (1 + z = 15.18) the shift is cancelled when e^rapidity = 15.18: rapidity 2.720, gamma 7.62, beta 0.99135, reached after 2.63 yr at 1 g | computed | computed

## Most distant galaxies
- GN-z11: Hubble WFC3 grism, break at 1.47 um, z_grism = 11.09, ~400 Myr after Big Bang | 2016 | Oesch et al., ApJ 819, 129 (2016), https://doi.org/10.3847/0004-637X/819/2/129 ; arXiv:1603.00461 | verified
- GN-z11: JWST NIRSpec z = 10.603 (lower than earlier) | 2023 | Bunker et al., A&A 677, A88 (2023), https://doi.org/10.1051/0004-6361/202346159 | verified
- JADES-GS-z14-0: candidate found early 2023, team wary because surprisingly bright and very close to another galaxy; NIRSpec observed it in January 2024 for almost ten hours; z = 14.32 (+0.08/-0.20), beating JADES-GS-z13-0 (z = 13.2); announced 30 May 2024; programme GTO 1287 | 2024 | NASA Webb blog 30 May 2024, https://science.nasa.gov/blogs/webb/2024/05/30/nasas-james-webb-space-telescope-finds-most-distant-known-galaxy/ | verified
- Observations 10-12 January 2024; foreground galaxy 0.4 arcsec away; radius 260 pc; companion JADES-GS-z14-1 at z = 13.90 | 2024 | Carniani et al., Nature 633, 318-322 (2024), https://doi.org/10.1038/s41586-024-07860-9 ; arXiv:2405.18485 (full text read) | verified
- ALMA [OIII] 88 um line at 223.524 GHz gives z = 14.1796 +/- 0.0007 | 2025 | Carniani et al., A&A 696, A87 (2025), https://doi.org/10.1051/0004-6361/202452451 ; Schouws et al. arXiv:2409.20549 (z = 14.1793) | verified
- Observed Lyman-alpha (121.6 nm) at z = 14.18 -> 1.85 um; [OIII] 88.36 um -> 1.34 mm | computed | corrected in article: text said the light "stopped dead at about 1.86 micrometres"; Carniani et al. 2024 (arXiv:2405.18485v2 full text, p. 3) say "no flux detected blueward of 1.85 um", so article now says 1.85. 223.524 GHz -> 1.341 mm verified
- MoM-z14: z_spec = 14.44 (+/-0.02), 280 Myr after the Big Bang, COSMOS field, NIRSpec prism, "Mirage or Miracle" survey | 2025 | Naidu et al., arXiv:2505.11263 (abstract read; v1 16 May 2025) | verified; corrected citation: now published, The Open Journal of Astrophysics 9 (30 Jan 2026), https://doi.org/10.33232/001c.156033 (Crossref checked); article footnote and paper list updated from "preprint"
- PAN-z14-1 at z = 13.53 is "the fourth most distant galaxy known to date" (Jan 2026) | 2026 | Donnan et al., arXiv:2601.11515 (abstract; v1 16 Jan 2026, v2 7 Apr 2026, "accepted for publication in ApJ") | verified; footnote updated to say accepted by ApJ
- As of 23 Sep 2026 a preprint describes JWST galaxies "extending to z=14.5" and deeper spectroscopy of fainter candidates finding only interlopers; no confirmed galaxy beyond MoM-z14 found in arXiv searches to 25 Sep 2026 | 2026 | Zhang et al., arXiv:2609.28257 | verified (record status: uncertain, absence of evidence)
- Two z > 15 dropout candidates in JWST Bullet Cluster data turned out to be Y-type brown dwarfs, 150-650 pc away, 272-351 K and 445-525 K; proper motions measured | 2026 | Bradac et al., arXiv:2604.23668 (abstract; v1 26 Apr 2026; v2 20 Jul 2026 "Replaced to match the ApJ Letters accepted version"; proper motions 49 +/- 8 and 24 +/- 3 mas/yr from NIRCam imaging "~1 year later") | verified; article now says "roughly the temperature range of liquid water" (272 K is just below freezing); footnote updated to say accepted by ApJ Letters
- Last light that will ever reach us leaves JADES-GS-z14-0 when the universe is 3.3 Gyr old; GN-z11 4.0 Gyr; z = 1.5 galaxy 15.9 Gyr; z = 1 galaxy 20.6 Gyr; 1 Gly galaxy 62 Gyr; Virgo (smooth expansion, peculiar motions ignored) 113 Gyr | computed (method of Loeb 2002) | computed
- Virgo as seen at future cosmic ages (smooth expansion): z = 0.026 at 50 Gyr, 0.47 at 100 Gyr, 8.2 at 150 Gyr, 145 at 200 Gyr, 4e9 at 500 Gyr | computed | computed

## Far future
- M31 radial velocity relative to Milky Way -109.3 +/- 4.4 km/s, tangential ~17 km/s; consistent with head-on orbit | 2012 | van der Marel et al., ApJ 753, 8 (2012), https://doi.org/10.1088/0004-637X/753/1/8 ; arXiv:1205.6864 | verified
- Sawala et al. 2025: merger commonly predicted in ~5 Gyr; including M33 and LMC and uncertainties, ~50% chance of no Milky Way-Andromeda merger in next 10 Gyr; median merger time 7.6 Gyr for merging cases; M33 raises, LMC lowers probability | 2025 | Nature Astronomy 9, 1206-1217 (2025), https://doi.org/10.1038/s41550-025-02563-1 ; arXiv:2408.00064 (text read) | verified
- CMB temperature at cosmic age 100 Gyr: 0.018 K; Wien peak ~16 cm (frequency peak ~28 cm); at 150 Gyr 0.001 K; K&S quote ~1 m at 100 Gyr | computed; Krauss & Scherrer | computed (K&S number differs; article uses computed values)
- Expansion factor 1e8 reached at cosmic age 333 Gyr (~24x present age) | computed | computed
- Star formation since z ~ 2.2 produced ~95% of today's stellar mass; if the decline continues, final stellar mass density only ~5% above today's | 2013 | Sobral et al., MNRAS 428, 1128 (2013), https://doi.org/10.1093/mnras/sts096 ; arXiv:1202.3436 (text read) | verified
- Normal star formation and stellar evolution end by cosmological decade 14 (1e14 yr); Stelliferous Era 1e6-1e14 yr; Degenerate Era 1e15-1e37; Black Hole Era 1e38-1e100; Dark Era > 1e100 (with proton decay assumed); heat death discussion | 1997 | Adams & Laughlin, Rev. Mod. Phys. 69, 337-372 (1997), https://doi.org/10.1103/RevModPhys.69.337 ; arXiv:astro-ph/9701131 (text read) | verified
- Big Rip: for w = -3/2, H0 = 70, rip in 22 Gyr; Milky Way destroyed ~60 Myr before; Earth ripped from Sun a few months before; Earth explodes 30 minutes before | 2003 | Caldwell, Kamionkowski & Weinberg, PRL 91, 071301 (2003), https://doi.org/10.1103/PhysRevLett.91.071301 ; arXiv:astro-ph/0302506 (text read) | verified

## Dark energy and H0 (status September 2026)
- DESI DR2 (19 March 2025): >14 million galaxies and quasars, 3 years; w0waCDM preferred over LCDM at 3.1 sigma (DESI+CMB); 2.8-4.2 sigma with SNe (Pantheon+, Union3, DESY5); DESI+CMB+DESY5: w0 = -0.752 +/- 0.057, wa = -0.86 (+0.23/-0.20) | 2025 | DESI Collaboration, arXiv:2503.14738 (text read) | verified
- Berkeley Lab release 19 March 2025: not yet 5 sigma; 3-sigma events often fade | 2025 | https://newscenter.lbl.gov/2025/03/19/new-desi-results-strengthen-hints-that-dark-energy-may-evolve/ | verified
- DES-Dovekie recalibration of DES-SN5YR: significance reduced from 4.2 to 3.2 sigma; w0 = -0.803 +/- 0.054, wa = -0.72 +/- 0.21 | 2025-26 | Popovic et al., MNRAS (2026), arXiv:2511.07517 (abstract) | verified
- Full DES six-year multi-probe: 2.2 sigma alone; 3.0 sigma with CMB and DESI | May 2026 | DES Collaboration, arXiv:2605.27221 (abstract; v1 26 May 2026) | verified; corrected in article: text said "with the microwave background, gives 3.0", but the 3.0 sigma combination is DES + DESI DR2 BAO + CMB (DES + DESI alone is 2.3 sigma), so article now says "combined with DESI and the microwave background"; footnote lists all three numbers
- "Unite" SN sample (Pantheon+ + DES-SN5YR, 2,884 SNe): with CMB and BAO, w0 = -0.861, wa = -0.60; 3.3 sigma frequentist, weak Bayesian preference | Sept 2026 | Camilleri et al., arXiv:2609.05053 (abstract) | verified
- Bayesian reanalysis: with DES-Dovekie the Bayesian evidence for dynamical dark energy vanishes | 2026 | Ong, Yallup & Handley, arXiv:2603.05472 (abstract) | verified (not cited in article)
- DESI completed its planned five-year survey on 15 April 2026; >47 million galaxies and quasars (target 34 million) and >20 million stars; first dark energy results from full survey expected 2027; will observe through 2028, map growing from 14,000 to 17,000 square degrees; began May 2021 | 2026 | Berkeley Lab, https://newscenter.lbl.gov/2026/04/15/desi-completes-planned-3d-map-of-the-universe-and-continues-exploring/ | corrected: the release (datePublished 2026-04-15T15:00Z, i.e. 8 am Arizona) says the last planned observations were made "Last night" and completion was marked "when the sun rose", so the final night was 14-15 April; article now says "on the night of 14 to 15 April 2026". All other numbers verified verbatim
- CPL fits extrapolated forward (illustrative, not a prediction): with (w0, wa) = (-0.752, -0.86) acceleration ends at a = 1.39 (cosmic age 19 Gyr); (-0.803, -0.72) at a = 1.56 (21.5 Gyr); (-0.861, -0.60) at a = 1.80 (24 Gyr); no event horizon (light's reach grows without limit) | computed | computed (illustrative)
- SH0ES: H0 = 73.04 +/- 1.04 km/s/Mpc from Cepheid-calibrated SNe Ia in 42 hosts | 2022 | Riess et al., ApJL 934, L7 (2022), https://doi.org/10.3847/2041-8213/ac5c5b | verified
- Hubble tension persists in 2026 (distance-network values ~73.3-73.5 vs CMB 67.2-67.7) | 2026 | Choudhury, ApJL 1008, L50 (2026), arXiv:2607.24443 (abstract) | verified (not cited directly)

## What comes next (status September 2026)
- Euclid DR1: DR1-Foundation (raw data, calibrated images, catalogues, spectra, ~1,900 deg^2) in November 2026; complete DR1 with clustering and weak-lensing products mid-2027; update published 15 June 2026 | 2026 | https://www.cosmos.esa.int/web/euclid/dr1-timeline | verified
- Roman launched 30 Aug 2026 on Falcon Heavy from LC-39A | 2026 | NASA Roman blog, https://science.nasa.gov/blogs/roman/2026/08/30/nasa-concludes-roman-space-telescope-launch-coverage/ | verified
- Roman: first mid-course burn 31 Aug; fuel for at least 22 years of science; orbit insertion at L2 ~100 days after launch (early December) | 2026 | https://science.nasa.gov/blogs/roman/2026/09/14/fuel-savings-double-potential-lifetime-for-nasas-roman-mission/ | verified
- Roman: science operations begin by early 2027; ~1.4 TB per day downlink | 2026 | https://science.nasa.gov/blogs/roman/2026/09/25/nasas-roman-team-confirms-ground-stations-receiving-data/ | verified
- Rubin LSST officially began 30 June 2026; ten years; ~800 visits per point | 2026 | NOIRLab noirlab2616, https://noirlab.edu/public/news/noirlab2616/ | corrected: the release is dated 30 June 2026 and says the survey "has officially started", but gives no exact start night; article now says "officially began ... at the end of June 2026 (announced on 30 June)". "about 800 times" and "ten-year" verified verbatim
- ELT: telescope first light planned 2029; scientific first light December 2030 (planned) | - | https://elt.eso.org/about/timeline/ | verified
- JWST launched 25 Dec 2021 | 2021 | sibling fact file (NASA) | verified (not needed)

## Books, videos, online (all opened)
- Harrison, Cosmology: The Science of the Universe, 2nd ed., Cambridge University Press 2000 | https://doi.org/10.1017/CBO9780511804540 (Crossref) | verified
- Ryden, Introduction to Cosmology, 2nd ed., Cambridge University Press 2017 (Crossref issued 2016-11-17) | https://doi.org/10.1017/9781316651087 | verified
- Adams & Laughlin, The Five Ages of the Universe, Free Press 1999 | Open Library search | verified
- Katie Mack, The End of Everything (Astrophysically Speaking), Scribner 2020 | Open Library search | verified
- Richard Panek, The 4 Percent Universe, Houghton Mifflin Harcourt 2011 | Open Library search | verified
- Tamara Davis, PhD thesis "Fundamental Aspects of the Expansion of the Universe and Cosmic Horizons" (UNSW), arXiv:astro-ph/0402278, free | arXiv API | verified
- eVoh27gJgME | PBS Space Time, "How Much Of The Universe Can Humanity Ever See?", 18:03, 29 Mar 2023 | oEmbed + page | verified
- uzkD5SeuwzM | Kurzgesagt – In a Nutshell, "TRUE Limits Of Humanity – The Final Border We Will Never Cross", 11:40, 11 May 2021 (sources doc https://sites.google.com/view/sources-truelimitsofhumanity/) | verified
- XBr4GkRnY04 | Veritasium, "Misconceptions About the Universe", 5:46, 2014 | verified
- WrhsPZt5JtM | CAASTRO, "Cosmic Confusion II: Cosmic Event Horizons", 18:35, 2012, with Tamara Davis | verified
- OM9KepKsg6U | Vsauce2, "Ant On A Rubber Rope Paradox", 12:09, 2018 | verified
- YXRJH4-bOSA | Kevin Hainline, "JWST SMASHES DISTANCE RECORD! The Current Farthest Galaxy JADES-GS-z14-0", 32:02, 30 May 2024 | verified
- j6HZaaypoSI | Dr. Becky, "MORE evidence for DARK ENERGY changing with time?! | Night Sky News March 2025", 32:07 | verified
- NiHgzb8PkYs | Mus Ishak-Boushaki, "Simplified DESI Dark Energy Results", 4:53, June 2026 | verified
- BhG_QZl8WVY | Fermilab, "How to travel faster than light", 10:59 | verified
- Ned Wright's Cosmology Tutorial https://www.astro.ucla.edu/~wright/cosmo_01.htm and Javascript Cosmology Calculator https://www.astro.ucla.edu/~wright/CosmoCalc.html | verified (pages load)
- Physics FAQ, "The Relativistic Rocket" https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html | verified

## Added during writing
- Davis & Lineweaver 2004, Appendix B, lists misleading statements from textbooks and popular science; item [1] is Feynman, Lectures on Gravitation (1962/63, publ. 1995) p. 181, saying galaxies receding faster than light would "never be observable by hypothesis"; Rindler 1956 and Weinberg's The First Three Minutes are also listed | 2004 | arXiv:astro-ph/0310808 Appendix B (text read) | verified (paraphrased in article, not quoted)
- Davis PhD thesis (UNSW, dated 23 Dec 2003) cites Harrison 2000 (Cosmology, 2nd ed.) among efforts to clarify superluminal recession | 2003 | arXiv:astro-ph/0402278 (text read) | verified; corrected in article: the book blurb said the thesis "lists [it] among the few sources that got superluminal recession right", which overstates the thesis ("despite efforts to clarify the issue (... Harrison 2000 ...)"); blurb now says it "cites [it] among the efforts to clear up the confusion over superluminal recession"
- DESI captures light from 5,000 galaxies simultaneously; Mayall 4-m telescope, Kitt Peak | 2025 | Berkeley Lab release 19 Mar 2025 | verified
- BAO scale "about 150 megaparsecs" | 2026 | DESI blog 30 July 2026, https://www.desi.lbl.gov/2026/07/30/new-desi-dr2-lyman-alpha-results-shed-light-on-dark-energy/ | verified
- DESI DR2 quasar catalogue: >1.2 million quasars at z > 1.77, >820,000 at z > 2.09 (all z > 1.48, so all receding faster than light today) | 2025 | arXiv:2503.14738 section on Lya | verified
- M. Ishak (Mustapha Ishak-Boushaki, UT Dallas) is on the DESI DR2 author list | 2025 | arXiv:2503.14738 author list; UT Dallas Rindler page names him head of the cosmology group | verified
- Roman at L2 "a million miles away" | 2026 | NASA Roman blog 25 Sep 2026 | verified; corrected for units (SI rule): article now says "about 1.5 million km from Earth"
- Record-holders (GN-z11 31.8, JADES-GS-z14-0 33.7, MoM-z14 33.9 Gly) are 1.9-2.0 times the event-horizon distance | computed | computed
- JADES-GS-z14-0 crossed our event horizon at cosmic age 3.3 Gyr, before the Sun formed (~9.2 Gyr cosmic age, i.e. 4.6 Gyr ago) | computed | computed
- Video blurbs checked against YouTube descriptions: Veritasium XBr4GkRnY04 ("Can we see things travelling faster than light?"); Vsauce2 OM9KepKsg6U links a harmonic-series proof and mentions the expanding universe; Fermilab BhG_QZl8WVY on ways the universe "breaks the ultimate speed limit"; Dr. Becky j6HZaaypoSI Night Sky News March 2025 includes a DESI segment; PBS eVoh27gJgME on "the absolute limit of our future view of the universe" | 2026 | youtube.com watch pages | verified

## Adversarial fact-check pass (25 September 2026)
Every claim in the article was re-checked against a primary source or recomputed. Scratch scripts (in a temporary directory): cosmo.js, rocket.js, sens.js. Status "verified" = source or recomputation agrees with the article; "corrected" = old -> new.

### Recomputed (Planck 2018 flat LCDM, Omega_r h^2 = 4.15e-5, Simpson in ln a)
- Age 13.786 Gyr; c/H0 = 14.452 Gly; H0 = 20.745 km/s per Mly = 2.1927e-18 /s; particle horizon 46.19 Gly; event horizon 16.58 Gly; (16.58/46.19)^3 = 4.63% | computed | verified
- z on event horizon 1.853; z at Hubble sphere 1.476; round trip chi = 8.29 Gly at z = 0.688 (exactly half the event horizon, since chi <= chi_e(t1) and chi = chi_e(t0) - chi_e(t1)) | computed | verified
- Table rows: Bullet (z 0.296) chi 3.97, then 3.06 Gly, lookback 3.49 Gyr; z = 1 chi 11.08, then 5.54, lookback 7.94; GN-z11 chi 31.84, then 2.74, lookback 13.35, 435 Myr; JADES-GS-z14-0 chi 33.75, then 2.22, lookback 13.50, 290 Myr, 2.34c now, 5.1c then; CMB chi 45.27, then 41.5 Mly, 3.13c now; Virgo 16.5 Mpc = 53.8 Mly, z_cos 0.0037 | computed | verified
- Past light cone maximum 5.85 Gly at z = 1.59, t = 4.05 Gyr; JADES photon carried outward for 3.76 Gyr | computed | verified ("3.8 billion years", "5.8 billion light-years", "about 1.6")
- Maximum comoving Hubble radius 16.51 Gly at z = 0.64 (t = 7.6 Gyr) | computed | verified
- Doublings: a = 2 at 24.88 Gyr (11.10 from now), a = 4 at 36.81 (11.93 Gyr later); light covers 7.94, +4.30, +2.17, +1.09, +0.54 Gly; asymptotic doubling time 12.07 Gyr | computed | verified
- Shell lost per year 3.45e21 ly^3 = ball 18.8 Mly across | computed | verified
- Last light leaves: JADES-GS-z14-0 at 3.33 Gyr, GN-z11 4.01, z = 1.5 15.91, z = 1 20.62, Virgo 113.3 Gyr (a = 323.6); Virgo seen at 150 Gyr 1 + z = 9.23, at 200 Gyr 146.5; CMB 0.0181 K at 100 Gyr; a = 1e8 at 333 Gyr | computed | verified
- Sensitivity Omega_m 0.25/0.35/0.5 -> EH 16.08/16.93/18.59 Gly | computed | verified
- CPL fits run forward: acceleration ends 5.4 (DESI+CMB+DESY5), 7.6 (Dovekie), 9.1 (DES Y6 all), 10.4 (Unite) Gyr from now; light's reach 1,560 Gly by a = 1e3 and still growing (no event horizon) | computed | verified ("within about 5 to 10 billion years")
- Rocket, accelerate for ever: 2.6% of EH at 20 yr, 61% at 24, 81.2% at 25, 92% at 26, 97.1% at 27, 99% at 28.04 yr; gamma*beta/(g/(cH(t))) = 0.970 at 27 yr; gamma_max = 1.49e10 now, 1.80e10 asymptotically; 9.81/(3e8 x 2.19e-18) = 1.49e10 | computed | verified
- Doppler cancellation for 1 + z = 15.18: rapidity 2.720, beta 0.99136, gamma 7.62, 2.63 yr at 1 g | computed | verified
- Ant: e^100000 = 10^43429.45 (43,430 digits) s = 8.9e43421 yr | computed | verified

### Sources re-read
- Carniani et al. 2024 full text (arXiv:2405.18485v2): observations "between January 10 and 12, 2024"; "no flux detected blueward of 1.85 um"; foreground galaxy at z = 3.475, 0.4 arcsec east; z = 14.32 | verified; 1.86 -> 1.85 corrected
- NASA Webb blog 30 May 2024: found "In early 2023"; "surprisingly bright" and "very close to another galaxy"; NIRSpec "In January 2024 ... for almost ten hours"; "less than 300 million years after the big bang"; contributors Carniani and Hainline | verified
- Carniani et al. 2025, A&A 696, A87: [OIII] 88 um at 223.524 GHz, z = 14.1796 +/- 0.0007 (arXiv:2409.20533, posted Sept 2024, so "later that year" holds) | verified
- UT Dallas obituary: born Vienna 18 May 1924; Kindertransport 1938 "rescue of Jewish children from Germany and Austria"; Liverpool degrees; Imperial College doctorate; horizon "a frontier between things observable and things unobservable"; "coined the term 'event horizon'" in the 1956 paper | verified
- Rindler 1956: Crossref MNRAS 116(6), 662-677, published 1 Dec 1956; OUP abstract defines event-horizons and particle-horizons; GRG 34(1), 133-153 (Jan 2002) reprint | verified
- de Sitter 1917: Crossref MNRAS 78(1), 3-28 | verified; static coordinates, horizon and eternal expansion per Krauss & Scherrer 2007 section A | verified
- Riess Nobel Lecture (8 Dec 2011, PDF read): Miller Fellowship at UC Berkeley; fall 1997; notebook -0.36 +/- 0.18; "a couple of weeks double checking" (article said "weeks", corrected to "a couple of weeks"); Schmidt "At the beginning of January 1998 ... getting the same answer"; married 10 Jan 1998; email 1/12/1998 6:36 pm "on the eve of our honeymoon", quotation matches verbatim; submitted 13 March 1998, accepted 6 May | verified / corrected
- Riess et al. 1998 abstract: "10% to 15% farther than expected in a low mass density (Omega_M = 0.2) Universe without a cosmological constant" | corrected: article now says "low-density universe without a cosmological constant"
- Nobel 2011 press release (curl): one half to Perlmutter, other half jointly to Schmidt and Riess; Perlmutter's team "set to work in 1988"; Schmidt's team "launched at the end of 1994" | verified
- Cosmological constant attribution: article called it "de Sitter's cosmological constant"; the constant is Einstein's (the article itself says so in the de Sitter paragraph) | corrected: "Einstein's cosmological constant, the one ingredient of de Sitter's model"
- Davis & Lineweaver 2004 full text: 23 sigma; z > 1.46 superluminal now; z ~ 1.8 crossing event horizon; ~46 Glyr; 3.2c and 58.1c for (0.3, 0.7); Appendix B item [1] Feynman, Lectures on Gravitation p. 181, "never be observable by hypothesis" | verified
- Kwan, Lewis & James 2010 full text: Eq. 9 d(rapidity)/d(tau) = alpha - H sinh(rapidity) ("Hubble drag"), which implies coasting momentum proportional to 1/a and the balance gamma*beta = g/(cH); 99% of maximum (4.63 Gpc) in ~27 yr; "rapid jump ... between 20-26 years"; after 26 years "hardly travels any further" | verified
- Heyl 2005 abstract: z = 1.7 one way, 0.65 round trip | verified
- Loeb 2002 abstract (PRD 65, 047301, published 23 Jan 2002): image freezes; z = 5-10 visible only to an age of 4-6 Gyr | verified
- Krauss & Scherrer 2007 full text: Local Group bound; all more distant structure beyond the event horizon "on the order of 100 billion years"; "static 'island universe,' precisely the standard model of the universe c. 1900"; CMB screened below ISM plasma frequency (~1 kHz) at expansion factor ~1e8, "less than 50 times its present age"; primordial helium Y = 0.25 "dwarfed" by stellar helium (Y -> 0.6) | verified
- Nagamine & Loeb (arXiv 15 Apr 2002; New Astronomy 8(5), 439-448, July 2003): "In the distant future there will only be one massive galaxy within our event horizon, namely the merger product of the Andromeda and the Milky Way galaxies"; Local Group pulled away from Virgo in physical coordinates | verified
- van der Marel et al. 2012 abstract: V_rad = -109.3 +/- 4.4 km/s | verified
- Sawala et al. 2025 full text: merger "predicted in around five billion years" (standard view); ~50% no merger in next 10 Gyr for MW-M31-M33-LMC; "median time of 7.6 Gyr in the fiducial model"; HST first direct proper motions | verified
- Sobral et al. 2013 abstract: ~95% of stellar mass formed in last ~11 Gyr; if decline continues, stellar mass density reaches a maximum "only 5 per cent higher than the present-day value" | verified
- Adams & Laughlin 1997 text: "by the cosmological decade eta = 14, essentially all normal star formation in galaxies will have ceased"; red dwarf lifetimes of trillions of years; heat death section | verified
- Caldwell et al. 2003 text: w = -3/2, H0 = 70: Big Rip in 22 Gyr; Milky Way destroyed 60 Myr before; Earth explodes 30 minutes before | verified
- Oesch et al. 2016 abstract: break at 1.47 +/- 0.01 um, z_grism = 11.09, ~400 Myr | verified; Bunker et al. 2023 abstract: z = 10.603 from multiple emission lines | verified
- Mei et al. 2007 abstract: 16.5 +/- 0.1 +/- 1.1 Mpc | verified; Clowe et al. 2006 abstract: 1E0657-558 at z = 0.296 | verified
- DESI DR2 II full text: >14 million galaxies and quasars, three years; 3.1 sigma DESI+CMB; 2.8-4.2 sigma with SNe; ">1.2 million quasars at z > 1.77 ... used as discrete tracers" | verified; citation updated: published Phys. Rev. D 112, 083515 (2025), https://doi.org/10.1103/tr6y-kpc6 (Crossref checked)
- Berkeley Lab 19 Mar 2025 release: 5,000 galaxies simultaneously; Mayall 4-m, Kitt Peak; 2.8-4.2 sigma; "many 3-sigma events in physics have faded away with more data" | verified
- DESI blog 30 July 2026: BAO "about 150 megaparsecs", "imprinted by sound waves" | verified
- Popovic et al. (arXiv:2511.07517, MNRAS 2026): 4.2 -> 3.2 sigma | verified
- Camilleri et al. (arXiv:2609.05053, v1 4 Sep 2026): 2,884 SNe Ia; with CMB and BAO 3.3 sigma (MAP; 3.1 sigma max likelihood); Bayesian evidence only weak | verified. Article wording "the hint has neither vanished nor grown" -> corrected to "has shrunk a little but not vanished" (peak value fell from 4.2 to 3.0-3.3 sigma)
- Zhang et al. (arXiv:2609.28257, v1 23 Sep 2026): JWST galaxies "extending to z=14.5"; "deeper spectroscopy of fainter candidates now finds only interlopers"; argues for wave dark matter | verified
- MoM-z14 still the record: no confirmed galaxy above z = 14.44 found in arXiv abstract searches ("most distant" galaxy spectroscopic; "spectroscopic confirmation z>14"), consistent with Zhang et al. | verified (absence of evidence; web search budget exhausted, so no news-site check)
- "The most distant galaxy known" used for JADES-GS-z14-0 in the Doppler worked example | corrected: it has not been the most distant known since May 2025 (MoM-z14); now names JADES-GS-z14-0
- Webb "keeps pushing the distance record" | corrected: the record has not moved since May 2025; now "keeps hunting for galaxies beyond the current record"
- Euclid DR1 timeline (15 June 2026 update): DR1-Foundation ~1,900 deg^2 in November 2026; complete DR1 with clustering and weak-lensing products mid-2027 | verified
- Roman blogs 30 Aug, 14 Sep, 25 Sep 2026: launch 30 Aug 2026 9:30 am EDT, Falcon Heavy, LC-39A; first burn "less than 10% of the fuel the team had budgeted for"; "at least 22 years"; L2 "approximately 100 days after launch, or about early December"; science operations "by early 2027" | verified
- ESO ELT timeline: "first test observations in 2029"; first observations with scientific instruments "expected ... in December 2030" | verified
- Intro claim "closing in on us by a light-year every year" lacked the qualifier used later in the article; in proper distance the event horizon is currently receding (d(a chi_e)/dt = H D_e - c = +0.15c) | corrected: now "measured in today's distances, it is closing in"

### Further reading re-checked
- All 25 DOIs resolved on Crossref with matching titles, volumes and pages (Nagamine & Loeb DOI checked separately) | verified
- Videos (oEmbed + watch page lengthSeconds): eVoh27gJgME 1083 s = 18:03; uzkD5SeuwzM 700 s = 11:40; WrhsPZt5JtM 1115 s = 18:35 (description names Dr Tamara Davis); XBr4GkRnY04 346 s = 5:46; OM9KepKsg6U 729 s = 12:09; YXRJH4-bOSA 1922 s = 32:02 (uploaded 30 May 2024); j6HZaaypoSI 1927 s = 32:07; NiHgzb8PkYs 293 s = 4:53 (uploaded 9 June 2026); BhG_QZl8WVY 659 s = 10:59; titles and channels match | verified
- Online links return HTTP 200: CosmoCalc, cosmo_01, Scientific American (Lineweaver and Davis, 1 March 2005), Physics FAQ rocket, Kurzgesagt sources, Euclid DR1 timeline | verified

## Cross-article consistency pass (25 September 2026)

Numbers shared with other Learn articles were compared across all 16 articles; changes made here for agreement are listed below.

- H0 = 67.66 km/s/Mpc is Planck 2018 combined with BAO (TT,TE,EE+lowE+lensing+BAO); Planck alone gives 67.36 +/- 0.54 (quoted as 67.4 in The expanding universe) | Planck 2018 VI, A&A 641, A6 (2020), Table 2 | clarified in the text (two places) and in the [^planck2018] footnote so readers of both articles see why the numbers differ; all horizon distances here remain computed with 67.66 / 0.3111
- 'cosmic microwave background (CMB)' introduced at first prose use | n/a | n/a | style
