import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BODIES, BODY_ORDER, C_KM_S, PARKER_PEAK_KM_S, type BodyId } from '../../physics/constants';
import { betaToSlider, sliderToBeta } from '../../physics/speedScale';
import { gamma } from '../../physics/relativity';
import { photonRocketMassRatio } from '../../physics/rocket';
import { fixed, fmtBeta, fmtGamma, qty, sci, sig } from '../../lib/sci';
import { sim } from '../../sim/sim';
import { planTrip, type Drive, type TripPlan } from '../../sim/travel';
import { useUI } from '../../state/ui';
import { startTrip } from '../tripActions';
import { openExplainer } from '../explainerActions';
import { Dialog, Field, NumberInput, Seg, Sym } from '../kit';
import { SpacetimeDiagram } from '../instruments/SpacetimeDiagram';
import { rich } from '../rich';

const VOYAGER_KM_S = 16.9;

export const SPEED_PRESETS: { label: string; beta: number; hint: string }[] = [
  { label: 'Voyager 1', beta: VOYAGER_KM_S / C_KM_S, hint: '16.9 km/s: Voyager 1’s speed leaving the Solar System' },
  { label: 'Parker', beta: PARKER_PEAK_KM_S / C_KM_S, hint: '192 km/s: Parker Solar Probe at perihelion (Dec 2024), the fastest human-made object' },
  { label: '0.1', beta: 0.1, hint: '' },
  { label: '0.5', beta: 0.5, hint: '' },
  { label: '0.8', beta: 0.8, hint: '' },
  { label: '0.9', beta: 0.9, hint: '' },
  { label: '0.99', beta: 0.99, hint: '' },
  { label: '0.999', beta: 0.999, hint: '' },
  { label: '0.9999', beta: 0.9999, hint: '' },
];

const WARP_PRESETS = [2, 10, 100, 1000, 10_000];
const WARP_LOG_MIN = Math.log10(1.5);
const WARP_LOG_MAX = 5;
const STEPS = 1000;

const BETA_TICKS: { b: number; label?: string }[] = [
  { b: 1e-5, label: '10⁻⁵' },
  { b: 1e-4 },
  { b: 1e-3, label: '10⁻³' },
  { b: 1e-2 },
  { b: 0.1, label: '0.1' },
  { b: 0.5, label: '0.5' },
  { b: 0.9, label: '0.9' },
  { b: 0.99, label: '0.99' },
  { b: 0.999, label: '0.999' },
  { b: 0.9999 },
  { b: 0.99999, label: '0.999 99' },
];
const WARP_TICKS = [1.5, 10, 100, 1000, 10_000, 100_000];

function Ticks({ ticks }: { ticks: { pos: number; label?: string }[] }) {
  return (
    <div className="relative mx-[4px] h-5" aria-hidden>
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0" style={{ left: `${t.pos * 100}%` }}>
          <div className={`w-px bg-line-3 ${t.label ? 'h-[5px]' : 'h-[3px]'}`} />
          {t.label && (
            <div
              className={`mono absolute left-0 top-[6px] whitespace-nowrap text-[9.5px] text-fg-3 ${
                t.pos > 0.97 ? '-translate-x-full' : t.pos < 0.03 ? '' : '-translate-x-1/2'
              }`}
            >
              {rich(t.label)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Pred({ l, v, u, tone, title }: { l: ReactNode; v: ReactNode; u?: string; tone?: 'data' | 'hazard' | 'dim'; title?: string }) {
  return (
    <div className="ro !px-0" data-tone={tone} title={title}>
      <span className="ro-l">{l}</span>
      <span className="ro-v">{rich(v)}</span>
      <span className="ro-u">{u}</span>
    </div>
  );
}

const Q = (x: number, dim: 'time' | 'length', d = 5) => {
  const q = qty(x, dim, d);
  return { v: q.v, u: q.u };
};

export function TrajectoryPlanner() {
  const open = useUI((s) => s.plannerOpen);
  const dest = useUI((s) => s.plannerDest);
  const beta = useUI((s) => s.plannerBeta);
  const drive = useUI((s) => s.plannerDrive);
  const warpFactor = useUI((s) => s.plannerWarpFactor);
  const [plan, setPlan] = useState<TripPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const warp = drive === 'warp';
  const speed = warp ? warpFactor : beta;

  // Re-plan when the inputs change, and twice a second, since everything moves.
  useEffect(() => {
    if (!open) return;
    const compute = () => setPlan(planTrip(dest, speed, sim.camera.pos.clone(), sim.astroTime, drive));
    compute();
    const id = window.setInterval(compute, 500);
    return () => window.clearInterval(id);
  }, [open, dest, speed, drive]);

  const slider = useMemo(
    () => Math.round((warp ? (Math.log10(warpFactor) - WARP_LOG_MIN) / (WARP_LOG_MAX - WARP_LOG_MIN) : betaToSlider(beta)) * STEPS),
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
  const execute = () => {
    if (!startTrip(dest, speed, drive)) setError('No trajectory from the current position.');
    else setError(null);
  };

  const d = plan ? Q(plan.distance, 'length', 6) : null;
  const T = plan ? Q(plan.earthTime, 'time', 6) : null;
  const tau = plan && !warp ? Q(plan.shipTime, 'time', 6) : null;
  const diff = plan && !warp ? Q(plan.earthTime - plan.shipTime, 'time', 4) : null;
  const dPrime = plan && !warp && drive === 'cruise' ? Q(plan.distance / plan.gamma, 'length', 6) : null;
  const lightT = plan ? Q(plan.distance / C_KM_S, 'time', 5) : null;

  return (
    <div className="absolute bottom-3 left-1/2 z-30 w-[700px] max-w-[calc(100%-24px)] -translate-x-1/2">
      <Dialog title="Trajectory planner" onClose={close} tone={warp ? 'hazard' : undefined} className="max-h-[calc(100vh-120px)]">
        <div className="scroll grid grid-cols-1 gap-x-5 gap-y-3 p-3 sm:grid-cols-[1fr_250px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Destination">
                <select className="fld w-[180px]" value={dest} onChange={(e) => useUI.setState({ plannerDest: e.target.value as BodyId })}>
                  {BODY_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {BODIES[id].name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pb-1 text-[11px] leading-snug text-fg-3">
                Departure: current position.
                <br />
                Aimed at the destination’s position on arrival.
              </div>
            </div>

            <Field label="Propulsion model">
              <Seg
                label="Propulsion model"
                value={drive}
                onChange={(v: Drive) => useUI.setState({ plannerDrive: v })}
                options={[
                  { value: 'cruise', label: 'Constant speed', title: 'Idealised: instantaneous boost to β, instantaneous stop' },
                  { value: 'rocket', label: '1 g flip-and-burn', title: 'Constant proper acceleration g₀, thrust reversed at the midpoint' },
                  { value: 'warp', label: 'Superluminal (fiction)', title: 'Non-physical faster-than-light transfer, for comparison', hazard: true },
                ]}
              />
            </Field>

            {drive === 'rocket' ? (
              <div className="prose-lab !text-[12.5px]">
                <p>
                  Constant proper acceleration <Sym>a</Sym> = <Sym>g</Sym>₀ = 9.806 65 m/s² (the crew feels Earth gravity).
                  The thrust reverses at the midpoint so the ship arrives at rest. Speed grows as <Sym>β</Sym> = tanh(<Sym>aτ</Sym>/<Sym>c</Sym>)
                  and never reaches <Sym>c</Sym>. Experiment 5 logs these flights.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-end justify-between gap-3">
                  <Field
                    label={
                      warp ? (
                        <>
                          Speed in units of <span className="sym normal-case tracking-normal">c</span> (fiction)
                        </>
                      ) : (
                        <>
                          Cruise speed <span className="sym normal-case tracking-normal">β</span>
                        </>
                      )
                    }
                  >
                    <NumberInput
                      className="w-[150px] !text-[13px]"
                      ariaLabel={warp ? 'Speed in units of c' : 'Cruise speed beta'}
                      value={speed}
                      format={(v) => (warp ? sig(v, 4, { group: false }) : fmtBeta(v).replace(/\s/g, ''))}
                      parse={(s) => Number(s.replace(/c$/i, '').replace(/\s/g, '').replace('−', '-'))}
                      validate={(v) => (warp ? v > 1 && v <= 1e5 : v > 0 && v < 1 - 1e-12)}
                      onCommit={(v) => useUI.setState(warp ? { plannerWarpFactor: v } : { plannerBeta: v })}
                    />
                  </Field>
                  <div className="mono pb-1 text-right text-[11px] leading-[15px] text-fg-2">
                    <div>
                      <Sym>v</Sym> = {sig(speed * C_KM_S, 6)} <span className="text-fg-3">km/s</span>
                    </div>
                    <div className={warp ? 'text-hazard' : ''}>
                      <Sym>γ</Sym> = {warp ? 'imaginary' : rich(fmtGamma(g))}
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  className="fader mt-2"
                  data-hazard={warp ? 'true' : undefined}
                  min={0}
                  max={STEPS}
                  value={slider}
                  style={{ '--fill': `${(slider / STEPS) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setSlider(Number(e.target.value) / STEPS)}
                  aria-label={warp ? 'Warp speed' : 'Cruise speed (logit scale)'}
                />
                <Ticks
                  ticks={
                    warp
                      ? WARP_TICKS.map((w) => ({
                          pos: (Math.log10(w) - WARP_LOG_MIN) / (WARP_LOG_MAX - WARP_LOG_MIN),
                          label: w >= 1000 ? `10${['³', '⁴', '⁵'][Math.round(Math.log10(w)) - 3]}c` : `${w}c`,
                        }))
                      : BETA_TICKS.map((t) => ({ pos: betaToSlider(t.b), label: t.label }))
                  }
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {(warp ? WARP_PRESETS.map((w) => ({ label: `${w}c`, beta: w, hint: '' })) : SPEED_PRESETS).map((p) => (
                    <button
                      key={p.label}
                      className="btn btn-sm"
                      aria-pressed={Math.abs(p.beta - speed) / p.beta < 1e-9}
                      onClick={() => useUI.setState(warp ? { plannerWarpFactor: p.beta } : { plannerBeta: p.beta })}
                      title={p.hint || undefined}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {!warp && (
                  <div className="mono mt-1.5 text-[9.5px] text-fg-4">
                    logit scale: position ∝ log<sub>10</sub>[β/(1 − β)]
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="cap mb-1">Predicted</div>
              <div className="border-y border-line py-1">
                <Pred l={<>Path length (S)</>} v={d?.v ?? '—'} u={d?.u} />
                <Pred l={<>Coordinate time Δ<Sym>t</Sym> (S)</>} v={T?.v ?? '—'} u={T?.u} tone="data" />
                {warp ? (
                  <Pred l={<>Proper time Δ<Sym>τ</Sym></>} v="undefined" tone="hazard" title="dτ = dt √(1 − β²) is imaginary for β > 1" />
                ) : (
                  <Pred
                    l={<>Proper time Δ<Sym>τ</Sym> (ship)</>}
                    v={tau?.v ?? '—'}
                    u={tau?.u}
                    tone="data"
                    title={drive === 'rocket' ? 'From eq. (5.2)' : 'Δτ = Δt/γ, eq. (2.2)'}
                  />
                )}
                {!warp && <Pred l={<>Δ<Sym>t</Sym> − Δ<Sym>τ</Sym></>} v={diff?.v ?? '—'} u={diff?.u} />}
                {dPrime && <Pred l={<>Length in S′, <Sym>d</Sym>/<Sym>γ</Sym></>} v={dPrime.v} u={dPrime.u} title="The path length measured by the ship: length contraction" />}
                <Pred l="Light-time over the path" v={lightT?.v ?? '—'} u={lightT?.u} />
                {drive === 'rocket' && plan?.rocket && (
                  <>
                    <Pred l={<>Peak <Sym>β</Sym> (at the flip)</>} v={fmtBeta(plan.beta)} />
                    <Pred l={<>Peak <Sym>γ</Sym></>} v={fmtGamma(plan.gamma)} />
                    <Pred
                      l="Photon-rocket mass ratio"
                      v={photonRocketMassRatio(plan.rocket) < 1e6 ? fixed(photonRocketMassRatio(plan.rocket), 2) : sci(photonRocketMassRatio(plan.rocket), 3)}
                      title="Initial/final mass for a perfect photon rocket: exp(Δφ)"
                    />
                  </>
                )}
              </div>
            </div>
            {plan === null && <p className="text-[12px] text-accent">Unreachable at this speed: {BODIES[dest].name} recedes faster than the ship can close.</p>}
            {error && <p className="text-[12px] text-accent">{error}</p>}
          </div>

          <div className="min-w-0">
            <div className="cap mb-1">Worldline preview</div>
            {plan ? (
              <SpacetimeDiagram spec={plan} elapsed={null} height={236} caption={false} />
            ) : (
              <div className="grid h-[236px] place-content-center border border-line-2 text-[11px] text-fg-3">no trajectory</div>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
              {warp
                ? 'A superluminal worldline is spacelike (below the 45° light line). Some inertial observers would see arrival before departure.'
                : 'Sun’s frame, c = 1: light moves at 45°. Diamonds: equal steps of ship time.'}
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 border-t border-line-2 px-3 py-2 ${warp ? 'hatch' : ''}`}>
          {warp ? (
            <p className="flex-1 text-[11.5px] leading-snug text-fg">
              <b className="text-hazard">Non-physical.</b> Nothing with mass reaches <Sym>c</Sym>; faster-than-light travel would violate causality.{' '}
              <button className="underline decoration-fg-4 underline-offset-2 hover:text-white" onClick={() => openExplainer('ftl')}>
                Reference §9
              </button>
            </p>
          ) : drive === 'rocket' ? (
            <p className="flex-1 text-[11.5px] leading-snug text-fg-3">
              Logged by Experiment 5.{' '}
              <button className="underline decoration-fg-4 underline-offset-2 hover:text-fg" onClick={() => openExplainer('rocket')}>
                Reference §10
              </button>
            </p>
          ) : (
            <p className="flex-1 text-[11.5px] leading-snug text-fg-3">Instant boost and stop (idealised). Logged by Experiment 2 on arrival.</p>
          )}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className={`btn btn-pri px-4 ${warp ? '!border-hazard !bg-hazard !text-black' : ''}`} disabled={!plan || !!here} onClick={execute}>
            {here ? 'Already there' : warp ? 'Engage (fiction)' : drive === 'rocket' ? 'Ignite' : 'Execute'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
