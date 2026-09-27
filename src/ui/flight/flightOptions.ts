/**
 * The planner's engine settings: the rocket's acceleration (1 g unless changed) and an optional limit
 * on the time the crew spends on board. Flights planned elsewhere (scenes, journeys, the cost in
 * "Where to?") use 1 g and no limit, as their words say.
 */
import { create } from 'zustand';
import type { FlightOptions } from '../../sim/travel';

/** Accelerations offered, in g. */
export const ACCEL_CHOICES = [0.1, 1, 2, 10] as const;
/** Limits on the time on board offered, years (null: none). */
export const LIMIT_CHOICES = [null, 20, 50, 100] as const;

interface FlightOptionsState {
  accelG: number;
  /** Refuse flights that need more time on board than this, years (null: no limit). */
  maxShipYears: number | null;
}

export const useFlightOptions = create<FlightOptionsState>(() => ({ accelG: 1, maxShipYears: null }));

/** The planner's settings as travel.ts takes them. */
export function plannerFlightOptions(s: FlightOptionsState = useFlightOptions.getState()): FlightOptions {
  return { accelG: s.accelG, maxShipTimeYr: s.maxShipYears ?? undefined };
}

/** Back to 1 g and no limit ("Fly here" opens the planner set to a 1 g rocket). */
export const resetFlightOptions = (): void => useFlightOptions.setState({ accelG: 1, maxShipYears: null });
