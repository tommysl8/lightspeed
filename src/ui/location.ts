/**
 * Where you are, as a breadcrumb for the footer: "Solar System › Saturn › Titan". Built from
 * the body registry's parents, so every body later data registers gets its trail. Later updates
 * add levels above (the Milky Way, the Local Group) as the universe in Lightspeed grows.
 */
import { bodyName, lineage, rootOf, type BodyId } from '../sim/bodies';
import type { ControlMode } from '../state/ui';

export interface Crumb {
  label: string;
  /** What clicking it does: frame the whole Solar System, or go to a body. None: not a link. */
  to?: 'solar-system' | BodyId;
}

/** The region a body is in: the Solar System (a link), or beyond it. */
function region(id: BodyId): Crumb {
  const root = rootOf(id);
  if (!root || root.id === 'sun') return { label: 'Solar System', to: 'solar-system' };
  return { label: 'Solar neighbourhood' };
}

/**
 * The breadcrumb for the camera's state: its target and what it orbits in orbit; the target's
 * surroundings in free flight; the destination in flight.
 */
export function locationPath(mode: ControlMode, focus: BodyId, dest: BodyId | null = null): Crumb[] {
  if (mode === 'travel' && dest) return [region(dest), { label: `Flying to ${bodyName(dest)}` }];
  if (mode === 'free') return [region(focus), { label: 'Free flight' }];
  // The Sun heads its own region's trail only when it is the target ("Solar System › Sun").
  const chain = lineage(focus).filter((r, i, all) => !(r.id === 'sun' && i < all.length - 1));
  return [region(focus), ...chain.map((r): Crumb => ({ label: r.name, to: r.id }))];
}
