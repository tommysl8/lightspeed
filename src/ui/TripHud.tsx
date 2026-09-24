import { BODIES, C_KM_S } from '../physics/constants';
import { formatBeta, formatClock, formatDistance, formatDuration, formatNumber, formatSpeed } from '../lib/format';
import { controller } from '../controls/cameraController';
import { travel, tripElapsed, jumpToArrival, shipStateAt, type Trip } from '../sim/travel';
import { useUI } from '../state/ui';
import { stopTrip } from './tripActions';
import { openExplainer } from './explainerActions';
import { useTicker } from './useTicker';

function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const fmtGamma = (g: number) => (g < 1.0001 ? g.toFixed(8) : g < 10 ? g.toFixed(5) : g < 1000 ? g.toFixed(3) : g.toFixed(1));
const speedLabel = (t: { warp: boolean; beta: number }) => (t.warp ? `${formatNumber(t.beta, t.beta < 10 ? 1 : 0)}c` : formatBeta(t.beta));

function InFlight({ t }: { t: Trip }) {
  const elapsed = tripElapsed(t);
  const s = shipStateAt(t, elapsed);
  const remainingT = Math.max(0, t.earthTime - elapsed);
  const remainingTau = Math.max(0, t.shipTime - s.tau);
  const remainingD = Math.max(0, t.distance - s.covered);
  const progress = t.earthTime > 0 ? elapsed / t.earthTime : 1;
  const rocket = t.drive === 'rocket';
  const phase = rocket ? (elapsed < t.earthTime / 2 ? 'accelerating at 1 g' : 'flipped, braking at 1 g') : '';
  const explainerOpen = useUI.getState().explainerOpen;
  return (
    <div
      className={`glass fade-in pointer-events-auto absolute bottom-4 z-20 w-[760px] max-w-[calc(100vw-2rem)] px-5 py-4 ${
        explainerOpen ? 'left-[432px] min-[1650px]:left-1/2 min-[1650px]:-translate-x-1/2' : 'left-1/2 -translate-x-1/2'
      } ${t.warp ? '!border-fuchsia-300/30' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[11px] font-medium uppercase tracking-[0.16em] ${t.warp ? 'text-fuchsia-200' : rocket ? 'text-amber-200/90' : 'text-sky-300/85'}`}>
          {t.warp ? 'Fictional warp to' : rocket ? '1 g rocket to' : 'En route to'} {BODIES[t.dest].name}
          {rocket && <span className="ml-2 normal-case tracking-normal text-white/50">· {phase}</span>}
        </div>
        <div className="flex gap-1.5">
          <button className="btn-ghost" onClick={() => controller.setTravelLook(0)} title="Look ahead (arrow keys or drag to look around)">
            Ahead
          </button>
          <button className="btn-ghost" onClick={() => controller.setTravelLook(Math.PI)} title="Look back toward where you came from">
            Behind
          </button>
          <button className="btn-ghost" onClick={jumpToArrival} title="Skip the rest of the trip (advances the clock)">
            Jump to arrival
          </button>
          <button className="btn-ghost" onClick={stopTrip}>
            Stop
          </button>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${t.warp ? 'bg-fuchsia-300/80' : 'bg-sky-300/80'}`}
          style={{ width: `${(progress * 100).toFixed(2)}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-3">
        <Stat
          label="Speed"
          value={t.warp ? speedLabel(t) : formatBeta(s.beta)}
          sub={rocket ? `peak ${formatBeta(t.beta)} at the flip` : formatSpeed(s.beta * C_KM_S)}
        />
        {t.warp ? (
          <Stat label="Lorentz factor γ" value="undefined" sub="1/√(1 − v²/c²) is imaginary" />
        ) : (
          <Stat label="Lorentz factor γ" value={fmtGamma(s.gamma)} sub="1 / √(1 − v²/c²)" />
        )}
        <Stat label="Distance left" value={formatDistance(remainingD)} sub="Sun's rest frame" />
        {t.warp ? (
          <Stat label="As measured aboard" value="undefined" sub="no valid ship frame" />
        ) : (
          <Stat
            label="As measured aboard"
            value={formatDistance(remainingD / s.gamma)}
            sub="length-contracted, d / γ"
            hint="In the ship's frame the whole Solar System is squashed along the direction of travel by 1/γ"
          />
        )}
        <Stat label="Earth time elapsed" value={formatClock(elapsed)} sub={`arrives in ${formatDuration(remainingT)}`} />
        {t.warp ? (
          <Stat label="Ship time elapsed" value="undefined" sub="proper time has no meaning here" />
        ) : (
          <Stat
            label="Ship time elapsed"
            value={formatClock(s.tau)}
            sub={`arrives in ${formatDuration(remainingTau)}`}
            hint={rocket ? 'Proper time τ, from t = (c/a) sinh(aτ/c)' : 'Proper time τ = t / γ: what a clock on board shows'}
          />
        )}
        <Stat label="Light would take" value={formatDuration(remainingD / C_KM_S)} sub="for the remaining distance" />
        {t.warp ? (
          <Stat label="Outrunning light by" value={`${formatNumber(t.beta, 0)}×`} sub="you arrive before your light" />
        ) : (
          <Stat label="You age less by" value={formatDuration(elapsed - s.tau)} sub="so far, vs. Earth clocks" />
        )}
      </div>
    </div>
  );
}

/** The in-flight readout: speed, γ, distances in both frames, and both clocks. */
export function TripHud() {
  const active = useUI((s) => s.tripActive);
  useTicker(10);
  const t = travel.trip;
  if (active && t) return <InFlight t={t} />;

  const a = travel.lastArrival;
  if (a && performance.now() - a.at < 15_000) {
    const saved = a.earthTime - a.shipTime;
    return (
      <div className="glass fade-in pointer-events-auto absolute bottom-20 left-1/2 z-20 w-[520px] max-w-[calc(100vw-2rem)] -translate-x-1/2 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-300/85">
              Arrived at {BODIES[a.dest].name}
            </div>
            {a.warp ? (
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">
                {formatDistance(a.distance)} at a fictional {speedLabel(a)} in{' '}
                <b className="font-semibold text-white">{formatDuration(a.earthTime)}</b> of Earth time. Light would have
                taken {formatDuration(a.distance / C_KM_S)}.{' '}
                <button className="underline decoration-white/30 underline-offset-2 hover:text-white" onClick={() => openExplainer('ftl')}>
                  Why this can’t happen
                </button>
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">
                {formatDistance(a.distance)}{' '}
                {a.drive === 'rocket' ? `by 1 g rocket (top speed ${formatBeta(a.beta)})` : `at ${speedLabel(a)}`}:{' '}
                <b className="font-semibold text-white">{formatDuration(a.earthTime)}</b>{' '}
                passed on Earth, but only <b className="font-semibold text-white">{formatDuration(a.shipTime)}</b> on board.
                {saved > 1e-3 ? ` You aged ${formatDuration(saved)} less than the people you left behind.` : ''}
              </p>
            )}
          </div>
          <button className="chip" onClick={() => (travel.lastArrival = null)}>
            Close
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/** Unmissable banner while the fictional warp is engaged. */
export function WarpDriveBanner() {
  const active = useUI((s) => s.tripActive);
  useTicker(4);
  if (!active || !travel.trip?.warp) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[118px] z-30 flex justify-center px-4">
      <div className="badge fade-in pointer-events-auto h-auto max-w-[560px] gap-3 border-fuchsia-300/40 bg-fuchsia-500/15 py-2 text-fuchsia-50">
        <span>
          <b className="font-semibold">Fiction:</b> faster-than-light travel breaks known physics. Relativistic effects are
          switched off here because they are undefined.
        </span>
        <button className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] hover:bg-white/20" onClick={() => openExplainer('ftl')}>
          Why?
        </button>
      </div>
    </div>
  );
}
