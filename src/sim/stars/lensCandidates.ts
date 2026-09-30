/**
 * Which stars can show images of a black hole beyond the one the star field draws anyway: the primary image of
 * a star the lens brightens past the eye's limit (order 0), and the images bent round the hole (orders 1–3), which
 * the star field draws as extra draws over these lists (scene/Starfield.tsx; the nuclear cluster's field does the
 * same for its own stars: scene/NuclearCluster.tsx).
 *
 * How: the stars are binned once per hole by their direction from the hole on an equal-area
 * grid of 2 × 64² cells, about 2.2° each (the hemisphere of each sign of the world z axis mapped to a disc by
 * Lambert's equal-area projection and the disc to a 64 × 64 square by Shirley and Chiu's concentric map), each
 * cell's stars brightest first by their magnitude seen from the hole, with each star's direction from the hole.
 * Each cell is a quadtree of ever smaller squares down to 64 stars a leaf, and above the cells the tree goes on to
 * each hemisphere's whole square (BinTree); every node keeps its brightest star, its stars' least distance from
 * the hole and the cone about their mean direction that holds them all. The bins are built in slices of about
 * 3 ms (holeBinsBuilder: a counting sort by magnitude, no comparison sort, and the trees node by node). For a list
 * (ListScan), the tree is read from the top: a node none of whose stars can pass by its bounds is left with all
 * below it; a node that holds a caustic in its angles from the axis (where a point's magnification has no bound)
 * is read through its quarters; any other has its leaves' stars read one by one, brightest first (a leaf is left
 * at the first star the bound rules out), each against a bound that can only be larger than what the GPU will
 * draw:
 *  - order 0: the stars' pre-cull exactly (shaders/stars.vert.glsl: the magnitude from the camera less the
 *    magnification bound at the straight-line angle from the hole, lensMuBound, and the Doppler and gravity bound
 *    uLensBoost, against the eye's limit + 0.5), and past it the brighter of the star drawn straight (μ = 1) and
 *    its lensed image's bound as below (the pre-cull's first node never culls, which near the hole takes in tens
 *    of thousands of stars; the lensed bound takes out all but the few near the axis);
 *  - the lensed image: the star's flux as seen from the hole (M_V + 5 log10(r_s/10 pc)) times
 *    sin α e^m/|sin D| (the magnification of a source at infinity, from the inverse table, with D the image's
 *    sweep: γ, 2π − γ, 2π + γ, 4π − γ for γ the angle at the hole between camera and star), times Gould's
 *    finite-source factor, at most 1.3428 and at most 2/z of it (z = |D − nπ| r_s/R★, the star's own disc
 *    capping it at the caustics: behind the hole, and in front of the camera for orders ≥ 1), divided by
 *    c − |b′|e^m/r_s (the finite distance: the image's flux is sin α/(|sin D| J) with J ≥ c e^−m − |b′|/r_s,
 *    pointImageTier1's Jacobian), and by e^(−2 asin(b/r_s)) for the parallax's shift of the image along D;
 *  - the largest brightening by Doppler shift and gravity (maxBoostMag) taken off.
 * Before a star's bound, a quick test of its angle from the two axes against the widest angle at which the
 * magnification could reach what that star needs. From Sgr A* half the catalogue lies within 1° of the Sun and a
 * cell holding a caustic holds a third of it: the trees narrow that to the few leaves the axis crosses, and the
 * quick test reads each of their stars in a few nanoseconds. The nodes' bounds hold for every star in them however
 * it has moved since the build (a margin of the fastest star's travel, which also asks for a rebuild once it passes
 * a hundredth of the nearest star's distance). A list holds at most the 20,000 brightest by that bound, never a
 * fall-back to every star (a second full draw of the catalogue costs about a millisecond on the target laptop).
 *
 * Why: from Sgr A* the images a catalogue star shows beyond the primary number up to a few hundred (226 at 6 M
 * opposite the Sun, brute force: lensCandidates.test.ts); a second pass over 329,770 stars for them would cost
 * about 1.3 ms of GPU in flight.
 *
 * Cost (measured in Node with the machine fully loaded by other work): a list 0.06–0.4 ms of main thread from
 * Sgr A* at 20 M and beyond (0.07–0.1 for most, against a budget of 0.2), a few milliseconds where it holds
 * thousands of stars (at 6 M opposite the Sun, 2,488: 4 ms); the bins 150–300 ms in all for the 329,770 catalogue
 * stars, in slices of about 3 ms, once per hole. The star field makes its lists with ListScan.step in slices of
 * 1.5 ms a frame and only when the lens, the axis or the brightness bound has changed, so none stops a frame.
 *
 * Twins: shaders/stars.vert.glsl (the pre-cull, lensImage's magnification), physics/lensPoint.ts
 * (pointImageTier1, against which lensCandidates.test.ts checks the lists by brute force), physics/
 * schwarzschildTables.ts (inverseEval, muBoundEval).
 */
import type { BodyId, Vec3Like } from '../bodies/types';
import type { ImageOrder } from '../../physics/lensPoint';
import { starRadiusRsun } from '../../physics/lensPoint';
import { PARSEC_KM, SUN_RADIUS_KM } from '../../physics/constants';
import { inverseEval, muBoundEval, type InverseSample, type InverseTable } from '../../physics/schwarzschildTables';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';

/** Cells along each side of each hemisphere's square. */
export const BIN_SIDE = 64;
/** Cells in all: 2 × 64² (each 4π/8,192 sr, about 2.2° across). */
export const BIN_CELLS = 2 * BIN_SIDE * BIN_SIDE;
/** The most stars a list holds (the brightest by its bound). */
export const CANDIDATE_CAP = 20_000;
/** An int16 magnitude that hides a star (a registry body draws it): scene/Starfield.tsx. */
const HIDDEN_INT16 = 32767;
/** Magnitudes per unit of ln flux. */
const MAG_PER_LN = 2.5 / Math.LN10;
/** ln of Gould's B0 at its peak (1.3428 at z ≈ 0.9): the most the finite source can raise the point magnification. */
const LN_B0_MAX = Math.log(1.3428);
/** Headroom for the GPU's float32 against these float64 bounds, magnitudes. */
const MARGIN_MAG = 0.05;
/** The solar radius, pc. */
const RSUN_PC = SUN_RADIUS_KM / PARSEC_KM;

// ─── The grid ────────────────────────────────────────────────────────────────────────────────────

/** Steps along each side of each hemisphere's square for the trees within the cells (1,024 to a cell). */
const Q_SIDE = 65_536;
/** A unit vector's hemisphere and its place in that hemisphere's square, in Q_SIDE steps a side (squareOf). */
const sq = { h: 0, qa: 0, qb: 0 };

/**
 * Where a unit vector (world axes) falls, into `sq`: its hemisphere by the sign of z, Lambert's equal-area map of
 * the hemisphere to the unit disc (radius √(1 − |z|)), and the concentric map of the disc to the square [−1, 1)²,
 * in steps of 2/Q_SIDE.
 */
function squareOf(x: number, y: number, z: number): void {
  const rho = Math.sqrt(Math.max(0, 1 - Math.abs(z)));
  let phi = Math.atan2(y, x);
  if (phi < -Math.PI / 4) phi += 2 * Math.PI;
  let a: number;
  let b: number;
  if (phi < Math.PI / 4) {
    a = rho;
    b = (phi * rho) / (Math.PI / 4);
  } else if (phi < (3 * Math.PI) / 4) {
    b = rho;
    a = (-(phi - Math.PI / 2) * rho) / (Math.PI / 4);
  } else if (phi < (5 * Math.PI) / 4) {
    a = -rho;
    b = ((phi - Math.PI) * a) / (Math.PI / 4);
  } else {
    b = -rho;
    a = (-(phi - (3 * Math.PI) / 2) * b) / (Math.PI / 4);
  }
  sq.h = z >= 0 ? 0 : 1;
  sq.qa = Math.min(Q_SIDE - 1, Math.max(0, Math.floor(((a + 1) / 2) * Q_SIDE)));
  sq.qb = Math.min(Q_SIDE - 1, Math.max(0, Math.floor(((b + 1) / 2) * Q_SIDE)));
}

/** Square steps to a cell's side. */
const Q_PER_CELL = Q_SIDE / BIN_SIDE;

/** The cell of a unit vector (world axes): see squareOf; cells are Q_PER_CELL steps a side. */
export function cellOf(x: number, y: number, z: number): number {
  squareOf(x, y, z);
  return sq.h * BIN_SIDE * BIN_SIDE + Math.floor(sq.qb / Q_PER_CELL) * BIN_SIDE + Math.floor(sq.qa / Q_PER_CELL);
}

/** The angle between two vectors (any lengths), exact at small and large angles. */
function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
}

// ─── The stars and their bins ──────────────────────────────────────────────────────────────────

/** Stars to bin: positions (pc, xyz triples), and how they move, as the star shader moves them. */
export interface StarSource {
  count: number;
  /** pc, xyz per star, in the same frame and from the same origin as the hole's position given with them. */
  positions: Float32Array;
  /** true: J2000 ecliptic axes (the catalogue's; world = (x, z, −y)); false: world axes. */
  ecliptic: boolean;
  /** int16 steps of velocityUnitKms, in the positions' axes (none: the stars stand still). */
  velocities?: Int16Array;
  velocityUnitKms?: number;
  /** Absolute V magnitudes: floats, or int16 steps of absMagUnit (the value 32767 hides a star: it is left out). */
  absMag: Float32Array | Int16Array;
  absMagUnit: number;
  /** K (0: unknown, taken as 5,772 K). */
  teff?: Uint16Array;
}

/** Where the stars are drawn: the date and the light-time setting the star shader has (uYears, uRetarded). */
export interface StarEpoch {
  /** Julian years since J2000, as the shader holds them. */
  years: number;
  /** Stars drawn where the camera sees them (light-time) rather than where they are. */
  retarded: boolean;
  /** The camera (pc, the stars' frame and origin, world axes). */
  camPc: Vec3Like;
}

/** Stars binned by direction from one hole (equal-area grid, 2 × 64² cells, each a tree), each leaf sorted by m_hole. */
export interface HoleBins {
  hole: BodyId;
  /** Per cell: start and count into `order` (the cells' runs in the tree's order), and the brightest m_hole. */
  cellStart: Uint32Array;
  cellCount: Uint32Array;
  cellMinMag: Float32Array;
  /** Star indices, grouped by cell and within a cell by the leaves of its tree, brightest first within a leaf. */
  order: Uint32Array;
  /**
   * m_hole of each entry of `order` when binned, to the lower edge of its step of about 0.0014 mag (never fainter
   * than the star's own, and in order within a leaf, so a leaf's stars can be passed over from the first too faint).
   */
  orderMag: Float32Array;
  /** Each entry's unit direction from the hole when binned, xyz (the lists' quick test of its angle from the axis). */
  orderDir: Float32Array;
  ready: boolean;
  /** Per cell: the least distance of its stars from the hole when binned, pc. */
  cellMinRPc: Float32Array;
  /** The hole (pc, world axes, the stars' origin). */
  holePc: Vec3Like;
  source: StarSource;
  /** Where the stars were when binned. */
  epoch: StarEpoch;
  /** The fastest star, pc per year (their travel since the binning widens the cells' bounds). */
  vMaxPcYr: number;
  /** The least distance of any star from the hole, pc. */
  minRPc: number;
  /** Reused list buffers, one per image order. */
  lists: Uint32Array[];
  /** Each cell's stars as a tree of ever smaller squares (BinTree). */
  tree: BinTree;
}

/**
 * The stars of each cell as a quadtree over the cell's square: a node holds a run of `order` (brightest first, as
 * the cell's), and one with more than LEAF_STARS stars has four children, the quarters of its square, whose runs
 * split its own (each still brightest first). Each node keeps the bounds a list tests: its brightest star's
 * magnitude from the hole, its stars' least distance from the hole, and the cone about its stars' mean direction
 * from the hole that holds them all (from the stars themselves, so it fits them however few they are). Above the
 * cells the same, four to a node up to each hemisphere's square, from the quarters' bounds.
 */
export interface BinTree {
  /** Nodes in use. */
  n: number;
  /** Per node: its run of `order`, and its first child (the four are in a row) or −1 for a leaf. */
  start: Uint32Array;
  count: Uint32Array;
  child: Int32Array;
  /** Per node: its brightest star's magnitude from the hole, and its stars' least distance from the hole, pc. */
  minMag: Float32Array;
  minRPc: Float32Array;
  /** Per node: the unit mean of its stars' directions from the hole (xyz), and the angle from it that holds them all, rad. */
  dir: Float64Array;
  radius: Float64Array;
  /** Per cell: its root node, or −1 when it holds no star. */
  root: Int32Array;
}

/** A node with more stars than this is split into its quarters (down to a square of one step, 1/1,024 of a cell's side). */
export const LEAF_STARS = 64;

/**
 * Above the cells the tree goes on to each hemisphere's whole square, a level of four to a node (levels 0 to 5;
 * the cells are level 6), and the cells' runs are laid out in that order (the Z order of their squares), so each
 * node's stars are one run too. Level L's nodes come first(L) … first(L + 1) − 1.
 */
const firstOfLevel = (level: number): number => (2 * (4 ** level - 1)) / 3;
/** The cells' level, and its first node. */
const CELL_LEVEL = Math.log2(BIN_SIDE);
const FIRST_CELL_NODE = firstOfLevel(CELL_LEVEL);
/** A list reads the tree a level-3 node at a time (128 of them, 64 cells each), looking at the clock between. */
const SLICE_LEVEL = 3;
const FIRST_SLICE_NODE = firstOfLevel(SLICE_LEVEL);
const SLICE_NODES = firstOfLevel(SLICE_LEVEL + 1) - FIRST_SLICE_NODE;

/** Cell (i, j) of a hemisphere's square from its place along the Z order (the bits of i and j interleaved). */
function zCell(z: number): number {
  let i = 0;
  let j = 0;
  for (let b = 0; b < CELL_LEVEL; b++) {
    i |= ((z >> (2 * b)) & 1) << b;
    j |= ((z >> (2 * b + 1)) & 1) << b;
  }
  return j * BIN_SIDE + i;
}

/** A star's place relative to the camera as the star shader works it out (float64), world axes, into out; returns its distance. */
function starRel(s: StarSource, i: number, epoch: StarEpoch, out: number[]): number {
  const P = s.positions;
  let px = P[3 * i];
  let py = P[3 * i + 1];
  let pz = P[3 * i + 2];
  let vx = 0;
  let vy = 0;
  let vz = 0;
  const V = s.velocities;
  if (V) {
    const k = (s.velocityUnitKms ?? 0.1) * KMS_TO_PC_PER_YR;
    vx = V[3 * i] * k;
    vy = V[3 * i + 1] * k;
    vz = V[3 * i + 2] * k;
  }
  if (s.ecliptic) {
    // ecliptic (x, y, z) → world (x, z, −y)
    let t = py;
    py = pz;
    pz = -t;
    t = vy;
    vy = vz;
    vz = -t;
  }
  const lag = epoch.years + Math.hypot(px, py, pz) / C_PC_PER_YR;
  let rx = px - epoch.camPc.x + vx * lag;
  let ry = py - epoch.camPc.y + vy * lag;
  let rz = pz - epoch.camPc.z + vz * lag;
  if (epoch.retarded) {
    const lt = Math.hypot(rx, ry, rz) / C_PC_PER_YR;
    rx -= vx * lt;
    ry -= vy * lt;
    rz -= vz * lt;
  }
  out[0] = rx;
  out[1] = ry;
  out[2] = rz;
  return Math.max(Math.hypot(rx, ry, rz), 1e-12);
}

/** A star's absolute magnitude, or NaN when it is hidden. */
function absMagOf(s: StarSource, i: number): number {
  const m = s.absMag[i];
  if (s.absMag instanceof Int16Array && m >= HIDDEN_INT16) return NaN;
  return m * s.absMagUnit;
}

/** Builds bins in slices. */
export interface HoleBinsBuilder {
  bins: HoleBins;
  /** Carry on for about `maxMs` milliseconds; true once the bins are ready. */
  step(maxMs: number): boolean;
}

/**
 * The stars' magnitudes from the hole are put in order by steps (a counting sort, in slices, where a sort of a cell
 * holding a third of the catalogue would stop a frame for tens of milliseconds): 65,536 steps, the first for
 * anything brighter than −30, the last for anything fainter than 60, and about 0.0014 mag each between. Each entry
 * of a run keeps its step's lower edge as its magnitude (orderMag): never fainter than the star, and in order.
 */
const MAG_STEPS = 65_536;
const MAG_LO = -30;
const MAG_HI = 60;
const MAG_STEP = (MAG_HI - MAG_LO) / (MAG_STEPS - 2);

/** A magnitude's step. */
function magStep(m: number): number {
  if (!(m >= MAG_LO)) return 0;
  const q = 1 + Math.floor((m - MAG_LO) / MAG_STEP);
  return q > MAG_STEPS - 1 ? MAG_STEPS - 1 : q;
}

/** Each step's lower edge, less 10⁻⁵ (so its float32 is never above a magnitude in it); −∞ for the first. */
const magEdge = new Float32Array(MAG_STEPS);
magEdge[0] = -Infinity;
for (let q = 1; q < MAG_STEPS; q++) magEdge[q] = MAG_LO + (q - 1) * MAG_STEP - 1e-5;

/** An empty tree with room for `cap` nodes. */
function emptyTree(cap: number): BinTree {
  return {
    n: 0,
    start: new Uint32Array(cap),
    count: new Uint32Array(cap),
    child: new Int32Array(cap),
    minMag: new Float32Array(cap),
    minRPc: new Float32Array(cap),
    dir: new Float64Array(3 * cap),
    radius: new Float64Array(cap),
    root: new Int32Array(BIN_CELLS).fill(-1),
  };
}

/** A copy of `a` in an array of the same kind `k × cap` long. */
function grown<A extends Uint32Array | Int32Array | Float32Array | Float64Array>(a: A, k: number, cap: number): A {
  const b = new (a.constructor as new (n: number) => A)(k * cap);
  b.set(a);
  return b;
}

/** The tree with room for at least `need` nodes (its arrays copied into larger ones when it has not). */
function treeRoom(t: BinTree, need: number): BinTree {
  let cap = Math.max(1, t.start.length);
  if (need <= t.start.length) return t;
  while (cap < need) cap *= 2;
  return {
    n: t.n,
    start: grown(t.start, 1, cap),
    count: grown(t.count, 1, cap),
    child: grown(t.child, 1, cap),
    minMag: grown(t.minMag, 1, cap),
    minRPc: grown(t.minRPc, 1, cap),
    dir: grown(t.dir, 3, cap),
    radius: grown(t.radius, 1, cap),
    root: t.root,
  };
}

/**
 * Bin `source`'s stars by their direction from the hole at `holePc` (the stars' frame and origin, world axes),
 * where the star shader draws them at `epoch`, in slices: step(maxMs) until it says it is done (bins.ready).
 * Phases, each in slices: each star's cell, square, direction, distance and magnitude from the hole; the stars in
 * order of magnitude (a counting sort by MAG_STEPS); into their cells in that order, so each cell's run is
 * brightest first; each entry's magnitude, direction, square and distance; the cells' trees, node by node (each
 * node's bounds, then its run split into its quarters' runs, in order, so each stays brightest first), and the
 * levels above the cells from their quarters.
 */
export function holeBinsBuilder(hole: BodyId, holePc: Vec3Like, source: StarSource, epoch: StarEpoch): HoleBinsBuilder {
  const n = source.count;
  const cellOfStar = new Uint16Array(n);
  const magOfStar = new Uint16Array(n);
  const magCount = new Uint32Array(MAG_STEPS);
  const cellFill = new Uint32Array(BIN_CELLS);
  let byMag = new Uint32Array(0);
  const rHole = new Float32Array(n);
  const dirHole = new Float32Array(3 * n);
  const qHole = new Uint16Array(2 * n);
  const bins: HoleBins = {
    hole,
    cellStart: new Uint32Array(BIN_CELLS),
    cellCount: new Uint32Array(BIN_CELLS),
    cellMinMag: new Float32Array(BIN_CELLS).fill(Infinity),
    order: new Uint32Array(0),
    orderMag: new Float32Array(0),
    orderDir: new Float32Array(0),
    ready: false,
    cellMinRPc: new Float32Array(BIN_CELLS).fill(Infinity),
    holePc: { x: holePc.x, y: holePc.y, z: holePc.z },
    source,
    epoch: { years: epoch.years, retarded: epoch.retarded, camPc: { x: epoch.camPc.x, y: epoch.camPc.y, z: epoch.camPc.z } },
    vMaxPcYr: 0,
    minRPc: Infinity,
    lists: [],
    tree: emptyTree(0),
  };
  const hx = holePc.x - epoch.camPc.x;
  const hy = holePc.y - epoch.camPc.y;
  const hz = holePc.z - epoch.camPc.z;
  const rel = [0, 0, 0];
  const velK = (source.velocityUnitKms ?? 0.1) * KMS_TO_PC_PER_YR;
  let next = 0;
  let phase = 0;
  let placed = 0;
  let count = 0;
  let order = new Uint32Array(0);
  // The trees' build: per entry of `order` its square and distance from the hole, per node its square's corner and
  // side (steps), and scratch runs for the splits.
  let orderQ = new Uint16Array(0);
  let orderR = new Float32Array(0);
  let nodeQa = new Uint32Array(0);
  let nodeQb = new Uint32Array(0);
  let nodeW = new Uint32Array(0);
  let tmpI = new Uint32Array(0);
  let tmpM = new Float32Array(0);
  let tmpD = new Float32Array(0);
  let tmpQ = new Uint16Array(0);
  let tmpR = new Float32Array(0);
  const quarterAt = new Uint32Array(4);
  /** Stars a slice's loops take between looks at the clock (a millisecond or two of work). */
  const CHUNK = 4096;

  /** Room for `need` nodes in the tree and in the build's own per-node arrays. */
  const room = (need: number): void => {
    bins.tree = treeRoom(bins.tree, need);
    const cap = bins.tree.start.length;
    if (nodeQa.length < cap) {
      nodeQa = grown(nodeQa, 1, cap);
      nodeQb = grown(nodeQb, 1, cap);
      nodeW = grown(nodeW, 1, cap);
    }
  };

  // The node being built (buildNode), where it has got to, and what it has summed so far.
  let cur = -1;
  let stage = 0;
  let pos = 0;
  let minR = Infinity;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let chord2 = 0;
  let qa1 = 0;
  let qb1 = 0;

  /**
   * Carry node `cur` on by at most CHUNK of its stars (a node of a third of the catalogue takes a few slices):
   * its bounds from its stars, then (more than LEAF_STARS of them, and a square wider than a step) its run split
   * into its quarters' runs. Returns how many stars it read; `cur` is −1 once the node is done.
   */
  const buildNode = (): number => {
    const t = bins.tree;
    const k = cur;
    const s = t.start[k];
    const e = s + t.count[k];
    const D = bins.orderDir;
    if (stage === 0) {
      // Where the stars are: the nearest, and the sum of their directions.
      if (pos === s) {
        minR = Infinity;
        sx = 0;
        sy = 0;
        sz = 0;
        chord2 = 0;
      }
      const end = Math.min(e, pos + CHUNK);
      for (let i = pos; i < end; i++) {
        if (orderR[i] < minR) minR = orderR[i];
        sx += D[3 * i];
        sy += D[3 * i + 1];
        sz += D[3 * i + 2];
      }
      const read = end - pos;
      pos = end;
      if (pos < e) return read;
      let len = Math.hypot(sx, sy, sz);
      if (!(len > 0)) {
        sx = D[3 * s];
        sy = D[3 * s + 1];
        sz = D[3 * s + 2];
        len = Math.hypot(sx, sy, sz);
      }
      t.dir[3 * k] = sx / len;
      t.dir[3 * k + 1] = sy / len;
      t.dir[3 * k + 2] = sz / len;
      stage = 1;
      pos = s;
      return read;
    }
    if (stage === 1) {
      // The widest chord from the mean to a star (float64, from the stored float32 directions) as an angle, and a
      // microradian for those directions' own rounding.
      const cx = t.dir[3 * k];
      const cy = t.dir[3 * k + 1];
      const cz = t.dir[3 * k + 2];
      const end = Math.min(e, pos + CHUNK);
      for (let i = pos; i < end; i++) {
        const dx = D[3 * i] - cx;
        const dy = D[3 * i + 1] - cy;
        const dz = D[3 * i + 2] - cz;
        const c2 = dx * dx + dy * dy + dz * dz;
        if (c2 > chord2) chord2 = c2;
      }
      const read = end - pos;
      pos = end;
      if (pos < e) return read;
      t.minMag[k] = bins.orderMag[s];
      t.minRPc[k] = minR;
      t.radius[k] = 2 * Math.asin(Math.min(1, 0.5 * Math.sqrt(chord2))) + 1e-6;
      const w = nodeW[k];
      if (e - s <= LEAF_STARS || w < 2) {
        t.child[k] = -1;
        cur = -1;
        return read;
      }
      qa1 = nodeQa[k] + (w >> 1);
      qb1 = nodeQb[k] + (w >> 1);
      quarterAt.fill(0);
      stage = 2;
      pos = s;
      return read;
    }
    if (stage === 2) {
      // How many stars fall in each quarter; then the quarters, their runs in the order q = 0 … 3.
      const end = Math.min(e, pos + CHUNK);
      for (let i = pos; i < end; i++) quarterAt[(orderQ[2 * i] >= qa1 ? 1 : 0) + (orderQ[2 * i + 1] >= qb1 ? 2 : 0)]++;
      const read = end - pos;
      pos = end;
      if (pos < e) return read;
      const half = nodeW[k] >> 1;
      const first = t.n;
      room(first + 4);
      const T = bins.tree;
      let at = s;
      for (let q = 0; q < 4; q++) {
        const c = first + q;
        const m = quarterAt[q];
        T.start[c] = at;
        T.count[c] = m;
        nodeQa[c] = nodeQa[k] + (q & 1 ? half : 0);
        nodeQb[c] = nodeQb[k] + (q & 2 ? half : 0);
        nodeW[c] = half;
        quarterAt[q] = at - s;
        at += m;
      }
      T.n = first + 4;
      T.child[k] = first;
      stage = 3;
      pos = s;
      return read;
    }
    // Stage 3: each star to its quarter's run, in order (so each run stays brightest first), then back in place.
    const O = bins.order;
    const M = bins.orderMag;
    const end = Math.min(e, pos + CHUNK);
    for (let i = pos; i < end; i++) {
      const j = quarterAt[(orderQ[2 * i] >= qa1 ? 1 : 0) + (orderQ[2 * i + 1] >= qb1 ? 2 : 0)]++;
      tmpI[j] = O[i];
      tmpM[j] = M[i];
      tmpD[3 * j] = D[3 * i];
      tmpD[3 * j + 1] = D[3 * i + 1];
      tmpD[3 * j + 2] = D[3 * i + 2];
      tmpQ[2 * j] = orderQ[2 * i];
      tmpQ[2 * j + 1] = orderQ[2 * i + 1];
      tmpR[j] = orderR[i];
    }
    const read = end - pos;
    pos = end;
    if (pos < e) return read;
    const m = e - s;
    O.set(tmpI.subarray(0, m), s);
    M.set(tmpM.subarray(0, m), s);
    D.set(tmpD.subarray(0, 3 * m), 3 * s);
    orderQ.set(tmpQ.subarray(0, 2 * m), 2 * s);
    orderR.set(tmpR.subarray(0, m), s);
    cur = -1;
    return read;
  };

  const step = (maxMs: number): boolean => {
    if (bins.ready) return true;
    const t0 = performance.now();
    const late = (): boolean => performance.now() - t0 > maxMs;
    if (phase === 0) {
      // Each star's cell, square, direction, distance and magnitude from the hole (and the magnitude's step).
      while (next < n) {
        const end = Math.min(n, next + CHUNK);
        for (let i = next; i < end; i++) {
          const M = absMagOf(source, i);
          if (Number.isNaN(M)) {
            cellOfStar[i] = 0xffff;
            continue;
          }
          starRel(source, i, bins.epoch, rel);
          const sx = rel[0] - hx;
          const sy = rel[1] - hy;
          const sz = rel[2] - hz;
          const r = Math.max(Math.hypot(sx, sy, sz), 1e-12);
          const c = cellOf(sx / r, sy / r, sz / r);
          cellOfStar[i] = c;
          qHole[2 * i] = sq.qa;
          qHole[2 * i + 1] = sq.qb;
          dirHole[3 * i] = sx / r;
          dirHole[3 * i + 1] = sy / r;
          dirHole[3 * i + 2] = sz / r;
          const m = M + 5 * Math.log10(r) - 5;
          const q = magStep(m);
          magOfStar[i] = q;
          magCount[q]++;
          rHole[i] = r;
          bins.cellCount[c]++;
          if (m < bins.cellMinMag[c]) bins.cellMinMag[c] = m;
          if (r < bins.cellMinRPc[c]) bins.cellMinRPc[c] = r;
          if (r < bins.minRPc) bins.minRPc = r;
          const V = source.velocities;
          if (V) {
            const v = Math.hypot(V[3 * i], V[3 * i + 1], V[3 * i + 2]) * velK;
            if (v > bins.vMaxPcYr) bins.vMaxPcYr = v;
          }
          count++;
        }
        next = end;
        if (late()) return false;
      }
      // Where each magnitude step's stars go, and each cell's run, in the Z order of each hemisphere's square
      // (the tree's order).
      let at = 0;
      for (let q = 0; q < MAG_STEPS; q++) {
        const m = magCount[q];
        magCount[q] = at;
        at += m;
      }
      let start = 0;
      for (let h = 0; h < 2; h++) {
        for (let z = 0; z < BIN_SIDE * BIN_SIDE; z++) {
          const c = h * BIN_SIDE * BIN_SIDE + zCell(z);
          bins.cellStart[c] = start;
          cellFill[c] = start;
          start += bins.cellCount[c];
        }
      }
      byMag = new Uint32Array(count);
      order = new Uint32Array(count);
      phase = 1;
      next = 0;
      if (late()) return false;
    }
    if (phase === 1) {
      // The stars in order of their magnitude steps (a counting sort).
      while (next < n) {
        const end = Math.min(n, next + CHUNK);
        for (let i = next; i < end; i++) if (cellOfStar[i] !== 0xffff) byMag[magCount[magOfStar[i]]++] = i;
        next = end;
        if (late()) return false;
      }
      phase = 2;
      next = 0;
    }
    if (phase === 2) {
      // Into their cells in that order: each cell's run is brightest first (to its magnitude step).
      while (next < count) {
        const end = Math.min(count, next + CHUNK);
        for (let k = next; k < end; k++) {
          const i = byMag[k];
          order[cellFill[cellOfStar[i]]++] = i;
          placed++;
        }
        next = end;
        if (late()) return false;
      }
      bins.orderMag = new Float32Array(count);
      bins.orderDir = new Float32Array(3 * count);
      orderQ = new Uint16Array(2 * count);
      orderR = new Float32Array(count);
      byMag = new Uint32Array(0);
      phase = 3;
      next = 0;
    }
    if (phase === 3) {
      // Each entry's magnitude (its step's lower edge: never above the star's own, and in order), direction,
      // square and distance.
      const OM = bins.orderMag;
      const OD = bins.orderDir;
      while (next < count) {
        const end = Math.min(count, next + CHUNK);
        for (let k = next; k < end; k++) {
          const i = order[k];
          OM[k] = magEdge[magOfStar[i]];
          OD[3 * k] = dirHole[3 * i];
          OD[3 * k + 1] = dirHole[3 * i + 1];
          OD[3 * k + 2] = dirHole[3 * i + 2];
          orderQ[2 * k] = qHole[2 * i];
          orderQ[2 * k + 1] = qHole[2 * i + 1];
          orderR[k] = rHole[i];
        }
        next = end;
        if (late()) return false;
      }
      bins.order = order;
      // The levels above the cells and the cells themselves (levels 0 to 6: each hemisphere's square, then four
      // to a node down to the cells), in that order.
      let biggest = 0;
      for (let c = 0; c < BIN_CELLS; c++) if (bins.cellCount[c] > biggest) biggest = bins.cellCount[c];
      room(2 * (FIRST_CELL_NODE + BIN_CELLS));
      const T = bins.tree;
      const nodeH = new Uint8Array(FIRST_CELL_NODE + BIN_CELLS);
      T.n = 2;
      for (let h = 0; h < 2; h++) {
        nodeQa[h] = 0;
        nodeQb[h] = 0;
        nodeW[h] = Q_SIDE;
        nodeH[h] = h;
      }
      for (let k = 0; k < T.n; k++) {
        const w = nodeW[k];
        if (w <= Q_PER_CELL) {
          // A cell.
          const c = nodeH[k] * BIN_SIDE * BIN_SIDE + Math.floor(nodeQb[k] / Q_PER_CELL) * BIN_SIDE + Math.floor(nodeQa[k] / Q_PER_CELL);
          T.root[c] = k;
          T.start[k] = bins.cellStart[c];
          T.count[k] = bins.cellCount[c];
          continue;
        }
        const first = T.n;
        T.n += 4;
        T.child[k] = first;
        for (let q = 0; q < 4; q++) {
          nodeQa[first + q] = nodeQa[k] + (q & 1 ? w >> 1 : 0);
          nodeQb[first + q] = nodeQb[k] + (q & 2 ? w >> 1 : 0);
          nodeW[first + q] = w >> 1;
          nodeH[first + q] = nodeH[k];
        }
      }
      tmpI = new Uint32Array(biggest);
      tmpM = new Float32Array(biggest);
      tmpD = new Float32Array(3 * biggest);
      tmpQ = new Uint16Array(2 * biggest);
      tmpR = new Float32Array(biggest);
      phase = 4;
      next = FIRST_CELL_NODE;
      if (late()) return false;
    }
    if (phase === 4) {
      // The cells' trees, node by node (a split adds its quarters at the end, so this runs until none is left).
      let read = 0;
      for (;;) {
        if (cur < 0) {
          if (next >= bins.tree.n) break;
          const k = next++;
          const T = bins.tree;
          if (T.count[k] === 0) {
            T.child[k] = -1;
            T.minMag[k] = Infinity;
            T.minRPc[k] = Infinity;
            T.radius[k] = 0;
            continue;
          }
          cur = k;
          stage = 0;
          pos = T.start[k];
        }
        read += buildNode() + 16;
        if (read >= CHUNK) {
          read = 0;
          if (late()) return false;
        }
      }
      // Then the levels above the cells, from their quarters' bounds: the brightest, the nearest, and the cone about
      // the quarters' stars' mean direction that holds the quarters' cones.
      const T = bins.tree;
      for (let k = FIRST_CELL_NODE - 1; k >= 0; k--) {
        const c = T.child[k];
        let m = 0;
        let mag = Infinity;
        let r = Infinity;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let q = c; q < c + 4; q++) {
          const nq = T.count[q];
          if (nq === 0) continue;
          m += nq;
          if (T.minMag[q] < mag) mag = T.minMag[q];
          if (T.minRPc[q] < r) r = T.minRPc[q];
          sx += nq * T.dir[3 * q];
          sy += nq * T.dir[3 * q + 1];
          sz += nq * T.dir[3 * q + 2];
        }
        T.start[k] = T.start[c];
        T.count[k] = m;
        T.minMag[k] = mag;
        T.minRPc[k] = r;
        const len = Math.hypot(sx, sy, sz);
        if (!(m > 0) || !(len > 1e-9 * m)) {
          T.dir[3 * k] = 0;
          T.dir[3 * k + 1] = 0;
          T.dir[3 * k + 2] = 1;
          T.radius[k] = Math.PI;
          continue;
        }
        const cx = sx / len;
        const cy = sy / len;
        const cz = sz / len;
        let rad = 0;
        for (let q = c; q < c + 4; q++) {
          if (T.count[q] === 0) continue;
          rad = Math.max(rad, angleBetween(cx, cy, cz, T.dir[3 * q], T.dir[3 * q + 1], T.dir[3 * q + 2]) + T.radius[q]);
        }
        T.dir[3 * k] = cx;
        T.dir[3 * k + 1] = cy;
        T.dir[3 * k + 2] = cz;
        T.radius[k] = Math.min(Math.PI, rad + 1e-9);
      }
      bins.ready = placed === count;
      return true;
    }
    return bins.ready;
  };
  return { bins, step };
}

/**
 * The stars' bins for one hole, all at once (the nuclear cluster's field, which stands still, and tests):
 * `posPc` their positions (pc, world axes, the same origin as `holePosPc`), `absMag` their M_V. Ready on return.
 */
export function buildHoleBins(hole: BodyId, holePosPc: Vec3Like, posPc: Float32Array, absMag: Float32Array, teffK?: Uint16Array): HoleBins {
  const b = holeBinsBuilder(hole, holePosPc, { count: absMag.length, positions: posPc, ecliptic: false, absMag, absMagUnit: 1, teff: teffK }, { years: 0, retarded: false, camPc: holePosPc });
  b.step(Infinity);
  return b.bins;
}

/**
 * The stars' travel since they were binned, pc (the fastest star's, over the date's change and the change of
 * light-time as the camera moves): the cells' bounds widen by it.
 */
export function binsDrift(bins: HoleBins, epoch: StarEpoch): number {
  if (!(bins.vMaxPcYr > 0)) return 0;
  const moved = Math.hypot(epoch.camPc.x - bins.epoch.camPc.x, epoch.camPc.y - bins.epoch.camPc.y, epoch.camPc.z - bins.epoch.camPc.z);
  return bins.vMaxPcYr * (Math.abs(epoch.years - bins.epoch.years) + (epoch.retarded || bins.epoch.retarded ? moved / C_PC_PER_YR : 0));
}

/** Whether bins should be built again: the stars have moved more than a hundredth of the nearest one's distance, or the light-time setting changed. */
export function binsStale(bins: HoleBins, epoch: StarEpoch): boolean {
  return epoch.retarded !== bins.epoch.retarded || binsDrift(bins, epoch) > 0.01 * bins.minRPc;
}

// ─── The lists ───────────────────────────────────────────────────────────────────────────────────

/** The lens as the lists see it (render/lens/lensState.ts's lens, the pre-cull's uniforms). */
export interface CandidateView {
  /** The inverse table of the lens this frame. */
  inv: InverseTable;
  /** The pre-cull's magnification bound (lens.muBound) and its axis (ln ψ_min, 1/Δ ln ψ: uLensMuBoundAxis). */
  muBound: Float32Array;
  lnPsiMin: number;
  invDelta: number;
  /** Unit camera → hole, world axes. */
  axis: Vec3Like;
  /** The camera's distance from the hole, pc. */
  rPc: number;
  /**
   * The largest impact parameter b and slope |db/dα| of the backward rays over the camera's r (static: both
   * e^(ln g); the raindrop's: 1/(1 − v cos α_edge) and (1 + v)/(1 − v cos α_edge)², the larger).
   */
  bSlope: number;
  /** The S → hole-frame boost's rapidity (the pre-cull allows for the frame's aberration). */
  framePhi: number;
  /** Where the stars are drawn (the star shader's uYears and uRetarded). */
  years: number;
  retarded: boolean;
  /** The largest ln exposure of the halves drawn (only a positive one counts: it would brighten the stars). */
  lnExposure: number;
  /**
   * The list holds for any axis within this angle of `axis`, rad (0 by default): the star field allows 0.1° and
   * makes its lists again once the axis has turned by half that.
   */
  axisSlackRad?: number;
}

const inv1: InverseSample = { alpha: 0, m: 0 };
const rel3 = [0, 0, 0];

/** ln of the magnification of a source at infinity is tabulated over this many angles from the rear axis at the hole. */
const PSI_NODES = 257;
let psiNode: Float64Array | null = null;

/** The nodes: ψ_i = π (1 − cos(πi/(N − 1)))/2, crowded at both axes, where the caustics are. */
function psiNodes(): Float64Array {
  if (psiNode) return psiNode;
  psiNode = new Float64Array(PSI_NODES);
  for (let i = 0; i < PSI_NODES; i++) psiNode[i] = (Math.PI * (1 - Math.cos((Math.PI * i) / (PSI_NODES - 1)))) / 2;
  return psiNode;
}

/** The sweep D of order k for a star at angle psi from the rear axis at the hole (γ = π − ψ from the camera's side). */
export function sweepOf(order: number, psi: number): number {
  const gamma = Math.PI - psi;
  return order === 0 ? gamma : order === 1 ? 2 * Math.PI - gamma : order === 2 ? 2 * Math.PI + gamma : 4 * Math.PI - gamma;
}

/**
 * For the image whose sweep is D, into lnMuParts: [ln μ∞ = ln(sin α e^m/|sin D|), ln(sin α e^m),
 * ln(|D − nπ|/|sin D|)], and inv1 the inverse table's (α, m) there.
 */
const lnMuParts = [0, 0, 0];
function lnMuInf(inv: InverseTable, D: number): void {
  inverseEval(inv, D, inv1);
  const off = Math.abs(D - Math.round(D / Math.PI) * Math.PI);
  const sinD = Math.sin(off);
  const lnSinAlphaEm = Math.log(Math.max(Math.sin(inv1.alpha), 1e-300)) + inv1.m;
  lnMuParts[0] = lnSinAlphaEm - Math.log(Math.max(sinD, 1e-300));
  lnMuParts[1] = lnSinAlphaEm;
  lnMuParts[2] = off < 1e-6 ? (off * off) / 6 : Math.log(off / sinD);
}

/** The segment [ψ_i, ψ_{i+1}) holding ψ (nodes ascending; the last segment holds π), by bisection. */
function segmentOf(nodes: Float64Array, psi: number): number {
  if (!(psi > nodes[0])) return 0;
  if (psi >= nodes[PSI_NODES - 2]) return PSI_NODES - 2;
  let lo = 0;
  let hi = PSI_NODES - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid] <= psi) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** −ln of the finite-distance factor c − x e^m (x = b_max/r_s), or +∞ when it is under 0.1 (then no bound is claimed). */
function finiteLn(x: number, m: number): number {
  const c = x < 1 ? Math.sqrt((1 - x) * (1 + x)) : 0;
  const den = c - x * Math.exp(m);
  return den > 0.1 ? -Math.log(den) : Infinity;
}

/**
 * The most the parallax can raise ln(sin α e^m) above its value for a source at infinity: the image of a source at
 * r_s from the hole is where the sweep is D + Λ (Λ = asin(b/r_s) ≤ asin(x)), and ln(sin α e^m) changes along D at a
 * rate of at most about 1 (the photon ring's log spiral), or 1/D where the image nears the view straight away from
 * the hole (there Λ ≈ x D): twice asin(x) covers both.
 */
function parallaxLn(x: number): number {
  return x < 1 ? 2 * Math.asin(x) : Infinity;
}

/** Buckets of the magnification a star needs (ln μ from REQ_MIN to REQ_MAX) for the quick test, and their width. */
const REQ_BUCKETS = 1024;
const REQ_MIN = -2;
const REQ_MAX = 64;
const REQ_STEP = (REQ_MAX - REQ_MIN) / REQ_BUCKETS;

/** The inverse table's values a scan keeps as they were when it started (the lens's own is rebuilt in place). */
function copyInverse(from: InverseTable, to: InverseTable | null, version: number): InverseTable {
  const same = (a: Float64Array, b: Float64Array | undefined): Float64Array => {
    if (b && b.length === a.length) {
      b.set(a);
      return b;
    }
    return new Float64Array(a);
  };
  return {
    fwd: { ...from.fwd },
    thetaE: from.thetaE,
    z0: from.z0,
    dz: from.dz,
    n: from.n,
    y: same(from.y, to?.y),
    m: same(from.m, to?.m),
    rel: { d0: from.rel.d0, dd: from.rel.dd, n: from.rel.n, y: same(from.rel.y, to?.rel.y), m: same(from.rel.m, to?.rel.m) },
    version,
  };
}
let scanVersion = 0;

/**
 * One list being made: the lens as it was when the scan started (the inverse table, the
 * pre-cull's bound and the axis copied), a cursor over the cells, and the stars collected so far. step(maxMs)
 * carries on for about that long and returns the finished list (a view into the scan's own buffer, at most
 * CANDIDATE_CAP long) or null while it is not finished: the star field spreads a list over frames with it, so a
 * rebuild never stops a frame. candidateList runs one to the end at once.
 *
 * Per node of the tree (a level-3 node, 64 cells, at a time between looks at the clock): the least bound any of
 * its stars can have (its brightest star's magnitude from the hole, the stars' drift since binning, and the
 * largest magnification over the node's angles from the axis, with Gould's cap, the finite distance and the
 * parallax); above the cells, and where the node's angles hold a caustic, its quarters are read the same way;
 * otherwise its leaves are read star by star, brightest first, each left at the first star too faint for the
 * node's bound. Per star, before its bound: a quick test of its angle from the axes (its direction from the hole
 * when binned, less the drift) against the angle within which the magnification could reach what that star needs
 * (the magnification is largest at the caustics and falls away from them).
 */
export class ListScan {
  readonly order: ImageOrder;
  /** The finished list's buffer (the list is out.subarray(0, length)). */
  private out = new Uint32Array(0);
  private length = 0;
  private bins: HoleBins | null = null;
  private inv: InverseTable | null = null;
  private muBound = new Float32Array(0);
  private lnPsiMin = 0;
  private invDelta = 0;
  private ax = 0;
  private ay = 0;
  private az = 0;
  private ro = 0;
  private bSlope = 1;
  private framePhi = 0;
  private axisSlack = 0;
  private epoch: StarEpoch = { years: 0, retarded: false, camPc: { x: 0, y: 0, z: 0 } };
  private drift = 0;
  private boostLn = 0;
  private expoMag = 0;
  private cut = 0;
  private mTop = 0;
  /** ln μ∞ over the ψ nodes, and each segment's bound. */
  private t = new Float64Array(PSI_NODES);
  private segBound = new Float64Array(PSI_NODES - 1);
  private scratch = new Float64Array(PSI_NODES - 1);
  /** The quick test: per bucket of needed ln μ, the cosines of the widest angle from each axis that can pass. */
  private cosRear = new Float64Array(REQ_BUCKETS);
  private cosFront = new Float64Array(REQ_BUCKETS);
  /** Order 0: the pre-cull's bound, the largest over every node from ψ's on (node values need not fall with ψ). */
  private suffixMax = new Float64Array(64);
  /** The node being read: its offsets (nodeOffsets), and the walk's stack of nodes still to read. */
  private off = 0;
  private straightOff = 0;
  private reqOff = 0;
  private caustic = false;
  private stack = new Int32Array(64);
  /** The next level-3 node to read (0 … SLICE_NODES). */
  private slice = 0;
  private n = 0;
  private collectIdx = new Uint32Array(1024);
  private collectMag = new Float32Array(1024);
  private running = false;
  /** What the last list read: nodes tested, stars read and stars whose bound was worked out (tests, and the header's costs). */
  readonly stats = { nodes: 0, stars: 0, bounds: 0 };

  constructor(order: ImageOrder) {
    this.order = order;
  }

  /** Whether a list is being made. */
  get busy(): boolean {
    return this.running;
  }

  /**
   * Start a list of the stars of this order that could show for the lens `view`, the eye's limit `magLimit` and
   * the largest brightening by Doppler shift and gravity `maxBoostMag` (magnitudes); an unfinished one is dropped.
   * False (and nothing started) when the bins are not ready or there is no lens.
   */
  start(bins: HoleBins, magLimit: number, maxBoostMag: number, view: CandidateView): boolean {
    this.running = false;
    if (!bins.ready || !(view.inv.thetaE > 0)) return false;
    this.bins = bins;
    const inv = (this.inv = copyInverse(view.inv, this.inv, ++scanVersion));
    if (this.muBound.length !== view.muBound.length) this.muBound = new Float32Array(view.muBound.length);
    this.muBound.set(view.muBound);
    this.lnPsiMin = view.lnPsiMin;
    this.invDelta = view.invDelta;
    this.ax = view.axis.x;
    this.ay = view.axis.y;
    this.az = view.axis.z;
    const ro = (this.ro = view.rPc);
    this.bSlope = view.bSlope;
    this.framePhi = view.framePhi;
    this.axisSlack = Math.max(0, view.axisSlackRad ?? 0);
    // The camera, in the stars' frame: the hole less the camera → hole vector.
    const e = this.epoch;
    e.years = view.years;
    e.retarded = view.retarded;
    const cam = e.camPc;
    cam.x = bins.holePc.x - this.ax * ro;
    cam.y = bins.holePc.y - this.ay * ro;
    cam.z = bins.holePc.z - this.az * ro;
    this.drift = binsDrift(bins, e);
    this.boostLn = Math.max(0, maxBoostMag) / MAG_PER_LN;
    this.expoMag = -MAG_PER_LN * Math.max(0, view.lnExposure);
    this.cut = magLimit + 0.5 + MARGIN_MAG;
    // The magnification of a source at infinity over the nodes, and the largest m the table holds (with a little
    // for the spline between nodes: a bound on e^m for the finite-distance factor).
    const nodes = psiNodes();
    for (let i = 0; i < PSI_NODES; i++) {
      lnMuInf(inv, sweepOf(this.order, nodes[i]));
      this.t[i] = lnMuParts[0];
    }
    let m = -Infinity;
    for (const a of [inv.m, inv.rel.m]) for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    this.mTop = m + 0.01;
    // The quick test's angles, widened by the stars' drift since binning and a microradian for float32.
    const slack = (bins.minRPc > this.drift ? Math.asin(Math.min(1, this.drift / (bins.minRPc - this.drift))) : Math.PI) + this.axisSlack + 1e-6;
    this.fillQuickTest(slack);
    if (this.order === 0) {
      const nb = Math.min(this.muBound.length, this.suffixMax.length);
      let s = -Infinity;
      for (let i = nb - 1; i >= 0; i--) this.suffixMax[i] = s = Math.max(s, this.muBound[i]);
    }
    this.slice = 0;
    this.stats.nodes = 0;
    this.stats.stars = 0;
    this.stats.bounds = 0;
    this.n = 0;
    this.running = true;
    return true;
  }

  /** Carry on for about maxMs; the finished list, or null while unfinished (or when nothing was started). */
  step(maxMs: number): Uint32Array | null {
    if (!this.running) return null;
    const t0 = performance.now();
    while (this.slice < SLICE_NODES) {
      this.scanTree(FIRST_SLICE_NODE + this.slice++);
      if (this.slice < SLICE_NODES && performance.now() - t0 > maxMs) return null;
    }
    this.running = false;
    this.finish();
    return this.list();
  }

  /** The last finished list (empty before the first). */
  list(): Uint32Array {
    return this.out.subarray(0, this.length);
  }

  /** The largest ln μ∞ over ψ ∈ [a, b]: the segments' bounds (+∞ over a segment holding a caustic). */
  private lnMuMax(a: number, b: number): number {
    const nodes = psiNodes();
    const lo = segmentOf(nodes, a);
    const hi = segmentOf(nodes, b);
    let best = -Infinity;
    for (let i = lo; i <= hi; i++) if (this.segBound[i] > best) best = this.segBound[i];
    return best;
  }

  /**
   * The segments' bounds (the larger node value plus 0.01: the magnification falls away from each caustic, so
   * within a segment it is largest at an end; +∞ at ψ = 0 for every order and at ψ = π for orders ≥ 1), then per
   * bucket of needed ln μ the widest angle from the rear axis, and from the forward one, of a passing segment.
   */
  private fillQuickTest(slackRad: number): void {
    const nodes = psiNodes();
    const nSeg = PSI_NODES - 1;
    const half = nSeg >> 1;
    const seg = this.segBound;
    const t = this.t;
    for (let i = 0; i < nSeg; i++) seg[i] = Math.max(t[i], t[i + 1]) + 0.01;
    seg[0] = Infinity;
    if (this.order >= 1) seg[nSeg - 1] = Infinity;
    const P = this.scratch;
    // Rear half: the last segment that passes, from the suffix maximum (which falls as i grows).
    let s = -Infinity;
    for (let j = half - 1; j >= 0; j--) P[j] = s = Math.max(s, seg[j]);
    let i = half - 1;
    for (let r = 0; r < REQ_BUCKETS; r++) {
      const req = REQ_MIN + r * REQ_STEP;
      while (i > 0 && !(P[i] >= req)) i--;
      this.cosRear[r] = Math.cos(Math.min(Math.PI, nodes[i + 1] + slackRad));
    }
    // Front half: the first segment that passes, from the prefix maximum (which grows with i).
    s = -Infinity;
    for (let j = half; j < nSeg; j++) P[j] = s = Math.max(s, seg[j]);
    i = half;
    for (let r = 0; r < REQ_BUCKETS; r++) {
      const req = REQ_MIN + r * REQ_STEP;
      while (i < nSeg && !(P[i] >= req)) i++;
      this.cosFront[r] = i < nSeg ? Math.cos(Math.max(0, nodes[i] - slackRad)) : -2;
    }
  }

  /**
   * Node k's offsets, into this.off (the least any of its stars' bounds can be, less its magnitude from the hole
   * when binned), this.straightOff (order 0: the same for the star drawn straight) and this.reqOff (the quick
   * test's); false when not even its brightest star can pass.
   */
  private nodeOffsets(k: number): boolean {
    const T = (this.bins as HoleBins).tree;
    const { ax, ay, az, ro, cut } = this;
    this.stats.nodes++;
    const rMin = T.minRPc[k] - this.drift;
    const spread = T.radius[k] + (rMin > 0 ? Math.asin(Math.min(1, this.drift / rMin)) : Math.PI) + this.axisSlack;
    const psiC = angleBetween(T.dir[3 * k], T.dir[3 * k + 1], T.dir[3 * k + 2], ax, ay, az);
    const psiLo = Math.max(0, psiC - spread);
    const psiHi = Math.min(Math.PI, psiC + spread);
    // The stars may have come nearer the hole since binning (driftMag), and each order's magnification is at most
    // its largest over the node's angles from the axis (a point's, with Gould's cap, the finite distance and the
    // parallax).
    const driftMag = rMin > 0 ? 5 * Math.log10(rMin / (rMin + this.drift)) : -Infinity;
    const x = rMin > 0 ? (this.bSlope * ro) / rMin : Infinity;
    const extraLn = LN_B0_MAX + finiteLn(x, this.mTop) + parallaxLn(x) + this.boostLn;
    const lnMu = this.lnMuMax(psiLo, psiHi);
    this.caustic = lnMu === Infinity;
    const lensedOff = driftMag + this.expoMag - MAG_PER_LN * (lnMu + extraLn);
    // A star with m_hole m can pass lensed only with a magnification of at least m/MAG_PER_LN + reqOff (ln μ∞);
    // order 0 is also drawn straight, bright enough when m + straightOff passes.
    this.reqOff = (driftMag + this.expoMag - cut) / MAG_PER_LN - extraLn;
    let straightOff = Infinity;
    let off: number;
    if (this.order === 0) {
      // From the camera: no nearer than r_s − r_o, and at the smallest straight-line angle from the axis. Drawn
      // straight (μ = 1) or lensed, whichever is brighter, and never past the pre-cull.
      if (rMin > ro * 1.000001) {
        const camOff = driftMag + 5 * Math.log10((rMin - ro) / rMin) + this.expoMag;
        const psiCam = Math.max(0, Math.atan2(rMin * Math.sin(psiLo), ro + rMin * Math.cos(psiLo)) - 1.01 * this.framePhi - this.axisSlack);
        const nb = Math.min(this.muBound.length, this.suffixMax.length);
        let node = Math.floor((Math.log(Math.max(psiCam, 1e-300)) - this.lnPsiMin) * this.invDelta);
        if (!(node >= 0)) node = 0;
        if (node > nb - 1) node = nb - 1;
        const preOff = camOff - MAG_PER_LN * (this.suffixMax[node] + this.boostLn);
        straightOff = camOff - MAG_PER_LN * this.boostLn;
        off = Math.max(preOff, Math.min(straightOff, lensedOff));
      } else {
        off = -Infinity;
        straightOff = -Infinity;
      }
    } else off = lensedOff;
    this.off = off;
    this.straightOff = straightOff;
    return T.minMag[k] + off <= cut;
  }

  /**
   * The stars of the tree at `root` (a cell's) that could pass: its nodes tested from the root down, a node that
   * cannot pass left with all below it. A node whose angles from the axis hold a caustic (where the bound of a
   * point's magnification is unlimited) is read through its quarters, whose narrower angles bound it again; any
   * other has its leaves' stars read one by one against its own bound (testing its quarters would cost more than
   * it saves).
   */
  private scanTree(root: number): void {
    const T = (this.bins as HoleBins).tree;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = root;
    while (sp > 0) {
      const k = stack[--sp];
      if (T.count[k] === 0 || !this.nodeOffsets(k)) continue;
      const c = T.child[k];
      if (c >= 0 && (k < FIRST_CELL_NODE || this.caustic)) {
        stack[sp++] = c;
        stack[sp++] = c + 1;
        stack[sp++] = c + 2;
        stack[sp++] = c + 3;
      } else this.scanLeaves(k);
    }
  }

  /** The stars of every leaf below node k (k's run, in its leaves' runs, each brightest first) against k's offsets. */
  private scanLeaves(k: number): void {
    const T = (this.bins as HoleBins).tree;
    const c = T.child[k];
    if (c < 0) this.scanStars(T.start[k], T.start[k] + T.count[k]);
    else for (let q = 0; q < 4; q++) if (T.count[c + q] > 0) this.scanLeaves(c + q);
  }

  /** The stars of the run [s0, e0) of `order` (brightest first) against the offsets of their node (nodeOffsets). */
  private scanStars(s0: number, e0: number): void {
    const bins = this.bins as HoleBins;
    const { ax, ay, az, cut, off, straightOff, reqOff } = this;
    const dirs = bins.orderDir;
    const stats = this.stats;
    for (let k = s0; k < e0; k++) {
      const mk = bins.orderMag[k];
      stats.stars++;
      // Brightest first: once a star's own bound from the node's cannot pass, none after it can.
      if (!(mk + off <= cut)) break;
      // The quick test: too far from both axes for the magnification it needs (and not bright drawn straight).
      if (!(mk + straightOff <= cut)) {
        const req = mk / MAG_PER_LN + reqOff;
        if (req >= REQ_MIN) {
          const r = Math.min(REQ_BUCKETS - 1, Math.floor((req - REQ_MIN) / REQ_STEP));
          const cz = dirs[3 * k] * ax + dirs[3 * k + 1] * ay + dirs[3 * k + 2] * az;
          if (cz < this.cosRear[r] && cz > this.cosFront[r]) continue;
        }
      }
      const i = bins.order[k];
      stats.bounds++;
      const bound = this.starBound(i);
      if (!(bound <= cut)) continue;
      if (this.n >= this.collectIdx.length) {
        const bi = new Uint32Array(this.collectIdx.length * 2);
        bi.set(this.collectIdx);
        this.collectIdx = bi;
        const bm = new Float32Array(this.collectMag.length * 2);
        bm.set(this.collectMag);
        this.collectMag = bm;
      }
      this.collectIdx[this.n] = i;
      this.collectMag[this.n] = bound;
      this.n++;
    }
  }

  /** The collected stars into the list, capped at the brightest 20,000 by their bound (rare: fast flight near a hole). */
  private finish(): void {
    let n = this.n;
    const want = Math.min(n, CANDIDATE_CAP);
    if (this.out.length < want) this.out = new Uint32Array(Math.min(CANDIDATE_CAP, Math.max(want, 2 * this.out.length, 256)));
    if (n > CANDIDATE_CAP) {
      const mags = this.collectMag;
      const idx = Array.from({ length: n }, (_, k) => k).sort((a, b) => mags[a] - mags[b]);
      for (let k = 0; k < CANDIDATE_CAP; k++) this.out[k] = this.collectIdx[idx[k]];
      n = CANDIDATE_CAP;
    } else this.out.set(this.collectIdx.subarray(0, n));
    this.length = n;
  }

  /**
   * A star's bound magnitude for this order (the least the GPU can draw it at, the Doppler and gravity bound taken
   * off): see the module's header. +∞ for a hidden star. Order 0: the pre-cull of shaders/stars.vert.glsl (a star
   * it culls is never drawn: its value is returned as it is when over the cut), and past it the brighter of the
   * image drawn straight (μ = 1) and the lensed image's bound.
   */
  private starBound(i: number): number {
    const bins = this.bins as HoleBins;
    const src = bins.source;
    const M = absMagOf(src, i);
    if (Number.isNaN(M)) return Infinity;
    const d = starRel(src, i, this.epoch, rel3);
    const { ax, ay, az, ro } = this;
    let pre = -Infinity;
    let straight = Infinity;
    if (this.order === 0) {
      const mag = M + 5 * Math.log10(d) - 5 + this.expoMag;
      const psi = Math.max(angleBetween(rel3[0], rel3[1], rel3[2], ax, ay, az) - 1.01 * this.framePhi - this.axisSlack, 0);
      pre = mag - MAG_PER_LN * (muBoundEval(this.muBound, this.lnPsiMin, this.invDelta, psi) + this.boostLn);
      if (!(pre <= this.cut)) return pre;
      straight = mag - MAG_PER_LN * this.boostLn;
    }
    // From the hole: its direction and distance.
    const sx = rel3[0] - ax * ro;
    const sy = rel3[1] - ay * ro;
    const sz = rel3[2] - az * ro;
    const rs = Math.max(Math.hypot(sx, sy, sz), 1e-12);
    // Its angle from the rear axis at the hole, moved by the axis's allowance towards the nearer caustic (behind
    // the hole for order 0; either for the others), where the magnification is larger.
    const psiH = angleBetween(sx, sy, sz, ax, ay, az);
    const toward = this.order >= 1 && psiH > 0.5 * Math.PI ? Math.min(Math.PI, psiH + this.axisSlack) : Math.max(0, psiH - this.axisSlack);
    lnMuInf(this.inv as InverseTable, sweepOf(this.order, toward));
    // Gould's cap: μB0 = z|μ| · B0/z ≤ 2 z|μ|, z = |D − nπ| r_s/R★ (R★ from the star's M_V and temperature).
    const teff = src.teff && src.teff[i] > 0 ? src.teff[i] : 5772;
    const rStarPc = starRadiusRsun(M, teff) * RSUN_PC;
    const lnCap = Math.log(rs / Math.max(rStarPc, 1e-300)) + lnMuParts[1] + lnMuParts[2] + Math.LN2;
    const x = (this.bSlope * ro) / rs;
    const lnMuB0 = Math.min(lnMuParts[0] + LN_B0_MAX, lnCap) + finiteLn(x, inv1.m) + parallaxLn(x);
    const mHole = M + 5 * Math.log10(rs) - 5;
    const lensed = mHole + this.expoMag - MAG_PER_LN * (lnMuB0 + this.boostLn);
    return this.order === 0 ? Math.max(pre, Math.min(straight, lensed)) : lensed;
  }
}

/** The scans candidateList runs to the end at once, one per order. */
const syncScans = [new ListScan(0), new ListScan(1), new ListScan(2), new ListScan(3)];

/**
 * The stars of order `order` that could show, for the lens `view` this frame: cells whose
 * bound lets their brightest star pass the eye's limit `magLimit` + 0.5 with the largest brightening by Doppler
 * shift and gravity `maxBoostMag` (magnitudes), then the same bound star by star (see ListScan); capped at the
 * brightest 20,000 by the bound. Empty until the bins are ready or without a view. All at once (the nuclear
 * cluster's lists and tests; the star field spreads its own over frames with a ListScan). Returns a view into a
 * buffer reused for that order (it changes when the list is made again).
 */
export function candidateList(bins: HoleBins, order: ImageOrder, magLimit: number, maxBoostMag: number, view?: CandidateView): Uint32Array {
  const scan = syncScans[order];
  if (!view || !scan.start(bins, magLimit, maxBoostMag, view)) return new Uint32Array(0);
  return scan.step(Infinity) as Uint32Array;
}
