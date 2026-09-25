/**
 * Data acquisition: turns simulation events into notebook readings.
 *
 *  E1  every light-pulse detection (automatic)
 *  E2  every completed constant-speed trip (automatic, on arrival)
 *  E3  spectrometer reading at the reticle (manual: Record / R)
 *  E4  goniometer reading on the selected body (manual)
 *  E5  1 g flights, sampled at fixed steps of ship time (automatic; the samples are exact
 *      even when the clock is skipped ahead, because the trajectory is known in closed form)
 *
 * With "simulated instrument uncertainty" on, each reading gets Gaussian noise of a stated σ
 * (independent draws from one pseudo-random stream per session) and the σ is stored alongside it.
 */
import { BODIES, C_KM_S, type BodyId } from '../physics/constants';
import { flipAndBurnAt } from '../physics/rocket';
import { fixed, fmtBeta, pickUnit, sig } from '../lib/sci';
import { gaussian, hashSeed, mulberry32 } from '../lib/stats';
import { niceStep } from '../ui/plot/ticks';
import { sim } from '../sim/sim';
import { emitPulse, onDetection, pulses } from '../sim/pulses';
import { shipStateAt, travel, tripElapsed, type Trip } from '../sim/travel';
import { useUI } from '../state/ui';
import { relView } from '../render/relativisticView';
import { logEvent } from './events';
import { reticleReading, targetReading } from './measure';
import { useNotebook, type ExperimentId, type Value } from './notebook';

/** The notebook entry made for the most recent arrival (read by the trial report). */
export const lastTrial = { exp: 'E2' as ExperimentId, n: 0, at: -1 };

/** Things the procedures check off that are not visible in the data. */
export const labFlags = {
  pulsesEmitted: 0,
  splitUsed: false,
};

// One stream per session. Readings taken in the same frame (a skipped 1 g flight logs ~40)
// must get independent deviates, which reseeding from the clock would not give.
const noiseStream = mulberry32(hashSeed(`${Date.now()}:${Math.random()}`));

function commit(
  exp: ExperimentId,
  truth: Record<string, Value>,
  sigma: Record<string, number>,
  src: 'auto' | 'manual',
  simMs = sim.timeMs,
  /** Uncertainties of values the caller has already made noisy. */
  presetSigma: Record<string, number> = {},
) {
  const nb = useNotebook.getState();
  if (!nb.noise) return nb.add(exp, truth, undefined, src, simMs);
  const rand = noiseStream;
  const v: Record<string, Value> = { ...truth };
  for (const [k, s] of Object.entries(sigma)) {
    const x = v[k];
    if (typeof x === 'number' && s > 0) v[k] = x + s * gaussian(rand);
  }
  return nb.add(exp, v, { ...sigma, ...presetSigma }, src, simMs);
}

const timeText = (s: number) => {
  const u = pickUnit('time', s);
  return `${sig(s / u.factor, 6)} ${u.sym}`;
};
const lenText = (km: number) => {
  const u = pickUnit('length', km);
  return `${sig(km / u.factor, 6)} ${u.sym}`;
};

// ─── E1: detector hits ───────────────────────────────────────────────────────────────────

onDetection((p, det) => {
  const row = commit(
    'E1',
    { rx: BODIES[det.body].name, pulse: p.id, dt: det.dt, d: det.d },
    { dt: 0.3 + 2e-4 * det.dt, d: 2000 + 5e-4 * det.d },
    'auto',
    det.atMs,
  );
  logEvent('DET', `P${p.id} → ${BODIES[det.body].name}  Δt = ${timeText(det.dt)}  d = ${lenText(det.d)}  [E1 #${row.n}]`);
});

// ─── E2 / E5: trips ──────────────────────────────────────────────────────────────────────

let flightSeq = 0;
let sampler: { trip: Trip; flight: number; step: number; next: number } | null = null;

function rocketSamples(t: Trip, upToTau: number): void {
  if (!t.rocket) return;
  // Keyed on the trip itself: an abort and relaunch in the same instant is a new flight.
  if (!sampler || sampler.trip !== t) {
    const u = pickUnit('time', t.shipTime);
    const step = niceStep(t.shipTime / u.factor, 40) * u.factor;
    // Continue the numbering of flights already in the notebook.
    const prev = useNotebook.getState().rows.filter((r) => r.exp === 'E5').map((r) => Number(r.v.flight) || 0);
    flightSeq = Math.max(flightSeq, ...prev);
    sampler = { trip: t, flight: ++flightSeq, step, next: 0 };
    logEvent('SYS', `E5 logger: flight F${sampler.flight}, one sample every ${timeText(step)} of ship time`);
  }
  const nb = useNotebook.getState();
  const T = t.shipTime;
  const rocket = t.rocket;
  const flight = sampler.flight;
  const sample = (tau: number) => {
    const st = flipAndBurnAt(rocket, tau);
    const phase = tau < T / 2 ? 'accel' : 'decel';
    // Noise on the rapidity keeps β < 1 (σ_β = σ_φ (1 − β²)).
    let beta = st.beta;
    let sBeta = 0;
    if (nb.noise) {
      const sPhi = 0.002;
      beta = Math.tanh(Math.atanh(Math.min(beta, 1 - 1e-15)) + sPhi * gaussian(noiseStream));
      sBeta = sPhi * (1 - beta * beta);
    }
    commit(
      'E5',
      { flight, phase, tau, t: st.t, x: st.d, beta, T, a: rocket.accel },
      { tau: 5e-4 * tau, t: 5e-4 * st.t, x: 5e-4 * st.d },
      'auto',
      t.startMs + st.t * 1000,
      { beta: sBeta },
    );
  };
  while (sampler.next <= Math.min(upToTau, T) + 1e-9) {
    sample(sampler.next);
    sampler.next += sampler.step;
  }
  // On arrival, close the record with the end point (τ = T, at rest) if the grid missed it.
  if (upToTau >= T && sampler.next !== Infinity) {
    if (sampler.next - sampler.step < T * (1 - 1e-9)) sample(T);
    sampler.next = Infinity;
  }
}

/** Per-frame acquisition while a trip is under way (call after updateTrip). */
export function labFrame(): void {
  const t = travel.trip;
  if (t?.drive === 'rocket') rocketSamples(t, shipStateAt(t, tripElapsed(t)).tau);
  if (relView.split) labFlags.splitUsed = true;
}

/** Called on the frame a trip arrives. */
export function labArrival(t: Trip): void {
  if (t.drive === 'rocket') {
    rocketSamples(t, t.shipTime);
    const rows = useNotebook.getState().rows.filter((r) => r.exp === 'E5' && r.v.flight === sampler?.flight);
    Object.assign(lastTrial, { exp: 'E5', n: sampler?.flight ?? 0, at: travel.lastArrival?.at ?? -1 });
    logEvent('ARR', `${BODIES[t.dest].name}: 1 g flight F${sampler?.flight} complete, Δτ = ${timeText(t.shipTime)}, Δt = ${timeText(t.earthTime)}  [E5, ${rows.length} samples]`);
    return;
  }
  if (t.drive === 'warp') {
    logEvent('ARR', `${BODIES[t.dest].name}: non-physical superluminal transfer, Δt = ${timeText(t.earthTime)}. Not logged.`);
    return;
  }
  const row = commit(
    'E2',
    { dest: BODIES[t.dest].name, beta: t.beta, t: t.earthTime, tau: t.shipTime },
    { t: 1e-3 * t.earthTime, tau: 1e-3 * t.shipTime },
    'auto',
  );
  Object.assign(lastTrial, { exp: 'E2', n: row.n, at: travel.lastArrival?.at ?? -1 });
  logEvent(
    'ARR',
    `${BODIES[t.dest].name} at β = ${fmtBeta(t.beta)}: Δt = ${timeText(t.earthTime)}, Δτ = ${timeText(t.shipTime)}  [E2 #${row.n}]`,
  );
}

// ─── E3 / E4: manual readings ────────────────────────────────────────────────────────────

/** Take a manual reading for the experiment open in the manual. Returns false if none applies. */
export function recordManual(): boolean {
  const exp = useUI.getState().experiment;
  if (exp !== 'E3' && exp !== 'E4') {
    logEvent('ERR', 'Manual readings apply to Experiments 3 and 4. Open one in the lab manual first.');
    return false;
  }
  if (travel.trip?.warp) {
    logEvent('ERR', 'No valid reading: the observer is in a non-physical superluminal state.');
    return false;
  }
  if (exp === 'E3') {
    const g = reticleReading();
    if (!g || g.beta < 1e-3) {
      logEvent('ERR', 'E3 needs the observer to move (β ≥ 0.001): start a constant-speed trip first.');
      return false;
    }
    const row = commit('E3', { beta: g.beta, thS: g.thetaShipDeg, D: g.D }, { thS: 0.2, D: 0.005 * g.D }, 'manual');
    logEvent('REC', `E3 #${row.n}: θ′ = ${fixed(g.thetaShipDeg, 2)}°  D = ${sig(g.D, 5)}  (β = ${fmtBeta(g.beta)})`);
    return true;
  }
  const id: BodyId | null = useUI.getState().selected;
  if (!id) {
    logEvent('ERR', 'E4 needs a target: select a body (click its label, or press 0–9).');
    return false;
  }
  const g = targetReading(id);
  // Down to Earth's own orbital speed (β ≈ 10⁻⁴): Bradley's stellar aberration.
  if (!g || g.beta < 1e-6) {
    logEvent('ERR', 'E4 needs a moving observer: start a trip, or orbit a planet (which moves with it).');
    return false;
  }
  const row = commit('E4', { target: BODIES[id].name, beta: g.beta, th: g.thetaDeg, thS: g.thetaShipDeg }, { th: 0.05, thS: 0.05 }, 'manual');
  logEvent('REC', `E4 #${row.n}: ${BODIES[id].name}  θ = ${fixed(g.thetaDeg, 3)}°  θ′ = ${fixed(g.thetaShipDeg, 3)}°`);
  return true;
}

/** Light-time helper for the event log. */
export const lightTimeText = (km: number): string => timeText(km / C_KM_S);

/** Emit a light pulse from a body (or the observer) and note it in the log. */
export function emitLightPulse(source: BodyId | null): void {
  // Continue pulse numbering from readings already in the notebook.
  const prev = useNotebook.getState().rows.filter((r) => r.exp === 'E1').map((r) => Number(r.v.pulse) || 0);
  pulses.seq = Math.max(pulses.seq, ...prev);
  const p = emitPulse(source);
  labFlags.pulsesEmitted++;
  logEvent('EMIT', `Pulse P${p.id} emitted from ${p.sourceName}; ${p.pending.size} detectors armed`);
}
