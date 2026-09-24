import { useEffect } from 'react';
import { BODY_ORDER, type BodyId } from '../physics/constants';
import { controller, isTyping } from '../controls/cameraController';
import { useUI } from '../state/ui';
import { BODY_KEYS, goToBody } from './navigation';

const KEY_TO_BODY = new Map<string, BodyId>(
  BODY_ORDER.filter((id) => BODY_KEYS[id]).map((id) => [BODY_KEYS[id]!.toLowerCase(), id]),
);

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUI.getState();
      const flying = ui.controlMode === 'free';
      const k = e.key.toLowerCase();

      if (e.key === '?') {
        ui.toggle('helpOpen');
        return;
      }
      if (e.key === 'Escape') {
        if (ui.helpOpen) useUI.setState({ helpOpen: false });
        else if (ui.selected) ui.select(null);
        return;
      }
      if (k === 'f') {
        if (flying) controller.exitFreeFlight();
        else controller.enterFreeFlight();
        return;
      }
      // Letters used for flying are not shortcuts while in flight.
      if (flying && 'wasdqerc'.includes(k)) return;

      const body = KEY_TO_BODY.get(k);
      if (body) {
        goToBody(body);
        return;
      }
      switch (k) {
        case 'h':
          goToBody('earth');
          break;
        case 't':
          ui.setSizeMode(ui.sizeMode === 'true' ? 'visible' : 'true');
          break;
        case 'o':
          ui.toggle('showOrbits');
          break;
        case 'l':
          ui.toggle('showLabels');
          break;
        case 'b':
          ui.toggle('showBelts');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
