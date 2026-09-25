/**
 * Flight recorder strip along the bottom of the viewport during a trip, and the trial
 * report after arrival.
 */
import { BODIES, C_KM_S } from '../../physics/constants';
import { fmtBeta, qty, sig } from '../../lib/sci';
import { controller } from '../../controls/cameraController';
import { chrono } from '../../sim/chronometer';
import { travel, tripElapsed, jumpToArrival, shipStateAt, type Trip } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { lastTrial } from '../../lab/logger';
import { stopTrip } from '../tripActions';
import { openExplainer } from '../explainerActions';
import { CloseIcon, Sym } from '../kit';
import { useTicker } from '../useTicker';
import { rich } from '../rich';
import type { ReactNode } from 'react';

function Cell({ l, v, u, tone }: { l: ReactNode; v: string; u?: string; tone?: 'data' | 'hazard' | 'dim' }) {
  const c = tone === 'data' ? 'text-data' : tone === 'hazard' ? 'text-hazard' : tone === 'dim' ? 'text-fg-3' : 'text-fg';
  return (
    <div className="min-w-0 border-l border-line px-2.5 first:border-l-0">
      <div className="truncate text-[10.5px] text-fg-3">{l}</div>
      <div className={`mono whitespace-nowrap text-[13px] ${c}`}>
        {rich(v)} <span className="text-[10.5px] text-fg-3">{u}</span>
      </div>
    </div>
  );
}

const Q = (x: number, dim: 'time' | 'length', d = 5) => qty(x, dim, d);

function Ruler({ progress, distance }: { progress: number; distance: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="relative mx-3 mb-1 mt-2 h-6">
      <div className="absolute inset-x-0 top-[6px] h-px bg-line-3" />
      <div className="absolute left-0 top-[5px] h-[3px] bg-data" style={{ width: `${progress * 100}%` }} />
      {ticks.map((t) => {
        const q = Q(distance * t, 'length', 3);
        return (
          <div key={t} className="absolute top-[2px]" style={{ left: `${t * 100}%` }}>
            <div className="h-[9px] w-px bg-line-3" />
            <div
              className={`mono absolute top-[10px] whitespace-nowrap text-[9.5px] text-fg-3 ${t === 0 ? '' : t === 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            >
              {t === 0 ? '0' : `${q.v} ${q.u}`}
            </div>
          </div>
        );
      })}
      <div className="absolute top-0" style={{ left: `${progress * 100}%` }}>
        <div className="-ml-[4px] h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-accent" />
      </div>
    </div>
  );
}

function InFlight({ t }: { t: Trip }) {
  const elapsed = tripElapsed(t);
  const s = shipStateAt(t, elapsed);
  const remD = Math.max(0, t.distance - s.covered);
  const progress = t.distance > 0 ? s.covered / t.distance : 1;
  const rocket = t.drive === 'rocket';
  const phase = rocket ? (elapsed < t.earthTime / 2 ? 'accelerating, 1 g' : 'decelerating, 1 g') : t.warp ? 'superluminal' : 'coasting';
  const tq = Q(elapsed, 'time', 6);
  const tauq = t.warp ? null : Q(s.tau, 'time', 6);
  const dq = Q(remD, 'length', 5);
  const dpq = t.warp ? null : Q(remD / s.gamma, 'length', 5);
  const ltq = Q(remD / C_KM_S, 'time', 4);
  const diffq = t.warp ? null : Q(elapsed - s.tau, 'time', 4);
  return (
    <div className={`panel-float appear absolute inset-x-3 bottom-3 z-20 ${t.warp ? '!border-hazard/50' : ''}`}>
      <div className={`titlebar ${t.warp ? 'hatch' : ''}`}>
        <span className={`cap ${t.warp ? '!text-hazard' : '!text-data'}`}>In transit</span>
        <span className="text-[12px] text-fg">
          → {BODIES[t.dest].name}
          <span className="text-fg-3">
            {' '}
            · {t.warp ? `${sig(t.beta, 3)}c (fiction)` : rocket ? `1 g flip-and-burn, peak β = ${fmtBeta(t.beta)}` : `constant speed β = ${fmtBeta(t.beta)}`} · {phase}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button className="btn btn-sm" onClick={() => controller.setTravelLook(0)} title="Look along the direction of motion (drag or arrow keys to look around)">
            Ahead
          </button>
          <button className="btn btn-sm" onClick={() => controller.setTravelLook(Math.PI)} title="Look back toward the departure point">
            Astern
          </button>
          <button className="btn btn-sm" onClick={jumpToArrival} title="Advance the clock to arrival; readings stay exact">
            Skip to arrival
          </button>
          <button className="btn btn-sm btn-hazard" onClick={stopTrip} title="Stop here (instantaneous, idealised)">
            Abort
          </button>
        </span>
      </div>
      <Ruler progress={Math.min(1, Math.max(0, progress))} distance={t.distance} />
      <div className="grid grid-cols-3 gap-y-1.5 px-0.5 pb-2 pt-1.5 sm:grid-cols-6">
        <Cell l={<>Elapsed <Sym>t</Sym> (S)</>} v={tq.v} u={tq.u} tone="data" />
        <Cell l={<>Elapsed <Sym>τ</Sym> (ship)</>} v={tauq?.v ?? 'undefined'} u={tauq?.u} tone={t.warp ? 'hazard' : 'data'} />
        <Cell l={<><Sym>t</Sym> − <Sym>τ</Sym></>} v={diffq?.v ?? '—'} u={diffq?.u} />
        <Cell l="Remaining (S)" v={dq.v} u={dq.u} />
        <Cell l={<>Remaining (S′), ÷<Sym>γ</Sym></>} v={dpq?.v ?? '—'} u={dpq?.u} tone={t.warp ? 'dim' : undefined} />
        <Cell l="Light-time, remaining" v={ltq.v} u={ltq.u} tone="dim" />
      </div>
      {!chrono.tauValid && !t.warp && <div className="px-3 pb-1.5 text-[10.5px] text-hazard">Chronometer τ invalid since a superluminal transfer; zero it in the instrument panel.</div>}
    </div>
  );
}

function Report() {
  const a = travel.lastArrival!;
  const rel = !a.warp;
  const T = Q(a.earthTime, 'time', 6);
  const tau = rel ? Q(a.shipTime, 'time', 6) : null;
  const d = Q(a.distance, 'length', 6);
  const logged = lastTrial.at === a.at ? lastTrial : null;
  const ratio = a.shipTime / a.earthTime;
  return (
    <div className="absolute bottom-3 left-1/2 z-20 w-[560px] max-w-[calc(100%-24px)] -translate-x-1/2">
      <div className="panel-float appear">
        <div className="titlebar">
          <span className="cap !text-ok">Trial report</span>
          <span className="text-[12px] text-fg">Arrived at {BODIES[a.dest].name}</span>
          <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => (travel.lastArrival = null)} aria-label="Close report">
            <CloseIcon />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-y-1.5 px-0.5 py-2">
          <Cell l="Path length (S)" v={d.v} u={d.u} />
          <Cell l={<>Δ<Sym>t</Sym> (S)</>} v={T.v} u={T.u} tone="data" />
          <Cell l={<>Δ<Sym>τ</Sym> (ship)</>} v={tau?.v ?? 'undefined'} u={tau?.u} tone={rel ? 'data' : 'hazard'} />
          <Cell l="Drive" v={a.warp ? 'superluminal' : a.drive === 'rocket' ? '1 g flip-and-burn' : 'constant speed'} />
          <Cell l={a.drive === 'rocket' ? <>Peak <Sym>β</Sym></> : <Sym>β</Sym>} v={a.warp ? `${sig(a.beta, 3)} (fiction)` : fmtBeta(a.beta)} />
          <Cell l={<>Δ<Sym>τ</Sym>/Δ<Sym>t</Sym></>} v={rel ? sig(ratio, 6) : '—'} />
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-[11.5px] text-fg-2">
          {a.warp ? (
            <>
              <span className="text-hazard">Not logged: non-physical.</span>
              <button className="btn btn-sm ml-auto" onClick={() => openExplainer('ftl')}>
                Why
              </button>
            </>
          ) : logged ? (
            <>
              <span>
                Logged as Experiment {logged.exp.slice(1)}, {logged.exp === 'E5' ? `flight F${logged.n}` : `reading ${logged.n}`}.
              </span>
              <button
                className="btn btn-sm ml-auto"
                onClick={() => useUI.setState({ leftOpen: true, manualTab: 'experiments', experiment: logged.exp })}
              >
                Open Experiment {logged.exp.slice(1)}
              </button>
            </>
          ) : (
            <span>Trial complete.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function FlightStrip() {
  const active = useUI((s) => s.tripActive);
  const planner = useUI((s) => s.plannerOpen);
  useTicker(10);
  const t = travel.trip;
  if (active && t) return <InFlight t={t} />;
  const a = travel.lastArrival;
  if (a && !planner && performance.now() - a.at < 60_000) return <Report />;
  return null;
}
