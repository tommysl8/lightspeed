/**
 * Asking the near search (near.ts, in nearWorker.ts) for the left-out bodies near the camera, while the camera is
 * inside the shell of a section the budget left out: once, then again whenever the camera, or (at the clock's rate)
 * a body, could have moved by the margin the answer allowed, or the draw's plan has changed.
 */
import type { DrawPlan } from './lod';
import { NEAR_CAP } from './lod';
import type { NearWorkerReply, NearWorkerRequest } from './nearWorker';

/** No small body moves faster than this about the Sun, au/day (a near-Earth asteroid at a 0.07 au perihelion: 0.09). */
const VMAX_AU_PER_DAY = 0.1;

type V3 = { x: number; y: number; z: number };

/** The latest answer. Read it; `version` changes with it. */
export const near = {
  picks: new Map<number, Uint32Array>(),
  limit: -Infinity,
  searched: new Set<number>(),
  /** Whether the answer still holds for the camera and the clock (else its picks are still drawn, but promise nothing). */
  fresh: false,
  version: 0,
};

let worker: Worker | null | undefined;
let asked: { days: number; cam: V3; margin: number; key: string } | null = null;
let pending = false;
let nextId = 1;
const filesSent = new Set<string>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
  try {
    const w = new Worker(new URL('./nearWorker.ts', import.meta.url), { type: 'module', name: 'asteroids-near' });
    w.onmessage = (e: MessageEvent<NearWorkerReply>) => {
      pending = false;
      near.picks = new Map(e.data.picks);
      near.limit = e.data.limit;
      near.searched = new Set(e.data.searched);
      near.version++;
    };
    w.onerror = () => {
      w.terminate();
      worker = undefined;
      pending = false;
      filesSent.clear();
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** Tell the worker of an orbit file the layer has (it fetches its own copy when it is first needed). */
export function nearFile(url: string): void {
  if (filesSent.has(url) || !worker) return;
  filesSent.add(url);
  worker.postMessage({ kind: 'file', url } satisfies NearWorkerRequest);
}

/**
 * Called each frame with the draw's plan: the camera (au from the Sun, J2000 ecliptic), the clock (days after the
 * reference epoch) and its rate (days a second), the barycentre (au), and every loaded file's URL.
 */
export function updateNear(plan: DrawPlan, days: number, rateDaysPerS: number, cam: V3, ssb: V3, fileUrls: Iterable<string>): void {
  const inside = plan.left.filter((l) => l.bound === -Infinity);
  if (!inside.length) {
    if (near.picks.size || near.fresh) {
      near.picks = new Map();
      near.searched = new Set();
      near.limit = -Infinity;
      near.fresh = false;
      near.version++;
    }
    asked = null;
    return;
  }
  const key = inside.map((l) => `${l.id}:${l.from}`).join(',');
  const fresh =
    !!asked &&
    asked.key === key &&
    VMAX_AU_PER_DAY * Math.abs(days - asked.days) <= asked.margin &&
    Math.hypot(cam.x - asked.cam.x, cam.y - asked.cam.y, cam.z - asked.cam.z) <= asked.margin;
  near.fresh = fresh && !pending;
  if (fresh || pending) return;
  const w = getWorker();
  if (!w) return;
  for (const url of fileUrls) nearFile(url);
  // Room for two seconds of the clock's motion, and at least 0.01 au.
  const margin = Math.min(0.3, Math.max(0.01, VMAX_AU_PER_DAY * Math.abs(rateDaysPerS) * 2));
  asked = { days, cam: { ...cam }, margin, key };
  pending = true;
  w.postMessage({
    kind: 'select',
    id: nextId++,
    query: { days, cam, ssb, limit: plan.display, marginAu: margin, from: inside.map((l) => [l.id, l.from]), cap: NEAR_CAP },
  } satisfies NearWorkerRequest);
}
