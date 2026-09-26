/**
 * The cosmic microwave background (CMB) seen from a moving ship.
 *
 * The CMB is a blackbody at T₀ = 2.72548 K, isotropic in its own rest frame. A blackbody seen
 * with Doppler factor D is a blackbody at D·T₀, so a ship moving through it with rapidity φ sees
 * T′(θ′) = T₀ / (γ(1 − β cos θ′)), from T₀e^φ dead ahead to T₀e^−φ behind. At rest 2.7 K emits
 * no visible light at all (about e⁻⁶⁸⁰⁰ of the Sun's surface brightness). At γ ≈ 1000 the spot
 * ahead reaches the Sun's temperature, and at γ = 10⁴ it is 5.5 × 10⁴ K: in intergalactic
 * space it becomes the brightest thing in the sky, a blue-white point dead ahead.
 *
 * Radiometry is the same as the Sun's disc: a radiance is the visible luminance of the
 * blackbody at T′ over that of a 5,772 K blackbody, times the renderer's Sun-surface radiance.
 *
 * Sources
 *  - T₀: Fixsen (2009), "The Temperature of the Cosmic Microwave Background", ApJ 707, 916.
 *  - The Sun's motion relative to the CMB (the dipole): Planck Collaboration (2020), "Planck
 *    2018 results. I. Overview", A&A 641, A1, arXiv:1807.06205, Table 3.
 */
import { AU_KM, C_KM_S, SUN_RADIUS_KM, SUN_VMAG_AT_1AU } from './constants';
import { blackbodyLut, sampleBlackbody, type BlackbodySample } from './blackbody';
import type { Vec3 } from './vec';

/** CMB monopole temperature today, K (Fixsen 2009: 2.72548 ± 0.00057 K). */
export const T_CMB_K = 2.72548;
/** The Sun's speed relative to the CMB, km/s (Planck 2018 I: 369.82 ± 0.11 km/s). */
export const CMB_DIPOLE_KM_S = 369.82;
/** Direction of that motion, galactic longitude and latitude, degrees (Planck 2018 I). */
export const CMB_DIPOLE_L_DEG = 264.021;
export const CMB_DIPOLE_B_DEG = 48.253;
/** Rapidity of the Sun's motion through the CMB. */
export const CMB_DIPOLE_PHI = Math.atanh(CMB_DIPOLE_KM_S / C_KM_S);

/**
 * CMB temperature dead ahead for rapidity φ relative to the CMB: T₀e^φ (= T₀√((1+β)/(1−β))).
 * The Sun's own motion changes φ by at most ±0.0012, so the ship's rapidity in the Sun's frame
 * is a fine argument for a readout.
 */
export function cmbForwardTemperature(phi: number, T0: number = T_CMB_K): number {
  return T0 * Math.exp(phi);
}

export interface CmbMotion {
  /** Rapidity relative to the CMB. */
  phi: number;
  /** Direction of motion through the CMB in the ship's frame (world axes; unit). */
  dir: Vec3;
}

/**
 * The ship's motion through the CMB, from its motion in the Sun's frame (rapidity φ along
 * `shipDir`) and the Sun's through the CMB (rapidity ψ along `sunDir`). Composed with
 * 4-velocities in float64, so it is exact from rest to γ = 10¹⁷:
 *   the CMB's 4-velocity in the Sun's frame  U = (cosh ψ, −sinh ψ ŝ)
 *   boosted into the ship's frame            U′₀ = cosh φ U₀ − sinh φ (n·U)
 *                                             U′ = U + ((cosh φ − 1)(n·U) − sinh φ U₀) n
 * The CMB then streams past the ship along U′, so the ship moves through it along −U′, with
 * rapidity asinh |U′|. The ship's frame shares the world axes (a pure boost from the Sun's
 * frame), the same axes the renderer's pixel directions use.
 */
export function motionThroughCmb(shipDir: Vec3, phi: number, sunDir: Vec3, psi: number, out: CmbMotion = { phi: 0, dir: { x: 0, y: 0, z: 0 } }): CmbMotion {
  const sh = Math.sinh(psi);
  const U0 = Math.cosh(psi);
  const Ux = -sh * sunDir.x;
  const Uy = -sh * sunDir.y;
  const Uz = -sh * sunDir.z;
  const nU = shipDir.x * Ux + shipDir.y * Uy + shipDir.z * Uz;
  const s = Math.sinh(phi / 2);
  const k = 2 * s * s * nU - Math.sinh(phi) * U0; // (cosh φ − 1) written without cancellation
  const px = Ux + k * shipDir.x;
  const py = Uy + k * shipDir.y;
  const pz = Uz + k * shipDir.z;
  const len = Math.hypot(px, py, pz);
  out.phi = Math.asinh(len);
  if (len > 0) {
    out.dir.x = -px / len;
    out.dir.y = -py / len;
    out.dir.z = -pz / len;
  } else {
    out.dir.x = shipDir.x;
    out.dir.y = shipDir.y;
    out.dir.z = shipDir.z;
  }
  return out;
}

/**
 * ln of the CMB's radiance seen with Doppler factor e^lnD relative to the Sun's surface
 * (visible luminance of a blackbody at D·T₀ over one at 5,772 K). The same numbers the remap
 * shader computes per pixel.
 */
export function cmbLnRadiance(lnD: number, T0: number = T_CMB_K): number {
  return sampleBlackbody(Math.log(T0) + lnD, sample).lnY;
}
const sample: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

// ─── The unresolved hot spot ─────────────────────────────────────────────────────────────
//
// From γ ≈ 200 (at 1080p and a 50° view) the visible part of the CMB is a spot dead ahead only
// a pixel or so in radius (half a pixel at γ = 1000), so, like a planet too small to resolve,
// it is drawn as a point source with its total flux. Below γ ≈ 30 it is resolved in the remap
// pass, and in between the two are crossfaded. With
// μ = cos θ′ and D = 1/(γ(1 − βμ)), dμ = dD/(γβ D²), so the flux over the whole sky is
//   F = ∫ I(D) dΩ = (2π/sinh φ) ∫ I(D) dD/D² = (2π T₀/sinh φ) [G(T₀e^φ) − G(T₀e^−φ)],
//   G(T) = ∫₀^T Y(t)/t² dt = ∫ Y(t)/t d(ln t),
// with Y relative to the Sun's surface, so F comes out in "Sun-surface radiance × steradians".
// G is tabulated once on the blackbody table's grid; beyond it Y/t tends to a constant
// (Rayleigh–Jeans), so G grows linearly in ln T.

interface GTables {
  /** Cumulative ∫ (Y/t) d ln t, and the same weighted by the colour's r, g, b. */
  G: Float64Array;
  Gr: Float64Array;
  Gg: Float64Array;
  Gb: Float64Array;
  /** Y/t at the hot end (the Rayleigh–Jeans constant), and the colour there. */
  A: number;
  rgbHot: [number, number, number];
}
let gCache: GTables | null = null;

function gTables(): GTables {
  if (gCache) return gCache;
  const { data, size, lnTMin, lnTMax } = blackbodyLut();
  const du = (lnTMax - lnTMin) / (size - 1);
  const G = new Float64Array(size);
  const Gr = new Float64Array(size);
  const Gg = new Float64Array(size);
  const Gb = new Float64Array(size);
  const f = (i: number) => Math.exp(data[i * 4 + 3] - (lnTMin + du * i));
  let prev = f(0);
  for (let i = 1; i < size; i++) {
    const cur = f(i);
    const w0 = 0.5 * du * prev;
    const w1 = 0.5 * du * cur;
    const a = (i - 1) * 4;
    const b = i * 4;
    G[i] = G[i - 1] + w0 + w1;
    Gr[i] = Gr[i - 1] + w0 * data[a] + w1 * data[b];
    Gg[i] = Gg[i - 1] + w0 * data[a + 1] + w1 * data[b + 1];
    Gb[i] = Gb[i - 1] + w0 * data[a + 2] + w1 * data[b + 2];
    prev = cur;
  }
  const last = (size - 1) * 4;
  gCache = { G, Gr, Gg, Gb, A: prev, rgbHot: [data[last], data[last + 1], data[last + 2]] };
  return gCache;
}

/** G(T) and its colour-weighted versions at ln T (0 below the table: Y there is ~e⁻¹⁸⁰⁰). */
function gAt(lnT: number, out: [number, number, number, number]): void {
  const { G, Gr, Gg, Gb, A, rgbHot } = gTables();
  const { size, lnTMin, lnTMax } = blackbodyLut();
  if (lnT <= lnTMin) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  if (lnT >= lnTMax) {
    const extra = A * (lnT - lnTMax);
    const n = size - 1;
    out[0] = G[n] + extra;
    out[1] = Gr[n] + extra * rgbHot[0];
    out[2] = Gg[n] + extra * rgbHot[1];
    out[3] = Gb[n] + extra * rgbHot[2];
    return;
  }
  const x = ((lnT - lnTMin) / (lnTMax - lnTMin)) * (size - 1);
  const i = Math.min(Math.floor(x), size - 2);
  const t = x - i;
  out[0] = G[i] + (G[i + 1] - G[i]) * t;
  out[1] = Gr[i] + (Gr[i + 1] - Gr[i]) * t;
  out[2] = Gg[i] + (Gg[i + 1] - Gg[i]) * t;
  out[3] = Gb[i] + (Gb[i + 1] - Gb[i]) * t;
}

/** Solid angle of the Sun's disc from 1 au, sr: the flux scale of V = −26.74. */
const SUN_DISC_SR = Math.PI * (SUN_RADIUS_KM / AU_KM) ** 2;

export interface CmbSpot {
  /** ln of the total visible flux, in Sun-surface radiance × sr (−Infinity when none). */
  lnFlux: number;
  /** Apparent visual magnitude of the whole spot (before exposure). */
  magnitude: number;
  /** Flux-weighted linear-sRGB colour, luminance 1. */
  rgb: [number, number, number];
  /**
   * Angular radius at which the spot's visible brightness has fallen by a factor e, rad: the
   * scale that decides whether it is resolved.
   */
  coreRadius: number;
}

const hi: [number, number, number, number] = [0, 0, 0, 0];
const lo: [number, number, number, number] = [0, 0, 0, 0];
const s1: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };
const s2: BlackbodySample = { r: 0, g: 0, b: 0, lnY: 0 };

/** Total flux, colour and size of the CMB as seen at rapidity φ through it. Allocation-free with `out`. */
export function cmbSpot(phi: number, T0: number = T_CMB_K, out?: CmbSpot): CmbSpot {
  const o = out ?? { lnFlux: -Infinity, magnitude: Infinity, rgb: [1, 1, 1], coreRadius: Math.PI };
  const lnT0 = Math.log(T0);
  const lnTMax = lnT0 + phi;
  // How steeply brightness falls with temperature at the hottest point sets the spot's size:
  // T(θ′) ≈ T_max/(1 + e^2φ sin²(θ′/2)), so Y drops by e where n ln(1 + e^2φ s²) = 1.
  const n = Math.max(1e-3, (sampleBlackbody(lnTMax + 0.01, s1).lnY - sampleBlackbody(lnTMax - 0.01, s2).lnY) / 0.02);
  o.coreRadius = Math.min(Math.PI, 2 * Math.asin(Math.min(1, Math.exp(-phi) * Math.sqrt(Math.expm1(1 / n)))));
  if (!(phi > 0) || s1.lnY < -80) {
    // At rest the CMB is uniform over the sky and far too cold to see.
    const Y = sampleBlackbody(lnT0, s1).lnY;
    o.lnFlux = Y < -80 ? -Infinity : Math.log(4 * Math.PI) + Y;
    o.rgb[0] = s1.r;
    o.rgb[1] = s1.g;
    o.rgb[2] = s1.b;
  } else {
    gAt(lnTMax, hi);
    gAt(lnT0 - phi, lo);
    const dG = hi[0] - lo[0];
    o.lnFlux = dG > 0 ? Math.log(2 * Math.PI * T0) - Math.log(Math.sinh(phi)) + Math.log(dG) : -Infinity;
    if (dG > 0) {
      o.rgb[0] = (hi[1] - lo[1]) / dG;
      o.rgb[1] = (hi[2] - lo[2]) / dG;
      o.rgb[2] = (hi[3] - lo[3]) / dG;
    }
  }
  o.magnitude = Number.isFinite(o.lnFlux) ? SUN_VMAG_AT_1AU - (2.5 / Math.LN10) * (o.lnFlux - Math.log(SUN_DISC_SR)) : Infinity;
  return o;
}
