/**
 * Roam's speed scale (controls/roamScale.ts): how each kind of thing counts, how the scale is followed, the
 * pace and its step, and two flights worked through frame by frame with the same functions the controller
 * uses: into a planet (gentle, and never through its surface) and across the gap from the Milky Way to
 * Andromeda (seconds, not millions of years).
 */
import { describe, expect, it } from 'vitest';
import { MPC_KM, PARSEC_KM } from '../physics/constants';
import { planck18 } from '../physics/cosmology/cosmology';
import {
  CORE_SHARE,
  EDGE_FLOOR_KM,
  EDGE_KM,
  INSIDE_SHARE,
  POINT_FACTOR,
  RISE_RATE,
  ROAM_BOOST,
  ROAM_MUL_MAX,
  ROAM_MUL_MIN,
  ROAM_RATE,
  STEP_SHARE,
  SURFACE_SHARE,
  clampMul,
  followScale,
  riseRate,
  roamClassOf,
  roamSpeedKmS,
  roamStepKm,
  thingScaleKm,
  wheelMul,
} from './roamScale';

const KPC = 1000 * PARSEC_KM;

describe('how Roam counts each kind of thing', () => {
  it('sorts the registry’s kinds: surfaces, horizons, extended things, groups of galaxies', () => {
    expect(roamClassOf('planet')).toBe('solid');
    expect(roamClassOf('moon')).toBe('solid');
    expect(roamClassOf('star')).toBe('solid');
    expect(roamClassOf('spacecraft')).toBe('solid');
    expect(roamClassOf('exoplanet')).toBe('solid');
    expect(roamClassOf('black-hole')).toBe('hole');
    expect(roamClassOf('galaxy')).toBe('extended');
    expect(roamClassOf('nebula')).toBe('extended');
    expect(roamClassOf('cluster', 'Open cluster')).toBe('extended');
    expect(roamClassOf('cluster', 'Globular cluster')).toBe('extended');
    expect(roamClassOf('cluster', 'Cluster of galaxies')).toBe('group');
    expect(roamClassOf('cluster', 'Group of galaxies')).toBe('group');
    expect(roamClassOf('barycentre')).toBe('none');
  });

  it('gives a surface the height above its closest approach, never quite zero', () => {
    const rMin = 6474;
    expect(thingScaleKm('solid', rMin + 1000, rMin, 6378)).toBeCloseTo(1000 + SURFACE_SHARE * rMin, 9);
    expect(thingScaleKm('solid', rMin, rMin, 6378)).toBeCloseTo(SURFACE_SHARE * rMin, 12);
    // Inside it (a moon swept through the camera at a high time warp) it is still not zero.
    expect(thingScaleKm('solid', 0.5 * rMin, rMin, 6378)).toBeGreaterThan(0);
  });

  it('gives a black hole the height above its horizon', () => {
    const rs = 1.269e7;
    expect(thingScaleKm('hole', rs + 12.69, rs, rs)).toBeCloseTo(12.69, 6);
    expect(thingScaleKm('hole', rs, rs, rs)).toBe(0);
  });

  it('slows to a tenth of a galaxy’s radius at its edge, and inside it to a tenth of the way to its centre', () => {
    const R = 15 * KPC;
    const edge = thingScaleKm('extended', R, 0, R);
    expect(edge).toBeCloseTo(INSIDE_SHARE * R, 0);
    // Continuous across the edge, from outside and from inside.
    expect(thingScaleKm('extended', R * (1 + 1e-9), 0, R) / edge).toBeCloseTo(1, 6);
    expect(thingScaleKm('extended', R * (1 - 1e-9), 0, R) / edge).toBeCloseTo(1, 6);
    expect(thingScaleKm('extended', 3 * R, 0, R)).toBeCloseTo(2 * R + INSIDE_SHARE * R, 0);
    // The Sun, 8.2 kpc from the Galaxy's centre: 820 pc (the stars round it set a smaller pace).
    expect(thingScaleKm('extended', 8.2 * KPC, 0, R) / PARSEC_KM).toBeCloseTo(820, 6);
    // At the very centre it does not stop.
    expect(thingScaleKm('extended', 0, 0, R)).toBeCloseTo(INSIDE_SHARE * CORE_SHARE * R, 0);
  });

  it('counts a group of galaxies only from outside: its centre is empty space between its members', () => {
    const R = 0.96e3 * KPC;
    expect(thingScaleKm('group', 2 * R, 0, R)).toBeCloseTo(R + INSIDE_SHARE * R, -3);
    expect(thingScaleKm('group', 0.5 * R, 0, R)).toBe(Infinity);
  });

  it('stops at the edge of the observable universe: today’s particle horizon', () => {
    expect(EDGE_KM / (planck18().particleHorizonMpc() * MPC_KM)).toBeCloseTo(1, 6);
  });

  it('passes a catalogue star as a point, and keeps the edge a wall that does not trap', () => {
    expect(thingScaleKm('point', 1.3 * PARSEC_KM, 0, 0)).toBeCloseTo(POINT_FACTOR * 1.3 * PARSEC_KM, 0);
    expect(thingScaleKm('edge', 0, 0, 0)).toBe(EDGE_FLOOR_KM);
    expect(thingScaleKm('none', 1, 1, 1)).toBe(Infinity);
  });
});

describe('the scale followed from frame to frame', () => {
  it('takes a smaller scale at once, and a larger one no faster than its rate allows', () => {
    expect(followScale(1000, 10, 1 / 60)).toBe(10);
    // A jump of a million times: e^(4/60) a frame at most.
    expect(followScale(1000, 1e9, 1 / 60)).toBeCloseTo(1000 * Math.exp(RISE_RATE / 60), 6);
    // A faster pace (Shift, a larger multiplier) lets it grow as fast as moving at that pace grows it.
    expect(followScale(1000, 1e9, 1 / 60, 60)).toBeCloseTo(1000 * Math.exp(1), 6);
    expect(followScale(1000, 1001, 1 / 60)).toBe(1001);
  });

  it('starts from whatever it is given, and holds when nothing is measured', () => {
    expect(followScale(NaN, 42, 1 / 60)).toBe(42);
    expect(followScale(0, 42, 1 / 60)).toBe(42);
    expect(followScale(42, Infinity, 1 / 60)).toBe(42);
    expect(followScale(42, NaN, 1 / 60)).toBe(42);
    expect(followScale(10, 0, 1 / 60)).toBeGreaterThan(0);
  });

  it('lets the scale grow half as fast again as the pace grows it, and never slower than its floor rate', () => {
    expect(riseRate(1)).toBe(Math.max(RISE_RATE, 1.5 * ROAM_RATE));
    expect(riseRate(1, ROAM_BOOST)).toBeCloseTo(1.5 * ROAM_RATE * ROAM_BOOST, 12);
    expect(riseRate(100)).toBeCloseTo(150 * ROAM_RATE, 12);
  });
});

describe('the pace', () => {
  it('is the scale per second times the rate, the multiplier and the boost', () => {
    expect(roamSpeedKmS(1000, 1)).toBeCloseTo(ROAM_RATE * 1000, 12);
    expect(roamSpeedKmS(1000, 2, ROAM_BOOST)).toBeCloseTo(ROAM_RATE * 2000 * ROAM_BOOST, 9);
  });

  it('never steps more than half the scale in a frame, however slow the frame or high the pace', () => {
    expect(roamStepKm(roamSpeedKmS(1000, 1), 1 / 60, 1000)).toBeCloseTo((ROAM_RATE * 1000) / 60, 9);
    expect(roamStepKm(roamSpeedKmS(1000, ROAM_MUL_MAX, ROAM_BOOST), 0.5, 1000)).toBe(STEP_SHARE * 1000);
  });

  it('turns with the wheel by about a quarter a notch, within its range', () => {
    expect(wheelMul(1, -100)).toBeCloseTo(Math.exp(0.23), 12);
    expect(wheelMul(1, 100)).toBeCloseTo(Math.exp(-0.23), 12);
    expect(wheelMul(ROAM_MUL_MAX, -1e5)).toBe(ROAM_MUL_MAX);
    expect(wheelMul(ROAM_MUL_MIN, 1e5)).toBe(ROAM_MUL_MIN);
    expect(clampMul(NaN)).toBe(1);
  });
});

/**
 * A straight flight at full input with the controller's functions, one frame at a time: `scaleAt(x)` is the
 * least effective distance at x (km along the line), `stop(x)` when to stop. Returns the time taken and
 * where it stopped.
 */
function fly(opts: { x0: number; dir: 1 | -1; scaleAt: (x: number) => number; stop: (x: number) => boolean; mul?: number; boost?: number; dt?: number; maxS?: number }): { t: number; x: number } {
  const { dir, scaleAt, stop, mul = 1, boost = 1, dt = 1 / 60, maxS = 120 } = opts;
  let x = opts.x0;
  let scale = NaN;
  let t = 0;
  while (t < maxS && !stop(x)) {
    scale = followScale(scale, scaleAt(x), dt, riseRate(mul, boost));
    x += dir * roamStepKm(roamSpeedKmS(scale, mul, boost), dt, scale);
    t += dt;
  }
  return { t, x };
}

describe('two flights, frame by frame', () => {
  it('comes down to a planet gently and never through its closest approach, even at two frames a second', () => {
    const R = 6378;
    const rMin = 1.015 * R;
    const scaleAt = (x: number) => thingScaleKm('solid', x, rMin, R);
    // From 26,000 km out, straight down: within 1,000 km of the closest approach in about a second and a half.
    const near = fly({ x0: 26_000, dir: -1, scaleAt, stop: (x) => x - rMin < 1000 });
    expect(near.t).toBeGreaterThan(0.8);
    expect(near.t).toBeLessThan(2.5);
    // There the pace is gentle: about 1,500 km a second, slowing as it goes.
    expect(roamSpeedKmS(scaleAt(rMin + 1000), 1)).toBeCloseTo(ROAM_RATE * (1000 + SURFACE_SHARE * rMin), 6);
    // Each step, at any frame rate and pace, is at most half the height above the closest approach and the sliver
    // beyond it: the controller's clamp to the closest approach is all that is ever needed.
    for (const dt of [1 / 60, 0.5]) {
      for (const [mul, boost] of [
        [1, 1],
        [ROAM_MUL_MAX, ROAM_BOOST],
      ]) {
        let x = rMin + 1000;
        let scale = NaN;
        for (let i = 0; i < 200; i++) {
          scale = followScale(scale, scaleAt(x), dt, riseRate(mul, boost));
          const step = roamStepKm(roamSpeedKmS(scale, mul, boost), dt, scale);
          expect(step).toBeLessThanOrEqual(STEP_SHARE * scaleAt(x) + 1e-9);
          x = Math.max(rMin, x - step);
        }
        expect(x).toBeGreaterThanOrEqual(rMin);
      }
    }
  });

  it('crosses from the Milky Way to Andromeda in seconds, and in about a second with Shift', () => {
    const R_MW = 15 * KPC;
    const R_M31 = 23 * KPC;
    const D = 765 * KPC;
    const scaleAt = (x: number) => Math.min(thingScaleKm('extended', Math.abs(x), 0, R_MW), thingScaleKm('extended', Math.abs(D - x), 0, R_M31));
    const inM31 = (x: number) => D - x < R_M31;
    const plain = fly({ x0: R_MW, dir: 1, scaleAt, stop: inM31 });
    expect(inM31(plain.x)).toBe(true);
    expect(plain.t).toBeGreaterThan(3);
    expect(plain.t).toBeLessThan(12);
    const shift = fly({ x0: R_MW, dir: 1, scaleAt, stop: inM31, boost: ROAM_BOOST });
    expect(shift.t).toBeLessThan(plain.t / 3);
    expect(shift.t).toBeLessThan(3);
  });
});
