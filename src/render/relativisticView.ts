/**
 * Relativistic view state, shared by the render pass, the point shaders and the labels.
 *
 * Everything starts from the ship's rapidity φ (sim.ship.phi, exact at any γ). β = tanh φ is
 * kept for readouts, but at γ ≈ 10⁸ it has rounded to 1, so the optics never use it: the GPU
 * gets φ and e^±φ, and brightness travels as a logarithm.
 */
import { Vector3 } from 'three';
import { LN_REF_TEMPERATURE, sampleBlackbody, type BlackbodySample } from '../physics/blackbody';
import {
  CMB_DIPOLE_B_DEG,
  CMB_DIPOLE_L_DEG,
  CMB_DIPOLE_PHI,
  T_CMB_K,
  cmbSpot,
  motionThroughCmb,
  type CmbMotion,
  type CmbSpot,
} from '../physics/cmb';
import { galacticToWorld } from '../sim/frames';
import { sim } from '../sim/sim';
import { cmbPointUniforms, relativityUniforms, SUN_SURFACE_RADIANCE } from './materials';

export type RelMode = 'off' | 'on' | 'split';

/** Below this speed the full relativistic pass is skipped: aberration < 0.6°, Doppler < 1%. */
export const REL_THRESHOLD_BETA = 0.01;

/** ln of the Sun-surface radiance the renderer uses, for calibrating other blackbodies. */
export const LN_SUN_SURFACE_RADIANCE = Math.log(SUN_SURFACE_RADIANCE);

/** Direction of the Sun's motion through the CMB, world axes (Planck 2018). */
export const CMB_DIPOLE_DIR = galacticToWorld(CMB_DIPOLE_L_DEG, CMB_DIPOLE_B_DEG);

export const relView = {
  mode: 'on' as RelMode,
  /** The relativistic pipeline is running this frame. */
  active: false,
  split: false,
  /** Split position as a fraction of the screen width (left: naive, right: relativistic). */
  splitX: 0.5,
  /** Apply Doppler shift and beaming (off = aberration only), for comparison. */
  doppler: true,
  /** Rapidity φ = artanh β, exact at any γ. */
  phi: 0,
  /** tanh φ: for readouts only (it is exactly 1 above γ ≈ 10⁸). */
  beta: 0,
  /** cosh φ */
  gamma: 1,
  /** e^φ, the head-on Doppler factor √((1+β)/(1−β)). */
  k: 1,
  velDir: new Vector3(0, 0, -1),
  /** Faster-than-light warp is active: relativistic optics are undefined. */
  suspended: false,
  /**
   * Auto-exposure for the relativistic view, like a camera stopping down, as a natural log. Light
   * from ahead brightens enormously (sunlight shifted to D·5772 K is ~50× brighter in visible
   * light at 0.9c, 4 × 10⁵× at γ = 10⁴), so we scale down by that forward boost to the power
   * 0.45. Relative brightness across the sky is preserved.
   */
  lnExposure: 0,
  /** e^lnExposure (float64: finite however far the camera stops down). */
  exposure: 1,
  /** The cosmic microwave background as the ship sees it. */
  cmb: {
    /**
     * Its temperature in its own rest frame, K. Today's value; a later phase can scale it as
     * 1/a(t) for the expanding universe (everything downstream takes it from here).
     */
    temperature: T_CMB_K,
    /** The ship's motion through it: rapidity and direction (ship frame, world axes). */
    motion: { phi: CMB_DIPOLE_PHI, dir: { x: CMB_DIPOLE_DIR.x, y: CMB_DIPOLE_DIR.y, z: CMB_DIPOLE_DIR.z } } as CmbMotion,
    /** The hot spot ahead: total flux, colour and size. */
    spot: { lnFlux: -Infinity, magnitude: Infinity, rgb: [1, 1, 1], coreRadius: Math.PI } as CmbSpot,
    /** Share drawn per pixel in the remap pass (1: resolved); the rest is the point source. */
    resolved: 1,
    /**
     * Whether any of it could show on screen this frame. At rest it is e⁻⁶⁸⁰⁰ times fainter than
     * the Sun's surface; the remap pass skips it until the forward spot gets within e⁻⁶⁰ of
     * display precision.
     */
    visible: false,
  },
};

const bb: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

/** Exposure, ln: −0.45 × ln(visible boost of sunlight seen head-on), never brighter than 1. */
export function autoLnExposure(phi: number): number {
  if (!(phi > 0)) return 0;
  const lnBoost = sampleBlackbody(LN_REF_TEMPERATURE + phi, bb).lnY;
  return Math.min(0, -0.45 * lnBoost);
}

let exposurePhi = NaN;
let spotPhi = NaN;
let spotT = NaN;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Called once per frame after the simulation update (sim.ship.phi must be current). */
export function updateRelativisticView(mode: RelMode, splitX: number, doppler: boolean, suspended: boolean): void {
  const phi = Number.isFinite(sim.ship.phi) ? Math.max(0, sim.ship.phi) : 0;
  relView.mode = mode;
  relView.splitX = splitX;
  relView.doppler = doppler;
  relView.suspended = suspended;
  relView.phi = phi;
  relView.beta = Math.tanh(phi);
  relView.gamma = Math.cosh(phi);
  relView.k = Math.exp(phi);
  relView.active = !suspended && mode !== 'off' && relView.beta > REL_THRESHOLD_BETA;
  relView.split = relView.active && mode === 'split';
  if (sim.ship.vel.lengthSq() > 0) relView.velDir.copy(sim.ship.vel).normalize();
  if (!relView.active) {
    relView.lnExposure = 0;
  } else if (phi !== exposurePhi) {
    exposurePhi = phi;
    relView.lnExposure = autoLnExposure(phi);
  }
  relView.exposure = Math.exp(relView.lnExposure);
  updateCmb();
  setPointUniforms(relView.active);
}

/**
 * The CMB: the ship's motion through it (its motion in the Sun's frame composed with the Sun's
 * through the CMB), the hot spot's total flux, and how much of it a pixel can resolve.
 */
function updateCmb(): void {
  const c = relView.cmb;
  const u = cmbPointUniforms;
  if (!relView.active || !relView.doppler) {
    c.resolved = 1;
    c.visible = false;
    u.uCmbPointFade.value = 0;
    return;
  }
  motionThroughCmb(relView.velDir, relView.phi, CMB_DIPOLE_DIR, CMB_DIPOLE_PHI, c.motion);
  u.uCmbPointDir.value.set(c.motion.dir.x, c.motion.dir.y, c.motion.dir.z);
  // The spot only changes with φ and T; recompute when either moves.
  if (c.motion.phi !== spotPhi || c.temperature !== spotT) {
    spotPhi = c.motion.phi;
    spotT = c.temperature;
    cmbSpot(c.motion.phi, c.temperature, c.spot);
    u.uCmbPointColor.value.setRGB(c.spot.rgb[0], c.spot.rgb[1], c.spot.rgb[2]);
  }
  // Resolved when its e-folding radius spans a few pixels (the same crossfade as a planet's
  // disc and its glint).
  const pxPerRad = sim.viewport.height / 2 / Math.tan((sim.camera.fovDeg * Math.PI) / 360);
  c.resolved = smoothstep(1.2, 3.7, c.spot.coreRadius * pxPerRad);
  u.uCmbPointFade.value = 1 - c.resolved;
  // The spot's flux in the same units as the Sun's disc: the Sun material's radiance is the
  // same blackbody reference (SUN_SURFACE_RADIANCE ↔ a 5,772 K surface).
  u.uCmbPointMag.value = Math.min(99, c.spot.magnitude - (2.5 / Math.LN10) * relView.lnExposure);
  const lnPeak = sampleBlackbody(Math.log(c.temperature) + c.motion.phi, bb).lnY + LN_SUN_SURFACE_RADIANCE + relView.lnExposure;
  c.visible = lnPeak > -60;
}

/** Point sources (stars, glints, belts, the CMB spot) use these; the pass flips them between halves. */
export function setPointUniforms(relativistic: boolean): void {
  const u = relativityUniforms;
  const phi = relativistic ? relView.phi : 0;
  u.uPhi.value = phi;
  u.uEPhi.value = relativistic ? relView.k : 1;
  u.uEmPhi.value = relativistic ? Math.exp(-phi) : 1;
  u.uLnExposure.value = relativistic ? relView.lnExposure : 0;
  u.uVelDir.value.copy(relView.velDir);
}
