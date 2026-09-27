/**
 * The universe at the time on the clock. The simulation clock is cosmic time at home: the Solar
 * System's proper time, which differs from cosmic time by far less than anything shown. So the
 * universe's age, scale factor and background temperature follow from the clock through the one
 * cosmology (physics/cosmology, Planck 2018). Setting the clock billions of years ahead expands
 * the universe, with or without a flight; a flight moves the clock as it goes. Everything that
 * depends on the epoch of the universe reads it from here.
 *
 * The present (J2000) is the model's a = 1; the difference from the epoch of the Planck data is
 * far inside the age's ±0.02 Gyr uncertainty. Within a million years of it the scale factor is
 * taken to second order in H0 Δt (error below 10⁻¹⁰), so everyday use never builds the model's
 * tables.
 *
 * World coordinates in an expanding universe. The app's world frame (km, heliocentric) holds
 * proper positions at the clock's time, with home as the origin of comoving coordinates (a = 1
 * at the present): a galaxy that takes part in the expansion, at comoving place x, is at a(t) x;
 * a bound structure (the Local Group, a group or cluster of galaxies) keeps its physical size
 * about its anchor c, so a member is at a(t) c + (x − c) (sim/cosmos/expansion.ts). The Local
 * Group's anchor is home itself, so the Solar System, the stars and the Milky Way do not move.
 * An observer outside every bound structure at world position p is at comoving place p / a(t).
 */
import { J2000_MS, JULIAN_YEAR_MS } from '../lib/time';
import { hubbleTimeGyr, PLANCK18, planck18 } from '../physics/cosmology';
import { sim } from './sim';

export interface CosmicState {
  /** Scale factor (1 at the present). */
  a: number;
  /** ln a, to full precision however near the present. */
  lnA: number;
  /** a − 1, to full precision however near the present (the expansion since the present). */
  am1: number;
  /** Cosmic time since the Big Bang, Gyr. */
  ageGyr: number;
  /** Temperature of the cosmic background radiation, K (T0 / a). */
  tCmbK: number;
}

const GYR_MS = 1e9 * JULIAN_YEAR_MS;
/**
 * Age of the universe at the present in this cosmology, Gyr (the tests check it against the model). To
 * all its digits, so the clock's age does not jump where the series hands over to the model a million
 * years either side of the present (13.7866 would jump by 22,000 years there).
 */
export const PRESENT_AGE_GYR = 13.786578062390582;
/** Within this of the present (Gyr), the series below is used instead of the model. */
const NEAR_GYR = 1e-3;
/** H0 in 1/Gyr, and the deceleration parameter today (the tests check the series against the model). */
const H0_PER_GYR = 1 / hubbleTimeGyr(PLANCK18.H0);
export const PRESENT_DECELERATION = -0.5332;
/** The earliest time the model is asked about, Gyr (the clock may go back to the Big Bang itself). */
const EARLIEST_GYR = 1e-9;

const fresh = (): CosmicState => ({ a: 1, lnA: 0, am1: 0, ageGyr: PRESENT_AGE_GYR, tCmbK: PLANCK18.TcmbK });

/** The universe at clock time `ms` (ms since 1970, as sim.timeMs). */
export function cosmicAt(ms: number, out: CosmicState = fresh()): CosmicState {
  const dt = (ms - J2000_MS) / GYR_MS;
  if (Math.abs(dt) < NEAR_GYR) {
    const x = H0_PER_GYR * dt;
    const am1 = x - (PRESENT_DECELERATION / 2) * x * x;
    out.am1 = am1;
    out.a = 1 + am1;
    out.lnA = Math.log1p(am1);
    out.ageGyr = PRESENT_AGE_GYR + dt;
  } else {
    const model = planck18();
    const age = model.ageGyr() + dt;
    out.ageGyr = Math.max(0, age);
    const lnA = model.lnAtTime(Math.max(EARLIEST_GYR, age) / model.tH);
    out.lnA = lnA;
    out.a = Math.exp(lnA);
    out.am1 = Math.expm1(lnA);
  }
  out.tCmbK = PLANCK18.TcmbK * Math.exp(-out.lnA);
  return out;
}

const now: CosmicState = fresh();

/** The universe at the time on the clock now (one shared object, updated in place). */
export const cosmicNow = (): CosmicState => cosmicAt(sim.timeMs, now);

let memoMs = NaN;
const memo: CosmicState = fresh();

/**
 * The universe at `ms`, remembered for the last time asked about: the position providers of the
 * galaxies ask for the same time once each per frame (a shared object; copy what you keep).
 */
export function cosmicAtMemo(ms: number): CosmicState {
  if (ms !== memoMs) {
    cosmicAt(ms, memo);
    memoMs = ms;
  }
  return memo;
}
