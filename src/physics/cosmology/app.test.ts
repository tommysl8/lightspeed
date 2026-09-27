// What the app adds to the module: the policy with a departure point, the light lag in the playback
// samples (home as seen from the ship), and tables built on one thread and used on another.
import { describe, expect, it, vi } from 'vitest';
import { planck18 } from './cosmology.ts';
import { homeViewAt, planFlipAndBurn, planStatic, sampleAt, type TripPlan, type Unreachable } from './ship.ts';
import { LOCAL_GROUP, localGroupBarycentre, planTrip, propagationModel, tripDistanceMpc, type Vec3 } from './policy.ts';

const ok = (p: TripPlan | Unreachable): TripPlan => {
  if (!p.ok) throw new Error(p.message);
  return p;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('the Local Group policy with a departure point', () => {
  const m31 = LOCAL_GROUP.m31EclMpc;
  const virgo: Vec3 = [0, 0, 16.5];
  it('flies static space only when both ends are bound to the Local Group', () => {
    expect(propagationModel({ positionMpc: m31 })).toBe('static');
    // From Andromeda to Triangulum's neighbourhood: both inside.
    expect(propagationModel({ originMpc: m31, positionMpc: [0.4, 0.3, 0.4] })).toBe('static');
    // Out of the Local Group, and home again from outside it.
    expect(propagationModel({ positionMpc: virgo })).toBe('flrw');
    expect(propagationModel({ originMpc: virgo, positionMpc: [0, 0, 0] })).toBe('flrw');
    expect(propagationModel({ originMpc: virgo, positionMpc: m31 })).toBe('flrw');
    // A catalogue flag still wins.
    expect(propagationModel({ originMpc: virgo, positionMpc: m31, bound: true })).toBe('static');
  });

  it('uses a barycentre given in the caller’s frame', () => {
    // A point 0.9 Mpc beyond the default barycentre is inside; move the barycentre 0.2 Mpc away and it is not.
    const b = localGroupBarycentre();
    const p: Vec3 = [b[0], b[1], b[2] + 0.9];
    expect(propagationModel({ positionMpc: p })).toBe('static');
    expect(propagationModel({ positionMpc: p, barycentreMpc: [b[0], b[1], b[2] - 0.2] })).toBe('flrw');
  });

  it('measures the trip from the departure point', () => {
    expect(tripDistanceMpc({ originMpc: [1, 2, 3], positionMpc: [4, 6, 3] })).toBeCloseTo(5, 14);
    expect(tripDistanceMpc({ positionMpc: [3, 4, 0] })).toBeCloseTo(5, 14);
    const c = planck18();
    // Andromeda to Virgo is a flight in expanding space over their separation.
    const p = ok(planTrip(c, { originMpc: m31, positionMpc: virgo }));
    expect(p.model).toBe('flrw');
    expect(rel(p.chiMpc, Math.hypot(virgo[0] - m31[0], virgo[1] - m31[1], virgo[2] - m31[2]))).toBeLessThan(1e-15);
  });
});

describe('home as seen from the ship', () => {
  const c = planck18();
  it('carries the light lag in the samples, consistent with the arrival values', () => {
    for (const chi of [16.5, 1946.4]) {
      const p = ok(planFlipAndBurn(c, chi));
      const s = p.samples;
      const n = s.tauYr.length;
      expect(s.lagMpc[0]).toBe(0);
      // The lag only grows, and at arrival it gives the module's own view of home.
      for (let i = 1; i < n; i++) expect(s.lagMpc[i]).toBeGreaterThanOrEqual(s.lagMpc[i - 1]);
      const v = homeViewAt(c, Math.log(p.departure.scale), s.lnA[n - 1], s.lagMpc[n - 1]);
      expect(rel(Math.expm1(v.ln1pZ), p.home.redshift)).toBeLessThan(1e-9);
      expect(rel(v.emissionAfterDepartureYr, p.home.emissionAfterDepartureYr)).toBeLessThan(1e-9);
    }
  });

  it('interpolates the lag as well as the rest, and continuously through the flip', () => {
    const p = ok(planFlipAndBurn(c, 16.5));
    const flip = p.phases[0].endTauYr;
    const eps = 1e-9 * flip;
    const before = { ...sampleAt(p.samples, flip - eps) };
    const at = { ...sampleAt(p.samples, flip) };
    const after = { ...sampleAt(p.samples, flip + eps) };
    for (const k of ['dtYr', 'chiMpc', 'u', 'lnA', 'lagMpc'] as const) {
      expect(rel(before[k], at[k])).toBeLessThan(1e-7);
      expect(rel(after[k], at[k])).toBeLessThan(1e-7);
    }
    // An object passed in is filled, not replaced.
    const out = { dtYr: 0, chiMpc: 0, u: 0, lnA: 0, lagMpc: 0 };
    expect(sampleAt(p.samples, flip, out)).toBe(out);
    expect(out.chiMpc).toBe(at.chiMpc);
  });

  it('sees home unredshifted in static space, only delayed', () => {
    const p = ok(planStatic(c, 0.761));
    const s = p.samples;
    const n = s.tauYr.length;
    const v = homeViewAt(c, 0, s.lnA[n - 1], 0);
    expect(v.ln1pZ).toBe(0);
    // The lag at arrival is the home light's delay behind departure, in light-years.
    expect(rel((s.lagMpc[n - 1] * 3.2615637771674333e6), p.home.emissionAfterDepartureYr)).toBeLessThan(1e-9);
  });
});

describe('tables built on one thread and used on another', () => {
  it('give exactly the numbers of tables built here', async () => {
    const built = await import('./cosmology.ts');
    const tables = built.planck18Tables();
    // A fresh copy of the module stands for the main thread, which has not built anything.
    vi.resetModules();
    const fresh = await import('./cosmology.ts');
    expect(fresh.planck18Built()).toBe(false);
    const copy = { master: { ...tables.master, t: tables.master.t.slice(), eta: tables.master.eta.slice(), chiEH: tables.master.chiEH.slice(), invE: tables.master.invE.slice(), dlnE: tables.master.dlnE.slice() }, nu: { g: tables.nu.g.slice(), g1: tables.nu.g1.slice(), g2: tables.nu.g2.slice() } };
    expect(fresh.adoptPlanck18Tables(copy)).toBe(true);
    expect(fresh.planck18Built()).toBe(true);
    // Adopted, not rebuilt: the arrays are the ones handed over.
    expect(fresh.planck18().table.t).toBe(copy.master.t);
    const a = built.planck18();
    const b = fresh.planck18();
    for (const x of [1e-6, 1e-3, 0.5, 1, 3, 100]) {
      expect(b.timeGyr(x)).toBe(a.timeGyr(x));
      expect(b.eventHorizonMpc(x)).toBe(a.eventHorizonMpc(x));
      expect(b.E(x)).toBe(a.E(x));
    }
    expect(b.ageGyr()).toBe(a.ageGyr());
    // A second hand-over, or a table from another grid, changes nothing.
    expect(fresh.adoptPlanck18Tables(copy)).toBe(false);
    vi.resetModules();
    const other = await import('./cosmology.ts');
    expect(other.adoptPlanck18Tables({ master: { ...copy.master, step: 1 / 16 }, nu: copy.nu })).toBe(false);
    expect(other.planck18Built()).toBe(false);
  });
});
