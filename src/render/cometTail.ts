/**
 * Comet tails, as a simple physical model (scene/CometTails.tsx draws them):
 *
 *  Activity. Ices sublimate when sunlight warms the nucleus: water, which drives most comets,
 *  from inside about 3 au. The gas production rate goes roughly as the sunlight, r⁻² (r the
 *  distance from the Sun in au), and falls away steeply outside 3 au, to nothing at 5 au (some
 *  comets, Hale–Bopp among them, stay active further out on CO and CO₂; that is left out). The
 *  brightness also scales with the nucleus's surface area, R² (bigger comets make more gas and
 *  dust): Q ∝ (R / 5 km)² r⁻² S(r), with S a smooth step from 1 at 3 au to 0 at 5 au, and the
 *  tails' brightness saturates as 1 − e^(−Q).
 *
 *  Ion tail. Ions picked up by the solar wind stream away from the Sun at its speed, about
 *  400 km/s, so the tail points along the solar wind as the comet sees it: v_sw r̂ − v_comet
 *  (straight, and a few degrees off the anti-solar direction; Biermann 1951). Its length is
 *  set to 5 × 10⁷ km, typical of what is seen; it thins with distance from the head.
 *
 *  Dust tail. Dust leaves the nucleus with the comet's own velocity and then feels the Sun's
 *  gravity weakened by radiation pressure: μ(1 − β), with β the ratio of radiation pressure
 *  to gravity (about 1 for 0.5 µm grains, 0.1 for 5 µm ones). Each grain then follows a
 *  two-body orbit of its own, computed exactly here: the nucleus is traced back along its
 *  orbit to each release time, and each grain forward from there. Grains of one β form a curve,
 *  a syndyne (Finson & Probstein 1968); several β make the curved fan that lags behind the
 *  comet in its orbital plane. Older dust has spread and dimmed.
 *
 * Not modelled: jets, striae, the gas coma's chemistry, anti-tails from large grains seen
 * edge-on, and outbursts. The tails are illustrative in brightness and exact in direction.
 *
 * All functions write into caller-owned objects: they run every frame for comets on screen.
 */
import { AU_KM, GM_SUN_KM3_S2 } from '../physics/constants';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Inside this distance from the Sun, activity follows r⁻² (au)… */
export const ACTIVITY_FULL_AU = 3;
/** …and outside this, there is none. */
export const ACTIVITY_OFF_AU = 5;
/** Solar wind speed, km/s. */
export const SOLAR_WIND_KM_S = 400;
/** Length of the ion tail, km. */
export const ION_TAIL_KM = 5e7;
/** Radiation-pressure parameters of the dust drawn (β ≤ 1: gravity at least balanced), fine grains last. */
export const DUST_BETAS = [0.06, 0.15, 0.35, 0.65, 1] as const;
/** Oldest dust drawn, s (30 days). */
export const DUST_AGE_S = 30 * 86_400;

/** Relative gas and dust production at `rAu` from the Sun: 1 at 1 au (see the module comment). */
export function cometActivity(rAu: number): number {
  if (!(rAu > 0) || rAu >= ACTIVITY_OFF_AU) return 0;
  const x = Math.min(1, Math.max(0, (ACTIVITY_OFF_AU - rAu) / (ACTIVITY_OFF_AU - ACTIVITY_FULL_AU)));
  const s = x * x * (3 - 2 * x);
  return s / (rAu * rAu);
}

/** How bright the tails are drawn, 0–1, for a nucleus of radius `radiusKm` at `rAu`. */
export function tailBrightness(rAu: number, radiusKm: number): number {
  const q = cometActivity(rAu) * (radiusKm / 5) ** 2;
  return 1 - Math.exp(-q);
}

/**
 * Unit vector along the ion tail: the solar wind as seen from the comet, v_sw r̂ − v, for a
 * comet at heliocentric `r` (km) moving at `v` (km/s).
 */
export function ionTailDirection(r: V3, v: V3, out: V3): V3 {
  const rn = Math.hypot(r.x, r.y, r.z) || 1;
  out.x = (SOLAR_WIND_KM_S * r.x) / rn - v.x;
  out.y = (SOLAR_WIND_KM_S * r.y) / rn - v.y;
  out.z = (SOLAR_WIND_KM_S * r.z) / rn - v.z;
  const n = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= n;
  out.y /= n;
  out.z /= n;
  return out;
}

// ─── Two-body motion (universal variables), allocation-free ──────────────────────────────

const st = { c: 0, s: 0 };
function stumpff(z: number): void {
  if (z > 1e-6) {
    const q = Math.sqrt(z);
    st.c = (1 - Math.cos(q)) / z;
    st.s = (q - Math.sin(q)) / (q * q * q);
  } else if (z < -1e-6) {
    const q = Math.sqrt(-z);
    st.c = (Math.cosh(q) - 1) / -z;
    st.s = (Math.sinh(q) - q) / (q * q * q);
  } else {
    st.c = 0.5 - z / 24 + (z * z) / 720;
    st.s = 1 / 6 - z / 120 + (z * z) / 5040;
  }
}

/**
 * Position after `dt` seconds of two-body motion about the origin with gravitational parameter
 * `mu` (km³/s²), from position `r` (km) and velocity `v` (km/s), into `out`. With mu = 0 the
 * motion is a straight line.
 */
export function keplerPosition(r: V3, v: V3, dt: number, mu: number, out: V3): V3 {
  if (!(mu > 1e-9)) {
    out.x = r.x + v.x * dt;
    out.y = r.y + v.y * dt;
    out.z = r.z + v.z * dt;
    return out;
  }
  const r0 = Math.hypot(r.x, r.y, r.z);
  const vr0 = (r.x * v.x + r.y * v.y + r.z * v.z) / r0;
  const alpha = 2 / r0 - (v.x * v.x + v.y * v.y + v.z * v.z) / mu;
  const sm = Math.sqrt(mu);
  // Starting guess: the elliptic one where it applies, else a straight line.
  let chi = alpha > 0 ? sm * dt * alpha : (Math.sign(dt) * Math.hypot(v.x, v.y, v.z) * Math.abs(dt)) / Math.sqrt(r0);
  if (!Number.isFinite(chi) || chi === 0) chi = (sm * dt) / r0;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi;
    stumpff(z);
    const chi2 = chi * chi;
    const F = ((r0 * vr0) / sm) * chi2 * st.c + (1 - alpha * r0) * chi2 * chi * st.s + r0 * chi - sm * dt;
    const dF = ((r0 * vr0) / sm) * chi * (1 - z * st.s) + (1 - alpha * r0) * chi2 * st.c + r0;
    let step = F / dF;
    if (chi !== 0 && Math.abs(step) > Math.abs(chi)) step = Math.sign(step) * Math.abs(chi) * 0.5;
    chi -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  stumpff(z);
  const f = 1 - ((chi * chi) / r0) * st.c;
  const g = dt - (chi * chi * chi * st.s) / sm;
  out.x = f * r.x + g * v.x;
  out.y = f * r.y + g * v.y;
  out.z = f * r.z + g * v.z;
  return out;
}

/** The velocity after `dt` seconds (for tracing the nucleus back), by a short central difference. */
function keplerState(r: V3, v: V3, dt: number, mu: number, outR: V3, outV: V3): void {
  const h = 60;
  keplerPosition(r, v, dt + h, mu, outV);
  const x1 = outV.x;
  const y1 = outV.y;
  const z1 = outV.z;
  keplerPosition(r, v, dt - h, mu, outV);
  outV.x = (x1 - outV.x) / (2 * h);
  outV.y = (y1 - outV.y) / (2 * h);
  outV.z = (z1 - outV.z) / (2 * h);
  keplerPosition(r, v, dt, mu, outR);
}

/** Where the nucleus was `ageS` seconds ago, and how fast it moved (traced back along its orbit). */
export function releaseState(r: V3, v: V3, ageS: number, outR: V3, outV: V3): void {
  keplerState(r, v, -ageS, GM_SUN_KM3_S2, outR, outV);
}

/**
 * Where a grain of radiation-pressure parameter `beta` (0 < β ≤ 1) released from `releaseR`
 * with `releaseV` is `ageS` seconds later, relative to the nucleus now at `r` (km).
 */
export function grainOffset(r: V3, releaseR: V3, releaseV: V3, beta: number, ageS: number, out: V3): V3 {
  keplerPosition(releaseR, releaseV, ageS, GM_SUN_KM3_S2 * (1 - Math.min(1, beta)), out);
  out.x -= r.x;
  out.y -= r.y;
  out.z -= r.z;
  return out;
}

const release = { x: 0, y: 0, z: 0 };
const releaseV = { x: 0, y: 0, z: 0 };

/**
 * Where dust of radiation-pressure parameter `beta`, released `ageS` seconds ago, is now,
 * relative to the nucleus (km, same axes as `r` and `v`): the nucleus traced back along its
 * orbit, the grain forward under μ☉(1 − β). `r` is the nucleus's position relative to the Sun.
 */
export function dustOffset(r: V3, v: V3, beta: number, ageS: number, out: V3): V3 {
  if (ageS <= 0) {
    out.x = out.y = out.z = 0;
    return out;
  }
  releaseState(r, v, ageS, release, releaseV);
  return grainOffset(r, release, releaseV, beta, ageS, out);
}

/** Distance from the Sun in au. */
export const auOf = (r: V3): number => Math.hypot(r.x, r.y, r.z) / AU_KM;
