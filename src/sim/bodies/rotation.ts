/**
 * Rotation models: from a pole and a prime-meridian angle to the orientation of a body's mesh.
 *
 * Mesh axes: +X is the prime meridian, +Y the north pole, −Z longitude 90° E (three.js
 * SphereGeometry with an equirectangular map centred on longitude 0). IAU convention: the pole
 * is at (α₀, δ₀) in the ICRF and the prime meridian lies W degrees east of the node
 * Q = (−sin α₀, cos α₀, 0) where the body's equator crosses the ICRF equator.
 */
import type { AstroTime } from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { eqjToWorld } from '../frames';
import type { IauRotationSpec, RelativeState, RotationProvider, RotationSpec } from './types';

const DEG = Math.PI / 180;
const xb = new Vector3();
const yb = new Vector3();
const zb = new Vector3();
const q = new Vector3();
const basis = new Matrix4();

/** Orientation from a pole (right ascension and declination, radians, ICRF) and W (radians). */
export function orientationFromPole(ra: number, dec: number, W: number, out: Quaternion): Quaternion {
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

const poly = (c: readonly number[] | undefined, t: number) => (c ? (c[0] ?? 0) + (c[1] ?? 0) * t + (c[2] ?? 0) * t * t : 0);

/** α₀, δ₀ and W (degrees) of an IAU-style model at TT days `d` since J2000. */
export function iauAngles(spec: IauRotationSpec, d: number, out = { ra: 0, dec: 0, w: 0 }): { ra: number; dec: number; w: number } {
  const T = d / 36_525;
  let ra = poly(spec.poleRaDeg, T);
  let dec = poly(spec.poleDecDeg, T);
  let w = poly(spec.pmDeg, d);
  const angles = spec.phaseAngles?.angles;
  if (angles) {
    const n = angles.length;
    for (let i = 0; i < n; i++) {
      const a = spec.raTerms?.[i] ?? 0;
      const b = spec.decTerms?.[i] ?? 0;
      const c = spec.pmTerms?.[i] ?? 0;
      if (a === 0 && b === 0 && c === 0) continue;
      const th = poly(angles[i], T) * DEG;
      const s = Math.sin(th);
      ra += a * s;
      dec += b * Math.cos(th);
      w += c * s;
    }
  }
  out.ra = ra;
  out.dec = dec;
  // Wrap W before it becomes radians: keeps precision over millions of turns.
  out.w = ((w % 360) + 360) % 360;
  return out;
}

function iauRotation(spec: IauRotationSpec): RotationProvider {
  const a = { ra: 0, dec: 0, w: 0 };
  return {
    orientationAt(time: AstroTime, out: Quaternion) {
      iauAngles(spec, time.tt, a);
      return orientationFromPole(a.ra * DEG, a.dec * DEG, a.w * DEG, out);
    },
  };
}

/** Ecliptic north in ICRF: RA 270°, Dec 90° − ε. */
const ECLIPTIC_POLE_RA = 270;
const ECLIPTIC_POLE_DEC = 90 - 84_381.448 / 3600;

function spinRotation(periodH: number, poleRaDeg = ECLIPTIC_POLE_RA, poleDecDeg = ECLIPTIC_POLE_DEC, w0Deg = 0): RotationProvider {
  const rate = 360 / (periodH / 24); // degrees per day (negative period: retrograde)
  const period = Math.abs(periodH / 24);
  return {
    orientationAt(time: AstroTime, out: Quaternion) {
      // The fmod keeps huge spans exact.
      const w = w0Deg + ((time.tt % period) * rate);
      return orientationFromPole(poleRaDeg * DEG, poleDecDeg * DEG, (w % 360) * DEG, out);
    },
  };
}

const MESH_X = new Vector3(1, 0, 0);
const MESH_Y = new Vector3(0, 1, 0);
const qCone = new Quaternion();
const qSpin = new Quaternion();

/**
 * A non-principal-axis rotation, drawn as the simplest such motion: the body turns about its own
 * z axis (mesh +Y) every `periodH` while that axis sweeps a cone of half-angle `coneDeg` about
 * the pole (the angular momentum) every `precessionH`. As Euler angles about the pole: φ (the
 * precession), θ (the cone), ψ (the spin). Illustrative: for the tumblers this is used for, no
 * model predicts the orientation at a date.
 */
function tumbleRotation(periodH: number, precessionH: number, coneDeg: number, poleRaDeg = ECLIPTIC_POLE_RA, poleDecDeg = ECLIPTIC_POLE_DEC): RotationProvider {
  const spin = 360 / (periodH / 24);
  const prec = 360 / (precessionH / 24);
  const pSpin = Math.abs(periodH / 24);
  const pPrec = Math.abs(precessionH / 24);
  const cone = coneDeg * DEG;
  return {
    orientationAt(time: AstroTime, out: Quaternion) {
      const phi = ((time.tt % pPrec) * prec) % 360;
      const psi = ((time.tt % pSpin) * spin) % 360;
      // The pole frame turned by φ, then tilted by θ about its node (mesh +X) and spun by ψ
      // about the body's own axis (mesh +Y), each in the frame before.
      orientationFromPole(poleRaDeg * DEG, poleDecDeg * DEG, phi * DEG, out);
      qCone.setFromAxisAngle(MESH_X, cone);
      qSpin.setFromAxisAngle(MESH_Y, psi * DEG);
      return out.multiply(qCone).multiply(qSpin);
    },
  };
}

const sx = new Vector3();
const sy = new Vector3();
const sz = new Vector3();
const sm = new Matrix4();

/**
 * Tidally locked: mesh +X (the prime meridian) faces the body it orbits, +Y is the orbit
 * normal. Libration is left out.
 */
const synchronousRotation: RotationProvider = {
  usesOrbit: true,
  orientationAt(_time: AstroTime, out: Quaternion, rel: RelativeState | null) {
    if (!rel || rel.pos.lengthSq() === 0) return out.identity();
    sx.copy(rel.pos).negate().normalize(); // towards the parent
    sy.crossVectors(rel.pos, rel.vel); // orbit normal (north for a prograde orbit)
    if (sy.lengthSq() === 0) sy.set(0, 1, 0);
    sy.normalize();
    // Make +Y exactly perpendicular to +X, then +Z = X × Y (right-handed).
    sy.addScaledVector(sx, -sy.dot(sx)).normalize();
    sz.crossVectors(sx, sy);
    sm.makeBasis(sx, sy, sz);
    return out.setFromRotationMatrix(sm);
  },
};

/** The rotation provider for a record's spec (null: no rotation, identity). */
export function compileRotation(spec: RotationSpec | undefined): RotationProvider | null {
  if (!spec) return null;
  switch (spec.model) {
    case 'none':
      return null;
    case 'provider':
      return spec.provider;
    case 'synchronous':
      return synchronousRotation;
    case 'spin':
      if (!(spec.periodH !== 0 && Number.isFinite(spec.periodH))) throw new Error('rotation: spin needs a finite, non-zero periodH');
      return spinRotation(spec.periodH, spec.poleRaDeg, spec.poleDecDeg, spec.w0Deg);
    case 'tumble':
      if (!(spec.periodH !== 0 && Number.isFinite(spec.periodH) && spec.precessionH !== 0 && Number.isFinite(spec.precessionH)))
        throw new Error('rotation: tumble needs finite, non-zero periodH and precessionH');
      return tumbleRotation(spec.periodH, spec.precessionH, spec.coneDeg, spec.poleRaDeg, spec.poleDecDeg);
    case 'iau':
      return iauRotation(spec);
  }
}
