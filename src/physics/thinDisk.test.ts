/**
 * The thin disc (physics/thinDisk.ts) against the independent reference (scripts/thin-disk/disk_ref.py, whose output is
 * __fixtures__/thinDisk.json): the Novikov–Thorne flux's closed form against the Page–Thorne integral, the frequency
 * shift at known points, the orbit table against Carlson's closed forms, and every crossing of the disc's plane by
 * 198 backward rays (three cameras, three tilts, inside and outside the shadow, orders 0–2) in radius and shift.
 */
import { describe, expect, it } from 'vitest';
import { readJson } from '../test/files';
import {
  ISCO_M,
  NT_EFFICIENCY,
  NT_PEAK_M,
  ORBIT_COLS,
  ORBIT_ROWS,
  ORBIT_ROWS_IN,
  cameraRows,
  diskRayCrossings,
  diskRayHit,
  keplerRedshift,
  mdotFromEddington,
  ntFluxShape,
  ntLnTStar,
  ntLnTemperature,
  orbitRow,
  orbitTable,
} from './thinDisk';
import { rootsComplex, rootsReal, sweepBetweenComplex, sweepBetweenReal } from './schwarzschild';

interface FixtureCrossing {
  k: number;
  delta: number;
  r: number;
  lz: number;
  g: number | null;
  p: [number, number, number];
}
interface FixtureRay {
  rCam: number;
  incDeg: number;
  alpha: number;
  omega: number;
  b: number;
  end: string;
  crossings: FixtureCrossing[];
}
interface Fixture {
  agreement_B_minus_A: { r_relative: number; g: number };
  flux: { r: number; f: number; fPageThorne: number }[];
  peak: { r: number; f: number };
  known: { what: string; r: number; lz: number; g: number }[];
  rays: FixtureRay[];
}

const fx = readJson<Fixture>('src/physics/__fixtures__/thinDisk.json');

describe('the Novikov–Thorne disc', () => {
  it('the flux’s closed form is the Page–Thorne integral', () => {
    for (const f of fx.flux) {
      expect(f.f / f.fPageThorne - 1).toBeCloseTo(0, 14);
      expect(ntFluxShape(f.r) / f.f - 1, `r = ${f.r}`).toBeCloseTo(0, 11);
    }
  });

  it('vanishes at the inner edge, peaks at 9.55 M and falls as 1/r³ far out', () => {
    expect(ntFluxShape(ISCO_M)).toBe(0);
    expect(ntFluxShape(5)).toBe(0);
    expect(NT_PEAK_M).toBeCloseTo(fx.peak.r, 5);
    expect(ntFluxShape(NT_PEAK_M) / fx.peak.f).toBeCloseTo(1, 10);
    expect(ntFluxShape(NT_PEAK_M * 1.01)).toBeLessThan(ntFluxShape(NT_PEAK_M));
    expect(ntFluxShape(1e8) * 1e24).toBeCloseTo(1, 3);
  });

  it('a disc of no spin turns 5.72 % of the mass it swallows into light', () => {
    expect(NT_EFFICIENCY).toBeCloseTo(0.05719, 5);
    // 2 % of 2.8e39 erg/s (Cygnus X-1's Eddington luminosity in Zhao et al. 2021)
    expect(mdotFromEddington(0.02, 2.8e39) / 1e18).toBeCloseTo(1.0894, 3);
  });

  it('temperatures: T* from M and Ṁ, the peak ring 0.103 of it', () => {
    const lnT = ntLnTStar(21.2, mdotFromEddington(0.02, 2.8e39));
    expect(Math.exp(lnT) / 1e7).toBeCloseTo(2.14156, 4);
    expect(Math.exp(ntLnTemperature(NT_PEAK_M, lnT) - lnT)).toBeCloseTo(fx.peak.f ** 0.25, 12);
    expect(ntLnTemperature(6, lnT)).toBe(-Infinity);
  });

  it('the shift at known points (face-on; along and against the gas at the innermost stable orbit)', () => {
    for (const k of fx.known) expect(keplerRedshift(k.r, k.lz), k.what).toBeCloseTo(k.g, 13);
  });
});

describe('the orbit table', () => {
  const t = orbitTable();

  it('each row ends where Carlson’s closed forms say (the periapsis, or the horizon)', () => {
    let worst = 0;
    for (let j = 0; j < ORBIT_ROWS; j += 3) {
      const row = orbitRow(j, t);
      const vEnd = t.v64[j * ORBIT_COLS + ORBIT_COLS - 1];
      const uEnd = row.escapes ? rootsReal(row.d).u2 : 0.5;
      worst = Math.max(worst, Math.abs(vEnd / t.b[j] / uEnd - 1));
    }
    expect(worst).toBeLessThan(1e-7);
  });

  it('every sample lies on its orbit: the closed-form sweep to it is its ψ (as an error in u, relative)', () => {
    let worst = 0;
    for (let j = 0; j < ORBIT_ROWS; j += 5) {
      const row = orbitRow(j, t);
      for (let c = 37; c < ORBIT_COLS - 1; c += 61) {
        const u = t.v64[j * ORBIT_COLS + c] / t.b[j];
        const psi = (t.psiEnd[j] * c) / (ORBIT_COLS - 1);
        const exact = row.escapes ? sweepBetweenReal(rootsReal(row.d), 0, u) : sweepBetweenComplex(rootsComplex(row.d), 0, u);
        const slope = Math.sqrt(Math.max(0, 1 / t.b[j] ** 2 - u * u + 2 * u ** 3));
        worst = Math.max(worst, (Math.abs(psi - exact) * slope) / u);
      }
    }
    expect(worst).toBeLessThan(1e-7);
  });

  it('the camera’s rows: its sweep from infinity on each orbit', () => {
    const rows = cameraRows(t, 50, new Float64Array(ORBIT_ROWS));
    const j = ORBIT_ROWS_IN + 100;
    expect(rows[j]).toBeCloseTo(sweepBetweenReal(rootsReal(orbitRow(j, t).d), 0, 1 / 50), 14);
    expect(rows[3]).toBeCloseTo(sweepBetweenComplex(rootsComplex(orbitRow(3, t).d), 0, 1 / 50), 14);
  });
});

describe('a backward ray meets the disc (the reference’s 198 rays)', () => {
  const t = orbitTable();
  const rows = new Map<number, Float64Array>();
  const camRows = (r: number) => rows.get(r) ?? (rows.set(r, cameraRows(t, r, new Float64Array(ORBIT_ROWS))), rows.get(r)!);
  const geometry = (ray: FixtureRay) => {
    const inc = (ray.incDeg * Math.PI) / 180;
    return {
      rCam: ray.rCam,
      e1: [0, 0, 1] as [number, number, number],
      d: [Math.sin(ray.alpha) * Math.cos(ray.omega), Math.sin(ray.alpha) * Math.sin(ray.omega), -Math.cos(ray.alpha)] as [number, number, number],
      n: [Math.sin(inc), 0, Math.cos(inc)] as [number, number, number],
    };
  };

  it('the reference’s two methods agree', () => {
    expect(fx.agreement_B_minus_A.r_relative).toBeLessThan(1e-9);
    expect(fx.agreement_B_minus_A.g).toBeLessThan(1e-9);
  });

  it('the same crossings, where they are, in the same order; on the disc within 1e−4 in r and 3e−5 in g', () => {
    let worstR = 0;
    let worstG = 0;
    let onDisc = 0;
    for (const ray of fx.rays) {
      const cs = diskRayCrossings(t, camRows(ray.rCam), geometry(ray));
      // Every crossing outside the photon sphere is found (the table may drop one just above the horizon).
      const ref = ray.crossings.filter((c) => c.r > 3);
      expect(cs.filter((c) => c.r > 3).length, `${ray.rCam} ${ray.alpha} ${ray.omega}`).toBe(ref.length);
      for (let i = 0; i < ref.length; i++) {
        const c = cs[i];
        const f = ref[i];
        expect(c.k).toBe(f.k);
        expect(c.delta).toBeCloseTo(f.delta, 12);
        expect(c.lz).toBeCloseTo(f.lz, 9);
        for (let a = 0; a < 3; a++) expect(c.p[a]).toBeCloseTo(f.p[a], 12);
        if (f.r < ISCO_M) continue;
        onDisc++;
        worstR = Math.max(worstR, Math.abs(c.r / f.r - 1));
        worstG = Math.max(worstG, Math.abs(c.g / (f.g as number) - 1));
      }
    }
    expect(onDisc).toBeGreaterThan(40);
    expect(worstR).toBeLessThan(1e-4);
    expect(worstG).toBeLessThan(3e-5);
  });

  it('the disc is opaque: a hit is the first crossing between its edges', () => {
    const ray = fx.rays.find((r) => r.crossings.filter((c) => c.r > ISCO_M && c.r < 1e4).length >= 2)!;
    const hit = diskRayHit(t, camRows(ray.rCam), geometry(ray), ISCO_M, 1e4)!;
    expect(hit.r).toBeCloseTo(ray.crossings.find((c) => c.r > ISCO_M && c.r < 1e4)!.r, 2);
  });
});
