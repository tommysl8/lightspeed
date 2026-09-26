// Energy density of a massive neutrino species with a relativistic Fermi-Dirac momentum distribution
// frozen at decoupling (standard treatment; e.g. Lesgourgues & Pastor 2006, Phys. Rep. 429, 307,
// eq. 12; Komatsu et al. 2011, ApJS 192, 18, section 3.3).
//
//   rho_nu(a) = rho_nu,massless(a) * r(y),   y = m c^2 a / (k_B T_nu0),   T_nu0 = (4/11)^(1/3) T_cmb
//   r(y) = F(y) / F(0),   F(y) = int_0^inf q^2 sqrt(q^2 + y^2) / (e^q + 1) dq,   F(0) = 7 pi^4 / 120
//
// r -> 1 while the species is relativistic (y << 1) and r -> (3/2) zeta(3) y / F(0) = 0.3173 y when it
// is cold, so the density turns from a^-4 into a^-3 (matter) around y ~ 3.
//
// Evaluation (all to ~1e-13 relative or better; verified in neutrinos.test.ts against direct quadrature):
//   y <= Y_SMALL: r = 1 + 5 y^2 / (7 pi^2)                    (next term ~ y^4 ln y < 1e-15)
//   y >= Y_LARGE: asymptotic series F = y sum_k binom(1/2, k) I_(2k+2) y^(-2k),
//                 I_n = int_0^inf q^n/(e^q+1) dq = (1 - 2^-n) n! zeta(n+1), computed here by quadrature
//   otherwise:    quintic Hermite interpolation of ln F in ln y on a grid of step 1/32, with the first and
//                 second derivatives from their own integrals.
// The table is built on first use (420 nodes, about 15 ms).

import { adaptive, adaptiveVec } from './quadrature.ts';

export const F0 = (7 * Math.PI ** 4) / 120;
const Y_SMALL = 1e-4;
const Y_LARGE = 50;
const L_MIN = Math.log(Y_SMALL);
const L_MAX = Math.log(Y_LARGE);
const STEP = 1 / 32;
const Q_MAX = 64; // e^-64 q^4 is below 1e-20 of F

/** Fermi-Dirac occupation 1/(e^q + 1), written to avoid overflow. */
const occ = (q: number): number => {
  const e = Math.exp(-q);
  return e / (1 + e);
};

/** Direct quadrature of F(y), F'(y), F''(y). Used to build the table and by the tests. */
export function fermiDiracIntegrals(y: number): { F: number; dF: number; d2F: number } {
  const y2 = y * y;
  const r = adaptiveVec(
    (q, out) => {
      const n = occ(q);
      const q2 = q * q;
      const s = Math.sqrt(q2 + y2);
      out[0] = q2 * s * n;
      out[1] = s > 0 ? ((q2 * y) / s) * n : 0;
      out[2] = s > 0 ? ((q2 * q2) / (s * s * s)) * n : 0;
    },
    3,
    0,
    Q_MAX,
    { relTol: 1e-15, breaks: y > 0 && y < Q_MAX ? [y] : [] },
  );
  return { F: r.value[0], dF: r.value[1], d2F: r.value[2] };
}

let moments: number[] | null = null;
/** Coefficients c_k = binom(1/2, k) I_(2k+2) of the large-y series, k = 0..11. */
function seriesCoefficients(): number[] {
  if (moments) return moments;
  const c: number[] = [];
  let binom = 1; // binom(1/2, 0)
  for (let k = 0; k < 12; k++) {
    const n = 2 * k + 2;
    const I = adaptive((q) => q ** n * occ(q), 0, 120, { relTol: 1e-15, breaks: [n] }).value;
    c.push(binom * I);
    binom *= (0.5 - k) / (k + 1);
  }
  moments = c;
  return c;
}

interface Table {
  g: Float64Array; // ln F
  g1: Float64Array; // d lnF / d ln y
  g2: Float64Array; // d2 lnF / d ln y^2
}
let table: Table | null = null;

function buildTable(): Table {
  const n = Math.round((L_MAX - L_MIN) / STEP) + 1;
  const g = new Float64Array(n);
  const g1 = new Float64Array(n);
  const g2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const y = Math.exp(L_MIN + i * STEP);
    const { F, dF, d2F } = fermiDiracIntegrals(y);
    const a = (y * dF) / F;
    g[i] = Math.log(F);
    g1[i] = a;
    g2[i] = a + (y * y * d2F) / F - a * a;
  }
  return { g, g1, g2 };
}

/** Quintic Hermite on [0, 1] from values, first and second derivatives (already scaled by h, h^2). */
export function hermite5(u: number, f0: number, f1: number, d0: number, d1: number, s0: number, s1: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  const h1 = 10 * u3 - 15 * u4 + 6 * u5;
  return (
    f0 +
    (f1 - f0) * h1 +
    d0 * (u - 6 * u3 + 8 * u4 - 3 * u5) +
    d1 * (-4 * u3 + 7 * u4 - 3 * u5) +
    s0 * 0.5 * (u2 - 3 * u3 + 3 * u4 - u5) +
    s1 * 0.5 * (u3 - 2 * u4 + u5)
  );
}

/** Derivative d/du of hermite5 (for d lnF / d ln y inside a cell). */
function hermite5d(u: number, f0: number, f1: number, d0: number, d1: number, s0: number, s1: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  return (
    (f1 - f0) * (30 * u2 - 60 * u3 + 30 * u4) +
    d0 * (1 - 18 * u2 + 32 * u3 - 15 * u4) +
    d1 * (-12 * u2 + 28 * u3 - 15 * u4) +
    s0 * 0.5 * (2 * u - 9 * u2 + 12 * u3 - 5 * u4) +
    s1 * 0.5 * (3 * u2 - 8 * u3 + 5 * u4)
  );
}

export interface NuDensity {
  /** r(y) = F(y)/F(0): density relative to the same species if it were massless. */
  r: number;
  /** d ln r / d ln y (0 when relativistic, 1 when cold). */
  dlnr: number;
}

/** r(y) and its logarithmic slope. */
export function nuDensityRatio(y: number): NuDensity {
  if (!(y > 0)) return { r: 1, dlnr: 0 };
  if (y <= Y_SMALL) {
    const k = 5 / (7 * Math.PI * Math.PI);
    const r = 1 + k * y * y;
    return { r, dlnr: (2 * k * y * y) / r };
  }
  if (y >= Y_LARGE) {
    const c = seriesCoefficients();
    const iy2 = 1 / (y * y);
    let s = 0;
    let ds = 0; // d s / d ln y where s = sum c_k y^-2k  ->  sum -2k c_k y^-2k
    let p = 1;
    for (let k = 0; k < c.length; k++) {
      s += c[k] * p;
      ds += -2 * k * c[k] * p;
      p *= iy2;
    }
    // F = y s  ->  d lnF / d ln y = 1 + ds/s
    return { r: (y * s) / F0, dlnr: 1 + ds / s };
  }
  if (!table) table = buildTable();
  const t = table;
  const x = (Math.log(y) - L_MIN) / STEP;
  const i = Math.min(t.g.length - 2, Math.max(0, Math.floor(x)));
  const u = x - i;
  const h = STEP;
  const args = [t.g[i], t.g[i + 1], h * t.g1[i], h * t.g1[i + 1], h * h * t.g2[i], h * h * t.g2[i + 1]] as const;
  const lnF = hermite5(u, ...args);
  const dlnF = hermite5d(u, ...args) / h;
  return { r: Math.exp(lnF) / F0, dlnr: dlnF };
}

/** Number of table nodes (for documentation and tests). */
export const NU_TABLE = { yMin: Y_SMALL, yMax: Y_LARGE, step: STEP } as const;
