import { BODIES, BODY_ORDER } from '../../physics/constants';
import { qty, sci } from '../../lib/sci';
import { rich } from '../rich';
import { controller } from '../../controls/cameraController';
import { quality } from '../../render/quality';
import { WARP_STEPS, resetToNow, setPaused, setWarp } from '../../sim/clock';
import { useUI } from '../../state/ui';
import { BODY_KEYS, goToBody } from '../navigation';
import { Kbd, Seg } from '../kit';
import { useTicker } from '../useTicker';

function Transport() {
  const warp = useUI((s) => s.warp);
  const paused = useUI((s) => s.paused);
  const tripActive = useUI((s) => s.tripActive);
  const r = qty(warp, 'time', 3);
  return (
    <div className="flex shrink-0 items-center gap-2" data-tour="time">
      <button
        className="btn btn-sq"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
        title={paused ? 'Resume (Space)' : 'Pause (Space)'}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {paused ? (
          <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <path d="M2 1v8l7-4z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <rect x="1.5" y="1" width="2.4" height="8" />
            <rect x="6.1" y="1" width="2.4" height="8" />
          </svg>
        )}
      </button>
      <span className="cap max-md:hidden" title="Simulated seconds per real second">
        Rate
      </span>
      <Seg
        className="[&_.seg-b]:font-mono [&_.seg-b]:tabular-nums [&_.seg-b]:!px-1.5 [&_.seg-b]:!text-[11px] lg:[&_.seg-b]:!px-2 lg:[&_.seg-b]:!text-[12.5px]"
        label="Simulation rate"
        value={String(warp)}
        onChange={(v) => setWarp(Number(v))}
        options={WARP_STEPS.map((w) => ({
          value: String(w),
          label: (
            <>
              10<sup className="sup">{Math.round(Math.log10(w))}</sup>
            </>
          ),
          title: w === 1 ? 'Real time ([ / ])' : `1 s of real time = ${qty(w, 'time', 3).v} ${qty(w, 'time', 3).u} simulated ([ / ])`,
        }))}
      />
      <span className="mono w-[104px] whitespace-nowrap text-[12.5px] text-fg-2 max-[1799px]:hidden" title="Simulated time per real second">
        1 s ↦ {r.v} {r.u}
      </span>
      <button
        className="btn"
        onClick={resetToNow}
        disabled={tripActive}
        title={tripActive ? 'Unavailable in flight: time cannot run backwards' : 'Return to the present, real time; zeroes the chronometers (N)'}
      >
        Now
      </button>
    </div>
  );
}

function Targets() {
  const focus = useUI((s) => s.focus);
  const selected = useUI((s) => s.selected);
  const tripActive = useUI((s) => s.tripActive);
  return (
    <nav
      className="scroll-fade-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar"
      aria-label="Bodies"
      data-tour="targets"
      // On narrow screens the list scrolls sideways; let an ordinary mouse wheel do it.
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
      }}
    >
      <span className="cap mr-1 shrink-0 max-[1535px]:hidden">Target</span>
      {BODY_ORDER.map((id) => (
        <button
          key={id}
          className={`btn btn-q btn-sm shrink-0 !gap-1.5 ${selected === id ? '!text-accent' : ''}`}
          aria-pressed={focus === id && !tripActive}
          onClick={() => (tripActive ? useUI.getState().select(id) : goToBody(id))}
          onDoubleClick={() => !tripActive && controller.goTo(id)}
          title={`${tripActive ? 'Select' : 'Slew to'} ${BODIES[id].name}${BODY_KEYS[id] ? ` (${BODY_KEYS[id]})` : ''}`}
        >
          {BODY_KEYS[id] && <span className="mono text-[11px] text-fg-3 max-[1535px]:hidden">{BODY_KEYS[id]}</span>}
          {id === 'proxima' ? 'Proxima' : BODIES[id].name}
        </button>
      ))}
    </nav>
  );
}

function Status() {
  useTicker(2);
  const mode = useUI((s) => s.controlMode);
  const focus = useUI((s) => s.focus);
  const showFps = useUI((s) => s.showFps);
  const throttle = useUI((s) => s.throttleBeta);
  let text: React.ReactNode;
  if (mode === 'free') {
    text = (
      <>
        <span className="text-accent">FREE FLIGHT</span>
        <span className="text-fg-3 max-2xl:hidden">
          {' '}
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd> <Kbd>Q</Kbd>
          <Kbd>E</Kbd> · wheel throttle ·{' '}
        </span>
        <span className="text-fg-2"> thr {rich(sci(throttle || controller.throttleBeta, 2))} c</span>
      </>
    );
  } else if (mode === 'travel') text = <span className="text-data">IN TRANSIT</span>;
  else if (mode === 'transition') text = <span className="text-fg-2">SLEWING → {BODIES[focus].name.toUpperCase()}</span>;
  else text = <span className="text-fg-2">ORBIT · {BODIES[focus].name.toUpperCase()}</span>;
  // The view's own readout repeats the camera mode, so on narrower screens the status gives
  // its room to the target bar (except in free flight, where it carries the throttle).
  const hide = mode === 'free' || showFps ? 'max-md:hidden' : 'max-[1535px]:hidden';
  return (
    <>
      <div className={`h-4 w-px shrink-0 bg-line-2 ${hide}`} />
      <div className={`mono flex shrink-0 items-center gap-3 whitespace-nowrap text-[12px] tracking-[0.06em] ${hide}`}>
        <span>{text}</span>
        {showFps && (
          <span className="text-fg-3" title="Frames per second · device pixel ratio · relativistic cube-map face size">
            {quality.fps.toFixed(0)} fps · {quality.dpr.toFixed(2)}× · {quality.cubeFace}²
          </span>
        )}
      </div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="app-ftr flex min-w-0 items-center gap-3 border-t border-line-2 bg-panel px-3">
      <Transport />
      <div className="h-4 w-px shrink-0 bg-line-2" />
      <Targets />
      <Status />
    </footer>
  );
}
