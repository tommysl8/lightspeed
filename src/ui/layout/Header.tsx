import { useShallow } from 'zustand/react/shallow';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { fixed, julianDate } from '../../lib/sci';
import { Check, Kbd, Menu, MenuHeading, Seg } from '../kit';
import { useTicker } from '../useTicker';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Epoch readout: UTC date and time, and the Julian Date. */
function Epoch() {
  useTicker(10);
  const d = new Date(sim.timeMs);
  const ok = !Number.isNaN(d.getTime());
  const date = ok ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : '—';
  const time = ok ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : '';
  return (
    <div className="flex items-baseline gap-3 whitespace-nowrap" title="Simulation epoch (UTC) and Julian Date">
      <span className="cap">Epoch</span>
      <span className="mono text-[12px] text-fg">
        {date} <span className="text-fg">{time}</span> <span className="text-fg-3">UTC</span>
      </span>
      <span className="mono hidden text-[11.5px] text-fg-2 min-[1360px]:inline">
        <span className="text-fg-3">JD</span> {fixed(julianDate(sim.timeMs), 5, false)}
      </span>
    </div>
  );
}

function DisplayMenu() {
  const s = useUI(
    useShallow((u) => ({
      showOrbits: u.showOrbits,
      showLabels: u.showLabels,
      showBelts: u.showBelts,
      showOverlays: u.showOverlays,
      retarded: u.retarded,
      showFps: u.showFps,
    })),
  );
  const t = useUI.getState().toggle;
  return (
    <Menu label="Display" title="Display layers and overlays" width={280}>
      <MenuHeading>Scene</MenuHeading>
      <Check checked={s.showOrbits} onChange={() => t('showOrbits')} kbd="O" hint="Osculating orbits from each body’s state vector">
        Orbits
      </Check>
      <Check checked={s.showLabels} onChange={() => t('showLabels')} kbd="L">
        Labels
      </Check>
      <Check checked={s.showBelts} onChange={() => t('showBelts')} kbd="B" hint="31 930 catalogued asteroids, Trojans and TNOs (JPL SBDB)">
        Small bodies
      </Check>
      <MenuHeading>Instruments</MenuHeading>
      <Check checked={s.showOverlays} onChange={() => t('showOverlays')} kbd="U" hint="Reticle, apex markers, scale bar, axis triad">
        Viewport overlays
      </Check>
      <Check
        checked={s.retarded}
        onChange={() => t('retarded')}
        hint="Draw each body where it was when the light now arriving left it"
      >
        Light-time correction
      </Check>
      <Check checked={s.showFps} onChange={() => t('showFps')} hint="Frame rate, pixel ratio and cube-map size in the status bar">
        Performance readout
      </Check>
    </Menu>
  );
}

export function Header() {
  const relMode = useUI((s) => s.relMode);
  const sizeMode = useUI((s) => s.sizeMode);
  const leftOpen = useUI((s) => s.leftOpen);
  const rightOpen = useUI((s) => s.rightOpen);
  const toggle = useUI((s) => s.toggle);

  return (
    <header className="app-hdr flex min-w-0 items-center gap-3 border-b border-line-2 bg-panel px-2">
      <button
        className="btn btn-q"
        aria-pressed={leftOpen}
        onClick={() => toggle('leftOpen')}
        title="Lab manual: experiments, notebook, reference (K)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
          <rect x="1.5" y="1.5" width="9" height="9" />
          <path d="M4.5 1.5v9" />
        </svg>
        <span className="max-md:hidden">Manual</span>
      </button>

      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="h-2 w-2 bg-accent" aria-hidden />
        <span className="mono text-[12px] font-semibold tracking-[0.2em] text-fg">LIGHTSPEED</span>
        <span className="hidden text-[11px] text-fg-3 min-[1760px]:inline">Virtual laboratory for special relativity</span>
      </div>

      <div className="mx-1 h-4 w-px bg-line-2 max-sm:hidden" />
      <div className="max-sm:hidden">
        <Epoch />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="cap hidden min-[1560px]:inline">Optics</span>
        <Seg
          label="Optics model"
          value={relMode}
          onChange={(m) => useUI.setState({ relMode: m })}
          options={[
            { value: 'off', label: 'Classical', title: 'Classical (Galilean) optics: no aberration or Doppler shift (Z)' },
            { value: 'on', label: 'Relativistic', title: 'Relativistic optics: aberration, Doppler shift and beaming, active above 0.01c (Z)' },
            { value: 'split', label: 'Split', title: 'Split screen: classical left of the divider, relativistic right (X)' },
          ]}
        />
        <span className="cap ml-1 hidden min-[1560px]:inline">Scale</span>
        <Seg
          label="Body scale"
          value={sizeMode}
          onChange={(m) => useUI.getState().setSizeMode(m)}
          options={[
            { value: 'true', label: 'True', title: 'Every body at its true size (T)' },
            { value: 'visible', label: 'Enlarged', title: 'Bodies drawn at least 4 px across; distances unchanged (T)' },
          ]}
        />
        <div className="mx-0.5 h-4 w-px bg-line-2" />
        <DisplayMenu />
        <button
          className="btn btn-q"
          onClick={() => useUI.setState({ helpOpen: true })}
          title="Operating reference: controls and conventions (?)"
        >
          Controls <Kbd>?</Kbd>
        </button>
        <button className="btn btn-q" onClick={() => useUI.setState({ aboutOpen: true })} title="Sources, methods and credits">
          Sources
        </button>
      </div>

      <button
        className="btn btn-q"
        aria-pressed={rightOpen}
        onClick={() => toggle('rightOpen')}
        title="Instrument panel (I)"
      >
        <span className="max-md:hidden">Instruments</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
          <rect x="1.5" y="1.5" width="9" height="9" />
          <path d="M7.5 1.5v9" />
        </svg>
      </button>
    </header>
  );
}
