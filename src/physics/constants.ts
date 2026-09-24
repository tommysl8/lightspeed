/**
 * Physical constants and Solar System body data.
 *
 * Every value carries its source. Units: kilometres, seconds, kilograms, degrees unless the
 * name says otherwise. Sources:
 *   [SI]    BIPM, The International System of Units (SI), 9th ed. (2019)
 *   [IAU]   IAU resolutions: 2012 B2 (au), 2015 B2 (parsec), 2015 B3 (nominal solar values)
 *   [NASA]  NASA Planetary Fact Sheets, nssdc.gsfc.nasa.gov/planetary/factsheet (updated 2025-03-18)
 *   [JPL]   JPL Horizons, ssd.jpl.nasa.gov/horizons (queried 2026-09-24)
 *   [Gaia]  Gaia Collaboration, Vallenari et al. (2023), Gaia Data Release 3, A&A 674, A1
 */

// ─── Fundamental and astronomical constants ──────────────────────────────────────────────

/** Speed of light in vacuum, km/s. Exact: it defines the metre. [SI] */
export const C_KM_S = 299_792.458;
/** Astronomical unit, km. Exact. [IAU 2012 B2] */
export const AU_KM = 149_597_870.7;
/** Seconds in a day. [SI] */
export const DAY_S = 86_400;
/** Julian year, s (365.25 days). [IAU] */
export const JULIAN_YEAR_S = 365.25 * DAY_S;
/** Light-year, km: distance light travels in one Julian year. Exact by definition. [IAU] */
export const LIGHT_YEAR_KM = C_KM_S * JULIAN_YEAR_S;
/** Light-day, km. Derived from C_KM_S. */
export const LIGHT_DAY_KM = C_KM_S * DAY_S;
/** Parsec, km: (648000/π) au. Exact. [IAU 2015 B2] */
export const PARSEC_KM = (648_000 / Math.PI) * AU_KM;
/** Standard gravity g₀, m/s². Exact. [3rd CGPM, 1901] */
export const G0_M_S2 = 9.806_65;
/** Standard gravity g₀ in km/s². */
export const G0_KM_S2 = G0_M_S2 / 1000;
/** Obliquity of the J2000 ecliptic, degrees (84381.448″). [IAU 1976; the "ecliptic of J2000" used by JPL] */
export const OBLIQUITY_J2000_DEG = 84_381.448 / 3600;
/** Julian date of the J2000.0 epoch (2000-01-01 12:00 TT). [IAU] */
export const J2000_JD = 2_451_545.0;

// ─── The Sun ─────────────────────────────────────────────────────────────────────────────

/** Nominal solar radius, km. [IAU 2015 B3] */
export const SUN_RADIUS_KM = 695_700;
/** Nominal solar luminosity, W. [IAU 2015 B3] */
export const SUN_LUMINOSITY_W = 3.828e26;
/** Nominal effective temperature of the Sun, K. [IAU 2015 B3] */
export const SUN_TEFF_K = 5772;
/** Nominal heliocentric gravitational constant GM☉, km³/s². [IAU 2015 B3: 1.3271244 × 10²⁰ m³/s²] */
export const GM_SUN_KM3_S2 = 1.327_124_4e11;
/** Apparent visual magnitude of the Sun seen from 1 au, V(1,0). [NASA Sun Fact Sheet] */
export const SUN_VMAG_AT_1AU = -26.74;

// ─── Beyond the Solar System ─────────────────────────────────────────────────────────────

/** Proxima Centauri parallax, milliarcseconds. [Gaia DR3: 768.0665 ± 0.0499 mas] */
export const PROXIMA_PARALLAX_MAS = 768.0665;
/** Proxima Centauri distance, km (1 pc / parallax). ≈ 4.2465 ly, often rounded to 4.24. */
export const PROXIMA_DISTANCE_KM = PARSEC_KM / (PROXIMA_PARALLAX_MAS / 1000);
/** Proxima Centauri equatorial J2000 position, degrees. [HYG v4.4: RA 14.495985 h, Dec −62.679485°] */
export const PROXIMA_RA_DEG = 14.495_985 * 15;
export const PROXIMA_DEC_DEG = -62.679_485;

// ─── Spacecraft reference speeds ─────────────────────────────────────────────────────────

/**
 * Parker Solar Probe's record heliocentric speed, km/s: 692,000 km/h at perihelion on
 * 24 December 2024. [NASA, "NASA's Parker Solar Probe Makes History With Closest Pass to Sun"]
 */
export const PARKER_PEAK_KM_S = 692_000 / 3600;

/**
 * Voyager 1 state vector relative to the Solar System barycentre. [JPL Horizons, target -31,
 * center 500@0 (source DE441), ecliptic and mean equinox of J2000, TDB, units km and km/s]
 *
 * Why barycentric: at 170 au the Sun and planets pull like one point mass at the barycentre,
 * so a barycentric two-body orbit extrapolates cleanly. A heliocentric one would inherit the
 * Sun's ~13 m/s wobble and drift by ~5 million km per decade. The app converts to
 * heliocentric with astronomy-engine's barycentre offset.
 */
export const VOYAGER1_STATE = {
  /** 2026-01-01 00:00:00 TDB */
  epochJdTdb: 2_461_041.5,
  r: [-4.763_118_603_210_161e9, -2.014_844_234_470_005e10, 1.457_755_521_843_938e10] as const,
  v: [-2.060_391_856_037_982, -13.610_809_233_881_32, 9.834_449_678_202_51] as const,
};

/**
 * Two further barycentric Horizons positions of Voyager 1, used only by the unit tests to
 * check the extrapolation. Same frame and source as VOYAGER1_STATE.
 */
export const VOYAGER1_CHECK_STATES = [
  {
    epochJdTdb: 2_457_388.5, // 2016-01-01 00:00 TDB
    r: [-4.110_350_522_322_472e9, -1.584_298_807_510_452e10, 1.146_680_168_446_342e10] as const,
  },
  {
    epochJdTdb: 2_464_693.5, // 2036-01-01 00:00 TDB
    r: [-5.411_434_962_591_357e9, -2.443_583_205_068_18e10, 1.767_553_862_932_927e10] as const,
  },
];

/** Voyager 1 launch: 1977-09-05 12:56 UTC. [NASA/JPL Voyager mission] */
export const VOYAGER1_LAUNCH_UTC = '1977-09-05T12:56:00Z';
/** Voyager 1's Saturn closest approach, after which its path is a solar hyperbola. [NASA/JPL] */
export const VOYAGER1_SATURN_FLYBY_UTC = '1980-11-12T23:46:00Z';

// ─── Solar System bodies ─────────────────────────────────────────────────────────────────

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'voyager1';

export type BodyKind = 'star' | 'planet' | 'dwarf-planet' | 'moon' | 'spacecraft';

export interface BodyData {
  id: BodyId;
  name: string;
  kind: BodyKind;
  /** Body this one orbits, if not the Sun. */
  parent?: BodyId;
  /** Volumetric mean radius, km. */
  radiusKm: number;
  /** Equatorial radius, km (1-bar level for the giant planets). */
  equatorialRadiusKm?: number;
  /** Polar radius, km (1-bar level for the giant planets). */
  polarRadiusKm?: number;
  /** Gravitational parameter GM, km³/s². */
  gmKm3S2?: number;
  /** Sidereal rotation period, hours. Negative = retrograde. */
  siderealRotationH?: number;
  /** Length of the solar day (noon to noon), hours. */
  solarDayH?: number;
  /** Sidereal orbital period, days. */
  orbitalPeriodD?: number;
  /** Semi-major axis of the orbit, km (around the Sun, or around `parent`). */
  semiMajorAxisKm?: number;
  /** Axial tilt relative to the orbit, degrees. */
  obliquityDeg?: number;
  /** Geometric albedo (V band), used for apparent brightness. */
  geometricAlbedo?: number;
  /** Tint used for markers, orbit lines and the procedural fallback surface. */
  color: string;
  /** Short, accurate facts for the info card. */
  facts: string[];
}

/** Volumetric mean radius of Earth, km — handy for comparisons. [NASA] */
export const EARTH_RADIUS_KM = 6371.0;

export const BODIES: Record<BodyId, BodyData> = {
  // [IAU 2015 B3] radius, GM; [NASA Sun Fact Sheet] rotation (Carrington sidereal period, 25.38 d)
  sun: {
    id: 'sun',
    name: 'Sun',
    kind: 'star',
    radiusKm: SUN_RADIUS_KM,
    gmKm3S2: GM_SUN_KM3_S2,
    siderealRotationH: 609.12,
    color: '#ffd9a0',
    facts: [
      'Sunlight takes about 8 minutes 19 seconds to reach Earth, and about 4 hours 10 minutes to reach Neptune.',
      'The Sun holds about 99.86% of all the mass in the Solar System.',
      'Every second it converts about 4.3 million tonnes of mass into energy: its luminosity, 3.8 × 10²⁶ W, divided by c².',
    ],
  },
  // [NASA Mercury Fact Sheet]
  mercury: {
    id: 'mercury',
    name: 'Mercury',
    kind: 'planet',
    radiusKm: 2439.7,
    equatorialRadiusKm: 2440.5,
    polarRadiusKm: 2438.3,
    gmKm3S2: 22_032,
    siderealRotationH: 1407.6,
    solarDayH: 4222.6,
    orbitalPeriodD: 87.969,
    semiMajorAxisKm: 57.909e6,
    obliquityDeg: 0.034,
    geometricAlbedo: 0.142,
    color: '#a9a39d',
    facts: [
      'One solar day on Mercury, sunrise to sunrise, lasts about 176 Earth days: exactly two Mercurian years.',
      'Its perihelion drifts 43 arcseconds per century more than Newtonian gravity predicts. Einstein’s general relativity explained the difference exactly in 1915.',
      'Sunlight reaches Mercury in about 3.2 minutes on average.',
    ],
  },
  // [NASA Venus Fact Sheet]
  venus: {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    radiusKm: 6051.8,
    equatorialRadiusKm: 6051.8,
    polarRadiusKm: 6051.8,
    gmKm3S2: 324_860,
    siderealRotationH: -5832.6,
    solarDayH: 2802.0,
    orbitalPeriodD: 224.701,
    semiMajorAxisKm: 108.21e6,
    obliquityDeg: 177.36,
    geometricAlbedo: 0.689,
    color: '#e8d3a8',
    facts: [
      'Venus spins backwards, and so slowly that one rotation (243 Earth days) takes longer than its year (225 days).',
      'Its surface averages about 464 °C, hotter than Mercury, under a CO₂ atmosphere with 92 times Earth’s surface pressure.',
      'After the Moon, it is the brightest natural object in the night sky, reaching magnitude −4.8.',
    ],
  },
  // [NASA Earth Fact Sheet]
  earth: {
    id: 'earth',
    name: 'Earth',
    kind: 'planet',
    radiusKm: EARTH_RADIUS_KM,
    equatorialRadiusKm: 6378.137,
    polarRadiusKm: 6356.752,
    gmKm3S2: 398_600.4,
    siderealRotationH: 23.9345,
    solarDayH: 24.0,
    orbitalPeriodD: 365.256,
    semiMajorAxisKm: 149.598e6,
    obliquityDeg: 23.44,
    geometricAlbedo: 0.434,
    color: '#6fa8ff',
    facts: [
      'The sunlight reaching you left the Sun about 8 minutes 19 seconds ago: 1 au ÷ c ≈ 499 s.',
      'Earth orbits the Sun at about 29.8 km/s, roughly 0.0001c.',
      'GPS satellite clocks run fast by about 38 microseconds a day: +45 μs from weaker gravity (general relativity), −7 μs from their speed (special relativity). The system corrects for it.',
    ],
  },
  // [NASA Moon Fact Sheet]. Solar day = synodic month (29.53 d).
  moon: {
    id: 'moon',
    name: 'Moon',
    kind: 'moon',
    parent: 'earth',
    radiusKm: 1737.4,
    equatorialRadiusKm: 1738.1,
    polarRadiusKm: 1736.0,
    gmKm3S2: 4902.8,
    siderealRotationH: 655.72,
    solarDayH: 708.7,
    orbitalPeriodD: 27.3217,
    semiMajorAxisKm: 384_400,
    obliquityDeg: 6.68,
    geometricAlbedo: 0.12,
    color: '#bdbab4',
    facts: [
      'The Moon is about 1.28 light-seconds from Earth, so Apollo radio exchanges had a round-trip delay of about 2.6 s.',
      'It is tidally locked: the same hemisphere always faces Earth.',
      'It drifts away by about 3.8 cm a year. We measure this by bouncing lasers off reflectors the Apollo astronauts left on its surface.',
    ],
  },
  // [NASA Mars Fact Sheet]
  mars: {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    radiusKm: 3389.5,
    equatorialRadiusKm: 3396.2,
    polarRadiusKm: 3376.2,
    gmKm3S2: 42_828,
    siderealRotationH: 24.6229,
    solarDayH: 24.6597,
    orbitalPeriodD: 686.98,
    semiMajorAxisKm: 227.956e6,
    obliquityDeg: 25.19,
    geometricAlbedo: 0.17,
    color: '#d9774b',
    facts: [
      'A radio signal takes about 3 to 22 minutes to cross between Earth and Mars, depending on where the planets are. Rovers can’t be driven in real time.',
      'Olympus Mons rises about 22 km above the Martian datum, roughly 2.5 times Everest’s height above sea level.',
      'A Martian solar day, called a sol, lasts 24 h 39 min.',
    ],
  },
  // [NASA Jupiter Fact Sheet]
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'planet',
    radiusKm: 69_911,
    equatorialRadiusKm: 71_492,
    polarRadiusKm: 66_854,
    gmKm3S2: 126_687_000,
    siderealRotationH: 9.925,
    solarDayH: 9.9259,
    orbitalPeriodD: 4332.589,
    semiMajorAxisKm: 778.479e6,
    obliquityDeg: 3.13,
    geometricAlbedo: 0.538,
    color: '#d8b48a',
    facts: [
      'Jupiter is more than twice as massive as all the other planets combined.',
      'It has the shortest day of any planet, about 9 h 56 min.',
      'Sunlight takes about 43 minutes to reach Jupiter.',
    ],
  },
  // [NASA Saturn Fact Sheet]
  saturn: {
    id: 'saturn',
    name: 'Saturn',
    kind: 'planet',
    radiusKm: 58_232,
    equatorialRadiusKm: 60_268,
    polarRadiusKm: 54_364,
    gmKm3S2: 37_931_000,
    siderealRotationH: 10.656,
    solarDayH: 10.656,
    orbitalPeriodD: 10_755.699,
    semiMajorAxisKm: 1432.041e6,
    obliquityDeg: 26.73,
    geometricAlbedo: 0.499,
    color: '#e3cf9b',
    facts: [
      'Its main rings span about 270,000 km, yet are mostly only about 10 m thick.',
      'Saturn’s mean density, 0.687 g/cm³, is less than that of water.',
      'Sunlight takes about 80 minutes to reach Saturn.',
    ],
  },
  // [NASA Uranus Fact Sheet]
  uranus: {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    radiusKm: 25_362,
    equatorialRadiusKm: 25_559,
    polarRadiusKm: 24_973,
    gmKm3S2: 5_794_000,
    siderealRotationH: -17.24,
    solarDayH: 17.24,
    orbitalPeriodD: 30_685.4,
    semiMajorAxisKm: 2867.043e6,
    obliquityDeg: 97.77,
    geometricAlbedo: 0.488,
    color: '#a6e1e8',
    facts: [
      'Uranus is tipped on its side (97.8°), so each pole gets about 42 years of continuous daylight, then 42 years of night.',
      'It was the first planet discovered with a telescope, by William Herschel in 1781.',
      'Sunlight takes about 2 hours 40 minutes to reach Uranus.',
    ],
  },
  // [NASA Neptune Fact Sheet]
  neptune: {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    radiusKm: 24_622,
    equatorialRadiusKm: 24_764,
    polarRadiusKm: 24_341,
    gmKm3S2: 6_835_100,
    siderealRotationH: 16.11,
    solarDayH: 16.11,
    orbitalPeriodD: 60_189.018,
    semiMajorAxisKm: 4514.953e6,
    obliquityDeg: 28.32,
    geometricAlbedo: 0.442,
    color: '#5b7cff',
    facts: [
      'Neptune was predicted mathematically from wobbles in Uranus’s orbit before anyone saw it. It was spotted in 1846.',
      'It has the fastest winds measured in the Solar System, over 2,000 km/h.',
      'Since its discovery, Neptune has completed just one orbit of the Sun, in 2011.',
    ],
  },
  // [NASA Pluto Fact Sheet]. The detailed sheet lists a = 5869.656 × 10⁶ km beside J2000 mean
  // elements a = 39.48168677 au (= 5906.4 × 10⁶ km). We use the J2000 mean value, which also
  // matches the summary table.
  pluto: {
    id: 'pluto',
    name: 'Pluto',
    kind: 'dwarf-planet',
    radiusKm: 1188,
    equatorialRadiusKm: 1188,
    polarRadiusKm: 1188,
    gmKm3S2: 870,
    siderealRotationH: -153.2928,
    solarDayH: 153.282,
    orbitalPeriodD: 90_560,
    semiMajorAxisKm: 39.481_686_77 * AU_KM,
    obliquityDeg: 119.51,
    geometricAlbedo: 0.52,
    color: '#d6c3a8',
    facts: [
      'At its mean distance, sunlight takes about 5.5 hours to reach Pluto.',
      'Data from New Horizons’ 2015 flyby took about 4.5 hours to reach Earth at the speed of light.',
      'Its heart-shaped Sputnik Planitia is a basin of nitrogen ice about 1,000 km across.',
    ],
  },
  // [NASA/JPL Voyager mission]. Size: the high-gain antenna is 3.7 m across.
  voyager1: {
    id: 'voyager1',
    name: 'Voyager 1',
    kind: 'spacecraft',
    radiusKm: 0.00185,
    color: '#f5f5f5',
    facts: [
      'Launched on 5 September 1977, Voyager 1 is the most distant human-made object.',
      'On 25 August 2012 it crossed the heliopause and became the first spacecraft in interstellar space.',
      'Around 18 November 2026 it reaches one light-day from Earth. A command then takes a full day to arrive, and the reply another day to come back. (JPL Horizons)',
    ],
  },
};

/**
 * GM of the whole Solar System (Sun + planets + Moon + Pluto), km³/s². Seen from far outside the
 * planets' orbits, this is the effective central mass at the barycentre. Summed from the table above.
 */
export const GM_SOLAR_SYSTEM_KM3_S2 = Object.values(BODIES).reduce((sum, b) => sum + (b.gmKm3S2 ?? 0), 0);

/** Order used by keyboard shortcuts and the body bar. */
export const BODY_ORDER: BodyId[] = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'voyager1',
];

// ─── Saturn's rings ──────────────────────────────────────────────────────────────────────

/**
 * Radial extent spanned by the ring texture (2k_saturn_ring_alpha.png), km from Saturn's centre.
 * Fitted so the texture's features land at their measured radii: B ring inner edge 92,000 km,
 * Encke gap 133,589 km, A ring outer edge 136,775 km, F ring 140,180 km.
 * [NASA Saturnian Rings Fact Sheet]
 */
export const SATURN_RING_INNER_KM = 71_000;
export const SATURN_RING_OUTER_KM = 141_000;
