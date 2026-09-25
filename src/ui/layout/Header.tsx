import { useMemo, useState } from 'react';
import { Body, MakeTime, SearchRelativeLongitude } from 'astronomy-engine';
import { useShallow } from 'zustand/react/shallow';
import { EPOCH_MAX_MS, EPOCH_MIN_MS, resetToNow, setEpoch } from '../../sim/clock';
import { logEvent } from '../../lab/events';
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

function OpticsSeg() {
  const relMode = useUI((s) => s.relMode);
  return (
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
  );
}

function ScaleSeg() {
  const sizeMode = useUI((s) => s.sizeMode);
  return (
    <Seg
      label="Body scale"
      value={sizeMode}
      onChange={(m) => useUI.getState().setSizeMode(m)}
      options={[
        { value: 'true', label: 'True', title: 'Every body at its true size (T)' },
        { value: 'visible', label: 'Enlarged', title: 'Bodies drawn at least 4 px across; distances unchanged (T)' },
      ]}
    />
  );
}

/** "2026-09-24 14:03:27" (UTC). */
const isoText = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/** Parse "YYYY-MM-DD[ hh:mm[:ss]]" as UTC. */
function parseUtc(text: string): number {
  const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?$/);
  if (!m) return NaN;
  const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, 0) + Number(sec) * 1000;
  // Reject rolled-over dates such as 2026-02-31.
  return new Date(ms).getUTCDate() === +d ? ms : NaN;
}

/** Next oppositions of the outer planets after the current epoch (Astronomy Engine). */
function nextOppositions(fromMs: number): { name: string; ms: number }[] {
  const t = MakeTime(new Date(fromMs));
  return (['Mars', 'Jupiter', 'Saturn'] as const)
    .map((b): { name: string; ms: number } | null => {
      try {
        return { name: b, ms: SearchRelativeLongitude(Body[b], 0, t).date.getTime() };
      } catch {
        return null;
      }
    })
    .filter((x): x is { name: string; ms: number } => !!x && x.ms <= EPOCH_MAX_MS)
    .sort((a, b) => a.ms - b.ms);
}

/** Buttons that load the next oppositions into the epoch field (computed when the menu opens). */
function OppositionPresets({ onPick }: { onPick: (ms: number) => void }) {
  const list = useMemo(() => nextOppositions(sim.timeMs), []);
  if (!list.length) return null;
  return (
    <div className="mt-2">
      <div className="cap mb-1">Next oppositions</div>
      <div className="flex flex-wrap gap-1">
        {list.map((o) => (
          <button
            key={o.name}
            className="btn btn-sm"
            onClick={() => onPick(o.ms)}
            title={`${o.name} opposite the Sun as seen from Earth: ${isoText(o.ms)} UTC`}
          >
            {o.name} <span className="mono text-fg-3">{isoText(o.ms).slice(0, 10)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Epoch readout that opens a UTC date-time setter. */
function EpochSetter() {
  const tripActive = useUI((s) => s.tripActive);
  const [text, setText] = useState(() => isoText(sim.timeMs));
  const ms = parseUtc(text);
  const valid = Number.isFinite(ms) && ms >= EPOCH_MIN_MS && ms <= EPOCH_MAX_MS;
  return (
    <Menu label={<Epoch />} align="left" width={320} title="Simulation epoch: click to set">
      <div className="px-2.5 pb-2 pt-1">
        <div className="cap mb-1.5">Set epoch (UTC)</div>
        <input
          className="fld w-full"
          value={text}
          placeholder="YYYY-MM-DD hh:mm:ss"
          spellCheck={false}
          aria-label="Epoch, UTC"
          aria-invalid={!valid}
          onFocus={(e) => {
            setText(isoText(sim.timeMs));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid && setEpoch(ms)) logEvent('SYS', `Epoch set to ${isoText(ms)} UTC; chronometers zeroed`);
          }}
        />
        <div className="mono mt-1 text-[10px] text-fg-4">format YYYY-MM-DD hh:mm:ss, UTC</div>
        <OppositionPresets onPick={(t) => setText(isoText(t))} />
        <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
          Bodies move to their positions at this instant. The chronometers are zeroed and pulses in flight discarded. Valid 1981–2199;
          the Voyager 1 model begins after its 1980 Saturn flyby.
        </p>
        <div className="mt-2 flex justify-end gap-1.5">
          <button className="btn btn-sm" disabled={tripActive} onClick={() => {
              resetToNow();
              setText(isoText(sim.timeMs));
            }}>
            Now
          </button>
          <button
            className="btn btn-pri btn-sm"
            disabled={tripActive || !valid}
            onClick={() => {
              if (setEpoch(ms)) logEvent('SYS', `Epoch set to ${isoText(ms)} UTC; chronometers zeroed`);
            }}
          >
            Set epoch
          </button>
        </div>
        {tripActive && <p className="mt-1.5 text-[11px] text-accent">Unavailable in flight.</p>}
      </div>
    </Menu>
  );
}

function DisplayMenu() {
  const s = useUI(
    useShallow((u) => ({
      showOrbits: u.showOrbits,
      showLabels: u.showLabels,
      showBelts: u.showBelts,
      showOverlays: u.showOverlays,
      showGrid: u.showGrid,
      retarded: u.retarded,
      showFps: u.showFps,
    })),
  );
  const t = useUI.getState().toggle;
  return (
    <Menu label="Display" title="Display layers and overlays" width={280}>
      {/* On narrow screens the header's optics and scale controls live here. */}
      <div className="md:hidden">
        <MenuHeading>Optics</MenuHeading>
        <div className="px-2.5 pb-1">
          <OpticsSeg />
        </div>
        <MenuHeading>Body scale</MenuHeading>
        <div className="px-2.5 pb-1">
          <ScaleSeg />
        </div>
      </div>
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
      <Check checked={s.showGrid} onChange={() => t('showGrid')} kbd="J" hint="Ecliptic longitude and latitude every 15°; the ecliptic ticked every 10°">
        Ecliptic grid
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
      <div className="mt-1 border-t border-line px-2.5 pt-1.5 md:hidden">
        <button className="btn btn-q btn-sm -ml-1.5" onClick={() => useUI.setState({ aboutOpen: true })}>
          Sources and methods…
        </button>
      </div>
    </Menu>
  );
}

export function Header() {
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
        <EpochSetter />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="flex items-center gap-2 max-md:hidden">
          <span className="cap hidden min-[1560px]:inline">Optics</span>
          <OpticsSeg />
          <span className="cap ml-1 hidden min-[1560px]:inline">Scale</span>
          <ScaleSeg />
          <div className="mx-0.5 h-4 w-px bg-line-2" />
        </div>
        <DisplayMenu />
        <button
          className="btn btn-q"
          onClick={() => useUI.setState({ helpOpen: true })}
          title="Operating reference: controls and conventions (?)"
        >
          <span className="max-md:hidden">Controls</span> <Kbd>?</Kbd>
        </button>
        <button className="btn btn-q max-md:hidden" onClick={() => useUI.setState({ aboutOpen: true })} title="Sources, methods and credits">
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
