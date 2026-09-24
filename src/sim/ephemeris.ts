/**
 * Body positions, velocities and orientations from astronomy-engine (VSOP87 planets, a
 * numerical model for Pluto, and the IAU WGCCRE 2015 rotation models), converted to the
 * world frame in km and km/s. Voyager 1 comes from voyager.ts.
 */
import {
  Body,
  GeoMoonState,
  HelioState,
  HelioVector,
  RotationAxis,
  type AstroTime,
} from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { AU_KM, DAY_S, PROXIMA_DEC_DEG, PROXIMA_DISTANCE_KM, PROXIMA_RA_DEG, type BodyId } from '../physics/constants';
import { eqjToWorld, raDecToWorld } from './frames';
import { sim } from './sim';
import { voyagerHelioState } from './voyager';

const ENGINE_BODY: Partial<Record<BodyId, Body>> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

const AXIS_BODY: Partial<Record<BodyId, Body>> = {
  sun: Body.Sun,
  moon: Body.Moon,
  ...ENGINE_BODY,
};

const AU_PER_DAY_TO_KM_S = AU_KM / DAY_S;

const tmp = new Vector3();
const xb = new Vector3();
const yb = new Vector3();
const zb = new Vector3();
const q = new Vector3();
const basis = new Matrix4();

/** Proxima Centauri: fixed at its catalogue position (its 3.9″/yr proper motion is negligible here). */
const PROXIMA_POS = raDecToWorld(PROXIMA_RA_DEG, PROXIMA_DEC_DEG).multiplyScalar(PROXIMA_DISTANCE_KM);

/** Heliocentric world position of a body (km). Voyager and the Sun are handled too. */
export function bodyPositionAt(id: BodyId, time: AstroTime, out = new Vector3()): Vector3 {
  if (id === 'sun') return out.set(0, 0, 0);
  if (id === 'proxima') return out.copy(PROXIMA_POS);
  if (id === 'voyager1') return out.copy(voyagerHelioState(time).pos);
  if (id === 'moon') {
    const e = HelioVector(Body.Earth, time);
    const m = GeoMoonState(time);
    return eqjToWorld((e.x + m.x) * AU_KM, (e.y + m.y) * AU_KM, (e.z + m.z) * AU_KM, out);
  }
  const v = HelioVector(ENGINE_BODY[id]!, time);
  return eqjToWorld(v.x * AU_KM, v.y * AU_KM, v.z * AU_KM, out);
}

/**
 * Orientation of a body-fixed frame in world axes, for a mesh whose local +X is the prime
 * meridian, local +Y the north pole and local −Z longitude 90°E (three.js SphereGeometry's
 * UV layout with an equirectangular map centred on longitude 0).
 *
 * IAU convention: pole at (α₀, δ₀); the prime meridian sits W degrees east of the node Q where
 * the body's equator crosses the ICRF equator, Q = (−sin α₀, cos α₀, 0).
 */
export function bodyOrientation(id: BodyId, time: AstroTime, out = new Quaternion()): Quaternion {
  const body = AXIS_BODY[id];
  if (!body) return out.identity();
  const axis = RotationAxis(body, time);
  const ra = (axis.ra * 15 * Math.PI) / 180;
  const dec = (axis.dec * Math.PI) / 180;
  const W = (axis.spin * Math.PI) / 180;
  // In EQJ components:
  const zx = Math.cos(dec) * Math.cos(ra);
  const zy = Math.cos(dec) * Math.sin(ra);
  const zz = Math.sin(dec);
  const qx = -Math.sin(ra);
  const qy = Math.cos(ra);
  // x_b = Q cos W + (z × Q) sin W
  const cx = zy * 0 - zz * qy;
  const cy = zz * qx - zx * 0;
  const cz = zx * qy - zy * qx;
  const bx = qx * Math.cos(W) + cx * Math.sin(W);
  const by = qy * Math.cos(W) + cy * Math.sin(W);
  const bz = 0 * Math.cos(W) + cz * Math.sin(W);
  eqjToWorld(bx, by, bz, xb);
  eqjToWorld(zx, zy, zz, zb);
  yb.crossVectors(zb, xb); // 90°E in world
  // mesh local axes: +X → x_b, +Y → z_b (north), +Z → −y_b
  q.copy(yb).negate();
  basis.makeBasis(xb, zb, q);
  return out.setFromRotationMatrix(basis);
}

/** Update positions, velocities and orientations of every body for sim.astroTime. */
export function updateEphemeris(): void {
  const time = sim.astroTime;
  const B = sim.bodies;

  B.sun.pos.set(0, 0, 0);
  B.sun.vel.set(0, 0, 0);

  for (const id of Object.keys(ENGINE_BODY) as BodyId[]) {
    const s = HelioState(ENGINE_BODY[id]!, time);
    eqjToWorld(s.x * AU_KM, s.y * AU_KM, s.z * AU_KM, B[id].pos);
    eqjToWorld(s.vx * AU_PER_DAY_TO_KM_S, s.vy * AU_PER_DAY_TO_KM_S, s.vz * AU_PER_DAY_TO_KM_S, B[id].vel);
  }

  const m = GeoMoonState(time);
  eqjToWorld(m.x * AU_KM, m.y * AU_KM, m.z * AU_KM, tmp);
  B.moon.pos.copy(B.earth.pos).add(tmp);
  eqjToWorld(m.vx * AU_PER_DAY_TO_KM_S, m.vy * AU_PER_DAY_TO_KM_S, m.vz * AU_PER_DAY_TO_KM_S, tmp);
  B.moon.vel.copy(B.earth.vel).add(tmp);

  const v = voyagerHelioState(time);
  B.voyager1.pos.copy(v.pos);
  B.voyager1.vel.copy(v.vel);

  B.proxima.pos.copy(PROXIMA_POS);
  B.proxima.vel.set(0, 0, 0);

  for (const id of Object.keys(AXIS_BODY) as BodyId[]) bodyOrientation(id, time, B[id].quat);
}

/** Geocentric state of the Moon (km, km/s) in world axes — used for its orbit line. */
export function moonGeocentric(time: AstroTime): { r: Vector3; v: Vector3 } {
  const m = GeoMoonState(time);
  return {
    r: eqjToWorld(m.x * AU_KM, m.y * AU_KM, m.z * AU_KM),
    v: eqjToWorld(m.vx * AU_PER_DAY_TO_KM_S, m.vy * AU_PER_DAY_TO_KM_S, m.vz * AU_PER_DAY_TO_KM_S),
  };
}
