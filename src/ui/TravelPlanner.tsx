import { useEffect, useMemo, useState } from 'react';
import { BODIES, BODY_ORDER, C_KM_S, PARKER_PEAK_KM_S, type BodyId } from '../physics/constants';
import { betaToSlider, sliderToBeta } from '../physics/speedScale';
import { gamma } from '../physics/relativity';
import { photonRocketMassRatio } from '../physics/rocket';
import { formatBeta, formatDistance, formatDuration, formatNumber, formatSpeed } from '../lib/format';
import { sim } from '../sim/sim';
import { planTrip, type Drive, type TripPlan } from '../sim/travel';
import { useUI } from '../state/ui';
import { startTrip } from './tripActions';
import { openExplainer } from './explainerActions';

const VOYAGER_KM_S = 16.9;

export const SPEED_PRESETS: { label: string; beta: number; hint: string }[] = [
  { label: 'Voyager 1', beta: VOYAGER_KM_S / C_KM_S, hint: '≈ 16.9 km/s, the fastest spacecraft leaving the Solar System' },
  { label: 'Parker peak', beta: PARKER_PEAK_KM_S / C_KM_S, hint: '≈ 192 km/s, the fastest human-made object (at perihelion, Dec 2024)' },
  { label: '0.1c', beta: 0.1, hint: '' },
  { label: '0.5c', beta: 0.5, hint: '' },
  { label: '0.9c', beta: 0.9, hint: '' },
  { label: '0.99c', beta: 0.99, hint: '' },
  { label: '0.9999c', beta: 0.9999, hint: '' },
];

const WARP_PRESETS = [2, 10, 100, 1000, 10_000];
const WARP_LOG_MIN = Math.log10(1.5);
const WARP_LOG_MAX = 5;
const STEPS = 1000;

const DRIVES: { id: Drive; label: string; hint: string }[] = [
  { id: 'cruise', label: 'Constant speed', hint: 'Idealised: instant boost to a fixed fraction of c' },
  { id: 'rocket', label: '1 g rocket', hint: 'Realistic: accelerate at 1 g, flip halfway, decelerate' },
  { id: 'warp', label: 'Beyond c', hint: 'Fictional faster-than-light warp' },
];

function Readout({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

export function TravelPlanner() {
  const open = useUI((s) => s.plannerOpen);
  const dest = useUI((s) => s.plannerDest);
  const beta = useUI((s) => s.plannerBeta);
  const drive = useUI((s) => s.plannerDrive);
  const warpFactor = useUI((s) => s.plannerWarpFactor);
  const explainerOpen = useUI((s) => s.explainerOpen);
  const [plan, setPlan] = useState<TripPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const warp = drive === 'warp';
  const speed = warp ? warpFactor : beta;

  // Re-plan when the inputs change (and a couple of times a second, since everything moves).
  useEffect(() => {
    if (!open) return;
    const compute = () => setPlan(planTrip(dest, speed, sim.camera.pos.clone(), sim.astroTime, drive));
    compute();
    const id = window.setInterval(compute, 500);
    return () => window.clearInterval(id);
  }, [open, dest, speed, drive]);

  const slider = useMemo(
    () =>
      Math.round(
        (warp ? (Math.log10(warpFactor) - WARP_LOG_MIN) / (WARP_LOG_MAX - WARP_LOG_MIN) : betaToSlider(beta)) * STEPS,
      ),
    [beta, warp, warpFactor],
  );
  if (!open) return null;

  const g = gamma(beta);
  const setSlider = (s: number) =>
    warp
      ? useUI.setState({ plannerWarpFactor: 10 ** (WARP_LOG_MIN + s * (WARP_LOG_MAX - WARP_LOG_MIN)) })
      : useUI.setState({ plannerBeta: sliderToBeta(s) });
  const close = () => useUI.setState({ plannerOpen: false });
  const here = plan && plan.distance <= 0;
  const accent = warp ? 'fuchsia' : drive === 'rocket' ? 'amber' : 'sky';

  return (
    <div
      className={`glass fade-in pointer-events-auto absolute bottom-20 z-20 w-[600px] max-w-[calc(100vw-2rem)] p-5 ${
        explainerOpen ? 'left-[432px] min-[1500px]:left-1/2 min-[1500px]:-translate-x-1/2' : 'left-1/2 -translate-x-1/2'
      } ${warp ? '!border-fuchsia-300/30' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="stat-label">Travel to</span>
          <select
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[15px] font-semibold text-white outline-none focus:border-sky-300/50"
            value={dest}
            onChange={(e) => useUI.setState({ plannerDest: e.target.value as BodyId })}
          >
            {BODY_ORDER.map((id) => (
              <option key={id} value={id} className="bg-neutral-900">
                {BODIES[id].name}
              </option>
            ))}
          </select>
        </div>
        <button className="chip" onClick={close}>
          Cancel
        </button>
      </div>

      <div className="mb-4 flex rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Drive">
        {DRIVES.map((d) => (
          <button
            key={d.id}
            role="radio"
            aria-checked={drive === d.id}
            title={d.hint}
            className={`seg flex-1 ${drive === d.id ? (d.id === 'warp' ? 'seg-fiction' : 'seg-on') : ''}`}
            onClick={() => useUI.setState({ plannerDrive: d.id })}
          >
            {d.label}
            {d.id === 'warp' && <span className="ml-1 text-[10px] opacity-60">(fiction)</span>}
          </button>
        ))}
      </div>

      {drive === 'rocket' ? (
        <p className="text-[12.5px] leading-relaxed text-white/70">
          Accelerate at a constant <b className="text-white">1 g</b>, so the crew feels Earth-like gravity. Turn around at the
          midpoint and decelerate at 1 g to arrive at rest. Speed rises as <span className="whitespace-nowrap">β = tanh(aτ/c)</span>,
          so it never reaches c.
        </p>
      ) : (
        <>
          <div className="mb-1 flex items-end justify-between">
            <div>
              <div className="stat-label">{warp ? 'Warp speed' : 'Cruise speed'}</div>
              <div className={`text-[26px] font-semibold tabular-nums tracking-tight ${warp ? 'text-fuchsia-100' : 'text-white'}`}>
                {warp ? `${formatNumber(warpFactor, warpFactor < 10 ? 1 : 0)}c` : formatBeta(beta)}
              </div>
            </div>
            <div className="text-right">
              <div className="stat-sub">{formatSpeed(speed * C_KM_S)}</div>
              <div className="stat-sub">
                {warp ? 'γ undefined (imaginary)' : `γ = ${g < 1.0001 ? g.toFixed(8) : g < 100 ? g.toFixed(4) : g.toFixed(1)}`}
              </div>
            </div>
          </div>
          <input
            type="range"
            className={`slider ${warp ? 'slider-warp' : ''}`}
            min={0}
            max={STEPS}
            value={slider}
            style={{ '--fill': `${(slider / STEPS) * 100}%` } as React.CSSProperties}
            onChange={(e) => setSlider(Number(e.target.value) / STEPS)}
            aria-label={warp ? 'Warp speed' : 'Cruise speed'}
          />
          <div className="flex justify-between text-[10.5px] tabular-nums text-white/35">
            {(warp
              ? ['1.5c', '10c', '100c', '1,000c', '10,000c', '100,000c']
              : ['0.00001c', '0.001c', '0.1c', '0.5c', '0.9c', '0.999c', '0.99999c']
            ).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {warp
              ? WARP_PRESETS.map((w) => (
                  <button
                    key={w}
                    className={`chip border border-white/10 ${Math.abs(w - warpFactor) / w < 1e-6 ? 'chip-on' : ''}`}
                    onClick={() => useUI.setState({ plannerWarpFactor: w })}
                  >
                    {formatNumber(w)}c
                  </button>
                ))
              : SPEED_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={`chip border border-white/10 ${Math.abs(p.beta - beta) / p.beta < 1e-6 ? 'chip-on' : ''}`}
                    onClick={() => useUI.setState({ plannerBeta: p.beta })}
                    title={p.hint || p.label}
                  >
                    {p.label}
                  </button>
                ))}
          </div>
        </>
      )}

      <div
        className={`mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 ${drive === 'rocket' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}
      >
        <Readout label="Distance" value={plan ? formatDistance(plan.distance) : '—'} sub="Sun's frame" />
        <Readout label="Earth time" value={plan ? formatDuration(plan.earthTime) : '—'} sub="Sun's rest frame" />
        <Readout
          label="Ship time"
          value={warp ? 'undefined' : plan ? formatDuration(plan.shipTime) : '—'}
          sub={warp ? 'no valid τ beyond c' : drive === 'rocket' ? 'τ on board' : 'τ = t / γ'}
        />
        {drive === 'rocket' && (
          <Readout label="Top speed" value={plan ? formatBeta(plan.beta) : '—'} sub="at the flip" />
        )}
      </div>

      {plan === null && (
        <p className="mt-3 text-[12.5px] text-amber-200/90">
          At this speed you can’t catch {BODIES[dest].name}: it is moving away faster than you can fly.
        </p>
      )}
      {error && <p className="mt-3 text-[12.5px] text-amber-200/90">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        {warp ? (
          <p className="text-[11.5px] leading-snug text-fuchsia-100/70">
            Fiction: nothing with mass can reach c, and faster-than-light travel would break causality.{' '}
            <button className="underline decoration-fuchsia-300/50 underline-offset-2 hover:text-white" onClick={() => openExplainer('ftl')}>
              Why?
            </button>
          </p>
        ) : drive === 'rocket' ? (
          <p className="text-[11.5px] leading-snug text-white/45">
            {plan?.rocket
              ? `Even a perfect photon rocket would need ${formatNumber(photonRocketMassRatio(plan.rocket), 1)} kg of propellant per kg delivered.`
              : ' '}{' '}
            <button className="underline decoration-white/30 underline-offset-2 hover:text-white" onClick={() => openExplainer('rocket')}>
              The physics
            </button>
          </p>
        ) : (
          <p className="text-[11.5px] leading-snug text-white/45">
            Idealised: the ship jumps to cruise speed instantly and stops instantly. You fly toward where{' '}
            {BODIES[dest].name} will be when you arrive.
          </p>
        )}
        <button
          className={`btn-primary shrink-0 px-5 ${accent === 'fuchsia' ? '!bg-fuchsia-200' : ''}`}
          disabled={!plan || !!here}
          onClick={() => {
            if (!startTrip(dest, speed, drive)) setError('Could not plan that trip from here.');
            else setError(null);
          }}
        >
          {here ? 'You are here' : warp ? 'Engage warp' : drive === 'rocket' ? 'Ignite' : 'Launch'}
        </button>
      </div>
    </div>
  );
}
