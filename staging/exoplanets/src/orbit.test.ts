import { describe, expect, it } from 'vitest';
import { AU_KM, C_KM_S, DAY_S, DEG, M_JUP_MSUN, PARSEC_KM, R_SUN_KM } from './constants.ts';
import { semiMajorAxisAu } from './kepler.ts';
import {
  type KeplerOrbit,
  apparentSkyOffsetFromSun,
  argPeriPlanetFromStar,
  conjunctionNear,
  lightTimeDays,
  observedTimeJd,
  offsetEclipticKm,
  orbitSky,
  rvSemiAmplitudeMs,
  tPeriFromConjunction,
  velocityEclipticKmS,
} from './orbit.ts';
import { equatorialToEcliptic, positionAngle, raDecToUnit } from './sky.ts';

const KMS = AU_KM / DAY_S;

/** A made-up eccentric transiting hot Jupiter with RV-convention omega (the typical archive case). */
function transitingPlanet() {
  const P = 3.5;
  const e = 0.2;
  const omegaStar = 40;
  const mStar = 1.1;
  const a = semiMajorAxisAu(P, mStar + M_JUP_MSUN);
  const tc = 2_460_000.25;
  const argPeri = argPeriPlanetFromStar(omegaStar);
  const o: KeplerOrbit = { periodDays: P, aAu: a, e, iDeg: 88.2, nodeDeg: 123.4, argPeriDeg: argPeri, tPeriJd: tPeriFromConjunction(tc, P, e, argPeri) };
  return { o, tc, omegaStar, mStar, rStarAu: (1.2 * R_SUN_KM) / AU_KM };
}

describe('visual-binary conventions', () => {
  const base: KeplerOrbit = { periodDays: 100, aAu: 1, e: 0, iDeg: 0, nodeDeg: 30, argPeriDeg: 0, tPeriJd: 0 };

  it('i < 90 deg moves counterclockwise on the sky (position angle increases)', () => {
    const pa0 = positionAngle(orbitSky(base, 0).pos).paDeg;
    const pa1 = positionAngle(orbitSky(base, 1).pos).paDeg;
    expect(pa0).toBeCloseTo(30, 10); // at the node (u = 0), PA = Omega
    expect(pa1).toBeGreaterThan(pa0);
    const retro = positionAngle(orbitSky({ ...base, iDeg: 180 }, 1).pos).paDeg;
    expect(retro).toBeLessThan(pa0);
  });

  it('recedes from the Sun at the ascending node', () => {
    const s = orbitSky({ ...base, iDeg: 60 }, 0);
    expect(s.pos.away).toBeCloseTo(0, 12);
    expect(s.vel.away).toBeGreaterThan(0);
  });

  it('velocity is the time derivative of position', () => {
    const o: KeplerOrbit = { periodDays: 17, aAu: 0.3, e: 0.6, iDeg: 71, nodeDeg: 200, argPeriDeg: 33, tPeriJd: 5 };
    for (const t of [0, 3.3, 9.1, 15]) {
      const h = 1e-5;
      const a = orbitSky(o, t - h).pos;
      const b = orbitSky(o, t + h).pos;
      const v = orbitSky(o, t).vel;
      expect(v.north).toBeCloseTo((b.north - a.north) / (2 * h), 7);
      expect(v.east).toBeCloseTo((b.east - a.east) / (2 * h), 7);
      expect(v.away).toBeCloseTo((b.away - a.away) / (2 * h), 7);
    }
  });
});

describe('RV/transit convention (archive omega is the star\'s)', () => {
  it('puts a transiting planet in front of the star at the transit time, with the textbook impact parameter', () => {
    const { o, tc, omegaStar, rStarAu } = transitingPlanet();
    const s = orbitSky(o, tc);
    expect(s.pos.away).toBeLessThan(0); // between the star and the Sun
    // Winn (2010) eq. 7: b = a cos i / R* x (1 - e^2) / (1 + e sin omega_star)
    const bWinn = ((o.aAu * Math.cos(o.iDeg * DEG)) / rStarAu) * ((1 - o.e ** 2) / (1 + o.e * Math.sin(omegaStar * DEG)));
    const bModel = Math.hypot(s.pos.north, s.pos.east) / rStarAu;
    expect(bModel).toBeCloseTo(bWinn, 9);
    expect(bModel).toBeLessThan(1);
    // Half a period later the planet is behind the star (for this e and omega, near secondary eclipse).
    expect(orbitSky(o, tc + o.periodDays / 2).pos.away).toBeGreaterThan(0);
    // conjunctionNear finds the transit again, many orbits away.
    expect(conjunctionNear(o, tc + 1000 * o.periodDays + 0.4)).toBeCloseTo(tc + 1000 * o.periodDays, 9);
  });

  it('gives the star the textbook radial velocity v = K [cos(omega + f) + e cos omega]', () => {
    const { o, omegaStar, mStar } = transitingPlanet();
    const mp = 2 * M_JUP_MSUN;
    const K = rvSemiAmplitudeMs(o, mp, mStar) / 1000; // km/s
    for (let t = 0; t < o.periodDays; t += 0.37) {
      const s = orbitSky(o, 2_460_000 + t);
      const vStar = -(mp / (mp + mStar)) * s.vel.away * KMS; // reflex, km/s, + = receding
      const f = s.trueAnomaly;
      const w = omegaStar * DEG;
      expect(vStar).toBeCloseTo(K * (Math.cos(w + f) + o.e * Math.cos(w)), 9);
    }
  });
});

describe('light time', () => {
  const { o, tc, rStarAu } = transitingPlanet();
  const ra = 123.4;
  const dec = 32.1;

  it('maps coordinate time to the observed clock by D/c', () => {
    const D = 12.43 * PARSEC_KM;
    expect(observedTimeJd(2_460_000, D) - 2_460_000).toBeCloseTo(D / C_KM_S / DAY_S, 8); // JD arithmetic: ~1e-10 d
    expect(lightTimeDays(PARSEC_KM) / 365.25).toBeCloseTo(3.261_563_8, 6); // 1 pc = 3.26 light-years
  });

  it('shows the transit at the published time to an observer at the Sun (host at rest)', () => {
    const D = 40 * PARSEC_KM;
    for (const n of [0, 1, 1000, -500]) {
      const t = tc + n * o.periodDays;
      const s = apparentSkyOffsetFromSun(o, D, t);
      expect(s.away).toBeLessThan(0);
      expect(Math.hypot(s.north, s.east)).toBeLessThan(rStarAu);
      // The disc is crossed at the published time: the separation is at its minimum there
      // (Romer delay across this orbit is ~20 s).
      const before = apparentSkyOffsetFromSun(o, D, t - 0.01);
      const after = apparentSkyOffsetFromSun(o, D, t + 0.01);
      expect(Math.hypot(before.north, before.east)).toBeGreaterThan(Math.hypot(s.north, s.east));
      expect(Math.hypot(after.north, after.east)).toBeGreaterThan(Math.hypot(s.north, s.east));
    }
  });

  it('still shows transits on time when the app moves the star radially at 100 km/s for decades', () => {
    // Full retarded-time solution with a moving host: the observer at the Sun at time T sees light
    // emitted at te where te + |R(te) + r(te)|/c = T, and the app's true state at te is the orbit at
    // observedTimeJd(te, |R(te)|).
    const D0 = 12 * PARSEC_KM;
    const vr = 100; // km/s
    const t0 = tc - 20 * 365.25; // host at D0 twenty years before the transit we test
    const dir = equatorialToEcliptic(raDecToUnit(ra, dec));
    const hostDist = (t: number) => D0 + vr * (t - t0) * DAY_S;
    const seen = (T: number) => {
      let te = T - hostDist(T) / C_KM_S / DAY_S;
      for (let k = 0; k < 8; k++) {
        const r = offsetEclipticKm(o, ra, dec, hostDist(te), te);
        const R = hostDist(te);
        const d = Math.hypot(dir.x * R + r.x, dir.y * R + r.y, dir.z * R + r.z);
        te = T - d / C_KM_S / DAY_S;
      }
      return orbitSky(o, observedTimeJd(te, hostDist(te))).pos;
    };
    for (const n of [0, 800, 2000]) {
      const T = tc + n * o.periodDays;
      const s = seen(T);
      expect(s.away).toBeLessThan(0);
      expect(Math.hypot(s.north, s.east)).toBeLessThan(rStarAu);
    }
  });
});

describe('ecliptic output', () => {
  it('returns km offsets and km/s velocities consistent with the sky state', () => {
    const { o } = transitingPlanet();
    const ra = 10;
    const dec = -20;
    const D = 5 * PARSEC_KM;
    const t = 2_460_100.3;
    const r = offsetEclipticKm(o, ra, dec, D, t);
    const s = orbitSky(o, observedTimeJd(t, D));
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(s.r * AU_KM, 3);
    const v = velocityEclipticKmS(o, ra, dec, D, t);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(Math.hypot(s.vel.north, s.vel.east, s.vel.away) * KMS, 9);
  });
});
