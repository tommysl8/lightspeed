/**
 * One frame of simulated time, split in the two steps the simulation driver runs around the
 * ephemeris update. Kept out of the React component so the tests can fly whole trips.
 *
 * Near a black hole (sim/gravity.ts: 1 − α > 10⁻⁴, within 5,000 r_s) the time warp paces the proper
 * time of an observer hovering there: each real second, warp seconds pass on that observer's clock and
 * warp/α on home's (the clock, sim.timeMs), so "the present" cannot be kept and live mode ends. A fall
 * paces the faller's own proper time and sets home's clock from its closed form (sim/fall.ts). Trips
 * pace the crew's time as before; everywhere else this is today's code, line for line.
 */
import { astroTimeAt } from '../lib/time';
import { chronoIntegrate, chronoTrip, chronoTripEnd } from './chronometer';
import { advanceClock, followWallClock } from './clock';
import { advanceFallClock, fall } from './fall';
import { gravity } from './gravity';
import { sim } from './sim';
import { advanceTripClock, lagAtTau, tauAtEarthTime, travel, tripElapsed, updateTrip, type Trip } from './travel';

/**
 * Advance the clock by one frame of `dtReal` real seconds. A real trip plays by ship time and
 * sets the Earth clock from it: cosmic time on a flight through the expanding universe, which
 * runs on by millions or billions of years (sim/cosmicTime.ts follows). A live clock (showing
 * the present) follows the computer's clock, `nowMs`, when one is given; otherwise the clock
 * runs at the time warp. Returns the simulated (Sun-frame) seconds that passed.
 */
export function tickClock(dtReal: number, nowMs?: number): number {
  // Anything that takes the clock off real time ends "live" (the controls clear it too).
  if (sim.live && (sim.paused || sim.warp !== 1 || travel.trip || fall.trip || gravity.paced)) sim.live = false;
  const running = sim.paused ? 0 : dtReal;
  const tripDt = advanceTripClock(running);
  const fallDt = tripDt ?? advanceFallClock(running);
  const dtSim =
    fallDt ??
    (gravity.paced
      ? // The warp is the rate of a clock hovering here: home's runs 1/α faster (the previous frame's gravity).
        advanceClock((running * sim.warp) / gravity.alpha)
      : sim.live && nowMs !== undefined
        ? followWallClock(nowMs)
        : advanceClock(running * sim.warp));
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
    // A fall hands the chronometers its own τ, home's T (on the free-fallers' clocks) and T − τ.
    const f = fall.trip;
    if (f) chronoTrip(f.state.T, f.lag, f.state.tau);
    else chronoIntegrate(dtSim);
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
