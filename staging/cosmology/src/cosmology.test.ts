import { describe, expect, it } from 'vitest';
import { Cosmology, PLANCK18, planck18 } from './cosmology.ts';
import { GLY_PER_MPC } from './constants.ts';
import { adaptive } from './quadrature.ts';
import ref from './fixtures/reference.json' with { type: 'json' };

const c = planck18();
const rel = (x: number, y: number) => Math.abs(x / y - 1);

describe('parameters (Planck 2018 TT,TE,EE+lowE+lensing+BAO)', () => {
  it('density parameters match the independent implementation and close exactly', () => {
    expect(rel(c.omegaGamma, ref.independent.omegaGamma)).toBeLessThan(1e-14);
    expect(rel(c.omegaCB, ref.independent.omegaCB)).toBeLessThan(1e-13);
    expect(rel(c.omegaLambda, ref.independent.omegaLambda)).toBeLessThan(1e-14);
    expect(rel(c.omegaNuMassive, ref.independent.omegaNuMassive)).toBeLessThan(1e-12);
    expect(c.omegaCB + c.omegaNuMassive + c.omegaR + c.omegaLambda).toBeCloseTo(1, 15);
    expect(c.E(1)).toBeCloseTo(1, 15);
    // Planck quotes Omega_Lambda = 0.6889 +- 0.0056; flatness with radiation gives 0.68882.
    expect(Math.abs(c.omegaLambda - 0.6889)).toBeLessThan(0.0056);
  });
  it('matter-radiation equality at z = 3387 +- 21 (Planck table 2)', () => {
    expect(Math.abs(c.equalityRedshift() - 3387)).toBeLessThan(21);
  });
  it('E(a) matches the independent implementation (exact Fermi-Dirac neutrino)', () => {
    for (const r of ref.independent.E) expect(rel(c.E(r.a), r.E)).toBeLessThan(1e-13);
  });
});

describe('cosmic time', () => {
  it('age of the universe: 13.787 +- 0.020 Gyr (Planck), and 1e-12 against the reference', () => {
    const age = c.ageGyr();
    expect(Math.abs(age - 13.787)).toBeLessThan(0.02);
    expect(Math.abs(age - 13.787)).toBeLessThan(0.001);
    const r = ref.independent.time.find((x) => x.a === 1)!;
    expect(rel(age, r.tGyr)).toBeLessThan(1e-12);
  });
  it('t(a) from a = 1e-6 to 1e3 agrees with the independent integration to < 1e-11 (spec: 1e-8)', () => {
    for (const r of ref.independent.time) expect(rel(c.timeGyr(r.a), r.tGyr)).toBeLessThan(1e-11);
  });
  it('a(t) inverts t(a) to 1e-13 in ln a, from a = 1e-12 to 1e40, and is monotone', () => {
    let prevT = 0;
    for (let l = Math.log(1e-12); l < Math.log(1e40); l += 0.137) {
      const t = c.timeLn(l);
      expect(t).toBeGreaterThan(prevT);
      prevT = t;
      expect(Math.abs(c.lnAtTime(t) - l)).toBeLessThan(1e-13 * Math.max(1, Math.abs(l)));
    }
  });
  it('the tabulated t(a) matches adaptive quadrature at random points to 3e-12', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      const l = Math.log(1e-9) + rnd() * (Math.log(9e3) - Math.log(1e-9));
      const direct = c.timeLn(Math.log(1e-9)) + adaptive((x) => 1 / c.E(Math.exp(x)), Math.log(1e-9), l, { relTol: 1e-15 }).value;
      worst = Math.max(worst, rel(c.timeLn(l), direct));
    }
    expect(worst).toBeLessThan(3e-12);
  });
  it('lookback times match the reference', () => {
    for (const r of ref.independent.lookback) expect(rel(c.lookbackTimeGyr(r.z), r.tGyr)).toBeLessThan(1e-12);
  });
  it('the de Sitter future: t(a) - t(1e4) follows the matter+Lambda closed form', () => {
    const sl = Math.sqrt(c.omegaLambda);
    const dt = c.timeLn(Math.log(1e30)) - c.timeLn(Math.log(1e20));
    expect(rel(dt, (10 * Math.LN10) / sl)).toBeLessThan(1e-12);
  });
});

describe('distances and horizons', () => {
  it('comoving distance chi(z) for z = 0.001 ... 1100 against the independent implementation (1e-12)', () => {
    for (const r of ref.independent.comoving) expect(rel(c.comovingDistanceMpc(r.z), r.chiMpc)).toBeLessThan(1e-12);
  });
  it('agrees with astropy exactly when both use massless neutrinos', () => {
    const m = new Cosmology({ ...PLANCK18, mNuEv: [] });
    expect(rel(m.omegaLambda, ref.astropyMassless.Ode0)).toBeLessThan(1e-14);
    expect(rel(m.ageGyr(), ref.astropyMassless.age)).toBeLessThan(1e-11);
    for (const r of ref.astropyMassless.rows) {
      const a = 1 / (1 + r.z);
      expect(rel(m.comovingDistanceMpc(r.z), r.chiMpc)).toBeLessThan(1e-12);
      expect(rel(m.luminosityDistanceMpc(r.z), r.dlMpc)).toBeLessThan(1e-12);
      expect(rel(m.angularDiameterDistanceMpc(r.z), r.daMpc)).toBeLessThan(1e-12);
      expect(rel(m.lookbackTimeGyr(r.z), r.lookbackGyr)).toBeLessThan(1e-12);
      expect(rel(m.E(a), r.E)).toBeLessThan(1e-13);
      // astropy's own age integral at z = 1100 carries ~5e-7 quadrature error; ours matches the independent integration.
      expect(rel(m.timeGyr(a), r.ageGyr)).toBeLessThan(r.z > 100 ? 1e-6 : 1e-11);
    }
  });
  it('agrees with astropy with the 0.06 eV neutrino to the accuracy of astropy\'s neutrino fitting formula', () => {
    expect(rel(c.ageGyr(), ref.astropyMassive.age)).toBeLessThan(1e-6);
    for (const r of ref.astropyMassive.rows) expect(rel(c.comovingDistanceMpc(r.z), r.chiMpc)).toBeLessThan(3e-6);
  });
  it('chi(z = 1) = 3395.58 Mpc and chi(z = 1100) = 13885.9 Mpc', () => {
    expect(c.comovingDistanceMpc(1)).toBeCloseTo(3395.5848, 3);
    expect(c.comovingDistanceMpc(1100)).toBeCloseTo(13885.91, 1);
  });
  it('particle horizon today is 46.2 Gly (comoving), matching the reference', () => {
    const ph = c.particleHorizonMpc(1);
    expect(ph * GLY_PER_MPC).toBeCloseTo(46.199, 2);
    for (const r of ref.independent.conformal) expect(rel(c.particleHorizonMpc(r.a), r.etaMpc)).toBeLessThan(1e-12);
  });
  it('event horizon today is 16.58 Gly (comoving); chi_EH(a) matches the reference from a = 0.001 to 1000', () => {
    const eh = c.eventHorizonMpc(1);
    expect(eh * GLY_PER_MPC).toBeCloseTo(16.581, 2);
    for (const r of ref.independent.eventHorizon) expect(rel(c.eventHorizonMpc(r.a), r.chiMpc)).toBeLessThan(1e-12);
    // It shrinks for ever: proper size tends to c/H_Lambda (the de Sitter horizon).
    const hL = 299792.458 / (c.params.H0 * Math.sqrt(c.omegaLambda));
    expect(rel(c.eventHorizonMpc(1e6) * 1e6, hL)).toBeLessThan(1e-12);
  });
  it('eta(a) + chi_EH(a) = eta_inf everywhere', () => {
    for (const a of [1e-8, 1e-3, 0.3, 1, 7, 1e3, 1e8]) {
      const l = Math.log(a);
      expect(rel(c.conformalLn(l) + c.eventHorizonLn(l), c.etaInf)).toBeLessThan(1e-13);
    }
  });
  it('Hubble sphere today: c/H0 = 4430.8 Mpc = 14.45 Gly; smaller than the event horizon', () => {
    const hs = c.hubbleSphereMpc(1);
    expect(hs.proper).toBeCloseTo(299792.458 / 67.66, 9);
    expect(hs.comoving * GLY_PER_MPC).toBeCloseTo(14.451, 2);
    expect(hs.comoving).toBeLessThan(c.eventHorizonMpc(1));
  });
  it('comoving distances add along a light ray and inversions round-trip', () => {
    const d1 = c.comovingBetweenMpc(0.2, 0.5);
    const d2 = c.comovingBetweenMpc(0.5, 1.7);
    expect(rel(d1 + d2, c.comovingBetweenMpc(0.2, 1.7))).toBeLessThan(1e-13);
    for (const z of [1e-6, 1e-3, 0.5, 1, 3, 10, 1000]) expect(rel(c.redshiftAtComovingMpc(c.comovingDistanceMpc(z)), z)).toBeLessThan(1e-9);
    for (const eta of [1e-7, 0.01, 1, 3, 4.3]) expect(rel(c.conformalLn(c.lnAtConformal(eta)), eta)).toBeLessThan(1e-13);
    for (const chi of [1e-9, 1e-4, 0.1, 1, 4]) expect(rel(c.eventHorizonLn(c.lnAtEventHorizon(chi)), chi)).toBeLessThan(1e-13);
  });
  it('between two cosmic times (Gyr): light emitted 1 Gyr after the big bang covers the right distance by today', () => {
    const t1 = 1;
    const a1 = c.scaleAtTimeGyr(t1);
    expect(rel(c.comovingBetweenTimesMpc(t1, c.ageGyr()), c.comovingDistanceMpc(1 / a1 - 1))).toBeLessThan(1e-12);
  });
  it('CMB temperature scales as 1/a', () => {
    expect(c.cmbTemperatureK(1)).toBe(2.72548);
    expect(c.cmbTemperatureK(1 / 1090.8)).toBeCloseTo(2972.954, 3);
  });
  it('a radiation-free, nearly static model (used for the flat-space limit) is handled', () => {
    const s = new Cosmology({ name: 'static test', H0: 67.66e-8, omegaM: 0.3, TcmbK: 0, nEff: 0, mNuEv: [] });
    expect(s.omegaGamma).toBe(0);
    // Matter + Lambda age: (2 / (3 sqrt(OL))) asinh(sqrt(OL/OM)) / H0
    const exact = ((2 / (3 * Math.sqrt(0.7))) * Math.asinh(Math.sqrt(0.7 / 0.3)));
    expect(rel(s.timeLn(0), exact)).toBeLessThan(1e-12);
  });
});
