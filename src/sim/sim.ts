/**
 * The simulation core: plain mutable state updated every frame, outside React.
 *
 * Everything positional is float64 kilometres in the world frame (see frames.ts). Nothing
 * here is sent to the GPU as-is: the renderer subtracts the camera position first
 * (floating origin), so the GPU only ever sees camera-relative coordinates.
 */
import { Quaternion, Vector3 } from 'three';
import { MakeTime, type AstroTime } from 'astronomy-engine';
import { BODY_ORDER, type BodyId } from '../physics/constants';

export interface ScreenPoint {
  /** CSS pixels from the top-left of the canvas. */
  x: number;
  y: number;
  /** In front of the camera and inside the viewport (with margin). */
  onScreen: boolean;
  /** In front of the camera. */
  inFront: boolean;
}

export interface BodyState {
  id: BodyId;
  /** World position, km (float64). */
  pos: Vector3;
  /** Velocity in the Sun's rest frame, km/s. */
  vel: Vector3;
  /** Orientation: body-fixed frame (x = prime meridian, y = north pole) → world. */
  quat: Quaternion;
  /** Distance to the camera, km. */
  distCamera: number;
  /** Distance to the Sun, km. */
  distSun: number;
  /** Radius actually drawn (true, or inflated in "visible" mode), km. */
  displayRadius: number;
  /** Displayed radius on screen, CSS px. */
  radiusPx: number;
  /** Apparent visual magnitude from the camera (for the point-sprite glint). */
  magnitude: number;
  screen: ScreenPoint;
}

export type SizeMode = 'true' | 'visible';

function makeBody(id: BodyId): BodyState {
  return {
    id,
    pos: new Vector3(),
    vel: new Vector3(),
    quat: new Quaternion(),
    distCamera: Infinity,
    distSun: 0,
    displayRadius: 0,
    radiusPx: 0,
    magnitude: 99,
    screen: { x: 0, y: 0, onScreen: false, inFront: false },
  };
}

export const sim = {
  /** Simulation time, ms since the Unix epoch (UTC). */
  timeMs: Date.now(),
  /** Time-warp factor (simulated seconds per real second). */
  warp: 1,
  paused: false,
  astroTime: MakeTime(new Date()) as AstroTime,

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
  },

  bodies: Object.fromEntries(BODY_ORDER.map((id) => [id, makeBody(id)])) as Record<BodyId, BodyState>,

  sizeMode: 'true' as SizeMode,

  /** Canvas size in CSS pixels. */
  viewport: { width: 1, height: 1 },

  /** Increments every frame; handy for throttled readers. */
  frame: 0,

  /** Development only: when > 0, overrides the real frame delta (seconds) for scripted stepping. */
  debugDt: 0,
};

export type Sim = typeof sim;

/** Seconds of simulated time since the J2000 epoch (TT), for the current frame. */
export function simTTSeconds(): number {
  return sim.astroTime.tt * 86_400;
}
