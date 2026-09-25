/**
 * Light pulses for the time-of-flight experiment.
 *
 * A pulse leaves a fixed point in the Sun's rest frame (where its source was at emission) and
 * its front is a sphere of radius c(t − t₀). Every body carries a detector. When a front
 * passes a body between two frames, the exact crossing time is solved from the ephemeris
 * (physics/lightTime.pulseArrival), so time warp does not degrade the timing.
 */
import { Vector3 } from 'three';
import { BODIES, BODY_ORDER, C_KM_S, type BodyId } from '../physics/constants';
import { pulseArrival } from '../physics/lightTime';
import { bodyPositionAt } from './ephemeris';
import { sim } from './sim';

export interface Detection {
  pulse: number;
  body: BodyId;
  /** Simulation time of arrival, ms (Unix epoch). */
  atMs: number;
  /** Time of flight, s. */
  dt: number;
  /** Distance from the emission point to the body at arrival, km. */
  d: number;
}

export interface Pulse {
  id: number;
  /** Emission time, ms. */
  t0Ms: number;
  origin: Vector3;
  /** Body the pulse was emitted from, or null for the observer's position. */
  source: BodyId | null;
  sourceName: string;
  pending: Set<BodyId>;
  detections: Detection[];
  lastMs: number;
}

export const pulses = {
  list: [] as Pulse[],
  seq: 0,
};

const MAX_PULSES = 4;
type Listener = (p: Pulse, d: Detection) => void;
const listeners = new Set<Listener>();

export function onDetection(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const pulseRadius = (p: Pulse): number => (C_KM_S * Math.max(0, sim.timeMs - p.t0Ms)) / 1000;

/** Emit a pulse now from a body's current position (or from the observer when `source` is null). */
export function emitPulse(source: BodyId | null): Pulse {
  const origin = source ? sim.bodies[source].pos.clone() : sim.camera.pos.clone();
  const p: Pulse = {
    id: ++pulses.seq,
    t0Ms: sim.timeMs,
    origin,
    source,
    sourceName: source ? BODIES[source].name : 'observer',
    pending: new Set(BODY_ORDER.filter((id) => id !== source)),
    detections: [],
    lastMs: sim.timeMs,
  };
  pulses.list.push(p);
  while (pulses.list.length > MAX_PULSES) pulses.list.shift();
  return p;
}

export function clearPulses(): void {
  pulses.list.length = 0;
}

const tmp = new Vector3();

/** Check every pending detector against every pulse front (called once per frame). */
export function updatePulses(): void {
  const now = sim.timeMs;
  for (const p of pulses.list) {
    if (now < p.lastMs) {
      // Time went backwards (reset to now): the pulse no longer exists.
      p.pending.clear();
      continue;
    }
    if (now === p.lastMs && now !== p.t0Ms) continue;
    const R = (C_KM_S * (now - p.t0Ms)) / 1000;
    for (const id of p.pending) {
      if (sim.bodies[id].pos.distanceTo(p.origin) > R) continue;
      // Crossed during (lastMs, now]: solve for the exact moment, in seconds after lastMs.
      const base = sim.astroTime;
      const positionAt = (s: number) => bodyPositionAt(id, base.AddDays((p.lastMs - now) / 86_400_000 + s / 86_400), tmp);
      const t0 = (p.t0Ms - p.lastMs) / 1000;
      const span = (now - p.lastMs) / 1000;
      const s = span > 0 ? pulseArrival(positionAt, p.origin, t0, 0, span, 1e-7) : 0;
      const atMs = p.lastMs + s * 1000;
      const d = positionAt(s).distanceTo(p.origin);
      const det: Detection = { pulse: p.id, body: id, atMs, dt: (atMs - p.t0Ms) / 1000, d };
      p.detections.push(det);
      p.pending.delete(id);
      for (const fn of listeners) fn(p, det);
    }
    p.lastMs = now;
  }
  // Drop pulses once time has run backwards past their emission.
  for (let i = pulses.list.length - 1; i >= 0; i--) if (now < pulses.list[i].t0Ms) pulses.list.splice(i, 1);
}
