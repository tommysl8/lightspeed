import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { useTicker } from './useTicker';
import { formatUtc } from '../lib/format';
import { TimeControls } from './TimeControls';
import { RelativityToggle } from './RelativityControls';

type LayerKey = 'showOrbits' | 'showLabels' | 'showBelts' | 'retarded' | 'showFps';

const LAYERS: { key: LayerKey; label: string; hint: string; kbd?: string }[] = [
  { key: 'showOrbits', label: 'Orbits', hint: 'Orbit lines and trails', kbd: 'O' },
  { key: 'showLabels', label: 'Labels', hint: 'Names and markers', kbd: 'L' },
  { key: 'showBelts', label: 'Belts', hint: 'Real asteroids, Trojans and Kuiper-belt objects', kbd: 'B' },
  { key: 'retarded', label: 'Light delay', hint: 'Draw each body where its light left it' },
  { key: 'showFps', label: 'Frame rate', hint: 'Show fps and render quality' },
];

/** Compact popover for the layer toggles. */
function LayersMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const state = useUI(
    useShallow((s) => ({
      showOrbits: s.showOrbits,
      showLabels: s.showLabels,
      showBelts: s.showBelts,
      retarded: s.retarded,
      showFps: s.showFps,
    })),
  );
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button className={`chip ${open ? 'chip-on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        Layers
        <svg className="ml-1" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="glass fade-in absolute right-0 top-10 z-40 w-[250px] p-2 max-sm:fixed max-sm:right-4 max-sm:top-[128px]" role="menu">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              role="menuitemcheckbox"
              aria-checked={state[l.key]}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
              onClick={() => useUI.getState().toggle(l.key as Parameters<UIState['toggle']>[0])}
            >
              <span>
                <span className="block text-[12.5px] text-white/90">
                  {l.label} {l.kbd && <kbd className="kbd ml-1">{l.kbd}</kbd>}
                </span>
                <span className="block text-[11px] text-white/45">{l.hint}</span>
              </span>
              <span className="switch pointer-events-none" aria-checked={state[l.key]} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  useTicker(8);
  const sizeMode = useUI((s) => s.sizeMode);
  const explainerOpen = useUI((s) => s.explainerOpen);
  const { toggle, setSizeMode } = useUI.getState();
  const { date, time } = formatUtc(sim.timeMs);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="glass no-scrollbar pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto px-4 py-2.5">
        <div className="flex items-center gap-2" title="Lightspeed">
          <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(253,230,138,0.9)]" />
          <span className="hidden text-[13px] font-semibold tracking-[0.18em] text-white/90 min-[1400px]:inline">LIGHTSPEED</span>
        </div>
        <div className="h-5 w-px bg-white/10" />
        <div className="w-[92px] shrink-0 whitespace-nowrap leading-tight">
          <div className="text-[13px] tabular-nums text-white/90">{date}</div>
          <div className="text-[11px] tabular-nums text-white/50">{time}</div>
        </div>
        <div className="h-5 w-px bg-white/10" />
        <TimeControls />
      </div>

      <div className="glass no-scrollbar pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto p-1.5 sm:overflow-visible">
        <RelativityToggle />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <div className="flex rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Size mode">
          {(['true', 'visible'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={sizeMode === m}
              className={`seg whitespace-nowrap ${sizeMode === m ? 'seg-on' : ''}`}
              onClick={() => setSizeMode(m)}
              title={m === 'true' ? 'True scale: every body at its real size (T)' : 'Visible: bodies enlarged to stay visible; distances stay true (T)'}
            >
              {m === 'true' ? 'True scale' : 'Visible'}
            </button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <LayersMenu />
        <button
          className={`chip ${explainerOpen ? 'chip-on' : ''}`}
          onClick={() => useUI.setState({ explainerOpen: !explainerOpen })}
          title="Physics explainers (E)"
        >
          Learn
        </button>
        <button className="chip w-8 justify-center" onClick={() => toggle('helpOpen')} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          ?
        </button>
        <button className="chip w-8 justify-center" onClick={() => toggle('aboutOpen')} title="About, credits and licences" aria-label="About">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="6.3" />
            <path d="M8 7.2v4.2M8 4.8v.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
