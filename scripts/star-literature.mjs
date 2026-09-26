// Literature inputs for scripts/build-stars3d.mjs: the multiple-star systems modelled with orbits, and physical
// parameters (radius, temperature, luminosity, mass) of the named stars people are most likely to visit.
//
// Every number here is copied from the cited paper or catalogue (table numbers given), or is marked as derived and
// says how. Nothing is tuned by hand. The build script turns these into staging/stars/systems.json.
//
// Conventions
//   - Angles in degrees, parallaxes and angular sizes in milliarcseconds (mas), proper motions in mas/yr with the
//     RA component already multiplied by cos(dec) (mu_alpha*), radial velocities in km/s (positive = receding).
//   - Astrometric positions are ICRS (equinox J2000) at the stated epoch (Julian year, TT).
//   - Visual-orbit ("Campbell") elements follow the usual convention for the relative orbit of the secondary about
//     the primary: position angles measured from north through east, i < 90 deg for motion with increasing position
//     angle, Omega = position angle of the ascending node (the node where the secondary recedes from us), omega =
//     argument of periastron of the secondary, T = epoch of periastron (decimal year), P in years, a in arcsec.
//   - "athygId" is the row id in the AT-HYG v4.0 catalogue (data-raw/athyg_40_reduced_m10.csv.gz); the build script
//     resolves it to the star's index in public/data/stars3d.bin.gz.

/** Reference list. Keys are used by the entries below. */
export const REFS = {
  athyg: 'AT-HYG v4.0 star catalogue (David Nash, astronexus; https://codeberg.org/astronexus/athyg), CC BY-SA 4.0',
  akeson2021: 'Akeson R. et al. 2021, AJ 162, 14 — Precision millimeter astrometry of the alpha Centauri AB system (Tables 8, 9)',
  kervella2017prox: 'Kervella P., Thevenin F., Lovis C. 2017, A&A 598, L7 — Proxima\'s orbit around alpha Centauri (Tables 1-3, B.1)',
  kervella2016: 'Kervella P. et al. 2016, A&A 594, A107 — Close stellar conjunctions of alpha Centauri A and B until 2050',
  gaiaDr3: 'Gaia Collaboration, Vallenari A. et al. 2023, A&A 674, A1 — Gaia Data Release 3 (gaiadr3.gaia_source)',
  lindegren2021: 'Lindegren L. et al. 2021, A&A 649, A4 — Gaia EDR3 parallax bias versus magnitude, colour and position',
  bond2017: 'Bond H. E. et al. 2017, ApJ 840, 70 — The Sirius system and its astrophysical puzzles (Tables 4-6; Sects. 5.1, 7)',
  bond2015: 'Bond H. E. et al. 2015, ApJ 813, 106 — Hubble Space Telescope astrometry of the Procyon system (Tables 8-10; Sect. 6)',
  irwin1992: 'Irwin A. W. et al. 1992, PASP 104, 489 — Procyon centre-of-mass velocity -4.115 km/s, as adopted by Bond et al. 2015',
  vanLeeuwen2007: 'van Leeuwen F. 2007, A&A 474, 653 — Validation of the new Hipparcos reduction (VizieR I/311)',
  esa1997: 'ESA 1997, The Hipparcos and Tycho Catalogues, ESA SP-1200 (VizieR I/239)',
  shakht2017: 'Shakht N. A., Gorshanov D. L., Vasilkova O. O. 2017, Astrophysics 60, 507 — 61 Cygni AB orbit (as listed in the WDS Sixth Orbit Catalog, grade 4 "preliminary")',
  orb6: 'Sixth Catalog of Orbits of Visual Binary Stars (Hartkopf, Mason, Matson et al.; USNO / GSU), retrieved 2026-09-25',
  kervella2008: 'Kervella P., Merand A., Pichon B. et al. 2008, A&A 488, 667 — The radii of the nearby K5V and K7V stars 61 Cyg A & B',
  soubiran2018: 'Soubiran C. et al. 2018, A&A 616, A7 — Gaia DR2 radial velocity standard stars (VizieR J/A+A/616/A7)',
  torres2015: 'Torres G., Claret A., Pavlovski K. et al. 2015, ApJ 807, 26 — Capella (alpha Aurigae) revisited (Tables 1, 3)',
  heiter2015: 'Heiter U. et al. 2015, A&A 582, A49 — Gaia FGK benchmark stars: effective temperatures and surface gravities (Tables 4, 7, 10)',
  mann2015: 'Mann A. W. et al. 2015, ApJ 804, 64 — How to constrain your M dwarf (VizieR J/ApJ/804/64)',
  segransan2003: 'Segransan D. et al. 2003, A&A 397, L5 — First radius measurements of very low mass stars with the VLTI',
  monnier2012: 'Monnier J. D. et al. 2012, ApJL 761, L3 — Resolving Vega and the inclination controversy with CHARA/MIRC (Table 2, concordance model)',
  monnier2007: 'Monnier J. D. et al. 2007, Science 317, 342 — Imaging the surface of Altair (Table 1, beta-free model)',
  che2011: 'Che X. et al. 2011, ApJ 732, 68 — Colder and hotter: interferometric imaging of beta Cas and alpha Leo (alpha Leo, modified von Zeipel model)',
  joyce2020: 'Joyce M. et al. 2020, ApJ 902, 63 — New mass and distance estimates for Betelgeuse',
  levesque2020: 'Levesque E. M., Massey P. 2020, ApJL 891, L37 — Betelgeuse just isn\'t that cool',
  harper2017: 'Harper G. M. et al. 2017, AJ 154, 11 — An updated 2017 astrometric solution for Betelgeuse',
  ohnaka2013: 'Ohnaka K. et al. 2013, A&A 555, A24 — Imaging the dynamical atmosphere of Antares with VLTI/AMBER',
  schiller2008: 'Schiller F., Przybilla N. 2008, A&A 479, 849 — Quantitative spectroscopy of Deneb',
  mamajek2012: 'Mamajek E. E. 2012, ApJL 754, L20 — On the age and binarity of Fomalhaut',
  ramirez2011: 'Ramirez I., Allende Prieto C. 2011, ApJ 743, 135 — Fundamental parameters and chemical composition of Arcturus',
  tkachenko2016: 'Tkachenko A. et al. 2016, MNRAS 458, 1964 — Stellar modelling of Spica (Table 4 and abstract)',
  domiciano2021: 'Domiciano de Souza A. et al. 2021, A&A 654, A19 — Refined fundamental parameters of Canopus (Table 4)',
  evans2024: 'Evans N. R. et al. 2024, ApJ 971, 190 — The orbit and dynamical mass of Polaris: observations with the CHARA Array',
  deAlmeida2022: 'de Almeida E. S. G. et al. 2022, MNRAS 515, 1 — Combined spectroscopy and intensity interferometry to determine the distances of P Cygni and Rigel',
  teixeira2009: 'Teixeira T. C. et al. 2009, A&A 494, 237 — Solar-like oscillations in the G8 V star tau Ceti',
  ribas2018: 'Ribas I. et al. 2018, Nature 563, 365 — A candidate super-Earth planet orbiting near the snow line of Barnard\'s star',
  agol2021: 'Agol E. et al. 2021, PSJ 2, 1 — Refining the transit-timing and photometric analysis of TRAPPIST-1 (Table 7)',
  costa2006: 'Costa E. et al. 2006, AJ 132, 1234 — TRAPPIST-1 (2MASS J23062928-0502285) V = 18.798 +- 0.082, via SIMBAD',
  simbadRvTrappist: 'Radial velocity -52.003 +- 0.134 km/s as listed by SIMBAD from 2020AJ....160..120J',
  boyajian2013: 'Boyajian T. S. et al. 2013, ApJ 771, 40 — Stellar diameters and temperatures III (VizieR J/ApJ/771/40, tables 2 and 5)',
  baines2012: 'Baines E. K. et al. 2012, ApJ 761, 57 — The CHARA Array angular diameter of HR 8799',
  iau2015b3: 'IAU 2015 Resolution B3 on recommended nominal conversion constants (Prsa A. et al. 2016, AJ 152, 41)',
};

// Solar reference values used to turn angular diameters and bolometric fluxes into radii and luminosities.
export const SUN = {
  radiusKm: 695700, // IAU 2015 B3 nominal solar radius
  luminosityW: 3.828e26, // IAU 2015 B3 nominal solar luminosity
  teffK: 5772, // IAU 2015 B3 nominal solar effective temperature
  gmM3s2: 1.3271244e20, // IAU 2015 B3 nominal solar mass parameter
};

/**
 * The systems modelled with Keplerian orbits. Each has a barycentre (astrometry below, propagated linearly with its
 * space motion) and one or more two-body orbits between groups of members.
 */
export const SYSTEMS = [
  {
    id: 'alpha-centauri',
    name: 'Alpha Centauri',
    note:
      'Hierarchical triple. A and B orbit each other every 79.76 yr (Akeson et al. 2021). Proxima orbits the AB pair ' +
      'at about 8,000-13,000 au. Its orbit here is the osculating Kepler orbit computed from present-day astrometry ' +
      '(Gaia DR3 for Proxima, Akeson et al. 2021 for the AB barycentre) and gravitational-redshift-corrected radial ' +
      'velocities (Kervella et al. 2017), the same method as Kervella et al. 2017. With the newer, larger AB parallax ' +
      'the orbit comes out a little smaller than their published one; both are listed.',
    // Barycentre of A+B (not of the triple); the build adds Proxima's reflex motion to get the triple barycentre.
    barycentre: {
      of: ['alpha-cen-a', 'alpha-cen-b'],
      raDeg: 219.85892215,
      decDeg: -60.83163195,
      epochJyr: 2019.5,
      parallaxMas: 750.81,
      parallaxErrMas: 0.38,
      pmRaMasYr: -3639.95,
      pmDecMasYr: 700.4,
      // Barycentric RV V0 = -22.3796 km/s fitted to HARPS data (Akeson 2021 Table 8) plus the +0.0614 km/s correction
      // for alpha Cen A's gravitational redshift relative to the Sun derived by Kervella et al. 2017 for the same data.
      rvKms: -22.3796 + 0.0614,
      rvNote: 'Akeson et al. 2021 V0 = -22.3796 km/s + 0.0614 km/s gravitational-redshift correction (Kervella et al. 2017, Sect. 2.3)',
      refs: ['akeson2021', 'kervella2017prox'],
    },
    members: ['alpha-cen-a', 'alpha-cen-b', 'proxima'],
    orbits: [
      {
        id: 'alpha-cen-ab',
        kind: 'visual',
        primary: ['alpha-cen-a'],
        secondary: ['alpha-cen-b'],
        periodYr: 79.762,
        aArcsec: 17.493,
        e: 0.51947,
        iDeg: 79.243,
        OmegaDeg: 205.073,
        omegaDeg: 231.519,
        tPeriYr: 1955.564,
        parallaxMas: 750.81,
        uncertainty: { periodYr: 0.019, aArcsec: 0.0096, e: 0.00015, iDeg: 0.0089, OmegaDeg: 0.025, omegaDeg: 0.027, tPeriYr: 0.015 },
        refs: ['akeson2021'],
        grade: 'ORB6 grade 2 (good)',
        orb6Ephemeris: [[2025, 9.2, 8.737], [2026, 11.9, 9.294], [2027, 14.3, 9.765], [2028, 16.5, 10.121], [2029, 18.6, 10.329]],
      },
      {
        id: 'proxima-ab',
        kind: 'state',
        primary: ['alpha-cen-a', 'alpha-cen-b'],
        secondary: ['proxima'],
        // Proxima astrometry at J2016.0 (Gaia DR3 source 5853498713190525696) and absolute RV (Kervella 2017).
        secondaryAstrometry: {
          raDeg: 217.39232147200883,
          decDeg: -62.67607511676666,
          epochJyr: 2016.0,
          parallaxMas: 768.0665391873573,
          parallaxErrMas: 0.049872905,
          pmRaMasYr: -3781.741008265163,
          pmDecMasYr: 769.4650146478623,
          rvKms: -22.204,
          rvNote: 'Absolute RV from chromospheric emission lines, corrected for gravitational redshift (Kervella et al. 2017, Sect. 2.3)',
          refs: ['gaiaDr3', 'kervella2017prox'],
        },
        published: {
          ref: 'kervella2017prox',
          aKau: 8.7,
          aErrKau: [-0.4, 0.7],
          e: 0.5,
          eErr: [-0.09, 0.08],
          periodKyr: 547,
          periodErrKyr: [-40, 66],
          iDeg: 107.6,
          OmegaDeg: 126,
          omegaDeg: 72.3,
          tPeriKyrFromNow: 283,
          note: 'Computed by Kervella et al. with parallax 747.17 mas for AB (Kervella et al. 2016) and 768.77 mas for Proxima (Benedict et al. 1999).',
        },
      },
    ],
  },
  {
    id: 'sirius',
    name: 'Sirius',
    note: 'Sirius A (A1 V) and the white dwarf Sirius B on a 50.13-yr orbit (Bond et al. 2017).',
    barycentre: {
      of: ['sirius-a', 'sirius-b'],
      // Hipparcos (van Leeuwen 2007) astrometry of Sirius. HIP 32349 carries an orbital-binary solution (old solution
      // type 4, "orbital binary"), whose five parameters describe the centre of mass; Bond et al. 2017 use this proper
      // motion for the system. Checked in the build against the Gaia DR3 position of Sirius B.
      raDeg: 101.28854105,
      decDeg: -16.71314306,
      epochJyr: 1991.25,
      parallaxMas: 378.9, // weighted mean adopted by Bond et al. 2017 (Table 5)
      parallaxErrMas: 1.4,
      pmRaMasYr: -546.01,
      pmDecMasYr: -1223.07,
      rvKms: -8.47,
      rvNote: 'System velocity -7.70 km/s corrected for the gravitational redshift of Sirius A (Bond et al. 2017, Sect. 5.1)',
      refs: ['vanLeeuwen2007', 'bond2017'],
    },
    members: ['sirius-a', 'sirius-b'],
    orbits: [
      {
        id: 'sirius-ab',
        kind: 'visual',
        primary: ['sirius-a'],
        secondary: ['sirius-b'],
        periodYr: 50.1284,
        aArcsec: 7.4957,
        e: 0.59142,
        iDeg: 136.336,
        OmegaDeg: 45.4,
        omegaDeg: 149.161,
        tPeriYr: 1994.5715,
        parallaxMas: 378.9,
        uncertainty: { periodYr: 0.0043, aArcsec: 0.0025, e: 0.00037, iDeg: 0.04, OmegaDeg: 0.071, omegaDeg: 0.075, tPeriYr: 0.0058 },
        refs: ['bond2017'],
        grade: 'ORB6 grade 2 (good)',
        orb6Ephemeris: [[2025, 59.0, 11.256], [2026, 57.1, 11.163], [2027, 55.2, 11.032], [2028, 53.3, 10.861], [2029, 51.2, 10.648]],
      },
    ],
  },
  {
    id: 'procyon',
    name: 'Procyon',
    note: 'Procyon A (F5 IV-V) and the white dwarf Procyon B on a 40.84-yr orbit (Bond et al. 2015).',
    barycentre: {
      of: ['procyon-a', 'procyon-b'],
      // Hipparcos (van Leeuwen 2007) astrometry of HIP 37279, orbital-binary solution (old solution type 4).
      raDeg: 114.82724202,
      decDeg: 5.22750758,
      epochJyr: 1991.25,
      parallaxMas: 285.0, // weighted mean adopted by Bond et al. 2015 (Table 9)
      parallaxErrMas: 0.7,
      pmRaMasYr: -714.59,
      pmDecMasYr: -1036.8,
      rvKms: -4.115,
      rvNote: 'Centre-of-mass velocity of Irwin et al. 1992 as adopted by Bond et al. 2015 (not corrected for gravitational redshift)',
      refs: ['vanLeeuwen2007', 'bond2015', 'irwin1992'],
    },
    members: ['procyon-a', 'procyon-b'],
    orbits: [
      {
        id: 'procyon-ab',
        kind: 'visual',
        primary: ['procyon-a'],
        secondary: ['procyon-b'],
        periodYr: 40.84,
        aArcsec: 4.3075,
        e: 0.39785,
        iDeg: 31.408,
        OmegaDeg: 100.683,
        omegaDeg: 89.23,
        tPeriYr: 1968.076,
        parallaxMas: 285.0,
        uncertainty: { periodYr: 0.022, aArcsec: 0.0016, e: 0.00025, iDeg: 0.05, OmegaDeg: 0.095, omegaDeg: 0.11, tPeriYr: 0.023 },
        refs: ['bond2015'],
        grade: 'ORB6 grade 3 (reliable)',
        orb6Ephemeris: [[2025, 348.7, 5.07], [2026, 353.7, 5.101], [2027, 358.6, 5.122], [2028, 3.4, 5.135], [2029, 8.3, 5.139]],
        measured: [[2013.0947, 269.432, 3.316, 'HST, Bond et al. 2015 Table 3'], [2014.7038, 285.721, 3.7966, 'HST, Bond et al. 2015 Table 3']],
      },
    ],
  },
  {
    id: '61-cygni',
    name: '61 Cygni',
    note:
      'Two K dwarfs about 85 au apart. Only about a third of the orbit has been observed since 1753, so the orbit is ' +
      'preliminary (ORB6 grade 4; period 664 +- 27 yr). Positions near the present are reliable; far from it they are not.',
    // Barycentre computed in the build from the Gaia DR3 astrometry of both stars, weighted by the model masses.
    barycentreFromMembers: true,
    members: ['61-cyg-a', '61-cyg-b'],
    orbits: [
      {
        id: '61-cyg-ab',
        kind: 'visual',
        primary: ['61-cyg-a'],
        secondary: ['61-cyg-b'],
        periodYr: 664.37,
        aArcsec: 24.36,
        e: 0.457,
        iDeg: 53.29,
        OmegaDeg: 174.88,
        omegaDeg: 149.32,
        tPeriYr: 1700.37,
        parallaxMas: null, // the build uses the mass-weighted Gaia DR3 parallax of the pair
        uncertainty: { periodYr: 26.84, aArcsec: 0.47, e: 0.034, iDeg: 1.87, OmegaDeg: 1.8, omegaDeg: 5.97, tPeriYr: 12.95 },
        refs: ['shakht2017', 'orb6'],
        grade: 'ORB6 grade 4 (preliminary)',
        orb6Ephemeris: [[2025, 154.0, 32.04], [2026, 154.1, 32.088], [2027, 154.3, 32.136], [2028, 154.5, 32.182], [2029, 154.6, 32.229]],
      },
    ],
  },
  {
    id: 'capella',
    name: 'Capella',
    note:
      'Two giant stars 0.74 au apart on a 104-day, almost circular orbit (Torres et al. 2015). The system has a more ' +
      'distant pair of red dwarfs (Capella H and L) that is not modelled here.',
    barycentre: {
      of: ['capella-aa', 'capella-ab'],
      // Hipparcos (van Leeuwen 2007) position of HIP 24608 at 1991.25; Torres et al. 2015 fit sub-mas corrections to the
      // Hipparcos catalogue position (-0.53, -0.37 mas), which are below this file's precision and are not applied.
      raDeg: 79.17206466,
      decDeg: 45.99902905,
      epochJyr: 1991.25,
      parallaxMas: 75.994, // orbital parallax, Torres et al. 2015 Table 1
      parallaxErrMas: 0.089,
      pmRaMasYr: 75.85,
      pmDecMasYr: -427.17,
      rvKms: 29.9387,
      rvNote: 'Centre-of-mass velocity gamma (Torres et al. 2015 Table 1), not corrected for gravitational redshift',
      refs: ['vanLeeuwen2007', 'torres2015'],
    },
    members: ['capella-aa', 'capella-ab'],
    orbits: [
      {
        id: 'capella-aab',
        kind: 'visual',
        primary: ['capella-aa'],
        secondary: ['capella-ab'],
        periodYr: 104.02128 / 365.25,
        aArcsec: 0.056442,
        e: 0.00089,
        iDeg: 137.156,
        OmegaDeg: 40.522,
        // Torres et al. give omega of the primary (star A); the secondary's relative orbit has omega + 180 deg.
        omegaDeg: 342.6 + 180 - 360,
        tPeriJD: 2448147.6, // HJD; the ~0.005-day HJD/JD(TT) difference is far below the 2.6-day uncertainty
        parallaxMas: 75.994,
        uncertainty: { periodYr: 0.00016 / 365.25, aArcsec: 0.000023, e: 0.00011, iDeg: 0.046, OmegaDeg: 0.039, omegaDeg: 9.0, tPeriDays: 2.6 },
        refs: ['torres2015'],
        grade: 'ORB6 grade 1 (definitive)',
        orb6Ephemeris: [[2025, 252.4, 0.051], [2026, 68.9, 0.052], [2027, 245.4, 0.053], [2028, 62.1, 0.053], [2029, 238.8, 0.054]],
      },
    ],
  },
];

/**
 * Physical parameters of individual stars. Units: masses M_sun, radii R_sun, luminosities L_sun, temperatures K.
 * `angularDiameter` (limb-darkened, mas) with `fbol` (bolometric flux at Earth, W/m^2) lets the build derive R, L and
 * Teff consistently with the adopted distance: R = theta/2 * d, L = 4 pi d^2 F, Teff = (4 F / (sigma theta^2))^(1/4).
 */
export const STARS = [
  { id: 'sun', name: 'Sun', athygId: null, spectralType: 'G2 V', massMsun: 1, radiusRsun: 1, luminosityLsun: 1, teffK: 5772, refs: { all: 'iau2015b3' } },

  // Alpha Centauri
  {
    id: 'alpha-cen-a', name: 'Alpha Centauri A', altNames: ['Rigil Kentaurus'], athygId: 1455072, hip: 71683, spectralType: 'G2 V',
    massMsun: 1.0788, massErr: 0.0029, radiusRsun: 1.2175, radiusErr: 0.0055, luminosityLsun: 1.5059, luminosityErr: 0.0019,
    teffK: 5792, teffErr: 16, vMag: -0.01,
    refs: { mass: 'akeson2021', radius: 'akeson2021', luminosity: 'akeson2021', teff: 'heiter2015', vMag: 'esa1997' },
  },
  {
    id: 'alpha-cen-b', name: 'Alpha Centauri B', altNames: ['Toliman'], athygId: 1455030, hip: 71681, spectralType: 'K1 V',
    massMsun: 0.9092, massErr: 0.0025, radiusRsun: 0.8591, radiusErr: 0.0036, luminosityLsun: 0.4981, luminosityErr: 0.0007,
    teffK: 5231, teffErr: 20, vMag: 1.35,
    refs: { mass: 'akeson2021', radius: 'akeson2021', luminosity: 'akeson2021', teff: 'heiter2015', vMag: 'esa1997' },
  },
  {
    id: 'proxima', name: 'Proxima Centauri', altNames: ['Alpha Centauri C', 'V645 Cen', 'GJ 551'], athygId: 1440825, hip: 70890, spectralType: 'M5.5 Ve',
    massMsun: 0.1221, massErr: 0.0022, radiusRsun: 0.1542, radiusErr: 0.0045, teffK: 3042, teffErr: 117,
    refs: { mass: 'kervella2017prox', radius: 'kervella2017prox', teff: 'segransan2003' },
    notes: 'Mass and radius are from the Mann et al. (2015) M-dwarf relations as tabulated by Kervella et al. 2017 (Table 1). A flare star.',
  },

  // Sirius
  {
    id: 'sirius-a', name: 'Sirius A', altNames: ['Sirius', 'Alpha Canis Majoris'], athygId: 586693, hip: 32349, spectralType: 'A1 V',
    massMsun: 2.063, massErr: 0.023, radiusRsun: 1.7144, radiusErr: 0.009, luminosityLsun: 24.74, luminosityErr: 0.7, teffK: 9845, teffErr: 64, vMag: -1.44,
    refs: { all: 'bond2017', vMag: 'esa1997' },
    notes: 'Radius, luminosity and temperature are the Davis et al. (2011) values rescaled by Bond et al. 2017 to parallax 378.9 mas.',
  },
  {
    id: 'sirius-b', name: 'Sirius B', athygId: 586689, spectralType: 'DA2 (white dwarf)',
    massMsun: 1.018, massErr: 0.011, radiusRsun: 0.008098, radiusErr: 0.000046, luminosityLsun: 0.02448, luminosityErr: 0.00033, teffK: 25369, teffErr: 46, vMag: 8.44,
    refs: { all: 'bond2017', vMag: 'athyg' },
    notes: 'Radius is about 0.84 Earth radii. V = 8.44 is the AT-HYG (Gliese) value.',
  },

  // Procyon
  {
    id: 'procyon-a', name: 'Procyon A', altNames: ['Procyon', 'Alpha Canis Minoris'], athygId: 751261, hip: 37279, spectralType: 'F5 IV-V',
    massMsun: 1.478, massErr: 0.012, angularDiameterMas: 5.39, angularDiameterErr: 0.03, fbolWm2: 17.86e-9, fbolErr: 0.89e-9, teffK: 6554, teffErr: 84, vMag: 0.40,
    adoptParallaxFromSystem: true,
    refs: { mass: 'bond2015', angularDiameter: 'heiter2015', fbol: 'heiter2015', teff: 'heiter2015', vMag: 'esa1997' },
    notes: 'V = 0.40 is the Hipparcos (ground-based) V of the pair; Procyon B (V = 10.82) adds less than 0.001 mag to it.',
  },
  {
    id: 'procyon-b', name: 'Procyon B', athygId: 751230, spectralType: 'DQZ (white dwarf)',
    massMsun: 0.592, massErr: 0.006, radiusRsun: 0.01232, radiusErr: 0.00032, teffK: 7740, teffErr: 50, vMag: 10.82,
    refs: { all: 'bond2015' },
  },

  // 61 Cygni
  {
    id: '61-cyg-a', name: '61 Cygni A', athygId: 2281900, hip: 104214, gaiaDr3: '1872046609345556480', spectralType: 'K5 V',
    massMsun: 0.69, massErr: 0.05, angularDiameterMas: 1.775, angularDiameterErr: 0.013, fbolWm2: 0.3844e-9, fbolErr: 0.0051e-9, teffK: 4374, teffErr: 22,
    rvKms: -65.975, rvErr: 0.117,
    refs: { mass: 'heiter2015', angularDiameter: 'kervella2008', fbol: 'heiter2015', teff: 'heiter2015', rv: 'gaiaDr3' },
    notes: 'Mass from CESAM2k evolutionary models (Kervella et al. 2008) as tabulated by Heiter et al. 2015.',
  },
  {
    id: '61-cyg-b', name: '61 Cygni B', athygId: 2281977, hip: 104217, gaiaDr3: '1872046574983497216', spectralType: 'K7 V',
    massMsun: 0.61, massErr: 0.05, angularDiameterMas: 1.581, angularDiameterErr: 0.022, fbolWm2: 0.2228e-9, fbolErr: 0.0032e-9, teffK: 4044, teffErr: 32,
    rvKms: -64.594, rvErr: 0.118,
    refs: { mass: 'heiter2015', angularDiameter: 'kervella2008', fbol: 'heiter2015', teff: 'heiter2015', rv: 'gaiaDr3' },
    notes: 'Soubiran et al. 2018 give -64.248 +- 0.089 km/s from ground-based spectra; the Gaia DR3 value is used for both stars so that their difference is on one scale.',
  },

  // Capella
  {
    id: 'capella-aa', name: 'Capella Aa', altNames: ['Capella'], athygId: 393828, hip: 24608, spectralType: 'K0 III',
    massMsun: 2.5687, massErr: 0.0074, radiusRsun: 11.98, radiusErr: 0.57, luminosityLsun: 78.7, luminosityErr: 4.2, teffK: 4970, teffErr: 50,
    absVMag: 0.296, refs: { all: 'torres2015' },
    notes: 'The cooler, more massive giant, near the end of core helium burning (red clump).',
  },
  {
    id: 'capella-ab', name: 'Capella Ab', athygId: 393805, spectralType: 'G1 III',
    massMsun: 2.4828, massErr: 0.0067, radiusRsun: 8.83, radiusErr: 0.33, luminosityLsun: 72.7, luminosityErr: 3.6, teffK: 5730, teffErr: 60,
    absVMag: 0.167, refs: { all: 'torres2015' },
    notes: 'The hotter giant, crossing the Hertzsprung gap; rotates in 8.5 days.',
  },

  // Bright stars
  {
    id: 'canopus', name: 'Canopus', athygId: 532909, hip: 30438, spectralType: 'A9 II',
    angularDiameterMas: 7.184, angularDiameterErr: 0.029, radiusRsun: 73.3, radiusErr: 5.2, luminosityLsun: 10 ** 4.221, logLErr: 0.018, teffK: 7657, teffErr: 161, massMsun: 9.81, massErr: 1.83,
    refs: { all: 'domiciano2021' },
  },
  {
    id: 'arcturus', name: 'Arcturus', athygId: 1421102, hip: 69673, spectralType: 'K1.5 III',
    angularDiameterMas: 21.05, angularDiameterErr: 0.21, fbolWm2: 49.8e-9, fbolErr: 1.2948e-9,
    massMsun: 1.08, massErr: 0.06, teffK: 4286, teffErr: 30, luminosityLsun: 170, luminosityErr: 8,
    refs: { angularDiameter: 'heiter2015', fbol: 'heiter2015', mass: 'ramirez2011', teff: 'ramirez2011', luminosity: 'ramirez2011' },
  },
  {
    id: 'vega', name: 'Vega', athygId: 1897139, hip: 91262, spectralType: 'A0 V',
    radiusRsun: 2.726, radiusErr: 0.006, radiusPolarRsun: 2.418, radiusPolarErr: 0.012, teffK: 9360, teffErr: 90, teffPolarK: 10070, teffEquatorK: 8910,
    luminosityLsun: 47.2, luminosityErr: 2.0, massMsun: 2.15, massErr: 0.12, inclinationDeg: 6.2,
    refs: { all: 'monnier2012' },
    notes: 'A fast rotator seen almost pole-on: equator 2.73 R_sun at 8,910 K, poles 2.42 R_sun at 10,070 K. teffK is the surface average.',
  },
  {
    id: 'rigel', name: 'Rigel', athygId: 390195, hip: 24436, spectralType: 'B8 Ia',
    luminosityLsun: 123000,
    refs: { luminosity: 'deAlmeida2022' },
    notes:
      'Blue supergiant. Its luminosity is not well agreed; 123,000 L_sun is the value de Almeida et al. 2022 adopt as ' +
      'consistent with the Hipparcos parallax (3.78 +- 0.34 mas, 265 pc); their intensity interferometry gives 260 +- 20 pc. ' +
      'No radius or temperature is given here because no source was verified for this file; the catalogue colour temperature applies.',
  },
  {
    id: 'betelgeuse', name: 'Betelgeuse', athygId: 464934, hip: 27989, spectralType: 'M1-M2 Ia-ab',
    radiusRsun: 764, radiusErrPlus: 116, radiusErrMinus: 62, massMsunRange: [16.5, 19], teffK: 3600, teffErr: 25,
    distancePc: 168, distanceErrPlus: 27, distanceErrMinus: 15,
    refs: { radius: 'joyce2020', mass: 'joyce2020', distance: 'joyce2020', teff: 'levesque2020' },
    notes:
      'Distance is uncertain: Hipparcos 2007 gives 6.55 +- 0.83 mas (153 pc), Harper et al. 2017 combine it with radio ' +
      'positions to get 222 (+48 -34) pc, and Joyce et al. 2020 find 168 (+27 -15) pc from seismic and evolutionary ' +
      'modelling. The radius scales with the adopted distance. The star is a semiregular variable (V = 0.0 to 1.6).',
  },
  {
    id: 'altair', name: 'Altair', athygId: 2095118, hip: 97649, spectralType: 'A7 V',
    radiusRsun: 2.029, radiusErr: 0.007, radiusPolarRsun: 1.634, radiusPolarErr: 0.011, teffPolarK: 8450, teffPolarErr: 140, teffEquatorK: 6860, teffEquatorErr: 150,
    massMsun: 1.791, inclinationDeg: 57.2,
    refs: { all: 'monnier2007' },
    notes: 'Spins at 92% of break-up: 24% wider at the equator than pole to pole, and 1,600 K cooler there (gravity darkening). The mass is an assumed input of the model.',
  },
  {
    id: 'aldebaran', name: 'Aldebaran', athygId: 334972, hip: 21421, spectralType: 'K5 III',
    angularDiameterMas: 20.58, angularDiameterErr: 0.03, fbolWm2: 33.57e-9, fbolErr: 1.35e-9, teffK: 3927, teffErr: 40, massMsun: 0.96, massErr: 0.41,
    refs: { all: 'heiter2015' },
    notes: 'Mass from evolutionary tracks, uncertain by 43%.',
  },
  {
    id: 'antares', name: 'Antares', athygId: 1624576, hip: 80763, spectralType: 'M1.5 Iab',
    angularDiameterMas: 37.38, angularDiameterErr: 0.06, teffK: 3660, teffErr: 120, luminosityLsun: 10 ** 4.88, logLErr: 0.23, massMsun: 15, massErr: 5,
    refs: { all: 'ohnaka2013' },
    notes: 'Radius follows from the angular diameter and the Hipparcos 2007 parallax (5.89 +- 1.00 mas), so it carries a 17% distance uncertainty.',
  },
  {
    id: 'spica', name: 'Spica', athygId: 1348808, hip: 65474, spectralType: 'B1 III-IV + B2 V',
    massMsun: 11.43, massErr: 1.15, radiusRsun: 7.47, radiusErr: 0.54, teffK: 25300, teffErr: 500,
    companion: { massMsun: 7.21, massErr: 0.75, radiusRsun: 3.74, radiusErr: 0.53, teffK: 20900, teffErr: 800, periodDays: 4.0145 },
    refs: { all: 'tkachenko2016' },
    notes: 'A 4-day double-lined binary; the catalogue has one point for both stars. Values are for the primary; the companion is listed separately.',
  },
  {
    id: 'pollux', name: 'Pollux', athygId: 769254, hip: 37826, spectralType: 'K0 III',
    angularDiameterMas: 7.98, angularDiameterErr: 0.08, fbolWm2: 11.82e-9, fbolErr: 0.5319e-9, teffK: 4858, teffErr: 60, massMsun: 2.3, massErr: 0.4,
    refs: { all: 'heiter2015' },
    notes: 'Hosts the giant planet Pollux b (Thestias).',
  },
  {
    id: 'fomalhaut', name: 'Fomalhaut', athygId: 2475217, hip: 113368, spectralType: 'A3 V',
    teffK: 8590, teffErr: 73, radiusRsun: 1.842, radiusErr: 0.019, luminosityLsun: 16.63, luminosityErr: 0.48, massMsun: 1.92, massErr: 0.02,
    refs: { all: 'mamajek2012' },
    notes: 'Surrounded by a dust belt at about 140 au.',
  },
  {
    id: 'deneb', name: 'Deneb', athygId: 2226494, hip: 102098, spectralType: 'A2 Ia',
    teffK: 8525, teffErr: 75, radiusRsun: 203, radiusErr: 17, luminosityLsun: 196000, luminosityErr: 32000, massMsun: 19, massErr: 3,
    distancePc: 802, distanceErr: 66,
    refs: { all: 'schiller2008' },
    notes:
      'Distance is the main uncertainty. Schiller & Przybilla 2008 adopt 802 +- 66 pc from membership of Cyg OB7; the ' +
      'Hipparcos 2007 parallax (2.31 +- 0.32 mas) implies 433 pc, which the catalogue uses. The radius and luminosity ' +
      'listed here belong with 802 pc.',
  },
  {
    id: 'regulus', name: 'Regulus', athygId: 1066234, hip: 49669, spectralType: 'B8 IVn',
    radiusRsun: 4.21, radiusErrPlus: 0.07, radiusErrMinus: 0.06, radiusPolarRsun: 3.22, teffPolarK: 14520, teffEquatorK: 11010, luminosityLsun: 341, luminosityErrPlus: 27, luminosityErrMinus: 28, massMsun: 4.15, massErr: 0.06,
    refs: { all: 'che2011' },
    notes: 'Spins at 96% of break-up; equatorial radius 4.21, polar radius 3.22 R_sun. Mass from evolutionary tracks.',
  },
  {
    id: 'polaris', name: 'Polaris', athygId: 192011, hip: 11767, spectralType: 'F7 Ib (Cepheid)',
    angularDiameterMas: 3.143, angularDiameterErr: 0.027, radiusRsun: 46.27, radiusErr: 0.42, massMsun: 5.13, massErr: 0.28, distancePc: 136.9, distanceErr: 0.34,
    refs: { all: 'evans2024' },
    notes:
      'A pulsating Cepheid with a close companion (Polaris Ab, 30-yr orbit). Evans et al. 2024 use the Gaia DR3 parallax ' +
      'of the wide companion Polaris B (136.9 pc); Hipparcos 2007 gives 7.54 +- 0.11 mas (133 pc). No temperature is ' +
      'given here; the catalogue colour temperature applies.',
  },
  {
    id: 'tau-ceti', name: 'Tau Ceti', athygId: 131126, hip: 8102, spectralType: 'G8 V',
    angularDiameterMas: 2.015, angularDiameterErr: 0.011, fbolWm2: 1.162e-9, fbolErr: 0.0128e-9, teffK: 5414, teffErr: 21, massMsun: 0.783, massErr: 0.012,
    refs: { angularDiameter: 'heiter2015', fbol: 'heiter2015', teff: 'heiter2015', mass: 'teixeira2009' },
  },
  {
    id: 'epsilon-eridani', name: 'Epsilon Eridani', altNames: ['Ran'], athygId: 261390, hip: 16537, spectralType: 'K2 V',
    angularDiameterMas: 2.126, angularDiameterErr: 0.014, fbolWm2: 1.0e-9, fbolErr: 0.02e-9, teffK: 5076, teffErr: 30, massMsun: 0.8, massErr: 0.06,
    refs: { all: 'heiter2015' },
    notes: 'A young, active star with a dust disc and a giant planet (AEgir).',
  },
  {
    id: '51-pegasi', name: '51 Pegasi', altNames: ['Helvetios'], athygId: 2474937, hip: 113357, spectralType: 'G2 IV',
    angularDiameterMas: 0.685, angularDiameterErr: 0.011, fbolWm2: 17.08e-11, fbolErr: 0.03e-11,
    refs: { angularDiameter: 'boyajian2013', fbol: 'boyajian2013' },
    notes: 'First Sun-like star found to host a planet (51 Peg b, Dimidium; Mayor & Queloz 1995). Teff is derived here from the angular diameter and bolometric flux.',
  },
  {
    id: 'hr-8799', name: 'HR 8799', athygId: 2489329, hip: 114189, spectralType: 'F0 V (lambda Boo)',
    angularDiameterMas: 0.342, angularDiameterErr: 0.008, radiusRsun: 1.44, radiusErr: 0.06, teffK: 7193, teffErr: 87, luminosityLsun: 5.05, luminosityErr: 0.29, massMsun: 1.516, massErrPlus: 0.038, massErrMinus: 0.024,
    refs: { all: 'baines2012' },
    notes: 'Host of four directly imaged giant planets. The mass assumes the star is still contracting toward the main sequence (age ~30 Myr).',
  },
  {
    id: 'barnards-star', name: "Barnard's Star", athygId: 1794252, hip: 87937, spectralType: 'M3.5 V',
    massMsun: 0.163, massErr: 0.022, radiusRsun: 0.178, radiusErr: 0.011, luminosityLsun: 0.00329, luminosityErr: 0.00019, teffK: 3278, teffErr: 51,
    refs: { all: 'ribas2018' },
    notes: 'Largest proper motion of any star (10.4 arcsec per year). Straight-line motion from its Gaia DR3 astrometry brings it to 1.16 pc from the Sun in about 9,700 years.',
  },
  {
    id: 'wolf-359', name: 'Wolf 359', athygId: 1146038, spectralType: 'M6 V',
    massMsun: 0.0997, massErr: 0.01, radiusRsun: 0.1348, radiusErr: 0.0058, teffK: 2818, teffErr: 60,
    refs: { all: 'mann2015' },
  },
  {
    id: 'lalande-21185', name: 'Lalande 21185', athygId: 1156875, hip: 54035, spectralType: 'M2 V',
    massMsun: 0.386, massErr: 0.039, radiusRsun: 0.389, radiusErr: 0.013, teffK: 3563, teffErr: 60,
    refs: { all: 'mann2015' },
  },
  {
    id: 'ross-128', name: 'Ross 128', athygId: 1219330, hip: 57548, spectralType: 'M4 V',
    massMsun: 0.168, massErr: 0.017, radiusRsun: 0.1967, radiusErr: 0.0077, teffK: 3192, teffErr: 60,
    refs: { all: 'mann2015' },
  },
  {
    id: 'luytens-star', name: "Luyten's Star", athygId: 716014, hip: 36208, spectralType: 'M3.5 V',
    massMsun: 0.283, massErr: 0.028, radiusRsun: 0.315, radiusErr: 0.012, teffK: 3317, teffErr: 60,
    refs: { all: 'mann2015' },
  },
  {
    id: 'gliese-581', name: 'Gliese 581', athygId: 1511817, hip: 74995, spectralType: 'M3 V',
    massMsun: 0.292, massErr: 0.029, radiusRsun: 0.311, radiusErr: 0.012, teffK: 3395, teffErr: 60,
    refs: { all: 'mann2015' },
  },
  {
    id: 'lacaille-9352', name: 'Lacaille 9352', athygId: 2487092, hip: 114046, spectralType: 'M1 V',
    massMsun: 0.495, massErr: 0.049, radiusRsun: 0.468, radiusErr: 0.022, teffK: 3688, teffErr: 86,
    refs: { all: 'mann2015' },
  },
  {
    id: 'trappist-1', name: 'TRAPPIST-1', athygId: null, gaiaDr3: '2635476908753563008', spectralType: 'M8 V',
    massMsun: 0.0898, massErr: 0.0023, radiusRsun: 0.1192, radiusErr: 0.0013, luminosityLsun: 0.000553, luminosityErr: 0.000019, teffK: 2566, teffErr: 26,
    refs: { all: 'agol2021' },
    notes: 'Seven Earth-sized planets. Not in AT-HYG (too faint for Tycho-2); added to the catalogue from Gaia DR3.',
    // Added to stars3d.bin from these values (not in AT-HYG).
    addToCatalogue: {
      raDeg: 346.62652162764437, decDeg: -5.043528319429532, epochJyr: 2016.0,
      parallaxMas: 80.21231612635748, parallaxErrMas: 0.07160574, pmRaMasYr: 930.7875225817781, pmDecMasYr: -479.0375409528857,
      rvKms: -52.003101, vMag: 18.798, con: 'Aqr',
      refs: ['gaiaDr3', 'costa2006', 'simbadRvTrappist'],
    },
  },
];
