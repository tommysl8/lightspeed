/**
 * What a 1 g flight from where the camera is would cost, for a row of "Where to?"
 * (overlays/Search.tsx), or why there is none.
 */
import type { Destination } from '../../content/destinations';
import { sim } from '../../sim/sim';
import { planTrip } from '../../sim/travel';
import { tripCostText } from '../flight/tripText';

/** A 1 g flight from where the camera is: its cost in words, or why there is none. */
export interface Cost {
  ok: boolean;
  text: string;
  /** Worked out while data it needs were still loading: work it out again when they arrive. */
  retry?: boolean;
}

/** Every "not yet" a destination gives while its data are loading starts with this word. */
export const isLoadingReason = (why: string): boolean => why.startsWith('Loading');

export function oneGCost(d: Destination): Cost {
  if (!d.body) return { ok: false, text: 'Flights there come in a later update' };
  const why = d.unavailable();
  if (why) return { ok: false, text: why, retry: isLoadingReason(why) };
  // A catalogue star becomes a body to be planned for (it is released again if not chosen).
  d.prepare?.();
  if (!sim.bodies[d.body]) return { ok: false, text: 'Loading the star catalogue…', retry: true };
  const plan = planTrip(d.body, 0, sim.camera.pos.clone(), sim.astroTime, 'rocket');
  if (!plan) return { ok: false, text: 'Out of reach at 1 g from here' };
  if (plan.distance <= 0) return { ok: false, text: 'You are here' };
  return { ok: true, text: tripCostText(plan) };
}

/** Forget the costs that were missing only because data were loading, so they are worked out again. */
export function dropRetries(cache: Map<string, Cost>): void {
  for (const [id, c] of cache) if (c.retry) cache.delete(id);
}
