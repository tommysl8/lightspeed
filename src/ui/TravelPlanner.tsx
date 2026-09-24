import { useEffect, useMemo, useState } from 'react';
import { BODIES, BODY_ORDER, C_KM_S, PARKER_PEAK_KM_S, type BodyId } from '../physics/constants';
import { betaToSlider, sliderToBeta } from '../physics/speedScale';
import { gamma } from '../physics/relativity';
import { formatBeta, formatDistance, formatDuration, formatSpeed } from '../lib/format';
import { sim } from '../sim/sim';
import { planTrip, type TripPlan } from '../sim/travel';
import { useUI } from '../state/ui';
import { startTrip } from './tripActions';

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

const STEPS = 1000;

export function TravelPlanner() {
  const open = useUI((s) => s.plannerOpen);
  const dest = useUI((s) => s.plannerDest);
  const beta = useUI((s) => s.plannerBeta);
  const [plan, setPlan] = useState<TripPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Re-plan when the inputs change (and a couple of times a second, since everything moves).
  useEffect(() => {
    if (!open) return;
    const compute = () => setPlan(planTrip(dest, beta, sim.camera.pos.clone()));
    compute();
    const id = window.setInterval(compute, 500);
    return () => window.clearInterval(id);
  }, [open, dest, beta]);

  const slider = useMemo(() => Math.round(betaToSlider(beta) * STEPS), [beta]);
  if (!open) return null;

  const g = gamma(beta);
  const set = (b: number) => useUI.setState({ plannerBeta: b });
  const close = () => useUI.setState({ plannerOpen: false });
  const here = plan && plan.distance <= 0;

  return (
    <div className="glass fade-in pointer-events-auto absolute bottom-20 left-1/2 z-20 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 p-5">
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

      <div className="mb-1 flex items-end justify-between">
        <div>
          <div className="stat-label">Cruise speed</div>
          <div className="text-[26px] font-semibold tabular-nums tracking-tight text-white">{formatBeta(beta)}</div>
        </div>
        <div className="text-right">
          <div className="stat-sub">{formatSpeed(beta * C_KM_S)}</div>
          <div className="stat-sub">γ = {g < 1.0001 ? g.toFixed(8) : g < 100 ? g.toFixed(4) : g.toFixed(1)}</div>
        </div>
      </div>
      <input
        type="range"
        className="slider"
        min={0}
        max={STEPS}
        value={slider}
        style={{ '--fill': `${(slider / STEPS) * 100}%` } as React.CSSProperties}
        onChange={(e) => set(sliderToBeta(Number(e.target.value) / STEPS))}
        aria-label="Cruise speed"
      />
      <div className="flex justify-between text-[10.5px] tabular-nums text-white/35">
        <span>0.00001c</span>
        <span>0.001c</span>
        <span>0.1c</span>
        <span>0.5c</span>
        <span>0.9c</span>
        <span>0.999c</span>
        <span>0.99999c</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SPEED_PRESETS.map((p) => (
          <button
            key={p.label}
            className={`chip border border-white/10 ${Math.abs(p.beta - beta) / p.beta < 1e-6 ? 'chip-on' : ''}`}
            onClick={() => set(p.beta)}
            title={p.hint || p.label}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-4">
        <div>
          <div className="stat-label">Distance</div>
          <div className="stat-value">{plan ? formatDistance(plan.distance) : '—'}</div>
          <div className="stat-sub">Sun's frame</div>
        </div>
        <div>
          <div className="stat-label">Earth time</div>
          <div className="stat-value">{plan ? formatDuration(plan.earthTime) : '—'}</div>
          <div className="stat-sub">Sun's rest frame</div>
        </div>
        <div>
          <div className="stat-label">Ship time</div>
          <div className="stat-value">{plan ? formatDuration(plan.shipTime) : '—'}</div>
          <div className="stat-sub">τ = t / γ</div>
        </div>
      </div>

      {plan === null && (
        <p className="mt-3 text-[12.5px] text-amber-200/90">
          At this speed you can’t catch {BODIES[dest].name}: it is moving away faster than you can fly.
        </p>
      )}
      {error && <p className="mt-3 text-[12.5px] text-amber-200/90">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11.5px] leading-snug text-white/45">
          Idealised: the ship jumps to cruise speed instantly and stops instantly. You fly toward where{' '}
          {BODIES[dest].name} will be when you arrive.
        </p>
        <button
          className="btn-primary shrink-0 px-5"
          disabled={!plan || !!here}
          onClick={() => {
            if (!startTrip(dest, beta)) setError('Could not plan that trip from here.');
            else setError(null);
          }}
        >
          {here ? 'You are here' : 'Launch'}
        </button>
      </div>
    </div>
  );
}
