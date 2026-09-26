// Loader for public/data/galaxy-particles.bin.gz (format written by scripts/build-galaxy.mjs) and a helper
// for the other gzip data files (clusters.json.gz). No three.js dependency.
//
// Vercel serves .gz files as opaque bytes (no Content-Encoding), so the browser does not inflate them:
// fetch -> arrayBuffer -> DecompressionStream('gzip'). If a host does add Content-Encoding: gzip, the bytes
// arrive already inflated; gunzipIfNeeded() checks the gzip magic number and handles both cases.

import { apply, GAL_TO_WORLD, type Vec3 } from './frames.ts';

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

export interface GalaxyParticles {
  count: number;
  /** Heliocentric galactic Cartesian positions, kpc (x -> l=0, y -> l=90, z -> NGP), 3 per particle. */
  positionsKpc: Float32Array;
  /** Linear sRGB colour, 0..255, largest channel 255, 3 per particle. */
  colors: Uint8Array;
  /** Index into GALAXY_POPULATIONS. */
  population: Uint8Array;
  /** V-band luminosity of the particle, L_sun. */
  luminosityLsun: Float32Array;
  /** Gaussian splat radius (1 sigma), parsecs. */
  sizePc: Float32Array;
  header: { version: number; positionScaleKpc: number; R0: number; z0: number; seed: number };
}

export async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function fetchGzip(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return gunzipIfNeeded(await res.arrayBuffer());
}

export function decodeGalaxyParticles(buf: ArrayBuffer): GalaxyParticles {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'LSGP') throw new Error('not a galaxy particle file');
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`unsupported version ${version}`);
  const count = dv.getUint32(8, true);
  const stride = dv.getUint32(12, true);
  const posScale = dv.getFloat32(16, true);
  const lumUnit = dv.getFloat32(20, true);
  const sizeUnit = dv.getFloat32(24, true);
  const positionsKpc = new Float32Array(3 * count);
  const colors = new Uint8Array(3 * count);
  const population = new Uint8Array(count);
  const luminosityLsun = new Float32Array(count);
  const sizePc = new Float32Array(count);
  const lumTable = new Float32Array(256);
  const sizeTable = new Float32Array(256);
  for (let c = 0; c < 256; c++) {
    lumTable[c] = lumUnit * 2 ** (c / 8);
    sizeTable[c] = sizeUnit * 2 ** (c / 16);
  }
  for (let i = 0; i < count; i++) {
    const o = 64 + i * stride;
    positionsKpc[3 * i] = dv.getInt16(o, true) * posScale;
    positionsKpc[3 * i + 1] = dv.getInt16(o + 2, true) * posScale;
    positionsKpc[3 * i + 2] = dv.getInt16(o + 4, true) * posScale;
    colors[3 * i] = dv.getUint8(o + 6);
    colors[3 * i + 1] = dv.getUint8(o + 7);
    colors[3 * i + 2] = dv.getUint8(o + 8);
    population[i] = dv.getUint8(o + 9);
    luminosityLsun[i] = lumTable[dv.getUint8(o + 10)];
    sizePc[i] = sizeTable[dv.getUint8(o + 11)];
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
