/**
 * Stars too close together on screen to tell apart get one label. The stars of a pair (or an
 * inner pair) sit on their own barycentre (Sirius A and B, Alpha Centauri A and B, Capella Aa
 * and Ab, Kepler-16 A and B); from afar they are one point of light, and naming one of them
 * ("Sirius A") would say it is seen alone. While a pair spans less than UNRESOLVED_PX on screen,
 * its brightest star carries the system's name ("Sirius", "Alpha Centauri AB") and the others
 * no label. Worked out once a frame by Labels.tsx, without allocating (a handful of pairs: a
 * linear search beats a map).
 */
import type { BodyId } from '../sim/bodies';
import type { Entry } from '../sim/bodies/registry';

/** Screen extent, CSS px, under which the stars on one barycentre read as one point. */
export const UNRESOLVED_PX = 12;

interface Group {
  node: Entry | null;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  n: number;
  bright: Entry | null;
  brightMag: number;
}

export interface PairLabels {
  /** Stars whose label gives way to their pair's. */
  hide: Set<BodyId>;
  /** The label of each unresolved pair's brightest star: the pair's name. */
  text: Map<BodyId, string>;
}

const groups: Group[] = [];
let used = 0;

function groupOf(node: Entry): Group {
  for (let k = 0; k < used; k++) if (groups[k].node === node) return groups[k];
  let g = groups[used];
  if (!g) groups.push((g = { node: null, minX: 0, maxX: 0, minY: 0, maxY: 0, n: 0, bright: null, brightMag: 0 }));
  used++;
  g.node = node;
  g.minX = g.minY = Infinity;
  g.maxX = g.maxY = -Infinity;
  g.n = 0;
  g.bright = null;
  g.brightMag = Infinity;
  return g;
}

/** Fill `out` for this frame from the registry's bodies (their screen positions and magnitudes). */
export function unresolvedPairs(list: readonly Entry[], out: PairLabels): void {
  out.hide.clear();
  out.text.clear();
  used = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const p = e.parent;
    const b = e.state;
    if (!p || !p.isNode || e.record.kind !== 'star' || !b.present || !b.screen.onScreen) continue;
    const g = groupOf(p);
    g.minX = Math.min(g.minX, b.screen.x);
    g.maxX = Math.max(g.maxX, b.screen.x);
    g.minY = Math.min(g.minY, b.screen.y);
    g.maxY = Math.max(g.maxY, b.screen.y);
    g.n++;
    if (b.magnitude < g.brightMag) {
      g.brightMag = b.magnitude;
      g.bright = e;
    }
  }
  for (let k = 0; k < used; k++) {
    const g = groups[k];
    const p = g.node!;
    g.node = null;
    if (g.n < 2 || g.maxX - g.minX >= UNRESOLVED_PX || g.maxY - g.minY >= UNRESOLVED_PX || !g.bright) continue;
    out.text.set(g.bright.id, p.record.name);
    for (let i = 0; i < p.placed.length; i++) {
      const m = p.placed[i];
      if (m !== g.bright && m.record.kind === 'star') out.hide.add(m.id);
    }
  }
}
