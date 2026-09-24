import { describe, expect, it } from 'vitest';
import { MakeTime } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, OBLIQUITY_J2000_DEG } from '../physics/constants';
import { bodyOrientation, bodyPositionAt } from './ephemeris';
import { eclToWorld } from './frames';
import { voyagerHelioState } from './voyager';

describe('ephemeris in the world frame', () => {
  it('keeps Earth about 1 au from the Sun, near the ecliptic plane', () => {
    const p = bodyPositionAt('earth', MakeTime(new Date('2026-09-24T00:00:00Z')));
    expect(p.length() / AU_KM).toBeGreaterThan(0.98);
    expect(p.length() / AU_KM).toBeLessThan(1.02);
    expect(Math.abs(p.y) / p.length()).toBeLessThan(1e-4); // world +Y is ecliptic north
  });

  it('matches JPL Horizons for Voyager 1 (heliocentric, 2026-01-01 TDB)', () => {
    // Horizons heliocentric ecliptic J2000 position at JD 2461041.5 TDB (= 2025-12-31 23:58:50.8 UTC)
    const t = MakeTime(new Date(Date.UTC(2025, 11, 31, 23, 58, 50, 816)));
    const truth = eclToWorld(-4.762_659_739_242_758e9, -2.014_761_457_045_306e10, 1.457_753_551_876_435e10);
    const p = voyagerHelioState(t).pos;
    expect(p.distanceTo(truth)).toBeLessThan(2e4); // km, out of 2.5 × 10¹⁰
  });

  it("orients Earth's pole 23.44° from ecliptic north", () => {
    const qe = bodyOrientation('earth', MakeTime(new Date('2026-01-01T00:00:00Z')));
    const pole = new Vector3(0, 1, 0).applyQuaternion(qe);
    const eps = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
    // The J2000 celestial pole in world axes is (0, cos ε, −sin ε); precession moves it ~0.14° by 2026.
    const angle = (pole.angleTo(new Vector3(0, Math.cos(eps), -Math.sin(eps))) * 180) / Math.PI;
    expect(angle).toBeLessThan(0.3);
  });

  it('puts the subsolar point at the right longitude (spin angle and texture layout agree)', () => {
    // Near the March equinox at 12:00 UTC the Sun is overhead near 0° latitude, ~+1.9° longitude
    // (the equation of time is about −7.5 min).
    const t = MakeTime(new Date('2026-03-20T12:00:00Z'));
    const earth = bodyPositionAt('earth', t);
    const toSun = earth.clone().negate().normalize();
    const local = toSun.applyQuaternion(bodyOrientation('earth', t).invert());
    const lat = (Math.asin(local.y) * 180) / Math.PI;
    const lon = (Math.atan2(-local.z, local.x) * 180) / Math.PI; // local −Z is 90°E
    expect(Math.abs(lat)).toBeLessThan(0.5);
    expect(lon).toBeGreaterThan(0.9);
    expect(lon).toBeLessThan(2.9);
  });

  it('keeps the Moon about 384,000 km from Earth with the near side facing Earth', () => {
    const t = MakeTime(new Date('2026-09-24T00:00:00Z'));
    const earth = bodyPositionAt('earth', t);
    const moon = bodyPositionAt('moon', t);
    const d = moon.distanceTo(earth);
    expect(d).toBeGreaterThan(356_000);
    expect(d).toBeLessThan(407_000);
    const toEarth = earth.sub(moon).normalize().applyQuaternion(bodyOrientation('moon', t).invert());
    // Sub-Earth point stays within libration (~8°) of 0° lat / 0° lon.
    expect(Math.abs((Math.asin(toEarth.y) * 180) / Math.PI)).toBeLessThan(8);
    expect(Math.abs((Math.atan2(-toEarth.z, toEarth.x) * 180) / Math.PI)).toBeLessThan(9);
  });
});
