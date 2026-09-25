/** Actions shared by the welcome screen, the tour and the manual. */
import { useUI, WELCOME_KEY } from '../state/ui';
import { flushStorage } from '../lib/persistStorage';

/** Remember that the welcome screen has been seen. */
export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** Open the lab on Experiment 1 (and the instruments too when there is room for both). */
export function startExperiment1(): void {
  useUI.setState((s) => ({
    leftOpen: true,
    rightOpen: s.rightOpen || window.innerWidth >= 1280,
    manualTab: 'experiments',
    experiment: 'E1',
  }));
}

export function startTour(): void {
  useUI.setState({ welcomeOpen: false, tourStep: 0 });
}
export function showWelcome(): void {
  useUI.setState({ welcomeOpen: true, tourStep: null });
}

/**
 * Forget the layout and preferences (not the notebook): panel sizes and states, display
 * toggles, collapsed sections, reference notes already shown, and the welcome screen.
 */
export function resetPreferences(): void {
  flushStorage(); // so no pending write lands after the keys are removed
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('lightspeed.') && k !== 'lightspeed.notebook') localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
  window.location.hash = '';
  window.location.reload();
}
