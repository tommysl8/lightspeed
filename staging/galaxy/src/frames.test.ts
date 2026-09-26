import { describe, expect, test } from 'vitest';
import {
  anglesFromVector,
  apply,
  ECL_TO_GAL,
  equatorialToGalactic,
  GAL_TO_WORLD,
  galToG,
  gToGal,
  ICRS_TO_GAL,
  mul,
  SUN_G,
  svsCelestialUV,
  svsCelestialUVFromWorld,
  transpose,
  unitFromAngles,
  WORLD_TO_GAL,
  type Mat3,
  type Vec3,
} from './frames.ts';

const isRotation = (m: Mat3) => {
  const p = mul(m, transpose(m));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(p[i][j]).toBeCloseTo(i === j ? 1 : 0, 12);
};

describe('galactic frame', () => {
  test('matrices are proper rotations', () => {
    isRotation(ICRS_TO_GAL);
    isRotation(ECL_TO_GAL);
    isRotation(WORLD_TO_GAL);
  });

  test('north galactic pole is at RA 192.85948, Dec +27.12825 (IAU/Hipparcos)', () => {
    const g = apply(ICRS_TO_GAL, unitFromAngles(192.85948, 27.12825));
    expect(g[2]).toBeCloseTo(1, 12);
  });

  test('Sgr A* is at l = 359.944, b = -0.046 deg', () => {
    const { l, b } = equatorialToGalactic(266.4168370833, -29.0078105556);
    expect(l).toBeCloseTo(359.9443, 3);
    expect(b).toBeCloseTo(-0.0462, 3);
  });

  test('north ecliptic pole is at l = 96.38, b = +29.81 deg', () => {
    const a = anglesFromVector(apply(ECL_TO_GAL, [0, 0, 1]));
    expect(a.lon).toBeCloseTo(96.384, 2);
    expect(a.lat).toBeCloseTo(29.811, 2);
  });

  test('world axes: ecliptic north is world +Y; the Galactic centre lies 5.5 deg south of the ecliptic', () => {
    const eclNorthWorld: Vec3 = [0, 1, 0];
    const a = apply(WORLD_TO_GAL, eclNorthWorld), b = apply(ECL_TO_GAL, [0, 0, 1]);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 14);
    const gcWorld = apply(GAL_TO_WORLD, [1, 0, 0]);
    expect(Math.asin(gcWorld[1]) * (180 / Math.PI)).toBeCloseTo(-5.54, 1);
  });
});

describe('galactocentric frame G', () => {
  test('the Sun sits at (-8.277, 0, +0.0208) kpc', () => {
    expect(galToG([0, 0, 0])).toEqual(SUN_G);
  });

  test('Sgr A* maps to the origin', () => {
    const u = unitFromAngles(359.94425, -0.04616);
    const g = galToG([u[0] * 8.277, u[1] * 8.277, u[2] * 8.277]);
    for (const c of g) expect(Math.abs(c)).toBeLessThan(2e-5);
  });

  test('round trip', () => {
    const p: Vec3 = [3.2, -7.5, 0.4];
    const q = gToGal(galToG(p));
    for (let i = 0; i < 3; i++) expect(q[i]).toBeCloseTo(p[i], 12);
  });
});

describe('NASA SVS celestial map lookup', () => {
  test('RA 0 is the centre column and RA increases to the left', () => {
    expect(svsCelestialUV(0, 0).u).toBeCloseTo(0.5, 12);
    expect(svsCelestialUV(90, 0).u).toBeCloseTo(0.25, 12);
    expect(svsCelestialUV(270, 0).u).toBeCloseTo(0.75, 12);
    expect(svsCelestialUV(0, 90).vTop).toBeCloseTo(0, 12);
    expect(svsCelestialUV(0, -90).vTop).toBeCloseTo(1, 12);
  });

  test('world direction lookup agrees with RA/Dec lookup', () => {
    // Large Magellanic Cloud centre, RA 80.894, Dec -69.756
    const eq = unitFromAngles(80.894, -69.756);
    const w = apply(GAL_TO_WORLD, apply(ICRS_TO_GAL, eq));
    const a = svsCelestialUVFromWorld(w), b = svsCelestialUV(80.894, -69.756);
    expect(a.u).toBeCloseTo(b.u, 10);
    expect(a.vTop).toBeCloseTo(b.vTop, 10);
  });
});
