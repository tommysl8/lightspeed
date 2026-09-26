import { describe, expect, it } from 'vitest';
import { C_KM_S, JULIAN_YEAR_S } from '../physics/constants';
import { gamma } from '../physics/relativity';
import { chrono, chronoIntegrate, chronoLaunch, chronoTau, chronoTrip, chronoTripEnd, lagRate, zeroChrono } from './chronometer';
import { sim } from './sim';

describe('chronometers', () => {
  it('computes 1 − 1/γ without cancellation', () => {
    expect(lagRate(0.6)).toBeCloseTo(1 - 1 / gamma(0.6), 15);
    // Earth's orbital speed: β²/2 ≈ 4.94 × 10⁻⁹, exactly to first order
    const b = 29.78 / C_KM_S;
    expect(lagRate(b) / ((b * b) / 2)).toBeCloseTo(1, 8);
  });

  it('accumulates the lag of a clock moving with Earth', () => {
    zeroChrono();
    sim.ship.vel.set(29.78, 0, 0);
    for (let i = 0; i < 1000; i++) chronoIntegrate(JULIAN_YEAR_S / 1000);
    const b = 29.78 / C_KM_S;
    expect(chrono.t).toBeCloseTo(JULIAN_YEAR_S, 3);
    // Earth clocks fall behind S time by about 0.156 s a year
    expect(chrono.lag).toBeCloseTo(JULIAN_YEAR_S * lagRate(b), 9);
    expect(chrono.lag).toBeGreaterThan(0.15);
    expect(chrono.lag).toBeLessThan(0.16);
  });

  it('keeps sub-nanosecond lags that timestamp differences would lose', () => {
    zeroChrono();
    sim.ship.vel.set(29.78, 0, 0);
    chronoIntegrate(0.1);
    expect(chrono.lag).toBeGreaterThan(0);
    expect(chrono.lag).toBeCloseTo(0.1 * lagRate(29.78 / C_KM_S), 20);
  });

  it('takes a trip’s own τ as is, even when the lag is nearly all of t (γ = 10⁹)', () => {
    zeroChrono();
    sim.ship.vel.set(0, 0, 0);
    chronoIntegrate(1.25);
    chronoLaunch();
    const tau = 1.234_567_890_123e9; // ship seconds
    const t = tau * 1e9;
    chronoTrip(t, t - tau, tau);
    // t − lag would leave only a few digits of τ; the explicit τ keeps all of them.
    expect(chronoTau()).toBe(1.25 + tau);
    chronoTripEnd();
    zeroChrono();
    expect(chronoTau()).toBe(0);
  });

  it('follows a trip exactly and invalidates τ after a superluminal one', () => {
    zeroChrono();
    sim.ship.vel.set(0, 0, 0);
    chronoIntegrate(10);
    chronoLaunch();
    const T = 100;
    chronoTrip(T, T * lagRate(0.8)); // Δτ = 60 s at β = 0.8
    chronoTripEnd();
    expect(chrono.t).toBeCloseTo(110, 12);
    expect(chronoTau()).toBeCloseTo(70, 10);
    chronoLaunch();
    chronoTrip(5, NaN);
    chronoTripEnd();
    expect(chrono.tauValid).toBe(false);
    zeroChrono();
    expect(chrono.tauValid).toBe(true);
  });
});
