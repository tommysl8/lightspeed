import { describe, expect, it } from 'vitest';
import {
  aberrateToRestRapidity,
  aberrateToShip,
  aberrateToShipRapidity,
  cosShipFromRest,
  dopplerFromRestAngle,
  dopplerFromShipAngle,
  lnDopplerFromRestDir,
  lnDopplerFromShipDir,
  logAddExp,
  rapidity,
  rapidityFromSpeed,
} from './relativity';
import { C_KM_S } from './constants';
import { blackbodyLut, LN_Y_FLOOR } from './blackbody';
import { dot, normalize, type Vec3 } from './vec';

const V: Vec3 = normalize({ x: 0.3, y: -0.8, z: 0.52 });

/** Unit vector at angle θ from V (fixed azimuth). */
function atAngle(theta: number): Vec3 {
  const e = normalize({ x: -V.y, y: V.x, z: 0 }); // ⟂ V
  return {
    x: Math.cos(theta) * V.x + Math.sin(theta) * e.x,
    y: Math.cos(theta) * V.y + Math.sin(theta) * e.y,
    z: Math.cos(theta) * V.z + Math.sin(theta) * e.z,
  };
}

const angle = (a: Vec3, b: Vec3) => 2 * Math.atan2(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z));

const ANGLES = [0, 1e-9, 1e-4, 0.01, 0.3, 1, Math.PI / 2, 2, 3, Math.PI - 1e-4, Math.PI];

describe('rapidity forms of aberration and Doppler', () => {
  it('agree with the classic β formulas wherever those are accurate', () => {
    for (const beta of [0.01, 0.1, 0.5, 0.9, 0.99, 0.9999]) {
      const phi = rapidity(beta);
      for (const th of ANGLES.slice(2, -2)) {
        const d = atAngle(th);
        const ship = aberrateToShipRapidity(d, V, phi);
        const ref = aberrateToShip(d, V, beta);
        // (The cosine form itself loses digits within a milliradian of the apex.)
        if (angle(ref, V) > 1e-3) expect(angle(ship, ref)).toBeLessThan(1e-11);
        expect(lnDopplerFromRestDir(d, V, phi)).toBeCloseTo(Math.log(dopplerFromRestAngle(Math.cos(th), beta)), 10);
        expect(lnDopplerFromShipDir(d, V, phi)).toBeCloseTo(Math.log(dopplerFromShipAngle(Math.cos(th), beta)), 10);
      }
    }
  });

  it('round-trip between frames at any rapidity', () => {
    // (Up to φ = 10: beyond, the ship-frame direction of a 0.2 rad rest-frame angle is within
    // 10⁻¹² rad of the apex, closer than a float64 unit vector can hold to many digits.)
    for (const phi of [0.1, 3, 10]) {
      for (const th of [0.2, 1, 2.5]) {
        const d = atAngle(th);
        const back = aberrateToRestRapidity(aberrateToShipRapidity(d, V, phi), V, phi);
        expect(angle(back, d)).toBeLessThan(1e-9);
      }
    }
  });

  it('stay exact where β has rounded to 1 (γ ≈ 10¹³)', () => {
    const phi = 30;
    expect(Math.tanh(phi)).toBe(1); // what a velocity-based renderer would be left with
    expect(cosShipFromRest(0, Math.tanh(phi))).toBe(1); // ...everything collapses onto the apex
    // Dead ahead and behind: D = e^±φ.
    expect(lnDopplerFromRestDir(V, V, phi)).toBeCloseTo(phi, 12);
    const antapex = { x: -V.x, y: -V.y, z: -V.z };
    expect(lnDopplerFromRestDir(antapex, V, phi)).toBeCloseTo(-phi, 12);
    // Rest-frame 90°: D = γ = cosh φ, seen at θ′ = 2 atan(e^−φ).
    const side = atAngle(Math.PI / 2);
    expect(lnDopplerFromRestDir(side, V, phi)).toBeCloseTo(Math.log(Math.cosh(phi)), 12);
    // (Checked at φ = 12: at φ = 30 that angle, 2 × 10⁻¹³ rad, is finer than a float64 unit
    // vector resolves to many digits.)
    const seen = angle(aberrateToShipRapidity(side, V, 12), V);
    expect(seen / (2 * Math.atan(Math.exp(-12)))).toBeCloseTo(1, 9);
    // Ship-frame 90°: the transverse Doppler shift, D = 1/γ.
    expect(lnDopplerFromShipDir(side, V, phi)).toBeCloseTo(-Math.log(Math.cosh(phi)), 12);
  });

  it('are finite for every direction from φ = 0 to 40', () => {
    for (const phi of [0, 1e-8, 0.5, 5, 14.8, 21, 40]) {
      for (const th of ANGLES) {
        const d = atAngle(th);
        const s = aberrateToShipRapidity(d, V, phi);
        const r = aberrateToRestRapidity(d, V, phi);
        for (const v of [s.x, s.y, s.z, r.x, r.y, r.z, lnDopplerFromRestDir(d, V, phi), lnDopplerFromShipDir(d, V, phi)]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(Math.abs(dot(s, s) - 1)).toBeLessThan(1e-12);
      }
    }
  });

  it('take a rapidity from a speed', () => {
    expect(rapidityFromSpeed(0)).toBe(0);
    expect(rapidityFromSpeed(0.6 * C_KM_S)).toBeCloseTo(Math.atanh(0.6), 14);
    expect(rapidityFromSpeed(C_KM_S)).toBe(Infinity);
    expect(logAddExp(-Infinity, -Infinity)).toBe(-Infinity);
    expect(logAddExp(1000, 1000)).toBeCloseTo(1000 + Math.LN2, 12);
  });
});

// ─── The shaders' arithmetic in float32 ──────────────────────────────────────────────────
//
// A line-by-line float32 mirror of shaders/relativity.glsl (relAberrate, dopplerMagnitudeShift),
// shaders/blackbody.glsl and shaders/remap.frag.glsl, rounding after every operation as the GPU
// does. It checks the stable forms: no NaN or Infinity anywhere from φ = 0 to 40, and agreement
// with the float64 reference computed from the same float32 inputs.

const f = Math.fround;
type V3 = [number, number, number];
const v3 = (a: Vec3): V3 => [f(a.x), f(a.y), f(a.z)];
const sub3 = (a: V3, b: V3): V3 => [f(a[0] - b[0]), f(a[1] - b[1]), f(a[2] - b[2])];
const add3 = (a: V3, b: V3): V3 => [f(a[0] + b[0]), f(a[1] + b[1]), f(a[2] + b[2])];
const scale3 = (a: V3, k: number): V3 => [f(a[0] * k), f(a[1] * k), f(a[2] * k)];
const dot3 = (a: V3, b: V3) => f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]));
const len3 = (a: V3) => f(Math.sqrt(dot3(a, a)));
const toVec = (a: V3): Vec3 => ({ x: a[0], y: a[1], z: a[2] });

function glRelAberrate(dRest: V3, vel: V3, phi: number): { dir: V3; lnD: number } {
  const ePhi = f(Math.exp(phi));
  const emPhi = f(Math.exp(-phi));
  if (phi <= 0) return { dir: dRest, lnD: 0 };
  const a = sub3(dRest, vel);
  const b = add3(dRest, vel);
  let s2 = dot3(a, a);
  let c2 = dot3(b, b);
  const n = f(s2 + c2);
  s2 = f(s2 / n);
  c2 = f(c2 / n);
  const lnD = f(Math.log(f(f(ePhi * c2) + f(emPhi * s2))));
  const th = f(2 * f(Math.atan2(f(emPhi * f(Math.sqrt(s2))), f(Math.sqrt(c2)))));
  const perp = sub3(dRest, scale3(vel, dot3(dRest, vel)));
  const pl = len3(perp);
  if (pl < 1e-12) return { dir: c2 >= s2 ? vel : scale3(vel, -1), lnD };
  return { dir: add3(scale3(vel, f(Math.cos(th))), scale3(perp, f(f(Math.sin(th)) / pl))), lnD };
}

function glBlackbodyLn(lnT: number): number {
  const { data, size, lnTMin, lnTMax, wienK } = blackbodyLut();
  const lo = f(lnTMin);
  const hi = f(lnTMax);
  const x = f(f(f(Math.min(Math.max(lnT, lo), hi) - lo) / f(hi - lo)) * f(size - 1));
  const i0 = Math.min(Math.floor(x), size - 2);
  const t = f(x - i0);
  let a = f(data[i0 * 4 + 3] + f(f(data[i0 * 4 + 7] - data[i0 * 4 + 3]) * t));
  if (lnT > hi) a = f(a + f(lnT - hi));
  else if (lnT < lo) a = Math.max(f(a - f(f(wienK) * f(f(Math.exp(Math.min(-lnT, 60))) - f(Math.exp(-lo))))), LN_Y_FLOOR);
  return a;
}

function glMagnitudeShift(lnT: number, lnD: number): number {
  const a = glBlackbodyLn(lnT);
  const b = glBlackbodyLn(f(lnT + lnD));
  return f(-1.0857362 * f(f(b - a) - f(2 * lnD)));
}

/** remap.frag.glsl for one pixel direction: rest-frame direction, ln D and mip level. */
function glRemap(d: V3, vel: V3, phi: number, lnPixOverTexel = Math.log(0.00087 / (Math.PI / 2 / 1024)), maxLod = 10) {
  const ePhi = f(Math.exp(phi));
  const emPhi = f(Math.exp(-phi));
  const perp = sub3(d, scale3(vel, dot3(d, vel)));
  const sp = len3(perp);
  const th = f(2 * f(Math.atan2(f(ePhi * len3(sub3(d, vel))), len3(add3(d, vel)))));
  const e: V3 = sp > 1e-12 ? scale3(perp, f(1 / sp)) : [0, 0, 0];
  const dRest = add3(scale3(vel, f(Math.cos(th))), scale3(e, f(Math.sin(th))));
  const a = sub3(d, vel);
  const b = add3(d, vel);
  const lnD = f(-Math.log(f(0.25 * f(f(emPhi * dot3(b, b)) + f(ePhi * dot3(a, a))))));
  const lod = Math.min(Math.max(f(f(lnD + f(lnPixOverTexel)) * 1.442695), 0), maxLod);
  return { dRest, lnD, lod };
}

const PHIS = [0, 1e-3, 0.5, 2, 7.6, 14.8, 21.4, 30, 40];
// Directions: exactly ahead and behind, a pixel off each, and a spread in between.
const THETAS = [0, 8.7e-4, 0.01, 0.2, 1, Math.PI / 2, 2.2, 3, Math.PI - 8.7e-4, Math.PI];

describe('the GPU forms in float32', () => {
  const vel = v3(V);

  it('point sources: direction and ln D stay finite and accurate for φ = 0 … 40', () => {
    for (const phi of PHIS) {
      for (const th of THETAS) {
        const d = v3(atAngle(th));
        const gpu = glRelAberrate(d, vel, phi);
        for (const x of [...gpu.dir, gpu.lnD]) expect(Number.isFinite(x)).toBe(true);
        const refLnD = lnDopplerFromRestDir(toVec(d), toVec(vel), phi);
        expect(Math.abs(gpu.lnD - refLnD)).toBeLessThan(2e-6 * Math.max(1, Math.abs(refLnD)));
        const ref = aberrateToShipRapidity(toVec(d), toVec(vel), phi);
        // The direction is as good as float32 allows (a few ulps on a unit vector) unless the
        // map is very steep there: the error then grows with the local magnification 1/D.
        const tol = 4e-7 * Math.max(1, Math.exp(-refLnD));
        if (tol < 0.1) expect(angle(toVec(gpu.dir), ref)).toBeLessThan(tol);
      }
    }
  });

  it('point sources: the magnitude change stays finite for any φ and any star colour', () => {
    for (const phi of PHIS) {
      for (const th of THETAS) {
        const { lnD } = glRelAberrate(v3(atAngle(th)), vel, phi);
        for (const T of [2500, 5772, 30000]) {
          const dm = glMagnitudeShift(f(Math.log(T)), lnD);
          expect(Number.isFinite(dm)).toBe(true);
          expect(Number.isFinite(f(Math.pow(2, Math.min(126, Math.max(-126, -1.3287712 * dm)))))).toBe(true);
        }
      }
    }
  });

  it('remap: rest direction, ln D and mip level stay finite and accurate for φ = 0 … 40', () => {
    for (const phi of PHIS) {
      for (const th of THETAS) {
        const d = v3(atAngle(th));
        const gpu = glRemap(d, vel, phi);
        for (const x of [...gpu.dRest, gpu.lnD, gpu.lod]) expect(Number.isFinite(x)).toBe(true);
        const refLnD = lnDopplerFromShipDir(toVec(d), toVec(vel), phi);
        expect(Math.abs(gpu.lnD - refLnD)).toBeLessThan(2e-6 * Math.max(1, Math.abs(refLnD)));
        // Rest direction: accurate where the map is not steeper than float32 can follow (the
        // Jacobian is D: near the apex at large φ, neighbouring pixels land far apart in the rest
        // frame, which is why the mip level rises there).
        const ref = aberrateToRestRapidity(toVec(d), toVec(vel), phi);
        const tol = 4e-7 * Math.max(1, Math.exp(refLnD));
        if (tol < 0.1) expect(angle(toVec(gpu.dRest), ref)).toBeLessThan(tol);
      }
    }
  });

  it('remap: the CMB term is finite, and exactly zero at rest', () => {
    const lnT0 = f(Math.log(2.72548));
    for (const phi of PHIS) {
      for (const th of THETAS) {
        const { lnD } = glRemap(v3(atAngle(th)), vel, phi);
        const lnY = glBlackbodyLn(f(lnT0 + lnD));
        expect(Number.isFinite(lnY)).toBe(true);
        const lnI = lnY + Math.log(8);
        const I = lnI < -60 ? 0 : f(Math.exp(Math.min(lnI, 12)));
        expect(Number.isFinite(I)).toBe(true);
        if (phi <= 1e-3) expect(I).toBe(0);
      }
    }
  });
});
