import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AstroTime, JupiterMoons, Rotation_EQJ_ECL, RotateVector, Vector } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';
import {
  evalMoon,
  evalMoonVelocity,
  indexMoonCatalog,
  moonEllipse,
  moonRegime,
  type MoonCatalog,
  type MoonModel,
} from './moonModels';

/** Walk up from this file to find a path (the module may live in staging/ or in src/). */
function findUp(rel: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  throw new Error(`${rel} not found above ${fileURLToPath(import.meta.url)}`);
}

type Row = [number, number, number, number];
interface Fixtures {
  bodies: Record<string, { horizons: { target: number; centre: number }; inside: Row[]; outside: Row[] }>;
}

const catalog = JSON.parse(readFileSync(findUp('public/data/moons.json'), 'utf8')) as MoonCatalog;
const moons = indexMoonCatalog(catalog);
const fixtures = JSON.parse(readFileSync(findUp('__fixtures__/moon-checkpoints.json'), 'utf8')) as Fixtures;

const IDS = [
  'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea',
  'titan', 'hyperion', 'iapetus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'nereid',
  'proteus', 'charon', 'nix', 'hydra', 'pluto',
];

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const meanMotion = (m: MoonModel) => (2 * Math.PI) / m.orbit.period; // rad/day

/** Loose bounds on the distance from the centre: anywhere near the (mean) orbit. */
function radiusBounds(m: MoonModel): [number, number] {
  const e = Math.min(0.9, m.orbit.e + 0.1);
  return [0.8 * m.orbit.a * (1 - e), 1.2 * m.orbit.a * (1 + e)];
}

describe('moons.json catalogue', () => {
  it('has every body, in the documented format, within the size budget', () => {
    expect(catalog.format).toBe('lightspeed-moons/1');
    for (const id of IDS) expect(moons[id], id).toBeDefined();
    expect(readFileSync(findUp('public/data/moons.json')).length).toBeLessThan(300 * 1024);
  });

  it('meets the accuracy requirement max(100 km, 5e-4 a) for every body', () => {
    for (const id of IDS) {
      const A = moons[id].accuracy;
      expect(A.targetKm, id).toBeCloseTo(Math.max(100, 5e-4 * moons[id].orbit.a), -1);
      expect(A.maxKm, id).toBeLessThanOrEqual(A.targetKm);
    }
  });

  it('covers at least 1981-01-01 .. 2199-12-29 TDB as the precise window', () => {
    for (const id of IDS) {
      const w = moons[id].window;
      expect(w[0], id).toBeLessThanOrEqual(2444605.5 - 2451545.0);
      expect(w[1], id).toBeGreaterThanOrEqual(2524590.5 - 2451545.0);
    }
  });
});

describe.each(IDS)('%s', (id) => {
  const m = moons[id];
  const fx = fixtures.bodies[id];

  it('matches independent Horizons checkpoints inside the window', () => {
    expect(fx.inside.length).toBeGreaterThanOrEqual(50);
    let worst = 0;
    for (const [t, x, y, z] of fx.inside) {
      expect(moonRegime(m, t)).toBe('precise');
      const err = dist(evalMoon(m, t), [x, y, z]);
      worst = Math.max(worst, err);
    }
    expect(worst).toBeLessThanOrEqual(m.accuracy.checkpointMaxKm + 0.01);
    expect(worst).toBeLessThanOrEqual(m.accuracy.targetKm);
  });

  it('stays finite and on a plausible orbit outside the window', () => {
    const [rmin, rmax] = radiusBounds(m);
    for (const [t, x, y, z] of fx.outside) {
      // "outside" means outside 1981-2199; a model's own fitted window can reach a little further
      const inWindow = t >= m.window[0] && t <= m.window[1];
      expect(moonRegime(m, t)).toBe(inWindow ? 'precise' : 'illustrative');
      const p = evalMoon(m, t);
      if (inWindow) expect(dist(p, [x, y, z])).toBeLessThanOrEqual(m.accuracy.targetKm);
      expect(p.every(Number.isFinite)).toBe(true);
      expect(norm(p)).toBeGreaterThan(rmin);
      expect(norm(p)).toBeLessThan(rmax);
      // wherever it is along the orbit, it is on the right orbit
      expect(dist(p, [x, y, z])).toBeLessThan(2.2 * m.orbit.a * (1 + m.orbit.e));
    }
    for (const years of [-1e6, -1e5, -3000, 1500, 2300, 3000, 1e4, 1e6]) {
      const t = (years - 2000) * 365.25;
      const p = evalMoon(m, t);
      expect(p.every(Number.isFinite), `${years}`).toBe(true);
      expect(norm(p)).toBeGreaterThan(rmin);
      expect(norm(p)).toBeLessThan(rmax);
    }
  });

  it('is smooth (C¹) across the window edges and the end of the fade', () => {
    const [w0, w1] = m.window;
    const n = meanMotion(m);
    const eps = 1e-3;
    const acc = n * n * m.orbit.a * (1 + m.orbit.e) ** 2 / (1 - m.orbit.e) ** 2; // bound on |r''|
    for (const te of [w0, w1, w0 - m.taper, w1 + m.taper, w0 - 0.37 * m.taper, w1 + 0.61 * m.taper]) {
      const p1 = evalMoon(m, te + eps);
      const p0 = evalMoon(m, te - eps);
      const v = evalMoonVelocity(m, te);
      const chord = [p1[0] - p0[0] - 2 * eps * v[0], p1[1] - p0[1] - 2 * eps * v[1], p1[2] - p0[2] - 2 * eps * v[2]];
      expect(norm(chord), `t=${te}`).toBeLessThan(2 * acc * eps * eps + 1e-3);
    }
  });

  it('has a velocity of the right size', () => {
    const e = m.orbit.e;
    const vc = meanMotion(m) * m.orbit.a;
    for (const t of [-5000, 0, 12345.6, 70000]) {
      const v = norm(evalMoonVelocity(m, t));
      expect(v).toBeGreaterThan(0.8 * vc * Math.sqrt((1 - e) / (1 + e)));
      expect(v).toBeLessThan(1.2 * vc * Math.sqrt((1 + e) / (1 - e)));
    }
  });

  it('sits on the orbit line given by moonEllipse()', () => {
    const slack = [...m.xy, ...m.zz].reduce((s, T) => s + Math.hypot(T[1], T[2]), 0) + 1e-3;
    for (const t of [-6000, 0, 3333.3, 45000.5]) {
      const el = moonEllipse(m, t);
      const p = evalMoon(m, t);
      const X = p[0] * el.periapsis[0] + p[1] * el.periapsis[1] + p[2] * el.periapsis[2];
      const Y = p[0] * el.qAxis[0] + p[1] * el.qAxis[1] + p[2] * el.qAxis[2];
      const Z = p[0] * el.normal[0] + p[1] * el.normal[1] + p[2] * el.normal[2];
      expect(Math.abs(Z)).toBeLessThan(slack);
      const b = el.a * Math.sqrt(1 - el.e * el.e);
      const f = Math.hypot(X / el.a + el.e, Y / b);
      expect(Math.abs(f - 1) * el.a).toBeLessThan(2 * slack);
      // the normal is a unit vector along the angular momentum
      const v = evalMoonVelocity(m, t);
      const hx = p[1] * v[2] - p[2] * v[1];
      const hy = p[2] * v[0] - p[0] * v[2];
      const hz = p[0] * v[1] - p[1] * v[0];
      expect((hx * el.normal[0] + hy * el.normal[1] + hz * el.normal[2]) / Math.hypot(hx, hy, hz)).toBeGreaterThan(0.99);
    }
  });
});

describe('cross-checks', () => {
  it('Pluto moves opposite Charon about the barycentre (mass ratio ~0.12)', () => {
    for (const t of [-7000, 0, 5000.25, 60000]) {
      const p = evalMoon(moons.pluto, t);
      const c = evalMoon(moons.charon, t);
      const cos = (p[0] * c[0] + p[1] * c[1] + p[2] * c[2]) / (norm(p) * norm(c));
      expect(cos).toBeLessThan(-0.99999);
      expect(norm(p) / norm(c)).toBeGreaterThan(0.11);
      expect(norm(p) / norm(c)).toBeLessThan(0.13);
    }
  });

  it('agrees with astronomy-engine JupiterMoons() to within its known error (frame and units check)', () => {
    const AU = 149597870.7;
    const rot = Rotation_EQJ_ECL();
    for (const t of [-6000.5, 0, 9131.25, 36524.75, 72000]) {
      const time = AstroTime.FromTerrestrialTime(t);
      const jm = JupiterMoons(time);
      for (const id of ['io', 'europa', 'ganymede', 'callisto'] as const) {
        const s = jm[id];
        const v = RotateVector(rot, new Vector(s.x, s.y, s.z, time));
        expect(dist(evalMoon(moons[id], t), [v.x * AU, v.y * AU, v.z * AU]), `${id} @ ${t}`).toBeLessThan(2500);
      }
    }
  });

  it('writes into a caller-supplied array', () => {
    const out: [number, number, number] = [0, 0, 0];
    const r = evalMoon(moons.titan, 1234.5, out);
    expect(r).toBe(out);
    expect(norm(out)).toBeGreaterThan(1e6);
  });
});
