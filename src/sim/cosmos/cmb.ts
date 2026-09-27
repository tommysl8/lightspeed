/**
 * The map of the cosmic microwave background (public/textures/cmb.png and cmb-data.png, built by
 * scripts/build-cmb.mjs from the WMAP nine-year ILC map; NASA / WMAP Science Team).
 *
 * Both images are equirectangular in galactic coordinates, drawn as CMB maps are published (seen
 * from inside the sky): the Galactic centre in the middle, galactic longitude increasing to the
 * LEFT. With u from the left edge and v from the top row: l = (180 − 360 u) mod 360, b = 90 − 180 v.
 * A pixel is a linear temperature code k: ΔT = (k − 127.5) × 500/255 µK, so −250 to +250 µK about
 * the mean of 2.7255 K; the monopole and the dipole (the Sun's motion) are removed. cmb.png maps k
 * through Moreland's cool–warm diverging colour map; cmb-data.png stores k itself as grey.
 */
import { C_KM_S, JULIAN_YEAR_S, MPC_KM } from '../../physics/constants';
import { planck18 } from '../../physics/cosmology/cosmology';
import { cosmicNow, PRESENT_AGE_GYR } from '../cosmicTime';
import { cosmicSky } from './expansion';
import { apply, ECL_TO_GAL, GAL_TO_ECL, sphToUnit, unitToSph, type Vec3 } from './frames';

export const CMB_RANGE_UK = 250;
export const CMB_STEP_UK = (2 * CMB_RANGE_UK) / 255;
/** The mean temperature of the map, K (the WMAP value; Fixsen 2009 gives 2.72548 ± 0.00057). */
export const CMB_MEAN_K = 2.7255;

/** The colour map drawn in the app (sRGB, 2048 × 1024) and the linear data version. */
export const CMB_TEXTURE = 'textures/cmb.png';
export const CMB_DATA_TEXTURE = 'textures/cmb-data.png';

/** The layer's label, as it must appear wherever the map is shown. */
export const CMB_LABEL = 'Cosmic microwave background, contrast enhanced about 10,000 times; WMAP 9-year ILC, NASA/WMAP Science Team';
/** The credit line on its own. */
export const CMB_CREDIT = 'NASA/WMAP Science Team (WMAP 9-year Internal Linear Combination map; Bennett et al. 2013, ApJS 208, 20)';

/**
 * How much the colours are stretched: the whole colour scale spans ±250 µK, a change of about one
 * part in 10⁴ of 2.7255 K (2.7255 K / 250 µK ≈ 11,000), where a full swing of colour would stand for
 * a change of order one: about 10,000 times the contrast of the real sky, which is uniform to the
 * eye.
 */
export const CMB_CONTRAST_FACTOR = CMB_MEAN_K / (CMB_RANGE_UK * 1e-6);

/** Temperature anisotropy in µK for a code k (0 to 255). */
export const cmbCodeToMicroK = (k: number): number => (k - 127.5) * CMB_STEP_UK;
/** The code of an anisotropy in µK (clipped). */
export const microKToCmbCode = (dT: number): number => Math.max(0, Math.min(255, Math.round(127.5 + dT / CMB_STEP_UK)));

/** Galactic (l, b) in degrees of texture coordinates (u, v); v = 0 is the top row. */
export function cmbUvToGalactic(u: number, v: number): { l: number; b: number } {
  let l = (180 - 360 * u) % 360;
  if (l < 0) l += 360;
  return { l, b: 90 - 180 * v };
}

/** Texture coordinates of galactic (l, b) in degrees: u in [0, 1), v in [0, 1] from the top. */
export function galacticToCmbUv(lDeg: number, bDeg: number): { u: number; v: number } {
  let u = (180 - lDeg) / 360;
  u -= Math.floor(u);
  return { u, v: (90 - bDeg) / 180 };
}

/** Texture coordinates of a direction given as an ecliptic (J2000) vector. */
export function eclDirectionToCmbUv(dirEcl: Readonly<Vec3>): { u: number; v: number } {
  const { lon, lat } = unitToSph(apply(ECL_TO_GAL, [dirEcl[0], dirEcl[1], dirEcl[2]]));
  return galacticToCmbUv(lon, lat);
}

/** The ecliptic unit vector of the sky at texture coordinates (u, v). */
export function cmbUvToEclDirection(u: number, v: number): Vec3 {
  const { l, b } = cmbUvToGalactic(u, v);
  return apply(GAL_TO_ECL, sphToUnit(l, b));
}

// ─── The map at other places and times ───────────────────────────────────────────────────

/**
 * The map is the pattern seen from the Solar System at the present: the sphere of last scattering
 * about us, 13,900 Mpc away (comoving), smoothed to about 1°, some 250 Mpc there, with most of its
 * structure on the scale of the sound horizon, 147 Mpc (Planck 2018). Seen from another place, or
 * at another time (the sphere's radius grows by the comoving distance light travels meanwhile, 307
 * Mpc per billion years at the present), the sky shows another shell of the early universe, whose
 * pattern nobody can know. So the map fades out as the shell moves by 30 to 150 Mpc.
 */
export const CMB_PATTERN_FADE_MPC: readonly [number, number] = [30, 150];

/** Mpc of comoving distance light covers in a billion years at the present (c / (1 Gyr), a = 1). */
const LIGHT_MPC_PER_GYR = (C_KM_S * 1e9 * JULIAN_YEAR_S) / MPC_KM;

/**
 * How far the camera's sphere of last scattering has moved from the Solar System's at the present,
 * Mpc (comoving): the camera's comoving displacement from home plus the change of the sphere's
 * radius (the conformal time since the present).
 */
export function cmbShellShiftMpc(): number {
  const s = cosmicSky;
  const c = cosmicNow();
  let deta: number;
  const dtGyr = c.ageGyr - PRESENT_AGE_GYR;
  if (Math.abs(dtGyr) < 1e-3) deta = Math.abs(dtGyr) * LIGHT_MPC_PER_GYR;
  else {
    const m = planck18();
    deta = Math.abs(m.dH * (m.conformalLn(c.lnA) - m.conformalLn(0)));
  }
  return s.anchorKm.length() / MPC_KM + deta;
}

/** How much of the map's pattern to draw (1 from the Solar System at the present, 0 far from either). */
export function cmbPatternShare(): number {
  const [a, b] = CMB_PATTERN_FADE_MPC;
  const t = Math.min(1, Math.max(0, (cmbShellShiftMpc() - a) / (b - a)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The map's card, at other places and times: the background's mean temperature then (T0 / a), and
 * that the pattern shown is ours at the present. Undefined from the Solar System at the present.
 */
export function cmbEpochNote(): string | undefined {
  const shift = cmbShellShiftMpc();
  const c = cosmicNow();
  if (shift < 1 && Math.abs(c.am1) < 1e-4) return undefined;
  const t = c.tCmbK;
  const temp = t >= 100 ? `${Math.round(t).toLocaleString('en-GB')} K` : t >= 0.01 ? `${t.toPrecision(3)} K` : `${(t * 1000).toPrecision(3)} mK`;
  const share = cmbPatternShare();
  const pattern =
    share >= 0.999
      ? 'The pattern is the one seen from the Solar System at the present; from here and now it would differ only slightly.'
      : share > 0
        ? 'The pattern is the one seen from the Solar System at the present: from here and now the sky shows a different shell of the early universe, whose pattern is not known, so the map fades out.'
        : 'From here and now the sky shows a different shell of the early universe, whose pattern is not known: the map of ours is not drawn.';
  if (c.a < 1 / 1090.8) return `Too early for a background: until about 370,000 years after the Big Bang the universe was an opaque glowing plasma, here and now at ${temp}.`;
  const a = c.a >= 10 ? c.a.toPrecision(3) : c.a.toFixed(4);
  // Away from the Solar System at the present, the universe is its present size to four figures.
  const why =
    Math.abs(c.a - 1) < 5e-5
      ? 'the same as at the present, 2.72548 K'
      : c.a >= 1
        ? `2.72548 K at the present, cooled as the universe has grown ${a} times since`
        : `2.72548 K at the present, hotter when the universe was ${a} of its present size`;
  return `Its mean temperature here and now: ${temp} (${why}). ${pattern}`;
}
