/**
 * The galaxies in an expanding universe: where they are at the clock's time, and what the camera
 * sees of them.
 *
 * Where they are (the bound/unbound rule). Every galaxy has an anchor, a comoving place (a = 1 at
 * the present, world axes): its own place if it takes part in the expansion; the centre of its
 * group or cluster if it is bound to one; home (the origin) for the members of the Local Group,
 * whose zero-velocity surface (0.96 Mpc about its barycentre, Karachentsev et al. 2009) bounds the
 * region where gravity has stopped the expansion. At the clock's time a galaxy at comoving place x
 * with anchor c is at a(t) c + (x − c) (world km; sim/cosmicTime.ts): the physical separations of
 * unbound galaxies grow with a, those inside a bound structure do not.
 *
 * What the camera sees (docs/data/cosmology.md, section 4). The camera's own comoving place is
 * home while it is inside the Local Group (the whole group is one bound structure, and the flight
 * planner flies there in static space), otherwise p / a(t). For a galaxy whose anchor lies χ
 * (comoving) from the camera's, the light arriving now left it when the universe had scale factor
 * a_e, with η(a_e) = η(a_o) − χ: its cosmological redshift is 1 + z = a_o / a_e, its surface
 * brightness is dimmed by (1 + z)⁻⁴ (Tolman), and a black body at T is seen at T / (1 + z). The
 * ship's own motion through the local comoving frame then Doppler shifts (factor D) and aberrates
 * that light as in special relativity (the renderer does it per particle), so the two compose:
 * ν_obs / ν_emit = D / (1 + z). These come from the emission table of the cosmology module (cubic
 * lookups, 5 × 10⁻⁸ in ln a), built in the cosmos worker; the cards take the exact functions.
 *
 * With light-delayed positions on, a galaxy is drawn where it was when the light now arriving left
 * it: at the proper distance it had then, a_e χ (the angular-diameter distance), along the comoving
 * direction, so its size on the sky is the one really seen. Otherwise it is drawn where it is now,
 * a_o χ away. Either way the light drawn is the light that reaches the camera.
 */
import { Vector3 } from 'three';
import { MPC_KM } from '../../physics/constants';
import { appearance, emissionLnAFast, type EmissionTable } from '../../physics/cosmology/appearance';
import { planck18 } from '../../physics/cosmology/cosmology';
import { LOCAL_GROUP, localGroupBarycentre } from '../../physics/cosmology/policy';
import { cosmicNow } from '../cosmicTime';
import { sim, type BodyState } from '../sim';
import type { Vec3 } from './frames';

/** The cosmology's emission table and the one number it needs besides: the conformal time from the Big Bang to the end of time, Mpc. */
export interface SkyTable {
  table: EmissionTable;
  etaInfMpc: number;
}

/**
 * The earliest galaxies seen shine 283 million years after the Big Bang (MoM-z14, Naidu et al.
 * 2026): before that, where galaxies were is not modelled, and those taking part in the expansion
 * are not shown.
 */
export const EARLIEST_GALAXIES_GYR = 0.283;

/** A body that takes part in the expansion (or is bound to a structure that does). */
export interface ExpansionMember {
  id: string;
  /** Its anchor: a comoving place, world axes, km at a = 1 (0 for the Local Group's members). */
  anchorKm: Vector3;
  /** Whether it is bound to the Local Group (its anchor is home). */
  home: boolean;
  /** ln(1 + z) of its light as the camera sees it now: 0 in the camera's own bound structure, Infinity beyond the particle horizon. */
  ln1pz: number;
  /** Comoving distance from the camera's anchor to its anchor, Mpc. */
  chiMpc: number;
}

/** The Local Group's zero-velocity surface: centre (world km, heliocentric) and radius (km). */
export const LOCAL_GROUP_SPHERE = (() => {
  const b = localGroupBarycentre();
  return { centreKm: new Vector3(b[0], b[2], -b[1]).multiplyScalar(MPC_KM), radiusKm: LOCAL_GROUP.zeroVelocityRadiusMpc * MPC_KM };
})();

/** Whether a world position (km, proper, at the clock's time) lies inside the Local Group's zero-velocity surface. */
export const insideLocalGroup = (p: Vector3): boolean => p.distanceTo(LOCAL_GROUP_SPHERE.centreKm) <= LOCAL_GROUP_SPHERE.radiusKm;

/** The camera, the epoch and the galaxies' light this frame (updateCosmicSky). */
export const cosmicSky = {
  /** The emission table (null until the cosmos worker has built it). */
  table: null as SkyTable | null,
  /** Scale factor, ln a and a − 1 at the clock's time. */
  a: 1,
  lnA: 0,
  am1: 0,
  /** The camera's comoving place: home inside the Local Group, else p / a (world axes, km at a = 1). */
  anchorKm: new Vector3(),
  /** The camera is inside the Local Group's zero-velocity surface. */
  inLocalGroup: true,
  /** Particle and event horizons of the camera's epoch, comoving Mpc, and ln a as the table gives it. */
  etaMpc: NaN,
  chiEHMpc: NaN,
  lnATable: 0,
  /** Galaxies drawn where they were when their light left (light-delayed positions on). */
  retarded: false,
  /** Galaxies taking part in the expansion are shown (the clock is after the earliest galaxies seen). */
  galaxiesShown: true,
  members: [] as ExpansionMember[],
  byId: new Map<string, ExpansionMember>(),
};

/** Give the galaxies' anchors (registerCosmos: once, when they are registered). */
export function setExpansionMembers(list: readonly { id: string; anchorWorldKm: Readonly<Vec3>; home: boolean }[]): void {
  for (const m of list) {
    const old = cosmicSky.byId.get(m.id);
    if (old) {
      old.anchorKm.set(m.anchorWorldKm[0], m.anchorWorldKm[1], m.anchorWorldKm[2]);
      old.home = m.home;
      continue;
    }
    const e: ExpansionMember = { id: m.id, anchorKm: new Vector3(m.anchorWorldKm[0], m.anchorWorldKm[1], m.anchorWorldKm[2]), home: m.home, ln1pz: 0, chiMpc: 0 };
    cosmicSky.members.push(e);
    cosmicSky.byId.set(m.id, e);
  }
}

/** The emission table has arrived (from the cosmos worker, or built here). */
export function setSkyTable(t: SkyTable): void {
  cosmicSky.table = t;
  horizonLnA = NaN;
}

let horizonLnA = NaN;

/**
 * The particle and event horizons (comoving Mpc) of an observer at ln a, from the table itself: the
 * table gives ln a as a function of v = ln(η / χ_EH), and η + χ_EH = η∞ at every epoch, so v is
 * found by bisection (the table's ln a rises with v). Consistent with the lookups that use it to
 * about 10⁻⁸ in ln(1 + z) at any epoch, including beyond the table (a > 10⁵), where it extrapolates.
 */
export function horizonsAt(t: SkyTable, lnA: number, out: { etaMpc: number; chiEHMpc: number; lnATable: number }): void {
  const inf = t.etaInfMpc;
  const at = (v: number) => emissionLnAFast(t.table, inf / (1 + Math.exp(-v)), inf / (1 + Math.exp(v)), 0);
  let lo = t.table.vMin - 1;
  let hi = t.table.vMax + 1;
  while (at(lo) > lnA && lo > -700) lo = 2 * lo - hi;
  while (at(hi) < lnA && hi < 700) hi = 2 * hi - lo;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); i++) {
    const v = 0.5 * (lo + hi);
    if (at(v) < lnA) lo = v;
    else hi = v;
  }
  const v = 0.5 * (lo + hi);
  out.etaMpc = inf / (1 + Math.exp(-v));
  out.chiEHMpc = inf / (1 + Math.exp(v));
  out.lnATable = at(v);
}

/** ln(1 + z) of a comoving source χ Mpc from the camera (this frame's horizons); Infinity beyond the particle horizon. */
export function ln1pzAt(chiMpc: number): number {
  const t = cosmicSky.table;
  if (!t || !(chiMpc > 0)) return 0;
  const l = emissionLnAFast(t.table, cosmicSky.etaMpc, cosmicSky.chiEHMpc, chiMpc);
  return l === -Infinity ? Infinity : Math.max(0, cosmicSky.lnATable - l);
}

const sep = new Vector3();

/**
 * Each frame, after the apparent positions and before the derived quantities: the epoch, the
 * camera's comoving place and horizons, each galaxy's redshift, and with light-delayed positions on,
 * where each is drawn (its place when the light left).
 */
export function updateCosmicSky(retarded: boolean): void {
  const s = cosmicSky;
  const c = cosmicNow();
  s.a = c.a;
  s.lnA = c.lnA;
  s.am1 = c.am1;
  s.retarded = retarded;
  s.galaxiesShown = c.ageGyr >= EARLIEST_GALAXIES_GYR;
  const p = sim.camera.pos;
  s.inLocalGroup = insideLocalGroup(p);
  if (s.inLocalGroup) s.anchorKm.set(0, 0, 0);
  else s.anchorKm.copy(p).divideScalar(c.a);
  const t = s.table;
  if (t && c.lnA !== horizonLnA) {
    horizonsAt(t, c.lnA, s);
    horizonLnA = c.lnA;
  }
  const list = s.members;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const b: BodyState | undefined = sim.bodies[m.id];
    if (!b) continue;
    sep.copy(m.anchorKm).sub(s.anchorKm);
    const chi = sep.length() / MPC_KM;
    m.chiMpc = chi;
    // Inside the camera's own bound structure (the Local Group seen from home): no expansion between.
    const L = chi > 1e-9 ? ln1pzAt(chi) : 0;
    m.ln1pz = L;
    if (retarded && L > 0 && L < Infinity) {
      // Where it was when the light left: a_e (x_anchor − x_camera) + its own offset, i.e. its place
      // now moved back along the comoving direction by (a_o − a_e) χ.
      b.apparentPos.copy(b.pos).addScaledVector(sep, c.a * Math.expm1(-L));
    }
  }
}

/**
 * The flux law of the extragalactic shaders (galaxies.vert.glsl, cosmicWeb.vert.glsl), as ln of the
 * visible flux relative to a static universe with the source at the distance drawn. The light that
 * arrives is a black body at T seen at T e^(lnD − L) (lnD: the ship's Doppler factor, L = ln(1 + z)),
 * and `dLnY` is ln of that black body's visible radiance over the one at T. The solid angle scales as
 * D⁻² (aberration) and (1 + z)² (the angular-diameter distance a_e χ against a_o χ); drawn where its
 * light left it (a_e χ away) rather than where it is now, (a_e / a_o)² = e^(−2L) of that. With the
 * bolometric radiance (dLnY = 4 (lnD − L)) it is the module's D² L / (4π D_L²) (the tests check it).
 */
export const lnFluxRelative = (dLnY: number, lnD: number, L: number, drawnWhereItWas: boolean): number =>
  dLnY - 2 * (lnD - L) - (drawnWhereItWas ? 2 * L : 0);

/** ln(1 + z) of a body's light seen from the camera this frame (0 if it is not a galaxy, or shares the camera's bound structure). */
export const galaxyLn1pz = (id: string): number => cosmicSky.byId.get(id)?.ln1pz ?? 0;

/**
 * ln(1 + z) of home (the Local Group: the Milky Way, the Sun, the stars) as the camera sees it: 0
 * inside the Local Group. For the layers drawn about home, seen from beyond it.
 */
export function homeLn1pz(): number {
  if (cosmicSky.inLocalGroup) return 0;
  return ln1pzAt(cosmicSky.anchorKm.length() / MPC_KM);
}

// ─── Exact numbers for the cards ─────────────────────────────────────────────────────────

export interface CosmicSight {
  /** Cosmological redshift of the light arriving now. */
  z: number;
  /** How long ago (cosmic time) the light left, and the universe's age then, Gyr. */
  lookbackGyr: number;
  emitAgeGyr: number;
  /** Proper distance now and when the light left (the angular-diameter distance), Mpc. */
  properNowMpc: number;
  properThenMpc: number;
  /** None of its light has reached the camera yet (beyond the particle horizon). */
  beyond: boolean;
}

/**
 * What the camera sees of a galaxy now, from the exact functions of the cosmology module (the
 * model is built on first use, about 40 ms): null for bodies that are not galaxies, or that share
 * the camera's bound structure.
 */
export function cosmicSight(id: string): CosmicSight | null {
  const m = cosmicSky.byId.get(id);
  if (!m || !(m.chiMpc > 1e-9)) return null;
  const app = appearance(planck18(), cosmicSky.a, m.chiMpc);
  if (app.hidden === 'beyond-particle-horizon') {
    return { z: Infinity, lookbackGyr: NaN, emitAgeGyr: NaN, properNowMpc: app.properDistanceNowMpc, properThenMpc: NaN, beyond: true };
  }
  return {
    z: app.z,
    lookbackGyr: app.lookbackGyr,
    emitAgeGyr: app.emitTimeGyr,
    properNowMpc: app.properDistanceNowMpc,
    properThenMpc: app.properDistanceThenMpc,
    beyond: false,
  };
}
