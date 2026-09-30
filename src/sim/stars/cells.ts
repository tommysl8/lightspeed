/**
 * Cells: small groups of neighbouring stars, each sorted by absolute magnitude, so a draw needs only the first
 * few stars of each cell (render cost, not physics: what is drawn is what drawing them all shows).
 *
 * A star shows only while its apparent magnitude from the camera, M_V + 5 log10(d / 10 pc), is under the star
 * shader's cut (the eye's limit plus the fade, render/shaders/stars.vert.glsl). Every star of a cell is at least
 * as far as the nearest point of the cell's box, so of a cell sorted by M_V only the prefix with
 * M_V ≤ cut − 5 log10(d_min / 10 pc) can show: the rest are never drawn.
 *
 * The box moves with the date as the shader moves the stars: each star at its J2000 place plus its velocity times
 * (years + its light-time from the Sun), years held to ±1 Myr (motion.ts). With linear motion, every coordinate at
 * a date is the same blend (1 − f) p₀ + f p₁ of its values at J2000 and at ±1 Myr (f = |years| / 1 Myr), so the
 * box at a date lies inside the same blend of the two boxes: exact bounds at any date, from three boxes a cell.
 * The light-time correction from the camera (stars drawn where the camera sees them) brings a star at most v/c of
 * its distance nearer: d_min is shrunk by the cell's fastest star's v/c.
 *
 * Used by the head (the core and the pinned stars, cells made in the star worker) and by the band files of the
 * catalogue's extension (cells stored in the files: extension.ts). Twins: render/shaders/stars.vert.glsl (the cut
 * and the motion), visibility.ts (the same bound over the whole catalogue).
 */
import { C_PC_PER_YR, KMS_TO_PC_PER_YR, MOTION_VALID_YEARS } from './constants';

/** Stars a cell holds at most (the octree splits beyond). */
export const CELL_STARS = 512;
/** The shader drops a star at the eye's limit + the fade (STAR_FADE_MAG 0.5) + float headroom (0.02), magnitudes. */
export const CUT_ABOVE_LIMIT = 0.52;

export interface StarCells {
  /** Number of cells. */
  count: number;
  /**
   * Star index (into the arrays the cells were made from) of each entry, cell after cell, each cell brightest
   * (lowest M_V) first; null when the arrays are in that order already (the band files).
   */
  order: Uint32Array | null;
  /** First entry of each cell, and the end (count + 1 values). */
  start: Uint32Array;
  /** M_V × 100 of each entry, ascending within each cell. */
  mag: Int16Array;
  /** Per cell, 18 floats (pc, J2000 ecliptic): the box at J2000 (lo x y z, hi x y z), at +1 Myr, at −1 Myr. */
  box: Float32Array;
  /** Per cell: the fastest star's speed as a fraction of c. */
  beta: Float32Array;
}

/** What cells are made from (a catalogue's typed arrays). */
export interface CellSource {
  positions: Float32Array;
  velocitiesInt16: Int16Array;
  velocityUnitKms: number;
  absMagInt16: Int16Array;
}

/** The three boxes and the fastest speed of the stars order[a..b) (or a..b when order is null). */
function boxOf(src: CellSource, order: Uint32Array | null, a: number, b: number, box: Float32Array, beta: Float32Array, c: number): void {
  const P = src.positions;
  const V = src.velocitiesInt16;
  const kv = src.velocityUnitKms * KMS_TO_PC_PER_YR;
  const o = 18 * c;
  for (let k = 0; k < 3; k++) {
    box[o + k] = box[o + 6 + k] = box[o + 12 + k] = Infinity;
    box[o + 3 + k] = box[o + 9 + k] = box[o + 15 + k] = -Infinity;
  }
  let vmax = 0;
  for (let q = a; q < b; q++) {
    const i = order ? order[q] : q;
    const x = P[3 * i];
    const y = P[3 * i + 1];
    const z = P[3 * i + 2];
    const lt = Math.sqrt(x * x + y * y + z * z) / C_PC_PER_YR;
    for (let k = 0; k < 3; k++) {
      const v = V[3 * i + k] * kv;
      const p0 = P[3 * i + k] + v * lt;
      const pP = p0 + v * MOTION_VALID_YEARS;
      const pM = p0 - v * MOTION_VALID_YEARS;
      if (p0 < box[o + k]) box[o + k] = p0;
      if (p0 > box[o + 3 + k]) box[o + 3 + k] = p0;
      if (pP < box[o + 6 + k]) box[o + 6 + k] = pP;
      if (pP > box[o + 9 + k]) box[o + 9 + k] = pP;
      if (pM < box[o + 12 + k]) box[o + 12 + k] = pM;
      if (pM > box[o + 15 + k]) box[o + 15 + k] = pM;
    }
    const vx = V[3 * i];
    const vy = V[3 * i + 1];
    const vz = V[3 * i + 2];
    const s = Math.sqrt(vx * vx + vy * vy + vz * vz) * src.velocityUnitKms;
    if (s > vmax) vmax = s;
  }
  // Headroom for the shader's float32 arithmetic: a millionth of the distance, outward.
  for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) {
      const lo = o + 6 * j + k;
      const hi = lo + 3;
      const m = 1e-6 * Math.max(Math.abs(box[lo]), Math.abs(box[hi])) + 1e-9;
      box[lo] -= m;
      box[hi] += m;
    }
  beta[c] = Math.min(0.5, (vmax / 299792.458) * 1.001);
}

/** Cells over stars already in cell order, from each cell's star count (a band file). */
export function cellsFromCounts(src: CellSource, counts: ArrayLike<number>): StarCells {
  const n = counts.length;
  const start = new Uint32Array(n + 1);
  for (let c = 0; c < n; c++) start[c + 1] = start[c] + counts[c];
  const box = new Float32Array(18 * n);
  const beta = new Float32Array(n);
  for (let c = 0; c < n; c++) boxOf(src, null, start[c], start[c + 1], box, beta, c);
  return { count: n, order: null, start, mag: src.absMagInt16, box, beta };
}

/**
 * Cells over the stars of a catalogue (the head, in the star worker): an octree over their J2000 places with
 * leaves of at most CELL_STARS stars, each leaf sorted by M_V. About 30 ms for 334,000 stars.
 */
export function buildCells(src: CellSource, count: number, cap = CELL_STARS): StarCells {
  const P = src.positions;
  const M = src.absMagInt16;
  const leaves: Uint32Array[] = [];
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], P[3 * i + k]);
      hi[k] = Math.max(hi[k], P[3 * i + k]);
    }
  const half = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + 1;
  // The root's centre off the Sun, so the Sun is not on the corner of eight cells at every level.
  const c0 = [0, 1, 2].map((k) => 0.5 * (lo[k] + hi[k]) + 0.123);
  lo = c0.map((x) => x - half);
  hi = c0.map((x) => x + half);
  const all = new Uint32Array(count);
  for (let i = 0; i < count; i++) all[i] = i;
  const stack: [Uint32Array, number[], number[], number][] = [[all, lo, hi, 0]];
  while (stack.length) {
    const [list, a, b, depth] = stack.pop()!;
    if (list.length <= cap || depth > 40) {
      leaves.push(list);
      continue;
    }
    const c = [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])];
    const sizes = new Uint32Array(8);
    const which = new Uint8Array(list.length);
    for (let q = 0; q < list.length; q++) {
      const i = list[q];
      const w = (P[3 * i] >= c[0] ? 1 : 0) | (P[3 * i + 1] >= c[1] ? 2 : 0) | (P[3 * i + 2] >= c[2] ? 4 : 0);
      which[q] = w;
      sizes[w]++;
    }
    const parts = Array.from(sizes, (s) => new Uint32Array(s));
    const fill = new Uint32Array(8);
    for (let q = 0; q < list.length; q++) parts[which[q]][fill[which[q]]++] = list[q];
    for (let w = 7; w >= 0; w--)
      if (parts[w].length)
        stack.push([parts[w], [0, 1, 2].map((k) => ((w >> k) & 1 ? c[k] : a[k])), [0, 1, 2].map((k) => ((w >> k) & 1 ? b[k] : c[k])), depth + 1]);
  }
  const n = leaves.length;
  const order = new Uint32Array(count);
  const start = new Uint32Array(n + 1);
  const mag = new Int16Array(count);
  let q = 0;
  // Each leaf by M_V, then index: one numeric key a star, (M + 32768) · 2²⁰ + index, sorted natively.
  const TWO20 = 1 << 20;
  leaves.forEach((leaf, c) => {
    const keys = new Float64Array(leaf.length);
    for (let k = 0; k < leaf.length; k++) keys[k] = (M[leaf[k]] + 32768) * TWO20 + leaf[k];
    keys.sort();
    start[c] = q;
    for (let k = 0; k < keys.length; k++) {
      const i = keys[k] % TWO20;
      order[q] = i;
      mag[q] = M[i];
      q++;
    }
  });
  start[n] = q;
  const box = new Float32Array(18 * n);
  const beta = new Float32Array(n);
  for (let c = 0; c < n; c++) boxOf(src, order, start[c], start[c + 1], box, beta, c);
  return { count: n, order, start, mag, box, beta };
}

/** The typed arrays of a cell set, for handing it between threads. */
export function cellsTransfer(c: StarCells): ArrayBuffer[] {
  const out = [c.start.buffer, c.box.buffer, c.beta.buffer] as ArrayBuffer[];
  if (c.order) out.push(c.order.buffer as ArrayBuffer, c.mag.buffer as ArrayBuffer);
  return out;
}

/** Distance from (x, y, z) to cell c's box at `years` from J2000 (held to ±1 Myr), less the light-time allowance; pc. */
export function cellDistance(cells: StarCells, c: number, x: number, y: number, z: number, years: number): number {
  const B = cells.box;
  const o = 18 * c;
  const f = Math.min(1, Math.abs(years) / MOTION_VALID_YEARS);
  const e = years >= 0 ? o + 6 : o + 12;
  const g = 1 - f;
  const dx = Math.max(0, g * B[o] + f * B[e] - x, x - g * B[o + 3] - f * B[e + 3]);
  const dy = Math.max(0, g * B[o + 1] + f * B[e + 1] - y, y - g * B[o + 4] - f * B[e + 4]);
  const dz = Math.max(0, g * B[o + 2] + f * B[e + 2] - z, z - g * B[o + 5] - f * B[e + 5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * (1 - cells.beta[c]);
}

/** Cell c's box at a date, years from J2000 (held to ±1 Myr) into out: lo x y z, hi x y z. */
export function cellBoxAt(cells: StarCells, c: number, years: number, out: Float64Array): Float64Array {
  const B = cells.box;
  const o = 18 * c;
  const f = Math.min(1, Math.abs(years) / MOTION_VALID_YEARS);
  const e = years >= 0 ? o + 6 : o + 12;
  for (let k = 0; k < 6; k++) out[k] = (1 - f) * B[o + k] + f * B[e + k];
  return out;
}

/** How many of cell c's first stars have M_V × 100 ≤ lim100. */
export function cellPrefix(cells: StarCells, c: number, lim100: number): number {
  const M = cells.mag;
  let lo = cells.start[c];
  let hi = cells.start[c + 1];
  const a = lo;
  if (hi === lo || M[lo] > lim100) return 0;
  if (M[hi - 1] <= lim100) return hi - lo;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (M[mid] <= lim100) lo = mid + 1;
    else hi = mid;
  }
  return lo - a;
}

/** The faintest M_V that can show from distance d with the cut at `cut` (apparent magnitude). */
export const reachMag = (cut: number, d: number): number => cut - 5 * Math.log10(Math.max(d, 1e-9) / 10);

/**
 * The prefix of every cell for a camera at (x, y, z) pc, `years` from J2000, stars shown to apparent magnitude `cut`
 * (limit + CUT_ABOVE_LIMIT + any brightening), into counts; `extraRaise(c)`, when given, raises one cell's cut
 * further (a lens's magnification bound). Returns the total.
 */
export function cellPrefixes(
  cells: StarCells,
  x: number,
  y: number,
  z: number,
  years: number,
  cut: number,
  counts: Uint32Array,
  extraRaise?: (c: number) => number,
): number {
  let total = 0;
  for (let c = 0; c < cells.count; c++) {
    const d = cellDistance(cells, c, x, y, z, years);
    const m = reachMag(cut + (extraRaise ? extraRaise(c) : 0), d);
    const n = m >= 327 ? cells.start[c + 1] - cells.start[c] : cellPrefix(cells, c, Math.floor(m * 100));
    counts[c] = n;
    total += n;
  }
  return total;
}

/** Write the star indices of every cell's prefix (counts) into out from `at`; returns the new end. */
export function fillCellIndex(cells: StarCells, counts: Uint32Array, out: Uint32Array, at = 0, offset = 0): number {
  let q = at;
  const order = cells.order;
  for (let c = 0; c < cells.count; c++) {
    const n = counts[c];
    if (!n) continue;
    const s = cells.start[c];
    if (order) for (let k = 0; k < n; k++) out[q++] = order[s + k] + offset;
    else for (let k = 0; k < n; k++) out[q++] = s + k + offset;
  }
  return q;
}
