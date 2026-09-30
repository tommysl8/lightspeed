/**
 * The relativistic view's state (render/relativisticView.ts): today's exposure and CMB far from holes, bit for
 * bit; and near a black hole: the exposure from the observer's blueshift in the classical path
 * too, the classical half at rest in the Sun's frame when the hole moves (the lens is conjugated by its frame
 * boost), and during a fall the relativistic path with the faller, the raindrop in the classical half, and the
 * change of tables at 3M with no jump (the static observer's tables with the raindrop's inward motion as an
 * aberration give the raindrop's own picture).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { blackbody } from '../physics/blackbody';
import { cmbForwardTemperature } from '../physics/cmb';
import { C_KM_S, SUN_TEFF_K } from '../physics/constants';
import { buildForwardTable, forwardEval, type ForwardSample } from '../physics/schwarzschildTables';
import { gravity } from '../sim/gravity';
import { sim } from '../sim/sim';
import { cmbPointUniforms, psfUniforms, relativityUniforms } from './materials';
import { forceLensProgramsReady, lens, updateLens } from './lens/lensState';
import { autoLnExposure, lensLnGMax, relView, setPointUniforms, updateRelativisticView } from './relativisticView';
import { skyMeter } from './lens/skyMeter';
import { useUI } from '../state/ui';

/** Put the observer in motion with rapidity φ along +x (the velocity itself may round to c). */
function moveAt(phi: number): void {
  sim.ship.phi = phi;
  sim.ship.vel.set(Math.tanh(phi) * C_KM_S, 0, 0);
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  updateRelativisticView('on', 0.5, true, false);
}

/** Every field of the gravity state back to no hole. */
function noHole(): void {
  gravity.hole = null;
  gravity.x = 0;
  gravity.rM = Infinity;
  gravity.framePhi = 0;
  gravity.fallView = null;
  gravity.lnGStatic = 0;
}

afterEach(() => {
  sim.ship.phi = 0;
  sim.ship.vel.set(0, 0, 0);
  skyMeter.lnExposure = 0;
  noHole();
  updateLens();
  forceLensProgramsReady(null);
  updateRelativisticView('on', 0.5, true, false);
});

/** Sgr A* straight ahead of a camera looking along -z, r (units of M) away; a fall's view when given. */
function nearSgrA(rM: number, fall: { phi: number; rainPhi: number } | null = null, framePhi = 0): void {
  const mKm = 6_345_058;
  gravity.hole = 'sgr-a-star';
  gravity.mKm = mKm;
  gravity.rsKm = 2 * mKm;
  gravity.rM = rM;
  gravity.rKm = rM * mKm;
  gravity.heightKm = (rM - 2) * mKm;
  gravity.x = 2 / rM;
  gravity.frame = fall && rM < 3 ? 'rain' : 'static';
  gravity.camRelHoleKm.set(0, 0, rM * mKm);
  gravity.lnGStatic = gravity.frame === 'rain' ? 0 : -0.5 * Math.log1p(-2 / rM);
  gravity.framePhi = framePhi;
  gravity.frameVelDir.set(1, 0, 0);
  gravity.fallView = fall ? { phi: fall.phi, dir: new Vector3(0, 0, -1), rainPhi: fall.rainPhi } : null;
  sim.viewport.width = 968;
  sim.viewport.height = 692;
  sim.camera.fovDeg = 50;
  sim.camera.quat.set(0, 0, 0, 1);
  psfUniforms.uPixelRatio.value = 2;
  forceLensProgramsReady(true);
  updateLens();
}

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

describe('near a black hole', () => {
  it('has no lens and no exposure far from holes, whatever the halves', () => {
    moveAt(Math.atanh(0.5));
    expect(lens.active).toBe(false);
    expect(relView.lnExposureClassical).toBe(0);
    setPointUniforms(false);
    expect(relativityUniforms.uLnExposure.value).toBe(0);
    expect(relativityUniforms.uPhi.value).toBe(0);
  });

  it('hovering at 10 r_s: the classical path takes the exposure of the blueshift g', () => {
    nearSgrA(20);
    expect(lens.active).toBe(true);
    updateRelativisticView('on', 0.5, true, false);
    expect(relView.active).toBe(false);
    const lnG = -0.5 * Math.log1p(-0.1);
    expect(lensLnGMax()).toBeCloseTo(lnG, 15);
    expect(relView.lnExposureClassical).toBe(autoLnExposure(lnG));
    expect(relView.lnExposureClassical).toBeLessThan(0);
    expect(relativityUniforms.uLnExposure.value).toBe(relView.lnExposureClassical);
    expect(relativityUniforms.uPhi.value).toBe(0);
    // at the hover floor the blueshift is large, the exposure deep
    nearSgrA(2 * (1 + 1e-6));
    updateRelativisticView('on', 0.5, true, false);
    expect(relView.lnExposureClassical).toBeLessThan(-3);
  });

  it('stops down for the sky’s own glare (its meter) with the lens drawn or not, in both halves, and not far from holes', () => {
    // The nuclear cluster's sky 4,000 au from Sgr A*: its meter's reading holds the view at e^−4.2.
    nearSgrA(94_308);
    skyMeter.lnExposure = -4.2;
    updateRelativisticView('on', 0.5, true, false);
    expect(lens.active).toBe(true);
    expect(relView.lnExposure).toBe(-4.2);
    expect(relView.lnExposureClassical).toBe(-4.2);
    // the lens off (View › Gravitational lensing): the meter still holds the view
    useUI.setState({ lensing: false });
    try {
      updateLens();
      updateRelativisticView('on', 0.5, true, false);
      expect(lens.active).toBe(false);
      expect(relView.lnExposureClassical).toBe(-4.2);
      setPointUniforms(false);
      expect(relativityUniforms.uLnExposure.value).toBe(-4.2);
      // in flight the relativistic half also stops down for its own speed, as far from holes: the deeper of the two
      moveAt(Math.atanh(0.9));
      expect(relView.active).toBe(true);
      expect(relView.lnExposure).toBe(Math.min(autoLnExposure(Math.atanh(0.9)), -4.2));
      // once the meter lets go, the speed's own exposure comes back at the same speed (not the stop-down)
      skyMeter.lnExposure = 0;
      updateRelativisticView('on', 0.5, true, false);
      expect(relView.lnExposure).toBe(autoLnExposure(Math.atanh(0.9)));
      expect(relView.lnExposureClassical).toBe(0);
    } finally {
      useUI.setState({ lensing: true });
    }
  });

  it("keeps the classical half at rest in the Sun's frame when the hole moves (the lens is conjugated by its boost)", () => {
    // Gaia BH3's frame boost, the ship riding with the hole
    const phiF = 1.19e-3;
    nearSgrA(1000, null, phiF);
    sim.ship.phi = phiF;
    sim.ship.vel.set(Math.tanh(phiF) * C_KM_S, 0, 0);
    updateRelativisticView('split', 0.5, true, false);
    expect(relView.active).toBe(false);
    setPointUniforms(false);
    expect(relativityUniforms.uPhi.value).toBe(0);
    expect(relativityUniforms.uEPhi.value).toBe(1);
  });

  it('during a fall: the relativistic path with the faller, the raindrop in the classical half', () => {
    const rainPhi = Math.atanh(Math.sqrt(2 / 10));
    nearSgrA(10, { phi: 0.9, rainPhi });
    for (const mode of ['on', 'split'] as const) {
      updateRelativisticView(mode, 0.5, true, false);
      expect(relView.active).toBe(true);
      expect(relView.split).toBe(mode === 'split');
      expect(relView.falling).toBe(true);
      expect(relView.phi).toBe(0.9);
      expect(relView.velDir.toArray()).toEqual([0, 0, -1]);
      expect(relView.halves[0].phi).toBe(rainPhi);
      // the raindrop falls towards the hole
      expect(relView.halves[0].velDir.z).toBe(-1);
      setPointUniforms(false);
      expect(relativityUniforms.uPhi.value).toBe(rainPhi);
      setPointUniforms(true);
      expect(relativityUniforms.uPhi.value).toBe(0.9);
      // one exposure for both halves: the faller's rapidity and the blueshift
      expect(relView.lnExposure).toBe(autoLnExposure(0.9 + lensLnGMax()));
      expect(relView.lnExposureClassical).toBe(relView.lnExposure);
    }
    // with the relativistic view off, the whole view is the raindrop through the classical path
    updateRelativisticView('off', 0.5, true, false);
    expect(relView.active).toBe(false);
    setPointUniforms(false);
    expect(relativityUniforms.uPhi.value).toBe(rainPhi);
    // below 3M the tables are the raindrop's own, and it is at rest in them
    nearSgrA(2.5, { phi: 0.2, rainPhi: 0 });
    expect(lens.obs.frame).toBe('rain');
    updateRelativisticView('on', 0.5, true, false);
    expect(relView.active).toBe(true);
    expect(relView.halves[0].phi).toBe(0);
    // the raindrop's brightest sky: at the dark region's edge, -ln(1 - v cos α_edge)
    const v = Math.sqrt(2 / 2.5);
    expect(lensLnGMax()).toBeCloseTo(-Math.log(1 - v * Math.cos(lens.edge)), 12);
  });

  it("changes tables at 3M with no jump: the static tables and the raindrop's inward motion give the raindrop's own picture", () => {
    const eps = 1e-9;
    const above = buildForwardTable({ frame: 'static', r: 3 * (1 + eps) });
    const below = buildForwardTable({ frame: 'rain', r: 3 * (1 - eps) });
    const rainPhi = Math.atanh(Math.sqrt(2 / 3));
    const a: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
    const b: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };
    let worst = 0;
    for (let k = 1; k < 400; k++) {
      // a look angle from the hole in the raindrop's frame, outside its dark region
      const alphaRain = below.edge + ((Math.PI - below.edge) * k) / 400;
      // the same ray in the static observer's frame: the raindrop moves towards the hole (along the axis)
      const alphaStatic = 2 * Math.atan(Math.exp(rainPhi) * Math.tan(alphaRain / 2));
      forwardEval(above, alphaStatic, a);
      forwardEval(below, alphaRain, b);
      expect(a.captured).toBe(false);
      expect(b.captured).toBe(false);
      worst = Math.max(worst, Math.abs(a.sweep - b.sweep));
    }
    // as good as the tables themselves (0.004 px at 1,484 px/rad is 2.7e-6 rad)
    expect(worst).toBeLessThan(3e-6);
  });
});
