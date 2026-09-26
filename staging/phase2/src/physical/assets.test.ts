import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLsm1 } from './mesh';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const staging = join(here, '../..');
const bodies = JSON.parse(readFileSync(join(staging, 'bodies.json'), 'utf8'));
const rings = JSON.parse(readFileSync(join(staging, 'rings.json'), 'utf8'));

const REQUIRED = [
  'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan',
  'hyperion', 'iapetus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'proteus', 'nereid', 'charon',
  'nix', 'hydra', 'ceres', 'vesta', 'eris', 'haumea', 'makemake', 'gonggong', 'quaoar', 'sedna', 'orcus', 'arrokoth',
  'halley', 'encke', 'churyumov-gerasimenko', 'hale-bopp', 'oumuamua', 'borisov', 'atlas-3i', 'voyager1', 'voyager2',
  'new-horizons', 'pioneer10', 'parker-solar-probe', 'jwst',
];

interface Body {
  id: string;
  kind: string;
  dwarfPlanetCandidate?: boolean;
  parent?: string;
  radiusKm: number;
  radiusType?: string;
  massKg?: number;
  colour: string;
  facts: string[];
  factSources: string[];
  gmKm3S2?: number;
  densityGCm3?: number;
  geometricAlbedo?: number | null;
  rotation: { model: string };
  discovery?: { date: string };
  spacecraft?: { status: string };
  assets: {
    texture: string | null;
    textureInfo: { width: number; height: number; channels: number; bytes: number; download: string; downloadEntry?: string } | null;
    model: string | null;
  };
}

const list = bodies.bodies as Body[];
const byId: Record<string, Body> = Object.fromEntries(list.map((b) => [b.id, b]));

describe('bodies.json', () => {
  it('has every requested body exactly once', () => {
    expect(list.map((b) => b.id).sort()).toEqual([...REQUIRED].sort());
  });
  for (const id of REQUIRED) {
    it(`${id}: required fields, three sourced facts, plausible numbers`, () => {
      const b = byId[id];
      expect(['moon', 'dwarf-planet', 'asteroid', 'tno', 'comet', 'interstellar', 'spacecraft']).toContain(b.kind);
      expect(['volume-equivalent', 'area-equivalent', 'mean', 'placeholder', 'size-scale']).toContain(b.radiusType);
      if (b.kind === 'moon') expect(typeof b.parent).toBe('string');
      expect(b.radiusKm).toBeGreaterThan(0);
      expect(b.radiusKm).toBeLessThan(3000);
      expect(b.colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(b.facts).toHaveLength(3);
      expect(b.factSources).toHaveLength(3);
      for (const u of b.factSources) expect(u).toMatch(/^https:\/\//);
      for (const f of b.facts) {
        expect(f.length).toBeLessThan(260);
        expect(f).not.toMatch(/!/);
      }
      if (b.gmKm3S2 !== undefined) expect(b.gmKm3S2).toBeGreaterThan(0);
      if (b.densityGCm3 !== undefined) {
        expect(b.densityGCm3).toBeGreaterThan(0.2);
        expect(b.densityGCm3).toBeLessThan(4);
      }
      if (b.geometricAlbedo !== undefined && b.geometricAlbedo !== null) {
        expect(b.geometricAlbedo).toBeGreaterThan(0.01);
        expect(b.geometricAlbedo).toBeLessThan(1.5);
      }
      expect(typeof b.rotation.model).toBe('string');
      if (b.kind === 'spacecraft') expect(typeof b.spacecraft?.status).toBe('string');
      else expect(typeof b.discovery?.date).toBe('string');
    });
  }
});

/** Width and height from a baseline or progressive JPEG's start-of-frame segment. */
function jpegSize(buf: Buffer): [number, number] | null {
  let i = 2;
  while (i + 9 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

describe('classification', () => {
  it('calls only the five IAU dwarf planets (four here; Pluto is elsewhere) dwarf planets', () => {
    expect(list.filter((b) => b.kind === 'dwarf-planet').map((b) => b.id).sort()).toEqual(['ceres', 'eris', 'haumea', 'makemake']);
    expect(byId.vesta.kind).toBe('asteroid');
    expect(byId.arrokoth.kind).toBe('tno');
    for (const id of ['gonggong', 'quaoar', 'sedna', 'orcus']) {
      expect(byId[id].kind, id).toBe('tno');
      expect(byId[id].dwarfPlanetCandidate, id).toBe(true);
    }
  });

  it('uses the same kinds as tracks.json', () => {
    const tracks = JSON.parse(readFileSync(join(root, 'public', 'data', 'tracks.json'), 'utf8')) as { bodies: Record<string, { kind: string }> };
    let n = 0;
    for (const [id, t] of Object.entries(tracks.bodies)) {
      if (!byId[id]) continue;
      expect(byId[id].kind, id).toBe(t.kind);
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });

  it('has a Voyager 1 entry to match its track', () => {
    expect(byId.voyager1.kind).toBe('spacecraft');
    expect(byId.voyager1.spacecraft?.status).toMatch(/interstellar/);
  });

  it('keeps 67P’s mass consistent with the cited Pätzold et al. (2016) value', () => {
    const b = byId['churyumov-gerasimenko'];
    expect(b.massKg! / 9.982e12).toBeCloseTo(1, 3);
    expect(b.gmKm3S2! / (9.982e12 * 6.6743e-20)).toBeCloseTo(1, 3);
    expect(b.densityGCm3!).toBeGreaterThan(0.525);
    expect(b.densityGCm3!).toBeLessThan(0.54);
  });

  it('gives Makemake the mean of its occultation semi-axes (715 and 751 km)', () => {
    expect(byId.makemake.radiusKm).toBe(733);
    expect(byId.makemake.radiusType).toBe('area-equivalent');
    expect(byId.quaoar.radiusType).toBe('area-equivalent');
  });
});

/** Number of colour components in a JPEG's start-of-frame segment. */
function jpegComponents(buf: Buffer): number | null {
  let i = 2;
  while (i + 9 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) return buf[i + 9];
    i += 2 + len;
  }
  return null;
}

describe('textures', () => {
  const withTex = list.filter((b) => b.assets.texture);
  for (const b of withTex) {
    it(`${b.id}: ${b.assets.texture} exists and is a 2:1 JPEG of the stated size`, () => {
      const f = join(root, 'public', b.assets.texture!);
      expect(existsSync(f)).toBe(true);
      const buf = readFileSync(f);
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
      expect(jpegSize(buf)).toEqual([b.assets.textureInfo!.width, b.assets.textureInfo!.height]);
      expect(b.assets.textureInfo!.width).toBe(2 * b.assets.textureInfo!.height);
      // Greyscale maps are real single-channel JPEGs, as textureInfo.channels says.
      expect(jpegComponents(buf)).toBe(b.assets.textureInfo!.channels);
      expect(buf.length).toBe(b.assets.textureInfo!.bytes);
      // The download field is a plain URL (an archive entry, if any, is separate).
      expect(b.assets.textureInfo!.download).toMatch(/^https:\/\/\S+$/);
    });
  }
  it('new textures total at most 10 MB', () => {
    const total = withTex.reduce((s, b) => s + statSync(join(root, 'public', b.assets.texture!)).size, 0);
    expect(total).toBeLessThan(10 * 1024 * 1024);
  });
});

describe('meshes', () => {
  for (const b of list.filter((x) => x.assets.model)) {
    it(`${b.id}: closed, outward-facing, ≤ 4000 triangles, ≤ 300 KB, size consistent with bodies.json`, () => {
      const f = join(root, 'public', b.assets.model!);
      expect(statSync(f).size).toBeLessThan(300 * 1024);
      const m = parseLsm1(readFileSync(f));
      expect(m.triangleCount).toBeLessThanOrEqual(4000);
      // Every directed edge must have its reverse: closed and consistently wound.
      const edges = new Set<string>();
      for (let t = 0; t < m.triangleCount; t++) {
        for (let e = 0; e < 3; e++) edges.add(`${m.indices[3 * t + e]},${m.indices[3 * t + ((e + 1) % 3)]}`);
      }
      for (const k of edges) {
        const [a, c] = k.split(',');
        expect(edges.has(`${c},${a}`)).toBe(true);
      }
      // Positive signed volume (outward normals), matching the header's equal-volume radius.
      let vol = 0;
      const P = m.positions;
      for (let t = 0; t < m.triangleCount; t++) {
        const i = m.indices[3 * t], j = m.indices[3 * t + 1], k = m.indices[3 * t + 2];
        const ax = P[3 * i], ay = P[3 * i + 1], az = P[3 * i + 2];
        const bx = P[3 * j], by = P[3 * j + 1], bz = P[3 * j + 2];
        const cx = P[3 * k], cy = P[3 * k + 1], cz = P[3 * k + 2];
        vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      }
      expect(vol).toBeGreaterThan(0);
      // One closed surface of genus 0 (Euler characteristic V − E + F = 2), so the volume counts
      // every part once. (Arrokoth's two overlapping lobes are joined by a union at build time.)
      expect(m.vertexCount - edges.size / 2 + m.triangleCount, `${b.id} Euler characteristic`).toBe(2);
      const req = Math.cbrt((3 * vol) / (4 * Math.PI));
      expect(Math.abs(req / m.equalVolumeRadiusKm - 1)).toBeLessThan(1e-4);
      // Within 16% of the catalogue mean radius. The largest gaps are Nix and Hydra, whose meshes
      // are the Weaver et al. 2016 ellipsoids while the catalogue radii are the smaller SSD values.
      expect(Math.abs(req / b.radiusKm - 1)).toBeLessThan(0.16);
    });
  }
});

describe('rings.json', () => {
  it('has the requested systems, with sources and sane values', () => {
    const parents = rings.systems.map((s: { parent: string }) => s.parent);
    for (const p of ['jupiter', 'uranus', 'neptune', 'haumea', 'quaoar']) expect(parents).toContain(p);
    const uranus = rings.systems.find((s: { parent: string }) => s.parent === 'uranus');
    expect(uranus.rings).toHaveLength(13);
    expect(uranus.rings.find((r: { name: string }) => r.name === 'Epsilon').radiusKm).toBe(51149);
    const neptune = rings.systems.find((s: { parent: string }) => s.parent === 'neptune');
    for (const n of ['Galle', 'Le Verrier', 'Lassell', 'Arago', 'Adams']) {
      expect(neptune.rings.some((r: { name: string }) => r.name.startsWith(n))).toBe(true);
    }
    for (const s of rings.systems) {
      expect(s.sources.length).toBeGreaterThan(0);
      for (const r of s.rings) {
        const rad = r.radiusKm ?? (r.innerKm + r.outerKm) / 2;
        expect(rad).toBeGreaterThan(0);
        expect(r.colour).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
