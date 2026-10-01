import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { beamHalfWidth, fieldLines, lightCylinderKm, magneticAxisAt, MAX_BEAM_RAD, NS_RADIUS_KM, pairPlaces, pulsarModel, semiMajorAxisKm } from './pulsarModel';

const DEG = Math.PI / 180;
const angle = (a: Vector3, b: Vector3) => Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
const crab = { jname: 'J0534+2200', raDeg: 83.63306, decDeg: 22.0145, p0: 0.0333924123, pbDays: NaN, companion: null };
const vela = { jname: 'J0835-4510', raDeg: 128.83588, decDeg: -45.17635, p0: 0.08932838502, pbDays: NaN, companion: null };
const slow = { jname: 'J0001+0000', raDeg: 10, decDeg: 20, p0: 1.2, pbDays: NaN, companion: null };
const doubleA = { jname: 'J0737-3039A', raDeg: 114.46354, decDeg: -30.66131, p0: 0.0226993786, pbDays: 0.102252, companion: 'NS' };
const hulseTaylor = { jname: 'J1915+1606', raDeg: 288.86666, decDeg: 16.10761, p0: 0.05903000322, pbDays: 0.322997, companion: 'NS' };

describe('a pulsar up close', () => {
  it('beams as wide as Rankin’s outer cone, the fastest held to a drawable width', () => {
    expect(beamHalfWidth(1) / DEG).toBeCloseTo(5.8, 6);
    expect(beamHalfWidth(4) / DEG).toBeCloseTo(2.9, 6);
    expect(beamHalfWidth(0.0016)).toBe(MAX_BEAM_RAD);
  });

  it('a light cylinder of c·P/2π: the Crab’s about 1,600 km', () => {
    expect(lightCylinderKm(crab.p0)).toBeCloseTo(1593.3, 0);
  });

  it('a beam sweeps over us once a turn, at phase 0, and every spin axis is where the model says', () => {
    for (const p of [crab, vela, slow, doubleA, hulseTaylor]) {
      const m = pulsarModel(p)!;
      const s = m.spin;
      expect(angle(s.axis, m.toEarth)).toBeCloseTo(m.zetaRad, 9);
      expect(angle(s.axis, s.mag0)).toBeCloseTo(s.alphaRad, 9);
      // Closest at phase 0, within the beam.
      const at0 = angle(magneticAxisAt(s, 0), m.toEarth);
      expect(at0).toBeCloseTo(Math.abs(m.betaRad), 9);
      expect(at0).toBeLessThan(s.beamRad);
      for (const ph of [0.1, 0.25, 0.4]) expect(angle(magneticAxisAt(s, ph), m.toEarth)).toBeGreaterThan(at0);
    }
  });

  it('the Crab’s and Vela’s spin axes as their X-ray rings show them', () => {
    expect(pulsarModel(crab)!.zetaRad / DEG).toBeCloseTo(61.3, 9);
    expect(pulsarModel(vela)!.zetaRad / DEG).toBeCloseTo(63.6, 9);
    expect(pulsarModel(crab)!.orientation).toBe('measured');
    expect(pulsarModel(slow)!.orientation).toBe('chosen');
    // A chosen orientation is the same each time.
    expect(pulsarModel(slow)!.spin.axis.toArray()).toEqual(pulsarModel(slow)!.spin.axis.toArray());
  });

  it('no model without a spin period', () => {
    expect(pulsarModel({ ...slow, p0: NaN })).toBeNull();
  });

  it('pairs sized by Kepler’s law: the Double Pulsar’s orbit about 880,000 km across its axis, Hulse–Taylor’s 1.95 million', () => {
    expect(semiMajorAxisKm(0.102252 * 86400, 1.338 + 1.249)).toBeCloseTo(8.79e5, -4);
    const ht = pulsarModel(hulseTaylor)!.pair!;
    expect(ht.aKm).toBeCloseTo(1.95e6, -4);
    expect(ht.e).toBeCloseTo(0.6171, 4);
    // About their centre of mass; at periastron a(1 − e) apart.
    const p = new Vector3();
    const c = new Vector3();
    pairPlaces(ht, 0, p, c);
    expect(p.clone().multiplyScalar(ht.mPulsar).add(c.clone().multiplyScalar(ht.mCompanion)).length()).toBeLessThan(1e-3);
    expect(p.distanceTo(c)).toBeCloseTo(ht.aKm * (1 - ht.e), 0);
    pairPlaces(ht, (ht.periodS * 1000) / 2, p, c);
    expect(p.distanceTo(c)).toBeCloseTo(ht.aKm * (1 + ht.e), 0);
    // In the orbit's plane.
    expect(Math.abs(c.dot(ht.normal))).toBeLessThan(1e-6 * ht.aKm);
  });

  it('the Double Pulsar: A’s both poles sweep over us, and B’s beams miss us', () => {
    const m = pulsarModel(doubleA)!;
    expect(m.spin.alphaRad / DEG).toBeCloseTo(90.2, 6);
    const b = m.pair!.companion;
    expect(b.beams).toBe(true);
    expect(b.periodS).toBeCloseTo(2.77346, 5);
    expect(m.pair!.companionJname).toBe('J0737-3039B');
    let closest = Math.PI;
    for (let i = 0; i < 360; i++) {
      const axis = magneticAxisAt(b, i / 360);
      closest = Math.min(closest, angle(axis, m.toEarth), angle(axis.negate(), m.toEarth));
    }
    expect(closest).toBeGreaterThan(2 * b.beamRad);
  });

  it('a pair without published numbers: a circle of stand-in masses', () => {
    const m = pulsarModel({ ...hulseTaylor, jname: 'J1811-1736', pbDays: 18.7792 })!;
    expect(m.pair!.eKnown).toBe(false);
    expect(m.pair!.e).toBe(0);
    expect(m.pair!.companion.beams).toBe(false);
    expect(m.sizeKm).toBe(m.pair!.aKm);
  });

  it('field lines from the star’s surface, the open ones out past the light cylinder', () => {
    const rlc = lightCylinderKm(vela.p0);
    const f = fieldLines(rlc);
    const n = f.s.length;
    expect(f.positions.length).toBe(3 * n);
    let maxOpen = 0;
    let maxClosed = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(f.positions[3 * i], f.positions[3 * i + 1], f.positions[3 * i + 2]);
      expect(r).toBeGreaterThan(NS_RADIUS_KM * 0.999);
      if (f.s[i] === 0) expect(r).toBeCloseTo(NS_RADIUS_KM, 6);
      if (f.open[i]) maxOpen = Math.max(maxOpen, r);
      else maxClosed = Math.max(maxClosed, r);
    }
    expect(maxOpen).toBeGreaterThan(2.4 * rlc);
    expect(maxOpen).toBeLessThan(2.7 * rlc);
    expect(maxClosed).toBeLessThan(rlc);
  });
});
