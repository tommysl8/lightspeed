import { describe, expect, it } from 'vitest';
import { loadNames, loadStars } from './test-helpers';
import { buildNameIndex, findStar } from './names';
import {
  C_PC_PER_YR,
  closestApproachToSun,
  motionQuality,
  positionAt,
  positionSeenFrom,
  positionSeenFromSun,
  positionsSeenFromSun,
} from './motion';
import { KMS_TO_PC_PER_YR } from './constants';
import type { Vec3 } from './frames';

const stars = loadStars();
const names = buildNameIndex(loadNames());
const one = (q: string) => findStar(names, q)[0];
const len = (v: Readonly<Vec3>) => Math.hypot(v[0], v[1], v[2]);
const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe('linear space motion', () => {
  it('reproduces the catalogue at the epoch', () => {
    const i = one('Vega');
    const p = positionSeenFromSun(stars, i, 2000);
    expect(p[0]).toBe(stars.positions[3 * i]);
    expect(p[2]).toBe(stars.positions[3 * i + 2]);
  });

  it('the retarded position seen from the Sun at the epoch equals the catalogue position', () => {
    for (const q of ['Sirius', 'Arcturus', 'Deneb', "Barnard's Star", 'Rigel']) {
      const i = one(q);
      const cat: Vec3 = [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]];
      const seen = positionSeenFrom(stars, i, [0, 0, 0], 2000);
      // exact up to second order in v/c
      expect(len(sub(seen.position, cat)) / len(cat)).toBeLessThan(1e-7);
      expect(seen.lightTimeYr * C_PC_PER_YR).toBeCloseTo(len(cat), 4);
    }
  });

  it('coordinate positions differ from what we see by v * d / c', () => {
    const i = one('Arcturus');
    const cat: Vec3 = [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]];
    const v = Math.hypot(stars.velocities[3 * i], stars.velocities[3 * i + 1], stars.velocities[3 * i + 2]);
    const shift = len(sub(positionAt(stars, i, 2000), cat));
    // Arcturus: ~122 km/s, 11.26 pc (36.7 light-years) → 36.7 yr of motion = 0.0046 pc
    expect(shift).toBeCloseTo((v * KMS_TO_PC_PER_YR * len(cat)) / C_PC_PER_YR, 9);
    expect(shift).toBeGreaterThan(0.004);
    expect(shift).toBeLessThan(0.005);
  });

  it("Barnard's Star comes closest in about 9,800 years at about 1.15 pc", () => {
    const ca = closestApproachToSun(stars, one("Barnard's Star"));
    expect(ca.jy - 2000).toBeGreaterThan(9_500);
    expect(ca.jy - 2000).toBeLessThan(10_100);
    expect(ca.distancePc).toBeGreaterThan(1.12);
    expect(ca.distancePc).toBeLessThan(1.18);
  });

  it('Gliese 710 passes within ~0.1 pc about 1.3 Myr from now (flagged beyond the ±1 Myr validity)', () => {
    const i = one('GJ 710');
    const ca = closestApproachToSun(stars, i);
    expect(ca.distancePc).toBeLessThan(0.1);
    expect(ca.jy - 2000).toBeGreaterThan(1.2e6);
    expect(ca.jy - 2000).toBeLessThan(1.4e6);
    expect(motionQuality(stars, i, ca.jy)).toBe('beyond-validity');
    expect(motionQuality(stars, i, 2000 + 5e5)).toBe('ok');
  });

  it('the bulk update matches the per-star function', () => {
    const out = positionsSeenFromSun(stars, 12_000);
    for (const i of [0, 10, 1000, 200_000]) {
      const p = positionSeenFromSun(stars, i, 12_000);
      expect(out[3 * i]).toBeCloseTo(p[0], 4);
      expect(out[3 * i + 1]).toBeCloseTo(p[1], 4);
    }
  });

  it('an observer 1 pc from Sirius sees it where its light left it', () => {
    const i = one('Sirius');
    const cat: Vec3 = [stars.positions[3 * i], stars.positions[3 * i + 1], stars.positions[3 * i + 2]];
    const obs: Vec3 = [cat[0] * 0.62, cat[1] * 0.62, cat[2] * 0.62];
    const seen = positionSeenFrom(stars, i, obs, 2000);
    expect(len(sub(seen.position, obs))).toBeCloseTo(seen.lightTimeYr * C_PC_PER_YR, 9);
    expect(seen.lightTimeYr).toBeCloseTo((len(cat) * 0.38) / C_PC_PER_YR, 2);
  });
});
