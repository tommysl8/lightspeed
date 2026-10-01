/**
 * The galaxy maps' display law on the CPU side (the GLSL is shaders/galaxyMap.glsl): the depth cue's scale, which
 * follows the camera, and the twins the tests check the glows' light with.
 */
import { mapLight } from '../sim/surveys/format.ts';

export { mapLight };

/** The depth cue halves a galaxy's light this far from the camera near home, Mpc (the cosmic web's scale since it was made)… */
export const MAP_DEPTH_NEAR_MPC = 180;
/** …and farther out this share of the camera's distance from the Sun, so the surveys' far side still shows from gigaparsecs away. */
export const MAP_DEPTH_SHARE = 1;

/** uDepthMpc for a camera `distSunMpc` from the Sun. */
export const mapDepthMpc = (distSunMpc: number): number => Math.max(MAP_DEPTH_NEAR_MPC, MAP_DEPTH_SHARE * distSunMpc);

/** Twins of galaxyMap.glsl. */
export const mapNear = (d: number): number => Math.min(1 + (0.5 * MAP_DEPTH_NEAR_MPC) / Math.max(d, 1e-6), 9);
export function mapDepth(d: number, depthMpc: number): number {
  const q = d / depthMpc;
  return (1.4 * mapNear(d)) / (1 + q * q);
}
export const mapUnitPx2 = (pixelRatio: number): number => (1.5 * (pixelRatio + 0.5)) ** 2;

/** The expansion's dimming held to this, ln of flux, below the ship's shift alone (galaxyMap.glsl MAP_DIM_FLOOR). */
export const MAP_DIM_FLOOR = Math.log(0.01);

/**
 * The surveys' glows are a fill, not the light's full account: they show where the galaxies too far or too small to
 * draw are, at this share of those galaxies' light (with all of it they were a haze over the points: from gigaparsecs
 * out the undrawn galaxies hold 98 % of the light), and fade out where they would look large (glowFade).
 */
export const GLOW_FILL = 0.2;
/** A glow fades out between these widths (1σ, device px): a region that large on the screen is drawn in points. */
export const GLOW_FADE_PX: readonly [number, number] = [12, 48];
export function glowFade(sigmaPx: number): number {
  const t = Math.min(1, Math.max(0, (sigmaPx - GLOW_FADE_PX[0]) / (GLOW_FADE_PX[1] - GLOW_FADE_PX[0])));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The summed light of a point sprite of the maps' fragment shader (materials.ts COSMIC_WEB_FRAG, a Gaussian
 * exp(−18 r²) less its value at the sprite's edge, r in sprite widths) per unit alpha and per px² of sprite: what a glow
 * multiplies by to carry the same light as the points it stands for.
 */
export const POINT_KERNEL = (() => {
  const floor = 0.0111;
  const r2 = Math.log(1 / floor) / 18;
  return (Math.PI / 18) * (1 - Math.exp(-18 * r2)) - floor * Math.PI * r2;
})();

/**
 * The depth cue (with the near fade, `nearMpc`) a glow applies to its octant (shaders/surveyGlow.vert.glsl, its twin):
 * averaged over a Gaussian cloud of rms radius `rms` whose centre is `d` away, by three points along the line of
 * sight (Gauss–Hermite: at 0 and ±√3 σ, weights 2/3 and 1/6), each √2 σ aside.
 */
export function glowDepth(d: number, rms: number, depthMpc: number, nearMpc = 1.5): number {
  const s = rms / Math.sqrt(3);
  let k = 0;
  for (const [z, w] of [
    [-Math.sqrt(3) * s, 1 / 6],
    [0, 2 / 3],
    [Math.sqrt(3) * s, 1 / 6],
  ]) {
    const di = Math.sqrt((d + z) ** 2 + 2 * s * s);
    const t = Math.min(1, Math.max(0, (di - 0.35 * nearMpc) / (0.65 * nearMpc)));
    k += w * t * t * (3 - 2 * t) * mapDepth(di, depthMpc);
  }
  return k;
}
