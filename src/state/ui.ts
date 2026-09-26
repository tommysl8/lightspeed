import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deferredStorage } from '../lib/persistStorage';
import type { BodyId } from '../physics/constants';
import type { SizeMode } from '../sim/sim';
import type { ExplainerId } from '../content/explainers';
import type { ExperimentId } from '../lab/notebook';

export type ControlMode = 'orbit' | 'free' | 'transition' | 'travel';
export type ManualTab = 'experiments' | 'notebook' | 'reference';
export type ScopeChannel = 'beta' | 'gamma' | 'range' | 'dopplerFwd' | 'dtau';

export interface UIState {
  /** Body shown on the body card and the instruments' target data sheet. */
  selected: BodyId | null;
  /** Body the orbit camera is centred on. */
  focus: BodyId;
  controlMode: ControlMode;
  sizeMode: SizeMode;
  showOrbits: boolean;
  showLabels: boolean;
  showBelts: boolean;
  /** Viewport instruments: reticle, scale bar, axis triad, apex markers. */
  showOverlays: boolean;
  /** Ecliptic coordinate grid on the sky. */
  showGrid: boolean;
  /** First-visit welcome screen. */
  welcomeOpen: boolean;
  /** Guided tour: index of the step shown, or null. */
  tourStep: number | null;
  /** The list of one-click journeys. */
  journeysOpen: boolean;
  /** The keyboard and mouse sheet. */
  keysOpen: boolean;
  /** The "Where to?" search palette. */
  searchOpen: boolean;
  /** What to look for on the journey under way (shown on the flight recorder). */
  journeyNote: string | null;
  /** Card with facts and actions for the selected body (closable; returns on the next selection). */
  bodyCard: boolean;
  /** Single-key shortcuts (off for users of assistive technology that needs the keys). */
  shortcuts: boolean;
  /** Frame-rate and render-quality readout in the status bar. */
  showFps: boolean;
  /** Free-flight throttle as a fraction of c (mirrors the controller). */
  throttleBeta: number;

  /** Mirrors of the simulation clock, for rendering controls. */
  warp: number;
  paused: boolean;

  /** Draw bodies where they were when the light now reaching you left them. */
  retarded: boolean;

  /** Relativistic optics: off (classical), on, or split screen classical | relativistic. */
  relMode: 'off' | 'on' | 'split';
  /** Split-screen divider position (fraction of the viewport width). */
  splitX: number;
  /** Include Doppler shift and beaming (off: aberration only). */
  relDoppler: boolean;

  /** Docked panels: the lab (left) and the instruments (right). */
  leftOpen: boolean;
  rightOpen: boolean;
  /**
   * The lab has been opened at least once. Until then nothing in the interface mentions it
   * (no "Logged as Experiment 2" on arrival): the lab is for those who go looking for it.
   */
  labUsed: boolean;
  /** Dock widths, CSS px (resizable). */
  leftWidth: number;
  rightWidth: number;
  manualTab: ManualTab;
  /** Experiment open in the lab manual (null: the list). */
  experiment: ExperimentId | null;
  /** Reference section open in the manual. */
  refTopic: ExplainerId;
  /** A reference section suggested by what just happened (shown as a margin note). */
  noteTopic: ExplainerId | null;
  /**
   * Physics margin notes: suggest an explanation the first time something happens (past 0.1c,
   * a change of scale …). Off by default, so nothing pops up unasked.
   */
  hints: boolean;
  scopeChannel: ScopeChannel;
  /** Experiment whose lab report is open (print preview). */
  reportFor: ExperimentId | null;

  /** Flight planner. */
  plannerOpen: boolean;
  /** Drive: constant cruise speed, realistic 1 g rocket, or fictional warp beyond c. */
  plannerDrive: 'cruise' | 'rocket' | 'warp';
  /** Warp speed as a multiple of c (fictional). */
  plannerWarpFactor: number;
  plannerDest: BodyId;
  plannerBeta: number;
  tripActive: boolean;

  select: (id: BodyId | null) => void;
  toggle: (
    key:
      | 'showOrbits'
      | 'showLabels'
      | 'showBelts'
      | 'showOverlays'
      | 'showGrid'
      | 'retarded'
      | 'showFps'
      | 'leftOpen'
      | 'rightOpen'
      | 'shortcuts'
      | 'hints',
  ) => void;
  setSizeMode: (m: SizeMode) => void;
}

export const WELCOME_KEY = 'lightspeed.welcome';

/**
 * Whether a saved lab notebook shows that someone worked in the lab: a reading taken by hand
 * (Experiments 3 and 4), written answers, a name for the reports, or simulated uncertainty
 * turned on. Automatic rows do not count: every flight and light pulse writes them, whether
 * or not the lab was ever opened.
 */
export function notebookShowsLabUse(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const st = (JSON.parse(raw) as { state?: unknown })?.state as
      | { rows?: unknown; answers?: unknown; student?: unknown; noise?: unknown }
      | undefined;
    if (!st || typeof st !== 'object') return false;
    const rows = Array.isArray(st.rows) ? st.rows : [];
    if (rows.some((r) => (r as { src?: unknown } | null)?.src === 'manual')) return true;
    const answers = st.answers && typeof st.answers === 'object' ? Object.values(st.answers) : [];
    if (answers.some((a) => typeof a === 'string' && a.trim() !== '')) return true;
    if (typeof st.student === 'string' && st.student.trim() !== '') return true;
    return st.noise === true;
  } catch {
    return false;
  }
}

function savedNotebookShowsLabUse(): boolean {
  try {
    return notebookShowsLabUse(localStorage.getItem('lightspeed.notebook'));
  } catch {
    return false;
  }
}

/**
 * Whether preferences saved by an earlier version show the lab in use: an experiment opened, or
 * one of the lab's own tabs chosen (from version 3 the panel opened on its explanations, so
 * "experiments" there was a click too).
 */
function prefsShowLabUse(old: Partial<UIState>, version: number): boolean {
  if (old.experiment) return true;
  return old.manualTab === 'notebook' || (version >= 3 && old.manualTab === 'experiments');
}

/** Bring preferences saved by an earlier version up to date (see the persist options below). */
export function migrateUI(old: unknown, version: number, notebookUsed: () => boolean = savedNotebookShowsLabUse): Partial<UIState> {
  const saved = (old ?? {}) as Partial<UIState>;
  let s = saved;
  if (version < 2) s = { ...s, leftOpen: false, rightOpen: false };
  if (version < 3) s = { ...s, manualTab: 'reference' };
  if (version < 4) s = { ...s, hints: false };
  if (version < 5) {
    const labUsed = prefsShowLabUse(saved, version) || notebookUsed();
    s = { ...s, leftOpen: false, rightOpen: false, manualTab: 'experiments', labUsed };
  }
  return s;
}

/** What is saved between visits: preferences only; the simulation always starts fresh. */
export const savedPrefs = (s: UIState) => ({
  showOrbits: s.showOrbits,
  showLabels: s.showLabels,
  showBelts: s.showBelts,
  showOverlays: s.showOverlays,
  showGrid: s.showGrid,
  showFps: s.showFps,
  // Not leftOpen: the lab opens only when asked for, never on a reload.
  rightOpen: s.rightOpen,
  labUsed: s.labUsed,
  leftWidth: s.leftWidth,
  rightWidth: s.rightWidth,
  manualTab: s.manualTab,
  experiment: s.experiment,
  refTopic: s.refTopic,
  scopeChannel: s.scopeChannel,
  relDoppler: s.relDoppler,
  shortcuts: s.shortcuts,
  hints: s.hints,
});

function welcomed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      selected: null,
      focus: 'earth',
      controlMode: 'orbit',
      sizeMode: 'true',
      showOrbits: true,
      showLabels: true,
      showBelts: true,
      showOverlays: true,
      showGrid: false,
      welcomeOpen: !welcomed(),
      tourStep: null,
      journeysOpen: false,
      keysOpen: false,
      searchOpen: false,
      journeyNote: null,
      bodyCard: true,
      shortcuts: true,
      showFps: false,
      throttleBeta: 0,
      warp: 1,
      paused: false,
      retarded: false,
      relMode: 'on',
      splitX: 0.5,
      relDoppler: true,
      // Both panels start closed: a first visit opens on the view alone.
      leftOpen: false,
      rightOpen: false,
      labUsed: false,
      leftWidth: 384,
      rightWidth: 312,
      // The lab opens on its experiments (the Lab button and K set this too).
      manualTab: 'experiments',
      experiment: null,
      refTopic: 'light-time',
      noteTopic: null,
      hints: false,
      scopeChannel: 'beta',
      reportFor: null,
      plannerOpen: false,
      plannerDrive: 'cruise',
      plannerWarpFactor: 10,
      plannerDest: 'mars',
      plannerBeta: 0.5,
      tripActive: false,
      // Selecting a body brings its card back if it was closed.
      select: (id) => set((s) => ({ selected: id, bodyCard: id ? true : s.bodyCard })),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UIState>),
      setSizeMode: (m) => set({ sizeMode: m }),
    }),
    {
      name: 'lightspeed.ui',
      version: 5,
      storage: deferredStorage,
      // v2 introduced the welcome screen and closed panels by default; v3 opens the physics
      // panel on its explanations rather than on the experiments; v4 adds the physics margin
      // notes as an option, off; v5 is the fun-first layout: both docks closed again (the lab
      // is no longer remembered as open, so it never appears by itself), the lab opening on its
      // experiments, and the labUsed flag, set only for those who really worked in the lab.
      migrate: (old, version) => migrateUI(old, version) as UIState,
      // Only preferences persist; the simulation always starts fresh.
      partialize: savedPrefs,
    },
  ),
);
