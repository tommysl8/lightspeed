/**
 * Fitted orbit models for planetary moons (public/data/moons.json, built by
 * scripts/build-moons.mjs from JPL Horizons vectors). See staging/phase2/moons.md.
 *
 * Every model gives the position of a moon RELATIVE TO ITS CENTRE (the planet's centre, or the
 * Pluto–Charon barycentre for Charon, Nix, Hydra and Pluto itself) in the ecliptic J2000 frame,
 * in km. Time is TDB days since J2000.0 (JD 2451545.0 TDB); astronomy-engine's AstroTime.tt is
 * within 2 ms of TDB and can be passed directly.
 *
 * Model: a precessing Keplerian ellipse in equinoctial elements, written in a per-moon reference
 * plane (its Laplace plane or its planet's equator), plus periodic terms on each element and a
 * small set of periodic position corrections:
 *   a(t)      = poly(τc) + w·Σ [c cos ντ + s sin ντ]
 *   λ(t)      = l0 + l1 τ + Σ_{k≥2} l_k τc^k + w·Σ [...]
 *   k + i h   = poly(τc) + Σ_free C e^{iντ} + w·Σ C e^{iντ}      (e·e^{iϖ})
 *   q + i p   = poly(τc) + Σ_free C e^{iντ} + w·Σ C e^{iντ}      (sin(i/2)·e^{iΩ})
 *   r_fit     = Kepler(a, λ, k, h, q, p) + w·[Σ C e^{iντ} (x + i y),  Σ (c cos + s sin) (z)]
 *   r_ecl     = F · r_fit
 * with τ = t − epoch. Inside the fitted window τc = τ and w = 1 ("precise"). Outside it the
 * periodic terms fade out smoothly (w → 0 over `taper` days) and the polynomial parts freeze
 * (τc is a C¹ clamp), leaving the mean precessing orbit ("illustrative").
 */

export type MoonRegime = 'precise' | 'illustrative';

/** [ν rad/day, cos amplitude, sin amplitude] */
export type RealTerm = [number, number, number];
/** [ν rad/day, Re C, Im C] for C·e^{iντ} */
export type ComplexTerm = [number, number, number];

export interface MoonModel {
  id: string;
  name: string;
  /** Body the position is relative to: a planet id, or 'pluto-barycenter'. */
  centre: string;
  /** Epoch of τ = 0, TDB days since J2000. */
  epoch: number;
  /** Fitted (precise) window, TDB days since J2000. */
  window: [number, number];
  /** Fade length outside the window, days. */
  taper: number;
  /** Fit frame → ecliptic J2000 rotation, row-major 3×3. */
  frame: number[];
  a: { p: number[]; t: RealTerm[] };
  l: { p: number[]; t: RealTerm[] };
  z: { p: [number, number][]; f: ComplexTerm[]; t: ComplexTerm[] };
  s: { p: [number, number][]; f: ComplexTerm[]; t: ComplexTerm[] };
  xy: ComplexTerm[];
  zz: RealTerm[];
  /** Effective GM of the fit (km³/day²); only used for velocities and periods. */
  mu: number;
  synchronous: boolean;
  orbit: {
    a: number;
    e: number;
    /** Inclination to the model's reference plane, degrees. */
    i: number;
    /** Sidereal period, days. */
    period: number;
    /** Unit normal of the mean orbit (ecliptic J2000) at the model epoch. */
    normal: [number, number, number];
    /** Unit pole of the reference plane (Laplace plane or equator), ecliptic J2000. */
    refPole: [number, number, number];
    refPlane: string;
  };
  accuracy: {
    /** Max position error vs Horizons over the fitted window, km. */
    maxKm: number;
    rmsKm: number;
    /** Requirement: max(100 km, 5e-4 a). */
    targetKm: number;
  };
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
}

export function moonRegime(model: MoonModel, tdbDays: number): MoonRegime {
  return tdbDays >= model.window[0] && tdbDays <= model.window[1] ? 'precise' : 'illustrative';
}

/** Periodic-term weight and clamped polynomial time τc for time t. */
function taperAt(model: MoonModel, t: number): { w: number; tc: number } {
  const [w0, w1] = model.window;
  const L = model.taper;
  const d = t < w0 ? w0 - t : t > w1 ? t - w1 : 0;
  if (d <= 0) return { w: 1, tc: t - model.epoch };
  const x = d / L;
  const w = x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x));
  const s = x >= 1 ? 0.5 * L : L * (x - 0.5 * x * x);
  return { w, tc: (t < w0 ? w0 - s : w1 + s) - model.epoch };
}

function realSum(terms: RealTerm[], tau: number): number {
  let s = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const a = T[0] * tau;
    s += T[1] * Math.cos(a) + T[2] * Math.sin(a);
  }
  return s;
}

function cplxSum(terms: ComplexTerm[], tau: number, out: [number, number], weight = 1): void {
  let re = 0;
  let im = 0;
  for (let j = 0; j < terms.length; j++) {
    const T = terms[j];
    const a = T[0] * tau;
    const c = Math.cos(a);
    const s = Math.sin(a);
    re += T[1] * c - T[2] * s;
    im += T[1] * s + T[2] * c;
  }
  out[0] += weight * re;
  out[1] += weight * im;
}

/**
 * Equinoctial elements of the model at time t. With `secularOnly` the periodic terms are
 * dropped (the mean precessing orbit).
 */
export function moonElements(model: MoonModel, tdbDays: number, secularOnly = false): MoonElements {
  const tau = tdbDays - model.epoch;
  const tp = taperAt(model, tdbDays);
  const tc = tp.tc;
  const w = secularOnly ? 0 : tp.w;

  const ap = model.a.p;
  let a = ap[0];
  let pw = tc;
  for (let k = 1; k < ap.length; k++) {
    a += ap[k] * pw;
    pw *= tc;
  }
  if (w) a += w * realSum(model.a.t, tau);

  const lp = model.l.p;
  let lambda = lp[0] + lp[1] * tau;
  pw = tc * tc;
  for (let k = 2; k < lp.length; k++) {
    lambda += lp[k] * pw;
    pw *= tc;
  }
  if (w) lambda += w * realSum(model.l.t, tau);

  const z: [number, number] = [0, 0];
  const s: [number, number] = [0, 0];
  const src = [model.z, model.s];
  const dst = [z, s];
  for (let n = 0; n < 2; n++) {
    const S = src[n];
    const out = dst[n];
    let pp = 1;
    for (let k = 0; k < S.p.length; k++) {
      out[0] += S.p[k][0] * pp;
      out[1] += S.p[k][1] * pp;
      pp *= tc;
    }
    cplxSum(S.f, tau, out);
    if (w) cplxSum(S.t, tau, out, w);
  }
  return { a, lambda, k: z[0], h: z[1], q: s[0], p: s[1], w };
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

const scratch = [0, 0, 0];
const scratchXY: [number, number] = [0, 0];

/**
 * Position of the moon relative to its centre, ecliptic J2000 (x, y, z), km.
 * Always finite; check moonRegime() for whether it is inside the precisely fitted window.
 */
export function evalMoon(
  model: MoonModel,
  tdbDays: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const el = moonElements(model, tdbDays);
  const r = keplerPosition(el, scratch);
  if (el.w) {
    const tau = tdbDays - model.epoch;
    scratchXY[0] = 0;
    scratchXY[1] = 0;
    cplxSum(model.xy, tau, scratchXY);
    r[0] += el.w * scratchXY[0];
    r[1] += el.w * scratchXY[1];
    r[2] += el.w * realSum(model.zz, tau);
  }
  const F = model.frame;
  out[0] = F[0] * r[0] + F[1] * r[1] + F[2] * r[2];
  out[1] = F[3] * r[0] + F[4] * r[1] + F[5] * r[2];
  out[2] = F[6] * r[0] + F[7] * r[1] + F[8] * r[2];
  return out;
}

/** Velocity relative to the centre (ecliptic J2000, km/day) by central difference. */
export function evalMoonVelocity(
  model: MoonModel,
  tdbDays: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const dt = Math.min(0.01, model.orbit.period / 2000);
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
  /** Inclination to the ecliptic J2000, radians. */
  i: number;
  /** Longitude of the ascending node on the ecliptic J2000, radians. */
  node: number;
  /** Argument of pericentre from that node, radians. */
  argPeri: number;
  /** Mean anomaly at the requested time, radians. */
  meanAnomaly: number;
  /** Orbital period from the mean motion, days. */
  period: number;
  /** Unit orbit normal, ecliptic J2000. */
  normal: [number, number, number];
  /** Unit vector to pericentre, ecliptic J2000. */
  periapsis: [number, number, number];
  /** Unit vector completing the in-plane basis (normal × periapsis). */
  qAxis: [number, number, number];
}

/**
 * The ellipse to draw as the moon's orbit line at time t, in ecliptic J2000. By default it uses
 * the full elements, so the moon sits on its drawn orbit; `secularOnly` gives the mean orbit.
 * A point on the line: a (cos E − e) periapsis + a √(1−e²) sin E qAxis, E ∈ [0, 2π).
 */
export function moonEllipse(model: MoonModel, tdbDays: number, secularOnly = false): MoonEllipse {
  const el = moonElements(model, tdbDays, secularOnly);
  const { k, h, q, p } = el;
  const c = Math.sqrt(Math.max(0, 1 - q * q - p * p));
  const f = [1 - 2 * p * p, 2 * q * p, -2 * c * p];
  const g = [2 * q * p, 1 - 2 * q * q, 2 * c * q];
  const wv = [2 * c * p, -2 * c * q, 1 - 2 * (q * q + p * p)];
  const e = Math.hypot(k, h);
  const varpi = e > 0 ? Math.atan2(h, k) : 0;
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
  // ascending node direction = ẑ × normal
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
  // argument of pericentre: angle from node to periapsis, measured in the orbit plane
  const cosw = nx * periapsis[0] + ny * periapsis[1];
  const sinw = (normal[1] * 0 - normal[2] * ny) * periapsis[0] + (normal[2] * nx - normal[0] * 0) * periapsis[1] + (normal[0] * ny - normal[1] * nx) * periapsis[2];
  const argPeri = Math.atan2(sinw, cosw);
  const lpRate = model.l.p[1];
  const period = (2 * Math.PI) / Math.abs(lpRate);
  const meanAnomaly = el.lambda - varpi;
  return { a: el.a, e, i, node, argPeri, meanAnomaly, period, normal, periapsis, qAxis };
}

/** Index a parsed moons.json by id. */
export function indexMoonCatalog(catalog: MoonCatalog): Record<string, MoonModel> {
  if (!catalog || typeof catalog.format !== 'string' || !catalog.format.startsWith('lightspeed-moons/')) {
    throw new Error('moons.json: unexpected format');
  }
  const out: Record<string, MoonModel> = {};
  for (const m of catalog.moons) out[m.id] = m;
  return out;
}
