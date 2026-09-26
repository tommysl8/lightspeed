/**
 * In flight, a compact readout along the bottom of the view: where you are going, how far
 * along you are, and four big numbers (speed, your clock, the clock at home, the distance
 * left), with the buttons a trip needs. "Details" opens the full flight recorder. After
 * arrival, a card sums the trip up in words.
 */
import type { ReactNode } from 'react';
import { BODIES, C_KM_S } from '../../physics/constants';
import { fmtBeta, qty, sig } from '../../lib/sci';
import { formatClock } from '../../lib/format';
import { formatDurationShort, formatSimDate } from '../../lib/time';
import { controller } from '../../controls/cameraController';
import { chrono } from '../../sim/chronometer';
import { sim } from '../../sim/sim';
import { SHIP_RATE_MIN, jumpToArrival, stepRate, travel, tripElapsed, tripPace, tripState, type Trip } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { lastTrial } from '../../lab/logger';
import { stopTrip } from '../tripActions';
import { readMore } from '../explainerActions';
import { openExperiment } from '../onboarding';
import { Chevron, CloseIcon, Sym, useLocalState } from '../kit';
import { Icon } from '../icons';
import { useTicker } from '../useTicker';
import { OpticsSeg } from '../layout/Header';
import { rich } from '../rich';
import { arrivalText, speedText } from './tripText';

const DAY_S = 86_400;

// ─── The compact readout ────────────────────────────────────────────────────────────────

/** One of the four big numbers. */
function Big({ label, value, unit, sub, tone }: { label: ReactNode; value: string; unit?: string; sub: string; tone?: 'data' | 'hazard' }) {
  const c = tone === 'data' ? 'text-data' : tone === 'hazard' ? 'text-hazard' : 'text-fg';
  return (
    <div className="min-w-0 px-3 py-1.5">
      <div className="truncate text-[11px] text-fg-3">{label}</div>
      <div className={`mono truncate text-[17px] leading-[22px] lg:text-[19px] lg:leading-[24px] ${c}`}>
        {rich(value)}
        {unit && <span className="ml-1 text-[12px] text-fg-3">{unit}</span>}
      </div>
      <div className="mono truncate text-[10.5px] leading-[15px] text-fg-3">{rich(sub)}</div>
    </div>
  );
}

/** Slower and faster for the trip's pace, with the pace in words. */
function PaceStepper({ t }: { t: Trip }) {
  const p = tripPace(t);
  const ship = t.pacing === 'ship';
  const slower = ship ? t.shipRate > SHIP_RATE_MIN : sim.warp > 1;
  const faster = ship ? t.shipRate < Math.max(SHIP_RATE_MIN, t.shipTime) : true;
  return (
    <span className="flex items-center" role="group" aria-label="Pace of the trip">
      <button className="btn btn-q btn-sq btn-sm !w-6" onClick={() => stepRate(-1)} disabled={!slower} aria-label="Slower" title="Slower ([)">
        <Icon name="chevron-left" size={12} />
      </button>
      <span className="mono whitespace-nowrap px-1 text-[11.5px] text-fg-2" title={`${p.text}. The readings stay exact at any pace.`}>
        1 s = {ship ? `${p.onBoard} aboard` : `${p.atHome} at home`}
      </span>
      <button className="btn btn-q btn-sq btn-sm !w-6" onClick={() => stepRate(1)} disabled={!faster} aria-label="Faster" title="Faster (])">
        <Icon name="chevron-right" size={12} />
      </button>
    </span>
  );
}

// ─── The full recorder (Details) ────────────────────────────────────────────────────────

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

function Recorder({ t, elapsed, tau, remD, gamma, progress }: { t: Trip; elapsed: number; tau: number; remD: number; gamma: number; progress: number }) {
  const tq = Q(elapsed, 'time', 6);
  const tauq = t.warp ? null : Q(tau, 'time', 6);
  const dq = Q(remD, 'length', 5);
  const dpq = t.warp ? null : Q(remD / gamma, 'length', 5);
  const ltq = Q(remD / C_KM_S, 'time', 4);
  const diffq = t.warp ? null : Q(elapsed - tau, 'time', 4);
  return (
    <div className="border-t border-line">
      <Ruler progress={progress} distance={t.distance} />
      <div className="grid grid-cols-3 gap-y-1.5 px-0.5 pb-2 pt-1.5 sm:grid-cols-6">
        <Cell l={<>Elapsed <Sym>t</Sym> (S)</>} v={tq.v} u={tq.u} tone="data" />
        <Cell l={<>Elapsed <Sym>τ</Sym> (ship)</>} v={tauq?.v ?? 'undefined'} u={tauq?.u} tone={t.warp ? 'hazard' : 'data'} />
        <Cell l={<><Sym>t</Sym> − <Sym>τ</Sym></>} v={diffq?.v ?? '—'} u={diffq?.u} />
        <Cell l="Remaining (S)" v={dq.v} u={dq.u} />
        <Cell l={<>Remaining (S′), ÷<Sym>γ</Sym></>} v={dpq?.v ?? '—'} u={dpq?.u} tone={t.warp ? 'dim' : undefined} />
        <Cell l="Light-time, remaining" v={ltq.v} u={ltq.u} tone="dim" />
      </div>
      {!chrono.tauValid && !t.warp && (
        <div className="px-3 pb-1.5 text-[10.5px] text-hazard">The instrument panel’s clock τ is invalid since a faster-than-light trip; zero it there.</div>
      )}
      {!t.warp && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-1.5">
          <span className="cap">Optics</span>
          <OpticsSeg />
          <span className="text-[11px] text-fg-3 max-md:hidden">X splits the screen: the sky without relativity on the left</span>
        </div>
      )}
    </div>
  );
}

// ─── In flight ──────────────────────────────────────────────────────────────────────────

function InFlight({ t }: { t: Trip }) {
  const note = useUI((s) => s.journeyNote);
  const [details, setDetails] = useLocalState('lightspeed.flightDetails', false);
  const s = tripState(t);
  const elapsed = tripElapsed(t);
  const remD = Math.max(0, t.distance - s.covered);
  const progress = Math.min(1, Math.max(0, t.distance > 0 ? s.covered / t.distance : 1));
  const rocket = t.drive === 'rocket';
  const drive = t.warp ? `${sig(t.beta, 3)}c, fiction` : rocket ? '1 g rocket' : `steady ${fmtBeta(t.beta)}c`;
  const phase = rocket ? (s.tau < t.shipTime / 2 ? 'speeding up' : 'slowing down') : t.warp ? 'faster than light' : 'coasting';
  const speed = speedText(s, t.warp);
  const d = qty(remD, 'length', 3);
  const long = elapsed > 30 * DAY_S;
  return (
    <div className={`panel-float appear absolute bottom-3 left-1/2 z-20 w-[780px] max-w-[calc(100%-24px)] -translate-x-1/2 ${t.warp ? '!border-hazard/50' : ''}`}>
      <div className={`flex items-center gap-2 px-3 pb-1 pt-2 ${t.warp ? 'hatch' : ''}`}>
        <span className={`cap shrink-0 ${t.warp ? '!text-hazard' : '!text-data'}`}>In flight</span>
        <span className="min-w-0 truncate text-[13px] text-fg">
          → {BODIES[t.dest].name}
          <span className="text-fg-3">
            {' '}
            · {drive} · {phase}
          </span>
        </span>
        <span className="mono ml-auto shrink-0 text-[11px] text-fg-2">{Math.floor(progress * 100)}%</span>
      </div>
      <div className="mx-3 h-[3px] bg-line-2" role="progressbar" aria-label="Trip progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}>
        <div className={`h-full ${t.warp ? 'bg-hazard' : 'bg-data'}`} style={{ width: `${progress * 100}%` }} />
      </div>
      {note && (
        <div className="mt-1.5 flex items-start gap-2.5 border-y border-line bg-accent/[0.04] px-3 py-1.5">
          <span className="cap mt-[3px] shrink-0 !text-accent">Look for</span>
          <span className="font-serif text-[12.5px] leading-snug text-fg-2">{note}</span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-line max-sm:[&>*:nth-child(3)]:border-l-0 max-sm:[&>*:nth-child(n+3)]:border-t">
        <Big label="Speed" value={speed.beta} unit="c" sub={`γ = ${speed.gamma}`} tone={t.warp ? 'hazard' : undefined} />
        <Big label="Your clock" value={t.warp ? 'undefined' : formatClock(s.tau)} sub="time on board" tone={t.warp ? 'hazard' : 'data'} />
        <Big label="At home" value={formatClock(elapsed)} sub={long ? formatSimDate(sim.timeMs, 'date') : 'time on Earth'} tone="data" />
        <Big label="Distance left" value={d.v} unit={d.u} sub={`light ${formatDurationShort(remD / C_KM_S, 2)}`} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-1.5">
        <span className="flex items-center gap-1">
          <button className="btn btn-sm" onClick={jumpToArrival} title="Advance the clocks to arrival; the readings stay exact">
            Skip to arrival
          </button>
          <button className="btn btn-sm btn-hazard" onClick={stopTrip} title="Stop here (instantly, which no real ship could do)">
            Abort
          </button>
        </span>
        <span className="flex items-center gap-1">
          <span className="cap mr-0.5">Look</span>
          <button className="btn btn-sm" onClick={() => controller.setTravelLook(0)} title="Look along the direction of travel">
            Ahead
          </button>
          <button className="btn btn-sm" onClick={() => controller.setTravelLook(Math.PI)} title="Look back the way you came">
            Astern
          </button>
        </span>
        <PaceStepper t={t} />
        <button className="btn btn-q btn-sm ml-auto" aria-expanded={details} onClick={() => setDetails(!details)} title="The full flight recorder: both clocks exactly, distances in both frames, and the optics">
          Details
          <Chevron className={details ? 'rotate-180' : ''} />
        </button>
      </div>
      {details && <Recorder t={t} elapsed={elapsed} tau={s.tau} remD={remD} gamma={s.gamma} progress={progress} />}
    </div>
  );
}

// ─── Arrival ────────────────────────────────────────────────────────────────────────────

function Report() {
  const a = travel.lastArrival!;
  const labUsed = useUI((s) => s.labUsed);
  const text = arrivalText({ destName: BODIES[a.dest].name, earthTime: a.earthTime, shipTime: a.shipTime, warp: a.warp, endMs: a.endMs });
  // The lab's bookkeeping is mentioned only to those who have opened the lab.
  const logged = labUsed && !a.warp && lastTrial.at === a.at ? lastTrial : null;
  return (
    <div className="absolute bottom-3 left-1/2 z-20 w-[540px] max-w-[calc(100%-24px)] -translate-x-1/2">
      <div className={`panel-float appear ${a.warp ? '!border-hazard/50' : ''}`}>
        <div className="flex items-start gap-3 py-2.5 pl-4 pr-2.5">
          <div className="min-w-0 flex-1" role="status">
            <div className={`cap ${a.warp ? '!text-hazard' : '!text-ok'}`}>Arrived</div>
            <p className="mt-1 font-serif text-[16px] leading-snug text-fg">{text.headline}</p>
            {text.more && <p className="mt-1 font-serif text-[14px] leading-snug text-fg-2">{text.more}</p>}
          </div>
          <button className="btn btn-q btn-sq shrink-0" onClick={() => (travel.lastArrival = null)} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {(a.warp || logged) && (
          <div className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[11.5px] text-fg-2">
            {a.warp ? (
              <>
                <span className="text-hazard">Fiction, so nothing was recorded.</span>
                <button className="btn btn-sm ml-auto" onClick={() => void readMore('ftl')}>
                  Why
                </button>
              </>
            ) : (
              logged && (
                <>
                  <span>
                    Logged as Experiment {logged.exp.slice(1)}, {logged.exp === 'E5' ? `flight F${logged.n}` : `reading ${logged.n}`}.
                  </span>
                  <button
                    className="btn btn-sm ml-auto"
                    onClick={() => openExperiment(logged.exp)}
                    title="The lab keeps every flight as a reading"
                  >
                    Open Experiment {logged.exp.slice(1)}
                  </button>
                </>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FlightStrip() {
  const active = useUI((s) => s.tripActive);
  const planner = useUI((s) => s.plannerOpen);
  const recent = !!travel.lastArrival && performance.now() - travel.lastArrival.at < 60_000;
  useTicker(active ? 10 : 4, active || recent);
  const t = travel.trip;
  if (active && t) return <InFlight t={t} />;
  const a = travel.lastArrival;
  if (a && !planner && performance.now() - a.at < 60_000) return <Report />;
  return null;
}
