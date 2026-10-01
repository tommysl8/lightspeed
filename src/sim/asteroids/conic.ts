/**
 * Two-body motion of the small bodies about the Sun (or the Solar System's barycentre), in float64: the same
 * equations the layer's vertex shader solves in float32 (render/shaders/asteroids.vert.glsl), used for picking,
 * for the body a click or a search registers, and by the tests that hold both to JPL Horizons.
 *
 * Units: au, TDB days, radians; positions in the J2000 ecliptic frame (x to the equinox, z to ecliptic north).
 * Elliptic orbits are given by a and the mean anomaly at the reference epoch; open and near-parabolic ones (the
 * comets) by q and the time of perihelion, which stays well conditioned as e goes to 1.
 */

/** The Gaussian gravitational constant k: GM of the Sun is k² au³/day² (the constant SBDB's elements use). */
export const K_GAUSS = 0.01720209895;

/**
 * GM of the Sun and all the planets (with their moons), in units of the Sun's: a body far beyond the planets
 * moves about the barycentre as if it held all that mass (IAU 2015 / DE440 mass ratios).
 */
export const BARY_MU = 1 + 1 / 1047.348644 + 1 / 3497.9018 + 1 / 22902.98 + 1 / 19412.26 + 1 / 328900.56 + 1 / 408523.72 + 1 / 3098703.6 + 1 / 6023625.5;

const TAU = Math.PI * 2;

export interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

/** Orientation of an orbit: unit vectors to perihelion (P) and 90° ahead of it in the motion (Q). */
export interface Orientation {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
}

export function orientation(inc: number, node: number, peri: number, out: Orientation = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0 }): Orientation {
  const cw = Math.cos(peri);
  const sw = Math.sin(peri);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  out.px = cw * cn - sw * sn * ci;
  out.py = cw * sn + sw * cn * ci;
  out.pz = sw * si;
  out.qx = -sw * cn - cw * sn * ci;
  out.qy = -sw * sn + cw * cn * ci;
  out.qz = cw * si;
  return out;
}

/** E from M for 0 ≤ e < 1 (M any angle): Newton from Danby's starting value, which converges for every e and M. */
export function eccentricAnomaly(M: number, e: number): number {
  let m = M % TAU;
  if (m > Math.PI) m -= TAU;
  else if (m < -Math.PI) m += TAU;
  let E = m + 0.85 * e * Math.sign(Math.sin(m) || 1);
  for (let k = 0; k < 40; k++) {
    const f = E - e * Math.sin(E) - m;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** F from M = e sinh F − F for e > 1. */
export function hyperbolicAnomaly(M: number, e: number): number {
  let F = Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8);
  for (let k = 0; k < 60; k++) {
    const f = e * Math.sinh(F) - F - M;
    const d = f / (e * Math.cosh(F) - 1);
    F -= d;
    if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(F))) break;
  }
  return F;
}

/** tan(ν/2) on a parabola from Barker's equation D + D³/3 = B, in closed form. */
export function barker(B: number): number {
  const y = 1.5 * B;
  const s = Math.cbrt(y + Math.sqrt(y * y + 1));
  return s - 1 / s;
}

/** An elliptic orbit as the asteroid files hold it: a, e, the angles, and the mean anomaly at the reference epoch. */
export interface Elliptic {
  a: number;
  e: number;
  i: number;
  node: number;
  peri: number;
  /** Mean anomaly at the reference epoch, radians. */
  M0: number;
  /** GM in units of the Sun's (1, or BARY_MU about the barycentre). */
  mu: number;
}

/** Any conic as the comet files hold it: q, e, the angles and the time of perihelion (days after the reference epoch). */
export interface Conic {
  q: number;
  e: number;
  i: number;
  node: number;
  peri: number;
  tp: number;
  mu: number;
}

const o = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0 };

function place(x: number, y: number, el: { i: number; node: number; peri: number }, out: Vec3Out): Vec3Out {
  orientation(el.i, el.node, el.peri, o);
  out.x = o.px * x + o.qx * y;
  out.y = o.py * x + o.qy * y;
  out.z = o.pz * x + o.qz * y;
  return out;
}

/** Position `days` after the reference epoch on an elliptic orbit, au (J2000 ecliptic, about the orbit's centre of attraction). */
export function ellipticPosition(el: Elliptic, days: number, out: Vec3Out): Vec3Out {
  const n = (K_GAUSS * Math.sqrt(el.mu)) / (el.a * Math.sqrt(el.a));
  const E = eccentricAnomaly(el.M0 + n * days, el.e);
  return place(el.a * (Math.cos(E) - el.e), el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E), el, out);
}

/**
 * Position `days` after the reference epoch on any conic, au. Elliptic and hyperbolic orbits are written about
 * perihelion (x = q − 2a sin²(E/2), y = √(a q (1 + e)) sin E, and the same with sinh), which keeps float32 exact
 * enough as e → 1; e = 1 exactly is Barker's parabola.
 */
export function conicPosition(el: Conic, days: number, out: Vec3Out): Vec3Out {
  const { q, e } = el;
  const k = K_GAUSS * Math.sqrt(el.mu);
  const dt = days - el.tp;
  let x: number;
  let y: number;
  if (e < 1) {
    const a = q / (1 - e);
    const n = k / (a * Math.sqrt(a));
    const E = eccentricAnomaly(n * dt, e);
    const s = Math.sin(E / 2);
    x = q - 2 * a * s * s;
    y = Math.sqrt(a * q * (1 + e)) * Math.sin(E);
  } else if (e > 1) {
    const a = q / (e - 1);
    const n = k / (a * Math.sqrt(a));
    const F = hyperbolicAnomaly(n * dt, e);
    const s = Math.sinh(F / 2);
    x = q - 2 * a * s * s;
    y = Math.sqrt(a * q * (1 + e)) * Math.sinh(F);
  } else {
    const D = barker((k * dt) / Math.sqrt(2 * q * q * q));
    x = q * (1 - D * D);
    y = 2 * q * D;
  }
  return place(x, y, el, out);
}

/** Velocity on a conic, au/day (finite differences are enough for what uses it: the barycentric conversion). */
export function conicVelocity(el: Conic, days: number, out: Vec3Out): Vec3Out {
  const h = 1e-3;
  const a = conicPosition(el, days + h, { x: 0, y: 0, z: 0 });
  const b = conicPosition(el, days - h, { x: 0, y: 0, z: 0 });
  out.x = (a.x - b.x) / (2 * h);
  out.y = (a.y - b.y) / (2 * h);
  out.z = (a.z - b.z) / (2 * h);
  return out;
}

/** The conic through a state (au, au/day, `days` after the reference epoch) about a centre of GM mu (Sun units). */
export function conicFromState(r: Vec3Out, v: Vec3Out, days: number, mu: number): Conic {
  const gm = K_GAUSS * K_GAUSS * mu;
  const rm = Math.hypot(r.x, r.y, r.z);
  const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
  const rv = r.x * v.x + r.y * v.y + r.z * v.z;
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  const hz = r.x * v.y - r.y * v.x;
  const h = Math.hypot(hx, hy, hz);
  const ex = ((v2 - gm / rm) * r.x - rv * v.x) / gm;
  const ey = ((v2 - gm / rm) * r.y - rv * v.y) / gm;
  const ez = ((v2 - gm / rm) * r.z - rv * v.z) / gm;
  const e = Math.hypot(ex, ey, ez);
  const q = (h * h) / gm / (1 + e);
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));
  const node = Math.atan2(hx, -hy);
  // Argument of perihelion: the angle from the node to the perihelion direction, in the orbit plane.
  const nx = Math.cos(node);
  const ny = Math.sin(node);
  const wx = hx / h;
  const wy = hy / h;
  const wz = hz / h;
  // m = w × n, 90° ahead of the node in the plane
  const mx = wy * 0 - wz * ny;
  const my = wz * nx - wx * 0;
  const mz = wx * ny - wy * nx;
  const peri = Math.atan2((ex * mx + ey * my + ez * mz) / e, (ex * nx + ey * ny) / e);
  // True anomaly now, then the time since perihelion.
  const nu = Math.atan2(((hx * (ey * r.z - ez * r.y) + hy * (ez * r.x - ex * r.z) + hz * (ex * r.y - ey * r.x)) / h) / e, (ex * r.x + ey * r.y + ez * r.z) / e);
  const k = K_GAUSS * Math.sqrt(mu);
  let since: number;
  if (e < 1) {
    const a = q / (1 - e);
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    since = (E - e * Math.sin(E)) / (k / (a * Math.sqrt(a)));
  } else if (e > 1) {
    const a = q / (e - 1);
    const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    since = (e * Math.sinh(F) - F) / (k / (a * Math.sqrt(a)));
  } else {
    const D = Math.tan(nu / 2);
    since = (Math.sqrt(2 * q * q * q) * (D + (D * D * D) / 3)) / k;
  }
  const wrap = (x: number) => ((x % TAU) + TAU) % TAU;
  return { q, e, i, node: wrap(node), peri: wrap(peri), tp: days - since, mu };
}

// ─── Brightness ──────────────────────────────────────────────────────────────────────────────

/** The slope parameter of the H, G system for every asteroid: 0.15, the IAU's standard value where none is measured. */
export const SLOPE_G = 0.15;

/**
 * The phase term of the IAU H, G magnitude system (Bowell et al. 1989), magnitudes added at phase angle `alpha`
 * (radians; 0 at opposition): −2.5 log10[(1 − G) Φ1 + G Φ2].
 */
export function phaseMagnitude(alpha: number): number {
  const t = Math.tan(Math.min(alpha, 3.1) / 2);
  const p1 = Math.exp(-3.33 * Math.pow(t, 0.63));
  const p2 = Math.exp(-1.87 * Math.pow(t, 1.22));
  return -2.5 * Math.log10((1 - SLOPE_G) * p1 + SLOPE_G * p2);
}

/** Apparent V of an asteroid of absolute magnitude H, r au from the Sun and delta au from the observer, at phase angle alpha. */
export function asteroidMagnitude(H: number, r: number, delta: number, alpha: number): number {
  return H + 5 * Math.log10(r * delta) + phaseMagnitude(alpha);
}

/** Total magnitude of a comet (nucleus and coma) from JPL's M1 and K1: M1 + 5 log10 Δ + K1 log10 r. */
export function cometMagnitude(M1: number, K1: number, r: number, delta: number): number {
  return M1 + 5 * Math.log10(delta) + K1 * Math.log10(r);
}
