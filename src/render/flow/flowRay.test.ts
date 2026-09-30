/**
 * One ray of the accretion flow's map (render/flow/flowRay.ts, the twin of flowMap.frag.glsl) against the exact
 * orbit and the independent Python reference (scripts/sgra-flow; docs/data/blackholes.md §7):
 *
 * - the orbit: the RK4 march of ẍ = −3b²x/|x|⁵ in steps of 0.07 r min(1, r/b) against the exact sweeps of
 *   physics/schwarzschild.ts (Carlson's R_F), u = 1/r to 1e−4 relative at 10⁴ random rays from static cameras at
 *   2.02–100 M and the raindrop inside and outside the horizon, in float64 and float32 (Math.fround after every
 *   operation; the GPU's own transcendentals do not enter the orbit);
 * - the entry sweep of cameras beyond 400 M against the exact sweep;
 * - the pictures: the flow seen from far away at 30° from its axis (the fit's own images from riaf_model.py,
 *   scripts/sgra-flow/ref/far_i30_*.npy, 200 × 200 over ±30 M) and from cameras at 20, 6 and 2.02 M (static) and
 *   1 M (the raindrop, inside the horizon) traced by flow_camera.py with steps ten times finer and every step's
 *   light: total flux within 3 %, the ring's radius within 1 %, pixel correlation at least 0.98, the peak within
 *   10 %, and the brighter side on the gas that comes towards the camera. The map accumulates eight frames of
 *   stratified jitter; these tests average the same eight.
 */
import { describe, expect, it } from 'vitest';
import { readBytes, readJson } from '../../test/files';
import { cpuMs } from '../../test/timing';
import { BC, rootsComplexInto, rootsRealInto, sweepBetweenComplex, sweepBetweenReal, sweepToPeriapsis, type ComplexRoots, type RealRoots } from '../../physics/schwarzschild';
import { entrySweep, FLOW_OUTER_M, flowMarch, flowOrbit, flowRayStart, type FlowMarchOptions, type FlowRayStart } from './flowRay';
import { FLOW_JITTERS } from './flowMap';

/** A .npy file's float32 data and shape (version 1 or 2 headers, little-endian '<f4', C order). */
function readNpy(path: string): { data: Float32Array; shape: number[] } {
  const bytes = readBytes(path);
  const major = bytes[6];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const start = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(bytes.subarray(start, start + hlen));
  if (!header.includes("'<f4'") || header.includes('True')) throw new Error(`unexpected npy header ${header}`);
  const shape = (header.match(/\(([^)]*)\)/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const off = start + hlen;
  const data = new Float32Array(bytes.buffer.slice(bytes.byteOffset + off, bytes.byteOffset + bytes.byteLength));
  return { data, shape };
}

interface RefIndex {
  near: {
    name: string;
    file: string;
    rM: number;
    frame: 'static' | 'rain';
    inclinationDeg: number;
    alpha: { from: number; to: number; n: number };
    omega: { n: number };
    shape: number[];
  }[];
}

const JITTERS = FLOW_JITTERS;

/** The ray's intensity at infinity averaged over the eight stratified jitters of the map's accumulation. */
function march8(start: FlowRayStart, cosI: number, sinI: number, omega: number, band: 'visible' | 'mm', out: Float64Array, f32 = false): void {
  const acc = [0, 0, 0];
  const opts: FlowMarchOptions = { band, jitter: 0, group: 1, f32 };
  for (const j of JITTERS) {
    opts.jitter = j;
    flowMarch(start, cosI, sinI, omega, opts, out);
    acc[0] += out[0];
    acc[1] += out[1];
    acc[2] += out[2];
  }
  out[0] = acc[0] / JITTERS.length;
  out[1] = acc[1] / JITTERS.length;
  out[2] = acc[2] / JITTERS.length;
}

/** Pearson correlation. */
function corr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sa = 0;
  let sb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** The peak of a profile, refined by a parabola through its three highest samples; in the profile's coordinate. */
function peakOf(prof: number[], x0: number, dx: number): number {
  let j = 0;
  for (let i = 1; i < prof.length; i++) if (prof[i] > prof[j]) j = i;
  if (j === 0 || j === prof.length - 1) return x0 + j * dx;
  const y0 = prof[j - 1];
  const y1 = prof[j];
  const y2 = prof[j + 1];
  const den = y0 - 2 * y1 + y2;
  return x0 + (j + (den !== 0 ? (0.5 * (y0 - y2)) / den : 0)) * dx;
}

describe('the entry sweep of a camera beyond 400 M', () => {
  it('matches the exact sweep from the camera to 400 M', () => {
    const R: RealRoots = { b: 0, P: 0, eps: 0, u2: 0, mu1: 0, du32: 0, du21: 0 };
    const C: ComplexRoots = { b: 0, u1: 0, m: 0, n: 0 };
    let worst = 0;
    for (const ro of [401, 500, 1000, 5000, 94308]) {
      const bOut = FLOW_OUTER_M / Math.sqrt(1 - 2 / FLOW_OUTER_M);
      for (let k = 1; k < 400; k++) {
        const b = (bOut * k) / 400;
        const d = b / BC - 1;
        const uo = 1 / ro;
        const u1 = 1 / FLOW_OUTER_M;
        let exact: number;
        if (d > 0) {
          rootsRealInto(d, R);
          exact = sweepBetweenReal(R, uo, u1);
        } else if (d < 0) {
          rootsComplexInto(d, C);
          exact = sweepBetweenComplex(C, uo, u1);
        } else continue;
        // the ray must reach the camera's radius heading in (the camera is on it)
        if (b * uo * Math.sqrt(1 - 2 * uo) >= 1) continue;
        const e = Math.abs(entrySweep(b, uo, u1) - exact);
        worst = Math.max(worst, k < 399 ? e : 0);
      }
    }
    // A position error of 1e-6 rad at 400 M is 4e-4 M; the march's own float32 error is 6e-4 M inside 10 M.
    expect(worst).toBeLessThan(1e-6);
  });
});



describe('the orbit', () => {
  /**
   * The exact orbit through a marched point: the u on the ray's branch at which the exact sweep from the start equals
   * the marched point's azimuth (bisection on the monotone branch; in, through the periapsis, and out again).
   */
  function exactU(b: number, uo: number, heading: number, phi: number, R: RealRoots, C: ComplexRoots): number {
    const bisect = (lo: number, hi: number, f: (u: number) => number) => {
      let flo = f(lo);
      for (let k = 0; k < 60; k++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid);
        if (fm > 0 === flo > 0) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      return 0.5 * (lo + hi);
    };
    if (b < BC) {
      if (heading < 0) return bisect(uo, 0.5, (u) => sweepBetweenComplex(C, uo, u) - phi);
      return bisect(1e-9, uo, (u) => sweepBetweenComplex(C, u, uo) - phi);
    }
    if (heading > 0) return bisect(1e-9, uo, (u) => sweepBetweenReal(R, u, uo) - phi);
    const toPeri = sweepToPeriapsis(R, uo);
    if (phi <= toPeri) return bisect(uo, R.u2, (u) => sweepBetweenReal(R, uo, u) - phi);
    return bisect(1e-9, R.u2, (u) => sweepToPeriapsis(R, u) - (phi - toPeri));
  }

  // Deterministic pseudo-random look angles.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const R: RealRoots = { b: 0, P: 0, eps: 0, u2: 0, mu1: 0, du32: 0, du21: 0 };
  const C: ComplexRoots = { b: 0, u1: 0, m: 0, n: 0 };
  const start: FlowRayStart = { lit: false, b: 0, r0: 0, rdot0: 0, phi0: 0 };
  // Rays within 3 % of the critical impact parameter circle the photon sphere, where any error grows e^2π-fold an
  // orbit (and a float32 b cannot place them): they make the higher-order photon rings, far thinner than a pixel.
  const D_MIN = 0.03;

  /**
   * The worst distance, across the orbit and relative to r, of the marched points (from every fourth step) from the
   * exact orbit, over `n` random rays from these cameras: |δu|/u / √(1 + G/u²) with G = (du/dφ)², the error in u at
   * the same azimuth taken across the orbit (along it, as a ray leaves nearly radially, the same point would count
   * as a large error in u at a fixed azimuth).
   */
  function worstAcross(cams: [number, 'static' | 'rain'][], n: number, f32: boolean): { worst: number; points: number } {
    const xs: number[] = [];
    const ys: number[] = [];
    let worst = 0;
    let points = 0;
    let rays = 0;
    while (rays < n) {
      const [ro, frame] = cams[Math.floor(rand() * cams.length)];
      const alpha = Math.PI * rand();
      flowRayStart(ro, frame, Math.sin(alpha), Math.cos(alpha), start);
      if (!start.lit) continue;
      const b = start.b;
      const d = b / BC - 1;
      const uo = 1 / start.r0;
      const heading = Math.sign(start.rdot0);
      if (Math.abs(d) < D_MIN || b < 1e-3 || heading === 0) continue;
      if (d > 0) {
        rootsRealInto(d, R);
        // rays of b > b_c starting inside the photon sphere turn round below r = 3: not covered by these sweeps
        if (uo > R.u2) continue;
      } else rootsComplexInto(d, C);
      rays++;
      xs.length = 0;
      ys.length = 0;
      flowOrbit(start, f32, (x, y) => {
        xs.push(x);
        ys.push(y);
      });
      let prev = 0;
      for (let j = 1; j < xs.length; j++) {
        let phi = Math.atan2(ys[j], xs[j]);
        while (phi < prev - Math.PI) phi += 2 * Math.PI;
        prev = phi;
        if (j % 4) continue;
        const r = Math.hypot(xs[j], ys[j]);
        if (!(r > 2.001) || r > FLOW_OUTER_M) continue;
        const u = 1 / r;
        const ue = exactU(b, uo, heading, phi, R, C);
        const G = Math.max(1 / (b * b) - u * u + 2 * u * u * u, 0);
        worst = Math.max(worst, Math.abs(ue - u) / u / Math.sqrt(1 + G / (u * u)));
        points++;
      }
    }
    return { worst, points };
  }

  it('follows the exact sweeps to 1e-4 of r from cameras at 2.5–100 M, in float64 and float32', () => {
    const cams: [number, 'static' | 'rain'][] = [
      [100, 'static'],
      [40, 'static'],
      [20, 'static'],
      [6, 'static'],
      [2.5, 'static'],
      [2.5, 'rain'],
    ];
    for (const f32 of [false, true]) {
      const { worst, points } = worstAcross(cams, 10000, f32);
      expect(points).toBeGreaterThan(50000);
      expect(worst).toBeLessThan(1e-4);
    }
    // An accuracy check over 120,000 rays (about 2 s on a quiet machine, 13 s when others share the processor).
  }, 60_000);

  it('to 3e-4 of r from a camera hovering 1 % above the horizon', () => {
    // As an earlier float32 check of these steps measured near the hole (6e-4 M inside 10 M).
    for (const f32 of [false, true]) {
      const { worst, points } = worstAcross([[2.02, 'static']], 2000, f32);
      expect(points).toBeGreaterThan(2000);
      expect(worst).toBeLessThan(3e-4);
    }
  }, 60_000);

  it('leaves the horizon from inside it within 0.01 rad of the exact azimuth', () => {
    // A raindrop inside the horizon: its rays leave it at |ẋ| up to 40 (the step keeps each move a fixed share of r).
    // The azimuth swept out to the ray's last point (beyond 400 M) against the exact sweep from the camera.
    for (const ro of [1, 0.3]) {
      let worst = 0;
      let rays = 0;
      for (let q = 0; q < 2000; q++) {
        const alpha = (Math.PI * (q + 0.5)) / 2000;
        flowRayStart(ro, 'rain', Math.sin(alpha), Math.cos(alpha), start);
        if (!start.lit || start.b < 1e-3) continue;
        const d = start.b / BC - 1;
        if (d > -D_MIN) continue; // b > b_c: they turn round below r = 3 and fall back in
        rootsComplexInto(d, C);
        let prev = 0;
        let last = 0;
        let lastR = 0;
        flowOrbit(start, true, (x, y) => {
          let p = Math.atan2(y, x);
          while (p < prev - Math.PI) p += 2 * Math.PI;
          prev = p;
          last = p;
          lastR = Math.hypot(x, y);
        });
        const exact = sweepBetweenComplex(C, 1 / lastR, 1 / ro);
        // From deep inside, rays that then wind round the photon sphere carry their error e^φ-fold (0.4 rad from
        // 0.3 M for a ray that sweeps 5.8 rad): only the rays that sweep under π are held to 0.01 rad there.
        if (ro < 1 && exact > Math.PI) continue;
        worst = Math.max(worst, Math.abs(last - exact));
        rays++;
      }
      expect(rays).toBeGreaterThan(300);
      expect(worst).toBeLessThan(0.01);
    }
  }, 60_000);
});

describe('the pictures against the Python reference', () => {
  const out = new Float64Array(3);
  const start: FlowRayStart = { lit: false, b: 0, r0: 0, rdot0: 0, phi0: 0 };

  it('the far camera at 30°, visible and 230 GHz', () => {
    const V = readNpy('scripts/sgra-flow/ref/far_i30_V.npy');
    const M = readNpy('scripts/sgra-flow/ref/far_i30_230.npy');
    const n = V.shape[0];
    const ro = 1500;
    const i = (30 * Math.PI) / 180;
    const step = 3; // every third pixel each way
    const a: number[] = [];
    const refV: number[] = [];
    const appV: number[] = [];
    const refM: number[] = [];
    const appM: number[] = [];
    const bs: number[] = [];
    const sides: number[] = [];
    // I_∞ in Jy/sr from V = 0 stars per arcsec²; at 230 GHz from brightness temperatures (1e10 K).
    const vToJySr = 3636 * 42545170296.15221;
    const tToCgs = 1e10 * 2 * 1.380649e-16 * (230e9 * 230e9) / (2.99792458e10 * 2.99792458e10);
    const t0 = performance.now();
    for (let r = 0; r < n; r += step) {
      for (let c = 0; c < n; c += step) {
        const A = -30 + (60 * c) / (n - 1);
        const B = -30 + (60 * r) / (n - 1);
        const b = Math.hypot(A, B);
        const omega = Math.atan2(A, B);
        const sa = (b * Math.sqrt(1 - 2 / ro)) / ro;
        flowRayStart(ro, 'static', sa, Math.sqrt(1 - sa * sa), start);
        march8(start, Math.cos(i), Math.sin(i), omega, 'visible', out);
        appV.push(out[0] * vToJySr);
        march8(start, Math.cos(i), Math.sin(i), omega, 'mm', out);
        appM.push(out[1] * tToCgs);
        refV.push(V.data[r * n + c]);
        refM.push(M.data[r * n + c]);
        bs.push(b);
        sides.push(A);
        a.push(0);
      }
    }
    const ms = performance.now() - t0;
    const report = (name: string, ref: number[], app: number[]) => {
      const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);
      const bins = 120;
      const pr = new Array(bins).fill(0);
      const pa = new Array(bins).fill(0);
      const cnt = new Array(bins).fill(0);
      for (let k = 0; k < ref.length; k++) {
        const j = Math.min(bins - 1, Math.floor((bs[k] / 30) * bins));
        pr[j] += ref[k];
        pa[j] += app[k];
        cnt[j]++;
      }
      for (let j = 0; j < bins; j++) if (cnt[j]) (pr[j] /= cnt[j]), (pa[j] /= cnt[j]);
      let refApproach = 0;
      let refRecede = 0;
      let appApproach = 0;
      let appRecede = 0;
      for (let k = 0; k < ref.length; k++) {
        if (sides[k] < 0) (refApproach += ref[k]), (appApproach += app[k]);
        else if (sides[k] > 0) (refRecede += ref[k]), (appRecede += app[k]);
      }
      const res = {
        flux: sum(app) / sum(ref),
        ring: peakOf(pa, 15 / bins, 30 / bins) / peakOf(pr, 15 / bins, 30 / bins),
        corr: corr(ref, app),
        peak: Math.max(...app) / Math.max(...ref),
        ref: refApproach / refRecede,
        app: appApproach / appRecede,
      };
      console.log(name, JSON.stringify(res), `${ms.toFixed(0)} ms`);
      return res;
    };
    const rv = report('far V', refV, appV);
    const rm = report('far 230', refM, appM);
    for (const r of [rv, rm]) {
      expect(Math.abs(r.flux - 1)).toBeLessThan(0.03);
      expect(Math.abs(r.ring - 1)).toBeLessThan(0.01);
      expect(r.corr).toBeGreaterThan(0.98);
      expect(Math.abs(r.peak - 1)).toBeLessThan(0.1);
      expect(r.ref).toBeGreaterThan(1);
      expect(r.app).toBeGreaterThan(1);
    }
  }, 120000);

  const index = readJson<RefIndex>('scripts/sgra-flow/ref/index.json');
  for (const cam of index.near) {
    it(`${cam.name}`, () => {
      const ref = readNpy(`scripts/sgra-flow/ref/${cam.file}`);
      const [na, nw, nf] = cam.shape;
      const da = (cam.alpha.to - cam.alpha.from) / na;
      const i = (cam.inclinationDeg * Math.PI) / 180;
      const refV: number[] = [];
      const appV: number[] = [];
      const refM: number[] = [];
      const appM: number[] = [];
      const w: number[] = [];
      const approach: boolean[] = [];
      const vToJySr = 3636 * 42545170296.15221;
      const tToJySr = (1e10 * 2 * 1.380649e-16 * (230e9 * 230e9)) / (2.99792458e10 * 2.99792458e10) / 1e-23;
      const profR = new Array(na).fill(0);
      const profA = new Array(na).fill(0);
      for (let j = 0; j < na; j++) {
        const alpha = cam.alpha.from + (j + 0.5) * da;
        flowRayStart(cam.rM, cam.frame, Math.sin(alpha), Math.cos(alpha), start);
        for (let k = 0; k < nw; k += 2) {
          // every other column (the map's own azimuths)
          const omega = (2 * Math.PI * (k + 0.5)) / nw;
          march8(start, Math.cos(i), Math.sin(i), omega, 'visible', out);
          const v = out[0] * vToJySr;
          march8(start, Math.cos(i), Math.sin(i), omega, 'mm', out);
          const m = out[1] * tToJySr;
          const rv = ref.data[(j * nw + k) * nf];
          const rm = ref.data[(j * nw + k) * nf + 2];
          refV.push(rv);
          appV.push(v);
          refM.push(rm);
          appM.push(m);
          w.push(Math.sin(alpha));
          approach.push(Math.sin(omega) < 0);
          profR[j] += rv;
          profA[j] += v;
        }
      }
      const wsum = (x: number[]) => x.reduce((s, v, q) => s + v * w[q], 0);
      const side = (x: number[]) => {
        let p = 0;
        let q = 0;
        x.forEach((v, t) => (approach[t] ? (p += v * w[t]) : (q += v * w[t])));
        return p / q;
      };
      const res = {
        fluxV: wsum(appV) / wsum(refV),
        fluxM: wsum(appM) / wsum(refM),
        ring: peakOf(profA, cam.alpha.from + 0.5 * da, da) / peakOf(profR, cam.alpha.from + 0.5 * da, da),
        corrV: corr(refV, appV),
        corrM: corr(refM, appM),
        peakV: Math.max(...appV) / Math.max(...refV),
        peakM: Math.max(...appM) / Math.max(...refM),
        sideRef: side(refV),
        sideApp: side(appV),
      };
      console.log(cam.name, JSON.stringify(res));
      expect(Math.abs(res.fluxV - 1)).toBeLessThan(0.03);
      expect(Math.abs(res.fluxM - 1)).toBeLessThan(0.03);
      expect(Math.abs(res.ring - 1)).toBeLessThan(0.01);
      expect(res.corrV).toBeGreaterThan(0.98);
      expect(res.corrM).toBeGreaterThan(0.98);
      expect(Math.abs(res.peakV - 1)).toBeLessThan(0.1);
      expect(Math.abs(res.peakM - 1)).toBeLessThan(0.1);
      expect(res.sideRef).toBeGreaterThan(1);
      expect(res.sideApp).toBeGreaterThan(1);
    }, 120000);
  }
});

describe('cost', () => {
  it('a row table of 256 starts within 0.05 ms', () => {
    const start: FlowRayStart = { lit: false, b: 0, r0: 0, rdot0: 0, phi0: 0 };
    let best = Infinity;
    for (let batch = 0; batch < 8; batch++) {
      const t0 = cpuMs();
      const reps = 200;
      for (let rep = 0; rep < reps; rep++) {
        for (let j = 0; j < 256; j++) {
          const a = (j + 0.5) * (0.0082 / 256);
          flowRayStart(5000, 'static', Math.sin(a), Math.cos(a), start);
        }
      }
      best = Math.min(best, (cpuMs() - t0) / reps);
    }
    expect(best).toBeLessThan(0.05);
  });
});
