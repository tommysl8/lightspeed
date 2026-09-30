import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { C_KM_S, PARKER_PEAK_KM_S } from '../../physics/constants';
import { bodyName } from '../../sim/bodies';
import { betaToSlider, sliderToBeta } from '../../physics/speedScale';
import { gamma } from '../../physics/relativity';
import { photonRocketMassRatio } from '../../physics/rocket';
import { fixed, fmtBeta, fmtGamma, qty, sci, sig } from '../../lib/sci';
import { sim } from '../../sim/sim';
import { planFlight, type Drive, type FlightResult, type TripPlan } from '../../sim/travel';
import { returnLeg } from '../../sim/travelCosmic';
import { theName } from '../../content/scenes';
import { flightStandoff, framingDistance } from '../../controls/framing';
import { Plot, PLOT_COLORS, type PlotSeries } from '../plot/Plot';
import { ACCEL_CHOICES, LIMIT_CHOICES, plannerFlightOptions, useFlightOptions } from './flightOptions';
import { FLRW_MODEL_NOTE, gText, flrwSentence, growthText, lightYearsParts, redshiftText, refusalText, yearsText } from './tripText';
import { useUI } from '../../state/ui';
import { startTrip } from '../tripActions';
import { readMore } from '../explainerActions';
import { Dialog, Field, NumberInput, Seg, Sym } from '../kit';
import { SpacetimeDiagram } from '../instruments/SpacetimeDiagram';
import { DestinationPicker } from './DestinationPicker';
import { useModal } from '../useModal';
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

/** Fader ticks; `wide` labels are dropped on narrow screens. */
const BETA_TICKS: { b: number; label?: string; wide?: boolean }[] = [
  { b: 1e-5, label: '10⁻⁵' },
  { b: 1e-4 },
  { b: 1e-3, label: '10⁻³', wide: true },
  { b: 1e-2 },
  { b: 0.1, label: '0.1' },
  { b: 0.5, label: '0.5', wide: true },
  { b: 0.9, label: '0.9' },
  { b: 0.99, label: '0.99', wide: true },
  { b: 0.999, label: '0.999' },
  { b: 0.9999 },
  { b: 0.99999, label: '0.999 99', wide: true },
];
const WARP_TICKS = [1.5, 10, 100, 1000, 10_000, 100_000];

function Ticks({ ticks }: { ticks: { pos: number; label?: string; wide?: boolean }[] }) {
  return (
    <div className="relative mx-[4px] h-5" aria-hidden>
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0" style={{ left: `${t.pos * 100}%` }}>
          <div className={`w-px bg-line-3 ${t.label ? 'h-[5px]' : 'h-[3px]'}`} />
          {t.label && (
            <div
              className={`mono absolute left-0 top-[6px] whitespace-nowrap text-[9.5px] text-fg-3 ${t.wide ? 'max-sm:hidden' : ''} ${
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
  return open ? <Planner /> : null;
}

function Planner() {
  const dest = useUI((s) => s.plannerDest);
  const beta = useUI((s) => s.plannerBeta);
  const drive = useUI((s) => s.plannerDrive);
  const warpFactor = useUI((s) => s.plannerWarpFactor);
  const accelG = useFlightOptions((s) => s.accelG);
  const maxShipYears = useFlightOptions((s) => s.maxShipYears);
  const [result, setResult] = useState<FlightResult | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const warp = drive === 'warp';
  const speed = warp ? warpFactor : beta;
  const plan: TripPlan | null | undefined = result === undefined ? undefined : result.ok ? result.plan : null;
  const refusal = result && !result.ok ? result.refusal : null;

  // Re-plan when the inputs change, and twice a second, since everything moves. (Flights through
  // the expanding universe are kept once worked out: the repeats cost nothing.)
  useEffect(() => {
    const opts = { accelG, maxShipTimeYr: maxShipYears ?? undefined };
    const compute = () => setResult(planFlight(dest, speed, sim.camera.pos.clone(), sim.astroTime, drive, opts));
    compute();
    const id = window.setInterval(compute, 500);
    return () => window.clearInterval(id);
  }, [dest, speed, drive, accelG, maxShipYears]);

  const slider = useMemo(
    () => Math.round((warp ? (Math.log10(warpFactor) - WARP_LOG_MIN) / (WARP_LOG_MAX - WARP_LOG_MIN) : betaToSlider(beta)) * STEPS),
    [beta, warp, warpFactor],
  );
  const close = () => useUI.setState({ plannerOpen: false });
  // Not modal: the view stays live. Focus starts on the destination and returns afterwards.
  const ref = useModal<HTMLDivElement>(close, { trap: false });

  const g = gamma(beta);
  const setSlider = (s: number) =>
    warp
      ? useUI.setState({ plannerWarpFactor: 10 ** (WARP_LOG_MIN + s * (WARP_LOG_MAX - WARP_LOG_MIN)) })
      : useUI.setState({ plannerBeta: sliderToBeta(s) });
  const here = plan && plan.distance <= 0;
  const execute = () => {
    if (!startTrip(dest, speed, drive, plannerFlightOptions())) setError('No trajectory from the current position.');
    else setError(null);
  };
  const flrw = plan ? plan.model === 'flrw' : refusal?.model === 'flrw';
  const engine = drive === 'rocket' || (drive === 'cruise' && flrw);
  // A galaxy, cluster or nebula: the flight goes all the way in (controls/framing.ts flightStandoff).
  const allTheWay = !!plan && !here && flightStandoff(dest, Infinity) < framingDistance(dest);

  const d = plan ? Q(plan.distance, 'length', 6) : null;
  const T = plan ? Q(plan.earthTime, 'time', 6) : null;
  const tau = plan && !warp ? Q(plan.shipTime, 'time', 6) : null;
  const diff = plan && !warp ? Q(plan.earthTime - plan.shipTime, 'time', 4) : null;
  const dPrime = plan && !warp && drive === 'cruise' ? Q(plan.distance / plan.gamma, 'length', 6) : null;
  const lightT = plan ? Q(plan.distance / C_KM_S, 'time', 5) : null;

  return (
    <div className="absolute bottom-3 left-1/2 z-30 w-[700px] max-w-[calc(100%-24px)] -translate-x-1/2">
      <Dialog title="Flight planner" onClose={close} tone={warp ? 'hazard' : undefined} className="max-h-[calc(100vh-120px)]" innerRef={ref}>
        <div className="scroll grid grid-cols-1 gap-x-5 gap-y-3 p-3 sm:grid-cols-[1fr_250px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Destination" htmlFor="planner-dest">
                <DestinationPicker inputId="planner-dest" value={dest} onChange={(id) => useUI.setState({ plannerDest: id })} />
              </Field>
              <div className="pb-1 text-[11px] leading-snug text-fg-3">
                Departure: current position.
                <br />
                {flrw ? 'Aimed where the destination will be on arrival, in the expanding universe.' : 'Aimed at the destination’s position on arrival.'}
                {allTheWay && (
                  <>
                    <br />
                    Flies all the way in, to near its centre; the view then pulls back to show all of it.
                  </>
                )}
              </div>
            </div>
            {/* Why there is no flight comes first: it is the answer. */}
            {refusal && <RefusalBox text={refusalText(refusal, theName(bodyName(dest)))} />}
            {refusal?.model === 'flrw' && <p className="-mt-1.5 text-[10.5px] leading-snug text-fg-3">{FLRW_MODEL_NOTE}</p>}

            <Field label="Propulsion model">
              <Seg
                label="Propulsion model"
                value={drive}
                onChange={(v: Drive) => useUI.setState({ plannerDrive: v })}
                options={[
                  {
                    value: 'cruise',
                    label: 'Constant speed',
                    title: flrw ? 'Burns at the chosen acceleration, holds the speed, then brakes' : 'Idealised: instantaneous boost to β, instantaneous stop',
                  },
                  {
                    value: 'rocket',
                    label: `${gText(accelG)} flip-and-burn`,
                    title: flrw ? 'Constant proper acceleration, thrust reversed a little after halfway' : 'Constant proper acceleration, thrust reversed at the midpoint',
                  },
                  { value: 'warp', label: 'Superluminal (fiction)', title: 'Non-physical faster-than-light transfer, for comparison', hazard: true },
                ]}
              />
            </Field>

            {drive === 'rocket' ? (
              <div className="prose-panel !text-[12.5px]">
                <p>
                  Constant proper acceleration <Sym>a</Sym> = {accelG === 1 ? <><Sym>g</Sym>₀ = 9.806 65 m/s² (the crew feels Earth gravity)</> : <>{Number(accelG.toPrecision(3))} <Sym>g</Sym>₀ = {sig(accelG * 9.80665, 5)} m/s²</>}.{' '}
                  {flrw ? (
                    <>
                      The thrust reverses a little after halfway, so the ship arrives at rest; the expansion also slows it relative to the
                      galaxies it passes and carries the destination away, and the planner allows for both. The speed never reaches{' '}
                      <Sym>c</Sym>.
                    </>
                  ) : (
                    <>
                      The thrust reverses at the midpoint so the ship arrives at rest. Speed grows as <Sym>β</Sym> = tanh(<Sym>aτ</Sym>/<Sym>c</Sym>)
                      and never reaches <Sym>c</Sym>.
                    </>
                  )}
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
                  aria-label={warp ? 'Speed in units of c (fiction)' : 'Cruise speed'}
                  aria-valuetext={warp ? `${sig(warpFactor, 3)} c` : `beta ${fmtBeta(beta)}`}
                />
                <Ticks
                  ticks={
                    warp
                      ? WARP_TICKS.map((w) => ({
                          pos: (Math.log10(w) - WARP_LOG_MIN) / (WARP_LOG_MAX - WARP_LOG_MIN),
                          label: w >= 1000 ? `10${['³', '⁴', '⁵'][Math.round(Math.log10(w)) - 3]}c` : `${w}c`,
                        }))
                      : BETA_TICKS.map((t) => ({ pos: betaToSlider(t.b), label: t.label, wide: t.wide }))
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
                  <div className="mono mt-1.5 text-[9.5px] text-fg-3">
                    logit scale: position ∝ log<sub>10</sub>[β/(1 − β)]
                  </div>
                )}
              </div>
            )}

            {engine && <EngineOptions accelG={accelG} maxShipYears={maxShipYears} cruise={drive === 'cruise'} />}

            {!refusal && (
              <div>
                <div className="cap mb-1">Predicted</div>
                {plan && plan.cosmic ? (
                  <CosmicPrediction plan={plan} />
                ) : (
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
                )}
              </div>
            )}
            {plan === null && !refusal && <p className="text-[12px] text-accent">{bodyName(dest)} is not there at the date shown.</p>}
            {error && <p className="text-[12px] text-accent">{error}</p>}
          </div>

          <div className="min-w-0">
            <div className="cap mb-1">{refusal ? 'Preview' : flrw ? 'The two clocks' : 'Worldline preview'}</div>
            {plan && plan.cosmic ? (
              <ClocksPreview plan={plan} />
            ) : plan ? (
              <SpacetimeDiagram spec={plan} elapsed={null} height={236} caption={false} />
            ) : (
              <div className="grid h-[236px] place-content-center border border-line-2 text-[11px] text-fg-3">{refusal ? 'no flight' : 'no trajectory'}</div>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-fg-3">
              {warp
                ? 'A superluminal worldline is spacelike (below the 45° light line). Some inertial observers would see arrival before departure.'
                : refusal
                  ? 'Nothing to draw: the reason is given under the destination.'
                  : flrw
                    ? 'Time at home (cosmic time, logarithmic) against time on board. Most of it passes near the flip, at the highest speed.'
                    : 'Sun’s frame, c = 1: light moves at 45°. Diamonds: equal steps of ship time.'}
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 border-t border-line-2 px-3 py-2 ${warp ? 'hatch' : ''}`}>
          {warp ? (
            <p className="flex-1 text-[11.5px] leading-snug text-fg">
              <b className="text-hazard">Non-physical.</b> Nothing with mass reaches <Sym>c</Sym>; faster-than-light travel would violate causality.{' '}
              <button className="underline decoration-fg-4 underline-offset-2 hover:text-white" onClick={() => void readMore('ftl')}>
                Why not
              </button>
            </p>
          ) : drive === 'rocket' ? (
            <p className="flex-1 text-[11.5px] leading-snug text-fg-3">
              <button className="underline decoration-fg-4 underline-offset-2 hover:text-fg" onClick={() => void readMore('rocket')}>
                How a 1 g rocket works
              </button>
            </p>
          ) : (
            <p className="flex-1 text-[11.5px] leading-snug text-fg-3">
              {flrw ? `Speeds up at ${gText(accelG)}, holds the speed against the expansion, then brakes at ${gText(accelG)}.` : 'Instant boost and stop (idealised).'}
            </p>
          )}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className={`btn btn-pri px-4 ${warp ? '!border-hazard !bg-hazard !text-black' : ''}`} disabled={!plan || !!here} onClick={execute}>
            {here ? 'Already there' : warp ? 'Engage (fiction)' : drive === 'rocket' || flrw ? 'Ignite' : 'Execute'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

// ─── Beyond the Local Group ──────────────────────────────────────────────────────────────

/** The engine's acceleration and the limit on time aboard (the rocket; the cruise's burns in expanding space). */
function EngineOptions({ accelG, maxShipYears, cruise }: { accelG: number; maxShipYears: number | null; cruise: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <Field label={cruise ? 'Burns at' : 'Acceleration'}>
        <Seg
          label="Acceleration"
          value={String(accelG)}
          onChange={(v: string) => useFlightOptions.setState({ accelG: Number(v) })}
          options={ACCEL_CHOICES.map((g) => ({ value: String(g), label: `${g} g`, title: g === 1 ? 'Earth gravity: the crew feels at home' : `${g} times Earth gravity` }))}
        />
      </Field>
      <Field label="Time on board, at most">
        <Seg
          label="Time on board, at most"
          value={String(maxShipYears ?? 'none')}
          onChange={(v: string) => useFlightOptions.setState({ maxShipYears: v === 'none' ? null : Number(v) })}
          options={LIMIT_CHOICES.map((y) => ({ value: String(y ?? 'none'), label: y === null ? 'No limit' : `${y} years`, title: y === null ? 'However long it takes' : `Refuse flights that take more than ${y} years on board` }))}
        />
      </Field>
    </div>
  );
}

/** The planner's numbers for a flight through the expanding universe. */
function CosmicPrediction({ plan }: { plan: TripPlan }) {
  const leg = plan.cosmic!;
  const p = leg.plan;
  const [back, setBack] = useState<ReturnType<typeof returnLeg> | null>(leg.back ?? null);
  // The way back is a second plan: worked out after the first paint, and kept with the flight.
  useEffect(() => {
    if (leg.back) {
      setBack(leg.back);
      return;
    }
    setBack(null);
    const id = window.setTimeout(() => setBack(returnLeg(leg)), 60);
    return () => window.clearTimeout(id);
  }, [leg]);
  const tau = Q(plan.shipTime, 'time', 6);
  const home = yearsText(p.cosmicTimeYr, 4);
  const far = lightYearsParts(plan.distance * p.departure.scale);
  return (
    <>
      <div className="border-y border-line py-1">
        <Pred l="Distance now" v={far.v} u={far.u} title="Proper distance at departure: the comoving distance times the scale factor then" />
        <Pred l={<>Your time Δ<Sym>τ</Sym> (ship)</>} v={tau.v} u={tau.u} tone="data" />
        <Pred l={<>Cosmic time Δ<Sym>t</Sym> (at home)</>} v={home} tone="data" title="Time passing at home, and for every galaxy at rest in the expansion" />
        <Pred l="Universe’s age on arrival" v={`${sig(p.arrival.timeGyr, 5)} billion years`} tone="data" />
        <Pred
          l="Redshift of home, seen from there"
          v={redshiftText(plan.homeOnArrival?.z ?? p.home.redshift)}
          title={
            plan.homeOnArrival?.inLocalGroup
              ? 'The destination is in the Local Group with home, where space does not expand'
              : 'Home’s light as it reaches the destination on arrival (the expansion alone: you arrive at rest)'
          }
        />
        <Pred l={<>Peak <Sym>γ</Sym> (past the galaxies)</>} v={fmtGamma(p.peakGamma)} title="Relative to the galaxies the ship passes: the expansion caps it" />
        <Pred l="The universe on arrival" v={growthText(p.arrival.scale / p.departure.scale)} title="How much it grows while you fly" />
        <Pred l="Cosmic background on arrival" v={sig(p.arrival.cmbTemperatureK, 4)} u="K" />
        <Pred
          l="There and back"
          v={
            !back
              ? '…'
              : back.ok
                ? `${yearsText(p.shipTimeYr + back.shipTimeYr, 3)} aboard, ${yearsText(p.cosmicTimeYr + back.cosmicTimeYr, 3)} at home`
                : back.reason === 'beyond-event-horizon'
                  ? 'No way back: home is then beyond the cosmic event horizon'
                  : 'No way back within the limit'
          }
          title="Leaving again on arrival, with the same engine: the way back is longer, because the universe has grown meanwhile"
        />
      </div>
      <p className="mt-1.5 font-serif text-[13.5px] leading-snug text-fg">{flrwSentence(plan)}</p>
      <p className="mt-1 text-[10.5px] leading-snug text-fg-3">{FLRW_MODEL_NOTE}</p>
    </>
  );
}

/** Why a flight is refused, in plain words. */
function RefusalBox({ text }: { text: { title: string; text: string } }) {
  return (
    <div className="border border-accent/40 bg-accent/[0.05] px-3 py-2" role="status">
      <div className="cap !text-accent">{text.title}</div>
      <p className="mt-1 font-serif text-[13px] leading-snug text-fg-2">{text.text}</p>
    </div>
  );
}

/** Time at home against time on board, from the plan's samples (logarithmic in time at home). */
function ClocksPreview({ plan }: { plan: TripPlan }) {
  const s = plan.cosmic!.plan.samples;
  const flip = plan.cosmic!.plan.phases[0].endTauYr;
  const series = useMemo<PlotSeries[]>(() => {
    const n = s.tauYr.length;
    const step = Math.max(1, Math.floor(n / 240));
    const data: { x: number; y: number }[] = [];
    for (let i = 1; i < n; i += step) if (s.dtYr[i] > 0) data.push({ x: s.tauYr[i], y: s.dtYr[i] });
    data.push({ x: s.tauYr[n - 1], y: s.dtYr[n - 1] });
    const out: PlotSeries[] = [{ kind: 'line', data, color: PLOT_COLORS.data, width: 1.5, label: 'time at home' }];
    out.push({ kind: 'vline', value: flip, color: PLOT_COLORS.theory, dash: '3 3', label: plan.cosmic!.plan.profile === 'cruise' ? 'cruise begins' : 'flip' });
    return out;
  }, [s, flip, plan.cosmic]);
  const T = s.tauYr[s.tauYr.length - 1];
  return <Plot x={{ q: 'τ', unit: 'yr', domain: [0, T] }} y={{ q: 'Δt', unit: 'yr', log: true }} series={series} height={236} legend={false} />;
}
