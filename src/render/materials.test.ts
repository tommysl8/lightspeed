import { describe, expect, it } from 'vitest';
import { LIMB_DARKENING_U, SUN_CENTRE_RADIANCE, SUN_COLOR, SUN_LIMB_DISC_MEAN, SUN_SURFACE_RADIANCE } from './materials';

describe('the Sun’s disc', () => {
  it('averages the radiance of a 5,772 K surface, with a brighter centre and a darker limb', () => {
    // Integrate the limb darkening over the projected disc numerically (rings of equal width).
    const N = 20_000;
    let lum = 0;
    let area = 0;
    for (let k = 0; k < N; k++) {
      const r = (k + 0.5) / N;
      const mu = Math.sqrt(1 - r * r);
      const I = [LIMB_DARKENING_U.x, LIMB_DARKENING_U.y, LIMB_DARKENING_U.z].map((u) => SUN_CENTRE_RADIANCE * (1 - u * (1 - mu)));
      lum += (0.2126 * SUN_COLOR.r * I[0] + 0.7152 * SUN_COLOR.g * I[1] + 0.0722 * SUN_COLOR.b * I[2]) * r;
      area += r;
    }
    const sunLum = 0.2126 * SUN_COLOR.r + 0.7152 * SUN_COLOR.g + 0.0722 * SUN_COLOR.b;
    expect(lum / area / sunLum / SUN_SURFACE_RADIANCE).toBeCloseTo(1, 6);
    expect(SUN_LIMB_DISC_MEAN).toBeGreaterThan(0.78);
    expect(SUN_LIMB_DISC_MEAN).toBeLessThan(0.8);
  });
});
