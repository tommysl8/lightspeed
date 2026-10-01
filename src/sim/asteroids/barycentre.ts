/**
 * The Solar System's barycentre seen from the Sun, for the small bodies whose orbits are fitted about it (perihelion
 * beyond 7 au: the Centaurs, the Kuiper belt, comets far out), from astronomy-engine's planetary theories, as
 * sim/voyager.ts takes it.
 */
import { Body, HelioState, MakeTime } from 'astronomy-engine';
import { BARY_MU, conicFromState, conicPosition, conicVelocity, type Conic, type Vec3Out } from './conic.ts';

const EPS = (23.4392911 * Math.PI) / 180; // the J2000 obliquity: equatorial → ecliptic
const C = Math.cos(EPS);
const S = Math.sin(EPS);

/** The barycentre from the Sun at `jd` (TDB), J2000 ecliptic au and au/day. */
export function barycentreState(jd: number): { r: Vec3Out; v: Vec3Out } {
  const st = HelioState(Body.SSB, MakeTime(jd - 2451545.0));
  return {
    r: { x: st.x, y: st.y * C + st.z * S, z: -st.y * S + st.z * C },
    v: { x: st.vx, y: st.vy * C + st.vz * S, z: -st.vy * S + st.vz * C },
  };
}

/**
 * A heliocentric conic (times in days after `refJd`) re-fitted about the barycentre from its state at `epochJd`: the
 * same body at that moment, moving afterwards about the centre of mass of the Sun and planets, with their mass.
 */
export function toBarycentric(helio: Conic, epochJd: number, refJd: number): Conic {
  const t = epochJd - refJd;
  const r = conicPosition(helio, t, { x: 0, y: 0, z: 0 });
  const v = conicVelocity(helio, t, { x: 0, y: 0, z: 0 });
  const s = barycentreState(epochJd);
  return conicFromState({ x: r.x - s.r.x, y: r.y - s.r.y, z: r.z - s.r.z }, { x: v.x - s.v.x, y: v.y - s.v.y, z: v.z - s.v.z }, t, BARY_MU);
}
