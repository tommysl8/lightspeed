import { useCallback, useRef } from 'react';
import { formatBeta } from '../lib/format';
import { REL_THRESHOLD_BETA, relView } from '../render/relativisticView';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { useTicker } from './useTicker';

/** Segmented control: relativistic optics Off / On / Split (naive vs. relativistic). */
export function RelativityToggle() {
  const mode = useUI((s) => s.relMode);
  return (
    <div className="flex rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Relativistic view">
      {(['off', 'on', 'split'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          className={`seg !px-2.5 ${mode === m ? 'seg-on' : ''}`}
          onClick={() => useUI.setState({ relMode: m })}
          title={
            m === 'off'
              ? 'Classical (naive) view: no relativistic optics (Z)'
              : m === 'on'
                ? 'Relativistic view: aberration, Doppler shift and beaming, active above 0.01c (Z)'
                : 'Split screen: classical on the left, relativistic on the right (X)'
          }
        >
          {m === 'off' ? 'Classical' : m === 'on' ? 'Relativistic' : 'Split'}
        </button>
      ))}
    </div>
  );
}

const fmtD = (D: number) => (D >= 100 ? D.toFixed(0) : D >= 10 ? D.toFixed(1) : D >= 0.1 ? D.toFixed(2) : D.toExponential(1));

/** Divider and captions for the split view, plus a compact legend while the effect is active. */
export function RelativityOverlay() {
  useTicker(8);
  const doppler = useUI((s) => s.relDoppler);
  const splitX = useUI((s) => s.splitX);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    useUI.setState({ splitX: Math.min(0.9, Math.max(0.1, e.clientX / window.innerWidth)) });
  }, []);
  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const mode = useUI((s) => s.relMode);
  const cardOpen = useUI((s) => s.selected !== null);
  const beta = sim.ship.beta;
  if (mode === 'off' || relView.suspended) return null;
  const engaged = relView.active;
  const k = relView.k;

  return (
    <>
      {relView.split && (
        <>
          <div
            className="absolute inset-y-0 z-20 w-6 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${splitX * 100}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to compare classical and relativistic views"
          >
            <div className="mx-auto h-full w-px bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
            <div className="absolute left-1/2 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/60" />
          </div>
          <div className="pointer-events-none absolute top-[128px] z-20 -translate-x-full pr-3 text-right" style={{ left: `${splitX * 100}%` }}>
            <div className="badge border-white/15 bg-black/40 text-white/80">Classical (naive)</div>
          </div>
          <div className="pointer-events-none absolute top-[128px] z-20 pl-3" style={{ left: `${splitX * 100}%` }}>
            <div className="badge border-sky-300/30 bg-sky-400/10 text-sky-100">Relativistic</div>
          </div>
        </>
      )}
      {beta > REL_THRESHOLD_BETA * 0.5 && !cardOpen && (
        <div className="glass fade-in pointer-events-auto absolute right-4 top-[84px] z-10 w-[236px] px-4 py-3">
          <div className="stat-label">Relativistic optics</div>
          {engaged ? (
            <>
              <div className="mt-1 text-[12px] leading-relaxed text-white/75">
                At <b className="font-semibold text-white">{formatBeta(beta)}</b>, starlight from ahead arrives blueshifted by{' '}
                <b className="font-semibold tabular-nums text-sky-200">D = {fmtD(k)}</b>, from behind redshifted by{' '}
                <b className="font-semibold tabular-nums text-rose-200">D = {fmtD(1 / k)}</b>.
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-white/60">Doppler & beaming</span>
                <button
                  role="switch"
                  aria-checked={doppler}
                  className="switch"
                  onClick={() => useUI.setState({ relDoppler: !doppler })}
                  title="Turn off to see aberration alone"
                />
              </div>
            </>
          ) : (
            <div className="mt-1 text-[12px] leading-relaxed text-white/60">
              Below 0.01c the shift is under 0.6°, too small to see. Speed up to watch the sky change.
            </div>
          )}
        </div>
      )}
    </>
  );
}
