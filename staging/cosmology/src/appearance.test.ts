import { describe, expect, it } from 'vitest';
import { planck18 } from './cosmology.ts';
import {
  aberrateCos,
  aberrateDirection,
  appearance,
  buildEmissionTable,
  dopplerFromRapidity,
  emissionLnAFast,
  emissionLn1pZFast,
  emissionScale,
  lastVisibleEmissionTimeGyr,
  type Vec3,
} from './appearance.ts';

const c = planck18();
const rel = (x: number, y: number) => Math.abs(x / y - 1);

describe('what a comoving observer sees', () => {
  it('today: emission scale 1/(1+z) for a galaxy at chi(z), with the usual distances', () => {
    for (const z of [0.01, 0.5, 1, 3, 10]) {
      const chi = c.comovingDistanceMpc(z);
      expect(rel(emissionScale(c, 1, chi), 1 / (1 + z))).toBeLessThan(1e-12);
      const v = appearance(c, 1, chi);
      expect(rel(v.z, z)).toBeLessThan(1e-11);
      expect(rel(v.luminosityDistanceMpc, c.luminosityDistanceMpc(z))).toBeLessThan(1e-11);
      expect(rel(v.angularDiameterDistanceMpc, c.angularDiameterDistanceMpc(z))).toBeLessThan(1e-11);
      expect(rel(v.lookbackGyr, c.lookbackTimeGyr(z))).toBeLessThan(1e-11);
      expect(rel(v.surfaceBrightnessFactor, (1 + z) ** -4)).toBeLessThan(1e-11);
    }
  });
  it('tiny redshifts keep full precision (Hubble law at 1 pc: z = H0 d / c)', () => {
    for (const d of [1e-6, 1e-3]) {
      const z = appearance(c, 1, d).z;
      expect(rel(z, (c.params.H0 * d) / 299792.458)).toBeLessThan(2 * (c.params.H0 * d) / 299792.458 + 1e-12);
    }
  });
  it('an observer in the future (a = 3) sees the same galaxy later and more redshifted', () => {
    const chi = c.comovingDistanceMpc(1);
    const later = appearance(c, 3, chi);
    // The light arriving at a = 3 left at a_e, with eta(3) - eta(a_e) = chi.
    expect(rel(c.comovingBetweenMpc(later.aEmit, 3), chi)).toBeLessThan(1e-12);
    expect(later.aEmit).toBeGreaterThan(0.5);
    expect(later.z).toBeCloseTo(3 / later.aEmit - 1, 12);
    expect(later.properDistanceNowMpc).toBeCloseTo(3 * chi, 9);
  });
  it('outside the particle horizon nothing is visible; before last scattering it is hidden behind the CMB', () => {
    expect(appearance(c, 1, 20000).hidden).toBe('beyond-particle-horizon');
    expect(appearance(c, 1, c.comovingDistanceMpc(1500)).hidden).toBe('before-last-scattering');
    expect(appearance(c, 1, c.comovingDistanceMpc(1000)).visible).toBe(true);
  });
  it('last light: a galaxy now seen at z = 5 will only ever be seen up to cosmic time 6.8 Gyr, at z = 10 up to 4.2 Gyr (the effect of Loeb 2002)', () => {
    const t5 = lastVisibleEmissionTimeGyr(c, c.comovingDistanceMpc(5))!;
    const t10 = lastVisibleEmissionTimeGyr(c, c.comovingDistanceMpc(10))!;
    expect(t5).toBeGreaterThan(t10);
    expect(t5).toBeCloseTo(6.769, 2);
    expect(t10).toBeCloseTo(4.171, 2);
    // Anything inside today's event horizon keeps being seen past today's cosmic time.
    expect(lastVisibleEmissionTimeGyr(c, 0.9 * c.eventHorizonMpc(1))!).toBeGreaterThan(c.ageGyr());
  });
});

describe('the moving ship', () => {
  it('Doppler factor from rapidity equals gamma (1 + beta cos) and stays exact at gamma = 1e12', () => {
    for (const w of [0.1, 1, 5]) {
      for (const cs of [-1, -0.3, 0, 0.7, 1]) {
        const b = Math.tanh(w);
        // (the reference itself loses digits to cancellation when cs -> -1)
        expect(rel(dopplerFromRapidity(w, cs), Math.cosh(w) * (1 + b * cs))).toBeLessThan(1e-12);
        // aberration: cos' = (cos + beta) / (1 + beta cos)
        expect(aberrateCos(w, cs)).toBeCloseTo((cs + b) / (1 + b * cs), 14);
      }
    }
    for (const w of [0.1, 1, 5, 30]) expect(rel(dopplerFromRapidity(w, -1), Math.exp(-w))).toBeLessThan(1e-15);
    const w = Math.acosh(1e12);
    expect(rel(dopplerFromRapidity(w, -1), 1 / (2e12))).toBeLessThan(1e-12);
    expect(rel(dopplerFromRapidity(w, 1), 2e12)).toBeLessThan(1e-12);
  });
  it('aberrated directions stay unit vectors and bunch forward', () => {
    const v: Vec3 = [0, 0, 1];
    for (const n of [[1, 0, 0], [0, 0.6, -0.8], [0.6, 0, 0.8]] as Vec3[]) {
      const m = aberrateDirection(n, v, 2);
      expect(Math.hypot(...m)).toBeCloseTo(1, 14);
      expect(m[2]).toBeGreaterThan(n[2]);
    }
  });
  it('aberration agrees with the textbook vector formula and keeps home exactly behind at any speed', () => {
    // n' = [n + ((cosh w - 1) n.v + sinh w) v] / D, safe to evaluate away from n = -v at moderate w.
    const textbook = (n: Vec3, v: Vec3, w: number): Vec3 => {
      const c0 = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
      const D = dopplerFromRapidity(w, c0);
      const k = (Math.cosh(w) - 1) * c0 + Math.sinh(w);
      return [(n[0] + k * v[0]) / D, (n[1] + k * v[1]) / D, (n[2] + k * v[2]) / D];
    };
    const v: Vec3 = [0.36, 0.48, 0.8];
    for (const w of [0.3, 1, 3]) {
      for (const n of [[1, 0, 0], [0, 0.6, -0.8], [-0.6, 0, 0.8], [0.48, -0.36, 0.8]] as Vec3[]) {
        const a = aberrateDirection(n, v, w);
        const b = textbook(n, v, w);
        for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-14);
      }
    }
    // Directly behind (home on a radial trip) at the peak rapidities of the M31 and Virgo trips and beyond.
    for (const w of [14.76, 17.84, 20, 24, 40]) {
      const back = aberrateDirection([-v[0], -v[1], -v[2]], v, w);
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(-v[k], 15);
      const ahead = aberrateDirection(v, v, w);
      for (let k = 0; k < 3; k++) expect(ahead[k]).toBeCloseTo(v[k], 15);
    }
  });
  it('cosmological and Doppler shifts multiply', () => {
    const chi = c.comovingDistanceMpc(1);
    const v = appearance(c, 1, chi, 1.5, 1);
    expect(v.frequencyRatio).toBeCloseTo(Math.exp(1.5) / 2, 12);
    expect(v.surfaceBrightnessFactor).toBeCloseTo((Math.exp(1.5) / 2) ** 4, 10);
  });
});

describe('emission table for shaders and bulk CPU use', () => {
  const t = buildEmissionTable(c);
  it('1024 samples reproduce ln a_e to 5e-8 (cubic Catmull-Rom lookup) over a = 1e-5 ... 1e5, 1.4e-7 from the float32 texture', () => {
    expect(t.n).toBe(1024);
    expect(t.maxErrorLnA).toBeLessThan(6e-8);
    expect(t.maxErrorLnA32).toBeLessThan(2e-7);
    expect(t.glsl).toContain('texelFetch');
    expect(t.glsl).toContain('precision highp float');
  });
  it('the CPU twin of the GLSL lookup agrees with the exact emission scale', () => {
    for (const aObs of [0.5, 1, 3, 100]) {
      const etaO = c.particleHorizonMpc(aObs);
      const ehO = c.eventHorizonMpc(aObs);
      for (const f of [0.001, 0.1, 0.5, 0.9]) {
        const chi = f * etaO;
        const exact = Math.log(emissionScale(c, aObs, chi));
        if (exact < Math.log(1e-5)) continue;
        expect(Math.abs(emissionLnAFast(t, etaO, ehO, chi) - exact)).toBeLessThan(6e-8);
      }
    }
    expect(emissionLnAFast(t, 100, 10, 200)).toBe(-Infinity);
  });
  it('redshift from the table difference is accurate for nearby sources too (the table error cancels)', () => {
    for (const aObs of [0.24, 0.5, 1, 3, 100]) {
      const etaO = c.particleHorizonMpc(aObs);
      const ehO = c.eventHorizonMpc(aObs);
      for (const chi of [0.01, 0.1, 1, 3.6, 16.5, 100, 1000]) {
        const z = appearance(c, aObs, chi).z;
        expect(Math.abs(Math.expm1(emissionLn1pZFast(t, etaO, ehO, chi)) / z - 1)).toBeLessThan(1e-5);
      }
    }
    expect(emissionLn1pZFast(t, 100, 10, 200)).toBe(Infinity);
  });
});
