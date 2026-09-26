// Evaluator for staging/galaxy/model.json: spiral-arm geometry, warp, and the dust (extinction) model.
// Pure functions; no three.js. The particle generator scripts/build-galaxy.mjs implements the same
// arm and warp formulas (a test checks that the two agree).
//
// Frame: galactocentric model frame G (kpc), see frames.ts. Azimuth beta (deg): 0 towards the Sun,
// increasing in the direction of Galactic rotation; (x, y) = (-R cos beta, R sin beta).

import { galToG, type Vec3 } from './frames.ts';

const DEG = Math.PI / 180;

type P = { value: number } | number;
const val = (p: P): number => (typeof p === 'number' ? p : p.value);

export interface ArmSpec {
  id: string;
  name: string;
  N: number;
  betaData: [number, number];
  betaKink: number;
  Rkink: number;
  psiLt: number;
  psiGt: number;
  width: number;
}

// Only the parts of model.json that the evaluator reads.
export interface GalaxyModelJson {
  sun: { R0: P; z0: P };
  components: {
    thinDisc: { hR: P };
    spiralArms: {
      R0source: number;
      dwdR: P;
      arms: ArmSpec[];
      extension: { maxDeltaBeta: number; maxDeltaBeta3kpc: number; Rmin: number; Rmin3kpc: number; Rmax: number; edgeStrength: number };
    };
    warp: { Rw: P; betaW: P; a: P; b: P; R0source: number };
    dust: {
      R0source: number;
      kappaV: P;
      disc: { rho0: P; hr: P; hd0: P; hd1: P; rf: P; rHole: P; sHole: P };
      arms: { rhoA: P; ca: P; ha0: P; ha1: P; rfa: P; rm: P; ra: P };
    };
  };
}

export interface Arm {
  id: string;
  name: string;
  betaKink: number;
  Rkink: number;
  tanLt: number;
  tanGt: number;
  cosLt: number;
  cosGt: number;
  width: number;
  dwdR: number;
  betaData: [number, number];
  betaExt: [number, number];
  edgeStrength: number;
}

export function armRadius(arm: Arm, betaDeg: number): number {
  const t = betaDeg <= arm.betaKink ? arm.tanLt : arm.tanGt;
  return arm.Rkink * Math.exp(-(betaDeg - arm.betaKink) * DEG * t);
}

export function armStrength(arm: Arm, betaDeg: number): number {
  const [d0, d1] = arm.betaData;
  const [e0, e1] = arm.betaExt;
  if (betaDeg >= d0 && betaDeg <= d1) return 1;
  if (betaDeg < d0) return betaDeg < e0 || d0 === e0 ? 0 : arm.edgeStrength * ((betaDeg - e0) / (d0 - e0));
  return betaDeg > e1 || d1 === e1 ? 0 : arm.edgeStrength * ((e1 - betaDeg) / (e1 - d1));
}

export function armWidth(arm: Arm, R: number): number {
  return Math.max(0.05, arm.width + arm.dwdR * (R - arm.Rkink));
}

export function polarToG(R: number, betaDeg: number): [number, number] {
  return [-R * Math.cos(betaDeg * DEG), R * Math.sin(betaDeg * DEG)];
}

export function betaOf(x: number, y: number): number {
  return Math.atan2(y, -x) / DEG;
}

export interface NearestArm {
  arm: Arm;
  /** Perpendicular in-plane distance to the ridge (kpc). */
  d: number;
  /** Galactocentric radius of the ridge point (kpc). */
  Ra: number;
  /** Azimuth on the arm (deg, may lie outside [-180, 180] for wrapped arms). */
  beta: number;
  strength: number;
}

export interface GalaxyModel {
  R0: number;
  z0: number;
  arms: Arm[];
  warpZ(R: number, betaDeg: number): number;
  /** Arms near an in-plane point, nearest first (only arms whose extended range covers the azimuth). */
  armsNear(x: number, y: number): NearestArm[];
  /** V-band extinction coefficient (mag per kpc of path) at a point of frame G. */
  dustAV(p: Vec3): number;
  /** Disc and arm parts separately, with their vertical scale lengths, at an in-plane point (for GPU maps). */
  dustMidplane(x: number, y: number): { discAV: number; discH: number; armAV: number; armH: number; warp: number };
  /** Total A_V (mag) along the straight segment a -> b (frame G, kpc). */
  columnAV(a: Vec3, b: Vec3, segments?: number): number;
  /** Same with endpoints in heliocentric galactic coordinates (kpc). */
  columnAVGal(a: Vec3, b: Vec3, segments?: number): number;
}

export function createGalaxyModel(json: GalaxyModelJson): GalaxyModel {
  const R0 = val(json.sun.R0);
  const z0 = val(json.sun.z0);
  const sa = json.components.spiralArms;
  const k = R0 / sa.R0source;
  const ext = sa.extension;

  const arms: Arm[] = sa.arms.map((a) => {
    const arm: Arm = {
      id: a.id,
      name: a.name,
      betaKink: a.betaKink,
      Rkink: a.Rkink * k,
      tanLt: Math.tan(a.psiLt * DEG),
      tanGt: Math.tan(a.psiGt * DEG),
      cosLt: Math.cos(a.psiLt * DEG),
      cosGt: Math.cos(a.psiGt * DEG),
      width: a.width * k,
      dwdR: val(sa.dwdR),
      betaData: a.betaData,
      betaExt: [a.betaData[0], a.betaData[1]],
      edgeStrength: ext.edgeStrength,
    };
    const is3 = a.id === '3kpc';
    const dMax = is3 ? ext.maxDeltaBeta3kpc : ext.maxDeltaBeta;
    const Rmin = is3 ? ext.Rmin3kpc : ext.Rmin;
    const limit = (dir: number) => {
      let b = dir > 0 ? a.betaData[1] : a.betaData[0];
      for (let i = 0; i < dMax * 10; i++) {
        const nb = b + dir * 0.1;
        const R = armRadius(arm, nb);
        if (R < Rmin || R > ext.Rmax) break;
        b = nb;
      }
      return b;
    };
    arm.betaExt = [limit(-1), limit(+1)];
    return arm;
  });

  const w = json.components.warp;
  const sw = R0 / w.R0source;
  const warpZ = (R: number, betaDeg: number) => {
    const Rs = R / sw;
    if (Rs <= val(w.Rw)) return 0;
    return sw * val(w.a) * Math.pow(Rs - val(w.Rw), val(w.b)) * Math.sin((betaDeg - val(w.betaW)) * DEG);
  };

  const armsNear = (x: number, y: number): NearestArm[] => {
    const R = Math.hypot(x, y);
    const b0 = betaOf(x, y);
    const out: NearestArm[] = [];
    for (const arm of arms) {
      for (const wrap of [-360, 0, 360]) {
        const b = b0 + wrap;
        if (b < arm.betaExt[0] || b > arm.betaExt[1]) continue;
        const Ra = armRadius(arm, b);
        const c = b <= arm.betaKink ? arm.cosLt : arm.cosGt;
        out.push({ arm, d: Math.abs(R - Ra) * c, Ra, beta: b, strength: armStrength(arm, b) });
      }
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  };

  // Dust (Drimmel & Spergel 2001), evaluated in their units (R_sun = 8 kpc) at x / s, density / s.
  const d = json.components.dust;
  const s = R0 / d.R0source;
  const coef = 1.086 * val(d.kappaV);
  const D = d.disc, A = d.arms;
  const discRho = (r: number) => {
    // r in D&S kpc
    const hole = val(D.rHole);
    if (r >= hole) return val(D.rho0) * Math.exp(-r / val(D.hr));
    const atHole = val(D.rho0) * Math.exp(-hole / val(D.hr));
    const t = (r - hole) / val(D.sHole);
    return atHole * Math.exp(-t * t);
  };
  const discH = (r: number) => (r > val(D.rf) ? val(D.hd0) + val(D.hd1) * (r - val(D.rf)) : val(D.hd0));
  const armH = (Ra: number) => (Ra > val(A.rfa) ? val(A.ha0) + val(A.ha1) * (Ra - val(A.rfa)) ** 2 : val(A.ha0));
  const armG = (Ra: number) => (Ra > val(A.rm) ? Math.exp(-(((Ra - val(A.rm)) / val(A.ra)) ** 2)) : 1);

  const dustMidplane = (x: number, y: number) => {
    const R = Math.hypot(x, y);
    const rDS = R / s;
    const discAV = (coef * discRho(rDS)) / s;
    const discHk = discH(rDS) * s;
    // Arm dust: take the arm maximising strength * exp(-(d/wa)^2) (D&S take the maximum over arms).
    let best = 0, bestH = val(A.ha0) * s;
    for (const n of armsNear(x, y)) {
      const RaDS = n.Ra / s;
      const wa = val(A.ca) * RaDS;
      const f = n.strength * Math.exp(-(((n.d / s) / wa) ** 2)) * armG(RaDS);
      if (f > best) { best = f; bestH = armH(RaDS) * s; }
    }
    const armAV = (coef * val(A.rhoA) * best) / s;
    return { discAV, discH: discHk, armAV, armH: bestH, warp: warpZ(R, betaOf(x, y)) };
  };

  const dustAV = (p: Vec3) => {
    const m = dustMidplane(p[0], p[1]);
    const dz = p[2] - m.warp;
    const sech = 1 / Math.cosh(dz / m.discH);
    return m.discAV * sech * sech + m.armAV * Math.exp(-((dz / m.armH) ** 2));
  };

  // Column: split the path into segments; in each, use the in-plane dust at the point closest to the
  // (warped) midplane, and integrate the vertical profiles analytically (tanh for sech^2, erf for the
  // Gaussian). Exact for a horizontally uniform layer, whatever the path's inclination.
  const columnAV = (a: Vec3, b: Vec3, segments = 64) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L === 0) return 0;
    let tau = 0;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments, t1 = (i + 1) / segments;
      const p0: Vec3 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
      const p1: Vec3 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
      const mid: Vec3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      const m = dustMidplane(mid[0], mid[1]);
      const za = p0[2] - m.warp, zb = p1[2] - m.warp;
      const segL = L / segments;
      const dz = zb - za;
      if (Math.abs(dz) < 1e-6 * segL + 1e-9) {
        const sech = 1 / Math.cosh(za / m.discH);
        tau += segL * (m.discAV * sech * sech + m.armAV * Math.exp(-((za / m.armH) ** 2)));
      } else {
        const ds_dz = segL / dz; // signed; sign cancels with the ordered difference
        const disc = m.discAV * m.discH * (Math.tanh(zb / m.discH) - Math.tanh(za / m.discH));
        const arm = m.armAV * m.armH * (Math.sqrt(Math.PI) / 2) * (erf(zb / m.armH) - erf(za / m.armH));
        tau += ds_dz * (disc + arm);
      }
    }
    return tau;
  };

  return {
    R0,
    z0,
    arms,
    warpZ,
    armsNear,
    dustAV,
    dustMidplane,
    columnAV,
    columnAVGal: (a, b, segments) => columnAV(galToG(a), galToG(b), segments),
  };
}

/** Error function, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x: number): number {
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/**
 * Face-on dust maps for a GPU (e.g. a 512 x 512 RGBA float texture over +-extent kpc):
 * channel 0 disc midplane a_V (mag/kpc), 1 disc sech^2 scale height (kpc), 2 arm midplane a_V, 3 arm
 * Gaussian scale height (kpc). Row 0 is y = -extent, column 0 is x = -extent (frame G).
 * The warp is cheap to evaluate in the shader (see galaxy.md) and is not stored.
 */
export function dustMaps(model: GalaxyModel, res = 512, extent = 20): Float32Array {
  const out = new Float32Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    const y = -extent + ((j + 0.5) * 2 * extent) / res;
    for (let i = 0; i < res; i++) {
      const x = -extent + ((i + 0.5) * 2 * extent) / res;
      const m = model.dustMidplane(x, y);
      const o = 4 * (j * res + i);
      out[o] = m.discAV; out[o + 1] = m.discH; out[o + 2] = m.armAV; out[o + 3] = m.armH;
    }
  }
  return out;
}
