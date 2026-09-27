// Which spacetime to fly in.
//
// Gravitationally bound systems do not take part in the cosmic expansion: the Milky Way, Andromeda and
// their satellites sit inside the Local Group's zero-velocity surface, where gravity has halted the
// Hubble flow. Karachentsev, Kashibadze & Makarov (2009, MNRAS 393, 1265) measure its radius as
// R0 = 0.96 +- 0.03 Mpc around the Local Group barycentre, which lies at 0.55 +- 0.05 of the way from
// the Milky Way to M31 (mass ratio M_MW / M_M31 ~ 4/5).
//
// Policy:
//   - destination inside R0 of the barycentre (or flagged as bound by the caller)  -> 'static':
//     special-relativistic flip-and-burn (planStatic) or cruise (planStaticCruise) in flat,
//     non-expanding space;
//   - otherwise -> 'flrw': the expanding-universe planner (planFlipAndBurn / planCruise).
// At the boundary (1.4 Mpc from home at most) the two agree to about 1e-5 in ship time (cosmology.md,
// "Bound structures"), so the switch is invisible. Galaxies just outside R0 (1-3 Mpc) follow a Hubble flow slowed by the
// Local Group's gravity (Karachentsev et al. measure H_loc = 78 km/s/Mpc with 25 km/s scatter); the
// FLRW planner treats them as comoving, a difference far below the effect it models.

import { Cosmology } from './cosmology.ts';
import { planFlipAndBurn, planStatic, planStaticCruise, planCruise, type CruiseOptions, type PlanOptions, type TripPlan, type Unreachable } from './ship.ts';

export type Vec3 = [number, number, number];

export const LOCAL_GROUP = {
  /** Radius of the zero-velocity surface, Mpc (Karachentsev et al. 2009). */
  zeroVelocityRadiusMpc: 0.96,
  /** Barycentre position as a fraction of the Milky Way -> M31 vector (Karachentsev et al. 2009). */
  barycentreFraction: 0.55,
  /**
   * M31, heliocentric, J2000 ecliptic axes, Mpc: 2MASS position with the Cepheid distance 0.761 Mpc of
   * Li, Riess et al. (2021, ApJ 920, 84); the same numbers as src/sim/cosmos/named.json.
   */
  m31EclMpc: [0.562069, 0.296962, 0.418346] as Vec3,
  ref: 'Karachentsev, Kashibadze & Makarov 2009, MNRAS 393, 1265 (arXiv:0811.4610)',
} as const;

/** Local Group barycentre (heliocentric, same frame as m31). The Sun's 8 kpc offset from the Galactic centre is negligible here. */
export function localGroupBarycentre(m31: Vec3 = LOCAL_GROUP.m31EclMpc): Vec3 {
  const f = LOCAL_GROUP.barycentreFraction;
  return [f * m31[0], f * m31[1], f * m31[2]];
}

/**
 * True if a heliocentric position (Mpc, same frame as m31) lies inside the Local Group zero-velocity surface.
 * `barycentre` overrides the barycentre worked out from m31 (a catalogue's own, in the same frame).
 */
export function isBoundToLocalGroup(posMpc: Vec3, m31: Vec3 = LOCAL_GROUP.m31EclMpc, barycentre?: Vec3): boolean {
  const b = barycentre ?? localGroupBarycentre(m31);
  return Math.hypot(posMpc[0] - b[0], posMpc[1] - b[1], posMpc[2] - b[2]) <= LOCAL_GROUP.zeroVelocityRadiusMpc;
}

export interface Destination {
  /** Heliocentric position, Mpc (ecliptic J2000 axes unless m31 is given in another frame). */
  positionMpc?: Vec3;
  /**
   * Where the trip starts, heliocentric, same frame (default: home, the origin). A trip is flown in static
   * space only when it starts and ends inside the Local Group; one that starts outside it (a traveller
   * coming home from the Virgo cluster) crosses expanding space, with the Local Group as one comoving point.
   */
  originMpc?: Vec3;
  /**
   * Distance, Mpc: the fixed distance for bound targets, the comoving distance (a = 1 today) otherwise.
   * Defaults to |positionMpc - originMpc|.
   */
  distanceMpc?: number;
  /** Override the geometric test (e.g. a catalogue flag for Local Group membership). */
  bound?: boolean;
  /** M31 position in the frame of positionMpc (defaults to LOCAL_GROUP.m31EclMpc). */
  m31Mpc?: Vec3;
  /** The Local Group barycentre in that frame, when a catalogue gives its own (defaults to 0.55 of the way to m31). */
  barycentreMpc?: Vec3;
}

export function propagationModel(dest: Destination): 'static' | 'flrw' {
  if (dest.bound !== undefined) return dest.bound ? 'static' : 'flrw';
  const inside = (p: Vec3) => isBoundToLocalGroup(p, dest.m31Mpc, dest.barycentreMpc);
  // Both ends must be bound to the Local Group: a trip from outside it crosses expanding space.
  if (dest.originMpc && !inside(dest.originMpc)) return 'flrw';
  if (dest.positionMpc) return inside(dest.positionMpc) ? 'static' : 'flrw';
  // Distance only (from home): the zero-velocity surface reaches at least R0 - 0.55 D_M31 = 0.54 Mpc from us in any direction.
  const d = dest.distanceMpc ?? NaN;
  const m31 = dest.m31Mpc ?? LOCAL_GROUP.m31EclMpc;
  return d <= LOCAL_GROUP.zeroVelocityRadiusMpc - LOCAL_GROUP.barycentreFraction * Math.hypot(...m31) ? 'static' : 'flrw';
}

/** Distance of a trip, Mpc: the one given, else from the departure point (home by default) to the position. */
export function tripDistanceMpc(dest: Destination): number {
  if (dest.distanceMpc !== undefined) return dest.distanceMpc;
  if (!dest.positionMpc) return NaN;
  const o = dest.originMpc ?? [0, 0, 0];
  const p = dest.positionMpc;
  return Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
}

/**
 * Plan a trip with the right spacetime for the destination. Every planner validates its inputs and
 * returns an Unreachable (never throws); the static branch honours maxShipTimeYr and cruise requests too.
 * Departure scale factors other than 1 change only the FLRW trips (and the cosmic dates of static ones).
 */
export function planTrip(
  cosmo: Cosmology,
  dest: Destination,
  opts: PlanOptions & { cruise?: Omit<CruiseOptions, keyof PlanOptions> } = {},
): TripPlan | Unreachable {
  const d = tripDistanceMpc(dest);
  const model = propagationModel(dest.positionMpc ? dest : { ...dest, distanceMpc: d });
  if (model === 'static') return opts.cruise ? planStaticCruise(cosmo, d, { ...opts, ...opts.cruise }) : planStatic(cosmo, d, opts);
  if (opts.cruise) return planCruise(cosmo, d, { ...opts, ...opts.cruise });
  return planFlipAndBurn(cosmo, d, opts);
}
