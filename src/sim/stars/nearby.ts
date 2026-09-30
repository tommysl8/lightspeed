/**
 * Nearby stars become bodies. The star field draws its points from float32 parsecs, which near a
 * star are millions of kilometres coarse; so when the camera comes within PROMOTE_PC of a
 * catalogue star, the star is registered as a body (placed in float64, drawn as a luminous sphere
 * of its size and colour, labelled, clickable) and its point is hidden. Past RELEASE_PC it is
 * dropped again, unless it is in focus, selected or a flight's destination. The named stars and
 * the star systems are bodies anyway.
 *
 * The catalogue is scanned a slice per frame (CHUNK stars), so a full sweep costs about a
 * millisecond spread over nine frames, with no allocation. The same sweep notes the star nearest the
 * camera (sim/stars/nearest.ts), which sets Roam's pace between the stars. The extension's loaded band
 * files (extensionLoad.ts, which this also drives once a frame) are searched through their cells at the end
 * of each sweep: only cells whose box comes near the camera are read.
 */
import { PARSEC_KM } from '../../physics/constants';
import type { BodyId } from '../bodies';
import { sim } from '../sim';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';
import { bodyOfCatalogueStar, ensureCatalogueStar, onDemandStars, releaseCatalogueStars, starData } from './load';
import { motionYears } from './motion';
import { catalogueStarId } from './records';
import { nearestStar } from './nearest';
import { cellDistance } from './cells';
import { extData, updateExtensionLoading } from './extensionLoad';
import type { BandFile } from './extension';

/** A catalogue star closer than this to the camera becomes a body, pc (about 20,000 au). */
export const PROMOTE_PC = 0.1;
/** …and stops being one farther than this, pc. */
export const RELEASE_PC = 0.15;
/** Stars scanned per frame. */
const CHUNK = 40_000;

let cursor = 0;
/** The sweep's nearest star so far: squared distance, pc², and index. */
let sweepBest = Infinity;
let sweepIndex = -1;
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
  updateExtensionLoading(cx, cy, cz, years);
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const r2 = PROMOTE_PC * PROMOTE_PC;
  const end = Math.min(stars.count, cursor + CHUNK);
  if (cursor === 0) {
    sweepBest = Infinity;
    sweepIndex = -1;
  }
  for (let i = cursor; i < end; i++) {
    const px = P[3 * i];
    const py = P[3 * i + 1];
    const pz = P[3 * i + 2];
    // A cheap test first: no star moves more than ~1 pc per 1,000 years in 1,000 km/s (the fastest).
    const dx0 = px - cx;
    const dy0 = py - cy;
    const dz0 = pz - cz;
    // The nearest star, from the catalogue's places (Roam's pace; the star's motion is added once, below).
    const d0 = dx0 * dx0 + dy0 * dy0 + dz0 * dz0;
    if (d0 < sweepBest) {
      sweepBest = d0;
      sweepIndex = i;
    }
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
  // The extension's loaded files: stars to promote, and a nearer star than the head's (moved to the date).
  let extBest = Infinity;
  let extIndex = -1;
  let extFile: BandFile | null = null;
  const bestHead = Math.sqrt(sweepBest);
  for (const file of extData.files.values()) {
    const C = file.cells;
    const FP = file.stars.positions;
    const FV = file.stars.velocitiesInt16;
    const fkv = file.stars.velocityUnitKms * KMS_TO_PC_PER_YR;
    for (let c = 0; c < C.count; c++) {
      const d = cellDistance(C, c, cx, cy, cz, years);
      if (d > PROMOTE_PC && d > Math.min(bestHead, Math.sqrt(extBest))) continue;
      for (let q = C.start[c]; q < C.start[c + 1]; q++) {
        const px = FP[3 * q];
        const py = FP[3 * q + 1];
        const pz = FP[3 * q + 2];
        const t = years + Math.sqrt(px * px + py * py + pz * pz) / C_PC_PER_YR;
        const dx = px + FV[3 * q] * fkv * t - cx;
        const dy = py + FV[3 * q + 1] * fkv * t - cy;
        const dz = pz + FV[3 * q + 2] * fkv * t - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2) found.push(file.base + q);
        if (d2 < extBest) {
          extBest = d2;
          extIndex = q;
          extFile = file;
        }
      }
    }
  }
  if (extFile && extBest < sweepBest) publishNearest(extFile.stars.positions, extFile.stars.velocitiesInt16, extFile.stars.velocityUnitKms * KMS_TO_PC_PER_YR, years, extIndex, extFile.base + extIndex);
  else publishNearest(stars.positions, V, kv, years, sweepIndex, sweepIndex);

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

/** The sweep's nearest star, moved to the sweep's date as the star field moves it, in world km (sim/stars/nearest.ts). */
function publishNearest(P: Float32Array, V: Int16Array, kv: number, years: number, i: number, globalIndex: number): void {
  nearestStar.index = globalIndex;
  if (i < 0) return;
  const px = P[3 * i];
  const py = P[3 * i + 1];
  const pz = P[3 * i + 2];
  const t = years + Math.sqrt(px * px + py * py + pz * pz) / C_PC_PER_YR;
  const x = px + V[3 * i] * kv * t;
  const y = py + V[3 * i + 1] * kv * t;
  const z = pz + V[3 * i + 2] * kv * t;
  // The catalogue's (x, y, z) is the world's (x, −z, y).
  nearestStar.x = x * PARSEC_KM;
  nearestStar.y = z * PARSEC_KM;
  nearestStar.z = -y * PARSEC_KM;
}
