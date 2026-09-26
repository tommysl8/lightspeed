/**
 * Whether the constellation figures show. Off by default near the Sun, where the ecliptic grid,
 * the orbits and the planets' labels are the guides, and on by default from interstellar
 * distances ('auto'), where the figures come apart and show that the stars are not on a sphere.
 * The View menu and the Y key turn them on or off for good.
 */
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';

/** In 'auto', the figures show once the camera is this far from the Sun: 0.2 pc (41,000 au, 0.65 light-years). */
export const CONSTELLATIONS_AUTO_KM = 0.2 * PARSEC_KM;

/** Whether the figures show for a setting and the camera's distance from the Sun (km). */
export function constellationsShown(mode: UIState['constellations'], distSunKm: number): boolean {
  return mode === 'on' || (mode === 'auto' && distSunKm > CONSTELLATIONS_AUTO_KM);
}

/** Whether they show now. */
export const constellationsNow = (): boolean => constellationsShown(useUI.getState().constellations, sim.camera.pos.length());

/** Turn them the other way from how they show now (and keep it so). */
export function toggleConstellations(): void {
  useUI.setState({ constellations: constellationsNow() ? 'off' : 'on' });
}
