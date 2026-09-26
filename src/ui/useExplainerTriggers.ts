import { useEffect } from 'react';
import { sim } from '../sim/sim';
import { travel } from '../sim/travel';
import { useUI } from '../state/ui';
import { surfaceOnce } from './explainerActions';

/**
 * Suggest the relevant reference section the first time something happens: leaving Earth's
 * neighbourhood, crossing 0.1c / 0.5c / 0.9c / 0.99c, approaching c, switching size mode, or
 * engaging the fictional warp. Only with physics notes turned on (the `hints` preference).
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
