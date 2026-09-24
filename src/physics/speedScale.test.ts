import { describe, expect, it } from 'vitest';
import { betaToSlider, sliderToBeta } from './speedScale';

describe('logit speed scale', () => {
  it('spans 0.00001c to 0.99999c with 0.5c in the middle', () => {
    expect(sliderToBeta(0)).toBeCloseTo(1e-5, 9);
    expect(sliderToBeta(1)).toBeCloseTo(0.99999, 9);
    expect(sliderToBeta(0.5)).toBeCloseTo(0.5, 12);
  });

  it('spaces 0.9c, 0.99c, 0.999c, 0.9999c evenly', () => {
    const s = [0.9, 0.99, 0.999, 0.9999].map((b) => betaToSlider(b));
    const gaps = s.slice(1).map((v, i) => v - s[i]);
    for (const g of gaps) expect(g).toBeCloseTo(0.1, 2);
  });

  it('round-trips', () => {
    for (const b of [2e-5, 5.67e-5, 6.4e-4, 0.1, 0.5, 0.9, 0.99999]) {
      expect(sliderToBeta(betaToSlider(b)) / b).toBeCloseTo(1, 10);
    }
  });
});
