/**
 * The lens chunk (render/shaders/lens.glsl, `lightspeed_lens`) line for line in float32, with the target GPU's
 * own arithmetic, for the accuracy tests (lensMirror32.test.ts). Never used by the app.
 *
 * What: every function of the chunk that places light (lensAtan, lensAngle, lensSin, lensCosM1, lensAsin, lensAsinh,
 * lensTurnHalfAngle, lensBoost, lensUnboost, frameAberrate, frameUnaberrate, relUnaberrateLens, lensDelta, lensGap,
 * lensSinCosOfGap, lensLnGAt, lensRay, lensInvGap, lensInverse, lensB0OverZ, lensParallax, lensImpact, lensResidual,
 * lensImage, lensMuBound, lensStarRadiusM), each operation rounded to float32 as the GPU rounds it, reading the same
 * tables (render/lens/lensTextures.ts fills both) and the same uniform values (float32, as uploaded).
 *
 * How: the pattern of physics/rapidity.test.ts (Math.fround after every operation), extended because a mirror that
 * assumes correctly rounded transcendentals overstates this GPU's accuracy about a thousandfold:
 * a·b + c is rounded once when the model fuses (FXC does); sin and cos carry an injected absolute error (±1.2e-7),
 * log an absolute error (±1.7e-6), exp a relative one (±32 ulp); sqrt, inversesqrt and division are correctly
 * rounded; and the built-in atan, which the chunk never calls, can be swapped in for lensAtan (the
 * Abramowitz–Stegun 4.4.49 polynomial measured in Chrome on the target laptop: atan(1e-3, 1)·1e3 = 0.999866) to
 * show that the tests see the trap. Errors are injected with a fixed sign per model, so a test runs both signs.
 *
 * Why: nothing in Node compiles GLSL, and the GPU's own checks (dev/lensTest.ts cameraMap) need a browser; this
 * catches a precision mistake in the chunk at every commit.
 *
 * Cost: tests only (about 1 µs a call).
 *
 * Twins: render/shaders/lens.glsl (every function here names its GLSL original); the float64 truth is
 * physics/schwarzschildTables.ts and physics/lensPoint.ts.
 */

/** How this GPU computes: which operations it fuses, and the errors of its sin, cos, log and exp. */
export interface GpuErrorModel {
  /** a·b + c rounded once (FXC fuses). */
  fma: boolean;
  /** Absolute error added to every sin and cos. */
  sinAbs: number;
  /** Absolute error added to every log. */
  logAbs: number;
  /**
   * Relative error of exp, in float32 ulps (2⁻²³) at |x| = 80: the GPU's exp is exp2(x·log₂e), whose product's own
   * rounding grows with |x|, so the error is modelled as (2 + 0.4|x|)/34 of this (34 ulp at |x| = 80, as measured).
   */
  expUlp: number;
  /** Replace lensAtan by the built-in atan (the trap the chunk avoids). */
  builtinAtan: boolean;
}

/** Correctly rounded float32 throughout: what a mirror without this GPU's errors would assume. */
export const ROUNDING_ONLY: GpuErrorModel = { fma: false, sinAbs: 0, logAbs: 0, expUlp: 0, builtinAtan: false };

/** The target laptop's GPU (Chrome, ANGLE D3D11, FXC), with the errors' sign chosen by `sign`. */
export function thisGpu(sign: 1 | -1 = 1, builtinAtan = false): GpuErrorModel {
  return { fma: true, sinAbs: 1.2e-7 * sign, logAbs: 1.7e-6 * sign, expUlp: 32 * sign, builtinAtan };
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** The chunk's uniforms, as float32 values (vectors as V3, vec2 and vec4 as arrays). */
export interface Mirror32Uniforms {
  on: number;
  hole: V3;
  axis: V3;
  ro: number;
  edge: number;
  span: number;
  frame: number;
  lnG: number;
  /** (v, 1 − v). */
  rain: [number, number];
  /** (s0, 1/Δs, n, κ). */
  fwd: [number, number, number, number];
  /** (z0, 1/Δz, n, 2θ_E). */
  inv: [number, number, number, number];
  /** (2π, 1/ΔD, n1, 0). */
  invRel: [number, number, number, number];
  ptCos: number;
  muBound: Float32Array;
  muAxis: [number, number];
  scale: [number, number, number, number];
  pxPerRad: number;
  framePhi: number;
  frameEPhi: number;
  frameEmPhi: number;
  frameVelDir: V3;
}

/** The chunk's textures as float32 arrays (render/lens/lensTextures.ts layouts). */
export interface Mirror32Tables {
  /** R: δ at nodes −1 … n. */
  fwd: Float32Array;
  /** RG, two rows of `invWidth` texels. */
  inv: Float32Array;
  invWidth: number;
  /** R: B0(z)/z, texel i + 1 at z = i/16. */
  b0z: Float32Array;
}

const f = Math.fround;

const bitBuf = new DataView(new ArrayBuffer(4));
/** GLSL floatBitsToInt. */
function floatBits(x: number): number {
  bitBuf.setFloat32(0, x);
  return bitBuf.getInt32(0);
}
/** GLSL intBitsToFloat. */
function bitsFloat(b: number): number {
  bitBuf.setInt32(0, b);
  return bitBuf.getFloat32(0);
}

/** The GLSL's constants as the GPU holds them. */
const PI = f(3.14159265359);
const TWO_PI = f(6.28318530718);
const HALF_PI = f(1.5707963268);
const ORBIT_MIN_B = 30;
const SUN_RADIUS_KM = 695700;

/**
 * One mirror: a model, uniforms and tables. Its methods are the chunk's functions; out-parameters come back as
 * fields of the returned objects.
 */
export class LensMirror32 {
  constructor(
    readonly model: GpuErrorModel,
    readonly u: Mirror32Uniforms,
    readonly t: Mirror32Tables,
  ) {}

  // ─── float32 arithmetic of this GPU ─────────────────────────────────────────────────────────

  add(a: number, b: number): number {
    return f(a + b);
  }
  sub(a: number, b: number): number {
    return f(a - b);
  }
  mul(a: number, b: number): number {
    return f(a * b);
  }
  div(a: number, b: number): number {
    return f(a / b);
  }
  /** a·b + c: once rounded when the model fuses. */
  mad(a: number, b: number, c: number): number {
    return this.model.fma ? f(a * b + c) : f(f(a * b) + c);
  }
  sqrt(a: number): number {
    return f(Math.sqrt(a));
  }
  sin(a: number): number {
    return f(Math.sin(a) + this.model.sinAbs);
  }
  cos(a: number): number {
    return f(Math.cos(a) + this.model.sinAbs);
  }
  log(a: number): number {
    return f(Math.log(a) + this.model.logAbs);
  }
  exp(a: number): number {
    return f(Math.exp(a) * (1 + ((this.model.expUlp * (2 + 0.4 * Math.abs(a))) / 34) * 2 ** -23));
  }
  cosh(a: number): number {
    return this.mul(this.add(this.exp(a), this.exp(-a)), 0.5);
  }
  dot(a: V3, b: V3): number {
    return this.mad(a.z, b.z, this.mad(a.y, b.y, this.mul(a.x, b.x)));
  }
  length(a: V3): number {
    return this.sqrt(this.dot(a, a));
  }
  v(x: number, y: number, z: number): V3 {
    return { x: f(x), y: f(y), z: f(z) };
  }
  vadd(a: V3, b: V3): V3 {
    return { x: this.add(a.x, b.x), y: this.add(a.y, b.y), z: this.add(a.z, b.z) };
  }
  vsub(a: V3, b: V3): V3 {
    return { x: this.sub(a.x, b.x), y: this.sub(a.y, b.y), z: this.sub(a.z, b.z) };
  }
  vscale(a: V3, s: number): V3 {
    return { x: this.mul(a.x, s), y: this.mul(a.y, s), z: this.mul(a.z, s) };
  }
  /** s·a + b, fused per component when the model fuses. */
  vmad(a: V3, s: number, b: V3): V3 {
    return { x: this.mad(a.x, s, b.x), y: this.mad(a.y, s, b.y), z: this.mad(a.z, s, b.z) };
  }
  vneg(a: V3): V3 {
    return { x: -a.x, y: -a.y, z: -a.z };
  }
  normalize(a: V3): V3 {
    const k = f(1 / Math.sqrt(this.dot(a, a)));
    return this.vscale(a, k);
  }

  /** The built-in atan2 of this GPU: Abramowitz and Stegun 4.4.49 with quadrant logic (absolute error 1.2e-5). */
  builtinAtan(y: number, x: number): number {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const big = ay > ax;
    const t = big ? this.div(ax, ay) : this.div(ay, Math.max(ax, 1e-30));
    const z = this.mul(t, t);
    let r = this.mul(t, this.mad(this.mad(this.mad(this.mad(f(0.0208351), z, f(-0.085133)), z, f(0.180141)), z, f(-0.3302995)), z, f(0.999866)));
    r = big ? this.sub(HALF_PI, r) : r;
    r = x < 0 ? this.sub(PI, r) : r;
    return y < 0 ? -r : r;
  }

  // ─── the chunk ─────────────────────────────────────────────────────────────────────────────

  /** GLSL lensAtan (Cephes atanf), or the built-in when the model swaps it in. */
  lensAtan(y: number, x: number): number {
    if (this.model.builtinAtan) return this.builtinAtan(y, x);
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const big = ay > ax;
    let t = big ? this.div(ax, Math.max(ay, 1e-30)) : this.div(ay, Math.max(ax, 1e-30));
    let base = 0;
    if (t > f(0.41421356)) {
      base = f(0.78539816);
      t = this.div(this.sub(t, 1), this.add(t, 1));
    }
    const z = this.mul(t, t);
    const poly = this.mad(this.mad(this.mad(this.mad(f(0.0805374449538), z, f(-0.138776856032)), z, f(0.199777106478)), z, f(-0.333329491539)), this.mul(z, t), t);
    let r = this.add(base, poly);
    r = big ? this.sub(HALF_PI, r) : r;
    r = x < 0 ? this.sub(PI, r) : r;
    return y < 0 ? -r : r;
  }

  /** GLSL lensAngle. */
  lensAngle(a: V3, b: V3): number {
    return this.mul(2, this.lensAtan(this.length(this.vsub(a, b)), this.length(this.vadd(a, b))));
  }

  /** GLSL lensSin. */
  lensSin(x: number): number {
    if (Math.abs(x) < f(0.1)) {
      const x2 = this.mul(x, x);
      const inner = this.sub(1, this.mul(this.div(x2, 42), 1));
      const mid = this.sub(1, this.mul(this.div(x2, 20), inner));
      return this.mul(x, this.sub(1, this.mul(this.div(x2, 6), mid)));
    }
    return this.sin(x);
  }

  /** GLSL lensCosM1. */
  lensCosM1(x: number): number {
    const s = this.lensSin(this.mul(0.5, x));
    return this.mul(this.mul(-2, s), s);
  }

  /** GLSL lensAsin. */
  lensAsin(x: number): number {
    return this.lensAtan(x, this.sqrt(this.mul(this.sub(1, x), this.add(1, x))));
  }

  /** GLSL lensLog: ln x from the float's exponent and a short atanh series of its mantissa (no built-in log). */
  lensLog(x: number): number {
    const bits = floatBits(x);
    let e = ((bits >> 23) & 255) - 127;
    let m = bitsFloat((bits & 8388607) | 1065353216);
    if (m > f(1.41421356)) {
      m = this.mul(m, 0.5);
      e += 1;
    }
    const z = this.div(this.sub(m, 1), this.add(m, 1));
    const z2 = this.mul(z, z);
    const poly = this.mad(z2, this.mad(z2, this.mad(z2, this.mad(z2, f(0.2222222222), f(0.2857142857)), f(0.4)), f(0.6666666667)), 2);
    const s = this.mul(z, poly);
    return this.add(this.mul(e, f(0.693145751953125)), this.mad(e, f(1.428606765330187e-6), s));
  }

  /** GLSL lensAsinh. */
  lensAsinh(x: number): number {
    const ax = Math.abs(x);
    const r = ax < f(1e-2) ? this.mul(ax, this.sub(1, this.div(this.mul(ax, ax), 6))) : this.lensLog(this.add(ax, this.sqrt(this.mad(ax, ax, 1))));
    return x < 0 ? -r : r;
  }

  /** GLSL lensTurnHalfAngle: returns the direction and d's half-angle sines and cosines. */
  lensTurnHalfAngle(d: V3, v: V3, k: number): { r: V3; s2: number; c2: number } {
    const a = this.vsub(d, v);
    const b = this.vadd(d, v);
    let s2 = this.dot(a, a);
    let c2 = this.dot(b, b);
    const n = this.add(s2, c2);
    s2 = this.div(s2, n);
    c2 = this.div(c2, n);
    const chord = s2 <= c2 ? a : b;
    const perp = this.vsub(chord, this.vscale(v, this.dot(chord, v)));
    const pl = this.length(perp);
    if (pl < 1e-30) return { r: c2 >= s2 ? v : this.vneg(v), s2, c2 };
    const p = this.mul(k, this.sqrt(s2));
    const q = this.sqrt(c2);
    const den = this.mad(p, p, this.mul(q, q));
    const cv = this.div(this.sub(this.mul(q, q), this.mul(p, p)), den);
    const cp = this.div(this.mul(this.mul(2, p), q), this.mul(den, pl));
    return { r: this.vadd(this.vscale(v, cv), this.vscale(perp, cp)), s2, c2 };
  }

  /** GLSL lensBoost. */
  lensBoost(d: V3, velDir: V3, ePhi: number, emPhi: number): { dir: V3; lnD: number } {
    const t = this.lensTurnHalfAngle(d, velDir, emPhi);
    return { dir: t.r, lnD: this.log(this.mad(ePhi, t.c2, this.mul(emPhi, t.s2))) };
  }

  /** GLSL lensUnboost. */
  lensUnboost(d: V3, velDir: V3, ePhi: number, emPhi: number): { dir: V3; lnD: number } {
    const t = this.lensTurnHalfAngle(d, velDir, ePhi);
    return { dir: t.r, lnD: -this.log(this.mad(emPhi, t.c2, this.mul(ePhi, t.s2))) };
  }

  /** GLSL frameAberrate. */
  frameAberrate(dS: V3): { dir: V3; lnD: number } {
    const u = this.u;
    if (u.on < 0.5 || u.framePhi <= 0) return { dir: dS, lnD: 0 };
    return this.lensBoost(dS, u.frameVelDir, u.frameEPhi, u.frameEmPhi);
  }

  /** GLSL frameUnaberrate. */
  frameUnaberrate(dH: V3): { dir: V3; lnD: number } {
    const u = this.u;
    if (u.on < 0.5 || u.framePhi <= 0) return { dir: dH, lnD: 0 };
    return this.lensUnboost(dH, u.frameVelDir, u.frameEPhi, u.frameEmPhi);
  }

  /** GLSL relUnaberrateLens. */
  relUnaberrateLens(dView: V3, velDir: V3, ePhi: number, emPhi: number): { dir: V3; lnD: number } {
    if (ePhi <= 1) return { dir: dView, lnD: 0 };
    return this.lensUnboost(dView, velDir, ePhi, emPhi);
  }

  fwdTexel(i: number): number {
    return this.t.fwd[i];
  }

  /** GLSL lensDeltaGC: δ and dδ/dα at gap g (c = span − g), the node position from the nearer end of the table. */
  lensDeltaGC(g: number, c: number): { delta: number; dd: number } {
    const F = this.u.fwd;
    const n1 = this.sub(F[2], 1);
    const yTop = this.mul(this.sub(this.lensLog(this.sub(1, this.div(c, this.u.span))), this.mul(F[3], c)), F[1]);
    let delta: number;
    let dds: number;
    let i: number;
    let t: number;
    let linear = false;
    let x = 0;
    if (yTop > this.mul(-0.5, n1)) {
      const fy = Math.floor(yTop);
      i = n1 + fy;
      t = this.sub(yTop, fy);
      if (i > n1 - 1) {
        t = this.add(t, i - (n1 - 1));
        i = n1 - 1;
      }
    } else {
      x = this.mul(this.sub(this.mad(F[3], g, this.lensLog(g)), F[0]), F[1]);
      linear = x < 0;
      i = Math.floor(x);
      t = this.sub(x, i);
    }
    if (linear) {
      const q1 = this.fwdTexel(1);
      const q2 = this.fwdTexel(2);
      delta = this.mad(this.sub(q2, q1), x, q1);
      dds = this.mul(this.sub(q2, q1), F[1]);
    } else {
      const p0 = this.fwdTexel(i);
      const p1 = this.fwdTexel(i + 1);
      const p2 = this.fwdTexel(i + 2);
      const p3 = this.fwdTexel(i + 3);
      const a = this.add(this.sub(this.mad(3, p1, -p0), this.mul(3, p2)), p3);
      const b = this.sub(this.add(this.sub(this.mul(2, p0), this.mul(5, p1)), this.mul(4, p2)), p3);
      const cc = this.sub(p2, p0);
      delta = this.mul(0.5, this.mad(t, this.mad(t, this.mad(t, a, b), cc), this.mul(2, p1)));
      dds = this.mul(this.mul(0.5, this.mad(t, this.mad(this.mul(3, a), t, this.mul(2, b)), cc)), F[1]);
    }
    const dd = this.mul(dds, this.add(this.div(1, g), F[3]));
    return { delta, dd };
  }

  /** GLSL lensDelta. */
  lensDelta(g: number): { delta: number; dd: number } {
    return this.lensDeltaGC(g, Math.max(this.sub(this.u.span, g), 0));
  }

  /** GLSL lensGapC: the gap g and c = span − g, each from the chord on its own side. */
  lensGapC(d: V3): { g: number; c: number } {
    const u = this.u;
    if (this.dot(d, u.axis) >= 0 && u.edge <= HALF_PI) {
      const g = this.sub(this.lensAngle(d, u.axis), u.edge);
      return { g, c: this.sub(u.span, g) };
    }
    const c = this.lensAngle(d, this.vneg(u.axis));
    return { g: this.sub(u.span, c), c };
  }

  /** GLSL lensGap. */
  lensGap(d: V3): number {
    return this.lensGapC(d).g;
  }

  /** GLSL lensSinCosOfGap. */
  lensSinCosOfGap(g: number): { sa: number; ca: number } {
    const u = this.u;
    const a = this.add(u.edge, g);
    if (a < HALF_PI) return { sa: this.lensSin(a), ca: this.add(1, this.lensCosM1(a)) };
    const c = this.sub(u.span, g);
    return { sa: this.lensSin(c), ca: this.sub(-1, this.lensCosM1(c)) };
  }

  /** GLSL lensLnGAt. */
  lensLnGAt(sh: number): number {
    const u = this.u;
    if (u.frame < 0.5) return u.lnG;
    const den = this.mad(this.mul(2, u.rain[0]), this.mul(sh, sh), u.rain[1]);
    return den > 0 ? -this.log(Math.max(den, f(4e-18))) : -40;
  }

  /** GLSL lensRay (lensRayGap, which also hands its callers the gap it works out): false when captured. */
  lensRay(d: V3): { ok: boolean; nInf: V3; jac: [number, number]; lnG: number } {
    const u = this.u;
    let nInf = d;
    let jac: [number, number] = [1, 1];
    if (u.on < 0.5) return { ok: true, nInf, jac, lnG: 0 };
    const chord = this.vsub(u.axis, d);
    const cl = this.length(chord);
    const lnG = this.lensLnGAt(this.mul(0.5, cl));
    const { g, c } = this.lensGapC(d);
    if (!(g > 0)) return { ok: false, nInf, jac, lnG };
    const { delta, dd } = this.lensDeltaGC(g, c);
    const chordP = this.vadd(u.axis, d);
    const cp = this.length(chordP);
    const t = cl <= cp ? this.vmad(d, this.mul(this.mul(0.5, cl), cl), chord) : this.vmad(d, -this.mul(this.mul(0.5, cp), cp), chordP);
    const tl = this.length(t);
    if (tl >= 1e-7) {
      const sd = this.lensSin(delta);
      const cd = this.add(1, this.lensCosM1(delta));
      nInf = this.normalize(this.vadd(this.vscale(d, cd), this.vscale(t, this.div(sd, tl))));
    }
    const { sa } = this.lensSinCosOfGap(g);
    const amd = this.sub(this.add(u.edge, g), delta);
    jac = [Math.abs(this.sub(dd, 1)), this.div(Math.abs(this.lensSin(amd)), Math.max(sa, 1e-30))];
    return { ok: true, nInf, jac, lnG };
  }

  invTexel(i: number, row: number): [number, number] {
    const k = 2 * (row * this.t.invWidth + i);
    return [this.t.inv[k], this.t.inv[k + 1]];
  }

  /** GLSL lensInvGap: the gap of the image whose sweep is D, given π − D; and m. */
  lensInvGap(piMinusD: number): { g: number; m: number } {
    const u = this.u;
    const h = u.inv[3];
    if (!(h > 0)) return { g: this.sub(piMinusD, u.edge), m: 0 };
    const row0 = piMinusD > -PI;
    let x: number;
    let n: number;
    let row: number;
    if (row0) {
      x = this.mul(this.sub(this.lensAsinh(this.div(piMinusD, h)), u.inv[0]), u.inv[1]);
      n = u.inv[2];
      row = 0;
    } else {
      x = this.mul(this.sub(-piMinusD, PI), u.invRel[1]);
      n = u.invRel[2];
      row = 1;
    }
    let i = Math.floor(x);
    i = Math.min(Math.max(i, 0), n - 2);
    const uu = this.sub(x, i);
    const t0 = this.invTexel(i, row);
    const t1 = this.invTexel(i + 1, row);
    const t2 = this.invTexel(i + 2, row);
    const t3 = this.invTexel(i + 3, row);
    const y1 = t1[0];
    const y2 = t2[0];
    const m1 = t1[1];
    const m2 = t2[1];
    let s1: number;
    let s2: number;
    if (row0) {
      const dz = this.div(1, u.inv[1]);
      const z1 = this.mad(i, dz, u.inv[0]);
      s1 = this.mul(this.mul(this.mul(h, this.cosh(z1)), this.exp(this.sub(m1, y1))), dz);
      s2 = this.mul(this.mul(this.mul(h, this.cosh(this.add(z1, dz))), this.exp(this.sub(m2, y2))), dz);
    } else {
      const dD = this.div(1, u.invRel[1]);
      s1 = this.mul(-this.exp(this.sub(m1, y1)), dD);
      s2 = this.mul(-this.exp(this.sub(m2, y2)), dD);
    }
    const u2 = this.mul(uu, uu);
    const u3 = this.mul(u2, uu);
    const h00 = this.add(this.sub(this.mul(2, u3), this.mul(3, u2)), 1);
    const h10 = this.add(this.sub(u3, this.mul(2, u2)), uu);
    const h01 = this.sub(this.mul(3, u2), this.mul(2, u3));
    const h11 = this.sub(u3, u2);
    const y = this.mad(h11, s2, this.mad(h01, y2, this.mad(h10, s1, this.mul(h00, y1))));
    const p0 = t0[1];
    const p3 = t3[1];
    const cA = this.add(this.sub(this.mad(3, m1, -p0), this.mul(3, m2)), p3);
    const cB = this.sub(this.add(this.sub(this.mul(2, p0), this.mul(5, m1)), this.mul(4, m2)), p3);
    const cC = this.sub(m2, p0);
    const m = this.mul(0.5, this.mad(uu, this.mad(uu, this.mad(uu, cA, cB), cC), this.mul(2, m1)));
    return { g: this.exp(y), m };
  }

  /** GLSL lensInverse. */
  lensInverse(D: number): { alpha: number; m: number } {
    const u = this.u;
    if (u.on < 0.5) return { alpha: this.sub(PI, D), m: 0 };
    const r = this.lensInvGap(this.sub(PI, D));
    return { alpha: this.add(u.edge, r.g), m: r.m };
  }

  /** GLSL lensB0OverZ. */
  lensB0OverZ(z: number): number {
    if (z >= 8) return this.div(1, z);
    const x = this.mul(z, 16);
    const i = Math.floor(x);
    const t = this.sub(x, i);
    const a = this.t.b0z[i + 1];
    const b = this.t.b0z[i + 2];
    return this.mad(this.sub(b, a), t, a);
  }

  /** GLSL lensParallax. */
  lensParallax(b: number, rs: number, flatLam: boolean): { ok: boolean; lam: number; cPsi: number; cPsiDLam: number } {
    const x = this.div(b, rs);
    if (flatLam || b < ORBIT_MIN_B) {
      if (!(x < 1)) return { ok: false, lam: 0, cPsi: 1, cPsiDLam: 0 };
      const c = this.sqrt(this.mul(this.sub(1, x), this.add(1, x)));
      return { ok: true, lam: this.lensAtan(x, c), cPsi: c, cPsiDLam: this.div(1, rs) };
    }
    const q = this.sub(x, this.div(2, b));
    const disc = this.sub(1, this.div(this.mul(4, q), b));
    if (!(disc >= 0)) return { ok: false, lam: 0, cPsi: 1, cPsiDLam: 0 };
    const S = this.div(this.mul(2, q), this.add(1, this.sqrt(disc)));
    if (!(S < 1)) return { ok: false, lam: 0, cPsi: 1, cPsiDLam: 0 };
    const q0 = this.div(-2, b);
    const S0 = this.div(this.mul(2, q0), this.add(1, this.sqrt(this.sub(1, this.div(this.mul(4, q0), b)))));
    const c0 = this.sqrt(this.mul(this.sub(1, S0), this.add(1, S0)));
    const cS = this.sqrt(this.mul(this.sub(1, S), this.add(1, S)));
    const oneM2S0b = this.sub(1, this.div(this.mul(2, S0), b));
    const k = this.mul(oneM2S0b, c0);
    const A = this.sub(this.lensAtan(S, cS), this.lensAtan(S0, c0));
    const bb = this.mul(b, b);
    const dS0 = this.div(this.div(this.sub(2, this.mul(S0, S0)), bb), oneM2S0b);
    const dk = this.sub(this.mul(this.sub(this.div(this.mul(2, S0), bb), this.div(this.mul(2, dS0), b)), c0), this.div(this.mul(this.mul(oneM2S0b, S0), dS0), c0));
    const cPsi = this.mul(cS, this.sub(1, this.div(this.mul(2, S), b)));
    const lam = this.mul(k, A);
    const cPsiDLam = this.sub(
      this.mul(k, this.add(this.div(this.sub(2, this.mul(S, S)), bb), this.div(1, rs))),
      this.mul(cPsi, this.sub(this.div(this.mul(k, dS0), c0), this.mul(dk, A))),
    );
    return { ok: true, lam, cPsi, cPsiDLam };
  }

  /** GLSL lensImpact: b, db/dα and the raindrop's 1 − v cos α. */
  lensImpact(sa: number, ca: number, sh: number): { b: number; bp: number; den: number } {
    const u = this.u;
    if (u.frame > 0.5) {
      const den = this.mad(this.mul(2, u.rain[0]), this.mul(sh, sh), u.rain[1]);
      const bp = this.div(this.mul(u.ro, this.sub(ca, u.rain[0])), this.mul(den, den));
      return { b: this.div(this.mul(u.ro, sa), den), bp, den };
    }
    const rEg = this.mul(u.ro, this.exp(u.lnG));
    return { b: this.mul(rEg, sa), bp: this.mul(rEg, ca), den: 1 };
  }

  /** GLSL lensResidual. */
  lensResidual(alpha: number, rs: number, D: number): { ok: boolean; f: number; fp: number } {
    const u = this.u;
    const g = this.sub(alpha, u.edge);
    if (!(g > 0)) return { ok: false, f: 0, fp: 1 };
    const { sa, ca } = this.lensSinCosOfGap(g);
    const { b, bp } = this.lensImpact(sa, ca, this.lensSin(this.mul(0.5, alpha)));
    const p = this.lensParallax(b, rs, false);
    if (!p.ok) return { ok: false, f: 0, fp: 1 };
    const { delta, dd } = this.lensDelta(g);
    const f0 = this.sub(this.sub(this.sub(this.add(delta, u.span), g), p.lam), D);
    const fp = this.sub(this.sub(dd, 1), this.mul(this.div(p.cPsiDLam, p.cPsi), bp));
    return { ok: true, f: f0, fp };
  }

  /** GLSL lensImage: tier 1. */
  lensImage(relM: V3, order: number, starRadiusM: number): { ok: boolean; dir: V3; lnMuB0: number; lnG: number; branch: 'straight' | 'image' } {
    const U = this.u;
    const d = this.length(relM);
    const uu = this.vscale(relM, this.div(1, Math.max(d, 1e-30)));
    if (U.on < 0.5) return { ok: order < 0.5, dir: uu, lnMuB0: 0, lnG: 0, branch: 'straight' };
    const axis = U.axis;
    const lnGFlat = this.lensLnGAt(this.mul(0.5, this.length(this.vsub(uu, axis))));
    const order0 = order < 0.5;
    const straight = (ok: boolean) => ({ ok, dir: uu, lnMuB0: 0, lnG: lnGFlat, branch: 'straight' as const });
    if (order0 && this.dot(uu, axis) < U.ptCos) return straight(true);
    const ro = U.ro;
    const srcH = this.vsub(relM, U.hole);
    const rs = this.length(srcH);
    const sh = this.vscale(srcH, this.div(1, Math.max(rs, 1e-30)));
    const gamma = this.mul(2, this.lensAtan(this.length(this.vadd(sh, axis)), this.length(this.vsub(sh, axis))));
    const gammaC = this.mul(2, this.lensAtan(this.length(this.vsub(sh, axis)), this.length(this.vadd(sh, axis))));
    if (order0 && rs < ro && this.mul(ro, this.cos(gamma)) > rs) return straight(true);
    const ord = Math.floor(order + 0.5);
    const kTurn = Math.floor(ord / 2);
    const side = ord - 2 * kTurn === 0 ? 1 : -1;
    const piMinusD = side > 0 ? (kTurn === 0 ? gammaC : this.sub(-PI, gamma)) : kTurn === 0 ? -gammaC : this.sub(-gammaC, TWO_PI);
    const D = this.sub(PI, piMinusD);
    const qv = this.vsub(relM, this.vscale(axis, this.dot(relM, axis)));
    const ql = this.length(qv);
    const q =
      ql > this.mul(1e-30, d)
        ? this.vscale(qv, this.div(1, ql))
        : this.normalize(Math.abs(axis.x) > 0.9 ? this.vsub(this.v(0, 1, 0), this.vscale(axis, axis.y)) : this.vsub(this.v(1, 0, 0), this.vscale(axis, axis.x)));
    const aFlat = this.lensAngle(uu, axis);
    const edge = U.edge;
    const ratio = this.div(ro, rs);
    const passRegime = ratio < 0.05;
    let g = 0;
    let alpha = 0;
    let dSweep = -1;
    let ok = true;
    let m = 0;
    if (passRegime) {
      const passes = this.mul(ratio, U.pxPerRad) < 0.005 ? 0 : this.mul(this.mul(ratio, ratio), U.pxPerRad) < 0.005 ? 1 : 3;
      let r = this.lensInvGap(piMinusD);
      g = r.g;
      m = r.m;
      for (let p = 0; p < 3; p++) {
        if (p >= passes) break;
        const { sa, ca } = this.lensSinCosOfGap(g);
        const { b } = this.lensImpact(sa, ca, this.lensSin(this.mul(0.5, this.add(edge, g))));
        const px = this.lensParallax(b, rs, true);
        if (!px.ok) {
          ok = false;
          break;
        }
        r = this.lensInvGap(this.sub(piMinusD, px.lam));
        g = r.g;
        m = r.m;
      }
      alpha = this.add(edge, g);
      dSweep = -this.exp(-m);
    } else {
      const bTan = this.mul(0.5, this.add(rs, this.sqrt(this.mad(rs, rs, this.mul(4, rs)))));
      const rEg = this.mul(ro, this.exp(U.lnG));
      const tangent = U.frame < 0.5 && bTan < rEg;
      const aMax = tangent ? this.lensAsin(this.div(bTan, rEg)) : PI;
      let start = D;
      if (order0) {
        const sa0 = this.lensSin(aFlat);
        const ca0 = this.add(1, this.lensCosM1(aFlat));
        const { b: b0 } = this.lensImpact(sa0, ca0, this.lensSin(this.mul(0.5, aFlat)));
        const px = this.lensParallax(b0, rs, false);
        if (px.ok) start = this.add(D, px.lam);
      }
      alpha = Math.min(this.add(edge, this.lensInvGap(this.sub(PI, start)).g), aMax);
      // One loop and one call of the residual, as the GLSL: with order 0 two evaluations first (k 0 and 1, the table's
      // start and α_flat: the smaller Newton step picks the start), then (k 2, 3) up to four Newton steps.
      let k = order0 && aFlat > edge && aFlat < aMax ? 0 : 2;
      let steps = 0;
      let stepA = 1e30;
      const wMax = this.sqrt(this.sub(aMax, edge));
      let w = 0;
      let converged = false;
      for (let it = 0; it < 6; it++) {
        if (k === 2) {
          if (tangent) {
            w = this.sqrt(Math.max(this.sub(aMax, alpha), 0));
            if (!(w > this.mul(1e-9, wMax))) w = this.mul(1e-9, wMax);
            alpha = this.sub(aMax, this.mul(w, w));
          }
          k = 3;
        }
        const r = this.lensResidual(k === 1 ? aFlat : alpha, rs, D);
        if (k === 0) {
          if (alpha < aMax && r.ok) stepA = Math.abs(this.div(r.f, r.fp));
          k = 1;
        } else if (k === 1) {
          if (r.ok && Math.abs(this.div(r.f, r.fp)) < stepA) alpha = aFlat;
          k = 2;
        } else {
          if (!r.ok) break;
          let next: number;
          let clamped = false;
          if (tangent) {
            let wn = this.add(w, this.div(r.f, this.mul(this.mul(2, w), r.fp)));
            if (!(wn > this.mul(1e-9, wMax))) {
              wn = this.mul(1e-9, wMax);
              clamped = true;
            }
            if (wn > wMax) {
              wn = this.mul(0.5, this.add(w, wMax));
              clamped = true;
            }
            w = wn;
            next = this.sub(aMax, this.mul(w, w));
          } else {
            next = this.sub(alpha, this.div(r.f, r.fp));
            if (next > aMax) {
              next = aMax;
              clamped = true;
            }
            if (!(next > edge)) {
              next = this.add(edge, this.mul(0.5, this.sub(alpha, edge)));
              clamped = true;
            }
          }
          const step = this.sub(next, alpha);
          alpha = next;
          if (!clamped && Math.abs(step) < 1e-5) {
            converged = true;
            break;
          }
          steps++;
          if (steps >= 4) break;
        }
      }
      if (!converged) ok = false;
      else dSweep = this.sub(this.lensDelta(this.sub(alpha, edge)).dd, 1);
      g = this.sub(alpha, edge);
    }
    const { sa, ca } = this.lensSinCosOfGap(g);
    const { b, bp, den } = this.lensImpact(sa, ca, this.lensSin(this.mul(0.5, alpha)));
    const flatLam = passRegime || b < ORBIT_MIN_B;
    const px = ok ? this.lensParallax(b, rs, passRegime) : { ok: false, lam: 0, cPsi: 1, cPsiDLam: 0 };
    if (!px.ok || (flatLam && !(this.mul(px.cPsi, px.cPsi) >= this.div(10, rs))) || !(g > 0)) return straight(order0);
    const dir = this.vadd(this.vscale(axis, ca), this.vscale(q, this.mul(sa, side)));
    const offAbs = gamma < HALF_PI ? gamma : gammaC;
    const jac = Math.abs(this.sub(this.mul(px.cPsi, dSweep), this.mul(bp, px.cPsiDLam)));
    const sinOverOff = offAbs < 1e-30 ? 1 : this.div(this.lensSin(offAbs), offAbs);
    const L = this.sub(this.sub(this.add(this.mul(2, this.log(this.div(d, rs))), this.log(sa)), this.log(sinOverOff)), this.log(jac));
    let lnMuB0 = this.sub(L, this.log(Math.max(offAbs, 1e-30)));
    if (starRadiusM > 0) {
      const z = this.div(this.mul(offAbs, rs), starRadiusM);
      if (z < 8) lnMuB0 = this.add(this.add(L, this.log(this.div(rs, starRadiusM))), this.log(this.lensB0OverZ(z)));
    }
    const lnG = U.frame > 0.5 ? -this.log(den) : U.lnG;
    return { ok: true, dir, lnMuB0, lnG, branch: 'image' };
  }

  /** GLSL lensMuBound. */
  lensMuBound(psi: number): number {
    const U = this.u;
    if (U.on < 0.5) return 0;
    let i = Math.floor(this.mul(this.sub(this.log(Math.max(psi, 1e-30)), U.muAxis[0]), U.muAxis[1]));
    i = Math.min(Math.max(i, 0), 15);
    return U.muBound[i];
  }

  /** GLSL lensStarRadiusM. */
  lensStarRadiusM(absMag: number, lnY: number): number {
    const U = this.u;
    if (U.on < 0.5) return 0;
    return this.mul(this.mul(this.exp(this.sub(this.mul(f(-0.4605170186), this.sub(absMag, f(4.83))), this.mul(0.5, lnY))), SUN_RADIUS_KM), U.scale[0]);
  }
}
