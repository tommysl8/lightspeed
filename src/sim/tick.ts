/**
 * One frame of simulated time, split in the two steps the simulation driver runs around the
 * ephemeris update. Kept out of the React component so the tests can fly whole trips.
 */
import { astroTimeAt } from '../lib/time';
import { chronoIntegrate, chronoTrip, chronoTripEnd } from './chronometer';
import { advanceClock } from './clock';
import { sim } from './sim';
import { advanceTripClock, lagAtTau, tauAtEarthTime, travel, tripElapsed, updateTrip, type Trip } from './travel';

/**
 * Advance the clock by one frame of `dtReal` real seconds. A real trip plays by ship time and
 * sets the Earth clock from it; otherwise the clock runs at the time warp. Returns the
 * simulated (Sun-frame) seconds that passed.
 */
export function tickClock(dtReal: number): number {
  const live = sim.paused ? 0 : dtReal;
  const tripDt = advanceTripClock(live);
  const dtSim = tripDt ?? advanceClock(live * sim.warp);
  sim.astroTime = astroTimeAt(sim.timeMs);
  return dtSim;
}

/**
 * After the ephemeris update: move the ship and keep the chronometers on the trip's
 * closed-form solution (a ship-paced trip hands over its own τ; t and the lag both come from
 * it without subtracting large numbers), or integrate them at rest. Returns the trip that
 * arrived this frame, if one did.
 */
export function tickTrip(dtSim: number): Trip | null {
  const trip = travel.trip;
  if (!trip) {
    chronoIntegrate(dtSim);
    return null;
  }
  const arrived = updateTrip();
  const elapsed = tripElapsed(trip);
  const tau = trip.pacing === 'ship' ? trip.tau : tauAtEarthTime(trip, elapsed);
  chronoTrip(elapsed, lagAtTau(trip, tau), tau);
  if (!arrived) return null;
  chronoTripEnd();
  // The rest of this frame after arrival (large with time warp or a skip) is spent at rest
  // with the destination. Ship-paced trips stop the clock exactly on arrival.
  if (trip.pacing !== 'ship') chronoIntegrate((sim.timeMs - trip.startMs) / 1000 - trip.earthTime);
  return trip;
}
