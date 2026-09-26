import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { C_KM_S, G0_KM_S2, LIGHT_YEAR_KM } from '../physics/constants';
import { flipAndBurn } from '../physics/rocket';
import { rapidityFromSpeed } from '../physics/relativity';
import { sim } from './sim';
import { shipRapidity, updateShipKinematics } from './shipKinematics';
import { abortTrip, launch, travel, updateTrip, type TripPlan } from './travel';

/** A 1 g flip-and-burn along +x over `ly` light-years, launched and flown to ship time `tau`. */
function flyRocket(ly: number, tauFraction: number) {
  const d = ly * LIGHT_YEAR_KM;
  const rocket = flipAndBurn(d);
  const plan: TripPlan = {
    dest: 'earth',
    drive: 'rocket',
    beta: rocket.peakBeta,
    warp: false,
    speed: rocket.peakBeta * C_KM_S,
    gamma: rocket.peakGamma,
    start: new Vector3(),
    aim: new Vector3(d, 0, 0),
    distance: d,
    earthTime: rocket.earthTime,
    shipTime: rocket.shipTime,
    rocket,
  };
  launch(plan);
  travel.trip!.tau = tauFraction * rocket.shipTime;
  updateTrip();
  updateShipKinematics();
  return rocket;
}

afterEach(() => {
  abortTrip();
  sim.ship.vel.set(0, 0, 0);
  sim.ship.phi = 0;
});

describe('the ship’s rapidity', () => {
  it('comes from the trip model on a flight to Andromeda (γ ≈ 10⁶), not from the velocity', () => {
    const rocket = flyRocket(2.5e6, 0.5);
    const exact = (G0_KM_S2 * rocket.shipTime) / 2 / C_KM_S;
    expect(sim.ship.phi / exact).toBeCloseTo(1, 12);
    expect(Math.cosh(sim.ship.phi)).toBeGreaterThan(1e6);
    // The velocity has kept only a few digits of 1 − β by now.
    expect(Math.abs(rapidityFromSpeed(sim.ship.vel.length()) - exact)).toBeGreaterThan(1e-6);
  });

  it('stays exact on a cosmological trip, where |v| has rounded to c', () => {
    const rocket = flyRocket(1e9, 0.5);
    expect(sim.ship.vel.length() / C_KM_S).toBeCloseTo(1, 15);
    expect(rapidityFromSpeed(sim.ship.vel.length())).toBe(Infinity);
    expect(sim.ship.phi / ((G0_KM_S2 * rocket.shipTime) / 2 / C_KM_S)).toBeCloseTo(1, 12);
  });

  it('follows the velocity when not on a trip', () => {
    sim.ship.vel.set(0.6 * C_KM_S, 0, 0);
    updateShipKinematics();
    expect(sim.ship.phi).toBeCloseTo(Math.atanh(0.6), 14);
    sim.ship.vel.set(0, 0, 0);
    expect(shipRapidity()).toBe(0);
  });
});
