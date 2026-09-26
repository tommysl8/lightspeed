import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { cumulativeAnomaly, loadOrbits, orbitState, skyToGalactic, solveKepler, type SStarsJson } from './sstars.ts';

const json: SStarsJson = JSON.parse(readFileSync(new URL('../sstars.json', import.meta.url), 'utf8'));
const orbits = loadOrbits(json);
const byId = (id: string) => {
  const o = orbits.find((x) => x.id === id);
  if (!o) throw new Error(id);
  return o;
};
const ARCMIN = Math.PI / (180 * 60);

describe('Kepler solver', () => {
  test('solves E - e sin E = M for eccentricities up to 0.9999', () => {
    for (const e of [0, 0.1, 0.5, 0.88441, 0.9693, 0.9867, 0.9999]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.013) {
        const E = solveKepler(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12);
      }
    }
  });
});

describe('S2 (GRAVITY Collaboration 2022 elements)', () => {
  const s2 = byId('S2');

  test('period from Kepler III matches the published 16.0455 yr (GRAVITY 2020) to 0.01 yr', () => {
    expect(s2.P).toBeGreaterThan(16.035);
    expect(s2.P).toBeLessThan(16.055);
  });

  test('pericentre in May 2018 at about 120 au', () => {
    let best = { t: 0, r: Infinity };
    for (let t = 2018.0; t <= 2018.8; t += 0.0001) {
      const r = orbitState(s2, t).rAu;
      if (r < best.r) best = { t, r };
    }
    // 2018.3333 = 1 May, 2018.4167 = 1 June (Julian-year epochs)
    expect(best.t).toBeGreaterThan(2018.3333);
    expect(best.t).toBeLessThan(2018.4167);
    expect(best.r).toBeGreaterThan(115);
    expect(best.r).toBeLessThan(125);
  });

  test('speed at pericentre is about 7700 km/s', () => {
    // GRAVITY 2018 quote ~7650 km/s for their potential (M = 4.100e6, R0 = 8122 pc); v ~ sqrt(M/R0),
    // so the 2022 potential (4.297e6, 8277 pc) gives 1.4% more, ~7750 km/s.
    const v = orbitState(s2, s2.tPeri).speedKms;
    expect(v).toBeGreaterThan(7650);
    expect(v).toBeLessThan(7800);
  });

  test('radial velocity swings from about +4000 to about -1900 km/s around pericentre', () => {
    let max = { t: 0, v: -Infinity }, min = { t: 0, v: Infinity };
    for (let t = 2017.5; t <= 2019.5; t += 0.0005) {
      const v = orbitState(s2, t).radialVelocityKms;
      if (v > max.v) max = { t, v };
      if (v < min.v) min = { t, v };
    }
    expect(max.v).toBeGreaterThan(3700);
    expect(max.v).toBeLessThan(4100);
    expect(max.t).toBeLessThan(s2.tPeri); // receding maximum comes first
    expect(min.v).toBeGreaterThan(-2100);
    expect(min.v).toBeLessThan(-1700);
    expect(min.t).toBeGreaterThan(s2.tPeri);
  });

  test('apocentre lies about 0.18 arcsec north of Sgr A*', () => {
    const { offsetArcsec } = orbitState(s2, s2.tPeri - s2.P / 2);
    expect(offsetArcsec[1]).toBeGreaterThan(0.16);
    expect(offsetArcsec[1]).toBeLessThan(0.19);
    expect(Math.abs(offsetArcsec[0])).toBeLessThan(0.05);
  });

  test('orbit is clockwise on the sky (i > 90 deg)', () => {
    const a = orbitState(s2, 2010.0).offsetArcsec, b = orbitState(s2, 2010.5).offsetArcsec;
    // Position angle (north through east) decreases for clockwise motion as seen with east to the left.
    const pa = (o: [number, number]) => Math.atan2(o[0], o[1]);
    expect(pa(b)).toBeLessThan(pa(a));
  });

  test('Schwarzschild precession is about 12 arcmin per orbit and mostly accrues near pericentre', () => {
    expect(s2.dOmegaGR / ARCMIN).toBeGreaterThan(11.9);
    expect(s2.dOmegaGR / ARCMIN).toBeLessThan(12.3);
    const w = (t: number) => orbitState(s2, t, { fSP: 1 }).omegaUsed;
    // Elements osculate at 2010.35: no change there.
    expect(Math.abs(w(2010.35) - s2.omega)).toBeLessThan(1e-3 * ARCMIN);
    // Between 2017.9 and 2018.9 (a sixteenth of the period) about 70% of the advance happens.
    const frac = (w(2018.9) - w(2017.9)) / s2.dOmegaGR;
    expect(frac).toBeGreaterThan(0.6);
    // One full orbit later the advance is exactly one step.
    expect((w(2026.4) - w(2010.35)) / s2.dOmegaGR).toBeCloseTo(1, 2);
  });

  test('cumulative anomaly is continuous and increases through pericentre', () => {
    let prev = cumulativeAnomaly(s2, 2000);
    for (let t = 2000.01; t < 2040; t += 0.01) {
      const c = cumulativeAnomaly(s2, t);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  test('sky frame maps to galactic axes as a rotation (lengths preserved)', () => {
    const { posAu } = orbitState(s2, 2018.3789);
    const g = skyToGalactic(posAu, json.blackHole.icrs.raDeg, json.blackHole.icrs.decDeg);
    expect(Math.hypot(...g)).toBeCloseTo(Math.hypot(...posAu), 9);
    // The line-of-sight axis at Sgr A* points almost exactly along galactic +x.
    const away = skyToGalactic([0, 0, 1], json.blackHole.icrs.raDeg, json.blackHole.icrs.decDeg);
    expect(away[0]).toBeGreaterThan(0.99999);
  });
});

describe('other stars', () => {
  test('S29 plunges to about 100 au at 2021.41 with about 8700 km/s (GRAVITY 2022)', () => {
    const s = byId('S29');
    const st = orbitState(s, s.tPeri);
    expect(st.rAu).toBeGreaterThan(95);
    expect(st.rAu).toBeLessThan(106);
    expect(Math.abs(st.speedKms - 8740) / 8740).toBeLessThan(0.03);
  });

  test('S55 has the shortest period, about 12.2 yr', () => {
    const s = byId('S55');
    expect(s.P).toBeGreaterThan(12.0);
    expect(s.P).toBeLessThan(12.4);
  });

  test('every orbit is bound and evaluates to finite positions', () => {
    expect(orbits.length).toBe(4);
    for (const o of orbits) {
      expect(o.e).toBeLessThan(1);
      for (let t = 1990; t <= 2040; t += 0.37) {
        const st = orbitState(o, t, { fSP: 1 });
        expect(Number.isFinite(st.rAu)).toBe(true);
        expect(st.rAu).toBeGreaterThanOrEqual(o.aAu * (1 - o.e) * 0.999);
        expect(st.rAu).toBeLessThanOrEqual(o.aAu * (1 + o.e) * 1.001);
      }
    }
  });

  test('only orbits with a confirmed licence are included (the four GRAVITY 2022 stars, CC BY 4.0)', () => {
    expect(json.stars.map((s) => s.id).sort()).toEqual(['S2', 'S29', 'S38', 'S55']);
    for (const s of json.stars) expect(s.ref).toBe('GRAVITY2022');
    expect(Object.keys(json.potentials)).toEqual(['GRAVITY2022']);
  });
});
