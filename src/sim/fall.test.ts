/**
 * Falls into a black hole (sim/fall.ts) against the closed forms (docs/data/blackholes.md §4 and
 * §10), with the app's own constants (GM☉ = 1.327 124 4 × 10¹¹ km³/s², Sgr A* 4.297 × 10⁶ M☉: GM/c³ =
 * 21.1648 s; the reference values computed to 30 digits with mpmath): rain from 10 r_s reaches the horizon
 * after 864.17 s of proper time and ends 28.19 s later where tides reach 1,000 m/s² across 2 m (0.0104 r_s);
 * a drip let go from 10 r_s takes 2,102.6 s to the centre, the horizon at 2,073.5 s, and home's clock on the
 * free-fallers' slices runs 2,153.7 s, dT/dτ
 * from 1/α₀ = 1.05409255 to (1 + e²)/(2e) = 1.00138793 at the horizon. The pace: 20 s of real time to 2 r_s
 * and 80 s from there, at Sgr A* (where the last stretch is real time within 0.3 %) and at M87* ("1 s = 25
 * min aboard"). The chronometers follow the fall; stellar holes are refused (tides); a fall holds the
 * trip gates, and stopping or ending it puts the camera back hovering at r₀ with home's clock kept.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { C_KM_S, GM_SUN_KM3_S2, PARSEC_KM } from '../physics/constants';
import { ALWAYS, registerBodies, type BodyRecord } from './bodies';
import { controller } from '../controls/cameraController';
import { chrono, chronoTripEnd, zeroChrono } from './chronometer';
import { resetToNow, setEpoch, setPaused, setWarp } from './clock';
import { updateEphemeris } from './ephemeris';
import { registerGalaxyCore } from './galaxy/load';
import { fallPose, gravity, updateGravity } from './gravity';
import { advanceFallClock, endFall, fall, fallReadings, letGo, startFall, stepFallPace, updateFall, FALL_FIRST_S, FALL_LAST_S, type FallReadings } from './fall';
import { setSimTime, sim } from './sim';
import { updateShipKinematics } from './shipKinematics';
import { tickClock, tickTrip } from './tick';
import { travel } from './travel';
import { useUI } from '../state/ui';
import { startTrip, stopTrip } from '../ui/tripActions';
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
const FPS = 60;
/** Sgr A*: GM/c³ (s) and M = GM/c² (km) with the app's constants. */
const SGR_GM = 4.297e6 * GM_SUN_KM3_S2;
const SGR_M_KM = SGR_GM / (C_KM_S * C_KM_S);

/** A black hole for the tests, fixed at an ecliptic place (km). */
function holeRecord(id: string, massMsun: number, at: [number, number, number], fallAllowed = massMsun > 1e5): BodyRecord {
  const gm = massMsun * GM_SUN_KM3_S2;
  const rs = (2 * gm) / (C_KM_S * C_KM_S);
  return {
    id,
    name: id,
    kind: 'black-hole',
    parent: null,
    physical: { radiusKm: rs, gmKm3S2: gm, colour: '#000000' },
    visual: { renderer: 'lens' },
    framing: { radii: 50, minKm: rs * (1 + 1e-6) },
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
      fallAllowed,
      refs: [],
    },
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

const M87 = holeRecord('test-m87-hole', 6.5e9, [-1.2e6 * PARSEC_KM, 1.3e7 * PARSEC_KM, 4e6 * PARSEC_KM]);
const STELLAR = holeRecord('test-stellar-hole', 9.27, [300 * PARSEC_KM, 250 * PARSEC_KM, 100 * PARSEC_KM]);
const FORBIDDEN = holeRecord('test-closed-hole', 1e7, [5e5 * PARSEC_KM, 0, 0], false);
const DIR = { x: 0.48, y: 0.6, z: 0.64 };

/** One frame as SimDriver runs it (the parts that concern the clock, the fall, the camera and gravity). */
function frame(dt = 1 / FPS): void {
  const dtSim = tickClock(dt);
  // Right after the clock, before the camera and gravity use the fall's place.
  updateFall();
  updateEphemeris();
  tickTrip(dtSim);
  controller.update(dt, dtSim);
  updateShipKinematics();
  updateGravity();
}

/** Hover at r (units of M) over a hole, with the clocks zeroed. */
function hover(hole: string, rM: number): void {
  expect(controller.hoverAt(hole, rM, DIR)).toBe(true);
  controller.update(0, 0);
  updateShipKinematics();
  updateGravity();
  zeroChrono();
}

beforeAll(() => {
  registerGalaxyCore();
  registerBodies([M87, STELLAR, FORBIDDEN]);
});

beforeEach(() => {
  if (fall.trip) endFall('stopped');
  travel.trip = null;
  chronoTripEnd();
  setSimTime(T0);
  updateEphemeris();
  setPaused(false);
  setWarp(1);
  useUI.setState({ tripActive: false, fallActive: false, journeyNote: null });
  fallPose.active = false;
});

describe('rain from 10 r_s into Sgr A*', () => {
  it('reaches the horizon after 864.17 s and ends 28.19 s later, 0.0104 r_s from the centre', () => {
    hover('sgr-a-star', 20);
    expect(startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR })).toEqual({ ok: true });
    const t = fall.trip!;
    expect(t.model.tauHorizon).toBeCloseTo(864.168, 2);
    expect(t.model.tauEnd - t.model.tauHorizon).toBeCloseTo(28.19, 2);
    expect(t.model.rEnd / 2).toBeCloseTo(0.010373, 5);
    expect(t.tauTwoRs).toBeCloseTo(812.570, 2);
    expect(t.rateFirst).toBeCloseTo(812.570 / FALL_FIRST_S, 3);
    // The last stretch is real time within 0.3 %.
    expect(t.rateLast).toBeCloseTo(0.99735, 4);
    expect(useUI.getState().fallActive).toBe(true);
    expect(useUI.getState().tripActive).toBe(true);
    expect(controller.mode).toBe('fall');
  });

  it('plays 20 s to 2 r_s and 80 s from there to the end, with the chronometers on the fall', () => {
    hover('sgr-a-star', 20);
    const startMs = sim.timeMs;
    startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR });
    const t = fall.trip!;
    for (let i = 0; i < FALL_FIRST_S * FPS; i++) frame();
    // Exactly at 2 r_s after 20 s of real time (a frame that crosses it is split there).
    expect(Math.abs(t.tau / t.tauTwoRs - 1)).toBeLessThan(1e-9);
    expect(t.state.r).toBeCloseTo(4, 6);
    // The camera and the gravity state ride the closed form: r exactly.
    expect(gravity.hole).toBe('sgr-a-star');
    expect(gravity.rM).toBeCloseTo(t.state.r, 9);
    expect(gravity.frame).toBe('static');
    expect(controller.holeHeightKm).toBeCloseTo(2 * SGR_M_KM, 0);
    // The chronometers: your clock is τ, home's T (rain: T = τ), and home's clock is set from it.
    expect(chrono.tau).toBeCloseTo(t.tau, 9);
    expect(chrono.t).toBeCloseTo(t.state.T, 9);
    expect(sim.timeMs).toBe(startMs + 1000 * t.state.T);
    // Inside the horizon after 51.6 s more, the raindrop's tables below 3M.
    for (let i = 0; i < 60 * FPS; i++) frame();
    expect(t.state.inside).toBe(true);
    expect(gravity.inside).toBe(true);
    expect(gravity.frame).toBe('rain');
    const r: FallReadings = { tau: 0, rOverRs: 0, heightKm: 0, homeT: 0, homeSeenRate: 0, speedPastHover: 0, tidalMS2: 0, tauLeft: 0 };
    expect(fallReadings(r)).not.toBeNull();
    expect(r.rOverRs).toBeLessThan(1);
    expect(r.speedPastHover).toBeNaN();
    // The rest of the 80 s: the fall ends, and the camera is back hovering at r₀, home's clock kept.
    let n = 0;
    // Until the tidal end is reached (that frame is drawn there; the next one ends the fall).
    while (fall.trip && !fall.trip.ended && n < 30 * FPS) {
      frame();
      n++;
    }
    frame();
    expect(fall.trip).toBeNull();
    // 20 s + 80 s of real time, to a frame.
    expect(Math.abs(FALL_FIRST_S * FPS + 60 * FPS + n - (FALL_FIRST_S + FALL_LAST_S) * FPS)).toBeLessThanOrEqual(1);
    expect(fall.lastEnd?.why).toBe('ended');
    expect(fall.lastEnd!.tauInside).toBeCloseTo(28.19, 2);
    // Home's clock kept: the fall's own T at the end (rain: T = τ), then one frame hovering at r₀ (1/α at 10 r_s).
    expect(fall.lastEnd!.homeT).toBeCloseTo(892.358, 2);
    expect((sim.timeMs - startMs) / 1000 - fall.lastEnd!.homeT).toBeCloseTo(1 / FPS / Math.sqrt(0.9), 4);
    expect(controller.mode).toBe('orbit');
    expect(controller.holeHeightKm / (18 * SGR_M_KM)).toBeCloseTo(1, 12);
    expect(useUI.getState().fallActive).toBe(false);
    expect(useUI.getState().tripActive).toBe(false);
    frame();
    expect(gravity.frame).toBe('static');
    expect(gravity.rM).toBeCloseTo(20, 9);
    // The clocks run on as a hover's, finite and consistent (t = τ + lag), from the fall's own last values.
    const tau1 = chrono.tau;
    for (let i = 0; i < FPS; i++) frame();
    expect(Number.isFinite(chrono.lag)).toBe(true);
    expect((chrono.t - chrono.tau - chrono.lag) / chrono.t).toBeCloseTo(0, 12);
    expect(chrono.tau - tau1).toBeCloseTo(1, 9);
    expect(chrono.tau).toBeGreaterThan(892.358);
  }, 60_000);

  it('reads home overhead at half rate at the horizon, and tides of 1.1 × 10⁻³ m/s²', () => {
    hover('sgr-a-star', 20);
    startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR });
    const t = fall.trip!;
    t.tau = t.model.tauHorizon * (1 - 1e-12);
    t.model.stateAt(t.tau, t.state);
    const r: FallReadings = { tau: 0, rOverRs: 0, heightKm: 0, homeT: 0, homeSeenRate: 0, speedPastHover: 0, tidalMS2: 0, tauLeft: 0 };
    fallReadings(r);
    expect(r.rOverRs).toBeCloseTo(1, 9);
    expect(r.homeSeenRate).toBeCloseTo(0.5, 8);
    expect(r.tidalMS2).toBeCloseTo(1.13e-3, 4);
    expect(r.tauLeft).toBeCloseTo(28.19, 2);
    expect(r.speedPastHover).toBeGreaterThan(0.999_999);
  });
});

describe('a drip let go from a hover at 10 r_s', () => {
  it('takes 2,102.6 s to the centre, 2,073.5 s to the horizon; home runs 2,153.7 s on the free-fallers’ clocks', () => {
    hover('sgr-a-star', 20);
    expect(letGo('sgr-a-star', gravity.rM, gravity.heightKm, gravity.mKm, gravity.camRelHoleKm)).toEqual({ ok: true });
    const t = fall.trip!;
    expect(t.model.kind).toBe('drip');
    expect(t.model.e).toBeCloseTo(Math.sqrt(0.9), 14);
    expect(t.model.tauAtR(0)).toBeCloseTo(2102.639, 2);
    expect(t.model.tauHorizon).toBeCloseTo(2073.524, 2);
    expect(t.model.tauEnd).toBeCloseTo(2102.609, 2);
    // dT/dτ starts at 1/α₀ (continuous with the hover) and is (1 + e²)/(2e) at the horizon.
    expect(t.state.dTdTau).toBeCloseTo(1.0540925534, 8);
    const s = { ...t.state };
    t.model.stateAt(t.model.tauHorizon, s);
    expect(s.dTdTau).toBeCloseTo(1.0013879257, 8);
    expect(s.T).toBeCloseTo(2124.553, 2);
    t.model.stateAt(t.model.tauEnd, s);
    expect(s.T).toBeCloseTo(2153.662, 2);
    // The chronometers take the fall's τ, T and T − τ.
    for (let i = 0; i < 10 * FPS; i++) frame();
    expect(chrono.tau).toBeCloseTo(t.tau, 9);
    expect(chrono.t).toBeCloseTo(t.state.T, 9);
    expect(chrono.lag).toBeCloseTo(t.state.T - t.tau, 9);
    // Moving outward past the raindrop, inward past the hovering observers.
    expect(t.state.phiRelRain).toBeGreaterThan(0);
    expect(gravity.relPhi).toBeCloseTo(t.state.phiInStatic, 12);
  }, 30_000);
});

describe('the pace at M87*', () => {
  it('plays the same 20 s + 80 s, one second of the last stretch 25 minutes aboard', () => {
    hover('test-m87-hole', 20);
    startFall({ hole: 'test-m87-hole', r0: 20, e: 1, dirOut: DIR });
    const t = fall.trip!;
    expect(t.rateLast / 60).toBeCloseTo(25.15, 1);
    expect(t.rateFirst).toBeCloseTo(61458, -1);
    let n = 0;
    while (fall.trip && !fall.trip.ended && n < 120 * FPS) {
      frame();
      n++;
    }
    frame();
    expect(fall.trip).toBeNull();
    expect(Math.abs(n - (FALL_FIRST_S + FALL_LAST_S) * FPS)).toBeLessThanOrEqual(1);
  }, 60_000);

  it('lets the pace stepper change it, and keeps the readings exact', () => {
    hover('test-m87-hole', 20);
    startFall({ hole: 'test-m87-hole', r0: 20, e: 1, dirOut: DIR });
    const t = fall.trip!;
    const base = t.rate;
    expect(stepFallPace(1)).toBe(10);
    frame();
    expect(t.rate).toBeCloseTo(base * 10, 6);
    expect(stepFallPace(-1)).toBe(1);
    endFall('stopped');
  });
});

describe('its cost', () => {
  it('takes well under its 0.05 ms budget a frame (with the gravity state) and allocates next to nothing', () => {
    hover('sgr-a-star', 20);
    startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR, rate: 1e-6 });
    const step = () => {
      advanceFallClock(1 / FPS);
      updateFall();
      updateGravity();
    };
    for (let i = 0; i < 5000; i++) step();
    let best = Infinity;
    for (let run = 0; run < 6; run++) {
      const t0 = cpuMs();
      for (let i = 0; i < 20_000; i++) step();
      best = Math.min(best, (cpuMs() - t0) / 20_000);
    }
    expect(best).toBeLessThan(0.05);
    let bytes = Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      gc();
      const before = newSpace();
      for (let i = 0; i < 5000; i++) step();
      const grown = newSpace() - before;
      if (grown >= 0) bytes = Math.min(bytes, grown / 5000);
    }
    // No objects: at most a couple of numbers a frame (a double returned from a call that is not inlined
    // is boxed, as tickClock's own result is), never anything per body.
    expect(bytes).toBeLessThan(64);
    endFall('stopped');
  });
});

describe('refusals and gates', () => {
  it('refuses stellar-mass holes (tides), closed ones, a second fall, the horizon itself and non-holes', () => {
    expect(startFall({ hole: 'test-stellar-hole', r0: 20, e: 1 })).toEqual({ ok: false, reason: 'tides' });
    expect(startFall({ hole: 'test-closed-hole', r0: 20, e: 1 })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(startFall({ hole: 'sgr-a-star', r0: 2, e: 1 })).toEqual({ ok: false, reason: 'inside' });
    expect(startFall({ hole: 'earth', r0: 20, e: 1 })).toEqual({ ok: false, reason: 'no-hole' });
    hover('sgr-a-star', 20);
    expect(startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR }).ok).toBe(true);
    expect(startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR })).toEqual({ ok: false, reason: 'busy' });
  });

  it('holds the trip gates: no Now, no dates, no trips; stopTrip ends it, back at r₀ with home’s clock kept', () => {
    hover('sgr-a-star', 20);
    startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR });
    for (let i = 0; i < 5 * FPS; i++) frame();
    const ms = sim.timeMs;
    resetToNow();
    expect(sim.timeMs).toBe(ms);
    expect(setEpoch(Date.UTC(2000, 0, 1))).toBe(false);
    expect(startTrip('earth', 0.5)).toBe(false);
    expect(travel.trip).toBeNull();
    stopTrip();
    expect(fall.trip).toBeNull();
    expect(fall.lastEnd?.why).toBe('stopped');
    expect(sim.timeMs).toBe(ms);
    expect(controller.mode).toBe('orbit');
    expect(controller.holeHeightKm / (18 * SGR_M_KM)).toBeCloseTo(1, 12);
    const rel = new Vector3();
    expect(controller.holeRelative(rel)).toBe('sgr-a-star');
    expect(rel.clone().normalize().dot(new Vector3(DIR.x, DIR.y, DIR.z))).toBeCloseTo(1, 14);
    expect(useUI.getState().tripActive).toBe(false);
  });

  it('ends when the camera leaves the fall (a slew, the next scene), and refuses a double-click meanwhile', () => {
    hover('sgr-a-star', 20);
    startFall({ hole: 'sgr-a-star', r0: 20, e: 1, dirOut: DIR });
    frame();
    let clicked = false;
    controller.onDoubleClick = () => (clicked = true);
    const c = controller as unknown as { dom: unknown; onDblClick: (e: { clientX: number; clientY: number }) => void };
    c.dom = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    c.onDblClick({ clientX: 10, clientY: 10 });
    expect(clicked).toBe(false);
    c.dom = null;
    controller.onDoubleClick = null;
    controller.leaveHoleModes();
    expect(fall.trip).toBeNull();
    expect(controller.mode).toBe('orbit');
    expect(useUI.getState().fallActive).toBe(false);
  });
});
