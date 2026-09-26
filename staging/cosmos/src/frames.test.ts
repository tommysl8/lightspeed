import { describe, expect, it } from 'vitest';
import {
  ECL_TO_GAL,
  GAL_TO_ECL,
  GAL_TO_ICRS,
  GAL_TO_SGAL,
  ICRS_TO_ECL,
  ICRS_TO_GAL,
  apply,
  dot,
  eclToWorld,
  lbToUnit,
  mul,
  raDecToUnit,
  skyBasis,
  transpose,
  unitToSph,
  worldToEcl,
  cross,
  type Mat3,
} from './frames.ts';

function expectOrthonormal(m: Mat3) {
  const p = mul(m, transpose(m));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(p[i][j]).toBeCloseTo(i === j ? 1 : 0, 12);
}

describe('frames', () => {
  it('rotation matrices are orthonormal', () => {
    for (const m of [ICRS_TO_ECL, ICRS_TO_GAL, GAL_TO_ECL, GAL_TO_SGAL]) expectOrthonormal(m);
  });

  it('places the Galactic centre and poles where the IAU definition puts them', () => {
    // l = b = 0 is at RA 266.40499, Dec -28.93617 (Hipparcos definition)
    const gc = unitToSph(apply(GAL_TO_ICRS, lbToUnit(0, 0)));
    expect(gc.lon).toBeCloseTo(266.40499, 4);
    expect(gc.lat).toBeCloseTo(-28.93617, 4);
    const ngp = unitToSph(apply(GAL_TO_ICRS, lbToUnit(0, 90)));
    expect(ngp.lon).toBeCloseTo(192.85948, 4);
    expect(ngp.lat).toBeCloseTo(27.12825, 4);
    // longitude of the north celestial pole
    expect(unitToSph(apply(ICRS_TO_GAL, [0, 0, 1])).lon).toBeCloseTo(122.93192, 4);
  });

  it('puts the ecliptic north pole at RA 270, Dec 90 - eps', () => {
    const p = unitToSph(apply(transpose(ICRS_TO_ECL), [0, 0, 1]));
    expect(p.lon).toBeCloseTo(270, 9);
    expect(p.lat).toBeCloseTo(90 - 84381.448 / 3600, 9);
  });

  it('galactic -> ecliptic agrees with the composition through ICRS', () => {
    const v = lbToUnit(123.4, -21.5);
    const a = apply(GAL_TO_ECL, v);
    const b = apply(ICRS_TO_ECL, apply(GAL_TO_ICRS, v));
    for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k], 14);
    const back = apply(ECL_TO_GAL, a);
    for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(v[k], 14);
  });

  it('supergalactic pole and origin match de Vaucouleurs / Lahav et al. (2000)', () => {
    const pole = apply(GAL_TO_SGAL, lbToUnit(47.37, 6.32));
    expect(pole[2]).toBeCloseTo(1, 12);
    const origin = apply(GAL_TO_SGAL, lbToUnit(137.37, 0));
    expect(origin[0]).toBeCloseTo(1, 12);
    // Virgo cluster (M87) lies close to the supergalactic plane: SGB ~ -2.35 deg (CF4 table 2 lists -2.3480)
    const m87 = unitToSph(apply(GAL_TO_SGAL, apply(ICRS_TO_GAL, raDecToUnit(187.7058, 12.3912))));
    expect(m87.lat).toBeCloseTo(-2.348, 2);
    expect(m87.lon).toBeCloseTo(102.8805, 2);
  });

  it('maps ecliptic to app world axes and back', () => {
    const e: [number, number, number] = [1, 2, 3];
    expect(eclToWorld(e)).toEqual([1, 3, -2]);
    expect(worldToEcl(eclToWorld(e))).toEqual(e);
  });

  it('sky basis is left-handed as seen by the observer (n x e = -r)', () => {
    const { r, e, n } = skyBasis(10.68, 41.27);
    const c = cross(n, e);
    for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(-r[k], 14);
    expect(dot(r, e)).toBeCloseTo(0, 14);
  });
});
