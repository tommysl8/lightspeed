/**
 * Where a nebula's picture goes in space (scene/Nebulae.tsx draws it): a card at the nebula's
 * distance and true size, facing the Sun, turned as the picture is on the sky. Near a black hole
 * the picture is drawn where the hole's lens puts it (shaders/nebula.vert.glsl, each vertex at its
 * primary image), and apparentCard follows it with the same lens on the CPU (physics/lensPoint.ts
 * pointImageTier1 of the card's centre, its size times the lens's tangential stretch), so the credit
 * line and the picture's loading go with the picture as drawn.
 */
import { apply, GAL_TO_WORLD, type Vec3 } from './frames';
import type { NebulaJson } from './records';
import { equatorialToEcliptic, skyBasis } from '../stars/frames';
import { aberrateToShipRapidity, lnDopplerFromRestDir } from '../../physics/relativity';
import { pointImageTier1, type PointImage } from '../../physics/lensPoint';
import type { InverseTable } from '../../physics/schwarzschildTables';
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

/** A black hole's lens, as the cards need it (render/lens/lensState.ts's lens this frame). */
export interface CardLens {
  inv: InverseTable;
  /** Camera → hole, world axes, units of M. */
  holeM: XYZ;
  /** Units of M per unit of the card's `rel` (pc). */
  mPerUnit: number;
  /** Device px per rad (the tier-1 pass counts). */
  pxPerRad: number;
}

const restDir: XYZ = { x: 0, y: 0, z: 0 };
const shipDir: XYZ = { x: 0, y: 0, z: 0 };
const srcM: XYZ = { x: 0, y: 0, z: 0 };
const image: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };

/**
 * How a card shows: its width in CSS pixels, and whether any of it is in the view. `rel` is the
 * card's centre from the camera and `radius` half its diagonal, in one unit. In flight the ship
 * sees the card where aberration puts it and 1/D times its angular size (its solid angle goes as
 * 1/D²): shrunk ahead, magnified astern. Near a black hole (`lensed`) the card's centre goes to its
 * primary image and its size grows by the lens's tangential stretch, sin α/sin ψ (the image's and the
 * straight line's angles from the hole: the lens keeps each circle about the hole a circle); a card
 * that holds the hole's direction reaches round its Einstein ring.
 */
export function apparentCard(rel: Vec3, radius: number, view: CardView, motion: CardMotion | null, lensed: CardLens | null = null): { px: number; inView: boolean } {
  const d = Math.hypot(rel[0], rel[1], rel[2]);
  if (d <= radius) return { px: 1e4, inView: true };
  restDir.x = rel[0] / d;
  restDir.y = rel[1] / d;
  restDir.z = rel[2] / d;
  let angle = Math.asin(radius / d);
  if (lensed && lensed.inv.thetaE > 0) {
    const k = lensed.mPerUnit;
    srcM.x = rel[0] * k;
    srcM.y = rel[1] * k;
    srcM.z = rel[2] * k;
    pointImageTier1(lensed.inv, lensed.holeM, srcM, 0, image, lensed.pxPerRad);
    if (image.ok) {
      const h = lensed.holeM;
      // The straight line's angle from the hole (chords: exact at small angles).
      const cx = restDir.y * h.z - restDir.z * h.y;
      const cy = restDir.z * h.x - restDir.x * h.z;
      const cz = restDir.x * h.y - restDir.y * h.x;
      const psi = Math.atan2(Math.hypot(cx, cy, cz), restDir.x * h.x + restDir.y * h.y + restDir.z * h.z);
      if (image.branch === 'outgoing') {
        if (psi <= angle) angle += lensed.inv.thetaE;
        else angle *= Math.min(1e3, Math.sin(image.alpha) / Math.max(Math.sin(psi), 1e-300));
      }
      restDir.x = image.dir.x;
      restDir.y = image.dir.y;
      restDir.z = image.dir.z;
    }
  }
  let dir = restDir;
  if (motion && motion.phi !== 0) {
    angle *= Math.exp(-lnDopplerFromRestDir(restDir, motion.velDir, motion.phi));
    dir = aberrateToShipRapidity(restDir, motion.velDir, motion.phi, shipDir);
  }
  const c = dir.x * view.forward.x + dir.y * view.forward.y + dir.z * view.forward.z;
  const off = Math.acos(Math.max(-1, Math.min(1, c)));
  return { px: 2 * Math.tan(Math.min(angle, 1.5)) * view.pxPerRad, inView: off < view.halfDiagonal + angle };
}
