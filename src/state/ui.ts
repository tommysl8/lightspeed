import { create } from 'zustand';
import type { BodyId } from '../physics/constants';
import type { SizeMode } from '../sim/sim';

export type ControlMode = 'orbit' | 'free' | 'transition';

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
  select: (id: BodyId | null) => void;
  toggle: (key: 'showOrbits' | 'showLabels' | 'showBelts' | 'helpOpen') => void;
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
  select: (id) => set({ selected: id }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<UIState>),
  setSizeMode: (m) => set({ sizeMode: m }),
}));
