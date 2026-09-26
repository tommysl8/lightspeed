/**
 * The header: the name (it opens About), the date chip, and on the right the ways in: "Where
 * to?" (the one amber button), Journeys, Learn, the Lab for students and the View menu.
 * Everything technical (instruments, hints, layers, optics) lives in the View menu.
 *
 * Labels give way to icons as the screen narrows, "Where to?" last. Widths were worked out
 * from the font metrics for 375 to 1920 px; see the notes by each breakpoint.
 */
import { useMemo, useState } from 'react';
import { Body, SearchRelativeLongitude } from 'astronomy-engine';
import { useShallow } from 'zustand/react/shallow';
import { EPOCH_MAX_MS, EPOCH_MIN_MS, resetToNow, setEpoch } from '../../sim/clock';
import { logEvent } from '../../lab/events';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { fixed, julianDate } from '../../lib/sci';
import { astroTimeAt, civilFromMs, formatSimDate, isDistantYear, msFromAstroTime } from '../../lib/time';
import { parseDateInput } from '../../lib/dateInput';
import { ephemerisQuality, qualityNote } from '../../sim/ephemeris';
import { openDoc, openLearn } from '../../state/route';
import { Check, Kbd, Menu, MenuHeading, Seg } from '../kit';
import { useTicker } from '../useTicker';
import { openJourneys, openSearch, toggleLab } from '../onboarding';
import { Icon } from '../icons';
import { Wordmark } from '../Logo';

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

// ─── The date chip ───────────────────────────────────────────────────────────────────────

/** "2026-09-24 14:03:27" (UTC); "-1999-03-12 00:00:00" before 1 CE. Read back by parseDateInput. */
const isoText = (ms: number) => formatSimDate(ms, 'input');

/** Next oppositions of the outer planets after the current date (where Astronomy Engine is precise). */
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

/** Buttons that load the next oppositions into the date field (worked out when the menu opens). */
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

/** The date setter inside the chip's menu. */
function DateSetter() {
  const tripActive = useUI((s) => s.tripActive);
  const [text, setText] = useState(() => isoText(sim.timeMs));
  const ms = parseDateInput(text);
  const inRange = Number.isFinite(ms) && ms >= EPOCH_MIN_MS && ms <= EPOCH_MAX_MS;
  const apply = () => {
    if (inRange && setEpoch(ms)) logEvent('SYS', `Date set to ${isoText(ms)} UTC; chronometers zeroed`);
  };
  return (
    <div className="px-2.5 pb-2 pt-1">
      <label className="cap mb-1.5 block" htmlFor="date-setter">
        Go to a date (UTC)
      </label>
      <input
        id="date-setter"
        className="fld w-full"
        value={text}
        placeholder="YYYY-MM-DD hh:mm:ss, or a year"
        spellCheck={false}
        aria-invalid={!inRange}
        aria-describedby="date-setter-help"
        onFocus={(e) => {
          setText(isoText(sim.timeMs));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
      <p id="date-setter-help" className="mt-1 text-[11px] leading-snug text-fg-3">
        A date and time such as 2026-09-25 14:00, or just a year: 1969, 500 BCE. Any year from 10,000 BCE to 9999.
      </p>
      {Number.isFinite(ms) && !inRange && <p className="mt-1 text-[11px] text-accent">Outside the years −9999 to 9999.</p>}
      {inRange && <p className="mt-1 text-[11px] leading-snug text-fg-2">{qualityNote(ms)}</p>}
      <OppositionPresets onPick={(t) => setText(isoText(t))} />
      <p className="mt-2 text-[11px] leading-snug text-fg-3">
        Every body moves to where it was (or will be) at once. Voyager 1 appears after its 1980 Saturn flyby. Both clocks on
        the instrument panel restart from zero, and any light pulse in flight is dropped.
      </p>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="mono mr-auto text-[10.5px] text-fg-3" title="Julian Date of the date shown now">
          JD {fixed(julianDate(sim.timeMs), 5, false)}
        </span>
        <button
          className="btn btn-sm"
          disabled={tripActive}
          onClick={() => {
            resetToNow();
            setText(isoText(sim.timeMs));
          }}
          title="Back to the present, in real time (N)"
        >
          Now
        </button>
        <button className="btn btn-pri btn-sm" disabled={tripActive || !inRange} onClick={apply}>
          Go to date
        </button>
      </div>
      {tripActive && <p className="mt-1.5 text-[11px] text-accent">Not in flight: time cannot be wound back on a trip.</p>}
    </div>
  );
}

/**
 * The date being shown. Amber, with a dot, whenever it is not the present (time paused, run
 * fast, or set, or a trip under way; Now brings it back); its tooltip says how exact the
 * planets' positions are at that date.
 */
function DateChip() {
  useTicker(4);
  const ms = sim.timeMs;
  // From the clock's own state, not from comparing dates: a live clock is the present however
  // the frames have run.
  const present = sim.live;
  const distant = isDistantYear(civilFromMs(ms).year);
  const date = formatSimDate(ms, 'date');
  const time = distant ? '' : formatSimDate(ms, 'time');
  const title = `${formatSimDate(ms, 'long')}${present ? ', now' : ''}. ${qualityNote(ms)} Click to change the date.`;
  return (
    <Menu
      tour="epoch"
      align="left"
      width={330}
      title={title}
      ariaLabel={`Date: ${formatSimDate(ms, 'long')}${present ? ', now' : ', not the present'}. Change the date`}
      buttonClassName={`btn btn-q ${present ? '' : '!border-accent/40 !bg-accent/[0.08] !text-accent'}`}
      label={
        <span className="mono flex items-center gap-1.5 whitespace-nowrap text-[12px] lg:text-[13.5px]">
          {!present && <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent" aria-hidden />}
          <span className={present ? 'text-fg' : ''}>{date}</span>
          {/* The time from 768 px, "UTC" from 1024 px (widths: see the file comment). */}
          {time && <span className={`max-md:hidden ${present ? 'text-fg' : ''}`}>{time}</span>}
          {time && <span className="text-fg-3 max-lg:hidden">UTC</span>}
        </span>
      }
    >
      <DateSetter />
    </Menu>
  );
}

// ─── The View menu ───────────────────────────────────────────────────────────────────────

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
      rightOpen: u.rightOpen,
      hints: u.hints,
    })),
  );
  const t = useUI.getState().toggle;
  return (
    <Menu
      tour="view-menu"
      title="View: display layers, optics, the instrument panel and help"
      ariaLabel="View"
      width={310}
      label={
        <>
          <Icon name="sliders" size={14} className="min-[900px]:hidden" />
          <span className="max-[899px]:hidden">View</span>
        </>
      }
    >
      {(close) => (
        <>
          <MenuHeading>Panels</MenuHeading>
          <Check checked={s.rightOpen} onChange={() => t('rightOpen')} kbd="I" hint="Every number, live: speed, both clocks, Doppler factors, light-times, the selected body’s data">
            Instrument panel
          </Check>
          <Check checked={s.hints} onChange={() => t('hints')} hint="A note the first time something happens, such as passing 0.1c, with a link to read more">
            Physics hints
          </Check>
          <MenuHeading>Scene</MenuHeading>
          <Check checked={s.showOrbits} onChange={() => t('showOrbits')} kbd="O">
            Orbits
          </Check>
          <Check checked={s.showLabels} onChange={() => t('showLabels')} kbd="L">
            Labels
          </Check>
          <Check checked={s.showBelts} onChange={() => t('showBelts')} kbd="B" hint="31,930 asteroids, Trojans and TNOs (JPL SBDB)">
            Small bodies
          </Check>
          <Check checked={s.showGrid} onChange={() => t('showGrid')} kbd="J">
            Ecliptic grid
          </Check>
          <Check checked={s.showOverlays} onChange={() => t('showOverlays')} kbd="U" hint="Scale bar and camera readout; in flight the reticle and apex markers">
            Readouts over the view
          </Check>
          <Check checked={s.retarded} onChange={() => t('retarded')} hint="Each body where it was when the light now arriving left it">
            Light-time correction
          </Check>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-2.5 pb-1 pt-2">
            <div>
              <div className="cap mb-1">Body size</div>
              <ScaleSeg />
            </div>
            <div>
              <div className="cap mb-1">Optics</div>
              <OpticsSeg />
            </div>
          </div>
          <p className="px-2.5 pb-1 text-[11px] leading-snug text-fg-3">Relativistic optics show above 0.01c, so in flight.</p>
          <MenuHeading>Options</MenuHeading>
          <Check checked={s.showFps} onChange={() => t('showFps')}>
            Performance readout
          </Check>
          <Check checked={s.shortcuts} onChange={() => t('shortcuts')} hint="Space, R, 0–9 and the rest. Turn off if they clash with assistive software.">
            Single-key shortcuts
          </Check>
          <div className="mt-1 flex flex-col border-t border-line px-1 pt-1">
            {(
              [
                ['book', 'Guide', () => openDoc('guide'), null],
                ['keyboard', 'Keyboard and mouse', () => useUI.setState({ keysOpen: true }), '?'],
                ['info', 'About Lightspeed', () => openDoc('about'), null],
              ] as const
            ).map(([icon, label, run, key]) => (
              <button
                key={label}
                className="btn btn-q btn-sm !h-7 !justify-start"
                onClick={() => {
                  close();
                  run();
                }}
              >
                <Icon name={icon} />
                {label}
                {key && (
                  <span className="ml-auto">
                    <Kbd>{key}</Kbd>
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </Menu>
  );
}

// ─── The header ──────────────────────────────────────────────────────────────────────────

/*
 * Widths, from IBM Plex Sans and JetBrains Mono metrics (12 px type below 1024 px, 13.5 px
 * from 1024), buttons 8–12 px padded:
 *   375 px   mark, date, then icons: search, Journeys, Learn, View. About 320 px.
 *   480 px   "Where to?" gets its label (+64 px).
 *   640 px   the name LIGHTSPEED (+104), the Lab icon (+34). About 540 px.
 *   768 px   the time on the chip (+64), "Journeys" (+57). About 700 px.
 *   900 px   "Learn", "Lab" and "View" in words (+100). About 800 px.
 *   1024 px  larger type, "UTC" on the chip. About 910 px.
 *   1280 px  the "/" key on the search button.
 *   1760 px  the tagline beside the name.
 */
export function Header() {
  const leftOpen = useUI((s) => s.leftOpen);
  return (
    <header className="app-hdr flex min-w-0 items-center gap-2 border-b border-line-2 bg-panel px-3 lg:gap-3">
      <a
        href="#/about"
        className="-mx-1 flex h-[30px] shrink-0 items-center rounded-[2px] px-1 hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent lg:h-9"
        title="About Lightspeed"
        onClick={(e) => {
          e.preventDefault();
          openDoc('about');
        }}
      >
        <Wordmark size={18} large subtitle nameBelowSm={false} />
      </a>

      <div className="mx-1 h-4 w-px shrink-0 bg-line-2 max-sm:hidden" />
      <DateChip />

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
        <button
          className="btn btn-pri"
          data-tour="search"
          onClick={openSearch}
          title="Where to? Find a planet, moon, spacecraft or star and go there (/ or Ctrl+K)"
          aria-label="Where to?"
        >
          <Icon name="search" size={14} />
          <span className="max-[479px]:hidden">Where to?</span>
          <span className="rounded-[2px] border border-black/25 px-1 font-mono text-[11px] leading-[16px] opacity-70 max-xl:hidden" aria-hidden>
            /
          </span>
        </button>
        <button
          className="btn btn-q"
          data-tour="journeys"
          onClick={openJourneys}
          title="Journeys: seven one-click trips and scenes, each with what to look for"
          aria-label="Journeys"
        >
          <Icon name="compass" size={14} className="text-accent" />
          <span className="max-md:hidden">Journeys</span>
        </button>
        <button className="btn btn-q" data-tour="learn" onClick={() => openLearn()} title="Learn: long reads on the science behind the view (E)" aria-label="Learn">
          <Icon name="book" size={14} />
          <span className="max-[899px]:hidden">Learn</span>
        </button>
        <button
          className="btn btn-q max-sm:hidden"
          data-tour="lab"
          aria-pressed={leftOpen}
          onClick={toggleLab}
          title="For students: five guided experiments (K)"
          aria-label="Lab"
        >
          <Icon name="flask" size={14} />
          <span className="max-[899px]:hidden">Lab</span>
        </button>
        <div className="mx-0.5 h-4 w-px shrink-0 bg-line-2 max-sm:hidden" />
        <ViewMenu />
      </div>
    </header>
  );
}
