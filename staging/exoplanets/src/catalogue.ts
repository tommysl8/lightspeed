/**
 * The archive catalogue (public/data/exoplanets.json.gz): loading, lookup, and turning an archive
 * record into a complete Kepler orbit with every gap filled by a stated assumption.
 *
 * Vercel serves .gz files without Content-Encoding (application/octet-stream is not compressed on
 * the fly), so the browser receives the raw gzip bytes and we inflate them with DecompressionStream.
 * If a server does add Content-Encoding: gzip, fetch() has already inflated the body; we detect that
 * from the first two bytes (gzip magic 1f 8b) and skip the second inflation.
 */
import { AU_KM, DEG, M_EARTH_MSUN, J2000_JD, PARSEC_KM, R_EARTH_KM, R_SUN_KM } from './constants.ts';
import { periodDays as periodFromA, semiMajorAxisAu, wrap360 } from './kepler.ts';
import { type KeplerOrbit, argPeriPlanetFromStar, tPeriFromConjunction, tPeriFromMeanAnomaly, trueAnomalyAtConjunction } from './orbit.ts';

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

export interface ExoplanetCatalogue {
  format: 'lightspeed-exoplanets/1';
  source: string;
  doi: string;
  citation: string;
  retrieved: string;
  counts: { planets: number; hosts: number; transiting: number; controversial: number; circumbinary: number };
  units: Record<string, string>;
  /** Meaning of each hosts.posRef value ('gaia', 'hipparcos', 'archive: ...'); positions are J2000.0 except 'archive'. */
  positionSources?: Record<string, string>;
  enums: {
    method: string[];
    facility: string[];
    massKind: string[];
    timeSystem: string[];
    posRef: string[];
    flags: Record<string, number>;
  };
  hosts: {
    name: string[];
    hip: Col<number>;
    hd: Col<string>;
    gaia: Col<string>;
    /** ICRS, epoch J2000.0 (see positionSources and posRef). */
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
    /** Always null from the NASA archive (no such column); kept for other sources. */
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

/** Inflate gzip bytes (or pass through already-inflated bytes) and parse the catalogue. */
export async function decodeCatalogue(bytes: Uint8Array): Promise<ExoplanetCatalogue> {
  let data = bytes;
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const cat = JSON.parse(new TextDecoder().decode(data)) as ExoplanetCatalogue;
  if (cat.format !== 'lightspeed-exoplanets/1') throw new Error(`unexpected catalogue format ${String(cat.format)}`);
  return cat;
}

/** Fetch and decode the catalogue, e.g. loadCatalogue('/data/exoplanets.json.gz'). */
export async function loadCatalogue(url: string, init?: RequestInit): Promise<ExoplanetCatalogue> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return decodeCatalogue(new Uint8Array(await res.arrayBuffer()));
}

/** Indices of the planets of a host (planets are stored grouped by host, sorted by period). */
export function planetsOfHost(cat: ExoplanetCatalogue, hostIndex: number): number[] {
  const out: number[] = [];
  const h = cat.planets.host;
  for (let i = 0; i < h.length; i++) if (h[i] === hostIndex) out.push(i);
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

/** Median of the non-null inclinations of the other planets of the same host, or null. */
function siblingsInclination(cat: ExoplanetCatalogue, planet: number): number | null {
  const host = cat.planets.host[planet];
  const vals: number[] = [];
  for (const j of planetsOfHost(cat, host)) {
    const v = cat.planets.incl[j];
    if (j !== planet && v !== null && !(cat.planets.flags[j] & PLANET_FLAGS.INCL_LIMIT)) vals.push(v);
  }
  if (!vals.length) return null;
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
 *   convention) and we add 180 deg. Missing -> 90 deg (irrelevant when e = 0).
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
  const hostMassMsun = hostMassArchive !== null && hostMassArchive > 0 ? hostMassArchive : 1;
  const planetMassEarth = p.mass[i];
  const mTot = hostMassMsun + (planetMassEarth ?? 0) * M_EARTH_MSUN;

  let P = p.period[i];
  let a = p.sma[i];
  let periodProv: ArchiveOrbitProvenance['period'] = 'archive';
  let smaProv: ArchiveOrbitProvenance['sma'] = 'archive';
  if (P === null && a === null) return null;
  if (P === null) {
    P = periodFromA(a as number, mTot);
    periodProv = 'kepler3';
  }
  if (a === null) {
    a = semiMajorAxisAu(P, mTot);
    smaProv = 'kepler3';
  }

  let e = p.ecc[i];
  let eccProv: ArchiveOrbitProvenance['ecc'] = 'archive';
  if (e === null || !(e >= 0 && e < 1)) {
    e = 0;
    eccProv = 'assumed-circular';
  } else if (flags & PLANET_FLAGS.ECC_LIMIT) {
    e = 0;
    eccProv = 'limit-as-circular';
  }

  let argPeri: number;
  let argProv: ArchiveOrbitProvenance['argPeri'];
  const w = p.omega[i];
  if (w === null) {
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
  if (incl === null) {
    const s = siblingsInclination(cat, i);
    if (s !== null) {
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
  if (flags & PLANET_FLAGS.TRANSITS && rStar !== null && rStar > 0) {
    const fc = trueAnomalyAtConjunction(argPeri);
    const rc = (a * (1 - e * e)) / (1 + e * Math.cos(fc)); // au, planet-star distance at conjunction
    const rStarAu = (rStar * R_SUN_KM) / AU_KM;
    const k = ((p.radius[i] ?? 0) * R_EARTH_KM) / (rStar * R_SUN_KM);
    const bModel = (rc * Math.abs(Math.cos(incl * DEG))) / rStarAu;
    if (bModel > 1 + k) {
      const bArchive = p.impact[i];
      const useArchive = bArchive !== null && bArchive >= 0 && bArchive < 1 + k;
      const b = useArchive ? (bArchive as number) : 0.5;
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
  if (tc !== null) {
    tPeri = tPeriFromConjunction(tc, P, e, argPeri);
    phaseProv = 'conjunction';
  } else if (tp !== null) {
    tPeri = tp;
    phaseProv = 'periastron';
  } else {
    tPeri = tPeriFromMeanAnomaly(assumedMeanAnomaly(p.name[i]), J2000_JD, P);
    phaseProv = 'assumed';
  }

  return {
    orbit: { periodDays: P, aAu: a, e, iDeg: incl, nodeDeg: p.node?.[i] ?? assumedNodeDeg(hostName), argPeriDeg: argPeri, tPeriJd: tPeri },
    provenance: {
      period: periodProv,
      sma: smaProv,
      ecc: eccProv,
      argPeri: argProv,
      incl: inclProv,
      node: p.node?.[i] != null ? 'archive' : 'assumed',
      phase: phaseProv,
      hostMass: hostMassArchive !== null && hostMassArchive > 0 ? 'archive' : 'assumed-solar',
    },
    hostMassMsun,
    planetMassEarth,
  };
}

/** Host direction and distance as archived (distance null when the archive has none). */
export function hostSky(cat: ExoplanetCatalogue, h: number): { raDeg: number; decDeg: number; distanceKm: number | null } {
  const d = cat.hosts.dist[h];
  return { raDeg: cat.hosts.ra[h], decDeg: cat.hosts.dec[h], distanceKm: d === null ? null : d * PARSEC_KM };
}

// ---------------------------------------------------------------------------------------------
// Matching hosts to the star catalogue

/** Minimal view of a star in the app's star catalogue. */
export interface StarKey {
  gaiaDr3?: string | null;
  hip?: number | null;
  hd?: number | null;
  raDeg: number;
  decDeg: number;
  /** Total proper motion, mas/yr (optional; widens the positional tolerance). */
  pmMasYr?: number | null;
  vmag?: number | null;
  distancePc?: number | null;
}

export type MatchKind = 'gaia' | 'hip' | 'hd' | 'position';

/**
 * Build a matcher from host index to star index. Priority: Gaia DR3 source_id, then HIP, then HD
 * (leading integer of the archive designation, so "41004 B" matches HD 41004 only if nothing better),
 * then position: nearest star within 2 arcsec + |pm| x 25 yr (host positions are J2000.0 like the star
 * catalogue's, except the few 'archive' hosts whose epoch is uncertain, which the tolerance covers),
 * rejecting candidates whose V or distance disagree badly
 * (|dV| > 1.5 mag, distance ratio outside 0.7-1.4).
 */
export function buildHostMatcher(stars: StarKey[]): (cat: ExoplanetCatalogue, h: number) => { star: number; by: MatchKind } | null {
  const byGaia = new Map<string, number>();
  const byHip = new Map<number, number>();
  const byHd = new Map<number, number>();
  // Coarse grid on (dec, ra) cells of 0.1 deg for the positional fallback.
  const cells = new Map<string, number[]>();
  const cellKey = (ra: number, dec: number) => `${Math.floor(dec * 10)}:${Math.floor(((ra % 360) + 360) % 360 * 10)}`;
  stars.forEach((s, k) => {
    if (s.gaiaDr3) byGaia.set(s.gaiaDr3, k);
    if (s.hip) byHip.set(s.hip, k);
    if (s.hd) byHd.set(s.hd, k);
    const key = cellKey(s.raDeg, s.decDeg);
    const list = cells.get(key);
    if (list) list.push(k);
    else cells.set(key, [k]);
  });
  const DEG = Math.PI / 180;
  const sepArcsec = (ra1: number, de1: number, ra2: number, de2: number) => {
    const s = Math.sin(((de2 - de1) * DEG) / 2) ** 2 + Math.cos(de1 * DEG) * Math.cos(de2 * DEG) * Math.sin(((ra2 - ra1) * DEG) / 2) ** 2;
    return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / DEG * 3600;
  };
  return (cat, h) => {
    const H = cat.hosts;
    const g = H.gaia[h];
    if (g && byGaia.has(g)) return { star: byGaia.get(g) as number, by: 'gaia' };
    const hip = H.hip[h];
    if (hip && byHip.has(hip)) return { star: byHip.get(hip) as number, by: 'hip' };
    const hdNum = H.hd[h] ? Number(H.hd[h]?.match(/^\d+/)?.[0]) : NaN;
    if (Number.isFinite(hdNum) && byHd.has(hdNum)) return { star: byHd.get(hdNum) as number, by: 'hd' };
    const ra = H.ra[h];
    const dec = H.dec[h];
    const pm = Math.hypot(H.pmra[h] ?? 0, H.pmdec[h] ?? 0);
    const tol = 2 + (pm / 1000) * 25;
    const span = Math.ceil(tol / 360) + 1; // cells of 0.1 deg = 360 arcsec
    let best: { star: number; sep: number } | null = null;
    const dCell = Math.floor(dec * 10);
    const rCell = Math.floor((((ra % 360) + 360) % 360) * 10);
    const rSpan = Math.min(1800, Math.ceil(span / Math.max(0.01, Math.cos(dec * DEG))));
    for (let dd = -span; dd <= span; dd++)
      for (let dr = -rSpan; dr <= rSpan; dr++) {
        const list = cells.get(`${dCell + dd}:${(((rCell + dr) % 3600) + 3600) % 3600}`);
        if (!list) continue;
        for (const k of list) {
          const s = stars[k];
          const sep = sepArcsec(ra, dec, s.raDeg, s.decDeg);
          if (sep > tol + (s.pmMasYr ? (s.pmMasYr / 1000) * 25 : 0)) continue;
          const v = H.vmag[h];
          if (v !== null && s.vmag != null && Math.abs(v - s.vmag) > 1.5) continue;
          const d = H.dist[h];
          if (d !== null && s.distancePc != null && (s.distancePc / d < 0.7 || s.distancePc / d > 1.4)) continue;
          if (!best || sep < best.sep) best = { star: k, sep };
        }
      }
    return best ? { star: best.star, by: 'position' } : null;
  };
}
