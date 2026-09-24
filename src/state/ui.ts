import { create } from 'zustand';
import type { BodyId } from '../physics/constants';
import type { SizeMode } from '../sim/sim';

export type ControlMode = 'orbit' | 'free' | 'transition' | 'travel';

export interface UIState {
  /** Body whose info card is open. */
  selected: BodyId | null;
  /** Body the orbit camera is centred on. */
  focus: BodyId;
  controlMode: ControlMode;
  sizeMode: SizeMode;
  showOrbits: boolean;
  showLabels: boolean;
  showBelts: boolean;
  helpOpen: boolean;
  /** Free-flight throttle as a fraction of c (mirrors the controller). */
  throttleBeta: number;

  /** Mirrors of the simulation clock, for rendering controls. */
  warp: number;
  paused: boolean;

  /** Draw bodies where they were when the light now reaching you left them. */
  retarded: boolean;

  /** Relativistic optics: off, on (default), or split screen naive vs. relativistic. */
  relMode: 'off' | 'on' | 'split';
  /** Split-screen divider position (fraction of width). */
  splitX: number;
  /** Include Doppler shift and beaming (off: aberration only). */
  relDoppler: boolean;

  /** Trip planner. */
  plannerOpen: boolean;
  plannerDest: BodyId;
  plannerBeta: number;
  tripActive: boolean;

  select: (id: BodyId | null) => void;
  toggle: (key: 'showOrbits' | 'showLabels' | 'showBelts' | 'helpOpen' | 'retarded') => void;
  setSizeMode: (m: SizeMode) => void;
}

export const useUI = create<UIState>()((set) => ({
  selected: null,
  focus: 'earth',
  controlMode: 'orbit',
  sizeMode: 'true',
  showOrbits: true,
  showLabels: true,
  showBelts: true,
  helpOpen: false,
  throttleBeta: 0,
  warp: 1,
  paused: false,
  retarded: false,
  relMode: 'on',
  splitX: 0.5,
  relDoppler: true,
  plannerOpen: false,
  plannerDest: 'mars',
  plannerBeta: 0.5,
  tripActive: false,
  select: (id) => set({ selected: id }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UIState>),
  setSizeMode: (m) => set({ sizeMode: m }),
}));
