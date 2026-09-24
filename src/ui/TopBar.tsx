import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { useTicker } from './useTicker';
import { formatUtc } from '../lib/format';
import { TimeControls } from './TimeControls';

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button className={`chip ${on ? 'chip-on' : ''}`} onClick={onClick} title={title} aria-pressed={on}>
      {children}
    </button>
  );
}

export function TopBar() {
  useTicker(8);
  const sizeMode = useUI((s) => s.sizeMode);
  const showOrbits = useUI((s) => s.showOrbits);
  const showLabels = useUI((s) => s.showLabels);
  const showBelts = useUI((s) => s.showBelts);
  const retarded = useUI((s) => s.retarded);
  const { toggle, setSizeMode } = useUI.getState();
  const { date, time } = formatUtc(sim.timeMs);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
      <div className="glass pointer-events-auto flex items-center gap-4 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(253,230,138,0.9)]" />
          <span className="text-[13px] font-semibold tracking-[0.2em] text-white/90">LIGHTSPEED</span>
        </div>
        <div className="h-5 w-px bg-white/10" />
        <div className="w-[92px] leading-tight">
          <div className="text-[13px] tabular-nums text-white/90">{date}</div>
          <div className="text-[11px] tabular-nums text-white/50">{time}</div>
        </div>
        <div className="h-5 w-px bg-white/10" />
        <TimeControls />
      </div>

      <div className="glass pointer-events-auto flex items-center gap-1.5 p-1.5">
        <div className="flex rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Size mode">
          {(['true', 'visible'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={sizeMode === m}
              className={`seg ${sizeMode === m ? 'seg-on' : ''}`}
              onClick={() => setSizeMode(m)}
              title={m === 'true' ? 'True scale: every body at its real size (T)' : 'Visible: bodies enlarged to stay visible; distances stay true (T)'}
            >
              {m === 'true' ? 'True scale' : 'Visible'}
            </button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <Toggle on={showOrbits} onClick={() => toggle('showOrbits')} title="Orbits (O)">
          Orbits
        </Toggle>
        <Toggle on={showLabels} onClick={() => toggle('showLabels')} title="Labels (L)">
          Labels
        </Toggle>
        <Toggle on={showBelts} onClick={() => toggle('showBelts')} title="Asteroid & Kuiper belts (B)">
          Belts
        </Toggle>
        <Toggle
          on={retarded}
          onClick={() => toggle('retarded')}
          title="Light-delayed positions: draw every body where it was when the light now reaching you left it"
        >
          Light delay
        </Toggle>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button className="chip w-8 justify-center" onClick={() => toggle('helpOpen')} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          ?
        </button>
      </div>
    </div>
  );
}
