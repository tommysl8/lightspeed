/**
 * Where a nebula's picture goes in space (scene/Nebulae.tsx draws it): a card at the nebula's
 * distance and true size, facing the Sun, turned as the picture is on the sky.
 */
import { apply, GAL_TO_WORLD, type Vec3 } from './frames';
import type { NebulaJson } from './records';
import { equatorialToEcliptic, skyBasis } from '../stars/frames';
import { aberrateToShipRapidity, lnDopplerFromRestDir } from '../../physics/relativity';
import type { Vec3 as XYZ } from '../../physics/vec';

const toWorld = (ecl: Vec3): Vec3 => [ecl[0], ecl[2], -ecl[1]];

/** A card's fixed geometry: its centre (pc from the Sun), its half-extents and its normal, world axes. */
export interface NebulaCard {
  json: NebulaJson;
  centre: Vec3;
  right: Vec3;
  up: Vec3;
  normal: Vec3;
  /** Half the card's diagonal, pc. */
  radiusPc: number;
}

/**
 * Where a picture goes: centred on the image's centre at the nebula's distance, its plane facing
 * the Sun, image-up turned northAngleDeg clockwise from celestial north as seen from the Sun, east
 * 90° anticlockwise from north (not mirrored).
 */
export function nebulaCard(n: NebulaJson): NebulaCard {
  const b = n.billboard;
  const centre = apply(GAL_TO_WORLD, b.helioGalacticPc);
  const { east, north } = skyBasis(b.centerRaDeg, b.centerDecDeg);
  const E = toWorld(equatorialToEcliptic(east));
  const N = toWorld(equatorialToEcliptic(north));
  const th = (b.northAngleDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const up: Vec3 = [0, 1, 2].map((k) => (c * N[k] - s * E[k]) * (b.heightPc / 2)) as Vec3;
  const right: Vec3 = [0, 1, 2].map((k) => (-c * E[k] - s * N[k]) * (b.widthPc / 2)) as Vec3;
  const r = Math.hypot(centre[0], centre[1], centre[2]);
  return { json: n, centre, right, up, normal: [centre[0] / r, centre[1] / r, centre[2] / r], radiusPc: Math.hypot(b.widthPc, b.heightPc) / 2 };
}

/** The view a card is judged in: where the camera looks, and how wide. */
export interface CardView {
  /** Unit vector the camera looks along (world axes; the ship's frame in flight). */
  forward: XYZ;
  /** Half the angle across the view's diagonal, radians. */
  halfDiagonal: number;
  /** CSS pixels per radian at the centre of the view. */
  pxPerRad: number;
}

/** The ship's motion through space, when the view is relativistic. */
export interface CardMotion {
  velDir: XYZ;
  /** Rapidity. */
  phi: number;
}

const restDir: XYZ = { x: 0, y: 0, z: 0 };
const shipDir: XYZ = { x: 0, y: 0, z: 0 };

/**
 * How a card shows: its width in CSS pixels, and whether any of it is in the view. `rel` is the
 * card's centre from the camera and `radius` half its diagonal, in one unit. In flight the ship
 * sees the card where aberration puts it and 1/D times its angular size (its solid angle goes as
 * 1/D²): shrunk ahead, magnified astern.
 */
export function apparentCard(rel: Vec3, radius: number, view: CardView, motion: CardMotion | null): { px: number; inView: boolean } {
  const d = Math.hypot(rel[0], rel[1], rel[2]);
  if (d <= radius) return { px: 1e4, inView: true };
  restDir.x = rel[0] / d;
  restDir.y = rel[1] / d;
  restDir.z = rel[2] / d;
  let angle = Math.asin(radius / d);
  let dir = restDir;
  if (motion && motion.phi !== 0) {
    angle *= Math.exp(-lnDopplerFromRestDir(restDir, motion.velDir, motion.phi));
    dir = aberrateToShipRapidity(restDir, motion.velDir, motion.phi, shipDir);
  }
  const c = dir.x * view.forward.x + dir.y * view.forward.y + dir.z * view.forward.z;
  const off = Math.acos(Math.max(-1, Math.min(1, c)));
  return { px: 2 * Math.tan(Math.min(angle, 1.5)) * view.pxPerRad, inView: off < view.halfDiagonal + angle };
}
