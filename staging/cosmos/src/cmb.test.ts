import { describe, expect, it } from 'vitest';
import {
  CMB_STEP_UK,
  cmbCodeToMicroK,
  cmbUvToEclDirection,
  cmbUvToGalactic,
  eclDirectionToCmbUv,
  galacticToCmbUv,
  microKToCmbCode,
  worldToGalacticColumnMajor,
} from './cmb.ts';
import { ECL_TO_GAL, apply, eclToWorld, lbToEcl, lbToUnit } from './frames.ts';
import { decodePng8, repoFile } from './testFiles.ts';

describe('CMB texture mapping', () => {
  it('puts the Galactic centre in the middle with l increasing to the left', () => {
    expect(galacticToCmbUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(galacticToCmbUv(90, 0).u).toBeCloseTo(0.25, 12);
    expect(galacticToCmbUv(270, 0).u).toBeCloseTo(0.75, 12);
    expect(galacticToCmbUv(180, 0).u).toBeCloseTo(0, 12);
    expect(galacticToCmbUv(0, 90).v).toBe(0);
  });

  it('round-trips (l, b) <-> (u, v) and ecliptic directions', () => {
    for (const [l, b] of [
      [10, 20],
      [200, -57],
      [359.9, 1],
      [264.021, 48.253],
    ]) {
      const { u, v } = galacticToCmbUv(l, b);
      const g = cmbUvToGalactic(u, v);
      expect(g.l).toBeCloseTo(l, 9);
      expect(g.b).toBeCloseTo(b, 9);
      const e = lbToEcl(l, b);
      const uv = eclDirectionToCmbUv(e);
      expect(uv.u).toBeCloseTo(u, 9);
      const back = cmbUvToEclDirection(uv.u, uv.v);
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(e[k], 9);
    }
  });

  it('world -> galactic matrix matches ECL_TO_GAL after world -> ecliptic', () => {
    const m = worldToGalacticColumnMajor();
    const e = lbToEcl(123, -45);
    const w = eclToWorld(e);
    const g = [0, 1, 2].map((r) => m[r] * w[0] + m[3 + r] * w[1] + m[6 + r] * w[2]);
    const ref = apply(ECL_TO_GAL, e);
    const want = lbToUnit(123, -45);
    for (let k = 0; k < 3; k++) {
      expect(g[k]).toBeCloseTo(ref[k], 12);
      expect(g[k]).toBeCloseTo(want[k], 12);
    }
  });

  it('decodes temperature codes', () => {
    expect(cmbCodeToMicroK(0)).toBeCloseTo(-250, 9);
    expect(cmbCodeToMicroK(255)).toBeCloseTo(250, 9);
    expect(microKToCmbCode(0)).toBe(128);
    expect(microKToCmbCode(-1000)).toBe(0);
    expect(CMB_STEP_UK).toBeCloseTo(1.96, 2);
  });
});

describe('shipped CMB textures', () => {
  const colour = decodePng8(repoFile('public/textures/cmb.png'));
  const data = decodePng8(repoFile('public/textures/cmb-data.png'));

  it('have the documented sizes, types and credit', () => {
    expect([colour.width, colour.height, colour.colorType]).toEqual([2048, 1024, 3]);
    expect([data.width, data.height, data.colorType]).toEqual([1024, 512, 0]);
    expect(colour.palette?.length).toBe(768);
    expect(colour.text.Author).toBe('NASA / WMAP Science Team');
    expect(colour.text.Title).toMatch(/contrast enhanced/);
  });

  // Mean anisotropy in a cap around (l, b) from the data texture, area-weighted by cos b.
  function capMean(img: typeof data, l0: number, b0: number, radiusDeg: number): number {
    const c = lbToUnit(l0, b0);
    const cosR = Math.cos((radiusDeg * Math.PI) / 180);
    let s = 0;
    let w = 0;
    for (let j = 0; j < img.height; j++) {
      for (let i = 0; i < img.width; i++) {
        const { l, b } = cmbUvToGalactic((i + 0.5) / img.width, (j + 0.5) / img.height);
        const p = lbToUnit(l, b);
        if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] < cosR) continue;
        const wt = Math.cos((b * Math.PI) / 180);
        s += wt * cmbCodeToMicroK(img.pixels[j * img.width + i]);
        w += wt;
      }
    }
    return s / w;
  }

  it('has an area-weighted all-sky mean near zero and an rms near 70 uK', () => {
    let s = 0;
    let s2 = 0;
    let w = 0;
    for (let j = 0; j < data.height; j++) {
      const wt = Math.cos(((90 - (180 * (j + 0.5)) / data.height) * Math.PI) / 180);
      for (let i = 0; i < data.width; i++) {
        const t = cmbCodeToMicroK(data.pixels[j * data.width + i]);
        s += wt * t;
        s2 += wt * t * t;
        w += wt;
      }
    }
    const mean = s / w;
    const rms = Math.sqrt(s2 / w - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(5);
    expect(rms).toBeGreaterThan(60);
    expect(rms).toBeLessThan(80);
  });

  it('shows the Cold Spot at (l, b) = (209, -57) as cold', () => {
    // Cruz et al. 2005: a ~5 deg region about -70 uK in WMAP; the 1-degree ILC cap mean is negative.
    expect(capMean(data, 209, -57, 5)).toBeLessThan(-40);
  });

  it('colour and data images encode the same codes', () => {
    // sample every 64th pixel of the colour image, compare with the data image at the same (l, b)
    let maxDiff = 0;
    for (let j = 32; j < colour.height; j += 64) {
      for (let i = 32; i < colour.width; i += 64) {
        const kc = colour.pixels[j * colour.width + i];
        const kd = data.pixels[(j >> 1) * data.width + (i >> 1)];
        maxDiff = Math.max(maxDiff, Math.abs(kc - kd));
      }
    }
    // different sampling grids of a 1-degree map: a few codes (~2 uK each) apart at most
    expect(maxDiff).toBeLessThan(25);
  });
});
