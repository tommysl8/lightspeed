import { afterEach, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { BODIES, BODY_ORDER, LIGHT_YEAR_KM } from '../physics/constants';
import { solarSystemHidden, updateDerived } from './derived';
import { updateEphemeris } from './ephemeris';
import { updateApparentPositions } from './lightDelay';
import { setSimTime, sim } from './sim';

/** Camera on the +z axis at `dist` km from the Sun, looking back at it (three.js looks down −z). */
function viewFrom(dist: number, sizeMode: 'true' | 'visible' = 'true') {
  setSimTime(Date.UTC(2026, 8, 25));
  updateEphemeris();
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  sim.camera.quat.identity();
  sim.camera.pos.set(0, 0, dist);
  sim.sizeMode = sizeMode;
  updateApparentPositions(false);
  const camera = new PerspectiveCamera(50, 1.6, 0.001, 1e25);
  camera.updateProjectionMatrix();
  updateDerived(camera, 'sun', null);
}

afterEach(() => {
  sim.camera.pos.set(0, 0, 0);
  sim.sizeMode = 'true';
  sim.solarSystemPx = Infinity;
});

describe('the Solar System seen from afar', () => {
  it('is a full-size scene from inside it', () => {
    viewFrom(1e9);
    expect(sim.solarSystemPx).toBe(Infinity);
    expect(solarSystemHidden()).toBe(false);
  });

  it('shrinks below a pixel about 1.6 light-years out, and loses its labels (except the focus)', () => {
    viewFrom(1 * LIGHT_YEAR_KM);
    expect(solarSystemHidden()).toBe(false);
    viewFrom(3 * LIGHT_YEAR_KM);
    expect(solarSystemHidden()).toBe(true);
    expect(sim.bodies.sun.screen.onScreen).toBe(true);
    for (const id of ['earth', 'jupiter', 'neptune'] as const) expect(sim.bodies[id].screen.onScreen).toBe(false);
  });

  it('does not inflate bodies to visible discs once they have merged into one point', () => {
    viewFrom(10 * LIGHT_YEAR_KM, 'visible');
    for (const id of BODY_ORDER) {
      const b = BODIES[id];
      expect(sim.bodies[id].displayRadius).toBe(b.equatorialRadiusKm ?? b.radiusKm);
      expect(sim.bodies[id].radiusPx).toBeLessThan(0.35); // so no mesh is drawn
    }
  });

  it('keeps every derived number finite at the camera’s farthest (10²⁴ km)', () => {
    viewFrom(1e24);
    expect(sim.solarSystemPx).toBeGreaterThan(0);
    for (const id of BODY_ORDER) {
      const b = sim.bodies[id];
      for (const v of [b.distCamera, b.radiusPx, b.magnitude, b.screen.x, b.screen.y]) expect(Number.isFinite(v)).toBe(true);
    }
    // The Sun from 100 billion light-years: far too faint to see.
    expect(sim.bodies.sun.magnitude).toBeGreaterThan(50);
  });
});
