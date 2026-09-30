/**
 * The lens's tables as the GPU reads them: the forward table (R32F, (n + 2) × 1: δ at nodes −1 … n), the
 * inverse table (RG32F, (n + 2) × 2: row 0 over z = asinh((π − D)/2θ_E), row 1 over D ∈ [2π, 4π), each texel
 * (y = ln(α − α_edge), m = −ln|dΔφ/dα|)) and Gould's finite-source factor B0(z)/z (R32F, 130 × 1, z = −1/16 … 8).
 *
 * How: the float64 tables of physics/schwarzschildTables.ts are copied into Float32Arrays (fillForwardTexels,
 * fillInverseTexels: the same code builds the float32 mirror's tables, physics/lensMirror32.ts) and uploaded
 * the same frame; the textures keep their size, so three.js updates them in place (texSubImage2D). All are
 * NEAREST and read with texelFetch (float32 filtering is an extension phones lack; the chunk interpolates by
 * hand).
 *
 * Why here: render/lens/lensState.ts writes them into the shared lens uniforms (lensUniforms.ts) the first time
 * a lens is drawn; nothing is allocated far from holes.
 *
 * Cost: 2 kB and 4 kB uploads when r changes (every frame in flight near a hole), none at rest; the B0(z)/z table
 * once.
 *
 * Twins: render/shaders/lens.glsl (lensDelta, lensInvGap, lensB0OverZ read these layouts), physics/lensMirror32.ts.
 */
import { DataTexture, FloatType, NearestFilter, RedFormat, RGFormat } from 'three';
import { B0Z_TEXELS, fillB0OverZ } from '../../physics/lensPoint';
import { FWD_NODES, INV_NODES, REL_NODES, type ForwardTable, type InverseTable } from '../../physics/schwarzschildTables';

/** Texels of a row of the inverse table as uploaded: the wider of its two rows (row 1 is padded). */
export const INV_TEXELS = Math.max(INV_NODES, REL_NODES) + 2;

/** Copies the forward table's δ (nodes −1 … n) into `out` (length n + 2). */
export function fillForwardTexels(fwd: ForwardTable, out: Float32Array): Float32Array {
  const d = fwd.delta;
  for (let i = 0; i < d.length && i < out.length; i++) out[i] = d[i];
  return out;
}

/**
 * Copies the inverse table into `out` (RG, `width` texels a row, two rows: 2 × 2 × width floats): row 0 texel i =
 * (y[i], m[i]) (node i − 1), row 1 texel i = (rel.y[i], rel.m[i]); the rest of row 1 repeats its last texel.
 */
export function fillInverseTexels(inv: InverseTable, out: Float32Array, width = INV_TEXELS): Float32Array {
  const n0 = inv.y.length;
  for (let i = 0; i < width; i++) {
    const j = Math.min(i, n0 - 1);
    out[2 * i] = inv.y[j];
    out[2 * i + 1] = inv.m[j];
  }
  const r = inv.rel;
  const n1 = r.y.length;
  const base = 2 * width;
  for (let i = 0; i < width; i++) {
    const j = Math.min(i, n1 - 1);
    out[base + 2 * i] = r.y[j];
    out[base + 2 * i + 1] = r.m[j];
  }
  return out;
}

function floatTexture(data: Float32Array, w: number, h: number, format: typeof RedFormat | typeof RGFormat, internal: 'R32F' | 'RG32F'): DataTexture {
  const t = new DataTexture(data, w, h, format, FloatType);
  t.internalFormat = internal;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.unpackAlignment = 4;
  t.needsUpdate = true;
  return t;
}

/** The three textures, made on first use and kept (updated in place). */
export const lensTextures = {
  forward: null as DataTexture | null,
  inverse: null as DataTexture | null,
  b0z: null as DataTexture | null,
  /** The table versions last uploaded. */
  forwardVersion: -1,
  inverseVersion: -1,
};

/** The forward table's texture, updated from `fwd` when its version moved. */
export function forwardTexture(fwd: ForwardTable): DataTexture {
  let t = lensTextures.forward;
  const w = FWD_NODES + 2;
  if (!t) t = lensTextures.forward = floatTexture(new Float32Array(w), w, 1, RedFormat, 'R32F');
  if (lensTextures.forwardVersion !== fwd.version || fwd.n + 2 !== w) {
    fillForwardTexels(fwd, t.image.data as Float32Array);
    t.needsUpdate = true;
    lensTextures.forwardVersion = fwd.version;
  }
  return t;
}

/** The inverse table's texture, updated from `inv` when its version moved. */
export function inverseTexture(inv: InverseTable): DataTexture {
  let t = lensTextures.inverse;
  if (!t) t = lensTextures.inverse = floatTexture(new Float32Array(4 * INV_TEXELS), INV_TEXELS, 2, RGFormat, 'RG32F');
  if (lensTextures.inverseVersion !== inv.version) {
    fillInverseTexels(inv, t.image.data as Float32Array);
    t.needsUpdate = true;
    lensTextures.inverseVersion = inv.version;
  }
  return t;
}

/** Gould's B0(z)/z table, built once. */
export function b0zTexture(): DataTexture {
  if (!lensTextures.b0z) lensTextures.b0z = floatTexture(fillB0OverZ(new Float32Array(B0Z_TEXELS)), B0Z_TEXELS, 1, RedFormat, 'R32F');
  return lensTextures.b0z;
}
