/**
 * Which nodes of the surveys' octree to draw this frame (scene/Surveys.tsx), and which to fetch.
 *
 * From the root down, the node that looks largest from the camera next (a priority queue on its projected size, in
 * device pixels), as long as its galaxies fit in the point budget: a node is drawn only if its parent is, so each
 * drawn node's octants whose child is not drawn show that child's light as a glow. A node counts by its subtree's
 * bounding box (the galaxies' own, from the hierarchy, much tighter than the cube: the surveys fill thin cones), seen
 * from the ship: in flight its direction is aberrated and its size divided by the Doppler factor there, so the nodes
 * crowded into the sky ahead count for less and those spread over the sky behind for more. Nodes out of the view
 * (with a margin) and nodes smaller than MIN_NODE_PX are not refined; nodes drawn last frame count 25 % larger
 * (hysteresis, so a node on the edge of the budget does not flicker in and out). A node wanted but not loaded yet is
 * asked for, in the same order, and its parent's glow stands in for it (and its subtree) meanwhile.
 *
 * Cost: a few hundred nodes looked at a frame, well under 0.1 ms.
 */
import type { SurveyNode } from './format.ts';

/** A node is refined only while it looks at least this large, device px. */
export const MIN_NODE_PX = 96;
/** Nodes drawn last frame count this much larger. */
export const KEEP_BOOST = 1.25;

export interface LodView {
  /** The camera, world Mpc (float64), and the scale factor the galaxies are at. */
  cam: readonly [number, number, number];
  a: number;
  /** The view's direction (unit, world axes), half its diagonal field of view (rad), and device px per radian. */
  forward: readonly [number, number, number];
  halfFov: number;
  pxPerRad: number;
  /** The ship's rapidity and direction of motion (world axes; unit). */
  phi: number;
  velDir: readonly [number, number, number];
  /** Galaxies drawn at most. */
  budget: number;
  /**
   * The camera's comoving place (world Mpc) and how far from it, comoving, a galaxy can be seen at all: light from
   * farther left before the earliest galaxies shone (Surveys.tsx). Nodes wholly beyond are neither drawn nor fetched.
   */
  anchor?: readonly [number, number, number];
  reachMpc?: number;
  /**
   * Whether every galaxy of a box this near (proper Mpc from the camera, and comoving from its comoving place) is too
   * faint to show as a point: such a node is not drawn, its light left to its parent's glow.
   */
  faint?: (dProperMpc: number, chiMpc: number) => boolean;
}

export interface LodResult {
  /** Nodes to draw, parents before children. */
  draw: number[];
  points: number;
  /** Nodes wanted and not loaded, most wanted first. */
  fetch: number[];
}

/** Largest-first heap of (priority, node). */
class Heap {
  private p: number[] = [];
  private n: number[] = [];
  get size(): number {
    return this.p.length;
  }
  push(pr: number, node: number): void {
    const p = this.p;
    const n = this.n;
    p.push(pr);
    n.push(node);
    let i = p.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] >= p[i]) break;
      [p[up], p[i]] = [p[i], p[up]];
      [n[up], n[i]] = [n[i], n[up]];
      i = up;
    }
  }
  pop(): number {
    const p = this.p;
    const n = this.n;
    const top = n[0];
    const lp = p.pop()!;
    const ln = n.pop()!;
    if (p.length > 0) {
      p[0] = lp;
      n[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < p.length && p[l] > p[m]) m = l;
        if (r < p.length && p[r] > p[m]) m = r;
        if (m === i) break;
        [p[m], p[i]] = [p[i], p[m]];
        [n[m], n[i]] = [n[i], n[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * How large node `node` looks from the camera, device px (Infinity when the camera is inside its box), or −1 when it
 * is out of the view.
 */
export function nodeSizePx(node: SurveyNode, v: LodView): number {
  const b = node.box;
  const a = v.a;
  // The box at the clock's time (a × its comoving corners), from the camera.
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let r2 = 0;
  for (let k = 0; k < 3; k++) {
    const lo = a * b[k] - v.cam[k];
    const hi = a * b[3 + k] - v.cam[k];
    const d = lo > 0 ? lo : hi < 0 ? hi : 0;
    if (k === 0) dx = d;
    else if (k === 1) dy = d;
    else dz = d;
    const c = 0.5 * (lo + hi);
    if (k === 0) cx = c;
    else if (k === 1) cy = c;
    else cz = c;
    r2 += 0.25 * (hi - lo) * (hi - lo);
  }
  const dBox = Math.hypot(dx, dy, dz);
  if (v.anchor && v.reachMpc !== undefined) {
    // Comoving, from the camera's comoving place: the box as it is stored.
    let r2c = 0;
    for (let k = 0; k < 3; k++) {
      const e = Math.max(b[k] - v.anchor[k], 0, v.anchor[k] - b[3 + k]);
      r2c += e * e;
    }
    if (r2c > v.reachMpc * v.reachMpc) return -1;
    if (v.faint && v.faint(dBox, Math.sqrt(r2c))) return -1;
  }
  if (dBox === 0) return Infinity;
  const r = Math.sqrt(r2);
  const dc = Math.hypot(cx, cy, cz);
  // Seen from the ship: the direction aberrated towards the motion, sizes divided by the Doppler factor there.
  let cos = (cx * v.velDir[0] + cy * v.velDir[1] + cz * v.velDir[2]) / dc;
  let doppler = 1;
  if (v.phi > 1e-6) {
    const beta = Math.tanh(v.phi);
    const gamma = Math.cosh(v.phi);
    doppler = 1 / (gamma * (1 - beta * cos));
    cos = (cos + beta) / (1 + beta * cos);
  }
  const size = (v.pxPerRad * 2 * r) / dBox / doppler;
  if (v.halfFov < Math.PI) {
    // The angle to the view's axis in the ship's frame: the centre's direction turned by aberration about the motion.
    let fx = cx / dc;
    let fy = cy / dc;
    let fz = cz / dc;
    if (v.phi > 1e-6) {
      const c0 = (cx * v.velDir[0] + cy * v.velDir[1] + cz * v.velDir[2]) / dc;
      // Perpendicular part rescaled so the angle to the motion becomes acos(cos).
      const px = fx - c0 * v.velDir[0];
      const py = fy - c0 * v.velDir[1];
      const pz = fz - c0 * v.velDir[2];
      const pl = Math.hypot(px, py, pz);
      const s = Math.sqrt(Math.max(0, 1 - cos * cos));
      fx = cos * v.velDir[0] + (pl > 0 ? (px / pl) * s : 0);
      fy = cos * v.velDir[1] + (pl > 0 ? (py / pl) * s : 0);
      fz = cos * v.velDir[2] + (pl > 0 ? (pz / pl) * s : 0);
    }
    const toAxis = Math.acos(Math.max(-1, Math.min(1, fx * v.forward[0] + fy * v.forward[1] + fz * v.forward[2])));
    const radius = Math.asin(Math.min(1, r / dc)) / Math.min(1, doppler) + 0.05;
    if (toAxis - radius > v.halfFov) return -1;
  }
  return size;
}

/** Choose the nodes to draw and to fetch. `loaded(i)`: node i's galaxies are here; `drawnBefore(i)`: drawn last frame. */
export function selectNodes(nodes: readonly SurveyNode[], v: LodView, loaded: (i: number) => boolean, drawnBefore: (i: number) => boolean): LodResult {
  const out: LodResult = { draw: [], points: 0, fetch: [] };
  if (nodes.length === 0) return out;
  const heap = new Heap();
  heap.push(Infinity, 0);
  // The choice is made over the whole hierarchy, loaded or not, so it does not change as the files arrive (a choice
  // among the loaded nodes only would fetch nodes that the next arrivals then push out of the budget): the nodes
  // chosen and loaded under a drawn parent are drawn, the chosen ones not loaded are fetched, most wanted first.
  let planned = 0;
  const drawn = new Set<number>();
  while (heap.size > 0) {
    const i = heap.pop();
    const node = nodes[i];
    if (planned + node.points > v.budget) continue;
    planned += node.points;
    if (!loaded(i)) out.fetch.push(i);
    else if (node.parent < 0 || drawn.has(node.parent)) {
      drawn.add(i);
      out.draw.push(i);
      out.points += node.points;
    }
    for (let o = 0; o < 8; o++) {
      const c = node.children[o];
      if (c < 0) continue;
      let s = nodeSizePx(nodes[c], v);
      if (s < 0) continue;
      if (drawnBefore(c)) s *= KEEP_BOOST;
      if (s < MIN_NODE_PX) continue;
      heap.push(s, c);
    }
  }
  return out;
}

/** Room for glows (the most the settings below allow). */
export const MAX_GLOWS = 4000;
/**
 * How far glows are split: at most max of them, and none split once narrower than splitPx (1σ, pixels of the glow
 * target, a sixteenth of the view's resolution: 24 device pixels). On the GPU the number hardly matters (3 Gpc out on
 * the target laptop, 0.54 ms for 500 glows, 0.60 for 2,000: render/surveyGlow.ts); the limit keeps the processor's
 * share small (choosing 1,000 takes about 0.5 ms, so the choice is kept between frames: Surveys.tsx). Mutable for
 * measurements (window.__ls.surveys.glow in development).
 */
export const glowSettings = { max: 1000, splitPx: 1.5 };

/** The glows to draw: per glow its light of each class (times its share), its centroid (world Mpc, comoving) and rms radius (Mpc, comoving). */
export interface GlowList {
  count: number;
  light: Float64Array;
  centre: Float64Array;
  rms: Float64Array;
}

export function glowList(max = MAX_GLOWS): GlowList {
  return { count: 0, light: new Float64Array(4 * max), centre: new Float64Array(3 * max), rms: new Float64Array(max) };
}

/**
 * The glows for the drawn nodes: each octant of a drawn node holds the light its child does not draw (the node's
 * share less the child's: `share(i)`, 0 for a node not drawn), from the node's file (`fileGlows(i)`); and a glow that
 * looks wide is split, largest first, into its node's own galaxies and its children's subtrees (the hierarchy's
 * summaries: no download), each with the same share, until it looks small or MAX_GLOWS are used. The light is only
 * divided, never changed: the split glows hold what the one did. Glows out of the view are not split.
 */
export function selectGlows(
  nodes: readonly SurveyNode[],
  v: Pick<LodView, 'cam' | 'a' | 'forward' | 'halfFov' | 'pxPerRad'>,
  drawn: readonly number[],
  share: (i: number) => number,
  fileGlows: (i: number) => Float32Array | undefined,
  out: GlowList,
  targetScale = 0.25,
  settings: { max: number; splitPx: number } = glowSettings,
): GlowList {
  const max = Math.min(out.rms.length, settings.max);
  // Items: which node's subtree ('sub') or own galaxies ('own'), with its summary's centroid in world Mpc.
  const kind: number[] = [];
  const node: number[] = [];
  const shareOf: number[] = [];
  const g: ArrayLike<number>[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  const cz: number[] = [];
  const heap = new Heap();
  const pxPerRad = v.pxPerRad * targetScale;
  const size = (k: number): number => {
    const x = v.a * (cx[k] + g[k][4]) - v.cam[0];
    const y = v.a * (cy[k] + g[k][5]) - v.cam[1];
    const z = v.a * (cz[k] + g[k][6]) - v.cam[2];
    const d = Math.hypot(x, y, z);
    const r = v.a * g[k][7];
    if (v.halfFov < Math.PI && d > r) {
      const toAxis = Math.acos(Math.max(-1, Math.min(1, (x * v.forward[0] + y * v.forward[1] + z * v.forward[2]) / d)));
      if (toAxis - Math.asin(Math.min(1, (2 * r) / d)) > v.halfFov) return -1;
    }
    return (pxPerRad * r * 0.57735) / Math.max(d, 1e-6);
  };
  const add = (kd: number, n: number, sh: number, summary: ArrayLike<number>, centreOf: number): void => {
    const k = kind.length;
    kind.push(kd);
    node.push(n);
    shareOf.push(sh);
    g.push(summary);
    const c = nodes[centreOf];
    cx.push(c.lo[0] + c.side / 2);
    cy.push(c.lo[1] + c.side / 2);
    cz.push(c.lo[2] + c.side / 2);
    // Only subtrees with children, looking wide enough, are candidates for splitting.
    if (kd === 0 && nodes[n].childMask) {
      const s = size(k);
      if (s >= settings.splitPx) heap.push(s, k);
    }
  };
  let count = 0;
  for (const i of drawn) {
    const w = share(i);
    if (!(w > 1e-3)) continue;
    const fg = fileGlows(i);
    const n = nodes[i];
    for (let o = 0; o < 8; o++) {
      const c = n.children[o];
      if (c < 0) continue;
      const sh = w - share(c);
      if (sh <= 1e-3) continue;
      // The node file's own copy of this octant's glow (exact); the hierarchy's is the same to 0.07 %.
      const summary = fg ? fg.subarray(o * 8, o * 8 + 8) : nodes[c].sub;
      add(0, c, sh, summary, fg ? i : c);
      count++;
    }
  }
  // Split the widest while there is room: an item becomes its node's own galaxies plus each child's subtree.
  const live: boolean[] = new Array(kind.length).fill(true);
  while (heap.size > 0) {
    const k = heap.pop();
    const n = nodes[node[k]];
    let kids = 0;
    for (const c of n.children) if (c >= 0) kids++;
    if (count + kids > max) continue;
    live[k] = false;
    live.push(true);
    add(1, node[k], shareOf[k], n.own, node[k]);
    for (const c of n.children) {
      if (c < 0) continue;
      live.push(true);
      add(0, c, shareOf[k], nodes[c].sub, c);
    }
    count += kids;
  }
  out.count = 0;
  for (let k = 0; k < kind.length && out.count < max; k++) {
    if (!live[k]) continue;
    const j = out.count++;
    let l = 0;
    for (let c = 0; c < 4; c++) {
      out.light[4 * j + c] = g[k][c] * shareOf[k];
      l += g[k][c];
    }
    if (!(l > 0)) {
      out.count--;
      continue;
    }
    out.centre[3 * j] = cx[k] + g[k][4];
    out.centre[3 * j + 1] = cy[k] + g[k][5];
    out.centre[3 * j + 2] = cz[k] + g[k][6];
    out.rms[j] = g[k][7];
  }
  return out;
}
