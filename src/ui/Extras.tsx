import { useState } from 'react';
import { quality } from '../render/quality';
import { useUI } from '../state/ui';
import { useTicker } from './useTicker';

/** Tiny frame-rate readout (toggle in the Layers menu). */
export function FpsMeter() {
  const show = useUI((s) => s.showFps);
  useTicker(2);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute bottom-[76px] right-4 z-10 rounded-md bg-black/50 px-2 py-1 text-[11px] tabular-nums text-white/70">
      {quality.fps.toFixed(0)} fps · {quality.dpr.toFixed(2)}× · cube {quality.cubeFace}
    </div>
  );
}

const WELCOME_KEY = 'lightspeed.welcomed';

function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

/** One-time hint for first visits. */
export function WelcomeCard() {
  const [open, setOpen] = useState(() => !wasWelcomed());
  const busy = useUI((s) => s.tripActive || s.plannerOpen || s.explainerOpen || s.selected !== null);
  if (!open || busy) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <div className="glass fade-in pointer-events-auto absolute bottom-28 left-4 z-10 w-[330px] px-4 py-3.5">
      <div className="text-[13.5px] font-semibold text-white">Everything here is to scale.</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">
        Real positions for today, real distances, and light that really takes time to cross them. Planets are specks at
        true scale; switch to <b className="text-white">Visible</b> to enlarge them.
      </p>
      <ul className="mt-2 space-y-1 text-[12px] text-white/65">
        <li>
          <kbd className="kbd">G</kbd> fly somewhere at a fraction of the speed of light
        </li>
        <li>
          <kbd className="kbd">E</kbd> learn the physics behind what you see
        </li>
        <li>
          <kbd className="kbd">?</kbd> all shortcuts
        </li>
      </ul>
      <button className="btn-primary mt-3 h-8 w-full" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
