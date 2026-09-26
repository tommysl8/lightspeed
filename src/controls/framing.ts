/**
 * How far from a body the camera frames it: from its radius (four radii; five for stars;
 * sixteen for spacecraft, whose model is mostly booms; a record may say otherwise, as Saturn
 * does for its rings), and for a whole system, from the orbits of its moons.
 */
import { shapeMaxRadiusKm } from '../render/shapes';
import { childrenOf, displayRadiusKm, getBody, type BodyId, type BodyRecord } from '../sim/bodies';
import { sim } from '../sim/sim';

/**
 * Floors for both distances, km (1 m and 1 cm). The registry refuses a destination without a
 * radius, but a zero here would put the camera on the body's centre and make the zoom path's
 * scale zero (NaN everywhere after).
 */
export const MIN_FRAMING_KM = 1e-3;
export const MIN_APPROACH_KM = 1e-5;

/**
 * Spacecraft are drawn as a probe model scaled to their radius (Bodies.tsx): the framing and the
 * closest approach follow Voyager 1's (0.03 km and 0.004 km for a 1.85 m radius), which keep the
 * camera clear of the dish, the bus and the generators.
 */
export const SPACECRAFT_FRAMING_RADII = 16;
export const SPACECRAFT_MIN_RADII = 2.2;

/** Default framing, in radii, of a kind of body. */
function defaultRadii(r: BodyRecord): number {
  if (r.kind === 'star') return 5;
  if (r.kind === 'spacecraft') return SPACECRAFT_FRAMING_RADII;
  return 4;
}

/** Distance from a body's centre at which it is nicely framed (also the travel standoff). */
export function framingDistance(id: BodyId): number {
  const b = getBody(id);
  if (!b) return 1e4;
  const f = b.framing;
  if (f?.distanceKm !== undefined) return Math.max(MIN_FRAMING_KM, f.distanceKm);
  const r = displayRadiusKm(b);
  if (f?.radii !== undefined) return Math.max(MIN_FRAMING_KM, r * f.radii);
  // An irregular body is framed from its longest extent too (Arrokoth's lobes).
  return Math.max(MIN_FRAMING_KM, r * defaultRadii(b), 2 * outerRadiusKm(b));
}

/**
 * Largest distance of the body's surface from its centre, km: its record's `maxRadiusKm`, else
 * its shape model's (once loaded), else its display radius.
 */
function outerRadiusKm(b: BodyRecord): number {
  const shape = b.visual?.shape ? shapeMaxRadiusKm(b.visual.shape) : undefined;
  return Math.max(displayRadiusKm(b), b.physical.maxRadiusKm ?? 0, shape ?? 0);
}

/** Closest the orbit camera may get to a body's centre. */
export function minDistance(id: BodyId): number {
  const b = getBody(id);
  if (!b) return 1;
  if (b.framing?.minKm !== undefined) return Math.max(MIN_APPROACH_KM, b.framing.minKm);
  if (b.kind === 'spacecraft') return Math.max(MIN_APPROACH_KM, displayRadiusKm(b) * SPACECRAFT_MIN_RADII);
  return Math.max(MIN_APPROACH_KM, outerRadiusKm(b) * 1.015);
}

/**
 * Distance that frames a body with the orbits of its moons (Jupiter with Callisto's orbit in
 * view), or just the body when nothing orbits it. Uses each moon's semi-major axis where the
 * record has one, else its present distance.
 */
export function systemFramingDistance(id: BodyId): number {
  const own = framingDistance(id);
  const moons = childrenOf(id);
  if (!moons.length) return own;
  const centre = sim.bodies[id];
  let reach = 0;
  for (const m of moons) {
    const a = m.physical.semiMajorAxisKm;
    const s = sim.bodies[m.id];
    const d = a ?? (s && centre ? s.pos.distanceTo(centre.pos) : 0);
    if (Number.isFinite(d) && d > reach) reach = d;
  }
  // The outermost orbit fills about 70 % of the height of a 50° view.
  return Math.max(own, reach * 3);
}
