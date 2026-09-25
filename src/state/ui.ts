import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BodyId } from '../physics/constants';
import type { SizeMode } from '../sim/sim';
import type { ExplainerId } from '../content/explainers';
import type { ExperimentId } from '../lab/notebook';

export type ControlMode = 'orbit' | 'free' | 'transition' | 'travel';
export type ManualTab = 'experiments' | 'notebook' | 'reference';
export type ScopeChannel = 'beta' | 'gamma' | 'range' | 'dopplerFwd' | 'dtau';

export interface UIState {
  /** Body shown on the target data sheet. */
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
  helpOpen: boolean;
  aboutOpen: boolean;
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
  manualTab: ManualTab;
  /** Experiment open in the lab manual (null: the list). */
  experiment: ExperimentId | null;
  /** Reference section open in the manual. */
  refTopic: ExplainerId;
  /** A reference section suggested by what just happened (shown as a margin note). */
  noteTopic: ExplainerId | null;
  scopeChannel: ScopeChannel;

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
    key: 'showOrbits' | 'showLabels' | 'showBelts' | 'showOverlays' | 'helpOpen' | 'retarded' | 'aboutOpen' | 'showFps' | 'leftOpen' | 'rightOpen',
  ) => void;
  setSizeMode: (m: SizeMode) => void;
}

const wide = (px: number) => typeof window === 'undefined' || window.innerWidth >= px;

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
      helpOpen: false,
      aboutOpen: false,
      showFps: false,
      throttleBeta: 0,
      warp: 1,
      paused: false,
      retarded: false,
      relMode: 'on',
      splitX: 0.5,
      relDoppler: true,
      leftOpen: wide(1280),
      rightOpen: wide(960),
      manualTab: 'experiments',
      experiment: null,
      refTopic: 'light-time',
      noteTopic: null,
      scopeChannel: 'beta',
      plannerOpen: false,
      plannerDrive: 'cruise',
      plannerWarpFactor: 10,
      plannerDest: 'mars',
      plannerBeta: 0.5,
      tripActive: false,
      select: (id) => set({ selected: id }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UIState>),
      setSizeMode: (m) => set({ sizeMode: m }),
    }),
    {
      name: 'lightspeed.ui',
      version: 1,
      // Only preferences persist; the simulation always starts fresh.
      partialize: (s) => ({
        showOrbits: s.showOrbits,
        showLabels: s.showLabels,
        showBelts: s.showBelts,
        showOverlays: s.showOverlays,
        showFps: s.showFps,
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        manualTab: s.manualTab,
        experiment: s.experiment,
        refTopic: s.refTopic,
        scopeChannel: s.scopeChannel,
        relDoppler: s.relDoppler,
      }),
    },
  ),
);
