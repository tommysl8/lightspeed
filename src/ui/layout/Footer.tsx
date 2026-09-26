/**
 * The footer: time on the left (pause, slower and faster with the rate in words, Now), where
 * you are in the middle (a breadcrumb, and the Bodies list), and on wide screens what the
 * camera is doing, with the keys sheet at the right.
 */
import { BODIES } from '../../physics/constants';
import { groupedDestinations } from '../../content/destinations';
import { sci, superscript } from '../../lib/sci';
import { rich } from '../rich';
import { controller } from '../../controls/cameraController';
import { quality } from '../../render/quality';
import { WARP_STEPS, resetToNow, setPaused, warpLabel } from '../../sim/clock';
import { SHIP_RATE_MIN, stepRate, travel, tripPace } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { frameSolarSystem, goToBody } from '../navigation';
import { locationPath } from '../location';
import { Kbd, Menu } from '../kit';
import { Icon } from '../icons';
import { useTicker } from '../useTicker';

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pace of time in words, and whether it can go slower or faster. */
function usePace() {
  const warp = useUI((s) => s.warp);
  const tripActive = useUI((s) => s.tripActive);
  useTicker(4, tripActive); // the ship rate lives outside React
  const trip = travel.trip;
  if (tripActive && trip?.pacing === 'ship') {
    const p = tripPace(trip);
    return {
      prefix: '1 s = ',
      text: `${p.onBoard} aboard`,
      title: `${p.text}. [ and ] change the pace of the trip; the readings stay exact.`,
      slower: trip.shipRate > SHIP_RATE_MIN,
      faster: trip.shipRate < Math.max(SHIP_RATE_MIN, trip.shipTime),
    };
  }
  const w = warpLabel(warp);
  const exp = Math.round(Math.log10(warp));
  return {
    prefix: '',
    text: capFirst(w),
    title:
      warp === 1
        ? 'Time runs as it does for you: real time ([ and ] change it)'
        : `Rate 10${superscript(exp)}: each real second, ${w.replace('/s', '')} pass ([ and ] change it)`,
    slower: warp > WARP_STEPS[0],
    faster: warp < WARP_STEPS[WARP_STEPS.length - 1],
  };
}

function Transport() {
  const paused = useUI((s) => s.paused);
  const tripActive = useUI((s) => s.tripActive);
  const pace = usePace();
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-tour="time">
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
      <div className="flex items-center" role="group" aria-label={tripActive ? 'Pace of the trip' : 'Rate of time'}>
        <button className="btn btn-q btn-sq" onClick={() => stepRate(-1)} disabled={!pace.slower} aria-label="Slower" title="Slower ([)">
          <Icon name="chevron-left" size={13} />
        </button>
        <span
          className="mono min-w-[6.5em] whitespace-nowrap px-0.5 text-center text-[12px] text-fg lg:min-w-[7.5em] lg:text-[13px]"
          title={pace.title}
          aria-live="polite"
        >
          {pace.prefix && <span className="text-fg-2 max-sm:hidden">{pace.prefix}</span>}
          {rich(pace.text)}
        </span>
        <button className="btn btn-q btn-sq" onClick={() => stepRate(1)} disabled={!pace.faster} aria-label="Faster" title="Faster (])">
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
      <button
        className={`btn ${tripActive ? 'max-sm:hidden' : ''}`}
        onClick={resetToNow}
        disabled={tripActive}
        title={tripActive ? 'Not in flight: time cannot run backwards' : 'Back to the present, in real time; both clocks restart from zero (N)'}
      >
        Now
      </button>
    </div>
  );
}

/** Every body you can visit, grouped, in a list that opens upwards. */
function BodiesMenu() {
  const tripActive = useUI((s) => s.tripActive);
  const selected = useUI((s) => s.selected);
  return (
    <Menu
      placement="above"
      align="left"
      width={280}
      title={tripActive ? 'Bodies: select one to see its card' : 'Bodies: every place you can go, by kind'}
      ariaLabel="Bodies"
      className="shrink-0"
      label={
        <>
          <Icon name="orbit" size={14} />
          <span className="max-sm:hidden">Bodies</span>
        </>
      }
    >
      {(close) =>
        groupedDestinations().map((g) => (
          <div key={g.id} className="pb-1">
            <div className="cap px-2.5 pb-0.5 pt-1.5">{g.title}</div>
            {g.items.map((d) => {
              const why = d.unavailable();
              return (
                <button
                  key={d.id}
                  className={`flex h-7 w-full items-center gap-2 px-2.5 text-left text-[12.5px] hover:bg-hover disabled:opacity-40 ${
                    selected === d.body ? 'text-accent' : 'text-fg'
                  }`}
                  disabled={!!why || (tripActive && !d.body)}
                  title={why ?? (tripActive ? `Select ${d.name}` : `Go to ${d.name}${d.key ? ` (${d.key})` : ''}`)}
                  onClick={() => {
                    close();
                    if (tripActive) {
                      if (d.body) useUI.getState().select(d.body);
                    } else d.go();
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {d.key && <Kbd>{d.key}</Kbd>}
                </button>
              );
            })}
          </div>
        ))
      }
    </Menu>
  );
}

/** "Solar System › Earth › Moon": where the camera is. Each level is a link. */
function Location() {
  const mode = useUI((s) => s.controlMode);
  const focus = useUI((s) => s.focus);
  const tripActive = useUI((s) => s.tripActive);
  const path = locationPath(mode, focus, tripActive ? (travel.trip?.dest ?? null) : null);
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1.5" aria-label="Where you are" data-tour="location">
      <ol className="flex min-w-0 items-center max-sm:hidden">
        {path.map((c, i) => {
          const last = i === path.length - 1;
          return (
            <li key={`${i}-${c.label}`} className={`flex min-w-0 items-center ${last ? '' : 'shrink-0'}`}>
              {i > 0 && (
                <span className="px-0.5 text-fg-4" aria-hidden>
                  ›
                </span>
              )}
              {c.to && !tripActive ? (
                <button
                  className={`btn btn-q btn-sm min-w-0 !px-1.5 ${last ? '!text-fg' : ''}`}
                  aria-current={last ? 'location' : undefined}
                  onClick={() => (c.to === 'solar-system' ? frameSolarSystem() : goToBody(c.to!))}
                  title={c.to === 'solar-system' ? 'See the whole Solar System' : `Go to ${BODIES[c.to!].name}`}
                >
                  <span className="truncate">{c.label}</span>
                </button>
              ) : (
                <span className={`truncate px-1.5 text-[11.5px] lg:text-[13px] ${last ? 'text-fg' : 'text-fg-2'}`} aria-current={last ? 'location' : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <BodiesMenu />
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
  // The breadcrumb already says where the camera is, so the status shows only on wide screens
  // (and in free flight, where it carries the throttle).
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
    <footer className="app-ftr flex min-w-0 items-center gap-2 border-t border-line-2 bg-panel px-3 lg:gap-3">
      <Transport />
      {/* Below 640 px the divider gives its room to the rate, whose longest label is 320 million years/s. */}
      <div className="h-4 w-px shrink-0 bg-line-2 max-sm:hidden" />
      <Location />
      <Status />
      <button
        className="btn btn-q btn-sq shrink-0 !font-mono max-md:hidden"
        onClick={() => useUI.setState({ keysOpen: true })}
        title="Keyboard and mouse (?)"
        aria-label="Keyboard and mouse"
      >
        ?
      </button>
    </footer>
  );
}
