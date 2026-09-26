/**
 * Reader for public/models/<id>.bin ("LSM1" meshes written by scripts/build-shapes.mjs).
 *
 * Layout (little-endian): 32-byte header, then Float32 positions (x, y, z in km, body-fixed
 * frame), then Uint16 or Uint32 triangle indices (counter-clockwise seen from outside).
 *
 *   0  'LSM1'   4  u32 version (1)   8  u32 vertexCount   12  u32 triangleCount
 *   16 u32 bytesPerIndex (2|4)   20 f32 maxRadiusKm   24 f32 equalVolumeRadiusKm   28 u32 reserved
 *
 * For three.js: new BufferGeometry() with position = BufferAttribute(positions, 3) and index =
 * BufferAttribute(indices, 1), then computeVertexNormals(). Units are km, like the rest of the app.
 */
export interface Lsm1Mesh {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  triangleCount: number;
  maxRadiusKm: number;
  equalVolumeRadiusKm: number;
}

export function parseLsm1(data: ArrayBuffer | Uint8Array): Lsm1Mesh {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'LSM1') throw new Error(`not an LSM1 mesh (magic ${JSON.stringify(magic)})`);
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`unsupported LSM1 version ${version}`);
  const vertexCount = view.getUint32(8, true);
  const triangleCount = view.getUint32(12, true);
  const ib = view.getUint32(16, true);
  if (ib !== 2 && ib !== 4) throw new Error(`bad index size ${ib}`);
  const posBytes = 12 * vertexCount;
  const expected = 32 + posBytes + ib * 3 * triangleCount;
  if (bytes.byteLength < expected) throw new Error(`truncated LSM1: ${bytes.byteLength} < ${expected} bytes`);
  // Copy into fresh arrays: the source buffer's byte offset may not be 4-byte aligned.
  const positions = new Float32Array(3 * vertexCount);
  for (let i = 0; i < 3 * vertexCount; i++) positions[i] = view.getFloat32(32 + 4 * i, true);
  const indices = ib === 2 ? new Uint16Array(3 * triangleCount) : new Uint32Array(3 * triangleCount);
  const base = 32 + posBytes;
  for (let i = 0; i < 3 * triangleCount; i++) {
    indices[i] = ib === 2 ? view.getUint16(base + 2 * i, true) : view.getUint32(base + 4 * i, true);
  }
  return {
    positions,
    indices,
    vertexCount,
    triangleCount,
    maxRadiusKm: view.getFloat32(20, true),
    equalVolumeRadiusKm: view.getFloat32(24, true),
  };
}
