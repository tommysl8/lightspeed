import { describe, expect, it } from 'vitest';
import { Body, GeoMoonState, HelioState } from 'astronomy-engine';
import { Vector3 } from 'three';
import { AU_KM, DAY_S } from './constants';
import { angleAt, moonMeanState, standishState, STANDISH_T_MAX, STANDISH_T_MIN, type MeanPlanet } from './meanElements';
import { astroTimeAt, msFromCivil } from '../lib/time';
import { eclToWorld, eqjToWorld } from '../sim/frames';

const ARCSEC = Math.PI / 180 / 3600;

/**
 * Standish's nominal errors for 3000 BC – 3000 AD (heliocentric longitude and latitude, arcsec;
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html), plus astronomy-engine's own ~1′, as a
 * bound on the angle between the two models seen from the Sun.
 */
const BOUND_ARCSEC: Record<MeanPlanet, number> = {
  mercury: 20 + 15 + 60,
  venus: 40 + 30 + 60,
  emb: 40 + 15 + 60,
  mars: 100 + 40 + 60,
  jupiter: 600 + 100 + 60,
  saturn: 1000 + 100 + 60,
  uranus: 2000 + 30 + 60,
  neptune: 400 + 15 + 60,
  // Not in JPL's accuracy table; Standish's Pluto row is good to a few arcminutes here.
  pluto: 400,
};

const ENGINE: Record<MeanPlanet, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  emb: Body.EMB,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

function engineState(p: MeanPlanet, year: number) {
  const t = astroTimeAt(msFromCivil(year, 1, 1));
  const s = HelioState(ENGINE[p], t);
  const k = AU_KM / DAY_S;
  return {
    T: t.tt / 36_525,
    r: eqjToWorld(s.x * AU_KM, s.y * AU_KM, s.z * AU_KM),
    v: eqjToWorld(s.vx * k, s.vy * k, s.vz * k),
  };
}

function standishWorld(p: MeanPlanet, T: number) {
  const s = standishState(p, T);
  return { r: eclToWorld(s.x, s.y, s.z), v: eclToWorld(s.vx, s.vy, s.vz) };
}

describe("Standish's Keplerian elements (JPL approximate positions)", () => {
  it('agree with astronomy-engine within JPL’s stated errors, 1750–2150', () => {
    for (const p of Object.keys(ENGINE) as MeanPlanet[]) {
      let worst = 0;
      for (const year of [1750, 1800, 1900, 1950, 2000, 2026, 2050, 2100, 2150]) {
        const e = engineState(p, year);
        const s = standishWorld(p, e.T);
        worst = Math.max(worst, e.r.angleTo(s.r) / ARCSEC);
        expect(Math.abs(s.r.length() / e.r.length() - 1), `${p} ${year} distance`).toBeLessThan(0.01);
        expect(s.v.distanceTo(e.v) / e.v.length(), `${p} ${year} velocity`).toBeLessThan(0.02);
      }
      // 15% margin: the two error sources do not add in a fixed direction, but can come close.
      expect(worst, p).toBeLessThan(1.15 * BOUND_ARCSEC[p]);
    }
  });

  it('freeze at the edges of 3000 BC – 3000 AD without a jump, and keep orbiting', () => {
    for (const p of Object.keys(ENGINE) as MeanPlanet[]) {
      for (const edge of [STANDISH_T_MIN, STANDISH_T_MAX]) {
        const h = 1e-9; // centuries (3 s)
        const a = standishWorld(p, edge - h);
        const b = standishWorld(p, edge + h);
        const step = a.v.length() * 2 * h * 36_525 * DAY_S;
        expect(a.r.distanceTo(b.r), `${p} at T = ${edge}`).toBeLessThan(2 * step + 1);
        // Over 6 s the velocity only turns with the orbit (Mercury: ~8 × 10⁻⁶ rad at perihelion).
        expect(a.v.distanceTo(b.v) / a.v.length()).toBeLessThan(3e-5);
      }
    }
  });

  it('stays on a sensible orbit at any date', () => {
    for (const T of [-1.38e8, -1e5, 1e3, 1e7, 1e11]) {
      const earth = standishWorld('emb', T).r.length() / AU_KM;
      expect(earth).toBeGreaterThan(0.98);
      expect(earth).toBeLessThan(1.02);
      const nep = standishWorld('neptune', T).r.length() / AU_KM;
      expect(nep).toBeGreaterThan(29.5);
      expect(nep).toBeLessThan(30.6);
    }
  });

  it('keeps the mean motion of the edge beyond it (one period later, the same place)', () => {
    const T0 = 1e6; // far past the edge
    const s = standishWorld('mars', T0);
    // Mars's mean motion at the edge is within 10⁻⁵ of 19140.30 − 0.45 degrees per century.
    const period = 360 / (19140.29934243 - 0.45223625);
    const later = standishWorld('mars', T0 + period);
    expect(later.r.distanceTo(s.r) / s.r.length()).toBeLessThan(1e-4);
  });

  it('reduces huge angles exactly before scaling them', () => {
    expect(angleAt(10, 360, 1e12 + 0.25)).toBeCloseTo(100, 6);
    expect(angleAt(10, -360, 1e12 + 0.25)).toBeCloseTo(-80, 6);
  });
});

describe('the mean-element Moon', () => {
  it('stays within a few degrees of the full lunar theory', () => {
    for (let d = 0; d < 60; d += 3.7) {
      const t = astroTimeAt(msFromCivil(2026, 1, 1) + d * 86_400_000);
      const m = GeoMoonState(t);
      const truth = eqjToWorld(m.x * AU_KM, m.y * AU_KM, m.z * AU_KM);
      const s = moonMeanState(t.tt / 36_525);
      const mean = eclToWorld(s.x, s.y, s.z);
      // What mean elements leave out: evection (1.3°), variation (0.7°), the annual equation (0.2°).
      expect((truth.angleTo(mean) * 180) / Math.PI).toBeLessThan(3);
      expect(mean.length()).toBeGreaterThan(362_000);
      expect(mean.length()).toBeLessThan(406_000);
    }
  });

  it('orbits at the sidereal month far into the future', () => {
    const T = 1e9;
    const a = moonMeanState(T);
    const v = new Vector3(a.vx, a.vy, a.vz).length();
    expect(v).toBeGreaterThan(0.9);
    expect(v).toBeLessThan(1.1);
    expect(Math.hypot(a.x, a.y, a.z)).toBeLessThan(406_000);
  });
});
