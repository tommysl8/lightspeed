/**
 * Point images (physics/lensPoint.ts) against the independent 34-digit reference (__fixtures__/schwarzschild.json,
 * written by scripts/schwarzschild/make_fixtures.py): tier 2 against every `lens` image (1e-12 rad, 1e-7 in μ); tier 1
 * against the `lens` images of sources at least ten times farther than the camera, the `foot` rows (every order-0
 * image present, within 0.02 px) and the `forward_caustic` rows; the pass counts by r_o/r_s against tier 2; photon
 * conservation over a sphere of observers; the finite-source factor and the star radii.
 *
 * Positions are compared as look angles in device px at 1,484 px per radian (the 50° view on a 1,384-px-tall
 * canvas), magnifications in ln μ.
 */
import { describe, expect, it } from 'vitest';
import { readJson } from '../test/files';
import { cpuMs } from '../test/timing';
import { BC, lensImages } from './schwarzschild';
import { buildForwardTable, buildInverseTable, type InverseTable } from './schwarzschildTables';
import {
  B0Z_TEXELS,
  causticZ,
  fillB0OverZ,
  gouldB0,
  gouldB0OverZ,
  lambdaExact,
  lambdaFlat,
  pointImageExact,
  pointImageTier1,
  starAngularRadiusRad,
  starRadiusRsun,
  type ImageOrder,
  type PointImage,
} from './lensPoint';
import type { Vec3 } from './vec';

const PX = 1484;

interface LensImageRow {
  k: number;
  side: 1 | -1;
  branch: string;
  theta: number;
  mu: number;
  dOmega_dA: number;
  cos_psi_s: number;
}
interface LensRow {
  ro: number;
  rs: number;
  Phi: number;
  images: LensImageRow[];
}
interface FootRow {
  ro: number;
  rs: number;
  gamma: number;
  offset: number;
  branch: string;
  theta: number;
  mu: number;
}
interface CausticRow {
  ro: number;
  rs: number | 'inf';
  gamma: number;
  theta: number;
  mu: number;
}
interface Fixtures {
  lens: LensRow[];
  foot: FootRow[];
  forward_caustic: CausticRow[];
  static_map: { ro: number; theta_sh: number; rows: { theta: number; captured: boolean; dphi?: number; mu_inf?: number | null }[] }[];
}

const fx = readJson<Fixtures>('src/physics/__fixtures__/schwarzschild.json');

const newImage = (): PointImage => ({
  ok: false,
  alpha: 0,
  dir: { x: 0, y: 0, z: 0 },
  lnMu: 0,
  lnG: 0,
  side: 1,
  branch: 'identity',
  emitDir: { x: 0, y: 0, z: 0 },
  causticOffset: 0,
});

/**
 * The fixtures' geometry in world axes: the hole at the origin, the camera at (ro, 0, 0), the source at
 * rs (cos Φ, sin Φ, 0). Returns camera → hole and camera → source, units of M.
 */
function scene(ro: number, rs: number, Phi: number): { holeM: Vec3; srcM: Vec3 } {
  return { holeM: { x: -ro, y: 0, z: 0 }, srcM: { x: rs * Math.cos(Phi) - ro, y: rs * Math.sin(Phi), z: 0 } };
}

/** The image order of a fixture image (k, side). */
const orderOf = (k: number, side: number): number => 2 * k + (side > 0 ? 0 : 1);

const tables = new Map<number, InverseTable>();
function tableAt(ro: number): InverseTable {
  let t = tables.get(ro);
  if (!t) {
    t = buildInverseTable(buildForwardTable({ frame: 'static', r: ro }));
    tables.set(ro, t);
  }
  return t;
}

describe('tier 2, the exact solver', () => {
  it('finds every image of the reference to 1e-12 rad and its magnification to 1e-7', () => {
    const im = newImage();
    let worstTh = 0;
    let worstMu = 0;
    let n = 0;
    for (const c of fx.lens) {
      const { holeM, srcM } = scene(c.ro, c.rs, c.Phi);
      for (const ref of c.images) {
        pointImageExact(c.ro, holeM, srcM, orderOf(ref.k, ref.side) as ImageOrder, im);
        expect(im.ok).toBe(true);
        expect(im.side).toBe(ref.side);
        expect(im.branch).toBe(ref.branch === 'out' || ref.branch === 'peri' ? 'outgoing' : 'incoming');
        worstTh = Math.max(worstTh, Math.abs(im.alpha - ref.theta));
        worstMu = Math.max(worstMu, Math.abs(Math.exp(im.lnMu) / Math.abs(ref.mu) - 1));
        n++;
      }
    }
    expect(n).toBe(240);
    expect(worstTh).toBeLessThan(1e-12);
    expect(worstMu).toBeLessThan(1e-7);
  });

  it('agrees with the reference port image by image, and puts each image on its side of the axis', () => {
    const im = newImage();
    for (const [ro, rs, Phi] of [
      [100, 50, 2.5],
      [10, 1e4, 1],
      [20, 5, 0.3],
    ]) {
      const { holeM, srcM } = scene(ro, rs, Phi);
      for (const ref of lensImages(ro, rs, Phi, 1)) {
        pointImageExact(ro, holeM, srcM, orderOf(ref.k, ref.side) as ImageOrder, im);
        expect(Math.abs(im.alpha - ref.theta)).toBeLessThan(1e-13);
        // the source is at +y: images of side +1 lie at +y, of side −1 at −y
        expect(Math.sign(im.dir.y)).toBe(ref.side);
      }
    }
  });

  it('sends the light of an order-1 image out on the far side of the hole, and of order 0 towards the camera far away', () => {
    const im0 = newImage();
    const im1 = newImage();
    const { holeM, srcM } = scene(100, 50, 2.5);
    pointImageExact(100, holeM, srcM, 0, im0);
    pointImageExact(100, holeM, srcM, 1, im1);
    // the tangent along which order 0 is swept (towards +φ at the source, here clockwise seen from +z): the two
    // images' light leaves on opposite sides of the line from the source to the hole
    const sx = 50 * Math.cos(2.5);
    const sy = 50 * Math.sin(2.5);
    const cross = (e: Vec3) => sx * e.y - sy * e.x;
    expect(Math.sign(cross(im0.emitDir))).toBe(-Math.sign(cross(im1.emitDir)));
    // far from the hole the light of order 0 leaves the source straight at the camera
    const far = scene(1e6, 3e6, 0.4);
    const imf = newImage();
    pointImageExact(1e6, far.holeM, far.srcM, 0, imf);
    const d = Math.hypot(far.srcM.x, far.srcM.y);
    expect(Math.abs(imf.emitDir.x + far.srcM.x / d) + Math.abs(imf.emitDir.y + far.srcM.y / d)).toBeLessThan(1e-5);
    // unit vectors
    for (const e of [im0.emitDir, im1.emitDir, imf.emitDir]) expect(Math.abs(Math.hypot(e.x, e.y, e.z) - 1)).toBeLessThan(1e-14);
  });

  it('conserves photons over a sphere of observers (r_o = 50, r_s = 10: 0.942718866 of 0.942718872)', () => {
    // (ro² g²/2) ∫₀^π Σ_images (dΩ_o/dA_s) |cos θ| sin Φ dΦ = f_esc(r_s), images k = 0 … 2 on both sides, 48-point
    // Gauss–Legendre in Φ; dΩ_o/dA_s = |μ|/d_E²
    const ro = 50;
    const rs = 10;
    const [xs, ws] = gaussLegendre(48);
    const im = newImage();
    let sum = 0;
    for (let j = 0; j < xs.length; j++) {
      const Phi = (Math.PI / 2) * (xs[j] + 1);
      const w = (Math.PI / 2) * ws[j];
      const { holeM, srcM } = scene(ro, rs, Phi);
      const dE2 = ro * ro + rs * rs - 2 * ro * rs * Math.cos(Phi);
      let s = 0;
      for (let order = 0; order < 6; order++) {
        pointImageExact(ro, holeM, srcM, order as ImageOrder, im);
        expect(im.ok).toBe(true);
        s += (Math.exp(im.lnMu) / dE2) * Math.abs(Math.cos(im.alpha));
      }
      sum += w * s * Math.sin(Phi);
    }
    const g2 = (1 - 2 / rs) / (1 - 2 / ro);
    const total = ((ro * ro * g2) / 2) * sum;
    const sinPsi = (BC / rs) * Math.sqrt(1 - 2 / rs);
    const fEsc = (1 + Math.sqrt(1 - sinPsi * sinPsi)) / 2;
    expect(fEsc).toBeCloseTo(0.942718872, 9);
    // the reference's sum (images k ≤ 2) is 0.942718866; the images beyond carry the remaining 6e-9
    expect(Math.abs(total - 0.942718866)).toBeLessThan(2e-9);
  });

  it('gives the emitter its own gravitational shift', () => {
    const im = newImage();
    const { holeM, srcM } = scene(100, 5, 1);
    pointImageExact(100, holeM, srcM, 0, im);
    expect(Math.abs(im.lnG - (0.5 * Math.log(1 - 2 / 5) - 0.5 * Math.log(1 - 2 / 100)))).toBeLessThan(1e-15);
  });
});

describe('tier 1, the per-vertex lens', () => {
  it('matches the reference for sources at least ten times farther than the camera: 0.01 px, ln μ 1e-3', () => {
    const im = newImage();
    let worstPx = 0;
    let worstLnMu = 0;
    let n = 0;
    for (const c of fx.lens) {
      if (c.rs < 10 * c.ro) continue;
      const inv = tableAt(c.ro);
      const { holeM, srcM } = scene(c.ro, c.rs, c.Phi);
      for (const ref of c.images) {
        if (ref.k > 1) continue;
        pointImageTier1(inv, holeM, srcM, orderOf(ref.k, ref.side) as ImageOrder, im);
        expect(im.ok).toBe(true);
        expect(im.branch).toBe('outgoing');
        worstPx = Math.max(worstPx, Math.abs(im.alpha - ref.theta) * PX);
        worstLnMu = Math.max(worstLnMu, Math.abs(im.lnMu - Math.log(Math.abs(ref.mu))));
        n++;
      }
    }
    expect(n).toBeGreaterThan(40);
    expect(worstPx).toBeLessThan(0.01);
    expect(worstLnMu).toBeLessThan(1e-3);
  });

  it('draws every order-0 image near the flat foot, within 0.02 px of the exact one', () => {
    const im = newImage();
    let worst = 0;
    for (const row of fx.foot) {
      const inv = tableAt(row.ro);
      const { holeM, srcM } = scene(row.ro, row.rs, row.gamma);
      pointImageTier1(inv, holeM, srcM, 0, im);
      expect(im.ok).toBe(true);
      // in front of the foot (γ below acos(r_s/r_o)) the source is drawn straight
      if (row.offset < 0) expect(im.branch).toBe('unlensed');
      worst = Math.max(worst, Math.abs(im.alpha - row.theta) * PX);
    }
    expect(fx.foot.length).toBe(108);
    expect(worst).toBeLessThan(0.02);
  });

  it('meets the same tolerance with no pass, one pass, three passes and Newton (against tier 2)', () => {
    const im1 = newImage();
    const im2 = newImage();
    // r_o/r_s: 1e-7 (no pass at 1,484 px/rad), 1e-3 (one pass), 0.03 (three), 0.3 (Newton)
    for (const [ro, rs] of [
      [1e3, 1e10],
      [1e3, 1e6],
      [1e3, 1e3 / 0.03],
      [1e4, 1e4 / 0.3],
      [100, 400],
    ]) {
      const inv = tableAt(ro);
      for (const Phi of [0.3, 1.5, 2.8, Math.PI - 0.01]) {
        const { holeM, srcM } = scene(ro, rs, Phi);
        for (const order of [0, 1] as const) {
          pointImageTier1(inv, holeM, srcM, order, im1);
          pointImageExact(ro, holeM, srcM, order, im2);
          expect(im1.ok && im2.ok).toBe(true);
          expect(Math.abs(im1.alpha - im2.alpha) * PX).toBeLessThan(0.01);
          expect(Math.abs(im1.lnMu - im2.lnMu)).toBeLessThan(2e-3);
        }
      }
    }
  });

  it('finds, as the shader does, both images of a source close behind the hole seen from close by (r_o 20, r_s 30)', () => {
    // The shader accepts a Newton step under 1e-5 as converged; asking 1e-7 of its 4 steps, this twin once gave up
    // here and drew the source straight, 550–630 px from the images the shader drew.
    const im1 = newImage();
    const im2 = newImage();
    const inv = tableAt(20);
    let worst = 0;
    for (const Phi of [2.5, 2.9, 3.0, 3.1, 3.14]) {
      const { holeM, srcM } = scene(20, 30, Phi);
      for (const order of [0, 1] as const) {
        pointImageTier1(inv, holeM, srcM, order, im1);
        pointImageExact(20, holeM, srcM, order, im2);
        expect(im1.ok && im2.ok, `Φ ${Phi} order ${order}`).toBe(true);
        expect(im1.branch, `Φ ${Phi} order ${order}`).toBe('outgoing');
        worst = Math.max(worst, Math.abs(im1.alpha - im2.alpha) * PX);
      }
    }
    // Tier 1's parallax is approximate this close: 0.4 px at most (0.07–0.14 px behind the hole).
    expect(worst).toBeLessThan(0.45);
  });

  it('draws sources in front of the hole straight, within the measured 0.011 px at 3e4 M from 1e5 M', () => {
    const im1 = newImage();
    const im2 = newImage();
    const ro = 1e5;
    const rs = 3e4;
    const inv = tableAt(ro);
    let worst = 0;
    for (const Phi of [0.05, 0.3, 0.8, 1.2]) {
      const { holeM, srcM } = scene(ro, rs, Phi);
      pointImageTier1(inv, holeM, srcM, 0, im1);
      pointImageExact(ro, holeM, srcM, 0, im2);
      expect(im1.branch).toBe('unlensed');
      expect(im1.lnMu).toBe(0);
      worst = Math.max(worst, Math.abs(im1.alpha - im2.alpha) * PX);
    }
    expect(worst).toBeLessThan(0.012);
  });

  it('places sources at infinity on the static maps within 0.01 px and 0.005 in ln μ', () => {
    const im = newImage();
    let worstPx = 0;
    let worstMu = 0;
    for (const m of fx.static_map) {
      if (m.ro <= 3) continue;
      const inv = tableAt(m.ro);
      for (const row of m.rows) {
        if (row.captured || row.dphi === undefined || !(row.dphi > 1e-6) || !(row.dphi < 4 * Math.PI - 1e-6)) continue;
        if (Math.abs(Math.sin(row.dphi)) < 1e-9 || !row.mu_inf) continue;
        // a source at 1e14 M in the direction the backward ray escapes: order by the sweep, side by its half-turn
        const D = row.dphi;
        const turns = Math.floor(D / (2 * Math.PI));
        const within = D - 2 * Math.PI * turns;
        const side = within <= Math.PI ? 1 : -1;
        const gamma = side > 0 ? within : 2 * Math.PI - within;
        const order = (2 * turns + (side > 0 ? 0 : 1)) as ImageOrder;
        if (order > 3) continue;
        const { holeM, srcM } = scene(m.ro, 1e14, gamma);
        pointImageTier1(inv, holeM, srcM, order, im);
        expect(im.ok).toBe(true);
        worstPx = Math.max(worstPx, Math.abs(im.alpha - row.theta) * PX);
        worstMu = Math.max(worstMu, Math.abs(im.lnMu - Math.log(Math.abs(row.mu_inf))));
      }
    }
    expect(worstPx).toBeLessThan(0.01);
    expect(worstMu).toBeLessThan(0.005);
  });

  it('follows the forward caustic of order 1, and keeps ln(μB0) finite at exact alignment', () => {
    const im = newImage();
    for (const row of fx.forward_caustic) {
      const inv = tableAt(row.ro);
      const rs = row.rs === 'inf' ? 1e14 : row.rs;
      const { holeM, srcM } = scene(row.ro, rs, row.gamma);
      pointImageTier1(inv, holeM, srcM, 1, im);
      expect(im.ok).toBe(true);
      expect(Math.abs(im.alpha - row.theta) * PX).toBeLessThan(0.01);
      expect(Math.abs(im.lnMu - Math.log(Math.abs(row.mu)))).toBeLessThan(2e-3);
      expect(Math.abs(im.causticOffset - row.gamma) / row.gamma).toBeLessThan(1e-6);
    }
    // exact alignment behind the camera: z = 0; ln(zμ) stays finite as the offset goes to 0 and B0(z)/z → 2
    const inv = tableAt(20);
    const rStar = 1e-2; // M
    let last = NaN;
    for (const off of [1e-6, 1e-9, 1e-12]) {
      const { holeM, srcM } = scene(20, 1e8, off);
      pointImageTier1(inv, holeM, srcM, 1, im);
      const z = causticZ(im.causticOffset, 1e8, rStar);
      const lnZMu = Math.log(z) + im.lnMu;
      const lnMuB0 = lnZMu + Math.log(gouldB0OverZ(z));
      expect(Number.isFinite(lnMuB0)).toBe(true);
      if (!Number.isNaN(last)) expect(Math.abs(lnZMu - last)).toBeLessThan(1e-3);
      last = lnZMu;
    }
  });
});

describe('both tiers, on every frame', () => {
  it('allocate nothing (tier 1) or next to nothing (tier 2), and tier 2 takes some microseconds an image', { timeout: 60_000 }, () => {
    const im = newImage();
    const inv = tableAt(100);
    const cases = [scene(100, 1e6, 2.5), scene(100, 50, 1), scene(100, 400, 1.5), scene(100, 1e9, 0.3)];
    const tier1 = () => {
      for (let k = 0; k < cases.length; k++) for (let o = 0; o < 4; o++) pointImageTier1(inv, cases[k].holeM, cases[k].srcM, o as ImageOrder, im);
    };
    const tier2 = () => {
      for (let k = 0; k < cases.length; k++) for (let o = 0; o < 2; o++) pointImageExact(100, cases[k].holeM, cases[k].srcM, o as ImageOrder, im);
    };
    // 16 tier-1 images and 8 tier-2 images a call. Tier 1 fills nothing; tier 2 at most a few boxed numbers an
    // image (about 100 bytes: V8 boxes a double at a call it does not inline), where the allocating reference
    // solver fills tens of kilobytes (some hundreds of calls to the sweeps an image, each returning objects)
    const b1 = bytesPer(tier1);
    const b2 = bytesPer(tier2);
    console.info(`[lens points] young-generation bytes: tier 1 ${b1} for 16 images, tier 2 ${b2} for 8`);
    expect(b1).toBeLessThan(256);
    expect(b2).toBeLessThan(2048);
    const us = fastest(tier2, 200) * 1000 / 8;
    console.info(`[lens points] tier 2: ${us.toFixed(1)} µs an image`);
    expect(us).toBeLessThan(60);
  });

  it('works in the raindrop frame inside the horizon, with its frequency factor', () => {
    const im = newImage();
    const inv = buildInverseTable(buildForwardTable({ frame: 'rain', r: 1 }));
    const { holeM, srcM } = scene(1, 1e9, 2.0);
    pointImageTier1(inv, holeM, srcM, 0, im);
    expect(im.ok).toBe(true);
    expect(im.branch).toBe('outgoing');
    const v = Math.sqrt(2);
    expect(Math.abs(im.lnG + Math.log(1 - v * Math.cos(im.alpha)))).toBeLessThan(1e-12);
    // the sky crowds into the upper hemisphere: the image lies beyond the dark region's edge
    expect(im.alpha).toBeGreaterThan(inv.fwd.edge);
  });
});

describe('the parallax of a finite source', () => {
  it('Λ of flat space is within 4M/r_s of the exact Λ', () => {
    for (const rs of [30, 1e3, 1e5]) {
      for (const share of [0.1, 0.5, 0.9]) {
        const b = share * rs;
        if (b <= BC * 1.01) continue;
        expect(Math.abs(lambdaFlat(b, 1 / rs) - lambdaExact(b, 1 / rs))).toBeLessThan(4 / rs);
      }
    }
    expect(lambdaFlat(0.5, 1)).toBeCloseTo(Math.PI / 6, 15);
  });
});

describe('the finite-source factor and the stars’ sizes', () => {
  it("has Gould's B0 values", () => {
    expect(gouldB0(0.5)).toBeCloseTo(0.9342, 4);
    expect(gouldB0(0.9)).toBeCloseTo(1.3427, 4);
    expect(Math.abs(gouldB0(1) - 4 / Math.PI)).toBeLessThan(1e-14);
    expect(gouldB0(2)).toBeCloseTo(1.0346, 4);
    expect(gouldB0(10)).toBeCloseTo(1.0013, 4);
    // the peak is near z = 0.9
    expect(gouldB0(0.9)).toBeGreaterThan(gouldB0(0.85));
    expect(gouldB0(0.9)).toBeGreaterThan(gouldB0(0.95));
  });

  it('keeps B0(z)/z finite and continuous: 2 at z = 0, no jump at z = 1', () => {
    expect(Math.abs(gouldB0OverZ(0) - 2)).toBeLessThan(1e-15);
    expect(Math.abs(gouldB0OverZ(1e-9) - 2)).toBeLessThan(1e-12);
    expect(Math.abs(gouldB0OverZ(1 - 1e-12) - gouldB0OverZ(1 + 1e-12))).toBeLessThan(1e-6);
    const t = fillB0OverZ(new Float32Array(B0Z_TEXELS));
    expect(t[1]).toBeCloseTo(2, 6);
    expect(t[0]).toBe(t[2]);
    expect(t[B0Z_TEXELS - 1]).toBeCloseTo(gouldB0OverZ(8), 6);
  });

  it('measures z at a caustic as β/ρ does in flat space', () => {
    // a far hole (weak field): source 3e4 M beyond the hole at an offset η from the axis seen from the hole; the
    // observer 1e8 M in front. β seen from the observer ≈ η r_s/(r_o + r_s), ρ = R★/(r_o + r_s)
    const ro = 1e8;
    const rs = 3e4;
    const R = 0.02;
    const eta = 1e-7;
    const beta = (eta * rs) / (ro + rs);
    const rho = R / (ro + rs);
    expect(Math.abs(causticZ(eta, rs, R) / (beta / rho) - 1)).toBeLessThan(1e-12);
    expect(causticZ(eta, rs, 0)).toBe(Infinity);
  });

  it('gives the Sun its own radius from its absolute magnitude and temperature', () => {
    expect(Math.abs(starRadiusRsun(4.83, 5772) - 1)).toBeLessThan(0.003);
    // a star 5 magnitudes brighter at the same temperature is 10 times larger
    expect(starRadiusRsun(-0.17, 5772) / starRadiusRsun(4.83, 5772)).toBeCloseTo(10, 10);
    // the Sun from 1 pc: 695,700 km / 1 pc
    expect(starAngularRadiusRad(4.83, 5772, 1) / (695_700 / 3.0856775814913673e13)).toBeCloseTo(1, 2);
  });
});

/** Nodes and weights of n-point Gauss–Legendre quadrature on [−1, 1] (Newton on P_n). */
function gaussLegendre(n: number): [number[], number[]] {
  const xs: number[] = [];
  const ws: number[] = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    xs.push(x);
    ws.push(2 / ((1 - x * x) * dp * dp));
  }
  return [xs, ws];
}

/** The fastest of batches of `n` calls, ms per call, in this thread's processor time. */
function fastest(fn: () => void, n: number): number {
  let best = Infinity;
  for (let b = 0; b < 6; b++) {
    const t0 = cpuMs();
    for (let k = 0; k < n; k++) fn();
    best = Math.min(best, (cpuMs() - t0) / n);
  }
  return best;
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
