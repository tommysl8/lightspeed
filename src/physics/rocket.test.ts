import { describe, expect, it } from 'vitest';
import {
  acceleratingState,
  coshMinusOne,
  earthTimeAtShipTime,
  flipAndBurn,
  flipAndBurnAt,
  flipAndBurnAtEarthTime,
  flipAndBurnLag,
  photonRocketMassRatio,
  properTimeToCover,
  shipTimeAtEarthTime,
  sinhMinusX,
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

  it('maps ship time to Earth time and back, from a short hop to γ = 10⁹', () => {
    const c2a = (C_KM_S * C_KM_S) / G0_KM_S2;
    // Peak γ = 1 + d_half·a/c², so these reach γ ≈ 1 + 10⁻¹⁰, …, 10⁶ and 10⁹ at the flip.
    const distances = [1e3, 1e6, 1.5e8, PROXIMA_DISTANCE_KM, 1e3 * LIGHT_YEAR_KM, 2 * c2a * (1e6 - 1), 2 * c2a * (1e9 - 1)];
    for (const D of distances) {
      const trip = flipAndBurn(D);
      const huge = trip.peakGamma > 1e8;
      // Near the end of a γ = 10⁹ trip, Earth time (~6 × 10¹⁶ s) is only resolved to 8 s by a
      // float64, which is 3 × 10⁻⁹ of the ship time: check that trip up to 90% of the way.
      const fractions = huge ? [0, 1e-6, 0.1, 0.3, 0.5, 0.7, 0.9] : [0, 1e-6, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999, 1];
      for (const f of fractions) {
        const tau = f * trip.shipTime;
        const t = earthTimeAtShipTime(trip, tau);
        expect(Math.abs(shipTimeAtEarthTime(trip, t) - tau) / trip.shipTime, `D=${D} f=${f}`).toBeLessThan(1e-9);
        // The Earth-time direction is exact to rounding everywhere.
        const t2 = f * trip.earthTime;
        expect(Math.abs(earthTimeAtShipTime(trip, shipTimeAtEarthTime(trip, t2)) - t2) / trip.earthTime).toBeLessThan(1e-12);
        // Agrees with the full state.
        expect(Math.abs(flipAndBurnAt(trip, tau).t - t) / trip.earthTime).toBeLessThan(1e-12);
      }
      expect(earthTimeAtShipTime(trip, trip.shipTime)).toBe(trip.earthTime);
      expect(trip.peakGamma).toBeGreaterThanOrEqual(1);
    }
    expect(flipAndBurn(2 * c2a * (1e9 - 1)).peakGamma / 1e9).toBeCloseTo(1, 9);
  });

  it('computes the lag t − τ without cancellation', () => {
    const trip = flipAndBurn(PROXIMA_DISTANCE_KM);
    // After one second at 1 g: (c/a)(φ³/6), φ = aτ/c ≈ 3.27 × 10⁻⁸
    const phi = G0_KM_S2 / C_KM_S;
    expect(flipAndBurnLag(trip, 1) / ((C_KM_S / G0_KM_S2) * (phi ** 3 / 6))).toBeCloseTo(1, 12);
    for (const f of [0.2, 0.5, 0.8, 1]) {
      const tau = f * trip.shipTime;
      expect(flipAndBurnLag(trip, tau) / (earthTimeAtShipTime(trip, tau) - tau)).toBeCloseTo(1, 10);
    }
    expect(sinhMinusX(0.0999999) / (Math.sinh(0.0999999) - 0.0999999)).toBeCloseTo(1, 11);
    expect(coshMinusOne(1e-9)).toBeCloseTo(5e-19, 30);
  });

  it('covers tiny distances exactly (no cancellation in cosh − 1)', () => {
    const s = acceleratingState(1);
    expect(s.d / (0.5 * G0_KM_S2)).toBeCloseTo(1, 9);
    expect(acceleratingState(properTimeToCover(1e-3)).d / 1e-3).toBeCloseTo(1, 12);
  });

  it('needs a photon-rocket mass ratio of ~39 (~38 kg of propellant per kg delivered) to Proxima', () => {
    expect(photonRocketMassRatio(flipAndBurn(PROXIMA_DISTANCE_KM))).toBeCloseTo(38.6, 0);
  });
});
