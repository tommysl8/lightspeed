/**
 * The registry's IAU rotation models, compiled from bodies.json, against the SPICE Toolkit
 * (CSPICE N0067, pck00011.tpc: the fixture made by scripts/make-rotation-spice.py), and the
 * other rotation records (tumbles, snapshots, Haumea's fitted phase).
 */
import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { AstroTime } from 'astronomy-engine';
import { readJson } from '../../test/files';
import { rotationOf, type BodiesFile } from '../solarSystem';
import { compileRotation } from './rotation';

const bodies = readJson<BodiesFile>('public/data/bodies.json');
const spice = readJson<{ bodies: Record<string, { d: number; bodyToEcliptic: number[][] }[]> }>('src/sim/bodies/__fixtures__/rotation-spice.json');
const byId = Object.fromEntries(bodies.bodies.map((b) => [b.id, b]));

/**
 * Body-fixed → J2000 ecliptic, from a mesh orientation (mesh +X = body x, +Y = body z,
 * −Z = body y; world = ecliptic (x, z, −y)). Rows as in the fixture: m[r][c], columns the body axes.
 */
function bodyToEcliptic(q: Quaternion): number[][] {
  const col = (v: Vector3) => {
    const w = v.applyQuaternion(q);
    return [w.x, -w.z, w.y];
  };
  const x = col(new Vector3(1, 0, 0));
  const y = col(new Vector3(0, 0, -1));
  const z = col(new Vector3(0, 1, 0));
  return [0, 1, 2].map((r) => [x[r], y[r], z[r]]);
}

/** Rotation angle between two rotation matrices, radians. */
function angleBetween(A: number[][], B: number[][]): number {
  // The antisymmetric part of A·Bᵀ is exact for small angles, where acos of the trace is not.
  const m = new Matrix4().set(A[0][0], A[0][1], A[0][2], 0, A[1][0], A[1][1], A[1][2], 0, A[2][0], A[2][1], A[2][2], 0, 0, 0, 0, 1);
  const n = new Matrix4().set(B[0][0], B[1][0], B[2][0], 0, B[0][1], B[1][1], B[2][1], 0, B[0][2], B[1][2], B[2][2], 0, 0, 0, 0, 1);
  const e = m.multiply(n).elements; // column-major
  const s = Math.hypot(e[6] - e[9], e[8] - e[2], e[1] - e[4]) / 2;
  const c = (e[0] + e[5] + e[10] - 1) / 2;
  return Math.atan2(s, c);
}

const at = (d: number) => AstroTime.FromTerrestrialTime(d);

describe('IAU rotation models against CSPICE (pck00011)', () => {
  let worst = 0;
  for (const [id, rows] of Object.entries(spice.bodies)) {
    it(`${id}: body-fixed → ecliptic J2000 within 10⁻⁸ rad of SPICE at 8 epochs (1900–2300)`, () => {
      const rot = compileRotation(rotationOf(byId[id], bodies.phaseAngles))!;
      expect(rot).not.toBeNull();
      const q = new Quaternion();
      for (const r of rows) {
        rot.orientationAt(at(r.d), q, null);
        const err = angleBetween(bodyToEcliptic(q), r.bodyToEcliptic);
        worst = Math.max(worst, err);
        expect(err, `d = ${r.d}`).toBeLessThan(1e-8);
      }
    });
  }
  it('covers every IAU-modelled body', () => {
    const iau = bodies.bodies.filter((b) => b.rotation.model === 'iau-2015').map((b) => b.id);
    expect(Object.keys(spice.bodies).sort()).toEqual(iau.sort());
    console.log(`rotation: worst difference from SPICE ${worst.toExponential(2)} rad`);
    expect(worst).toBeLessThan(1e-8);
  });
});

describe('the other rotation records', () => {
  it('spins snapshot bodies about their 2015 pole, and tumbles the chaotic ones', () => {
    const nix = rotationOf(byId.nix, bodies.phaseAngles);
    expect(nix).toMatchObject({ model: 'spin', poleRaDeg: 350, poleDecDeg: 42 });
    expect(rotationOf(byId.hyperion, bodies.phaseAngles)?.model).toBe('tumble');
    expect(rotationOf(byId.halley, bodies.phaseAngles)?.model).toBe('tumble');
    expect(rotationOf(byId.borisov, bodies.phaseAngles)).toBeUndefined();
    expect(rotationOf(byId.jwst, bodies.phaseAngles)).toBeUndefined();
    expect(rotationOf(byId.makemake, bodies.phaseAngles)).toMatchObject({ model: 'spin', periodH: 22.8266 });
  });

  it('turns a tumbler about its own axis while that axis sweeps its cone', () => {
    const rot = compileRotation({ model: 'tumble', periodH: 24 * 7.1, precessionH: 24 * 3.7, coneDeg: 60 })!;
    const q = new Quaternion();
    const pole = new Vector3();
    const ecliptic = new Vector3(0, 1, 0);
    for (const d of [0, 1.3, 2.9, 100.7]) {
      rot.orientationAt(at(d), q, null);
      pole.set(0, 1, 0).applyQuaternion(q);
      // The body's axis (mesh +Y) stays 60° from the angular momentum (ecliptic north here).
      expect((Math.acos(pole.dot(ecliptic)) * 180) / Math.PI).toBeCloseTo(60, 6);
    }
    // After one precession period the axis is back where it was.
    rot.orientationAt(at(10), q, null);
    const a = new Vector3(0, 1, 0).applyQuaternion(q);
    rot.orientationAt(at(13.7), q, null);
    expect(a.distanceTo(new Vector3(0, 1, 0).applyQuaternion(q))).toBeLessThan(1e-9);
  });

  it('points Haumea’s long axis along the line of sight at the 2017 occultation (minimum brightness)', () => {
    const rot = compileRotation(rotationOf(byId.haumea, bodies.phaseAngles))!;
    const q = new Quaternion();
    // 2017-01-21 03:09:20 UTC: JD 2457774.632282 TDB.
    rot.orientationAt(at(2457774.632282 - 2451545), q, null);
    const m = bodyToEcliptic(q);
    const x = [m[0][0], m[1][0], m[2][0]];
    const pole = [m[0][2], m[1][2], m[2][2]];
    // Horizons: Earth → Haumea (ICRF), to the ecliptic.
    const v = [-6.070047288831916e9, -3.943943555002071e9, 2.153345976509012e9];
    const eps = (84381.448 / 3600) * (Math.PI / 180);
    const u = [v[0], Math.cos(eps) * v[1] + Math.sin(eps) * v[2], -Math.sin(eps) * v[1] + Math.cos(eps) * v[2]];
    const n = Math.hypot(...u);
    const un = u.map((c) => c / n);
    const up = un[0] * pole[0] + un[1] * pole[1] + un[2] * pole[2];
    const ue = un.map((c, i) => c - up * pole[i]);
    const ne = Math.hypot(...ue);
    const cos = Math.abs((ue[0] * x[0] + ue[1] * x[1] + ue[2] * x[2]) / ne);
    expect(cos).toBeGreaterThan(Math.cos(1e-4));
  });
});
