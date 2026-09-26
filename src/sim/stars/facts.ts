/**
 * What each named star is famous for: two or three facts per star, each with the paper (or page)
 * it comes from, in the same order. The numbers are those of systems.json (docs/data/stars.md
 * §4.8) or of the cited paper; light-years are the catalogue distances times 3.2616.
 */

const doi = (d: string) => `https://doi.org/${d}`;

/** The sources the facts cite. */
const REF = {
  akeson2021: doi('10.3847/1538-3881/abfaff'),
  kervella2017: doi('10.1051/0004-6361/201629930'),
  gaiaDr3: doi('10.1051/0004-6361/202243940'),
  anglada2016: doi('10.1038/nature19106'),
  barnard1916: doi('10.1086/104156'),
  basant2025: doi('10.3847/2041-8213/adb8d5'),
  bond2017: doi('10.3847/1538-4357/aa6af8'),
  bond2015: doi('10.1088/0004-637x/813/2/106'),
  heiter2015: doi('10.1051/0004-6361/201526319'),
  bessel1838: doi('10.1093/mnras/4.17.152'),
  shakht2017: doi('10.1007/s10511-017-9502-9'),
  kervella2008: doi('10.1051/0004-6361:200810080'),
  torres2015: doi('10.1088/0004-637x/807/1/26'),
  monnier2012: doi('10.1088/2041-8205/761/1/l3'),
  aumann1984: doi('10.1086/184214'),
  joyce2020: doi('10.3847/1538-4357/abb8db'),
  harper2017: doi('10.3847/1538-3881/aa6ff9'),
  montarges2021: doi('10.1038/s41586-021-03546-8'),
  deAlmeida2022: doi('10.1093/mnras/stac1617'),
  vanLeeuwen2007: doi('10.1051/0004-6361:20078357'),
  evans2024: doi('10.3847/1538-4357/ad5e7a'),
  agol2021: doi('10.3847/psj/abd022'),
  gillon2017: doi('10.1038/nature21360'),
  teixeira2009: doi('10.1051/0004-6361:200810746'),
  hatzes2000: doi('10.1086/317319'),
  mann2015: doi('10.1088/0004-637x/804/1/64'),
  monnier2007: doi('10.1126/science.1143205'),
  ohnaka2013: doi('10.1051/0004-6361/201321063'),
  schiller2008: doi('10.1051/0004-6361:20078590'),
  ramirez2011: doi('10.1088/0004-637x/743/2/135'),
  marois2008: doi('10.1126/science.1166585'),
  marois2010: doi('10.1038/nature09684'),
  baines2012: doi('10.1088/0004-637x/761/1/57'),
  mayor1995: doi('10.1038/378355a0'),
  nobel2019: 'https://www.nobelprize.org/prizes/physics/2019/summary/',
  boyajian2013: doi('10.1088/0004-637x/771/1/40'),
  domiciano2021: doi('10.1051/0004-6361/202140478'),
  tkachenko2016: doi('10.1093/mnras/stw255'),
  hatzes2006: doi('10.1051/0004-6361:20065445'),
  mamajek2012: doi('10.1088/2041-8205/754/2/l20'),
  che2011: doi('10.1088/0004-637x/732/2/68'),
  bonfils2018: doi('10.1051/0004-6361/201731973'),
  astudillo2017: doi('10.1051/0004-6361/201630153'),
  mayor2009: doi('10.1051/0004-6361/200912172'),
} as const;

/** Short names of the sources, for the card's links. */
const LABEL: Record<keyof typeof REF, string> = {
  akeson2021: 'Akeson et al. 2021',
  kervella2017: 'Kervella et al. 2017',
  gaiaDr3: 'Gaia DR3',
  anglada2016: 'Anglada-Escudé et al. 2016',
  barnard1916: 'Barnard 1916',
  basant2025: 'Basant et al. 2025',
  bond2017: 'Bond et al. 2017',
  bond2015: 'Bond et al. 2015',
  heiter2015: 'Heiter et al. 2015',
  bessel1838: 'Bessel 1838',
  shakht2017: 'Shakht et al. 2017',
  kervella2008: 'Kervella et al. 2008',
  torres2015: 'Torres et al. 2015',
  monnier2012: 'Monnier et al. 2012',
  aumann1984: 'Aumann et al. 1984',
  joyce2020: 'Joyce et al. 2020',
  harper2017: 'Harper et al. 2017',
  montarges2021: 'Montargès et al. 2021',
  deAlmeida2022: 'de Almeida et al. 2022',
  vanLeeuwen2007: 'van Leeuwen 2007',
  evans2024: 'Evans et al. 2024',
  agol2021: 'Agol et al. 2021',
  gillon2017: 'Gillon et al. 2017',
  teixeira2009: 'Teixeira et al. 2009',
  hatzes2000: 'Hatzes et al. 2000',
  mann2015: 'Mann et al. 2015',
  monnier2007: 'Monnier et al. 2007',
  ohnaka2013: 'Ohnaka et al. 2013',
  schiller2008: 'Schiller & Przybilla 2008',
  ramirez2011: 'Ramírez & Allende Prieto 2011',
  marois2008: 'Marois et al. 2008',
  marois2010: 'Marois et al. 2010',
  baines2012: 'Baines et al. 2012',
  mayor1995: 'Mayor & Queloz 1995',
  nobel2019: 'nobelprize.org',
  boyajian2013: 'Boyajian et al. 2013',
  domiciano2021: 'Domiciano de Souza et al. 2021',
  tkachenko2016: 'Tkachenko et al. 2016',
  hatzes2006: 'Hatzes et al. 2006',
  mamajek2012: 'Mamajek 2012',
  che2011: 'Che et al. 2011',
  bonfils2018: 'Bonfils et al. 2018',
  astudillo2017: 'Astudillo-Defru et al. 2017',
  mayor2009: 'Mayor et al. 2009',
};

export interface StarFacts {
  facts: readonly string[];
  sources: readonly string[];
  /** Short names of the sources, in the same order. */
  labels: readonly string[];
}

const f = (...pairs: [string, keyof typeof REF][]): StarFacts => ({
  facts: pairs.map((p) => p[0]),
  sources: pairs.map((p) => REF[p[1]]),
  labels: pairs.map((p) => LABEL[p[1]]),
});

/** Facts by systems.json star id. */
export const STAR_FACTS: Readonly<Record<string, StarFacts>> = {
  'alpha-cen-a': f(
    ['A Sun-like star, a fifth larger than the Sun (1.22 solar radii) and half again as luminous.', 'akeson2021'],
    ['It and Alpha Centauri B orbit each other every 79.76 years, coming within 11.2 au of each other and parting to 35.4 au. They next come closest in 2035.', 'akeson2021'],
  ),
  'alpha-cen-b': f(
    ['An orange dwarf (K1 V), 0.86 times the Sun’s size and half as luminous.', 'akeson2021'],
    ['It orbits Alpha Centauri A every 79.76 years; together they look like one star, the third-brightest in the night sky.', 'akeson2021'],
  ),
  proxima: f(
    ['The nearest star to the Sun: 4.25 light-years, from its Gaia DR3 parallax of 768.07 milliarcseconds.', 'gaiaDr3'],
    ['A red dwarf of 12% of the Sun’s mass and 15% of its radius. It orbits Alpha Centauri A and B 12,000 to 13,000 au out, near the far end of an orbit that takes about half a million years.', 'kervella2017'],
    ['Its planet Proxima b, found in 2016, circles it every 11.2 days in the zone where water could be liquid.', 'anglada2016'],
  ),
  'barnards-star': f(
    ['Edward Emerson Barnard found in 1916 that it crosses the sky faster than any other star: 10.4 arcseconds a year, the Moon’s width in about 180 years.', 'barnard1916'],
    ['Heading our way at 110 km/s, it will pass 1.16 pc (3.8 light-years) from the Sun in about 9,700 years, on its Gaia DR3 motion.', 'gaiaDr3'],
    ['Four small planets, each less massive than Earth, were found orbiting it in 2024 and 2025.', 'basant2025'],
  ),
  'sirius-a': f(
    ['The brightest star in the night sky (V = −1.44), and at 8.6 light-years one of the nearest.', 'bond2017'],
    ['An A1 main-sequence star of 2.06 solar masses, 25 times as luminous as the Sun.', 'bond2017'],
    ['Its companion, the white dwarf Sirius B, circles it every 50.1 years.', 'bond2017'],
  ),
  'sirius-b': f(
    ['A white dwarf: the mass of the Sun (1.02 solar masses) in a ball 5,600 km in radius, smaller than Earth.', 'bond2017'],
    ['Friedrich Bessel inferred it in 1844 from the wavy path of Sirius; Alvan Graham Clark first saw it in 1862.', 'bond2017'],
    ['Its surface is at 25,400 K, over four times as hot as the Sun’s.', 'bond2017'],
  ),
  'procyon-a': f(
    ['An F5 star, twice the Sun’s radius and 6.9 times its luminosity, 11.4 light-years away.', 'heiter2015'],
    ['Its white-dwarf companion orbits it every 40.8 years; Hubble images give their masses as 1.48 and 0.59 solar masses.', 'bond2015'],
  ),
  'procyon-b': f(
    ['A white dwarf of 0.59 solar masses, 8,600 km in radius: a little larger than Earth.', 'bond2015'],
    ['At 7,740 K it is a cool white dwarf, about 15,000 times fainter in visible light than Procyon A beside it.', 'bond2015'],
  ),
  '61-cyg-a': f(
    ['The first star whose distance was measured: Friedrich Bessel found its parallax in 1838.', 'bessel1838'],
    ['It crosses the sky at 5.3 arcseconds a year, which is what made it a good candidate for Bessel.', 'gaiaDr3'],
    ['An orange dwarf (K5 V), two-thirds of the Sun’s radius.', 'kervella2008'],
  ),
  '61-cyg-b': f(
    ['A K7 dwarf, 0.59 times the Sun’s radius, the fainter of the pair Bessel measured in 1838.', 'kervella2008'],
    ['It and 61 Cygni A are 85 au apart on average and orbit each other every 664 ± 27 years; the orbit is still preliminary.', 'shakht2017'],
  ),
  'capella-aa': f(
    ['Capella is two yellow giants, each about 2.5 times the Sun’s mass, orbiting each other every 104 days. Together they are the sixth-brightest star in the sky.', 'torres2015'],
    ['Aa is the cooler and more massive of the two (12 solar radii, 4,970 K), near the end of helium burning in its core.', 'torres2015'],
  ),
  'capella-ab': f(
    ['The hotter giant of Capella (5,730 K, 8.8 solar radii), crossing the Hertzsprung gap.', 'torres2015'],
    ['It rotates once in 8.5 days, much faster than its companion.', 'torres2015'],
  ),
  canopus: f(
    ['The second-brightest star in the night sky: a bright giant 73 times the Sun’s radius and about 16,600 times as luminous.', 'domiciano2021'],
  ),
  arcturus: f(
    ['The brightest star north of the celestial equator (V = −0.05): an orange giant 25 times the Sun’s radius.', 'heiter2015'],
    ['An old star, about 7 billion years, with a third of the Sun’s share of iron.', 'ramirez2011'],
  ),
  vega: f(
    ['It spins so fast that its equator bulges: 2.73 solar radii across the equator, 2.42 from pole to pole. We see it almost pole-on.', 'monnier2012'],
    ['Its poles are at about 10,070 K and its equator at 8,910 K: the spin makes the equator cooler (gravity darkening).', 'monnier2012'],
    ['In 1983 the IRAS satellite found cold dust around it: the first debris disc seen around another star.', 'aumann1984'],
  ),
  rigel: f(
    ['A blue supergiant (B8 Ia), about 123,000 times as luminous as the Sun, though its luminosity is not well agreed.', 'deAlmeida2022'],
    ['Intensity interferometry puts it 260 ± 20 pc away, in agreement with its Hipparcos parallax (265 pc).', 'deAlmeida2022'],
  ),
  betelgeuse: f(
    ['A red supergiant about 760 times the Sun’s radius: put in place of the Sun, it would reach past the asteroid belt.', 'joyce2020'],
    ['Its distance is uncertain: 153 pc from its Hipparcos parallax, 168 pc from its pulsations, 222 pc from radio positions. Its size scales with it.', 'harper2017'],
    ['Its Great Dimming of 2019–2020, when it faded by more than a magnitude, came from a cloud of dust it had thrown off.', 'montarges2021'],
  ),
  altair: f(
    ['One of the fastest-spinning stars known, at 92% of the speed that would break it apart: its equator is 24% wider than its poles.', 'monnier2007'],
    ['The first main-sequence star besides the Sun whose surface was imaged (2007): its poles are 1,600 K hotter than its equator.', 'monnier2007'],
  ),
  aldebaran: f(
    ['An orange giant (K5 III), 45 times the Sun’s radius and 440 times as luminous: the eye of Taurus.', 'heiter2015'],
    ['Its mass is poorly known: 0.96 ± 0.41 solar masses, from evolutionary models.', 'heiter2015'],
  ),
  antares: f(
    ['A red supergiant about 680 times the Sun’s radius, the heart of Scorpius. Its size carries its 17% distance uncertainty.', 'ohnaka2013'],
    ['Interferometry with ESO’s VLTI has mapped gas moving up and down in its extended atmosphere.', 'ohnaka2013'],
  ),
  spica: f(
    ['Two hot B stars orbiting each other every 4.01 days, seen as one point. The primary pulsates (a β Cephei variable).', 'tkachenko2016'],
    ['The primary has 11.4 times the Sun’s mass and a surface at about 25,300 K.', 'tkachenko2016'],
  ),
  pollux: f(
    ['An orange giant (K0 III), 8.9 times the Sun’s radius and 40 times as luminous.', 'heiter2015'],
    ['A giant planet, Thestias (Pollux b), orbits it; its radial-velocity signal was confirmed in 2006.', 'hatzes2006'],
  ),
  fomalhaut: f(
    ['A young A3 star of 1.9 solar masses, 25 light-years away.', 'mamajek2012'],
    ['A wide belt of dust circles it about 140 au out.', 'mamajek2012'],
  ),
  deneb: f(
    ['One of the most luminous stars the eye can see: about 196,000 times the Sun at 802 pc, and 203 solar radii.', 'schiller2008'],
    ['Its distance is uncertain: 433 pc from its Hipparcos parallax (which the app uses), 802 pc from the association it belongs to.', 'schiller2008'],
  ),
  regulus: f(
    ['It spins at 96% of break-up speed: 4.21 solar radii at the equator against 3.22 at the poles.', 'che2011'],
    ['Its poles are at 14,500 K and its equator at 11,000 K.', 'che2011'],
  ),
  polaris: f(
    ['The North Star: less than a degree from the north celestial pole (0.74° in 2000).', 'vanLeeuwen2007'],
    ['A pulsating Cepheid and a triple star; the CHARA Array measured its radius at 46 solar radii.', 'evans2024'],
    ['Its mass, 5.1 solar masses, was weighed from the 30-year orbit of its close companion.', 'evans2024'],
  ),
  'tau-ceti': f(
    ['The nearest single star like the Sun (G8 V), 11.9 light-years away: a little smaller (0.79 solar radii) and cooler.', 'heiter2015'],
    ['Sun-like oscillations were detected in it with the HARPS spectrograph.', 'teixeira2009'],
  ),
  'epsilon-eridani': f(
    ['A young, active orange dwarf (K2 V), 10.5 light-years away, with a dust disc around it.', 'heiter2015'],
    ['A giant planet, Ægir, orbits it; it was found from the star’s wobble.', 'hatzes2000'],
  ),
  '51-pegasi': f(
    ['The first Sun-like star found to have a planet: 51 Pegasi b (Dimidium), a giant orbiting it every 4.2 days, announced in 1995.', 'mayor1995'],
    ['The discovery earned Michel Mayor and Didier Queloz the 2019 Nobel Prize in Physics.', 'nobel2019'],
  ),
  'hr-8799': f(
    ['The first star seen to have several planets in direct images: four giant planets, imaged in 2008 and 2010.', 'marois2008'],
    ['The fourth planet, the innermost, was imaged in 2010.', 'marois2010'],
    ['A young F0 star, about 30 million years old, 1.44 times the Sun’s radius.', 'baines2012'],
  ),
  'wolf-359': f(
    ['One of the nearest stars, 7.9 light-years away: a red dwarf of a tenth of the Sun’s mass.', 'mann2015'],
    ['Its surface is at only about 2,800 K.', 'mann2015'],
  ),
  'lalande-21185': f(['A red dwarf 8.3 light-years away, with 39% of the Sun’s mass: one of the nearest stars.', 'mann2015']),
  'ross-128': f(
    ['A quiet red dwarf 11 light-years away.', 'mann2015'],
    ['It has a temperate planet of about Earth’s mass, Ross 128 b.', 'bonfils2018'],
  ),
  'luytens-star': f(
    ['A red dwarf 12.3 light-years away, with 28% of the Sun’s mass.', 'mann2015'],
    ['Two planets were found around it in 2017; the outer one orbits in its temperate zone.', 'astudillo2017'],
  ),
  'gliese-581': f(
    ['A red dwarf 20.5 light-years away, with 29% of the Sun’s mass.', 'mann2015'],
    ['Its planets include Gliese 581 e, of about twice Earth’s mass, found in 2009.', 'mayor2009'],
  ),
  'lacaille-9352': f(['A red dwarf 10.7 light-years away, with half the Sun’s mass.', 'mann2015']),
  'trappist-1': f(
    ['An ultracool red dwarf barely larger than Jupiter (0.119 solar radii), shining at 0.055% of the Sun’s luminosity.', 'agol2021'],
    ['Seven Earth-sized planets orbit it, all closer to it than Mercury is to the Sun.', 'gillon2017'],
  ),
};

/** The data papers of the physical values (systems.json refs), as links for the data sheet. */
export const REF_LINKS: Readonly<Record<string, string>> = {
  akeson2021: REF.akeson2021,
  kervella2017prox: REF.kervella2017,
  gaiaDr3: REF.gaiaDr3,
  bond2017: REF.bond2017,
  bond2015: REF.bond2015,
  heiter2015: REF.heiter2015,
  kervella2008: REF.kervella2008,
  torres2015: REF.torres2015,
  monnier2012: REF.monnier2012,
  monnier2007: REF.monnier2007,
  joyce2020: REF.joyce2020,
  ohnaka2013: REF.ohnaka2013,
  schiller2008: REF.schiller2008,
  mamajek2012: REF.mamajek2012,
  ramirez2011: REF.ramirez2011,
  tkachenko2016: REF.tkachenko2016,
  domiciano2021: REF.domiciano2021,
  evans2024: REF.evans2024,
  deAlmeida2022: REF.deAlmeida2022,
  teixeira2009: REF.teixeira2009,
  agol2021: REF.agol2021,
  boyajian2013: REF.boyajian2013,
  baines2012: REF.baines2012,
  mann2015: REF.mann2015,
  che2011: REF.che2011,
};
