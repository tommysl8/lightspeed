/**
 * The two data layers beyond the Galaxy: the cosmic web (the 55,877 galaxies of Cosmicflows-4 as a
 * map) and the map of the cosmic microwave background. What each is, in the words its card and the
 * Guide use, and when the web shows: like the constellation figures it is on by itself where it
 * helps ('auto': beyond the Local Group) and the View menu turns it on or off for good.
 */
import { MPC_KM } from '../physics/constants';
import { sim } from '../sim/sim';
import { useUI, type UIState } from '../state/ui';
import { CMB_LABEL } from '../sim/cosmos/cmb';

/** 'auto' starts to show the web this far from the Sun (the Local Group's edge is about 1 Mpc from its centre)… */
export const WEB_AUTO_FROM_KM = 3 * MPC_KM;
/** …and shows it fully from here. */
export const WEB_AUTO_FULL_KM = 8 * MPC_KM;
/** The web's data are fetched once the camera is this far out (or the layer is turned on). */
export const WEB_LOAD_KM = 1.5 * MPC_KM;

/** How much of the web shows (0 to 1) for a setting and the camera's distance from the Sun (km). */
export function cosmicWebShare(mode: UIState['cosmicWeb'], distSunKm: number): number {
  if (mode === 'off') return 0;
  if (mode === 'on') return 1;
  const t = Math.min(1, Math.max(0, (distSunKm - WEB_AUTO_FROM_KM) / (WEB_AUTO_FULL_KM - WEB_AUTO_FROM_KM)));
  return t * t * (3 - 2 * t);
}

/**
 * The web's points are drawn with the layer off too, for a cluster in focus or selected (its members:
 * scene/CosmicWeb.tsx sets this each frame), and its card goes with them.
 */
export const webMembersShown = { now: false };

/** Whether the web shows now (at all). */
export const cosmicWebNow = (): boolean => cosmicWebShare(useUI.getState().cosmicWeb, sim.camera.pos.length()) > 0;

/** Turn the web the other way from how it shows now (and keep it so). */
export function toggleCosmicWeb(): void {
  useUI.setState({ cosmicWeb: cosmicWebNow() ? 'off' : 'on' });
}

/** What the cosmic web layer is, for its card, the View menu and the Guide. */
export const COSMIC_WEB_CARD = {
  title: 'The cosmic web',
  // The survey's paper is in `credit`, under the card's Sources.
  line: 'The 55,877 galaxies with measured distances of Cosmicflows-4, where they are now, the nearest drawn as galaxies of their own: a map, not what the eye would see.',
  key: 'Orange: elliptical and lenticular galaxies (measured by the Fundamental Plane or surface-brightness fluctuations). Blue: spirals and irregulars (the Tully–Fisher relation). Grey: either. Bigger and brighter points are more luminous in infrared light (2MASS). The colours are then shifted as the light arrives: redder and dimmer as the expansion of space stretches it (and bluer ahead of a fast ship), so at other times the map reddens, dims and spreads out, while each group keeps its size.',
  caveat:
    'A survey, not a census: most galaxies are in the northern galactic sky that the SDSS covered, almost none lie behind the Milky Way’s disc (the zone of avoidance), and single distances are 15–25% uncertain. Inside 30 Mpc galaxies sit at their groups’ measured distances, beyond 60 Mpc at their groups’ redshift distances (Planck 2018), and between the two a blend of both.',
  credit: 'Tully et al. 2023, ApJ 944, 94 (CC BY 4.0); 2MASS (UMass/IPAC-Caltech, NASA, NSF)',
} as const;

/** What the CMB map layer is. */
export const CMB_CARD = {
  title: 'The cosmic microwave background',
  line: CMB_LABEL,
  key: 'Black is the mean temperature, 2.7255 K; blue is colder and red warmer, by up to 250 millionths of a kelvin. The real sky is uniform to the eye to one part in 10,000; the Sun’s motion (the dipole) and the Milky Way’s own glow have been removed.',
  caveat: 'The oldest light there is, released about 370,000 years after the Big Bang. The map is the pattern seen from the Solar System at the present. Drawn whenever the relativistic view is off (at rest, in classical optics, or on the classical side of the split screen): in the relativistic view the sky shows the real background as a moving ship would see it, at 2.72548 K divided by how much the universe has grown.',
  credit: 'NASA/WMAP Science Team; the colours are the end colours of Moreland’s (2009) cool–warm map',
} as const;
