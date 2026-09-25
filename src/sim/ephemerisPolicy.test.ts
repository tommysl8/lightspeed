import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { AU_KM, BODY_ORDER, type BodyId } from '../physics/constants';
import { astroTimeAt, msFromCivil } from '../lib/time';
import {
  APPROX_END_MS,
  APPROX_START_MS,
  MOON_BLEND_MS,
  PLANET_BLEND_MS,
  PRECISE_END_MS,
  PRECISE_START_MS,
  ephemerisQuality,
  qualityNote,
} from './ephemerisPolicy';
import { bodyAvailability, bodyOrientation, bodyPositionAt, updateEphemeris, VOYAGER1_LAUNCH_MS, VOYAGER1_MODEL_START_MS } from './ephemeris';
import { sim } from './sim';

interface Snapshot {
  pos: Record<BodyId, Vector3>;
  vel: Record<BodyId, Vector3>;
  quat: Record<BodyId, Quaternion>;
  present: Record<BodyId, boolean>;
}

function snapshot(ms: number): Snapshot {
  sim.timeMs = ms;
  sim.astroTime = astroTimeAt(ms);
  updateEphemeris();
  const s = { pos: {}, vel: {}, quat: {}, present: {} } as Snapshot;
  for (const id of BODY_ORDER) {
    const b = sim.bodies[id];
    s.pos[id] = b.pos.clone();
    s.vel[id] = b.vel.clone();
    s.quat[id] = b.quat.clone();
    s.present[id] = b.present;
  }
  return s;
}

const SOLAR = BODY_ORDER.filter((id) => id !== 'proxima' && id !== 'sun');
const YEAR_MS = 365.25 * 86_400_000;

describe('ephemeris quality', () => {
  it('follows the documented boundaries', () => {
    expect(PRECISE_START_MS).toBe(msFromCivil(1700, 1, 1));
    expect(ephemerisQuality(PRECISE_START_MS)).toBe('precise');
    expect(ephemerisQuality(PRECISE_START_MS - 1)).toBe('approximate');
    expect(ephemerisQuality(PRECISE_END_MS - 1)).toBe('precise');
    expect(ephemerisQuality(PRECISE_END_MS)).toBe('approximate');
    expect(ephemerisQuality(APPROX_END_MS - 1)).toBe('approximate');
    expect(ephemerisQuality(APPROX_END_MS)).toBe('illustrative');
    expect(ephemerisQuality(APPROX_START_MS)).toBe('approximate');
    expect(ephemerisQuality(APPROX_START_MS - 1)).toBe('illustrative');
    expect(ephemerisQuality(Date.UTC(2026, 8, 25))).toBe('precise');
    expect(ephemerisQuality(msFromCivil(1e12, 1, 1))).toBe('illustrative');
    expect(qualityNote(msFromCivil(5000, 1, 1))).toMatch(/beyond 3000 CE are illustrative/);
    expect(qualityNote(msFromCivil(-5000, 1, 1))).toMatch(/before 3000 BCE are illustrative/);
  });
});

describe('model changes are continuous', () => {
  /** Positions just either side of `ms` must differ only by the motion in between. */
  function expectContinuous(ms: number, label: string) {
    const h = 1000; // 1 s either side
    const a = snapshot(ms - h);
    const b = snapshot(ms + h);
    for (const id of SOLAR) {
      if (!a.present[id]) continue;
      const moved = a.vel[id].length() * 2 * (h / 1000);
      expect(a.pos[id].distanceTo(b.pos[id]), `${label}: ${id}`).toBeLessThan(1.5 * moved + 1);
      expect(a.vel[id].distanceTo(b.vel[id]) / a.vel[id].length(), `${label}: ${id} velocity`).toBeLessThan(1e-3);
    }
  }

  it('across 1700 and 2200, and the ends of their blends', () => {
    expectContinuous(PRECISE_START_MS, '1700');
    expectContinuous(PRECISE_END_MS, '2200');
    expectContinuous(PRECISE_END_MS + PLANET_BLEND_MS, '2220');
    expectContinuous(PRECISE_START_MS - PLANET_BLEND_MS, '1680');
  });

  it('across 3000 BCE and 3000 CE (the Moon and the rotation models)', () => {
    expectContinuous(APPROX_END_MS, '3000 CE');
    expectContinuous(APPROX_END_MS + MOON_BLEND_MS, '3010 CE');
    expectContinuous(APPROX_START_MS, '3000 BCE');
    for (const edge of [APPROX_END_MS, APPROX_START_MS]) {
      const a = snapshot(edge - 1000);
      const b = snapshot(edge + 1000);
      // In 2 s Earth turns 0.008° and Jupiter 0.020°: no more than that.
      for (const id of ['earth', 'moon', 'sun', 'jupiter', 'pluto'] as BodyId[]) {
        expect((a.quat[id].angleTo(b.quat[id]) * 180) / Math.PI, id).toBeLessThan(id === 'jupiter' ? 0.025 : 0.01);
      }
    }
  });

  it('inside a blend, velocity is the derivative of position', () => {
    const ms = PRECISE_END_MS + PLANET_BLEND_MS / 2;
    const h = 600_000; // 10 min
    const a = snapshot(ms - h);
    const mid = snapshot(ms);
    const b = snapshot(ms + h);
    for (const id of SOLAR) {
      const fd = b.pos[id].clone().sub(a.pos[id]).divideScalar((2 * h) / 1000);
      expect(fd.distanceTo(mid.vel[id]) / mid.vel[id].length(), id).toBeLessThan(2e-3);
    }
  });

  it('bodyPositionAt agrees with the per-frame update in every regime', () => {
    for (const ms of [Date.UTC(2026, 0, 1), PRECISE_END_MS + 5 * YEAR_MS, msFromCivil(2600, 1, 1), msFromCivil(-40_000, 1, 1), msFromCivil(1e9, 1, 1)]) {
      const s = snapshot(ms);
      for (const id of BODY_ORDER) {
        const p = bodyPositionAt(id, astroTimeAt(ms));
        expect(p.distanceTo(s.pos[id]), `${id} at ${ms}`).toBeLessThan(1e-3 * Math.max(1, s.pos[id].length() * 1e-9));
      }
    }
  });
});

describe('far from now', () => {
  it('keeps every body finite and on its orbit, from the Big Bang to 10¹² years ahead', () => {
    for (const year of [-13.8e9 + 1, -1e6, 30_000, 1e6, 1e9, 1e12]) {
      const s = snapshot(msFromCivil(year, 1, 1));
      for (const id of BODY_ORDER) {
        expect(Number.isFinite(s.pos[id].x + s.pos[id].y + s.pos[id].z), `${id} ${year}`).toBe(true);
        expect(Number.isFinite(s.vel[id].x + s.vel[id].y + s.vel[id].z), `${id} ${year}`).toBe(true);
        expect(Math.abs(s.quat[id].length() - 1), `${id} ${year}`).toBeLessThan(1e-9);
      }
      const r = s.pos.earth.length() / AU_KM;
      expect(r).toBeGreaterThan(0.98);
      expect(r).toBeLessThan(1.02);
      const moon = s.pos.moon.distanceTo(s.pos.earth);
      expect(moon).toBeGreaterThan(350_000);
      expect(moon).toBeLessThan(410_000);
      // Earth's frozen pole stays tilted ~23° from ecliptic north.
      const pole = new Vector3(0, 1, 0).applyQuaternion(s.quat.earth);
      const tilt = (pole.angleTo(new Vector3(0, 1, 0)) * 180) / Math.PI;
      expect(tilt).toBeGreaterThan(20);
      expect(tilt).toBeLessThan(27);
      // The Moon keeps (roughly) the same face towards Earth.
      const toEarth = s.pos.earth.clone().sub(s.pos.moon).normalize().applyQuaternion(s.quat.moon.clone().invert());
      expect((Math.abs(Math.asin(toEarth.y)) * 180) / Math.PI, `${year}`).toBeLessThan(12);
      expect((Math.abs(Math.atan2(-toEarth.z, toEarth.x)) * 180) / Math.PI, `${year}`).toBeLessThan(15);
    }
  });

  it('moves the planets smoothly at real time, even where a float64 only resolves seconds', () => {
    const ms = msFromCivil(1e6, 1, 1);
    const a = bodyPositionAt('earth', astroTimeAt(ms));
    const b = bodyPositionAt('earth', astroTimeAt(ms + 60_000));
    // One minute of orbit: 29.8 km/s × 60 s
    expect(a.distanceTo(b)).toBeGreaterThan(1700);
    expect(a.distanceTo(b)).toBeLessThan(1900);
  });

  it('spins Earth once a sidereal day beyond 3000 CE', () => {
    const t0 = msFromCivil(5000, 6, 1);
    const q0 = bodyOrientation('earth', astroTimeAt(t0));
    const q1 = bodyOrientation('earth', astroTimeAt(t0 + 86_164_091)); // one sidereal day
    expect((q0.angleTo(q1) * 180) / Math.PI).toBeLessThan(0.05);
    const qh = bodyOrientation('earth', astroTimeAt(t0 + 86_164_091 / 4));
    expect((q0.angleTo(qh) * 180) / Math.PI).toBeCloseTo(90, 0);
  });
});

describe('Voyager 1 before it was there', () => {
  it('is not available before launch, nor before the Saturn flyby', () => {
    expect(bodyAvailability('voyager1', VOYAGER1_LAUNCH_MS - 1).available).toBe(false);
    expect(bodyAvailability('voyager1', VOYAGER1_LAUNCH_MS - 1).reason).toMatch(/not been launched/);
    expect(bodyAvailability('voyager1', VOYAGER1_MODEL_START_MS - 1).reason).toMatch(/Saturn flyby/);
    expect(bodyAvailability('voyager1', VOYAGER1_MODEL_START_MS).available).toBe(true);
    expect(bodyAvailability('earth', msFromCivil(-5000, 1, 1)).available).toBe(true);
    expect(snapshot(msFromCivil(1979, 1, 1)).present.voyager1).toBe(false);
    expect(snapshot(msFromCivil(1990, 1, 1)).present.voyager1).toBe(true);
  });
});
