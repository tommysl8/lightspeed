// The home clock: what has happened at home by a given cosmic time, from future.json (literature values
// with sources; built by scripts/build-cosmology-future.mjs) and the cosmology module (CMB temperature).
//
// Two times matter for a traveller: the cosmic time "now" at home (simultaneous in the cosmic rest frame,
// i.e. at the traveller's own cosmic time) and the time at which the light now reaching the traveller
// left home (TripPlan.home.emissionTimeGyr). The first is what has happened; the second is what can be
// seen through a telescope. Probabilities are those of the cited studies; outside their range the
// functions say "not modelled" rather than extrapolate.

import futureData from '../future.json' with { type: 'json' };
import { Cosmology } from './cosmology.ts';

export type FutureData = typeof futureData;
export const FUTURE: FutureData = futureData;

export interface SunState {
  phaseId: string;
  phaseName: string;
  text: string;
  /** Interpolated on the main sequence; null in later phases (the paper tabulates only phase boundaries). */
  luminosityLsun: number | null;
  radiusRsun: number | null;
  teffK: number | null;
}

/** State of the Sun at fromNowGyr (Gyr after the present; negative = past). */
export function sunAt(fromNowGyr: number, data: FutureData = FUTURE): SunState {
  const phases = data.sun.phases;
  let ph = phases[0];
  for (const p of phases) if (fromNowGyr >= (p.fromNowGyr[0] ?? -Infinity)) ph = p;
  let L: number | null = null;
  let R: number | null = null;
  let T: number | null = null;
  if (ph.id === 'main-sequence') {
    // log L, log R and T linear in age between the tabulated main-sequence models.
    const ms = data.sun.track.filter((r) => r.massMsun === 1);
    let i = 0;
    while (i < ms.length - 2 && fromNowGyr > ms[i + 1].fromNowGyr) i++;
    const f = Math.min(1, Math.max(0, (fromNowGyr - ms[i].fromNowGyr) / (ms[i + 1].fromNowGyr - ms[i].fromNowGyr)));
    L = Math.exp(Math.log(ms[i].luminosityLsun) + f * Math.log(ms[i + 1].luminosityLsun / ms[i].luminosityLsun));
    R = Math.exp(Math.log(ms[i].radiusRsun) + f * Math.log(ms[i + 1].radiusRsun / ms[i].radiusRsun));
    T = ms[i].teffK + f * (ms[i + 1].teffK - ms[i].teffK);
  }
  return { phaseId: ph.id, phaseName: ph.name, text: ph.text, luminosityLsun: L, radiusRsun: R, teffK: T };
}

/**
 * Probability that the Milky Way and Andromeda have merged by fromNowGyr (Sawala et al. 2025, fiducial
 * model). `modelled` is false after 10 Gyr, where the value returned is the probability at 10 Gyr, a
 * lower bound.
 */
export function mwM31MergedProbability(fromNowGyr: number, data: FutureData = FUTURE): { p: number; modelled: boolean } {
  const cdf = data.localGroup.milkyWayAndromeda.cdf.fiducial as number[][];
  if (fromNowGyr <= cdf[0][0]) return { p: 0, modelled: true };
  const last = cdf[cdf.length - 1];
  if (fromNowGyr >= last[0]) return { p: last[1], modelled: fromNowGyr === last[0] };
  let i = 1;
  while (cdf[i][0] < fromNowGyr) i++;
  const f = (fromNowGyr - cdf[i - 1][0]) / (cdf[i][0] - cdf[i - 1][0]);
  return { p: cdf[i - 1][1] + f * (cdf[i][1] - cdf[i - 1][1]), modelled: true };
}

export interface HomeReport {
  /** Gyr from the present day. */
  fromNowGyr: number;
  sun: SunState;
  earth: string;
  andromeda: string;
  lmc: string;
  cmbTemperatureK: number;
  statements: string[];
  /** The landmark galaxies and clusters as seen from home at this time (see extragalacticSky). */
  sky: LandmarkView[];
}

const pct = (p: number) => (p < 0.005 ? 'under 1%' : p > 0.995 ? 'over 99%' : `about ${Math.round(p * 100)}%`);
const gyr = (x: number) => (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1));

/** What is true at home at cosmic time timeGyr (after the big bang). */
export function homeAt(cosmo: Cosmology, timeGyr: number, data: FutureData = FUTURE): HomeReport {
  const fromNow = timeGyr - cosmo.ageGyr();
  const sun = sunAt(fromNow, data);
  const engulf = data.earth.events.find((e) => e.id === 'engulfed')!.fromNowGyr;
  let earth: string;
  if (fromNow < 0) earth = 'The Earth is as it was in the past.';
  else if (fromNow < 0.5) earth = 'The Earth is still habitable.';
  else if (fromNow < 1.5) earth = 'The brightening Sun is pushing the Earth out of the habitable zone; the oceans are starting to evaporate (the timing, about a billion years from now, is a rough estimate).';
  else if (fromNow < engulf) earth = 'The Earth is a hot, dry world: the Sun has been too bright for liquid oceans for billions of years.';
  else earth = `The Earth is gone, swallowed by the red-giant Sun ${gyr(fromNow - engulf)} Gyr earlier.`;
  const m = mwM31MergedProbability(fromNow, data);
  let andromeda: string;
  if (fromNow < 4) andromeda = 'Andromeda is still approaching the Milky Way; a merger this early had a probability below 0.1%.';
  else if (m.modelled)
    andromeda = `The chance that the Milky Way and Andromeda have merged by now is ${pct(m.p)} (Sawala et al. 2025); if not, they are most likely still far apart.`;
  else
    andromeda = `Within the first 10 Gyr the Milky Way and Andromeda merged in ${pct(m.p)} of the orbits allowed by today's measurements; the study stops at 10 Gyr, so later outcomes are unknown.`;
  const lmc =
    fromNow < 1
      ? 'The Large Magellanic Cloud is still orbiting the Milky Way.'
      : fromNow < 3.6
        ? 'The Large Magellanic Cloud has probably fallen into the Milky Way (estimates range from 1.3 to 3.6 Gyr from now).'
        : 'The Large Magellanic Cloud has merged with the Milky Way.';
  const a = cosmo.scaleAtTimeGyr(timeGyr);
  const T = cosmo.cmbTemperatureK(a);
  const statements = [`The Sun is a ${sun.phaseName}. ${sun.text}`, earth, lmc, andromeda, `The cosmic microwave background is at ${T < 0.01 ? T.toExponential(2) : T.toPrecision(3)} K.`];
  const sky = extragalacticSky(cosmo, timeGyr, data);
  if (fromNow >= 10) statements.push(skyStatement(sky, fromNow));
  return { fromNowGyr: fromNow, sun, earth, andromeda, lmc, cmbTemperatureK: T, statements, sky };
}

export interface LandmarkView {
  id: string;
  name: string;
  /** Comoving distance (a = 1 today), Mpc. */
  distanceMpc: number;
  /** When it crosses the cosmic event horizon (Gyr from now): nothing it emits later ever reaches home. */
  crossesHorizonFromNowGyr: number;
  crossed: boolean;
  /** Redshift at which home sees it at the requested time, and when that light left it (Gyr from now). */
  redshiftSeen: number;
  seenAsFromNowGyr: number;
}

/**
 * The extragalactic sky from home at cosmic time timeGyr, for the landmarks in future.json (comoving
 * points; flat FLRW). A galaxy is never seen to cross the event horizon: its image redshifts and fades
 * towards the moment of crossing, which is approached but never reached.
 */
export function extragalacticSky(cosmo: Cosmology, timeGyr: number, data: FutureData = FUTURE): LandmarkView[] {
  const age = cosmo.ageGyr();
  const lObs = cosmo.lnAtTime(timeGyr / cosmo.tH);
  return data.cosmos.landmarks.map((m) => {
    const chi = m.distanceMpc / cosmo.dH;
    const lCross = cosmo.lnAtEventHorizon(chi);
    const cross = cosmo.tH * cosmo.timeLn(lCross) - age;
    const span = cosmo.emissionSpanLn(lObs, chi);
    return {
      id: m.id,
      name: m.name,
      distanceMpc: m.distanceMpc,
      crossesHorizonFromNowGyr: cross,
      crossed: timeGyr - age >= cross,
      redshiftSeen: Math.expm1(span),
      seenAsFromNowGyr: Number.isFinite(span) ? cosmo.tH * cosmo.timeLn(lObs - span) - age : -Infinity,
    };
  });
}

const zText = (z: number) => (z >= 1e4 ? z.toExponential(1) : z >= 10 ? z.toFixed(0) : z >= 0.1 ? z.toFixed(2) : z.toPrecision(2));

function skyStatement(sky: LandmarkView[], fromNow: number): string {
  const crossed = sky.filter((s) => s.crossed);
  const inside = sky.filter((s) => !s.crossed);
  const list = (xs: LandmarkView[]) => (xs.length === 1 ? xs[0].name : `${xs.slice(0, -1).map((x) => x.name).join(', ')} and ${xs[xs.length - 1].name}`);
  const parts: string[] = [];
  if (crossed.length) {
    const far = crossed.map((s) => `${s.name} at z = ${zText(s.redshiftSeen)}`).join(', ');
    parts.push(
      `${list(crossed)} ${crossed.length === 1 ? 'has' : 'have'} crossed the cosmic event horizon: nothing ${crossed.length === 1 ? 'it emits' : 'they emit'} now will ever reach home, but older light still arrives, ever more redshifted and fainter (seen from home: ${far}).`,
    );
  }
  if (inside.length) {
    const next = inside.map((s) => `${s.name}, z = ${zText(s.redshiftSeen)}, crosses it about ${gyr(s.crossesHorizonFromNowGyr)} Gyr from the present day`).join('; ');
    parts.push(`${crossed.length ? 'Still inside' : 'Galaxies beyond the Local Group keep receding ever faster; still inside the cosmic event horizon'}: ${next}.`);
  }
  if (fromNow >= 1000)
    parts.push('On timescales comparable to the lives of the longest-lived stars, the light of everything beyond the merged Local Group is redshifted until it is truly invisible (Krauss & Scherrer 2007).');
  const text = parts.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The home report for an arriving traveller: what is true at home at the arrival cosmic time, and what
 * the light arriving from home shows (emitted at seenTimeGyr).
 */
export function homeReport(cosmo: Cosmology, arrivalTimeGyr: number, seenTimeGyr: number, data: FutureData = FUTURE): { now: HomeReport; seen: HomeReport } {
  return { now: homeAt(cosmo, arrivalTimeGyr, data), seen: homeAt(cosmo, seenTimeGyr, data) };
}
