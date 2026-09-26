import { describe, expect, it } from 'vitest';
import {
  CMB_DIPOLE_B_DEG,
  CMB_DIPOLE_KM_S,
  CMB_DIPOLE_L_DEG,
  CMB_DIPOLE_PHI,
  T_CMB_K,
  cmbForwardTemperature,
  cmbLnRadiance,
  cmbSpot,
  motionThroughCmb,
} from './cmb';
import { sampleBlackbody } from './blackbody';
import { C_KM_S, OBLIQUITY_J2000_DEG } from './constants';
import { galacticToWorld } from '../sim/frames';
import { addVelocities, rapidity } from './relativity';
import { normalize, type Vec3 } from './vec';

const DEG = 180 / Math.PI;

/** World axes → RA/Dec (J2000), degrees. */
function raDec(w: { x: number; y: number; z: number }): [number, number] {
  const eps = OBLIQUITY_J2000_DEG / DEG;
  const [xe, ye, ze] = [w.x, -w.z, w.y];
  const y = Math.cos(eps) * ye - Math.sin(eps) * ze;
  const z = Math.sin(eps) * ye + Math.cos(eps) * ze;
  const ra = Math.atan2(y, xe) * DEG;
  return [ra < 0 ? ra + 360 : ra, Math.asin(z) * DEG];
}

/** The sky-integrated visible flux by brute force: ∫ Y(T₀ D) dΩ′ over ship-frame angles. */
function bruteFlux(phi: number, T0 = T_CMB_K): number {
  let F = 0;
  let prev = 1e-12;
  const N = 200_000;
  for (let i = 1; i <= N; i++) {
    const th = 1e-12 * (Math.PI / 1e-12) ** (i / N);
    const mid = 0.5 * (th + prev);
    const s = Math.sin(mid / 2);
    const c = Math.cos(mid / 2);
    const D = 1 / (Math.exp(-phi) * c * c + Math.exp(phi) * s * s);
    F += Math.exp(sampleBlackbody(Math.log(T0 * D)).lnY) * 2 * Math.PI * Math.sin(mid) * (th - prev);
    prev = th;
  }
  return F;
}

describe('the cosmic microwave background', () => {
  it('uses the measured temperature and dipole', () => {
    expect(T_CMB_K).toBe(2.72548); // Fixsen 2009
    expect(CMB_DIPOLE_KM_S).toBe(369.82); // Planck 2018 I
    expect(CMB_DIPOLE_PHI).toBeCloseTo(Math.atanh(369.82 / C_KM_S), 15);
  });

  it('puts the dipole where Planck does: RA 167.942°, Dec −6.944°', () => {
    const [ra, dec] = raDec(galacticToWorld(CMB_DIPOLE_L_DEG, CMB_DIPOLE_B_DEG));
    expect(Math.abs(ra - 167.942)).toBeLessThan(0.003);
    expect(Math.abs(dec - -6.944)).toBeLessThan(0.003);
    // and the galactic north pole where the IAU does (RA 192.859°, Dec 27.128°)
    const [ra2, dec2] = raDec(galacticToWorld(0, 90));
    expect(Math.abs(ra2 - 192.8595)).toBeLessThan(0.002);
    expect(Math.abs(dec2 - 27.1283)).toBeLessThan(0.002);
  });

  it('is 5.45 × 10⁴ K dead ahead at γ = 10⁴', () => {
    const T = cmbForwardTemperature(Math.acosh(1e4));
    expect(T).toBeCloseTo(T_CMB_K * (1e4 + Math.sqrt(1e8 - 1)), 6);
    expect(T).toBeGreaterThan(5.4e4);
    expect(T).toBeLessThan(5.5e4);
    expect(cmbForwardTemperature(0)).toBe(T_CMB_K);
  });

  it('gives no visible light at rest, even from the dipole’s hot side', () => {
    for (const lnD of [0, CMB_DIPOLE_PHI, -CMB_DIPOLE_PHI]) {
      const lnR = cmbLnRadiance(lnD);
      expect(lnR).toBeLessThan(-6000);
      // as rendered: Sun-surface radiance 8, in float32 and in float64 alike
      expect(Math.fround(8 * Math.exp(lnR))).toBe(0);
      expect(8 * Math.exp(lnR)).toBe(0);
    }
    expect(cmbSpot(0).lnFlux).toBe(-Infinity);
    expect(cmbSpot(CMB_DIPOLE_PHI).lnFlux).toBe(-Infinity);
  });

  it('is calibrated against the Sun: shifted to 5,772 K, its radiance is the Sun’s surface', () => {
    expect(cmbLnRadiance(Math.log(5772 / T_CMB_K))).toBeCloseTo(0, 4);
    expect(cmbLnRadiance(Math.log(5.45e4 / T_CMB_K))).toBeCloseTo(sampleBlackbody(Math.log(5.45e4)).lnY, 9);
  });

  it('adds the ship’s motion to the Sun’s relativistically, exactly at any γ', () => {
    const s: Vec3 = normalize({ x: 0.2, y: 0.9, z: -0.4 });
    const n: Vec3 = normalize({ x: -0.7, y: 0.1, z: 0.6 });
    const psi = CMB_DIPOLE_PHI;
    // At rest in the Sun's frame: the Sun's own motion.
    const rest = motionThroughCmb(n, 0, s, psi);
    expect(rest.phi).toBeCloseTo(psi, 15);
    expect(rest.dir.x).toBeCloseTo(s.x, 12);
    // No dipole: just the ship.
    const ship = motionThroughCmb(n, 2, s, 0);
    expect(ship.phi).toBeCloseTo(2, 14);
    expect(ship.dir.z).toBeCloseTo(n.z, 14);
    // Along the dipole, rapidities add; against it, they subtract.
    expect(motionThroughCmb(s, 3, s, psi).phi).toBeCloseTo(3 + psi, 12);
    expect(motionThroughCmb({ x: -s.x, y: -s.y, z: -s.z }, 3, s, psi).phi).toBeCloseTo(3 - psi, 12);
    // Perpendicular: cosh φ_c = cosh φ cosh ψ.
    const perp = normalize({ x: s.y, y: -s.x, z: 0 });
    expect(Math.cosh(motionThroughCmb(perp, 1.5, s, 0.4).phi)).toBeCloseTo(Math.cosh(1.5) * Math.cosh(0.4), 12);
    // Agrees with velocity addition where that is accurate (the CMB-frame speed of the ship).
    const beta = 0.6;
    const w = addVelocities(
      { x: s.x * CMB_DIPOLE_KM_S, y: s.y * CMB_DIPOLE_KM_S, z: s.z * CMB_DIPOLE_KM_S },
      { x: n.x * beta * C_KM_S, y: n.y * beta * C_KM_S, z: n.z * beta * C_KM_S },
    );
    expect(motionThroughCmb(n, rapidity(beta), s, psi).phi).toBeCloseTo(Math.atanh(Math.hypot(w.x, w.y, w.z) / C_KM_S), 12);
    // At γ ≈ 10¹⁷ it stays finite and points along the ship's motion.
    const fast = motionThroughCmb(n, 40, s, psi);
    expect(Number.isFinite(fast.phi)).toBe(true);
    expect(Math.abs(fast.phi - 40)).toBeLessThan(2 * psi);
    expect(fast.dir.x * n.x + fast.dir.y * n.y + fast.dir.z * n.z).toBeCloseTo(1, 12);
  });

  it('integrates the hot spot’s flux exactly (checked against a brute-force sky integral)', () => {
    for (const gamma of [1000, 1e4]) {
      const phi = Math.acosh(gamma);
      expect(Math.abs(cmbSpot(phi).lnFlux - Math.log(bruteFlux(phi)))).toBeLessThan(0.005);
    }
  });

  it('becomes a point narrower than a pixel, brighter than any star, as γ passes 1000', () => {
    const at1e4 = cmbSpot(Math.acosh(1e4));
    expect(at1e4.coreRadius).toBeLessThan(2e-4); // a pixel is ~9 × 10⁻⁴ rad
    expect(at1e4.magnitude).toBeLessThan(-20); // 4 % of the Sun seen from Earth
    expect(at1e4.rgb[2]).toBeGreaterThan(at1e4.rgb[0]); // blue-white
    const at1e2 = cmbSpot(Math.acosh(100));
    expect(at1e2.magnitude).toBeGreaterThan(10); // 545 K: invisible
    // Finite however fast.
    for (const phi of [21.4, 30, 40]) {
      const s = cmbSpot(phi);
      for (const v of [s.lnFlux, s.magnitude, s.coreRadius, ...s.rgb]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
