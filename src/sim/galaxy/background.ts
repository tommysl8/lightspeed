/**
 * The Milky Way from the Sun, and how it hands over to the model of the Galaxy away from the Sun.
 *
 * The sky texture is the NASA SVS "Deep Star Maps 2020" Milky Way background (Gaia DR2 starlight
 * fainter than about V = 11, with the real dust lanes), re-encoded by scripts/build-milkyway-bg.py
 * (public/textures/milkyway-bg.json has the projection, encoding and calibration), with the light
 * of the star catalogue's stars too faint to be drawn as points added (MW_FAINT_STARS). It is the sky
 * seen from the Sun, so it is drawn only near the Sun and fades out as the camera leaves the Sun's
 * neighbourhood; the model of the Galaxy fades in over the same distances, so the band is never
 * drawn twice (render/shaders/milkyway.glsl, scene/MilkyWay.tsx, render/galaxyLayer.ts).
 */
import { PARSEC_KM } from '../../physics/constants';

/** The SVS encoding: e = ln(1 + p / P0) / ln(1 + PMAX / P0), per channel, 8 bits. */
export const MW_P0 = 2e-4;
export const MW_PMAX = 1;
export const MW_LN_RANGE = Math.log(1 + MW_PMAX / MW_P0);

/** p of a channel from its byte (the shader does the same with the filtered value). */
export const decodeSvs = (byte: number): number => MW_P0 * (Math.exp((byte / 255) * MW_LN_RANGE) - 1);

/** mu_V = SB_ZERO_POINT − 2.5 log10(mean p), mag/arcsec² (the calibration in milkyway-bg.json). */
export const MW_SB_ZERO_POINT = 18.439;

/** Square arcseconds in a steradian. */
const ARCSEC2_PER_SR = (180 / Math.PI) ** 2 * 3600 ** 2;

/**
 * Flux per steradian of a texel with mean(p) = 1, in units of a V = 0 star: 10^(−0.4 SB_ZERO_POINT)
 * per square arcsecond (≈ 1,790, as milkyway-bg.json says).
 */
export const MW_FLUX_PER_SR = 10 ** (-0.4 * MW_SB_ZERO_POINT) * ARCSEC2_PER_SR;

/** Surface brightness, mag/arcsec², of a texel with this mean p. */
export const surfaceBrightness = (meanP: number): number => MW_SB_ZERO_POINT - 2.5 * Math.log10(meanP);

/**
 * Solid angle of a faint star's image, sr: the star shader draws stars fainter than about V = 4 as
 * Gaussians of σ = 0.5 CSS px (render/shaders/psf.glsl), so 2π σ².
 */
export function psfSolidAngle(cssPixelAngleRad: number): number {
  const sigma = 0.5 * cssPixelAngleRad;
  return 2 * Math.PI * sigma * sigma;
}

/**
 * The shader's uMwScale: the displayed luminance of a texel is √(scale · mean p), the peak a faint
 * star would get (uStarGain √f, flux f in V = 0 units relative to 10^(−0.4 m0)) if it held the
 * light of a patch of sky as large as its own image.
 */
export function backgroundScale(cssPixelAngleRad: number, starGain: number, magZero: number): number {
  return starGain * starGain * MW_FLUX_PER_SR * psfSolidAngle(cssPixelAngleRad) * 10 ** (0.4 * magZero);
}

/**
 * The flux (in V = 0 stars, relative to 10^(−0.4 m0)) that a surface of brightness mu
 * (mag/arcsec²) puts into a faint star's image area: the Galaxy layer's linear unit.
 */
export function patchFlux(muV: number, cssPixelAngleRad: number, magZero = 0): number {
  return 10 ** (-0.4 * muV) * ARCSEC2_PER_SR * psfSolidAngle(cssPixelAngleRad) * 10 ** (0.4 * magZero);
}

/** The luminance drawn for a surface brightness mu (mag/arcsec²), with the same law. */
export function displayedLuminance(muV: number, cssPixelAngleRad: number, starGain: number, magZero = 0): number {
  const fluxPerSr = 10 ** (-0.4 * muV) * ARCSEC2_PER_SR;
  return starGain * Math.sqrt(fluxPerSr * psfSolidAngle(cssPixelAngleRad) * 10 ** (0.4 * magZero));
}

/**
 * The glow between the stars fades out between these surface brightnesses (mag/arcsec²), as the
 * star field fades out at the eye's limit for points: the darkest skies on Earth are about 22.
 */
export const MW_MU_FADE: readonly [number, number] = [22, 24];

/**
 * The handover from the sky from the Sun to the model: the model's share w rises from 0 to 1 as the
 * camera goes from HANDOVER_START_PC to HANDOVER_END_PC from the Sun (a smoothstep). What is drawn
 * is the picture with the model times w plus the picture with the sky map times 1 − w: the two
 * pictures are blended, not their light (render/galaxyLayer.ts, shaders/milkyway.glsl), so the band
 * does not brighten half-way. Within a hundred parsecs the parallax of the nearest dust clouds and
 * star fields is still small; by half a kiloparsec the sky from the Sun is plainly the wrong sky.
 * The model near the camera is a smooth glow worked out from its laws (glow.ts), so it does not
 * thin out into a few bright blobs as the camera leaves the Sun. Seen from the Sun it is within
 * half a magnitude of the real sky (the sky map with the catalogue's stars) towards the anticentre
 * and the galactic poles, and about 1.2 magnitudes fainter towards the star clouds of Sagittarius
 * and Scutum, which the real sky shows through windows in its dust that the model's smooth dust
 * has not got (glow.test.ts).
 */
export const HANDOVER_START_PC = 100;
export const HANDOVER_END_PC = 500;

/** The model's share at a distance from the Sun (km). */
export function modelShare(distanceFromSunKm: number): number {
  const pc = distanceFromSunKm / PARSEC_KM;
  const t = Math.min(1, Math.max(0, (pc - HANDOVER_START_PC) / (HANDOVER_END_PC - HANDOVER_START_PC)));
  return t * t * (3 - 2 * t);
}

/**
 * The nebulae's pictures are photographs, stretched for display by the observatories that took
 * them, with no photometric calibration. They are drawn as surfaces whose brightest part is
 * NEBULA_MU_PEAK mag/arcsec², a little brighter than the brightest star clouds of the Milky Way
 * (about 20), with the same law as the sky (scene/Nebulae.tsx). Their faint outskirts fade out with
 * the sky's own threshold, so a picture does not show as a rectangle.
 */
export const NEBULA_MU_PEAK = 19.5;

/** uStarGain² times the flux in a faint star's image area of a surface of brightness mu: Y = √(this · share). */
export function surfaceScale(muV: number, cssPixelAngleRad: number, starGain: number, magZero = 0): number {
  return starGain * starGain * patchFlux(muV, cssPixelAngleRad, magZero);
}

/**
 * The map drawn: the 2K file (texels of 10.5′, averaged from the 4K master in linear light). The
 * 4K master (milkyway-bg.jpg, texels of 5.3′) is kept with it but not loaded: nothing is drawn
 * finer than the 2K file's texels.
 */
export const MW_TEXTURE_2K = 'milkyway-bg-2k.jpg';
/** The 8K map's luminance (14 MB; 45 MB on the GPU as one channel with its mipmaps): the sky's fine structure. */
export const MW_DETAIL_8K = 'milkyway-detail-8k.jpg';

/**
 * The light of the star catalogue's stars fainter than the eye's limit (V 6.5 to its limit, about
 * 10), which the SVS map leaves out with every star brighter than about V = 11: a glow map in the
 * same projection and encoding, one channel, added to the map (scripts/build-faint-stars.mjs).
 */
export const MW_FAINT_STARS = 'faint-stars.png';

/** Credit line for the sky texture (public domain; the SVS asks for this credit). */
export const MW_BACKGROUND_CREDIT = 'NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.';
