import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { starData, type Stars3D } from '../sim/stars';
import { exoplanetData } from '../sim/exoplanets';
import { pickAt, pickHostRing } from './picking';
import '../sim/bodies';

/**
 * Stars at rest, J2000 ecliptic parsecs. The camera sits at the Sun looking down world −z, which
 * is ecliptic +y: a star at (0, d, 0) is in the middle of an 800 × 600 view.
 */
function stars(list: [number, number, number][]): Stars3D {
  const n = list.length;
  return {
    count: n,
    epochJy: 2000,
    positions: Float32Array.from(list.flat()),
    velocitiesInt16: new Int16Array(3 * n),
    velocityUnitKms: 0.1,
    absMagInt16: new Int16Array(n),
    absMagUnit: 0.01,
    absMag: new Float32Array(n),
    teff: new Uint16Array(n),
    flags: new Uint16Array(n),
  } as Stars3D;
}

const camera = new PerspectiveCamera(60, 800 / 600, 1, 1e30);
const saved = { stars: starData.stars, full: starData.full, matches: exoplanetData.matches };

beforeEach(() => {
  sim.viewport.width = 800;
  sim.viewport.height = 600;
  sim.camera.pos.set(0, 0, 0);
  sim.camera.quat.identity();
  camera.updateProjectionMatrix();
  // Nothing else on screen.
  for (const b of sim.bodyList) b.screen.inFront = b.screen.onScreen = false;
  // Host 0 dead ahead at 10 pc; host 1 at 60 pc (past the rings' reach); host 2 has no star.
  starData.stars = stars([
    [0, 10, 0],
    [0, 60, 0],
  ]);
  starData.full = true;
  exoplanetData.matches = { star: Int32Array.from([0, 1, -1]), by: new Uint8Array(3) };
  useUI.setState({ planetHosts: 'on', retarded: false });
});

afterEach(() => {
  starData.stars = saved.stars;
  starData.full = saved.full;
  exoplanetData.matches = saved.matches;
  useUI.setState({ planetHosts: 'auto' });
});

describe('the rings round stars with planets', () => {
  it('are picked where they are drawn, even though their stars are not bodies', () => {
    const hit = pickHostRing(403, 302, camera);
    expect(hit?.host).toBe(0);
    expect(hit?.x).toBeCloseTo(400, 3);
    expect(hit?.y).toBeCloseTo(300, 3);
    expect(hit?.px).toBeCloseTo(Math.hypot(3, 2), 3);
    expect(pickAt(403, 302, camera)).toEqual({ kind: 'host', host: 0, x: hit!.x, y: hit!.y });
  });

  it('are not picked out of reach, past where they fade out, or while hidden', () => {
    expect(pickHostRing(440, 300, camera)).toBeNull();
    starData.stars = stars([
      [0, 10, 0],
      [0, 60, 0],
    ].reverse() as [number, number, number][]);
    // Host 0's star is now the one at 60 pc, host 1's the one at 10 pc.
    expect(pickHostRing(400, 300, camera)?.host).toBe(1);
    exoplanetData.matches = { star: Int32Array.from([0]), by: new Uint8Array(1) };
    expect(pickHostRing(400, 300, camera)).toBeNull();
    exoplanetData.matches = { star: Int32Array.from([0, 1]), by: new Uint8Array(2) };
    useUI.setState({ planetHosts: 'off' });
    expect(pickHostRing(400, 300, camera)).toBeNull();
  });

  it('give way to a body nearer the pointer', () => {
    const b = sim.bodies.jupiter;
    b.present = true;
    b.screen.x = 404;
    b.screen.y = 300;
    b.screen.inFront = b.screen.onScreen = true;
    b.radiusPx = 1;
    b.magnitude = -2;
    b.distCamera = 1e9;
    b.displayRadius = 1;
    expect(pickAt(405, 300, camera)).toEqual({ kind: 'body', id: 'jupiter' });
    expect(pickAt(399, 300, camera)?.kind).toBe('host');
  });
});
