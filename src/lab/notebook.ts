/**
 * The lab notebook: every recorded reading, per experiment, kept in localStorage so it
 * survives a reload. Values are stored in base units (s, km, km/s, degrees).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deferredStorage } from '../lib/persistStorage';

export type ExperimentId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
export const EXPERIMENT_IDS: ExperimentId[] = ['E1', 'E2', 'E3', 'E4', 'E5'];

export type Value = number | string;

export interface DataRow {
  id: string;
  exp: ExperimentId;
  /** Reading number within the experiment (1, 2, …). */
  n: number;
  /** Simulation time of the reading, ms (Unix epoch). */
  simMs: number;
  v: Record<string, Value>;
  /** Standard uncertainties (1σ), present when simulated instrument noise was on. */
  s?: Record<string, number>;
  src: 'auto' | 'manual';
}

interface NotebookState {
  rows: DataRow[];
  /** Simulate realistic instrument uncertainty on new readings. */
  noise: boolean;
  counters: Record<ExperimentId, number>;
  /** Written answers and conclusions, keyed "E2.q1", "E2.conclusion". */
  answers: Record<string, string>;
  /** Name(s) printed on lab reports. */
  student: string;
  setAnswer: (key: string, text: string) => void;
  setStudent: (name: string) => void;
  add: (exp: ExperimentId, v: Record<string, Value>, s: Record<string, number> | undefined, src: DataRow['src'], simMs: number) => DataRow;
  remove: (id: string) => void;
  clear: (exp?: ExperimentId) => void;
  setNoise: (on: boolean) => void;
}

const zero = (): Record<ExperimentId, number> => ({ E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 });

export const useNotebook = create<NotebookState>()(
  persist(
    (set, get) => ({
      rows: [],
      noise: false,
      counters: zero(),
      answers: {},
      student: '',
      setAnswer: (key, text) => set((st) => ({ answers: { ...st.answers, [key]: text } })),
      setStudent: (name) => set({ student: name }),
      add: (exp, v, s, src, simMs) => {
        const n = get().counters[exp] + 1;
        const row: DataRow = { id: `${exp}-${n}-${Date.now().toString(36)}`, exp, n, simMs, v, s, src };
        set((st) => ({ rows: [...st.rows, row], counters: { ...st.counters, [exp]: n } }));
        return row;
      },
      remove: (id) => set((st) => ({ rows: st.rows.filter((r) => r.id !== id) })),
      clear: (exp) =>
        set((st) =>
          exp
            ? { rows: st.rows.filter((r) => r.exp !== exp), counters: { ...st.counters, [exp]: 0 } }
            : { rows: [], counters: zero() },
        ),
      setNoise: (on) => set({ noise: on }),
    }),
    { name: 'lightspeed.notebook', version: 1, storage: deferredStorage },
  ),
);

export const rowsFor = (rows: DataRow[], exp: ExperimentId): DataRow[] => rows.filter((r) => r.exp === exp);

export const num = (r: DataRow, key: string): number => {
  const x = r.v[key];
  return typeof x === 'number' ? x : NaN;
};
