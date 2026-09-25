import { useMemo, useState } from 'react';
import { Body, SearchRelativeLongitude } from 'astronomy-engine';
import { useShallow } from 'zustand/react/shallow';
import { EPOCH_MAX_MS, EPOCH_MIN_MS, resetToNow, setEpoch } from '../../sim/clock';
import { logEvent } from '../../lab/events';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { fixed, julianDate } from '../../lib/sci';
import { astroTimeAt, civilFromMs, formatSimDate, isDistantYear, msFromAstroTime, parseSimDate } from '../../lib/time';
import { ephemerisQuality } from '../../sim/ephemeris';
import { openDoc } from '../../state/route';
import { Check, Menu, MenuHeading, Seg } from '../kit';
import { useTicker } from '../useTicker';
import { openPlanner } from '../tripActions';
import { Icon } from '../icons';
import { Wordmark } from '../Logo';

/** Epoch readout: UTC date and time (only the year, far from now), and the Julian Date. */
function Epoch() {
  useTicker(10);
  const ms = sim.timeMs;
  const distant = isDistantYear(civilFromMs(ms).year);
  const date = formatSimDate(ms, 'date');
  const time = distant ? '' : formatSimDate(ms, 'time');
  return (
    <div className="flex items-baseline gap-3 whitespace-nowrap" title={`Simulation epoch: ${formatSimDate(ms, 'long')}`}>
      <span className="cap max-xl:hidden">Epoch</span>
      <span className="mono text-[12px] text-fg lg:text-[13.5px]">
        {date} <span className="text-fg">{time}</span> <span className="text-fg-3 max-lg:hidden">UTC</span>
      </span>
      <span className="mono hidden text-[12.5px] text-fg-2 min-[1460px]:inline">
        <span className="text-fg-3">JD</span> {fixed(julianDate(sim.timeMs), 5, false)}
      </span>
    </div>
  );
}

export function OpticsSeg() {
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
        { value: 'visible', label: 'Enlarged', title: 'Bodies drawn at least 8 px across; distances unchanged (T)' },
      ]}
    />
  );
}

/** "2026-09-24 14:03:27" (UTC); "-1999-03-12 00:00:00" before 1 CE. Parsed back by parseSimDate. */
const isoText = (ms: number) => formatSimDate(ms, 'input');

/** Parse "YYYY-MM-DD[ hh:mm[:ss]]" as UTC (a leading minus, or a trailing BCE, for early years). */
const parseUtc = (text: string): number => parseSimDate(text);

/** Next oppositions of the outer planets after the current epoch (Astronomy Engine, where it is precise). */
function nextOppositions(fromMs: number): { name: string; ms: number }[] {
  if (ephemerisQuality(fromMs) !== 'precise') return [];
  const t = astroTimeAt(fromMs);
  return (['Mars', 'Jupiter', 'Saturn'] as const)
    .map((b): { name: string; ms: number } | null => {
      try {
        return { name: b, ms: msFromAstroTime(SearchRelativeLongitude(Body[b], 0, t)) };
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
        <div className="mono mt-1 text-[10px] text-fg-3">format YYYY-MM-DD hh:mm:ss, UTC; add BCE for early years</div>
        <OppositionPresets onPick={(t) => setText(isoText(t))} />
        <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
          Bodies move to their positions at this instant. The chronometers are zeroed and pulses in flight discarded. Any year
          from −9999 (10,000 BCE) to 9999: positions are precise for 1700–2200 and approximate from 3000 BCE to 3000 CE. Voyager 1
          appears after its 1980 Saturn flyby.
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

function ViewMenu() {
  const s = useUI(
    useShallow((u) => ({
      showOrbits: u.showOrbits,
      showLabels: u.showLabels,
      showBelts: u.showBelts,
      showOverlays: u.showOverlays,
      showGrid: u.showGrid,
      retarded: u.retarded,
      showFps: u.showFps,
      shortcuts: u.shortcuts,
    })),
  );
  const t = useUI.getState().toggle;
  return (
    <Menu label="View" title="Optics, scale and display layers" width={300}>
      <MenuHeading>Optics</MenuHeading>
      <div className="px-2.5 pb-1">
        <OpticsSeg />
        <p className="mt-1 text-[11px] leading-snug text-fg-3">Relativistic effects appear above 0.01c, so in flight.</p>
      </div>
      <MenuHeading>Body size</MenuHeading>
      <div className="px-2.5 pb-1">
        <ScaleSeg />
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
      <Check checked={s.showGrid} onChange={() => t('showGrid')} kbd="J" hint="Ecliptic longitude and latitude every 15°, with the axis triad">
        Ecliptic grid
      </Check>
      <MenuHeading>Readouts</MenuHeading>
      <Check checked={s.showOverlays} onChange={() => t('showOverlays')} kbd="U" hint="Scale bar and camera readout; in flight also the reticle and apex markers">
        Readouts over the view
      </Check>
      <Check
        checked={s.retarded}
        onChange={() => t('retarded')}
        hint="Draw each body where it was when the light now arriving left it"
      >
        Light-time correction
      </Check>
      <MenuHeading>Options</MenuHeading>
      <Check checked={s.showFps} onChange={() => t('showFps')} hint="Frame rate, pixel ratio and cube-map size in the status bar">
        Performance readout
      </Check>
      <Check checked={s.shortcuts} onChange={() => t('shortcuts')} hint="Single-key shortcuts such as Space, R and 0–9. Turn off if they clash with assistive software.">
        Keyboard shortcuts
      </Check>
      <div className="mt-1 flex flex-wrap gap-x-3 border-t border-line px-2.5 pt-1.5">
        <button className="btn btn-q btn-sm -ml-1.5" onClick={() => useUI.setState({ keysOpen: true })}>
          <Icon name="keyboard" />
          Keyboard and mouse…
        </button>
        <button className="btn btn-q btn-sm -ml-1.5" onClick={() => openDoc('about')}>
          <Icon name="info" />
          About Lightspeed…
        </button>
      </div>
    </Menu>
  );
}

export function Header() {
  const leftOpen = useUI((s) => s.leftOpen);
  const rightOpen = useUI((s) => s.rightOpen);
  const tripActive = useUI((s) => s.tripActive);
  const toggle = useUI((s) => s.toggle);

  return (
    <header className="app-hdr flex min-w-0 items-center gap-2 border-b border-line-2 bg-panel px-3 lg:gap-3">
      <button
        className="btn btn-q"
        data-tour="physics"
        aria-pressed={leftOpen}
        onClick={() => toggle('leftOpen')}
        title="Physics: what you are seeing, explained; and the lab with its experiments (K)"
      >
        <Icon name="dock-left" size={14} />
        <span className="max-xl:hidden">Physics</span>
      </button>

      <a
        href="#/about"
        className="-mx-1 flex h-[30px] items-center lg:h-9 rounded-[2px] px-1 hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        title="About Lightspeed"
        onClick={(e) => {
          e.preventDefault();
          openDoc('about');
        }}
      >
        <Wordmark size={18} large subtitle nameBelowSm={false} />
      </a>

      <div className="mx-1 h-4 w-px bg-line-2 max-sm:hidden" />
      <div className="max-sm:hidden" data-tour="epoch">
        <EpochSetter />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <button
          className="btn btn-q"
          data-tour="journeys"
          onClick={() => useUI.setState({ journeysOpen: true })}
          title="Journeys: seven one-click trips and scenes, each with what to look for"
        >
          <Icon name="compass" size={14} className="text-accent" />
          <span className="max-md:hidden">Journeys</span>
        </button>
        <button
          className="btn btn-pri"
          data-tour="fly"
          disabled={tripActive}
          onClick={() => openPlanner()}
          title={tripActive ? 'In flight: abort or finish the trip first' : 'Plan a flight to any body at a chosen speed (G)'}
        >
          <Icon name="flight" size={14} />
          <span className="max-md:hidden">{tripActive ? 'In flight' : 'Plan flight'}</span>
        </button>
        <div className="mx-1 h-4 w-px bg-line-2" />
        <ViewMenu />
        <button className="btn btn-q" data-tour="guide" onClick={() => openDoc('guide')} title="Guide: how to use Lightspeed, and what you are looking at">
          <Icon name="book" size={14} />
          <span className="max-xl:hidden">Guide</span>
        </button>
      </div>

      <button
        className="btn btn-q"
        data-tour="instruments"
        aria-pressed={rightOpen}
        onClick={() => toggle('rightOpen')}
        title="Instruments: live readouts and the data sheet of the selected body (I)"
      >
        <span className="max-lg:hidden">Instruments</span>
        <Icon name="dock-right" size={14} />
      </button>
    </header>
  );
}
