/**
 * Body positions, velocities and orientations in the world frame (km, km/s), at any date.
 *
 * Every body is registered in the body registry (sim/bodies), each with its own position
 * provider: the built-in bodies follow the date policy of ephemerisPolicy.ts (astronomy-engine
 * in 1700–2200, Standish's elements to 3000 BCE–3000 CE, frozen elements beyond; see
 * bodies/providers/engine.ts); Voyager 1 comes from voyager.ts. This module keeps the names the
 * rest of the app has always used.
 */
import { sim } from './sim';
import { updateWorld } from './bodies';

export {
  ephemerisQuality,
  qualityNote,
  QUALITY_NOTES,
  PRECISE_START_MS,
  PRECISE_END_MS,
  APPROX_START_MS,
  APPROX_END_MS,
  type EphemerisQuality,
} from './ephemerisPolicy';

export {
  VOYAGER1_LAUNCH_MS,
  VOYAGER1_MODEL_START_MS,
  bodyAvailability,
  bodyOrientation,
  bodyPositionAt,
  bodyStateAt,
  isBodyAvailable,
  moonGeocentric,
  type Availability,
} from './bodies';

/** Update positions, velocities, orientations and availability of every body for sim.astroTime. */
export function updateEphemeris(): void {
  updateWorld(sim.astroTime);
}
