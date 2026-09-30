/**
 * The lens chunk's float32 arithmetic (render/shaders/lens.glsl through its line-for-line mirror
 * physics/lensMirror32.ts, with this GPU's fused multiply-adds and its measured sin, log and exp errors) against the
 * float64 truth: the tables' own float64 evaluation (physics/schwarzschildTables.ts forwardEvalGap), the tier-1
 * point images (physics/lensPoint.ts pointImageTier1), and the committed fixtures of the independent mpmath
 * reference (__fixtures__/schwarzschild.json: the static and raindrop maps, the camera maps' pixels, the `foot` rows).
 *
 * The measure is the equivalent look angle: a direction error ε on the sky of light from far
 * away is the error ε/|dΔφ/dα| in where the pixel looks, in device px at 1,484 px per radian (the 50° view on a
 * 1,384-px-tall canvas). Targets: ≤ 0.005 px against float64 and the fixtures, ln μ within 0.002;
 * with the GPU's built-in atan swapped in for lensAtan the error must rise to the order of the 0.017 px measured on
 * the laptop (the mirror sees the trap the chunk avoids); no NaN or ∞ anywhere in range; uLensOn = 0 returns the
 * inputs bit for bit.
 */
import { describe, expect, it } from 'vitest';
import { readJson } from '../test/files';
import { LensMirror32, ROUNDING_ONLY, thisGpu, type GpuErrorModel, type Mirror32Uniforms, type V3 } from './lensMirror32';
import type { LensObserver } from './schwarzschild';
import { buildForwardTable, buildInverseTable, buildMuBound, forwardEvalGap, MU_BOUND_NODES, type ForwardSample, type ForwardTable, type InverseTable } from './schwarzschildTables';
import { B0Z_TEXELS, fillB0OverZ, pointImageTier1, type PointImage } from './lensPoint';
import { fillForwardTexels, fillInverseTexels, INV_TEXELS } from '../render/lens/lensTextures';
import { lensTableValues, type LensTableValues } from '../render/lens/lensState';

/** Device px per radian of the accuracy targets. */
const PX = 1484;
const f = Math.fround;

interface Tables {
  fwd: ForwardTable;
  inv: InverseTable;
}
const tableCache = new Map<string, Tables>();
function tables(obs: LensObserver): Tables {
  const key = `${obs.frame}:${obs.r}`;
  let t = tableCache.get(key);
  if (!t) {
    const fwd = buildForwardTable(obs);
    const inv = buildInverseTable(fwd);
    t = { fwd, inv };
    tableCache.set(key, t);
  }
  return t;
}

const v3 = (x: number, y: number, z: number): V3 => ({ x: f(x), y: f(y), z: f(z) });

/**
 * A mirror for an observer at r (units of M) on the +z axis looking at a hole at the origin: axis (0, 0, −1),
 * camera → hole (0, 0, −r); the uniforms as updateLens writes them (render/lens/lensState.ts lensTableValues),
 * rounded to float32 as uploaded.
 */
function mirror(obs: LensObserver, model: GpuErrorModel, over: Partial<Mirror32Uniforms> = {}): LensMirror32 {
  const { fwd, inv } = tables(obs);
  const tv: LensTableValues = { ro: 0, edge: 0, span: 0, frame: 0, lnG: 0, rainV: 0, rainOneMinusV: 1, fwd: [0, 1, 2, 3], inv: [0, 1, 2, 1], invRel: [0, 1, 2, 0], muAxis: [0, 1] };
  lensTableValues(fwd, inv, tv);
  const muBound = new Float32Array(MU_BOUND_NODES);
  buildMuBound(inv, muBound);
  const u: Mirror32Uniforms = {
    on: 1,
    hole: v3(0, 0, -obs.r),
    axis: v3(0, 0, -1),
    ro: f(tv.ro),
    edge: f(tv.edge),
    span: f(tv.span),
    frame: tv.frame,
    lnG: f(tv.lnG),
    rain: [f(tv.rainV), f(tv.rainOneMinusV)],
    fwd: tv.fwd.map(f) as Mirror32Uniforms['fwd'],
    inv: tv.inv.map(f) as Mirror32Uniforms['inv'],
    invRel: tv.invRel.map(f) as Mirror32Uniforms['invRel'],
    ptCos: -1,
    muBound,
    muAxis: [f(tv.muAxis[0]), f(tv.muAxis[1])],
    scale: [1, 1, 1, 1],
    pxPerRad: f(PX),
    framePhi: 0,
    frameEPhi: 1,
    frameEmPhi: 1,
    frameVelDir: v3(0, 0, -1),
    ...over,
  };
  return new LensMirror32(model, u, {
    fwd: fillForwardTexels(fwd, new Float32Array(fwd.n + 2)),
    inv: fillInverseTexels(inv, new Float32Array(4 * INV_TEXELS)),
    invWidth: INV_TEXELS,
    b0z: fillB0OverZ(new Float32Array(B0Z_TEXELS)),
  });
}

/** The angle between two unit vectors (float64, from chords). */
function angle(a: V3, b: V3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const sx = a.x + b.x;
  const sy = a.y + b.y;
  const sz = a.z + b.z;
  return 2 * Math.atan2(Math.hypot(dx, dy, dz), Math.hypot(sx, sy, sz));
}
function unit(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** A look direction at angle alpha from the hole (axis −z), in the x–z plane, as the GPU holds it (float32). */
function lookAt(alpha: number): V3 {
  return v3(Math.sin(alpha), 0, -Math.cos(alpha));
}

/** Where light seen in d came from, in float64: d turned towards the axis by δ (exactly as the chunk, in float64). */
function escape64(d: V3, delta: number): V3 {
  const ax = { x: 0, y: 0, z: -1 };
  const c = d.x * ax.x + d.y * ax.y + d.z * ax.z;
  const t = { x: ax.x - c * d.x, y: ax.y - c * d.y, z: ax.z - c * d.z };
  const tl = Math.hypot(t.x, t.y, t.z);
  if (tl < 1e-300) return d;
  return unit({ x: d.x * Math.cos(delta) + (t.x / tl) * Math.sin(delta), y: d.y * Math.cos(delta) + (t.y / tl) * Math.sin(delta), z: d.z * Math.cos(delta) + (t.z / tl) * Math.sin(delta) });
}

const fs: ForwardSample = { captured: false, delta: 0, dDelta: 0, sweep: 0, dSweep: 0 };

/**
 * The worst equivalent look-angle error (device px) of the mirror's lensRay against the float64 table, over
 * log-spaced gaps from 1e-9 of the edge (or the span) to straight out.
 */
function worstRayError(obs: LensObserver, model: GpuErrorModel, samples = 1500): { px: number; at: number } {
  const m = mirror(obs, model);
  const { fwd } = tables(obs);
  let worst = 0;
  let at = 0;
  const lo = Math.log(1e-9 * Math.max(fwd.edge, 1e-3));
  const hi = Math.log(fwd.span);
  for (let k = 0; k < samples; k++) {
    const g0 = Math.exp(lo + ((hi - lo) * k) / (samples - 1));
    const d = lookAt(Math.min(fwd.edge + g0, Math.PI));
    const r = m.lensRay(d);
    // the float64 truth at the float32 direction the GPU holds
    const a64 = angle(d, { x: 0, y: 0, z: -1 });
    const g = a64 - fwd.edge;
    if (!(g > 0)) continue;
    if (!r.ok) {
      // captured by rounding: only within float32 of the edge (the built-in atan misplaces the edge by more)
      if (!model.builtinAtan) expect(g).toBeLessThan(4e-7 * Math.max(1, fwd.edge));
      continue;
    }
    forwardEvalGap(fwd, g, fs);
    const n64 = escape64(d, fs.delta);
    const err = (angle(r.nInf, n64) / Math.abs(fs.dSweep)) * PX;
    if (err > worst) {
      worst = err;
      at = a64;
    }
  }
  return { px: worst, at };
}

const STATIC_R = [2.000002, 2.02, 2.2, 2.5, 3, 3.5, 6, 10, 20, 100, 1e3, 1e4, 1e5, 1e6, 1e8];
const RAIN_R = [3, 2.5, 2, 1.5, 1, 0.5, 0.1, 0.02];

describe('lensRay in float32 on this GPU', () => {
  it('stays within 0.005 px of the float64 table for static observers from the hover floor to 10⁸ M', () => {
    for (const sign of [1, -1] as const) {
      for (const r of STATIC_R) {
        const e = worstRayError({ frame: 'static', r }, thisGpu(sign));
        expect(e.px, `static r = ${r}, sign ${sign}, at α = ${e.at}`).toBeLessThan(0.005);
      }
    }
  });

  it('and for the raindrop, inside the horizon too', () => {
    for (const sign of [1, -1] as const) {
      for (const r of RAIN_R) {
        const e = worstRayError({ frame: 'rain', r }, thisGpu(sign));
        expect(e.px, `rain r = ${r}, sign ${sign}, at α = ${e.at}`).toBeLessThan(0.005);
      }
    }
  });

  it('with the built-in atan instead of lensAtan the error rises to the order measured on the laptop (the mirror sees the trap)', () => {
    let worst = 0;
    for (const r of [10, 100, 1e3, 1e4, 1e5]) worst = Math.max(worst, worstRayError({ frame: 'static', r }, thisGpu(1, true)).px);
    expect(worst).toBeGreaterThan(0.008);
  });
});

// ─── Against the fixtures ─────────────────────────────────────────────────────────────────────────

interface MapRow {
  theta: number;
  captured: boolean;
  dphi?: number;
  ddphi_dtheta?: number;
  ln_g?: number;
  ln_f?: number;
}
interface CameraPixel {
  i: number;
  j: number;
  captured: boolean;
  dphi: number | null;
  ln_g: number;
  n_inf: [number, number, number] | null;
  theta: number;
}
interface CameraMap {
  name: string;
  frame: 'static' | 'raindrop';
  pos: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
  fovy: number;
  phi: number;
  vdir: [number, number, number] | null;
  W: number;
  H: number;
  pixels: CameraPixel[];
}
interface FootRow {
  ro: number;
  rs: number;
  gamma: number;
  theta: number;
  mu: number;
  ddphi_dtheta: number;
}
interface Fx {
  static_map: { ro: number; theta_sh: number; rows: MapRow[] }[];
  raindrop_map: { r: number; dark_radius: number; rows: MapRow[] }[];
  camera_maps: CameraMap[];
  foot: FootRow[];
}
const fx = readJson<Fx>('src/physics/__fixtures__/schwarzschild.json');

/** The exact escape direction of a map row (look angle θ in the x–z plane, axis −z): d turned by δ = Δφ − (π − θ). */
function exactEscape(theta: number, dphi: number): V3 {
  const d = { x: Math.sin(theta), y: 0, z: -Math.cos(theta) };
  return escape64(d, dphi - (Math.PI - theta));
}

describe('the mirror against the mpmath reference', () => {
  it("static maps: every captured flag, and escape directions within 0.005 px of equivalent look angle", () => {
    for (const map of fx.static_map) {
      const m = mirror({ frame: 'static', r: map.ro }, thisGpu(1));
      for (const row of map.rows) {
        const r = m.lensRay(lookAt(row.theta));
        const nearEdge = Math.abs(row.theta - map.theta_sh) < 1e-6 * Math.max(1, map.theta_sh);
        if (!nearEdge) expect(r.ok, `r = ${map.ro}, θ = ${row.theta}`).toBe(!row.captured);
        if (row.captured || !r.ok || row.dphi === undefined || row.ddphi_dtheta === undefined) continue;
        const err = (angle(r.nInf, exactEscape(row.theta, row.dphi)) / Math.abs(row.ddphi_dtheta)) * PX;
        expect(err, `r = ${map.ro}, θ = ${row.theta}`).toBeLessThan(0.005);
        expect(Math.abs(r.lnG - (row.ln_g as number))).toBeLessThan(1e-5);
      }
    }
  });

  it('raindrop maps: captured flags away from the edge, directions and ln g', () => {
    for (const map of fx.raindrop_map) {
      const m = mirror({ frame: 'rain', r: map.r }, thisGpu(-1));
      for (const row of map.rows) {
        const r = m.lensRay(lookAt(row.theta));
        const nearEdge = Math.abs(row.theta - map.dark_radius) < 1e-6;
        if (!nearEdge) expect(r.ok, `r = ${map.r}, θ = ${row.theta}`).toBe(!row.captured);
        // (no ln g where no photon from outside arrives, E ≤ 0: the fixture holds null there)
        // (and none checked where 1 − v cos θ is within float32 of 0, at the edge of that region)
        if (typeof row.ln_f === 'number' && Math.abs(row.ln_f) < 10) expect(Math.abs(r.lnG - row.ln_f), `ln g at r = ${map.r}, θ = ${row.theta}`).toBeLessThan(1e-5);
        if (row.captured || !r.ok || row.dphi === undefined || row.ddphi_dtheta === undefined) continue;
        const err = (angle(r.nInf, exactEscape(row.theta, row.dphi)) / Math.abs(row.ddphi_dtheta)) * PX;
        expect(err, `r = ${map.r}, θ = ${row.theta}`).toBeLessThan(0.005);
      }
    }
  });

  it("the camera maps' pixels through the whole per-pixel chain (the ship's aberration, then the lens)", () => {
    for (const cam of fx.camera_maps) {
      const rain = cam.frame === 'raindrop';
      const r0 = Math.hypot(...cam.pos);
      const rhat = { x: cam.pos[0] / r0, y: cam.pos[1] / r0, z: cam.pos[2] / r0 };
      const m = mirror({ frame: rain ? 'rain' : 'static', r: r0 }, thisGpu(1), { axis: v3(-rhat.x, -rhat.y, -rhat.z), hole: v3(-cam.pos[0], -cam.pos[1], -cam.pos[2]) });
      // the pinhole camera of scripts/schwarzschild/observers.py camera_dirs
      const fw = unit({ x: cam.forward[0], y: cam.forward[1], z: cam.forward[2] });
      const up = { x: cam.up[0], y: cam.up[1], z: cam.up[2] };
      const rgt = unit({ x: fw.y * up.z - fw.z * up.y, y: fw.z * up.x - fw.x * up.z, z: fw.x * up.y - fw.y * up.x });
      const upv = { x: rgt.y * fw.z - rgt.z * fw.y, y: rgt.z * fw.x - rgt.x * fw.z, z: rgt.x * fw.y - rgt.y * fw.x };
      const t = Math.tan((cam.fovy * Math.PI) / 360);
      const asp = cam.W / cam.H;
      for (const p of cam.pixels) {
        const x = ((2 * (p.i + 0.5)) / cam.W - 1) * asp * t;
        const y = (1 - (2 * (p.j + 0.5)) / cam.H) * t;
        const d = unit({ x: fw.x + rgt.x * x + upv.x * y, y: fw.y + rgt.y * x + upv.y * y, z: fw.z + rgt.z * x + upv.z * y });
        let dRest = v3(d.x, d.y, d.z);
        let lnD = 0;
        if (cam.phi > 0 && cam.vdir) {
          const u = m.relUnaberrateLens(dRest, v3(...cam.vdir), f(Math.exp(cam.phi)), f(Math.exp(-cam.phi)));
          dRest = u.dir;
          lnD = u.lnD;
        }
        const r = m.lensRay(dRest);
        if (typeof p.ln_g === 'number') expect(Math.abs(lnD + r.lnG - p.ln_g), `${cam.name} (${p.i}, ${p.j}) ln g`).toBeLessThan(1e-5);
        const edgeTheta = rain ? fx.raindrop_map.find((mm) => mm.r === r0)?.dark_radius : undefined;
        if (edgeTheta !== undefined && Math.abs(p.theta - edgeTheta) < 1e-6) continue;
        expect(r.ok, `${cam.name} (${p.i}, ${p.j}) captured`).toBe(!p.captured);
        if (p.captured || !p.n_inf || p.dphi === null) continue;
        // equivalent look angle: the direction error over |dΔφ/dα| there (from the float64 table)
        const { fwd } = tables({ frame: rain ? 'rain' : 'static', r: r0 });
        forwardEvalGap(fwd, p.theta - fwd.edge, fs);
        const err = (angle(r.nInf, { x: p.n_inf[0], y: p.n_inf[1], z: p.n_inf[2] }) / Math.abs(fs.dSweep)) * PX;
        expect(err, `${cam.name} (${p.i}, ${p.j})`).toBeLessThan(0.006);
      }
    }
  });
});

// ─── Point images, tier 1 ─────────────────────────────────────────────────────────────────────────

const pi64: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };

/** The mirror's tier-1 image against pointImageTier1 for a source at rs, angle phi at the hole from the camera's side. */
function imageError(ro: number, rs: number, phi: number, order: 0 | 1 | 2 | 3, model: GpuErrorModel): { px: number; lnMu: number; ok32: boolean; ok64: boolean; straight: boolean } {
  const obs: LensObserver = { frame: 'static', r: ro };
  const { inv } = tables(obs);
  const m = mirror(obs, model);
  // hole at the origin, camera at (0, 0, ro), source at rs (sin φ, 0, cos φ)
  const holeM = { x: 0, y: 0, z: -ro };
  const srcM = { x: rs * Math.sin(phi), y: 0, z: rs * Math.cos(phi) - ro };
  pointImageTier1(inv, holeM, srcM, order, pi64, PX);
  const r = m.lensImage(v3(srcM.x, srcM.y, srcM.z), order, 0);
  const ok64 = pi64.ok;
  if (!r.ok || !ok64) return { px: 0, lnMu: 0, ok32: r.ok, ok64, straight: r.branch === 'straight' };
  return { px: angle(unit(r.dir), pi64.dir) * PX, lnMu: Math.abs(r.lnMuB0 - pi64.lnMu), ok32: r.ok, ok64, straight: r.branch === 'straight' };
}

describe('lensImage (tier 1) in float32 on this GPU', () => {
  it('sources far from the hole (the catalogue stars): within 0.005 px and 0.002 in ln μ of the float64 tier 1', () => {
    for (const ro of [6, 20, 100, 1e3, 1e4, 1e5]) {
      for (const rsShare of [30, 1e3, 1e6]) {
        const rs = ro * rsShare;
        for (const phi of [0.3, 1, 2, 3, Math.PI - 0.05, Math.PI - 3e-3]) {
          for (const order of [0, 1] as const) {
            const e = imageError(ro, rs, phi, order, thisGpu(1));
            expect(e.ok32, `ro ${ro} rs ${rs} φ ${phi} order ${order}`).toBe(e.ok64);
            expect(e.px, `ro ${ro} rs ${rs} φ ${phi} order ${order}`).toBeLessThan(0.005);
            expect(e.lnMu, `ro ${ro} rs ${rs} φ ${phi} order ${order}`).toBeLessThan(0.002);
          }
        }
      }
    }
  });

  it('near the flat foot (the `foot` fixtures): every order-0 image drawn, within 0.02 px of the exact image', () => {
    for (const row of fx.foot) {
      const obs: LensObserver = { frame: 'static', r: row.ro };
      const m = mirror(obs, thisGpu(-1));
      const holeM = { x: 0, y: 0, z: -row.ro };
      const srcM = v3(row.rs * Math.sin(row.gamma), 0, row.rs * Math.cos(row.gamma) - row.ro);
      const r = m.lensImage(srcM, 0, 0);
      expect(r.ok).toBe(true);
      const exact = { x: Math.sin(row.theta), y: 0, z: -Math.cos(row.theta) };
      const err = angle(unit(r.dir), exact) * PX;
      expect(err, `ro ${row.ro} rs ${row.rs} γ ${row.gamma}`).toBeLessThan(0.02);
      void holeM;
    }
  });

  it('keeps ln(μB0) finite at exact alignment and under the finite-source cap', () => {
    const ro = 1e4;
    const obs: LensObserver = { frame: 'static', r: ro };
    const m = mirror(obs, thisGpu(1));
    const rs = 1e9;
    const srcM = v3(0, 0, -ro - rs);
    for (const order of [0, 1] as const) {
      const r = m.lensImage(srcM, order, 100);
      expect(r.ok).toBe(true);
      expect(Number.isFinite(r.lnMuB0)).toBe(true);
    }
  });
});

// ─── Range, and the identity ─────────────────────────────────────────────────────────────────────

describe('the mirror everywhere in range', () => {
  it('gives no NaN or ∞ from the hover floor to 10⁹ M, from 1e-9 of the edge to straight out, D in (0, 4π)', () => {
    for (const frame of ['static', 'rain'] as const) {
      for (const r of frame === 'static' ? [2.000002, 2.5, 6, 1e3, 1e6, 1e9] : [2.9, 1, 0.01]) {
        const m = mirror({ frame, r }, thisGpu(1));
        const { fwd } = tables({ frame, r });
        for (let k = 0; k <= 200; k++) {
          const g = Math.exp(Math.log(1e-9 * fwd.span) + ((Math.log(fwd.span) - Math.log(1e-9 * fwd.span)) * k) / 200);
          const ray = m.lensRay(lookAt(Math.min(Math.PI, fwd.edge + g)));
          if (!ray.ok) continue;
          for (const x of [ray.nInf.x, ray.nInf.y, ray.nInf.z, ray.jac[0], ray.jac[1], ray.lnG]) expect(Number.isFinite(x)).toBe(true);
        }
        for (let k = 1; k < 400; k++) {
          const D = (4 * Math.PI * k) / 400;
          const inv = m.lensInverse(D);
          expect(Number.isFinite(inv.alpha) && Number.isFinite(inv.m), `${frame} r ${r} D ${D}`).toBe(true);
        }
      }
    }
  });

  it('boosts stay finite and exact in their limits from φ = 0 to 40', () => {
    const m = mirror({ frame: 'static', r: 100 }, thisGpu(1));
    const vd = v3(0.6, 0, -0.8);
    for (const phi of [0, 1e-6, 1e-3, 1, 10, 40]) {
      for (let k = 0; k <= 64; k++) {
        const t = (Math.PI * k) / 64;
        const d = v3(Math.sin(t), 0, Math.cos(t));
        const b = m.lensBoost(d, vd, f(Math.exp(phi)), f(Math.exp(-phi)));
        const u = m.lensUnboost(b.dir, vd, f(Math.exp(phi)), f(Math.exp(-phi)));
        for (const x of [b.dir.x, b.dir.y, b.dir.z, b.lnD, u.dir.x, u.lnD]) expect(Number.isFinite(x)).toBe(true);
        if (phi <= 1) {
          // boost and back: the same direction, and the same light's ln D
          expect(angle(unit(u.dir), d)).toBeLessThan(2e-6);
          expect(Math.abs(b.lnD - u.lnD)).toBeLessThan(1e-5);
        }
      }
    }
  });

  it('returns its inputs bit for bit with uLensOn = 0', () => {
    const m = mirror({ frame: 'static', r: 10 }, thisGpu(1), { on: 0 });
    const d = v3(0.3, -0.2, -Math.sqrt(1 - 0.13));
    const r = m.lensRay(d);
    expect(r.ok).toBe(true);
    expect(r.nInf).toBe(d);
    expect(r.lnG).toBe(0);
    const img = m.lensImage(v3(3, 4, -12), 0, 1);
    expect(img.ok).toBe(true);
    expect(img.lnMuB0).toBe(0);
    expect(img.lnG).toBe(0);
    expect(m.lensImage(v3(3, 4, -12), 1, 1).ok).toBe(false);
    expect(m.frameAberrate(d).dir).toBe(d);
    expect(m.frameUnaberrate(d).dir).toBe(d);
    expect(m.lensMuBound(0.1)).toBe(0);
  });

  it('a correctly rounded mirror (no FMA, no injected errors) agrees too: the budget is not spent on rounding alone', () => {
    for (const r of [3, 100, 1e5]) expect(worstRayError({ frame: 'static', r }, ROUNDING_ONLY, 600).px).toBeLessThan(0.004);
  });
});
