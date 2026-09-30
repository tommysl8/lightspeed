/**
 * The GPU-time controller: keeps a frame near a black hole within the target laptop's budget (about 8 ms of
 * GPU a frame at pixel ratio 2) by stepping the lens's quality rungs (quality.lensRung; docs/data/blackholes.md §10).
 *
 * How: one TIME_ELAPSED query a frame round all its GPU work, from before the accretion flow's map and the sky
 * cube's faces to the end of the composer's render (GpuFrameTimer, driven by render/RenderPipeline.tsx), only while
 * a lens is drawn; read when available (two or three frames later),
 * dropped when the GPU reports a disjoint; a rolling median of the last 60 measured frames. The rung steps down
 * (less work) after 60 frames whose median is over 8.5 ms and up after 300 under 6.5 ms; the median's window
 * starts afresh after every step, so each decision rests on frames drawn at the new settings. Only when the
 * rungs are exhausted and the median stays over does it ask for a step of the pixel ratio (wantsDprStep), and
 * it gives those steps back first when there is room again (wantsDprUp). Paused while a measurement of
 * dev/perf.ts holds a query (it pins the rung itself). Without the timer extension: rung 1 near a hole on an
 * integrated GPU, rung 0 elsewhere. The split view starts at rung 1 near a hole. Away from holes it measures
 * nothing and wants rung 0.
 *
 * Why: the frame-rate rules of render/AdaptiveQuality.tsx never engage between 8 and 22 ms a frame on a 60 Hz
 * panel, which is exactly where the lens's pieces land on this laptop.
 *
 * Cost: one query a frame near a hole (under 0.01 ms); an insertion sort of 60 numbers a measured frame. Nothing
 * allocated per frame (the queries are reused).
 *
 * Twins: render/quality.ts (the rungs, stepDown/stepUp), render/AdaptiveQuality.tsx (applies them),
 * dev/perf.ts (pauses it). Tests: gpuBudget.test.ts drives it with synthetic timings.
 */
import { quality, type LensRung } from './quality';

export type { LensRung };

/** What the controller adds to render/quality.ts. */
export interface QualityLensAddition {
  lensRung: LensRung;
}

/** The controller's interface, with what the app's wiring needs besides. */
export interface GpuBudget {
  /** Median GPU ms of the last 60 measured frames (NaN until measured). */
  medianMs: number;
  /** The timer extension is there (render/RenderPipeline.tsx sets it). */
  available: boolean;
  /** Paused by a measurement (dev/perf.ts): no queries, and the rung is left as it was pinned. */
  readonly paused: boolean;
  /** Feed one measurement (tests drive it with synthetic timings). */
  sample(ms: number): void;
  /** The rung it wants now, given whether a lens is active and the split view is on. */
  rung(lensActive: boolean, split: boolean): LensRung;
  /**
   * Whether it asks the pixel ratio to step down (rungs exhausted and still over); true once for each step. `canStep`:
   * whether the pixel ratio can go lower (false at 1): a step that cannot be taken is not counted, so none is given back.
   */
  wantsDprStep(canStep?: boolean): boolean;
  /** Whether it gives back one of the pixel-ratio steps it asked for (median under, room again); true once for each. */
  wantsDprUp(): boolean;
  pause(paused: boolean): void;
  /** Back to its first state (nothing measured, rung 0). */
  reset(): void;
}

/** The budget's thresholds, ms of GPU a frame. */
export const GPU_OVER_MS = 8.5;
export const GPU_UNDER_MS = 6.5;
/** Frames in the rolling median. */
export const GPU_WINDOW = 60;
/** Consecutive measured frames over (under) the threshold before a step down (up). */
export const GPU_DOWN_AFTER = 60;
export const GPU_UP_AFTER = 300;

const samples = new Float64Array(GPU_WINDOW);
const sorted = new Float64Array(GPU_WINDOW);
const st = {
  count: 0,
  next: 0,
  over: 0,
  under: 0,
  current: 0 as LensRung,
  active: false,
  split: false,
  /** Pixel-ratio steps asked for and not yet given back. */
  dprDown: 0,
  /** −1: wants a pixel-ratio step down; +1: one back up; 0 neither. */
  dprAsk: 0,
  paused: false,
};

function clearWindow(): void {
  st.count = 0;
  st.next = 0;
  st.over = 0;
  st.under = 0;
  gpuBudget.medianMs = NaN;
}

/** The lowest rung allowed now: 1 without the timer on an integrated GPU (nothing to measure by). */
function floorRung(): LensRung {
  return !gpuBudget.available && quality.integrated ? 1 : 0;
}

/** Median of the window, by an insertion sort into the scratch array (nothing allocated). */
function windowMedian(): number {
  const n = Math.min(st.count, GPU_WINDOW);
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    let j = i - 1;
    while (j >= 0 && sorted[j] > v) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = v;
  }
  if (n === 0) return NaN;
  const m = n >> 1;
  return n % 2 ? sorted[m] : 0.5 * (sorted[m - 1] + sorted[m]);
}

/** The controller. */
export const gpuBudget: GpuBudget = {
  medianMs: NaN,
  available: false,
  get paused() {
    return st.paused;
  },
  sample(ms: number): void {
    if (st.paused || !st.active || !(ms >= 0) || !Number.isFinite(ms)) return;
    samples[st.next] = ms;
    st.next = (st.next + 1) % GPU_WINDOW;
    st.count++;
    if (st.count < GPU_WINDOW) return;
    const med = windowMedian();
    gpuBudget.medianMs = med;
    if (med > GPU_OVER_MS) {
      st.over++;
      st.under = 0;
    } else if (med < GPU_UNDER_MS) {
      st.under++;
      st.over = 0;
    } else {
      st.over = 0;
      st.under = 0;
    }
    if (st.over >= GPU_DOWN_AFTER) {
      if (st.current < 2) st.current = (st.current + 1) as LensRung;
      else st.dprAsk = -1;
      clearWindow();
    } else if (st.under >= GPU_UP_AFTER) {
      if (st.dprDown > 0) st.dprAsk = 1;
      else if (st.current > floorRung()) st.current = (st.current - 1) as LensRung;
      clearWindow();
    }
  },
  rung(lensActive: boolean, split: boolean): LensRung {
    if (!lensActive) {
      if (st.active) {
        st.active = false;
        st.current = 0;
        st.dprDown = 0;
        st.dprAsk = 0;
        clearWindow();
      }
      st.split = split;
      return 0;
    }
    if (!st.active || (split && !st.split)) {
      // Arriving at a hole, or the split view turned on there: the split view starts at rung 1.
      if (!st.active) st.current = 0;
      st.active = true;
      if (split && st.current < 1) st.current = 1;
      clearWindow();
    }
    st.split = split;
    const floor = floorRung();
    if (st.current < floor) st.current = floor;
    return st.current;
  },
  wantsDprStep(canStep = true): boolean {
    if (st.dprAsk !== -1) return false;
    st.dprAsk = 0;
    if (!canStep) return false;
    st.dprDown++;
    return true;
  },
  wantsDprUp(): boolean {
    if (st.dprAsk !== 1) return false;
    st.dprAsk = 0;
    st.dprDown = Math.max(0, st.dprDown - 1);
    return true;
  },
  pause(paused: boolean): void {
    st.paused = paused;
    clearWindow();
  },
  reset(): void {
    st.active = false;
    st.split = false;
    st.current = 0;
    st.dprDown = 0;
    st.dprAsk = 0;
    st.paused = false;
    clearWindow();
  },
};

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

/** Queries at most this many frames behind. */
const MAX_PENDING = 4;

/**
 * One TIME_ELAPSED query a frame round its GPU work (render/RenderPipeline.tsx: begin in a frame callback before the
 * flow map's and the sky cube's, end after the composer's render), its results fed to gpuBudget as they become
 * available. Never nests in a query already open (a measurement of dev/perf.ts).
 */
export class GpuFrameTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: TimerExt | null;
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private open: WebGLQuery | null = null;

  constructor(gl: WebGL2RenderingContext | WebGLRenderingContext) {
    const g2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    this.gl = g2 as WebGL2RenderingContext;
    this.ext = g2 ? (g2.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null) : null;
    gpuBudget.available = !!this.ext;
  }

  /** Before the frame's GPU work: open a query when one is wanted (a lens is drawn and nothing is paused). */
  begin(wanted: boolean): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!ext || !wanted || gpuBudget.paused || this.open || this.pending.length >= MAX_PENDING) return;
    if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
    const q = this.free.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.open = q;
  }

  /** After the composer's render: close the query, and read those that are ready. */
  end(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!ext) return;
    if (this.open) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.pending.push(this.open);
      this.open = null;
    }
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ns = Number(gl.getQueryParameter(q, gl.QUERY_RESULT));
      this.free.push(q);
      if (!disjoint) gpuBudget.sample(ns / 1e6);
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const q of this.free) gl.deleteQuery(q);
    for (const q of this.pending) gl.deleteQuery(q);
    this.free.length = 0;
    this.pending.length = 0;
  }
}
