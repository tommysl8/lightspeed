// Public surface of the cosmology module (see ../cosmology.md).
export * from './constants.ts';
export { Cosmology, PLANCK18, planck18, type CosmologyParams, type MasterTable } from './cosmology.ts';
export {
  planFlipAndBurn,
  planCruise,
  planStatic,
  planStaticCruise,
  planRoundTrip,
  maxReach,
  stateAtShipTime,
  sampleAt,
  staticShipTimeYr,
  tripSummary,
  MIN_ACCEL_M_S2,
  DEPARTURE_SCALE_MIN,
  DEPARTURE_SCALE_MAX,
  type TripPlan,
  type Unreachable,
  type UnreachableReason,
  type PlanOptions,
  type CruiseOptions,
  type ShipState,
  type TrajectorySamples,
  type Phase,
} from './ship.ts';
export { LOCAL_GROUP, isBoundToLocalGroup, localGroupBarycentre, propagationModel, planTrip, type Destination } from './policy.ts';
export {
  Z_RECOMBINATION,
  appearance,
  emissionScale,
  dopplerFromRapidity,
  aberrateCos,
  aberrateDirection,
  lastVisibleEmissionTimeGyr,
  buildEmissionTable,
  emissionLnAFast,
  emissionLn1pZFast,
  type Appearance,
  type EmissionTable,
} from './appearance.ts';
export { FUTURE, homeAt, homeReport, sunAt, mwM31MergedProbability, extragalacticSky, type HomeReport, type SunState, type LandmarkView } from './future.ts';
