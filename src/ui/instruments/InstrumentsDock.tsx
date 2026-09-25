/**
 * The instrument panel (right dock): observer kinematics, chronometers, the target data
 * sheet, relativistic optics, light-time, a spacetime diagram of the current trip, an
 * ephemeris table and a strip-chart recorder. Everything polls the simulation at 8 Hz.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BODIES, BODY_ORDER, C_KM_S, SUN_TEFF_K, type BodyId } from '../../physics/constants';
import { gamma } from '../../physics/relativity';
import { fixed, fmtBeta, fmtGamma, qty, sci, sig } from '../../lib/sci';
import { controller } from '../../controls/cameraController';
import { relView, REL_THRESHOLD_BETA } from '../../render/relativisticView';
import { chrono, chronoT, zeroChrono } from '../../sim/chronometer';
import { earthLight } from '../../sim/lightDelay';
import { sim } from '../../sim/sim';
import { shipStateAt, travel, tripElapsed } from '../../sim/travel';
import { useUI, type ScopeChannel } from '../../state/ui';
import { angularDiameterDeg, eclipticLonLat, observerBeta, rangeRate, reticleReading, targetReading } from '../../lab/measure';
import { emitLightPulse } from '../../lab/logger';
import { goToBody } from '../navigation';
import { openPlanner } from '../tripActions';
import { Check, CloseIcon, Ro, Sec, Seg, Sym } from '../kit';
import { Plot } from '../plot/Plot';
import { useTicker } from '../useTicker';
import { SpacetimeDiagram } from './SpacetimeDiagram';
import { rich } from '../rich';

const KIND: Record<string, string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Natural satellite of Earth',
  spacecraft: 'Spacecraft',
};

/** Newtonian constant of gravitation, km³ kg⁻¹ s⁻². [CODATA 2018: 6.674 30 × 10⁻¹¹ m³ kg⁻¹ s⁻²] */
const G_KM3 = 6.6743e-20;

const Q = ({ x, dim, d = 5 }: { x: number; dim: 'time' | 'length'; d?: number }) => {
  const q = qty(x, dim, d);
  return (
    <>
      {rich(q.v)} <span className="text-fg-3">{q.u}</span>
    </>
  );
};

function angle(deg: number): { v: string; u: string } {
  if (deg >= 1) return { v: fixed(deg, 3), u: '°' };
  if (deg >= 1 / 60) return { v: sig(deg * 60, 4), u: '′' };
  return { v: sig(deg * 3600, 3), u: '″' };
}

function oneMinus(x: number): string {
  // dτ/dt = 1/γ, shown as 1 − ε near 1
  const eps = 1 - x;
  if (eps < 1e-5) return eps <= 0 ? '1' : `1 − ${sci(eps, 3)}`;
  return sig(x, 6);
}

// ─── A · Observer ────────────────────────────────────────────────────────────────────────

function Observer() {
  const mode = useUI((s) => s.controlMode);
  const beta = observerBeta();
  const g = gamma(beta);
  const v = sim.ship.vel.length();
  const pos = eclipticLonLat(sim.camera.pos);
  const warp = !!travel.trip?.warp;
  return (
    <Sec id="obs" idx="A" title="Observer">
      <Ro l="Reference frame" v={<span className="font-sans text-fg-2">S, Sun at rest</span>} />
      <Ro l={<>Heliocentric distance <Sym>r</Sym></>} v={<Q x={pos.r} dim="length" d={6} />} />
      <Ro l="Ecliptic longitude λ" v={fixed(pos.lon, 3)} u="°" />
      <Ro l="Ecliptic latitude" v={fixed(pos.lat, 3)} u="°" />
      <Ro l={<>Speed <Sym>v</Sym> in S</>} v={warp ? sig(travel.trip!.speed, 5) : sig(v, 6)} u="km/s" />
      <Ro l={<><Sym>β</Sym> = <Sym>v</Sym>/<Sym>c</Sym></>} v={warp ? fmtBeta(travel.trip!.beta) : fmtBeta(beta)} tone={warp ? 'hazard' : 'data'} />
      <Ro
        l={<>Lorentz factor <Sym>γ</Sym></>}
        v={warp ? 'imaginary' : fmtGamma(g)}
        tone={warp ? 'hazard' : 'data'}
        title="γ = 1/√(1 − β²)"
      />
      <Ro l={<>Rapidity <Sym>φ</Sym> = artanh <Sym>β</Sym></>} v={warp ? '—' : sig(Math.atanh(beta), 5)} />
      <Ro l={<>Clock rate d<Sym>τ</Sym>/d<Sym>t</Sym></>} v={warp ? 'undefined' : oneMinus(1 / g)} title="Proper time per unit coordinate time, 1/γ" />
      <Ro
        l="Kinetic energy per kg"
        v={warp ? '—' : sci((g - 1) * C_KM_S * C_KM_S * 1e6, 3)}
        u="J/kg"
        title="(γ − 1)c² per kilogram of rest mass"
      />
      {mode === 'free' && <Ro l="Throttle" v={sci(controller.throttleBeta, 3)} u="c" tone="accent" />}
    </Sec>
  );
}

// ─── B · Chronometers ────────────────────────────────────────────────────────────────────

function Clocks() {
  const t = chronoT();
  const tau = chrono.tau;
  const valid = chrono.tauValid;
  const zero = () => {
    const tr = travel.trip;
    zeroChrono(tr ? shipStateAt(tr, tripElapsed(tr)).tau : 0);
  };
  const since = new Date(chrono.zeroMs);
  return (
    <Sec
      id="clk"
      idx="B"
      title="Chronometers"
      right={
        <button className="btn btn-sm" onClick={zero} title="Zero both clocks now">
          Zero
        </button>
      }
    >
      <Ro l={<><Sym>t</Sym>, coordinate time (S)</>} v={<Q x={t} dim="time" d={7} />} tone="data" />
      <Ro l={<><Sym>τ</Sym>, observer proper time</>} v={valid ? <Q x={tau} dim="time" d={7} /> : 'undefined'} tone={valid ? 'data' : 'hazard'} />
      <Ro
        l={<><Sym>t</Sym> − <Sym>τ</Sym></>}
        v={valid ? (Math.abs(t - tau) < 1e-3 ? `${sig(t - tau, 3)}` : <Q x={t - tau} dim="time" d={5} />) : '—'}
        u={valid && Math.abs(t - tau) < 1e-3 ? 's' : undefined}
      />
      <Ro l={<>Mean rate <Sym>τ</Sym>/<Sym>t</Sym></>} v={valid && t > 0 ? oneMinus(tau / t) : '—'} />
      <div className="mono px-2.5 pb-1 pt-0.5 text-[10px] text-fg-4">
        zeroed {Number.isNaN(since.getTime()) ? '—' : since.toISOString().replace('T', ' ').slice(0, 19)} UTC
        {!valid && <span className="text-hazard"> · τ invalid after superluminal transfer</span>}
      </div>
    </Sec>
  );
}

// ─── C · Target ──────────────────────────────────────────────────────────────────────────

function Target() {
  const id = useUI((s) => s.selected);
  const tripActive = useUI((s) => s.tripActive);
  if (!id) {
    return (
      <Sec id="tgt" idx="C" title="Target">
        <p className="px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-3">
          No target. Click a body or its label, or press <kbd className="kbd">0</kbd>–<kbd className="kbd">9</kbd>,{' '}
          <kbd className="kbd">M</kbd>, <kbd className="kbd">V</kbd>.
        </p>
      </Sec>
    );
  }
  const d = BODIES[id];
  const b = sim.bodies[id];
  const ang = angle(angularDiameterDeg(id));
  const geo = targetReading(id);
  const massKg = d.gmKm3S2 ? d.gmKm3S2 / G_KM3 : NaN;
  return (
    <Sec
      id="tgt"
      idx="C"
      title="Target"
      right={
        <button className="btn btn-q btn-sq !h-5 !w-5" onClick={() => useUI.getState().select(null)} aria-label="Clear target">
          <CloseIcon />
        </button>
      }
    >
      <div className="flex items-baseline justify-between gap-2 px-2.5 pb-1 pt-0.5">
        <span className="font-serif text-[16px] text-fg">{d.name}</span>
        <span className="text-[11px] text-fg-3">{KIND[d.kind]}</span>
      </div>
      <Ro l="Range" v={<Q x={b.distTrue} dim="length" d={7} />} tone="data" />
      <Ro l="Light-time" v={<Q x={b.distTrue / C_KM_S} dim="time" d={6} />} />
      <Ro l="Range rate" v={sig(rangeRate(id), 4)} u="km/s" title="Positive: receding" />
      <Ro l="Angular diameter" v={ang.v} u={ang.u} />
      {b.magnitude < 40 && <Ro l="Apparent magnitude V" v={fixed(b.magnitude, 1)} title="Reflected sunlight (Lambert sphere with the body's geometric albedo)" />}
      {id !== 'sun' && <Ro l={<>Heliocentric <Sym>r</Sym></>} v={<Q x={b.distSun} dim="length" d={6} />} />}
      {geo && geo.beta >= 1e-3 && (
        <>
          <Ro l={<>Angle from apex <Sym>θ</Sym> (S)</>} v={fixed(geo.thetaDeg, 3)} u="°" />
          <Ro l={<>Observed angle <Sym>θ′</Sym> (S′)</>} v={fixed(geo.thetaShipDeg, 3)} u="°" tone="data" />
          <Ro l={<>Doppler factor <Sym>D</Sym></>} v={sig(geo.D, 5)} tone="data" />
        </>
      )}
      <div className="cap px-2.5 pb-0.5 pt-2">Physical data</div>
      {d.equatorialRadiusKm ? (
        <>
          <Ro l="Equatorial radius" v={sig(d.equatorialRadiusKm, 6)} u="km" />
          <Ro l="Polar radius" v={sig(d.polarRadiusKm ?? d.equatorialRadiusKm, 6)} u="km" />
        </>
      ) : (
        <Ro l="Radius" v={id === 'voyager1' ? '1.85' : sig(d.radiusKm, 6)} u={id === 'voyager1' ? 'm (antenna)' : 'km'} />
      )}
      {d.gmKm3S2 && <Ro l={<><Sym>GM</Sym></>} v={sci(d.gmKm3S2, 6)} u="km³/s²" />}
      {Number.isFinite(massKg) && <Ro l={<>Mass <Sym>GM</Sym>/<Sym>G</Sym></>} v={sci(massKg, 4)} u="kg" />}
      {d.siderealRotationH !== undefined && (
        <Ro l="Sidereal rotation" v={sig(Math.abs(d.siderealRotationH), 5)} u={d.siderealRotationH < 0 ? 'h retro.' : 'h'} />
      )}
      {d.orbitalPeriodD !== undefined && <Ro l="Orbital period" v={sig(d.orbitalPeriodD, 6)} u="d" />}
      {d.semiMajorAxisKm !== undefined && <Ro l="Semi-major axis" v={<Q x={d.semiMajorAxisKm} dim="length" d={6} />} />}
      {d.obliquityDeg !== undefined && <Ro l="Obliquity" v={fixed(d.obliquityDeg, 2)} u="°" />}
      {d.geometricAlbedo !== undefined && <Ro l="Geometric albedo" v={fixed(d.geometricAlbedo, 3)} />}
      <div className="px-2.5 pb-1 pt-1.5">
        {d.facts.map((f) => (
          <p key={f} className="mb-1.5 font-serif text-[12.5px] leading-snug text-fg-2 last:mb-0">
            {f}
          </p>
        ))}
        <p className="mono mt-2 text-[9.5px] text-fg-4">
          {id === 'voyager1' ? 'Trajectory: JPL Horizons' : id === 'proxima' ? 'Gaia DR3; Boyajian et al. 2012' : 'NASA Planetary Fact Sheets (NSSDCA)'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-1">
        <button className="btn" disabled={tripActive} onClick={() => goToBody(id)} title="Move the camera there (not a physical trip)">
          Slew camera
        </button>
        <button className="btn" disabled={tripActive} onClick={() => openPlanner(id)} title="Plan a trip at a chosen speed (G)">
          Plan trajectory…
        </button>
        <button className="btn" onClick={() => emitLightPulse(id)} title="Emit a light pulse from this body’s current position (Experiment 1)">
          Emit pulse
        </button>
      </div>
    </Sec>
  );
}

// ─── D · Optics ──────────────────────────────────────────────────────────────────────────

function Optics() {
  const doppler = useUI((s) => s.relDoppler);
  const mode = useUI((s) => s.relMode);
  const beta = observerBeta();
  const g = gamma(beta);
  const k = Math.sqrt((1 + beta) / (1 - beta));
  const warp = !!travel.trip?.warp;
  const r = reticleReading();
  const status = warp
    ? 'undefined (superluminal)'
    : mode === 'off'
      ? 'off: classical optics'
      : relView.active
        ? mode === 'split'
          ? 'active, split screen'
          : 'active'
        : `idle below β = ${REL_THRESHOLD_BETA}`;
  return (
    <Sec id="opt" idx="D" title="Relativistic optics">
      <Ro l="Renderer" v={<span className="font-sans">{status}</span>} tone={warp ? 'hazard' : relView.active ? 'data' : 'dim'} />
      <Ro l={<><Sym>D</Sym> at apex, √((1+β)/(1−β))</>} v={warp ? '—' : sig(k, 5)} title="Head-on Doppler factor e^φ" />
      <Ro l={<><Sym>D</Sym> at 90° (S′), 1/<Sym>γ</Sym></>} v={warp ? '—' : oneMinus(1 / g)} title="Transverse Doppler effect" />
      <Ro l={<><Sym>D</Sym> at antapex</>} v={warp ? '—' : sig(1 / k, 5)} />
      <Ro
        l="Forward hemisphere seen within"
        v={warp ? '—' : fixed((Math.acos(Math.min(1, beta)) * 180) / Math.PI, 3)}
        u="°"
        title="Rest-frame directions with θ ≤ 90° appear within θ′ ≤ arccos β of the apex"
      />
      <Ro l="Sun colour temp. at apex" v={warp ? '—' : sig(SUN_TEFF_K * k, 4)} u="K" title="A blackbody at T appears as a blackbody at D·T" />
      {relView.active && <Ro l="Auto-exposure" v={fixed(Math.log2(relView.exposure), 1)} u="EV" />}
      {r && r.beta >= 1e-3 && (
        <>
          <div className="cap px-2.5 pb-0.5 pt-2">Spectrometer at reticle</div>
          <Ro l={<><Sym>θ′</Sym> from apex (S′)</>} v={fixed(r.thetaShipDeg, 2)} u="°" tone="data" />
          <Ro l={<><Sym>θ</Sym> equivalent (S)</>} v={fixed(r.thetaDeg, 2)} u="°" />
          <Ro l={<><Sym>D</Sym> = ν<sub>obs</sub>/ν<sub>emit</sub></>} v={sig(r.D, 5)} tone="data" />
        </>
      )}
      <div className="pt-1">
        <Check
          checked={doppler}
          onChange={(v) => useUI.setState({ relDoppler: v })}
          hint="Off: aberration only, to separate the two effects"
        >
          Doppler shift and beaming
        </Check>
      </div>
    </Sec>
  );
}

// ─── E · Light-time ──────────────────────────────────────────────────────────────────────

function LightTime() {
  const retarded = useUI((s) => s.retarded);
  const sel = useUI((s) => s.selected);
  const far = sim.bodies.earth.distTrue > 3e5;
  return (
    <Sec id="lt" idx="E" title="Light-time">
      <Ro
        l="Age of Earth’s image"
        v={far ? <Q x={earthLight.seenAgo} dim="time" d={5} /> : '< 1 s'}
        title="Retarded light-time: Earth is seen where it was this long ago"
      />
      <Ro l="Signal to Earth" v={far ? <Q x={earthLight.messageTime} dim="time" d={5} /> : '< 1 s'} title="Advanced light-time: a signal sent now reaches Earth after this long" />
      <Ro l="Sunlight here left the Sun" v={<Q x={sim.camera.pos.length() / C_KM_S} dim="time" d={5} />} u="ago" />
      {sel && sel !== 'earth' && <Ro l={`Light-time to ${BODIES[sel].name}`} v={<Q x={sim.bodies[sel].distTrue / C_KM_S} dim="time" d={5} />} />}
      <div className="pt-1">
        <Check
          checked={retarded}
          onChange={() => useUI.getState().toggle('retarded')}
          hint="Draw each body where it was when the light now arriving left it"
        >
          Light-time correction
        </Check>
      </div>
    </Sec>
  );
}

// ─── F · Spacetime diagram ───────────────────────────────────────────────────────────────

function Spacetime() {
  const tripActive = useUI((s) => s.tripActive);
  const t = travel.trip;
  if (tripActive && t) {
    return (
      <Sec id="st" idx="F" title="Spacetime diagram">
        <div className="px-2.5 pb-2 pt-1">
          <SpacetimeDiagram spec={t} elapsed={tripElapsed(t)} height={230} />
        </div>
      </Sec>
    );
  }
  return null;
}

// ─── G · Ephemeris ───────────────────────────────────────────────────────────────────────

function Ephemeris() {
  const selected = useUI((s) => s.selected);
  const tripActive = useUI((s) => s.tripActive);
  return (
    <Sec id="eph" idx="G" title="Ephemeris" defaultOpen={false}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Body</th>
            <th title="Distance from the Sun">
              <Sym>r</Sym> / au
            </th>
            <th>Range</th>
            <th>Light-time</th>
          </tr>
        </thead>
        <tbody>
          {BODY_ORDER.map((id: BodyId) => {
            const b = sim.bodies[id];
            const rng = qty(b.distTrue, 'length', 4);
            const lt = qty(b.distTrue / C_KM_S, 'time', 3);
            return (
              <tr
                key={id}
                className={`cursor-pointer ${selected === id ? '[&>td]:!text-accent' : ''}`}
                onClick={() => useUI.getState().select(id)}
                onDoubleClick={() => !tripActive && goToBody(id)}
              >
                <td className="!font-sans">{BODIES[id].name}</td>
                <td>{id === 'sun' ? '0' : sig(b.distSun / 149_597_870.7, 5)}</td>
                <td>
                  {rich(rng.v)} <span className="text-fg-3">{rng.u}</span>
                </td>
                <td>
                  {lt.v} <span className="text-fg-3">{lt.u}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sec>
  );
}

// ─── H · Strip-chart recorder ────────────────────────────────────────────────────────────

const CHANNELS: Record<ScopeChannel, { label: string; q: string; unit?: string; log?: boolean; read: () => number }> = {
  beta: { label: 'β', q: 'β', read: () => observerBeta() },
  gamma: { label: 'γ', q: 'γ', log: true, read: () => gamma(observerBeta()) },
  dopplerFwd: { label: 'D apex', q: 'D', log: true, read: () => Math.sqrt((1 + observerBeta()) / (1 - observerBeta())) },
  dtau: { label: 'dτ/dt', q: 'dτ/dt', read: () => 1 / gamma(observerBeta()) },
  range: {
    label: 'Range',
    q: 'r',
    unit: 'km',
    log: true,
    read: () => sim.bodies[useUI.getState().selected ?? useUI.getState().focus].distTrue,
  },
};
const SPAN_S = 30;

function Scope() {
  const ch = useUI((s) => s.scopeChannel);
  const [data, setData] = useState<{ x: number; y: number }[]>([]);
  const buf = useRef<{ t: number; y: number }[]>([]);
  useEffect(() => {
    buf.current = [];
    const id = window.setInterval(() => {
      const now = performance.now() / 1000;
      buf.current.push({ t: now, y: CHANNELS[ch].read() });
      while (buf.current.length && buf.current[0].t < now - SPAN_S) buf.current.shift();
      setData(buf.current.map((p) => ({ x: p.t - now, y: p.y })));
    }, 100);
    return () => window.clearInterval(id);
  }, [ch]);
  const c = CHANNELS[ch];
  const last = data.at(-1)?.y;
  return (
    <Sec id="scope" idx="H" title="Strip-chart recorder" defaultOpen={false}>
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-0.5">
        <Seg
          label="Channel"
          value={ch}
          onChange={(v) => useUI.setState({ scopeChannel: v })}
          options={(Object.keys(CHANNELS) as ScopeChannel[]).map((k) => ({ value: k, label: <span className="!text-[10.5px]">{CHANNELS[k].label}</span> }))}
        />
      </div>
      <div className="px-2.5 pb-2">
        <Plot
          x={{ q: 'Δt real', unit: 's', domain: [-SPAN_S, 0] }}
          y={{ q: c.q, unit: c.unit, log: c.log && data.some((p) => p.y > 0) }}
          series={[{ kind: 'line', data: data.filter((p) => Number.isFinite(p.y) && (!c.log || p.y > 0)), width: 1.3 }]}
          height={120}
          legend={false}
        />
        <div className="mono mt-1 text-right text-[10.5px] text-fg-2">
          now: {rich(last === undefined ? '—' : ch === 'beta' ? fmtBeta(last) : sig(last, 5))} {c.unit}
        </div>
      </div>
    </Sec>
  );
}

// ─── Dock ────────────────────────────────────────────────────────────────────────────────

export function InstrumentsDock(): ReactNode {
  useTicker(8);
  return (
    <aside className="dock dock-r" aria-label="Instruments">
      <div className="titlebar !h-[30px]">
        <span className="cap !text-fg-2">Instruments</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ rightOpen: false })} aria-label="Close instruments">
          <CloseIcon />
        </button>
      </div>
      <div className="scroll min-h-0 flex-1">
        <Observer />
        <Clocks />
        <Target />
        <Spacetime />
        <Optics />
        <LightTime />
        <Ephemeris />
        <Scope />
      </div>
    </aside>
  );
}
