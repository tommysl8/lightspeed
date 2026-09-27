import { Vector3, type PerspectiveCamera } from 'three';
import { getBody, type BodyId } from '../sim/bodies';
import { sim, type ScreenPoint } from '../sim/sim';
import { PARSEC_KM } from '../physics/constants';
import { screenOf } from '../sim/derived';
import { ensureHost, exoplanetData } from '../sim/exoplanets';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, motionYears, starData } from '../sim/stars';
import { HOST_RING_FAR_PC, HOST_RING_NEAR_PC } from '../render/materials';
import { planetHostsNow } from '../ui/planetHosts';
import { useUI } from '../state/ui';

/** Pointer reach around a body too small to hit, CSS px. */
export const PICK_REACH_PX = 14;
/** Each magnitude of brightness counts as this much pointer distance, px (so −5 to 25 spans 6 px)… */
const PX_PER_MAGNITUDE = 0.2;
/**
 * …in full once the pointer is this far from the marker, px, and less as it gets nearer: a
 * marker right under the pointer is picked however faint (a spacecraft by a bright planet).
 */
const ON_TARGET_PX = 2;

/**
 * Screen-space picking: the body whose disc (or, when tiny, its marker) is under the pointer.
 * With true-scale specks, pick radii of a few pixels work far better than ray casts.
 *
 * Every registered body can be picked. A resolved disc under the pointer wins; among specks,
 * the nearest to the pointer, with brighter ones preferred where the pointer is about as near
 * to several (Jupiter over its moons from afar), then the nearest to the camera.
 */
export function pickBody(x: number, y: number): BodyId | null {
  let best: BodyId | null = null;
  let bestScore = Infinity;
  const list = sim.bodyList;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.present || !b.screen.inFront) continue;
    // Not what the camera is inside (the Milky Way, a nebula flown into): its centre is not under the pointer.
    if (b.distCamera <= b.displayRadius) continue;
    const reach = Math.max(b.radiusPx, PICK_REACH_PX);
    const dx = b.screen.x - x;
    const dy = b.screen.y - y;
    if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
    const d = Math.hypot(dx, dy);
    if (d > reach) continue;
    // Prefer a resolved disc under the cursor; among markers, the nearest to the cursor, with
    // brighter ones preferred where the pointer is about as near to several (magnitudes clamped
    // to −5…25), then the nearest to the camera.
    const disc = b.radiusPx > PICK_REACH_PX && d < b.radiusPx;
    const faint = disc ? 0 : PX_PER_MAGNITUDE * (Math.max(-5, Math.min(25, b.magnitude)) + 5) * Math.min(1, d / ON_TARGET_PX);
    const score = (disc ? 0 : 1) + (d + faint) / reach + b.distCamera * 1e-15;
    if (score < bestScore) {
      bestScore = score;
      best = b.id;
    }
  }
  return best;
}

/** A ring fainter than this (of its full strength) cannot be picked. */
const RING_MIN_ALPHA = 0.25;

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const ringRel = new Vector3();
const ringScreen: ScreenPoint = { x: 0, y: 0, onScreen: false, inFront: false };

/**
 * The ring round a star with known planets (scene/PlanetHosts.tsx) nearest the pointer, within
 * PICK_REACH_PX: its archive host, where it is on screen and how far from the pointer (CSS px). Most of those stars are
 * not bodies (only the stars near the camera are), so pickBody cannot find them. Each ring is
 * placed as hostRing.vert.glsl places it, and shown as strongly.
 */
export function pickHostRing(x: number, y: number, camera: PerspectiveCamera): { host: number; x: number; y: number; px: number } | null {
  const stars = starData.stars;
  const match = exoplanetData.matches?.star;
  if (!stars || !starData.full || !match || !planetHostsNow()) return null;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const kv = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const years = motionYears(2000 + sim.astroTime.tt / 365.25);
  const retarded = useUI.getState().retarded;
  // The camera in parsecs, J2000 ecliptic (world (x, y, z) = ecliptic (x, z, −y)).
  const c = sim.camera.pos;
  const cx = c.x / PARSEC_KM;
  const cy = -c.z / PARSEC_KM;
  const cz = c.y / PARSEC_KM;
  let host = -1;
  let best = PICK_REACH_PX;
  let bx = 0;
  let by = 0;
  for (let h = 0; h < match.length; h++) {
    const s = match[h];
    if (s < 0 || s >= stars.count) continue;
    const px = P[3 * s];
    const py = P[3 * s + 1];
    const pz = P[3 * s + 2];
    const t = years + Math.hypot(px, py, pz) / C_PC_PER_YR;
    // A cheap test first: no star moves more than ~1 pc per 1,000 years (as in sim/stars/nearby.ts).
    const reach = HOST_RING_FAR_PC + 1.03e-3 * Math.abs(t);
    if (Math.abs(px - cx) > reach || Math.abs(py - cy) > reach || Math.abs(pz - cz) > reach) continue;
    const vx = V[3 * s] * kv;
    const vy = V[3 * s + 1] * kv;
    const vz = V[3 * s + 2] * kv;
    let ex = px + vx * t - cx;
    let ey = py + vy * t - cy;
    let ez = pz + vz * t - cz;
    if (retarded) {
      const lt = Math.hypot(ex, ey, ez) / C_PC_PER_YR;
      ex -= vx * lt;
      ey -= vy * lt;
      ez -= vz * lt;
    }
    const d = Math.hypot(ex, ey, ez);
    if ((1 - smoothstep(HOST_RING_NEAR_PC, HOST_RING_FAR_PC, d)) * smoothstep(0.1, 0.3, d) < RING_MIN_ALPHA) continue;
    screenOf(ringRel.set(ex * PARSEC_KM, ez * PARSEC_KM, -ey * PARSEC_KM), camera, ringScreen);
    if (!ringScreen.onScreen) continue;
    const px2 = Math.hypot(ringScreen.x - x, ringScreen.y - y);
    if (px2 < best) {
      best = px2;
      host = h;
      bx = ringScreen.x;
      by = ringScreen.y;
    }
  }
  return host >= 0 ? { host, x: bx, y: by, px: best } : null;
}

/** What is under the pointer: a body, or the ring of a star with planets that is not a body yet. */
export type Picked = { kind: 'body'; id: BodyId } | { kind: 'host'; host: number; x: number; y: number };

const DEEP_SKY: ReadonlySet<string> = new Set(['cluster', 'nebula', 'galaxy']);

/**
 * The body or planet-host ring under the pointer. A resolved disc under the pointer wins (not a
 * cluster, nebula or galaxy, whose rings of stars with planets are what the pointer is on);
 * otherwise whichever is nearer the pointer, the body when they are as near (a ring's star that
 * is a body already).
 */
export function pickAt(x: number, y: number, camera: PerspectiveCamera): Picked | null {
  const id = pickBody(x, y);
  const ring = pickHostRing(x, y, camera);
  if (!ring) return id ? { kind: 'body', id } : null;
  if (id) {
    const b = sim.bodies[id];
    const d = Math.hypot(b.screen.x - x, b.screen.y - y);
    const disc = b.radiusPx > PICK_REACH_PX && d < b.radiusPx;
    if (disc ? !DEEP_SKY.has(getBody(id)?.kind ?? '') : d <= ring.px + 0.5) return { kind: 'body', id };
  }
  return { kind: 'host', host: ring.host, x: ring.x, y: ring.y };
}

/** The body to select for what was picked, registering a ring's star (and its planets) if need be. */
export function pickedBody(p: Picked | null): BodyId | null {
  if (!p) return null;
  return p.kind === 'body' ? p.id : ensureHost(p.host);
}
