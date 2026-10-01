/**
 * Building the surveys' octree (scripts/build-surveys.mjs; the format in format.ts): which galaxies each node keeps,
 * each node's glows, and the files. Imported by the build under Node, so, like format.ts, it imports only with file
 * extensions and uses only erasable TypeScript; the tests build small trees with it.
 *
 * Which node keeps a galaxy: the galaxies are taken in one seeded random order and each goes down from the root to
 * the first node on its way that has room (SURVEY_NODE_POINTS). A node therefore keeps a random sample of the
 * galaxies in its cube that no ancestor kept, the same fair sample of where galaxies are at every level (not the
 * brightest first: from far off the faint galaxies are then in the glows, and a region with many galaxies still looks
 * as crowded as it is).
 *
 * The glows: for each octant of a node, the galaxies of that child's whole subtree, summed. Per class the summed
 * display light (mapLight of each galaxy's luminosity), the centroid of their light, and its rms radius. Drawing a
 * node's points and the glows of the octants whose child is not drawn shows exactly the light of every galaxy below
 * the node; drawing that child instead shows its points and its own glows, which hold the same light again.
 */
import {
  encodeNode,
  GLOW_FLOATS,
  mapLightOfByte,
  kindClass,
  nodeBox,
  SURVEY_CLASSES,
  SURVEY_NODE_POINTS,
  SURVEY_ROOT_MIN_MPC,
  SURVEY_ROOT_MPC,
  tierOf,
  type Glows,
} from './format.ts';

/** The catalogue as the octree takes it. */
export interface TileInput {
  count: number;
  /** World Mpc (comoving), 3 per galaxy. */
  pos: Float64Array;
  kind: Uint8Array;
  lum: Uint8Array;
  /** Any more bytes of each point (`per` a point, interleaved), stored with it (format.ts encodeNode). */
  extra?: { per: number; bytes: Uint8Array };
  /**
   * A factor on each point's display light where the app draws some points fainter than their luminosity alone says
   * (Quaia's quasars with the largest distance errors: quaia.ts quaiaFade), so the glows hold the light the points show.
   */
  weight?: Float32Array;
}

/** A node as built (before the files are written). */
export interface BuiltNode {
  id: number;
  path: string;
  parent: number;
  octant: number;
  children: Int32Array;
  childMask: number;
  side: number;
  lo: [number, number, number];
  /** The galaxies it keeps (indices into the input). */
  points: Uint32Array;
  /** Galaxies in its subtree, itself included. */
  subtree: number;
  /** Its subtree's display light per class, light-weighted sums of position and of squared distance from the origin, and bounding box. */
  light: Float64Array;
  moments: Float64Array;
  box: Float64Array;
  /** Its octants' glows (format.ts GLOW_FLOATS each). */
  glows: Glows;
  /** Its own galaxies' summary: light of each class, centroid (world Mpc), rms radius (for the hierarchy). */
  own: Float64Array;
}

/** A seeded generator of uniform numbers in [0, 1) (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the octree of `input`: nodes in breadth-first order (the root first), their glows filled. */
export function buildOctree(input: TileInput, seed = 1, capacity = SURVEY_NODE_POINTS): BuiltNode[] {
  const n = input.count;
  const rand = seeded(seed);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  // Nodes as they are made: side, corner, fill, children.
  const made: { path: string; parent: number; octant: number; side: number; lo: [number, number, number]; fill: number; children: Int32Array }[] = [];
  const make = (path: string, parent: number, octant: number): number => {
    const { side, lo } = nodeBox(path);
    made.push({ path, parent, octant, side, lo, fill: 0, children: new Int32Array(8).fill(-1) });
    return made.length - 1;
  };
  make('', -1, -1);
  const nodeOf = new Uint32Array(n);
  const p = input.pos;
  for (let r = 0; r < n; r++) {
    const i = order[r];
    const x = p[3 * i];
    const y = p[3 * i + 1];
    const z = p[3 * i + 2];
    if (!(x >= SURVEY_ROOT_MIN_MPC && x < SURVEY_ROOT_MIN_MPC + SURVEY_ROOT_MPC && y >= SURVEY_ROOT_MIN_MPC && y < SURVEY_ROOT_MIN_MPC + SURVEY_ROOT_MPC && z >= SURVEY_ROOT_MIN_MPC && z < SURVEY_ROOT_MIN_MPC + SURVEY_ROOT_MPC)) {
      throw new Error(`survey galaxy ${i} at (${x}, ${y}, ${z}) Mpc lies outside the octree`);
    }
    let k = 0;
    for (;;) {
      const node = made[k];
      if (node.fill < capacity) {
        node.fill++;
        nodeOf[i] = k;
        break;
      }
      const h = node.side / 2;
      const o = (x >= node.lo[0] + h ? 1 : 0) | (y >= node.lo[1] + h ? 2 : 0) | (z >= node.lo[2] + h ? 4 : 0);
      let c = node.children[o];
      if (c < 0) {
        c = make(node.path + o, k, o);
        made[k].children[o] = c;
      }
      k = c;
    }
  }
  // Each node's galaxies, in the random order (a counting sort by node).
  const starts = new Uint32Array(made.length + 1);
  for (let i = 0; i < n; i++) starts[nodeOf[i] + 1]++;
  for (let k = 0; k < made.length; k++) starts[k + 1] += starts[k];
  const fill = starts.slice(0, made.length);
  const byNode = new Uint32Array(n);
  for (let r = 0; r < n; r++) {
    const i = order[r];
    byNode[fill[nodeOf[i]]++] = i;
  }
  const hOf = new Float64Array(256);
  for (let b = 0; b < 256; b++) hOf[b] = mapLightOfByte(b);
  // Subtree sums, children before parents (a child is always made after its parent).
  const light = made.map(() => new Float64Array(SURVEY_CLASSES));
  const moments = made.map(() => new Float64Array(5)); // Σw, Σw x, Σw y, Σw z, Σw |x|²
  const box = made.map(() => Float64Array.of(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity));
  const subtree = new Float64Array(made.length);
  const own = made.map(() => new Float64Array(GLOW_FLOATS));
  for (let k = made.length - 1; k >= 0; k--) {
    // Its own galaxies first (the children's sums are already in light[k] and moments[k]: they come after it).
    const L = new Float64Array(SURVEY_CLASSES);
    const M = new Float64Array(5);
    const B = box[k];
    for (let s = starts[k]; s < starts[k + 1]; s++) {
      const i = byNode[s];
      const w = hOf[input.lum[i]] * (input.weight ? input.weight[i] : 1);
      const x = p[3 * i];
      const y = p[3 * i + 1];
      const z = p[3 * i + 2];
      L[kindClass(input.kind[i])] += w;
      M[0] += w;
      M[1] += w * x;
      M[2] += w * y;
      M[3] += w * z;
      M[4] += w * (x * x + y * y + z * z);
      if (x < B[0]) B[0] = x;
      if (y < B[1]) B[1] = y;
      if (z < B[2]) B[2] = z;
      if (x > B[3]) B[3] = x;
      if (y > B[4]) B[4] = y;
      if (z > B[5]) B[5] = z;
    }
    subtree[k] += starts[k + 1] - starts[k];
    const O = own[k];
    for (let c = 0; c < SURVEY_CLASSES; c++) O[c] = L[c];
    if (M[0] > 0) {
      for (let a = 0; a < 3; a++) O[4 + a] = M[1 + a] / M[0];
      O[7] = Math.sqrt(Math.max(0, M[4] / M[0] - (O[4] * O[4] + O[5] * O[5] + O[6] * O[6])));
    }
    for (let c = 0; c < SURVEY_CLASSES; c++) light[k][c] += L[c];
    for (let m = 0; m < 5; m++) moments[k][m] += M[m];
    const parent = made[k].parent;
    if (parent >= 0) {
      for (let c = 0; c < SURVEY_CLASSES; c++) light[parent][c] += light[k][c];
      for (let m = 0; m < 5; m++) moments[parent][m] += moments[k][m];
      const PB = box[parent];
      for (let a = 0; a < 3; a++) {
        PB[a] = Math.min(PB[a], B[a]);
        PB[3 + a] = Math.max(PB[3 + a], B[3 + a]);
      }
      subtree[parent] += subtree[k];
    }
  }
  // Breadth-first order.
  const bfs: number[] = [0];
  for (let q = 0; q < bfs.length; q++) for (const c of made[bfs[q]].children) if (c >= 0) bfs.push(c);
  const idOf = new Int32Array(made.length);
  bfs.forEach((k, id) => (idOf[k] = id));
  return bfs.map((k, id) => {
    const m = made[k];
    const glows = new Float32Array(8 * GLOW_FLOATS);
    const cx = m.lo[0] + m.side / 2;
    const cy = m.lo[1] + m.side / 2;
    const cz = m.lo[2] + m.side / 2;
    let childMask = 0;
    const children = new Int32Array(8).fill(-1);
    for (let o = 0; o < 8; o++) {
      const c = m.children[o];
      if (c < 0) continue;
      childMask |= 1 << o;
      children[o] = idOf[c];
      const g = o * GLOW_FLOATS;
      for (let cl = 0; cl < SURVEY_CLASSES; cl++) glows[g + cl] = light[c][cl];
      const M = moments[c];
      if (M[0] > 0) {
        const mx = M[1] / M[0];
        const my = M[2] / M[0];
        const mz = M[3] / M[0];
        glows[g + 4] = mx - cx;
        glows[g + 5] = my - cy;
        glows[g + 6] = mz - cz;
        glows[g + 7] = Math.sqrt(Math.max(0, M[4] / M[0] - (mx * mx + my * my + mz * mz)));
      }
    }
    return {
      id,
      path: m.path,
      parent: m.parent < 0 ? -1 : idOf[m.parent],
      octant: m.octant,
      children,
      childMask,
      side: m.side,
      lo: m.lo,
      points: byNode.slice(starts[k], starts[k + 1]),
      subtree: subtree[k],
      light: light[k],
      moments: moments[k],
      box: box[k],
      glows,
      own: own[k],
    };
  });
}

/** A node's file (before gzip): its galaxies at their tiers, its glows. `dist` is each galaxy's distance from the Sun, Mpc. */
export function nodeBytes(node: BuiltNode, input: TileInput, dist: Float64Array | Float32Array): { bytes: Uint8Array; order: Uint32Array } {
  const m = node.points.length;
  const pos = new Float64Array(3 * m);
  const tier = new Uint8Array(m);
  const kind = new Uint8Array(m);
  const lum = new Uint8Array(m);
  const per = input.extra ? input.extra.per : 0;
  const extra = new Uint8Array(m * per);
  for (let j = 0; j < m; j++) {
    const i = node.points[j];
    pos[3 * j] = input.pos[3 * i];
    pos[3 * j + 1] = input.pos[3 * i + 1];
    pos[3 * j + 2] = input.pos[3 * i + 2];
    tier[j] = tierOf(dist[i]);
    kind[j] = input.kind[i];
    lum[j] = input.lum[i];
    for (let e = 0; e < per; e++) extra[j * per + e] = input.extra!.bytes[i * per + e];
  }
  return encodeNode(pos, tier, kind, lum, node.lo, node.side, node.glows, per ? { per, bytes: extra } : null);
}
