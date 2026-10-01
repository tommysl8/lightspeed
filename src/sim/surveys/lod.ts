/**
 * Which nodes of the surveys' octree to draw this frame, and how many of each node's galaxies (scene/Surveys.tsx),
 * and which to fetch.
 *
 * The budget is spread over the whole visible volume. Each part of the sky gets points growing with the galaxies it
 * holds per pixel, but more slowly (as their number to the power 1 − SPREAD): where they crowd on the screen (the dense
 * nearby survey seen from afar) more points, so their walls and filaments show, but where they are sparse (the far,
 * thinly surveyed shells, or space near the camera spread over many pixels) not so few that those parts vanish. A pure
 * random sample would spend nearly all of the budget on the dense parts; an even density on the screen would starve
 * them. In terms of the share of its galaxies a node draws: going down from the root, each node adds to the share its
 * ancestors already draw of its region (each one's drawn galaxies over its subtree's) what is missing to reach
 * k (its pixels / its subtree's galaxies)^SPREAD: all its own galaxies if they are too few, and then its children are
 * considered, or else a part, and nothing below it. k is the largest that fits the budget (a bisection; each trial is
 * one pass over the visible nodes). A part of a node is a fair sample of it: the worker orders each node's galaxies so
 * that every prefix is spread evenly over the node (format.ts stratifiedOrder), and a draw takes the first so many. A node is
 * drawn with at least MIN_NODE_FRACTION of its galaxies or not at all, which keeps the number of draws and of downloads
 * in hand; the space it would have covered is left to its parent's glow.
 *
 * A node counts by its subtree's bounding box (the galaxies' own, much tighter than the cube: the surveys fill thin
 * cones), seen from the ship: in flight its direction is aberrated and its size divided by the Doppler factor there.
 * Nodes out of the view are left out. The choice is made over the whole hierarchy, loaded or not, so it does not change
 * as files arrive: the chosen nodes that are loaded are drawn, the others fetched, coarse before fine.
 *
 * Cost: one pass over the visible nodes (a few hundred to 2,700) to measure them, and 50 cheap passes to find k:
 * about 0.1–0.3 ms.
 */
import type { SurveyNode } from './format.ts';

/** A node is drawn with at least this share of its own galaxies, or not at all. */
export const MIN_NODE_FRACTION = 0.1;
/**
 * How the budget is spread: each part of the sky draws a share (pixels / galaxies)^SPREAD of its galaxies. 0 would be a
 * plain random sample, all of it in the dense parts; 1 an even density on the screen, the dense parts starved.
 */
export const SPREAD = 0.3;
/** Points per device pixel of sky at most, however large the budget. */
export const MAX_DENSITY = 0.5;

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
   * The view's area, device px²; by default a 2,560 × 1,440 screen. A node's area is what it would cover on a screen
   * without edges (its galaxies spread over it: a node larger than the view has that share of them in it), up to a
   * thousand screens (the nodes round the camera).
   */
  screenPx?: number;
  /**
   * The camera's comoving place (world Mpc) and how far from it, comoving, a galaxy's light can have arrived (the
   * particle horizon). Nodes wholly beyond are neither drawn nor fetched.
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
  /** Loaded nodes to draw, coarse before fine, and how many of each one's galaxies (the first so many). */
  draw: number[];
  count: number[];
  points: number;
  /** Nodes drawn whole (their octants whose child is not drawn show that child's light as a glow). */
  whole: Set<number>;
  /** Nodes chosen, loaded or not (with how many of their galaxies). */
  chosen: Map<number, number>;
  /** Nodes chosen and not loaded, coarse before fine. */
  fetch: number[];
  /** The scale k found (see above). */
  scale: number;
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

/** Choose the nodes to draw (and how many galaxies of each) and to fetch. `loaded(i)`: node i's galaxies are here. */
export function selectNodes(nodes: readonly SurveyNode[], v: LodView, loaded: (i: number) => boolean): LodResult {
  const out: LodResult = { draw: [], count: [], points: 0, whole: new Set(), chosen: new Map(), fetch: [], scale: 0 };
  if (nodes.length === 0) return out;
  const screen = v.screenPx ?? 2560 * 1440;
  // The visible nodes that could matter, breadth first, with the pixels each covers (a node that would be denser
  // than MAX_DENSITY on its own is never drawn whole, so its children are not measured).
  const idx: number[] = [0];
  const cap = 1000 * screen;
  const area: number[] = [cap];
  const up: number[] = [-1];
  for (let q = 0; q < idx.length; q++) {
    const node = nodes[idx[q]];
    if (node.points / area[q] >= MAX_DENSITY) continue;
    for (let o = 0; o < 8; o++) {
      const c = node.children[o];
      if (c < 0) continue;
      const s = nodeSizePx(nodes[c], v);
      if (s < 0) continue;
      idx.push(c);
      area.push(Math.max(1, Math.min(cap, s * s)));
      up.push(q);
    }
  }
  const len = idx.length;
  const m = new Float64Array(len);
  const whole = new Uint8Array(len);
  const given = new Float64Array(len);
  // Each node's target share per unit of k: (pixels / galaxies of its subtree)^SPREAD.
  const aim = new Float64Array(len);
  for (let q = 0; q < len; q++) aim[q] = (area[q] / Math.max(1, nodes[idx[q]].subtree)) ** SPREAD;
  const plan = (k: number): number => {
    let total = 0;
    for (let q = 0; q < len; q++) {
      m[q] = 0;
      whole[q] = 0;
      const p = up[q];
      if (p >= 0 && !whole[p]) continue;
      // The share of its region's galaxies its ancestors already draw; it adds what is missing.
      given[q] = p >= 0 ? given[p] + m[p] / Math.max(1, nodes[idx[p]].subtree) : 0;
      const rest = Math.min(1, k * aim[q]) - given[q];
      if (rest <= 0) continue;
      const n = nodes[idx[q]].points;
      const want = rest * nodes[idx[q]].subtree;
      if (want >= n) {
        m[q] = n;
        whole[q] = 1;
      } else if (want >= MIN_NODE_FRACTION * n) m[q] = Math.floor(want);
      total += m[q];
    }
    return total;
  };
  // Bisection on ln k.
  let lo = -30;
  let hi = 10;
  if (plan(Math.exp(hi)) <= v.budget) lo = hi;
  else
    for (let it = 0; it < 50; it++) {
      const mid = 0.5 * (lo + hi);
      if (plan(Math.exp(mid)) > v.budget) hi = mid;
      else lo = mid;
    }
  out.scale = Math.exp(lo);
  plan(out.scale);
  for (let q = 0; q < len; q++) {
    if (!(m[q] > 0)) continue;
    const i = idx[q];
    out.chosen.set(i, m[q]);
    if (!loaded(i)) {
      out.fetch.push(i);
      continue;
    }
    out.draw.push(i);
    out.count.push(m[q]);
    out.points += m[q];
    if (whole[q]) out.whole.add(i);
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
 * The glows: where no point is drawn. Each octant of a node drawn whole (`emits(i)`: its weight, 0 for the others)
 * whose child is not drawn at all (`drawn(c)`) holds that child's subtree's light, from the node's file
 * (`fileGlows(i)`); and a glow that looks wide is split, largest first, into its node's own galaxies and its
 * children's subtrees (the hierarchy's summaries: no download), each with the same weight, until it looks small or the
 * limit is reached. The light is only divided, never changed. Glows out of the view are not split. Nodes drawn in part
 * emit no glow: their points are a fair sample of all the galaxies below them.
 */
export function selectGlows(
  nodes: readonly SurveyNode[],
  v: Pick<LodView, 'cam' | 'a' | 'forward' | 'halfFov' | 'pxPerRad'>,
  sources: readonly number[],
  emits: (i: number) => number,
  drawn: (i: number) => boolean,
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
  for (const i of sources) {
    const w = emits(i);
    if (!(w > 1e-3)) continue;
    const fg = fileGlows(i);
    const n = nodes[i];
    for (let o = 0; o < 8; o++) {
      const c = n.children[o];
      if (c < 0) continue;
      if (drawn(c)) continue;
      const sh = w;
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
