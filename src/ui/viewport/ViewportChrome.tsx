/**
 * Static viewport furniture: viewfinder corners, view information, annunciator lamps, the
 * event console, the split-view divider, reference margin notes and the warning band shown
 * while the fictional warp is engaged.
 */
import { useCallback, useRef, type ReactNode } from 'react';
import { BODIES } from '../../physics/constants';
import { explainerById, EXPLAINERS } from '../../content/explainers';
import { qty } from '../../lib/sci';
import { relView } from '../../render/relativisticView';
import { pulses } from '../../sim/pulses';
import { sim } from '../../sim/sim';
import { travel } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { useLabEvents, type EventKind } from '../../lab/events';
import { openExplainer } from '../explainerActions';
import { CloseIcon } from '../kit';
import { useTicker } from '../useTicker';
import { rich } from '../rich';

function Corners() {
  const c = 'vf-corner';
  return (
    <div className="pointer-events-none absolute inset-2" aria-hidden>
      <span className={c} style={{ left: 0, top: 0, borderLeftWidth: 1, borderTopWidth: 1 }} />
      <span className={c} style={{ right: 0, top: 0, borderRightWidth: 1, borderTopWidth: 1 }} />
      <span className={c} style={{ left: 0, bottom: 0, borderLeftWidth: 1, borderBottomWidth: 1 }} />
      <span className={c} style={{ right: 0, bottom: 0, borderRightWidth: 1, borderBottomWidth: 1 }} />
    </div>
  );
}

function ViewInfo() {
  useTicker(6);
  const mode = useUI((s) => s.controlMode);
  const focus = useUI((s) => s.focus);
  const show = useUI((s) => s.showOverlays);
  if (!show) return null;
  const f = sim.bodies[focus];
  const r = Number.isFinite(f.distCamera) ? qty(f.distCamera, 'length', 4) : { v: '—', u: '' };
  const label = mode === 'orbit' ? 'ORBIT' : mode === 'transition' ? 'SLEW' : mode === 'free' ? 'FREE' : 'TRANSIT';
  return (
    <div className="mono pointer-events-none absolute left-4 top-3 space-y-px text-[10px] leading-[14px] text-fg-3 [text-shadow:0_0_3px_#000]">
      <div>
        <span className="inline-block w-9">VIEW</span>
        <span className="text-fg-2">
          {label}
          {mode !== 'free' && mode !== 'travel' && ` · ${BODIES[focus].name.toUpperCase()}`}
        </span>
      </div>
      {mode !== 'travel' && (
        <div>
          <span className="inline-block w-9">RNG</span>
          <span className="text-fg-2">
            {r.v} {r.u}
          </span>
        </div>
      )}
      <div>
        <span className="inline-block w-9">FOV</span>
        <span className="text-fg-2">{sim.camera.fovDeg.toFixed(1)}° vert.</span>
      </div>
    </div>
  );
}

function Lamp({ tone, children, title }: { tone: 'amber' | 'cyan' | 'white' | 'red'; children: ReactNode; title?: string }) {
  return (
    <span className={`ann ann-${tone}`} title={title}>
      <span className="lamp" />
      {children}
    </span>
  );
}

function Annunciators() {
  useTicker(6);
  const warp = useUI((s) => s.warp);
  const paused = useUI((s) => s.paused);
  const retarded = useUI((s) => s.retarded);
  const mode = useUI((s) => s.controlMode);
  const inFlight = pulses.list.filter((p) => p.pending.size > 0 && sim.timeMs >= p.t0Ms).length;
  const warpTrip = !!travel.trip?.warp;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-wrap justify-center gap-1.5 px-40 max-md:px-4">
      {paused && <Lamp tone="white">Paused</Lamp>}
      {!paused && warp > 1 && (
        <Lamp tone="amber" title="Simulated seconds per real second">
          Rate 10<sup className="sup">{Math.round(Math.log10(warp))}</sup>
        </Lamp>
      )}
      {mode === 'free' && <Lamp tone="amber">Free flight</Lamp>}
      {relView.active && <Lamp tone="cyan">{relView.split ? 'Split optics' : 'Relativistic optics'}</Lamp>}
      {retarded && <Lamp tone="cyan">Light-time corr.</Lamp>}
      {inFlight > 0 && <Lamp tone="cyan">{inFlight === 1 ? 'Pulse in flight' : `${inFlight} pulses in flight`}</Lamp>}
      {warpTrip && <Lamp tone="red">Non-physical state</Lamp>}
    </div>
  );
}

const KIND_COLOR: Record<EventKind, string> = {
  DET: 'text-data',
  EMIT: 'text-data',
  REC: 'text-accent',
  ARR: 'text-ok',
  SYS: 'text-fg-3',
  ERR: 'text-hazard',
};

function fmtSimTime(ms: number) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(11, 19);
}

/** The last few lab events, fading out after 14 s. */
function EventConsole() {
  useTicker(2);
  const events = useLabEvents();
  const overlays = useUI((s) => s.showOverlays);
  const now = performance.now();
  const recent = events.filter((e) => now - e.at < 14_000).slice(-5);
  if (!recent.length) return null;
  return (
    <div
      className={`mono pointer-events-none absolute left-4 max-w-[min(620px,calc(100%-32px))] space-y-px text-[10.5px] leading-[15px] [text-shadow:0_0_3px_#000,0_0_2px_#000] ${
        overlays ? 'top-[62px]' : 'top-4'
      }`}
      aria-live="polite"
    >
      {recent.map((e) => (
        <div key={e.id} className="truncate" style={{ opacity: Math.min(1, (14_000 - (now - e.at)) / 3000) }}>
          <span className="text-fg-4">{fmtSimTime(e.simMs)} </span>
          <span className={`${KIND_COLOR[e.kind]} inline-block w-10`}>{e.kind}</span>
          <span className="text-fg-2">{rich(e.text)}</span>
        </div>
      ))}
    </div>
  );
}

function SplitDivider() {
  useTicker(4);
  const splitX = useUI((s) => s.splitX);
  const mode = useUI((s) => s.relMode);
  const dragging = useRef(false);
  const onDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const host = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    useUI.setState({ splitX: Math.min(0.92, Math.max(0.08, (e.clientX - host.left) / host.width)) });
  }, []);
  const onUp = useCallback(() => {
    dragging.current = false;
  }, []);
  if (mode !== 'split' || !relView.split) return null;
  return (
    <>
      <div
        className="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize"
        style={{ left: `${splitX * 100}%` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to move the split between classical and relativistic views"
      >
        <div className="mx-auto h-full w-px bg-fg/70" />
        <div className="absolute left-1/2 top-1/2 h-9 w-[7px] -translate-x-1/2 -translate-y-1/2 border border-fg/70 bg-black" />
      </div>
      <div className="mono pointer-events-none absolute top-10 z-20 -translate-x-full pr-3 text-right text-[10px] tracking-[0.1em] text-fg-2" style={{ left: `${splitX * 100}%` }}>
        S · CLASSICAL
        <div className="text-[9.5px] tracking-normal text-fg-3">no aberration, no Doppler shift</div>
      </div>
      <div className="mono pointer-events-none absolute top-10 z-20 pl-3 text-[10px] tracking-[0.1em] text-data" style={{ left: `${splitX * 100}%` }}>
        S′ · RELATIVISTIC
        <div className="text-[9.5px] tracking-normal text-fg-3">as seen from the ship</div>
      </div>
    </>
  );
}

function NoteToast() {
  const topic = useUI((s) => s.noteTopic);
  const tripActive = useUI((s) => s.tripActive);
  if (!topic) return null;
  // Below the warning band while the fictional warp is engaged.
  const low = tripActive && !!travel.trip?.warp;
  const e = explainerById(topic);
  const n = EXPLAINERS.findIndex((x) => x.id === topic) + 1;
  return (
    <div className={`absolute right-4 z-20 max-w-[calc(100%-32px)] ${low ? 'top-[76px]' : 'top-[38px]'}`}>
      <div className="panel-float appear flex items-center gap-3 py-1.5 pl-3 pr-1.5">
        <span className="cap !text-accent">Reference §{n}</span>
        <span className="font-serif text-[13px] text-fg">{e.title}</span>
        <button className="btn btn-sm" onClick={() => openExplainer(topic)}>
          Read
        </button>
        <button className="btn btn-q btn-sq !h-5 !w-5" onClick={() => useUI.setState({ noteTopic: null })} aria-label="Dismiss">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function WarpBand() {
  const active = useUI((s) => s.tripActive);
  useTicker(4);
  if (!active || !travel.trip?.warp) return null;
  return (
    <div className="hatch absolute inset-x-0 top-9 z-20 flex items-center justify-center gap-3 border-y border-hazard/50 bg-black/70 px-4 py-1.5">
      <span className="mono text-[10px] font-semibold tracking-[0.12em] text-hazard">NON-PHYSICAL</span>
      <span className="text-[12px] text-fg">
        Superluminal transfer: γ is imaginary, proper time and the relativistic optics are undefined. Shown for comparison only.
      </span>
      <button className="btn btn-sm btn-hazard" onClick={() => openExplainer('ftl')}>
        Why
      </button>
    </div>
  );
}

export function ViewportChrome() {
  const warp = useUI((s) => s.warp);
  const paused = useUI((s) => s.paused);
  return (
    <>
      {!paused && warp > 1 && <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_1px_rgba(240,167,58,0.55)]" />}
      <Corners />
      <ViewInfo />
      <Annunciators />
      <WarpBand />
      <SplitDivider />
      <EventConsole />
      <NoteToast />
    </>
  );
}
