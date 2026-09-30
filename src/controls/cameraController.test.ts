/**
 * The camera controller near a black hole (docs/data/blackholes.md §10): hovering placed exactly from
 * float64 relative to the hole; the zoom in ln(height above the horizon) reaching the floor r_s(1 + 10⁻⁶)
 * without overshoot or jitter, over Sgr A* (12.7 km) and over a Gaia BH1-like hole (27 mm), where the
 * world grid is 32 km and 2 km; a slew ending exactly at the height asked for; free flight moving by
 * α²w_r r̂ + α w_t per coordinate second and stopping at the floor; the circular geodesic orbit (0.5c past
 * the hovering observers at the innermost stable orbit, turning at √(M/r³) of home's time); the snapshot
 * at speed with its schedule and the paused clock; and leaveHoleModes. Roam: its exact hole-relative place
 * down to the floor (12.7 km, 27 mm) without jitter, a planet's closest approach never crossed, the refusals,
 * and the switch to the ship and back.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { C_KM_S, GM_SUN_KM3_S2, PARSEC_KM } from '../physics/constants';
import { ALWAYS, registerBodies, type BodyRecord } from '../sim/bodies';
import { controller, blackHoleRsKm, hoverFloorKm, HOVER_FLOOR_RS } from './cameraController';
import { minDistance } from './framing';
import { setPaused, setWarp } from '../sim/clock';
import { updateEphemeris } from '../sim/ephemeris';
import { registerGalaxyCore } from '../sim/galaxy/load';
import { setSimTime, sim } from '../sim/sim';
import { useUI } from '../state/ui';

const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);

function holeRecord(id: string, massMsun: number, at: [number, number, number]): BodyRecord {
  const gm = massMsun * GM_SUN_KM3_S2;
  const rs = (2 * gm) / (C_KM_S * C_KM_S);
  return {
    id,
    name: id,
    kind: 'black-hole',
    parent: null,
    physical: { radiusKm: rs, gmKm3S2: gm, colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: 1e4, minKm: rs * (1 + 1e-6) },
    detector: false,
    orbitLine: false,
    provider: {
      label: 'test',
      static: true,
      availability: () => ALWAYS.approximate,
      positionAt(_t, pos, v) {
        pos.x = at[0];
        pos.y = at[1];
        pos.z = at[2];
        if (v) v.x = v.y = v.z = 0;
      },
    },
  };
}

const BH1 = holeRecord('test-cam-bh', 9.27, [480 * PARSEC_KM * 0.6, 480 * PARSEC_KM * 0.64, 480 * PARSEC_KM * 0.48]);
const keys = (controller as unknown as { keys: Set<string> }).keys;
const DIR = { x: -0.36, y: 0.48, z: 0.8 };

beforeAll(() => {
  registerGalaxyCore();
  registerBodies([BH1]);
});

beforeEach(() => {
  setSimTime(T0);
  updateEphemeris();
  setPaused(false);
  setWarp(1);
  keys.clear();
  useUI.setState({ tripActive: false, fallActive: false });
  controller.leaveHoleModes();
});

describe('hovering over a black hole', () => {
  it('is placed exactly from float64 relative to the hole', () => {
    const rs = blackHoleRsKm('sgr-a-star');
    const m = rs / 2;
    expect(controller.hoverAt('sgr-a-star', 20, DIR)).toBe(true);
    expect(controller.mode).toBe('orbit');
    controller.update(1 / 60, 0);
    const rel = new Vector3();
    expect(controller.holeRelative(rel)).toBe('sgr-a-star');
    // To a few float64 steps (the direction's own rounding); the height itself is exact.
    expect(Math.abs(rel.length() / (20 * m) - 1)).toBeLessThan(4e-15);
    expect(rel.x / rel.length()).toBeCloseTo(DIR.x, 15);
    expect(rel.y / rel.length()).toBeCloseTo(DIR.y, 15);
    expect(rel.z / rel.length()).toBeCloseTo(DIR.z, 15);
    expect(controller.holeHeightKm).toBe(18 * m);
    // Riding with the hole, looking at it.
    expect(sim.ship.vel.length()).toBe(0);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(sim.camera.quat);
    expect(fwd.dot(rel.clone().normalize().negate())).toBeCloseTo(1, 12);
    // Refused inside the horizon, and for what is not a black hole.
    expect(controller.hoverAt('sgr-a-star', 2, DIR)).toBe(false);
    expect(controller.hoverAt('earth', 20, DIR)).toBe(false);
  });

  it('keeps a view turned away from the hole (hoverAt’s look) while the camera is dragged round it', () => {
    const up = new Vector3(DIR.x, DIR.y, DIR.z);
    expect(controller.hoverAt('sgr-a-star', 2.02, DIR, up)).toBe(true);
    controller.update(1 / 60, 0);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(sim.camera.quat);
    expect(fwd.dot(up)).toBeCloseTo(1, 12);
  });

  for (const [id, label, floorText] of [
    ['sgr-a-star', 'Sgr A*', '12.7 km'],
    ['test-cam-bh', 'a Gaia BH1-like hole', '27 mm'],
  ] as const) {
    it(`zooms down to the floor above ${label} (${floorText}) without overshoot or jitter`, () => {
      const rs = blackHoleRsKm(id);
      const floor = rs * HOVER_FLOOR_RS;
      expect(hoverFloorKm(id)).toBe(floor);
      controller.hoverAt(id, 20, DIR);
      keys.add('NumpadAdd');
      keys.add('ShiftLeft');
      let prev = Infinity;
      let reached = -1;
      for (let i = 0; i < 4000; i++) {
        controller.update(1 / 60, 0);
        const h = controller.holeHeightKm;
        expect(h).toBeGreaterThanOrEqual(floor);
        expect(h).toBeLessThanOrEqual(prev);
        if (reached < 0 && h / floor - 1 < 1e-12) reached = i;
        prev = h;
      }
      expect(reached).toBeGreaterThan(0);
      keys.clear();
      // At rest on the floor: the same height, bit for bit, frame after frame.
      const h0 = controller.holeHeightKm;
      for (let i = 0; i < 60; i++) {
        controller.update(1 / 60, 0);
        expect(controller.holeHeightKm).toBe(h0);
      }
      expect(h0 / floor).toBeCloseTo(1, 12);
      if (id === 'sgr-a-star') expect(h0).toBeCloseTo(12.69, 2);
      else expect(h0 * 1e6).toBeCloseTo(27.4, 1);
      // The wheel cannot push through it either.
      (controller as unknown as { onWheel: (e: object) => void }).onWheel({ deltaY: -1e7, deltaX: 0, deltaMode: 0, shiftKey: true, preventDefault() {} });
      for (let i = 0; i < 120; i++) controller.update(1 / 60, 0);
      expect(controller.holeHeightKm).toBe(h0);
      // And zooming out climbs smoothly again.
      keys.add('Minus');
      controller.update(1 / 60, 0);
      expect(controller.holeHeightKm).toBeGreaterThan(h0);
      keys.clear();
    });
  }

  it('ends a slew exactly at the height asked for, from far away', () => {
    const rs = blackHoleRsKm('test-cam-bh');
    controller.placeAt('earth', 26_000);
    controller.update(1 / 60, 0);
    controller.goTo('test-cam-bh', { distance: rs + 100 });
    let n = 0;
    while (controller.mode === 'transition' && n++ < 2000) controller.update(1 / 60, 0);
    expect(controller.mode).toBe('orbit');
    controller.update(1 / 60, 0);
    expect(Math.abs(controller.holeHeightKm / 100 - 1)).toBeLessThan(1e-9);
    const rel = new Vector3();
    expect(controller.holeRelative(rel)).toBe('test-cam-bh');
    expect(Math.abs(rel.length() / (rs + 100) - 1)).toBeLessThan(1e-12);
    // A slew that keeps the distance from free flight keeps the exact height.
    controller.setHoverHeight(1e-3);
    controller.update(1 / 60, 0);
    expect(controller.holeHeightKm).toBe(1e-3);
  });
});

describe('free flight with a hole as the reference body', () => {
  it('moves by α² w_r radially and α w_t sideways per coordinate second, and stops at the floor', () => {
    const rs = blackHoleRsKm('sgr-a-star');
    const m = rs / 2;
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    controller.enterFreeFlight();
    expect(controller.mode).toBe('free');
    const before = new Vector3();
    controller.holeRelative(before);
    // Thrust straight at the hole (W: the camera looks at it) at the throttle's speed.
    keys.add('KeyW');
    const w = controller.throttleBeta * C_KM_S;
    const r0 = before.length();
    const a2 = (r0 - rs) / r0;
    controller.update(1 / 60, 10);
    const after = new Vector3();
    expect(controller.holeRelative(after)).toBe('sgr-a-star');
    expect((r0 - after.length()) / (a2 * w * 10)).toBeCloseTo(1, 9);
    // The ship's velocity is the thrust past the hovering observers (Sgr A* is at rest in S).
    expect(sim.ship.vel.length() / w).toBeCloseTo(1, 12);
    // Far too fast for the distance left: stopped at the floor.
    controller.update(1 / 60, 1e9);
    expect(controller.holeHeightKm).toBeCloseTo(rs * HOVER_FLOOR_RS, 9);
    keys.clear();
    // Sideways: α w per coordinate second.
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    controller.enterFreeFlight();
    keys.add('KeyD');
    controller.holeRelative(before);
    controller.update(1 / 60, 10);
    controller.holeRelative(after);
    expect(after.distanceTo(before) / (Math.sqrt(0.9) * w * 10)).toBeCloseTo(1, 6);
    keys.clear();
    expect(controller.holeHeightKm / (18 * m)).toBeCloseTo(1, 6);
  });
});

describe('a black hole’s own modes', () => {
  it('orbits circularly at the innermost stable orbit: 0.5c past the hovering observers, a turn in 32.57 min of home’s time', () => {
    const rs = blackHoleRsKm('sgr-a-star');
    const m = rs / 2;
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    const n = new Vector3(0, 1, 0);
    expect(controller.startCircularOrbit('sgr-a-star', 6, n)).toBe(true);
    expect(controller.mode).toBe('circular');
    const start = new Vector3();
    controller.holeRelative(start);
    expect(Math.abs(start.length() / (6 * m) - 1)).toBeLessThan(4e-15);
    expect(Math.abs(start.dot(n))).toBeLessThan(1e-6 * start.length());
    expect(sim.ship.vel.length() / C_KM_S).toBeCloseTo(0.5, 12);
    const period = 1954.4368;
    // A quarter of a turn in a quarter of the coordinate period.
    controller.update(1 / 60, period / 4);
    const q = new Vector3();
    controller.holeRelative(q);
    expect(q.dot(start) / start.lengthSq()).toBeCloseTo(0, 4);
    expect(q.clone().cross(start).normalize().dot(n)).toBeCloseTo(-1, 6);
    expect(controller.circularOrbitNow()!.v).toBeCloseTo(0.5, 12);
    expect(controller.holeHeightKm).toBeCloseTo(4 * m, 3);
    // Leaving it: hovering there, at the same radius.
    controller.leaveHoleModes();
    expect(controller.mode).toBe('orbit');
    controller.update(1 / 60, 0);
    const h = new Vector3();
    controller.holeRelative(h);
    expect(h.length() / (6 * m)).toBeCloseTo(1, 12);
    expect(sim.ship.vel.length()).toBe(0);
    // Not below the photon sphere.
    expect(controller.startCircularOrbit('sgr-a-star', 3, n)).toBe(false);
  });

  it('holds a snapshot at speed: the clock paused, the schedule by real time; the clock running again ends it', () => {
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    const out = new Vector3(DIR.x, DIR.y, DIR.z);
    const inward = { x: -0.9 * out.x, y: -0.9 * out.y, z: -0.9 * out.z };
    const outward = { x: 0.9 * out.x, y: 0.9 * out.y, z: 0.9 * out.z };
    controller.holdWithVelocity('sgr-a-star', [
      { atS: 0, betaVec: { x: 0, y: 0, z: 0 } },
      { atS: 10, betaVec: inward },
      { atS: 20, betaVec: outward },
    ], 30);
    expect(controller.mode).toBe('hold');
    expect(sim.paused).toBe(true);
    const rel0 = new Vector3();
    controller.holeRelative(rel0);
    const step = (s: number) => {
      for (let i = 0; i < s * 10; i++) controller.update(0.1, 0);
    };
    step(5);
    expect(sim.ship.vel.length()).toBe(0);
    step(7);
    expect(sim.ship.vel.dot(out) / C_KM_S).toBeCloseTo(-0.9, 9);
    step(10);
    expect(sim.ship.vel.dot(out) / C_KM_S).toBeCloseTo(0.9, 9);
    step(10);
    expect(sim.ship.vel.length()).toBe(0);
    // The camera held its place all along.
    const rel = new Vector3();
    controller.holeRelative(rel);
    expect(rel.equals(rel0)).toBe(true);
    // Running the clock ends the snapshot: hovering there, the clock left running.
    setPaused(false);
    controller.update(0.1, 0);
    expect(controller.mode).toBe('orbit');
    expect(sim.paused).toBe(false);
  });

  it('puts the clock’s pause back when a snapshot is left by a camera move', () => {
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    controller.holdWithVelocity('sgr-a-star', [{ atS: 0, betaVec: { x: 0.5, y: 0, z: 0 } }]);
    expect(sim.paused).toBe(true);
    controller.goTo('earth');
    expect(sim.paused).toBe(false);
    expect(controller.mode).toBe('transition');
  });
});

describe('Roam: the camera flown by hand', () => {
  /** Hold a key for `s` seconds of frames (the clock running at real time), checking each frame. */
  function hold(code: string, s: number, each?: () => void): void {
    keys.add(code);
    for (let i = 0; i < Math.round(s * 60); i++) {
      controller.update(1 / 60, 1 / 60);
      each?.();
    }
    keys.delete(code);
  }

  it('moves its exact place relative to Sgr A* and comes to rest at the hover floor, hovering there, without jitter', () => {
    const rs = blackHoleRsKm('sgr-a-star');
    const floor = hoverFloorKm('sgr-a-star', rs);
    controller.hoverAt('sgr-a-star', 20, DIR);
    controller.update(1 / 60, 0);
    // (The gravity state sets this each frame within 5,000 r_s: sim/gravity.ts.)
    controller.nearHole = 'sgr-a-star';
    expect(controller.enterRoam()).toBe(true);
    expect(controller.mode).toBe('roam');
    expect(useUI.getState().controlMode).toBe('roam');
    let prev = controller.holeHeightKm;
    // W: towards the hole (the hover looks at it). Slower as it nears the horizon, never below the floor.
    hold('KeyW', 30, () => {
      expect(controller.holeHeightKm).toBeLessThanOrEqual(prev);
      expect(controller.holeHeightKm).toBeGreaterThanOrEqual(floor);
      prev = controller.holeHeightKm;
    });
    expect(controller.holeHeightKm).toBe(floor);
    const rel = new Vector3();
    expect(controller.holeRelative(rel)).toBe('sgr-a-star');
    // Hovering: at rest past the observers hovering there (the lens and the clocks read this).
    expect(sim.ship.vel.equals(sim.bodies['sgr-a-star'].vel)).toBe(true);
    // Once the keys' ease has run out (a few tenths of a second), it rests there to the last bit.
    for (let i = 0; i < 180; i++) controller.update(1 / 60, 1 / 60);
    controller.holeRelative(rel);
    const at = rel.clone();
    for (let i = 0; i < 60; i++) controller.update(1 / 60, 1 / 60);
    controller.holeRelative(rel);
    expect(rel.equals(at)).toBe(true);
    // At the floor to a few float64 steps of the place itself (2 µm here, against the 32 km of a world coordinate).
    expect(controller.holeHeightKm).toBeGreaterThanOrEqual(floor);
    expect(controller.holeHeightKm - floor).toBeLessThan(4 * Number.EPSILON * rs);
    controller.nearHole = null;
  });

  it('reaches 27 mm above a Gaia BH1-like hole, where one step of a world coordinate is 2 km', () => {
    const id = BH1.id;
    const floor = hoverFloorKm(id);
    controller.hoverAt(id, 20, DIR);
    controller.update(1 / 60, 0);
    controller.nearHole = id;
    controller.enterRoam();
    hold('KeyW', 30);
    expect(controller.holeHeightKm).toBe(floor);
    expect(floor * 1e6).toBeCloseTo(27.4, 1);
    // And back out, exactly: leaving Roam hovers there at the same height.
    controller.exitRoam();
    for (let i = 0; i < 60 * 7; i++) controller.update(1 / 60, 0);
    expect(controller.mode).toBe('orbit');
    expect(useUI.getState().focus).toBe(id);
    expect(controller.holeHeightKm).toBe(floor);
    controller.nearHole = null;
  });

  it('slows by itself near a planet and never goes inside its closest approach; leaving orbits it from there', () => {
    controller.placeAt('earth', 26_000);
    controller.update(1 / 60, 0);
    controller.enterRoam();
    const min = minDistance('earth');
    const d = () => sim.camera.pos.distanceTo(sim.bodies.earth.pos);
    hold('KeyW', 2);
    // About 2 s: within 1,000 km or so of the closest approach, and slowing.
    expect(d() - min).toBeLessThan(2000);
    expect(controller.roamSpeed).toBeLessThan(4000);
    hold('KeyW', 20, () => expect(d()).toBeGreaterThanOrEqual(min * (1 - 1e-12)));
    controller.exitRoam();
    expect(controller.mode).toBe('transition');
    for (let i = 0; i < 60 * 7; i++) controller.update(1 / 60, 0);
    expect(controller.mode).toBe('orbit');
    expect(useUI.getState().focus).toBe('earth');
    expect(d()).toBeGreaterThanOrEqual(min * (1 - 1e-12));
  });

  it('is refused on a trip and in a fall, as free flight is', () => {
    // (On a trip the controller rides the ship: startTravel, which needs a page for its pointer.)
    controller.mode = 'travel';
    expect(controller.enterRoam()).toBe(false);
    expect(controller.mode).toBe('travel');
    controller.placeAt('earth');
    controller.enterFall('sgr-a-star', DIR);
    expect(controller.enterRoam()).toBe(false);
    expect(controller.mode).toBe('fall');
    controller.leaveHoleModes();
    expect(controller.mode).toBe('orbit');
  });

  it('switches to the ship where it is, and back (Esc), and the multiplier stays in its range', () => {
    controller.placeAt('earth', 26_000);
    controller.update(1 / 60, 0);
    controller.enterRoam();
    controller.update(1 / 60, 0);
    const at = sim.camera.pos.clone();
    controller.roamToShip();
    expect(controller.mode).toBe('free');
    expect(sim.camera.pos.equals(at)).toBe(true);
    controller.shipToRoam();
    expect(controller.mode).toBe('roam');
    controller.setRoamMul(1e9);
    expect(controller.roamMul).toBe(1000);
    controller.setRoamMul(0);
    expect(controller.roamMul).toBe(0.001);
    controller.setRoamMul(1);
    controller.exitRoam();
    for (let i = 0; i < 60 * 7; i++) controller.update(1 / 60, 0);
  });
});
