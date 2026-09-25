import { describe, expect, it } from 'vitest';
import { AU_KM, C_KM_S, G0_KM_S2 } from '../physics/constants';
import { cosShipFromRest, dopplerFromShipAngle, gamma } from '../physics/relativity';
import { flipAndBurn, flipAndBurnAt } from '../physics/rocket';
import { gaussian, mulberry32 } from '../lib/stats';
import type { DataRow, ExperimentId, Value } from './notebook';
import { PROTOCOLS, cellText, columnUnits, toCsv, type ResultLine } from './protocols';

let seq = 0;
function row(exp: ExperimentId, v: Record<string, Value>, s?: Record<string, number>): DataRow {
  seq++;
  return { id: `${exp}-${seq}`, exp, n: seq, simMs: Date.UTC(2026, 8, 24) + seq * 1000, v, s, src: 'auto' };
}

/** Parse the leading number of a result value such as "299 792.46 ± 0.35". */
function lead(lines: ResultLine[], label: RegExp): number {
  const l = lines.find((x) => label.test(x.label));
  if (!l) throw new Error(`no result ${label}`);
  const m = l.value.replace(/\s/g, '').replace('−', '-').match(/-?[\d.]+/);
  return Number(m![0]);
}

describe('Experiment 1 analysis', () => {
  it('recovers c from exact detector readings', () => {
    const rows = [0.00258, 0.38, 1.0, 1.7, 6.0, 9.5, 29].map((au) => row('E1', { rx: 'x', pulse: 1, dt: (au * AU_KM) / C_KM_S, d: au * AU_KM }));
    const a = PROTOCOLS.E1.analyse(rows);
    expect(lead(a.results, /Slope/)).toBeCloseTo(C_KM_S, 1);
    expect(a.raw.series.some((s) => s.kind === 'points')).toBe(true);
  });

  it('gives a sensible χ² with simulated noise', () => {
    const rand = mulberry32(7);
    const rows = Array.from({ length: 12 }, (_, i) => {
      const d = (0.5 + i * 3) * AU_KM;
      const dt = d / C_KM_S;
      const sd = 2000 + 5e-4 * d;
      const st = 0.3 + 2e-4 * dt;
      return row('E1', { rx: 'x', pulse: 1, dt: dt + st * gaussian(rand), d: d + sd * gaussian(rand) }, { dt: st, d: sd });
    });
    const a = PROTOCOLS.E1.analyse(rows);
    const chi = a.results.find((l) => l.label === 'χ²/ν')!;
    const red = Number(chi.value.split('=').at(-1)!.replace(/\s/g, ''));
    expect(red).toBeGreaterThan(0.1);
    expect(red).toBeLessThan(4);
    const c = lead(a.results, /Slope/);
    expect(Math.abs(c - C_KM_S) / C_KM_S).toBeLessThan(0.01);
  });
});

describe('Experiment 2 analysis', () => {
  it('fits the exponent ½ in Δτ = Δt (1 − β²)^p', () => {
    const rows = [0.1, 0.5, 0.8, 0.9, 0.99, 0.999].map((b) => {
      const t = 1e8;
      return row('E2', { dest: 'Proxima Centauri', beta: b, t, tau: t / gamma(b) });
    });
    const a = PROTOCOLS.E2.analyse(rows);
    expect(lead(a.results, /Fitted exponent/)).toBeCloseTo(0.5, 9);
    // Derived columns agree with the prediction
    const dev = PROTOCOLS.E2.columns.find((c) => c.key === 'dev')!;
    const units = columnUnits(PROTOCOLS.E2.columns, rows);
    for (const r of rows) expect(cellText(dev, r, units.dev)).toMatch(/^0\.0+$/);
  });
});

describe('Experiment 3 analysis', () => {
  it('recovers β and γ from the angular dependence of D', () => {
    const beta = 0.8;
    const rows = [0, 20, 40, 60, 90, 120, 150, 180].map((th) =>
      row('E3', { beta, thS: th, D: dopplerFromShipAngle(Math.cos((th * Math.PI) / 180), beta) }),
    );
    const a = PROTOCOLS.E3.analyse(rows);
    expect(lead(a.results, /β from fit/)).toBeCloseTo(0.8, 9);
    expect(lead(a.results, /γ from intercept/)).toBeCloseTo(gamma(0.8), 7);
  });
});

describe('Experiment 4 analysis', () => {
  it('recovers β from catalogue and observed angles', () => {
    const beta = 0.9;
    const rows = [10, 35, 60, 90, 120, 150, 170].map((th) => {
      const c = Math.cos((th * Math.PI) / 180);
      const thS = (Math.acos(cosShipFromRest(c, beta)) * 180) / Math.PI;
      return row('E4', { target: 'x', beta, th, thS });
    });
    const a = PROTOCOLS.E4.analyse(rows);
    expect(lead(a.results, /β from fit/)).toBeCloseTo(0.9, 9);
  });
});

describe('Experiment 5 analysis', () => {
  it('measures the proper acceleration from the rapidity', () => {
    const trip = flipAndBurn(4.25 * 9.4607e12);
    const rows: DataRow[] = [];
    for (let k = 0; k <= 35; k++) {
      const tau = Math.min(k * 0.1 * 3.15576e7, trip.shipTime);
      const st = flipAndBurnAt(trip, tau);
      rows.push(
        row('E5', {
          flight: 1,
          phase: tau < trip.shipTime / 2 ? 'accel' : 'decel',
          tau,
          t: st.t,
          x: st.d,
          beta: st.beta,
          T: trip.shipTime,
          a: trip.accel,
        }),
      );
    }
    const a = PROTOCOLS.E5.analyse(rows);
    expect(lead(a.results, /Proper acceleration/)).toBeCloseTo(G0_KM_S2 * 1000, 6);
  });
});

describe('CSV export', () => {
  it('writes base units, derived flags and uncertainty columns', () => {
    const rows = [row('E1', { rx: 'Mars, detector', pulse: 1, dt: 851.1, d: 2.55e8 }, { dt: 0.47, d: 1.3e5 })];
    const csv = toCsv(PROTOCOLS.E1, rows, ['test']);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toMatch(/^# Lightspeed virtual laboratory, Experiment 1/);
    const header = lines.find((l) => l.startsWith('n,'))!;
    expect(header).toBe('n,sim_time_utc,rx,pulse,dt [s],u(dt) [s],d [km],u(d) [km],v [km/s] (derived)');
    const data = lines.at(-1)!;
    // Text with a comma is quoted; numbers are raw
    expect(data).toContain('"Mars, detector"');
    expect(data).toContain(',851.1,0.47,255000000,130000,');
  });
});

describe('uncertainty models (Monte Carlo)', () => {
  /** Mean reduced χ² of a group's fit over many noisy data sets. */
  function meanChi2(exp: 'E3' | 'E4', beta: number, trials: number): number {
    const rand = mulberry32(12345);
    let sum = 0;
    let n = 0;
    for (let t = 0; t < trials; t++) {
      const rows: DataRow[] = [];
      for (let k = 0; k < 12; k++) {
        const deg = 5 + k * 15;
        const c = Math.cos((deg * Math.PI) / 180);
        if (exp === 'E3') {
          const D = dopplerFromShipAngle(c, beta);
          rows.push(row('E3', { beta, thS: deg + 0.2 * gaussian(rand), D: D * (1 + 0.005 * gaussian(rand)) }, { thS: 0.2, D: 0.005 * D }));
        } else {
          const thS = (Math.acos(cosShipFromRest(c, beta)) * 180) / Math.PI;
          rows.push(row('E4', { target: 'x', beta, th: deg + 0.05 * gaussian(rand), thS: thS + 0.05 * gaussian(rand) }, { th: 0.05, thS: 0.05 }));
        }
      }
      const chi = PROTOCOLS[exp].analyse(rows).results.find((l) => l.label.endsWith('χ²/ν'));
      if (!chi) continue;
      sum += Number(chi.value.split('=').at(-1)!.replace(/\s/g, ''));
      n++;
    }
    return sum / n;
  }

  it('Experiment 3: χ²/ν ≈ 1 with angle and Doppler errors propagated', () => {
    for (const b of [0.5, 0.9, 0.99]) expect(meanChi2('E3', b, 150), `β = ${b}`).toBeGreaterThan(0.85);
    for (const b of [0.5, 0.9, 0.99]) expect(meanChi2('E3', b, 150), `β = ${b}`).toBeLessThan(1.15);
  });

  it('Experiment 4: χ²/ν ≈ 1 with both angles propagated', () => {
    for (const b of [0.5, 0.9, 0.99]) expect(meanChi2('E4', b, 150), `β = ${b}`).toBeGreaterThan(0.85);
    for (const b of [0.5, 0.9, 0.99]) expect(meanChi2('E4', b, 150), `β = ${b}`).toBeLessThan(1.15);
  });
});
