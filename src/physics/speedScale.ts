/**
 * Speed ↔ slider mapping on a logit scale: x = log₁₀(β / (1 − β)).
 *
 * Low speeds behave like log β (0.00001c → 0.0001c → 0.001c are evenly spaced). High speeds
 * behave like −log(1 − β) (0.9c → 0.99c → 0.999c → 0.9999c are evenly spaced). 0.5c sits at
 * x = 0. A plain log-β slider would squeeze everything from 0.9c to 0.99999c into its last few
 * pixels.
 */
export const LOGIT_MIN = -5; // β ≈ 0.00001 (3.0 km/s)
export const LOGIT_MAX = 5; // β ≈ 0.99999

export function logitToBeta(x: number): number {
  return 1 / (1 + 10 ** -x);
}

export function betaToLogit(beta: number): number {
  return Math.log10(beta / (1 - beta));
}

/** Slider position s ∈ [0, 1] → β. */
export function sliderToBeta(s: number, min = LOGIT_MIN, max = LOGIT_MAX): number {
  return logitToBeta(min + Math.min(1, Math.max(0, s)) * (max - min));
}

/** β → slider position s ∈ [0, 1]. */
export function betaToSlider(beta: number, min = LOGIT_MIN, max = LOGIT_MAX): number {
  return Math.min(1, Math.max(0, (betaToLogit(beta) - min) / (max - min)));
}
