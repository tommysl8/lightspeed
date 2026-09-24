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
}

export type SizeMode = 'true' | 'visible';

function makeBody(id: BodyId): BodyState {
  return {
    id,
    pos: new Vector3(),
    vel: new Vector3(),
    quat: new Quaternion(),
    apparentPos: new Vector3(),
    apparentQuat: new Quaternion(),
    lightDelay: 0,
    distTrue: Infinity,
    distCamera: Infinity,
    distSun: 0,
    displayRadius: 0,
    radiusPx: 0,
    dopplerFactor: 1,
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
