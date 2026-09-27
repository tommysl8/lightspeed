/**
 * The particle model of the Milky Way: public/data/galaxy-particles.bin.gz, written by
 * scripts/build-galaxy.mjs from the parameters in model.json (docs/data/galaxy.md).
 *
 * 199,500 particles, each a random draw from the model's density laws (not a star): heliocentric
 * galactic position in steps of 2 pc, linear sRGB colour, population, V-band luminosity and a
 * Gaussian splat radius. The records are shuffled, so the first k are an unbiased subsample.
 *
 * Format (little-endian). Header, 64 bytes:
 *    0 "LSGP"   4 uint32 version = 1   8 uint32 count N   12 uint32 stride = 12
 *   16 float32 kpc per int16 unit (0.002)   20 float32 luminosity unit (1 L☉)   24 float32 size unit (1 pc)
 *   28 float32 R0 (kpc)   32 float32 z0 (kpc)   36 uint32 seed   40 uint32 flags   44 uint32 populations (10)
 * Record, 12 bytes:
 *    0 int16 x, y, z (heliocentric galactic: x towards l = 0, y towards l = 90°, z towards the NGP)
 *    6 uint8 r, g, b (linear sRGB, largest channel 255)   9 uint8 population
 *   10 uint8 luminosity code: L = 2^(code/8) L☉   11 uint8 size code: h = 2^(code/16) pc
 */
import { blackbodyRgb } from '../../physics/blackbody';
import { apply, GAL_TO_WORLD, type Vec3 } from './frames';

export const GALAXY_POPULATIONS = [
  'thinDisc',
  'youngArmStars',
  'hiiRegions',
  'thickDisc',
  'bulge',
  'barThin',
  'barSuperThin',
  'nuclearStellarDisc',
  'nuclearStarCluster',
  'stellarHalo',
] as const;
export type GalaxyPopulation = (typeof GALAXY_POPULATIONS)[number];

/** Population index of the H II regions (emission-line colours, not a blackbody). */
export const HII_POPULATION = 2;

export interface GalaxyParticles {
  count: number;
  /** Heliocentric galactic Cartesian positions, kpc (x → l = 0, y → l = 90°, z → NGP), 3 per particle. */
  positionsKpc: Float32Array;
  /** Linear sRGB colour, 0..255, largest channel 255, 3 per particle. */
  colors: Uint8Array;
  /** Index into GALAXY_POPULATIONS. */
  population: Uint8Array;
  /** V-band luminosity of the particle, L☉. */
  luminosityLsun: Float32Array;
  /** Gaussian splat radius (1σ), parsecs. */
  sizePc: Float32Array;
  header: { version: number; positionScaleKpc: number; R0: number; z0: number; seed: number };
}

const HEADER_BYTES = 64;

function readHeader(dv: DataView): { count: number; stride: number; posScale: number; lumUnit: number; sizeUnit: number; version: number } {
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'LSGP') throw new Error('not a galaxy particle file');
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`unsupported galaxy particle file version ${version}`);
  const count = dv.getUint32(8, true);
  const stride = dv.getUint32(12, true);
  if (stride !== 12 || dv.byteLength < HEADER_BYTES + count * stride) throw new Error('galaxy particle file: bad size');
  return { count, stride, posScale: dv.getFloat32(16, true), lumUnit: dv.getFloat32(20, true), sizeUnit: dv.getFloat32(24, true), version };
}

/** Decode the whole file into plain arrays (for tests and analysis; the renderer uses particleBuffers). */
export function decodeGalaxyParticles(buf: ArrayBuffer): GalaxyParticles {
  const dv = new DataView(buf);
  const { count, stride, posScale, lumUnit, sizeUnit, version } = readHeader(dv);
  const positionsKpc = new Float32Array(3 * count);
  const colors = new Uint8Array(3 * count);
  const population = new Uint8Array(count);
  const luminosityLsun = new Float32Array(count);
  const sizePc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * stride;
    positionsKpc[3 * i] = dv.getInt16(o, true) * posScale;
    positionsKpc[3 * i + 1] = dv.getInt16(o + 2, true) * posScale;
    positionsKpc[3 * i + 2] = dv.getInt16(o + 4, true) * posScale;
    colors[3 * i] = dv.getUint8(o + 6);
    colors[3 * i + 1] = dv.getUint8(o + 7);
    colors[3 * i + 2] = dv.getUint8(o + 8);
    population[i] = dv.getUint8(o + 9);
    luminosityLsun[i] = lumUnit * 2 ** (dv.getUint8(o + 10) / 8);
    sizePc[i] = sizeUnit * 2 ** (dv.getUint8(o + 11) / 16);
  }
  return {
    count,
    positionsKpc,
    colors,
    population,
    luminosityLsun,
    sizePc,
    header: { version, positionScaleKpc: posScale, R0: dv.getFloat32(28, true), z0: dv.getFloat32(32, true), seed: dv.getUint32(36, true) },
  };
}

/** Rotate heliocentric galactic positions into the app's world axes, scaled by `unitsPerKpc`. */
export function galacticToWorld(positionsKpc: Float32Array, unitsPerKpc = 1): Float32Array {
  const out = new Float32Array(positionsKpc.length);
  for (let i = 0; i < positionsKpc.length; i += 3) {
    const w = apply(GAL_TO_WORLD, [positionsKpc[i], positionsKpc[i + 1], positionsKpc[i + 2]] as Vec3);
    out[i] = w[0] * unitsPerKpc;
    out[i + 1] = w[1] * unitsPerKpc;
    out[i + 2] = w[2] * unitsPerKpc;
  }
  return out;
}

// ─── Temperatures for the Doppler shift ─────────────────────────────────────────────────

/**
 * Colour temperatures are stored as a byte: T = TEMP_MIN_K · 2^(code / TEMP_STEPS_PER_OCTAVE),
 * 1,000 K to 256,000 K in steps of 2.2%.
 */
export const TEMP_MIN_K = 1000;
export const TEMP_STEPS_PER_OCTAVE = 32;

export const tempFromCode = (code: number): number => TEMP_MIN_K * 2 ** (code / TEMP_STEPS_PER_OCTAVE);

/** Blue-to-red ratio of the app's blackbody colours (render/materials, physics/blackbody) at each code. */
let ratioTable: Float64Array | null = null;
function ratios(): Float64Array {
  if (ratioTable) return ratioTable;
  ratioTable = new Float64Array(256);
  for (let c = 0; c < 256; c++) {
    const [r, , b] = blackbodyRgb(tempFromCode(c));
    ratioTable[c] = b / Math.max(r, 1e-9);
  }
  return ratioTable;
}

/**
 * The temperature code of the blackbody whose colour matches a linear-sRGB colour best (by its
 * blue-to-red ratio, which rises monotonically with temperature). The particles' colours are
 * blackbodies at a temperature from each population's B−V (model.json colours), so this recovers
 * that temperature for the relativistic Doppler shift; for the H II regions, whose light is
 * emission lines, it is an effective temperature for the same purpose.
 */
export function temperatureCode(r: number, b: number): number {
  const t = ratios();
  const want = b / Math.max(r, 1e-9);
  let lo = 0;
  let hi = 255;
  if (want <= t[0]) return 0;
  if (want >= t[255]) return 255;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= want) lo = mid;
    else hi = mid;
  }
  return want - t[lo] < t[hi] - want ? lo : hi;
}

// ─── GPU buffers ─────────────────────────────────────────────────────────────────────────

/**
 * What the renderer uploads (scene/GalaxyModel.tsx), 10 bytes a particle: the positions as stored
 * (int16 steps of `kpcPerUnit`), the colours, and per particle its population, luminosity code,
 * size code and temperature code.
 */
export interface ParticleBuffers {
  count: number;
  /**
   * The H II regions come first (this many), then the rest in the file's shuffled order: each H II
   * region is a single object, always drawn, while a drawing of the first k particles is an
   * unbiased subsample of the rest.
   */
  singles: number;
  kpcPerUnit: number;
  /** int16 × 3: heliocentric galactic position in steps of kpcPerUnit. */
  position: Int16Array;
  /** uint8 × 3: linear sRGB, largest channel 255. */
  color: Uint8Array;
  /** uint8 × 4: population, luminosity code (L = 2^(c/8) L☉), size code (h = 2^(c/16) pc), temperature code. */
  attrs: Uint8Array;
}

/** The typed arrays of a ParticleBuffers, to transfer from the worker without copying. */
export const particleTransfer = (p: ParticleBuffers): ArrayBuffer[] => [p.position.buffer as ArrayBuffer, p.color.buffer as ArrayBuffer, p.attrs.buffer as ArrayBuffer];

/**
 * The order the renderer takes the file's records in: the H II regions first, then the others,
 * each in the file's order. order[k] is the record drawn k-th.
 */
export function drawOrder(buf: ArrayBuffer): { order: Uint32Array; singles: number } {
  const dv = new DataView(buf);
  const { count, stride } = readHeader(dv);
  const order = new Uint32Array(count);
  let singles = 0;
  for (let i = 0; i < count; i++) if (dv.getUint8(HEADER_BYTES + i * stride + 9) === HII_POPULATION) order[singles++] = i;
  let k = singles;
  for (let i = 0; i < count; i++) if (dv.getUint8(HEADER_BYTES + i * stride + 9) !== HII_POPULATION) order[k++] = i;
  return { order, singles };
}

/** Split the file's records into the arrays the renderer uploads, in drawOrder (runs in the galaxy worker). */
export function particleBuffers(buf: ArrayBuffer): ParticleBuffers {
  const dv = new DataView(buf);
  const { count, stride, posScale, lumUnit, sizeUnit } = readHeader(dv);
  if (lumUnit !== 1 || sizeUnit !== 1) throw new Error('galaxy particle file: unexpected units');
  const { order, singles } = drawOrder(buf);
  const position = new Int16Array(3 * count);
  const color = new Uint8Array(3 * count);
  const attrs = new Uint8Array(4 * count);
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + order[i] * stride;
    position[3 * i] = dv.getInt16(o, true);
    position[3 * i + 1] = dv.getInt16(o + 2, true);
    position[3 * i + 2] = dv.getInt16(o + 4, true);
    const r = dv.getUint8(o + 6);
    const g = dv.getUint8(o + 7);
    const b = dv.getUint8(o + 8);
    color[3 * i] = r;
    color[3 * i + 1] = g;
    color[3 * i + 2] = b;
    attrs[4 * i] = dv.getUint8(o + 9);
    attrs[4 * i + 1] = dv.getUint8(o + 10);
    attrs[4 * i + 2] = dv.getUint8(o + 11);
    attrs[4 * i + 3] = temperatureCode(r, b);
  }
  return { count, singles, kpcPerUnit: posScale, position, color, attrs };
}
