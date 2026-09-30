import { describe, expect, it, onTestFinished } from 'vitest';
import { C_KM_S, JULIAN_YEAR_S } from '../physics/constants';
import { gamma } from '../physics/relativity';
import { chrono, chronoIntegrate, chronoLaunch, chronoTau, chronoTrip, chronoTripEnd, lagRate, zeroChrono } from './chronometer';
import { gravity } from './gravity';
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

  it('carries a black hole’s gravity: dτ/dt = α/cosh φ_S (0.458 243 571 at x = 0.5, φ = 1), with the lag kept apart', () => {
    onTestFinished(() => {
      // Back to no hole, whatever happened (the other tests run at x = 0).
      gravity.x = 0;
      gravity.alpha = 1;
      sim.ship.phi = 0;
    });
    zeroChrono();
    sim.ship.vel.set(C_KM_S * Math.tanh(1), 0, 0);
    sim.ship.phi = 1;
    gravity.x = 0.5;
    gravity.alpha = Math.sqrt(0.5);
    chronoIntegrate(1);
    expect(chronoTau()).toBeCloseTo(0.458_243_571_484_656, 15);
    expect(chrono.lag).toBeCloseTo(1 - 0.458_243_571_484_656, 15);
    expect(chrono.t).toBe(1);
    // Hovering 10⁻⁶ r_s above the horizon (α ≈ 10⁻³): τ keeps its digits although the lag is nearly all of t.
    zeroChrono();
    sim.ship.vel.set(0, 0, 0);
    sim.ship.phi = 0;
    gravity.x = 1 / (1 + 1e-6);
    gravity.alpha = Math.sqrt(1e-6 / (1 + 1e-6));
    for (let i = 0; i < 1000; i++) chronoIntegrate(1 / gravity.alpha / 60);
    expect(chronoTau() / (1000 / 60)).toBeCloseTo(1, 13);
    expect((chrono.t - chronoTau() - chrono.lag) / chrono.t).toBeCloseTo(0, 12);
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
