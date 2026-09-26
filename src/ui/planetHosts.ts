/**
 * Whether the rings around stars with known planets show (scene/PlanetHosts.tsx). Like the
 * constellation figures, they are off near the Sun, where the planets' labels and orbits are the
 * guides, and on by themselves once the camera is among the stars ('auto'); the View menu turns
 * them on or off for good.
 */
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { CONSTELLATIONS_AUTO_KM } from './constellations';

/** Whether the rings show for a setting and the camera's distance from the Sun (km). */
export function planetHostsShown(mode: UIState['planetHosts'], distSunKm: number): boolean {
  return mode === 'on' || (mode === 'auto' && distSunKm > CONSTELLATIONS_AUTO_KM);
}

/** Whether they show now. */
export const planetHostsNow = (): boolean => planetHostsShown(useUI.getState().planetHosts, sim.camera.pos.length());

/** Turn them the other way from how they show now (and keep it so). */
export function togglePlanetHosts(): void {
  useUI.setState({ planetHosts: planetHostsNow() ? 'off' : 'on' });
}
