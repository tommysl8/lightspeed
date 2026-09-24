import { formatDuration, formatNumber } from '../lib/format';
import { WARP_STEPS, resetToNow, setPaused, setWarp } from '../sim/clock';
import { useUI } from '../state/ui';

const warpLabel = (w: number) => (w >= 1e6 ? `${w / 1e6}M×` : w >= 1000 ? `${w / 1000}K×` : `${w}×`);

export function TimeControls() {
  const warp = useUI((s) => s.warp);
  const paused = useUI((s) => s.paused);
  const tripActive = useUI((s) => s.tripActive);
  return (
    <div className="flex items-center gap-1">
      <button
        className="chip w-8 justify-center"
        onClick={() => setPaused(!paused)}
        title={paused ? 'Resume (Space / P)' : 'Pause (Space / P)'}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {paused ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 1.5v9l7.5-4.5z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2.5" y="1.5" width="2.6" height="9" rx="0.6" />
            <rect x="6.9" y="1.5" width="2.6" height="9" rx="0.6" />
          </svg>
        )}
      </button>
      <div className="flex rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Time warp">
        {WARP_STEPS.map((w) => (
          <button
            key={w}
            role="radio"
            aria-checked={warp === w}
            className={`seg !px-1.5 tabular-nums ${warp === w ? (w === 1 ? 'seg-on' : 'seg-warp') : ''}`}
            onClick={() => setWarp(w)}
            title={w === 1 ? 'Real time' : `Time warp: 1 real second = ${formatDuration(w)} of simulated time`}
          >
            {warpLabel(w)}
          </button>
        ))}
      </div>
      <button
        className="chip"
        onClick={resetToNow}
        disabled={tripActive}
        title={tripActive ? 'Not available during a trip' : 'Back to the present, real time (N)'}
      >
        Now
      </button>
    </div>
  );
}

/** Impossible-to-miss indicator whenever time is not running at 1×. */
export function WarpBadge() {
  const warp = useUI((s) => s.warp);
  const paused = useUI((s) => s.paused);
  if (!paused && warp === 1) return null;
  return (
    <>
      {!paused && <div className="warp-frame pointer-events-none absolute inset-0 z-30" />}
      <div className="pointer-events-none absolute inset-x-0 top-[74px] z-30 flex justify-center">
        {paused ? (
          <div className="badge fade-in border-white/20 bg-white/10 text-white/85">Time paused</div>
        ) : (
          <div className="badge fade-in border-amber-300/40 bg-amber-300/15 text-amber-100">
            <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
            Time warp {formatNumber(warp)}× <span className="ml-2 text-amber-100/60">1 s = {formatDuration(warp)}</span>
          </div>
        )}
      </div>
    </>
  );
}
