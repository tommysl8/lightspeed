/**
 * Everything the Galaxy layer needs from its data files, built in one go (in the galaxy worker, or
 * on the main thread where there is none): the particle arrays, the clusters and their clumps, the
 * face-on dust maps as half floats for the GPU, and the laws of the glow near the camera.
 */
import { DataUtils } from 'three';
import { fetchGzip } from '../stars/catalogue';
import { globularClumps, parseClusters, clumpTransfer, type ClumpBuffers, type Cluster, type ClustersFile } from './clusters';
import { createGalaxyModel, dustMaps, type GalaxyModelJson } from './model';
import modelJson from './model.json';
import { particleBuffers, particleTransfer, type ParticleBuffers } from './particles';
import { glowDisc, populationLuminosity, THICK_DISC, THIN_DISC, YOUNG_ARM_STARS, youngHz, youngSurfaceMap, type GlowDisc } from './glow';

/** Face-on dust maps: DUST_RES² texels over ±DUST_EXTENT_KPC in frame G. */
export const DUST_RES = 512;
export const DUST_EXTENT_KPC = 20;

export interface GalaxyData {
  particles: ParticleBuffers;
  clumps: ClumpBuffers;
  clusters: Cluster[];
  /**
   * Half floats, DUST_RES × DUST_RES × 4: the disc's midplane extinction (mag/kpc), its sech²
   * scale height (kpc), the arm lanes' midplane extinction and their Gaussian height. Row 0 is
   * y = −extent, column 0 x = −extent (frame G).
   */
  dust: Uint16Array;
  /**
   * Half floats, DUST_RES × DUST_RES × 2, on the same grid: the height of the warped midplane (kpc),
   * and the young arm stars' surface brightness (L☉/pc², V) for the glow near the camera (glow.ts).
   */
  warp: Uint16Array;
  /** The laws of the populations drawn as a glow near the camera, with the light their particles hold. */
  glow: { thin: GlowDisc; thick: GlowDisc; youngHz: number };
}

export type GalaxyWorkerRequest = { id: number; particlesUrl: string; clustersUrl: string };
export type GalaxyWorkerReply = { id: number; ok: true; data: GalaxyData } | { id: number; ok: false; error: string };

export const galaxyTransfer = (d: GalaxyData): ArrayBuffer[] => [...particleTransfer(d.particles), ...clumpTransfer(d.clumps), d.dust.buffer as ArrayBuffer, d.warp.buffer as ArrayBuffer];

/** The model's parameters (model.json), for the dust maps and the shader's warp. */
export const GALAXY_MODEL_JSON = modelJson as unknown as GalaxyModelJson;

/** The dust maps of the model as half floats. */
export function dustMapHalf(res = DUST_RES, extent = DUST_EXTENT_KPC): Uint16Array {
  const f = dustMaps(createGalaxyModel(GALAXY_MODEL_JSON), res, extent);
  const out = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = DataUtils.toHalfFloat(f[i]);
  return out;
}

/** The height of the warped midplane (Chen et al. 2019) on the dust maps' grid, as half floats. */
export function warpMapHalf(res = DUST_RES, extent = DUST_EXTENT_KPC): Uint16Array {
  const m = createGalaxyModel(GALAXY_MODEL_JSON);
  const out = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) {
    const y = -extent + ((j + 0.5) * 2 * extent) / res;
    for (let i = 0; i < res; i++) {
      const x = -extent + ((i + 0.5) * 2 * extent) / res;
      out[j * res + i] = DataUtils.toHalfFloat(m.warpZ(Math.hypot(x, y), (Math.atan2(y, -x) * 180) / Math.PI));
    }
  }
  return out;
}

/**
 * The warp map with the young arm stars' surface brightness beside it (two half floats a texel), for
 * young arm stars of total luminosity youngL (L☉).
 */
export function warpYoungMapHalf(youngL: number, res = DUST_RES, extent = DUST_EXTENT_KPC): Uint16Array {
  const warp = warpMapHalf(res, extent);
  const young = youngSurfaceMap(GALAXY_MODEL_JSON, youngL, res, extent);
  const out = new Uint16Array(2 * res * res);
  for (let i = 0; i < res * res; i++) {
    out[2 * i] = warp[i];
    out[2 * i + 1] = DataUtils.toHalfFloat(young[i]);
  }
  return out;
}

/** The glow's laws for the discs, holding the light the particles of each hold (glow.ts). */
export function glowLaws(particles: ParticleBuffers): GalaxyData['glow'] {
  const L = populationLuminosity(particles.attrs, particles.count);
  return {
    thin: glowDisc(GALAXY_MODEL_JSON, 'thinDisc', L[THIN_DISC]),
    thick: glowDisc(GALAXY_MODEL_JSON, 'thickDisc', L[THICK_DISC]),
    youngHz: youngHz(GALAXY_MODEL_JSON),
  };
}

/** Fetch, inflate and decode both files, and work out the dust maps. */
export async function buildGalaxyData(particlesUrl: string, clustersUrl: string): Promise<GalaxyData> {
  const [pBuf, cBuf] = await Promise.all([fetchGzip(particlesUrl), fetchGzip(clustersUrl)]);
  const particles = particleBuffers(pBuf);
  const file = JSON.parse(new TextDecoder().decode(cBuf)) as ClustersFile;
  if (file.meta?.schema !== 'lightspeed.clusters/1') throw new Error('clusters.json: unexpected schema');
  const clusters = parseClusters(file);
  const youngL = populationLuminosity(particles.attrs, particles.count)[YOUNG_ARM_STARS];
  return { particles, clumps: globularClumps(clusters), clusters, dust: dustMapHalf(), warp: warpYoungMapHalf(youngL), glow: glowLaws(particles) };
}
