/**
 * The Schwarzschild null-geodesic core (physics/schwarzschild.ts) against known values (Carlson's own test
 * values of R_F, Carlson 1995, Numerical Algorithms 10, 13; exact identities of the shadow, Synge 1966) and
 * against the committed fixtures (__fixtures__/schwarzschild.json), computed in 30–50 digit arithmetic by the
 * independent mpmath reference (scripts/schwarzschild/make_fixtures.py; its method B integrates the geodesic
 * equations and agrees with its closed forms to 1e-17 or better). Tolerances (docs/data/blackholes.md §4 lists them):
 * R_F 1e-15 relative, deflections 1e-14 rad, sweeps 2e-12 rad (b given as a double: near b_c the input's own
 * rounding dominates), shadow and dark radii 1e-15 rad, escape maps 1e-14 rad of equivalent look angle, lens
 * images 1e-13 rad and 3e-8 in μ (the reference port's numerical derivative).
 */
import { describe, expect, it } from 'vitest';
import { readJson } from '../test/files';
import {
  BC,
  deflection,
  edgeAngle,
  einsteinAngle,
  escapeFromRegs,
  escapeRegs,
  escapeSweepInto,
  ESCAPE_ALPHA,
  ESCAPE_GAP,
  ESCAPE_R,
  lensImages,
  lnGRain,
  lnGStatic,
  raindropDarkRadius,
  raindropEscape,
  rainSweep,
  rf,
  rfConj,
  rootsReal,
  shadowAngle,
  spanAngle,
  staticEscape,
  staticSweep,
  sweepBetweenRadii,
  sweepToPeriapsis,
  type SweepSample,
} from './schwarzschild';

/** Relative difference. */
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe("Carlson's R_F", () => {
  it("matches Carlson's published test values to 13 digits", () => {
    // Carlson (1995), section 3: R_F(1, 2, 0), R_F(0.5, 1, 0), R_F(2, 3, 4), and R_F(i, −i, 0) in real form.
    expect(rel(rf(1, 2, 0), 1.3110287771461)).toBeLessThan(1e-13);
    expect(rel(rf(0.5, 1, 0), 1.8540746773014)).toBeLessThan(1e-13);
    expect(rel(rf(2, 3, 4), 0.58408284167715)).toBeLessThan(1e-13);
    expect(rel(rfConj(0, 0, 1), 1.8540746773014)).toBeLessThan(1e-13);
  });

  it('gives the same value for a conjugate pair that happens to be real', () => {
    for (const [x, z] of [
      [1, 2],
      [0, 3],
      [1e-12, 1e3],
      [5, 1e-8],
    ]) {
      expect(rel(rfConj(x, z, 0), rf(x, z, z))).toBeLessThan(1e-15);
    }
  });
});

describe('the total deflection', () => {
  it('matches the 30-digit reference from the strong field to the weak', () => {
    // Values rounded from the reference's 25-digit results (b in units of M; d = b/b_c − 1).
    expect(Math.abs(deflection(6 / BC - 1) - 1.7193883102301686)).toBeLessThan(1e-14);
    expect(Math.abs(deflection(10 / BC - 1) - 0.5903957876058273)).toBeLessThan(1e-14);
    expect(Math.abs(deflection(100 / BC - 1) - 0.04122253974927365)).toBeLessThan(1e-15);
    // Far out α = 2Φ_p(0) − π keeps an absolute error of a few 1e-16 rad (π's own rounding), not a relative one.
    expect(Math.abs(deflection(1e6 / BC - 1) - 4.000011781015118e-6)).toBeLessThan(1e-15);
  });

  it('stays exact a hair from the photon sphere, where the ray circles four times', () => {
    // b = b_c (1 + 1e-12): 27.23079107618216380404722 rad.
    expect(rel(deflection(1e-12), 27.230791076182164)).toBeLessThan(1e-14);
  });
});

describe('the shadow and the dark region', () => {
  it('has the exact shadow radii of a static observer at 3 M and 6 M', () => {
    // sin α_sh = (b_c/r)√(1 − 2/r): 1 at the photon sphere, √2/2 at 6 M.
    expect(Math.abs(shadowAngle(3) - Math.PI / 2)).toBeLessThan(1e-15);
    expect(Math.abs(shadowAngle(6) - Math.PI / 4)).toBeLessThan(1e-15);
  });

  it("gives the raindrop's dark region 42.10° across in radius at the horizon", () => {
    expect(Math.abs(raindropDarkRadius(2) - 0.7348438092396032)).toBeLessThan(1e-15);
    expect((raindropDarkRadius(2) * 180) / Math.PI).toBeCloseTo(42.1, 2);
  });

  it('is the shadow for a static observer and the dark region for a raindrop', () => {
    expect(edgeAngle({ frame: 'static', r: 20 })).toBe(shadowAngle(20));
    expect(edgeAngle({ frame: 'rain', r: 1 })).toBe(raindropDarkRadius(1));
  });
});

describe('escape and frequency', () => {
  it('sweeps the same angle through escapeSweepInto as through the escape functions', () => {
    const out: SweepSample = { captured: false, dphi: 0, lnG: 0 };
    expect(escapeSweepInto({ frame: 'static', r: 20 }, 1, undefined, out).dphi).toBe(staticEscape(20, 1).dphi);
    expect(out.lnG).toBe(lnGStatic(20));
    expect(escapeSweepInto({ frame: 'rain', r: 1 }, 2, undefined, out).dphi).toBe(raindropEscape(1, 2).dphi);
    expect(escapeSweepInto({ frame: 'static', r: 20 }, 0.1, undefined, out).captured).toBe(true);
  });

  it('keeps ln g of a static observer far away without cancellation', () => {
    // −½ ln(1 − 2/r) = 1/r + 1/r² + …: at r = 1e10 that is 1e-10 (1 + 1e-10).
    expect(rel(lnGStatic(1e10), 1e-10 * (1 + 1e-10))).toBeLessThan(1e-15);
  });

  it("gives the raindrop's frequency factor inside and at the horizon", () => {
    // Straight up at the horizon the sky is redshifted by 1/(1 + v) = 1/2.
    expect(Math.abs(lnGRain(2, Math.PI) + Math.LN2)).toBeLessThan(1e-15);
    expect(Math.abs(lnGRain(10, 1) - raindropEscape(10, 1).lnF)).toBeLessThan(1e-15);
    expect(Math.abs(lnGRain(0.5, 2) - raindropEscape(0.5, 2).lnF)).toBeLessThan(1e-14);
  });
});

describe('the Einstein ring of the sky', () => {
  it('lies where the backward ray has swept half a turn', () => {
    for (const obs of [{ frame: 'static' as const, r: 20 }, { frame: 'static' as const, r: 1e4 }, { frame: 'rain' as const, r: 1 }]) {
      const a = einsteinAngle(obs);
      const out: SweepSample = { captured: false, dphi: 0, lnG: 0 };
      escapeSweepInto(obs, a, a - edgeAngle(obs), out);
      expect(Math.abs(out.dphi - Math.PI)).toBeLessThan(1e-9);
    }
  });

  it('is 6.528e-3 rad in radius from 4,000 au of Sagittarius A* (94,308 M)', () => {
    expect(einsteinAngle({ frame: 'static', r: 94_308 })).toBeCloseTo(6.528e-3, 6);
  });
});

// ─── Against the committed fixtures ──────────────────────────────────────────────────────────────

interface Fx {
  carlson_rf: { real: { x: number; y: number; z: number; rf: number }[]; conjugate_pair: { x: number; zr: number; zi: number; rf: number }[] };
  deflection: { input: 'b' | 'd'; b: number | null; d: number | null; alpha: number }[];
  sweeps: { kind: 'to_periapsis' | 'between'; b: number; r_a: number | 'inf'; r_b: number | null; value: number }[];
  shadow: { ro: number; static: number; raindrop: number }[];
  static_map: { ro: number; theta_sh: number; rows: { theta: number; captured: boolean; dphi?: number; ddphi_dtheta?: number | null }[] }[];
  raindrop_map: { r: number; dark_radius: number; rows: { theta: number; captured: boolean; reason?: string; dphi?: number; ln_f?: number | null }[] }[];
  lens: { ro: number; rs: number; Phi: number; images: { k: number; side: 1 | -1; theta: number; mu: number; parity: number }[] }[];
  camera_maps: {
    name: string;
    frame: 'static' | 'raindrop';
    pos: number[];
    forward: number[];
    up: number[];
    fovy: number;
    phi: number;
    vdir: number[] | null;
    W: number;
    H: number;
    pixels: { i: number; j: number; captured: boolean; ln_g: number; n_inf: number[] | null }[];
  }[];
}

const fx = readJson<Fx>('src/physics/__fixtures__/schwarzschild.json');

describe('the fixtures', () => {
  it('R_F and R_F with a conjugate pair, 1e-12 … 1e3 and next to the negative axis: 1e-15 relative', () => {
    let worst = 0;
    for (const r of fx.carlson_rf.real) worst = Math.max(worst, rel(rf(r.x, r.y, r.z), r.rf));
    for (const r of fx.carlson_rf.conjugate_pair) worst = Math.max(worst, rel(rfConj(r.x, r.zr, r.zi), r.rf));
    expect(worst).toBeLessThan(1e-15);
  });

  it('deflections from d = 1e-14 to b = 1e6: 1e-14 rad', () => {
    let worst = 0;
    for (const r of fx.deflection) {
      const d = r.input === 'd' ? (r.d as number) : (r.b as number) / BC - 1;
      worst = Math.max(worst, Math.abs(deflection(d) - r.alpha));
    }
    expect(fx.deflection.length).toBe(30);
    expect(worst).toBeLessThan(1e-14);
  });

  it('81 sweeps, both sides of b_c, to periapsis, between radii, to the horizon and to r = 0: 2e-12 rad', () => {
    let worst = 0;
    for (const r of fx.sweeps) {
      const d = r.b / BC - 1;
      let v: number;
      if (r.kind === 'to_periapsis') {
        const R = rootsReal(d);
        const ra = r.r_a as number;
        v = sweepToPeriapsis(R, 1 / ra, (ra - R.P) / (ra * R.P));
      } else v = sweepBetweenRadii(d, r.r_a === 'inf' ? Infinity : r.r_a, r.r_b as number);
      worst = Math.max(worst, Math.abs(v - r.value));
    }
    expect(fx.sweeps.length).toBe(81);
    expect(worst).toBeLessThan(2e-12);
  });

  it('shadow and dark-region radii from 2.0001 M to 1e10 M: 1e-15 rad', () => {
    let worst = 0;
    for (const r of fx.shadow) {
      worst = Math.max(worst, Math.abs(shadowAngle(r.ro) - r.static), Math.abs(raindropDarkRadius(r.ro) - r.raindrop));
      // the span π − α_edge, kept without cancellation inside the photon sphere (π − α_edge in doubles carries
      // π's rounding and α_edge's, 5e-16 each)
      expect(Math.abs(spanAngle({ frame: 'static', r: r.ro }) - (Math.PI - r.static))).toBeLessThan(1.5e-15 * Math.max(1, Math.PI / (Math.PI - r.static)));
    }
    expect(worst).toBeLessThan(1e-15);
  });

  it('static observers’ escape maps, 2.2 M to 1e6 M, to 1e-12 of the edge: 1e-14 rad of look angle, every capture', () => {
    let worst = 0;
    for (const m of fx.static_map) {
      for (const row of m.rows) {
        const dphi = staticSweep(m.ro, row.theta);
        expect(Number.isNaN(dphi)).toBe(row.captured);
        if (row.captured || row.dphi === undefined) continue;
        if (row.ddphi_dtheta) worst = Math.max(worst, Math.abs(dphi - row.dphi) / Math.abs(row.ddphi_dtheta));
        else expect(Math.abs(dphi - row.dphi)).toBeLessThan(1e-15);
      }
    }
    expect(worst).toBeLessThan(1e-14);
  });

  it('the raindrop’s maps, 100 M down to 0.1 M, inside the horizon too: 1e-14 rad of look angle, every capture and its reason', () => {
    let worst = 0;
    for (const m of fx.raindrop_map) {
      for (const row of m.rows) {
        const e = raindropEscape(m.r, row.theta);
        // one row sits 1e-9 (relative) from the edge of the dark region, whose own rounding decides it
        const atEdge = Math.abs(row.theta - m.dark_radius) < 1e-8;
        if (!atEdge) expect(e.captured).toBe(row.captured);
        // and one on the knife edge E = 0 (r = 0.5, θ = π/3: 1 − v cos θ = 2e-16), black either way
        const knife = Math.abs(1 - Math.sqrt(2 / m.r) * Math.cos(row.theta)) < 1e-14;
        if (row.captured && !atEdge && !knife) expect(e.reason).toBe(row.reason);
        if (row.captured || e.captured || row.dphi === undefined) continue;
        // ln f = −ln((1 − v) + 2v sin²(α/2)), the form the shader has (exact at the horizon); inside it, near
        // the dark edge where 1 − v cos α is small, its two terms cancel to a few 1e-15
        expect(Math.abs(e.lnF - (row.ln_f as number))).toBeLessThan(3e-14);
        // With the gap to the edge, as the tables pass it: at r = 3 the edge is where b(α) peaks, so b − b_c is
        // quadratic in the gap and only the gap's form keeps it (from α alone, 1e-9 from the edge, it rounds to 0)
        const gap = row.theta - m.dark_radius;
        const dphi = rainSweep(m.r, row.theta, gap);
        const h = 1e-4 * Math.abs(gap);
        const slope = (rainSweep(m.r, row.theta + h, gap + h) - rainSweep(m.r, row.theta - h, gap - h)) / (2 * h);
        worst = Math.max(worst, Math.abs(dphi - row.dphi) / Math.abs(slope));
        if (Math.abs(gap) > 1e-6) expect(Math.abs(e.dphi - row.dphi) / Math.abs(slope)).toBeLessThan(1e-13);
      }
    }
    expect(worst).toBeLessThan(1e-14);
  });

  it('40 lens configurations, every branch, both parities: images to 1e-13 rad, μ to 3e-8, parity = side', () => {
    let worstTh = 0;
    let worstMu = 0;
    for (const c of fx.lens) {
      const ims = lensImages(c.ro, c.rs, c.Phi, 2);
      for (const ref of c.images) {
        const im = ims.find((x) => x.k === ref.k && x.side === ref.side);
        expect(im).toBeDefined();
        if (!im) continue;
        worstTh = Math.max(worstTh, Math.abs(im.theta - ref.theta));
        worstMu = Math.max(worstMu, Math.abs(im.mu / ref.mu - 1));
        expect(ref.parity).toBe(ref.side);
        expect(Math.sign(im.mu)).toBe(ref.side);
      }
    }
    expect(fx.lens.length).toBe(40);
    expect(worstTh).toBeLessThan(1e-13);
    expect(worstMu).toBeLessThan(3e-8);
  });

  it('the camera maps: escape directions to 1e-11 rad and ln g to 1e-14, through the ship-to-frame aberration', () => {
    let worstN = 0;
    let worstG = 0;
    for (const cam of fx.camera_maps) {
      const r = Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]);
      const rhat = cam.pos.map((v) => v / r);
      const fl = Math.hypot(cam.forward[0], cam.forward[1], cam.forward[2]);
      const f = cam.forward.map((v) => v / fl);
      const rgt = cross(f, cam.up);
      const rn = Math.hypot(rgt[0], rgt[1], rgt[2]);
      for (let k = 0; k < 3; k++) rgt[k] /= rn;
      const upv = cross(rgt, f);
      const t = Math.tan((cam.fovy * Math.PI) / 360);
      const asp = cam.W / cam.H;
      for (const px of cam.pixels) {
        const x = ((2 * (px.i + 0.5)) / cam.W - 1) * asp * t;
        const y = (1 - (2 * (px.j + 0.5)) / cam.H) * t;
        let d = [0, 1, 2].map((k) => f[k] + x * rgt[k] + y * upv[k]);
        const dn = Math.hypot(d[0], d[1], d[2]);
        d = d.map((v) => v / dn);
        let lnD = 0;
        if (cam.phi && cam.vdir) {
          lnD = lnDopplerShip(d, cam.vdir, cam.phi);
          d = toRest(d, cam.vdir, cam.phi);
        }
        const th = chordAngle(
          d,
          rhat.map((v) => -v),
        );
        const obs = { frame: cam.frame === 'static' ? ('static' as const) : ('rain' as const), r };
        const out: SweepSample = { captured: false, dphi: 0, lnG: 0 };
        escapeSweepInto(obs, th, undefined, out);
        expect(out.captured).toBe(px.captured);
        if (px.captured || !px.n_inf) continue;
        const c = d[0] * rhat[0] + d[1] * rhat[1] + d[2] * rhat[2];
        const e = [d[0] - c * rhat[0], d[1] - c * rhat[1], d[2] - c * rhat[2]];
        const el = Math.hypot(e[0], e[1], e[2]) || 1;
        const n = [0, 1, 2].map((k) => Math.cos(out.dphi) * rhat[k] + (Math.sin(out.dphi) * e[k]) / el);
        worstN = Math.max(worstN, chordAngle(n, px.n_inf));
        worstG = Math.max(worstG, Math.abs(out.lnG + lnD - px.ln_g));
      }
    }
    expect(fx.camera_maps.length).toBe(8);
    expect(worstN).toBeLessThan(1e-11);
    expect(worstG).toBeLessThan(1e-14);
  });
});

describe('the allocation-free path', () => {
  it('sweeps exactly what the returning forms sweep, without allocating', { timeout: 60_000 }, () => {
    const out: SweepSample = { captured: false, dphi: 0, lnG: 0 };
    for (const [frame, r] of [
      ['static', 20],
      ['static', 2.5],
      ['static', 1e6],
      ['rain', 1],
      ['rain', 10],
      ['rain', 0.1],
    ] as const) {
      const edge = edgeAngle({ frame, r });
      for (let k = 1; k < 200; k++) {
        const a = edge + ((Math.PI - edge) * k) / 200;
        escapeSweepInto({ frame, r }, a, undefined, out);
        const ref = frame === 'static' ? staticEscape(r, a) : raindropEscape(r, a);
        expect(out.captured).toBe(ref.captured);
        if (!ref.captured) expect(out.dphi).toBe(ref.dphi);
      }
    }
    const obs = { frame: 'static' as const, r: 20 };
    const obsRain = { frame: 'rain' as const, r: 1 };
    const run = () => {
      for (let k = 1; k < 100; k++) {
        escapeSweepInto(obs, 0.3 + k * 0.028, undefined, out);
        escapeSweepInto(obsRain, 0.8 + k * 0.02, undefined, out);
      }
    };
    // 198 sweeps: the allocating escape functions fill some tens of kilobytes (the verbatim port a hundred);
    // escapeSweepInto at most the one number V8 boxes for a double argument it does not inline (16 bytes), and
    // the table build's kernel entry nothing
    expect(bytesPer(run)).toBeLessThan(198 * 16 + 256);
    const regs = () => {
      for (let k = 1; k < 100; k++) {
        escapeRegs[ESCAPE_R] = 20;
        escapeRegs[ESCAPE_ALPHA] = 0.3 + k * 0.028;
        escapeRegs[ESCAPE_GAP] = NaN;
        escapeFromRegs(false);
        escapeRegs[ESCAPE_R] = 1;
        escapeRegs[ESCAPE_ALPHA] = 0.8 + k * 0.02;
        escapeFromRegs(true);
      }
    };
    expect(bytesPer(regs)).toBeLessThan(256);
  });
});

/** Angle between unit vectors from chords. */
function chordAngle(a: number[], b: number[]): number {
  const s = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const c = Math.hypot(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
  return 2 * Math.atan2(s, c);
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Ship-frame direction to the frame it moves in (rapidity φ along v): tan(θ/2) = e^φ tan(θ′/2) about v. */
function toRest(d: number[], v: number[], phi: number): number[] {
  const th = chordAngle(d, v);
  const nt = 2 * Math.atan2(Math.exp(phi) * Math.sin(th / 2), Math.cos(th / 2));
  const c = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
  const p = [d[0] - c * v[0], d[1] - c * v[1], d[2] - c * v[2]];
  const pl = Math.hypot(p[0], p[1], p[2]);
  if (pl === 0) return c >= 0 ? v.slice() : v.map((x) => -x);
  return [0, 1, 2].map((i) => Math.cos(nt) * v[i] + (Math.sin(nt) / pl) * p[i]);
}

function lnDopplerShip(d: number[], v: number[], phi: number): number {
  const th = chordAngle(d, v);
  return -Math.log(Math.exp(-phi) * Math.cos(th / 2) ** 2 + Math.exp(phi) * Math.sin(th / 2) ** 2);
}

// Node's own modules, reached without its type definitions (the app is typed for the browser).
interface V8 {
  setFlagsFromString(flags: string): void;
  getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[];
}
const node = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
const v8 = node.getBuiltinModule('node:v8') as V8;
const vm = node.getBuiltinModule('node:vm') as { runInNewContext(code: string): unknown };
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** Young-generation bytes filled by one call of fn (after warming it up), less the measuring's own: the least of several tries. */
function bytesPer(fn: () => void): number {
  for (let k = 0; k < 2000; k++) fn();
  let best = Infinity;
  let overhead = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    gc();
    const before = newSpace();
    fn();
    const grown = newSpace() - before;
    if (grown >= 0) best = Math.min(best, grown);
    gc();
    const b0 = newSpace();
    const g0 = newSpace() - b0;
    if (g0 >= 0) overhead = Math.min(overhead, g0);
  }
  return best - overhead;
}
