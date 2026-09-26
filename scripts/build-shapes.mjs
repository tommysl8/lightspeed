// Builds public/models/<id>.bin: compact triangle meshes of irregular bodies, in kilometres, in
// each body's own body-fixed frame (see FRAMES below and staging/phase2/assets.md).
//
// Sources (all cached in data-raw/d3/shapes/ on first run; delete a file to fetch it again):
//   phobos      R. Gaskell, Phobos Q=64 vertex–facet model (Viking + Phobos 2 images), PDS SBN
//   deimos      P. Thomas, 5° radius grid (Viking Orbiter images), PDS SBN
//   hyperion    P. Thomas, 5° radius grid (Voyager 2 images), PDS SBN
//   proteus     P. Stooke, 5° radius grid (Voyager 2 images), PDS SBN
//   halley      P. Stooke, 5° radius grid (Giotto and Vega images), PDS SBN
//   vesta       DLR Dawn HAMO global DTM (radius, 48 px/°), via USGS Astrogeology, sampled at 1°
//   arrokoth    S. Porter et al. 2024, New Horizons LORRI shape model, PDS SBN (nh_derived). The
//               model is two closed lobe meshes that overlap slightly at the neck (its PDS label
//               says so); they are joined into one closed surface with a boolean union first.
//   churyumov-gerasimenko  R. Gaskell, L. Jorda et al., SHAP5 SPC model, 24k plates, ESA PSA
//   nix, hydra  triaxial ellipsoids, Weaver et al. 2016 (Science 351, aae0030), Table 2
//   haumea      triaxial ellipsoid, Ortiz et al. 2017 (Nature 550, 219)
//
// Every mesh is simplified to at most MAX_TRIS triangles with quadric-error edge collapse
// (Garland & Heckbert 1997), keeping the surface closed and outward-facing, and the script
// reports how far the simplified surface strays from the source (RMS and maximum, in km).
//
// File format (little-endian), "LSM1":
//   offset  0  char[4]  'LSM1'
//           4  u32      version (1)
//           8  u32      vertex count V
//          12  u32      triangle count T
//          16  u32      bytes per index (2 = Uint16, 4 = Uint32)
//          20  f32      largest vertex distance from the origin, km
//          24  f32      radius of the sphere of equal volume, km
//          28  u32      reserved (0)
//          32  f32[3V]  positions x, y, z in km, body-fixed frame
//          ..  u16/u32[3T] triangle indices, counter-clockwise seen from outside
// The origin is the model's centre (of figure or of mass, as its source defines). +z is the
// spin (north / positive) pole and +x the prime meridian wherever the body has a rotation model.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'd3', 'shapes');
const OUT = join(ROOT, 'public', 'models');
const MAX_TRIS = 4000;

const SBN4 = 'https://sbnarchive.psi.edu/pds4/non_mission';
const UMD = 'https://pds-smallbodies.astro.umd.edu/holdings';
const PSA = 'https://archives.esac.esa.int/psa/ftp/INTERNATIONAL-ROSETTA-MISSION/SHAPE/RO-C-MULTI-5-67P-SHAPE-V2.0';
const USGS = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic';

// ─── Downloads ──────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, range) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: range ? { Range: `bytes=${range[0]}-${range[1]}` } : {} });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: res.status < 500 });
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e.fatal || attempt >= 5) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function cached(url, name) {
  const file = join(RAW, name);
  if (!existsSync(file)) {
    console.log(`  fetching ${url}`);
    writeFileSync(file, await httpGet(url));
  }
  return readFileSync(file, 'latin1');
}

// ─── Source readers → { v: number[][], f: number[][] } ──────────────────────────────────────

/** Radius grid on a regular lat/lon lattice → closed triangle mesh (poles as single vertices). */
function gridMesh(radius, nLat, nLon, lonEastOf) {
  // radius(latDeg, lonEastDeg) is sampled on latitudes −90 + 180·i/(nLat−1) and nLon longitudes.
  const v = [];
  const f = [];
  const vert = (lat, lon) => {
    const r = radius(lat, lon);
    const la = (lat * Math.PI) / 180;
    const lo = (lonEastOf(lon) * Math.PI) / 180;
    v.push([r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]);
    return v.length - 1;
  };
  const south = vert(-90, 0);
  const rows = [];
  for (let i = 1; i < nLat - 1; i++) {
    const lat = -90 + (180 * i) / (nLat - 1);
    const row = [];
    for (let j = 0; j < nLon; j++) row.push(vert(lat, (360 * j) / nLon));
    rows.push(row);
  }
  const north = vert(90, 0);
  // Orientation is fixed afterwards (orientOutward), so winding here only needs to be consistent.
  for (let j = 0; j < nLon; j++) f.push([south, rows[0][(j + 1) % nLon], rows[0][j]]);
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = rows[i][j];
      const b = rows[i][(j + 1) % nLon];
      const c = rows[i + 1][j];
      const d = rows[i + 1][(j + 1) % nLon];
      f.push([a, b, d], [a, d, c]);
    }
  }
  const last = rows[rows.length - 1];
  for (let j = 0; j < nLon; j++) f.push([north, last[j], last[(j + 1) % nLon]]);
  return { v, f };
}

/** Thomas / Stooke tables: lat, lon, radius on a 5° lattice (column order differs). */
function latLonTable(text, { latCol, lonCol, rCol, west }) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/).map(Number);
    if (t.length < 3 || t.some(Number.isNaN)) continue;
    const lat = Math.round(t[latCol]);
    const lon = Math.round(((t[lonCol] % 360) + 360) % 360);
    map.set(`${lat},${lon}`, t[rCol]);
  }
  const step = 5;
  const radius = (lat, lon) => {
    const r = map.get(`${Math.round(lat)},${Math.round(lon) % 360}`);
    if (r === undefined) throw new Error(`grid point ${lat},${lon} missing`);
    return r;
  };
  // Stored longitudes are west for Thomas and for Stooke's satellites: east = −west.
  return gridMesh(radius, 180 / step + 1, 360 / step, (lon) => (west ? -lon : lon));
}

function gaskellVertexFacet(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const [nv, nf] = lines[0].trim().split(/\s+/).map(Number);
  const v = [];
  const f = [];
  for (let i = 1; i <= nv; i++) v.push(lines[i].trim().split(/\s+/).slice(1, 4).map(Number));
  for (let i = nv + 1; i <= nv + nf; i++) f.push(lines[i].trim().split(/\s+/).slice(1, 4).map((x) => Number(x) - 1));
  return { v, f };
}

function objMesh(text) {
  const v = [];
  const f = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) v.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith('f ')) f.push(line.trim().split(/\s+/).slice(1, 4).map((s) => Number(s.split('/')[0]) - 1));
  }
  return { v, f };
}

/** PDS "Cartesian plate model" written as VRML IndexedFaceSet (ESA 67P SHAPx files). */
function wrlPlates(text) {
  const pts = text.slice(text.indexOf('point ['), text.indexOf(']', text.indexOf('point [')));
  const idx = text.slice(text.indexOf('coordIndex ['), text.indexOf(']', text.indexOf('coordIndex [')));
  const nums = (s) => s.replace(/^[^[]*\[/, '').replace(/#.*$/gm, '').split(/[\s,]+/).filter(Boolean).map(Number);
  const pv = nums(pts);
  const iv = nums(idx);
  const v = [];
  for (let i = 0; i + 2 < pv.length; i += 3) v.push([pv[i], pv[i + 1], pv[i + 2]]);
  const f = [];
  let cur = [];
  for (const k of iv) {
    if (k === -1) {
      if (cur.length === 3) f.push(cur);
      cur = [];
    } else cur.push(k);
  }
  if (cur.length === 3) f.push(cur);
  return { v, f };
}

/** Vesta: radius (m) from the DLR HAMO DTM, averaged over 1° cells, read by HTTP range. */
async function vestaFromDtm() {
  const product = 'Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd';
  const cache = join(RAW, 'vesta_dtm_radius_1deg.json');
  let grid;
  if (existsSync(cache)) grid = JSON.parse(readFileSync(cache, 'utf8'));
  else {
    const url = `${USGS}/${product}.tif`;
    const head = await httpGet(url, [0, 131071]);
    // Classic little-endian TIFF, float32, uncompressed, one row per strip (checked below).
    const ifd = head.readUInt32LE(4);
    const n = head.readUInt16LE(ifd);
    const tags = {};
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + 12 * k;
      tags[head.readUInt16LE(e)] = { type: head.readUInt16LE(e + 2), count: head.readUInt32LE(e + 4), val: head.readUInt32LE(e + 8) };
    }
    const W = tags[256].val;
    const H = tags[257].val;
    if (tags[258].val !== 32 || tags[259].val !== 1 || tags[278].val !== 1) throw new Error('unexpected DTM layout');
    const offsAt = tags[273].val;
    const offBuf = offsAt + 4 * H <= head.length ? head.subarray(offsAt, offsAt + 4 * H) : await httpGet(url, [offsAt, offsAt + 4 * H - 1]);
    const ppd = W / 360; // 48
    grid = [];
    for (let i = 0; i < 180; i++) {
      // Average three rows spread through the 1° band, and all 48 columns of each 1° cell.
      const rowR = new Float64Array(360);
      const rowN = new Float64Array(360);
      for (const frac of [1 / 6, 1 / 2, 5 / 6]) {
        const row = Math.min(H - 1, Math.floor((i + frac) * ppd));
        const off = offBuf.readUInt32LE(4 * row);
        const buf = await httpGet(url, [off, off + 4 * W - 1]);
        for (let c = 0; c < W; c++) {
          const r = buf.readFloatLE(4 * c);
          if (!(r > 100000 && r < 400000)) continue; // no-data is −3.4e38
          const cell = Math.floor(c / ppd);
          rowR[cell] += r;
          rowN[cell]++;
        }
      }
      grid.push(Array.from(rowR, (s, j) => Math.round(s / rowN[j]) / 1000)); // km
      process.stdout.write(`\r  DTM rows ${i + 1}/180`);
    }
    process.stdout.write('\n');
    writeFileSync(cache, JSON.stringify({ source: `${url} (1° cell means of radius)`, lonOfColumn0: -179.5, grid }));
  }
  const g = grid.grid ?? grid;
  // Cell (i, j) is centred on lat 89.5 − i, lon −179.5 + j. Build vertices at those centres.
  const v = [];
  const f = [];
  const idx = (i, j) => 1 + i * 360 + ((j + 360) % 360);
  const np = g[0].reduce((s, r) => s + r, 0) / 360;
  const sp = g[179].reduce((s, r) => s + r, 0) / 360;
  v.push([0, 0, np]);
  for (let i = 0; i < 180; i++) {
    const lat = ((89.5 - i) * Math.PI) / 180;
    for (let j = 0; j < 360; j++) {
      const lon = ((-179.5 + j) * Math.PI) / 180;
      const r = g[i][j];
      v.push([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
    }
  }
  v.push([0, 0, -sp]);
  const S = v.length - 1;
  for (let j = 0; j < 360; j++) f.push([0, idx(0, j), idx(0, j + 1)]);
  for (let i = 0; i < 179; i++) for (let j = 0; j < 360; j++) f.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)], [idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
  for (let j = 0; j < 360; j++) f.push([S, idx(179, j + 1), idx(179, j)]);
  return { v, f };
}

/**
 * Boolean union of the closed shells of a mesh, with the Manifold library (Apache-2.0, WASM;
 * https://github.com/elalish/manifold). Like sharp for the textures it is a build-time tool, not
 * a project dependency: `npm install --prefix <folder> manifold-3d`, then LIGHTSPEED_TOOLS=<folder>.
 * Returns the single closed surface and the volumes, so the overlap is reported, not counted twice.
 */
async function unionShells(mesh) {
  const dirs = [process.env.LIGHTSPEED_TOOLS, ROOT].filter(Boolean);
  let Module;
  for (const d of dirs) {
    const entry = join(resolve(d), 'node_modules', 'manifold-3d', 'manifold.js');
    if (existsSync(entry)) {
      Module = (await import(pathToFileURL(entry).href)).default;
      break;
    }
  }
  if (!Module) throw new Error('manifold-3d not found. npm install --prefix <folder> manifold-3d, then set LIGHTSPEED_TOOLS=<folder>.');
  const wasm = await Module();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const welded = weld(mesh);
  orientOutward(welded);
  // Split into connected shells.
  const parent = welded.v.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b, c] of welded.f) {
    parent[find(a)] = find(b);
    parent[find(b)] = find(c);
  }
  const shells = new Map();
  welded.f.forEach((t) => {
    const r = find(t[0]);
    if (!shells.has(r)) shells.set(r, []);
    shells.get(r).push(t);
  });
  const manifolds = [...shells.values()].map((faces) => {
    const used = [...new Set(faces.flat())];
    const local = new Map(used.map((g, i) => [g, i]));
    const vp = new Float32Array(3 * used.length);
    used.forEach((g, i) => vp.set(welded.v[g], 3 * i));
    const tv = new Uint32Array(faces.flatMap((t) => t.map((g) => local.get(g))));
    const m = new Manifold(new Mesh({ numProp: 3, vertProperties: vp, triVerts: tv }));
    if (m.status() !== 'NoError') throw new Error(`shell not manifold: ${m.status()}`);
    return m;
  });
  const shellVolumes = manifolds.map((m) => m.volume());
  const u = Manifold.union(manifolds);
  const out = u.getMesh();
  const v = [];
  for (let i = 0; i < out.vertProperties.length; i += out.numProp) v.push([out.vertProperties[i], out.vertProperties[i + 1], out.vertProperties[i + 2]]);
  const f = [];
  for (let i = 0; i < out.triVerts.length; i += 3) f.push([out.triVerts[i], out.triVerts[i + 1], out.triVerts[i + 2]]);
  const union = { shells: manifolds.length, shellVolumesKm3: shellVolumes, sumKm3: shellVolumes.reduce((a, b) => a + b, 0), unionKm3: u.volume(), genus: u.genus() };
  union.overlapKm3 = union.sumKm3 - union.unionKm3;
  return { v, f, union };
}

/** Triaxial ellipsoid (semi-axes a ≥ b ≥ c along x, y, z) as a lat/lon mesh. */
function ellipsoid(a, b, c, nLat = 33, nLon = 64) {
  const radius = (lat, lon) => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    const x = Math.cos(la) * Math.cos(lo);
    const y = Math.cos(la) * Math.sin(lo);
    const z = Math.sin(la);
    return 1 / Math.sqrt((x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2);
  };
  return { ...gridMesh(radius, nLat, nLon, (lon) => lon), analytic: [a, b, c] };
}

// ─── Mesh utilities ─────────────────────────────────────────────────────────────────────────

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

function signedVolume({ v, f }) {
  let s = 0;
  for (const [i, j, k] of f) s += dot(v[i], cross(v[j], v[k])) / 6;
  return s;
}

/** Make winding consistent across each connected surface, then outward (positive volume). */
function orientOutward(mesh) {
  const { f } = mesh;
  const edgeFaces = new Map();
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  f.forEach((t, fi) => {
    for (let e = 0; e < 3; e++) {
      const k = key(t[e], t[(e + 1) % 3]);
      if (!edgeFaces.has(k)) edgeFaces.set(k, []);
      edgeFaces.get(k).push(fi);
    }
  });
  const seen = new Uint8Array(f.length);
  const hasDirected = (t, a, b) => (t[0] === a && t[1] === b) || (t[1] === a && t[2] === b) || (t[2] === a && t[0] === b);
  const components = [];
  for (let s = 0; s < f.length; s++) {
    if (seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let q = 0; q < comp.length; q++) {
      const t = f[comp[q]];
      for (let e = 0; e < 3; e++) {
        const a = t[e];
        const b = t[(e + 1) % 3];
        for (const g of edgeFaces.get(key(a, b))) {
          if (seen[g]) continue;
          // A consistently wound neighbour traverses the shared edge the other way (b → a).
          if (hasDirected(f[g], a, b)) f[g] = [f[g][0], f[g][2], f[g][1]];
          seen[g] = 1;
          comp.push(g);
        }
      }
    }
    components.push(comp);
  }
  for (const comp of components) {
    let vol = 0;
    for (const fi of comp) {
      const [i, j, k] = f[fi];
      vol += dot(mesh.v[i], cross(mesh.v[j], mesh.v[k]));
    }
    if (vol < 0) for (const fi of comp) f[fi] = [f[fi][0], f[fi][2], f[fi][1]];
  }
  return { mesh, components: components.length };
}

/** Merge duplicate vertices (exact position match) and drop degenerate triangles. */
function weld(mesh) {
  const map = new Map();
  const nv = [];
  const remap = mesh.v.map((p) => {
    const k = p.map((x) => x.toFixed(7)).join(',');
    if (!map.has(k)) {
      map.set(k, nv.length);
      nv.push(p);
    }
    return map.get(k);
  });
  const nf = [];
  for (const t of mesh.f) {
    const [a, b, c] = t.map((i) => remap[i]);
    if (a !== b && b !== c && a !== c) nf.push([a, b, c]);
  }
  return { v: nv, f: nf };
}

function edgeCheck({ f }) {
  const count = new Map();
  for (const t of f) for (let e = 0; e < 3; e++) {
    const a = t[e];
    const b = t[(e + 1) % 3];
    const k = `${a},${b}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let open = 0;
  let nonManifold = 0;
  for (const [k, n] of count) {
    const [a, b] = k.split(',');
    const back = count.get(`${b},${a}`) ?? 0;
    if (n > 1) nonManifold++;
    if (back === 0) open++;
  }
  return { open, nonManifold };
}

// ─── Quadric-error edge-collapse simplification ────────────────────────────────────────────

class Heap {
  constructor() {
    this.a = [];
  }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

function simplify(mesh, target) {
  const V = mesh.v.map((p) => p.slice());
  const F = mesh.f.map((t) => t.slice());
  const nV = V.length;
  const faceAlive = new Uint8Array(F.length).fill(1);
  const vAlive = new Uint8Array(nV).fill(1);
  const vFaces = Array.from({ length: nV }, () => new Set());
  F.forEach((t, fi) => t.forEach((i) => vFaces[i].add(fi)));
  const Q = Array.from({ length: nV }, () => new Float64Array(10));
  const addQ = (q, n, d, w) => {
    const [a, b, c] = n;
    q[0] += w * a * a; q[1] += w * a * b; q[2] += w * a * c; q[3] += w * a * d;
    q[4] += w * b * b; q[5] += w * b * c; q[6] += w * b * d;
    q[7] += w * c * c; q[8] += w * c * d; q[9] += w * d * d;
  };
  F.forEach(([i, j, k]) => {
    const n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
    const area2 = norm(n);
    if (area2 === 0) return;
    const u = n.map((x) => x / area2);
    const d = -dot(u, V[i]);
    for (const x of [i, j, k]) addQ(Q[x], u, d, area2 / 2);
  });
  const qErr = (q, p) => {
    const [x, y, z] = p;
    return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  };
  const version = new Uint32Array(nV);
  const heap = new Heap();
  const neighbours = (u) => {
    const s = new Set();
    for (const fi of vFaces[u]) for (const x of F[fi]) if (x !== u) s.add(x);
    return s;
  };
  const best = (u, v) => {
    const q = Q[u].map((x, i) => x + Q[v][i]);
    // Solve [q0 q1 q2; q1 q4 q5; q2 q5 q7] p = −[q3 q6 q8].
    const A = [q[0], q[1], q[2], q[1], q[4], q[5], q[2], q[5], q[7]];
    const det = A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
    const cands = [V[u], V[v], V[u].map((x, i) => (x + V[v][i]) / 2)];
    const scale = Math.max(1e-30, Math.abs(A[0]) + Math.abs(A[4]) + Math.abs(A[8]));
    if (Math.abs(det) > 1e-9 * scale ** 3) {
      const bx = -q[3];
      const by = -q[6];
      const bz = -q[8];
      const x = (bx * (A[4] * A[8] - A[5] * A[7]) - A[1] * (by * A[8] - A[5] * bz) + A[2] * (by * A[7] - A[4] * bz)) / det;
      const y = (A[0] * (by * A[8] - A[5] * bz) - bx * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * bz - by * A[6])) / det;
      const z = (A[0] * (A[4] * bz - by * A[7]) - A[1] * (A[3] * bz - by * A[6]) + bx * (A[3] * A[7] - A[4] * A[6])) / det;
      const p = [x, y, z];
      // Keep the optimum only if it stays near the edge (avoids spikes on flat regions).
      const len = norm(sub(V[u], V[v]));
      if (norm(sub(p, cands[2])) < 2 * len) cands.unshift(p);
    }
    let bp = cands[0];
    let be = Infinity;
    for (const p of cands) {
      const e = qErr(q, p);
      if (e < be) {
        be = e;
        bp = p;
      }
    }
    return { p: bp, e: Math.max(0, be) };
  };
  const pushEdge = (u, v) => {
    const { e } = best(u, v);
    heap.push([e, u, v, version[u], version[v]]);
  };
  const seenEdge = new Set();
  F.forEach((t) => {
    for (let e = 0; e < 3; e++) {
      const a = Math.min(t[e], t[(e + 1) % 3]);
      const b = Math.max(t[e], t[(e + 1) % 3]);
      const k = a * nV + b;
      if (!seenEdge.has(k)) {
        seenEdge.add(k);
        pushEdge(a, b);
      }
    }
  });
  let alive = F.length;
  const faceNormal = (t, P) => cross(sub(P[1], P[0]), sub(P[2], P[0]));
  while (alive > target && heap.size) {
    const [, u, v, vu, vv] = heap.pop();
    if (!vAlive[u] || !vAlive[v] || version[u] !== vu || version[v] !== vv) continue;
    // Link condition: shared neighbours must be exactly the apexes of the faces on this edge.
    const shared = [...vFaces[u]].filter((fi) => vFaces[v].has(fi));
    const nu = neighbours(u);
    const nv = neighbours(v);
    let common = 0;
    for (const x of nu) if (nv.has(x)) common++;
    if (common !== shared.length || shared.length !== 2) continue;
    const { p } = best(u, v);
    // Reject collapses that flip or squash any surviving face.
    let ok = true;
    for (const w of [u, v]) {
      for (const fi of vFaces[w]) {
        if (shared.includes(fi)) continue;
        const t = F[fi];
        const before = t.map((i) => V[i]);
        const after = t.map((i) => (i === u || i === v ? p : V[i]));
        const n0 = faceNormal(t, before);
        const n1 = faceNormal(t, after);
        const l1 = norm(n1);
        if (l1 < 1e-12 || dot(n0, n1) / (norm(n0) * l1) < 0.3) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // Collapse v into u.
    V[u] = p;
    for (let i = 0; i < 10; i++) Q[u][i] += Q[v][i];
    for (const fi of vFaces[v]) {
      if (shared.includes(fi)) {
        faceAlive[fi] = 0;
        alive--;
        for (const x of F[fi]) vFaces[x].delete(fi);
      } else {
        F[fi] = F[fi].map((x) => (x === v ? u : x));
        vFaces[u].add(fi);
      }
    }
    vFaces[v].clear();
    vAlive[v] = 0;
    version[u]++;
    for (const w of neighbours(u)) {
      version[w]++;
    }
    // Re-queue every edge whose cost may have changed (around u and its neighbours).
    const ring = neighbours(u);
    for (const w of ring) pushEdge(u, w);
    for (const w of ring) for (const x of neighbours(w)) if (x !== u) pushEdge(w, x);
  }
  // Compact.
  const remap = new Int32Array(nV).fill(-1);
  const v = [];
  const f = [];
  F.forEach((t, fi) => {
    if (!faceAlive[fi]) return;
    f.push(
      t.map((i) => {
        if (remap[i] < 0) {
          remap[i] = v.length;
          v.push(V[i]);
        }
        return remap[i];
      }),
    );
  });
  return { v, f };
}

// ─── Error measurement: distance from source vertices to the simplified surface ────────────

function pointTriDist(p, a, b, c) {
  // Ericson, Real-Time Collision Detection, closest point on triangle.
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return norm(ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return norm(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return norm(sub(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]));
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return norm(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return norm(sub(p, [a[0] + t * ac[0], a[1] + t * ac[1], a[2] + t * ac[2]]));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return norm(sub(p, [b[0] + t * (c[0] - b[0]), b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2])]));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return norm(sub(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]));
}

/** Facet error of an ellipsoid mesh: radial gap between the flat triangles and the true surface. */
function ellipsoidGap(mesh, [a, b, c]) {
  let max = 0;
  let sum2 = 0;
  let n = 0;
  for (const t of mesh.f) {
    const q = t.map((i) => mesh.v[i]);
    for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
      const p = [0, 1, 2].map((j) => w[0] * q[0][j] + w[1] * q[1][j] + w[2] * q[2][j]);
      const r = norm(p);
      const u = p.map((x) => x / r);
      const d = 1 / Math.sqrt((u[0] / a) ** 2 + (u[1] / b) ** 2 + (u[2] / c) ** 2) - r;
      max = Math.max(max, Math.abs(d));
      sum2 += d * d;
      n++;
    }
  }
  return { rms: Math.sqrt(sum2 / n), max, samples: n, note: 'facet-to-ellipsoid radial gap' };
}

function deviation(src, simp, samples = 3000) {
  const step = Math.max(1, Math.floor(src.v.length / samples));
  let sum2 = 0;
  let max = 0;
  let n = 0;
  for (let i = 0; i < src.v.length; i += step) {
    const p = src.v[i];
    let d = Infinity;
    for (const [a, b, c] of simp.f) {
      const t = pointTriDist(p, simp.v[a], simp.v[b], simp.v[c]);
      if (t < d) d = t;
    }
    sum2 += d * d;
    max = Math.max(max, d);
    n++;
  }
  return { rms: Math.sqrt(sum2 / n), max, samples: n };
}

// ─── Output ─────────────────────────────────────────────────────────────────────────────────

function writeMesh(id, mesh) {
  const V = mesh.v.length;
  const T = mesh.f.length;
  const ib = V < 65536 ? 2 : 4;
  const buf = Buffer.alloc(32 + 12 * V + ib * 3 * T);
  buf.write('LSM1', 0, 'latin1');
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(V, 8);
  buf.writeUInt32LE(T, 12);
  buf.writeUInt32LE(ib, 16);
  const maxR = Math.max(...mesh.v.map(norm));
  const vol = signedVolume(mesh);
  buf.writeFloatLE(maxR, 20);
  buf.writeFloatLE(Math.cbrt((3 * vol) / (4 * Math.PI)), 24);
  buf.writeUInt32LE(0, 28);
  let o = 32;
  for (const p of mesh.v) for (const x of p) (buf.writeFloatLE(x, o), (o += 4));
  for (const t of mesh.f) for (const i of t) (ib === 2 ? buf.writeUInt16LE(i, o) : buf.writeUInt32LE(i, o), (o += ib));
  writeFileSync(join(OUT, `${id}.bin`), buf);
  return buf.length;
}

// ─── Bodies ─────────────────────────────────────────────────────────────────────────────────

export const SHAPES = {
  phobos: async () => gaskellVertexFacet(await cached(`${SBN4}/gaskell.phobos.shape-model/data/phobos_ver64q.tab`, 'gaskell_phobos_ver64q.tab')),
  deimos: async () => latLonTable(await cached(`${SBN4}/ast-sat.thomas.shape-models_V1_0/data/m2deimos.tab`, 'thomas_m2deimos.tab'), { latCol: 0, lonCol: 1, rCol: 2, west: true }),
  hyperion: async () => latLonTable(await cached(`${SBN4}/ast-sat.thomas.shape-models_V1_0/data/s7hyperion.tab`, 'thomas_s7hyperion.tab'), { latCol: 0, lonCol: 1, rCol: 2, west: true }),
  proteus: async () => latLonTable(await cached(`${SBN4}/small_bodies.stooke.shape-models/data/n8proteus.tab`, 'stooke_n8proteus.tab'), { latCol: 1, lonCol: 0, rCol: 2, west: true }),
  halley: async () => latLonTable(await cached(`${SBN4}/small_bodies.stooke.shape-models/data/1682q1halley.tab`, 'stooke_1682q1halley.tab'), { latCol: 1, lonCol: 0, rCol: 2, west: false }),
  vesta: vestaFromDtm,
  // Two overlapping lobe shells in the source: union them into one closed surface first.
  arrokoth: async () => unionShells(objMesh(await cached(`${UMD}/pds4-nh_derived:arrokoth_shapemodel_porter2024-v1.0/arrokoth_porter_2024_v01.obj`, 'arrokoth_porter_2024_v01.obj'))),
  'churyumov-gerasimenko': async () => wrlPlates(await cached(`${PSA}/DATA/TRIPLATE/SPC_LAM_PSI/SHAP5/CG_SPC_SHAP5_024K_CART.WRL`, '67p_CG_SPC_SHAP5_024K_CART.WRL')),
  // Weaver et al. 2016, Table 2: full axes 50 × 35 × 33 km (±3 km).
  nix: async () => ellipsoid(25, 17.5, 16.5),
  // Weaver et al. 2016, Table 2: full axes 65 × 45 × 25 km (±10 km).
  hydra: async () => ellipsoid(32.5, 22.5, 12.5),
  // Ortiz et al. 2017: semi-axes a = 1161 ± 30, b = 852 ± 4, c = 513 ± 16 km.
  haumea: async () => ellipsoid(1161, 852, 513),
};

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2);
  const report = {};
  for (const [id, load] of Object.entries(SHAPES)) {
    if (ids.length && !ids.includes(id)) continue;
    console.log(id);
    const loaded = await load();
    let src = weld(loaded);
    const { components } = orientOutward(src);
    const e0 = edgeCheck(src);
    const vol0 = signedVolume(src);
    let out = src.f.length > MAX_TRIS ? simplify(src, MAX_TRIS) : src;
    out = weld(out);
    orientOutward(out);
    const e1 = edgeCheck(out);
    const vol1 = signedVolume(out);
    const dev = loaded.analytic ? ellipsoidGap(out, loaded.analytic) : out === src ? { rms: 0, max: 0, samples: 0 } : deviation(src, out);
    const bytes = writeMesh(id, out);
    const ext = [0, 1, 2].map((k) => [Math.min(...out.v.map((p) => p[k])), Math.max(...out.v.map((p) => p[k]))]);
    report[id] = {
      sourceTriangles: src.f.length,
      sourceComponents: components,
      sourceOpenEdges: e0.open,
      triangles: out.f.length,
      vertices: out.v.length,
      openEdges: e1.open,
      nonManifoldEdges: e1.nonManifold,
      bytes,
      volumeKm3: vol1,
      volumeChangePercent: (100 * (vol1 - vol0)) / vol0,
      equalVolumeRadiusKm: Math.cbrt((3 * vol1) / (4 * Math.PI)),
      extentKm: ext.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]),
      deviationKm: { rms: +dev.rms.toFixed(4), max: +dev.max.toFixed(4), samples: dev.samples, measure: dev.note ?? 'distance from source-model vertices to the simplified surface' },
    };
    if (loaded.union) {
      const u = loaded.union;
      report[id].sourceUnion = {
        shells: u.shells,
        shellVolumesKm3: u.shellVolumesKm3.map((x) => +x.toFixed(3)),
        sumOfShellsKm3: +u.sumKm3.toFixed(3),
        unionKm3: +u.unionKm3.toFixed(3),
        overlapKm3: +u.overlapKm3.toFixed(3),
        unionEqualVolumeRadiusKm: +Math.cbrt((3 * u.unionKm3) / (4 * Math.PI)).toFixed(4),
        sumEqualVolumeRadiusKm: +Math.cbrt((3 * u.sumKm3) / (4 * Math.PI)).toFixed(4),
        genus: u.genus,
      };
      console.log(`  source: ${u.shells} shells, ${u.sumKm3.toFixed(2)} km³ summed, union ${u.unionKm3.toFixed(2)} km³ (overlap ${u.overlapKm3.toFixed(3)} km³), genus ${u.genus}`);
    }
    console.log(`  ${src.f.length} → ${out.f.length} triangles, ${bytes} bytes, deviation rms ${dev.rms.toFixed(3)} km max ${dev.max.toFixed(3)} km, volume ${report[id].volumeChangePercent.toFixed(2)}%, open edges ${e1.open}`);
  }
  const file = join(RAW, 'shapes-report.json');
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...old, ...report }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
