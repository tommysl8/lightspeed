/**
 * The galaxies' particle templates: deterministic, a few thousand points each, their light adding
 * up to one, the dwarfs and ellipticals scaled to a half-light radius of one, the discs' half-light
 * radii as the records assume, and the choice of template from a galaxy's type.
 */
import { describe, expect, it } from 'vitest';
import { buildTemplate, HD_DETAIL, neighbourDistances, projectedHalfLight, templateFor, TEMPLATE_IDS, type Template, type TemplateId } from './templates';
import { DISC_HALF_LIGHT_PER_R25 } from './records';

const t0 = performance.now();
const all = new Map<string, Template>(TEMPLATE_IDS.map((id) => [id, buildTemplate(id)]));
const buildMs = performance.now() - t0;
const t1 = performance.now();
const fine = new Map<string, Template>((Object.entries(HD_DETAIL) as [TemplateId, number][]).map(([id, k]) => [id, buildTemplate(id, k)]));
const fineMs = performance.now() - t1;

describe('templates', () => {
  it('are a few thousand points each, built in well under a second (in the worker)', () => {
    for (const t of all.values()) {
      if (t.id === 'point') continue;
      expect(t.count, t.id).toBeGreaterThanOrEqual(1000);
      expect(t.count, t.id).toBeLessThanOrEqual(4200);
    }
    expect(buildMs).toBeLessThan(3000);
  });

  it('come in fine versions for galaxies large on screen, as many H II regions and the light shared out alike', () => {
    for (const [id, t] of fine) {
      const plain = all.get(id)!;
      expect(t.detail).toBe(HD_DETAIL[id as TemplateId]);
      expect(t.count).toBeGreaterThan(3 * plain.count);
      let w = 0;
      for (let i = 0; i < t.count; i++) w += t.attrs[4 * i];
      expect(w, id).toBeCloseTo(1, 5);
      // Their splats are smaller: the median against the plain template's.
      const med = (x: Template) => Array.from({ length: x.count }, (_, i) => x.attrs[4 * i + 1]).sort((a, b) => a - b)[x.count >> 1];
      expect(med(t) / med(plain), id).toBeLessThan(0.7);
    }
    // Generous: under the whole suite's load too (a brute-force search grows as the square of the count).
    expect(fineMs).toBeLessThan(20000);
  });

  it('find each point’s 8th neighbour exactly', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 600;
    const p = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) p.set([rnd() * 4 - 2, rnd() * 4 - 2, (rnd() - 0.5) * 0.1], 3 * i);
    const fast = neighbourDistances(p, 0, n, 8);
    for (let i = 0; i < n; i += 37) {
      const d = [];
      for (let j = 0; j < n; j++) if (j !== i) d.push(Math.hypot(p[3 * j] - p[3 * i], p[3 * j + 1] - p[3 * i + 1], p[3 * j + 2] - p[3 * i + 2]));
      d.sort((a, b) => a - b);
      expect(fast[i]).toBeCloseTo(d[7], 5);
    }
  });

  it('are the same every time', () => {
    const again = buildTemplate('spiral');
    expect(Array.from(again.position.slice(0, 30))).toEqual(Array.from(all.get('spiral')!.position.slice(0, 30)));
  });

  it('share out all of a galaxy’s light, with finite splats and colours', () => {
    for (const t of all.values()) {
      let w = 0;
      for (let i = 0; i < t.count; i++) {
        w += t.attrs[4 * i];
        expect(t.attrs[4 * i + 1]).toBeGreaterThan(0);
        expect(Number.isFinite(t.position[3 * i] + t.position[3 * i + 1] + t.position[3 * i + 2])).toBe(true);
        const lum = 0.2126 * t.colour[3 * i] + 0.7152 * t.colour[3 * i + 1] + 0.0722 * t.colour[3 * i + 2];
        expect(lum).toBeCloseTo(1, 5);
      }
      expect(w, t.id).toBeCloseTo(1, 5);
    }
  });

  it('scale the dwarfs, ellipticals and young galaxies to a half-light radius of one', () => {
    for (const id of ['irregular', 'spheroidal', 'elliptical', 'compact'] as const) {
      const t = all.get(id)!;
      expect(t.unit).toBe('rh');
      expect(projectedHalfLight(t.position, (i) => t.attrs[4 * i], t.count), id).toBeCloseTo(1, 5);
    }
  });

  it('give the discs the half-light radii the records assume, and thin discs', () => {
    for (const [id, want] of Object.entries(DISC_HALF_LIGHT_PER_R25)) {
      const t = all.get(id)!;
      expect(t.unit).toBe('r25');
      expect(t.halfLightRadius / want!, id).toBeGreaterThan(0.85);
      expect(t.halfLightRadius / want!, id).toBeLessThan(1.15);
    }
    // The disc of a spiral is a tenth as thick as it is long, or thinner.
    const s = all.get('spiral')!;
    let zz = 0;
    let rr = 0;
    for (let i = 0; i < s.count; i++) {
      if (s.attrs[4 * i + 3] !== 1) continue;
      zz += Math.abs(s.position[3 * i + 2]);
      rr += Math.hypot(s.position[3 * i], s.position[3 * i + 1]);
    }
    expect(zz / rr).toBeLessThan(0.1);
  });

  it('are chosen from the type', () => {
    expect(templateFor('spiral', 'SA(s)b')).toBe('spiral');
    expect(templateFor('spiral', 'SA(s)ab')).toBe('spiral-early');
    expect(templateFor('spiral', 'SA(s)cd')).toBe('spiral-late');
    expect(templateFor('spiral', 'SB(s)bc')).toBe('barred');
    expect(templateFor('magellanic-spiral', 'SB(s)m')).toBe('magellanic');
    expect(templateFor('magellanic-irregular', 'SB(s)m pec')).toBe('irregular');
    expect(templateFor('spiral', 'SA(s)a sp', 'sombrero')).toBe('lenticular');
    expect(templateFor('lenticular-peculiar', 'S0 pec')).toBe('elliptical');
    expect(templateFor('dwarf-spheroidal', null)).toBe('spheroidal');
    expect(templateFor('high-z', 'compact')).toBe('compact');
  });
});
