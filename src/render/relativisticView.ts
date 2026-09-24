/**
 * Relativistic view state, shared by the render pass, the point shaders and the labels.
 */
import { Vector3 } from 'three';
import { gamma } from '../physics/relativity';
import { C_KM_S, SUN_TEFF_K } from '../physics/constants';
import { blackbody } from '../physics/blackbody';
import { sim } from '../sim/sim';
import { relativityUniforms } from './materials';

export type RelMode = 'off' | 'on' | 'split';

/** Below this speed the full relativistic pass is skipped: aberration < 0.6°, Doppler < 1%. */
export const REL_THRESHOLD_BETA = 0.01;

export const relView = {
  mode: 'on' as RelMode,
  /** The relativistic pipeline is running this frame. */
  active: false,
  split: false,
  /** Split position as a fraction of the screen width (left: naive, right: relativistic). */
  splitX: 0.5,
  /** Apply Doppler shift and beaming (off = aberration only), for comparison. */
  doppler: true,
  beta: 0,
  gamma: 1,
  /** k = √((1+β)/(1−β)), the head-on Doppler factor. */
  k: 1,
  velDir: new Vector3(0, 0, -1),
  /** Faster-than-light warp is active: relativistic optics are undefined. */
  suspended: false,
  /**
   * Auto-exposure for the relativistic view, like a camera stopping down. Light from ahead
   * brightens enormously (sunlight shifted to D·5772 K is ~12× brighter in visible light at
   * 0.9c), so we scale down by the square root of that forward boost to keep the view readable.
   * Relative brightness across the sky is preserved.
   */
  exposure: 1,
};

let exposureBeta = -1;
function autoExposure(beta: number, k: number): number {
  if (beta === exposureBeta) return relView.exposure;
  exposureBeta = beta;
  const boost = 10 ** (blackbody(SUN_TEFF_K * k).log10Y - blackbody(SUN_TEFF_K).log10Y);
  return Math.min(1, Math.max(0.01, boost ** -0.45));
}

/** Called once per frame after the simulation update. */
export function updateRelativisticView(mode: RelMode, splitX: number, doppler: boolean, suspended: boolean): void {
  const beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999);
  relView.mode = mode;
  relView.splitX = splitX;
  relView.doppler = doppler;
  relView.suspended = suspended;
  relView.active = !suspended && mode !== 'off' && beta > REL_THRESHOLD_BETA;
  relView.split = relView.active && mode === 'split';
  relView.beta = beta;
  relView.gamma = gamma(beta);
  relView.k = Math.sqrt((1 + beta) / (1 - beta));
  relView.exposure = relView.active ? autoExposure(beta, relView.k) : 1;
  if (sim.ship.vel.lengthSq() > 0) relView.velDir.copy(sim.ship.vel).normalize();
  setPointUniforms(relView.active);
}

/** Point sources (stars, glints, belts) use these; the pass flips them between halves. */
export function setPointUniforms(relativistic: boolean): void {
  relativityUniforms.uBeta.value = relativistic ? relView.beta : 0;
  relativityUniforms.uGamma.value = relativistic ? relView.gamma : 1;
  relativityUniforms.uExposure.value = relativistic ? relView.exposure : 1;
  relativityUniforms.uVelDir.value.copy(relView.velDir);
}
