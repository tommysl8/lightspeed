/**
 * Nearby stars become bodies. The star field draws its points from float32 parsecs, which near a
 * star are millions of kilometres coarse; so when the camera comes within PROMOTE_PC of a
 * catalogue star, the star is registered as a body (placed in float64, drawn as a luminous sphere
 * of its size and colour, labelled, clickable) and its point is hidden. Past RELEASE_PC it is
 * dropped again, unless it is in focus, selected or a flight's destination. The named stars and
 * the star systems are bodies anyway.
 *
 * The catalogue is scanned a slice per frame (CHUNK stars), so a full sweep costs about a
 * millisecond spread over nine frames, with no allocation.
 */
import { PARSEC_KM } from '../../physics/constants';
import type { BodyId } from '../bodies';
import { sim } from '../sim';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';
import { bodyOfCatalogueStar, ensureCatalogueStar, onDemandStars, releaseCatalogueStars, starData } from './load';
import { motionYears } from './motion';
import { catalogueStarId } from './records';

/** A catalogue star closer than this to the camera becomes a body, pc (about 20,000 au). */
export const PROMOTE_PC = 0.1;
/** …and stops being one farther than this, pc. */
export const RELEASE_PC = 0.15;
/** Stars scanned per frame. */
const CHUNK = 40_000;

let cursor = 0;
const found: number[] = [];
const pending = new Set<number>();
const release: number[] = [];

/**
 * Promote the catalogue stars near the camera and release those left behind (once a frame).
 * `keep` says whether a body must stay registered (the focus, the selection, a destination).
 */
export function updateNearbyStars(keep: (id: BodyId) => boolean): void {
  const stars = starData.stars;
  if (!starData.full || !stars) return;
  const c = sim.camera.pos;
  const cx = c.x / PARSEC_KM;
  const cy = -c.z / PARSEC_KM;
  const cz = c.y / PARSEC_KM;
  const years = motionYears(2000 + sim.astroTime.tt / 365.25);
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const r2 = PROMOTE_PC * PROMOTE_PC;
  const end = Math.min(stars.count, cursor + CHUNK);
  for (let i = cursor; i < end; i++) {
    const px = P[3 * i];
    const py = P[3 * i + 1];
    const pz = P[3 * i + 2];
    // A cheap test first: no star moves more than ~1 pc per 1,000 years in 1,000 km/s (the fastest).
    const dx0 = px - cx;
    const dy0 = py - cy;
    const dz0 = pz - cz;
    const t = years + Math.sqrt(px * px + py * py + pz * pz) / C_PC_PER_YR;
    const reach = PROMOTE_PC + 1.03e-3 * Math.abs(t);
    if (dx0 * dx0 + dy0 * dy0 + dz0 * dz0 > reach * reach) continue;
    const dx = dx0 + V[3 * i] * kv * t;
    const dy = dy0 + V[3 * i + 1] * kv * t;
    const dz = dz0 + V[3 * i + 2] * kv * t;
    if (dx * dx + dy * dy + dz * dz < r2) found.push(i);
  }
  cursor = end;
  if (cursor < stars.count) return;
  cursor = 0;

  for (const i of found) {
    if (pending.has(i) || bodyOfCatalogueStar(i)) continue;
    pending.add(i);
    void ensureCatalogueStar(i).finally(() => pending.delete(i));
  }
  found.length = 0;

  release.length = 0;
  const far = RELEASE_PC * PARSEC_KM;
  for (const i of onDemandStars()) {
    const id = catalogueStarId(i);
    const b = sim.bodies[id];
    if (!b || keep(id)) continue;
    if (b.pos.distanceTo(c) > far) release.push(i);
  }
  if (release.length) releaseCatalogueStars(release);
}
