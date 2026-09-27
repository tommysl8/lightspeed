/**
 * Flights beyond the Local Group: which spacetime a flight crosses, and the expanding-universe planner
 * of physics/cosmology (docs/data/cosmology.md) fitted to the app's positions and clock.
 *
 * Policy. Gravitationally bound systems do not expand. A flight that starts and ends inside the Local
 * Group's zero-velocity surface (0.96 Mpc about its barycentre, Karachentsev et al. 2009) is flown in
 * static space with special relativity (sim/travel.ts, as always); any other crosses an expanding,
 * flat Lambda-CDM universe with the Planck 2018 parameters (FLRW), with the Local Group and the
 * destination as comoving points. The test uses both ends' positions, so a flight home from the Virgo
 * cluster crosses expanding space, and one from Andromeda to Triangulum does not.
 *
 * Model, stated wherever the numbers are shown: a perfect engine (constant proper acceleration for as
 * long as it takes, no fuel limit), a comoving destination (its own motion of a few hundred km/s is
 * left out) and an exactly homogeneous universe along the way.
 *
 * Costs. The model's tables take 45 to 110 ms to build, so they are built in a worker at idle after
 * start-up and handed over (the main thread never builds them unless something needs a number first).
 * A plan takes 3 to 20 ms; plans are kept, so the planner, search and scenes ask once per destination
 * and epoch, and never from the render loop. Playback then interpolates the plan's samples.
 */
import { Vector3 } from 'three';
import {
  G0_M_S2,
  LOCAL_GROUP,
  MPC_KM,
  adoptPlanck18Tables,
  homeAt,
  planCruise,
  planFlipAndBurn,
  planck18,
  planck18Built,
  propagationModel,
  type HomeReport,
  type Planck18Tables,
  type TripPlan as CosmicPlan,
  type Unreachable,
} from '../physics/cosmology';
import type { Vec3 } from '../physics/cosmology/policy';

export type SpaceModel = 'static' | 'flrw';

// ─── Which spacetime ─────────────────────────────────────────────────────────────────────

/** World (x, z, −y of the ecliptic) km → ecliptic Mpc, the policy's frame. */
const eclMpc = (p: Vector3): Vec3 => [p.x / MPC_KM, -p.z / MPC_KM, p.y / MPC_KM];

/**
 * Static space (special relativity) when both ends lie inside the Local Group's zero-velocity surface,
 * expanding space (FLRW) otherwise. Positions are heliocentric world km (proper, at the clock's time).
 * The surface is the policy's (about the barycentre 0.55 of the way to Andromeda), the one the sky uses
 * to decide when the camera has left the Local Group (sim/cosmos/expansion.ts), so the two agree.
 */
export function spaceModel(fromKm: Vector3, toKm: Vector3): SpaceModel {
  return propagationModel({ originMpc: eclMpc(fromKm), positionMpc: eclMpc(toKm), m31Mpc: LOCAL_GROUP.m31EclMpc });
}

// ─── The model's tables ──────────────────────────────────────────────────────────────────

type TablesState = 'idle' | 'building' | 'ready' | 'failed';
let tablesState: TablesState = 'idle';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Whether the Planck 2018 model is ready on this thread (numbers cost microseconds). */
export const cosmologyReady = (): boolean => planck18Built();

/** Be told when the model becomes ready. Returns the unsubscribe function. */
export function subscribeCosmology(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Have the model's tables built in a worker and adopt them here. Where there are no workers (the
 * tests) nothing happens: the model is built on first use. If the worker fails, the same.
 */
export function warmCosmology(): void {
  if (planck18Built()) {
    tablesState = 'ready';
    return;
  }
  if (tablesState !== 'idle' || typeof Worker === 'undefined' || typeof window === 'undefined') return;
  tablesState = 'building';
  let worker: Worker;
  try {
    worker = new Worker(new URL('./travelWorker.ts', import.meta.url), { type: 'module', name: 'cosmology' });
  } catch {
    tablesState = 'failed';
    return;
  }
  worker.onmessage = (e: MessageEvent<{ ok: true; tables: Planck18Tables } | { ok: false; error: string }>) => {
    worker.terminate();
    // Built here meanwhile (something needed a number first): the worker's copy is not needed.
    if (e.data.ok) adoptPlanck18Tables(e.data.tables);
    tablesState = planck18Built() ? 'ready' : 'failed';
    notify();
  };
  worker.onerror = () => {
    worker.terminate();
    tablesState = 'failed';
    notify();
  };
  worker.postMessage('tables');
}

// Build the tables at idle after start-up, before anyone asks for a number.
if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(warmCosmology, { timeout: 10_000 });
  else window.setTimeout(warmCosmology, 3000);
}

// ─── Plans ───────────────────────────────────────────────────────────────────────────────

export interface CosmicRequest {
  /** Comoving distance of the flight, Mpc (a = 1 today). */
  chiMpc: number;
  /** Scale factor at departure (the universe at the clock's time). */
  aDep: number;
  /** Proper acceleration of the burns, m/s². */
  accel: number;
  /** A constant-speed cruise at this β (peculiar, relative to the galaxies passed) instead of a flip-and-burn. */
  cruiseBeta?: number;
  /** Refuse flights that need more ship time than this, years. */
  maxShipTimeYr?: number;
}

export interface CosmicLeg {
  req: CosmicRequest;
  /** The module's plan: times, speeds, the universe at both ends, home as seen on arrival, playback samples. */
  plan: CosmicPlan;
  /** The home clock at the arrival's cosmic time (the Sun, the Earth, the Local Group, the sky from home). */
  home: HomeReport;
  /** The way back from the destination on arrival (worked out when first asked: returnLeg). */
  back?: CosmicPlan | Unreachable;
}

export type CosmicResult = { ok: true; leg: CosmicLeg } | { ok: false; unreachable: Unreachable };

/** Playback samples per plan: interpolation errors fall as the fourth power of the spacing (5e-9 of the distance at z = 1). */
const SAMPLES = 2000;
/** Plans kept (each holds its samples, about 180 kB). */
const CACHE_SIZE = 16;
/**
 * A plan is reused for a flight whose distance and departure epoch differ by less than this, relative
 * (ln a for the epoch): the integrator's own tolerance, so the numbers are the same to its accuracy.
 * The camera moving round Earth for a year changes a flight to Virgo by 1e-14.
 */
const REUSE = 1e-12;

const cache: { key: string; chi: number; lnA: number; result: CosmicResult }[] = [];

const keyOf = (r: CosmicRequest) => `${r.accel}|${r.cruiseBeta ?? '-'}|${r.maxShipTimeYr ?? '-'}`;

/**
 * Plan a flight through expanding space (synchronous: 3 to 20 ms the first time for a destination and
 * epoch, then from the cache). Never call it from the render loop.
 */
export function planCosmicLeg(req: CosmicRequest): CosmicResult {
  const key = keyOf(req);
  const lnA = Math.log(req.aDep);
  const hit = cache.find((c) => c.key === key && Math.abs(c.chi - req.chiMpc) <= REUSE * req.chiMpc && Math.abs(c.lnA - lnA) <= REUSE);
  if (hit) return hit.result;
  const cosmo = planck18();
  const opts = { accel: req.accel, departureScale: req.aDep, maxShipTimeYr: req.maxShipTimeYr, samples: SAMPLES };
  const plan = req.cruiseBeta !== undefined ? planCruise(cosmo, req.chiMpc, { ...opts, cruiseBeta: req.cruiseBeta }) : planFlipAndBurn(cosmo, req.chiMpc, opts);
  const result: CosmicResult = plan.ok ? { ok: true, leg: { req, plan, home: homeAt(cosmo, plan.arrival.timeGyr) } } : { ok: false, unreachable: plan };
  cache.unshift({ key, chi: req.chiMpc, lnA, result });
  if (cache.length > CACHE_SIZE) cache.pop();
  return result;
}

/** Forget every plan (tests). */
export function clearCosmicPlans(): void {
  cache.length = 0;
}

/**
 * The flight back home from the destination, leaving on arrival with the same engine (by homogeneity
 * home is then the same comoving distance away). Worked out on first request and kept with the leg.
 */
export function returnLeg(leg: CosmicLeg): CosmicPlan | Unreachable {
  if (!leg.back) {
    const cosmo = planck18();
    const opts = { accel: leg.req.accel, departureScale: leg.plan.arrival.scale, maxShipTimeYr: leg.req.maxShipTimeYr, samples: 2 };
    leg.back =
      leg.req.cruiseBeta !== undefined ? planCruise(cosmo, leg.req.chiMpc, { ...opts, cruiseBeta: leg.req.cruiseBeta }) : planFlipAndBurn(cosmo, leg.req.chiMpc, opts);
  }
  return leg.back;
}

/** Standard gravity in m/s², for accelerations given in g. */
export const G0 = G0_M_S2;
