/**
 * Light pulses for the time-of-flight experiment.
 *
 * A pulse leaves a fixed point in the Sun's rest frame (where its source was at emission) and
 * its front is a sphere of radius c(t − t₀). Bodies carry detectors (below). When a front
 * passes a body between two frames, the exact crossing time is solved from the ephemeris
 * (physics/lightTime.pulseArrival), so time warp does not degrade the timing.
 *
 * Which bodies carry detectors: the planets, the dwarf planets, spacecraft and the large moons
 * (1,000 km in radius or more), plus the Sun and Proxima Centauri and any record that says so.
 * Every detection is a row in the notebook, so the dozens of small moons and small bodies are
 * left out by default: a pulse from Earth logs one row per world rather than a cluster per planet.
 *
 * Time warp: pulses are kept, and kept exact, at any warp. However long a frame is (up to
 * 3 × 10¹⁴ s at the fastest warp), each crossing is solved inside it, so a pulse fired at
 * 320 million years a second still logs Earth at 499 s. Times of flight are measured from the
 * emission as a difference of seconds, never of absolute timestamps, which far from 1970 are
 * only good to seconds or hours. Once every detector has fired and the front is far past
 * everything (RETIRE_KM), the pulse is dropped: it has nothing left to tell.
 */
import { Vector3 } from 'three';
import { C_KM_S } from '../physics/constants';
import { pulseArrival } from '../physics/lightTime';
import { bodyName, bodyPositionAt, bodyRecords, type BodyId, type BodyRecord } from './bodies';
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
/** A spent pulse is dropped once its front passes this radius (about 10 light-years, beyond Proxima). */
const RETIRE_KM = 1e14;
type Listener = (p: Pulse, d: Detection) => void;
const listeners = new Set<Listener>();

export function onDetection(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const pulseRadius = (p: Pulse): number => (C_KM_S * Math.max(0, sim.timeMs - p.t0Ms)) / 1000;

/** Kinds that carry a detector unless their record says otherwise. */
const DETECTING_KINDS = new Set(['planet', 'dwarf-planet', 'spacecraft']);
/** Moons at least this large (mean radius, km) carry one too: the Moon, the Galileans, Titan, Triton. */
export const DETECTOR_MOON_MIN_RADIUS_KM = 1000;

/** Whether a body carries a detector for the light-pulse experiment (E1). */
export const hasDetector = (r: BodyRecord): boolean =>
  r.detector ?? (DETECTING_KINDS.has(r.kind) || (r.kind === 'moon' && r.physical.radiusKm >= DETECTOR_MOON_MIN_RADIUS_KM));

/** Emit a pulse now from a body's current position (or from the observer when `source` is null). */
export function emitPulse(source: BodyId | null): Pulse {
  const src = source ? sim.bodies[source] : undefined;
  if (source && !src) source = null;
  const origin = src ? src.pos.clone() : sim.camera.pos.clone();
  const p: Pulse = {
    id: ++pulses.seq,
    t0Ms: sim.timeMs,
    origin,
    source,
    sourceName: source ? bodyName(source) : 'observer',
    // Only bodies with a detector that exist now can see it (not Voyager 1 before 1980).
    pending: new Set(bodyRecords().filter((r) => r.id !== source && hasDetector(r) && sim.bodies[r.id].present).map((r) => r.id)),
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
      const body = sim.bodies[id];
      if (!body) {
        p.pending.delete(id); // no longer registered
        continue;
      }
      if (body.pos.distanceTo(p.origin) > R) continue;
      // Crossed during (lastMs, now]: solve for the exact moment, in seconds after lastMs.
      const base = sim.astroTime;
      const positionAt = (s: number) => bodyPositionAt(id, base.AddDays((p.lastMs - now) / 86_400_000 + s / 86_400), tmp);
      const t0 = (p.t0Ms - p.lastMs) / 1000;
      const span = (now - p.lastMs) / 1000;
      const s = span > 0 ? pulseArrival(positionAt, p.origin, t0, 0, span, 1e-7) : 0;
      const atMs = p.lastMs + s * 1000;
      const d = positionAt(s).distanceTo(p.origin);
      // Time of flight from seconds relative to lastMs: exact even where atMs is not.
      const det: Detection = { pulse: p.id, body: id, atMs, dt: s - t0, d };
      p.detections.push(det);
      p.pending.delete(id);
      for (const fn of listeners) fn(p, det);
    }
    p.lastMs = now;
  }
  // Drop pulses once time has run backwards past their emission, or once they are spent.
  for (let i = pulses.list.length - 1; i >= 0; i--) {
    const p = pulses.list[i];
    if (now < p.t0Ms || (p.pending.size === 0 && pulseRadius(p) > RETIRE_KM)) pulses.list.splice(i, 1);
  }
}
