import { afterEach, describe, expect, it } from 'vitest';
import { blackbody } from '../physics/blackbody';
import { cmbForwardTemperature } from '../physics/cmb';
import { C_KM_S, SUN_TEFF_K } from '../physics/constants';
import { sim } from '../sim/sim';
import { cmbPointUniforms, relativityUniforms } from './materials';
import { autoLnExposure, relView, updateRelativisticView } from './relativisticView';

/** Put the observer in motion with rapidity φ along +x (the velocity itself may round to c). */
function moveAt(phi: number): void {
  sim.ship.phi = phi;
  sim.ship.vel.set(Math.tanh(phi) * C_KM_S, 0, 0);
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  updateRelativisticView('on', 0.5, true, false);
}

afterEach(() => {
  sim.ship.phi = 0;
  sim.ship.vel.set(0, 0, 0);
  updateRelativisticView('on', 0.5, true, false);
});

describe('auto-exposure in log space', () => {
  it('is 1 at rest and never brightens', () => {
    expect(autoLnExposure(0)).toBe(0);
    let prev = 0;
    for (let phi = 0.01; phi <= 40; phi += 0.05) {
      const e = autoLnExposure(phi);
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeLessThanOrEqual(prev + 1e-12);
      prev = e;
    }
  });

  it('matches the linear-space exposure it replaces, where that one was not clamped', () => {
    for (const beta of [0.3, 0.9, 0.99, 0.999]) {
      const k = Math.sqrt((1 + beta) / (1 - beta));
      const boost = 10 ** (blackbody(SUN_TEFF_K * k).log10Y - blackbody(SUN_TEFF_K).log10Y);
      expect(autoLnExposure(Math.atanh(beta))).toBeCloseTo(Math.log(Math.min(1, boost ** -0.45)), 3);
    }
  });
});

describe('relativistic view state', () => {
  it('is the identity at rest: no motion, no exposure, no CMB', () => {
    moveAt(0);
    expect(relView.active).toBe(false);
    expect(relativityUniforms.uPhi.value).toBe(0);
    expect(relativityUniforms.uEPhi.value).toBe(1);
    expect(relativityUniforms.uEmPhi.value).toBe(1);
    expect(relativityUniforms.uLnExposure.value).toBe(0);
    expect(relView.cmb.visible).toBe(false);
    expect(cmbPointUniforms.uCmbPointFade.value).toBe(0);
  });

  it('keeps the CMB invisible at everyday relativistic speeds', () => {
    moveAt(Math.atanh(0.9));
    expect(relView.active).toBe(true);
    expect(relView.cmb.visible).toBe(false);
  });

  it('shows the CMB as the brightest thing ahead at γ = 10⁴', () => {
    const phi = Math.acosh(1e4);
    moveAt(phi);
    expect(relView.active).toBe(true);
    expect(cmbForwardTemperature(relView.cmb.motion.phi)).toBeGreaterThan(5.4e4);
    expect(cmbForwardTemperature(relView.cmb.motion.phi)).toBeLessThan(5.5e4);
    expect(relView.cmb.visible).toBe(true);
    // Narrower than a pixel: drawn as a point source, brighter than Venus even after the
    // camera stops down for the forward glare.
    expect(relView.cmb.resolved).toBeLessThan(0.01);
    expect(cmbPointUniforms.uCmbPointFade.value).toBeGreaterThan(0.99);
    expect(relView.lnExposure).toBeLessThan(-3);
    expect(cmbPointUniforms.uCmbPointMag.value).toBeLessThan(-10);
    // Its direction is the ship's (the Sun's 370 km/s through the CMB is negligible here).
    expect(cmbPointUniforms.uCmbPointDir.value.x).toBeCloseTo(1, 9);
  });

  it('stays finite where β has rounded to 1 (γ = 10⁹ and beyond)', () => {
    for (const phi of [Math.acosh(1e9), 30, 40]) {
      moveAt(phi);
      expect(sim.ship.vel.length()).toBeCloseTo(C_KM_S, 6);
      expect(relView.phi).toBe(phi);
      expect(relView.beta).toBe(1);
      const u = relativityUniforms;
      for (const v of [u.uPhi.value, u.uEPhi.value, u.uEmPhi.value, u.uLnExposure.value, relView.gamma, relView.k]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(Math.fround(u.uEPhi.value)).toBeLessThan(3.4e38);
      expect(Math.fround(u.uEmPhi.value)).toBeGreaterThan(1.2e-38); // a normal float32
      const c = cmbPointUniforms;
      for (const v of [c.uCmbPointMag.value, c.uCmbPointFade.value, c.uCmbPointColor.value.r, c.uCmbPointColor.value.b]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('turns the optics off during the fictional warp', () => {
    sim.ship.phi = NaN;
    sim.ship.vel.set(5 * C_KM_S, 0, 0);
    updateRelativisticView('on', 0.5, true, true);
    expect(relView.active).toBe(false);
    expect(relativityUniforms.uPhi.value).toBe(0);
  });
});
