/**
 * The simulation core: plain mutable state updated every frame, outside React.
 *
 * Everything positional is float64 kilometres in the world frame (see frames.ts). Nothing
 * here is sent to the GPU as-is: the renderer subtracts the camera position first
 * (floating origin), so the GPU only ever sees camera-relative coordinates.
 */
import { Quaternion, Vector3 } from 'three';
import type { AstroTime } from 'astronomy-engine';
import type { BodyId, Regime } from './bodies/types';
import type { ImageOrder } from '../physics/lensPoint';
import { astroTimeAt } from '../lib/time';

export interface ScreenPoint {
  /** CSS pixels from the top-left of the canvas. */
  x: number;
  y: number;
  /** In front of the camera and inside the viewport (with margin). */
  onScreen: boolean;
  /** In front of the camera. */
  inFront: boolean;
}

/**
 * A screen point that is written every frame (a body's, an image's). A class rather than a { x, y, … } literal:
 * a literal shares V8's field layout with every object in the app whose first property is x, and once any of
 * them has held something other than a number there, every number stored into it is boxed (a 16-byte
 * allocation per store, per body, per frame); a class has a layout of its own.
 */
export class ScreenPos implements ScreenPoint {
  x = 0;
  y = 0;
  onScreen = false;
  inFront = false;
}

export interface BodyState {
  id: BodyId;
  /**
   * Whether the body exists and is modelled at this date (Voyager 1 only after its 1980 Saturn
   * flyby). Absent bodies are not drawn, labelled, picked or targeted.
   */
  present: boolean;
  /** How good its position is at this date (see bodies/types.ts). */
  regime: Regime;
  /** World position, km (float64). */
  pos: Vector3;
  /** Velocity in the Sun's rest frame, km/s. */
  vel: Vector3;
  /** Orientation: body-fixed frame (x = prime meridian, y = north pole) → world. */
  quat: Quaternion;
  /**
   * Where the body is drawn: its true position, or (with light-delayed rendering on) where it
   * was when the light now reaching the camera left it.
   */
  apparentPos: Vector3;
  apparentQuat: Quaternion;
  /** Light-travel time from the body to the camera, s (0 when not computed). */
  lightDelay: number;
  /** True (instantaneous) distance to the camera, km. */
  distTrue: number;
  /** Distance from the camera to where the body is drawn, km. */
  distCamera: number;
  /** Distance to the Sun, km. */
  distSun: number;
  /** Radius actually drawn (true, or inflated in "visible" mode), km. */
  displayRadius: number;
  /** Displayed radius on screen, CSS px. */
  radiusPx: number;
  /** Doppler factor of its light in the relativistic view (1 otherwise). */
  dopplerFactor: number;
  /** Apparent visual magnitude from the camera (for the point-sprite glint). */
  magnitude: number;
  screen: ScreenPoint;
  /** Its images through a black hole's lens this frame (sim/lensBodies.ts), or null: not lensed, drawn as it is. */
  lens: BodyLens | null;
}

/** Images a body can have through the lens at once: the primary and two more. */
export const MAX_BODY_IMAGES = 3;

/**
 * One image of a body seen through a black hole's lens (sim/lensBodies.ts writes it; the glints, labels,
 * picking and the hover tag read it).
 */
export interface BodyImage {
  order: ImageOrder;
  /** CSS px, as BodyState.screen (in the half of the split view it lands in). */
  screen: ScreenPoint;
  /**
   * Apparent V magnitude of this image: magnification, the finite-source cap, the gravitational shifts, the
   * frame boost and the source's own motion included; like BodyState.magnitude, the view observer's own
   * motion is left to where the image is drawn (the glint shader, BodyState.dopplerFactor).
   */
  magnitude: number;
  /** ln|μ| of the point source (no finite-source cap). */
  lnMu: number;
  /** ln of the total frequency factor (frame boost, lens, the source's own motion and potential, the view observer) for the colour. */
  lnD: number;
  /** The view observer's own part of lnD (its motion relative to the Sun's frame, or to the lens frame in a fall). */
  lnDView: number;
  /** lnD without the view observer's part: what the glint shader adds to its own aberration (aLnDx). */
  lnDx: number;
  /**
   * The flat-space magnitude with the magnification (ln μB0) and the shifts that change no solid angle (ln g, the
   * source's own motion) folded in, before any spectral shift: the glint's aMag.
   */
  magLensed: number;
  /** Unit direction of the image in the frame the glints are drawn in: the Sun's (outside a fall), the lens frame (in a fall). */
  dir: Vector3;
  /** Unit direction of the image in the lens frame (hovering, or falling from rest), world axes: the lab's readings. */
  dirLens: Vector3;
  /** Share of the image drawn as a point: 1, less while the ring of a near-perfect alignment fades in (z 3.5 → 2.5). */
  share: number;
}

/** A near-perfect alignment drawn as an arc or ring of light (scene/LensRings.tsx). */
export interface LensRing {
  /** Unit direction of the ring's centre (the lensing hole's shadow centre) in the view observer's frame. */
  centre: Vector3;
  /** Ring radius, rad. */
  radius: number;
  /** Unit direction, in the sky, of the primary arc's middle (towards the source). */
  towards: Vector3;
  /** Half-angle of each arc about its middle, rad (π: a full ring). */
  arcHalf: number;
  /** Apparent V magnitude of all the light in the ring (the view observer's own motion included: the ring is drawn as seen). */
  magnitude: number;
  lnT: number;
  lnD: number;
  /** Share of the light drawn as the ring: 0 at z ≥ 3.5, 1 at z ≤ 2.5 (the two images' glints take the rest). */
  share: number;
  /** The half of the split view it is drawn in (1: the whole view, or the relativistic half). */
  half: 0 | 1;
}

/** A body's images this frame. */
export interface BodyLens {
  /** Images drawn (1–3); images[0] is the primary, whose screen point is also BodyState.screen. */
  count: number;
  /** Reused slots (nothing is allocated per frame): only the first `count` are this frame's; the rest are left over from earlier frames. */
  images: BodyImage[];
  ring: LensRing | null;
}

export type SizeMode = 'true' | 'visible';

/** A fresh state for a body (the registry makes one per registered body). */
export function makeBody(id: BodyId): BodyState {
  return {
    id,
    present: true,
    regime: 'precise',
    pos: new Vector3(),
    vel: new Vector3(),
    quat: new Quaternion(),
    apparentPos: new Vector3(),
    apparentQuat: new Quaternion(),
    lightDelay: 0,
    distTrue: 0,
    distCamera: Infinity,
    distSun: 0,
    displayRadius: 0,
    radiusPx: 0,
    dopplerFactor: 1,
    magnitude: 99,
    screen: new ScreenPos(),
    lens: null,
  };
}

const startMs = Date.now();

export const sim = {
  /**
   * Simulation time, ms since the Unix epoch (UTC), as a plain float64 for any date from the Big
   * Bang to 10¹³ years ahead. Never turn it into a Date: see lib/time.ts.
   */
  timeMs: startMs,
  /**
   * Sub-resolution remainder of the clock (ms). Far from 1970 a float64 resolves seconds or hours,
   * so small steps are carried here until they add up (Kahan summation; see clock.ts).
   */
  timeCarryMs: 0,
  /** Time-warp factor (simulated seconds per real second). */
  warp: 1,
  paused: false,
  /**
   * The clock shows the present: true at start-up and after "Now", false once anything takes it
   * off real time (a pause, another rate, a date, a trip). While live the clock follows the
   * computer's clock instead of adding up frame times, which the browser clamps or stops (a
   * hidden tab, a reading page over the view, a slow frame), so it cannot fall behind.
   */
  live: true,
  astroTime: astroTimeAt(startMs) as AstroTime,

  camera: {
    /** World position, km (float64). */
    pos: new Vector3(),
    /** Orientation (three.js convention: looks down its local −Z). */
    quat: new Quaternion(),
    fovDeg: 50,
  },

  /** The observer's motion in the Sun's rest frame (used for relativistic effects). */
  ship: {
    vel: new Vector3(),
    beta: 0,
    /**
     * Rapidity φ = artanh(v/c), exact at any γ (set each frame by shipKinematics.ts). On a trip it
     * comes from the trip's closed form: at γ = 10⁹, |vel| has rounded to c but φ is still exact.
     * NaN during the fictional faster-than-light warp.
     */
    phi: 0,
  },

  /**
   * Apparent size of the Solar System out to 100 au, px (Infinity from inside it; see derived.ts). Below
   * a pixel its km-scale layers are hidden: they are invisible, and float32 on the GPU cannot
   * hold their camera-relative positions anyway (it overflows beyond ~10¹⁹ km).
   */
  solarSystemPx: Infinity,

  /**
   * Every registered body's state, by id (filled by the body registry, sim/bodies/registry.ts).
   * An id that is not registered gives undefined. Iterate `bodyList`, not this object.
   */
  bodies: Object.create(null) as Record<BodyId, BodyState>,

  /** The same states in the registry's order: parents before their children, the Sun outwards. */
  bodyList: [] as BodyState[],

  sizeMode: 'true' as SizeMode,

  /** Canvas size in CSS pixels. */
  viewport: { width: 1, height: 1 },

  /** Increments every frame; handy for throttled readers. */
  frame: 0,

  /** Development only: when > 0, overrides the real frame delta (seconds) for scripted stepping. */
  debugDt: 0,
};

export type Sim = typeof sim;

/** Set the simulation time outright (clearing the clock's carry) and the matching astronomy time. */
export function setSimTime(ms: number): void {
  sim.timeMs = ms;
  sim.timeCarryMs = 0;
  sim.astroTime = astroTimeAt(ms);
}

/** Seconds of simulated time since the J2000 epoch (TT), for the current frame. */
export function simTTSeconds(): number {
  return sim.astroTime.tt * 86_400;
}
