/**
 * A small SVG plotting component in the style of a printed physics figure: a boxed frame
 * with inward ticks on all four sides, axis titles as "quantity / unit", error bars, dashed
 * theory curves and a numbered caption.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fixed, MINUS, sig, superscript } from '../../lib/sci';
import { svgRich } from '../rich';
import { commonExponent, linearMinor, linearTicks, logDomain, logTicks, niceDomain, tickDecimals } from './ticks';

export interface PlotAxis {
  /** Quantity symbol, set in italics (e.g. "Δt", "τ/t", "θ′"). */
  q: string;
  /** Unit, set upright (e.g. "s", "km", "°"). Empty for dimensionless quantities. */
  unit?: string;
  log?: boolean;
  /** Fixed domain in plotted units. */
  domain?: [number, number];
  /** Always include zero in an automatic linear domain. */
  zero?: boolean;
  /** Fixed tick values (linear axes only). */
  ticks?: number[];
}

export interface PlotPoint {
  x: number;
  y: number;
  sx?: number;
  sy?: number;
}

export type PlotSeries =
  | { kind: 'points'; data: PlotPoint[]; color?: string; label?: string; shape?: 'circle' | 'square' | 'diamond'; newest?: boolean }
  | { kind: 'fn'; f: (x: number) => number; color?: string; dash?: string; label?: string; domain?: [number, number]; width?: number }
  | { kind: 'line'; data: { x: number; y: number }[]; color?: string; dash?: string; label?: string; width?: number; opacity?: number; noExtent?: boolean }
  | { kind: 'hline' | 'vline'; value: number; color?: string; dash?: string; label?: string }
  | { kind: 'marker'; x: number; y: number; color?: string; label?: string }
  | { kind: 'text'; x: number; y: number; text: string; color?: string; anchor?: 'start' | 'middle' | 'end'; dy?: number };

export interface PlotProps {
  x: PlotAxis;
  y: PlotAxis;
  series: PlotSeries[];
  height?: number;
  /** Same scale on both axes (spacetime diagrams: light lines at 45°). */
  equal?: boolean;
  caption?: ReactNode;
  /** Shown in the frame when there is nothing to plot. */
  empty?: string;
  legend?: boolean;
  /** Print colours (dark on white), for lab reports. */
  paper?: boolean;
}

/** Print-friendly equivalents of the screen colours (dark on white). */
const PAPER_MAP: Record<string, string> = {
  '#56c2ee': '#0b6ea8',
  '#c3c9d1': '#2b3137',
  '#f0a73a': '#b35c00',
  '#ff5f57': '#c0261d',
  '#6ccf8b': '#1d7a3a',
  '#4c545d': '#8a929b',
  '#38414a': '#9aa1a8',
  '#c79bf2': '#6b3fa0',
  '#ff806e': '#b33a2b',
  '#e8e36b': '#857700',
};

interface Palette {
  bg: string;
  grid: string;
  zero: string;
  frame: string;
  label: string;
  title: string;
  tipBg: string;
  tipText: string;
  tone: (c: string) => string;
}

const SCREEN: Palette = {
  bg: '#060708',
  grid: '#161b20',
  zero: '#262d34',
  frame: '#38414a',
  label: '#8d959f',
  title: '#b3bac3',
  tipBg: 'rgba(6,7,8,0.94)',
  tipText: '#d8dde3',
  tone: (c) => c,
};

const PAPER: Palette = {
  bg: '#ffffff',
  grid: '#ececec',
  zero: '#cfcfcf',
  frame: '#444444',
  label: '#333333',
  title: '#111111',
  tipBg: '#ffffff',
  tipText: '#111111',
  tone: (c) => PAPER_MAP[c.toLowerCase()] ?? c,
};

export const PLOT_COLORS = {
  data: '#56c2ee',
  theory: '#c3c9d1',
  accent: '#f0a73a',
  hazard: '#ff5f57',
  ok: '#6ccf8b',
  dim: '#4c545d',
  grid: '#161b20',
  frame: '#38414a',
  label: '#8d959f',
};

const M = { l: 46, r: 10, t: 8, b: 32 };

interface AxisScale {
  lo: number;
  hi: number;
  log: boolean;
  a: number;
  b: number;
  map: (v: number) => number;
  major: number[];
  minor: number[];
  exp: number;
  decimals: number;
}

function makeScale(axis: PlotAxis, extent: [number, number] | null, px0: number, px1: number, count: number): AxisScale {
  const log = !!axis.log;
  let lo: number;
  let hi: number;
  if (axis.domain) [lo, hi] = axis.domain;
  else if (extent) {
    [lo, hi] = extent;
    if (log) {
      lo = Math.max(lo, 1e-300);
      hi = Math.max(hi, lo * 1.0001);
      [lo, hi] = logDomain(lo, hi);
    } else {
      if (axis.zero) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1;
      [lo, hi] = niceDomain(lo - (axis.zero && lo === 0 ? 0 : pad), hi + (axis.zero && hi === 0 ? 0 : pad), count);
    }
  } else {
    [lo, hi] = log ? [0.1, 10] : [0, 1];
  }
  const t0 = log ? Math.log10(lo) : lo;
  const t1 = log ? Math.log10(hi) : hi;
  const b = (px1 - px0) / (t1 - t0 || 1);
  const a = px0 - t0 * b;
  const map = log ? (v: number) => a + b * Math.log10(v) : (v: number) => a + b * v;

  if (log) {
    const t = logTicks(lo, hi);
    return { lo, hi, log, a, b, map, major: t.major, minor: t.minor, exp: 0, decimals: 0 };
  }
  const { ticks, step } = axis.ticks ? { ticks: axis.ticks, step: axis.ticks[1] - axis.ticks[0] || 1 } : linearTicks(lo, hi, count);
  const exp = commonExponent(ticks);
  return {
    lo,
    hi,
    log,
    a,
    b,
    map,
    major: ticks,
    minor: axis.ticks ? [] : linearMinor(lo, hi, step),
    exp,
    decimals: tickDecimals(step, exp),
  };
}

function tickLabel(s: AxisScale, v: number): string {
  if (s.log) {
    const e = Math.round(Math.log10(v));
    if (e === 0) return '1';
    if (e === 1) return '10';
    return `10${superscript(e)}`;
  }
  return fixed(v / 10 ** s.exp, s.decimals, false);
}

function AxisTitle({ axis, exp }: { axis: PlotAxis; exp: number }) {
  const factor = exp !== 0 ? `10${superscript(exp)}` : '';
  const unit = axis.unit ?? '';
  const denom = factor && unit ? `(${factor} ${unit})` : factor || unit;
  return (
    <>
      <tspan fontFamily="var(--font-serif)" fontStyle="italic" fontSize="12.5">
        {axis.q}
      </tspan>
      {denom && (
        <tspan fontFamily="var(--font-mono)" fontSize="10.5">
          {svgRich(` / ${denom}`)}
        </tspan>
      )}
    </>
  );
}

function extentOf(series: PlotSeries[], key: 'x' | 'y', log: boolean): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const add = (v: number, s = 0) => {
    for (const w of [v - s, v + s]) {
      if (!Number.isFinite(w) || (log && w <= 0)) continue;
      if (w < lo) lo = w;
      if (w > hi) hi = w;
    }
  };
  for (const s of series) {
    if (s.kind === 'points') for (const p of s.data) add(p[key], key === 'x' ? p.sx : p.sy);
    else if (s.kind === 'line' && !s.noExtent) for (const p of s.data) add(p[key]);
    else if (s.kind === 'marker' || s.kind === 'text') add(s[key]);
    else if ((s.kind === 'hline' && key === 'y') || (s.kind === 'vline' && key === 'x')) add(s.value);
  }
  return lo <= hi ? [lo, hi] : null;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function pointPath(shape: 'circle' | 'square' | 'diamond', x: number, y: number, r: number): ReactNode {
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}Z`} />;
  return <circle cx={x} cy={y} r={r} />;
}

export function Plot({ x, y, series, height = 200, equal = false, caption, empty, legend = true, paper = false }: PlotProps) {
  const pal = paper ? PAPER : SCREEN;
  const tone = pal.tone;
  const [ref, width] = useWidth();
  const clip = useId().replace(/:/g, '');
  const [hover, setHover] = useState<{ px: number; py: number; x: number; y: number; sx?: number; sy?: number; color: string } | null>(null);
  const W = Math.max(160, width);
  const H = height;
  const x0 = M.l;
  const x1 = W - M.r;
  const y0 = H - M.b;
  const y1 = M.t;

  const { sx, sy } = useMemo(() => {
    let ex = extentOf(series, 'x', !!x.log);
    let ey = extentOf(series, 'y', !!y.log);
    if (equal && ex && ey && !x.domain && !y.domain) {
      // Match units per pixel on both axes, centred on the data.
      const pw = x1 - x0;
      const ph = y0 - y1;
      const spanX = (ex[1] - ex[0]) * 1.08 || 1;
      const spanY = (ey[1] - ey[0]) * 1.08 || 1;
      const k = Math.max(spanX / pw, spanY / ph);
      const cx = (ex[0] + ex[1]) / 2;
      const cy = (ey[0] + ey[1]) / 2;
      ex = [cx - (k * pw) / 2, cx + (k * pw) / 2];
      ey = [cy - (k * ph) / 2, cy + (k * ph) / 2];
      const ax = { ...x, domain: ex };
      const ay = { ...y, domain: ey };
      return {
        sx: makeScale(ax, ex, x0, x1, Math.max(2, Math.round(pw / 70))),
        sy: makeScale(ay, ey, y0, y1, Math.max(2, Math.round(ph / 38))),
      };
    }
    return {
      sx: makeScale(x, ex, x0, x1, Math.max(2, Math.round((x1 - x0) / 70))),
      sy: makeScale(y, ey, y0, y1, Math.max(2, Math.round((y0 - y1) / 38))),
    };
  }, [series, x, y, equal, x0, x1, y0, y1]);

  const hasData = series.some((s) => (s.kind === 'points' || s.kind === 'line') && s.data.length > 0);
  const inX = (v: number) => v >= sx.lo - 1e-12 * Math.abs(sx.lo) && v <= sx.hi + 1e-12 * Math.abs(sx.hi);
  const inY = (v: number) => v >= sy.lo - 1e-12 * Math.abs(sy.lo) && v <= sy.hi + 1e-12 * Math.abs(sy.hi);

  const fnPath = (f: (v: number) => number, dom?: [number, number]) => {
    const lo = Math.max(sx.lo, dom?.[0] ?? -Infinity);
    const hi = Math.min(sx.hi, dom?.[1] ?? Infinity);
    if (!(hi > lo)) return '';
    const N = 240;
    let d = '';
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const xv = sx.log ? 10 ** (Math.log10(lo) + u * (Math.log10(hi) - Math.log10(lo))) : lo + u * (hi - lo);
      const yv = f(xv);
      if (!Number.isFinite(yv) || (sy.log && yv <= 0)) {
        pen = false;
        continue;
      }
      const py = Math.max(-1e4, Math.min(1e4, sy.map(yv)));
      d += `${pen ? 'L' : 'M'}${sx.map(xv).toFixed(1)} ${py.toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const legendItems = legend ? series.filter((s) => 'label' in s && !!s.label) : [];

  return (
    <figure className="m-0">
      <div ref={ref} className="w-full">
        <svg
          width={W}
          height={H}
          className="block select-none"
          role="img"
          aria-label={`${y.q} versus ${x.q}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            // Nearest data point within 12 px of the pointer.
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - r.left;
            const my = e.clientY - r.top;
            let best: typeof hover = null;
            let bestD = 12;
            for (const s of series) {
              if (s.kind !== 'points') continue;
              for (const p of s.data) {
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || (sy.log && p.y <= 0) || (sx.log && p.x <= 0)) continue;
                const px = sx.map(p.x);
                const py = sy.map(p.y);
                const d = Math.hypot(px - mx, py - my);
                if (d < bestD) {
                  bestD = d;
                  best = { px, py, x: p.x, y: p.y, sx: p.sx, sy: p.sy, color: tone(s.color ?? PLOT_COLORS.data) };
                }
              }
            }
            setHover(best);
          }}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} />
            </clipPath>
          </defs>
          <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} fill={pal.bg} />
          {/* Grid */}
          <g stroke={pal.grid} strokeWidth={1}>
            {sx.major.map((t) => inX(t) && <line key={`gx${t}`} x1={sx.map(t)} x2={sx.map(t)} y1={y1} y2={y0} />)}
            {sy.major.map((t) => inY(t) && <line key={`gy${t}`} y1={sy.map(t)} y2={sy.map(t)} x1={x0} x2={x1} />)}
          </g>
          {/* Zero lines */}
          <g stroke={pal.zero} strokeWidth={1}>
            {!sx.log && sx.lo < 0 && sx.hi > 0 && <line x1={sx.map(0)} x2={sx.map(0)} y1={y1} y2={y0} />}
            {!sy.log && sy.lo < 0 && sy.hi > 0 && <line y1={sy.map(0)} y2={sy.map(0)} x1={x0} x2={x1} />}
          </g>

          {/* Series */}
          <g clipPath={`url(#${clip})`}>
            {series.map((s, i) => {
              switch (s.kind) {
                case 'fn':
                  return (
                    <path
                      key={i}
                      d={fnPath(s.f, s.domain)}
                      fill="none"
                      stroke={tone(s.color ?? PLOT_COLORS.theory)}
                      strokeWidth={s.width ?? 1.2}
                      strokeDasharray={s.dash ?? '5 3'}
                    />
                  );
                case 'line': {
                  const pts = s.data.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!sy.log || p.y > 0) && (!sx.log || p.x > 0));
                  if (pts.length < 2) return null;
                  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${sx.map(p.x).toFixed(1)} ${sy.map(p.y).toFixed(1)}`).join('');
                  return (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={tone(s.color ?? PLOT_COLORS.data)}
                      strokeWidth={s.width ?? 1.4}
                      strokeDasharray={s.dash}
                      opacity={s.opacity ?? 1}
                    />
                  );
                }
                case 'hline':
                  return inY(s.value) ? (
                    <line
                      key={i}
                      x1={x0}
                      x2={x1}
                      y1={sy.map(s.value)}
                      y2={sy.map(s.value)}
                      stroke={tone(s.color ?? PLOT_COLORS.dim)}
                      strokeDasharray={s.dash ?? '2 3'}
                    />
                  ) : null;
                case 'vline':
                  return inX(s.value) ? (
                    <line
                      key={i}
                      y1={y1}
                      y2={y0}
                      x1={sx.map(s.value)}
                      x2={sx.map(s.value)}
                      stroke={tone(s.color ?? PLOT_COLORS.dim)}
                      strokeDasharray={s.dash ?? '2 3'}
                    />
                  ) : null;
                case 'points': {
                  const color = tone(s.color ?? PLOT_COLORS.data);
                  return (
                    <g key={i} stroke={color} fill={color}>
                      {s.data.map((p, k) => {
                        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || (sy.log && p.y <= 0) || (sx.log && p.x <= 0)) return null;
                        const px = sx.map(p.x);
                        const py = sy.map(p.y);
                        const last = s.newest && k === s.data.length - 1;
                        return (
                          <g key={k}>
                            {p.sy !== undefined && p.sy > 0 && (
                              <g strokeWidth={1}>
                                <line x1={px} x2={px} y1={sy.map(p.y - p.sy)} y2={sy.map(p.y + p.sy)} />
                                <line x1={px - 2.5} x2={px + 2.5} y1={sy.map(p.y - p.sy)} y2={sy.map(p.y - p.sy)} />
                                <line x1={px - 2.5} x2={px + 2.5} y1={sy.map(p.y + p.sy)} y2={sy.map(p.y + p.sy)} />
                              </g>
                            )}
                            {p.sx !== undefined && p.sx > 0 && (
                              <line strokeWidth={1} y1={py} y2={py} x1={sx.map(p.x - p.sx)} x2={sx.map(p.x + p.sx)} />
                            )}
                            <g stroke="none">{pointPath(s.shape ?? 'circle', px, py, 2.6)}</g>
                            {last && <circle cx={px} cy={py} r={5.5} fill="none" strokeWidth={1} />}
                          </g>
                        );
                      })}
                    </g>
                  );
                }
                case 'marker': {
                  if (!inX(s.x) || !inY(s.y)) return null;
                  const px = sx.map(s.x);
                  const py = sy.map(s.y);
                  const c = tone(s.color ?? PLOT_COLORS.accent);
                  return (
                    <g key={i} stroke={c} fill="none" strokeWidth={1.2}>
                      <circle cx={px} cy={py} r={4} />
                      <line x1={px - 8} x2={px - 5} y1={py} y2={py} />
                      <line x1={px + 5} x2={px + 8} y1={py} y2={py} />
                      <line x1={px} x2={px} y1={py - 8} y2={py - 5} />
                      <line x1={px} x2={px} y1={py + 5} y2={py + 8} />
                    </g>
                  );
                }
                case 'text':
                  return (
                    <text
                      key={i}
                      x={sx.map(s.x)}
                      y={sy.map(s.y) + (s.dy ?? 0)}
                      fill={tone(s.color ?? PLOT_COLORS.label)}
                      fontSize={9.5}
                      fontFamily="var(--font-mono)"
                      textAnchor={s.anchor ?? 'start'}
                    >
                      {s.text}
                    </text>
                  );
              }
            })}
          </g>

          {/* Frame and inward ticks on all four sides */}
          <rect x={x0 + 0.5} y={y1 + 0.5} width={x1 - x0 - 1} height={y0 - y1 - 1} fill="none" stroke={pal.frame} />
          <g stroke={pal.frame} strokeWidth={1}>
            {sx.major.map((t) => {
              if (!inX(t)) return null;
              const p = Math.round(sx.map(t)) + 0.5;
              return (
                <g key={`tx${t}`}>
                  <line x1={p} x2={p} y1={y0} y2={y0 - 5} />
                  <line x1={p} x2={p} y1={y1} y2={y1 + 5} />
                </g>
              );
            })}
            {sx.minor.map((t) => {
              if (!inX(t)) return null;
              const p = Math.round(sx.map(t)) + 0.5;
              return (
                <g key={`mx${t}`}>
                  <line x1={p} x2={p} y1={y0} y2={y0 - 2.5} />
                  <line x1={p} x2={p} y1={y1} y2={y1 + 2.5} />
                </g>
              );
            })}
            {sy.major.map((t) => {
              if (!inY(t)) return null;
              const p = Math.round(sy.map(t)) + 0.5;
              return (
                <g key={`ty${t}`}>
                  <line y1={p} y2={p} x1={x0} x2={x0 + 5} />
                  <line y1={p} y2={p} x1={x1} x2={x1 - 5} />
                </g>
              );
            })}
            {sy.minor.map((t) => {
              if (!inY(t)) return null;
              const p = Math.round(sy.map(t)) + 0.5;
              return (
                <g key={`my${t}`}>
                  <line y1={p} y2={p} x1={x0} x2={x0 + 2.5} />
                  <line y1={p} y2={p} x1={x1} x2={x1 - 2.5} />
                </g>
              );
            })}
          </g>

          {/* Tick labels */}
          <g fill={pal.label} fontFamily="var(--font-mono)" fontSize={9.5}>
            {sx.major.map(
              (t) =>
                inX(t) && (
                  <text key={`lx${t}`} x={sx.map(t)} y={y0 + 12} textAnchor="middle">
                    {svgRich(tickLabel(sx, t).replace('-', MINUS))}
                  </text>
                ),
            )}
            {sy.major.map(
              (t) =>
                inY(t) && (
                  <text key={`ly${t}`} x={x0 - 5} y={sy.map(t) + 3.2} textAnchor="end">
                    {svgRich(tickLabel(sy, t).replace('-', MINUS))}
                  </text>
                ),
            )}
          </g>

          {/* Axis titles */}
          <text x={(x0 + x1) / 2} y={H - 4} textAnchor="middle" fill={pal.title}>
            <AxisTitle axis={x} exp={sx.exp} />
          </text>
          <text
            transform={`translate(11 ${(y0 + y1) / 2}) rotate(-90)`}
            textAnchor="middle"
            fill={pal.title}
          >
            <AxisTitle axis={y} exp={sy.exp} />
          </text>

          {hover && (
            <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={9.5}>
              <line x1={x0} x2={hover.px} y1={hover.py} y2={hover.py} stroke={hover.color} strokeDasharray="1 2" opacity={0.7} />
              <line x1={hover.px} x2={hover.px} y1={y0} y2={hover.py} stroke={hover.color} strokeDasharray="1 2" opacity={0.7} />
              <circle cx={hover.px} cy={hover.py} r={5} fill="none" stroke={hover.color} strokeWidth={1.2} />
              {(() => {
                const lines = [
                  `${x.q} = ${sig(hover.x, 6)}${hover.sx ? ` ± ${sig(hover.sx, 2)}` : ''} ${x.unit ?? ''}`.trim(),
                  `${y.q} = ${sig(hover.y, 6)}${hover.sy ? ` ± ${sig(hover.sy, 2)}` : ''} ${y.unit ?? ''}`.trim(),
                ];
                const w = Math.max(...lines.map((l) => l.length)) * 5.9 + 12;
                const bx = hover.px + 10 + w > x1 ? hover.px - 10 - w : hover.px + 10;
                const by = Math.max(y1 + 2, Math.min(y0 - 32, hover.py - 34));
                return (
                  <g transform={`translate(${bx} ${by})`}>
                    <rect width={w} height={30} fill={pal.tipBg} stroke={pal.frame} />
                    {lines.map((l, i) => (
                      <text key={i} x={6} y={12 + i * 12} fill={pal.tipText}>
                        {svgRich(l)}
                      </text>
                    ))}
                  </g>
                );
              })()}
            </g>
          )}

          {!hasData && empty && (
            <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" fill={PLOT_COLORS.dim} fontSize={11} fontFamily="var(--font-mono)">
              {empty}
            </text>
          )}

        </svg>
      </div>
      {legendItems.length > 0 && (
        <div className={`mono mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 pl-[46px] text-[10px] leading-[14px] ${paper ? 'text-[#333]' : 'text-fg-2'}`}>
          {legendItems.map((it, k) => {
            const c = tone('color' in it && it.color ? it.color : it.kind === 'points' || it.kind === 'line' ? PLOT_COLORS.data : PLOT_COLORS.theory);
            const dash = (('dash' in it ? it.dash : undefined) ?? (it.kind === 'fn' ? '5 3' : it.kind === 'hline' || it.kind === 'vline' ? '2 3' : undefined)) || undefined;
            return (
              <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <svg width="16" height="8" aria-hidden>
                  {it.kind === 'points' ? (
                    <circle cx={8} cy={4} r={2.6} fill={c} />
                  ) : (
                    <line x1={0} x2={16} y1={4} y2={4} stroke={c} strokeWidth={1.3} strokeDasharray={dash} />
                  )}
                </svg>
                {'label' in it ? it.label : ''}
              </span>
            );
          })}
        </div>
      )}
      {caption && (
        <figcaption className={`mt-1.5 font-serif text-[12px] leading-snug ${paper ? 'text-[#444]' : 'text-fg-3'}`}>{caption}</figcaption>
      )}
    </figure>
  );
}
