import { useEffect } from 'react';
import { BODY_ORDER, type BodyId } from '../physics/constants';
import { controller, isTyping } from '../controls/cameraController';
import { resetToNow, stepWarp, togglePause } from '../sim/clock';
import { useUI } from '../state/ui';
import { recordManual } from '../lab/logger';
import { BODY_KEYS, goToBody } from './navigation';
import { openPlanner } from './tripActions';

const KEY_TO_BODY = new Map<string, BodyId>(
  BODY_ORDER.filter((id) => BODY_KEYS[id]).map((id) => [BODY_KEYS[id]!.toLowerCase(), id]),
);

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      const ui = useUI.getState();
      const flying = ui.controlMode === 'free';
      const k = e.key.toLowerCase();

      if (e.key === '?') {
        ui.toggle('helpOpen');
        return;
      }
      if (ui.reportFor) return; // the report handles its own keys
      if (e.key === 'Escape') {
        if (ui.helpOpen) useUI.setState({ helpOpen: false });
        else if (ui.aboutOpen) useUI.setState({ aboutOpen: false });
        else if (ui.plannerOpen) useUI.setState({ plannerOpen: false });
        else if (ui.noteTopic) useUI.setState({ noteTopic: null });
        else if (ui.selected) ui.select(null);
        return;
      }
      // Time
      if (k === 'p' || (e.code === 'Space' && !flying)) {
        e.preventDefault();
        togglePause();
        return;
      }
      if (k === '[' || k === ',') return stepWarp(-1);
      if (k === ']' || k === '.') return stepWarp(1);
      if (k === 'n') return resetToNow();
      if (k === 'z') {
        useUI.setState({ relMode: ui.relMode === 'off' ? 'on' : 'off' });
        return;
      }
      if (k === 'x') {
        useUI.setState({ relMode: ui.relMode === 'split' ? 'on' : 'split' });
        return;
      }

      if (k === 'f') {
        if (flying) controller.exitFreeFlight();
        else controller.enterFreeFlight();
        return;
      }
      // Letters used for flying are not shortcuts while in flight.
      if (flying && 'wasdqerc'.includes(k)) return;
      if (k === 'e') {
        const onRef = ui.leftOpen && ui.manualTab === 'reference';
        useUI.setState(onRef ? { leftOpen: false } : { leftOpen: true, manualTab: 'reference' });
        return;
      }
      if (k === 'r') {
        e.preventDefault();
        recordManual();
        return;
      }
      if (k === 'g' && !ui.tripActive) {
        openPlanner();
        return;
      }

      const body = KEY_TO_BODY.get(k);
      if (body) {
        if (ui.tripActive) ui.select(body);
        else goToBody(body);
        return;
      }
      switch (k) {
        case 'h':
          if (!ui.tripActive) goToBody('earth');
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
        case 'u':
          ui.toggle('showOverlays');
          break;
        case 'j':
          ui.toggle('showGrid');
          break;
        case 'k':
          ui.toggle('leftOpen');
          break;
        case 'i':
          ui.toggle('rightOpen');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
