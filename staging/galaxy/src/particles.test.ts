import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decodeGalaxyParticles, GALAXY_POPULATIONS, galacticToWorld, gunzipIfNeeded } from './particles.ts';

const gz = readFileSync(new URL('../../../public/data/galaxy-particles.bin.gz', import.meta.url));
const toAB = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('galaxy particle loader', () => {
  test('inflates with DecompressionStream and decodes', async () => {
    const raw = await gunzipIfNeeded(toAB(gz));
    const p = decodeGalaxyParticles(raw);
    expect(p.count).toBeGreaterThan(150000);
    expect(p.count).toBeLessThan(300000);
    expect(p.header.R0).toBeCloseTo(8.277, 4);
    // Every population is present.
    const seen = new Set(p.population);
    expect(seen.size).toBe(GALAXY_POPULATIONS.length);
    // Colours are normalised (largest channel 255).
    for (let i = 0; i < 1000; i++) expect(Math.max(p.colors[3 * i], p.colors[3 * i + 1], p.colors[3 * i + 2])).toBe(255);
    // Sizes are between 1 pc and ~3 kpc.
    for (let i = 0; i < p.count; i += 97) {
      expect(p.sizePc[i]).toBeGreaterThanOrEqual(0.99);
      expect(p.sizePc[i]).toBeLessThan(3100);
    }
  });

  test('already-inflated buffers pass through unchanged', async () => {
    const raw = await gunzipIfNeeded(toAB(gz));
    const again = await gunzipIfNeeded(raw);
    expect(again.byteLength).toBe(raw.byteLength);
  });

  test('world rotation preserves distances', async () => {
    const p = decodeGalaxyParticles(await gunzipIfNeeded(toAB(gz)));
    const w = galacticToWorld(p.positionsKpc.subarray(0, 300));
    for (let i = 0; i < 300; i += 3) {
      const a = Math.hypot(p.positionsKpc[i], p.positionsKpc[i + 1], p.positionsKpc[i + 2]);
      const b = Math.hypot(w[i], w[i + 1], w[i + 2]);
      expect(b).toBeCloseTo(a, 4);
    }
  });
});
