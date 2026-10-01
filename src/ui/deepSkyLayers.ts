/**
 * When the deep-sky catalogues' markers show (scene/DeepSky.tsx; sim/deepsky): the NGC and IC objects with measured
 * distances and the supernova remnants, the pulsars, and the gravitational-wave events. Like the constellation figures
 * they are on by themselves where they help ('auto') and the View menu turns them on or off for good:
 *  - the NGC/IC objects of the Milky Way, the remnants and the pulsars once the camera is among the stars (0.2 pc from
 *    the Sun, as the constellations), and while it is within the Galaxy and the Magellanic Clouds;
 *  - the NGC/IC galaxies and the gravitational-wave events once it has left the Galaxy (30 kpc from the Sun).
 * Each catalogue's file loads only when it is first shown, searched for or turned on.
 */
import { KPC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { CONSTELLATIONS_AUTO_KM } from './constellations';

/** 'auto' shows the Milky Way's catalogues from among the stars… */
export const GALACTIC_AUTO_FROM_KM = CONSTELLATIONS_AUTO_KM;
/** …out to here (beyond the Magellanic Clouds, 62 kpc)… */
export const GALACTIC_AUTO_TO_KM = 150 * KPC_KM;
/** …and the catalogues beyond the Galaxy from here. */
export const EXTRAGALACTIC_AUTO_FROM_KM = 30 * KPC_KM;

type Mode = UIState['deepSky'];

/** Whether the Milky Way's catalogues (NGC/IC clusters and nebulae, remnants; pulsars) show for a setting and the camera's distance from the Sun (km). */
export const galacticShown = (mode: Mode, distSunKm: number): boolean =>
  mode === 'on' || (mode === 'auto' && distSunKm > GALACTIC_AUTO_FROM_KM && distSunKm < GALACTIC_AUTO_TO_KM);

/** Whether the catalogues beyond the Galaxy (NGC/IC galaxies; mergers) show. */
export const extragalacticShown = (mode: Mode, distSunKm: number): boolean => mode === 'on' || (mode === 'auto' && distSunKm > EXTRAGALACTIC_AUTO_FROM_KM);

/** Whether each layer shows now. */
export function deepSkyLayersNow(): { ngc: boolean; ngcGalaxies: boolean; pulsars: boolean; gw: boolean } {
  const s = useUI.getState();
  const d = sim.camera.pos.length();
  return { ngc: galacticShown(s.deepSky, d), ngcGalaxies: extragalacticShown(s.deepSky, d), pulsars: galacticShown(s.pulsars, d), gw: extragalacticShown(s.gwEvents, d) };
}

/** The View menu's tick: a layer shows when either of its parts does where the camera is. */
export function deepSkyChecked(key: 'deepSky' | 'pulsars' | 'gwEvents', mode: Mode, distSunKm: number): boolean {
  if (key === 'pulsars') return galacticShown(mode, distSunKm);
  if (key === 'gwEvents') return extragalacticShown(mode, distSunKm);
  return galacticShown(mode, distSunKm) || extragalacticShown(mode, distSunKm);
}

/** Turn a layer the other way from how it shows now (and keep it so). */
export function toggleDeepSkyLayer(key: 'deepSky' | 'pulsars' | 'gwEvents'): void {
  const s = useUI.getState();
  useUI.setState({ [key]: deepSkyChecked(key, s[key], sim.camera.pos.length()) ? 'off' : 'on' } as Partial<UIState>);
}
