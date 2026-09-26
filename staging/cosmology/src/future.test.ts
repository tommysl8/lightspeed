import { describe, expect, it } from 'vitest';
import { planck18 } from './cosmology.ts';
import { FUTURE, homeAt, homeReport, mwM31MergedProbability, sunAt } from './future.ts';
import { planFlipAndBurn, type TripPlan } from './ship.ts';

const c = planck18();

describe('future.json', () => {
  it('has sources for every reference key it uses', () => {
    const text = JSON.stringify(FUTURE);
    for (const m of text.matchAll(/"ref":"([a-z0-9]+)"/g)) expect(Object.keys(FUTURE.references)).toContain(m[1]);
  });
  it('Milky Way-Andromeda merger probability rises monotonically to about 52% at 10 Gyr', () => {
    const cdf = FUTURE.localGroup.milkyWayAndromeda.cdf.fiducial as number[][];
    for (let i = 1; i < cdf.length; i++) expect(cdf[i][1]).toBeGreaterThanOrEqual(cdf[i - 1][1]);
    expect(FUTURE.localGroup.milkyWayAndromeda.probabilityWithin10Gyr).toBeCloseTo(0.52, 2);
    expect(mwM31MergedProbability(3).p).toBe(0);
    expect(mwM31MergedProbability(7).p).toBeCloseTo(0.17, 2);
    expect(mwM31MergedProbability(12).modelled).toBe(false);
  });
  it('the Sun: main sequence now, red-giant tip 7.59 Gyr from now, white dwarf after 7.72 Gyr', () => {
    const now = sunAt(0);
    expect(now.phaseId).toBe('main-sequence');
    expect(now.luminosityLsun).toBeCloseTo(1, 12);
    expect(sunAt(-4.58).luminosityLsun).toBeCloseTo(0.7, 12);
    expect(sunAt(1).luminosityLsun!).toBeGreaterThan(1.05);
    expect(sunAt(6).phaseId).toBe('subgiant-red-giant');
    expect(sunAt(7.65).phaseId).toBe('helium-burning');
    expect(sunAt(8).phaseId).toBe('white-dwarf');
  });
});

describe('home report for an arriving traveller', () => {
  it('after a trip to Virgo nothing has changed at home except 54 million years', () => {
    const p = planFlipAndBurn(c, 16.5) as TripPlan;
    const r = homeReport(c, p.arrival.timeGyr, p.home.emissionTimeGyr);
    expect(r.now.sun.phaseId).toBe('main-sequence');
    expect(r.now.earth).toContain('habitable');
    expect(r.now.cmbTemperatureK).toBeCloseTo(2.72548 / p.arrival.scale, 12);
  });
  it('after a trip to a z = 1 galaxy (18.9 Gyr at home) the Sun is a white dwarf and the merger odds are open', () => {
    const p = planFlipAndBurn(c, c.comovingDistanceMpc(1)) as TripPlan;
    const r = homeReport(c, p.arrival.timeGyr, p.home.emissionTimeGyr);
    expect(r.now.sun.phaseId).toBe('white-dwarf');
    expect(r.now.earth).toContain('swallowed');
    expect(r.now.andromeda).toContain('10 Gyr');
    expect(r.now.cmbTemperatureK).toBeCloseTo(0.8634, 3);
    // Through a telescope the traveller sees home as it was when the light left, also in the future of the departure.
    expect(r.seen.fromNowGyr).toBeGreaterThan(0);
    expect(r.seen.fromNowGyr).toBeLessThan(r.now.fromNowGyr);
  });
  it('far future statements', () => {
    const h = homeAt(c, c.ageGyr() + 200);
    expect(h.statements.join(' ')).toContain('event horizon');
    expect(h.cmbTemperatureK).toBeLessThan(1e-4);
  });
  it('the extragalactic sky 100 Gyr from now: Virgo has crossed the event horizon but is still seen; the M81 group has not', () => {
    const h = homeAt(c, c.ageGyr() + 100);
    const byId = Object.fromEntries(h.sky.map((s) => [s.id, s]));
    expect(byId['virgo-cluster'].crossed).toBe(true);
    expect(byId['virgo-cluster'].crossesHorizonFromNowGyr).toBeCloseTo(99.5, 1);
    expect(byId['virgo-cluster'].redshiftSeen).toBeCloseTo(1.03, 2);
    expect(byId['m81-group'].crossed).toBe(false);
    expect(byId['m81-group'].crossesHorizonFromNowGyr).toBeGreaterThan(125);
    expect(byId['m81-group'].redshiftSeen).toBeCloseTo(0.23, 2);
    const text = h.statements.join(' ');
    expect(text).not.toContain('dark');
    expect(text).toContain('still arrives');
    // Crossing time: the comoving event horizon has shrunk to the galaxy's distance.
    const lCross = c.lnAtEventHorizon(16.5 / c.dH);
    expect(c.eventHorizonMpc(Math.exp(lCross))).toBeCloseTo(16.5, 9);
  });
});
