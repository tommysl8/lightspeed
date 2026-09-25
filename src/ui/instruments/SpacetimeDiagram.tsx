/**
 * Minkowski diagram of a trip in the Sun's frame S, with c = 1 (years and light-years, or
 * hours and light-hours, …): departure and destination worldlines, the light cone of the
 * launch event, the ship's worldline with proper-time ticks, the current event and the
 * ship's line of simultaneity through it.
 */
import { useMemo } from 'react';
import { C_KM_S, DAY_S, JULIAN_YEAR_S } from '../../physics/constants';
import { flipAndBurnAtEarthTime, type FlipAndBurnTrip } from '../../physics/rocket';
import { niceStep } from '../plot/ticks';
import { Plot, PLOT_COLORS, type PlotSeries } from '../plot/Plot';

export interface WorldlineSpec {
  drive: 'cruise' | 'rocket' | 'warp';
  beta: number;
  distance: number;
  earthTime: number;
  shipTime: number;
  rocket: FlipAndBurnTrip | null;
}

const UNITS = [
  { t: JULIAN_YEAR_S, tn: 'yr', xn: 'ly' },
  { t: DAY_S, tn: 'd', xn: 'light-day' },
  { t: 3600, tn: 'h', xn: 'light-hour' },
  { t: 60, tn: 'min', xn: 'light-min' },
  { t: 1, tn: 's', xn: 'light-s' },
];

function pickUnits(maxSeconds: number) {
  return UNITS.find((u) => maxSeconds >= 0.8 * u.t) ?? UNITS[UNITS.length - 1];
}

export function SpacetimeDiagram({
  spec,
  elapsed,
  height = 220,
  caption = true,
}: {
  spec: WorldlineSpec;
  /** Earth time since launch, s (null: not launched). */
  elapsed: number | null;
  height?: number;
  caption?: boolean;
}) {
  const { series, u } = useMemo(() => {
    const warp = spec.drive === 'warp';
    const T = spec.earthTime;
    const dLight = spec.distance / C_KM_S; // distance in light-seconds
    const u = pickUnits(Math.max(T, dLight));
    const X = dLight / u.t;
    const Tm = T / u.t;
    const top = Math.max(Tm, X) * 1.05;

    // Ship position (light-units) at Earth time t (s)
    const shipAt = (t: number) => {
      if (spec.rocket) {
        const s = flipAndBurnAtEarthTime(spec.rocket, t);
        return { x: s.d / C_KM_S / u.t, tau: s.tau, beta: s.beta };
      }
      return { x: (spec.beta * t) / u.t, tau: warp ? NaN : t * Math.sqrt((1 - spec.beta) * (1 + spec.beta)), beta: spec.beta };
    };

    const s: PlotSeries[] = [
      { kind: 'line', data: [{ x: 0, y: 0 }, { x: 0, y: top }], color: '#38414a', width: 1 },
      { kind: 'line', data: [{ x: X, y: 0 }, { x: X, y: top }], color: '#38414a', width: 1 },
      { kind: 'line', data: [{ x: 0, y: 0 }, { x: top, y: top }], color: PLOT_COLORS.theory, dash: '4 3', width: 1, label: 'light from launch' },
    ];

    const N = spec.rocket ? 160 : 2;
    const wl = Array.from({ length: N + 1 }, (_, i) => {
      const t = (T * i) / N;
      return { x: shipAt(t).x, y: t / u.t };
    });
    s.push({
      kind: 'line',
      data: wl,
      color: warp ? PLOT_COLORS.hazard : PLOT_COLORS.data,
      width: 1.6,
      label: warp ? 'ship (spacelike: non-physical)' : 'ship worldline',
    });

    // Proper-time ticks along the worldline
    if (!warp && spec.shipTime > 0) {
      const tauU = pickUnits(spec.shipTime);
      const step = niceStep(spec.shipTime / tauU.t, 6) * tauU.t;
      const ticks: { x: number; y: number }[] = [];
      const texts: PlotSeries[] = [];
      for (let k = 1; k * step < spec.shipTime - 1e-9 && k < 40; k++) {
        const tau = k * step;
        // invert τ(t) by bisection (monotonic)
        let lo = 0;
        let hi = T;
        for (let i = 0; i < 60; i++) {
          const mid = 0.5 * (lo + hi);
          if (shipAt(mid).tau < tau) lo = mid;
          else hi = mid;
        }
        const p = { x: shipAt(lo).x, y: lo / u.t };
        ticks.push(p);
        if (k % Math.ceil(spec.shipTime / step / 5) === 0)
          texts.push({ kind: 'text', x: p.x, y: p.y, text: `τ=${+(tau / tauU.t).toPrecision(3)} ${tauU.tn}`, dy: -5, color: PLOT_COLORS.accent });
      }
      s.push({ kind: 'points', data: ticks, color: PLOT_COLORS.accent, shape: 'diamond', label: 'proper-time ticks' }, ...texts);
    }

    s.push({ kind: 'text', x: 0, y: top, text: 'departure', dy: 10 }, { kind: 'text', x: X, y: top, text: 'destination', dy: 10, anchor: 'end' });

    if (elapsed !== null) {
      const e = Math.min(Math.max(elapsed, 0), T);
      const p = shipAt(e);
      const ye = e / u.t;
      s.push({ kind: 'marker', x: p.x, y: ye, color: PLOT_COLORS.accent });
      if (!warp && p.beta > 1e-4) {
        // Ship's line of simultaneity: t − tₑ = β (x − xₑ)
        const span = top * 2;
        s.push({
          kind: 'line',
          data: [
            { x: p.x - span, y: ye - p.beta * span },
            { x: p.x + span, y: ye + p.beta * span },
          ],
          color: PLOT_COLORS.accent,
          dash: '2 3',
          width: 1,
          label: 'ship’s “now”',
          noExtent: true,
        });
      }
    }
    return { series: s, u };
  }, [spec, elapsed]);

  return (
    <Plot
      x={{ q: 'x', unit: u.xn }}
      y={{ q: 't', unit: u.tn }}
      series={series}
      height={height}
      equal
      legend={false}
      caption={
        caption
          ? `Spacetime diagram in the Sun’s frame (c = 1: light moves at 45°). Diamonds mark equal steps of ship time; the dotted line joins events the ship considers simultaneous with its present.`
          : undefined
      }
    />
  );
}
