/**
 * Featured systems (staging/exoplanets/featured.json): types and the state of a whole system
 * (stars and planets) at a given time.
 */
import { AU_KM, M_EARTH_MSUN, PARSEC_KM } from './constants.ts';
import { type KeplerOrbit, observedTimeJd, orbitSky } from './orbit.ts';
import { type SkyVec, type Vec3, skyToEcliptic } from './sky.ts';

/** A cited value. err is symmetric or [minus, plus]. */
export interface Cited<T = number> {
  v: T;
  err?: number | [number, number];
  ref?: string;
  where?: string;
  source?: string;
  url?: string;
  note?: string;
  /** Present when the value is not measured: what was assumed and why. */
  assumed?: string;
  /** Present when the value was computed from cited values: how. */
  derived?: string;
  /** True for model estimates (e.g. a radius from a mass-radius relation). */
  estimate?: boolean;
  /** For argPeri inputs: whose omega was published. */
  convention?: 'star' | 'planet';
  /** For masses: 'true' | 'minimum' | 'model-dependent' | ... */
  kind?: string;
  [extra: string]: unknown;
}

export interface FeaturedStar {
  id: string;
  name: string;
  massMsun: Cited | null;
  radiusRsun?: Cited | null;
  teffK?: Cited | null;
  luminosityLsun?: Cited | null;
  spectralType?: Cited<string> | null;
}

export interface FeaturedPlanet {
  id: string;
  name: string;
  /** pl_name in the archive catalogue, or null if the archive does not list it as a planet. */
  archiveName: string | null;
  status: 'confirmed' | 'candidate' | 'disputed' | 'refuted';
  /** False for objects the app should hide unless asked (refuted or strongly disputed). Default true. */
  showByDefault?: boolean;
  statusNote?: string;
  /** Star id the planet orbits, or 'AB' for the barycentre of the system's binary. */
  centre: string;
  /** The numbers the evaluator uses (conventions in orbit.ts). */
  orbit: KeplerOrbit;
  /** The cited inputs behind `orbit`. */
  inputs: Record<string, Cited & Record<string, unknown>>;
  atEpoch: { jd: number; meanAnomalyDeg: number; firstConjunctionAfterJd: number; phaseSigmaDays: number | null; phaseSigmaOrbits: number | null };
  radiusEarth: Cited | null;
  massEarth: Cited<number | null> | null;
  teqK?: Cited | null;
  discovery?: { year: number; method: string; facility: string; reference: string; url: string | null };
  notes?: string[];
}

export interface FeaturedStarOrbit {
  primary: string;
  secondary: string;
  /** M_secondary / (M_primary + M_secondary). */
  massFractionSecondary: number;
  /** Orbit of the secondary relative to the primary. */
  orbit: KeplerOrbit;
  inputs: Record<string, Cited>;
  note?: string;
}

export interface FeaturedSystem {
  id: string;
  name: string;
  archiveHost: string | null;
  position: {
    raDeg: number;
    decDeg: number;
    distancePc: number;
    pmRaMasYr?: number;
    pmDecMasYr?: number;
    radialVelocityKms?: number | null;
    ref: string;
    source: string;
    ids: Record<string, string | number | null>;
  };
  epochJd: number;
  epochIso: string;
  stars: FeaturedStar[];
  starOrbit?: FeaturedStarOrbit;
  planets: FeaturedPlanet[];
  notes?: string[];
}

export interface FeaturedFile {
  format: 'lightspeed-exoplanets-featured/1';
  generated: string;
  epoch: { jd: number; iso: string; note: string };
  conventions: Record<string, string>;
  refs: Record<string, { cite: string; doi?: string; ads?: string; arxiv?: string; url?: string }>;
  systems: FeaturedSystem[];
}

export interface BodyState {
  id: string;
  kind: 'star' | 'planet';
  /** Offset from the system barycentre, J2000 ecliptic, km. */
  offsetKm: Vec3;
  /** The same offset in sky components (au): north, east, away from the Sun. */
  sky: SkyVec;
}

const add = (a: SkyVec, b: SkyVec): SkyVec => ({ north: a.north + b.north, east: a.east + b.east, away: a.away + b.away });
const mul = (a: SkyVec, k: number): SkyVec => ({ north: a.north * k, east: a.east * k, away: a.away * k });

/**
 * Positions of every star and planet of a featured system at the app's coordinate time tJd (TDB,
 * Sun rest frame), relative to the system barycentre.
 *
 * - distanceKm: the distance at which the app places the system at tJd (defaults to the file's
 *   distance). It sets the light-time mapping onto the observed clock (orbit.ts, observedTimeJd).
 * - Hierarchy: the binary (if any) is evaluated first; planets are placed about their centre star or
 *   the binary barycentre ('AB'). The barycentre of everything (planet masses included where known)
 *   is then subtracted, which gives each star its reflex wobble.
 * - Planets with status 'refuted' are skipped unless includeHidden is true; so are planets with
 *   showByDefault === false.
 */
export function featuredSystemState(
  sys: FeaturedSystem,
  tJd: number,
  opts: { distanceKm?: number; includeHidden?: boolean } = {},
): BodyState[] {
  const D = opts.distanceKm ?? sys.position.distancePc * PARSEC_KM;
  const tObs = observedTimeJd(tJd, D);
  const zero: SkyVec = { north: 0, east: 0, away: 0 };
  const starPos = new Map<string, SkyVec>();
  const starMass = new Map<string, number>();
  for (const s of sys.stars) {
    starPos.set(s.id, zero);
    starMass.set(s.id, s.massMsun?.v ?? 0);
  }
  if (sys.starOrbit) {
    const so = sys.starOrbit;
    const rel = orbitSky(so.orbit, tObs).pos;
    starPos.set(so.primary, mul(rel, -so.massFractionSecondary));
    starPos.set(so.secondary, mul(rel, 1 - so.massFractionSecondary));
  }
  const bodies: { id: string; kind: 'star' | 'planet'; pos: SkyVec; mass: number }[] = sys.stars.map((s) => ({
    id: s.id,
    kind: 'star',
    pos: starPos.get(s.id) as SkyVec,
    mass: starMass.get(s.id) as number,
  }));
  for (const p of sys.planets) {
    if (!opts.includeHidden && (p.status === 'refuted' || p.showByDefault === false)) continue;
    const centre = p.centre === 'AB' ? zero : (starPos.get(p.centre) ?? zero);
    const rel = orbitSky(p.orbit, tObs).pos;
    const m = typeof p.massEarth?.v === 'number' ? p.massEarth.v * M_EARTH_MSUN : 0;
    bodies.push({ id: p.id, kind: 'planet', pos: add(centre, rel), mass: m });
  }
  const mTot = bodies.reduce((s, b) => s + b.mass, 0);
  const com = mTot > 0 ? bodies.reduce((c, b) => add(c, mul(b.pos, b.mass / mTot)), zero) : zero;
  return bodies.map((b) => {
    const sky = add(b.pos, mul(com, -1));
    const e = skyToEcliptic(sys.position.raDeg, sys.position.decDeg, sky);
    return { id: b.id, kind: b.kind, sky, offsetKm: { x: e.x * AU_KM, y: e.y * AU_KM, z: e.z * AU_KM } };
  });
}

/** Look up a system by id. */
export function findSystem(file: FeaturedFile, id: string): FeaturedSystem | undefined {
  return file.systems.find((s) => s.id === id);
}
