/**
 * The body registry's public face. Import bodies from here (not from registry.ts): this module
 * registers the built-in bodies before anyone can ask for them.
 */
import { registerCoreBodies } from './core';

registerCoreBodies();

export type {
  Availability,
  BodyId,
  BodyKind,
  BodyPhysical,
  BodyRecord,
  BodyVisual,
  IauRotationSpec,
  OrbitLineSpec,
  PhaseAngleSystem,
  PositionProvider,
  Regime,
  RelativeState,
  RingSpec,
  RotationProvider,
  RotationSpec,
  Vec3Like,
} from './types';
export {
  bodyIds,
  bodyName,
  bodyRecord,
  bodyRecords,
  childrenOf,
  displayRadiusKm,
  getBody,
  isBody,
  isWithin,
  kindName,
  kindText,
  lineage,
  recordSerial,
  registerBodies,
  registerBody,
  registryVersion,
  replaceBodies,
  rootOf,
  subscribeRegistry,
  systemOf,
  unregisterBodies,
  unregisterBody,
} from './registry';
export {
  bodyAvailability,
  bodyOrientation,
  bodyPositionAt,
  bodyStateAt,
  heliocentricEclAt,
  heliocentricEclStateAt,
  isBodyAvailable,
  updateWorld,
} from './world';
export { compileRotation, iauAngles, orientationFromPole } from './rotation';
export { PLUTO_BARYCENTRE, coreBodyRecords } from './core';
export { engineRotation, moonGeocentric, planetProvider, moonProvider, sunProvider, policyAvailability } from './providers/engine';
export {
  ALWAYS,
  VOYAGER1_LAUNCH_MS,
  VOYAGER1_MODEL_START_MS,
  atCentreProvider,
  fixedOffsetProvider,
  fixedStarProvider,
  keplerProvider,
  twoBodyProvider,
  voyager1Provider,
  type KeplerElements,
} from './providers/simple';
export {
  jupiterMoonProvider,
  relativeOrbitProvider,
  trackProvider,
  ttDaysFromMs,
  type GalileanMoon,
  type RelativeOrbitModel,
  type RelativeOrbitOptions,
  type TrackOptions,
  type TrackSample,
  type TrackSource,
} from './providers/adapters';
export { moonState, type FittedMoonModel } from './providers/moonState';
