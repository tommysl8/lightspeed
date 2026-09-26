/**
 * Fitted orbit models for planetary moons (public/data/moons.json, built by
 * scripts/build-moons.mjs from JPL Horizons state vectors). Format and method: staging/phase2/moons.md.
 *
 * Each model gives a moon's position RELATIVE TO ITS CENTRE — the planet's centre, or the Pluto
 * system barycentre for Charon, Nix, Hydra and Pluto itself — in the ecliptic J2000 frame, in km.
 * Time is TDB days since J2000.0 (JD 2451545.0 TDB); astronomy-engine's AstroTime.tt is within
 * 2 ms of TDB and can be passed as is.
 *
 * The model is a precessing Keplerian ellipse in equinoctial elements, written in a per-moon
 * reference plane (its Laplace plane or its planet's equator), plus periodic terms:
 *
 *   τ = t − epoch;  inside the precise window τc = τ and w = 1
 *   Λ   = l1·τ + Σ_{k≥2} l_k·τc^k + w·Σ_lt [A cos ντ + B sin ντ]         (mean longitude − l0)
 *   θ   = ν·τ + k·Λ                                                        (argument of a term)
 *   λ   = l0 + Λ + w·Σ_lm [A cos θ + B sin θ]
 *   a   = a0 + Σ_{k≥1} a_k·τc^k + w·Σ_am [A cos θ + B sin θ]
 *   k+ih = Σ z_k·τc^k + Σ_zf C e^{iντ} + w·Σ_zm C e^{iθ}                  (e·e^{iϖ})
 *   q+ip = Σ s_k·τc^k + Σ_sf C e^{iντ} + w·Σ_sm C e^{iθ}                  (sin(i/2)·e^{iΩ})
 *   r_fit = Kepler(a, λ, k, h, q, p) + w·[Σ_xy C e^{iθ} (as x + iy),  Σ_zz (A cos θ + B sin θ) (z)]
 *   r_ecl = F · r_fit
 *
 * Outside the window the periodic terms fade out smoothly (w → 0 over `taper` days) and the
 * polynomial parts freeze (τc is a C¹ clamp), leaving the mean precessing orbit: finite and
 * plausible at any date, but only "illustrative".
 */

export type MoonRegime = 'precise' | 'illustrative';

/** [ν rad/day, A, B] — A cos ντ + B sin ντ (real) or (A + iB)·e^{iντ} (complex). */
export type Term3 = [number, number, number];
/** [ν rad/day, A, B, k] — as Term3 with argument θ = ντ + kΛ. */
export type Term4 = [number, number, number, number];

export interface MoonModel {
  id: string;
  name: string;
  /** App body id of the centre, or 'pluto-barycenter'. */
  centre: string;
  /** Planet the moon belongs to (for grouping and labels). */
  planet: string;
  /** Epoch of τ = 0, TDB days since J2000. */
  epoch: number;
  /**
   * Precise window, TDB days since J2000 (inclusive): 1981-01-01 to 2200-01-01, or to the end of the
   * Horizons ephemeris (2199-12-30 Neptune, 2199-12-29 Pluto). The fit itself extends up to five
   * years beyond it on each side, where Horizons has data.
   */
  window: [number, number];
  /** Fade length outside the window, days. */
  taper: number;
  /** Fit frame → ecliptic J2000 rotation matrix, row-major 3×3. */
  frame: number[];
  /** Effective GM used for the elements, km³/day². */
  mu: number;
  a: { p: number[]; m: Term4[] };
  /** q = 1: the τ² term of λ is physical (tidal acceleration) and is not clamped outside. */
  l: { p: number[]; t: Term3[]; m: Term4[]; q?: number };
  z: { p: [number, number][]; f: Term3[]; m: Term4[] };
  s: { p: [number, number][]; f: Term3[]; m: Term4[] };
  xy: Term4[];
  zz: Term4[];
  /** Rotation locked to the orbital period (same face to the planet). */
  synchronous: boolean;
  orbit: {
    /** Mean semi-major axis, km. */
    a: number;
    /** Mean (free/forced) eccentricity. */
    e: number;
    /** Mean inclination to the reference plane, degrees. */
    i: number;
    /** Mean sidereal period, days. */
    period: number;
    /** The orbit runs against the planet's rotation (true only for Triton). */
    retrograde: boolean;
    /** Unit normal of the mean orbit (ecliptic J2000) at the model epoch. */
    normal: [number, number, number];
    /**
     * Unit pole of the fit frame (ecliptic J2000): the Laplace-plane or equatorial pole, or Nereid's
     * mean orbit pole, signed so that the orbit is prograde about it (flipped for Triton).
     */
    refPole: [number, number, number];
    /** 'laplace', 'equator' or 'mean orbit'. */
    refPlane: string;
    /**
     * Free (or resonance-locked) precession periods of the pericentre and node kept outside the
     * window, years; negative = regression. 0 where not meaningful (e < 0.001, i < 0.02°, or the
     * slowest term is a forced one faster than half a year).
     */
    apsidalPeriodYears: number;
    nodalPeriodYears: number;
  };
  accuracy: {
    /**
     * Largest position error vs Horizons seen inside the window, km, over every set compared: the
     * fitted grid, the dense 2020 window, the 64 random checkpoints and the validation grid. An
     * observed maximum over 60,000–230,000 epochs, not a proof.
     */
    maxKm: number;
    /** Stated bound, km: 1.25 × maxKm rounded up to two figures. Use this as the error bar. */
    boundKm: number;
    /** RMS error on the validation grid (epochs the fit never saw), km: the out-of-sample RMS. */
    rmsKm: number;
    /** RMS error on the fitted grid (in sample), km. Lower than rmsKm, up to 3.7× for Proteus. */
    fitRmsKm: number;
    fitMaxKm: number;
    /** Independent validation grid: every stepMinutes over the window, off the fitted epochs. */
    validation: { points: number; stepMinutes: number; startTdb: number; maxKm: number; maxAtTdb: number; rmsKm: number };
    /** Worst error on the independent densely sampled window (2020 onwards), km. */
    denseMaxKm: number;
    /** Worst error at the 64 independent random checkpoints, km. */
    checkpointMaxKm: number;
    /** Requirement: max(100 km, 5e-4 a). */
    targetKm: number;
    /** Errors at Horizons epochs outside 1981–2199 (TDB days since J2000, km): the illustrative regime. */
    illustrativeOutsideKm: { tdb: number; errKm: number }[];
  };
  /** What the model was fitted to. */
  horizons: { target: number; centre: number; ephemeris: string };
  source: string;
}

export interface MoonCatalog {
  format: string;
  moons: MoonModel[];
  [key: string]: unknown;
}

/** Equinoctial elements in the model's reference frame. */
export interface MoonElements {
  a: number;
  lambda: number;
  k: number;
  h: number;
  q: number;
  p: number;
  /** Weight of the periodic terms (1 inside the window, fading to 0 outside). */
  w: number;
  /** Λ, the modulation argument (mean longitude minus its constant). */
  Lambda: number;
}

export function moonRegime(model: MoonModel, tdbDays: number): MoonRegime {
  return tdbDays >= model.window[0] && tdbDays <= model.window[1] ? 'precise' : 'illustrative';
}

function taperAt(model: MoonModel, t: number): { w: number; tc: number } {
  const w0 = model.window[0];
  const w1 = model.window[1];
  const L = model.taper;
  const d = t < w0 ? w0 - t : t > w1 ? t - w1 : 0;
  if (d <= 0) return { w: 1, tc: t - model.epoch };
  const x = d / L;
  const w = x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x));
  const s = x >= 1 ? 0.5 * L : L * (x - 0.5 * x * x);
  return { w, tc: (t < w0 ? w0 - s : w1 + s) - model.epoch };
}

function realSum(terms: ReadonlyArray<Term3 | Term4>, tau: number, Lambda: number): number {
  let s = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const k = T.length > 3 ? (T as Term4)[3] : 0;
    const a = T[0] * tau + (k ? k * Lambda : 0);
    s += T[1] * Math.cos(a) + T[2] * Math.sin(a);
  }
  return s;
}

function cplxSum(terms: ReadonlyArray<Term3 | Term4>, tau: number, Lambda: number, out: number[], weight: number): void {
  let re = 0;
  let im = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const k = T.length > 3 ? (T as Term4)[3] : 0;
    const a = T[0] * tau + (k ? k * Lambda : 0);
    const c = Math.cos(a);
    const s = Math.sin(a);
    re += T[1] * c - T[2] * s;
    im += T[1] * s + T[2] * c;
  }
  out[0] += weight * re;
  out[1] += weight * im;
}

/**
 * Equinoctial elements at time t. With `secularOnly` all periodic terms are dropped (the mean
 * precessing orbit, which is also what the model tends to far outside its window).
 */
export function moonElements(model: MoonModel, tdbDays: number, secularOnly = false): MoonElements {
  const tau = tdbDays - model.epoch;
  const tp = taperAt(model, tdbDays);
  const tc = tp.tc;
  const w = secularOnly ? 0 : tp.w;

  const lp = model.l.p;
  let Lambda = lp[1] * tau;
  let pw = tc * tc;
  for (let k = 2; k < lp.length; k++) {
    Lambda += lp[k] * (k === 2 && model.l.q ? tau * tau : pw);
    pw *= tc;
  }
  if (w) Lambda += w * realSum(model.l.t, tau, 0);
  let lambda = lp[0] + Lambda;
  if (w) lambda += w * realSum(model.l.m, tau, Lambda);

  const ap = model.a.p;
  let a = ap[0];
  pw = tc;
  for (let k = 1; k < ap.length; k++) {
    a += ap[k] * pw;
    pw *= tc;
  }
  if (w) a += w * realSum(model.a.m, tau, Lambda);

  const z = [0, 0];
  const s = [0, 0];
  const blocks = [model.z, model.s];
  const outs = [z, s];
  for (let b = 0; b < 2; b++) {
    const B = blocks[b];
    const out = outs[b];
    let pp = 1;
    for (let k = 0; k < B.p.length; k++) {
      out[0] += B.p[k][0] * pp;
      out[1] += B.p[k][1] * pp;
      pp *= tc;
    }
    cplxSum(B.f, tau, 0, out, 1);
    if (w) cplxSum(B.m, tau, Lambda, out, w);
  }
  return { a, lambda, k: z[0], h: z[1], q: s[0], p: s[1], w, Lambda };
}

/** Position in the fit frame from equinoctial elements (generalised Kepler equation). */
function keplerPosition(el: MoonElements, out: number[]): number[] {
  const { a, lambda, k, h, q, p } = el;
  let F = lambda;
  for (let it = 0; it < 50; it++) {
    const sF = Math.sin(F);
    const cF = Math.cos(F);
    const d = (F - k * sF + h * cF - lambda) / (1 - k * cF - h * sF);
    F -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  const sF = Math.sin(F);
  const cF = Math.cos(F);
  const beta = 1 / (1 + Math.sqrt(Math.max(0, 1 - h * h - k * k)));
  const X = a * ((1 - h * h * beta) * cF + h * k * beta * sF - k);
  const Y = a * ((1 - k * k * beta) * sF + h * k * beta * cF - h);
  const c = Math.sqrt(Math.max(0, 1 - q * q - p * p));
  out[0] = X * (1 - 2 * p * p) + Y * 2 * q * p;
  out[1] = X * 2 * q * p + Y * (1 - 2 * q * q);
  out[2] = 2 * c * (Y * q - X * p);
  return out;
}

const rFit = [0, 0, 0];
const xy = [0, 0];

/**
 * Position of the moon relative to its centre, ecliptic J2000 [x, y, z], km.
 * Always finite; use moonRegime() to know whether t is inside the precisely fitted window.
 */
export function evalMoon(
  model: MoonModel,
  tdbDays: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const el = moonElements(model, tdbDays);
  const r = keplerPosition(el, rFit);
  if (el.w) {
    const tau = tdbDays - model.epoch;
    xy[0] = 0;
    xy[1] = 0;
    cplxSum(model.xy, tau, el.Lambda, xy, el.w);
    r[0] += xy[0];
    r[1] += xy[1];
    r[2] += el.w * realSum(model.zz, tau, el.Lambda);
  }
  const F = model.frame;
  out[0] = F[0] * r[0] + F[1] * r[1] + F[2] * r[2];
  out[1] = F[3] * r[0] + F[4] * r[1] + F[5] * r[2];
  out[2] = F[6] * r[0] + F[7] * r[1] + F[8] * r[2];
  return out;
}

/** Velocity relative to the centre (ecliptic J2000), km/day, by a central difference. */
export function evalMoonVelocity(
  model: MoonModel,
  tdbDays: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const dt = Math.min(1e-3, model.orbit.period / 5000);
  const p1 = evalMoon(model, tdbDays + dt, [0, 0, 0]);
  const p0 = evalMoon(model, tdbDays - dt, [0, 0, 0]);
  out[0] = (p1[0] - p0[0]) / (2 * dt);
  out[1] = (p1[1] - p0[1]) / (2 * dt);
  out[2] = (p1[2] - p0[2]) / (2 * dt);
  return out;
}

export interface MoonEllipse {
  /** Semi-major axis, km. */
  a: number;
  e: number;
  /** Inclination to the ecliptic J2000, radians (> π/2 for retrograde orbits). */
  i: number;
  /** Longitude of the ascending node on the ecliptic J2000, radians. */
  node: number;
  /** Argument of pericentre, radians. */
  argPeri: number;
  /** Mean anomaly at t, radians. */
  meanAnomaly: number;
  /** Period from the mean motion, days. */
  period: number;
  /** Unit orbit normal (direction of the orbital angular momentum), ecliptic J2000. */
  normal: [number, number, number];
  /** Unit vector towards pericentre, ecliptic J2000. */
  periapsis: [number, number, number];
  /** Unit in-plane vector 90° ahead of pericentre (normal × periapsis). */
  qAxis: [number, number, number];
}

/**
 * The ellipse to draw as the orbit line at time t (ecliptic J2000). By default it uses the full
 * elements, so the moon sits on its line (to within the few-km position terms); `secularOnly`
 * gives the smooth mean orbit. Points: a(cos E − e)·periapsis + a√(1−e²) sin E·qAxis.
 */
export function moonEllipse(model: MoonModel, tdbDays: number, secularOnly = false): MoonEllipse {
  const el = moonElements(model, tdbDays, secularOnly);
  const { k, h, q, p } = el;
  const c = Math.sqrt(Math.max(0, 1 - q * q - p * p));
  const f = [1 - 2 * p * p, 2 * q * p, -2 * c * p];
  const g = [2 * q * p, 1 - 2 * q * q, 2 * c * q];
  const wv = [2 * c * p, -2 * c * q, 1 - 2 * (q * q + p * p)];
  const e = Math.hypot(k, h);
  const varpi = Math.atan2(h, k);
  const cw = Math.cos(varpi);
  const sw = Math.sin(varpi);
  const pf = [f[0] * cw + g[0] * sw, f[1] * cw + g[1] * sw, f[2] * cw + g[2] * sw];
  const F = model.frame;
  const rot = (v: number[]): [number, number, number] => [
    F[0] * v[0] + F[1] * v[1] + F[2] * v[2],
    F[3] * v[0] + F[4] * v[1] + F[5] * v[2],
    F[6] * v[0] + F[7] * v[1] + F[8] * v[2],
  ];
  const normal = rot(wv);
  const periapsis = rot(pf);
  const qAxis: [number, number, number] = [
    normal[1] * periapsis[2] - normal[2] * periapsis[1],
    normal[2] * periapsis[0] - normal[0] * periapsis[2],
    normal[0] * periapsis[1] - normal[1] * periapsis[0],
  ];
  const i = Math.acos(Math.max(-1, Math.min(1, normal[2])));
  // ascending node = ẑ × normal (x axis if the orbit lies in the ecliptic)
  let nx = -normal[1];
  let ny = normal[0];
  const nn = Math.hypot(nx, ny);
  if (nn < 1e-12) {
    nx = 1;
    ny = 0;
  } else {
    nx /= nn;
    ny /= nn;
  }
  const node = Math.atan2(ny, nx);
  // argument of pericentre: angle from the node to pericentre, positive along the motion
  const cosw = nx * periapsis[0] + ny * periapsis[1];
  const sinw = normal[0] * (ny * periapsis[2]) - normal[1] * (nx * periapsis[2]) + normal[2] * (nx * periapsis[1] - ny * periapsis[0]);
  const argPeri = Math.atan2(sinw, cosw);
  const period = (2 * Math.PI) / Math.abs(model.l.p[1]);
  return { a: el.a, e, i, node, argPeri, meanAnomaly: el.lambda - varpi, period, normal, periapsis, qAxis };
}

/** Index a parsed moons.json by moon id, checking the format tag. */
export function indexMoonCatalog(catalog: MoonCatalog): Record<string, MoonModel> {
  if (!catalog || typeof catalog.format !== 'string' || !catalog.format.startsWith('lightspeed-moons/')) {
    throw new Error('moons.json: unexpected format');
  }
  const out: Record<string, MoonModel> = {};
  for (const m of catalog.moons) out[m.id] = m;
  return out;
}
