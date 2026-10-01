/**
 * The octree and its glows: every galaxy is kept once, each node a random sample of its cube; and whatever the
 * selection draws, the drawn galaxies plus the glows of the octants not drawn hold the light of the whole catalogue
 * (to float32 rounding, far inside the 1 % asked for), in the tiles as shipped too.
 */
import { describe, expect, it } from 'vitest';
import { buildOctree, nodeBytes, seeded, type TileInput } from './tile';
import { decodeHierarchy, decodeNode, encodeHierarchy, stratifiedOrder, GLOW_FLOATS, HIERARCHY_FILE, kindClass, mapLightOfByte, nodeFile, packKind, SURVEY_CLASSES, type SurveyNode } from './format';
import { glowList, MIN_NODE_FRACTION, nodeSizePx, SPREAD, selectGlows, selectNodes, type LodView } from './lod';
import { glowDepth, mapDepth, mapDepthMpc } from '../../render/galaxyMap';
import { fileExists, fileSize, readBytes } from '../../test/files';

const zlib = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:zlib') as { gunzipSync(b: Uint8Array): Uint8Array };

/** A catalogue like the surveys': thin cones from the Sun, denser near it, with clumps. */
function catalogue(n: number, seed: number): TileInput {
  const rand = seeded(seed);
  const pos = new Float64Array(3 * n);
  const kind = new Uint8Array(n);
  const lum = new Uint8Array(n);
  const clumps = Array.from({ length: 40 }, () => [rand() * 2 - 1, rand() * 0.6 + 0.4, rand() * 2 - 1, 30 + rand() * 3000]);
  for (let i = 0; i < n; i++) {
    let x: number;
    let y: number;
    let z: number;
    if (i % 3 === 0) {
      const c = clumps[i % clumps.length];
      const s = 0.01 * c[3];
      x = (c[0] / Math.hypot(c[0], c[1], c[2])) * c[3] + s * (rand() - 0.5);
      y = (c[1] / Math.hypot(c[0], c[1], c[2])) * c[3] + s * (rand() - 0.5);
      z = (c[2] / Math.hypot(c[0], c[1], c[2])) * c[3] + s * (rand() - 0.5);
    } else {
      const d = 20 + 7000 * rand() ** 1.5;
      const u = [rand() - 0.5, 0.3 + rand(), rand() - 0.5];
      const l = Math.hypot(u[0], u[1], u[2]);
      x = (u[0] / l) * d;
      y = (u[1] / l) * d;
      z = (u[2] / l) * d;
    }
    pos[3 * i] = x;
    pos[3 * i + 1] = y;
    pos[3 * i + 2] = z;
    kind[i] = packKind(Math.floor(rand() * 4), Math.floor(rand() * 10));
    lum[i] = Math.floor(rand() * 120);
  }
  return { count: n, pos, kind, lum };
}

const lightOf = (input: TileInput, i: number) => mapLightOfByte(input.lum[i]);

describe('the octree', () => {
  const input = catalogue(40_000, 11);
  const built = buildOctree(input, 5, 1000);
  const h = decodeHierarchy(encodeHierarchy(built.map((n) => ({ ...n, points: n.points.length, fileBytes: 0 })), input.count, [input.count]));

  it('keeps every galaxy once, and fills a node before its children', () => {
    const seen = new Uint8Array(input.count);
    for (const n of built) for (const i of n.points) seen[i]++;
    expect([...seen].every((s) => s === 1)).toBe(true);
    for (const n of built) if (n.childMask) expect(n.points.length).toBe(1000);
    expect(built[0].subtree).toBe(input.count);
    expect(h.nodes.map((n) => n.path)).toEqual(built.map((n) => n.path));
  });

  it('keeps in each node a fair sample of its cube (the root holds its share of every region)', () => {
    // The root's galaxies, by distance, in proportion to the whole catalogue's (a random sample).
    const edges = [0, 1000, 3000, 8000];
    const all = [0, 0, 0];
    const root = [0, 0, 0];
    const bin = (i: number) => {
      const d = Math.hypot(input.pos[3 * i], input.pos[3 * i + 1], input.pos[3 * i + 2]);
      return d < edges[1] ? 0 : d < edges[2] ? 1 : 2;
    };
    for (let i = 0; i < input.count; i++) all[bin(i)]++;
    for (const i of built[0].points) root[bin(i)]++;
    for (let b = 0; b < 3; b++) expect(root[b] / 1000).toBeCloseTo(all[b] / input.count, 1);
  });

  it('stores in each octant’s glow the light of its child’s whole subtree', () => {
    const subtreeLight = built.map(() => new Float64Array(SURVEY_CLASSES));
    for (let k = built.length - 1; k >= 0; k--) {
      const n = built[k];
      for (const i of n.points) subtreeLight[k][kindClass(input.kind[i])] += lightOf(input, i);
      if (n.parent >= 0) for (let c = 0; c < SURVEY_CLASSES; c++) subtreeLight[n.parent][c] += subtreeLight[k][c];
    }
    for (const n of built) {
      for (let o = 0; o < 8; o++) {
        const c = n.children[o];
        for (let cl = 0; cl < SURVEY_CLASSES; cl++) {
          const want = c < 0 ? 0 : subtreeLight[c][cl];
          expect(n.glows[o * GLOW_FLOATS + cl]).toBeCloseTo(want, Math.max(0, 5 - Math.ceil(Math.log10(want + 1))));
        }
      }
    }
  });

  it('keeps in the hierarchy each subtree’s summary, the same as its parent’s octant glow to 0.1 %', () => {
    for (const n of built) {
      for (let o = 0; o < 8; o++) {
        const c = n.children[o];
        if (c < 0) continue;
        const sub = h.nodes[c].sub;
        let a = 0;
        let b = 0;
        for (let cl = 0; cl < SURVEY_CLASSES; cl++) {
          a += n.glows[o * GLOW_FLOATS + cl];
          b += sub[cl];
        }
        expect(Math.abs(a - b) / a).toBeLessThan(1e-3);
        // Its centroid within a 30,000th of the child's side, and its rms radius within 0.1 %.
        const cc = h.nodes[c];
        for (let k = 0; k < 3; k++) {
          const want = n.lo[k] + n.side / 2 + n.glows[o * GLOW_FLOATS + 4 + k];
          expect(Math.abs(cc.lo[k] + cc.side / 2 + sub[4 + k] - want)).toBeLessThan(cc.side / 30000 + 1e-6 * Math.abs(want));
        }
        expect(Math.abs(sub[7] - n.glows[o * GLOW_FLOATS + 7])).toBeLessThan(1e-3 * n.glows[o * GLOW_FLOATS + 7] + cc.side / 30000);
      }
    }
  });

  /** The light of every galaxy in node k's subtree. */
  const subtreeLight = (k: number): number => {
    let s = 0;
    const stack = [k];
    while (stack.length) {
      const j = stack.pop()!;
      for (const i of built[j].points) s += lightOf(input, i);
      for (const c of built[j].children) if (c >= 0) stack.push(c);
    }
    return s;
  };

  const view = (cam: [number, number, number], budget: number, extra: Partial<LodView> = {}): LodView => ({
    cam,
    a: 1,
    forward: [0, 1, 0],
    halfFov: Math.PI,
    pxPerRad: 1500,
    phi: 0,
    velDir: [0, 0, -1],
    budget,
    ...extra,
  });

  it('spends the budget, drawing each node whole or a part of at least MIN_NODE_FRACTION, below whole parents', () => {
    for (const [cam, budget] of [
      [[0, 0, 0], 8000],
      [[0, 300, 0], 5000],
      [[500, 3000, -200], 12_000],
      [[0, 14_000, 0], 3000],
      [[-9000, 2000, 9000], 20_000],
    ] as [[number, number, number], number][]) {
      const sel = selectNodes(h.nodes, view(cam, budget), () => true);
      expect(sel.points).toBeLessThanOrEqual(budget);
      // Nearly all of it (a part smaller than MIN_NODE_FRACTION of a node is not drawn).
      expect(sel.points).toBeGreaterThan(0.7 * Math.min(budget, input.count));
      sel.draw.forEach((id, k) => {
        const n = h.nodes[id];
        expect(sel.count[k]).toBeLessThanOrEqual(n.points);
        expect(sel.count[k]).toBeGreaterThanOrEqual(MIN_NODE_FRACTION * n.points - 1);
        expect(sel.whole.has(id)).toBe(sel.count[k] === n.points);
        if (n.parent >= 0) expect(sel.whole.has(n.parent)).toBe(true);
      });
    }
  });

  it('spreads the budget over the view, each part of the sky sampled at k (pixels / galaxies)^SPREAD of its galaxies', () => {
    const v = view([0, 800, 0], 12_000);
    const sel = selectNodes(h.nodes, v, () => true);
    const cap = 1000 * 2560 * 1440;
    const areaOf = (id: number) => (id === 0 ? cap : Math.max(1, Math.min(cap, nodeSizePx(h.nodes[id], v) ** 2)));
    let parts = 0;
    sel.draw.forEach((id, k) => {
      if (sel.whole.has(id)) return;
      parts++;
      // A node drawn in part tops up the share its ancestors draw of its region's galaxies to its aim.
      let given = 0;
      for (let p = h.nodes[id].parent; p >= 0; p = h.nodes[p].parent) given += sel.chosen.get(p)! / h.nodes[p].subtree;
      const aim = Math.min(1, sel.scale * (areaOf(id) / h.nodes[id].subtree) ** SPREAD);
      // (to within the one galaxy a part is rounded down by)
      expect(Math.abs(given + sel.count[k] / h.nodes[id].subtree - aim)).toBeLessThanOrEqual(1 / h.nodes[id].subtree + 1e-9);
    });
    expect(parts).toBeGreaterThan(0);
    // More nodes than whole ones would fit: the budget is spread.
    expect(sel.draw.length).toBeGreaterThan(Math.floor(12_000 / 1000));
  });

  it('keeps each node’s galaxies in an order whose every prefix is spread over the whole node', () => {
    for (const n of [1, 2, 3, 1000, 16_384, 12_345]) {
      const o = stratifiedOrder(n);
      expect([...o].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
    }
    // The first quarter of a node's galaxies (in the file's space-filling order) covers its octants as all of them do.
    const n = built[0];
    const { bytes } = nodeBytes(n, input, new Float64Array(input.count).map((_, i) => Math.hypot(input.pos[3 * i], input.pos[3 * i + 1], input.pos[3 * i + 2])));
    const d = decodeNode(bytes, n.side);
    const octantShare = (m: number) => {
      const c = new Array(8).fill(0);
      for (let j = 0; j < m; j++) c[(d.position[3 * j] >= 0 ? 1 : 0) | (d.position[3 * j + 1] >= 0 ? 2 : 0) | (d.position[3 * j + 2] >= 0 ? 4 : 0)]++;
      return c.map((x) => x / m);
    };
    const all = octantShare(d.count);
    const quarter = octantShare(d.count >> 2);
    for (let o = 0; o < 8; o++) expect(Math.abs(quarter[o] - all[o])).toBeLessThan(0.01);
  });

  it('glows only where nothing is drawn, holding those galaxies’ light, split without changing it, within 1 %', () => {
    for (const [cam, budget] of [
      [[0, 0, 0], 8000],
      [[0, 300, 0], 3000],
      [[0, 14_000, 0], 3000],
    ] as [[number, number, number], number][]) {
      const v = view(cam, budget);
      const sel = selectNodes(h.nodes, v, () => true);
      const drawn = new Set(sel.draw);
      const sources = sel.draw.filter((i) => sel.whole.has(i));
      let want = 0;
      let octants = 0;
      for (const id of sources)
        for (const c of built[id].children)
          if (c >= 0 && !drawn.has(c)) {
            want += subtreeLight(c);
            octants++;
          }
      const list = selectGlows(h.nodes, v, sources, () => 1, (i) => drawn.has(i), (i) => built[i].glows, glowList(400));
      let glow = 0;
      for (let j = 0; j < 4 * list.count; j++) glow += list.light[j];
      if (octants === 0) continue;
      expect(Math.abs(glow - want) / want).toBeLessThan(0.01);
      // Each octant a glow at least, split where it looks wide.
      expect(list.count).toBeGreaterThanOrEqual(octants);
    }
  });

  it('asks for the nodes it would draw that are not loaded, coarse before fine', () => {
    const loaded = (i: number) => h.nodes[i].depth < 2;
    const all = selectNodes(h.nodes, view([0, 0, 0], 30_000), () => true);
    const sel = selectNodes(h.nodes, view([0, 0, 0], 30_000), loaded);
    expect(sel.draw.every((i) => h.nodes[i].depth < 2)).toBe(true);
    expect(sel.fetch.length).toBeGreaterThan(0);
    // Exactly the nodes it would draw with everything loaded: no download is wasted.
    expect([...sel.draw, ...sel.fetch].sort((x, y) => x - y)).toEqual([...all.draw].sort((x, y) => x - y));
    for (let k = 1; k < sel.fetch.length; k++) expect(h.nodes[sel.fetch[k]].depth).toBeGreaterThanOrEqual(h.nodes[sel.fetch[k - 1]].depth);
  });

  it('culls nodes out of the view, and aberrates in flight', () => {
    const cam: [number, number, number] = [0, 0, 0];
    const all = selectNodes(h.nodes, view(cam, 1e9), () => true);
    const narrow = selectNodes(h.nodes, view(cam, 1e9, { halfFov: 0.2, forward: [0, -1, 0] }), () => true);
    expect(narrow.points).toBeLessThan(all.points);
    // Seen from a fast ship a node's direction is aberrated towards the motion and its size divided by the Doppler factor.
    const box = (x: number, y: number, z: number): SurveyNode => ({ ...h.nodes[0], box: Float64Array.of(x - 5, y - 5, z - 5, x + 5, y + 5, z + 5) });
    const at60 = box(1000 * Math.sin(Math.PI / 3), 1000 * Math.cos(Math.PI / 3), 0);
    const narrowUp = view(cam, 1e9, { halfFov: 0.5, forward: [0, 1, 0] });
    expect(nodeSizePx(at60, narrowUp)).toBe(-1);
    expect(nodeSizePx(at60, { ...narrowUp, phi: 2, velDir: [0, 1, 0] })).toBeGreaterThan(0);
    const ahead = box(0, 1000, 0);
    const still = nodeSizePx(ahead, view(cam, 1e9));
    expect(nodeSizePx(ahead, view(cam, 1e9, { phi: 1, velDir: [0, 1, 0] })) / still).toBeCloseTo(Math.exp(-1), 6);
    expect(nodeSizePx(ahead, view(cam, 1e9, { phi: 1, velDir: [0, -1, 0] })) / still).toBeCloseTo(Math.exp(1), 6);
  });

  it('puts a glow’s light where its galaxies’ light is: its depth cue matches the sum within 1 % for a far octant', () => {
    const cam = [0, -2000, 0];
    const depth = mapDepthMpc(2000);
    let checked = 0;
    for (const n of built) {
      for (let o = 0; o < 8; o++) {
        const c = n.children[o];
        if (c < 0) continue;
        const g = o * GLOW_FLOATS;
        const cx = n.lo[0] + n.side / 2 + n.glows[g + 4];
        const cy = n.lo[1] + n.side / 2 + n.glows[g + 5];
        const cz = n.lo[2] + n.side / 2 + n.glows[g + 6];
        const dc = Math.hypot(cx - cam[0], cy - cam[1], cz - cam[2]);
        // Octants seen at under 0.05 radians of rms radius (the selection refines larger ones).
        if (n.glows[g + 7] / dc > 0.05) continue;
        let glowLight = 0;
        for (let cl = 0; cl < SURVEY_CLASSES; cl++) glowLight += n.glows[g + cl];
        glowLight *= glowDepth(dc, n.glows[g + 7], depth);
        let sum = 0;
        const stack = [c];
        while (stack.length) {
          const k = stack.pop()!;
          for (const i of built[k].points) sum += lightOf(input, i) * mapDepth(Math.hypot(input.pos[3 * i] - cam[0], input.pos[3 * i + 1] - cam[1], input.pos[3 * i + 2] - cam[2]), depth);
          for (const kk of built[k].children) if (kk >= 0) stack.push(kk);
        }
        expect(Math.abs(glowLight - sum) / sum).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('writes node files that decode to the same galaxies', () => {
    const n = built[3];
    const { bytes, order } = nodeBytes(n, input, new Float64Array(input.count).map((_, i) => Math.hypot(input.pos[3 * i], input.pos[3 * i + 1], input.pos[3 * i + 2])));
    const d = decodeNode(bytes, n.side);
    expect(d.count).toBe(n.points.length);
    const strat = stratifiedOrder(d.count);
    for (let j = 0; j < d.count; j += 37) {
      const i = n.points[order[strat[j]]];
      for (let a = 0; a < 3; a++) expect(Math.abs(n.lo[a] + n.side / 2 + d.position[3 * j + a] - input.pos[3 * i + a])).toBeLessThan(0.11);
      expect(d.attrs[2 * j]).toBe(input.kind[i]);
    }
  });
});

describe('the tiles as shipped (public/data/survey/)', () => {
  const DIR = 'public/data/survey/';
  const hasTiles = fileExists(DIR + HIERARCHY_FILE);
  it.skipIf(!hasTiles)('hold 13.5 million galaxies in files under 1 MB each', () => {
    const h = decodeHierarchy(zlib.gunzipSync(readBytes(DIR + HIERARCHY_FILE)));
    expect(h.total).toBeGreaterThan(13_000_000);
    expect(h.perSource.reduce((a, b) => a + b, 0)).toBe(h.total);
    expect(h.nodes.reduce((s, n) => s + n.points, 0)).toBe(h.total);
    expect(h.nodes[0].subtree).toBe(h.total);
    let bytes = 0;
    for (const n of h.nodes) {
      const size = fileSize(DIR + nodeFile(n.path));
      expect(size).toBe(n.fileBytes);
      expect(size).toBeLessThan(1_000_000);
      bytes += size;
    }
    expect(bytes).toBeLessThan(70e6);
  });

  it.skipIf(!hasTiles)('carry in the root’s glows exactly the light of its children’s galaxies and glows', () => {
    const h = decodeHierarchy(zlib.gunzipSync(readBytes(DIR + HIERARCHY_FILE)));
    const load = (n: SurveyNode) => decodeNode(zlib.gunzipSync(readBytes(DIR + nodeFile(n.path))), n.side);
    const root = load(h.nodes[0]);
    expect(root.count).toBe(h.nodes[0].points);
    for (let o = 0; o < 8; o++) {
      const c = h.nodes[0].children[o];
      if (c < 0) continue;
      const child = load(h.nodes[c]);
      expect(child.count).toBe(h.nodes[c].points);
      const sum = new Float64Array(SURVEY_CLASSES);
      for (let j = 0; j < child.count; j++) sum[kindClass(child.attrs[2 * j])] += mapLightOfByte(child.attrs[2 * j + 1]);
      for (let q = 0; q < 8; q++) for (let cl = 0; cl < SURVEY_CLASSES; cl++) sum[cl] += child.glows[q * GLOW_FLOATS + cl];
      for (let cl = 0; cl < SURVEY_CLASSES; cl++) {
        const g = root.glows[o * GLOW_FLOATS + cl];
        expect(Math.abs(g - sum[cl])).toBeLessThanOrEqual(1e-4 * Math.max(1, sum[cl]));
      }
    }
  });
});
