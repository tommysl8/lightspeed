import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { armRadius, betaOf, createGalaxyModel, dustMaps, polarToG } from './galaxyModel.ts';
import { anglesFromVector, galToG, gToGal, unitFromAngles, type Vec3 } from './frames.ts';
// The particle generator exports its geometry so the two implementations can be compared.
// @ts-expect-error plain ESM script without type declarations
import * as gen from '../../../scripts/build-galaxy.mjs';

const json = JSON.parse(readFileSync(new URL('../model.json', import.meta.url), 'utf8'));
const model = createGalaxyModel(json);
const sunG = galToG([0, 0, 0]);
const COUNTS = gen.COUNTS as Record<string, number>;

describe('spiral arms (Reid et al. 2019)', () => {
  test('TypeScript and generator geometries agree', () => {
    const arms2 = gen.prepareArms(json);
    for (const a of model.arms) {
      const b = arms2.find((x: { id: string }) => x.id === a.id);
      expect(b.betaExt[0]).toBeCloseTo(a.betaExt[0], 9);
      expect(b.betaExt[1]).toBeCloseTo(a.betaExt[1], 9);
      for (let beta = a.betaExt[0]; beta <= a.betaExt[1]; beta += 7.3) {
        expect(gen.armRadius(b, beta)).toBeCloseTo(armRadius(a, beta), 12);
      }
    }
    for (const [R, beta] of [
      [12, 100],
      [15, -60],
      [9.5, 170],
    ]) {
      expect(gen.warpZ(json, R, beta)).toBeCloseTo(model.warpZ(R, beta), 12);
    }
  });

  test('fourth-quadrant tangencies match the fitted longitudes of Reid et al. Table 2 to 2 deg', () => {
    const expected: Record<string, number> = { '3kpc': 337.0, norma: 327.5, sctcen: 306.1, sgrcar: 285.6 };
    for (const [id, lTan] of Object.entries(expected)) {
      const arm = model.arms.find((a) => a.id === id)!;
      const lonAt = (beta: number) => {
        const [x, y] = polarToG(armRadius(arm, beta), beta);
        return anglesFromVector(gToGal([x, y, 0])).lon;
      };
      // The tangency is the local minimum of l on the near side of the arm in quadrant 4 (270 < l < 360).
      const minima: number[] = [];
      for (let beta = arm.betaExt[0] + 0.05; beta < arm.betaExt[1] - 0.05; beta += 0.05) {
        const l0 = lonAt(beta - 0.05), l1 = lonAt(beta), l2 = lonAt(beta + 0.05);
        if (l1 < l0 && l1 < l2 && l1 > 270) minima.push(l1);
      }
      expect(minima.length).toBe(1);
      expect(Math.abs(minima[0] - lTan)).toBeLessThan(2);
    }
  });

  test('arms around the Sun: Local ~0.37 kpc outward, Sagittarius ~1.2 kpc inward, Perseus ~1.9 kpc outward', () => {
    const near = model.armsNear(sunG[0], sunG[1]);
    const get = (id: string) => near.find((n) => n.arm.id === id)!;
    expect(get('local').d).toBeGreaterThan(0.25);
    expect(get('local').d).toBeLessThan(0.5);
    expect(get('local').Ra).toBeGreaterThan(model.R0);
    expect(get('sgrcar').d).toBeGreaterThan(1.0);
    expect(get('sgrcar').d).toBeLessThan(1.5);
    expect(get('sgrcar').Ra).toBeLessThan(model.R0);
    expect(get('perseus').d).toBeGreaterThan(1.6);
    expect(get('perseus').d).toBeLessThan(2.2);
  });

  test('azimuth convention: rotation direction at the Sun is +y (towards l = 90)', () => {
    expect(betaOf(-8, 0)).toBeCloseTo(0, 12);
    expect(betaOf(-8, 0.1)).toBeGreaterThan(0);
  });
});

describe('warp (Chen et al. 2019)', () => {
  test('outer disc bends north towards l ~ 90 and south towards l ~ 270', () => {
    expect(model.warpZ(15, 107.5)).toBeGreaterThan(0.6);
    expect(model.warpZ(15, -72.5)).toBeLessThan(-0.6);
    expect(Math.abs(model.warpZ(model.R0, 0))).toBeLessThan(0.01);
  });
});

describe('dust (Drimmel & Spergel 2001 on Reid et al. arms)', () => {
  test('extinction per kpc in the plane at the Sun is about 1 mag/kpc', () => {
    const a = model.dustAV(sunG);
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeLessThan(1.5);
  });

  test('towards the galactic poles the column is a few tenths of a magnitude at most', () => {
    for (const b of [90, -90]) {
      const u = unitFromAngles(0, b);
      const av = model.columnAVGal([0, 0, 0], [u[0] * 30, u[1] * 30, u[2] * 30]);
      expect(av).toBeGreaterThan(0.02);
      expect(av).toBeLessThan(0.3);
    }
  });

  test('the Galactic centre is hidden: A_V > 10 mag towards Sgr A*', () => {
    const u = unitFromAngles(359.94425, -0.04616);
    expect(model.columnAVGal([0, 0, 0], [u[0] * 8.277, u[1] * 8.277, u[2] * 8.277], 256)).toBeGreaterThan(10);
  });

  test('column integration is independent of the number of segments for a steep path', () => {
    const a: Vec3 = [-5, 3, 4];
    const b: Vec3 = [-4, 2, -3];
    const c1 = model.columnAV(a, b, 16);
    const c2 = model.columnAV(a, b, 256);
    expect(Math.abs(c1 - c2) / c2).toBeLessThan(0.02);
  });

  test('face-on GPU maps have the expected layout', () => {
    const res = 32;
    const m = dustMaps(model, res, 20);
    expect(m.length).toBe(res * res * 4);
    const c = 4 * ((res / 2) * res + res / 2);
    expect(m[c]).toBeGreaterThan(0);
    expect(m[c + 1]).toBeGreaterThan(0.1);
  });
});

describe('particle file public/data/galaxy-particles.bin.gz', () => {
  const buf = gunzipSync(readFileSync(new URL('../../../public/data/galaxy-particles.bin.gz', import.meta.url)));
  const d = gen.decode(buf);

  test('header and counts', () => {
    expect(buf.toString('ascii', 0, 4)).toBe('LSGP');
    const total = Object.values(COUNTS).reduce((s, n) => s + n, 0);
    expect(d.N).toBe(total);
    expect(buf.length).toBe(64 + 12 * d.N);
    expect(d.R0).toBeCloseTo(8.277, 5);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < d.N; i++) counts[d.pop[i]]++;
    (gen.POPULATIONS as string[]).forEach((name, i) => expect(counts[i]).toBe(COUNTS[name]));
  });

  test('total luminosity matches the model budget to 3%', () => {
    let L = 0;
    for (let i = 0; i < d.N; i++) L += d.lum[i];
    expect(Math.abs(L - json.luminosity.totalLV.value) / json.luminosity.totalLV.value).toBeLessThan(0.03);
  });

  test('bulge is centred on the Galactic centre and its near end is at positive longitude', () => {
    let n = 0, sx = 0, sy = 0, sz = 0, nearX = 0, nNear = 0, farX = 0, nFar = 0;
    for (let i = 0; i < d.N; i++) {
      if (d.pop[i] !== 4) continue;
      const x = d.pos[3 * i], y = d.pos[3 * i + 1], z = d.pos[3 * i + 2];
      sx += x; sy += y; sz += z; n++;
      if (y > 0.3) { nearX += x; nNear++; } else if (y < -0.3) { farX += x; nFar++; }
    }
    expect(sx / n).toBeCloseTo(8.277, 1);
    expect(Math.abs(sy / n)).toBeLessThan(0.05);
    expect(Math.abs(sz / n)).toBeLessThan(0.05);
    expect(nearX / nNear).toBeLessThan(farX / nFar); // positive-l side is closer to the Sun
  });

  test('positions are inside the int16 range', () => {
    let maxAbs = 0;
    for (let i = 0; i < 3 * d.N; i++) maxAbs = Math.max(maxAbs, Math.abs(d.pos[i]));
    expect(maxAbs).toBeLessThan(65.6);
  });
});
