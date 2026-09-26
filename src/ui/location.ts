/**
 * Where you are, as a breadcrumb for the footer: "Solar neighbourhood › Solar System › Saturn ›
 * Titan", or "Solar neighbourhood › Alpha Centauri › Proxima Centauri"; a star farther than 100
 * light-years is in the "Milky Way", not the Sun's neighbourhood. Built from the body registry's
 * parents, so every body later data registers gets its trail. Later updates add levels above
 * (the Milky Way as a place to go, the Local Group) as the universe in Lightspeed grows.
 */
import { PARSEC_KM } from '../physics/constants';
import { bodyName, childrenOf, getBody, lineage, rootOf, type BodyId, type BodyRecord } from '../sim/bodies';
import { entryOf } from '../sim/bodies/registry';
import type { ControlMode } from '../state/ui';

export interface Crumb {
  label: string;
  /** What clicking it does: frame the stars around the Sun, the whole Solar System, or go to a body. None: not a link. */
  to?: 'solar-neighbourhood' | 'solar-system' | BodyId;
}

const NEIGHBOURHOOD: Crumb = { label: 'Solar neighbourhood', to: 'solar-neighbourhood' };
/** Stars beyond the neighbourhood: not a link yet (the Milky Way view comes with a later update). */
const MILKY_WAY: Crumb = { label: 'Milky Way' };

/**
 * The Sun's neighbourhood, pc: 100 light-years, as far as the star catalogue lists every star
 * (the neighbourhood link frames the nearest of them).
 */
export const NEIGHBOURHOOD_PC = 100 / 3.261563777;

/** How far a root (a star, or a star system's barycentre) is from the Sun, pc. */
function distancePc(root: BodyRecord): number {
  const star = root.star ?? childrenOf(root.id).find((r) => r.star)?.star;
  if (star) return star.distancePc;
  const e = entryOf(root.id);
  return e && e.stamp >= 0 ? e.state.pos.length() / PARSEC_KM : 0;
}

/** The region a body is in: the stars around the Sun (or the Milky Way beyond them), then the Solar System (a link) or a star system. */
function region(id: BodyId): Crumb[] {
  const root = rootOf(id);
  if (!root || root.id === 'sun') return [NEIGHBOURHOOD, { label: 'Solar System', to: 'solar-system' }];
  const around = distancePc(root) <= NEIGHBOURHOOD_PC ? NEIGHBOURHOOD : MILKY_WAY;
  // A star system's barycentre names the system ("Alpha Centauri"); a single star is its own.
  if (root.kind === 'barycentre') return [around, { label: root.name }];
  return [around];
}

/**
 * A body placed on its parent's own barycentre orbits the whole pair (Kepler-16 (AB) b about
 * Kepler-16 A and B): its trail goes from the system to it, not through one of the stars.
 */
function orbitsPair(r: BodyRecord): boolean {
  return !!r.centre && !!r.parent && r.centre !== r.parent && getBody(r.parent)?.parent === r.centre;
}

/**
 * The breadcrumb for the camera's state: its target and what it orbits in orbit; the target's
 * surroundings in free flight; the destination in flight.
 */
export function locationPath(mode: ControlMode, focus: BodyId, dest: BodyId | null = null): Crumb[] {
  if (mode === 'travel' && dest) return [...region(dest), { label: `Flying to ${bodyName(dest)}` }];
  if (mode === 'free') return [...region(focus), { label: 'Free flight' }];
  // The Sun heads its own region's trail only when it is the target ("Solar System › Sun").
  const chain = lineage(focus).filter((r, i, all) => !(r.id === 'sun' && i < all.length - 1) && !(i === all.length - 2 && orbitsPair(all[i + 1])));
  return [...region(focus), ...chain.map((r): Crumb => ({ label: r.name, to: r.id }))];
}
