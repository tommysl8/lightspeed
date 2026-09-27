/**
 * The instrument panel (right dock): observer kinematics, chronometers, the target data
 * sheet, relativistic optics, light-time, a spacetime diagram of the current trip, an
 * ephemeris table and a strip-chart recorder. Everything polls the simulation at 8 Hz.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { C_KM_S, SUN_TEFF_K } from '../../physics/constants';
import { bodyName, getBody, kindText, type BodyId, type BodyRecord, type Regime } from '../../sim/bodies';
import { gamma } from '../../physics/relativity';
import { fixed, fmtBeta, fmtGamma, pickUnit, qty, sci, sig, storedDigits } from '../../lib/sci';
import { radiusReading, stored } from '../dataSheet';
import { lightYearsText, roundedText, sizeText } from '../deepSkyText';
import { PictureCredit } from '../viewport/BodyCard';
import { ephemerisRows } from './ephemerisRows';
import { controller } from '../../controls/cameraController';
import { relView, REL_THRESHOLD_BETA } from '../../render/relativisticView';
import { chrono, chronoTau, zeroChrono } from '../../sim/chronometer';
import { earthLight } from '../../sim/lightDelay';
import { sim } from '../../sim/sim';
import { lagAtTau, travel, tripElapsed, tripShipTime } from '../../sim/travel';
import { formatSimDate } from '../../lib/time';
import { useUI, type ScopeChannel } from '../../state/ui';
import { angularDiameterDeg, eclipticLonLat, observerBeta, rangeRate, reticleReading, targetReading } from '../../lab/measure';
import { emitLightPulse } from '../../lab/logger';
import { goToBody } from '../navigation';
import { openPlanner } from '../tripActions';
import { Check, CloseIcon, DockResizer, Ro, Sec, Seg, Sym } from '../kit';
import { Plot } from '../plot/Plot';
import { useTicker } from '../useTicker';
import { SpacetimeDiagram } from './SpacetimeDiagram';
import { lightLeftAgo } from '../../sim/cosmos/sight';
import { rich } from '../rich';
import { starData, starLabels, loadStarNames, loadStarExtra, starsVersion, subscribeStars } from '../../sim/stars';
import type { DeepSkyInfo, ExoplanetInfo, StarInfo } from '../../sim/bodies';
import { massText, methodWords, radiusText, temperatureWords } from '../exoplanetText';

/** What the target is, for the data sheet ("Natural satellite of Earth"). */
function kindLine(r: BodyRecord): string {
  if (r.kind === 'moon' && r.parent) return `Natural satellite of ${bodyName(r.parent)}`;
  if (r.id === 'sun') return 'Star';
  return kindText(r.id);
}

const REGIME_TEXT: Record<Regime, string> = {
  precise: 'precise',
  approximate: 'approximate',
  illustrative: 'illustrative',
  extrapolated: 'extrapolated',
  unknown: 'not modelled',
};

/** Newtonian constant of gravitation, km³ kg⁻¹ s⁻². [CODATA 2018: 6.674 30 × 10⁻¹¹ m³ kg⁻¹ s⁻²] */
const G_KM3 = 6.6743e-20;

/** A quantity in its natural unit; `stored`: a value read from a data file, shown with no more digits than it has. */
const Q = ({ x, dim, d = 5, stored = false }: { x: number; dim: 'time' | 'length'; d?: number; stored?: boolean }) => {
  const q = qty(x, dim, stored ? Math.min(d, storedDigits(x / pickUnit(dim, x).factor)) : d);
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
  const t = chrono.t;
  const tau = chronoTau();
  const lag = chrono.lag;
  const valid = chrono.tauValid;
  const zero = () => {
    const tr = travel.trip;
    const el = tr ? tripElapsed(tr) : 0;
    const tau = tr ? tripShipTime(tr) : 0;
    zeroChrono(el, tau, tr ? lagAtTau(tr, tau) : 0);
  };
  const since = chrono.zeroMs;
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
        v={valid ? (lag < 1e-3 ? `${sig(lag, 3)}` : <Q x={lag} dim="time" d={5} />) : '—'}
        u={valid && lag < 1e-3 ? 's' : undefined}
      />
      <Ro l={<>Mean rate <Sym>τ</Sym>/<Sym>t</Sym></>} v={valid && t > 0 ? oneMinus(1 - lag / t) : '—'} />
      <div className="mono px-2.5 pb-1 pt-0.5 text-[10px] text-fg-3">
        zeroed {formatSimDate(since, 'datetime')} UTC
        {!valid && <span className="text-hazard"> · τ invalid after superluminal transfer</span>}
      </div>
    </Sec>
  );
}

// ─── C · Target ──────────────────────────────────────────────────────────────────────────

const PLANET_STATUS: Record<ExoplanetInfo['status'], string> = {
  confirmed: 'confirmed',
  candidate: 'candidate',
  disputed: 'disputed',
  refuted: 'refuted',
};

/** A planet of another star's rows of the data sheet: its numbers, and how each was found. */
function ExoplanetRows({ x }: { x: ExoplanetInfo }) {
  const massWord = x.massKind === 'minimum' ? 'Minimum mass (m sin i)' : x.massKind === 'estimated' ? 'Mass (estimate)' : 'Mass';
  return (
    <>
      <div className="cap px-2.5 pb-0.5 pt-2">Planet</div>
      <Ro l="Status" v={PLANET_STATUS[x.status]} tone={x.status === 'confirmed' ? undefined : 'hazard'} title={x.statusNote} />
      <Ro l="Orbits" v={x.hostName} />
      {x.archiveName && <Ro l="Archive name" v={x.archiveName} />}
      <Ro l="Eccentricity" v={fixed(x.ecc, 3)} />
      <Ro l="Inclination to the sky" v={fixed(x.inclDeg, 2)} u="°" title="90° is edge-on, seen from the Sun" />
      {x.radiusSource !== 'placeholder' && (
        <Ro l={`Radius${x.radiusSource === 'estimated' ? ' (estimate)' : ''}`} v={radiusText(x.radiusEarth)} title={x.radiusSource === 'estimated' ? 'From its mass by a mass–radius relation' : 'Measured'} />
      )}
      {x.massEarth !== undefined && <Ro l={massWord} v={massText(x.massEarth)} />}
      {x.teqK !== undefined && <Ro l={temperatureWords(x).label} v={sig(x.teqK, 3, { group: false })} u="K" title={temperatureWords(x).title} />}
      {x.method && <Ro l="Found by" v={methodWords(x.method)} />}
      {x.year !== undefined && <Ro l="Year" v={String(x.year)} />}
      {x.facility && <Ro l="Facility" v={x.facility} />}
      {x.reference && <Ro l="Discovery paper" v={x.reference} />}
      <p className="mono px-2.5 pt-1 text-[10px] leading-snug text-fg-3">{x.provenance.join(' · ')}</p>
      <p className="px-2.5 pt-1 text-[10px] leading-snug text-fg-3">Colour (illustrative): {x.colourRule}.</p>
    </>
  );
}

/** A cluster's, nebula's, black hole's or galaxy's rows of the data sheet (sim/galaxy/records.ts). */
function DeepSkyRows({ x }: { x: DeepSkyInfo }) {
  return (
    <>
      <div className="cap px-2.5 pb-0.5 pt-2">{x.type}</div>
      {x.distancePc !== undefined && (
        <Ro
          l="Distance from the Sun"
          v={roundedText(x.distancePc, 4)}
          u="pc"
          title={x.distanceLoPc !== undefined && x.distanceHiPc !== undefined ? `${roundedText(x.distanceLoPc, 4)} to ${roundedText(x.distanceHiPc, 4)} pc` : undefined}
        />
      )}
      {x.distancePc !== undefined && <Ro l="In light-years" v={lightYearsText(x.distancePc, 4)} />}
      {x.distanceSource && <Ro l="Distance measured by" v={x.distanceSource} />}
      {x.hostGalaxy && <Ro l="In the galaxy" v={x.hostGalaxy} />}
      {(x.sizes ?? []).map((s) => (
        <Ro key={s.label} l={s.label} v={sizeText(s.pc)} title={s.title} />
      ))}
      {(x.rows ?? []).map((r) => (
        <Ro key={r.l} l={r.l} v={r.v} u={r.u} title={r.title} />
      ))}
      {x.refs && x.refs.length > 0 && <p className="mono px-2.5 pt-1 text-[9.5px] leading-snug text-fg-3">{x.refs.join('; ')}</p>}
      {x.image && <PictureCredit image={x.image} className="px-2.5 pt-1" />}
    </>
  );
}

/** A star's rows of the data sheet: what it is and how each number was found. */
function StarRows({ star }: { star: StarInfo }) {
  useSyncExternalStore(subscribeStars, starsVersion);
  const i = star.catalogueIndex;
  useEffect(() => {
    if (i === undefined) return;
    void loadStarNames();
    void loadStarExtra();
  }, [i]);
  const names = starData.names;
  const extra = starData.extra;
  const labels = i !== undefined && names ? starLabels(names, i) : (star.designations ?? []);
  const constellation = star.constellation ?? (i !== undefined && names && extra?.constellation[i] ? names.constellations[extra.constellation[i] - 1]?.[1] : undefined);
  const est = (e: boolean) => (e ? ' (estimate)' : '');
  // An estimate to three figures with "≈"; a paper's value as the paper gives it.
  const approx = (x: number, e: boolean) => (e ? `≈ ${sig(x, 3, { sciAbove: 7 })}` : stored(x, 4));
  return (
    <>
      <div className="cap px-2.5 pb-0.5 pt-2">Star</div>
      {star.spectralType && <Ro l="Spectral type" v={star.spectralType} />}
      {star.teffSource !== 'unknown' && (
        <Ro
          l={star.teffSource === 'colour' ? 'Colour temperature' : 'Effective temperature'}
          v={stored(star.teffK, 5)}
          u="K"
          title={star.teffSource === 'colour' ? 'From its B−V colour (Ballesteros 2012): too cool for the hottest stars' : 'Measured (see the references)'}
        />
      )}
      {star.luminosityLsun !== undefined && (
        <Ro l={`Luminosity${est(star.luminositySource === 'estimated')}`} v={approx(star.luminosityLsun, star.luminositySource === 'estimated')} u="L☉" title={star.luminositySource === 'estimated' ? 'From M_V with the bolometric correction of Flower (1996) as corrected by Torres (2010)' : 'Measured'} />
      )}
      {star.equatorialRadiusRsun !== undefined ? (
        <>
          <Ro l="Equatorial radius" v={stored(star.equatorialRadiusRsun, 4)} u="R☉" />
          <Ro l="Polar radius" v={stored(star.polarRadiusRsun ?? star.equatorialRadiusRsun, 4)} u="R☉" />
        </>
      ) : (
        star.radiusRsun !== undefined && (
          <Ro l={`Radius${est(star.radiusSource === 'estimated')}`} v={approx(star.radiusRsun, star.radiusSource === 'estimated')} u="R☉" title={star.radiusSource === 'estimated' ? 'From its luminosity and temperature (Stefan–Boltzmann)' : 'Measured'} />
        )
      )}
      {star.massMsun !== undefined && <Ro l="Mass" v={stored(star.massMsun, 4)} u="M☉" />}
      {star.massRangeMsun && <Ro l="Mass" v={`${star.massRangeMsun[0]}–${star.massRangeMsun[1]}`} u="M☉" />}
      <Ro l={<>Absolute magnitude <Sym>M</Sym><sub>V</sub></>} v={fixed(star.absMagV, 2)} title="No correction for interstellar dust" />
      <Ro l="V seen from the Sun" v={fixed(star.vFromSun, 2)} />
      <Ro l="Distance from the Sun" v={sig(star.distancePc, 5)} u="pc" title={`${star.distanceSource}; ${star.distancePrecision}`} />
      <Ro l="Distance measured by" v={star.distanceSource} />
      <Ro l="Distance precision" v={star.distancePrecision} tone={/poor|upper/.test(star.distancePrecision + star.distanceSource) ? 'hazard' : undefined} />
      {star.altDistancePc !== undefined && <Ro l="Distance in the paper" v={sig(star.altDistancePc, 4)} u="pc" title={star.altDistanceNote} />}
      {constellation && <Ro l="Constellation" v={constellation} />}
      {labels.length > 0 && <p className="mono px-2.5 pt-1 text-[10px] leading-snug text-fg-3">{labels.join(' · ')}</p>}
      {star.refs && star.refs.length > 0 && <p className="mono px-2.5 pt-1 text-[9.5px] leading-snug text-fg-3">{star.refs.join('; ')}</p>}
    </>
  );
}

function Target() {
  const id = useUI((s) => s.selected);
  const tripActive = useUI((s) => s.tripActive);
  const labUsed = useUI((s) => s.labUsed);
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
  const r = getBody(id);
  const b = sim.bodies[id];
  if (!r || !b) return null;
  const d = r.physical;
  const ang = angle(angularDiameterDeg(id));
  const geo = targetReading(id);
  const massKg = d.massKg ?? (d.gmKm3S2 ? d.gmKm3S2 / G_KM3 : NaN);
  const radius = radiusReading(r, d.triaxialRadiiKm ? 'Mean radius' : 'Radius');
  const notes = [r.positionNote, ...(r.modelNotes ?? [])].filter((n): n is string => !!n);
  // A galaxy in the expanding universe: when its light left, not distance / c.
  const lightLeft = lightLeftAgo(id);
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
        <span className="font-serif text-[16px] text-fg">{r.name}</span>
        <span className="text-[11px] text-fg-3">{kindLine(r)}</span>
      </div>
      <Ro l="Range" v={<Q x={b.distTrue} dim="length" d={7} />} tone="data" />
      {lightLeft === 'none' ? (
        <Ro l="Light-time" v="none of its light has arrived" title="It lies beyond the observable universe from here and now" />
      ) : lightLeft ? (
        <Ro l="Its light left" v={`${lightLeft} ago`} title="A galaxy in the expanding universe: its light arriving now left it when it was nearer, so distance ÷ c is no light-time" />
      ) : (
        <Ro l="Light-time" v={<Q x={b.distTrue / C_KM_S} dim="time" d={6} />} />
      )}
      <Ro l="Range rate" v={sig(rangeRate(id), 4)} u="km/s" title="Positive: receding" />
      <Ro l="Angular diameter" v={ang.v} u={ang.u} />
      {b.magnitude < 40 && (
        <Ro
          l="Apparent magnitude V"
          v={fixed(b.magnitude, 1)}
          title={
            d.luminous
              ? 'Its own light: M_V + 5 log10(d / 10 pc), no interstellar dust'
              : r.litBy
                ? `Reflected light of ${bodyName(r.litBy)} (Lambert sphere with the body's assumed albedo)`
                : "Reflected sunlight (Lambert sphere with the body's geometric albedo)"
          }
        />
      )}
      {id !== 'sun' && <Ro l={<>Heliocentric <Sym>r</Sym></>} v={<Q x={b.distSun} dim="length" d={6} />} />}
      {geo && geo.beta >= 1e-6 && (
        <>
          <Ro l={<>Angle from apex <Sym>θ</Sym> (S)</>} v={fixed(geo.thetaDeg, 3)} u="°" />
          <Ro l={<>Observed angle <Sym>θ′</Sym> (S′)</>} v={fixed(geo.thetaShipDeg, 3)} u="°" tone="data" />
          <Ro l={<>Doppler factor <Sym>D</Sym></>} v={sig(geo.D, 5)} tone="data" />
        </>
      )}
      {r.star && <StarRows star={r.star} />}
      {r.exoplanet && <ExoplanetRows x={r.exoplanet} />}
      {r.deepSky && <DeepSkyRows x={r.deepSky} />}
      {!r.deepSky && <div className="cap px-2.5 pb-0.5 pt-2">Physical data</div>}
      {/* Each value to the precision it has (ui/dataSheet.ts): no padded figures. */}
      {d.equatorialRadiusKm ? (
        <>
          <Ro l="Equatorial radius" v={stored(d.equatorialRadiusKm)} u="km" />
          <Ro l="Polar radius" v={stored(d.polarRadiusKm ?? d.equatorialRadiusKm)} u="km" />
        </>
      ) : (
        d.triaxialRadiiKm && <Ro l="Radii a × b × c" v={d.triaxialRadiiKm.map((x) => stored(x, 4)).join(' × ')} u="km" />
      )}
      {!d.equatorialRadiusKm && !r.deepSky && <Ro l={radius.l} v={radius.v} u={radius.u} title={radius.title} />}
      {/* A star's or an exoplanet's mass is in its own rows above, with how it was found; GM from it would add false figures. */}
      {d.gmKm3S2 && !r.star && !r.exoplanet && !r.deepSky && <Ro l={<><Sym>GM</Sym></>} v={sci(d.gmKm3S2, Math.min(6, storedDigits(d.gmKm3S2)))} u="km³/s²" />}
      {Number.isFinite(massKg) && !r.star && !r.exoplanet && !r.deepSky && <Ro l={<>Mass <Sym>GM</Sym>/<Sym>G</Sym></>} v={sci(massKg, Math.min(4, storedDigits(massKg)))} u="kg" />}
      {d.siderealRotationH !== undefined && (
        <Ro l="Sidereal rotation" v={stored(Math.abs(d.siderealRotationH), 5)} u={d.siderealRotationH < 0 ? 'h retro.' : 'h'} />
      )}
      {d.orbitalPeriodD !== undefined && <Ro l="Orbital period" v={stored(d.orbitalPeriodD)} u="d" />}
      {d.semiMajorAxisKm !== undefined && <Ro l="Semi-major axis" v={<Q x={d.semiMajorAxisKm} dim="length" d={6} stored />} />}
      {d.obliquityDeg !== undefined && <Ro l="Obliquity" v={fixed(d.obliquityDeg, 2)} u="°" />}
      {d.geometricAlbedo !== undefined && (
        <Ro
          l={r.exoplanet ? 'Geometric albedo (assumed)' : 'Geometric albedo'}
          v={r.exoplanet ? `≈ ${stored(d.geometricAlbedo, 2)}` : stored(d.geometricAlbedo, 3)}
          title={r.exoplanet ? 'From its colour rule: nothing has measured it' : undefined}
        />
      )}
      {b.regime !== 'precise' && <Ro l="Position model" v={REGIME_TEXT[b.regime]} title={r.provider.label} />}
      <div className="px-2.5 pb-1 pt-1.5">
        {(r.facts ?? []).map((f) => (
          <p key={f} className="mb-1.5 font-serif text-[12.5px] leading-snug text-fg-2 last:mb-0">
            {f}
          </p>
        ))}
        {/* How far to trust the position, and what else is a model (a tumble, a missing map, an assumed ring plane). */}
        {notes.map((n, k) => (
          <p key={n} className={`${k === 0 ? 'mt-2' : 'mt-1'} text-[10.5px] leading-snug text-fg-3`}>
            {n}
          </p>
        ))}
        <p className="mono mt-2 text-[9.5px] text-fg-3">
          {r.dataSource ?? r.provider.label ?? ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-1">
        <button className="btn" disabled={tripActive} onClick={() => goToBody(id)} title="Move the camera there (not a physical trip)">
          Slew camera
        </button>
        <button className="btn" disabled={tripActive} onClick={() => openPlanner(id)} title="Plan a trip at a chosen speed (G)">
          Plan trajectory…
        </button>
        <button className="btn" onClick={() => emitLightPulse(id)} title={`Emit a light pulse from this body’s current position${labUsed ? ' (Experiment 1)' : ''}`}>
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
      {sel && sel !== 'earth' && sim.bodies[sel] && <Ro l={`Light-time to ${bodyName(sel)}`} v={<Q x={sim.bodies[sel].distTrue / C_KM_S} dim="time" d={5} />} />}
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
  // Special relativity's diagram (the Sun's frame) does not describe a flight through expanding space.
  if (tripActive && t && !t.cosmic) {
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
  return (
    <Sec id="eph" idx="G" title="Ephemeris" defaultOpen={false}>
      <EphemerisTable />
    </Sec>
  );
}

function EphemerisTable() {
  const selected = useUI((s) => s.selected);
  const focus = useUI((s) => s.focus);
  const tripActive = useUI((s) => s.tripActive);
  return (
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
          {ephemerisRows(focus, selected).map((id: BodyId) => {
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
                <td className="!font-sans">{bodyName(id)}</td>
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
    read: () => sim.bodies[useUI.getState().selected ?? useUI.getState().focus]?.distTrue ?? NaN,
  },
};
const SPAN_S = 30;

function Scope() {
  return (
    <Sec id="scope" idx="H" title="Strip-chart recorder" defaultOpen={false}>
      <ScopeBody />
    </Sec>
  );
}

function ScopeBody() {
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
    <>
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
    </>
  );
}

// ─── Dock ────────────────────────────────────────────────────────────────────────────────

export function InstrumentsDock(): ReactNode {
  useTicker(8);
  const width = useUI((s) => s.rightWidth);
  return (
    <aside className="dock dock-r relative" aria-label="Instrument panel" style={{ width }}>
      <DockResizer side="right" width={width} initial={312} min={260} max={520} onChange={(w) => useUI.setState({ rightWidth: w })} />
      <div className="titlebar !h-[30px]">
        <span className="cap !text-fg-2">Instrument panel</span>
        <button className="btn btn-q btn-sq ml-auto !h-5 !w-5" onClick={() => useUI.setState({ rightOpen: false })} aria-label="Close the instrument panel">
          <CloseIcon />
        </button>
      </div>
      <div className="scroll min-h-0 flex-1">
        <p className="border-b border-line-2 px-2.5 py-1.5 text-[11px] leading-snug text-fg-3">
          Live readouts, in the Sun’s frame S unless marked S′. Click a heading to fold its section.
        </p>
        <Observer />
        <Clocks />
        <Target />
        <Optics />
        <LightTime />
        <Spacetime />
        <Ephemeris />
        <Scope />
      </div>
    </aside>
  );
}
