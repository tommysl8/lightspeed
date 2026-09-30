/**
 * Static viewport furniture: viewfinder corners, view information, annunciator lamps, the
 * event console, the split-view divider, the body card and physics notes, journey notes,
 * and the warning band shown while the fictional warp is engaged. The top left is one column:
 * what the camera is doing (the view readout, or Roam's panel while flying by hand), the
 * messages, then the layers' cards.
 *
 * Near a black hole: the range to it is its height above the horizon (exact, sim/gravity.ts), the
 * lamps say how much faster home's clock runs ("Home ×N") and when a fall is under way, and the split
 * view's halves are named for who sees them (an observer hovering there, or a raindrop in a fall, and
 * the ship), since the left half is no longer free of Doppler shifts: the hole's lens and its blueshift
 * show at rest too. The Home ×N lamp follows the black-hole panel: it lights while the panel is open (or
 * with View › Open the black-hole panel automatically on), not by itself beside the chip.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { bodyName } from '../../sim/bodies';
import { explainerById } from '../../content/explainers';
import { qty, sig } from '../../lib/sci';
import { heightParts } from '../deepSkyText';
import { relView } from '../../render/relativisticView';
import { lens } from '../../render/lens/lensState';
import { gravity } from '../../sim/gravity';
import { holeChipShown, holeStripShown, timesText } from '../flight/HoleStrip';
import { RoamPanel } from '../flight/RoamPanel';
import { pulses } from '../../sim/pulses';
import { sim } from '../../sim/sim';
import { travel, tripPace } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { useNotices } from '../notices';
import { readMore } from '../explainerActions';
import { CloseIcon, Kbd } from '../kit';
import { useTicker } from '../useTicker';
import { rich } from '../rich';
import { BodyCard } from './BodyCard';
import { formatSimDate } from '../../lib/time';
import { PictureCredits, keepCreditsClear } from './PictureCredits';
import { LayerCards } from './LayerCards';

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
  // Flying by hand, Roam's panel says what the camera is doing.
  if (!show || mode === 'roam' || mode === 'free') return null;
  const f = sim.bodies[focus];
  if (!f) return null;
  // A black hole's range is the height above its horizon (exact: the distance to its centre is 32 km coarse at Sgr A*),
  // written as the card and the panel along the bottom write it ("4000 au", ui/deepSkyText.ts heightParts).
  const hole = gravity.hole === focus && Number.isFinite(gravity.heightKm);
  const r = hole
    ? heightParts(gravity.heightKm)
    : Number.isFinite(f.distCamera)
      ? qty(f.distCamera, 'length', 4)
      : { v: '—', u: '' };
  const above = hole ? (gravity.heightKm < 0 ? ' inside the horizon' : ' above the horizon') : '';
  const label =
    mode === 'orbit' || mode === 'circular'
      ? 'ORBIT'
      : mode === 'transition'
        ? 'SLEW'
        : mode === 'fall'
          ? 'FALL'
          : mode === 'hold'
            ? 'SNAPSHOT'
            : 'TRANSIT';
  return (
    <div className="mono space-y-px pl-1 text-[10px] leading-[14px] text-fg-3 [text-shadow:0_0_3px_#000]">
      <div>
        <span className="inline-block w-11">VIEW</span>
        <span className="text-fg-2">
          {label}
          {mode !== 'travel' && ` · ${bodyName(focus).toUpperCase()}`}
        </span>
      </div>
      {mode !== 'travel' && (
        <div>
          <span className="inline-block w-11">RANGE</span>
          <span className="text-fg-2">
            {r.v} {r.u}
            {above}
          </span>
        </div>
      )}
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
  // A real trip plays by ship time, whatever the time warp is set to.
  const paced = travel.trip?.pacing === 'ship' ? tripPace(travel.trip) : null;
  const falling = mode === 'fall';
  const panelAuto = useUI((s) => s.holePanelAuto);
  // Deep in a black hole's gravity: how much faster home's clock runs than a clock here (from 1 %), while the
  // black-hole panel is open (its chip says it otherwise).
  const home = !falling && gravity.hole && gravity.alpha > 0 && (panelAuto || holeStripShown()) ? 1 / gravity.alpha : 1;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-wrap justify-center gap-1.5 px-40 max-md:px-4">
      {paused && <Lamp tone="white">Paused</Lamp>}
      {!paused && paced && (
        <Lamp tone="amber" title={paced.text}>
          1 s = {paced.onBoard} on board
        </Lamp>
      )}
      {!paused && !paced && warp > 1 && (
        <Lamp tone="amber" title="Simulated seconds per real second">
          Rate 10<sup className="sup">{Math.round(Math.log10(warp))}</sup>
        </Lamp>
      )}
      {mode === 'free' && <Lamp tone="amber">Free flight</Lamp>}
      {home >= 1.01 && (
        <Lamp tone="amber" title="Home’s clock runs this many times faster than a clock hovering here: the black hole’s gravity slows time">
          Home ×{timesText(home, gravity.oneMinusAlpha / gravity.alpha).replace('×', '')}
        </Lamp>
      )}
      {falling && (
        <Lamp tone="red" title="Falling freely into a black hole: nothing leaves one">
          Falling
        </Lamp>
      )}
      {relView.active && <Lamp tone="cyan">{relView.split ? 'Split optics' : 'Relativistic optics'}</Lamp>}
      {retarded && <Lamp tone="cyan">Light-time correction</Lamp>}
      {inFlight > 0 && <Lamp tone="cyan">{inFlight === 1 ? 'Pulse in flight' : `${inFlight} pulses in flight`}</Lamp>}
      {warpTrip && <Lamp tone="red">Non-physical state</Lamp>}
    </div>
  );
}

function fmtSimTime(ms: number) {
  return Number.isFinite(ms) ? formatSimDate(ms, 'time') : '';
}

/** What a screen reader hears: each notice (why something asked for did not happen), at once. */
function NoticeAnnouncer() {
  const last = useNotices().at(-1);
  return (
    <div className="sr-only" role="alert">
      {last?.text ?? ''}
    </div>
  );
}

/** The last few notices, fading out after 14 s. */
function NoticeConsole() {
  const events = useNotices();
  const now = performance.now();
  const live = events.length > 0 && now - events[events.length - 1].at < 14_000;
  useTicker(2, live);
  const recent = events.filter((e) => now - e.at < 14_000).slice(-5);
  if (!recent.length) return null;
  return (
    <div className="mono max-w-[min(620px,calc(100vw-32px))] space-y-px pl-1 text-[10.5px] leading-[15px] [text-shadow:0_0_3px_#000,0_0_2px_#000]" aria-hidden>
      {recent.map((e) => (
        <div key={e.id} className="truncate" style={{ opacity: Math.min(1, (14_000 - (now - e.at)) / 3000) }}>
          <span className="text-fg-3">{fmtSimTime(e.simMs)} </span>
          <span className="inline-block w-10 text-hazard">ERR</span>
          <span className="text-fg-2">{rich(e.text)}</span>
        </div>
      ))}
    </div>
  );
}

function SplitDivider() {
  const splitX = useUI((s) => s.splitX);
  const mode = useUI((s) => s.relMode);
  const falling = useUI((s) => s.controlMode === 'fall');
  useTicker(4, mode === 'split');
  // Near a black hole its lens (and its blueshift) show in both halves: each is named for who sees it.
  const holeView = lens.active;
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
        aria-label="Split between classical and relativistic views"
        aria-valuenow={Math.round(splitX * 100)}
        aria-valuemin={8}
        aria-valuemax={92}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          useUI.setState({ splitX: Math.min(0.92, Math.max(0.08, splitX + d)) });
        }}
      >
        <div className="mx-auto h-full w-px bg-fg/70" />
        <div className="absolute left-1/2 top-1/2 h-9 w-[7px] -translate-x-1/2 -translate-y-1/2 border border-fg/70 bg-black" />
      </div>
      <div className="mono pointer-events-none absolute top-10 z-20 -translate-x-full pr-3 text-right text-[10px] tracking-[0.1em] text-fg-2" style={{ left: `${splitX * 100}%` }}>
        {/* Beside a moving hole (Gaia BH3) the left half stays at rest relative to the Sun, not hovering. */}
        {holeView ? (falling ? 'FALLING FROM REST' : gravity.framePhi > 0 ? 'AT REST (SUN)' : 'HOVERING') : 'S · CLASSICAL'}
        <div className="text-[9.5px] tracking-normal text-fg-3">
          {holeView
            ? falling
              ? 'a raindrop’s view'
              : gravity.framePhi > 0
                ? // A moving hole (Gaia BH3: 570 km/s): the classical half stays at rest relative to the Sun, as everywhere.
                  `at rest relative to the Sun, ${sig(Math.tanh(gravity.framePhi) * 100, 2)} % of c from hovering here`
                : 'as seen by an observer at rest here'
            : 'no aberration, no Doppler shift'}
        </div>
      </div>
      <div className="mono pointer-events-none absolute top-10 z-20 pl-3 text-[10px] tracking-[0.1em] text-data" style={{ left: `${splitX * 100}%` }}>
        {holeView ? 'SHIP' : 'S′ · RELATIVISTIC'}
        <div className="text-[9.5px] tracking-normal text-fg-3">as seen from the ship</div>
      </div>
    </>
  );
}

/** The physics note that appears the first time something happens: one plain sentence, and a way to read more. */
function NoteToast() {
  const topic = useUI((s) => s.noteTopic);
  if (!topic) return null;
  const e = explainerById(topic);
  return (
    <div className="panel-float appear px-3 pb-2 pt-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-accent">Physics note</span>
        <span className="min-w-0 truncate font-serif text-[13px] text-fg">{e.title}</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ noteTopic: null })} aria-label="Dismiss">
          <CloseIcon />
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-fg-2">{e.blurb}</p>
      <button className="btn btn-sm mt-1.5" onClick={() => void readMore(topic)}>
        Read more
      </button>
    </div>
  );
}

/** Top-right stack: the selected body's card, then any physics note. */
function RightStack() {
  const tripActive = useUI((s) => s.tripActive);
  useTicker(4, tripActive);
  // Below the warning band while the fictional warp is engaged.
  const low = tripActive && !!travel.trip?.warp;
  return (
    <div className={`absolute right-4 z-20 flex w-[300px] max-w-[calc(100%-32px)] flex-col gap-2 ${low ? 'top-[76px]' : 'top-[38px]'}`}>
      <BodyCard />
      <NoteToast />
    </div>
  );
}

/** What to look for on a journey that is a scene rather than a flight (the flight recorder shows it in flight). */
function JourneyBanner() {
  const note = useUI((s) => s.journeyNote);
  const tripActive = useUI((s) => s.tripActive);
  const plannerOpen = useUI((s) => s.plannerOpen);
  // Near a black hole the HUD holds the note (ui/flight/HoleStrip.tsx); beside its chip the note sits above it.
  useTicker(2, !!note);
  if (!note || tripActive || plannerOpen || holeStripShown()) return null;
  return (
    <div className={`absolute inset-x-0 z-10 flex justify-center px-4 ${holeChipShown() ? 'bottom-[52px]' : 'bottom-10'}`}>
      <div ref={keepCreditsClear} className="panel-float appear flex max-w-[640px] items-start gap-3 py-2 pl-3.5 pr-1.5" role="note" aria-label="Journey">
        <span className="font-serif text-[13px] leading-snug text-fg-2">{note}</span>
        <button className="btn btn-q btn-sq -mt-0.5 shrink-0" onClick={() => useUI.setState({ journeyNote: null })} aria-label="Dismiss">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

const HINT_KEY = 'lightspeed.hinted';

/**
 * First visit only: how to move around, until the visitor first drags or scrolls in the view
 * (or after half a minute).
 */
function FirstHint() {
  const blocked = useUI((s) => s.welcomeOpen || s.tourStep !== null || s.tripActive || s.plannerOpen || s.journeysOpen || s.searchOpen || !!s.journeyNote);
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const flown = useUI((s) => s.tripActive);
  useEffect(() => {
    if (!show) return;
    const done = () => {
      setShow(false);
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        /* storage unavailable */
      }
    };
    // Whoever has taken a flight has found their way around.
    if (flown) {
      done();
      return;
    }
    if (blocked) return;
    const view = document.querySelector('.app-view');
    // Let the first gesture finish before the hint goes.
    const soon = () => window.setTimeout(done, 1200);
    const timer = window.setTimeout(done, 30_000);
    view?.addEventListener('pointerdown', soon, { once: true });
    view?.addEventListener('wheel', soon, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      view?.removeEventListener('pointerdown', soon);
      view?.removeEventListener('wheel', soon);
    };
  }, [show, blocked, flown]);
  if (!show || blocked) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center px-4">
      <div className="panel-float appear flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3.5 py-2 text-[12px] text-fg-2">
        <span>
          <b className="font-medium text-fg">Drag</b> to look around
        </span>
        <span className="text-line-3" aria-hidden>
          ·
        </span>
        <span>
          <b className="font-medium text-fg">Scroll</b> to zoom
        </span>
        <span className="text-line-3" aria-hidden>
          ·
        </span>
        <span>
          <b className="font-medium text-fg">Where to?</b> (or <Kbd>/</Kbd>) to visit anything
        </span>
        <span className="text-line-3 max-md:hidden" aria-hidden>
          ·
        </span>
        <span className="max-md:hidden">
          <b className="font-medium text-fg">Journeys</b> for set pieces
        </span>
      </div>
    </div>
  );
}

function WarpBand() {
  const active = useUI((s) => s.tripActive);
  useTicker(4, active);
  if (!active || !travel.trip?.warp) return null;
  return (
    <div className="hatch absolute inset-x-0 top-9 z-20 flex items-center justify-center gap-3 border-y border-hazard/50 bg-black/70 px-4 py-1.5">
      <span className="mono text-[10px] font-semibold tracking-[0.12em] text-hazard">NON-PHYSICAL</span>
      <span className="text-[12px] text-fg">
        Superluminal transfer: γ is imaginary, proper time and the relativistic optics are undefined. Shown for comparison only.
      </span>
      <button className="btn btn-sm btn-hazard" onClick={() => void readMore('ftl')}>
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
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] flex-col items-start gap-1.5">
        <ViewInfo />
        <RoamPanel />
        <NoticeConsole />
        <LayerCards />
      </div>
      <Annunciators />
      <WarpBand />
      <SplitDivider />
      <NoticeAnnouncer />
      <RightStack />
      <JourneyBanner />
      <FirstHint />
      <PictureCredits />
    </>
  );
}
