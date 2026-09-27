import { afterEach, describe, expect, it } from 'vitest';
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { CONSTELLATIONS_AUTO_KM, constellationsNow, constellationsShown, figureOpacity, toggleConstellations } from './constellations';

afterEach(() => {
  sim.camera.pos.set(0, 0, 0);
  useUI.setState({ constellations: 'auto' });
});

describe('the constellation figures', () => {
  it('are off near the Sun and on among the stars by default', () => {
    expect(useUI.getState().constellations).toBe('auto');
    expect(constellationsShown('auto', 1e9)).toBe(false);
    expect(constellationsShown('auto', 0.1 * PARSEC_KM)).toBe(false);
    expect(constellationsShown('auto', 1.3 * PARSEC_KM)).toBe(true);
    // Far out in the Galaxy the figures are a speck: 'auto' leaves them out again.
    expect(constellationsShown('auto', 5000 * PARSEC_KM)).toBe(false);
    expect(constellationsShown('on', 5000 * PARSEC_KM)).toBe(true);
    expect(CONSTELLATIONS_AUTO_KM / PARSEC_KM).toBe(0.2);
  });

  it('stay on or off for good once turned', () => {
    expect(constellationsShown('on', 0)).toBe(true);
    expect(constellationsShown('off', 10 * PARSEC_KM)).toBe(false);
    expect(constellationsNow()).toBe(false);
    toggleConstellations();
    expect(useUI.getState().constellations).toBe('on');
    sim.camera.pos.set(5 * PARSEC_KM, 0, 0);
    toggleConstellations();
    expect(useUI.getState().constellations).toBe('off');
    expect(constellationsNow()).toBe(false);
  });
});

describe('a figure seen from away from the Sun', () => {
  it('keeps its lines while it keeps its shape', () => {
    expect(figureOpacity(1, 1)).toBe(1);
    // Seen from farther off along the same line: smaller, same shape.
    expect(figureOpacity(0.3, 0.28)).toBe(1);
    // Nearer, and a little distorted.
    expect(figureOpacity(1.5, 1.1)).toBe(1);
  });

  it('fades as it comes apart', () => {
    // One segment grown three times as much as another: gone.
    expect(figureOpacity(1.5, 0.5)).toBe(0);
    expect(figureOpacity(2.4, 1)).toBeGreaterThan(0);
    expect(figureOpacity(2.4, 1)).toBeLessThan(1);
    // A figure of one segment stretched across the sky (beside one of its stars).
    expect(figureOpacity(8, 8)).toBe(0);
  });
});
