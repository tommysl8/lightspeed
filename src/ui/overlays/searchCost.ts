/**
 * What a 1 g flight from where the camera is would cost, for a row of "Where to?"
 * (overlays/Search.tsx), or why there is none. Beyond the Local Group the flight crosses the
 * expanding universe (sim/travelCosmic.ts): the first cost for such a destination takes a few
 * milliseconds, then it is kept.
 */
import type { Destination } from '../../content/destinations';
import { sim } from '../../sim/sim';
import { planFlight, type Refusal } from '../../sim/travel';
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

/** Why a destination without a body (the cosmic web, the map of the cosmic background) has no flight. */
export const NO_FLIGHT_MAP = 'A map to look at, not a place to fly to';

export function oneGCost(d: Destination): Cost {
  if (!d.body) return { ok: false, text: NO_FLIGHT_MAP };
  const why = d.unavailable();
  if (why) return { ok: false, text: why, retry: isLoadingReason(why) };
  // A catalogue star becomes a body to be planned for (it is released again if not chosen).
  d.prepare?.();
  if (!sim.bodies[d.body]) return { ok: false, text: 'Loading the star catalogue…', retry: true };
  const r = planFlight(d.body, 0, sim.camera.pos.clone(), sim.astroTime, 'rocket');
  if (!r.ok) return { ok: false, text: r.refusal ? refusalShort(r.refusal) : 'Not there at the date shown' };
  if (r.plan.distance <= 0) return { ok: false, text: 'You are here' };
  return { ok: true, text: tripCostText(r.plan) };
}

/** Forget the costs that were missing only because data were loading, so they are worked out again. */
export function dropRetries(cache: Map<string, Cost>): void {
  for (const [id, c] of cache) if (c.retry) cache.delete(id);
}

/** Why there is no 1 g flight, in a few words. */
function refusalShort(r: Refusal): string {
  if (r.reason === 'beyond-event-horizon') return 'Beyond the cosmic event horizon: out of reach for ever';
  if (r.reason === 'beyond-reach') return 'At the event horizon: out of reach for ever';
  return 'Out of reach at 1 g from here';
}
