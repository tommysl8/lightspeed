import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AU_KM, DAY_S, DEG, PARSEC_KM, R_EARTH_KM, R_SUN_KM } from './constants.ts';
import { type FeaturedFile, type FeaturedPlanet, type FeaturedSystem, featuredSystemState, findSystem } from './featured.ts';
import { apparentSkyOffsetFromSun, conjunctionNear, lightTimeDays, orbitSky } from './orbit.ts';
import { positionAngle } from './sky.ts';

const file = JSON.parse(readFileSync(fileURLToPath(new URL('../featured.json', import.meta.url)), 'utf8')) as FeaturedFile;
const sys = (id: string) => findSystem(file, id) as FeaturedSystem;
const planet = (s: FeaturedSystem, id: string) => s.planets.find((p) => p.id === id) as FeaturedPlanet;
const KMS = AU_KM / DAY_S;
const RSUN_AU = R_SUN_KM / AU_KM;
const calToJd = (y: number, m: number, d: number) => {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 - 0.5;
};
const julianYear = (y: number) => 2_451_545 + (y - 2000) * 365.25;

describe('featured.json structure', () => {
  it('has the 11 requested systems', () => {
    expect(file.systems.map((s) => s.id)).toEqual([
      'trappist-1',
      'proxima-cen',
      'barnards-star',
      '51-peg',
      'hr-8799',
      'kepler-90',
      'toi-700',
      'kepler-16',
      'eps-eri',
      'tau-cet',
      'alf-cen',
    ]);
    expect(sys('trappist-1').planets).toHaveLength(7);
    expect(sys('barnards-star').planets).toHaveLength(4);
    expect(sys('hr-8799').planets).toHaveLength(4);
    expect(sys('kepler-90').planets).toHaveLength(8);
  });

  it('cites or labels every input, and every ref exists', () => {
    for (const s of file.systems) {
      for (const p of s.planets) {
        const o = p.orbit;
        for (const v of [o.periodDays, o.aAu, o.e, o.iDeg, o.nodeDeg, o.argPeriDeg, o.tPeriJd]) expect(Number.isFinite(v)).toBe(true);
        expect(o.e).toBeGreaterThanOrEqual(0);
        expect(o.e).toBeLessThan(1);
        for (const [k, v] of Object.entries(p.inputs)) {
          const labelled = v.ref !== undefined || v.assumed !== undefined || v.derived !== undefined;
          expect(labelled, `${p.name} ${k}`).toBe(true);
          if (v.ref) expect(file.refs[v.ref], `${p.name} ${k} ref ${v.ref}`).toBeDefined();
        }
        // The node is never measured for these systems except where cited; unmeasured nodes must say so.
        const node = p.inputs.nodeDeg;
        expect(node.assumed !== undefined || node.ref !== undefined || node.derived !== undefined).toBe(true);
      }
    }
  });

  it('agrees with the evaluator: each transit/conjunction reference time is a conjunction of the resolved orbit', () => {
    for (const s of file.systems) {
      for (const p of s.planets) {
        const ph = p.inputs.phase as unknown as { kind: string; jd: number };
        if (ph.kind !== 'transit' && ph.kind !== 'conjunction') continue;
        expect(conjunctionNear(p.orbit, ph.jd), p.name).toBeCloseTo(ph.jd, 5);
        const s1 = orbitSky(p.orbit, ph.jd).pos;
        expect(s1.away, p.name).toBeLessThan(0);
      }
    }
  });
});

/** Every transiting planet must pass in front of its star as seen from the Sun at its transit times. */
function expectTransit(s: FeaturedSystem, p: FeaturedPlanet, t: number, starRadiusRsun: number) {
  const D = s.position.distancePc * PARSEC_KM;
  const a = apparentSkyOffsetFromSun(p.orbit, D, t);
  const rp = (p.radiusEarth?.v ?? 0) * (R_EARTH_KM / AU_KM);
  expect(a.away, `${p.name} at ${t}`).toBeLessThan(0);
  expect(Math.hypot(a.north, a.east), `${p.name} at ${t}`).toBeLessThan(starRadiusRsun * RSUN_AU + rp);
}

describe('transiting systems: in front of the star at the transit times, seen from the Sun', () => {
  it('TRAPPIST-1: all seven, at the reference transit and around the epoch', () => {
    const s = sys('trappist-1');
    const R = s.stars[0].radiusRsun?.v as number;
    for (const p of s.planets) {
      const tc = (p.inputs.phase as unknown as { jd: number }).jd;
      for (const n of [-3, -1, 0, 1, 2, 50, -400]) expectTransit(s, p, tc + n * p.orbit.periodDays, R);
    }
  });

  it('TRAPPIST-1 b and c: the mean ephemeris predicts the JWST transits of 2024-07-11 (Rathcke et al. 2025) within 15 minutes', () => {
    const s = sys('trappist-1');
    const jwst: Record<string, number> = { b: 2_460_501.405_464, c: 2_460_501.385_348 };
    for (const [id, t] of Object.entries(jwst)) {
      const pred = conjunctionNear(planet(s, id).orbit, t);
      expect(Math.abs(pred - t) * 1440, id).toBeLessThan(15);
    }
  });

  it('TOI-700, Kepler-90: all planets', () => {
    for (const id of ['toi-700', 'kepler-90']) {
      const s = sys(id);
      const R = s.stars[0].radiusRsun?.v as number;
      for (const p of s.planets) {
        const tc = (p.inputs.phase as unknown as { jd: number }).jd;
        for (const n of [-2, 0, 1, 10]) expectTransit(s, p, tc + n * p.orbit.periodDays, R);
      }
    }
  });

  it('TOI-700 d and e: the JWST 2025 transits (Pass et al. 2026) are exact reference times', () => {
    const s = sys('toi-700');
    expect(conjunctionNear(planet(s, 'd').orbit, 2_460_763.016_12)).toBeCloseTo(2_460_763.016_12, 6);
    expect(conjunctionNear(planet(s, 'e').orbit, 2_460_772.463_43)).toBeCloseTo(2_460_772.463_43, 6);
  });
});

describe('Kepler-16 (circumbinary)', () => {
  const s = sys('kepler-16');
  const D = s.position.distancePc * PARSEC_KM;
  const seenAt = (t: number) => featuredSystemState(s, t - lightTimeDays(D), { distanceKm: D });
  const RA = s.stars[0].radiusRsun?.v as number;
  const RB = s.stars[1].radiusRsun?.v as number;

  it('star B eclipses A at the primary-eclipse times of the Kepler EB catalogue (T0 2454965.657634, P 41.0775867 d)', () => {
    for (const n of [0, 6, 7, 20]) {
      const st = seenAt(2_454_965.657_634 + n * 41.077_586_7);
      const A = st.find((b) => b.id === 'A')?.sky;
      const B = st.find((b) => b.id === 'B')?.sky;
      if (!A || !B) throw new Error('missing star');
      expect(B.away).toBeLessThan(A.away);
      expect(Math.hypot(A.north - B.north, A.east - B.east)).toBeLessThan((RA + RB) * RSUN_AU);
    }
  });

  it('the planet transits star A within 0.2 d of the three observed transits', () => {
    const p = s.planets[0] as FeaturedPlanet & { checkTransitsOfA: number[] };
    for (const t of p.checkTransitsOfA) {
      let best = { t: 0, d: Infinity, front: false };
      for (let x = t - 1; x < t + 1; x += 0.002) {
        const st = seenAt(x);
        const A = st.find((b) => b.id === 'A')?.sky;
        const b = st.find((q) => q.id === 'b')?.sky;
        if (!A || !b) throw new Error('missing body');
        const d = Math.hypot(A.north - b.north, A.east - b.east);
        if (d < best.d) best = { t: x, d, front: b.away < A.away };
      }
      expect(Math.abs(best.t - t)).toBeLessThan(0.2);
      expect(best.d).toBeLessThan(RA * RSUN_AU);
      expect(best.front).toBe(true);
    }
  });
});

describe('HR 8799 (Wang et al. 2018)', () => {
  const s = sys('hr-8799');
  const plx = 24.3; // mas, the parallax of the fit
  // Wang et al. 2018 Table 2 (GPI): planet, date, separation (mas), PA (deg)
  const gpi: [string, number, number, number][] = [
    ['c', calToJd(2013, 11, 17), 949.5, 325.18],
    ['d', calToJd(2013, 11, 17), 654.6, 214.15],
    ['e', calToJd(2013, 11, 17), 382.6, 265.13],
    ['b', calToJd(2014, 9, 12), 1721.2, 65.46],
    ['c', calToJd(2014, 9, 12), 949.0, 326.53],
    ['d', calToJd(2014, 9, 12), 662.5, 216.57],
    ['c', calToJd(2016, 9, 19), 944.2, 330.01],
    ['d', calToJd(2016, 9, 19), 674.5, 221.81],
    ['e', calToJd(2016, 9, 19), 384.8, 281.68],
  ];

  it('reproduces the GPI astrometry to < 15 mas', () => {
    for (const [id, t, sep, pa] of gpi) {
      const q = positionAngle(orbitSky(planet(s, id).orbit, t).pos);
      const dx = q.sep * plx * Math.sin(q.paDeg * DEG) - sep * Math.sin(pa * DEG);
      const dy = q.sep * plx * Math.cos(q.paDeg * DEG) - sep * Math.cos(pa * DEG);
      expect(Math.hypot(dx, dy), `${id} ${t}`).toBeLessThan(15);
    }
  });

  it('has the 3-D orientation the planet radial velocities require (Ruffio et al. 2019: RV_b - RV_c = +2.4 +- 0.7 km/s in 2010)', () => {
    const t = calToJd(2010, 7, 1);
    const vb = orbitSky(planet(s, 'b').orbit, t).vel.away * KMS;
    const vc = orbitSky(planet(s, 'c').orbit, t).vel.away * KMS;
    expect(Math.abs(vb - vc - 2.4)).toBeLessThan(0.7); // this branch: +2.6
    expect(Math.abs(-(vb - vc) - 2.4)).toBeGreaterThan(3 * 0.7); // the mirror branch is excluded
  });
});

describe('Alpha Centauri', () => {
  const s = sys('alf-cen');
  const so = s.starOrbit;
  if (!so) throw new Error('no star orbit');
  const plx = 0.75081; // arcsec per au

  it('AB orbit matches the ALMA and archival relative astrometry (Akeson et al. 2021 Table 6)', () => {
    const table6: [number, number, number, number, number][] = [
      // year, PA, sigma PA, separation ("), sigma sep
      [2019.5361, 342.8581, 0.0053, 5.21172, 0.00032],
      [2018.7846, 336.2542, 0.0089, 4.80434, 0.00056],
      [2016.1893, 305.19, 0.3, 4.013, 0.02],
      [2014.241, 279.2, 0.3, 4.33, 0.05],
      [2012.71, 262.7, 0.4, 5.05, 0.05],
    ];
    for (const [y, pa, spa, sep, ssep] of table6) {
      const q = positionAngle(orbitSky(so.orbit, julianYear(y)).pos);
      expect(Math.abs(q.paDeg - pa), `PA ${y}`).toBeLessThan(Math.max(3 * spa, 0.02));
      expect(Math.abs(q.sep * plx - sep), `sep ${y}`).toBeLessThan(Math.max(3 * ssep, 0.002));
    }
  });

  it('AB orbit has the right radial-velocity sign: HARPS RV of A on MJD 53039.36 is -22.73789 km/s', () => {
    const t = 2_400_000.5 + 53_039.362_88;
    const vRel = orbitSky(so.orbit, t).vel.away * KMS; // B relative to A
    const vA = -22.3796 - so.massFractionSecondary * vRel; // barycentric RV (Table 8) + reflex
    expect(Math.abs(vA - -22.73789) * 1000).toBeLessThan(5); // m/s
  });

  it('the candidate orbit passes through S1 (2024-08-10) and C1 (2019-06-01) and hides in the 2025 non-detections', () => {
    const c = s.planets[0];
    const at = (y: number, m: number, d: number) => orbitSky(c.orbit, calToJd(y, m, d)).pos;
    const s1 = at(2024, 8, 10);
    expect(Math.hypot(s1.east * plx - 1.5, s1.north * plx - 0.17)).toBeLessThan(0.13);
    const c1 = at(2019, 6, 1);
    expect(Math.hypot(c1.east * plx - -0.64, c1.north * plx - -0.56)).toBeLessThan(0.05);
    for (const [y, m, d] of [
      [2025, 2, 20],
      [2025, 4, 25],
    ]) {
      const q = at(y, m, d);
      expect(Math.hypot(q.east, q.north) * plx).toBeLessThan(0.8);
    }
    expect(c.status).toBe('candidate');
  });
});

describe('RV and imaged systems', () => {
  it('eps Eri b is south-southwest of the star in early 2025 and north in 2029 (Thompson et al. 2025)', () => {
    const p = planet(sys('eps-eri'), 'b');
    const q25 = positionAngle(orbitSky(p.orbit, julianYear(2025.2)).pos);
    expect(q25.paDeg).toBeGreaterThan(160);
    expect(q25.paDeg).toBeLessThan(230);
    const q29 = orbitSky(p.orbit, julianYear(2028.9)).pos;
    expect(q29.north).toBeGreaterThan(0);
  });

  it('Proxima b and d, Barnard b-e and 51 Peg b are at inferior conjunction at their reference times', () => {
    for (const [sid, ids] of [
      ['proxima-cen', ['b', 'd']],
      ['barnards-star', ['b', 'c', 'd', 'e']],
      ['51-peg', ['b']],
    ] as [string, string[]][]) {
      const s = sys(sid);
      for (const id of ids) {
        const p = planet(s, id);
        const t = (p.inputs.phase as unknown as { jd: number }).jd;
        const st = orbitSky(p.orbit, t);
        expect(st.pos.away / st.r).toBeCloseTo(-Math.sin(p.orbit.iDeg * DEG), 9);
      }
    }
  });

  it('hides refuted and default-hidden planets unless asked', () => {
    const tau = featuredSystemState(sys('tau-cet'), 2_461_041.5);
    expect(tau.map((b) => b.id).sort()).toEqual(['A', 'f', 'g', 'h']);
    const all = featuredSystemState(sys('tau-cet'), 2_461_041.5, { includeHidden: true });
    expect(all).toHaveLength(5);
    const prox = featuredSystemState(sys('proxima-cen'), 2_461_041.5).map((b) => b.id);
    expect(prox).not.toContain('c');
  });

  it('returns finite offsets for every body of every system', () => {
    for (const s of file.systems) {
      const st = featuredSystemState(s, 2_461_041.5, { includeHidden: true });
      expect(st.length).toBeGreaterThan(1);
      for (const b of st) for (const v of [b.offsetKm.x, b.offsetKm.y, b.offsetKm.z]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
