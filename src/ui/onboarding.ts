/**
 * Actions shared by the welcome screen, the tour, the header, the keys and the guide.
 *
 * The lab (left dock) opens only through openLab, toggleLab, openExperiment and
 * startExperiment1, and each of those is called only from something the visitor clicks or
 * presses asking for it: the Lab button, K, the welcome screen's "For students" link, the
 * Learn hub's lab card, the guide, "Open Experiment" on the arrival card (shown only once the
 * lab has been used) and the lab's own links to its reference sections. "Read more" and "Why"
 * (physics hints, the arrival card, the warning band, the flight planner) open Learn, never
 * the lab. Nothing opens it by itself, and it is not reopened on a reload.
 */
import { useUI, WELCOME_KEY, type ManualTab } from '../state/ui';
import type { ExperimentId } from '../lab/notebook';
import { flushStorage } from '../lib/persistStorage';

/** Remember that the welcome screen has been seen. */
export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** Open the lab on its experiments (or another of its tabs). */
export function openLab(tab: ManualTab = 'experiments'): void {
  useUI.setState({ leftOpen: true, manualTab: tab, labUsed: true });
}

/** Open the lab at an experiment (the arrival card's "Open Experiment"). */
export function openExperiment(exp: ExperimentId): void {
  useUI.setState({ leftOpen: true, manualTab: 'experiments', experiment: exp, labUsed: true });
}

/** The Lab button and K: open the lab on its experiments, or close it. */
export function toggleLab(): void {
  if (useUI.getState().leftOpen) useUI.setState({ leftOpen: false });
  else openLab();
}

/** Open the lab on Experiment 1 (and the instruments too when there is room for both). */
export function startExperiment1(): void {
  useUI.setState((s) => ({
    leftOpen: true,
    labUsed: true,
    rightOpen: s.rightOpen || window.innerWidth >= 1280,
    manualTab: 'experiments',
    experiment: 'E1',
  }));
}

/** The "Where to?" search palette. */
export function openSearch(): void {
  useUI.setState({ searchOpen: true, welcomeOpen: false, tourStep: null, journeysOpen: false, keysOpen: false });
}

export function openJourneys(): void {
  useUI.setState({ journeysOpen: true, searchOpen: false, welcomeOpen: false, tourStep: null, keysOpen: false });
}

export function startTour(): void {
  useUI.setState({ welcomeOpen: false, tourStep: 0, journeysOpen: false, searchOpen: false, keysOpen: false });
}
export function showWelcome(): void {
  useUI.setState({ welcomeOpen: true, tourStep: null, journeysOpen: false, searchOpen: false, keysOpen: false });
}

/**
 * Forget the layout and preferences (not the notebook): panel sizes and states, display
 * toggles, collapsed sections, physics notes already shown, and the welcome screen.
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
