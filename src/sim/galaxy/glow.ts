/**
 * The Galaxy model's light near the camera, as a smooth glow instead of particles.
 *
 * Each particle of the model stands for a few hundred thousand suns, so near the camera there are
 * few of them, each seen hundreds of parsecs wide: drawn as splats they are either faded out (the
 * nearest) or drawn by lot, a few of them very bright (render/shaders/galaxy.vert.glsl). Seen from
 * inside the disc that turns the band into a dim field with rare bright blobs, much darker where
 * it counts than the model it stands for. The discs and the young arm stars are smooth laws of the
 * model (model.json), so their light near the camera is worked out from those laws instead, along
 * each line of sight through the model's dust (render/shaders/galaxyGlow.frag.glsl), and their
 * particles take over further out: the glow holds a population's light closer than s0, its
 * particles hold it beyond s1, and the two cross over between (a smoothstep in distance), so the
 * sum is the model's light at every distance. The H II regions and the clusters are single objects
 * and stay splats.
 *
 * Everything here is in frame G (sim/galaxy/frames.ts), kpc, and luminosities in L☉ (V band).
 * nearGlow is the shader's integration in TypeScript, for the tests.
 */
import { blackbodyRgb, bvToTemperature } from '../../physics/blackbody';
import { armRadius, armStrength, armWidth, createGalaxyModel, type GalaxyModel, type GalaxyModelJson } from './model';
import type { Vec3 } from './frames';

/** Population indices (sim/galaxy/particles.ts GALAXY_POPULATIONS). */
export const THIN_DISC = 0;
export const YOUNG_ARM_STARS = 1;
export const THICK_DISC = 3;

/** The thin and thick discs: glow nearer than the first distance, particles beyond the second (kpc). */
export const GLOW_DISC_RANGE_KPC: readonly [number, number] = [2, 4];
/** The young arm stars (smaller particles, so the particles can take over sooner). */
export const GLOW_YOUNG_RANGE_KPC: readonly [number, number] = [1, 2];

/** The share of a population's light at distance d (kpc) that its particles draw; the glow draws the rest. */
export function particleShare(d: number, range: readonly [number, number]): number {
  const t = Math.min(1, Math.max(0, (d - range[0]) / (range[1] - range[0])));
  return t * t * (3 - 2 * t);
}

/** An exponential disc as the particle generator samples it (scripts/build-galaxy.mjs sampleExpDisc). */
export interface GlowDisc {
  /** Surface brightness at R = 0, L☉/pc² (V). */
  sigma0: number;
  /** Radial scale length, kpc. */
  hR: number;
  /** Vertical scale height of the exponential (Laplace) profile about the warped midplane, kpc. */
  hz: number;
  /** No light beyond this radius, kpc (the sampling limit). */
  Rmax: number;
}

type P = { value: number } | number;
const val = (p: P): number => (typeof p === 'number' ? p : p.value);

/** The parts of model.json the glow reads, beyond those of the dust and the arms. */
interface GlowModelJson extends GalaxyModelJson {
  components: GalaxyModelJson['components'] & {
    thinDisc: { hR: P; hz: P; Rmax: P };
    thickDisc: { hR: P; hz: P; Rmax: P };
    youngArmStars: { hz: P; Rmin: P };
  };
  colours: { BV: Record<string, [number, number]> };
}

/**
 * A disc of total luminosity L (L☉) with the model's laws: R drawn from R e^(−R/hR) cut at Rmax,
 * so Σ(R) = L e^(−R/hR) / (2π hR² (1 − e^(−x)(1 + x))), x = Rmax / hR.
 */
export function glowDisc(json: GalaxyModelJson, name: 'thinDisc' | 'thickDisc', L: number): GlowDisc {
  const c = (json as GlowModelJson).components[name];
  const hR = val(c.hR);
  const Rmax = val(c.Rmax);
  const x = Rmax / hR;
  const inside = 1 - Math.exp(-x) * (1 + x);
  const hRpc = hR * 1000;
  return { sigma0: L / (2 * Math.PI * hRpc * hRpc * inside), hR, hz: val(c.hz), Rmax };
}

/** A disc's surface brightness at radius R (kpc), L☉/pc². */
export const discSigma = (d: GlowDisc, R: number): number => (R > d.Rmax ? 0 : d.sigma0 * Math.exp(-R / d.hR));

/** The young arm stars' scale height, kpc. */
export const youngHz = (json: GalaxyModelJson): number => val((json as GlowModelJson).components.youngArmStars.hz);

/**
 * Face-on surface brightness of the young arm stars (L☉/pc², V) on a res × res grid over ±extent
 * kpc of frame G (row 0 at y = −extent, column 0 at x = −extent, as the dust maps), for a total
 * luminosity L. The generator places them along the arm ridges with a weight per unit length
 * of ridge of strength × e^(−R/hR) (hR the thin disc's), inside Rmin, offset across the ridge by a
 * Gaussian of the arm's width (scripts/build-galaxy.mjs armTable, pickArmPoint, sampleArms): so
 * the surface brightness is that weight at the ridge times the Gaussian of the distance across it.
 */
export function youngSurfaceMap(json: GalaxyModelJson, L: number, res: number, extent: number, model: GalaxyModel = createGalaxyModel(json)): Float32Array {
  const g = json as GlowModelJson;
  const hR = val(g.components.thinDisc.hR);
  const Rmin = val(g.components.youngArmStars.Rmin);
  // The total weight: ∫ strength e^(−R/hR) ds along every arm, ds = R dβ / cos ψ.
  const dB = 0.05;
  let total = 0;
  for (const arm of model.arms) {
    for (let b = arm.betaExt[0]; b <= arm.betaExt[1]; b += dB) {
      const R = armRadius(arm, b);
      if (R < Rmin) continue;
      const s = armStrength(arm, b);
      if (s <= 0) continue;
      const cosPsi = b <= arm.betaKink ? arm.cosLt : arm.cosGt;
      total += s * Math.exp(-R / hR) * (R / cosPsi) * ((dB * Math.PI) / 180);
    }
  }
  const perKpc = L / total; // L☉ per kpc of ridge, per unit weight
  const out = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    const y = -extent + ((j + 0.5) * 2 * extent) / res;
    for (let i = 0; i < res; i++) {
      const x = -extent + ((i + 0.5) * 2 * extent) / res;
      let sum = 0;
      for (const n of model.armsNear(x, y)) {
        if (n.Ra < Rmin || n.strength <= 0) continue;
        const w = armWidth(n.arm, n.Ra);
        if (n.d > 5 * w) continue;
        sum += n.strength * Math.exp(-n.Ra / hR) * (Math.exp((-0.5 * n.d * n.d) / (w * w)) / (Math.sqrt(2 * Math.PI) * w));
      }
      // L☉ per kpc² → per pc².
      out[j * res + i] = (perKpc * sum) / 1e6;
    }
  }
  return out;
}

/**
 * The summed colour of a population whose particles' B−V are drawn from a normal distribution
 * (model.json colours): linear sRGB of luminance 1, and a colour temperature for the Doppler shift.
 */
export function populationColour(json: GalaxyModelJson, name: string): { rgb: [number, number, number]; temperatureK: number } {
  const [mu, sigma] = (json as GlowModelJson).colours.BV[name] ?? [0.7, 0];
  const rgb: [number, number, number] = [0, 0, 0];
  let w = 0;
  let lnT = 0;
  for (let k = -3; k <= 3; k += 0.25) {
    const weight = Math.exp(-0.5 * k * k);
    const T = bvToTemperature(mu + sigma * k);
    const c = blackbodyRgb(T);
    for (let i = 0; i < 3; i++) rgb[i] += weight * c[i];
    lnT += weight * Math.log(T);
    w += weight;
  }
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return { rgb: [rgb[0] / lum, rgb[1] / lum, rgb[2] / lum], temperatureK: Math.exp(lnT / w) };
}

/** Luminosity of each population in a particle file's GPU buffers (L☉): what the particles hold. */
export function populationLuminosity(attrs: Uint8Array, count: number, populations = 16): Float64Array {
  const out = new Float64Array(populations);
  for (let i = 0; i < count; i++) out[attrs[4 * i]] += 2 ** (attrs[4 * i + 1] / 8);
  return out;
}

// ─── The integration along a line of sight ───────────────────────────────────────────────

/** Steps along each line of sight (render/shaders/galaxyGlow.frag.glsl GLOW_STEPS). */
export const GLOW_STEPS = 32;
/** Step ends at s_k = GLOW_S_SCALE (e^(kλ) − 1), kpc, so the first steps are parsecs and the last a fifth of the way. */
export const GLOW_S_SCALE = 0.01;

/** ∫ e^(−|z|/h) dz from 0 to z. */
const layer = (z: number, h: number) => Math.sign(z) * h * (1 - Math.exp(-Math.abs(z) / h));

export interface GlowSetup {
  thin: GlowDisc;
  thick: GlowDisc;
  youngHz: number;
  /** Young arm stars' surface brightness (L☉/pc²) at an in-plane point of frame G. */
  young: (x: number, y: number) => number;
  /** The dust's midplane values and the warp at an in-plane point (model.dustMidplane). */
  dust: GalaxyModel['dustMidplane'];
  discRange?: readonly [number, number];
  youngRange?: readonly [number, number];
}

/**
 * The glow's light along one line of sight from a camera at camG (frame G, kpc) in the unit
 * direction dir: each population's column (L☉/pc², V band, after the dust) nearer than its
 * particles' range. As the shader: steps spaced as GLOW_S_SCALE (e^(kλ) − 1) out to the discs' s1;
 * in each step the in-plane quantities where it comes closest to the midplane, the emission and
 * the dust integrated exactly through their vertical profiles, and the step's own light dimmed
 * by its own dust as a uniform mix, (1 − e^(−τ)) / τ. A surface brightness S in L☉/pc² along a
 * line of sight is 10^(−0.4 (4.83 − 21.572)) S L☉ per arcsec²: μ = 26.40 − 2.5 log10 S.
 */
export function nearGlow(camG: Vec3, dir: Vec3, g: GlowSetup): { thin: number; young: number; thick: number } {
  const discRange = g.discRange ?? GLOW_DISC_RANGE_KPC;
  const youngRange = g.youngRange ?? GLOW_YOUNG_RANGE_KPC;
  const end = discRange[1];
  const lambda = Math.log(1 + end / GLOW_S_SCALE) / GLOW_STEPS;
  let tau = 0; // optical depth in V so far
  const out = { thin: 0, young: 0, thick: 0 };
  let sa = 0;
  for (let k = 1; k <= GLOW_STEPS; k++) {
    const sb = GLOW_S_SCALE * (Math.exp(k * lambda) - 1);
    const L = sb - sa;
    const pa: Vec3 = [camG[0] + dir[0] * sa, camG[1] + dir[1] * sa, camG[2] + dir[2] * sa];
    const pb: Vec3 = [camG[0] + dir[0] * sb, camG[1] + dir[1] * sb, camG[2] + dir[2] * sb];
    const cross = pa[2] * pb[2] <= 0 && pa[2] !== pb[2];
    const q = cross ? lerp(pa, pb, pa[2] / (pa[2] - pb[2])) : Math.abs(pa[2]) < Math.abs(pb[2]) ? pa : pb;
    const m = g.dust(q[0], q[1]);
    const za = pa[2] - m.warp;
    const zb = pb[2] - m.warp;
    const dz = zb - za;
    const flat = Math.abs(dz) < 1e-6 * L;
    // Dust, mag (the shader's columnAV piece).
    let av: number;
    if (flat) {
      const s = 1 / Math.cosh(za / m.discH);
      av = L * (m.discAV * s * s + m.armAV * Math.exp(-((za / m.armH) ** 2)));
    } else {
      const disc = m.discAV * m.discH * (Math.tanh(zb / m.discH) - Math.tanh(za / m.discH));
      const arms = m.armAV * m.armH * 0.8862269 * (erfA(zb / m.armH) - erfA(za / m.armH));
      av = (L / dz) * (disc + arms);
    }
    const dtau = 0.921034 * av;
    const mix = dtau > 1e-6 ? (1 - Math.exp(-dtau)) / dtau : 1;
    const seen = Math.exp(-tau) * mix;
    // ∫ e^(−|z|/h) ds over the step, kpc.
    const column = (h: number) => (flat ? L * Math.exp(-Math.abs(za) / h) : ((layer(zb, h) - layer(za, h)) * L) / dz);
    const R = Math.hypot(q[0], q[1]);
    const s = 0.5 * (sa + sb);
    const wDisc = 1 - particleShare(s, discRange);
    const wYoung = 1 - particleShare(s, youngRange);
    // Σ / (2h) × ∫ e^(−|z|/h) ds: L☉/pc² (h and s both in kpc).
    out.thin += (wDisc * seen * discSigma(g.thin, R) * column(g.thin.hz)) / (2 * g.thin.hz);
    out.thick += (wDisc * seen * discSigma(g.thick, R) * column(g.thick.hz)) / (2 * g.thick.hz);
    if (wYoung > 0) out.young += (wYoung * seen * g.young(q[0], q[1]) * column(g.youngHz)) / (2 * g.youngHz);
    tau += dtau;
    sa = sb;
  }
  return out;
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Error function, Abramowitz & Stegun 7.1.26 (as the shaders). */
function erfA(x: number): number {
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
