import { describe, expect, test } from 'vitest';
import { blackbodyRgb } from '../../physics/blackbody';
import { gunzipIfNeeded } from '../stars/catalogue';
import { readBytes } from '../../test/files';
import { gunzipFile } from '../../test/stars';
import { decodeGalaxyParticles, drawOrder, GALAXY_POPULATIONS, galacticToWorld, HII_POPULATION, particleBuffers, temperatureCode, tempFromCode } from './particles';

const FILE = 'public/data/galaxy-particles.bin.gz';
const raw = gunzipFile(FILE);
const p = decodeGalaxyParticles(raw);

describe('galaxy particle loader', () => {
  test('decodes', () => {
    expect(p.count).toBe(199_500);
    expect(p.header.R0).toBeCloseTo(8.277, 4);
    // Every population is present.
    expect(new Set(p.population).size).toBe(GALAXY_POPULATIONS.length);
    // Colours are normalised (largest channel 255).
    for (let i = 0; i < 1000; i++) expect(Math.max(p.colors[3 * i], p.colors[3 * i + 1], p.colors[3 * i + 2])).toBe(255);
    // Sizes are between 1 pc and ~3 kpc.
    for (let i = 0; i < p.count; i += 97) {
      expect(p.sizePc[i]).toBeGreaterThanOrEqual(0.99);
      expect(p.sizePc[i]).toBeLessThan(3100);
    }
  });

  test('inflates with DecompressionStream; an inflated buffer passes through unchanged', async () => {
    const gz = readBytes(FILE);
    const inflated = await gunzipIfNeeded(gz.buffer as ArrayBuffer);
    expect(inflated.byteLength).toBe(raw.byteLength);
    expect((await gunzipIfNeeded(inflated)).byteLength).toBe(raw.byteLength);
    // Inflating 1.7 MB takes about 2 s alone, and over 5 s while the machine is busy building.
  }, 30_000);

  test('world rotation preserves distances', () => {
    const w = galacticToWorld(p.positionsKpc.subarray(0, 300));
    for (let i = 0; i < 300; i += 3) {
      const a = Math.hypot(p.positionsKpc[i], p.positionsKpc[i + 1], p.positionsKpc[i + 2]);
      expect(Math.hypot(w[i], w[i + 1], w[i + 2])).toBeCloseTo(a, 4);
    }
  });
});

describe('GPU buffers', () => {
  const b = particleBuffers(raw);

  test('carry the records unchanged, the H II regions first and the rest in the file’s order', () => {
    expect(b.count).toBe(p.count);
    expect(b.kpcPerUnit).toBeCloseTo(0.002, 9);
    const { order, singles } = drawOrder(raw);
    expect(b.singles).toBe(singles);
    expect(singles).toBe(3500);
    expect(new Set(order).size).toBe(p.count);
    for (let k = 1; k < p.count; k++) if (k !== singles) expect(order[k]).toBeGreaterThan(order[k - 1]);
    for (let k = 0; k < p.count; k++) expect(b.attrs[4 * k] === HII_POPULATION, String(k)).toBe(k < singles);
    for (let k = 0; k < p.count; k += 1013) {
      const i = order[k];
      for (let c = 0; c < 3; c++) {
        expect(b.position[3 * k + c] * b.kpcPerUnit).toBeCloseTo(p.positionsKpc[3 * i + c], 5);
        expect(b.color[3 * k + c]).toBe(p.colors[3 * i + c]);
      }
      expect(b.attrs[4 * k]).toBe(p.population[i]);
      expect(Math.abs(2 ** (b.attrs[4 * k + 1] / 8) / p.luminosityLsun[i] - 1)).toBeLessThan(1e-6);
      expect(Math.abs(2 ** (b.attrs[4 * k + 2] / 16) / p.sizePc[i] - 1)).toBeLessThan(1e-6);
    }
  });

  test('any first k after the H II regions are an unbiased share of the rest', () => {
    // Half of the rest (what an integrated GPU draws) holds half of each population's light, to a few per cent.
    const half = b.singles + Math.round((b.count - b.singles) / 2);
    const all = new Float64Array(16);
    const first = new Float64Array(16);
    for (let k = b.singles; k < b.count; k++) {
      const L = 2 ** (b.attrs[4 * k + 1] / 8);
      all[b.attrs[4 * k]] += L;
      if (k < half) first[b.attrs[4 * k]] += L;
    }
    for (const pop of [0, 1, 3, 4, 5, 6, 9]) expect(Math.abs(first[pop] / all[pop] - 0.5), GALAXY_POPULATIONS[pop]).toBeLessThan(0.03);
  });

  test('temperature codes recover the blackbody behind each colour', () => {
    for (const T of [3000, 4500, 5772, 7500, 12_000, 25_000]) {
      const [r, , bl] = blackbodyRgb(T);
      const got = tempFromCode(temperatureCode(r, bl));
      expect(Math.abs(Math.log(got / T))).toBeLessThan(0.02);
    }
    // Populations: the bulge is cooler than the young arm stars.
    const mean = (pop: number) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < b.count; i++)
        if (b.attrs[4 * i] === pop) {
          s += Math.log(tempFromCode(b.attrs[4 * i + 3]));
          n++;
        }
      return Math.exp(s / n);
    };
    const bulge = mean(4);
    const young = mean(1);
    expect(bulge).toBeGreaterThan(3800);
    expect(bulge).toBeLessThan(5200);
    expect(young).toBeGreaterThan(9000);
  });
});
