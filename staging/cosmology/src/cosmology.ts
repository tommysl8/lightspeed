// Flat Lambda-CDM background: expansion rate, cosmic and conformal time, distances and horizons.
//
// Model (Planck 2018 base-LCDM; Planck Collaboration 2020, A&A 641, A6, arXiv:1807.06209):
//   E^2(a) = (H/H0)^2 = Om_cb a^-3 + Og a^-4 [1 + f_nu (N_massless + sum_i r(y_i a))] + OL
//     Og      photons at T_cmb (default 2.72548 K, Fixsen 2009, ApJ 707, 916)
//     f_nu    = 7/8 (4/11)^(4/3) N_eff/3, the density of one neutrino species relative to photons when
//             relativistic (the N_eff/3 factor is applied per species, as in astropy)
//     r(y)    massive-neutrino density relative to massless (neutrinos.ts); y_i = m_i c^2 / (k T_nu0)
//     Om_cb   = Om - (massive neutrino density today): Planck's Omega_m includes the 0.06 eV neutrino
//     OL      = 1 - Om - Og (1 + f_nu N_massless), so the model is exactly flat.
//
// Units: everything inside is dimensionless, with time in units of the Hubble time 1/H0 and
// distance in units of the Hubble distance c/H0. Comoving distances are normalised so that a = 1 today.
// The physical-unit wrappers at the bottom return Gyr and Mpc.
//
// Numerics: a master table on a uniform grid in l = ln a, from a = 1e-10 to 1e4 with step 1/32
// (1,032 cells), holds cosmic time t, conformal time eta (comoving particle horizon) and the comoving
// event horizon chi_EH, with their first and second derivatives in l, which are known in closed form
// (dt/dl = 1/E, deta/dl = 1/(aE)). Cell integrals use 8-point Gauss-Legendre; running sums are
// compensated. Values between nodes come from quintic Hermite interpolation. Outside the grid:
//   a < 1e-10: radiation + matter in closed form (Lambda and the neutrino mass are < 1e-15 there);
//   a > 1e4:   matter + Lambda in closed form (radiation is < 1e-20 there).
// Measured interpolation error (dense scan against Gauss-Legendre from the nodes): 1.3e-12 relative for
// t (worst near a = 4e-10), 2.5e-13 for eta, 6.3e-13 for chi_EH. Differences over short spans (|dl| < 2)
// are integrated directly instead of subtracted.
//
// Caveat on the earliest times: t(a) integrates this model down to a = 0, as astropy and CAMB do.
// The real thermal history before e+e- annihilation (a < ~1e-9) had more relativistic species, which
// changes t(a) by less than 1e-6 relative at a >= 1e-6. That is a model limitation, not a numerical one.

import { C_KM_S, C_M_S, G_SI, K_B_EV, MPC_M, NU_PER_PHOTON, SIGMA_SB, TNU_OVER_TGAMMA, hubbleDistanceMpc, hubbleTimeGyr } from './constants.ts';
import { CompensatedSum, gaussLegendre } from './quadrature.ts';
import { hermite5, nuDensityRatio, F0 } from './neutrinos.ts';

export interface CosmologyParams {
  name: string;
  /** Hubble constant, km/s/Mpc. */
  H0: number;
  /** Total non-relativistic matter density today (baryons + CDM + massive neutrinos). */
  omegaM: number;
  /** CMB temperature today, K. */
  TcmbK: number;
  /** Effective number of neutrino species. */
  nEff: number;
  /** Masses of the massive neutrino species, eV. The remaining (3 - length) species are massless. */
  mNuEv: readonly number[];
}

/**
 * Planck 2018, TT,TE,EE+lowE+lensing+BAO (table 2, last column): H0 = 67.66 +- 0.42, Omega_m =
 * 0.3111 +- 0.0056 (including one 0.06 eV neutrino), N_eff = 3.046, flat. T_cmb = 2.72548 K
 * (Fixsen 2009; Planck used 2.7255 K, a difference with no visible effect).
 */
export const PLANCK18: CosmologyParams = {
  name: 'Planck 2018 TT,TE,EE+lowE+lensing+BAO',
  H0: 67.66,
  omegaM: 0.3111,
  TcmbK: 2.72548,
  nEff: 3.046,
  mNuEv: [0.06],
};

const L_LO = Math.log(1e-10);
const STEP = 1 / 32;
const N_CELLS = Math.ceil((Math.log(1e4) - L_LO) / STEP);
/** Last node, just above a = 1e4 (both ends of the grid are nodes). */
const L_HI = L_LO + N_CELLS * STEP;
/** Spans shorter than this (in ln a) are integrated directly rather than subtracted from the table. */
const DIRECT_SPAN = 2;

export interface MasterTable {
  lLo: number;
  step: number;
  cells: number;
  t: Float64Array;
  eta: Float64Array;
  chiEH: Float64Array;
  /** 1/E at the nodes (dt/dl). */
  invE: Float64Array;
  /** d ln E / d ln a at the nodes. */
  dlnE: Float64Array;
}

export class Cosmology {
  readonly params: CosmologyParams;
  readonly h: number;
  /** Photon density today. */
  readonly omegaGamma: number;
  /** One neutrino species (relativistic) relative to photons: 7/8 (4/11)^(4/3) N_eff/3. */
  readonly fNu: number;
  readonly nMassless: number;
  /** m c^2 / (k T_nu0) for each massive species. */
  readonly yNu: readonly number[];
  /** Massless neutrinos today. */
  readonly omegaNuMassless: number;
  /** Massive neutrinos today (all of their energy density; nearly all rest mass). */
  readonly omegaNuMassive: number;
  /** Baryons + cold dark matter today. */
  readonly omegaCB: number;
  /** Radiation today: photons + massless neutrinos. */
  readonly omegaR: number;
  readonly omegaLambda: number;
  /** Hubble time 1/H0 in Gyr, Hubble distance c/H0 in Mpc. */
  readonly tH: number;
  readonly dH: number;
  /** Early-time (a < 1e-10) radiation (all neutrinos relativistic) and matter densities. */
  readonly omegaREarly: number;
  /** Late-time (a > 1e4) matter density coefficient (massive neutrinos fully cold). */
  readonly omegaMLate: number;
  /** Total conformal time eta(a -> infinity), c/H0 units. */
  readonly etaInf: number;
  readonly table: MasterTable;

  constructor(params: CosmologyParams = PLANCK18) {
    this.params = params;
    const { H0, omegaM, TcmbK, nEff, mNuEv } = params;
    this.h = H0 / 100;
    const hS = (H0 * 1000) / MPC_M; // H0 in 1/s
    const rhoCrit = (3 * hS * hS) / (8 * Math.PI * G_SI); // kg/m^3
    const rhoGamma = (4 * SIGMA_SB * TcmbK ** 4) / C_M_S ** 3; // kg/m^3
    this.omegaGamma = rhoGamma / rhoCrit;
    this.fNu = (NU_PER_PHOTON * nEff) / 3;
    this.nMassless = 3 - mNuEv.length;
    if (this.nMassless < 0) throw new Error('at most three neutrino species');
    const tNu = TNU_OVER_TGAMMA * TcmbK;
    this.yNu = mNuEv.map((m) => m / (K_B_EV * tNu));
    this.omegaNuMassless = this.omegaGamma * this.fNu * this.nMassless;
    this.omegaNuMassive = this.omegaGamma * this.fNu * this.yNu.reduce((s, y) => s + nuDensityRatio(y).r, 0);
    this.omegaCB = omegaM - this.omegaNuMassive;
    this.omegaR = this.omegaGamma + this.omegaNuMassless;
    this.omegaLambda = 1 - omegaM - this.omegaR;
    this.tH = hubbleTimeGyr(H0);
    this.dH = hubbleDistanceMpc(H0);
    this.omegaREarly = this.omegaGamma * (1 + 3 * this.fNu);
    // Cold limit r(y) -> I_2 y / F0 with I_2 = (3/2) zeta(3).
    const I2 = 1.5 * 1.2020569031595942;
    this.omegaMLate = this.omegaCB + this.omegaGamma * this.fNu * this.yNu.reduce((s, y) => s + (I2 * y) / F0, 0);
    this.table = this.buildTable();
    const n = this.table.cells;
    this.etaInf = this.table.eta[n] + this.table.chiEH[n];
  }

  // ------------------------------------------------------------------ expansion rate

  /** E^2 = (H/H0)^2 at scale factor a. */
  E2(a: number): number {
    const ia = 1 / a;
    const ia3 = ia * ia * ia;
    const ia4 = ia3 * ia;
    let nu = this.nMassless;
    for (const y of this.yNu) nu += nuDensityRatio(y * a).r;
    return this.omegaCB * ia3 + this.omegaGamma * ia4 * (1 + this.fNu * nu) + this.omegaLambda;
  }

  /** E = H/H0. */
  E(a: number): number {
    return Math.sqrt(this.E2(a));
  }

  /** H(a) in km/s/Mpc. */
  H(a: number): number {
    return this.params.H0 * this.E(a);
  }

  /** E and d ln E / d ln a together. */
  Edlna(a: number): { E: number; dlnE: number } {
    const ia = 1 / a;
    const ia3 = ia * ia * ia;
    const ia4 = ia3 * ia;
    let nu = this.nMassless;
    let dnu = -4 * this.nMassless;
    for (const y of this.yNu) {
      const { r, dlnr } = nuDensityRatio(y * a);
      nu += r;
      dnu += r * (dlnr - 4);
    }
    const og = this.omegaGamma;
    const e2 = this.omegaCB * ia3 + og * ia4 * (1 + this.fNu * nu) + this.omegaLambda;
    const de2 = -3 * this.omegaCB * ia3 - 4 * og * ia4 + og * this.fNu * ia4 * dnu;
    return { E: Math.sqrt(e2), dlnE: de2 / (2 * e2) };
  }

  /** Density parameters at scale factor a (they sum to 1). */
  densities(a: number): { matter: number; radiation: number; massiveNu: number; lambda: number } {
    const e2 = this.E2(a);
    const ia3 = 1 / (a * a * a);
    const ia4 = ia3 / a;
    let massive = 0;
    for (const y of this.yNu) massive += nuDensityRatio(y * a).r;
    return {
      matter: (this.omegaCB * ia3) / e2,
      radiation: (this.omegaR * ia4) / e2,
      massiveNu: (this.omegaGamma * this.fNu * massive * ia4) / e2,
      lambda: this.omegaLambda / e2,
    };
  }

  // ------------------------------------------------------------------ master table

  private tEarly(a: number): number {
    // t = int_0^a a' da' / sqrt(OR + OM a'). For x = OM a / OR < 0.1 use the series
    // OR^-1/2 sum_k binom(-1/2, k) x^k a^2/(k+2); otherwise the closed form
    // 2 [(OM a - 2 OR) sqrt(OR + OM a) + 2 OR^3/2] / (3 OM^2), which also covers OR = 0.
    const R = this.omegaREarly;
    const M = this.omegaCB;
    const x = (M * a) / R;
    if (x < 0.1) {
      let term = 1;
      let s = 0;
      for (let k = 0; k < 40; k++) {
        s += term / (k + 2);
        term *= (-(0.5 + k) / (k + 1)) * x;
        if (Math.abs(term) < 1e-18 * s) break;
      }
      return (a * a * s) / Math.sqrt(R);
    }
    return (2 * ((M * a - 2 * R) * Math.sqrt(R + M * a) + 2 * R * Math.sqrt(R))) / (3 * M * M);
  }

  private etaEarly(a: number): number {
    const r = Math.sqrt(this.omegaREarly);
    return (2 * a) / (Math.sqrt(this.omegaREarly + this.omegaCB * a) + r);
  }

  /** chi_EH for a > 1e4, from l = ln a (valid for huge a without overflow). */
  private chiEHLate(l: number): number {
    const sl = Math.sqrt(this.omegaLambda);
    const eps = this.omegaMLate / this.omegaLambda;
    const ia = Math.exp(-l);
    return (ia - (eps / 8) * ia ** 4) / sl;
  }

  private buildTable(): MasterTable {
    const n = N_CELLS;
    const t = new Float64Array(n + 1);
    const eta = new Float64Array(n + 1);
    const chi = new Float64Array(n + 1);
    const invE = new Float64Array(n + 1);
    const dlnE = new Float64Array(n + 1);
    const { x, w } = gaussLegendre(8);
    const cellT = new Float64Array(n);
    const cellEta = new Float64Array(n);
    for (let i = 0; i <= n; i++) {
      const l = L_LO + i * STEP;
      const r = this.Edlna(Math.exp(l));
      invE[i] = 1 / r.E;
      dlnE[i] = r.dlnE;
    }
    for (let i = 0; i < n; i++) {
      const m = L_LO + (i + 0.5) * STEP;
      let st = 0;
      let se = 0;
      for (let j = 0; j < x.length; j++) {
        const l = m + 0.5 * STEP * x[j];
        const a = Math.exp(l);
        const ie = 1 / this.E(a);
        st += w[j] * ie;
        se += (w[j] * ie) / a;
      }
      cellT[i] = 0.5 * STEP * st;
      cellEta[i] = 0.5 * STEP * se;
    }
    const aLo = Math.exp(L_LO);
    const sT = new CompensatedSum();
    const sE = new CompensatedSum();
    sT.add(this.tEarly(aLo));
    sE.add(this.etaEarly(aLo));
    t[0] = sT.value;
    eta[0] = sE.value;
    for (let i = 0; i < n; i++) {
      sT.add(cellT[i]);
      sE.add(cellEta[i]);
      t[i + 1] = sT.value;
      eta[i + 1] = sE.value;
    }
    const sC = new CompensatedSum();
    sC.add(this.chiEHLate(L_HI));
    chi[n] = sC.value;
    for (let i = n - 1; i >= 0; i--) {
      sC.add(cellEta[i]);
      chi[i] = sC.value;
    }
    return { lLo: L_LO, step: STEP, cells: n, t, eta, chiEH: chi, invE, dlnE };
  }

  /** Quintic Hermite lookup of one tabulated quantity. kind: 0 = t, 1 = eta, 2 = chiEH. */
  private lookup(kind: 0 | 1 | 2, l: number): number {
    const T = this.table;
    const xf = (l - T.lLo) / T.step;
    const i = Math.min(T.cells - 1, Math.max(0, Math.floor(xf)));
    const u = xf - i;
    const h = T.step;
    let f0: number, f1: number, d0: number, d1: number, s0: number, s1: number;
    if (kind === 0) {
      f0 = T.t[i];
      f1 = T.t[i + 1];
      d0 = T.invE[i];
      d1 = T.invE[i + 1];
      s0 = -T.dlnE[i] * d0;
      s1 = -T.dlnE[i + 1] * d1;
    } else {
      const a0 = Math.exp(T.lLo + i * h);
      const a1 = Math.exp(T.lLo + (i + 1) * h);
      const sign = kind === 1 ? 1 : -1;
      f0 = kind === 1 ? T.eta[i] : T.chiEH[i];
      f1 = kind === 1 ? T.eta[i + 1] : T.chiEH[i + 1];
      d0 = (sign * T.invE[i]) / a0;
      d1 = (sign * T.invE[i + 1]) / a1;
      s0 = -(1 + T.dlnE[i]) * d0;
      s1 = -(1 + T.dlnE[i + 1]) * d1;
    }
    return hermite5(u, f0, f1, h * d0, h * d1, h * h * s0, h * h * s1);
  }

  // ------------------------------------------------------------------ dimensionless integrals

  /** Cosmic time since the big bang at ln a = l, in units of 1/H0. Valid for any l. */
  timeLn(l: number): number {
    if (l <= L_LO) return this.tEarly(Math.exp(l));
    if (l < L_HI) return this.lookup(0, l);
    return this.table.t[this.table.cells] + this.timeLateDelta(L_HI, l);
  }

  /** t(l2) - t(l1) for l1, l2 >= ln 1e4 (matter + Lambda, closed form, overflow-safe). */
  private timeLateDelta(l1: number, l2: number): number {
    const sl = Math.sqrt(this.omegaLambda);
    const lnk = 0.5 * Math.log(this.omegaLambda / this.omegaMLate);
    const as = (l: number) => {
      const lnX = lnk + 1.5 * l; // X = k a^1.5
      if (lnX > 20) return Math.LN2 + lnX + 0.25 * Math.exp(-2 * lnX);
      return Math.asinh(Math.exp(lnX));
    };
    return (2 / (3 * sl)) * (as(l2) - as(l1));
  }

  /** Conformal time eta = c int_0^t dt/a (comoving particle horizon), c/H0 units. */
  conformalLn(l: number): number {
    if (l <= L_LO) return this.etaEarly(Math.exp(l));
    if (l < L_HI) return this.lookup(1, l);
    return this.etaInf - this.chiEHLate(l);
  }

  /** Comoving event horizon chi_EH = c int_t^inf dt/a, c/H0 units. */
  eventHorizonLn(l: number): number {
    if (l <= L_LO) return this.etaInf - this.etaEarly(Math.exp(l));
    if (l < L_HI) return this.lookup(2, l);
    return this.chiEHLate(l);
  }

  /**
   * The comoving event horizon to full float64 precision (about 1e-16 relative instead of the table's
   * 6e-13): the nearest node value plus a direct Gauss-Legendre integral from that node. About 1
   * microsecond; used where a small distance is measured from the horizon (targets near it).
   */
  eventHorizonPreciseLn(l: number): number {
    if (!(l > L_LO && l < L_HI)) return this.eventHorizonLn(l);
    const T = this.table;
    const i = Math.min(T.cells, Math.max(0, Math.round((l - T.lLo) / T.step)));
    const li = T.lLo + i * T.step;
    return T.chiEH[i] - this.directSpan(li, l - li, 1);
  }

  /** Direct 16-point Gauss-Legendre over panels of at most 1/4 in l (the integrands vary on scales >= 1 in l, so each panel is exact to rounding). */
  private direct(l1: number, l2: number, kind: 0 | 1): number {
    return this.directSpan(l1, l2 - l1, kind);
  }

  /** As direct(), with the span given exactly (for spans far below the rounding of l itself). */
  private directSpan(l1: number, span: number, kind: 0 | 1): number {
    if (span === 0) return 0;
    const panels = Math.max(1, Math.ceil(Math.abs(span) / 0.25));
    const { x, w } = gaussLegendre(16);
    const h = span / panels;
    let s = 0;
    for (let p = 0; p < panels; p++) {
      const m = l1 + (p + 0.5) * h;
      for (let j = 0; j < 16; j++) {
        const l = m + 0.5 * h * x[j];
        const a = Math.exp(l);
        const ie = 1 / this.E(a);
        s += w[j] * (kind === 0 ? ie : ie / a);
      }
    }
    return 0.5 * h * s;
  }

  /** t(l0 + dl) - t(l0) in 1/H0 units, with dl given separately so that tiny spans keep full precision. */
  timeAfterLn(l0: number, dl: number): number {
    if (Math.abs(dl) < DIRECT_SPAN && l0 + dl < 600 && l0 < 600) return this.directSpan(l0, dl, 0);
    return this.timeBetweenLn(l0, l0 + dl);
  }

  /** Comoving distance light covers from l0 to l0 + dl (c/H0 units), dl given separately. */
  comovingAfterLn(l0: number, dl: number): number {
    if (Math.abs(dl) < DIRECT_SPAN && l0 + dl < 600 && l0 < 600) return this.directSpan(l0, dl, 1);
    return this.comovingBetweenLn(l0, l0 + dl);
  }

  /** t(l2) - t(l1) in 1/H0 units, accurate even when the two are close. */
  timeBetweenLn(l1: number, l2: number): number {
    if (Math.abs(l2 - l1) < DIRECT_SPAN && Math.max(l1, l2) < 600) return this.direct(l1, l2, 0);
    if (l1 >= L_HI && l2 >= L_HI) return this.timeLateDelta(l1, l2);
    return this.timeLn(l2) - this.timeLn(l1);
  }

  /** Comoving distance light covers between l1 and l2 (eta(l2) - eta(l1)), c/H0 units. */
  comovingBetweenLn(l1: number, l2: number): number {
    if (Math.abs(l2 - l1) < DIRECT_SPAN && Math.max(l1, l2) < 600) return this.direct(l1, l2, 1);
    // Choose the better-conditioned representation: eta early, chi_EH late.
    if (Math.min(l1, l2) > Math.log(0.3)) return this.eventHorizonLn(l1) - this.eventHorizonLn(l2);
    return this.conformalLn(l2) - this.conformalLn(l1);
  }

  // ------------------------------------------------------------------ inverses

  /** ln a at cosmic time t (1/H0 units). Monotone, Newton-polished to ~1e-15 in l. */
  lnAtTime(t: number): number {
    if (!(t > 0)) return -Infinity;
    const T = this.table;
    const n = T.cells;
    if (t <= T.t[0]) {
      // t(a) is increasing and concave, so Newton from a lower bound converges monotonically. Both the
      // radiation-only and the matter-only inverses are lower bounds.
      let a = Math.max(Math.sqrt(2 * t * Math.sqrt(this.omegaREarly)), Math.cbrt((1.5 * t) ** 2 * this.omegaCB));
      for (let k = 0; k < 30; k++) {
        const f = this.tEarly(a) - t;
        const d = a / Math.sqrt(this.omegaREarly + this.omegaCB * a); // dt/da
        const da = f / d;
        a -= da;
        if (Math.abs(da) <= 1e-16 * a) break;
      }
      return Math.log(a);
    }
    if (t >= T.t[n]) {
      const sl = Math.sqrt(this.omegaLambda);
      const lnk = 0.5 * Math.log(this.omegaLambda / this.omegaMLate);
      const x0 = lnk + 1.5 * L_HI;
      const as0 = x0 > 20 ? Math.LN2 + x0 : Math.asinh(Math.exp(x0));
      const arg = as0 + 1.5 * sl * (t - T.t[n]);
      const lnX = arg > 20 ? arg - Math.LN2 : Math.log(Math.sinh(arg));
      let l = (lnX - lnk) / 1.5;
      // one Newton polish against the forward formula
      for (let k = 0; k < 3; k++) {
        const f = T.t[n] + this.timeLateDelta(L_HI, l) - t;
        l -= f * this.E(Math.exp(Math.min(l, 700)));
      }
      return l;
    }
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (T.t[m] <= t) lo = m;
      else hi = m;
    }
    let l = L_LO + (lo + (t - T.t[lo]) / (T.t[hi] - T.t[lo])) * STEP;
    for (let k = 0; k < 8; k++) {
      const f = this.lookup(0, l) - t;
      const dl = f * this.E(Math.exp(l));
      l -= dl;
      if (Math.abs(dl) < 1e-15) break;
    }
    return l;
  }

  /** ln a at conformal time eta (c/H0 units); eta must lie in (0, etaInf). */
  lnAtConformal(eta: number): number {
    if (!(eta > 0)) return -Infinity;
    if (eta >= this.etaInf) return Infinity;
    const T = this.table;
    if (eta <= T.eta[0]) {
      const a = eta * (Math.sqrt(this.omegaREarly) + (this.omegaCB * eta) / 4);
      return Math.log(a);
    }
    if (eta > 0.5 * this.etaInf) return this.lnAtEventHorizon(this.etaInf - eta);
    let lo = 0;
    let hi = T.cells;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (T.eta[m] <= eta) lo = m;
      else hi = m;
    }
    let l = L_LO + (lo + (eta - T.eta[lo]) / (T.eta[hi] - T.eta[lo])) * STEP;
    for (let k = 0; k < 8; k++) {
      const a = Math.exp(l);
      const f = this.lookup(1, l) - eta;
      const dl = f * a * this.E(a);
      l -= dl;
      if (Math.abs(dl) < 1e-15) break;
    }
    return l;
  }

  /** ln a at which the comoving event horizon equals chi (c/H0 units). */
  lnAtEventHorizon(chi: number): number {
    if (!(chi > 0)) return Infinity;
    if (chi >= this.etaInf) return -Infinity;
    const T = this.table;
    const n = T.cells;
    if (chi <= T.chiEH[n]) {
      const sl = Math.sqrt(this.omegaLambda);
      let l = -Math.log(chi * sl);
      for (let k = 0; k < 4; k++) {
        const a = Math.exp(Math.min(l, 700));
        l += (this.chiEHLate(l) - chi) * a * sl; // d chi / d l = -1/(a sqrt(OL)) at late times
      }
      return l;
    }
    if (chi >= T.chiEH[0]) return this.lnAtConformal(this.etaInf - chi);
    // chiEH decreases with l.
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (T.chiEH[m] >= chi) lo = m;
      else hi = m;
    }
    let l = L_LO + (lo + (T.chiEH[lo] - chi) / (T.chiEH[lo] - T.chiEH[hi])) * STEP;
    for (let k = 0; k < 8; k++) {
      const a = Math.exp(l);
      const f = this.lookup(2, l) - chi;
      const dl = -f * a * this.E(a);
      l -= dl;
      if (Math.abs(dl) < 1e-15) break;
    }
    return l;
  }

  /**
   * ln a_e of the light that reaches an observer at ln a = lObs from comoving distance chi (c/H0
   * units): solves eta(lObs) - eta(l_e) = chi. Returns -Infinity when chi exceeds the particle horizon.
   */
  lnEmission(lObs: number, chi: number): number {
    const d = this.emissionSpanLn(lObs, chi);
    return Number.isFinite(d) ? lObs - d : -Infinity;
  }

  /**
   * ln(a_obs / a_emit) = ln(1 + z) for the light reaching an observer at ln a = lObs from comoving distance
   * chi (c/H0 units), computed as a span so that tiny redshifts keep full relative precision (use expm1 for
   * z). Infinity when chi exceeds the particle horizon.
   */
  emissionSpanLn(lObs: number, chi: number): number {
    if (chi <= 0) return 0;
    const etaO = this.conformalLn(lObs);
    if (chi >= etaO) return Infinity;
    // Initial guess from the better-conditioned table, then Newton on the direct short-span integral.
    const etaE = etaO - chi;
    const lGuess = etaE > 0.5 * this.etaInf ? this.lnAtEventHorizon(this.eventHorizonLn(lObs) + chi) : this.lnAtConformal(etaE);
    let d = lObs - lGuess;
    if (d < DIRECT_SPAN && lObs < 600) {
      // Small chi: start from the local Hubble law, which is better than the difference above.
      if (chi < 1e-3) d = chi * Math.exp(lObs) * this.E(Math.exp(lObs));
      for (let k = 0; k < 8; k++) {
        const aE = Math.exp(lObs - d);
        const f = -this.comovingAfterLn(lObs, -d) - chi; // comoving distance covered, minus target
        const step = f * aE * this.E(aE); // d(distance)/dd = 1/(a_e E(a_e))
        d -= step;
        if (Math.abs(step) <= 1e-16 * d) break;
      }
    }
    return d;
  }

  /**
   * The forward twin of emissionSpanLn: ln(a_2 / a_1) for light that leaves ln a = l1 and has covered the
   * comoving distance chi (c/H0 units) when it arrives, i.e. the root of eta(l1 + d) - eta(l1) = chi.
   * Returned as a span so that tiny intervals keep full relative precision. Infinity when chi is at or
   * beyond the event horizon at l1 (the light never gets that far).
   */
  arrivalSpanLn(l1: number, chi: number): number {
    if (chi <= 0) return 0;
    const eh = this.eventHorizonLn(l1);
    if (chi >= eh) return Infinity;
    let d = this.lnAtEventHorizon(eh - chi) - l1;
    if (d < DIRECT_SPAN && l1 + d < 600) {
      // Small chi: start from the local Hubble law instead of the difference above.
      if (chi < 1e-3) d = chi * Math.exp(l1) * this.E(Math.exp(l1));
      for (let k = 0; k < 12; k++) {
        const a2 = Math.exp(l1 + d);
        const f = this.comovingAfterLn(l1, d) - chi;
        const step = f * a2 * this.E(a2); // d(distance)/dd = 1/(a_2 E(a_2))
        d -= step;
        if (Math.abs(step) <= 1e-16 * d) break;
      }
    }
    return d;
  }

  // ------------------------------------------------------------------ physical units

  /** Cosmic time since the big bang at scale factor a, Gyr. */
  timeGyr(a: number): number {
    return this.tH * this.timeLn(Math.log(a));
  }
  /** Age of the universe today (a = 1), Gyr. */
  ageGyr(): number {
    return this.timeGyr(1);
  }
  /** Scale factor at cosmic time t (Gyr). */
  scaleAtTimeGyr(tGyr: number): number {
    return Math.exp(this.lnAtTime(tGyr / this.tH));
  }
  /** Lookback time to redshift z, Gyr. */
  lookbackTimeGyr(z: number): number {
    return this.tH * this.timeBetweenLn(-Math.log1p(z), 0);
  }
  /** Line-of-sight comoving distance to redshift z for an observer today, Mpc. */
  comovingDistanceMpc(z: number): number {
    if (z <= 0) return 0;
    return this.dH * this.comovingBetweenLn(-Math.log1p(z), 0);
  }
  /** Comoving distance light travels between scale factors a1 < a2, Mpc (today-normalised). */
  comovingBetweenMpc(a1: number, a2: number): number {
    return this.dH * this.comovingBetweenLn(Math.log(a1), Math.log(a2));
  }
  /** Comoving distance light travels between cosmic times t1 < t2 (Gyr), Mpc. */
  comovingBetweenTimesMpc(t1Gyr: number, t2Gyr: number): number {
    return this.dH * this.comovingBetweenLn(this.lnAtTime(t1Gyr / this.tH), this.lnAtTime(t2Gyr / this.tH));
  }
  /** Luminosity distance (flat): (1 + z) chi, Mpc. */
  luminosityDistanceMpc(z: number): number {
    return (1 + z) * this.comovingDistanceMpc(z);
  }
  /** Angular-diameter distance (flat): chi / (1 + z), Mpc. */
  angularDiameterDistanceMpc(z: number): number {
    return this.comovingDistanceMpc(z) / (1 + z);
  }
  /** Distance modulus 5 log10(D_L / 10 pc). */
  distanceModulus(z: number): number {
    return 5 * Math.log10(this.luminosityDistanceMpc(z)) + 25;
  }
  /** Redshift of a comoving galaxy at comoving distance chi (Mpc) seen today. */
  redshiftAtComovingMpc(chiMpc: number): number {
    const l = this.lnEmission(0, chiMpc / this.dH);
    return Number.isFinite(l) ? Math.expm1(-l) : Infinity;
  }
  /** Comoving particle horizon (radius of the observable universe) at scale factor a, Mpc. */
  particleHorizonMpc(a = 1): number {
    return this.dH * this.conformalLn(Math.log(a));
  }
  /** Comoving cosmic event horizon at scale factor a, Mpc. Multiply by a for the proper distance. */
  eventHorizonMpc(a = 1): number {
    return this.dH * this.eventHorizonLn(Math.log(a));
  }
  /** Hubble sphere (where recession speed = c): proper radius c/H and comoving radius c/(aH), Mpc. */
  hubbleSphereMpc(a = 1): { proper: number; comoving: number } {
    const proper = C_KM_S / this.H(a);
    return { proper, comoving: proper / a };
  }
  /** CMB temperature at scale factor a (free-streaming black body, T0/a), K. */
  cmbTemperatureK(a: number): number {
    return this.params.TcmbK / a;
  }
  /**
   * Redshift of matter-radiation equality, counting baryons + CDM as matter and photons plus all three
   * neutrino species as radiation (the massive one is still relativistic at z ~ 3400: y ~ 0.1). This is
   * the convention of CAMB's z_eq, which Planck 2018 quotes as 3387 +- 21.
   */
  equalityRedshift(): number {
    return this.omegaCB / this.omegaREarly - 1;
  }
}

let defaultCosmology: Cosmology | null = null;
/** Shared Planck 2018 instance (built on first use; about 5 ms). */
export function planck18(): Cosmology {
  if (!defaultCosmology) defaultCosmology = new Cosmology(PLANCK18);
  return defaultCosmology;
}
