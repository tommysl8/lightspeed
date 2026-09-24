import { describe, expect, it } from 'vitest';
import {
  acceleratingState,
  flipAndBurn,
  flipAndBurnAt,
  flipAndBurnAtEarthTime,
  photonRocketMassRatio,
  properTimeToCover,
} from './rocket';
import { C_KM_S, G0_KM_S2, JULIAN_YEAR_S, LIGHT_YEAR_KM, PROXIMA_DISTANCE_KM } from './constants';
import { gamma } from './relativity';

const yr = JULIAN_YEAR_S;

describe('relativistic rocket (constant proper acceleration)', () => {
  it('reduces to Newtonian motion at first: d ≈ ½ a τ², t ≈ τ', () => {
    const tau = 3600; // one hour at 1 g
    const s = acceleratingState(tau);
    expect(s.d / (0.5 * G0_KM_S2 * tau * tau)).toBeCloseTo(1, 6);
    expect(s.t / tau).toBeCloseTo(1, 6);
  });

  it('matches the known 1 g numbers: after 1 year of ship time, β = tanh(1.0323…) ≈ 0.775', () => {
    const s = acceleratingState(yr);
    // a·τ/c = 9.80665 m/s² × 31,557,600 s / 299,792,458 m/s = 1.03229…
    expect((G0_KM_S2 * yr) / C_KM_S).toBeCloseTo(1.03229, 4);
    expect(s.beta).toBeCloseTo(0.7749, 3);
    expect(s.gamma).toBeCloseTo(gamma(s.beta), 9);
    // c/a = 0.968716 yr (and c²/a = 0.968716 ly): t = 0.968716 × sinh(1.03229) = 1.1873 yr,
    // d = 0.968716 × (cosh(1.03229) − 1) = 0.5636 ly
    expect(s.t / yr).toBeCloseTo(1.1873, 3);
    expect(s.d / LIGHT_YEAR_KM).toBeCloseTo(0.5636, 3);
  });

  it('inverts: properTimeToCover(d) is the τ that covers d', () => {
    for (const d of [1e6, 1e10, LIGHT_YEAR_KM, 30 * LIGHT_YEAR_KM]) {
      expect(acceleratingState(properTimeToCover(d)).d / d).toBeCloseTo(1, 9);
    }
  });

  it('gets to Proxima Centauri in ~3.54 years of ship time (~5.87 on Earth), peaking at ~0.95c', () => {
    const trip = flipAndBurn(PROXIMA_DISTANCE_KM);
    expect(trip.shipTime / yr).toBeGreaterThan(3.53);
    expect(trip.shipTime / yr).toBeLessThan(3.55);
    expect(trip.earthTime / yr).toBeGreaterThan(5.86);
    expect(trip.earthTime / yr).toBeLessThan(5.89);
    expect(trip.peakBeta).toBeCloseTo(0.9497, 3);
  });

  it('is symmetric and arrives at rest', () => {
    const trip = flipAndBurn(PROXIMA_DISTANCE_KM);
    const end = flipAndBurnAt(trip, trip.shipTime);
    expect(end.d / trip.distance).toBeCloseTo(1, 9);
    expect(end.t / trip.earthTime).toBeCloseTo(1, 9);
    expect(end.beta).toBeCloseTo(0, 9);
    const mid = flipAndBurnAt(trip, trip.shipTime / 2);
    expect(mid.d / trip.distance).toBeCloseTo(0.5, 9);
    expect(mid.beta).toBeCloseTo(trip.peakBeta, 9);
  });

  it('Earth-time parametrisation agrees with the ship-time one', () => {
    const trip = flipAndBurn(PROXIMA_DISTANCE_KM);
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.95]) {
      const byTau = flipAndBurnAt(trip, f * trip.shipTime);
      const byT = flipAndBurnAtEarthTime(trip, byTau.t);
      expect(byT.tau / (f * trip.shipTime)).toBeCloseTo(1, 9);
      expect(byT.d / byTau.d).toBeCloseTo(1, 9);
      expect(byT.beta).toBeCloseTo(byTau.beta, 9);
    }
  });

  it('needs ~39 kg of perfect photon-rocket propellant per kg delivered to Proxima', () => {
    expect(photonRocketMassRatio(flipAndBurn(PROXIMA_DISTANCE_KM))).toBeCloseTo(38.6, 0);
  });
});
