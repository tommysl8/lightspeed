/**
 * The Milky Way: the sky from the Sun (NASA SVS, from Gaia), a particle model of the whole Galaxy
 * built from published measurements, the star clusters, the nebulae with their pictures, and
 * Sagittarius A* with the stars that orbit it. See docs/data/galaxy.md.
 */
export * from './frames';
export * from './background';
export { ARM_NAMES, armAt, galaxyModel, tangentAzimuth, tracedRange, type ArmPlace } from './arms';
export {
  clusterAliases,
  clusterDisplayName,
  clusterId,
  isFamousCluster,
  parseClusters,
  type Cluster,
  type ClustersFile,
  type GlobularCluster,
  type OpenCluster,
} from './clusters';
export { DUST_EXTENT_KPC, DUST_RES, GALAXY_MODEL_JSON, type GalaxyData } from './galaxyData';
export {
  galaxyState,
  galaxyStatus,
  galaxyVersion,
  loadGalaxy,
  loadNebulae,
  nebulaStatus,
  registerClusters,
  registerGalaxyCore,
  registerNebulae,
  subscribeGalaxy,
  SSTARS,
  type GalaxyStatus,
} from './load';
export {
  MILKY_WAY_ID,
  MILKY_WAY_MODEL_LABEL,
  OUTSIDE_VIEW_KM,
  SGR_A_ID,
  clusterRecords,
  lightYears,
  milkyWayRecord,
  nebulaArticle,
  nebulaRecords,
  schwarzschildRadiusKm,
  sgrAFrom,
  sgrARecord,
  shadowRadiusKm,
  sStarRecords,
  type NebulaJson,
  type NebulaeFile,
  type SgrA,
} from './records';
export { GALAXY_POPULATIONS, particleBuffers, type ParticleBuffers } from './particles';
