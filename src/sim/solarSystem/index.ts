/**
 * The complete Solar System: moons on fitted orbit models, and dwarf planets, comets,
 * interstellar objects and spacecraft on Chebyshev tracks, registered in the body registry once
 * their data have loaded. See docs/bodies.md and docs/data/.
 */
export { loadSolarSystem, registerSolarSystem, solarSystemIds, solarSystemStatus, subscribeSolarSystem, type SolarSystemStatus } from './load';
export {
  SHAPE_MAX_RADIUS_KM,
  TRACK_CENTRES,
  fittedMoonProvider,
  longDate,
  ringSpec,
  rotationOf,
  solarSystemRecords,
  trackBodyProvider,
  twoFigures,
  type CoreRecords,
  type SolarSystemData,
} from './records';
export type { BodiesFile, DataBody, RingsFile, RingSystem } from './data';
