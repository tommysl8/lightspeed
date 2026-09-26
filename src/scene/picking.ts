import type { BodyId } from '../sim/bodies';
import { sim } from '../sim/sim';

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
