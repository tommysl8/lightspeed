/**
 * Whether the constellation figures show. Off by default near the Sun, where the ecliptic grid,
 * the orbits and the planets' labels are the guides, and on by default from interstellar
 * distances ('auto'), where the figures come apart and show that the stars are not on a sphere,
 * until the camera is far out in the Galaxy.
 * The View menu and the Y key turn them on or off for good.
 */
import { PARSEC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';

/** In 'auto', the figures show once the camera is this far from the Sun: 0.2 pc (41,000 au, 0.65 light-years). */
export const CONSTELLATIONS_AUTO_KM = 0.2 * PARSEC_KM;

/**
 * In 'auto', they go again beyond 1,000 pc: the figures' stars are then a patch a few degrees
 * across, and the Milky Way is the thing to see.
 */
export const CONSTELLATIONS_AUTO_MAX_KM = 1000 * PARSEC_KM;

/**
 * In 'auto', a figure also fades as it comes apart: once the segment that has grown most on the
 * sky (against the view from the Sun) has grown COME_APART_FROM times as much as the one that
 * has grown least, until COME_APART_TO, where it is gone. Seen from farther off along the same
 * line a figure only shrinks and keeps its shape; beside one of its stars it is a spray of lines.
 * A segment grown GROWN_PER_APART times over counts as one step of coming apart, so a figure of
 * one or two segments (Canis Minor) goes too once it is stretched across the sky.
 */
const COME_APART_FROM = 1.8;
const COME_APART_TO = 3;
const GROWN_PER_APART = 2;

/**
 * A figure's opacity, 0–1, from the most and the least any of its segments has grown on the sky
 * against the view from the Sun (1: unchanged).
 */
export function figureOpacity(most: number, least: number): number {
  const apart = Math.max(most / Math.max(least, 1e-9), most / GROWN_PER_APART);
  const t = Math.min(1, Math.max(0, (apart - COME_APART_FROM) / (COME_APART_TO - COME_APART_FROM)));
  return 1 - t * t * (3 - 2 * t);
}

/** Each figure's opacity now, by figure index (set each frame by scene/Constellations.tsx; the names follow it). */
export const figureFade: number[] = [];

/** Whether the figures show for a setting and the camera's distance from the Sun (km). */
export function constellationsShown(mode: UIState['constellations'], distSunKm: number): boolean {
  return mode === 'on' || (mode === 'auto' && distSunKm > CONSTELLATIONS_AUTO_KM && distSunKm < CONSTELLATIONS_AUTO_MAX_KM);
}

/** Whether they show now. */
export const constellationsNow = (): boolean => constellationsShown(useUI.getState().constellations, sim.camera.pos.length());

/** Turn them the other way from how they show now (and keep it so). */
export function toggleConstellations(): void {
  useUI.setState({ constellations: constellationsNow() ? 'off' : 'on' });
}
