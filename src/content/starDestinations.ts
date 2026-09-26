/**
 * Every star of the catalogue as a "Where to?" destination, without registering 330,000 bodies:
 * the names table (sim/stars/names.ts: proper names, Bayer and Flamsteed designations, variable
 * stars, Gliese, HR, HIP and HD numbers) is searched as you type, and a star becomes a body only
 * when it is chosen, highlighted for a flight plan, or approached (sim/stars/nearby.ts). Stars that
 * are bodies already (the named stars, the star systems) come back as their registry entries.
 */
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import {
  bodyOfCatalogueStar,
  catalogueStarId,
  catalogueNumber,
  motionYears,
  plausibleSpectralType,
  registerCatalogueStar,
  searchStars,
  starData,
  starDisplayName,
  starKindText,
  C_PC_PER_YR,
  KMS_TO_PC_PER_YR,
} from '../sim/stars';
import { goToBody } from '../ui/navigation';
import { findDestination, type Destination } from './destinations';

/** Distance from the camera to catalogue star i now, km (where it is, straight-line motion). */
export function catalogueStarDistanceKm(i: number): number {
  const s = starData.stars;
  if (!s || i >= s.count) return NaN;
  const P = s.positions;
  const V = s.velocitiesInt16;
  const kv = s.velocityUnitKms * KMS_TO_PC_PER_YR;
  const px = P[3 * i];
  const py = P[3 * i + 1];
  const pz = P[3 * i + 2];
  const t = motionYears(2000 + sim.astroTime.tt / 365.25) + Math.hypot(px, py, pz) / C_PC_PER_YR;
  const c = sim.camera.pos;
  const dx = px + V[3 * i] * kv * t - c.x / PARSEC_KM;
  const dy = py + V[3 * i + 1] * kv * t + c.z / PARSEC_KM;
  const dz = pz + V[3 * i + 2] * kv * t - c.y / PARSEC_KM;
  return Math.hypot(dx, dy, dz) * PARSEC_KM;
}

const placedOr = (km: number, i: number): number => (Number.isFinite(km) ? km : catalogueStarDistanceKm(i));

/** A catalogue star that is not a body (yet), as a destination. */
function catalogueDestination(i: number): Destination {
  const names = starData.names!;
  const extra = starData.extra;
  const name = starDisplayName(names, i);
  const teff = starData.stars?.teff[i] ?? 0;
  const absMag = starData.stars?.absMag[i] ?? NaN;
  // The catalogue's type only where it agrees with the star's colour and brightness (as on its card).
  const spectral = extra ? plausibleSpectralType(names.spectralTypes[extra.spectralType[i]] || undefined, teff, absMag, teff > 0) : undefined;
  const hip = catalogueNumber(names, 'hip', i);
  const kind = [starKindText(spectral, teff, absMag), spectral, !name.startsWith('HIP') && hip !== null ? `HIP ${hip}` : null].filter(Boolean).join(' · ');
  const id = catalogueStarId(i);
  return {
    id,
    name,
    aliases: [],
    kind,
    group: 'stars',
    body: id,
    distanceKm: () => catalogueStarDistanceKm(i),
    unavailable: () => (starData.full ? (sim.bodies[id] && !sim.bodies[id].present ? `${name} is not there at the date shown` : null) : 'Loading the star catalogue…'),
    prepare: () => {
      registerCatalogueStar(i);
    },
    go: () => {
      const body = registerCatalogueStar(i);
      if (body) goToBody(body);
    },
  };
}

/**
 * The catalogue stars whose names or designations start with the query (exact matches first,
 * then the brightest), as destinations; empty until the names have loaded.
 */
export function starDestinations(query: string, limit = 10): Destination[] {
  const names = starData.names;
  if (!names) return [];
  const out: Destination[] = [];
  for (const hit of searchStars(names, query, limit)) {
    const body = bodyOfCatalogueStar(hit.index);
    const d = body ? findDestination(body) : catalogueDestination(hit.index);
    if (!d) continue;
    // A star that has just become a body is not placed until the next frame: until then its
    // distance is the catalogue's (never the origin's "here").
    out.push(body ? { ...d, distanceKm: () => placedOr(d.distanceKm(), hit.index) } : d);
  }
  return out;
}

/** Search results with the catalogue stars after the registry's matches, each destination once. */
export function withStars(results: readonly Destination[], stars: readonly Destination[]): Destination[] {
  const seen = new Set(results.map((d) => d.id));
  return [...results, ...stars.filter((d) => !seen.has(d.id))];
}
