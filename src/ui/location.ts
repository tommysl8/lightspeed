/**
 * Where you are, as a breadcrumb for the footer: "Solar System › Earth › Moon". Later updates
 * add levels above (the Milky Way, the Local Group) as the universe in Lightspeed grows.
 */
import { BODIES, type BodyId } from '../physics/constants';
import type { ControlMode } from '../state/ui';

export interface Crumb {
  label: string;
  /** What clicking it does: frame the whole Solar System, or go to a body. None: not a link. */
  to?: 'solar-system' | BodyId;
}

/** Bodies outside the Solar System, and the region they are in. */
const OUTSIDE: Partial<Record<BodyId, string>> = {
  proxima: 'Solar neighbourhood',
};

function region(id: BodyId): Crumb {
  const outside = OUTSIDE[id];
  return outside ? { label: outside } : { label: 'Solar System', to: 'solar-system' };
}

/** A body and the bodies it orbits, outermost first: Earth, Moon. */
function lineage(id: BodyId): BodyId[] {
  const out: BodyId[] = [];
  for (let b: BodyId | undefined = id; b; b = BODIES[b].parent) out.unshift(b);
  return out;
}

/**
 * The breadcrumb for the camera's state: its target and what it orbits in orbit; the target's
 * surroundings in free flight; the destination in flight.
 */
export function locationPath(mode: ControlMode, focus: BodyId, dest: BodyId | null = null): Crumb[] {
  if (mode === 'travel' && dest) return [region(dest), { label: `Flying to ${BODIES[dest].name}` }];
  if (mode === 'free') return [region(focus), { label: 'Free flight' }];
  return [region(focus), ...lineage(focus).map((id): Crumb => ({ label: BODIES[id].name, to: id }))];
}
