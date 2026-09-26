import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PROXIMA_DISTANCE_KM } from '../physics/constants';
import { astroTimeAt, msFromCivil } from '../lib/time';
import { chrono, chronoLaunch, chronoTau, chronoTripEnd, zeroChrono } from './chronometer';
import { setPaused, setWarp } from './clock';
import { updateEphemeris } from './ephemeris';
import { updateApparentPositions } from './lightDelay';
import { clearPulses, emitPulse, pulses, updatePulses } from './pulses';
import { setSimTime, sim } from './sim';
import { tickClock, tickTrip } from './tick';
import {
  defaultShipRate,
  earthTimeAtTau,
  jumpToArrival,
  lagAtTau,
  launch,
  planTrip,
  playbackSeconds,
  setShipRate,
  stepShipRate,
  tauAtEarthTime,
  travel,
  tripPace,
  TRIP_PLAYBACK_S,
  type Drive,
  type Trip,
} from './travel';

const FPS = 60;
const T0 = Date.UTC(2026, 8, 24, 15, 0, 0);

function depart(dest: Parameters<typeof planTrip>[0], beta: number, drive?: Drive): Trip {
  setSimTime(T0);
  updateEphemeris();
  sim.ship.vel.set(0, 0, 0);
  zeroChrono();
  const from = sim.bodies.earth.pos.clone().add(new Vector3(26_000, 0, 0));
  const plan = planTrip(dest, beta, from, sim.astroTime, drive)!;
  launch(plan);
  chronoLaunch();
  return travel.trip!;
}

/** Run frames of 1/60 s until the trip arrives; returns the number of frames. */
function fly(maxFrames = 10 * FPS * TRIP_PLAYBACK_S): number {
  for (let n = 1; n <= maxFrames; n++) {
    const dt = tickClock(1 / FPS);
    updateEphemeris();
    if (tickTrip(dt)) return n;
  }
  return -1;
}

beforeEach(() => {
  travel.trip = null;
  chronoTripEnd();
  setPaused(false);
  setWarp(1);
});

describe('flights paced by ship time', () => {
  it('play any real trip in about a minute, never slower than real time', () => {
    const saturn = planTrip('saturn', 0.9, new Vector3(1.5e8, 0, 0), astroTimeAt(T0))!;
    expect(defaultShipRate(saturn)).toBeCloseTo(saturn.shipTime / TRIP_PLAYBACK_S, 9);
    expect(playbackSeconds(saturn)).toBeCloseTo(TRIP_PLAYBACK_S, 9);
    // A 1.3 s hop is not slowed down below real time.
    expect(defaultShipRate({ shipTime: 1.3 })).toBe(1);
  });

  it('keep the chronometers exact across a cruise at 0.9c to Saturn', () => {
    const trip = depart('saturn', 0.9);
    expect(trip.pacing).toBe('ship');
    // Halfway: the recorder shows exactly the trip's own τ and t(τ).
    for (let i = 0; i < 30 * FPS; i++) {
      const dt = tickClock(1 / FPS);
      updateEphemeris();
      tickTrip(dt);
    }
    expect(trip.tau / trip.shipTime).toBeCloseTo(0.5, 6);
    expect(chronoTau()).toBeCloseTo(trip.tau, 6);
    expect(chrono.t).toBeCloseTo(earthTimeAtTau(trip, trip.tau), 6);
    expect(chrono.lag / lagAtTau(trip, trip.tau)).toBeCloseTo(1, 12);
    expect((sim.timeMs - trip.startMs) / 1000 / trip.t).toBeCloseTo(1, 9);

    const frames = fly();
    expect(30 * FPS + frames).toBeGreaterThanOrEqual(TRIP_PLAYBACK_S * FPS - 1);
    expect(30 * FPS + frames).toBeLessThanOrEqual(TRIP_PLAYBACK_S * FPS + 1);
    expect(chrono.t / trip.earthTime).toBeCloseTo(1, 12);
    expect(chronoTau() / trip.shipTime).toBeCloseTo(1, 12);
    expect(sim.timeMs).toBe(trip.startMs + 1000 * trip.earthTime);
    expect(travel.trip).toBeNull();
  });

  it('keep them exact on a 1 g flight to Proxima Centauri (3.5 years aboard, 5.9 at home)', () => {
    const trip = depart('proxima', 0, 'rocket');
    expect(trip.distance).toBeGreaterThan(0.99 * PROXIMA_DISTANCE_KM);
    const frames = fly();
    expect(Math.abs(frames - TRIP_PLAYBACK_S * FPS)).toBeLessThanOrEqual(1);
    expect(chrono.t / trip.earthTime).toBeCloseTo(1, 12);
    expect(chronoTau() / trip.shipTime).toBeCloseTo(1, 12);
    expect(chrono.tauValid).toBe(true);
    // Earth time runs fastest at the flip: pace = ship rate × γ.
    expect(trip.earthTime / trip.shipTime).toBeGreaterThan(1.6);
  });

  it('stop while paused, and skip to arrival exactly', () => {
    const trip = depart('mars', 0.5);
    setPaused(true);
    for (let i = 0; i < 100; i++) tickTrip(tickClock(1 / FPS));
    expect(trip.tau).toBe(0);
    expect(sim.timeMs).toBe(trip.startMs);
    setPaused(false);
    for (let i = 0; i < 100; i++) tickTrip(tickClock(1 / FPS));
    expect(trip.tau).toBeGreaterThan(0);
    jumpToArrival();
    expect(fly(2)).toBe(1);
    expect(chronoTau() / trip.shipTime).toBeCloseTo(1, 12);
    expect(chrono.t / trip.earthTime).toBeCloseTo(1, 12);
  });

  it('let the ship rate be changed, within bounds, and describe it', () => {
    const trip = depart('proxima', 0, 'rocket');
    const base = trip.shipRate;
    expect(stepShipRate(1)).toBeCloseTo(base * 10, 6);
    expect(setShipRate(0.001)).toBe(1);
    expect(setShipRate(1e30)).toBe(trip.shipTime);
    setShipRate(base);
    const pace = tripPace(trip);
    expect(pace.shipPerSecond).toBe(base);
    expect(pace.realSecondsLeft).toBeCloseTo(TRIP_PLAYBACK_S, 6);
    // 3.54 years aboard in 60 s: three weeks a second; at launch Earth runs at the same pace.
    expect(pace.text).toBe('1 s here = 22 days on board; 22 days at home');
  });

  it('leave the fictional warp on Earth time, at the time warp, with τ undefined', () => {
    const trip = depart('mars', 10, 'warp');
    expect(trip.pacing).toBe('earth');
    setWarp(10);
    const dt = tickClock(1);
    expect(dt).toBe(10);
    expect(tickTrip(dt)).toBeNull();
    expect(trip.t).toBeCloseTo(10, 6);
    expect(chrono.t).toBeCloseTo(10, 6);
    expect(chrono.tauValid).toBe(false);
    expect(tauAtEarthTime(trip, 5)).toBeNaN();
    expect(tripPace(trip).text).toBe('1 s here = 10 s at home');
  });

  it('keep everything finite at the fastest warp, retarded light and pulses included', () => {
    setSimTime(T0);
    updateEphemeris();
    zeroChrono();
    clearPulses();
    emitPulse('sun');
    setWarp(1e16);
    for (let i = 0; i < 120; i++) {
      const dt = tickClock(1 / FPS);
      updateEphemeris();
      tickTrip(dt);
      updatePulses();
      updateApparentPositions(true);
      for (const b of Object.values(sim.bodies)) {
        const s = b.pos.x + b.pos.y + b.pos.z + b.apparentPos.x + b.vel.x + b.quat.w + b.lightDelay;
        expect(Number.isFinite(s), `${b.id} at frame ${i}`).toBe(true);
      }
    }
    // Two seconds at 320 million years a second.
    expect((sim.timeMs - T0) / 1000 / (2e16)).toBeCloseTo(1, 9);
    expect(chrono.t / 2e16).toBeCloseTo(1, 12);
    // The pulse told every detector, then went past everything and was retired.
    expect(pulses.list.length).toBe(0);
    setWarp(1);
  });

  it('play by ship time far from the present too', () => {
    setSimTime(msFromCivil(1e9, 1, 1));
    updateEphemeris();
    sim.ship.vel.set(0, 0, 0);
    zeroChrono();
    const plan = planTrip('neptune', 0.99, sim.bodies.earth.pos.clone().add(new Vector3(26_000, 0, 0)))!;
    launch(plan);
    chronoLaunch();
    const trip = travel.trip!;
    expect(Math.abs(fly() - TRIP_PLAYBACK_S * FPS)).toBeLessThanOrEqual(1);
    expect(chronoTau() / trip.shipTime).toBeCloseTo(1, 12);
    expect(chrono.t / trip.earthTime).toBeCloseTo(1, 12);
  });
});
