/**
 * Per-frame derived quantities: distances, displayed radii, screen positions and apparent
 * magnitudes. Runs after the ephemeris and the camera update, and before rendering.
 */
import { PerspectiveCamera, Quaternion, Vector3, Vector4 } from 'three';
import { AU_KM, BODIES, C_KM_S, SUN_VMAG_AT_1AU, type BodyId } from '../physics/constants';
import { sim } from './sim';

/** Minimum on-screen radius (CSS px) of bodies in "visible" mode. */
export const VISIBLE_MIN_RADIUS_PX = 4;

const rel = new Vector3();
const view = new Vector3();
const clip = new Vector4();
const invQ = new Quaternion();

/** Pixels per radian at the centre of the screen (vertical FOV based). */
export function pixelsPerRadian(): number {
  const fov = (sim.camera.fovDeg * Math.PI) / 180;
  return sim.viewport.height / 2 / Math.tan(fov / 2);
}

/** Lambert-sphere phase function Φ(α), normalised to 1 at full phase. */
function lambertPhase(alpha: number): number {
  return (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
}

export function updateDerived(camera: PerspectiveCamera): void {
  const pxPerRad = pixelsPerRadian();
  const minK = VISIBLE_MIN_RADIUS_PX / pxPerRad;
  const visible = sim.sizeMode === 'visible';
  const { width, height } = sim.viewport;
  invQ.copy(sim.camera.quat).invert();

  for (const b of Object.values(sim.bodies)) {
    const data = BODIES[b.id];
    rel.copy(b.pos).sub(sim.camera.pos); // float64 subtraction: the floating origin
    const d = rel.length();
    b.distCamera = d;
    b.distSun = b.pos.length();
    const rTrue = data.equatorialRadiusKm ?? data.radiusKm;
    b.displayRadius = visible ? Math.max(rTrue, minK * d) : rTrue;

    // Screen position
    view.copy(rel).applyQuaternion(invQ);
    b.screen.inFront = view.z < 0;
    clip.set(view.x, view.y, view.z, 1).applyMatrix4(camera.projectionMatrix);
    const w = clip.w !== 0 ? clip.w : 1e-9;
    b.screen.x = ((clip.x / w + 1) / 2) * width;
    b.screen.y = ((1 - clip.y / w) / 2) * height;
    b.screen.onScreen =
      b.screen.inFront && b.screen.x > -80 && b.screen.x < width + 80 && b.screen.y > -80 && b.screen.y < height + 80;

    b.magnitude = apparentMagnitude(b.id, d);
  }

  // Keep inflated bodies from swallowing each other: cap Earth and the Moon to a fraction of
  // their separation.
  if (visible) {
    const E = sim.bodies.earth;
    const M = sim.bodies.moon;
    const sep = E.pos.distanceTo(M.pos);
    E.displayRadius = Math.max(BODIES.earth.equatorialRadiusKm!, Math.min(E.displayRadius, 0.3 * sep));
    M.displayRadius = Math.max(BODIES.moon.radiusKm, Math.min(M.displayRadius, 0.15 * sep));
  }

  for (const b of Object.values(sim.bodies)) {
    b.radiusPx = b.distCamera > b.displayRadius ? Math.asin(b.displayRadius / b.distCamera) * pxPerRad : 1e4;
  }

  sim.ship.beta = Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999);
}

/**
 * Apparent V magnitude of a body seen from the camera: reflected sunlight from a Lambert
 * sphere with the body's geometric albedo. Close to real values (full Moon −12.7, Jupiter at
 * opposition −2.8). It only drives the point-like glint shown when a body is smaller than a pixel.
 */
export function apparentMagnitude(id: BodyId, distCameraKm: number): number {
  const b = sim.bodies[id];
  if (id === 'sun') return SUN_VMAG_AT_1AU + 5 * Math.log10(Math.max(distCameraKm, 1) / AU_KM);
  const data = BODIES[id];
  const p = data.geometricAlbedo ?? 0.3;
  const R = data.radiusKm;
  const r = b.pos.length();
  if (r === 0 || distCameraKm <= R) return -30;
  const toSun = rel.copy(b.pos).negate();
  const toCam = view.copy(sim.camera.pos).sub(b.pos);
  const cosA = toSun.dot(toCam) / (toSun.length() * toCam.length());
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const flux = p * (R / distCameraKm) ** 2 * Math.max(lambertPhase(alpha), 1e-6) * (AU_KM / r) ** 2;
  return SUN_VMAG_AT_1AU - 2.5 * Math.log10(flux);
}
