/**
 * Simulation clock controls. Real time (1×) is the default, so you feel that even light takes
 * over eight minutes to reach Earth.
 */
import { sim } from './sim';
import { useUI } from '../state/ui';

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

/** Back to the present moment at real time. Not allowed mid-trip, where time can't run backwards. */
export function resetToNow(): void {
  if (useUI.getState().tripActive) return;
  sim.timeMs = Date.now();
  setWarp(1);
  setPaused(false);
}

/** Jump forward in simulated time (used by "jump to arrival"). */
export function advanceTime(seconds: number): void {
  if (seconds > 0) sim.timeMs += seconds * 1000;
}
