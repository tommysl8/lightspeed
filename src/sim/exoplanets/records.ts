/**
 * Body records for planets of other stars and for the stars they orbit that the star catalogue
 * lacks. Pure functions of the data: the tests call them with the files read from disk. See
 * docs/bodies.md and docs/data/exoplanets.md.
 *
 *  - The eleven featured systems (exoplanets-featured.json.gz): their planets on the orbits of
 *    their papers, about the star bodies the star catalogue already has (TRAPPIST-1, Proxima,
 *    Alpha Centauri A …), and three hosts it lacks (Kepler-90, TOI-700, the Kepler-16 pair).
 *  - Any planet of the NASA Exoplanet Archive (exoplanets.json.gz), registered with its host:
 *    about the host's star body when the star catalogue has the star, else about a star record
 *    built here from the archive's host data.
 *
 * A planet is drawn as a plain sphere in an illustrative colour (appearance.ts), lit by its own
 * star; its point of light has the magnitude of that star's light reflected at its albedo.
 */
import { AU_KM, GM_SUN_KM3_S2, JULIAN_YEAR_S, PARSEC_KM, SUN_RADIUS_KM } from '../../physics/constants';
import type { BodyRecord, ExoplanetInfo, PositionProvider, StarInfo } from '../bodies';
import { equatorialToEcliptic, skyBasis, type Vec3 } from '../stars/frames';
import { bolometricCorrection, SUN_M_BOL } from '../stars/photometry';
import { linearStarProvider, starColour, starKindText, starLabelRank } from '../stars/records';
import { equilibriumTemperatureK, planetLook, radiusFromMass } from './appearance';
import { type ArchiveOrbit, type ExoplanetCatalogue, PLANET_FLAGS, known } from './catalogue';
import { GM_EARTH_KM3_S2, J2000_JD, R_EARTH_KM } from './constants';
import type { FeaturedFile, FeaturedPlanet, FeaturedSystem } from './featured';
import type { KeplerOrbit } from './orbit';
import { orbitMuKm3S2, skyOrbitProvider } from './provider';

/** The Learn article about planets of other stars. */
export const EXOPLANET_ARTICLE = 'other-worlds';

/** Every card's first note: nothing is known of how these planets look. */
export const NO_IMAGE_NOTE = 'No image of this planet exists; colour is illustrative.';

const TEN_PC_KM = 10 * PARSEC_KM;
const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const msFromJd = (jd: number): number => J2000_MS + (jd - J2000_JD) * MS_PER_DAY;
/** A phase is trusted this long either side of its reference time; the position is illustrative beyond. */
export const PHASE_VALID_YEARS = 100;
const PHASE_VALID_MS = PHASE_VALID_YEARS * JULIAN_YEAR_S * 1000;

/** Lower-case words joined by hyphens: "K2-18 b" → "k2-18-b". */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const round = (x: number, digits: number) => Number(x.toPrecision(digits));

// ─── Stars ───────────────────────────────────────────────────────────────────────────────

/** 1 arcsec/yr at 1 pc, in km/s (1 au per Julian year). */
const KMS_PER_AU_YR = AU_KM / JULIAN_YEAR_S;

/**
 * A star's J2000 place (pc) and space velocity (km/s), J2000 ecliptic axes, from its ICRS
 * position at J2000, distance, proper motion (mas/yr, μα* with cos δ) and radial velocity. A
 * missing proper motion or radial velocity counts as zero.
 */
export function spaceMotion(raDeg: number, decDeg: number, distPc: number, pmRaMasYr: number, pmDecMasYr: number, rvKms: number): { posPc: Vec3; velKms: Vec3 } {
  const { toward, east, north } = skyBasis(raDeg, decDeg);
  const ve = ((known(pmRaMasYr) ? pmRaMasYr : 0) / 1000) * distPc * KMS_PER_AU_YR;
  const vn = ((known(pmDecMasYr) ? pmDecMasYr : 0) / 1000) * distPc * KMS_PER_AU_YR;
  const vr = known(rvKms) ? rvKms : 0;
  const pos = equatorialToEcliptic([toward[0] * distPc, toward[1] * distPc, toward[2] * distPc]);
  const vel = equatorialToEcliptic([0, 1, 2].map((k) => vr * toward[k] + ve * east[k] + vn * north[k]) as Vec3);
  return { posPc: pos, velKms: vel };
}

export interface HostStarInput {
  id: string;
  name: string;
  aliases: string[];
  raDeg: number;
  decDeg: number;
  distancePc: number;
  /** NaN when unknown. */
  pmRaMasYr: number;
  pmDecMasYr: number;
  rvKms: number;
  teffK: number;
  radiusRsun: number;
  massMsun: number;
  luminosityLsun: number;
  vmag: number;
  spectralType?: string;
  designations: string[];
  distanceSource: string;
  refs: string[];
  dataSource: string;
  parent?: string | null;
  centre?: string;
  /** Replaces the straight-line motion (a star of a binary). */
  provider?: PositionProvider;
  positionNote?: string;
  orbitLine?: BodyRecord['orbitLine'];
  modelNotes?: string[];
  teffNote?: string;
}

/**
 * A star that is not in the star catalogue, from its measured values: straight-line motion from
 * its J2000 place (as the catalogue's stars move), a blackbody disc at its temperature, and its
 * brightness from V (or, without V, from its luminosity and the bolometric correction).
 */
export function hostStarRecord(s: HostStarInput): BodyRecord {
  const notes = [...(s.modelNotes ?? [])];
  const teffKnown = known(s.teffK) && s.teffK > 0;
  const teffK = teffKnown ? s.teffK : 5772;
  if (!teffKnown) notes.push(s.teffNote ?? 'No temperature is known: drawn at the Sun’s.');
  let L = s.luminosityLsun;
  let R = s.radiusRsun;
  let absMagV: number;
  let absSource: 'V' | 'luminosity';
  if (known(s.vmag) && known(s.distancePc)) {
    absMagV = s.vmag - 5 * Math.log10(s.distancePc) + 5;
    absSource = 'V';
  } else {
    const Lb = known(L) ? L : known(R) ? R * R * (teffK / 5772) ** 4 : 1;
    absMagV = SUN_M_BOL - 2.5 * Math.log10(Lb) - bolometricCorrection(teffK);
    absSource = 'luminosity';
  }
  let lSource: StarInfo['luminositySource'] = 'literature';
  if (!known(L)) {
    L = 10 ** (-0.4 * (absMagV + bolometricCorrection(teffK) - SUN_M_BOL));
    lSource = 'estimated';
  }
  let rSource: StarInfo['radiusSource'] = 'literature';
  if (!known(R) || !(R > 0)) {
    R = Math.sqrt(L) * (5772 / teffK) ** 2;
    rSource = 'estimated';
    notes.push('Radius estimated from its luminosity and temperature (Stefan–Boltzmann).');
  }
  if (absSource === 'luminosity') notes.push('Brightness worked out from its luminosity and temperature (no V magnitude): uncertain by a few tenths of a magnitude.');
  if (!known(s.pmRaMasYr) || !known(s.rvKms)) notes.push(!known(s.pmRaMasYr) ? 'No proper motion is known: it stands still.' : 'No radial velocity is known: it moves across the sky only.');
  const vFromSun = absMagV + 5 * Math.log10(s.distancePc) - 5;
  const star: StarInfo = {
    spectralType: s.spectralType,
    teffK,
    teffSource: teffKnown ? 'literature' : 'unknown',
    luminosityLsun: round(L, 4),
    luminositySource: lSource,
    radiusRsun: round(R, 4),
    radiusSource: rSource,
    massMsun: known(s.massMsun) ? s.massMsun : undefined,
    absMagV: round(absMagV, 4),
    vFromSun: round(vFromSun, 4),
    distancePc: round(s.distancePc, 7),
    distanceSource: s.distanceSource,
    distancePrecision: 'not given',
    designations: s.designations,
    refs: s.refs,
  };
  const physical: BodyRecord['physical'] = {
    radiusKm: R * SUN_RADIUS_KM,
    colour: starColour(teffK),
    luminous: { vmag: absMagV, atKm: TEN_PC_KM, teffK },
  };
  if (known(s.massMsun) && s.massMsun > 0) physical.gmKm3S2 = s.massMsun * GM_SUN_KM3_S2;
  const motion = spaceMotion(s.raDeg, s.decDeg, s.distancePc, s.pmRaMasYr, s.pmDecMasYr, s.rvKms);
  return {
    id: s.id,
    name: s.name,
    aliases: [...new Set(s.aliases.filter((a) => a && a !== s.name))],
    kind: 'star',
    kindText: starKindText(s.spectralType, teffK),
    parent: s.parent ?? null,
    centre: s.centre,
    physical,
    visual: { renderer: 'star' },
    dataSource: s.dataSource,
    positionNote:
      s.positionNote ??
      'Position: straight-line motion from its J2000 place and velocity in the NASA Exoplanet Archive (Gaia DR3 or Hipparcos astrometry), for a million years either side of 2000.',
    modelNotes: notes,
    provider: s.provider ?? linearStarProvider(motion.posPc, motion.velKms, 'Straight-line motion from its J2000 place (NASA Exoplanet Archive; Gaia DR3 or Hipparcos)'),
    labelRank: starLabelRank(vFromSun),
    orbitLine: s.orbitLine ?? false,
    article: EXOPLANET_ARTICLE,
    star,
  };
}

// ─── Planets ─────────────────────────────────────────────────────────────────────────────

interface PlanetBasis {
  id: string;
  name: string;
  aliases: string[];
  kindText?: string;
  parent: string;
  centre?: string;
  litBy: string;
  lightTimeFrom: string;
  raDeg: number;
  decDeg: number;
  orbit: KeplerOrbit;
  regime: 'approximate' | 'illustrative';
  /** Reference time of the phase, JD (its validity runs PHASE_VALID_YEARS either side). */
  phaseJd: number | null;
  providerLabel: string;
  info: Omit<ExoplanetInfo, 'colourRule'>;
  /** True mass, Earth masses (for GM), when measured. */
  trueMassEarth: number | null;
  teqK: number;
  positionNote: string;
  modelNotes: string[];
  facts?: string[];
  factSources?: string[];
  factSourceLabels?: string[];
  dataSource: string;
  labelRank?: number;
}

function planetRecord(b: PlanetBasis): BodyRecord {
  const info = b.info;
  const look = planetLook(b.teqK, info.radiusEarth, info.massEarth ?? null, info.radiusSource === 'measured');
  const phaseMs = b.phaseJd !== null ? msFromJd(b.phaseJd) : null;
  const physical: BodyRecord['physical'] = {
    radiusKm: info.radiusEarth * R_EARTH_KM,
    colour: look.colour,
    geometricAlbedo: look.albedo,
    orbitalPeriodD: b.orbit.periodDays,
    semiMajorAxisKm: b.orbit.aAu * AU_KM,
  };
  if (b.trueMassEarth !== null && b.trueMassEarth > 0) physical.gmKm3S2 = b.trueMassEarth * GM_EARTH_KM3_S2;
  return {
    id: b.id,
    name: b.name,
    aliases: [...new Set(b.aliases.filter((a) => a && a !== b.name))],
    kind: 'exoplanet',
    kindText: b.kindText,
    parent: b.parent,
    centre: b.centre,
    litBy: b.litBy,
    physical,
    visual: { flat: true },
    facts: b.facts,
    factSources: b.factSources,
    factSourceLabels: b.factSourceLabels,
    dataSource: b.dataSource,
    positionNote: b.positionNote,
    modelNotes: [NO_IMAGE_NOTE, ...b.modelNotes],
    provider: skyOrbitProvider(b.orbit, {
      raDeg: b.raDeg,
      decDeg: b.decDeg,
      lightTimeFrom: b.lightTimeFrom,
      regime: b.regime,
      validFromMs: phaseMs !== null ? phaseMs - PHASE_VALID_MS : undefined,
      validToMs: phaseMs !== null ? phaseMs + PHASE_VALID_MS : undefined,
      label: b.providerLabel,
    }),
    // The conic through the planet's state with n²a³ is its Kepler ellipse, whatever the masses.
    orbitLine: { muKm3S2: orbitMuKm3S2(b.orbit) },
    detector: false,
    labelRank: b.labelRank,
    article: EXOPLANET_ARTICLE,
    exoplanet: { ...info, colourRule: info.teqSource === 'own-heat' ? `${look.rule}, by the temperature of its own glow` : look.rule },
  };
}

// ─── The featured systems ────────────────────────────────────────────────────────────────

/** Registry id of each featured system's host (the star bodies that exist already, and the three added here). */
export const FEATURED_HOSTS: Readonly<Record<string, string>> = {
  'trappist-1': 'trappist-1',
  'proxima-cen': 'proxima',
  'barnards-star': 'barnards-star',
  '51-peg': '51-pegasi',
  'hr-8799': 'hr-8799',
  'kepler-90': 'kepler-90',
  'toi-700': 'toi-700',
  'kepler-16': 'kepler-16',
  'eps-eri': 'epsilon-eridani',
  'tau-cet': 'tau-ceti',
  'alf-cen': 'alpha-centauri-a',
};

/** Featured hosts the star catalogue lacks (too faint): registered from the featured file. */
export const NEW_FEATURED_HOSTS: ReadonlySet<string> = new Set(['kepler-90', 'toi-700', 'kepler-16']);

/** The Kepler-16 pair's centre of mass (the planet orbits it). */
export const KEPLER16_BARYCENTRE = 'kepler-16-barycentre';

/** Names the IAU gave to featured planets (NameExoWorlds 2015). */
const IAU_NAMES: Readonly<Record<string, readonly string[]>> = {
  '51-pegasi-b': ['Dimidium'],
  'epsilon-eridani-b': ['AEgir', 'Ægir'],
};

/** A line on each featured system for its planets' cards (from the featured file's notes and papers). */
const SYSTEM_FACTS: Readonly<Record<string, string>> = {
  'trappist-1':
    'Seven Earth-sized planets, all of which transit, in a chain of near-resonances: in the time the outermost goes round twice, the next goes round three times, and so on inwards.',
  'barnards-star':
    'Barnard’s Star b was reported by González Hernández et al. in 2024; Basant et al. confirmed it in 2025 and added c, d and e. All four are lighter than Earth (minimum masses).',
  '51-peg': 'The first planet found around a Sun-like star (Mayor & Queloz 1995; Nobel Prize in Physics 2019).',
  'hr-8799': 'Four giant planets photographed directly (Marois et al. 2008, 2010), young enough to glow with their own heat.',
  'kepler-90': 'Eight transiting planets, tied with the Solar System for the most known around one star.',
  'toi-700': 'TOI-700 d and e are Earth-sized planets in the star’s habitable zone (Gilbert et al. 2020, 2023).',
  'kepler-16': 'The first transiting circumbinary planet: a Saturn-mass world with two suns.',
  'eps-eri': 'The nearest known Jupiter-like planet, orbiting inside a debris disc; its orbit is close to the plane of the outer disc (Thompson et al. 2025).',
};

/**
 * Transit-timing variations a fixed Kepler orbit leaves out: the largest deviation from the mean
 * ephemeris, minutes (TRAPPIST-1: Agol et al. 2021 Table 15; Kepler-90 g and h: Shaw et al. 2025).
 */
const TTV_MAX_MIN: Readonly<Record<string, number>> = {
  'trappist-1-b': 4.3,
  'trappist-1-c': 4.9,
  'trappist-1-d': 61,
  'trappist-1-e': 39,
  'trappist-1-f': 83,
  'trappist-1-g': 52,
  'trappist-1-h': 135,
  'kepler-90-g': 840,
  'kepler-90-h': 480,
};

/** How each featured system's phase is known, for the position note. */
const PHASE_TEXT: Readonly<Record<string, string>> = {
  'trappist-1': 'timed by the transits forecast by Agol et al. (2021): b and c fall within 10 minutes of JWST’s transits of July 2024',
  'hr-8799': 'fitted to Gemini Planet Imager positions (Wang et al. 2018) to within 13 milliarcseconds',
  'kepler-16': 'the period fitted to the three transits of star A that Kepler saw (Doyle et al. 2011); a fixed orbit ignores the precession that ended those transits in 2018',
  'tau-cet': 'its place along the orbit is arbitrary: the paper gives a phase without the date it refers to',
  'alf-cen': 'an illustrative orbit, one of a family that fits the single JWST detection and the non-detections',
};

/** A reference's short name ("Agol et al. 2021", "Mayor & Queloz 1995"). */
export function shortCite(cite: string): string {
  const m = cite.match(/^(.*?)\b((?:19|20)\d{2})\b/);
  if (!m) return cite.split(/[,(]/)[0].trim();
  const authors = m[1].trim();
  const year = m[2];
  const first = authors.split(',')[0].trim();
  if (/et al/.test(authors)) return `${first.replace(/\s+et al\.?$/, '')} et al. ${year}`;
  const parts = authors.split('&');
  if (parts.length === 2) {
    const before = parts[0].split(',').filter((x) => x.trim()).length;
    const second = parts[1].trim().split(',')[0].trim();
    return before <= 2 ? `${first} & ${second} ${year}` : `${first} et al. ${year}`;
  }
  return `${first} ${year}`;
}

/** A link for a reference: its DOI, else its ADS or arXiv page, else its URL. */
export function refUrl(ref: { doi?: string; ads?: string; arxiv?: string; url?: string }): string | undefined {
  if (ref.doi) return `https://doi.org/${ref.doi}`;
  if (ref.ads) return `https://ui.adsabs.harvard.edu/abs/${ref.ads}`;
  if (ref.arxiv) return `https://arxiv.org/abs/${ref.arxiv}`;
  return ref.url;
}

const REF_LABELS: Readonly<Record<string, string>> = {
  'nea-pscomppars': 'NASA Exoplanet Archive',
  'nea-ps': 'NASA Exoplanet Archive',
  keplerEB: 'Kirk et al. 2016',
};

/** Registry id of a featured planet. */
export function featuredPlanetId(sys: FeaturedSystem, p: FeaturedPlanet): string {
  if (sys.id === 'kepler-16') return 'kepler-16-ab-b';
  if (sys.id === 'alf-cen') return `alpha-centauri-a-${p.id.toLowerCase()}`;
  return `${FEATURED_HOSTS[sys.id]}-${p.id.toLowerCase()}`;
}

/** Whether a featured planet is shown (refuted planets and those the file hides by default are not). */
export const featuredShown = (p: FeaturedPlanet): boolean => p.status !== 'refuted' && p.showByDefault !== false;

const hms = (days: number): string => {
  const h = days * 24;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hours`;
  return `${Math.round(days)} days`;
};

/** The featured system's hosts that the star catalogue lacks: Kepler-90, TOI-700, and the Kepler-16 pair with its barycentre. */
function newHostRecords(file: FeaturedFile, sys: FeaturedSystem): BodyRecord[] {
  const pos = sys.position;
  const refs = (keys: (string | undefined)[]) => [...new Set(keys.filter((k): k is string => !!k).map((k) => file.refs[k]?.cite ?? k))];
  const ids = pos.ids;
  const designations = [
    ids.gaiaDr3 ? `Gaia DR3 ${ids.gaiaDr3}` : null,
    ids.tic ? `TIC ${ids.tic}` : null,
    sys.archiveHost && sys.archiveHost !== sys.name ? sys.archiveHost : null,
  ].filter((x): x is string => !!x);
  const distanceSource = 'the NASA Exoplanet Archive (TIC v8: Gaia DR2 parallax)';
  const dataSource = `Position: ${pos.source}; star: ${refs(sys.stars.flatMap((s) => [s.massMsun?.ref, s.radiusRsun?.ref, s.teffK?.ref])).map(shortCite).join('; ')}`;
  const common = {
    raDeg: pos.raDeg,
    decDeg: pos.decDeg,
    distancePc: pos.distancePc,
    pmRaMasYr: pos.pmRaMasYr ?? NaN,
    pmDecMasYr: pos.pmDecMasYr ?? NaN,
    rvKms: pos.radialVelocityKms ?? NaN,
    vmag: NaN,
    distanceSource,
    dataSource,
  };
  const starInput = (s: FeaturedSystem['stars'][number]) => ({
    teffK: s.teffK?.v ?? NaN,
    radiusRsun: s.radiusRsun?.v ?? NaN,
    massMsun: s.massMsun?.v ?? NaN,
    luminosityLsun: s.luminosityLsun?.v ?? NaN,
    spectralType: s.spectralType?.v ?? undefined,
    refs: refs([s.massMsun?.ref, s.radiusRsun?.ref, s.teffK?.ref, s.luminosityLsun?.ref]),
  });
  if (!sys.starOrbit) {
    const s = sys.stars[0];
    const id = FEATURED_HOSTS[sys.id];
    return [hostStarRecord({ id, name: sys.name, aliases: [...designations, s.name], designations, ...common, ...starInput(s) })];
  }
  // Kepler-16: the pair's centre of mass in straight-line motion, and A and B on their orbit about it.
  const so = sys.starOrbit;
  const f = so.massFractionSecondary;
  const mass = sys.stars.reduce((m, s) => m + (s.massMsun?.v ?? 0), 0);
  const motion = spaceMotion(pos.raDeg, pos.decDeg, pos.distancePc, common.pmRaMasYr, common.pmDecMasYr, common.rvKms);
  const muRel = orbitMuKm3S2(so.orbit);
  const bary: BodyRecord = {
    id: KEPLER16_BARYCENTRE,
    name: sys.name,
    kind: 'barycentre',
    parent: null,
    physical: { radiusKm: 0, colour: '#ffffff', gmKm3S2: mass * GM_SUN_KM3_S2 },
    provider: linearStarProvider(motion.posPc, motion.velKms, `Centre of mass of ${sys.name}: straight-line motion from its J2000 place (NASA Exoplanet Archive; Gaia DR3)`),
    orbitLine: false,
    detector: false,
    destination: false,
  };
  const orbitNote = `Position: the pair’s centre of mass in straight-line motion, and the binary orbit of Doyle et al. (2011), timed so that the Sun sees the eclipses as Kepler did.`;
  const member = (k: 0 | 1): BodyRecord => {
    const s = sys.stars[k];
    const scale = k === 0 ? -f : 1 - f;
    const provider = skyOrbitProvider(so.orbit, {
      raDeg: pos.raDeg,
      decDeg: pos.decDeg,
      lightTimeFrom: KEPLER16_BARYCENTRE,
      regime: 'approximate',
      label: `Orbit about the centre of mass of Kepler-16 A and B (Doyle et al. 2011)`,
    });
    const scaled: PositionProvider = {
      label: provider.label,
      availability: provider.availability,
      positionAt(time, p, v) {
        provider.positionAt(time, p, v);
        p.x *= scale;
        p.y *= scale;
        p.z *= scale;
        if (v) {
          v.x *= scale;
          v.y *= scale;
          v.z *= scale;
        }
      },
    };
    return hostStarRecord({
      id: k === 0 ? 'kepler-16' : 'kepler-16-b',
      name: s.name,
      aliases: k === 0 ? ['Kepler-16', ...designations] : [],
      designations: k === 0 ? designations : [],
      ...common,
      ...starInput(s),
      teffNote: k === 1 ? 'Its temperature is not measured: drawn at the Sun’s.' : undefined,
      parent: KEPLER16_BARYCENTRE,
      centre: KEPLER16_BARYCENTRE,
      provider: scaled,
      positionNote: orbitNote,
      // Each star's path is the relative orbit scaled by its share: n² (f a)³.
      orbitLine: { muKm3S2: muRel * Math.abs(scale) ** 3 },
    });
  };
  return [bary, member(0), member(1)];
}

/**
 * Records of the featured systems whose hosts are registered (`isRegistered`), or that bring
 * their own: the three new hosts, then every planet shown by default. Planets whose host is
 * missing (the star catalogue did not load) are left out.
 */
export function featuredRecords(file: FeaturedFile, isRegistered: (id: string) => boolean, nameOf: (id: string) => string): BodyRecord[] {
  const out: BodyRecord[] = [];
  for (const sys of file.systems) {
    const hostId = FEATURED_HOSTS[sys.id];
    if (!hostId) continue;
    const added = NEW_FEATURED_HOSTS.has(sys.id) ? newHostRecords(file, sys) : [];
    out.push(...added);
    if (!added.length && !isRegistered(hostId)) continue;
    const hostName = added.find((r) => r.id === hostId)?.name ?? nameOf(hostId);
    for (const p of sys.planets) if (featuredShown(p)) out.push(featuredPlanetRecord(file, sys, p, hostId, hostName));
  }
  return out;
}

function featuredPlanetRecord(file: FeaturedFile, sys: FeaturedSystem, p: FeaturedPlanet, hostId: string, hostName: string): BodyRecord {
  const id = featuredPlanetId(sys, p);
  const inp = p.inputs;
  const circumbinary = sys.id === 'kepler-16';
  const letter = p.id;
  const name = circumbinary ? 'Kepler-16 (AB) b' : sys.id === 'alf-cen' ? 'Alpha Centauri A candidate (S1)' : `${hostName} ${letter}`;
  const star = circumbinary ? undefined : sys.stars.find((s) => s.id === p.centre) ?? sys.stars[0];

  // References behind the orbit, for the sources and the data line.
  // One entry per short name (Agol et al.'s paper and its forecast table are both "Agol et al. 2021").
  const refKeys = [...new Set(Object.values(inp).map((v) => v.ref).filter((r): r is string => !!r && r !== 'chen2017'))];
  const sources: { label: string; url?: string }[] = [];
  for (const k of refKeys) {
    const label = REF_LABELS[k] ?? shortCite(file.refs[k]?.cite ?? k);
    const url = refUrl(file.refs[k] ?? {});
    const same = sources.find((s) => s.label === label);
    if (!same) sources.push({ label, url });
    else same.url ??= url;
  }
  const cites = sources.map((s) => s.label);
  const disc = p.discovery;

  const radiusEstimated = !!p.radiusEarth?.estimate || /estimate/i.test(p.radiusEarth?.derived ?? '');
  const radiusEarth = p.radiusEarth?.v ?? (typeof p.massEarth?.v === 'number' ? radiusFromMass(p.massEarth.v) : 1);
  const mKind = p.massEarth?.kind;
  const massKind: ExoplanetInfo['massKind'] = mKind === 'true' ? 'true' : mKind === 'minimum' ? 'minimum' : typeof p.massEarth?.v === 'number' ? 'estimated' : undefined;
  const massEarth = typeof p.massEarth?.v === 'number' ? p.massEarth.v : undefined;

  const teqPublished = p.teqK?.v;
  const teqStar = star?.teffK?.v && star.radiusRsun?.v ? equilibriumTemperatureK(star.teffK.v, star.radiusRsun.v, p.orbit.aAu) : NaN;
  const teq = teqPublished ?? teqStar;
  // A young giant photographed directly glows with its own heat: the temperature published for it
  // is its spectrum's, far above what its star's light gives (HR 8799's planets: ~1,200 K, not ~100 K).
  const ownHeat = teqPublished !== undefined && disc?.method === 'Imaging' && (!known(teqStar) || teqPublished > 2 * teqStar);

  // How the orbit was found, in phrases (the data sheet) and the notes the card needs.
  const provenance: string[] = [];
  const notes: string[] = [];
  const nodeAssumed = !!inp.nodeDeg?.assumed;
  const inclAssumed = !!inp.iDeg?.assumed;
  if (nodeAssumed) {
    provenance.push('Node: assumed');
    notes.push('The orientation of its orbit on the sky is not measured: assumed.');
  } else provenance.push(`Node: ${cites.length ? 'measured' : 'published'}`);
  if (inclAssumed) {
    provenance.push(`Inclination: assumed ${p.orbit.iDeg}°`);
    notes.push(`Inclination assumed (${p.orbit.iDeg}°): ${massKind === 'minimum' ? 'only its minimum mass is measured' : 'not measured'}.`);
  } else provenance.push('Inclination: measured');
  if (inp.e?.assumed || p.orbit.e === 0) provenance.push(p.orbit.e === 0 ? 'Eccentricity: circular (consistent with zero)' : 'Eccentricity: assumed');
  const phase = inp.phase as unknown as { kind?: string; assumed?: string } | undefined;
  if (phase?.assumed || sys.id === 'tau-cet') provenance.push('Phase: arbitrary');
  else provenance.push(`Phase: ${phase?.kind === 'transit' ? 'transit times' : phase?.kind === 'conjunction' ? 'time of conjunction' : phase?.kind === 'periastron' ? 'time of periastron' : 'fitted'}`);
  if (sys.id === 'tau-cet') notes.push('Position along its orbit unknown: the paper gives no date for its phase.');
  if (radiusEstimated) notes.push('Radius estimated from its mass (Chen & Kipping 2017), not measured.');
  if (massKind === 'minimum') notes.push('Its mass is a minimum (m sin i): radial velocities cannot tell the tilt of the orbit.');
  const ttv = TTV_MAX_MIN[id];
  if (ttv !== undefined && ttv > 10)
    notes.push(`A fixed Kepler orbit leaves out the planets’ tugs on one another: its transits wander by up to ${ttv >= 90 ? `${Math.round(ttv / 60)} hours` : `${Math.round(ttv)} minutes`}.`);
  for (const n of p.notes ?? []) notes.push(n);
  if (sys.id === 'proxima-cen') notes.push('Proxima c, a disputed 1,900-day signal, is not shown.');
  if (sys.id === 'tau-cet') notes.push('Tau Ceti e is not shown: the archive now lists it as a false positive.');

  const sigma = p.atEpoch.phaseSigmaDays;
  const phaseText = PHASE_TEXT[sys.id] ?? (sigma !== null ? `its place along the orbit known to ±${hms(sigma)} at the start of 2026` : 'timed by its published ephemeris');
  const positionNote = `Position: a Kepler orbit (${cites.join('; ')}), timed so that the Sun sees it as observed; ${phaseText}.`;

  const regime = sys.id === 'tau-cet' || sys.id === 'alf-cen' ? 'illustrative' : 'approximate';
  const statusText: Record<FeaturedPlanet['status'], string> = { confirmed: '', candidate: 'Candidate planet', disputed: 'Disputed planet', refuted: 'Refuted' };
  const kindText = circumbinary ? 'Circumbinary planet of Kepler-16 A and B' : p.status !== 'confirmed' ? `${statusText[p.status]} of ${hostName}` : undefined;

  const facts = SYSTEM_FACTS[sys.id] ? [SYSTEM_FACTS[sys.id]] : undefined;
  const factSources = disc?.url ? [disc.url] : [];
  const factSourceLabels = disc?.url ? [disc.reference] : [];
  for (const s of sources) {
    if (s.url && !factSources.includes(s.url)) {
      factSources.push(s.url);
      factSourceLabels.push(s.label);
    }
  }

  return planetRecord({
    id,
    name,
    aliases: [p.name, p.archiveName ?? '', ...(circumbinary ? ['Kepler-16 b'] : []), ...(IAU_NAMES[id] ?? [])],
    kindText,
    parent: hostId,
    centre: circumbinary ? KEPLER16_BARYCENTRE : undefined,
    litBy: hostId,
    lightTimeFrom: circumbinary ? KEPLER16_BARYCENTRE : hostId,
    raDeg: sys.position.raDeg,
    decDeg: sys.position.decDeg,
    orbit: p.orbit,
    regime,
    phaseJd: sys.epochJd,
    providerLabel: `Kepler orbit on the sky (${cites.join('; ')}), on the observed clock t + D/c`,
    info: {
      status: p.status,
      statusNote: p.statusNote,
      hostName: circumbinary ? 'Kepler-16 A and B' : hostName,
      archiveName: p.archiveName && p.archiveName !== name ? p.archiveName : undefined,
      periodD: p.orbit.periodDays,
      smaAu: p.orbit.aAu,
      ecc: p.orbit.e,
      inclDeg: p.orbit.iDeg,
      radiusEarth,
      radiusSource: p.radiusEarth ? (radiusEstimated ? 'estimated' : 'measured') : 'placeholder',
      massEarth,
      massKind,
      teqK: known(teq) ? Math.round(teq) : undefined,
      teqSource: ownHeat ? 'own-heat' : teqPublished !== undefined ? 'published' : known(teq) ? 'computed' : undefined,
      method: disc?.method ?? '',
      year: disc?.year,
      facility: disc?.facility,
      reference: disc?.reference,
      transits: phase?.kind === 'transit' || circumbinary,
      circumbinary,
      provenance,
    },
    trueMassEarth: massKind === 'true' && massEarth !== undefined ? massEarth : null,
    teqK: teq,
    positionNote,
    modelNotes: notes,
    facts,
    factSources,
    factSourceLabels,
    dataSource: `Orbit and planet: ${cites.join('; ')}${disc ? `; discovery: ${disc.reference}` : ''}`,
  });
}

// ─── The archive catalogue ───────────────────────────────────────────────────────────────

/** The star a catalogue planet is drawn about, with what its record needs. */
export interface CatalogueHost {
  /** Registry id of the host body. */
  id: string;
  name: string;
  /**
   * The host is one of the app's named stars (systems.json: Aldebaran, Pollux, Lalande 21185 …),
   * not a star registered on demand: its planets take its name.
   */
  named?: boolean;
}

/** The archive's three-letter Bayer abbreviations ("alf", "iot"), as Greek letters. */
const GREEK: Record<string, string> = {
  alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η', tet: 'θ', the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ',
  mu: 'μ', nu: 'ν', ksi: 'ξ', xi: 'ξ', omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', ome: 'ω',
};
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const BAYER = /^(alf|bet|gam|del|eps|zet|eta|tet|the|iot|kap|lam|mu|nu|ksi|xi|omi|pi|rho|sig|tau|ups|phi|chi|psi|ome)\.?\s?(\d?)\s([A-Z][a-z]{2})\b(.*)$/;

/** "iot Dra b" → "ι Dra b", "psi1 Dra B b" → "ψ¹ Dra B b"; anything else unchanged. */
export function greekBayer(name: string): string {
  const m = name.match(BAYER);
  if (!m) return name;
  return `${GREEK[m[1]]}${m[2] ? SUPERSCRIPT[Number(m[2])] : ''} ${m[3]}${m[4]}`;
}

/**
 * The name a planet goes by: after its star where the star is one of the app's named stars and
 * the archive calls it something else ("Aldebaran b" for "alf Tau b", "Lacaille 9352 b" for "GJ 887
 * b"), so the card, the Bodies list and the trail agree; otherwise the archive's name, with its
 * Bayer abbreviation as a Greek letter ("ι Dra b"). The archive's own name stays an alias.
 */
export function planetDisplayName(archiveName: string, archiveHost: string, host: CatalogueHost, letter: string | null | undefined): string {
  if (letter && host.named && host.name !== archiveHost) return `${host.name} ${letter}`;
  return greekBayer(archiveName);
}

const INCL_TEXT: Record<ArchiveOrbit['provenance']['incl'], string> = {
  archive: 'Inclination: archive',
  'siblings-median': 'Inclination: its siblings’ median (coplanar assumed)',
  'assumed-edge-on-transit': 'Inclination: 90° assumed (it transits)',
  'assumed-isotropic-median': 'Inclination: unknown, 60° assumed (the median for random tilts)',
  'adjusted-from-impact-parameter': 'Inclination: set by the archive’s impact parameter',
  'adjusted-assumed-impact-0.5': 'Inclination: set so that it transits (impact parameter 0.5 assumed)',
};

/** A catalogue planet's registry id: its name as an id (unique in the archive; checked by a test). */
export const cataloguePlanetId = (cat: ExoplanetCatalogue, i: number): string => slug(cat.planets.name[i]);

/**
 * The record of archive planet `i` about the host body `host` (the star catalogue's star, or a
 * record from hostRecordFromCatalogue). Null when the archive gives no orbit (neither a period
 * nor a semi-major axis).
 */
export function cataloguePlanetRecord(cat: ExoplanetCatalogue, i: number, ao: ArchiveOrbit | null, host: CatalogueHost): BodyRecord | null {
  if (!ao) return null;
  const P = cat.planets;
  const H = cat.hosts;
  const h = P.host[i];
  const flags = P.flags[i];
  const archiveName = P.name[i];
  const name = planetDisplayName(archiveName, H.name[h], host, P.letter[i]);
  const pv = ao.provenance;

  let radiusEarth = P.radius[i];
  let radiusSource: ExoplanetInfo['radiusSource'] = flags & PLANET_FLAGS.RADIUS_CALCULATED ? 'estimated' : 'measured';
  const notes: string[] = [];
  if (!known(radiusEarth) || !(radiusEarth > 0)) {
    if (known(P.mass[i]) && P.mass[i] > 0) {
      radiusEarth = radiusFromMass(P.mass[i]);
      radiusSource = 'estimated';
      notes.push('Radius estimated from its mass (Chen & Kipping 2017), not measured.');
    } else {
      radiusEarth = 1;
      radiusSource = 'placeholder';
      notes.push('Neither its size nor its mass is known: drawn at Earth’s size.');
    }
  } else if (radiusSource === 'estimated') notes.push('Radius estimated from its mass by the archive’s mass–radius relation, not measured.');

  const massKindText = cat.enums.massKind[P.massKind[i]];
  const massEarth = known(P.mass[i]) ? P.mass[i] : undefined;
  const massKind: ExoplanetInfo['massKind'] =
    massEarth === undefined
      ? undefined
      : flags & PLANET_FLAGS.MASS_CALCULATED || massKindText === 'M-R relationship'
        ? 'estimated'
        : massKindText === 'Msini' || massKindText === 'Msin(i)/sin(i)'
          ? 'minimum'
          : 'true';
  if (massKind === 'minimum') notes.push('Its mass is a minimum (m sin i): radial velocities cannot tell the tilt of the orbit.');

  let teq = P.teq[i];
  let teqSource: ExoplanetInfo['teqSource'] = 'published';
  const teqStar = known(H.teff[h]) && known(H.radius[h]) ? equilibriumTemperatureK(H.teff[h], H.radius[h], ao.orbit.aAu) : NaN;
  if (!known(teq) && known(teqStar)) {
    teq = teqStar;
    teqSource = 'computed';
  } else if (known(teq) && flags & PLANET_FLAGS.IMAGED && (!known(teqStar) || teq > 2 * teqStar)) {
    // A young giant photographed directly: the archive's temperature is its own glow's (its spectrum's).
    teqSource = 'own-heat';
  }

  const provenance: string[] = [];
  if (pv.period === 'kepler3') provenance.push('Period: from the semi-major axis (Kepler’s third law)');
  if (pv.sma === 'kepler3') provenance.push('Semi-major axis: from the period (Kepler’s third law)');
  if (pv.ecc !== 'archive') provenance.push(pv.ecc === 'limit-as-circular' ? 'Eccentricity: only a limit, circular assumed' : 'Eccentricity: unknown, circular assumed');
  provenance.push(INCL_TEXT[pv.incl]);
  provenance.push('Node: assumed');
  provenance.push(pv.phase === 'conjunction' ? (flags & PLANET_FLAGS.TRANSITS ? 'Phase: transit time' : 'Phase: time of conjunction') : pv.phase === 'periastron' ? 'Phase: time of periastron' : 'Phase: unknown');
  if (pv.hostMass === 'assumed-solar') provenance.push('Host mass: unknown, 1 M☉ assumed');

  notes.push(
    pv.incl === 'archive' || pv.incl.startsWith('adjusted')
      ? 'The orientation of its orbit on the sky is not measured: assumed.'
      : 'The tilt and orientation of its orbit are not measured: assumed.',
  );
  if (pv.phase === 'assumed') notes.push('Position along its orbit unknown: placed arbitrarily.');
  if (flags & PLANET_FLAGS.CIRCUMBINARY) notes.push('It orbits a pair of stars; it is drawn about one of them.');
  if (flags & PLANET_FLAGS.TTV) notes.push('A fixed Kepler orbit leaves out the transit-timing variations the planets cause in one another.');

  const refTime = pv.phase === 'conjunction' ? P.tconj[i] : pv.phase === 'periastron' ? P.tperi[i] : null;
  // Away from its reference time the phase drifts with the error of the period, which the file does not carry.
  const drift = '; away from that time its place along the orbit is less certain, by an amount the catalogue does not record';
  const phaseWords =
    pv.phase === 'conjunction'
      ? flags & PLANET_FLAGS.TRANSITS
        ? `timed by its transits, so the Sun sees one at the archived time${drift}`
        : `timed by its conjunction time${drift}`
      : pv.phase === 'periastron'
        ? `timed by its time of periastron${drift}`
        : 'its place along the orbit is arbitrary';
  const controversial = !!(flags & PLANET_FLAGS.CONTROVERSIAL);
  const method = cat.enums.method[P.method[i]] ?? '';
  const facility = cat.enums.facility[P.facility[i]] || undefined;
  return planetRecord({
    id: cataloguePlanetId(cat, i),
    name,
    // Its archive name stays findable; and so does its star's other name with its letter.
    aliases: [...new Set([archiveName, H.name[h] !== host.name ? `${host.name} ${P.letter[i] ?? ''}`.trim() : ''])].filter((a) => a && a !== name),
    kindText: controversial ? `Disputed planet of ${host.name}` : undefined,
    parent: host.id,
    litBy: host.id,
    lightTimeFrom: host.id,
    raDeg: H.ra[h],
    decDeg: H.dec[h],
    orbit: ao.orbit,
    regime: pv.phase === 'assumed' ? 'illustrative' : 'approximate',
    phaseJd: refTime !== null && known(refTime) ? refTime : null,
    providerLabel: 'Kepler orbit from the NASA Exoplanet Archive (PSCompPars), on the observed clock t + D/c',
    info: {
      status: controversial ? 'disputed' : 'confirmed',
      statusNote: controversial ? 'The NASA Exoplanet Archive flags this planet as controversial: its existence is disputed.' : undefined,
      hostName: host.name,
      archiveName: name !== archiveName ? archiveName : undefined,
      periodD: ao.orbit.periodDays,
      smaAu: ao.orbit.aAu,
      ecc: ao.orbit.e,
      inclDeg: ao.orbit.iDeg,
      radiusEarth,
      radiusSource,
      massEarth,
      massKind,
      teqK: known(teq) ? Math.round(teq) : undefined,
      teqSource: known(teq) ? teqSource : undefined,
      method,
      year: known(P.year[i]) ? P.year[i] : undefined,
      facility,
      transits: !!(flags & PLANET_FLAGS.TRANSITS),
      circumbinary: !!(flags & PLANET_FLAGS.CIRCUMBINARY),
      provenance,
    },
    trueMassEarth: massKind === 'true' && massEarth !== undefined ? massEarth : null,
    teqK: teq,
    positionNote: `Position: a Kepler orbit from the NASA Exoplanet Archive (retrieved ${cat.retrieved}), ${phaseWords}.`,
    modelNotes: notes,
    factSources: ['https://exoplanetarchive.ipac.caltech.edu/'],
    factSourceLabels: ['NASA Exoplanet Archive'],
    dataSource: `NASA Exoplanet Archive, Planetary Systems Composite Parameters (doi:${cat.doi}), retrieved ${cat.retrieved}`,
  });
}

/** Host i's registry id when it is registered from the archive (its name as an id; "-star" if a planet has that id). */
export function catalogueHostId(cat: ExoplanetCatalogue, h: number, planetIds: ReadonlySet<string>): string {
  const s = slug(cat.hosts.name[h]);
  return planetIds.has(s) ? `${s}-star` : s;
}

/**
 * A host the star catalogue lacks (a faint Kepler, K2, TESS or microlensing star), from the
 * archive's host columns; null when the archive gives no distance.
 */
export function hostRecordFromCatalogue(cat: ExoplanetCatalogue, h: number, id: string): BodyRecord | null {
  const H = cat.hosts;
  const d = H.dist[h];
  if (!known(d) || !(d > 0)) return null;
  const posRef = cat.enums.posRef[H.posRef[h]] ?? '';
  const epochNote = posRef.startsWith('archive') ? ['Its J2000 place is the archive’s position at its original epoch (no Gaia DR3 or Hipparcos astrometry): off by up to its proper motion over 16 years.'] : [];
  const designations = [H.hip[h] === H.hip[h] ? `HIP ${H.hip[h]}` : null, H.hd[h] ? `HD ${H.hd[h]}` : null, H.gaia[h] ? `Gaia DR3 ${H.gaia[h]}` : null].filter(
    (x): x is string => !!x,
  );
  const rec = hostStarRecord({
    id,
    name: H.name[h],
    aliases: designations,
    raDeg: H.ra[h],
    decDeg: H.dec[h],
    distancePc: d,
    pmRaMasYr: H.pmra[h],
    pmDecMasYr: H.pmdec[h],
    rvKms: H.rv[h],
    teffK: H.teff[h],
    radiusRsun: H.radius[h],
    massMsun: H.mass[h],
    luminosityLsun: known(H.logL[h]) ? 10 ** H.logL[h] : NaN,
    vmag: H.vmag[h],
    spectralType: H.spType[h] ?? undefined,
    designations,
    distanceSource: 'the NASA Exoplanet Archive (mostly TIC v8: Gaia DR2 parallaxes)',
    refs: [`NASA Exoplanet Archive (doi:${cat.doi}), retrieved ${cat.retrieved}`],
    dataSource: `NASA Exoplanet Archive, Planetary Systems Composite Parameters (doi:${cat.doi}); J2000 place from ${posRef.startsWith('archive') ? 'the archive' : posRef === 'gaia' ? 'Gaia DR3' : 'Hipparcos'}`,
    modelNotes: [...epochNote, 'Not in the star catalogue (too faint): placed from the NASA Exoplanet Archive.'],
  });
  return { ...rec, onDemand: true };
}
