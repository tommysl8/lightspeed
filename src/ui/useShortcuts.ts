import { useEffect } from 'react';
import { controller, isTyping } from '../controls/cameraController';
import { resetToNow, togglePause } from '../sim/clock';
import { stepRate } from '../sim/travel';
import { useUI } from '../state/ui';
import { recordManual } from '../lab/logger';
import { bodyForKey, goToBody } from './navigation';
import { openPlanner } from './tripActions';
import { openSearch, toggleLab } from './onboarding';
import { closeDoc, docRoute, openLearn } from '../state/route';

/** Controls that Space activates, or that use the arrow keys, when focused from the keyboard. */
const OWN_KEYS = 'button, a[href], summary, [role="radio"], [role="tab"], [role="slider"], [role="separator"], [tabindex]';


export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // Ctrl+K (Cmd+K on a Mac) opens "Where to?" from anywhere but a reading page or dialog,
      // and a second press closes it, wherever the focus is inside it (never the browser's own
      // Ctrl+K, which would take focus to the address bar).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        const u = useUI.getState();
        if (u.searchOpen) {
          e.preventDefault();
          useUI.setState({ searchOpen: false });
          return;
        }
        if (docRoute() || u.reportFor || u.welcomeOpen || u.tourStep !== null || u.journeysOpen || u.keysOpen) return;
        e.preventDefault();
        openSearch();
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
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
      if (ui.reportFor || ui.welcomeOpen || ui.tourStep !== null || ui.journeysOpen || ui.keysOpen || ui.searchOpen) return;
      if (!ui.shortcuts && e.key !== 'Escape') return;
      // Space presses a button that was reached with Tab; it pauses only otherwise.
      const t = e.target as HTMLElement | null;
      if (e.code === 'Space' && t?.closest?.(OWN_KEYS) && t.matches(':focus-visible')) return;

      if (e.key === '?') {
        useUI.setState({ keysOpen: true });
        return;
      }
      if (e.key === '/') {
        e.preventDefault(); // or the slash lands in the search field as it takes focus
        openSearch();
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
        openLearn();
        return;
      }
      // R records a lab reading, and only for someone using the lab: a stray R (next to WASD)
      // must not bring up lab messages for anyone else.
      if (k === 'r') {
        const byHand = ui.experiment === 'E3' || ui.experiment === 'E4';
        if (!ui.leftOpen && !(ui.labUsed && byHand)) return;
        e.preventDefault();
        recordManual();
        return;
      }
      if (k === 'g' && !ui.tripActive) {
        openPlanner();
        return;
      }

      // Body keys come from the registry: 0–9, M and V for the built-in bodies.
      const body = bodyForKey(k);
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
          toggleLab();
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
