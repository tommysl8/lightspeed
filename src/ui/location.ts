/**
 * Where you are, as a breadcrumb for the footer: "Observable universe › Local Universe › Local
 * Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Saturn › Titan", "… › Local
 * Group › Andromeda Galaxy › M32", "Observable universe › Local Universe › Virgo Cluster › M87" or
 * "Observable universe › GN-z11". Built from the body registry's parents, so every body later data
 * registers gets its trail, with the levels of the universe above: the Local Group (inside its
 * zero-velocity surface), the local universe (out to redshift 0.1) and the observable universe;
 * then the Galaxy's levels: the Milky Way (a link to the view from outside), the spiral arm the
 * place is in where that can be said from the arms' measured stretches (sim/galaxy/arms.ts), then
 * the Sun's neighbourhood for anything within 100 light-years. Objects in other galaxies (the
 * nebulae of the Magellanic Clouds) come under their galaxy.
 */
import { MPC_KM, PARSEC_KM } from '../physics/constants';
import { LOCAL_UNIVERSE_MPC } from '../sim/cosmos/cosmology';
import { cosmicNow } from '../sim/cosmicTime';
import { LOCAL_GROUP_RADIUS_MPC } from '../sim/cosmos/records';
import { bodyName, bodyRecords, childrenOf, getBody, isBody, lineage, rootOf, type BodyId, type BodyRecord } from '../sim/bodies';
import { entryOf } from '../sim/bodies/registry';
import { armAt } from '../sim/galaxy/arms';
import { apply, WORLD_TO_GAL } from '../sim/galaxy/frames';
import type { ControlMode } from '../state/ui';

export interface Crumb {
  label: string;
  /**
   * What clicking it does: frame the stars around the Sun, the whole Solar System, the Milky Way
   * from outside, or go to a body. None: not a link.
   */
  to?: 'solar-neighbourhood' | 'solar-system' | 'milky-way' | 'local-group' | 'local-universe' | BodyId;
  /** A level of the universe or of the Galaxy above the place (the footer leaves these out where room is short). */
  galactic?: boolean;
  /** A level of the universe above the innermost one shown (the footer shows these only on wide screens). */
  outer?: boolean;
}

/** Which level of the universe a place is in. */
export type CosmicLevel = 'local-group' | 'local-universe' | 'observable-universe';

/**
 * The levels of the universe above a place in it, outermost first; all but the innermost are
 * marked `outer`. The Local Group and the local universe are links to their views once the
 * galaxies are registered.
 */
export function cosmicCrumbs(level: CosmicLevel): Crumb[] {
  const lg = isBody('local-group');
  const all: Crumb[] = [
    { label: 'Observable universe', galactic: true },
    { label: 'Local Universe', to: lg ? 'local-universe' : undefined, galactic: true },
    { label: 'Local Group', to: lg ? 'local-group' : undefined, galactic: true },
  ];
  const n = level === 'local-group' ? 3 : level === 'local-universe' ? 2 : 1;
  return all.slice(0, n).map((c, i) => (i < n - 1 ? { ...c, outer: true } : c));
}

/**
 * The level of the universe a root is in: the Local Group within its zero-velocity surface
 * (0.96 Mpc about its barycentre; before the galaxies are registered, anything within 1.5 Mpc of
 * the Sun), the local universe out to redshift 0.1 (432.6 Mpc, comoving: the world's proper distance
 * divided by the scale factor at the clock's time, so a galaxy stays where it is as the universe
 * grows), the observable universe beyond.
 */
export function cosmicLevel(root: BodyRecord | undefined): CosmicLevel {
  if (!root) return 'local-group';
  const p = placeOf(root);
  const fromSunMpc = p ? Math.hypot(p.x, p.y, p.z) / MPC_KM : distancePc(root) / 1e6;
  const lg = entryOf('local-group');
  if (lg && lg.stamp >= 0 && p) {
    const q = lg.state.pos;
    if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / MPC_KM <= LOCAL_GROUP_RADIUS_MPC) return 'local-group';
  } else if (fromSunMpc <= 1.5) return 'local-group';
  return fromSunMpc / cosmicNow().a <= LOCAL_UNIVERSE_MPC ? 'local-universe' : 'observable-universe';
}

const NEIGHBOURHOOD: Crumb = { label: 'Solar neighbourhood', to: 'solar-neighbourhood' };

/** The Milky Way: a link to the view from outside once its body is registered (sim/galaxy). */
const milkyWay = (): Crumb => ({ label: 'Milky Way', to: isBody('milky-way') ? 'milky-way' : undefined, galactic: true });

/**
 * The Sun's neighbourhood, pc: 100 light-years, as far as the star catalogue lists every star
 * (the neighbourhood link frames the nearest of them).
 */
export const NEIGHBOURHOOD_PC = 100 / 3.261563777;

/** Where a root (a star, a star system's barycentre, a cluster or nebula) is, km from the Sun (world axes), if placed. */
function placeOf(root: BodyRecord): { x: number; y: number; z: number } | null {
  const e = entryOf(root.id);
  if (e && e.stamp >= 0) return e.state.pos;
  return null;
}

/** How far a root is from the Sun, pc. */
function distancePc(root: BodyRecord): number {
  const star = root.star ?? childrenOf(root.id).find((r) => r.star)?.star;
  if (star) return star.distancePc;
  if (root.deepSky?.distancePc !== undefined) return root.deepSky.distancePc;
  const p = placeOf(root);
  return p ? Math.hypot(p.x, p.y, p.z) / PARSEC_KM : 0;
}

/** The spiral arm a root is in, as a crumb, where one can be named. */
function armCrumb(root: BodyRecord | undefined): Crumb[] {
  const p = root ? placeOf(root) : { x: 0, y: 0, z: 0 };
  if (!p) return [];
  const kpc = 1000 * PARSEC_KM;
  const arm = armAt(apply(WORLD_TO_GAL, [p.x / kpc, p.y / kpc, p.z / kpc]));
  return arm ? [{ label: arm.name, galactic: true }] : [];
}

/**
 * The region a body is in: the Galaxy's levels, then the stars around the Sun (for the Solar
 * System and anything within 100 light-years) and the Solar System (a link) or a star system.
 */
function region(id: BodyId): Crumb[] {
  const root = rootOf(id);
  const home = cosmicCrumbs('local-group');
  if (!root || root.id === 'sun') return [...home, milkyWay(), ...armCrumb(undefined), NEIGHBOURHOOD, { label: 'Solar System', to: 'solar-system' }];
  // The Milky Way heads its own trail (and its satellites'), under the Local Group.
  if (root.id === 'milky-way') return home;
  // The Local Group heads its own trail too, in the local universe.
  if (root.id === 'local-group') return cosmicCrumbs('local-universe');
  // Other galaxies, groups and clusters of galaxies: the levels of the universe they are in.
  // A merger heard in gravitational waves lies among the galaxies, as they do.
  if (root.kind === 'galaxy' || root.kind === 'merger' || (root.kind === 'cluster' && /galaxies/.test(root.kindText ?? ''))) return cosmicCrumbs(cosmicLevel(root));
  // A nebula in another galaxy (the Tarantula in the Large Magellanic Cloud): under that galaxy.
  const host = root.deepSky?.hostGalaxy;
  if (host) {
    const galaxy = bodyNamed(host);
    return galaxy ? [...region(galaxy.id), ...lineage(galaxy.id).map((r): Crumb => ({ label: r.name, to: r.id }))] : [...home, { label: host, galactic: true }];
  }
  const galaxy = [...home, milkyWay(), ...armCrumb(root)];
  const around = distancePc(root) <= NEIGHBOURHOOD_PC ? [...galaxy, NEIGHBOURHOOD] : galaxy;
  // A star system's barycentre names the system ("Alpha Centauri"); a single star is its own.
  if (root.kind === 'barycentre') return [...around, { label: root.name }];
  return around;
}

/** A registered galaxy by its name (a nebula names the galaxy it is in). */
function bodyNamed(name: string): BodyRecord | undefined {
  return bodyRecords().find((r) => r.kind === 'galaxy' && r.name === name);
}

/**
 * A body placed on its parent's own barycentre orbits the whole pair (Kepler-16 (AB) b about
 * Kepler-16 A and B): its trail goes from the system to it, not through one of the stars.
 */
function orbitsPair(r: BodyRecord): boolean {
  return !!r.centre && !!r.parent && r.centre !== r.parent && getBody(r.parent)?.parent === r.centre;
}

/**
 * The breadcrumb for the camera's state: its target and what it orbits in orbit; the target's
 * surroundings in free flight; in Roam, the surroundings of the nearest thing that matters (`focus` is
 * then that thing, or null for a star of the catalogue that is not a body); the destination in flight;
 * near a black hole, the fall into it, the circular orbit round it or the snapshot held above it.
 */
export function locationPath(mode: ControlMode, focus: BodyId | null, dest: BodyId | null = null): Crumb[] {
  if (mode === 'travel' && dest) return [...region(dest), { label: `Flying to ${bodyName(dest)}` }];
  if (mode === 'roam') return focus ? [...region(focus), { label: `Roaming near ${bodyName(focus)}` }] : [...cosmicCrumbs('local-group'), milkyWay(), { label: 'Roaming among the stars' }];
  if (!focus) return [];
  if (mode === 'free') return [...region(focus), { label: 'Free flight' }];
  if (mode === 'fall') return [...region(focus), { label: `Falling into ${bodyName(focus)}` }];
  if (mode === 'circular') return [...region(focus), { label: `In orbit round ${bodyName(focus)}` }];
  if (mode === 'hold') return [...region(focus), { label: `Hovering above ${bodyName(focus)}` }];
  // The Sun heads its own region's trail only when it is the target ("Solar System › Sun").
  const chain = lineage(focus).filter((r, i, all) => !(r.id === 'sun' && i < all.length - 1) && !(i === all.length - 2 && orbitsPair(all[i + 1])));
  return [...region(focus), ...chain.map((r): Crumb => ({ label: r.name, to: r.id, galactic: r.id === 'milky-way' || undefined }))];
}
