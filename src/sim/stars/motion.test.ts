import { describe, expect, it } from 'vitest';
import { loadNames, loadStars } from '../../test/stars';
import { findStar } from './names';
import { C_PC_PER_YR, catalogueRow, closestApproachToSun, motionFrozen, motionQuality, motionYears, positionAt, positionSeenFrom, positionSeenFromSun, starMotionNote } from './motion';
import { KMS_TO_PC_PER_YR } from './constants';
import type { Vec3 } from './frames';

const stars = loadStars();
const names = loadNames();
const one = (q: string) => findStar(names, q)[0];
const len = (v: Readonly<Vec3>) => Math.hypot(v[0], v[1], v[2]);
const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cat = (i: number): Vec3 => catalogueRow(stars, i).pos;

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
      const seen = positionSeenFrom(stars, i, [0, 0, 0], 2000);
      // exact up to second order in v/c
      expect(len(sub(seen.position, cat(i))) / len(cat(i))).toBeLessThan(1e-7);
      expect(seen.lightTimeYr * C_PC_PER_YR).toBeCloseTo(len(cat(i)), 4);
    }
  });

  it('coordinate positions differ from what we see by v·d/c (Arcturus: 0.0046 pc)', () => {
    const i = one('Arcturus');
    const v = len(catalogueRow(stars, i).velKms);
    const shift = len(sub(positionAt(stars, i, 2000), cat(i)));
    expect(shift).toBeCloseTo((v * KMS_TO_PC_PER_YR * len(cat(i))) / C_PC_PER_YR, 9);
    expect(shift).toBeGreaterThan(0.004);
    expect(shift).toBeLessThan(0.005);
  });

  it("Barnard's Star comes closest in about 9,700 years at about 1.16 pc", () => {
    const ca = closestApproachToSun(stars, one("Barnard's Star"));
    expect(ca.jy - 2000).toBeGreaterThan(9_500);
    expect(ca.jy - 2000).toBeLessThan(10_100);
    expect(ca.distancePc).toBeGreaterThan(1.12);
    expect(ca.distancePc).toBeLessThan(1.18);
  });

  it('Gliese 710 passes within ~0.1 pc about 1.3 Myr from now, beyond the ±1 Myr the app moves stars for', () => {
    const i = one('GJ 710');
    const ca = closestApproachToSun(stars, i);
    expect(ca.distancePc).toBeLessThan(0.1);
    expect(ca.jy - 2000).toBeGreaterThan(1.2e6);
    expect(ca.jy - 2000).toBeLessThan(1.4e6);
    expect(motionQuality(stars, i, ca.jy)).toBe('beyond-validity');
    expect(motionQuality(stars, i, 2000 + 5e5)).toBe('ok');
    expect(motionFrozen(ca.jy)).toBe(true);
    expect(motionYears(ca.jy)).toBe(1e6);
    expect(motionYears(2026.5)).toBeCloseTo(26.5, 12);
    expect(motionYears(-5e6)).toBe(-1e6);
    expect(starMotionNote(Date.UTC(2026, 8, 26))).toBeNull();
    expect(starMotionNote(Date.UTC(2000, 0, 1) + 2e6 * 365.25 * 86_400_000)).toMatch(/million years after 2000/);
    expect(starMotionNote(Date.UTC(2000, 0, 1) - 2e6 * 365.25 * 86_400_000)).toMatch(/million years before 2000/);
  });

  it('an observer 1 pc from Sirius sees it where its light left it', () => {
    const i = one('Sirius');
    const obs: Vec3 = [cat(i)[0] * 0.62, cat(i)[1] * 0.62, cat(i)[2] * 0.62];
    const seen = positionSeenFrom(stars, i, obs, 2000);
    expect(len(sub(seen.position, obs))).toBeCloseTo(seen.lightTimeYr * C_PC_PER_YR, 9);
    expect(seen.lightTimeYr).toBeCloseTo((len(cat(i)) * 0.38) / C_PC_PER_YR, 2);
  });
});
