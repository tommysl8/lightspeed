/**
 * Experiment protocols: the data columns each experiment records and the analysis of its
 * readings (least-squares fits, comparison with theory, figures).
 *
 * The prose of the lab manual (aim, background, procedure) lives in manual.tsx. This module
 * has no React or KaTeX dependency so the loggers can use it from the frame loop.
 */
import { C_KM_S, G0_KM_S2 } from '../physics/constants';
import { gamma } from '../physics/relativity';
import { fixed, fmtBeta, fmtPM, pickUnit, sig, unitBySym, type Dim, type Unit } from '../lib/sci';
import { linearFit, mean, proportionalFit, sem, type LinearFit } from '../lib/stats';
import type { PlotAxis, PlotSeries } from '../ui/plot/Plot';
import { num, type DataRow, type ExperimentId } from './notebook';

export interface Column {
  key: string;
  /** Header symbol, set in italics. */
  sym: string;
  /** Plain-language description (tooltip, CSV header). */
  name: string;
  dim: Dim;
  /** Fixed unit label for dimensions without automatic units (°, %, …). */
  unit?: string;
  /** Significant figures, or fixed decimals, for display. */
  digits?: number;
  decimals?: number;
  fmt?: 'beta' | 'int';
  /** Computed from the row rather than measured. */
  derived?: (r: DataRow) => number;
  text?: boolean;
  hidden?: boolean;
  /** Columns sharing a group share one display unit (e.g. both clocks in years). */
  unitGroup?: string;
  /** Always display in this unit (symbol from sci.ts), instead of choosing one from the data. */
  fixedUnit?: string;
}

export interface ResultLine {
  label: string;
  value: string;
  unit?: string;
  tone?: 'ok' | 'warn' | 'dim';
}

export interface PlotSpec {
  x: PlotAxis;
  y: PlotAxis;
  series: PlotSeries[];
  caption: string;
  equal?: boolean;
}

export interface Analysis {
  results: ResultLine[];
  raw: PlotSpec;
  lin?: PlotSpec;
  /** Label of the second view (linearised plot, residuals). */
  linLabel?: string;
}

export interface Protocol {
  id: ExperimentId;
  /** Number shown in the manual ("1"). */
  no: number;
  title: string;
  short: string;
  /** Readings are taken by hand (the Record button / R key) rather than logged automatically. */
  manual: boolean;
  columns: Column[];
  analyse: (rows: DataRow[]) => Analysis;
}

export const GROUP_COLORS = ['#56c2ee', '#f0a73a', '#6ccf8b', '#c79bf2', '#ff806e', '#e8e36b'];
const THEORY = '#c3c9d1';
const FIT = '#f0a73a';
const DIM = '#4c545d';

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

/** Value of a column for a row (measured or derived). */
export function cell(col: Column, r: DataRow): number | string {
  if (col.derived) return col.derived(r);
  const v = r.v[col.key];
  return v === undefined ? NaN : v;
}

/** Display units for every dimensioned column, shared within unit groups. */
export function columnUnits(cols: Column[], rows: DataRow[]): Record<string, Unit> {
  const out: Record<string, Unit> = {};
  const groupMax: Record<string, number> = {};
  for (const c of cols) {
    if (c.dim !== 'time' && c.dim !== 'length') continue;
    let m = 0;
    for (const r of rows) {
      const v = cell(c, r);
      if (typeof v === 'number' && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
    }
    const g = c.unitGroup ?? c.key;
    groupMax[g] = Math.max(groupMax[g] ?? 0, m);
  }
  for (const c of cols) {
    if (c.fixedUnit && (c.dim === 'time' || c.dim === 'length')) out[c.key] = unitBySym(c.dim, c.fixedUnit);
    else if (c.dim === 'time' || c.dim === 'length') out[c.key] = pickUnit(c.dim, groupMax[c.unitGroup ?? c.key] || 1);
    else out[c.key] = { sym: c.unit ?? (c.dim === 'speed' ? 'km/s' : c.dim === 'angle' ? '°' : ''), factor: 1 };
  }
  return out;
}

/** Formatted cell text in the given unit. */
export function cellText(col: Column, r: DataRow, unit: Unit): string {
  const v = cell(col, r);
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  if (col.fmt === 'beta') return fmtBeta(v);
  if (col.fmt === 'int') return String(Math.round(v));
  const x = v / unit.factor;
  if (col.decimals !== undefined) return fixed(x, col.decimals);
  return sig(x, col.digits ?? 5);
}

/** Uncertainty text for a measured cell, in the same unit, or ''. */
export function sigmaText(col: Column, r: DataRow, unit: Unit): string {
  const s = r.s?.[col.key];
  if (!s || col.derived) return '';
  const x = s / unit.factor;
  return col.decimals !== undefined ? fixed(x, col.decimals) : sig(x, 2);
}

const unitFor = (dim: Dim, values: number[]): Unit => pickUnit(dim, Math.max(1e-300, ...values.map(Math.abs)));

const finite = (...xs: number[]) => xs.every(Number.isFinite);

function groupByBeta(rows: DataRow[]): { beta: number; rows: DataRow[] }[] {
  const m = new Map<string, DataRow[]>();
  for (const r of rows) {
    const b = num(r, 'beta');
    if (!Number.isFinite(b)) continue;
    const k = b.toPrecision(4);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.values()]
    .map((rs) => ({ beta: mean(rs.map((r) => num(r, 'beta'))), rows: rs }))
    .sort((a, b) => a.beta - b.beta);
}

const noisy = (rows: DataRow[]) => rows.some((r) => r.s && Object.keys(r.s).length > 0);

function chiLine(fit: { chi2: number; ndf: number; weighted: boolean } | null): ResultLine[] {
  if (!fit || !fit.weighted || fit.ndf <= 0) return [];
  const red = fit.chi2 / fit.ndf;
  return [{ label: 'χ²/ν', value: `${sig(fit.chi2, 3)} / ${fit.ndf} = ${sig(red, 3)}`, tone: red < 3 ? 'ok' : 'warn' }];
}

/** Standard score of a measurement against an accepted value. */
function zLine(value: number, sigma: number, accepted: number, noiseOn: boolean): ResultLine {
  const rel = (value - accepted) / accepted;
  if (!noiseOn || !(sigma > 0)) {
    const ppm = rel * 1e6;
    return {
      label: 'Relative deviation',
      value: Math.abs(ppm) < 1e-3 ? '< 0.001' : sig(ppm, 3),
      unit: 'ppm',
      tone: Math.abs(ppm) < 100 ? 'ok' : 'warn',
    };
  }
  const z = (value - accepted) / sigma;
  return {
    label: 'Deviation',
    value: `${sig(rel * 100, 2)} % (${sig(z, 2)} σ)`,
    tone: Math.abs(z) < 2 ? 'ok' : 'warn',
  };
}

/** σ of β = −b/a from a linear fit, including the a–b covariance. */
function ratioSigma(f: LinearFit): number {
  const { a, b, sa, sb, cov } = f;
  const dA = b / (a * a);
  const dB = -1 / a;
  return Math.sqrt(dB * dB * sb * sb + dA * dA * sa * sa + 2 * dA * dB * cov);
}

// ─── Experiment 1: time of flight ────────────────────────────────────────────────────────

const E1: Protocol = {
  id: 'E1',
  no: 1,
  title: 'Time of flight of a light pulse',
  short: 'Time a light pulse across the Solar System and determine c from a straight-line fit.',
  manual: false,
  columns: [
    { key: 'rx', sym: 'Detector', name: 'detector', dim: 'none', text: true },
    { key: 'pulse', sym: 'P', name: 'pulse number', dim: 'none', fmt: 'int' },
    { key: 'dt', sym: 'Δt', name: 'time of flight', dim: 'time', digits: 7, fixedUnit: 's' },
    { key: 'd', sym: 'd', name: 'path length from the emission point', dim: 'length', digits: 6, fixedUnit: 'au' },
    { key: 'v', sym: 'd/Δt', name: 'mean speed', dim: 'speed', digits: 7, derived: (r) => num(r, 'd') / num(r, 'dt') },
  ],
  analyse(rows) {
    const pts = rows.filter((r) => num(r, 'dt') > 0 && num(r, 'd') > 0);
    const xs = pts.map((r) => num(r, 'dt'));
    const ys = pts.map((r) => num(r, 'd'));
    // Same units as the data table.
    const tU = unitBySym('time', 's');
    const dU = unitBySym('length', 'au');
    const on = noisy(pts);
    const sy = on ? pts.map((r) => Math.hypot(r.s?.d ?? 0, C_KM_S * (r.s?.dt ?? 0))) : undefined;
    const fit = pts.length >= 2 ? linearFit(xs, ys, sy) : null;

    const results: ResultLine[] = [{ label: 'Readings', value: String(pts.length) }];
    if (fit) {
      results.push(
        { label: 'Slope (measured c)', value: fmtPM(fit.b, fit.sb), unit: 'km/s' },
        { label: 'Defined value of c', value: '299 792.458', unit: 'km/s', tone: 'dim' },
        zLine(fit.b, fit.sb, C_KM_S, on),
        { label: 'Intercept', value: fmtPM(fit.a, fit.sa), unit: 'km' },
        ...chiLine(fit),
      );
    }

    const pointData = pts.map((r) => ({
      x: num(r, 'dt') / tU.factor,
      y: num(r, 'd') / dU.factor,
      sx: r.s?.dt ? r.s.dt / tU.factor : undefined,
      sy: r.s?.d ? r.s.d / dU.factor : undefined,
    }));
    const series: PlotSeries[] = [
      { kind: 'fn', f: (x) => (C_KM_S * x * tU.factor) / dU.factor, color: THEORY, label: 'd = cΔt (defined c)' },
    ];
    if (fit) series.push({ kind: 'fn', f: (x) => (fit.a + fit.b * x * tU.factor) / dU.factor, color: FIT, dash: '', width: 1, label: 'least-squares fit' });
    series.push({ kind: 'points', data: pointData, label: 'detector readings', newest: true });

    const residuals: PlotSeries[] = fit
      ? [
          { kind: 'hline', value: 0, color: THEORY, dash: '5 3' },
          {
            kind: 'points',
            data: pts.map((r, i) => ({
              x: num(r, 'dt') / tU.factor,
              y: ys[i] - (fit.a + fit.b * xs[i]),
              sy: sy?.[i],
            })),
          },
        ]
      : [];

    return {
      results,
      raw: {
        x: { q: 'Δt', unit: tU.sym, zero: true },
        y: { q: 'd', unit: dU.sym, zero: true },
        series,
        caption:
          'Fig. 1.1 — Path length d against time of flight Δt. Points: detector readings. Solid: least-squares line (1.3). Dashed: d = cΔt with the defined c.',
      },
      lin: {
        x: { q: 'Δt', unit: tU.sym, zero: true },
        y: { q: 'd − (a + bΔt)', unit: 'km' },
        series: residuals,
        caption: 'Fig. 1.2 — Residuals from the fitted line. A good fit leaves residuals scattered about zero, within their error bars.',
      },
      linLabel: 'Residuals',
    };
  },
};

// ─── Experiment 2: time dilation ─────────────────────────────────────────────────────────

const ratio = (r: DataRow) => num(r, 'tau') / num(r, 't');
const sqrt1mb2 = (b: number) => Math.sqrt((1 - b) * (1 + b));

const E2: Protocol = {
  id: 'E2',
  no: 2,
  title: 'Time dilation on inertial trips',
  short: 'Compare ship and Earth clocks for trips at different speeds; test Δτ = Δt √(1 − β²).',
  manual: false,
  columns: [
    { key: 'dest', sym: 'Destination', name: 'destination', dim: 'none', text: true },
    { key: 'beta', sym: 'β', name: 'cruise speed v/c', dim: 'none', fmt: 'beta' },
    { key: 't', sym: 'Δt', name: 'coordinate time (Sun frame)', dim: 'time', digits: 6, unitGroup: 'clk' },
    { key: 'tau', sym: 'Δτ', name: 'proper time (ship clock)', dim: 'time', digits: 6, unitGroup: 'clk' },
    { key: 'ratio', sym: 'Δτ/Δt', name: 'clock ratio', dim: 'none', digits: 6, derived: ratio },
    { key: 'pred', sym: '√(1−β²)', name: 'predicted ratio', dim: 'none', digits: 6, derived: (r) => sqrt1mb2(num(r, 'beta')) },
    {
      key: 'dev',
      sym: 'δ',
      name: 'relative deviation from prediction',
      dim: 'none',
      unit: '%',
      digits: 2,
      derived: (r) => (ratio(r) / sqrt1mb2(num(r, 'beta')) - 1) * 100,
    },
  ],
  analyse(rows) {
    const pts = rows.filter((r) => finite(num(r, 'beta'), num(r, 't'), num(r, 'tau')) && num(r, 't') > 0);
    const on = noisy(pts);
    const sRatio = (r: DataRow) => {
      const s = r.s;
      if (!s) return undefined;
      return ratio(r) * Math.hypot((s.t ?? 0) / num(r, 't'), (s.tau ?? 0) / num(r, 'tau'));
    };
    // Linearised: ln(Δτ/Δt) = p ln(1 − β²)
    const lin = pts.filter((r) => num(r, 'beta') > 1e-4);
    const lx = lin.map((r) => Math.log((1 - num(r, 'beta')) * (1 + num(r, 'beta'))));
    const ly = lin.map((r) => Math.log(ratio(r)));
    const lsy = on ? lin.map((r) => (sRatio(r) ?? 0) / ratio(r)) : undefined;
    const pf = lin.length >= 1 ? proportionalFit(lx, ly, lsy) : null;
    const devs = pts.map((r) => ratio(r) / sqrt1mb2(num(r, 'beta')) - 1);

    const results: ResultLine[] = [
      { label: 'Trials', value: String(pts.length) },
      {
        label: 'Speeds covered',
        value: pts.length ? `${fmtBeta(Math.min(...pts.map((r) => num(r, 'beta'))))} – ${fmtBeta(Math.max(...pts.map((r) => num(r, 'beta'))))}` : '—',
        unit: 'c',
      },
    ];
    if (pf) {
      results.push(
        { label: 'Fitted exponent p', value: fmtPM(pf.b, pf.sb) },
        { label: 'Predicted exponent', value: '0.5 (exact)', tone: 'dim' },
        zLine(pf.b, pf.sb, 0.5, on),
        ...chiLine(pf),
      );
    }
    if (devs.length >= 2) results.push({ label: 'Mean δ ± s.e.', value: fmtPM(mean(devs) * 100, sem(devs) * 100 || 1e-12), unit: '%' });

    return {
      results,
      raw: {
        x: { q: 'β', domain: [0, 1] },
        y: { q: 'Δτ/Δt', domain: [0, 1.1] },
        series: [
          { kind: 'hline', value: 1, color: DIM, dash: '2 3', label: 'Galilean: Δτ = Δt' },
          { kind: 'fn', f: (b) => sqrt1mb2(Math.min(1, b)), color: THEORY, label: 'Δτ/Δt = √(1 − β²)' },
          { kind: 'points', data: pts.map((r) => ({ x: num(r, 'beta'), y: ratio(r), sy: sRatio(r) })), label: 'trials', newest: true },
        ],
        caption: 'Fig. 2.1 — Ratio of ship to Earth clock readings on arrival against cruise speed. Dashed: prediction (2.2). Dotted: Newtonian absolute time.',
      },
      lin: {
        x: { q: 'ln(1 − β²)', zero: true },
        y: { q: 'ln(Δτ/Δt)', zero: true },
        series: [
          { kind: 'fn', f: (x) => 0.5 * x, color: THEORY, label: 'slope ½ (theory)' },
          ...(pf ? [{ kind: 'fn' as const, f: (x: number) => pf.b * x, color: FIT, dash: '', width: 1, label: 'fit through origin' }] : []),
          { kind: 'points', data: lin.map((_, i) => ({ x: lx[i], y: ly[i], sy: lsy?.[i] })), newest: true },
        ],
        caption: 'Fig. 2.2 — Linearised form ln(Δτ/Δt) = p ln(1 − β²) (2.4). Special relativity predicts p = ½.',
      },
      linLabel: 'Linearised',
    };
  },
};

// ─── Experiment 3: Doppler factor across the sky ─────────────────────────────────────────

const dopplerPred = (beta: number, thDeg: number) => 1 / (gamma(beta) * (1 - beta * Math.cos((thDeg * Math.PI) / 180)));

const E3: Protocol = {
  id: 'E3',
  no: 3,
  title: 'The relativistic Doppler factor',
  short: 'Measure the Doppler factor at different angles from the apex; infer your speed from a fit.',
  manual: true,
  columns: [
    { key: 'beta', sym: 'β', name: 'speed v/c (speedometer)', dim: 'none', fmt: 'beta' },
    { key: 'thS', sym: 'θ′', name: 'angle from apex, ship frame', dim: 'angle', unit: '°', decimals: 2 },
    { key: 'D', sym: 'D', name: 'Doppler factor ν_obs/ν_emit', dim: 'none', digits: 5 },
    { key: 'pred', sym: 'D pred.', name: 'predicted D, eq. (3.1)', dim: 'none', digits: 5, derived: (r) => dopplerPred(num(r, 'beta'), num(r, 'thS')) },
    {
      key: 'dev',
      sym: 'δ',
      name: 'relative deviation',
      dim: 'none',
      unit: '%',
      digits: 2,
      derived: (r) => (num(r, 'D') / dopplerPred(num(r, 'beta'), num(r, 'thS')) - 1) * 100,
    },
  ],
  analyse(rows) {
    const pts = rows.filter((r) => finite(num(r, 'beta'), num(r, 'thS'), num(r, 'D')) && num(r, 'D') > 0);
    const groups = groupByBeta(pts);
    const on = noisy(pts);
    const results: ResultLine[] = [{ label: 'Readings', value: String(pts.length) }];
    const raw: PlotSeries[] = [
      { kind: 'hline', value: 1, color: DIM, dash: '2 3' },
      { kind: 'vline', value: 90, color: DIM, dash: '2 3' },
    ];
    const lin: PlotSeries[] = [];
    groups.forEach((g, gi) => {
      const color = GROUP_COLORS[gi % GROUP_COLORS.length];
      const label = `β = ${fmtBeta(g.beta)}`;
      raw.push({ kind: 'fn', f: (th) => dopplerPred(g.beta, th), color, label: `${label}: theory`, width: 1 });
      raw.push({
        kind: 'points',
        color,
        data: g.rows.map((r) => ({ x: num(r, 'thS'), y: num(r, 'D'), sx: r.s?.thS, sy: r.s?.D })),
      });
      // 1/D = γ − γβ cos θ′
      const xs = g.rows.map((r) => Math.cos((num(r, 'thS') * Math.PI) / 180));
      const ys = g.rows.map((r) => 1 / num(r, 'D'));
      const sy = on ? g.rows.map((r) => (r.s?.D ?? 0) / num(r, 'D') ** 2) : undefined;
      const f = g.rows.length >= 2 ? linearFit(xs, ys, sy) : null;
      lin.push({ kind: 'points', color, data: xs.map((x, i) => ({ x, y: ys[i], sy: sy?.[i] })) });
      if (f) {
        lin.push({ kind: 'fn', f: (x) => f.a + f.b * x, color, dash: '', width: 1, label: `${label}: fit` });
        const bFit = -f.b / f.a;
        results.push(
          { label: `Group ${gi + 1}: speedometer β`, value: fmtBeta(g.beta), tone: 'dim' },
          { label: `Group ${gi + 1}: β from fit, −b/a`, value: fmtPM(bFit, ratioSigma(f)) },
          { label: `Group ${gi + 1}: γ from intercept a`, value: fmtPM(f.a, f.sa) },
          zLine(bFit, ratioSigma(f), g.beta, on),
        );
      } else {
        results.push({ label: `Group ${gi + 1} (${label})`, value: 'needs ≥ 2 readings', tone: 'dim' });
      }
    });
    return {
      results,
      raw: {
        x: { q: 'θ′', unit: '°', domain: [0, 180], ticks: [0, 30, 60, 90, 120, 150, 180] },
        y: { q: 'D', log: true },
        series: raw,
        caption:
          'Fig. 3.1 — Doppler factor against angle from the apex, measured in the ship frame. Curves: eq. (3.1). D = 1/γ at θ′ = 90° (transverse Doppler effect).',
      },
      lin: {
        x: { q: 'cos θ′', domain: [-1, 1], ticks: [-1, -0.5, 0, 0.5, 1] },
        y: { q: '1/D', zero: true },
        series: lin,
        caption: 'Fig. 3.2 — Linearised: 1/D = γ − γβ cos θ′ (3.2). The intercept gives γ and −slope/intercept gives β.',
      },
      linLabel: 'Linearised',
    };
  },
};

// ─── Experiment 4: aberration ────────────────────────────────────────────────────────────

const aberrPred = (beta: number, thDeg: number) => {
  const c = Math.cos((thDeg * Math.PI) / 180);
  return (Math.acos(Math.max(-1, Math.min(1, (c + beta) / (1 + beta * c)))) * 180) / Math.PI;
};

const E4: Protocol = {
  id: 'E4',
  no: 4,
  title: 'Aberration of light',
  short: 'Compare where bodies are with where you see them at high speed; recover β from the shift.',
  manual: true,
  columns: [
    { key: 'target', sym: 'Target', name: 'target', dim: 'none', text: true },
    { key: 'beta', sym: 'β', name: 'speed v/c (speedometer)', dim: 'none', fmt: 'beta' },
    { key: 'th', sym: 'θ', name: 'catalogue angle from apex (Sun frame)', dim: 'angle', unit: '°', decimals: 3 },
    { key: 'thS', sym: 'θ′', name: 'observed angle from apex (ship frame)', dim: 'angle', unit: '°', decimals: 3 },
    { key: 'pred', sym: 'θ′ pred.', name: 'predicted θ′, eq. (4.1)', dim: 'angle', unit: '°', decimals: 3, derived: (r) => aberrPred(num(r, 'beta'), num(r, 'th')) },
    {
      key: 'dev',
      sym: 'θ′ − pred.',
      name: 'observed minus predicted',
      dim: 'none',
      unit: '′',
      decimals: 2,
      derived: (r) => (num(r, 'thS') - aberrPred(num(r, 'beta'), num(r, 'th'))) * 60,
    },
  ],
  analyse(rows) {
    const pts = rows.filter((r) => finite(num(r, 'beta'), num(r, 'th'), num(r, 'thS')));
    const groups = groupByBeta(pts);
    const on = noisy(pts);
    const results: ResultLine[] = [{ label: 'Readings', value: String(pts.length) }];
    const raw: PlotSeries[] = [
      { kind: 'fn', f: (x) => x, color: DIM, dash: '2 3', label: 'θ′ = θ (no aberration)' },
    ];
    const lin: PlotSeries[] = [];
    const rad = Math.PI / 180;
    groups.forEach((g, gi) => {
      const color = GROUP_COLORS[gi % GROUP_COLORS.length];
      const label = `β = ${fmtBeta(g.beta)}`;
      raw.push({ kind: 'fn', f: (th) => aberrPred(g.beta, th), color, width: 1, label: `${label}: theory` });
      raw.push({ kind: 'points', color, data: g.rows.map((r) => ({ x: num(r, 'th'), y: num(r, 'thS'), sx: r.s?.th, sy: r.s?.thS })) });
      // cos θ′ − cos θ = β (1 − cos θ cos θ′)
      const xs = g.rows.map((r) => 1 - Math.cos(num(r, 'th') * rad) * Math.cos(num(r, 'thS') * rad));
      const ys = g.rows.map((r) => Math.cos(num(r, 'thS') * rad) - Math.cos(num(r, 'th') * rad));
      const sy = on
        ? g.rows.map((r) => Math.hypot(Math.sin(num(r, 'thS') * rad) * (r.s?.thS ?? 0) * rad, Math.sin(num(r, 'th') * rad) * (r.s?.th ?? 0) * rad))
        : undefined;
      const f = g.rows.length >= 1 ? proportionalFit(xs, ys, sy) : null;
      lin.push({ kind: 'points', color, data: xs.map((x, i) => ({ x, y: ys[i], sy: sy?.[i] })) });
      if (f) {
        lin.push({ kind: 'fn', f: (x) => f.b * x, color, dash: '', width: 1, label: `${label}: fit` });
        results.push(
          { label: `Group ${gi + 1}: speedometer β`, value: fmtBeta(g.beta), tone: 'dim' },
          { label: `Group ${gi + 1}: β from fit`, value: fmtPM(f.b, f.sb) },
          zLine(f.b, f.sb, g.beta, on),
        );
      }
    });
    return {
      results,
      raw: {
        x: { q: 'θ', unit: '°', domain: [0, 180], ticks: [0, 30, 60, 90, 120, 150, 180] },
        y: { q: 'θ′', unit: '°', domain: [0, 180], ticks: [0, 30, 60, 90, 120, 150, 180] },
        series: raw,
        caption: 'Fig. 4.1 — Observed angle θ′ against catalogue angle θ, both from the apex. Curves: eq. (4.1). Everything is displaced toward the apex.',
      },
      lin: {
        x: { q: '1 − cos θ cos θ′', zero: true },
        y: { q: 'cos θ′ − cos θ', zero: true },
        series: lin,
        caption: 'Fig. 4.2 — Linearised aberration formula (4.2): a line through the origin whose slope is β.',
      },
      linLabel: 'Linearised',
    };
  },
};

// ─── Experiment 5: hyperbolic motion ─────────────────────────────────────────────────────

const phiOf = (r: DataRow) => Math.atanh(Math.min(num(r, 'beta'), 1 - 1e-15));

const E5: Protocol = {
  id: 'E5',
  no: 5,
  title: 'Constant proper acceleration',
  short: 'Log a 1 g flip-and-burn flight and measure the proper acceleration from the rapidity.',
  manual: false,
  columns: [
    { key: 'flight', sym: 'F', name: 'flight number', dim: 'none', fmt: 'int' },
    { key: 'phase', sym: 'Phase', name: 'burn phase', dim: 'none', text: true },
    { key: 'tau', sym: 'τ', name: 'proper time (ship clock)', dim: 'time', digits: 5, unitGroup: 'clk' },
    { key: 't', sym: 't', name: 'coordinate time (Sun frame)', dim: 'time', digits: 5, unitGroup: 'clk' },
    { key: 'x', sym: 'x', name: 'distance covered (Sun frame)', dim: 'length', digits: 5 },
    { key: 'beta', sym: 'β', name: 'speed v/c', dim: 'none', fmt: 'beta' },
    { key: 'phi', sym: 'φ', name: 'rapidity artanh β', dim: 'none', digits: 5, derived: phiOf },
    { key: 'T', sym: 'T', name: 'total proper time of the flight', dim: 'time', hidden: true },
    { key: 'a', sym: 'a', name: 'programmed proper acceleration', dim: 'none', hidden: true },
  ],
  analyse(rows) {
    const pts = rows.filter((r) => finite(num(r, 'tau'), num(r, 'beta')));
    const taus = pts.map((r) => num(r, 'tau'));
    const tU = unitFor('time', taus);
    const on = noisy(pts);
    const sPhi = (r: DataRow) => (r.s?.beta ? r.s.beta / (1 - num(r, 'beta') ** 2) : undefined);
    const accel = pts.filter((r) => r.v.phase === 'accel' && num(r, 'tau') > 0);
    const fit =
      accel.length >= 2
        ? linearFit(
            accel.map((r) => num(r, 'tau')),
            accel.map(phiOf),
            on ? accel.map((r) => sPhi(r) ?? 0) : undefined,
          )
        : null;

    const flights = [...new Set(pts.map((r) => num(r, 'flight')))];
    const results: ResultLine[] = [
      { label: 'Samples', value: String(pts.length) },
      { label: 'Flights', value: String(flights.length) },
    ];
    if (fit) {
      const aMs2 = fit.b * C_KM_S * 1000;
      const saMs2 = fit.sb * C_KM_S * 1000;
      results.push(
        { label: 'Slope dφ/dτ', value: fmtPM(fit.b, fit.sb), unit: 's⁻¹' },
        { label: 'Proper acceleration a = c dφ/dτ', value: fmtPM(aMs2, saMs2), unit: 'm/s²' },
        { label: 'Programmed a = g₀', value: '9.806 65', unit: 'm/s²', tone: 'dim' },
        zLine(aMs2, saMs2, G0_KM_S2 * 1000, on),
        { label: 'Intercept φ₀', value: fmtPM(fit.a, fit.sa) },
        ...chiLine(fit),
      );
    }
    if (pts.length) results.push({ label: 'Peak β', value: fmtBeta(Math.max(...pts.map((r) => num(r, 'beta')))) });

    const raw: PlotSeries[] = [];
    const lin: PlotSeries[] = [];
    flights.forEach((fl, i) => {
      const fr = pts.filter((r) => num(r, 'flight') === fl);
      const T = num(fr[0], 'T');
      const a = num(fr[0], 'a') || G0_KM_S2;
      const color = GROUP_COLORS[i % GROUP_COLORS.length];
      if (Number.isFinite(T)) {
        raw.push({
          kind: 'fn',
          f: (x) => Math.tanh((a * Math.min(x * tU.factor, T - x * tU.factor)) / C_KM_S),
          domain: [0, T / tU.factor],
          color: THEORY,
          width: 1,
          label: i === 0 ? 'β = tanh(aτ/c) (theory)' : undefined,
        });
        lin.push({
          kind: 'fn',
          f: (x) => (a * Math.min(x * tU.factor, T - x * tU.factor)) / C_KM_S,
          domain: [0, T / tU.factor],
          color: THEORY,
          width: 1,
          label: i === 0 ? 'φ = aτ/c (theory)' : undefined,
        });
      }
      raw.push({ kind: 'points', color, data: fr.map((r) => ({ x: num(r, 'tau') / tU.factor, y: num(r, 'beta'), sy: r.s?.beta })) });
      lin.push({ kind: 'points', color, data: fr.map((r) => ({ x: num(r, 'tau') / tU.factor, y: phiOf(r), sy: sPhi(r) })) });
    });
    if (fit) lin.push({ kind: 'fn', f: (x) => fit.a + fit.b * x * tU.factor, color: FIT, dash: '', width: 1, label: 'fit (accelerating phase)' });

    return {
      results,
      raw: {
        x: { q: 'τ', unit: tU.sym, zero: true },
        y: { q: 'β', domain: [0, 1] },
        series: raw,
        caption: 'Fig. 5.1 — Speed against ship time for 1 g flip-and-burn flights. Dashed: eq. (5.2), mirrored after the flip.',
      },
      lin: {
        x: { q: 'τ', unit: tU.sym, zero: true },
        y: { q: 'φ = artanh β', zero: true },
        series: lin,
        caption: 'Fig. 5.2 — Rapidity against ship time. It grows linearly while the engine pushes forward (5.3); the slope is a/c.',
      },
      linLabel: 'Rapidity',
    };
  },
};

export const PROTOCOLS: Record<ExperimentId, Protocol> = { E1, E2, E3, E4, E5 };
export const PROTOCOL_LIST: Protocol[] = [E1, E2, E3, E4, E5];

// ─── CSV export ──────────────────────────────────────────────────────────────────────────

const BASE_UNIT: Record<Dim, string> = { time: 's', length: 'km', speed: 'km/s', angle: 'deg', none: '' };

function csvCell(v: string | number): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV of an experiment's readings in base SI-style units (s, km, km/s, deg). */
export function toCsv(p: Protocol, rows: DataRow[], meta: string[] = []): string {
  const cols = p.columns;
  const header = ['n', 'sim_time_utc'];
  for (const c of cols) {
    const unit = c.unit && c.dim !== 'time' && c.dim !== 'length' ? c.unit.replace('°', 'deg').replace('′', 'arcmin') : BASE_UNIT[c.dim];
    header.push(`${c.key}${unit ? ` [${unit}]` : ''}${c.derived ? ' (derived)' : ''}`);
    if (!c.derived && !c.text && rows.some((r) => r.s?.[c.key])) header.push(`u(${c.key})${unit ? ` [${unit}]` : ''}`);
  }
  const lines = [
    `# Lightspeed virtual laboratory, Experiment ${p.no}: ${p.title}`,
    ...meta.map((m) => `# ${m}`),
    `# columns: ${cols.map((c) => `${c.key} = ${c.name}`).join('; ')}`,
    header.map(csvCell).join(','),
  ];
  for (const r of rows) {
    const out: (string | number)[] = [r.n, new Date(r.simMs).toISOString()];
    for (const c of cols) {
      out.push(cell(c, r));
      if (!c.derived && !c.text && rows.some((x) => x.s?.[c.key])) out.push(r.s?.[c.key] ?? '');
    }
    lines.push(out.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}
