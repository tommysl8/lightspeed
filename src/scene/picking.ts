import { BODY_ORDER, type BodyId } from '../physics/constants';
import { sim } from '../sim/sim';

/**
 * Screen-space picking: the body whose disc (or, when tiny, its marker) is under the pointer.
 * With true-scale specks, pick radii of a few pixels work far better than ray casts.
 */
export function pickBody(x: number, y: number): BodyId | null {
  let best: BodyId | null = null;
  let bestScore = Infinity;
  for (const id of BODY_ORDER) {
    const b = sim.bodies[id];
    if (!b.present || !b.screen.inFront) continue;
    const reach = Math.max(b.radiusPx, 14);
    const d = Math.hypot(b.screen.x - x, b.screen.y - y);
    if (d > reach) continue;
    // Prefer a resolved disc under the cursor; among markers, the nearest to the cursor.
    const score = (b.radiusPx > 14 && d < b.radiusPx ? 0 : 1) + d / reach + b.distCamera * 1e-15;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
