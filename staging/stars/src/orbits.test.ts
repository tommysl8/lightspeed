import { describe, expect, it } from 'vitest';
import { loadStars, loadSystems } from './test-helpers';
import {
  orbitEllipse,
  orbitRelativeState,
  solveKepler,
  systemMembersAt,
  systemMembersSeenFrom,
  type OrbitJson,
  type SystemJson,
} from './orbits';
import { besselianToJd, JD_J2000, jyToJd } from './constants';
import { eclipticToEquatorial, raDecFromVector, skyBasis, type Vec3 } from './frames';

const systems = loadSystems();
const sys = (id: string): SystemJson => systems.systems.find((s) => s.id === id)!;
const orbit = (s: SystemJson, id: string): OrbitJson => s.orbits.find((o) => o.id === id)!;
const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Position angle (deg, J2000 or of-date) and separation (arcsec) of the secondary relative to the primary. */
function paSep(s: SystemJson, o: OrbitJson, jd: number, ofDateBesselianYear?: number): { pa: number; sep: number } {
  // Sky axes at the primary star's J2000 position (not the system barycentre: for Alpha Cen that includes Proxima,
  // 0.15 deg away). Visual-orbit elements refer to fixed axes; proper motion slowly turns the local axes.
  const dir = raDecFromVector(eclipticToEquatorial(systemMembersAt(s, JD_J2000).get(o.primary[0])!.posPc));
  const basis = skyBasis(dir.raDeg, dir.decDeg);
  const rel = eclipticToEquatorial(orbitRelativeState(o, jd).posAu);
  const plx = (o.published as { parallaxMas: number }).parallaxMas / 1000;
  const x = dot(rel, basis.north) * plx;
  const y = dot(rel, basis.east) * plx;
  let pa = (Math.atan2(y, x) * 180) / Math.PI;
  if (ofDateBesselianYear !== undefined) {
    // precession of position angles to the equinox of date: 20.04"/yr sin(ra) sec(dec)
    pa += ((20.04 / 3600) * Math.sin((dir.raDeg * Math.PI) / 180) * (ofDateBesselianYear - 2000)) / Math.cos((dir.decDeg * Math.PI) / 180);
  }
  return { pa: ((pa % 360) + 360) % 360, sep: Math.hypot(x, y) };
}
const dPa = (a: number, b: number) => ((a - b + 540) % 360) - 180;

describe('Kepler solver', () => {
  it('satisfies Kepler\'s equation for e up to 0.99', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (let M = -10; M <= 10; M += 0.37) {
        const E = solveKepler(M, e);
        const m = ((M % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        expect(E - e * Math.sin(E)).toBeCloseTo(m, 12);
      }
    }
  });
});

describe('visual orbits reproduce the Sixth Orbit Catalog ephemerides (2025–2029)', () => {
  const cases: [string, string, [number, number, number][]][] = [
    ['alpha-centauri', 'alpha-cen-ab', [[2025, 9.2, 8.737], [2026, 11.9, 9.294], [2027, 14.3, 9.765], [2028, 16.5, 10.121], [2029, 18.6, 10.329]]],
    ['sirius', 'sirius-ab', [[2025, 59.0, 11.256], [2026, 57.1, 11.163], [2027, 55.2, 11.032], [2028, 53.3, 10.861], [2029, 51.2, 10.648]]],
    ['procyon', 'procyon-ab', [[2025, 348.7, 5.07], [2026, 353.7, 5.101], [2027, 358.6, 5.122], [2028, 3.4, 5.135], [2029, 8.3, 5.139]]],
    ['61-cygni', '61-cyg-ab', [[2025, 154.0, 32.04], [2026, 154.1, 32.088], [2027, 154.3, 32.136], [2028, 154.5, 32.182], [2029, 154.6, 32.229]]],
  ];
  for (const [sid, oid, eph] of cases) {
    it(`${oid}`, () => {
      const s = sys(sid);
      const o = orbit(s, oid);
      for (const [by, th, rho] of eph) {
        const { pa, sep } = paSep(s, o, besselianToJd(by), by);
        // ORB6 rounds to 0.1 deg and 0.001"
        expect(Math.abs(dPa(pa, th))).toBeLessThan(0.08);
        expect(Math.abs(sep - rho)).toBeLessThan(0.0021);
      }
    });
  }

  it('Capella is 180 deg from ORB6, which lists omega of star A instead of the relative orbit', () => {
    const s = sys('capella');
    const o = orbit(s, 'capella-aab');
    const { pa } = paSep(s, o, besselianToJd(2025), 2025);
    expect(Math.abs(Math.abs(dPa(pa, 252.4)) - 180)).toBeLessThan(0.5);
  });

  it('Procyon matches the HST measurements of Bond et al. 2015', () => {
    const s = sys('procyon');
    const o = orbit(s, 'procyon-ab');
    for (const [jy, pa0, sep0] of [[2013.0947, 269.432, 3.316], [2014.7038, 285.721, 3.7966]]) {
      const { pa, sep } = paSep(s, o, jyToJd(jy));
      expect(Math.abs(dPa(pa, pa0))).toBeLessThan(0.05);
      expect(Math.abs(sep - sep0)).toBeLessThan(0.003);
    }
  });
});

describe('systems', () => {
  it('obey Kepler\'s third law with the published masses (visual orbits)', () => {
    for (const [sid, oid, tol] of [['alpha-centauri', 'alpha-cen-ab', 1e-3], ['sirius', 'sirius-ab', 1e-3], ['procyon', 'procyon-ab', 1e-3], ['capella', 'capella-aab', 1e-3], ['61-cygni', '61-cyg-ab', 0.1]] as const) {
      const o = orbit(sys(sid), oid);
      const P = o.periodDays / 365.25;
      const Mdyn = o.aAu ** 3 / P ** 2;
      expect(Math.abs(Mdyn / (o.massPrimaryMsun + o.massSecondaryMsun) - 1), oid).toBeLessThan(tol);
    }
  });

  it('Proxima is bound to Alpha Centauri AB, on a ~500-kyr orbit near apastron', () => {
    const o = orbit(sys('alpha-centauri'), 'proxima-ab');
    expect(o.e).toBeGreaterThan(0.4);
    expect(o.e).toBeLessThan(0.6);
    expect(o.periodDays / 365.25 / 1000).toBeGreaterThan(450);
    expect(o.periodDays / 365.25 / 1000).toBeLessThan(560);
    const r = orbitRelativeState(o, JD_J2000).posAu;
    expect(Math.hypot(...r)).toBeGreaterThan(0.98 * o.aAu * (1 + o.e) - 200);
  });

  it('puts Proxima exactly where Gaia DR3 sees it in 2016', () => {
    const s = sys('alpha-centauri');
    const p = systemMembersAt(s, jyToJd(2016)).get('proxima')!.posPc;
    const { raDeg, decDeg, r } = raDecFromVector(eclipticToEquatorial(p));
    expect((raDeg - 217.39232147200883) * Math.cos((decDeg * Math.PI) / 180) * 3.6e6).toBeCloseTo(0, -1); // < 5 mas
    expect((decDeg - -62.67607511676666) * 3.6e6).toBeCloseTo(0, -1);
    expect(r).toBeCloseTo(1000 / 768.0665391873573, 6);
  });

  it('catalogue positions of members equal the system model at J2000 (float32)', () => {
    const stars = loadStars();
    for (const s of systems.systems) {
      const m = systemMembersAt(s, JD_J2000);
      for (const star of systems.stars.filter((x) => x.system === s.id)) {
        const i = star.catalogueIndex!;
        const q = m.get(star.id)!.posPc;
        for (let k = 0; k < 3; k++) expect(Math.abs(stars.positions[3 * i + k] - q[k])).toBeLessThan(2e-5 * Math.hypot(...q));
      }
    }
  });

  it('light-time: seen from the Sun at J2000 equals the astrometric model', () => {
    const s = sys('sirius');
    const seen = systemMembersSeenFrom(s, [0, 0, 0], JD_J2000);
    const direct = systemMembersAt(s, JD_J2000);
    const a = seen.members.get('sirius-b')!.posPc;
    const b = direct.get('sirius-b')!.posPc;
    // they differ only by Sirius B's orbital motion during the 8.6-yr light time (~19 au in 2000)
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 206264.8).toBeLessThan(30);
    const bary = systemMembersSeenFrom(s, [0, 0, 0], JD_J2000).members.get('sirius-a')!.posPc;
    expect(Math.hypot(...bary)).toBeCloseTo(Math.hypot(...direct.get('sirius-a')!.posPc), 4);
    expect((JD_J2000 - seen.emittedJD) / 365.25).toBeCloseTo(2.6392 * 3.26156, 1);
  });

  it('ellipse sampling closes and matches a(1±e)', () => {
    const o = orbit(sys('sirius'), 'sirius-ab');
    const pts = orbitEllipse(o, 720);
    const r = pts.map((p) => Math.hypot(...p));
    expect(Math.min(...r)).toBeCloseTo(o.aAu * (1 - o.e), 3);
    expect(Math.max(...r)).toBeCloseTo(o.aAu * (1 + o.e), 3);
    expect(pts[0][0]).toBeCloseTo(pts[720][0], 9);
  });
});
