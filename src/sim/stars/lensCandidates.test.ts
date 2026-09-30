/**
 * The candidate lists of stars whose images a black hole can show (lensCandidates.ts), checked by brute force
 * over the whole catalogue: at twelve cameras (Sgr A* at 6 M, 20 M, 100 M, 1,000 au and 4,000 au on the Sun's
 * side and opposite it, Gaia BH1 at 10⁴ and 10⁶ M), every star each image of which the lensed star program
 * would draw brighter than the eye's limit + 0.5 (the program's own arithmetic in float64: its pre-cull, the
 * tier-1 image of physics/lensPoint.ts pointImageTier1, Gould's cap and the gravitational shift) is in that
 * order's list (order 0: in the list or in the star field's own draw list). Also the grid (equal areas, every
 * direction in its cell), the lists' sizes, the 20,000 cap keeping the brightest, and the bins' drift.
 */
import { describe, expect, it } from 'vitest';
import { loadStars } from '../../test/stars';
import { cpuMs } from '../../test/timing';
import { PARSEC_KM, SUN_RADIUS_KM } from '../../physics/constants';
import { gouldB0, causticZ, pointImageTier1, starRadiusRsun, type ImageOrder, type PointImage } from '../../physics/lensPoint';
import { buildForwardTable, buildInverseTable, buildMuBound, inverseEval, muBoundAxisInto, muBoundEval, MU_BOUND_NODES } from '../../physics/schwarzschildTables';
import { lnGStatic } from '../../physics/schwarzschild';
import { sampleBlackbody } from '../../physics/blackbody';
import { equatorialToEcliptic, unitFromRaDec } from './frames';
import { C_PC_PER_YR, KMS_TO_PC_PER_YR } from './constants';
import { starBoostLn, starDrawList, starDrawLists, STAR_MAG_LIMIT } from './visibility';
import { BIN_CELLS, binsDrift, binsStale, buildHoleBins, candidateList, CANDIDATE_CAP, cellOf, holeBinsBuilder, ListScan, type CandidateView, type HoleBins, type StarSource } from './lensCandidates';
import type { Vec3 } from '../../physics/vec';
import SSTARS from '../galaxy/sstars.json';
import BLACK_HOLES from '../blackholes/blackholes.json';

const MAG_PER_LN = 2.5 / Math.LN10;
const stars = loadStars();
const drawLists = starDrawLists(stars);
const source: StarSource = {
  count: stars.count,
  positions: stars.positions,
  ecliptic: true,
  velocities: stars.velocitiesInt16,
  velocityUnitKms: stars.velocityUnitKms,
  absMag: stars.absMagInt16,
  absMagUnit: stars.absMagUnit,
  teff: stars.teff,
};

/** World axes (x, y, z) = J2000 ecliptic (x, z, −y). */
const toWorld = (e: readonly number[]): Vec3 => ({ x: e[0], y: e[2], z: -e[1] });

/** Sgr A* from the S-stars' file (as sim/galaxy/records.ts places it), and its M, pc. */
const sgr = (SSTARS as unknown as { blackHole: { mass: { value: number }; distance: { value: number }; icrs: { raDeg: number; decDeg: number } } }).blackHole;
const sgrEcl = equatorialToEcliptic(unitFromRaDec(sgr.icrs.raDeg, sgr.icrs.decDeg));
const SGR = { pc: toWorld(sgrEcl.map((c) => c * sgr.distance.value)), mPc: (sgr.mass.value * 1.476_625_061) / PARSEC_KM };
/** Gaia BH1: its system's barycentre from the black holes' file, and its M, pc. */
const bh1Sys = (BLACK_HOLES as unknown as { systems: { id: string; barycentre: { posPc: number[] } }[] }).systems.find((s) => s.id === 'gaia-bh1-system')!;
const BH1 = { pc: toWorld(bh1Sys.barycentre.posPc), mPc: (9.27 * 1.476_625_061) / PARSEC_KM };
const AU_PC = 1 / 206_264.806_247;

interface Camera {
  name: string;
  hole: typeof SGR;
  /** Camera's distance from the hole, units of M. */
  rM: number;
  /** +1: on the Sun's side of the hole; −1: opposite. */
  side: 1 | -1;
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

/** The lens a camera sees, as render/lens/lensState.ts would set it up, and the list's view of it. */
function setUp(c: Camera) {
  const obs = { frame: 'static' as const, r: c.rM };
  const fwd = buildForwardTable(obs);
  const inv = buildInverseTable(fwd);
  const muBound = buildMuBound(inv, new Float32Array(MU_BOUND_NODES));
  const ax = muBoundAxisInto(inv, { lnPsiMin: 0, invDelta: 0 });
  // Camera → hole: from the Sun's side, the hole lies away from the Sun.
  const fromSun = unit(c.hole.pc);
  const axis = c.side > 0 ? fromSun : { x: -fromSun.x, y: -fromSun.y, z: -fromSun.z };
  const rPc = c.rM * c.hole.mPc;
  const lnG = lnGStatic(c.rM);
  const view: CandidateView = { inv, muBound, lnPsiMin: ax.lnPsiMin, invDelta: ax.invDelta, axis, rPc, bSlope: Math.exp(lnG), framePhi: 0, years: 0, retarded: false, lnExposure: 0 };
  const cam = { x: c.hole.pc.x - axis.x * rPc, y: c.hole.pc.y - axis.y * rPc, z: c.hole.pc.z - axis.z * rPc };
  return { inv, view, cam, lnG };
}

const binsCache = new Map<typeof SGR, HoleBins>();
function binsFor(hole: typeof SGR): HoleBins {
  let b = binsCache.get(hole);
  if (!b) {
    const builder = holeBinsBuilder(hole === SGR ? 'sgr-a-star' : 'gaia-bh1', hole.pc, source, { years: 0, retarded: false, camPc: hole.pc });
    while (!builder.step(4));
    b = builder.bins;
    binsCache.set(hole, b);
  }
  return b;
}

const lnY = (T: number) => sampleBlackbody(Math.log(T)).lnY;
const img: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };

/**
 * The magnitude the lensed star program draws image `order` of star i at (float64), or +∞ when it draws none:
 * the pre-cull for order 0 (unless `preCull` is false), then the tier-1 image, Gould's cap and the gravitational
 * shift (at rest, no frame boost: ln D = ln g).
 */
function drawnMag(i: number, order: ImageOrder, c: Camera, s: ReturnType<typeof setUp>, boostLn: number, preCull = true): number {
  const k = stars.velocityUnitKms * KMS_TO_PC_PER_YR;
  const P = stars.positions;
  const V = stars.velocitiesInt16;
  const p = toWorld([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
  const v = toWorld([V[3 * i] * k, V[3 * i + 1] * k, V[3 * i + 2] * k]);
  const lag = Math.hypot(p.x, p.y, p.z) / C_PC_PER_YR;
  const rel = { x: p.x - s.cam.x + v.x * lag, y: p.y - s.cam.y + v.y * lag, z: p.z - s.cam.z + v.z * lag };
  const d = Math.hypot(rel.x, rel.y, rel.z);
  const M = stars.absMagInt16[i] * stars.absMagUnit;
  const mag = M + 5 * Math.log10(d) - 5;
  if (order === 0 && preCull) {
    const a = s.view.axis;
    const cr = Math.hypot(rel.y * a.z - rel.z * a.y, rel.z * a.x - rel.x * a.z, rel.x * a.y - rel.y * a.x);
    const psi = Math.atan2(cr, rel.x * a.x + rel.y * a.y + rel.z * a.z);
    if (mag - MAG_PER_LN * (muBoundEval(s.view.muBound, s.view.lnPsiMin, s.view.invDelta, psi) + boostLn) > STAR_MAG_LIMIT + 0.5) return Infinity;
  }
  const mPc = c.hole.mPc;
  const holeM = { x: s.view.axis.x * c.rM, y: s.view.axis.y * c.rM, z: s.view.axis.z * c.rM };
  const srcM = { x: rel.x / mPc, y: rel.y / mPc, z: rel.z / mPc };
  pointImageTier1(s.inv, holeM, srcM, order, img);
  if (!img.ok) return Infinity;
  const T = stars.teff[i] > 0 ? stars.teff[i] : 5772;
  const rs = Math.hypot(srcM.x - holeM.x, srcM.y - holeM.y, srcM.z - holeM.z);
  const rStarM = (starRadiusRsun(M, T) * SUN_RADIUS_KM) / PARSEC_KM / mPc;
  const z = causticZ(img.causticOffset, rs, rStarM);
  const lnMuB0 = img.lnMu + (Number.isFinite(z) ? Math.log(gouldB0(z)) : 0);
  // dopplerMagnitudeShift at ln D = ln g, less the lens's ln(μB0) + 2 ln g.
  return mag - MAG_PER_LN * (lnY(T * Math.exp(img.lnG)) - lnY(T) + lnMuB0);
}

/**
 * An upper bound of any image's brightness, for skipping stars that cannot come near the limit before the exact
 * check: the star seen from the hole, magnified at most as a point at the caustic capped by its own disc
 * (2 r_s/R★ sin α e^m there, e times over), brightened by the bound.
 */
function surelyFaint(i: number, c: Camera, boostLn: number, capLn: number): boolean {
  const P = stars.positions;
  const p = toWorld([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
  const holeRel = { x: p.x - c.hole.pc.x, y: p.y - c.hole.pc.y, z: p.z - c.hole.pc.z };
  const rs = Math.hypot(holeRel.x, holeRel.y, holeRel.z);
  const M = stars.absMagInt16[i] * stars.absMagUnit;
  const T = stars.teff[i] > 0 ? stars.teff[i] : 5772;
  const rStarPc = (starRadiusRsun(M, T) * SUN_RADIUS_KM) / PARSEC_KM;
  const mHole = M + 5 * Math.log10(rs) - 5;
  // Motion over the catalogue's light-time can bring it 30 pc nearer: allow it.
  const mHoleNear = mHole + 5 * Math.log10(Math.max(rs - 30, 1e-3) / rs);
  return mHoleNear - MAG_PER_LN * (Math.log((2 * rs) / rStarPc) + capLn + 1 + boostLn) > STAR_MAG_LIMIT + 0.5;
}

const CAMERAS: Camera[] = [
  ...[6, 20, 100, 1000 / (SGR.mPc / AU_PC), 4000 / (SGR.mPc / AU_PC)].flatMap((rM) => [
    { name: `Sgr A* ${rM.toPrecision(3)} M, Sun's side`, hole: SGR, rM, side: 1 as const },
    { name: `Sgr A* ${rM.toPrecision(3)} M, opposite`, hole: SGR, rM, side: -1 as const },
  ]),
  { name: 'Gaia BH1 1e4 M', hole: BH1, rM: 1e4, side: 1 },
  { name: 'Gaia BH1 1e6 M', hole: BH1, rM: 1e6, side: -1 },
];

describe('the grid', () => {
  it('puts every direction in the cell whose area is a 1/8,192 share of the sky', () => {
    const counts = new Uint32Array(BIN_CELLS);
    // mulberry32 (a linear congruential step in float64 loses its low bits past 2^53 and repeats).
    let seed = 12345;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const N = 2_000_000;
    for (let k = 0; k < N; k++) {
      const z = 2 * rnd() - 1;
      const phi = 2 * Math.PI * rnd();
      const s = Math.sqrt(1 - z * z);
      counts[cellOf(s * Math.cos(phi), s * Math.sin(phi), z)]++;
    }
    const mean = N / BIN_CELLS;
    let worst = 0;
    for (const n of counts) worst = Math.max(worst, Math.abs(n - mean) / Math.sqrt(mean));
    // Equal areas: every cell within 5 standard deviations of the mean count.
    expect(worst).toBeLessThan(5);
  });
});

describe('the bins', () => {
  it('bin the whole catalogue in slices, as trees whose nodes hold their stars and whose leaves are brightest first', () => {
    const t0 = performance.now();
    const b = binsFor(SGR);
    const ms = performance.now() - t0;
    expect(b.ready).toBe(true);
    expect(b.order.length).toBe(stars.count);
    // Every star once.
    const seen = new Uint8Array(stars.count);
    for (const i of b.order) seen[i]++;
    expect(seen.every((n) => n === 1)).toBe(true);
    const T = b.tree;
    const angle = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
      Math.atan2(Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx), ax * bx + ay * by + az * bz);
    // The magnitude from the hole the test works out (motion aside: within 0.02 of the bins').
    const mHole = (i: number) => {
      const P = stars.positions;
      const p = toWorld([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
      return stars.absMagInt16[i] * stars.absMagUnit + 5 * Math.log10(Math.hypot(p.x - SGR.pc.x, p.y - SGR.pc.y, p.z - SGR.pc.z)) - 5;
    };
    let leaves = 0;
    let bad = 0;
    for (let k = 0; k < T.n; k++) {
      const s0 = T.start[k];
      const e0 = s0 + T.count[k];
      // Every node's stars inside its cone, and none brighter than its brightest.
      const d = b.orderDir;
      for (let j = s0; j < e0; j++) {
        if (angle(T.dir[3 * k], T.dir[3 * k + 1], T.dir[3 * k + 2], d[3 * j], d[3 * j + 1], d[3 * j + 2]) > T.radius[k]) bad++;
        if (b.orderMag[j] < T.minMag[k]) bad++;
      }
      const c = T.child[k];
      if (c >= 0) {
        // The quarters split the node's run, in order.
        let at = s0;
        for (let q = c; q < c + 4; q++) {
          if (T.start[q] !== at && T.count[q] > 0) bad++;
          at += T.count[q];
          if (T.count[q] > 0 && T.minMag[q] < T.minMag[k]) bad++;
          if (T.count[q] > 0 && T.minRPc[q] < T.minRPc[k]) bad++;
        }
        if (at !== e0) bad++;
        continue;
      }
      leaves++;
      for (let j = s0; j < e0; j++) {
        // Brightest first, and the magnitudes from the hole.
        if (j > s0 && b.orderMag[j] < b.orderMag[j - 1]) bad++;
        if (Math.abs(mHole(b.order[j]) - b.orderMag[j]) > 0.02) bad++;
      }
    }
    expect(bad).toBe(0);
    expect(leaves).toBeGreaterThan(1000);
    // Every cell's run is its tree's.
    for (let c = 0; c < BIN_CELLS; c++) {
      const r = T.root[c];
      if (b.cellCount[c] === 0) continue;
      expect(T.start[r]).toBe(b.cellStart[c]);
      expect(T.count[r]).toBe(b.cellCount[c]);
      expect(T.minRPc[r]).toBe(b.cellMinRPc[c]);
    }
    // The catalogue is at least 796 pc from Sgr A*.
    expect(b.minRPc).toBeGreaterThan(790);
    expect(ms).toBeLessThan(2000);
  });

  it('widen by the stars’ travel, and ask to be built again once it passes a hundredth of the nearest', () => {
    const b = binsFor(SGR);
    const same = { years: 0, retarded: false, camPc: SGR.pc };
    expect(binsDrift(b, same)).toBe(0);
    expect(binsStale(b, same)).toBe(false);
    const later = { years: 5_000, retarded: false, camPc: SGR.pc };
    // The fastest star (974 km/s, 1.0e-3 pc/yr) in 5,000 years: 5 pc.
    expect(binsDrift(b, later)).toBeCloseTo(5000 * b.vMaxPcYr, 6);
    expect(b.vMaxPcYr).toBeGreaterThan(9e-4);
    expect(binsStale(b, later)).toBe(false);
    expect(binsStale(b, { years: 20_000, retarded: false, camPc: SGR.pc })).toBe(true);
    expect(binsStale(b, { years: 0, retarded: true, camPc: SGR.pc })).toBe(true);
  });
});

describe('candidate lists against brute force', () => {
  for (const c of CAMERAS) {
    it(`leave out no image brighter than the limit + 0.5, and the pre-cull drops none: ${c.name}`, () => {
      const s = setUp(c);
      const bins = binsFor(c.hole);
      const boostLn = starBoostLn(0, s.lnG);
      const boostMag = MAG_PER_LN * boostLn;
      const camFromSun = Math.hypot(s.cam.x, s.cam.y, s.cam.z);
      const listed = starDrawList(drawLists, camFromSun, 0, STAR_MAG_LIMIT);
      const inList = new Uint8Array(stars.count);
      if (listed) for (const i of listed) inList[i] = 1;
      else inList.fill(1);
      // sin α e^m at each order's caustics (behind the hole: D = π, 3π; in front of the camera: 2π, 4π).
      let capLn = -Infinity;
      for (const D of [Math.PI, 2 * Math.PI - 1e-9, 2 * Math.PI, 3 * Math.PI, 4 * Math.PI - 1e-6]) {
        const a = inverseEval(s.inv, D, { alpha: 0, m: 0 });
        capLn = Math.max(capLn, Math.log(Math.sin(a.alpha)) + a.m);
      }
      const lists = ([0, 1, 2, 3] as const).map((k) => new Set(candidateList(bins, k, STAR_MAG_LIMIT, boostMag, s.view)));
      const shownBy = [0, 0, 0, 0];
      let shown = 0;
      let checked = 0;
      const dropped: string[] = [];
      for (let i = 0; i < stars.count; i++) {
        if (surelyFaint(i, c, boostLn, capLn)) continue;
        checked++;
        // The pre-cull (shaders/stars.vert.glsl, from the magnification bound) never drops a star whose primary
        // image the lens would draw.
        const full = drawnMag(i, 0, c, s, boostLn, false);
        if (full < STAR_MAG_LIMIT + 0.5 && !(drawnMag(i, 0, c, s, boostLn) < Infinity)) dropped.push(`star ${i} at V ${full.toFixed(2)}`);
        for (const k of [0, 1, 2, 3] as const) {
          const m = drawnMag(i, k, c, s, boostLn);
          if (!(m < STAR_MAG_LIMIT + 0.5)) continue;
          shown++;
          shownBy[k]++;
          if (k === 0) expect(lists[0].has(i) || inList[i] === 1, `${c.name}: star ${i} order 0 at V ${m.toFixed(2)}`).toBe(true);
          else expect(lists[k].has(i), `${c.name}: star ${i} order ${k} at V ${m.toFixed(2)}`).toBe(true);
        }
      }
      expect(dropped).toEqual([]);
      expect(checked).toBeGreaterThan(0);
      expect(shown).toBeGreaterThan(0);
      // Short lists: a bound's worth more than the stars shown. Measured (orders 0 to 3, listed / shown): Sgr A* at
      // 6 M opposite the Sun 2,488 / 256, 2,324 / 226, 2 / 0, 0 / 0; at 20 M opposite 192 / 79, 165 / 58; at 100 M
      // opposite 43 / 24, 24 / 12; from 1,000 au on 9 / 9 and no image bent round the hole; Gaia BH1 5,633 / 5,240
      // at order 0 (from inside the catalogue, where the star field draws every star anyway) and none bent round it.
      for (const k of [1, 2, 3]) expect(lists[k].size).toBeLessThanOrEqual(50 + 12 * shownBy[k]);
      for (const k of [0, 1, 2, 3]) expect(lists[k].size).toBeLessThanOrEqual(CANDIDATE_CAP);
    }, 120_000);
  }
});

describe('the cap', () => {
  it('keeps the brightest 20,000 of a list that would be longer', () => {
    // 30,000 bright stars on a ring 0.05 rad round the axis behind the hole, 1,000 pc from it: every one a
    // candidate for order 0, each magnified alike, so their bounds are in the order of their magnitudes.
    const n = 30_000;
    const pos = new Float32Array(3 * n);
    const mags = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pos[3 * i] = 1000 * Math.sin(0.05) * Math.cos(a);
      pos[3 * i + 1] = 1000 * Math.cos(0.05);
      pos[3 * i + 2] = 1000 * Math.sin(0.05) * Math.sin(a);
      mags[i] = -5 + (i % 1000) / 1000;
    }
    const bins = buildHoleBins('test', { x: 0, y: 0, z: 0 }, pos, mags);
    const obs = { frame: 'static' as const, r: 100 };
    const inv = buildInverseTable(buildForwardTable(obs));
    const muBound = buildMuBound(inv, new Float32Array(MU_BOUND_NODES));
    const ax = muBoundAxisInto(inv, { lnPsiMin: 0, invDelta: 0 });
    const mPc = 1e-9;
    const view: CandidateView = { inv, muBound, lnPsiMin: ax.lnPsiMin, invDelta: ax.invDelta, axis: { x: 0, y: 1, z: 0 }, rPc: 100 * mPc, bSlope: Math.exp(lnGStatic(100)), framePhi: 0, years: 0, retarded: false, lnExposure: 0 };
    const list = candidateList(bins, 0, STAR_MAG_LIMIT, 0, view);
    expect(list.length).toBe(CANDIDATE_CAP);
    // The brightest by their bound: every star kept is at least as bright as every star left out (by M_V here).
    let keptFaintest = -Infinity;
    const kept = new Set(list);
    for (const i of list) keptFaintest = Math.max(keptFaintest, mags[i]);
    let leftBrightest = Infinity;
    for (let i = 0; i < n; i++) if (!kept.has(i)) leftBrightest = Math.min(leftBrightest, mags[i]);
    expect(keptFaintest).toBeLessThanOrEqual(leftBrightest + 0.01);
  });
});


describe('the work a list takes', () => {
  it('reads a few thousand stars at most where the list is short (its budget: about 0.2 ms), and takes no longer', () => {
    // The trees leave all but the stars near the axes unread: from 20 M outwards at most about 15,000 stars read,
    // a few hundred nodes tested and a few hundred bounds worked out for any order, where the cell the axis crosses
    // holds 110,000. Measured in Node with the machine fully loaded by other work (median of 7, warm): 0.06–0.4 ms
    // a list (0.07–0.1 for most); at 6 M opposite the Sun, where the lists hold 2,488 and 2,324 stars, 4.2 and 2.5
    // ms; from Gaia BH1, inside the catalogue, 0.06–0.08 ms for orders 1–3 (order 0 holds 5,600 stars there, 6 ms,
    // and is not asked for: the star field draws every star within 500 pc of the Sun anyway). The star field makes
    // its lists in slices of 1.5 ms a frame (scene/Starfield.tsx), so none stops a frame.
    const over: string[] = [];
    for (const c of CAMERAS) {
      if (c.hole !== SGR || c.rM < 20) continue;
      const s = setUp(c);
      // The star field's own allowance for the axis's turning (scene/Starfield.tsx AXIS_SLACK_RAD).
      const view = { ...s.view, axisSlackRad: 1e-4 };
      const bins = binsFor(c.hole);
      const boostMag = MAG_PER_LN * starBoostLn(0, s.lnG);
      for (const k of [0, 1, 2, 3] as const) {
        const scan = new ListScan(k);
        let n = 0;
        // Processor time over 20 lists (test/timing.ts: the wall clock counts the time this thread waits for a core
        // the rest of the suite holds; in a full run that was 6–9 ms a list).
        const reps = 20;
        const c0 = cpuMs();
        for (let rep = 0; rep < reps; rep++) {
          scan.start(bins, STAR_MAG_LIMIT, boostMag, view);
          n = (scan.step(Infinity) as Uint32Array).length;
        }
        const ms = (cpuMs() - c0) / reps;
        const { nodes, stars: read, bounds } = scan.stats;
        // A guard of 5 ms on the time only: timings on a shared machine swing by more than the budget. The counts are the real guard.
        if (nodes > 1000 || read > 20_000 || bounds > 2 * n + 100 || ms > 5) over.push(`${c.name} order ${k}: ${n} listed, ${nodes} nodes, ${read} stars read, ${bounds} bounds, ${ms.toFixed(2)} ms`);
      }
    }
    expect(over).toEqual([]);
  }, 120_000);
});
