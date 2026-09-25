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

  /** Docked panels. */
  leftOpen: boolean;
  rightOpen: boolean;
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
  scopeChannel: ScopeChannel;
  /** Experiment whose lab report is open (print preview). */
  reportFor: ExperimentId | null;

  /** Trajectory planner. */
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
    key: 'showOrbits' | 'showLabels' | 'showBelts' | 'showOverlays' | 'showGrid' | 'retarded' | 'showFps' | 'leftOpen' | 'rightOpen' | 'shortcuts',
  ) => void;
  setSizeMode: (m: SizeMode) => void;
}

export const WELCOME_KEY = 'lightspeed.welcome';

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
      leftWidth: 384,
      rightWidth: 312,
      // The physics panel opens on the explanations; the experiments are its second tab.
      manualTab: 'reference',
      experiment: null,
      refTopic: 'light-time',
      noteTopic: null,
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
      version: 3,
      storage: deferredStorage,
      // v2 introduced the welcome screen and closed panels by default; v3 opens the physics
      // panel on its explanations rather than on the experiments.
      migrate: (old, version) => {
        let s = (old ?? {}) as Partial<UIState>;
        if (version < 2) s = { ...s, leftOpen: false, rightOpen: false };
        if (version < 3) s = { ...s, manualTab: 'reference' };
        return s as UIState;
      },
      // Only preferences persist; the simulation always starts fresh.
      partialize: (s) => ({
        showOrbits: s.showOrbits,
        showLabels: s.showLabels,
        showBelts: s.showBelts,
        showOverlays: s.showOverlays,
        showGrid: s.showGrid,
        showFps: s.showFps,
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        leftWidth: s.leftWidth,
        rightWidth: s.rightWidth,
        manualTab: s.manualTab,
        experiment: s.experiment,
        refTopic: s.refTopic,
        scopeChannel: s.scopeChannel,
        relDoppler: s.relDoppler,
        shortcuts: s.shortcuts,
      }),
    },
  ),
);
