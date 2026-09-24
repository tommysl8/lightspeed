/**
 * Two-body orbital mechanics: Kepler's equation, osculating orbits from state vectors, and
 * universal-variable propagation (works for ellipses and hyperbolas alike).
 */
import { type Vec3, add, cross, dot, length, normalize, scale, sub } from './vec';

const TAU = Math.PI * 2;

/** Solve Kepler's equation M = E − e sin E for the eccentric anomaly E (0 ≤ e < 1). */
export function solveKepler(M: number, e: number): number {
  const m = ((M % TAU) + TAU) % TAU;
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - m;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e sinh H − H for H (e > 1). */
export function solveKeplerHyperbolic(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let i = 0; i < 80; i++) {
    const f = e * Math.sinh(H) - H - M;
    const d = f / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(H))) break;
  }
  return H;
}

/** Osculating orbit derived from a state vector: everything needed to draw it through the body. */
export interface Orbit {
  /** Semi-major axis, km. Negative for a hyperbola. */
  a: number;
  /** Semi-minor axis, km (always positive): a√(1−e²), or |a|√(e²−1) for a hyperbola. */
  b: number;
  e: number;
  /** Inclination, ascending node, argument of periapsis (radians; relative to the xy-plane). */
  i: number;
  node: number;
  argPeri: number;
  /** Unit vector toward periapsis. */
  P: Vec3;
  /** Unit vector 90° ahead of P in the direction of motion. */
  Q: Vec3;
  /** Unit orbit normal (angular momentum direction). */
  W: Vec3;
  /** Current eccentric anomaly E (ellipse) or hyperbolic anomaly H (hyperbola). */
  anomaly: number;
  /** Current mean anomaly. */
  meanAnomaly: number;
  /** Mean motion, rad/s. */
  meanMotion: number;
  /** Orbital period, s (Infinity for open orbits). */
  period: number;
  hyperbolic: boolean;
}

/**
 * Osculating orbit from position r (km) and velocity v (km/s) relative to the central body.
 * Uses whatever Cartesian frame r and v are given in; i/node/argPeri refer to its xy-plane.
 */
export function stateToOrbit(r: Vec3, v: Vec3, mu: number): Orbit {
  const rm = length(r);
  const v2 = dot(v, v);
  const h = cross(r, v);
  const W = normalize(h);
  const eVec = scale(sub(scale(r, v2 - mu / rm), scale(v, dot(r, v))), 1 / mu);
  const e = length(eVec);
  const energy = v2 / 2 - mu / rm;
  const a = -mu / (2 * energy);
  const hyperbolic = e >= 1;

  // Periapsis direction (fall back to the current radius for a near-circular orbit).
  const P = e > 1e-10 ? scale(eVec, 1 / e) : normalize(r);
  const Q = normalize(cross(W, P));
  const nu = Math.atan2(dot(r, Q), dot(r, P));

  let anomaly: number;
  let meanAnomaly: number;
  let b: number;
  if (!hyperbolic) {
    anomaly = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    meanAnomaly = anomaly - e * Math.sin(anomaly);
    b = a * Math.sqrt(1 - e * e);
  } else {
    anomaly = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    meanAnomaly = e * Math.sinh(anomaly) - anomaly;
    b = Math.abs(a) * Math.sqrt(e * e - 1);
  }
  const meanMotion = Math.sqrt(mu / Math.abs(a) ** 3);

  const i = Math.acos(Math.max(-1, Math.min(1, W.z)));
  const nodeVec = { x: -h.y, y: h.x, z: 0 };
  const nodeLen = length(nodeVec);
  const node = nodeLen > 1e-12 ? Math.atan2(nodeVec.y, nodeVec.x) : 0;
  let argPeri = 0;
  if (nodeLen > 1e-12 && e > 1e-10) {
    const nHat = scale(nodeVec, 1 / nodeLen);
    argPeri = Math.atan2(dot(cross(nHat, P), W), dot(nHat, P));
  }

  return {
    a,
    b,
    e,
    i,
    node: (node + TAU) % TAU,
    argPeri: (argPeri + TAU) % TAU,
    P,
    Q,
    W,
    anomaly,
    meanAnomaly,
    meanMotion,
    period: hyperbolic ? Infinity : TAU / meanMotion,
    hyperbolic,
  };
}

/** Position on an orbit (relative to the focus) at eccentric or hyperbolic anomaly `anomaly`. */
export function orbitPosition(o: Orbit, anomaly: number): Vec3 {
  if (!o.hyperbolic) {
    return add(scale(o.P, o.a * (Math.cos(anomaly) - o.e)), scale(o.Q, o.b * Math.sin(anomaly)));
  }
  return add(scale(o.P, Math.abs(o.a) * (o.e - Math.cosh(anomaly))), scale(o.Q, o.b * Math.sinh(anomaly)));
}

/**
 * Offset from the body's current position to the point at anomaly (current + dA). Written
 * with half-angle identities so small offsets stay precise in float32 (the orbit-line shader
 * uses the same form).
 */
export function orbitOffset(o: Orbit, dA: number): Vec3 {
  const mid = o.anomaly + dA / 2;
  if (!o.hyperbolic) {
    const s = Math.sin(dA / 2);
    return add(scale(o.P, -2 * o.a * Math.sin(mid) * s), scale(o.Q, 2 * o.b * Math.cos(mid) * s));
  }
  const s = Math.sinh(dA / 2);
  return add(scale(o.P, -2 * Math.abs(o.a) * Math.sinh(mid) * s), scale(o.Q, 2 * o.b * Math.cosh(mid) * s));
}

/** Classical elements → heliocentric position (same math as the belt vertex shader). */
export function elementsToPosition(
  a: number,
  e: number,
  i: number,
  node: number,
  argPeri: number,
  M: number,
): Vec3 {
  const E = solveKepler(M, e);
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(argPeri);
  const sw = Math.sin(argPeri);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  return {
    x: x * (cw * cn - sw * sn * ci) - y * (sw * cn + cw * sn * ci),
    y: x * (cw * sn + sw * cn * ci) + y * (cw * cn * ci - sw * sn),
    z: x * (sw * si) + y * (cw * si),
  };
}

// ─── Universal-variable propagation (Curtis, Orbital Mechanics for Engineering Students, §3.7) ──

function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/** Propagate a two-body state (r km, v km/s) by dt seconds under gravitational parameter mu. */
export function propagateTwoBody(r0: Vec3, v0: Vec3, dt: number, mu: number): { r: Vec3; v: Vec3 } {
  if (dt === 0) return { r: { ...r0 }, v: { ...v0 } };
  const r0m = length(r0);
  const v0m2 = dot(v0, v0);
  const vr0 = dot(r0, v0) / r0m;
  const alpha = 2 / r0m - v0m2 / mu;
  const sqrtMu = Math.sqrt(mu);

  let chi = sqrtMu * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = (sqrtMu * dt) / r0m;
  for (let k = 0; k < 200; k++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const F =
      ((r0m * vr0) / sqrtMu) * chi * chi * C + (1 - alpha * r0m) * chi ** 3 * S + r0m * chi - sqrtMu * dt;
    const dF =
      ((r0m * vr0) / sqrtMu) * chi * (1 - alpha * chi * chi * S) + (1 - alpha * r0m) * chi * chi * C + r0m;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(chi))) break;
  }

  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - ((chi * chi) / r0m) * C;
  const g = dt - (chi ** 3 * S) / sqrtMu;
  const r = add(scale(r0, f), scale(v0, g));
  const rm = length(r);
  const fDot = (sqrtMu / (rm * r0m)) * (alpha * chi ** 3 * S - chi);
  const gDot = 1 - ((chi * chi) / rm) * C;
  const v = add(scale(r0, fDot), scale(v0, gDot));
  return { r, v };
}
