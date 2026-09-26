import { afterEach, describe, expect, it } from 'vitest';
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI } from '../state/ui';
import { CONSTELLATIONS_AUTO_KM, constellationsNow, constellationsShown, toggleConstellations } from './constellations';

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
