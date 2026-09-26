import { describe, expect, it } from 'vitest';
import { Cosmology, PLANCK18, planck18 } from './cosmology.ts';
import { C_M_S, G0_M_S2, MPC_KM, MPC_LY, YEAR_S } from './constants.ts';
import { dopri5 } from './ode.ts';
import {
  ICHI,
  IK,
  IW,
  IX,
  MIN_ACCEL_M_S2,
  makeFrame,
  maxReach,
  planCruise,
  planFlipAndBurn,
  planRoundTrip,
  planStatic,
  planStaticCruise,
  rhsProper,
  sampleAt,
  stateAtShipTime,
  staticShipTimeYr,
  type TripPlan,
  type Unreachable,
} from './ship.ts';
import { LOCAL_GROUP, isBoundToLocalGroup, planTrip, propagationModel } from './policy.ts';

const c = planck18();
const rel = (x: number, y: number) => Math.abs(x / y - 1);
function ok(p: TripPlan | Unreachable): TripPlan {
  if (!p.ok) throw new Error(p.message);
  return p;
}
/** A universe with the Planck shape but H0 smaller by 1e15: space is static for any trip we fly. */
const frozen = new Cosmology({ name: 'nearly static', H0: 67.66e-15, omegaM: 0.3111, TcmbK: 0, nEff: 0, mNuEv: [] });

// Distances (Mpc): Proxima (Gaia DR3 parallax 768.0665 mas), Sgr A* (GRAVITY 2022, 8.277 kpc),
// M31 (Li et al. 2021, 0.761 Mpc), Virgo cluster (Mei et al. 2007, 16.5 Mpc).
const PROXIMA = 1e-6 / 0.7680665;
const GALACTIC_CENTRE = 8.277e-3;
const M31 = 0.761;
const VIRGO = 16.5;

/**
 * Independent check: fly the planned burn schedule with the equations of motion written from the
 * Christoffel symbols in conformal coordinates (ds^2 = a^2(eta) (-deta^2 + dx^2), c = 1, time unit c/A):
 *   dU^eta/dtau = -Hc (U^eta^2 + U^x^2) + A U^x,  dU^x/dtau = -2 Hc U^eta U^x + A U^eta,  Hc = a' / a.
 * Returns the comoving distance (units c^2/A) and ln a at the end.
 */
function flyConformal(p: TripPlan): { x: number; lnA: number; uAtFlip: number } {
  const fr = p.frame!;
  const eta0 = c.conformalLn(Math.log(p.departure.scale)) / fr.epsScale;
  const lnAof = (deta: number) => c.lnAtConformal((eta0 + deta) * fr.epsScale);
  const rhs = (A: number) => (_t: number, y: Float64Array, dy: Float64Array) => {
    const a = Math.exp(lnAof(y[0]));
    const Hc = a * fr.epsScale * c.E(a);
    dy[0] = y[2];
    dy[1] = y[3];
    dy[2] = -Hc * (y[2] * y[2] + y[3] * y[3]) + A * y[3];
    dy[3] = -2 * Hc * y[2] * y[3] + A * y[2];
  };
  const sF = p.phases[0].s1;
  const r1 = dopri5(rhs(1), 0, [0, 0, 1 / p.departure.scale, 0], sF, { rtol: 1e-12, h0: 1e-3 });
  const aF = Math.exp(lnAof(r1.y[0]));
  const r2 = dopri5(rhs(-1), sF, r1.y, p.phases[1].s1, { rtol: 1e-12, h0: 1e-3 });
  return { x: r2.y[1], lnA: lnAof(r2.y[0]), uAtFlip: aF * r1.y[3] };
}

/**
 * A second independent check, better conditioned: comoving momentum p = (a/a_dep) u with cosmic time T
 * (units c/A) as the independent variable, dp/dT = +-a/a_dep (the identity d(a u)/dt = a A/c),
 * dchi/dT = u / (gamma a), with a(T) from the cosmology table. No rapidity and no Hubble-drag term.
 */
function flyMomentum(p: TripPlan): { x: number; pEnd: number; pFlip: number } {
  const fr = p.frame!;
  const tHu = MPC_KM / c.params.H0 / fr.tu;
  const t0 = c.timeLn(Math.log(fr.aDep)) * tHu;
  const rhs = (sgn: number) => (T: number, y: Float64Array, dy: Float64Array) => {
    const a = Math.exp(c.lnAtTime((t0 + T) / tHu));
    const u = (y[0] * fr.aDep) / a;
    dy[0] = (sgn * a) / fr.aDep;
    dy[1] = u / (Math.hypot(1, u) * a);
  };
  const tFlip = p.phases[0].cpY[p.phases[0].cpY.length - 1][2];
  const tEnd = p.phases[1].cpY[p.phases[1].cpY.length - 1][2];
  const r1 = dopri5(rhs(1), 0, [0, 0], tFlip, { rtol: 1e-12, h0: 1e-3 });
  const r2 = dopri5(rhs(-1), tFlip, r1.y, tEnd, { rtol: 1e-12, h0: 1e-3 });
  return { x: r2.y[1], pEnd: r2.y[0], pFlip: r1.y[0] };
}

describe('equations of motion', () => {
  it('a free particle keeps a*u constant (peculiar momentum decays as 1/a), from u = 1e-3 to 1e12', () => {
    const fr = makeFrame(c, 1, G0_M_S2);
    for (const u0 of [1e-3, 1, 1e4, 1e12]) {
      // Coast long enough for the universe to grow by a factor of several.
      const span = u0 < 1 ? 3e10 : u0 < 1e5 ? 3e10 / u0 : 0.05;
      const r = dopri5(rhsProper(fr, 0), 0, [Math.asinh(u0), 0, 0, 0, 0, 0], span, { rtol: 1e-12, h0: span / 1e4 });
      const a = Math.exp(r.y[IX]);
      expect(a).toBeGreaterThan(1.5);
      expect(rel(a * Math.sinh(r.y[IW]), u0)).toBeLessThan(1e-10);
    }
  });
  it('with constant thrust, a u - a0 u0 = (A/c) int a dt on every planned trip', () => {
    for (const d of [PROXIMA, VIRGO, c.comovingDistanceMpc(1)]) expect(ok(planFlipAndBurn(c, d)).diagnostics.conservation).toBeLessThan(1e-10);
  });
  it('the cosmic time integrated along the trip equals t(a_arr) - t(a_dep) from the cosmology table', () => {
    for (const d of [VIRGO, 1000, c.comovingDistanceMpc(1)]) expect(ok(planFlipAndBurn(c, d)).diagnostics.tableTime).toBeLessThan(1e-11);
  });
  it('an independent integration in conformal coordinates reproduces the planned trips', () => {
    // This formulation cancels terms of order gamma ~ 1e10 near the end, so it only checks to ~1e-7.
    for (const d of [VIRGO, c.comovingDistanceMpc(0.5), c.comovingDistanceMpc(1)]) {
      const p = ok(planFlipAndBurn(c, d));
      const f = flyConformal(p);
      const fr = p.frame!;
      expect(rel(f.x, d / fr.chiUnitMpc)).toBeLessThan(2e-7);
      expect(Math.abs(f.lnA - Math.log(p.arrival.scale))).toBeLessThan(5e-7);
      expect(rel(f.uAtFlip, p.peakU)).toBeLessThan(1e-9);
    }
  });
  it('an independent integration of the comoving momentum in cosmic time reproduces the arrival to 1e-12', () => {
    for (const d of [VIRGO, c.comovingDistanceMpc(0.5), c.comovingDistanceMpc(1), 5000]) {
      const p = ok(planFlipAndBurn(c, d));
      const f = flyMomentum(p);
      expect(rel(f.x, d / p.frame!.chiUnitMpc)).toBeLessThan(2e-12);
      expect(Math.abs(f.pEnd / f.pFlip)).toBeLessThan(1e-11); // at rest on arrival
    }
  });
});

describe('flat-space limit (H -> 0)', () => {
  it('tau = (2c/A) arccosh(1 + A d / 2c^2) to 1e-10, from 200 au to gamma = 1e12', () => {
    const tu = C_M_S / G0_M_S2;
    const unitMpc = (299792.458 * tu) / MPC_KM;
    for (const d of [1e-9, PROXIMA, M31, VIRGO, 3395, 2 * (1e12 - 1) * unitMpc]) {
      const p = ok(planFlipAndBurn(frozen, d));
      const tauExact = ((2 * tu) / YEAR_S) * Math.acosh(1 + d / (2 * unitMpc));
      expect(rel(p.shipTimeYr, tauExact)).toBeLessThan(1e-10);
      expect(rel(p.shipTimeYr, staticShipTimeYr(d))).toBeLessThan(1e-10);
      expect(rel(p.peakGamma, 1 + d / (2 * unitMpc))).toBeLessThan(1e-10);
      expect(rel(p.cosmicTimeYr, ((2 * tu) / YEAR_S) * Math.sinh(tauExact / ((2 * tu) / YEAR_S)))).toBeLessThan(1e-10);
    }
    const big = ok(planFlipAndBurn(frozen, 2 * (1e12 - 1) * unitMpc));
    expect(big.peakGamma).toBeCloseTo(1e12, -2);
  });
  it('the FLRW correction shrinks in proportion to H0', () => {
    const scaled = (k: number) => new Cosmology({ ...PLANCK18, H0: 67.66 * k, TcmbK: 0, nEff: 0, mNuEv: [] });
    const diff = (k: number) => ok(planFlipAndBurn(scaled(k), VIRGO)).shipTimeYr / staticShipTimeYr(VIRGO) - 1;
    const d1 = diff(1e-2);
    const d2 = diff(1e-3);
    expect(d1).toBeGreaterThan(0);
    expect(d1 / d2).toBeGreaterThan(9.9);
    expect(d1 / d2).toBeLessThan(10.1);
  });
  it('in our universe, nearby trips match special relativity (differences ~ H x trip time)', () => {
    const d = (x: number) => rel(ok(planFlipAndBurn(c, x)).shipTimeYr, staticShipTimeYr(x));
    expect(d(PROXIMA)).toBeLessThan(1e-9);
    expect(d(GALACTIC_CENTRE)).toBeLessThan(3e-7);
    expect(d(M31)).toBeLessThan(1e-5);
    expect(d(1)).toBeLessThan(1e-5);
  });
});

describe('example trips at 1 g', () => {
  it('Andromeda (static space, bound to the Local Group): about 28.6 years aboard', () => {
    const p = ok(planTrip(c, { positionMpc: LOCAL_GROUP.m31EclMpc }));
    expect(p.model).toBe('static');
    expect(p.shipTimeYr).toBeCloseTo(28.5895, 3);
    expect(p.cosmicTimeYr / 1e6).toBeCloseTo(2.4823, 3);
    expect(p.home.redshift).toBe(0);
  });
  it('Proxima and the Galactic Centre fly in static space too', () => {
    expect(ok(planTrip(c, { distanceMpc: PROXIMA })).shipTimeYr).toBeCloseTo(3.54208, 4);
    expect(ok(planTrip(c, { distanceMpc: GALACTIC_CENTRE })).shipTimeYr).toBeCloseTo(19.8302, 3);
  });
  it('Virgo cluster, 16.5 Mpc (FLRW): 34.554 years aboard, 53.9 million years at home', () => {
    const p = ok(planTrip(c, { distanceMpc: VIRGO }));
    expect(p.model).toBe('flrw');
    expect(p.shipTimeYr).toBeCloseTo(34.5535, 3);
    expect(p.cosmicTimeYr / 1e6).toBeCloseTo(53.916, 2);
    expect(p.arrival.scale).toBeCloseTo(1.003735, 5);
    // Home seen on arrival: the light left home after departure, redshifted by the expansion since then.
    expect(p.home.redshift).toBeGreaterThan(0.0037);
    expect(p.home.emissionTimeGyr).toBeGreaterThan(p.departure.timeGyr);
  });
  it('a galaxy at z = 1: 46.04 years aboard, 18.9 Gyr at home; home appears at z = 2.16', () => {
    const p = ok(planFlipAndBurn(c, c.comovingDistanceMpc(1)));
    expect(p.shipTimeYr).toBeCloseTo(46.041, 2);
    expect(p.cosmicTimeYr / 1e9).toBeCloseTo(18.926, 2);
    expect(p.arrival.scale).toBeCloseTo(3.1568, 3);
    expect(p.home.redshift).toBeCloseTo(2.1568, 3);
    expect(p.destinationSeenAtDeparture!.redshift).toBeCloseTo(1, 9);
    // Longer than special relativity would say, because of the Hubble drag and the receding target.
    expect(p.shipTimeYr).toBeGreaterThan(staticShipTimeYr(c.comovingDistanceMpc(1)) + 1);
  });
  it('home seen on arrival: the light left home just after departure, (c/A)(1 + a_dep/a_arr) later at high speed', () => {
    const tuYr = C_M_S / G0_M_S2 / YEAR_S;
    const z1 = ok(planFlipAndBurn(c, c.comovingDistanceMpc(1)));
    expect(z1.home.emissionAfterDepartureYr).toBeCloseTo(1.275583, 5);
    expect(rel(z1.home.emissionAfterDepartureYr, tuYr * (1 + 1 / z1.arrival.scale))).toBeLessThan(1e-9);
    expect(ok(planFlipAndBurn(c, c.comovingDistanceMpc(0.5))).home.emissionAfterDepartureYr).toBeCloseTo(1.544559, 5);
    const v = ok(planFlipAndBurn(c, VIRGO));
    expect(v.home.emissionAfterDepartureYr).toBeCloseTo(1.93383, 4);
    expect(v.home.emissionTimeGyr - v.departure.timeGyr).toBeCloseTo(v.home.emissionAfterDepartureYr / 1e9, 15);
    // The playback state knows it too, at any moment.
    expect(rel(stateAtShipTime(v, v.shipTimeYr).homeSeenAfterDepartureYr, v.home.emissionAfterDepartureYr)).toBeLessThan(1e-9);
    // Static space: t_emit - t_dep = (2c/A)(1 - e^-w_peak), exactly.
    const px = ok(planStatic(c, PROXIMA));
    expect(rel(px.home.emissionAfterDepartureYr, 2 * tuYr * -Math.expm1(-px.peakRapidity))).toBeLessThan(1e-14);
  });
  it('a galaxy at z = 3 is refused: it lies beyond the cosmic event horizon', () => {
    const p = planFlipAndBurn(c, c.comovingDistanceMpc(3));
    expect(p.ok).toBe(false);
    const u = p as Unreachable;
    expect(u.reason).toBe('beyond-event-horizon');
    expect(u.eventHorizonMpc).toBeCloseTo(c.eventHorizonMpc(1), 9);
    expect(u.targetChiMpc).toBeGreaterThan(u.eventHorizonMpc);
  });
  it('arrival is exactly at rest at the target distance', () => {
    const p = ok(planFlipAndBurn(c, 1234));
    const end = stateAtShipTime(p, p.shipTimeYr);
    expect(end.u).toBeLessThan(1e-9 * p.peakU);
    expect(rel(end.chiMpc, 1234)).toBeLessThan(1e-11);
    expect(rel(p.samples.chiMpc[p.samples.chiMpc.length - 1], 1234)).toBeLessThan(1e-11);
  });
});

describe('reachability', () => {
  it('ship-time limit: Virgo needs 34.55 yr, so a 30-year limit refuses it and reports the reach', () => {
    const p = planFlipAndBurn(c, VIRGO, { maxShipTimeYr: 30 });
    expect(p.ok).toBe(false);
    const u = p as Unreachable;
    expect(u.reason).toBe('ship-time-limit');
    expect(rel(u.maxChiMpc!, maxReach(c, 30).chiMpc)).toBeLessThan(1e-9);
  });
  it('maximum reach grows with ship time but never reaches the event horizon', () => {
    const eh = c.eventHorizonMpc(1);
    const r30 = maxReach(c, 30);
    const r50 = maxReach(c, 50);
    const r100 = maxReach(c, 100);
    expect(r30.chiMpc).toBeLessThan(r50.chiMpc);
    expect(r50.chiMpc).toBeLessThan(r100.chiMpc);
    expect(r100.chiMpc).toBeLessThan(eh);
    expect(eh - r100.chiMpc).toBeLessThan(0.02);
    expect(r30.chiMpc).toBeCloseTo(1.5758, 3);
    expect(r50.redshiftSeenAtDeparture).toBeCloseTo(1.812, 2);
    // A trip planned to exactly the 50-year reach takes 50 years.
    expect(ok(planFlipAndBurn(c, r50.chiMpc)).shipTimeYr).toBeCloseTo(50, 6);
    // 100 years already reach the absolute limit: 0.968715 light-years inside the event horizon.
    expect(r100.saturated).toBe(true);
    expect(r50.saturated).toBe(false);
    expect(rel(r100.insideEventHorizonMpc, 2.970094e-7)).toBeLessThan(1e-6);
    expect(rel(r100.limitInsideEventHorizonMpc * MPC_LY, 0.968715)).toBeLessThan(1e-6);
    expect(rel(maxReach(c, 1000).chiMpc, r100.chiMpc)).toBeLessThan(1e-15);
  });
  it('near the horizon: each factor 100 closer costs ~4.5 more years; the last light-year is out of reach', () => {
    const eh = c.eventHorizonMpc(1);
    const t1 = ok(planFlipAndBurn(c, eh - 1)).shipTimeYr;
    const t2 = ok(planFlipAndBurn(c, eh - 0.01)).shipTimeYr;
    expect(t2 - t1).toBeGreaterThan(4);
    expect(t2 - t1).toBeLessThan(5);
    const far = planFlipAndBurn(c, eh - 1e-8);
    expect(!far.ok && far.reason).toBe('beyond-reach');
    const lim = maxReach(c, 1000);
    expect(lim.saturated).toBe(true);
    // The unreachable sliver is c^2/A (1 - 3.4e-11) = 0.968715 light-years at 1 g: the light lag of starting from rest.
    expect(rel(lim.insideEventHorizonMpc * MPC_LY, 0.968715)).toBeLessThan(1e-6);
    // Just outside the sliver is reachable (and planned exactly); just inside is refused analytically.
    const ehp = c.dH * c.eventHorizonPreciseLn(0);
    const edge = ok(planFlipAndBurn(c, ehp - 3.0e-7));
    expect(edge.shipTimeYr).toBeCloseTo(73.075, 2);
    const inside = planFlipAndBurn(c, ehp - 2.9e-7);
    expect(!inside.ok && inside.reason).toBe('beyond-reach');
    // Planned from the distance inside the horizon, so near-horizon ship times keep their precision.
    expect(ok(planFlipAndBurn(c, ehp - 1e-6)).shipTimeYr).toBeCloseTo(67.786, 3);
  });
  it('Hubble drag caps the peculiar Lorentz factor below A / (c H_Lambda) = 1.8e10 at 1 g', () => {
    const hLambda = ((c.params.H0 * Math.sqrt(c.omegaLambda)) / MPC_KM) * 1; // 1/s
    const cap = G0_M_S2 / (C_M_S * hLambda);
    expect(cap).toBeCloseTo(1.797e10, -7);
    const r = maxReach(c, 100);
    expect(r.peakGamma).toBeLessThan(cap + 1);
    expect(r.peakGamma).toBeGreaterThan(0.99 * cap);
  });
  it('stable at gamma ~ 1e12 in the expanding universe (300 g to z = 1)', () => {
    const p = ok(planFlipAndBurn(c, c.comovingDistanceMpc(1), { accel: 300 * G0_M_S2 }));
    expect(p.peakGamma).toBeGreaterThan(1e12);
    expect(Number.isFinite(p.shipTimeYr)).toBe(true);
    expect(p.diagnostics.conservation).toBeLessThan(1e-10);
    const s = stateAtShipTime(p, p.phases[0].endTauYr);
    expect(rel(s.gamma, p.peakGamma)).toBeLessThan(1e-9);
    expect(s.beta).toBe(1); // beta rounds to 1 in float64; the rapidity carries the information
    expect(s.rapidity).toBeCloseTo(Math.acosh(p.peakGamma), 9);
  });
});

describe('round trips', () => {
  it('in static space the return equals the outbound leg', () => {
    const r = planRoundTrip(frozen, VIRGO);
    expect(rel(r.shipTimeYr, 2 * staticShipTimeYr(VIRGO))).toBeLessThan(1e-10);
  });
  it('Virgo and back: the way home is a little longer, because the universe expanded meanwhile', () => {
    const r = planRoundTrip(c, VIRGO);
    const out = ok(r.outbound);
    const back = ok(r.inbound!);
    expect(back.shipTimeYr).toBeGreaterThan(out.shipTimeYr);
    expect(back.departure.scale).toBe(out.arrival.scale);
    expect(r.cosmicTimeYr / 1e6).toBeCloseTo(108.03, 1);
  });
  it('to z = 1 and back is impossible: on arrival, home is beyond the event horizon', () => {
    const r = planRoundTrip(c, c.comovingDistanceMpc(1));
    expect(r.outbound.ok).toBe(true);
    expect(r.inbound!.ok).toBe(false);
    expect((r.inbound as Unreachable).reason).toBe('beyond-event-horizon');
  });
});

describe('playback', () => {
  const p = ok(planFlipAndBurn(c, VIRGO));
  it('exact state by re-integration: start, flip and end', () => {
    const s0 = stateAtShipTime(p, 0);
    expect(s0.chiMpc).toBe(0);
    expect(s0.u).toBe(0);
    const f = stateAtShipTime(p, p.phases[0].endTauYr);
    expect(rel(f.u, p.peakU)).toBeLessThan(1e-11);
    const e = stateAtShipTime(p, p.shipTimeYr);
    expect(rel(e.chiMpc, VIRGO)).toBeLessThan(1e-11);
    expect(rel(e.scale, p.arrival.scale)).toBeLessThan(1e-14);
  });
  it('re-integration agrees with the stored samples at the sample times', () => {
    for (let i = 1; i < p.samples.tauYr.length - 1; i += 37) {
      const s = stateAtShipTime(p, p.samples.tauYr[i]);
      expect(rel(s.chiMpc, p.samples.chiMpc[i])).toBeLessThan(1e-10);
      expect(rel(s.dtYr, p.samples.dtYr[i])).toBeLessThan(1e-10);
    }
  });
  it('cubic Hermite playback of the default 1000 samples is accurate to ~1e-8 of the trip scale', () => {
    let worstChi = 0;
    let worstU = 0;
    for (let k = 1; k < 500; k++) {
      const tau = (p.shipTimeYr * (k + 0.31)) / 500;
      const exact = stateAtShipTime(p, tau);
      const fast = sampleAt(p.samples, tau);
      worstChi = Math.max(worstChi, Math.abs(fast.chiMpc - exact.chiMpc) / VIRGO);
      worstU = Math.max(worstU, Math.abs(fast.u - exact.u) / p.peakU);
    }
    expect(worstChi).toBeLessThan(5e-9);
    expect(worstU).toBeLessThan(1e-8);
  });
});

describe('constant-speed cruise', () => {
  it('Virgo at gamma = 1000: accelerate, hold u against the Hubble drag, decelerate', () => {
    const p = ok(planCruise(c, VIRGO, { cruiseGamma: 1000 }));
    expect(p.profile).toBe('cruise');
    expect(p.cruise!.reached).toBe(true);
    expect(p.phases.map((x) => x.kind)).toEqual(['accelerate', 'cruise', 'decelerate']);
    expect(p.peakGamma).toBeCloseTo(1000, 8);
    const end = stateAtShipTime(p, p.shipTimeYr);
    expect(rel(end.chiMpc, VIRGO)).toBeLessThan(1e-10);
    // Engine thrust needed to hold u: c H u = A_hold (about 6.7e-8 g here), falling as H falls.
    expect(p.cruise!.holdThrustAtStartG).toBeCloseTo((C_M_S * (c.H(1) / MPC_KM) * p.cruise!.u) / G0_M_S2, 12);
    expect(p.cruise!.holdThrustAtEndG).toBeLessThan(p.cruise!.holdThrustAtStartG);
    // Ship time is about the home time divided by gamma.
    expect(p.shipTimeYr).toBeCloseTo(p.cosmicTimeYr / 1000, -2);
    // Mid-cruise the speed is held exactly.
    const mid = stateAtShipTime(p, 0.5 * (p.phases[1].startTauYr + p.phases[1].endTauYr));
    expect(rel(mid.gamma, 1000)).toBeLessThan(1e-12);
  });
  it('falls back to flip-and-burn when the target is too close to reach the cruise speed', () => {
    const p = ok(planCruise(c, VIRGO, { cruiseGamma: 1e9 }));
    expect(p.profile).toBe('flip-and-burn');
    expect(p.cruise!.reached).toBe(false);
  });
  it('refuses speeds the engine cannot hold and targets a slow cruise can never reach', () => {
    const a = planCruise(c, VIRGO, { cruiseU: 1e11 });
    expect(!a.ok && a.reason).toBe('cruise-speed-unattainable');
    const b = planCruise(c, 3000, { cruiseBeta: 0.5 });
    expect(!b.ok && b.reason).toBe('beyond-reach-at-cruise-speed');
    expect((b as Unreachable).maxChiMpc!).toBeLessThan(0.51 * c.eventHorizonMpc(1));
  });
});

describe('Local Group policy', () => {
  it('bound: M31, the Galactic Centre, Proxima; not bound: Virgo, M81', () => {
    expect(isBoundToLocalGroup(LOCAL_GROUP.m31EclMpc)).toBe(true);
    expect(isBoundToLocalGroup([GALACTIC_CENTRE, 0, 0])).toBe(true);
    expect(propagationModel({ distanceMpc: PROXIMA })).toBe('static');
    expect(propagationModel({ positionMpc: [0, 0, VIRGO] })).toBe('flrw');
    expect(propagationModel({ distanceMpc: 3.6 })).toBe('flrw');
    expect(propagationModel({ distanceMpc: 0.9, bound: true })).toBe('static');
  });
  it('the two models agree to about 1e-5 in ship time at the edge of the Local Group', () => {
    const d = LOCAL_GROUP.zeroVelocityRadiusMpc + LOCAL_GROUP.barycentreFraction * 0.761;
    const s = ok(planStatic(c, d));
    const f = ok(planFlipAndBurn(c, d));
    expect(rel(f.shipTimeYr, s.shipTimeYr)).toBeLessThan(2e-5);
  });
});

describe('input validation and robustness', () => {
  it('rejects unusable inputs with a structured refusal instead of throwing', () => {
    for (const p of [
      planFlipAndBurn(c, -1),
      planFlipAndBurn(c, NaN),
      planFlipAndBurn(c, 100, { accel: 0 }),
      planFlipAndBurn(c, 100, { accel: 1e-11 * G0_M_S2 }),
      planFlipAndBurn(c, 100, { departureScale: 0 }),
      planCruise(c, 100, { cruiseBeta: 1 }),
      planCruise(c, 100, { cruiseU: -1 }),
      planStatic(c, 0),
      planStatic(c, 0.1, { accel: -1 }),
      planTrip(c, { distanceMpc: -1 }),
      planTrip(c, {}),
    ]) {
      expect(p.ok).toBe(false);
      expect((p as Unreachable).reason).toBe('invalid-input');
    }
    expect(MIN_ACCEL_M_S2).toBeCloseTo(1e-6 * G0_M_S2, 15);
    expect(() => maxReach(c, 10, { accel: 0 })).toThrow(RangeError);
  });
  it('plans weak engines (1e-6 g) and targets within 1e-14 of the cruise-speed limit quickly', () => {
    const t0 = performance.now();
    const weak = ok(planFlipAndBurn(c, 100, { accel: 1e-6 * G0_M_S2 }));
    expect(weak.shipTimeYr).toBeGreaterThan(1e7);
    const lim = (planCruise(c, 3000, { cruiseBeta: 0.5 }) as Unreachable).maxChiMpc!;
    expect(lim).toBeCloseTo(2541.877, 3);
    for (const r of [1e-9, 1e-13, 1e-14]) {
      const p = ok(planCruise(c, lim * (1 - r), { cruiseBeta: 0.5 }));
      expect(rel(stateAtShipTime(p, p.shipTimeYr).chiMpc, lim * (1 - r))).toBeLessThan(1e-11);
    }
    expect(performance.now() - t0).toBeLessThan(5000);
  });
  it('static space: honours the ship-time limit and cruise requests', () => {
    const lim = planStatic(c, 0.5, { maxShipTimeYr: 10 });
    expect(!lim.ok && lim.reason).toBe('ship-time-limit');
    const tu = C_M_S / G0_M_S2;
    const unitMpc = (299792.458 * tu) / MPC_KM;
    const S = (10 * YEAR_S) / tu;
    expect(rel((lim as Unreachable).maxChiMpc!, 2 * (Math.cosh(S / 2) - 1) * unitMpc)).toBeLessThan(1e-12);
    expect(ok(planStatic(c, (lim as Unreachable).maxChiMpc! * 0.999, { maxShipTimeYr: 10 })).shipTimeYr).toBeLessThan(10);
    const viaPolicy = planTrip(c, { distanceMpc: 0.5 }, { maxShipTimeYr: 10 });
    expect(!viaPolicy.ok && viaPolicy.reason).toBe('ship-time-limit');
    // Cruise at gamma = 100 to 0.3 Mpc: accelerate, coast, decelerate; exact in closed form.
    const p = ok(planTrip(c, { distanceMpc: 0.3 }, { cruise: { cruiseGamma: 100 } }));
    expect(p.model).toBe('static');
    expect(p.profile).toBe('cruise');
    expect(p.phases.map((x) => x.kind)).toEqual(['accelerate', 'cruise', 'decelerate']);
    const wc = Math.acosh(100);
    const D = 0.3 / unitMpc;
    const coast = (D - 2 * (100 - 1)) / Math.sinh(wc);
    expect(rel(p.shipTimeYr, ((2 * wc + coast) * tu) / YEAR_S)).toBeLessThan(1e-12);
    expect(rel(p.cosmicTimeYr, ((2 * Math.sinh(wc) + 100 * coast) * tu) / YEAR_S)).toBeLessThan(1e-12);
    const mid = stateAtShipTime(p, 0.5 * p.shipTimeYr);
    expect(mid.phase).toBe('cruise');
    expect(mid.gamma).toBeCloseTo(100, 10);
    expect(rel(stateAtShipTime(p, p.shipTimeYr).chiMpc, 0.3)).toBeLessThan(1e-12);
    expect(rel(p.samples.chiMpc[p.samples.chiMpc.length - 1], 0.3)).toBeLessThan(1e-12);
    // Too close to reach the cruise speed: falls back to flip-and-burn and says so.
    const fb = ok(planStaticCruise(c, PROXIMA, { cruiseGamma: 1e6 }));
    expect(fb.profile).toBe('flip-and-burn');
    expect(fb.cruise!.reached).toBe(false);
  });
});

describe('randomised sweep', () => {
  it('100 random trips (0.01-1000 g, departures a = 0.05-20, 1e-9 Mpc to the horizon): all planned or properly refused', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 100; k++) {
      const aDep = Math.exp(Math.log(0.05) + rnd() * Math.log(400));
      const eh = c.eventHorizonMpc(aDep);
      const chi = Math.exp(Math.log(1e-9) + rnd() * (Math.log(eh * 1.2) - Math.log(1e-9)));
      const accel = G0_M_S2 * Math.exp(Math.log(0.01) + rnd() * Math.log(1e5));
      const cruise = k % 5 === 4;
      const limit = rnd() < 0.2 && !cruise ? 30 : undefined;
      const p =
        cruise
          ? planCruise(c, chi, { accel, departureScale: aDep, cruiseGamma: 1 + rnd() * 1e4, samples: 20 })
          : planFlipAndBurn(c, chi, { accel, departureScale: aDep, samples: 20, maxShipTimeYr: limit });
      if (!p.ok) {
        if (p.reason === 'beyond-event-horizon') expect(chi).toBeGreaterThanOrEqual(eh);
        else expect(['ship-time-limit', 'beyond-reach', 'beyond-reach-at-cruise-speed', 'cruise-speed-unattainable']).toContain(p.reason);
        expect(p.reason).not.toBe('numerical-failure');
        continue;
      }
      const end = stateAtShipTime(p, p.shipTimeYr);
      expect(rel(end.chiMpc, chi)).toBeLessThan(1e-11);
      expect(end.u).toBeLessThanOrEqual(1e-9 * Math.max(1, p.peakU));
      expect(p.diagnostics.conservation).toBeLessThan(1e-10);
      expect(p.diagnostics.tableTime).toBeLessThan(1e-11);
      if (limit !== undefined) expect(p.shipTimeYr).toBeLessThanOrEqual(limit);
    }
  });
});

describe('internal consistency of the state vector', () => {
  it('K, chi and T are finite and increasing along a trip', () => {
    const p = ok(planFlipAndBurn(c, 500));
    const fr = p.frame!;
    const r = dopri5(rhsProper(fr, 1), 0, [0, 0, 0, 0, 0, 0], p.phases[0].s1, { rtol: 1e-12, record: true });
    const ys = r.checkpoints!.y;
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i][IK]).toBeGreaterThan(ys[i - 1][IK]);
      expect(ys[i][ICHI]).toBeGreaterThan(ys[i - 1][ICHI]);
    }
  });
});
