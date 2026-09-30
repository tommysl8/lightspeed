/**
 * Roam's view of its surroundings, once a frame: the distance to the nearest thing that matters at this
 * scale (controls/roamScale.ts says how each kind counts), what that thing is, which body the camera rides
 * along with, and which surface it must stay out of.
 *
 * How: one pass over the registered bodies (the planets and moons, the stars that are bodies, the black
 * holes, the clusters, nebulae and galaxies, the groups of galaxies), with each body's class, closest
 * approach and radius kept in a table rebuilt only when the registry changes; plus the catalogue star
 * nearest the camera from the star field's own sweep (sim/stars/nearest.ts), measured from here. The black
 * hole the controller works about is measured from its exact hole-relative place.
 *
 * Why the least effective distance: it is small near anything worth slowing for (a planet's surface, a
 * galaxy's edge, the next star) and large in the gaps between them, at every scale from a moon to the
 * cosmic web, without knowing which level of the universe the camera is in.
 *
 * Cost: about two thousand distances a frame (≈ 20 µs); nothing allocated (the table is rebuilt only when
 * bodies come or go). Only while roaming.
 *
 * Twins: controls/cameraController.ts (updateRoam) moves the camera with it; ui/flight/RoamPanel.tsx shows
 * the thing and the pace.
 */
import type { Vector3 } from 'three';
import type { BodyId } from '../sim/bodies';
import { bodyEntries, registryVersion } from '../sim/bodies/registry';
import type { BodyState } from '../sim/sim';
import { nearestStar } from '../sim/stars/nearest';
import { blackHoleRsKm, minDistance } from './framing';
import { EDGE_KM, roamClassOf, thingScaleKm, type RoamClass } from './roamScale';

/** Another body becomes the one ridden along with only when its effective distance is this much smaller. */
const RIDE_SWITCH = 0.8;

interface Thing {
  id: BodyId;
  state: BodyState;
  cls: RoamClass;
  /** Closest approach (a solid body), or horizon radius (a black hole), km. */
  rMin: number;
  /** Radius, km (a galaxy, a cluster, a nebula, a group). */
  radius: number;
}

const table = { version: -1, list: [] as Thing[] };

/** The bodies Roam measures, with their classes and sizes (rebuilt when the registry changes). */
function things(): readonly Thing[] {
  const v = registryVersion();
  if (table.version === v) return table.list;
  const list: Thing[] = [];
  for (const e of bodyEntries()) {
    const r = e.record;
    const cls = roamClassOf(r.kind, r.kindText);
    if (cls === 'none') continue;
    const rs = cls === 'hole' ? blackHoleRsKm(r.id) : 0;
    list.push({
      id: r.id,
      state: e.state,
      cls,
      rMin: cls === 'hole' ? rs : cls === 'solid' ? minDistance(r.id) : 0,
      radius: r.physical.radiusKm,
    });
  }
  table.list = list;
  table.version = v;
  return list;
}

/** What Roam sees this frame (a reused object: read it, do not keep it). */
export interface RoamSurroundings {
  /** The least effective distance, km: the pace's length. */
  scaleKm: number;
  /** What sets it: a body's id, or null for a catalogue star (starIndex) or nothing at all. */
  id: BodyId | null;
  /** The catalogue star that sets it, or −1. */
  starIndex: number;
  cls: RoamClass;
  /** From the camera to its centre, km (a black hole: the height above its horizon). */
  distKm: number;
  /** Its radius (or a black hole's horizon radius), km. */
  radiusKm: number;
  /** The body the camera rides along with (the least effective distance but a group's), or null. */
  ride: BodyId | null;
  /** The solid body whose closest approach the camera is nearest (it must stay out of it). */
  solid: BodyId | null;
}

export const surroundings: RoamSurroundings = {
  scaleKm: Infinity,
  id: null,
  starIndex: -1,
  cls: 'none',
  distKm: Infinity,
  radiusKm: 0,
  ride: null,
  solid: null,
};

/**
 * Measure the surroundings from `cam` (world km). `hole`: the black hole the controller works about, with the
 * camera's exact place relative to it (`holeRel`) and height above its horizon; `ride`: the body ridden along
 * with so far (kept unless another is clearly nearer).
 */
export function scanSurroundings(cam: Vector3, hole: BodyId | null, holeRel: Vector3, holeHeightKm: number, ride: BodyId | null): RoamSurroundings {
  const out = surroundings;
  let best = Infinity;
  let bestThing: Thing | null = null;
  let bestD = Infinity;
  let rideBest = Infinity;
  let rideId: BodyId | null = null;
  let rideKept = Infinity;
  let solidGap = Infinity;
  let solid: Thing | null = null;
  const list = things();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const b = t.state;
    if (!b.present) continue;
    let d: number;
    let e: number;
    if (t.id === hole) {
      // Exact: 32 km coarse at Sgr A*'s distance from the Sun otherwise, against a floor of 12.7 km.
      d = holeRel.length();
      e = Math.max(0, holeHeightKm);
    } else {
      const dx = b.pos.x - cam.x;
      const dy = b.pos.y - cam.y;
      const dz = b.pos.z - cam.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      e = thingScaleKm(t.cls, d, t.rMin, t.radius);
    }
    if (e < best) {
      best = e;
      bestThing = t;
      bestD = d;
    }
    if (t.cls !== 'group') {
      if (e < rideBest) {
        rideBest = e;
        rideId = t.id;
      }
      if (t.id === ride) rideKept = e;
    }
    if (t.cls === 'solid' && d - t.rMin < solidGap) {
      solidGap = d - t.rMin;
      solid = t;
    }
  }
  out.starIndex = -1;
  let other: RoamClass = 'none';
  // The catalogue star nearest the camera, as a point (within 0.1 pc it is a body, and counted above).
  if (nearestStar.index >= 0) {
    const d = Math.hypot(nearestStar.x - cam.x, nearestStar.y - cam.y, nearestStar.z - cam.z);
    const e = thingScaleKm('point', d, 0, 0);
    if (e < best) {
      best = e;
      bestThing = null;
      bestD = d;
      out.starIndex = nearestStar.index;
      other = 'point';
    }
  }
  // The edge of the map.
  const edge = EDGE_KM - cam.length();
  const edgeE = thingScaleKm('edge', edge, 0, 0);
  if (edgeE < best) {
    best = edgeE;
    bestThing = null;
    bestD = Math.max(0, edge);
    out.starIndex = -1;
    other = 'edge';
  }
  out.scaleKm = best;
  out.id = bestThing ? bestThing.id : null;
  out.cls = bestThing ? bestThing.cls : other;
  out.distKm = bestThing?.cls === 'hole' ? Math.max(0, bestThing.id === hole ? holeHeightKm : bestD - bestThing.rMin) : bestD;
  out.radiusKm = bestThing ? (bestThing.cls === 'hole' ? bestThing.rMin : bestThing.radius) : 0;
  // Keep riding along with the same body unless another is clearly nearer (two moons must not trade places every frame).
  out.ride = ride !== null && rideKept < Infinity && !(rideBest < RIDE_SWITCH * rideKept) ? ride : rideId;
  out.solid = solid ? solid.id : null;
  return out;
}
