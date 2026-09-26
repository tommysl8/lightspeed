/**
 * Per-frame derived quantities: distances, displayed radii, screen positions and apparent
 * magnitudes. Runs after the ephemeris and the camera update, and before rendering.
 */
import { PerspectiveCamera, Quaternion, Vector3, Vector4 } from 'three';
import {
  AU_KM,
  BODIES,
  C_KM_S,
  PROXIMA_DISTANCE_KM,
  PROXIMA_VMAG,
  SUN_VMAG_AT_1AU,
  type BodyId,
} from '../physics/constants';
import { aberrateToShipRapidity, lnDopplerFromRestDir } from '../physics/relativity';
import type { Vec3 } from '../physics/vec';
import { relView } from '../render/relativisticView';
import { sim, type ScreenPoint } from './sim';

/** Minimum on-screen radius (CSS px) of bodies in "visible" mode. */
export const VISIBLE_MIN_RADIUS_PX = 4;

/**
 * Radius of the Solar System for deciding when it has shrunk below a pixel: 100 au, past the
 * Kuiper belt and Pluto's aphelion (49 au). Voyager 1 (170 au in 2026) is a speck long before.
 */
export const SOLAR_SYSTEM_RADIUS_KM = 100 * AU_KM;

/**
 * True once the whole Solar System spans less than a pixel (about 1.6 light-years away with a
 * 50° view on a 1,000 px screen). Its km-scale layers (belts, orbits, light pulses, labels) are
 * then hidden: invisible anyway, and float32 cannot hold their camera-relative positions
 * beyond ~10¹⁹ km.
 */
export const solarSystemHidden = (): boolean => sim.solarSystemPx < 1;

const rel = new Vector3();
const view = new Vector3();
const clip = new Vector4();

/** Pixels per radian at the centre of the screen (vertical FOV based). */
export function pixelsPerRadian(): number {
  const fov = (sim.camera.fovDeg * Math.PI) / 180;
  return sim.viewport.height / 2 / Math.tan(fov / 2);
}

const ab = new Vector3();
const inv = new Quaternion();
const dRest: Vec3 = { x: 0, y: 0, z: 0 };
const dShip: Vec3 = { x: 0, y: 0, z: 0 };

/** Project a camera-relative world vector to CSS-pixel screen coordinates. */
function project(v: Vector3, camera: PerspectiveCamera, out: ScreenPoint): void {
  const { width, height } = sim.viewport;
  inv.copy(sim.camera.quat).invert();
  view.copy(v).applyQuaternion(inv);
  out.inFront = view.z < 0;
  clip.set(view.x, view.y, view.z, 1).applyMatrix4(camera.projectionMatrix);
  const w = clip.w !== 0 ? clip.w : 1e-9;
  out.x = ((clip.x / w + 1) / 2) * width;
  out.y = ((1 - clip.y / w) / 2) * height;
  out.onScreen = out.inFront && out.x > -80 && out.x < width + 80 && out.y > -80 && out.y < height + 80;
}

/** Lambert-sphere phase function Φ(α), normalised to 1 at full phase. */
function lambertPhase(alpha: number): number {
  return (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
}

/**
 * `focus` and `selected` keep their labels when the Solar System has shrunk to a point (so you
 * still know what you are orbiting); every other label is hidden then.
 */
export function updateDerived(camera: PerspectiveCamera, focus?: BodyId, selected?: BodyId | null): void {
  const pxPerRad = pixelsPerRadian();
  const minK = VISIBLE_MIN_RADIUS_PX / pxPerRad;
  const { width } = sim.viewport;
  const dSun = sim.bodies.sun.pos.distanceTo(sim.camera.pos);
  sim.solarSystemPx = dSun > SOLAR_SYSTEM_RADIUS_KM ? (SOLAR_SYSTEM_RADIUS_KM / dSun) * pxPerRad : Infinity;
  const far = solarSystemHidden();
  // Inflating every planet to a visible disc would stack them all on one pixel: not from afar.
  const visible = sim.sizeMode === 'visible' && !far;

  for (const b of Object.values(sim.bodies)) {
    const data = BODIES[b.id];
    b.distTrue = b.pos.distanceTo(sim.camera.pos);
    rel.copy(b.apparentPos).sub(sim.camera.pos); // float64 subtraction: the floating origin
    const d = rel.length();
    b.distCamera = d;
    b.distSun = b.pos.length();
    const rTrue = data.equatorialRadiusKm ?? data.radiusKm;
    b.displayRadius = visible ? Math.max(rTrue, minK * d) : rTrue;

    // Screen position: where the body appears. In the relativistic view that is its aberrated
    // direction (and in split view, whichever half it lands in).
    project(rel, camera, b.screen);
    b.dopplerFactor = 1;
    if (relView.active) {
      const splitPx = relView.split ? relView.splitX * width : -Infinity;
      const naiveX = b.screen.x;
      if (!(relView.split && naiveX < splitPx)) {
        // Rapidity forms: exact at any γ (β has rounded to 1 long before γ = 10⁹).
        dRest.x = rel.x / d;
        dRest.y = rel.y / d;
        dRest.z = rel.z / d;
        aberrateToShipRapidity(dRest, relView.velDir, relView.phi, dShip);
        ab.set(dShip.x * d, dShip.y * d, dShip.z * d);
        project(ab, camera, b.screen);
        b.dopplerFactor = Math.exp(lnDopplerFromRestDir(dRest, relView.velDir, relView.phi));
        if (relView.split && b.screen.x < splitPx) b.screen.onScreen = false;
      }
    }

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
    // Aberration shrinks apparent sizes ahead (and enlarges them behind) by 1/D.
    if (b.dopplerFactor !== 1) b.radiusPx /= b.dopplerFactor;
    if (!b.present) {
      // Not there at this date: nothing to draw, label, pick or measure.
      b.radiusPx = 0;
      b.magnitude = 99;
      b.screen.onScreen = false;
      b.screen.inFront = false;
    } else if (far && b.id !== focus && b.id !== selected) {
      // Merged into one point with everything else: no label.
      b.screen.onScreen = false;
    }
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
  if (id === 'proxima') return PROXIMA_VMAG + 5 * Math.log10(Math.max(distCameraKm, 1) / PROXIMA_DISTANCE_KM);
  const data = BODIES[id];
  const p = data.geometricAlbedo ?? 0.3;
  const R = data.radiusKm;
  const r = b.apparentPos.length();
  if (r === 0 || distCameraKm <= R) return -30;
  const toSun = rel.copy(b.apparentPos).negate();
  const toCam = view.copy(sim.camera.pos).sub(b.apparentPos);
  const cosA = toSun.dot(toCam) / (toSun.length() * toCam.length());
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const flux = p * (R / distCameraKm) ** 2 * Math.max(lambertPhase(alpha), 1e-6) * (AU_KM / r) ** 2;
  return SUN_VMAG_AT_1AU - 2.5 * Math.log10(flux);
}
