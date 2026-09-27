/**
 * Which spiral arm a place is in, for the location trail ("Milky Way › Orion Arm › …").
 *
 * Only where it can be said honestly: the arms are the log-periodic fits of Reid et al. (2019) to
 * about 200 maser parallaxes, and a place is in an arm when it lies within two Gaussian widths
 * (1σ, the arms' fitted widths) of the arm's ridge, within the stretch of the arm that the
 * parallaxes trace or that reaches to the tangent directions the fit took as priors (Bronfman et
 * al. 2000; the Carina part of the Sagittarius–Carina Arm), not the extrapolation drawn beyond
 * them, and within 400 pc of the midplane
 * (the arms are traced by young stars and gas, a few tens of parsecs thick). Elsewhere nothing is
 * said. The Sun, 0.37 kpc inside the Local Arm's ridge, is in it (1.2 widths).
 */
import { armRadius, armWidth, createGalaxyModel, polarToG, type Arm, type GalaxyModel, type GalaxyModelJson } from './model';
import { anglesFromVector, galToG, gToGal, type Vec3 } from './frames';
import modelJson from './model.json';

/** How far from a ridge, in arm widths, a place still counts as in the arm. */
export const ARM_REACH_WIDTHS = 2;
/** How far from the midplane, kpc. */
export const ARM_MAX_HEIGHT_KPC = 0.4;

/** Names people use: Reid et al.'s "Local arm" is the Orion Arm (or Orion–Cygnus Arm). */
export const ARM_NAMES: Record<string, string> = {
  '3kpc': '3-kpc Arm',
  norma: 'Norma Arm',
  sctcen: 'Scutum–Centaurus Arm',
  sgrcar: 'Sagittarius–Carina Arm',
  local: 'Orion Arm',
  perseus: 'Perseus Arm',
  outer: 'Outer Arm',
};

let model: GalaxyModel | null = null;
/** The Galaxy model (built once). */
export function galaxyModel(): GalaxyModel {
  return (model ??= createGalaxyModel(modelJson as unknown as GalaxyModelJson));
}

/** Margin kept about a tangent point, degrees of galactocentric azimuth. */
const TANGENT_MARGIN_DEG = 5;
const TANGENT_PRIORS = (modelJson as unknown as { components: { spiralArms: { tangencyPriorsL: { value: Record<string, number> } } } }).components.spiralArms.tangencyPriorsL.value;

/**
 * The azimuth of an arm's fourth-quadrant tangent point as the model draws it (where its
 * longitude seen from the Sun is least), or null for arms without a tangency prior.
 */
export function tangentAzimuth(arm: Arm): number | null {
  if (TANGENT_PRIORS[arm.id] === undefined) return null;
  const lonAt = (b: number) => {
    const [x, y] = polarToG(armRadius(arm, b), b);
    return anglesFromVector(gToGal([x, y, 0])).lon;
  };
  let best: number | null = null;
  let bestL = Infinity;
  for (let b = arm.betaExt[0] + 0.1; b < arm.betaExt[1] - 0.1; b += 0.1) {
    const l = lonAt(b);
    if (l > 270 && l < bestL && l < lonAt(b - 0.1) && l < lonAt(b + 0.1)) {
      bestL = l;
      best = b;
    }
  }
  return best;
}

const traced = new Map<string, [number, number]>();
/** The stretch of an arm (azimuths, degrees) that the parallaxes or the tangency priors constrain. */
export function tracedRange(arm: Arm): [number, number] {
  let r = traced.get(arm.id);
  if (!r) {
    const t = tangentAzimuth(arm);
    r = t === null ? [arm.betaData[0], arm.betaData[1]] : [Math.min(arm.betaData[0], t - TANGENT_MARGIN_DEG), Math.max(arm.betaData[1], t + TANGENT_MARGIN_DEG)];
    traced.set(arm.id, r);
  }
  return r;
}

export interface ArmPlace {
  id: string;
  name: string;
  /** Distance from the ridge, in the arm's widths. */
  widths: number;
}

/** The arm a heliocentric galactic position (kpc) is in, or null where none can honestly be named. */
export function armAt(galKpc: Readonly<Vec3>): ArmPlace | null {
  const m = galaxyModel();
  const g = galToG([galKpc[0], galKpc[1], galKpc[2]]);
  const R = Math.hypot(g[0], g[1]);
  const beta = (Math.atan2(g[1], -g[0]) * 180) / Math.PI;
  if (Math.abs(g[2] - m.warpZ(R, beta)) > ARM_MAX_HEIGHT_KPC) return null;
  let best: ArmPlace | null = null;
  for (const n of m.armsNear(g[0], g[1])) {
    const [b0, b1] = tracedRange(n.arm);
    if (n.beta < b0 || n.beta > b1) continue;
    const widths = n.d / armWidth(n.arm, n.Ra);
    if (widths > ARM_REACH_WIDTHS) continue;
    if (!best || widths < best.widths) best = { id: n.arm.id, name: ARM_NAMES[n.arm.id] ?? n.arm.name, widths };
  }
  return best;
}
