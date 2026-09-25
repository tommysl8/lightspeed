/**
 * Simulation clock controls. Real time (1×) is the default, so you feel that even light takes
 * over eight minutes to reach Earth.
 */
import { sim } from './sim';
import { useUI } from '../state/ui';
import { zeroChrono } from './chronometer';
import { clearPulses } from './pulses';

export const WARP_STEPS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];

export function setWarp(w: number): void {
  sim.warp = w;
  useUI.setState({ warp: w });
}

export function setPaused(p: boolean): void {
  sim.paused = p;
  useUI.setState({ paused: p });
}

export const togglePause = (): void => setPaused(!sim.paused);

export function stepWarp(dir: 1 | -1): void {
  const i = WARP_STEPS.indexOf(sim.warp);
  const next = WARP_STEPS[Math.min(WARP_STEPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
  setWarp(next);
}

/**
 * Back to the present moment at real time. Not allowed mid-trip, where time can't run
 * backwards. The chronometers are zeroed and pulses in flight are discarded.
 */
export function resetToNow(): void {
  if (useUI.getState().tripActive) return;
  sim.timeMs = Date.now();
  zeroChrono();
  clearPulses();
  setWarp(1);
  setPaused(false);
}

/** Earliest and latest settable epochs: the Voyager 1 model starts after its Saturn flyby (1980). */
export const EPOCH_MIN_MS = Date.UTC(1981, 0, 1);
export const EPOCH_MAX_MS = Date.UTC(2199, 11, 31);

/**
 * Set the simulation epoch (UTC ms). Not allowed mid-trip. Like "now", it zeroes the
 * chronometers and discards pulses in flight, since time may have run backwards.
 */
export function setEpoch(ms: number): boolean {
  if (useUI.getState().tripActive || !Number.isFinite(ms)) return false;
  sim.timeMs = Math.min(EPOCH_MAX_MS, Math.max(EPOCH_MIN_MS, ms));
  zeroChrono();
  clearPulses();
  return true;
}

/** Jump forward in simulated time (used by "jump to arrival"). */
export function advanceTime(seconds: number): void {
  if (seconds > 0) sim.timeMs += seconds * 1000;
}
