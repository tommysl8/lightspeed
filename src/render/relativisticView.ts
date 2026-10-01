/**
 * Relativistic view state, shared by the render pass, the point shaders and the labels.
 *
 * Everything starts from the ship's rapidity φ (sim.ship.phi, exact at any γ). β = tanh φ is
 * kept for readouts, but at γ ≈ 10⁸ it has rounded to 1, so the optics never use it: the GPU
 * gets φ and e^±φ, and brightness travels as a logarithm.
 *
 * Near a black hole (docs/data/blackholes.md §10): the two halves of the split view each have their observer
 * (relView.halves). Outside a fall these are today's: the classical half at rest in the Sun's frame,
 * the relativistic half the ship (render/lens/lensState.ts conjugates the lens by the hole frame's boost,
 * so unlensed light is exactly where it was). During a fall (only at Sgr A* and M87*, whose frame boost
 * is 0) both move relative to the lens frame of the moment: the classical half is the raindrop, falling
 * inward with the rapidity gravity.fallView.rainPhi (0 below 3M, where the tables are the raindrop's own),
 * the relativistic half the faller (fallView.phi along fallView.dir); the relativistic path is taken
 * throughout the fall unless the relativistic view is off, when the whole view is the raindrop drawn by
 * the classical path with its point uniforms (nothing near those holes is a surface the remap would
 * have to aberrate). With a lens drawn the exposure is autoLnExposure(|φ_view| + ln g_max) (ln g_max the
 * brightest shift of light from far away: the static observer's ln g, or the raindrop's at the dark
 * region's edge), or less where the accretion flow's glare (render/flow/flowMap.ts), a thin disc's
 * (render/disk/diskMap.ts) or the sky's own
 * (render/lens/skyMeter.ts, which also applies near a hole whose lens is not drawn) calls for it, applied
 * in the classical path too; the CMB's hot spot is shifted by the observer's blueshift g (its place is the
 * observer's own forward direction). With no hole every value is today's.
 *
 * Cost: a few dozen flops a frame; nothing allocated.
 *
 * Twins: shaders/relativity.glsl (the point uniforms), shaders/remap.frag.glsl (the CMB near a hole),
 * render/lens/lensState.ts (the same observers' boosts for the lens's boxes and circles).
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
import { gravity } from '../sim/gravity';
import { cosmicNow } from '../sim/cosmicTime';
import { insideLocalGroup } from '../sim/cosmos/expansion';
import { cmbPointUniforms, relativityUniforms, SUN_SURFACE_RADIANCE } from './materials';
import { lens, lensOverride } from './lens/lensState';
import { flowLnExposure } from './flow/flowMap';
import { diskLnExposure } from './disk/diskMap';
import { skyLnExposure } from './lens/skyMeter';

export type RelMode = 'off' | 'on' | 'split';

/** Below this speed the full relativistic pass is skipped: aberration < 0.6°, Doppler < 1%. */
export const REL_THRESHOLD_BETA = 0.01;

/** ln of the Sun-surface radiance the renderer uses, for calibrating other blackbodies. */
export const LN_SUN_SURFACE_RADIANCE = Math.log(SUN_SURFACE_RADIANCE);

/** Direction of the Sun's motion through the CMB, world axes (Planck 2018). */
export const CMB_DIPOLE_DIR = galacticToWorld(CMB_DIPOLE_L_DEG, CMB_DIPOLE_B_DEG);

/** One half's observer: its rapidity and unit direction of motion (world axes) relative to the frame its light is drawn in. */
export interface HalfObserver {
  phi: number;
  velDir: Vector3;
}

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
  /**
   * The halves' observers: 0 the classical half (at rest in the Sun's frame; during a fall the raindrop), 1 the
   * relativistic half or the whole view (the ship; during a fall the faller). setPointUniforms reads them.
   */
  halves: [
    { phi: 0, velDir: new Vector3(0, 0, -1) },
    { phi: 0, velDir: new Vector3(0, 0, -1) },
  ] as [HalfObserver, HalfObserver],
  /** A fall is under way: the halves move relative to the lens frame. */
  falling: false,
  /** Faster-than-light warp is active: relativistic optics are undefined. */
  suspended: false,
  /**
   * Auto-exposure for the relativistic view, like a camera stopping down, as a natural log. Light
   * from ahead brightens enormously (sunlight shifted to D·5772 K is ~50× brighter in visible
   * light at 0.9c, 4 × 10⁵× at γ = 10⁴), so we scale down by that forward boost to the power
   * 0.45. Relative brightness across the sky is preserved. Near a black hole the observer's own
   * blueshift counts too (lensLnGMax).
   */
  lnExposure: 0,
  /** e^lnExposure (float64: finite however far the camera stops down). */
  exposure: 1,
  /** The classical half's exposure, ln: 0 unless a black hole's lens is drawn (then lnExposure). */
  lnExposureClassical: 0,
  /** The cosmic microwave background as the ship sees it. */
  cmb: {
    /**
     * Its temperature in its own rest frame, K: T0 / a(t) at the clock's time (sim/cosmicTime.ts),
     * set each frame; everything downstream takes it from here.
     */
    temperature: T_CMB_K,
    /** The ship's motion through it: rapidity and direction (ship frame, world axes). */
    motion: { phi: CMB_DIPOLE_PHI, dir: { x: CMB_DIPOLE_DIR.x, y: CMB_DIPOLE_DIR.y, z: CMB_DIPOLE_DIR.z } } as CmbMotion,
    /**
     * Near a black hole: the hole frame's own motion through it (the lens reads the CMB at the escape
     * direction in that frame: shaders/remap.frag.glsl).
     */
    holeMotion: { phi: CMB_DIPOLE_PHI, dir: { x: CMB_DIPOLE_DIR.x, y: CMB_DIPOLE_DIR.y, z: CMB_DIPOLE_DIR.z } } as CmbMotion,
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
let lensExposureArg = NaN;
let lensExposure = 0;
let spotPhi = NaN;
let spotT = NaN;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * ln g_max of the lens drawn this frame: the largest shift of light from far away the observer sees
 * (docs/data/blackholes.md §4): the static observer's ln g everywhere, or, in the raindrop's frame,
 * −ln(1 − v cos α_edge) at the dark region's edge (written (1 − v) + 2v sin²(α_edge/2), with 1 − v from float64).
 * 0 with no lens.
 */
export function lensLnGMax(): number {
  if (!lens.active) return 0;
  if (lens.obs.frame !== 'rain') return lens.lnG;
  const r = lens.obs.r;
  const v = Math.sqrt(2 / r);
  const s = Math.sin(lens.edge / 2);
  const den = (r - 2) / (r * (1 + v)) + 2 * v * s * s;
  return den > 0 ? -Math.log(den) : 0;
}

/** Called once per frame after the simulation update (sim.ship.phi must be current). */
export function updateRelativisticView(mode: RelMode, splitX: number, doppler: boolean, suspended: boolean): void {
  const h0 = relView.halves[0];
  const h1 = relView.halves[1];
  const fv = lensOverride.on ? null : gravity.fallView;
  let phi: number;
  if (lensOverride.on) {
    // A reference camera of the lens's checks (dev/lensTest.ts): moving as the fixture says, relative to the lens frame.
    phi = Math.max(0, lensOverride.phi);
    if (phi > 0) relView.velDir.copy(lensOverride.velDir);
    h0.phi = 0;
  } else if (fv) {
    // The faller, and the raindrop (inward: towards the hole) relative to the lens frame.
    phi = Math.max(0, fv.phi);
    if (phi > 0) relView.velDir.copy(fv.dir);
    h0.phi = Math.max(0, fv.rainPhi);
    const c = gravity.camRelHoleKm;
    const cl = c.length();
    if (cl > 0) h0.velDir.set(-c.x / cl, -c.y / cl, -c.z / cl);
  } else {
    phi = Number.isFinite(sim.ship.phi) ? Math.max(0, sim.ship.phi) : 0;
    if (sim.ship.vel.lengthSq() > 0) relView.velDir.copy(sim.ship.vel).normalize();
    h0.phi = 0;
  }
  relView.falling = fv !== null;
  relView.mode = mode;
  relView.splitX = splitX;
  relView.doppler = doppler;
  relView.suspended = suspended;
  relView.phi = phi;
  relView.beta = Math.tanh(phi);
  relView.gamma = Math.cosh(phi);
  relView.k = Math.exp(phi);
  // During a fall the relativistic path runs throughout (its observers move relative to the lens frame at any speed).
  relView.active = !suspended && mode !== 'off' && (fv !== null || relView.beta > REL_THRESHOLD_BETA);
  relView.split = relView.active && mode === 'split';
  h1.phi = phi;
  h1.velDir.copy(relView.velDir);
  if (!(h0.phi > 0)) h0.velDir.copy(relView.velDir);
  // Near a hole the sky itself can glare (the nuclear star cluster from within a parsec of Sgr A*, M87's starlight
  // inside M87): its averaging meter stops the view down (render/lens/skyMeter.ts). 0 far from every hole.
  const sky = skyLnExposure();
  if (lens.active) {
    // Near a black hole: the observer's blueshift counts, and both halves share the exposure.
    const arg = (relView.active ? phi : h0.phi) + lensLnGMax();
    if (arg !== lensExposureArg) {
      lensExposureArg = arg;
      lensExposure = autoLnExposure(arg);
    }
    // Sgr A*'s resolved accretion flow outshines the sky, and a thin accretion disc far more: stop down for their glare
    // too (render/flow/flowMap.ts, render/disk/diskMap.ts).
    const e = Math.min(lensExposure, flowLnExposure(), diskLnExposure(), sky);
    relView.lnExposure = e;
    relView.lnExposureClassical = e;
    // (the exposure far from holes is worked out afresh when the lens goes, even at the same speed)
    exposurePhi = NaN;
  } else if (sky < 0) {
    // Near a hole with its lens not drawn (lensing off, or its ring under 0.05 px): the sky's meter, in both halves
    // (the relativistic one also stops down for its own speed, as far from holes).
    relView.lnExposure = Math.min(relView.active ? autoLnExposure(phi) : 0, sky);
    relView.lnExposureClassical = sky;
    exposurePhi = NaN;
  } else {
    relView.lnExposureClassical = 0;
    if (!relView.active) {
      relView.lnExposure = 0;
    } else if (phi !== exposurePhi) {
      exposurePhi = phi;
      relView.lnExposure = autoLnExposure(phi);
    }
  }
  relView.exposure = Math.exp(relView.lnExposure);
  updateCmb();
  setPointUniforms(relView.active);
}

/**
 * The CMB: its temperature at the clock's time, the ship's motion through it, the hot spot's total
 * flux, and how much of it a pixel can resolve. Inside the Local Group the ship's motion is measured
 * in the Sun's frame, so it is composed with the Sun's own motion through the CMB (the dipole);
 * beyond it the ship's motion is measured against the local comoving frame, the CMB's rest frame
 * there (the flights through expanding space arrive at rest in it, and treat home as comoving).
 * Near a black hole the spot is seen shifted by the observer's blueshift g (its place is the view's
 * own forward direction, which the lens does not move), and the hole frame's own motion through the
 * CMB is kept for the remap's lensed pixels.
 */
function updateCmb(): void {
  const c = relView.cmb;
  const u = cmbPointUniforms;
  c.temperature = cosmicNow().tCmbK;
  if (!relView.active || !relView.doppler) {
    c.resolved = 1;
    c.visible = false;
    u.uCmbPointFade.value = 0;
    return;
  }
  const dipole = insideLocalGroup(sim.camera.pos) ? CMB_DIPOLE_PHI : 0;
  motionThroughCmb(relView.velDir, relView.phi, CMB_DIPOLE_DIR, dipole, c.motion);
  if (lens.active) motionThroughCmb(gravity.frameVelDir, lensOverride.on || relView.falling ? 0 : gravity.framePhi, CMB_DIPOLE_DIR, dipole, c.holeMotion);
  u.uCmbPointDir.value.set(c.motion.dir.x, c.motion.dir.y, c.motion.dir.z);
  // The observer's blueshift of light from far away (0 with no lens).
  const lnG = lens.active ? lensLnGMax() : 0;
  const tSeen = lnG !== 0 ? c.temperature * Math.exp(lnG) : c.temperature;
  // The spot only changes with φ and T; recompute when either moves.
  if (c.motion.phi !== spotPhi || tSeen !== spotT) {
    spotPhi = c.motion.phi;
    spotT = tSeen;
    cmbSpot(c.motion.phi, tSeen, c.spot);
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
  const lnPeak = sampleBlackbody(Math.log(tSeen) + c.motion.phi, bb).lnY + LN_SUN_SURFACE_RADIANCE + relView.lnExposure;
  c.visible = lnPeak > -60;
}

/** Point sources (stars, glints, belts, the CMB spot) use these; the pass flips them between halves. */
export function setPointUniforms(relativistic: boolean): void {
  const u = relativityUniforms;
  const h = relView.halves[relativistic ? 1 : 0];
  const phi = h.phi;
  u.uPhi.value = phi;
  u.uEPhi.value = phi > 0 ? Math.exp(phi) : 1;
  u.uEmPhi.value = phi > 0 ? Math.exp(-phi) : 1;
  u.uLnExposure.value = relativistic ? relView.lnExposure : relView.lnExposureClassical;
  u.uVelDir.value.copy(h.velDir);
}
