/**
 * The single-key shortcuts (the keys sheet, ui/keys.tsx, lists them; the camera's own keys, WASD, the
 * arrows, + and −, are the controller's). While flying by hand (Roam, or the ship) W A S D Q E R C steer and
 * Space is up, so P pauses. Esc steps back one thing at a time (escapeStep): out of clean full screen first,
 * then closes what is open, then leaves Roam (the ship goes back to Roam). F is Roam, Shift+F clean full
 * screen; in clean full screen a key that opens something brings the interface back first (keyLeavesClean).
 */
import { useEffect } from 'react';
import { controller, isTyping } from '../controls/cameraController';
import { resetToNow, togglePause } from '../sim/clock';
import { stepRate } from '../sim/travel';
import { useUI, type UIState } from '../state/ui';
import { bodyForKey, goToBody, toggleRoam } from './navigation';
import { cleanJustEnded, leaveClean, toggleClean } from './cleanMode';
import { openPlanner } from './tripActions';
import { openSearch } from './onboarding';
import { closeDoc, docRoute, openLearn } from '../state/route';
import { toggleConstellations } from './constellations';

/** Controls that Space activates, or that use the arrow keys, when focused from the keyboard. */
const OWN_KEYS = 'button, a[href], summary, [role="radio"], [role="tab"], [role="slider"], [role="separator"], [tabindex]';

/** Keys that open something on screen: in clean full screen they bring the interface back first. */
const OPENS_INTERFACE = new Set(['?', '/', 'e', 'i', 'g']);
/** Letters that steer while flying by hand (Roam, the ship): not shortcuts then. */
const FLIGHT_LETTERS = 'wasdqerc';

/** Whether key `k` brings the interface back from clean full screen first (not a letter that steers while flying). */
export const keyLeavesClean = (k: string, flying: boolean): boolean => OPENS_INTERFACE.has(k) && !(flying && FLIGHT_LETTERS.includes(k));

/** What one press of Esc does, the first that applies: clean full screen, the planner, a note, the selection, a journey's note, Roam, the ship. */
export type EscapeStep = 'clean' | 'planner' | 'note' | 'selection' | 'journey' | 'roam' | 'ship' | null;

export function escapeStep(ui: Pick<UIState, 'clean' | 'plannerOpen' | 'noteTopic' | 'selected' | 'journeyNote' | 'tripActive' | 'controlMode'>): EscapeStep {
  if (ui.clean) return 'clean';
  if (ui.plannerOpen) return 'planner';
  if (ui.noteTopic) return 'note';
  if (ui.selected) return 'selection';
  if (ui.journeyNote && !ui.tripActive) return 'journey';
  // Out of Roam, orbiting the nearest body; the ship (its pointer not locked) goes back to Roam.
  if (ui.controlMode === 'roam') return 'roam';
  if (ui.controlMode === 'free') return 'ship';
  return null;
}


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
        if (docRoute() || u.welcomeOpen || u.tourStep !== null || u.journeysOpen || u.keysOpen) return;
        e.preventDefault();
        leaveClean();
        openSearch();
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      // A held key must not repeat readings or toggles; only the rate keys step on repeat.
      if (e.repeat && !'[],.'.includes(e.key)) return;
      if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
      const ui = useUI.getState();
      // Flying by hand: Roam, or the ship.
      const flying = ui.controlMode === 'free' || ui.controlMode === 'roam';
      const k = e.key.toLowerCase();

      // Pages and dialogs that handle their own keys
      if (docRoute()) {
        if (e.key === 'Escape') closeDoc();
        return;
      }
      if (ui.welcomeOpen || ui.tourStep !== null || ui.journeysOpen || ui.keysOpen || ui.searchOpen) return;
      if (!ui.shortcuts && e.key !== 'Escape') return;
      // Space presses a button that was reached with Tab; it pauses only otherwise.
      const t = e.target as HTMLElement | null;
      if (e.code === 'Space' && t?.closest?.(OWN_KEYS) && t.matches(':focus-visible')) return;

      // The Esc with which the browser left full screen, or released the pointer, has done its work already.
      if (e.key === 'Escape' && (cleanJustEnded() || controller.justUnlocked)) return;
      if (ui.clean && keyLeavesClean(k, flying)) leaveClean();
      if (e.key === '?') {
        useUI.setState({ keysOpen: true });
        return;
      }
      if (e.key === '/') {
        e.preventDefault(); // or the slash lands in the search field as it takes focus
        openSearch();
        return;
      }
      // Esc leaves clean full screen first (everything is hidden there), then closes panels, then leaves Roam;
      // it never ends a trip or a fall into a black hole (nothing leaves one: the HUD's "Stop the fall" puts
      // the camera back where it let go).
      if (e.key === 'Escape') {
        switch (escapeStep(ui)) {
          case 'clean':
            leaveClean();
            break;
          case 'planner':
            useUI.setState({ plannerOpen: false });
            break;
          case 'note':
            useUI.setState({ noteTopic: null });
            break;
          case 'selection':
            ui.select(null);
            break;
          case 'journey':
            useUI.setState({ journeyNote: null });
            break;
          case 'roam':
            controller.exitRoam();
            break;
          case 'ship':
            controller.shipToRoam();
            break;
        }
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
        // Shift+F: clean full screen, on and off.
        if (e.shiftKey) {
          toggleClean();
          return;
        }
        // Roam on and off (refused, with a message, on a trip and in a fall; a circular orbit or a snapshot ends first).
        toggleRoam();
        return;
      }
      // Letters used for flying are not shortcuts while in flight.
      if (flying && FLIGHT_LETTERS.includes(k)) return;
      if (k === 'e') {
        openLearn();
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
        case 'y':
          toggleConstellations();
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
