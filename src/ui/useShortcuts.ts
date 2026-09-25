import { useEffect } from 'react';
import { BODY_ORDER, type BodyId } from '../physics/constants';
import { controller, isTyping } from '../controls/cameraController';
import { resetToNow, togglePause } from '../sim/clock';
import { stepRate } from '../sim/travel';
import { useUI } from '../state/ui';
import { recordManual } from '../lab/logger';
import { BODY_KEYS, goToBody } from './navigation';
import { openPlanner } from './tripActions';
import { closeDoc, docRoute } from '../state/route';

/** Controls that Space activates, or that use the arrow keys, when focused from the keyboard. */
const OWN_KEYS = 'button, a[href], summary, [role="radio"], [role="tab"], [role="slider"], [role="separator"], [tabindex]';

const KEY_TO_BODY = new Map<string, BodyId>(
  BODY_ORDER.filter((id) => BODY_KEYS[id]).map((id) => [BODY_KEYS[id]!.toLowerCase(), id]),
);

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      // A held key must not repeat readings or toggles; only the rate keys step on repeat.
      if (e.repeat && !'[],.'.includes(e.key)) return;
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      const ui = useUI.getState();
      const flying = ui.controlMode === 'free';
      const k = e.key.toLowerCase();

      // Pages and dialogs that handle their own keys
      if (docRoute()) {
        if (e.key === 'Escape') closeDoc();
        return;
      }
      if (ui.reportFor || ui.welcomeOpen || ui.tourStep !== null || ui.journeysOpen || ui.keysOpen) return;
      if (!ui.shortcuts && e.key !== 'Escape') return;
      // Space presses a button that was reached with Tab; it pauses only otherwise.
      const t = e.target as HTMLElement | null;
      if (e.code === 'Space' && t?.closest?.(OWN_KEYS) && t.matches(':focus-visible')) return;

      if (e.key === '?') {
        useUI.setState({ keysOpen: true });
        return;
      }
      if (e.key === 'Escape') {
        if (ui.plannerOpen) useUI.setState({ plannerOpen: false });
        else if (ui.noteTopic) useUI.setState({ noteTopic: null });
        else if (ui.selected) ui.select(null);
        else if (ui.journeyNote && !ui.tripActive) useUI.setState({ journeyNote: null });
        return;
      }
      // Time
      if (k === 'p' || (e.code === 'Space' && !flying)) {
        e.preventDefault();
        togglePause();
        return;
      }
      if (k === '[' || k === ',') return stepRate(-1);
      if (k === ']' || k === '.') return stepRate(1);
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
