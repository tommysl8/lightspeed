/**
 * The hole's sky cube's schedule (render/lens/skyCube.ts), with a stand-in renderer and the face draws stubbed: when it
 * starts drawing again (skyCubeRestart), that the lens goes on reading it while a stale cube is redrawn face by face,
 * that a new hole is never read until its own build is done (at rung 2 too, where the cube is otherwise frozen), that
 * a redraw under way finishes before the next begins, that its mipmap pass never clears a face, and that its memory is
 * given back 30 s after it was last read, with or without a lens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scene, WebGLCoordinateSystem, type WebGLRenderer } from 'three';
import { galaxyLayer } from '../galaxyLayer';
import { quality } from '../quality';
import { gravity } from '../../sim/gravity';
import { sim } from '../../sim/sim';
import { PARSEC_KM } from '../../physics/constants';
import { lens } from './lensState';
import { lensPassUniforms } from './lensComposite';
import { idleSkyCube, releaseSkyCube, scheduleSkyCube, skyCube, skyCubeRestart } from './skyCube';

/** A renderer that records what it is asked to do (no GL). */
function fakeRenderer() {
  const log: string[] = [];
  let target: unknown = null;
  const r = {
    autoClear: true,
    coordinateSystem: WebGLCoordinateSystem,
    log,
    initRenderTarget: () => undefined,
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown, face?: number) => {
      target = t;
      if (t) log.push(`target ${face ?? 0}`);
    },
    render: () => log.push(r.autoClear ? 'render (autoClear on)' : 'render'),
    clear: () => log.push('clear'),
    clearDepth: () => log.push('clearDepth'),
  };
  return r;
}

let now = 0;
const scene = new Scene();
const YEAR_MS = 365.25 * 86_400_000;

function frame(r: ReturnType<typeof fakeRenderer>, n = 1): void {
  for (let i = 0; i < n; i++) {
    now += 16;
    scheduleSkyCube(r as unknown as WebGLRenderer, scene, 1000);
  }
}

beforeEach(() => {
  now = 1e6;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(galaxyLayer, 'renderSkyCubeFace').mockImplementation(() => undefined);
  releaseSkyCube();
  skyCube.cam = null;
  skyCube.lastRead = -Infinity;
  lens.active = true;
  lens.hole = 'sgr-a-star';
  lens.obs.frame = 'static';
  lens.obs.r = 100;
  galaxyLayer.wants.milkyWay = true;
  quality.lensRung = 0;
  gravity.camRelHoleKm.set(0, 0, 6e8);
  sim.timeMs = 0;
});

afterEach(() => {
  releaseSkyCube();
  skyCube.cam = null;
  lens.active = false;
  lens.hole = null;
  lens.obs.r = Infinity;
  galaxyLayer.wants.milkyWay = false;
  quality.lensRung = 0;
  gravity.camRelHoleKm.set(0, 0, 0);
  vi.restoreAllMocks();
});

describe('skyCubeRestart', () => {
  const base = { hole: 'sgr-a-star', rung: 0, years: 0, done: 7, live: true };
  it('builds afresh for another hole, at any rung and even mid-build', () => {
    expect(skyCubeRestart(base, 'm87-star', 0, 0, 0)).toBe('rebuild');
    expect(skyCubeRestart({ ...base, done: 3 }, 'm87-star', 0, 0, 0)).toBe('rebuild');
    expect(skyCubeRestart(base, 'm87-star', 2, 0, 0)).toBe('rebuild');
  });
  it('redraws a finished cube when the camera moves 1,000 au, the clock jumps 1,000 years or the rung changes', () => {
    expect(skyCubeRestart(base, 'sgr-a-star', 0, 0, 0)).toBe('keep');
    expect(skyCubeRestart(base, 'sgr-a-star', 0, 0.0051 * PARSEC_KM, 0)).toBe('redraw');
    expect(skyCubeRestart(base, 'sgr-a-star', 0, 0, 1000.5)).toBe('redraw');
    expect(skyCubeRestart(base, 'sgr-a-star', 1, 0, 0)).toBe('redraw');
  });
  it('lets a build under way finish first, and freezes a live cube at rung 2', () => {
    expect(skyCubeRestart({ ...base, done: 4 }, 'sgr-a-star', 1, 1e30, 1e9)).toBe('keep');
    expect(skyCubeRestart(base, 'sgr-a-star', 2, 1e30, 1e9)).toBe('keep');
    expect(skyCubeRestart({ ...base, live: false }, 'sgr-a-star', 2, 1e30, 1e9)).toBe('redraw');
  });
});

describe('scheduleSkyCube', () => {
  it('is read once built, and all through a redraw of a stale cube', () => {
    const r = fakeRenderer();
    frame(r, 13);
    expect(skyCube.done).toBe(7);
    expect(skyCube.live).toBe(true);
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(1);
    // a clock jump of 2,000 years: redrawn face by face while it is read
    sim.timeMs = 2000 * YEAR_MS;
    const faces = skyCube.faceRenders;
    for (let i = 0; i < 13; i++) {
      frame(r);
      expect(lensPassUniforms.uSkyCubeLive.value, `frame ${i} of the redraw`).toBe(1);
    }
    expect(skyCube.faceRenders - faces).toBe(6);
    expect(skyCube.done).toBe(7);
    expect(skyCube.years).toBeCloseTo(2000, 6);
  });

  it('finishes a redraw before the next begins, however often the clock jumps', () => {
    const r = fakeRenderer();
    frame(r, 13);
    const faces = skyCube.faceRenders;
    for (let i = 0; i < 14; i++) {
      sim.timeMs += 1500 * YEAR_MS;
      frame(r);
    }
    // one redraw (6 faces and its mipmaps over 13 frames), then the next begins
    expect(skyCube.faceRenders - faces).toBe(7);
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(1);
  });

  it('never reads one hole’s sky at another, at rung 2 too', () => {
    const r = fakeRenderer();
    quality.lensRung = 2;
    frame(r, 19);
    expect(skyCube.live).toBe(true);
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(1);
    lens.hole = 'm87-star';
    frame(r);
    expect(skyCube.live).toBe(false);
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(0);
    frame(r, 17);
    expect(skyCube.hole).toBe('m87-star');
    expect(skyCube.live).toBe(false);
    frame(r);
    expect(skyCube.live).toBe(true);
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(1);
  });

  it('makes its mipmaps without clearing a face, whatever the renderer’s autoClear', () => {
    const r = fakeRenderer();
    frame(r, 13);
    expect(r.log).not.toContain('render (autoClear on)');
    expect(r.log).not.toContain('clear');
    expect(r.autoClear).toBe(true);
  });

  it('gives its memory back 30 s after it was last read, also once the lens is gone', () => {
    const r = fakeRenderer();
    frame(r, 13);
    expect(skyCube.particles).not.toBeNull();
    // the lens goes (lensing off, or the camera leaves): scene/BlackHoleLens.tsx calls idleSkyCube each frame
    lens.active = false;
    now += 29_000;
    idleSkyCube();
    expect(skyCube.particles).not.toBeNull();
    expect(lensPassUniforms.uSkyCubeLive.value).toBe(0);
    now += 2_000;
    idleSkyCube();
    expect(skyCube.particles).toBeNull();
    expect(skyCube.live).toBe(false);
  });
});
