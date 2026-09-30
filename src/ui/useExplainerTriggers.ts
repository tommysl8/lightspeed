import { useEffect } from 'react';
import type { ExplainerId } from '../content/explainers';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { gravity } from '../sim/gravity';
import { lens } from '../render/lens/lensState';
import { useUI } from '../state/ui';
import { seenBefore, surfaceOnce } from './explainerActions';

/** Near a black hole: the Einstein ring at least this wide (radius, rad; 1°: within about 550 au of Sgr A*). */
const RING_HINT_RAD = Math.PI / 180;
/** The shadow at least this wide (radius, rad; 1°: within about 12 au of Sgr A*, 300 GM/c²). */
const SHADOW_HINT_RAD = Math.PI / 180;
/** The sky at least 2 % bluer for a hovering observer (1 − α ≥ 0.02: within about 25 horizon radii). */
const BLUESHIFT_HINT = 0.02;

/**
 * The first of the black-hole notes that applies here and has not been shown. Coming in they apply one after
 * another (the stars doubled by the lens, then the shadow's size, then the blueshift and slow clocks); arriving
 * close at once (a scene), the shadow comes first. Null far from any lens.
 */
function holeNote(): ExplainerId | null {
  if (!gravity.hole || !lens.active) return null;
  if (lens.edge >= SHADOW_HINT_RAD && !seenBefore('shadow-size')) return 'shadow-size';
  if (lens.thetaE >= RING_HINT_RAD && !seenBefore('double-images')) return 'double-images';
  if (gravity.oneMinusAlpha >= BLUESHIFT_HINT && !seenBefore('gravitational-blueshift')) return 'gravitational-blueshift';
  return null;
}

/**
 * Suggest the relevant reference section the first time something happens: leaving Earth's
 * neighbourhood, crossing 0.1c / 0.5c / 0.9c / 0.99c, approaching c, switching size mode,
 * engaging the fictional warp, or coming close to a black hole (its lens, its shadow, its
 * blueshift). Only with physics notes turned on (the `hints` preference).
 */
export function useExplainerTriggers() {
  useEffect(() => {
    let lastSize = useUI.getState().sizeMode;
    const id = window.setInterval(() => {
      const ui = useUI.getState();
      if (!ui.hints) {
        lastSize = ui.sizeMode;
        return;
      }
      if (ui.noteTopic) return; // one suggestion at a time
      const trip = travel.trip;
      if (trip?.warp) return surfaceOnce('ftl');
      if (trip?.drive === 'rocket' || (ui.plannerOpen && ui.plannerDrive === 'rocket')) return surfaceOnce('rocket');
      const beta = sim.ship.beta;
      if (beta >= 0.99 && ui.relMode !== 'off') return surfaceOnce('doppler');
      if (beta >= 0.9 && ui.relMode !== 'off') return surfaceOnce('aberration');
      if (beta >= 0.5) return surfaceOnce('time-dilation');
      if (beta >= 0.1) return surfaceOnce('lorentz');
      const hole = holeNote();
      if (hole) return surfaceOnce(hole);
      if (ui.plannerOpen && ui.plannerDrive === 'cruise' && ui.plannerBeta >= 0.999) return surfaceOnce('mass-limit');
      if (ui.plannerOpen && ui.plannerDrive === 'warp') return surfaceOnce('ftl');
      if (ui.sizeMode !== lastSize) {
        lastSize = ui.sizeMode;
        return surfaceOnce('scale');
      }
      if (sim.bodies.earth.distTrue > 3e5 && ui.tripActive) return surfaceOnce('light-time');
    }, 400);
    return () => window.clearInterval(id);
  }, []);
}
