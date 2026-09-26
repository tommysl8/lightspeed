/**
 * The registry must place, orient, size and frame the thirteen built-in bodies exactly as the
 * per-body code it replaced did. The fixture holds that code's values (see its note).
 */
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import fixture from './__fixtures__/pre-registry.json';
import { BODY_ORDER } from '../../physics/constants';
import { framingDistance, minDistance } from '../../controls/framing';
import { astroTimeAt } from '../../lib/time';
import { updateDerived } from '../derived';
import { bodyOrientation, bodyPositionAt, updateEphemeris } from '../ephemeris';
import { updateApparentPositions } from '../lightDelay';
import { setSimTime, sim } from '../sim';
import { planTrip, type Drive } from '../travel';
import { bodyIds } from '.';

type V = [number, number, number];
interface FrameFix {
  ms: number;
  bodies: Record<string, { pos: V; vel: V; quat: [number, number, number, number]; present: boolean }>;
}
interface CamBody {
  apparentPos: V;
  lightDelay: number;
  displayRadius: number;
  radiusPx: number;
  magnitude: number;
  screen: [number, number, boolean];
}

const rel = (a: V, b: Vector3) => Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z) / Math.max(1, Math.hypot(...a));
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a));
/** Largest component difference of two rotations (q and −q are the same rotation). */
const qDiff = (a: Quaternion, b: Quaternion) => {
  const s = a.dot(b) < 0 ? -1 : 1;
  return Math.max(Math.abs(a.x - s * b.x), Math.abs(a.y - s * b.y), Math.abs(a.z - s * b.z), Math.abs(a.w - s * b.w));
};

describe('the registry reproduces the built-in bodies', () => {
  it('in the same order', () => {
    expect([...bodyIds()]).toEqual([...BODY_ORDER]);
  });

  for (const [label, f] of Object.entries(fixture.frames as unknown as Record<string, FrameFix>)) {
    it(`positions, velocities, orientations and presence on ${label}`, () => {
      setSimTime(f.ms);
      updateEphemeris();
      const t = astroTimeAt(f.ms);
      for (const [id, want] of Object.entries(f.bodies)) {
        const b = sim.bodies[id];
        expect(rel(want.pos, b.pos), `${id} position`).toBeLessThan(1e-9);
        expect(rel(want.pos, bodyPositionAt(id, t)), `${id} bodyPositionAt`).toBeLessThan(1e-9);
        const speed = Math.max(1e-6, Math.hypot(...want.vel));
        expect(Math.hypot(want.vel[0] - b.vel.x, want.vel[1] - b.vel.y, want.vel[2] - b.vel.z) / speed, `${id} velocity`).toBeLessThan(1e-9);
        const q = new Quaternion(...want.quat);
        expect(qDiff(q, b.quat), `${id} orientation`).toBeLessThan(1e-12);
        expect(qDiff(q, bodyOrientation(id, t)), `${id} bodyOrientation`).toBeLessThan(1e-12);
        expect(b.present, `${id} present`).toBe(want.present);
      }
    });
  }
});

describe('light-time, sizes, magnitudes and screen positions', () => {
  const SETUPS: [string, number][] = [
    ['near-earth', Date.UTC(2026, 8, 25)],
    ['saturn', Date.UTC(2026, 8, 25)],
    ['outer', Date.UTC(2031, 2, 1)],
  ];
  const cams = fixture.cameras as unknown as Record<string, { camera: V } & Record<string, Record<string, CamBody>>>;

  for (const [label, ms] of SETUPS) {
    it(`matches from the ${label} camera`, () => {
      const c = cams[label];
      setSimTime(ms);
      updateEphemeris();
      sim.camera.pos.set(...c.camera);
      sim.camera.quat.identity();
      sim.camera.fovDeg = 50;
      sim.viewport.width = 1600;
      sim.viewport.height = 1000;
      const camera = new PerspectiveCamera(50, 1.6, 0.001, 1e25);
      camera.updateProjectionMatrix();
      for (const mode of ['true-true', 'retarded-true', 'true-visible']) {
        const retarded = mode.startsWith('retarded');
        sim.sizeMode = mode.endsWith('visible') ? 'visible' : 'true';
        updateApparentPositions(retarded);
        updateDerived(camera, 'earth', null);
        for (const [id, want] of Object.entries(c[mode])) {
          const b = sim.bodies[id];
          // Moons are carried to their own light-time from their planet's (per system): metres.
          const moonLike = retarded && id === 'moon';
          expect(rel(want.apparentPos, b.apparentPos), `${mode} ${id} apparent position`).toBeLessThan(moonLike ? 1e-10 : 1e-12);
          expect(close(want.lightDelay, b.lightDelay, moonLike ? 1e-6 : 1e-9), `${mode} ${id} light delay`).toBe(true);
          expect(close(want.displayRadius, b.displayRadius), `${mode} ${id} display radius`).toBe(true);
          expect(close(want.radiusPx, b.radiusPx, moonLike ? 1e-6 : 1e-9), `${mode} ${id} radius px`).toBe(true);
          expect(close(want.magnitude, b.magnitude, moonLike ? 1e-6 : 1e-9), `${mode} ${id} magnitude`).toBe(true);
          expect(Math.abs(want.screen[0] - b.screen.x), `${mode} ${id} screen x`).toBeLessThan(moonLike ? 1e-3 : 1e-6);
          expect(Math.abs(want.screen[1] - b.screen.y), `${mode} ${id} screen y`).toBeLessThan(moonLike ? 1e-3 : 1e-6);
          expect(b.screen.onScreen, `${mode} ${id} on screen`).toBe(want.screen[2]);
        }
      }
      sim.sizeMode = 'true';
      sim.camera.pos.set(0, 0, 0);
    });
  }
});

describe('framing and flights', () => {
  it('frames every body at the same distance', () => {
    for (const [id, f] of Object.entries(fixture.framing as Record<string, { framing: number; min: number }>)) {
      expect(framingDistance(id), id).toBe(f.framing);
      expect(minDistance(id), id).toBe(f.min);
    }
  });

  it('plans the same flights', () => {
    setSimTime(Date.UTC(2026, 8, 25));
    updateEphemeris();
    const from = new Vector3(...(fixture.from as V));
    for (const [key, want] of Object.entries(fixture.trips as Record<string, { distance: number; earthTime: number; shipTime: number | null }>)) {
      const [dest, drive] = key.split(/-(?=[a-z]+$)/) as [string, Drive];
      const beta = { mars: 0.5, saturn: 0.9, moon: 0.01, proxima: 0, voyager1: 0.99, pluto: 0, jupiter: 3 }[dest]!;
      const p = planTrip(dest, beta, from, sim.astroTime, drive)!;
      expect(close(p.distance, want.distance), `${key} distance`).toBe(true);
      expect(close(p.earthTime, want.earthTime), `${key} Earth time`).toBe(true);
      if (want.shipTime === null) expect(p.shipTime).toBeNaN();
      else expect(close(p.shipTime, want.shipTime), `${key} ship time`).toBe(true);
    }
  });
});
