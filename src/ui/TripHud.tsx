import { BODIES, C_KM_S } from '../physics/constants';
import { formatBeta, formatClock, formatDistance, formatDuration, formatSpeed } from '../lib/format';
import { controller } from '../controls/cameraController';
import { travel, tripElapsed, jumpToArrival } from '../sim/travel';
import { useUI } from '../state/ui';
import { stopTrip } from './tripActions';
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

/** The in-flight readout: speed, γ, distances in both frames, and both clocks. */
export function TripHud() {
  const active = useUI((s) => s.tripActive);
  useTicker(10);
  const t = travel.trip;
  if (active && t) {
    const elapsed = tripElapsed(t);
    const remainingT = Math.max(0, t.earthTime - elapsed);
    const remainingD = t.speed * remainingT;
    const progress = t.earthTime > 0 ? elapsed / t.earthTime : 1;
    return (
      <div className="glass fade-in pointer-events-auto absolute bottom-4 left-1/2 z-20 w-[760px] max-w-[calc(100vw-2rem)] -translate-x-1/2 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-300/85">
            En route to {BODIES[t.dest].name}
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
          <div className="h-full rounded-full bg-sky-300/80" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-3">
          <Stat label="Speed" value={formatBeta(t.beta)} sub={formatSpeed(t.speed)} />
          <Stat label="Lorentz factor γ" value={fmtGamma(t.gamma)} sub="1 / √(1 − v²/c²)" />
          <Stat label="Distance left" value={formatDistance(remainingD)} sub="Sun's rest frame" />
          <Stat
            label="As measured aboard"
            value={formatDistance(remainingD / t.gamma)}
            sub="length-contracted, d / γ"
            hint="In the ship's frame the whole Solar System is squashed along the direction of travel by 1/γ"
          />
          <Stat label="Earth time elapsed" value={formatClock(elapsed)} sub={`arrives in ${formatDuration(remainingT)}`} />
          <Stat
            label="Ship time elapsed"
            value={formatClock(elapsed / t.gamma)}
            sub={`arrives in ${formatDuration(remainingT / t.gamma)}`}
            hint="Proper time τ = t / γ: what a clock on board shows"
          />
          <Stat
            label="Light would take"
            value={formatDuration(remainingD / C_KM_S)}
            sub="for the remaining distance"
          />
          <Stat
            label="You age less by"
            value={formatDuration(elapsed - elapsed / t.gamma)}
            sub="so far, vs. Earth clocks"
          />
        </div>
      </div>
    );
  }

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
            <p className="mt-2 text-[13px] leading-relaxed text-white/80">
              {formatDistance(a.distance)} at {formatBeta(a.beta)}: <b className="font-semibold text-white">{formatDuration(a.earthTime)}</b> passed
              on Earth, but only <b className="font-semibold text-white">{formatDuration(a.shipTime)}</b> on board.
              {saved > 1e-3 ? ` You aged ${formatDuration(saved)} less than the people you left behind.` : ''}
            </p>
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
