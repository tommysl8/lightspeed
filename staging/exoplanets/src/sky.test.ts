import { describe, expect, it } from 'vitest';
import { OBLIQUITY_J2000_DEG } from './constants.ts';
import {
  eclipticToEquatorial,
  eclipticToWorld,
  equatorialToEcliptic,
  equatorialToSky,
  positionAngle,
  raDecToUnit,
  skyBasis,
  skyToEcliptic,
  skyToEquatorial,
} from './sky.ts';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

describe('sky basis', () => {
  const stars: [number, number][] = [
    [0, 0],
    [346.626, -5.043], // TRAPPIST-1
    [217.393, -62.676], // Proxima
    [269.449, 4.738], // Barnard's star
    [53.228, -9.458], // eps Eri
    [101.287, 89.9], // near the pole
  ];
  it('is orthonormal and left-handed (n x e = -r)', () => {
    for (const [ra, dec] of stars) {
      const { n, e, r } = skyBasis(ra, dec);
      for (const v of [n, e, r]) expect(dot(v, v)).toBeCloseTo(1, 14);
      expect(dot(n, e)).toBeCloseTo(0, 14);
      expect(dot(n, r)).toBeCloseTo(0, 14);
      expect(dot(e, r)).toBeCloseTo(0, 14);
      const c = cross(n, e);
      expect(c.x).toBeCloseTo(-r.x, 14);
      expect(c.y).toBeCloseTo(-r.y, 14);
      expect(c.z).toBeCloseTo(-r.z, 14);
    }
  });

  it('points north toward +Dec and east toward +RA', () => {
    for (const [ra, dec] of stars) {
      const { n, e } = skyBasis(ra, dec);
      const eps = 1e-6;
      const up = raDecToUnit(ra, dec + eps);
      const here = raDecToUnit(ra, dec);
      const east = raDecToUnit(ra + eps, dec);
      expect(dot({ x: up.x - here.x, y: up.y - here.y, z: up.z - here.z }, n)).toBeGreaterThan(0);
      expect(dot({ x: east.x - here.x, y: east.y - here.y, z: east.z - here.z }, e)).toBeGreaterThan(0);
    }
  });

  it('round-trips sky <-> equatorial', () => {
    const v = { north: 0.3, east: -1.2, away: 0.7 };
    const w = equatorialToSky(217.393, -62.676, skyToEquatorial(217.393, -62.676, v));
    expect(w.north).toBeCloseTo(v.north, 14);
    expect(w.east).toBeCloseTo(v.east, 14);
    expect(w.away).toBeCloseTo(v.away, 14);
  });

  it('measures position angles east of north', () => {
    expect(positionAngle({ north: 1, east: 0, away: 0 }).paDeg).toBeCloseTo(0, 12);
    expect(positionAngle({ north: 0, east: 1, away: 0 }).paDeg).toBeCloseTo(90, 12);
    expect(positionAngle({ north: -1, east: 0, away: 0 }).paDeg).toBeCloseTo(180, 12);
    expect(positionAngle({ north: 0, east: -1, away: 0 }).paDeg).toBeCloseTo(270, 12);
  });
});

describe('equatorial -> ecliptic -> app world', () => {
  it('maps the north ecliptic pole (RA 18h, Dec 90 - epsilon) to +z', () => {
    const p = equatorialToEcliptic(raDecToUnit(270, 90 - OBLIQUITY_J2000_DEG));
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(1, 12);
  });

  it('keeps the equinox direction and round-trips', () => {
    const q = equatorialToEcliptic({ x: 1, y: 0, z: 0 });
    expect(q).toEqual({ x: 1, y: 0, z: 0 });
    const v = { x: 0.2, y: -0.5, z: 0.84 };
    const w = eclipticToEquatorial(equatorialToEcliptic(v));
    expect(w.x).toBeCloseTo(v.x, 14);
    expect(w.y).toBeCloseTo(v.y, 14);
    expect(w.z).toBeCloseTo(v.z, 14);
  });

  it('matches the app world axes (x_ecl, z_ecl, -y_ecl), the same rotation as src/sim/frames.ts', () => {
    // The app's eqjToWorld: ye = cos(e) y + sin(e) z, ze = -sin(e) y + cos(e) z, world = (x, ze, -ye).
    const e = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
    const v = raDecToUnit(217.3934657, -62.6761821);
    const appWorld = { x: v.x, y: -Math.sin(e) * v.y + Math.cos(e) * v.z, z: -(Math.cos(e) * v.y + Math.sin(e) * v.z) };
    const ours = eclipticToWorld(equatorialToEcliptic(v));
    expect(ours.x).toBeCloseTo(appWorld.x, 14);
    expect(ours.y).toBeCloseTo(appWorld.y, 14);
    expect(ours.z).toBeCloseTo(appWorld.z, 14);
  });

  it('puts a line-of-sight offset along the star direction', () => {
    const ra = 346.6263919;
    const dec = -5.0434618;
    const a = skyToEcliptic(ra, dec, { north: 0, east: 0, away: 1 });
    const u = equatorialToEcliptic(raDecToUnit(ra, dec));
    expect(dot(a, u)).toBeCloseTo(1, 14);
  });
});
