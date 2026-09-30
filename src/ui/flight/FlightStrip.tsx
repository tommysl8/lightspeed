/**
 * In flight, a compact readout along the bottom of the view: where you are going, how far
 * along you are, and four big numbers (speed, your clock, the clock at home, the distance
 * left), with the buttons a trip needs; beyond the Local Group two more, the universe's age and
 * the redshift of home. "Details" opens the full flight recorder. After arrival, a card sums the
 * trip up in words, and after a flight through the expanding universe says what has become of
 * home meanwhile (the home clock). With a body card open on a screen too narrow for both side by
 * side, the strip and its card move to the left (stripPlace, shared with the black-hole HUD).
 */
import type { ReactNode } from 'react';
import { C_KM_S } from '../../physics/constants';
import { bodyName } from '../../sim/bodies';
import { fmtBeta, qty, sci, sig } from '../../lib/sci';
import { formatClock } from '../../lib/format';
import { formatDurationShort, formatSimDate } from '../../lib/time';
import { controller } from '../../controls/cameraController';
import { chrono } from '../../sim/chronometer';
import { sim } from '../../sim/sim';
import { SHIP_RATE_MIN, cosmicReadings, jumpToArrival, stepRate, travel, tripElapsed, tripPace, tripState, type ArrivalSummary, type Trip } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { lastTrial } from '../../lab/logger';
import { stopTrip } from '../tripActions';
import { readMore } from '../explainerActions';
import { openExperiment } from '../onboarding';
import { Chevron, CloseIcon, Sym, useLocalState } from '../kit';
import { Icon } from '../icons';
import { useTicker } from '../useTicker';
import { theName } from '../../content/scenes';
import { OpticsSeg } from '../layout/Header';
import { rich } from '../rich';
import { keepCreditsClear } from '../viewport/PictureCredits';
import { FLRW_MODEL_NOTE, gText, arrivalCosmicText, arrivalText, homeClockText, lightYearsParts, redshiftText, speedText, yearsParts } from './tripText';

const DAY_S = 86_400;

/**
 * Where a panel along the bottom sits (this strip, its arrival card, and the black-hole HUD's, HoleStrip.tsx): centred;
 * with a body card open (300 px at the right, 16 px in, and 8 px clear), at the left and narrower wherever the two
 * would overlap, below 2 × (half its width + 324) px: 1,428 for the 780 px strips, 1,268 for 620, 1,208 for 560 and
 * 1,188 for 540. Phones keep it full width: the card scrolls instead. (The class names are written out whole so
 * the style sheet's scan finds them.)
 */
export function stripPlace(cardOpen: boolean, width: 780 | 620 | 560 | 540): string {
  if (!cardOpen) return 'left-1/2 -translate-x-1/2';
  const left = 'left-1/2 -translate-x-1/2 sm:left-3 sm:translate-x-0 sm:max-w-[calc(100%-340px)]';
  switch (width) {
    case 780:
      return `${left} min-[1428px]:left-1/2 min-[1428px]:-translate-x-1/2 min-[1428px]:max-w-[calc(100%-24px)]`;
    case 620:
      return `${left} min-[1268px]:left-1/2 min-[1268px]:-translate-x-1/2 min-[1268px]:max-w-[calc(100%-24px)]`;
    case 560:
      return `${left} min-[1208px]:left-1/2 min-[1208px]:-translate-x-1/2 min-[1208px]:max-w-[calc(100%-24px)]`;
    default:
      return `${left} min-[1188px]:left-1/2 min-[1188px]:-translate-x-1/2 min-[1188px]:max-w-[calc(100%-24px)]`;
  }
}

/** Whether a body card is open (the panels along the bottom make room for it). */
const useCardOpen = (): boolean => useUI((s) => s.bodyCard && !!s.selected);

/** A factor for the big readouts: "3.42", "1.2 × 10⁷". */
const bigFactor = (x: number): string => (x < 1e4 ? sig(x, 3) : sci(x, 2));
const YEAR_S = 365.25 * DAY_S;

// ─── The compact readout ────────────────────────────────────────────────────────────────

/** One of the four big numbers (also the black-hole HUD's, ui/flight/HoleStrip.tsx). */
export function Big({ label, value, unit, sub, tone }: { label: ReactNode; value: string; unit?: string; sub: string; tone?: 'data' | 'hazard' }) {
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

/** One cell of the full recorder (also the black-hole HUD's). */
export function Cell({ l, v, u, tone }: { l: ReactNode; v: string; u?: string; tone?: 'data' | 'hazard' | 'dim' }) {
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

/** The recorder's cells beyond the Local Group: cosmic time, the ship's clock, and distances in the growing universe. */
function CosmicCells({ t, elapsed, tau }: { t: Trip; elapsed: number; tau: number }) {
  const r = cosmicReadings(t);
  if (!r) return null;
  const tq = yearsParts(elapsed / YEAR_S);
  const tauq = Q(tau, 'time', 6);
  const diff = yearsParts(Math.max(0, elapsed - tau) / YEAR_S);
  const prop = lightYearsParts(r.properLeftKm);
  const com = lightYearsParts(r.comovingLeftKm);
  return (
    <div className="grid grid-cols-3 gap-y-1.5 px-0.5 pb-2 pt-1.5 sm:grid-cols-6">
      <Cell l={<>Cosmic time <Sym>t</Sym></>} v={tq.v} u={tq.u} tone="data" />
      <Cell l={<>Elapsed <Sym>τ</Sym> (ship)</>} v={tauq.v} u={tauq.u} tone="data" />
      <Cell l={<><Sym>t</Sym> − <Sym>τ</Sym></>} v={diff.v} u={diff.u} />
      <Cell l="Remaining, now" v={prop.v} u={prop.u} />
      <Cell l="Remaining, comoving" v={com.v} u={com.u} tone="dim" />
      <Cell l={<>Scale factor <Sym>a</Sym></>} v={sig(r.a, 7)} u="× today" tone="dim" />
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
      {t.cosmic ? (
        <CosmicCells t={t} elapsed={elapsed} tau={tau} />
      ) : (
        <div className="grid grid-cols-3 gap-y-1.5 px-0.5 pb-2 pt-1.5 sm:grid-cols-6">
          <Cell l={<>Elapsed <Sym>t</Sym> (S)</>} v={tq.v} u={tq.u} tone="data" />
          <Cell l={<>Elapsed <Sym>τ</Sym> (ship)</>} v={tauq?.v ?? 'undefined'} u={tauq?.u} tone={t.warp ? 'hazard' : 'data'} />
          <Cell l={<><Sym>t</Sym> − <Sym>τ</Sym></>} v={diffq?.v ?? '—'} u={diffq?.u} />
          <Cell l="Remaining (S)" v={dq.v} u={dq.u} />
          <Cell l={<>Remaining (S′), ÷<Sym>γ</Sym></>} v={dpq?.v ?? '—'} u={dpq?.u} tone={t.warp ? 'dim' : undefined} />
          <Cell l="Light-time, remaining" v={ltq.v} u={ltq.u} tone="dim" />
        </div>
      )}
      {t.cosmic && <div className="border-t border-line px-3 py-1 text-[10.5px] leading-snug text-fg-3">{FLRW_MODEL_NOTE} The ruler is comoving (the universe’s size today).</div>}
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

/** What the engine is doing on a flight through expanding space (its phases: burn, cruise, burn). */
function cosmicPhase(t: Trip, tau: number): string {
  const phases = t.cosmic!.plan.phases;
  const yr = tau / YEAR_S;
  const p = phases.find((ph) => yr < ph.endTauYr) ?? phases[phases.length - 1];
  return p.kind === 'accelerate' ? 'speeding up' : p.kind === 'cruise' ? 'cruising' : 'slowing down';
}

function InFlight({ t }: { t: Trip }) {
  const note = useUI((s) => s.journeyNote);
  const cardOpen = useCardOpen();
  const [details, setDetails] = useLocalState('lightspeed.flightDetails', false);
  const s = tripState(t);
  const elapsed = tripElapsed(t);
  const remD = Math.max(0, t.distance - s.covered);
  const progress = Math.min(1, Math.max(0, t.distance > 0 ? s.covered / t.distance : 1));
  const rocket = t.drive === 'rocket';
  const g = gText(t.accelG);
  const drive = (t.warp ? `${sig(t.beta, 3)}c, fiction` : rocket ? `${g} rocket` : `steady ${fmtBeta(t.beta)}c`) + (t.cosmic ? ' · expanding universe (model)' : '');
  const phase = t.cosmic ? cosmicPhase(t, s.tau) : rocket ? (s.tau < t.shipTime / 2 ? 'speeding up' : 'slowing down') : t.warp ? 'faster than light' : 'coasting';
  const speed = speedText(s, t.warp);
  const cr = cosmicReadings(t);
  const d = cr ? lightYearsParts(cr.properLeftKm) : qty(remD, 'length', 3);
  const long = elapsed > 30 * DAY_S;
  // Cosmic time at home: the clock's hours and days at first, then years, then millions and billions.
  const home = cr ? (elapsed < YEAR_S ? { v: formatClock(elapsed), u: undefined } : yearsParts(elapsed / YEAR_S)) : null;
  return (
    <div ref={keepCreditsClear} className={`panel-float appear absolute bottom-3 z-20 w-[780px] max-w-[calc(100%-24px)] ${stripPlace(cardOpen, 780)} ${t.warp ? '!border-hazard/50' : ''}`}>
      <div className={`flex items-center gap-2 px-3 pb-1 pt-2 ${t.warp ? 'hatch' : ''}`}>
        <span className={`cap shrink-0 ${t.warp ? '!text-hazard' : '!text-data'}`}>In flight</span>
        <span className="min-w-0 truncate text-[13px] text-fg">
          → {bodyName(t.dest)}
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
      {cr && home ? (
        <div className="overflow-hidden">
        <div className="-ml-px -mt-px grid grid-cols-2 sm:grid-cols-3 [&>*]:border-l [&>*]:border-t [&>*]:border-line">
          <Big label="Speed" value={speed.beta} unit="c" sub={`γ = ${speed.gamma}, past the galaxies`} />
          <Big label="Your clock" value={formatClock(s.tau)} sub="time on board" tone="data" />
          <Big label="At home" value={home.v} unit={home.u} sub="cosmic time since you left" tone="data" />
          <Big label="Distance left" value={d.v} unit={d.u} sub="now: space keeps growing" />
          <Big label="Universe age" value={sig(cr.ageGyr, 5)} unit="billion yr" sub={`×${sig(cr.a, 5)} today’s size`} tone="data" />
          {cr.homeLn1pZ < 0 ? (
            <Big label="Blueshift of home" value={`×${bigFactor(Math.exp(-cr.homeLn1pZ))}`} sub={`your speed, less the expansion’s ${redshiftText(cr.homeZExpansion)}`} />
          ) : (
            <Big label="Redshift of home" value={redshiftText(cr.homeZ)} sub={`expansion ${redshiftText(cr.homeZExpansion)}, the rest your speed`} />
          )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-line max-sm:[&>*:nth-child(3)]:border-l-0 max-sm:[&>*:nth-child(n+3)]:border-t">
          <Big label="Speed" value={speed.beta} unit="c" sub={`γ = ${speed.gamma}`} tone={t.warp ? 'hazard' : undefined} />
          <Big label="Your clock" value={t.warp ? 'undefined' : formatClock(s.tau)} sub="time on board" tone={t.warp ? 'hazard' : 'data'} />
          <Big label="At home" value={formatClock(elapsed)} sub={long ? formatSimDate(sim.timeMs, 'date') : 'time on Earth'} tone="data" />
          <Big label="Distance left" value={d.v} unit={d.u} sub={`light ${formatDurationShort(remD / C_KM_S, 2)}`} />
        </div>
      )}
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

/** After a flight through the expanding universe: the universe now, and the home clock. */
function CosmicReport({ a }: { a: ArrivalSummary }) {
  const [open, setOpen] = useLocalState('lightspeed.homeClock', true);
  const leg = a.cosmic!;
  const p = leg.plan;
  const departure = { z: p.home.redshift, afterDepartureYr: p.home.emissionAfterDepartureYr };
  const more = arrivalCosmicText({
    shipTime: a.shipTime,
    cosmicYears: p.cosmicTimeYr,
    ageGyr: p.arrival.timeGyr,
    growth: p.arrival.scale / p.departure.scale,
    home: a.homeOnArrival ?? { fromHome: true, inLocalGroup: false, ...departure },
    departure,
  });
  const rows = homeClockText(leg.home, p.arrival.timeGyr);
  return (
    <>
      <p className="mt-1 font-serif text-[14px] leading-snug text-fg-2">{more}</p>
      <button className="cap mt-2 flex items-center gap-1 hover:text-fg" aria-expanded={open} onClick={() => setOpen(!open)}>
        At home now
        <Chevron className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <dl className="scroll mt-1 max-h-[34vh] space-y-1 pr-1 text-[12px] leading-snug">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[118px_1fr] gap-2">
              <dt className="text-fg-3">{r.label}</dt>
              <dd className="text-fg-2">{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-1.5 text-[10.5px] leading-snug text-fg-3">
        {FLRW_MODEL_NOTE} The home clock quotes published models: the Sun’s future from Schröder & Connon Smith (2008), the Milky Way and Andromeda
        from Sawala et al. (2025), whose study stops 10 billion years from now.
      </p>
    </>
  );
}

function Report() {
  const a = travel.lastArrival!;
  const labUsed = useUI((s) => s.labUsed);
  const cardOpen = useCardOpen();
  const text = arrivalText({ destName: theName(bodyName(a.dest)), earthTime: a.earthTime, shipTime: a.shipTime, warp: a.warp, endMs: a.endMs });
  // The lab's bookkeeping is mentioned only to those who have opened the lab.
  const logged = labUsed && !a.warp && lastTrial.at === a.at ? lastTrial : null;
  return (
    <div ref={keepCreditsClear} className={`absolute bottom-3 z-20 ${a.cosmic ? 'w-[620px]' : 'w-[540px]'} max-w-[calc(100%-24px)] ${stripPlace(cardOpen, a.cosmic ? 620 : 540)}`}>
      <div className={`panel-float appear ${a.warp ? '!border-hazard/50' : ''}`}>
        <div className="flex items-start gap-3 py-2.5 pl-4 pr-2.5">
          <div className="min-w-0 flex-1" role="status">
            <div className={`cap ${a.warp ? '!text-hazard' : '!text-ok'}`}>Arrived</div>
            <p className="mt-1 font-serif text-[16px] leading-snug text-fg">{text.headline}</p>
            {a.cosmic ? <CosmicReport a={a} /> : text.more && <p className="mt-1 font-serif text-[14px] leading-snug text-fg-2">{text.more}</p>}
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

/** How long an arrival card stays (ms): longer after a flight through the expanding universe, which has the home clock to read. */
const cardLife = (a: ArrivalSummary): number => (a.cosmic ? 300_000 : 60_000);

/** Whether the arrival card is showing (the black-hole HUD, which sits in the same place, waits for it). */
export function arrivalCardShown(): boolean {
  const a = travel.lastArrival;
  return !!a && !useUI.getState().plannerOpen && performance.now() - a.at < cardLife(a);
}

export function FlightStrip() {
  const active = useUI((s) => s.tripActive);
  const planner = useUI((s) => s.plannerOpen);
  const recent = !!travel.lastArrival && performance.now() - travel.lastArrival.at < cardLife(travel.lastArrival);
  useTicker(active ? 10 : 4, active || recent);
  const t = travel.trip;
  if (active && t) return <InFlight t={t} />;
  const a = travel.lastArrival;
  if (a && !planner && performance.now() - a.at < cardLife(a)) return <Report />;
  return null;
}
