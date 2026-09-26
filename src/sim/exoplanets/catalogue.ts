/**
 * The archive catalogue (public/data/exoplanets.json.gz, docs/data/exoplanets.md §1): decoding,
 * lookup, and turning an archive record into a complete Kepler orbit with every gap filled by a
 * stated assumption.
 *
 * The file is column-oriented JSON with `null` for missing values. The app keeps it packed: every
 * numeric column becomes a typed array with NaN for "no value" (the worker builds it and hands
 * the arrays over without copying), and the text columns stay arrays of strings.
 *
 * Vercel serves .gz files without Content-Encoding (application/octet-stream is not compressed on
 * the fly), so the browser receives the raw gzip bytes and they are inflated with
 * DecompressionStream. If a server does add Content-Encoding: gzip, fetch() has already inflated
 * the body; that shows in the first two bytes (the gzip magic 1f 8b is missing) and the second
 * inflation is skipped.
 */
import { AU_KM, DEG, J2000_JD, M_EARTH_MSUN, PARSEC_KM, R_EARTH_KM, R_SUN_KM } from './constants';
import { periodDays as periodFromA, semiMajorAxisAu, wrap360 } from './kepler';
import { type KeplerOrbit, argPeriPlanetFromStar, tPeriFromConjunction, tPeriFromMeanAnomaly, trueAnomalyAtConjunction } from './orbit';

/** Bit flags in planets.flags (identical to enums.flags in the file). */
export const PLANET_FLAGS = {
  CONTROVERSIAL: 1,
  CIRCUMBINARY: 2,
  TRANSITS: 4,
  TTV: 8,
  RADIUS_CALCULATED: 16,
  MASS_CALCULATED: 32,
  TEQ_CALCULATED: 64,
  MASS_LIMIT: 128,
  ECC_LIMIT: 256,
  IMAGED: 512,
  RV: 1024,
  ASTROMETRY: 2048,
  MICROLENSING: 4096,
  INCL_LIMIT: 8192,
  RADIUS_LIMIT: 16384,
} as const;

type Col<T> = (T | null)[];

/** What the file holds, as parsed. */
export interface ExoplanetCatalogueJson {
  format: 'lightspeed-exoplanets/1';
  source: string;
  doi: string;
  citation: string;
  retrieved: string;
  counts: { planets: number; hosts: number; transiting: number; controversial: number; circumbinary: number };
  units: Record<string, string>;
  /** Meaning of each hosts.posRef value ('gaia', 'hipparcos', 'archive: ...'); positions are J2000.0 except 'archive'. */
  positionSources?: Record<string, string>;
  enums: CatalogueEnums;
  hosts: {
    name: string[];
    hip: Col<number>;
    hd: Col<string>;
    gaia: Col<string>;
    ra: number[];
    dec: number[];
    dist: Col<number>;
    pmra: Col<number>;
    pmdec: Col<number>;
    rv: Col<number>;
    teff: Col<number>;
    radius: Col<number>;
    mass: Col<number>;
    logL: Col<number>;
    spType: Col<string>;
    vmag: Col<number>;
    nStars: Col<number>;
    nPlanets: Col<number>;
    posRef: number[];
  };
  planets: {
    name: string[];
    host: number[];
    letter: Col<string>;
    period: Col<number>;
    sma: Col<number>;
    ecc: Col<number>;
    incl: Col<number>;
    impact: Col<number>;
    omega: Col<number>;
    node: Col<number>;
    tperi: Col<number>;
    tperiSys: number[];
    tconj: Col<number>;
    tconjSys: number[];
    radius: Col<number>;
    mass: Col<number>;
    massKind: number[];
    teq: Col<number>;
    method: number[];
    year: Col<number>;
    facility: number[];
    flags: number[];
  };
}

export interface CatalogueEnums {
  method: string[];
  facility: string[];
  massKind: string[];
  timeSystem: string[];
  posRef: string[];
  flags: Record<string, number>;
}

/**
 * The catalogue as the app keeps it. Numbers are float64 with NaN for "no value" (`known(x)`);
 * the Gaia DR3 ids stay strings (they exceed 2^53).
 */
export interface ExoplanetCatalogue {
  format: 'lightspeed-exoplanets/1';
  source: string;
  doi: string;
  citation: string;
  retrieved: string;
  counts: ExoplanetCatalogueJson['counts'];
  units: Record<string, string>;
  positionSources?: Record<string, string>;
  enums: CatalogueEnums;
  hosts: {
    count: number;
    name: string[];
    hip: Float64Array;
    hd: (string | null)[];
    gaia: (string | null)[];
    /** ICRS degrees, epoch J2000.0 (except the hosts whose posRef is 'archive: …'). */
    ra: Float64Array;
    dec: Float64Array;
    /** pc */
    dist: Float64Array;
    /** mas/yr (pmra includes cos dec) */
    pmra: Float64Array;
    pmdec: Float64Array;
    /** km/s */
    rv: Float64Array;
    teff: Float64Array;
    /** R☉ */
    radius: Float64Array;
    /** M☉ */
    mass: Float64Array;
    logL: Float64Array;
    spType: (string | null)[];
    vmag: Float64Array;
    nStars: Float64Array;
    nPlanets: Float64Array;
    posRef: Uint8Array;
    /** First planet of each host and how many it has (planets are stored grouped by host). */
    firstPlanet: Int32Array;
    planetCount: Int32Array;
  };
  planets: {
    count: number;
    name: string[];
    host: Int32Array;
    letter: (string | null)[];
    /** days */
    period: Float64Array;
    /** au */
    sma: Float64Array;
    ecc: Float64Array;
    /** degrees */
    incl: Float64Array;
    impact: Float64Array;
    omega: Float64Array;
    node: Float64Array;
    /** JD */
    tperi: Float64Array;
    tperiSys: Uint8Array;
    tconj: Float64Array;
    tconjSys: Uint8Array;
    /** Earth radii (6,378.1 km) */
    radius: Float64Array;
    /** Earth masses */
    mass: Float64Array;
    massKind: Uint8Array;
    /** K */
    teq: Float64Array;
    method: Uint8Array;
    year: Float64Array;
    facility: Uint8Array;
    flags: Uint32Array;
  };
}

/** Whether a packed value is present (NaN means the archive has none). */
export const known = (x: number): boolean => x === x;

const f64 = (col: Col<number>): Float64Array => {
  const out = new Float64Array(col.length);
  for (let i = 0; i < col.length; i++) out[i] = col[i] ?? NaN;
  return out;
};

/** Pack the parsed file (in the worker; the tests call it directly). */
export function packCatalogue(j: ExoplanetCatalogueJson): ExoplanetCatalogue {
  if (j.format !== 'lightspeed-exoplanets/1') throw new Error(`exoplanets: unexpected catalogue format ${String(j.format)}`);
  const H = j.hosts;
  const P = j.planets;
  const nh = H.name.length;
  const np = P.name.length;
  const firstPlanet = new Int32Array(nh).fill(-1);
  const planetCount = new Int32Array(nh);
  for (let i = 0; i < np; i++) {
    const h = P.host[i];
    if (firstPlanet[h] < 0) firstPlanet[h] = i;
    else if (P.host[i - 1] !== h) throw new Error('exoplanets: planets are not grouped by host');
    planetCount[h]++;
  }
  return {
    format: j.format,
    source: j.source,
    doi: j.doi,
    citation: j.citation,
    retrieved: j.retrieved,
    counts: j.counts,
    units: j.units,
    positionSources: j.positionSources,
    enums: j.enums,
    hosts: {
      count: nh,
      name: H.name,
      hip: f64(H.hip),
      hd: H.hd,
      gaia: H.gaia,
      ra: Float64Array.from(H.ra),
      dec: Float64Array.from(H.dec),
      dist: f64(H.dist),
      pmra: f64(H.pmra),
      pmdec: f64(H.pmdec),
      rv: f64(H.rv),
      teff: f64(H.teff),
      radius: f64(H.radius),
      mass: f64(H.mass),
      logL: f64(H.logL),
      spType: H.spType,
      vmag: f64(H.vmag),
      nStars: f64(H.nStars),
      nPlanets: f64(H.nPlanets),
      posRef: Uint8Array.from(H.posRef),
      firstPlanet,
      planetCount,
    },
    planets: {
      count: np,
      name: P.name,
      host: Int32Array.from(P.host),
      letter: P.letter,
      period: f64(P.period),
      sma: f64(P.sma),
      ecc: f64(P.ecc),
      incl: f64(P.incl),
      impact: f64(P.impact),
      omega: f64(P.omega),
      node: f64(P.node),
      tperi: f64(P.tperi),
      tperiSys: Uint8Array.from(P.tperiSys),
      tconj: f64(P.tconj),
      tconjSys: Uint8Array.from(P.tconjSys),
      radius: f64(P.radius),
      mass: f64(P.mass),
      massKind: Uint8Array.from(P.massKind),
      teq: f64(P.teq),
      method: Uint8Array.from(P.method),
      year: f64(P.year),
      facility: Uint8Array.from(P.facility),
      flags: Uint32Array.from(P.flags),
    },
  };
}

/** The typed arrays of a packed catalogue, to hand over from the worker without copying. */
export function catalogueTransfer(c: ExoplanetCatalogue): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const table of [c.hosts, c.planets] as Record<string, unknown>[])
    for (const v of Object.values(table)) if (ArrayBuffer.isView(v)) out.push(v.buffer as ArrayBuffer);
  return out;
}

/** Parse and pack the file's bytes, inflating them first if they are still gzip. */
export async function decodeCatalogue(bytes: Uint8Array): Promise<ExoplanetCatalogue> {
  let data = bytes;
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return packCatalogue(JSON.parse(new TextDecoder().decode(data)) as ExoplanetCatalogueJson);
}

/** Indices of the planets of a host (planets are stored grouped by host, sorted by period). */
export function planetsOfHost(cat: ExoplanetCatalogue, hostIndex: number): number[] {
  const first = cat.hosts.firstPlanet[hostIndex];
  const n = cat.hosts.planetCount[hostIndex];
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(first + k);
  return out;
}

/** FNV-1a (32-bit over UTF-16 code units). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The position angle assumed for the ascending node of every planet of a host: the archive has no
 * node column, and transits and RVs cannot measure it. A fixed pseudo-random angle (0.1 deg steps)
 * derived from the archive host name, so every system gets a different, reproducible orientation
 * on the sky and all planets of one host share it (assumed coplanar). Same function as the featured
 * build script.
 */
export function assumedNodeDeg(hostName: string): number {
  return Math.round((fnv1a(hostName) / 2 ** 32) * 3600) / 10;
}

/** A pseudo-random mean anomaly (radians) for planets whose phase is unknown. */
export function assumedMeanAnomaly(planetName: string): number {
  return (fnv1a(`phase:${planetName}`) / 2 ** 32) * 2 * Math.PI;
}

/** How each element of an archive orbit was obtained. */
export interface ArchiveOrbitProvenance {
  period: 'archive' | 'kepler3';
  sma: 'archive' | 'kepler3';
  ecc: 'archive' | 'assumed-circular' | 'limit-as-circular';
  argPeri: 'archive-star' | 'archive-planet' | 'assumed';
  incl:
    | 'archive'
    | 'siblings-median'
    | 'assumed-edge-on-transit'
    | 'assumed-isotropic-median'
    | 'adjusted-from-impact-parameter'
    | 'adjusted-assumed-impact-0.5';
  node: 'archive' | 'assumed';
  phase: 'conjunction' | 'periastron' | 'assumed';
  hostMass: 'archive' | 'assumed-solar';
}

export interface ArchiveOrbit {
  orbit: KeplerOrbit;
  provenance: ArchiveOrbitProvenance;
  /** Mass of the central star used for Kepler's third law, solar masses. */
  hostMassMsun: number;
  /** Planet mass used (Earth masses; may be m sin i or a mass-radius estimate, see massKind), or null. */
  planetMassEarth: number | null;
}

/** Median of the known inclinations of the other planets of the same host, or NaN. */
function siblingsInclination(cat: ExoplanetCatalogue, planet: number): number {
  const P = cat.planets;
  const h = P.host[planet];
  const vals: number[] = [];
  const first = cat.hosts.firstPlanet[h];
  for (let j = first; j < first + cat.hosts.planetCount[h]; j++) {
    const v = P.incl[j];
    if (j !== planet && known(v) && !(P.flags[j] & PLANET_FLAGS.INCL_LIMIT)) vals.push(v);
  }
  if (!vals.length) return NaN;
  vals.sort((a, b) => a - b);
  const m = vals.length >> 1;
  return vals.length % 2 ? vals[m] : 0.5 * (vals[m - 1] + vals[m]);
}

/**
 * A complete Kepler orbit for archive planet `i`, or null when the archive has neither a period nor
 * a semi-major axis (a few microlensing and imaging planets).
 *
 * Rules, in order (each recorded in `provenance`):
 * - Host mass: archive st_mass, else 1 solar mass.
 * - Period and semi-major axis: archive values; a missing one from Kepler's third law with
 *   M = host + planet.
 * - Eccentricity: archive value; missing or given only as a limit -> 0.
 * - Argument of periastron: archive pl_orblper. For Imaging and Astrometry discoveries the published
 *   value is the companion's own omega; for all other methods it is the star's (RV/transit
 *   convention) and 180 deg is added. Missing -> 90 deg (irrelevant when e = 0).
 * - Inclination: archive; else the median of the host's other planets (assumed coplanar); else 90 deg
 *   for transiting planets; else 60 deg, the median for randomly oriented orbits. For a transiting
 *   planet whose inclination, semi-major axis and stellar radius (possibly from different papers)
 *   would miss the star, the inclination is adjusted to the archive impact parameter, or to b = 0.5.
 * - Node: the archive has none, so it is assumed (assumedNodeDeg of the host name).
 * - Phase: the transit / conjunction time if given (it pins the phase directly); else the time of
 *   periastron; else a pseudo-random mean anomaly at J2000 (assumed).
 * Time systems (BJD, HJD, JD) are used as given; they differ by less than ~8 minutes.
 */
export function archiveOrbit(cat: ExoplanetCatalogue, i: number): ArchiveOrbit | null {
  const p = cat.planets;
  const h = p.host[i];
  const hostName = cat.hosts.name[h];
  const flags = p.flags[i];
  const method = cat.enums.method[p.method[i]];

  const hostMassArchive = cat.hosts.mass[h];
  const massKnown = known(hostMassArchive) && hostMassArchive > 0;
  const hostMassMsun = massKnown ? hostMassArchive : 1;
  const planetMassEarth = known(p.mass[i]) ? p.mass[i] : null;
  const mTot = hostMassMsun + (planetMassEarth ?? 0) * M_EARTH_MSUN;

  let P = p.period[i];
  let a = p.sma[i];
  let periodProv: ArchiveOrbitProvenance['period'] = 'archive';
  let smaProv: ArchiveOrbitProvenance['sma'] = 'archive';
  if (!known(P) && !known(a)) return null;
  if (!known(P)) {
    P = periodFromA(a, mTot);
    periodProv = 'kepler3';
  }
  if (!known(a)) {
    a = semiMajorAxisAu(P, mTot);
    smaProv = 'kepler3';
  }

  let e = p.ecc[i];
  let eccProv: ArchiveOrbitProvenance['ecc'] = 'archive';
  if (!(e >= 0 && e < 1)) {
    e = 0;
    eccProv = 'assumed-circular';
  } else if (flags & PLANET_FLAGS.ECC_LIMIT) {
    e = 0;
    eccProv = 'limit-as-circular';
  }

  let argPeri: number;
  let argProv: ArchiveOrbitProvenance['argPeri'];
  const w = p.omega[i];
  if (!known(w)) {
    argPeri = argPeriPlanetFromStar(90);
    argProv = 'assumed';
  } else if (method === 'Imaging' || method === 'Astrometry') {
    argPeri = wrap360(w);
    argProv = 'archive-planet';
  } else {
    argPeri = argPeriPlanetFromStar(w);
    argProv = 'archive-star';
  }

  let incl = p.incl[i];
  let inclProv: ArchiveOrbitProvenance['incl'] = 'archive';
  if (!known(incl)) {
    const s = siblingsInclination(cat, i);
    if (known(s)) {
      incl = s;
      inclProv = 'siblings-median';
    } else if (flags & PLANET_FLAGS.TRANSITS) {
      incl = 90;
      inclProv = 'assumed-edge-on-transit';
    } else {
      incl = 60;
      inclProv = 'assumed-isotropic-median';
    }
  }

  // A transiting planet must transit. The composite table can combine an inclination, a semi-major
  // axis and a stellar radius from different papers that together miss the star (13% of transiting
  // planets). Then keep the transit chord: use the archive impact parameter if it transits, else
  // assume b = 0.5 (the median for transiting orbits).
  const rStar = cat.hosts.radius[h];
  if (flags & PLANET_FLAGS.TRANSITS && known(rStar) && rStar > 0) {
    const fc = trueAnomalyAtConjunction(argPeri);
    const rc = (a * (1 - e * e)) / (1 + e * Math.cos(fc)); // au, planet-star distance at conjunction
    const rStarAu = (rStar * R_SUN_KM) / AU_KM;
    const k = ((known(p.radius[i]) ? p.radius[i] : 0) * R_EARTH_KM) / (rStar * R_SUN_KM);
    const bModel = (rc * Math.abs(Math.cos(incl * DEG))) / rStarAu;
    if (bModel > 1 + k) {
      const bArchive = p.impact[i];
      const useArchive = known(bArchive) && bArchive >= 0 && bArchive < 1 + k;
      const b = useArchive ? bArchive : 0.5;
      const ci = Math.min(1, (b * rStarAu) / rc);
      const i0 = Math.acos(ci) / DEG;
      incl = incl > 90 ? 180 - i0 : i0;
      inclProv = useArchive ? 'adjusted-from-impact-parameter' : 'adjusted-assumed-impact-0.5';
    }
  }

  let tPeri: number;
  let phaseProv: ArchiveOrbitProvenance['phase'];
  const tc = p.tconj[i];
  const tp = p.tperi[i];
  if (known(tc)) {
    tPeri = tPeriFromConjunction(tc, P, e, argPeri);
    phaseProv = 'conjunction';
  } else if (known(tp)) {
    tPeri = tp;
    phaseProv = 'periastron';
  } else {
    tPeri = tPeriFromMeanAnomaly(assumedMeanAnomaly(p.name[i]), J2000_JD, P);
    phaseProv = 'assumed';
  }

  const node = p.node[i];
  return {
    orbit: { periodDays: P, aAu: a, e, iDeg: incl, nodeDeg: known(node) ? node : assumedNodeDeg(hostName), argPeriDeg: argPeri, tPeriJd: tPeri },
    provenance: {
      period: periodProv,
      sma: smaProv,
      ecc: eccProv,
      argPeri: argProv,
      incl: inclProv,
      node: known(node) ? 'archive' : 'assumed',
      phase: phaseProv,
      hostMass: massKnown ? 'archive' : 'assumed-solar',
    },
    hostMassMsun,
    planetMassEarth,
  };
}

/** Host direction and distance as archived (distance null when the archive has none). */
export function hostSky(cat: ExoplanetCatalogue, h: number): { raDeg: number; decDeg: number; distanceKm: number | null } {
  const d = cat.hosts.dist[h];
  return { raDeg: cat.hosts.ra[h], decDeg: cat.hosts.dec[h], distanceKm: known(d) ? d * PARSEC_KM : null };
}

// ─── Matching hosts to the star catalogue ────────────────────────────────────────────────

/** How a host was found in the star catalogue. */
export type MatchKind = 'gaia' | 'hip' | 'hd' | 'position';
export const MATCH_KINDS: readonly MatchKind[] = ['gaia', 'hip', 'hd', 'position'];

/**
 * The app's star catalogue as the matcher needs it: J2000 positions (pc, ecliptic axes, as
 * stars3d.bin.gz stores them), absolute V magnitudes, and the HIP and HD numbers of the names
 * table (star index and number, parallel; optional).
 */
export interface StarCatalogueKeys {
  count: number;
  positions: Float32Array;
  absMag: Float32Array;
  hip?: { star: Int32Array; id: Int32Array };
  hd?: { star: Int32Array; id: Int32Array };
  /** Gaia DR3 source ids by star, if a later star file carries them. */
  gaia?: (string | null)[];
}

/** Host i → its star in the star catalogue (−1 when it is not there), and how it was found (index into MATCH_KINDS). */
export interface HostMatches {
  star: Int32Array;
  by: Uint8Array;
}

/** A position match: the tolerance is 2″ plus 25 years of proper motion (arcsec). */
const matchToleranceArcsec = (pmMasYr: number): number => 2 + (pmMasYr / 1000) * 25;

/** Dec bands and RA cells of the positional grid, degrees. */
const CELL_DEG = 0.25;
const DEC_CELLS = Math.round(180 / CELL_DEG);
const RA_CELLS = Math.round(360 / CELL_DEG);

/**
 * Match every host to the star catalogue, in the order of exoplanets.md §1: Gaia DR3 id (when the
 * star file carries them), then HIP, then HD (the leading integer of the archive designation, so
 * "41004 B" matches HD 41004 only if nothing better does), then position: the nearest star within
 * 2″ + |pm| × 25 yr (both files are at J2000, so the tolerance is generous; it covers the few
 * 'archive' hosts whose epoch is uncertain), rejecting candidates whose V differs by more than
 * 1.5 mag or whose distance ratio falls outside 0.7–1.4; for a star within 1″ at the same distance to
 * 5% the V may differ by up to 2.5 mag, as the V of the coolest dwarfs is often an estimate and
 * catalogues disagree by up to 2 mag (TRAPPIST-1: 17.0 in the archive, 18.8 in the star catalogue).
 * A star is claimed by one host at most (the first by these rules).
 *
 * Costs about 50 ms for the 330,000 stars (a grid of 0.25° cells, sorted by counting): the app
 * runs it in the exoplanet worker.
 */
export function matchHosts(cat: ExoplanetCatalogue, stars: StarCatalogueKeys): HostMatches {
  const H = cat.hosts;
  const nh = H.count;
  const star = new Int32Array(nh).fill(-1);
  const by = new Uint8Array(nh);
  const claimed = new Set<number>();
  const take = (h: number, s: number, kind: MatchKind) => {
    if (s < 0 || claimed.has(s)) return false;
    claimed.add(s);
    star[h] = s;
    by[h] = MATCH_KINDS.indexOf(kind);
    return true;
  };
  // Numeric catalogues: number → star (the first star with the number).
  const lookup = (col?: { star: Int32Array; id: Int32Array }) => {
    const m = new Map<number, number>();
    if (col) for (let k = 0; k < col.id.length; k++) if (!m.has(col.id[k])) m.set(col.id[k], col.star[k]);
    return m;
  };
  const byHip = lookup(stars.hip);
  const byHd = lookup(stars.hd);
  const byGaia = new Map<string, number>();
  stars.gaia?.forEach((g, k) => {
    if (g) byGaia.set(g, k);
  });
  const pending: number[] = [];
  for (let h = 0; h < nh; h++) {
    const g = H.gaia[h];
    if (g && byGaia.has(g) && take(h, byGaia.get(g)!, 'gaia')) continue;
    const hip = H.hip[h];
    if (known(hip) && byHip.has(hip) && take(h, byHip.get(hip)!, 'hip')) continue;
    const hd = H.hd[h] ? Number(H.hd[h]!.match(/^\d+/)?.[0]) : NaN;
    if (Number.isFinite(hd) && byHd.has(hd) && take(h, byHd.get(hd)!, 'hd')) continue;
    pending.push(h);
  }
  if (!pending.length) return { star, by };

  // The positional grid: every star's J2000 RA and Dec, in cells sorted by counting.
  const n = stars.count;
  const P = stars.positions;
  const eps = (84_381.448 / 3600) * DEG;
  const ce = Math.cos(eps);
  const se = Math.sin(eps);
  const raS = new Float32Array(n);
  const decS = new Float32Array(n);
  const vS = new Float32Array(n);
  const dS = new Float32Array(n);
  const cellOf = new Int32Array(n);
  const counts = new Int32Array(DEC_CELLS * RA_CELLS + 1);
  for (let s = 0; s < n; s++) {
    const x = P[3 * s];
    const y = P[3 * s + 1];
    const z = P[3 * s + 2];
    // Ecliptic → equatorial (rotation by −ε about x).
    const ye = ce * y - se * z;
    const ze = se * y + ce * z;
    const d = Math.hypot(x, y, z);
    const dec = Math.asin(Math.max(-1, Math.min(1, ze / d))) / DEG;
    let ra = Math.atan2(ye, x) / DEG;
    if (ra < 0) ra += 360;
    raS[s] = ra;
    decS[s] = dec;
    dS[s] = d;
    vS[s] = stars.absMag[s] + 5 * Math.log10(d) - 5;
    const c = Math.min(DEC_CELLS - 1, Math.floor((dec + 90) / CELL_DEG)) * RA_CELLS + Math.min(RA_CELLS - 1, Math.floor(ra / CELL_DEG));
    cellOf[s] = c;
    counts[c + 1]++;
  }
  for (let c = 0; c < DEC_CELLS * RA_CELLS; c++) counts[c + 1] += counts[c];
  const order = new Int32Array(n);
  const fill = counts.slice(0, DEC_CELLS * RA_CELLS);
  for (let s = 0; s < n; s++) order[fill[cellOf[s]]++] = s;

  const sep = (ra1: number, de1: number, ra2: number, de2: number) => {
    const q = Math.sin(((de2 - de1) * DEG) / 2) ** 2 + Math.cos(de1 * DEG) * Math.cos(de2 * DEG) * Math.sin(((ra2 - ra1) * DEG) / 2) ** 2;
    return ((2 * Math.asin(Math.min(1, Math.sqrt(q)))) / DEG) * 3600;
  };
  for (const h of pending) {
    const ra = H.ra[h];
    const dec = H.dec[h];
    const pm = Math.hypot(known(H.pmra[h]) ? H.pmra[h] : 0, known(H.pmdec[h]) ? H.pmdec[h] : 0);
    const tol = matchToleranceArcsec(pm);
    const tolDeg = tol / 3600;
    const d0 = Math.max(0, Math.floor((dec - tolDeg + 90) / CELL_DEG));
    const d1 = Math.min(DEC_CELLS - 1, Math.floor((dec + tolDeg + 90) / CELL_DEG));
    const cosd = Math.max(0.01, Math.cos(Math.min(89.9, Math.abs(dec) + tolDeg) * DEG));
    const rSpan = Math.min(RA_CELLS, Math.ceil(tolDeg / cosd / CELL_DEG) + 1);
    // Near the poles the span can cover every RA cell: then visit each once.
    const all = 2 * rSpan + 1 >= RA_CELLS;
    const r0 = all ? 0 : Math.floor(ra / CELL_DEG) - rSpan;
    const r1 = all ? RA_CELLS - 1 : Math.floor(ra / CELL_DEG) + rSpan;
    let best = -1;
    let bestSep = Infinity;
    for (let dc = d0; dc <= d1; dc++) {
      for (let k = r0; k <= r1; k++) {
        const rc = ((k % RA_CELLS) + RA_CELLS) % RA_CELLS;
        const c = dc * RA_CELLS + rc;
        for (let q = counts[c]; q < counts[c + 1]; q++) {
          const s = order[q];
          const d = sep(ra, dec, raS[s], decS[s]);
          if (d > tol || d >= bestSep || claimed.has(s)) continue;
          const dist = H.dist[h];
          const ratio = known(dist) ? dS[s] / dist : NaN;
          if (ratio < 0.7 || ratio > 1.4) continue;
          const v = H.vmag[h];
          const same = d < 1 && Math.abs(ratio - 1) < 0.05; // same place, same distance: V may be an estimate
          if (known(v) && Math.abs(v - vS[s]) > (same ? 2.5 : 1.5)) continue;
          best = s;
          bestSep = d;
        }
      }
    }
    if (best >= 0) take(h, best, 'position');
  }
  return { star, by };
}
