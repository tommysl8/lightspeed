/**
 * The GPU-time controller (render/gpuBudget.ts) driven with synthetic timings: the rolling median
 * of 60 measured frames; a step down (less work) after 60 frames whose median is over 8.5 ms, up after 300 under
 * 6.5 ms, each decision on frames drawn at the new settings; the pixel ratio asked for only once the rungs are
 * exhausted, and given back first; rung 1 without the timer extension on an integrated GPU; the split view
 * starting at rung 1; nothing measured or wanted away from holes; paused while a measurement holds it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPU_DOWN_AFTER, GPU_UP_AFTER, GPU_WINDOW, gpuBudget } from './gpuBudget';
import { quality } from './quality';

/** Feed n frames of `ms` each. */
function feed(n: number, ms: number): void {
  for (let i = 0; i < n; i++) gpuBudget.sample(ms);
}

/** Frames until the first decision: the window fills, then the median has to stay over (or under) for the count. */
const toDown = GPU_WINDOW - 1 + GPU_DOWN_AFTER;
const toUp = GPU_WINDOW - 1 + GPU_UP_AFTER;

const saved = { integrated: false, available: false };

beforeEach(() => {
  saved.integrated = quality.integrated;
  saved.available = gpuBudget.available;
  gpuBudget.reset();
  gpuBudget.available = true;
  quality.integrated = true;
});

afterEach(() => {
  gpuBudget.reset();
  quality.integrated = saved.integrated;
  gpuBudget.available = saved.available;
});

describe('the GPU-time controller', () => {
  it('takes the median of the last 60 frames', () => {
    gpuBudget.rung(true, false);
    feed(GPU_WINDOW - 1, 5);
    expect(Number.isNaN(gpuBudget.medianMs)).toBe(true);
    feed(1, 5);
    expect(gpuBudget.medianMs).toBe(5);
    // A few slow frames do not move the median.
    feed(10, 40);
    expect(gpuBudget.medianMs).toBe(5);
  });

  it('steps down after 60 frames over 8.5 ms, and not a frame sooner', () => {
    expect(gpuBudget.rung(true, false)).toBe(0);
    feed(toDown - 1, 9);
    expect(gpuBudget.rung(true, false)).toBe(0);
    feed(1, 9);
    expect(gpuBudget.rung(true, false)).toBe(1);
    // The next decision rests on frames at the new rung: the window starts afresh.
    expect(Number.isNaN(gpuBudget.medianMs)).toBe(true);
    feed(toDown, 9);
    expect(gpuBudget.rung(true, false)).toBe(2);
  });

  it('does nothing between 6.5 and 8.5 ms', () => {
    gpuBudget.rung(true, false);
    feed(2000, 7.5);
    expect(gpuBudget.rung(true, false)).toBe(0);
    expect(gpuBudget.wantsDprStep()).toBe(false);
  });

  it('steps up after 300 frames under 6.5 ms', () => {
    gpuBudget.rung(true, false);
    feed(toDown, 9);
    expect(gpuBudget.rung(true, false)).toBe(1);
    feed(toUp - 1, 5);
    expect(gpuBudget.rung(true, false)).toBe(1);
    feed(1, 5);
    expect(gpuBudget.rung(true, false)).toBe(0);
  });

  it('asks for a pixel-ratio step only when the rungs are exhausted, once a step, and gives it back first', () => {
    gpuBudget.rung(true, false);
    feed(toDown, 10);
    feed(toDown, 10);
    expect(gpuBudget.rung(true, false)).toBe(2);
    expect(gpuBudget.wantsDprStep()).toBe(false);
    feed(toDown, 10);
    expect(gpuBudget.rung(true, false)).toBe(2);
    expect(gpuBudget.wantsDprStep()).toBe(true);
    expect(gpuBudget.wantsDprStep()).toBe(false);
    // Room again: the pixel ratio comes back before the rungs.
    feed(toUp, 5);
    expect(gpuBudget.wantsDprUp()).toBe(true);
    expect(gpuBudget.wantsDprUp()).toBe(false);
    expect(gpuBudget.rung(true, false)).toBe(2);
    feed(toUp, 5);
    expect(gpuBudget.wantsDprUp()).toBe(false);
    expect(gpuBudget.rung(true, false)).toBe(1);
  });

  it('counts no pixel-ratio step it could not take, so gives none back (at a pixel ratio of 1 already)', () => {
    gpuBudget.rung(true, false);
    feed(toDown, 10);
    feed(toDown, 10);
    feed(toDown, 10);
    expect(gpuBudget.rung(true, false)).toBe(2);
    expect(gpuBudget.wantsDprStep(false)).toBe(false);
    expect(gpuBudget.wantsDprStep(true)).toBe(false);
    // Room again: nothing to give back, so the rungs come back first.
    feed(toUp, 5);
    expect(gpuBudget.wantsDprUp()).toBe(false);
    expect(gpuBudget.rung(true, false)).toBe(1);
  });

  it('holds rung 1 near a hole on an integrated GPU without the timer extension, and rung 0 elsewhere', () => {
    gpuBudget.available = false;
    expect(gpuBudget.rung(true, false)).toBe(1);
    expect(gpuBudget.rung(false, false)).toBe(0);
    quality.integrated = false;
    expect(gpuBudget.rung(true, false)).toBe(0);
  });

  it('starts the split view at rung 1 near a hole', () => {
    expect(gpuBudget.rung(true, true)).toBe(1);
    gpuBudget.reset();
    expect(gpuBudget.rung(true, false)).toBe(0);
    // turned on at the hole
    expect(gpuBudget.rung(true, true)).toBe(1);
  });

  it('measures nothing and wants rung 0 away from holes, and forgets its steps when leaving', () => {
    feed(1000, 20);
    expect(gpuBudget.rung(false, false)).toBe(0);
    expect(Number.isNaN(gpuBudget.medianMs)).toBe(true);
    gpuBudget.rung(true, false);
    feed(toDown, 20);
    expect(gpuBudget.rung(true, false)).toBe(1);
    expect(gpuBudget.rung(false, false)).toBe(0);
    expect(gpuBudget.rung(true, false)).toBe(0);
  });

  it('ignores frames while paused by a measurement, and starts afresh after', () => {
    gpuBudget.rung(true, false);
    feed(toDown - 5, 9);
    gpuBudget.pause(true);
    expect(gpuBudget.paused).toBe(true);
    feed(500, 30);
    gpuBudget.pause(false);
    expect(Number.isNaN(gpuBudget.medianMs)).toBe(true);
    feed(toDown - 1, 9);
    expect(gpuBudget.rung(true, false)).toBe(0);
    feed(1, 9);
    expect(gpuBudget.rung(true, false)).toBe(1);
  });
});
