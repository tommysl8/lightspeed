// Point-spread function for point sources (stars and unresolved planets).
// Apparent magnitude -> Gaussian sprite. The displayed peak grows as flux^0.5, a gentle
// compression (like the eye or a photograph) that fits magnitude -1.5 to 6.5 on a screen.
// Very bright sources (the Sun seen from Neptune) cap their peak and widen instead; bloom
// adds the glare around them.
uniform float uPixelRatio;
uniform float uMagZero;
uniform float uStarGain;

const float PSF_PEAK_MAX = 24.0;
const float PSF_CUTOFF = 0.0015;

void psfFromMagnitude(float mag, out float sigmaPx, out float peak, out float sizePx) {
  float flux = exp2(-1.3287712 * (mag - uMagZero)); // 10^(-0.4 (m - m0))
  float p = uStarGain * sqrt(flux);
  // Beyond the cap, spread the excess over a wider core (energy grows ~ peak * sigma^2).
  float spread = p > PSF_PEAK_MAX ? pow(p / PSF_PEAK_MAX, 0.25) : 1.0;
  peak = min(p, PSF_PEAK_MAX);
  sigmaPx = uPixelRatio * clamp(0.62 * pow(flux, 0.1), 0.5, 2.6) * min(spread, 1.6);
  // Sprite large enough to contain the Gaussian down to the cutoff (no hard edges).
  float reach = sqrt(2.0 * log(max(peak, PSF_CUTOFF * 1.01) / PSF_CUTOFF));
  sizePx = clamp(2.0 * sigmaPx * reach + 2.0, 2.0, 128.0);
}
