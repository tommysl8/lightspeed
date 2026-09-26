/**
 * Shape models of irregular bodies: triangle meshes in the "LSM1" format of the phase-2 data
 * (staging/phase2/assets.md §3), loaded lazily and cached.
 *
 * LSM1, little-endian: "LSM1", u32 version 1, u32 vertex count V, u32 triangle count T, u32
 * bytes per index (2 or 4), f32 largest vertex distance (km), f32 equal-volume radius (km),
 * u32 reserved; then f32[3V] positions (km, body-fixed: +z the north pole, +x the prime
 * meridian) and u16/u32[3T] indices, counter-clockwise seen from outside.
 *
 * The geometry comes out in mesh axes (three.js x, y, z = body x, z, −y), so a body's rotation
 * orients it like a sphere, with UVs from each vertex's longitude and latitude so the same
 * equirectangular maps fit, and a seam split where triangles cross longitude 180°.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { assetUrl } from './textures';

export interface Lsm1 {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  maxRadiusKm: number;
  equalVolumeRadiusKm: number;
}

/** Read an LSM1 file. Throws on anything else. */
export function parseLsm1(data: ArrayBuffer): Lsm1 {
  const dv = new DataView(data);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'LSM1' || dv.getUint32(4, true) !== 1) throw new Error('shape: not an LSM1 v1 file');
  const V = dv.getUint32(8, true);
  const T = dv.getUint32(12, true);
  const bpi = dv.getUint32(16, true);
  const posBytes = 12 * V;
  if (32 + posBytes + bpi * 3 * T > data.byteLength || (bpi !== 2 && bpi !== 4)) throw new Error('shape: truncated or malformed LSM1 file');
  const positions = new Float32Array(data.slice(32, 32 + posBytes));
  const idx = data.slice(32 + posBytes, 32 + posBytes + bpi * 3 * T);
  return {
    positions,
    indices: bpi === 2 ? new Uint16Array(idx) : new Uint32Array(idx),
    maxRadiusKm: dv.getFloat32(20, true),
    equalVolumeRadiusKm: dv.getFloat32(24, true),
  };
}

/** A three.js geometry from a shape: mesh axes, km, with normals and longitude–latitude UVs. */
export function shapeGeometry(s: Lsm1): BufferGeometry {
  const n = s.positions.length / 3;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = s.positions[3 * i];
    const y = s.positions[3 * i + 1];
    const z = s.positions[3 * i + 2];
    pos.push(x, z, -y);
    const lon = Math.atan2(y, x);
    const lat = Math.atan2(z, Math.hypot(x, y));
    uv.push(0.5 + lon / (2 * Math.PI), 0.5 + lat / Math.PI);
  }
  // Split the seam: a triangle whose longitudes straddle ±180° gets copies of its western
  // vertices shifted a full turn east, so the texture does not smear across the body.
  const index: number[] = [];
  const copies = new Map<number, number>();
  const east = (v: number) => {
    let c = copies.get(v);
    if (c === undefined) {
      c = pos.length / 3;
      pos.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
      uv.push(uv[2 * v] + 1, uv[2 * v + 1]);
      copies.set(v, c);
    }
    return c;
  };
  for (let t = 0; t < s.indices.length; t += 3) {
    let a = s.indices[t];
    let b = s.indices[t + 1];
    let c = s.indices[t + 2];
    const ua = uv[2 * a];
    const ub = uv[2 * b];
    const uc = uv[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) {
      if (ua < 0.5) a = east(a);
      if (ub < 0.5) b = east(b);
      if (uc < 0.5) c = east(c);
    }
    index.push(a, b, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const cache = new Map<string, Promise<{ geometry: BufferGeometry; shape: Lsm1 } | null>>();
/** Largest vertex distance of each shape loaded so far, km (camera limits read it synchronously). */
const extents = new Map<string, number>();

/** The largest distance of a loaded shape's surface from its centre, km; undefined until it has loaded. */
export const shapeMaxRadiusKm = (path: string): number | undefined => extents.get(path);

/** Load a shape model once (a path from public/, e.g. "models/phobos.bin"); null on failure. */
export function loadShape(path: string): Promise<{ geometry: BufferGeometry; shape: Lsm1 } | null> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(assetUrl(path))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((buf) => {
        const shape = parseLsm1(buf);
        if (shape.maxRadiusKm > 0) extents.set(path, shape.maxRadiusKm);
        return { geometry: shapeGeometry(shape), shape };
      })
      .catch((err) => {
        console.warn(`[lightspeed] shape model failed to load, drawing an ellipsoid: ${path} (${err})`);
        return null;
      });
    cache.set(path, p);
  }
  return p;
}
