/**
 * The gravity state (sim/gravity.ts) against the numbers of docs/data/blackholes.md §4 and §10: which hole
 * is selected and when another takes over; nothing at all at Earth with every hole
 * registered (a year of clocks byte-identical to the flat-spacetime code); r and the height exact 100 km
 * above a Gaia BH1-like horizon, where the world grid is 2 km; the floor clamp (a slew to the floor never
 * gives NaN); α, 1 − α and ln g without cancellation; the pacing threshold at 5,000 r_s; the frame boost of a
 * moving hole; the lens frame switching to the raindrop's below 3M in a fall.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2, JULIAN_YEAR_S, PARSEC_KM } from '../physics/constants';
import { ALWAYS, registerBodies, type BodyRecord } from './bodies';
import { controller, hoverFloorKm } from '../controls/cameraController';
import { chrono, lagRate, zeroChrono } from './chronometer';
import { setPaused, setWarp } from './clock';
import { updateEphemeris } from './ephemeris';
import { registerGalaxyCore } from './galaxy/load';
import { fallPose, gravity, updateGravity, GRAVITY_X_MIN } from './gravity';
import { setSimTime, sim } from './sim';
import { updateShipKinematics } from './shipKinematics';
import { tickClock, tickTrip } from './tick';
import { registerUniverse } from '../test/universe';
import { useUI } from '../state/ui';
import { cpuMs } from '../test/timing';

// Node's own modules, reached without its type definitions (the app is typed for the browser).
interface V8 {
  setFlagsFromString(flags: string): void;
  getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[];
}
const node = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
const v8 = node.getBuiltinModule('node:v8') as V8;
const vm = node.getBuiltinModule('node:vm') as { runInNewContext(code: string): unknown };
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);

/** A black hole for the tests, fixed at an ecliptic place (km) with a velocity (km/s). */
function holeRecord(id: string, massMsun: number, at: [number, number, number], vel: [number, number, number] = [0, 0, 0]): BodyRecord {
  const gm = massMsun * GM_SUN_KM3_S2;
  const rs = (2 * gm) / (C_KM_S * C_KM_S);
  return {
    id,
    name: id,
    kind: 'black-hole',
    kindText: 'Stellar-mass black hole',
    parent: null,
    physical: { radiusKm: rs, gmKm3S2: gm, colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: 1e4, minKm: rs * (1 + 1e-6) },
    detector: false,
    orbitLine: false,
    blackHole: {
      class: massMsun > 1e5 ? 'supermassive' : 'stellar',
      massMsun,
      massStatMsun: 0,
      massSysMsun: 0,
      massSource: 'test',
      gmKm3S2: gm,
      rsKm: rs,
      spin: { value: null, status: 'unknown', note: '' },
      fallAllowed: massMsun > 1e5,
      refs: [],
    },
    provider: {
      label: 'test',
      static: vel.every((v) => v === 0),
      availability: () => ALWAYS.approximate,
      positionAt(_t, pos, v) {
        pos.x = at[0];
        pos.y = at[1];
        pos.z = at[2];
        if (v) {
          v.x = vel[0];
          v.y = vel[1];
          v.z = vel[2];
        }
      },
    },
  };
}

/** Gaia BH1's mass at its distance (480 pc), and Gaia BH3's with a velocity of 357 km/s through the Sun's frame. */
const BH1 = holeRecord('test-bh-one', 9.27, [480 * PARSEC_KM * 0.6, 480 * PARSEC_KM * 0.64, 480 * PARSEC_KM * 0.48]);
const BH3 = holeRecord('test-bh-three', 32.7, [-590 * PARSEC_KM * 0.8, 590 * PARSEC_KM * 0.6, 0], [357 * 0.6, -357 * 0.64, 357 * 0.48]);
/** Two holes 10⁷ km apart, for the choice between them. */
const PAIR_A = holeRecord('test-pair-a', 10, [2e13, 0, 0]);
const PAIR_B = holeRecord('test-pair-b', 20, [2e13, 1e7, 0]);

/** One frame of what SimDriver does around the camera. */
function frame(dtReal = 0, dtSim = 0): void {
  controller.update(dtReal, dtSim);
  updateShipKinematics();
  updateGravity();
}

beforeAll(() => {
  registerUniverse();
  registerBodies([BH1, BH3, PAIR_A, PAIR_B]);
});

beforeEach(() => {
  setSimTime(T0);
  updateEphemeris();
  fallPose.active = false;
  setPaused(false);
  setWarp(1);
  useUI.setState({ tripActive: false, fallActive: false });
});

describe('at home', () => {
  it('selects no hole at Earth with every black hole registered, and keeps a year of clocks byte-identical', () => {
    registerGalaxyCore();
    controller.placeAt('earth', 26_000);
    frame();
    expect(gravity.hole).toBeNull();
    expect(gravity.x).toBe(0);
    expect(gravity.alpha).toBe(1);
    expect(gravity.paced).toBe(false);
    // Sgr A* from the Sun: 5 × 10⁻¹¹, ten times below the threshold.
    const sgr = sim.bodies['sgr-a-star'];
    expect(sgr).toBeDefined();
    const x = (2 * GM_SUN_KM3_S2 * 4.297e6) / (C_KM_S * C_KM_S) / sgr.pos.length();
    expect(x).toBeGreaterThan(4.9e-11);
    expect(x).toBeLessThan(GRAVITY_X_MIN / 9);

    // A year (and a bit) at a warp of 10⁵: the clock and the chronometers as the flat code has them.
    zeroChrono();
    sim.live = false;
    setWarp(1e5);
    let refMs = sim.timeMs;
    let refCarry = sim.timeCarryMs;
    const ref = { t: 0, lag: 0, tau: 0 };
    for (let i = 0; i < 400; i++) {
      const dt = tickClock(1);
      updateEphemeris();
      controller.update(1, dt);
      updateShipKinematics();
      updateGravity();
      tickTrip(dt);
      // Today's advanceClock and chronoIntegrate, line for line.
      const y = 1e5 * 1000 + refCarry;
      const t = refMs + y;
      refCarry = y - (t - refMs);
      refMs = t;
      const beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999);
      const dLag = dt * lagRate(beta);
      ref.t += dt;
      ref.lag += dLag;
      ref.tau += dt - dLag;
      expect(gravity.hole).toBeNull();
    }
    expect(sim.timeMs).toBe(refMs);
    expect(chrono.t).toBe(ref.t);
    expect(chrono.lag).toBe(ref.lag);
    expect(chrono.tau).toBe(ref.tau);
    expect(chrono.t).toBeGreaterThan(JULIAN_YEAR_S);
    setWarp(1);
    // (The whole registry's ephemeris 400 times: seconds, more under a loaded machine.)
  }, 60_000);
});

describe('choosing the hole', () => {
  it('takes the largest r_s/r, and switches only when another is 10 % larger', () => {
    controller.placeAt('earth', 26_000);
    frame();
    const a = sim.bodies['test-pair-a'].pos;
    const b = sim.bodies['test-pair-b'].pos;
    const axis = b.clone().sub(a).normalize();
    const rsA = PAIR_A.blackHole!.rsKm;
    const rsB = PAIR_B.blackHole!.rsKm;
    sim.ship.vel.set(0, 0, 0);
    sim.ship.phi = 0;
    // The camera on the line through both, beyond A: at s from A, 10⁷ + s from B.
    const put = (s: number) => {
      sim.camera.pos.copy(a).addScaledVector(axis, -s);
      updateGravity();
    };
    put(1e5);
    expect(gravity.hole).toBe('test-pair-a');
    // xB/xA = (rsB/rsA)·s/(s + 10⁷) = 2s/(s + 10⁷): 1.05 at s ≈ 1.105 × 10⁷, 1.15 at s ≈ 1.353 × 10⁷.
    put(1.105e7);
    expect((rsB / (1.105e7 + 1e7)) / (rsA / 1.105e7)).toBeGreaterThan(1.04);
    expect(gravity.hole).toBe('test-pair-a');
    put(1.36e7);
    expect(gravity.hole).toBe('test-pair-b');
    // And back only past the same margin.
    put(1.2e7);
    expect(gravity.hole).toBe('test-pair-b');
    put(0.8e7);
    expect(gravity.hole).toBe('test-pair-a');
  });
});

describe('exactly near a stellar-mass hole', () => {
  it('has r and the height exact 100 km above a Gaia BH1-like horizon (the world grid there is 2 km)', () => {
    const rs = BH1.blackHole!.rsKm;
    const m = rs / 2;
    const dir = { x: 0.3, y: -0.8, z: 0.52 };
    expect(controller.hoverAt('test-bh-one', 2 + 100 / m, dir)).toBe(true);
    frame();
    expect(gravity.hole).toBe('test-bh-one');
    expect(Math.abs(gravity.heightKm - 100) / 100).toBeLessThan(1e-12);
    expect(Math.abs(gravity.rKm - (rs + 100)) / (rs + 100)).toBeLessThan(1e-12);
    expect(Math.abs(gravity.camRelHoleKm.length() - (rs + 100)) / (rs + 100)).toBeLessThan(1e-12);
    // What the world positions would have said: a kilometre or so off.
    const ulp = 2 ** (Math.floor(Math.log2(sim.bodies['test-bh-one'].pos.length())) - 52);
    expect(ulp).toBeGreaterThan(1);
    // At rest past the hovering observers, exactly.
    expect(gravity.relPhi).toBe(0);
    expect(gravity.frame).toBe('static');
  });

  it('clamps at the floor: a slew to it never gives NaN, and ends exactly there', () => {
    const rs = BH1.blackHole!.rsKm;
    controller.placeAt('earth', 26_000);
    frame();
    controller.goTo('test-bh-one', { distance: rs * (1 + 1e-6) });
    let n = 0;
    while (controller.mode === 'transition' && n < 2000) {
      frame(1 / 60, 0);
      n++;
      // No NaN ever; once the hole is selected, every number finite.
      for (const v of [gravity.x, gravity.alpha, gravity.oneMinusAlpha, gravity.heightKm, gravity.rKm, gravity.lnGStatic, gravity.rainOneMinusV]) {
        expect(Number.isNaN(v)).toBe(false);
        if (gravity.hole) expect(Number.isFinite(v)).toBe(true);
      }
      if (gravity.hole) expect(gravity.heightKm).toBeGreaterThanOrEqual(rs * 1e-6 * (1 - 1e-9));
    }
    expect(controller.mode).toBe('orbit');
    frame(1 / 60, 0);
    expect(Math.abs(gravity.heightKm / (rs * 1e-6) - 1)).toBeLessThan(1e-9);
    // α² = h/(r_s + h) = 10⁻⁶/(1 + 10⁻⁶): home's clock a thousand times faster.
    expect(1 / gravity.alpha).toBeCloseTo(Math.sqrt(1 + 1e6), 6);
    expect(hoverFloorKm('test-bh-one')).toBeCloseTo(rs * 1e-6, 12);
  });

  it('clamps a camera placed inside the horizon (outside a fall) to the floor', () => {
    controller.placeAt('earth', 26_000);
    frame();
    const rs = BH1.blackHole!.rsKm;
    const at = sim.bodies['test-bh-one'].pos;
    sim.camera.pos.copy(at).add(new Vector3(0.3 * rs, 0, 0));
    sim.ship.vel.set(0, 0, 0);
    updateGravity();
    expect(gravity.hole).toBe('test-bh-one');
    expect(gravity.heightKm).toBe(rs * 1e-6);
    expect(gravity.inside).toBe(false);
    expect(gravity.alpha).toBeCloseTo(1e-3, 8);
  });

  it('boosts from the Sun’s frame to a moving hole’s (Gaia BH3-like, 357 km/s)', () => {
    const rs = BH3.blackHole!.rsKm;
    expect(controller.hoverAt('test-bh-three', 1000, { x: 0, y: 1, z: 0 })).toBe(true);
    frame();
    expect(gravity.hole).toBe('test-bh-three');
    const u = 357;
    expect(gravity.framePhi).toBeCloseTo(Math.atanh(u / C_KM_S), 15);
    expect(gravity.framePhi).toBeCloseTo(1.19e-3, 5);
    expect(gravity.frameVelDir.dot(sim.bodies['test-bh-three'].vel) / u).toBeCloseTo(1, 12);
    // Hovering rides with the hole: at rest past the hovering observers, exactly.
    expect(gravity.relPhi).toBe(0);
    expect(gravity.rKm / rs).toBeCloseTo(500, 9);
  });
});

describe('near Sgr A*', () => {
  it('gives α, 1 − α and ln g without cancellation, and paces within 5,000 r_s', () => {
    registerGalaxyCore();
    const up = { x: 0, y: 1, z: 0 };
    // 10 r_s: 1/α = 1.0540926.
    expect(controller.hoverAt('sgr-a-star', 20, up)).toBe(true);
    frame();
    expect(gravity.hole).toBe('sgr-a-star');
    expect(1 / gravity.alpha).toBeCloseTo(1.0540926, 7);
    expect(gravity.oneMinusAlpha).toBeCloseTo(1 - Math.sqrt(0.9), 15);
    expect(gravity.lnGStatic).toBeCloseTo(-0.5 * Math.log(0.9), 15);
    expect(gravity.paced).toBe(true);
    expect(gravity.mTimeS).toBeCloseTo(21.165, 3);
    // 4,000 au: 1 − α ≈ x/2 = 1.06 × 10⁻⁵ (not paced), without cancellation.
    expect(controller.hoverAt('sgr-a-star', (4000 * AU_KM) / (gravity.rsKm / 2), up)).toBe(true);
    frame();
    const x = gravity.x;
    // The series 1 − √(1 − x) = x/2 + x²/8 + x³/16 and −½ ln(1 − x) = x/2 + x²/4 + x³/6, to 10⁻¹⁴.
    expect(gravity.oneMinusAlpha / (x / 2 + (x * x) / 8 + (x * x * x) / 16)).toBeCloseTo(1, 14);
    expect(gravity.lnGStatic / (x / 2 + (x * x) / 4 + (x * x * x) / 6)).toBeCloseTo(1, 14);
    expect(gravity.paced).toBe(false);
    // Paced from 1 − α = 10⁻⁴: just outside 5,000 r_s.
    controller.hoverAt('sgr-a-star', 2 * 4900, up);
    frame();
    expect(gravity.paced).toBe(true);
    controller.hoverAt('sgr-a-star', 2 * 5100, up);
    frame();
    expect(gravity.paced).toBe(false);
    // The raindrop's speed here and 1 − v, from float64.
    controller.hoverAt('sgr-a-star', 2.02, up);
    frame();
    expect(gravity.rainV).toBeCloseTo(Math.sqrt(2 / 2.02), 12);
    expect(gravity.rainOneMinusV).toBeCloseTo(1 - Math.sqrt(2 / 2.02), 14);
    expect(1 / gravity.alpha).toBeCloseTo(10.0499, 4);
  });

  it('costs well under its 0.05 ms budget a frame and allocates nothing', () => {
    registerGalaxyCore();
    controller.hoverAt('sgr-a-star', 20, { x: 0, y: 1, z: 0 });
    frame();
    for (let i = 0; i < 2000; i++) updateGravity();
    // This thread's processor time, best of batches (the rest of the suite shares the cores).
    let best = Infinity;
    for (let run = 0; run < 8; run++) {
      const t0 = cpuMs();
      for (let i = 0; i < 20_000; i++) updateGravity();
      best = Math.min(best, (cpuMs() - t0) / 20_000);
    }
    expect(best).toBeLessThan(0.05);
    // Young-generation bytes per call: the least of several uninterrupted tries.
    let bytes = Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      gc();
      const before = newSpace();
      for (let i = 0; i < 5000; i++) updateGravity();
      const grown = newSpace() - before;
      if (grown >= 0) bytes = Math.min(bytes, grown / 5000);
    }
    expect(bytes).toBeLessThan(1);
  });

  it('switches the lens frame to the raindrop’s below 3M in a fall, and reads the fall’s own motion', () => {
    registerGalaxyCore();
    const out = new Vector3(0, 0, 1);
    const rs = 2 * ((4.297e6 * GM_SUN_KM3_S2) / (C_KM_S * C_KM_S));
    const m = rs / 2;
    const pose = (rM: number) => {
      fallPose.active = true;
      fallPose.hole = 'sgr-a-star';
      fallPose.dirOut.copy(out);
      fallPose.rM = rM;
      fallPose.relKm.copy(out).multiplyScalar(rM * m);
      fallPose.heightKm = (rM - 2) * m;
      // Rain: at rest past the raindrop, inward past the hovering observers at √(2/r).
      fallPose.phiInStatic = rM > 2 ? Math.atanh(Math.sqrt(2 / rM)) : NaN;
      fallPose.phiRelRain = 0;
      updateGravity();
    };
    pose(3.1);
    expect(gravity.frame).toBe('static');
    expect(gravity.fallView).not.toBeNull();
    expect(gravity.fallView!.phi).toBeCloseTo(Math.atanh(Math.sqrt(2 / 3.1)), 12);
    expect(gravity.fallView!.rainPhi).toBeCloseTo(Math.atanh(Math.sqrt(2 / 3.1)), 12);
    expect(gravity.fallView!.dir.z).toBe(-1);
    expect(gravity.lnGStatic).toBeCloseTo(-0.5 * Math.log(1 - 2 / 3.1), 12);
    pose(2.9);
    expect(gravity.frame).toBe('rain');
    expect(gravity.lnGStatic).toBe(0);
    expect(gravity.fallView!.rainPhi).toBe(0);
    expect(gravity.inside).toBe(false);
    pose(1);
    expect(gravity.frame).toBe('rain');
    expect(gravity.inside).toBe(true);
    expect(gravity.alpha).toBe(0);
    expect(gravity.paced).toBe(true);
    expect(gravity.rainV).toBeCloseTo(Math.SQRT2, 12);
    expect(gravity.rainOneMinusV).toBeCloseTo(1 - Math.SQRT2, 12);
    expect(gravity.heightKm).toBeCloseTo(-m, 3);
    fallPose.active = false;
  });
});
