/**
 * Flights beyond the Local Group: which spacetime a flight crosses (from both ends' positions), the
 * expanding-universe plans, their refusals, and playback through the flip and on arrival with the
 * clock carrying cosmic time.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { msFromAstroTime, msFromCivil, JULIAN_YEAR_MS } from '../lib/time';
import { flightStandoff, framingDistance, minDistance } from '../controls/framing';
import { MPC_KM, homeAt, planFlipAndBurn, planck18 } from '../physics/cosmology';
import { loadLocalGalaxies, loadNamed } from '../test/cosmos';
import { registerBodies, unregisterBodies, isBody } from './bodies';
import type { PositionProvider } from './bodies/types';
import { chrono, chronoLaunch, chronoTau, chronoTripEnd, zeroChrono } from './chronometer';
import { setPaused, setWarp } from './clock';
import { cosmicAtMemo, cosmicNow } from './cosmicTime';
import { registerCosmos } from './cosmos/load';
import { updateEphemeris } from './ephemeris';
import { setSimTime, sim } from './sim';
import { updateShipKinematics } from './shipKinematics';
import { tickClock, tickTrip } from './tick';
import {
  cosmicReadings,
  cosmicSampleAt,
  jumpToArrival,
  launch,
  planFlight,
  setShipRate,
  travel,
  type FlightResult,
  type Trip,
  type TripPlan,
} from './travel';
import { clearCosmicPlans, cosmologyReady, returnLeg, spaceModel } from './travelCosmic';
import { arrivalCosmicText, flrwSentence, homeClockText, refusalText } from '../ui/flight/tripText';

const T0 = msFromCivil(2026, 9, 26, 0);
const FPS = 60;
const YEAR_S = 365.25 * 86_400;

const ok = (r: FlightResult): TripPlan => {
  if (!r.ok) throw new Error(r.refusal ? `${r.refusal.reason}: ${r.refusal.detail}` : 'no plan');
  return r.plan;
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const earthSide = () => sim.bodies.earth.pos.clone().add(new Vector3(26_000, 0, 0));
const at = (id: string) => sim.bodies[id].pos.clone();

/** A galaxy that takes part in the expansion, at comoving distance `chiMpc` (the cosmic web reaches only z = 0.11). */
function testGalaxy(id: string, chiMpc: number): void {
  const x = new Vector3(0.36, 0.48, 0.8).normalize().multiplyScalar(chiMpc * MPC_KM);
  const provider: PositionProvider = {
    label: 'test',
    availability: () => ({ available: true, reason: null, regime: 'illustrative' }),
    positionAt(t, pos, vel) {
      // Ecliptic, relative to the Sun: a(t) x, as the galaxies taking part in the expansion are placed.
      const s = cosmicAtMemo(msFromAstroTime(t)).a;
      pos.x = s * x.x;
      pos.y = s * x.y;
      pos.z = s * x.z;
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
  registerBodies([{ id, name: 'Test galaxy', kind: 'galaxy', parent: null, physical: { radiusKm: 3e17, colour: '#ffffff' }, visual: { renderer: 'layer' }, provider }]);
}

function depart(dest: string, from = earthSide(), accelG = 1): Trip {
  const plan = ok(planFlight(dest, 0, from, sim.astroTime, 'rocket', { accelG }));
  zeroChrono();
  launch(plan);
  chronoLaunch();
  return travel.trip!;
}

/** Frames of 1/60 s until the trip arrives: the ship's world position after each. */
function fly(maxFrames: number): { frames: number; path: Vector3[]; taus: number[] } {
  const path: Vector3[] = [];
  const taus: number[] = [];
  for (let n = 1; n <= maxFrames; n++) {
    const dt = tickClock(1 / FPS);
    const arrived = tickTrip(dt);
    updateShipKinematics();
    path.push(travel.shipPos.clone());
    taus.push(arrived ? arrived.shipTime : travel.trip!.tau);
    if (arrived) return { frames: n, path, taus };
  }
  return { frames: -1, path, taus };
}

beforeAll(() => {
  registerCosmos(loadLocalGalaxies(), loadNamed());
  setSimTime(T0);
  updateEphemeris();
});

beforeEach(() => {
  travel.trip = null;
  chronoTripEnd();
  setPaused(false);
  setWarp(1);
  setSimTime(T0);
  updateEphemeris();
});

describe('which spacetime a flight crosses', () => {
  it('is static inside the Local Group and expanding beyond it, from both ends’ positions', () => {
    const home = earthSide();
    expect(spaceModel(home, at('andromeda'))).toBe('static');
    expect(spaceModel(home, at('triangulum'))).toBe('static');
    expect(spaceModel(home, at('sgr-a-star'))).toBe('static');
    expect(spaceModel(home, at('virgo-cluster'))).toBe('flrw');
    expect(spaceModel(home, at('m81'))).toBe('flrw');
    // NGC 3109, 1.3 Mpc away, lies outside the zero-velocity surface.
    expect(isBody('lg-ngc-3109')).toBe(true);
    expect(spaceModel(home, at('lg-ngc-3109'))).toBe('flrw');
    // From Andromeda to Triangulum: both bound. Home from the Virgo cluster: across expanding space.
    expect(spaceModel(at('andromeda'), at('triangulum'))).toBe('static');
    const nearVirgo = at('virgo-cluster').multiplyScalar(0.9);
    expect(spaceModel(nearVirgo, at('milky-way'))).toBe('flrw');
    expect(spaceModel(nearVirgo, at('andromeda'))).toBe('flrw');
  });

  it('flies Andromeda at 1 g in static space, as always, all the way in (28.6 years aboard, 2.5 million at home)', () => {
    const p = ok(planFlight('andromeda', 0, earthSide(), sim.astroTime, 'rocket'));
    expect(p.model).toBe('static');
    expect(p.cosmic).toBeNull();
    expect(p.rocket).not.toBeNull();
    // A galaxy has no surface: the flight ends at its closest approach (0.02 of its radius), not four radii out.
    expect(rel(p.aim.distanceTo(at('andromeda')), minDistance('andromeda'))).toBeLessThan(1e-6);
    expect(minDistance('andromeda')).toBeLessThan(1e-3 * p.distance);
    expect(p.shipTime / YEAR_S).toBeGreaterThan(28.55);
    expect(p.shipTime / YEAR_S).toBeLessThan(28.6);
    expect(p.earthTime / YEAR_S / 1e6).toBeCloseTo(2.48, 2);
  });

  it('flies the Virgo cluster in expanding space, with the module’s numbers', () => {
    const from = earthSide();
    const p = ok(planFlight('virgo-cluster', 0, from, sim.astroTime, 'rocket'));
    expect(p.model).toBe('flrw');
    const c = p.cosmic!.plan;
    // The comoving distance is Virgo's place less the standoff; the module's own plan agrees exactly.
    const direct = planFlipAndBurn(planck18(), p.distance / MPC_KM, { departureScale: cosmicNow().a });
    if (!direct.ok) throw new Error(direct.message);
    expect(rel(c.shipTimeYr, direct.shipTimeYr)).toBeLessThan(1e-12);
    expect(rel(c.cosmicTimeYr, direct.cosmicTimeYr)).toBeLessThan(1e-12);
    // 34.55 years aboard and 53.9 million at home to the centre (16.5 Mpc, docs/data/cosmology.md): the flight
    // ends at the cluster's closest approach, 18 kpc from its centre.
    expect(p.shipTime / YEAR_S).toBeCloseTo(34.55, 1);
    expect(p.earthTime / YEAR_S / 1e6).toBeCloseTo(53.9, 0);
    expect(p.gamma).toBeGreaterThan(2e7);
    expect(flrwSentence(p)).toBe('You arrive 35 years older; the universe is 54 million years older too.');
    // Asked again (the planner does, twice a second), it is the same plan.
    expect(ok(planFlight('virgo-cluster', 0, earthSide(), sim.astroTime, 'rocket')).cosmic).toBe(p.cosmic);
    expect(cosmologyReady()).toBe(true);
  });

  it('shows the way back, longer because the universe has grown, or none', () => {
    const p = ok(planFlight('virgo-cluster', 0, earthSide(), sim.astroTime, 'rocket'));
    const back = returnLeg(p.cosmic!);
    if (!back.ok) throw new Error(back.message);
    expect(back.shipTimeYr).toBeGreaterThan(p.cosmic!.plan.shipTimeYr);
    expect(back.departure.scale).toBe(p.cosmic!.plan.arrival.scale);
  });
});

describe('refusals', () => {
  it('refuses JADES-GS-z14-0: beyond the cosmic event horizon, 16.6 billion light-years away', () => {
    const r = planFlight('jades-gs-z14-0', 0, earthSide(), sim.astroTime, 'rocket');
    expect(r.ok).toBe(false);
    const f = !r.ok ? r.refusal! : null!;
    expect(f.reason).toBe('beyond-event-horizon');
    expect(f.model).toBe('flrw');
    expect(f.horizonKm / MPC_KM).toBeCloseTo(5083.75, 1);
    expect(f.distanceKm).toBeGreaterThan(f.horizonKm);
    const words = refusalText(f, 'JADES-GS-z14-0');
    expect(words.title).toBe('Beyond the cosmic event horizon');
    expect(words.text).toContain('away now, beyond the cosmic event horizon, which is 16.6 billion light-years away.');
    expect(words.text).toMatch(/JADES-GS-z14-0 is 3\d\.\d billion light-years away/);
    expect(words.text).toMatch(/set out 13\.\d billion years ago/);
  });

  it('refuses what the engine cannot reach within the time on board, saying how far it could get', () => {
    const r = planFlight('coma-cluster', 0, earthSide(), sim.astroTime, 'rocket', { accelG: 0.1, maxShipTimeYr: 30 });
    const f = !r.ok ? r.refusal! : null!;
    expect(f.reason).toBe('ship-time-limit');
    expect(f.maxKm).toBeGreaterThan(0);
    expect(f.maxKm).toBeLessThan(f.distanceKm);
    expect(refusalText(f, 'the Coma Cluster').text).toMatch(/^At 0\.1 g, 30 years on board take you at most [\d.,]+ (million )?light-years; the Coma Cluster is [\d.]+ million light-years away\./);
    // In static space too: Andromeda takes 28.6 years at 1 g.
    const s = planFlight('andromeda', 0, earthSide(), sim.astroTime, 'rocket', { maxShipTimeYr: 20 });
    const g = !s.ok ? s.refusal! : null!;
    expect(g.reason).toBe('ship-time-limit');
    expect(g.model).toBe('static');
    expect(g.maxKm).toBeLessThan(g.distanceKm);
    // With room to spare it flies.
    expect(planFlight('andromeda', 0, earthSide(), sim.astroTime, 'rocket', { maxShipTimeYr: 30 }).ok).toBe(true);
  });

  it('words the other refusals plainly', () => {
    const base = { model: 'flrw' as const, dest: 'x', distanceKm: 5000 * MPC_KM, horizonKm: 5083.75 * MPC_KM, maxKm: NaN, maxShipTimeYr: NaN, accelG: 1, beta: NaN, aDep: 1, detail: '' };
    expect(refusalText({ ...base, reason: 'beyond-reach', distanceKm: 5083.7 * MPC_KM, maxKm: (5083.75 - 2.97e-7) * MPC_KM }, 'X').text).toMatch(/at 1 g it stays at least 0\.97 light-years behind for ever/);
    expect(refusalText({ ...base, reason: 'beyond-reach-at-cruise-speed', beta: 0.5, maxKm: 1000 * MPC_KM }, 'X').text).toMatch(/^At a steady 0\.5c the ship can never cover/);
    expect(refusalText({ ...base, reason: 'recedes', model: 'static' }, 'X').text).toBe('X recedes faster than the ship can close.');
  });
});

describe('playback through expanding space', () => {
  it('is continuous through the flip and lands on the aim, with the clock carrying cosmic time', () => {
    const trip = depart('virgo-cluster');
    const plan = trip.cosmic!.plan;
    const age0 = cosmicNow().ageGyr;
    const flipYr = plan.phases[0].endTauYr;
    setShipRate(trip.shipTime / 20); // twenty seconds of playback
    // Eight seconds in (before the flip) the clock has carried cosmic time on: the universe is as the trip says.
    for (let i = 0; i < 8 * FPS; i++) tickTrip(tickClock(1 / FPS));
    const s = cosmicSampleAt(trip, trip.tau);
    const now = cosmicNow();
    expect(Math.abs(now.lnA - s.lnA)).toBeLessThan(1e-9);
    expect(rel(now.ageGyr - age0, trip.t / YEAR_S / 1e9)).toBeLessThan(1e-9);
    expect(rel((sim.timeMs - trip.startMs) / 1000, trip.t)).toBeLessThan(1e-12);
    // The chronometers follow the trip's own clocks.
    expect(rel(chrono.t, trip.t)).toBeLessThan(1e-12);
    expect(rel(chronoTau(), trip.tau)).toBeLessThan(1e-12);
    // Readings: the ship sees home astern with its own Doppler factor on top of the expansion.
    const r = cosmicReadings(trip)!;
    expect(r.homeZExpansion).toBeGreaterThan(0);
    expect(r.homeZExpansion).toBeLessThan(0.004);
    expect(r.fromHome).toBe(true);
    // Home is all but dead astern (the ship set out 1 au from the Sun): its light is Doppler shifted by e^φ.
    expect(rel(1 + r.homeZ, (1 + r.homeZExpansion) * Math.exp(sim.ship.phi || Math.asinh(s.u)))).toBeLessThan(1e-8);
    expect(rel(r.properLeftKm, r.a * r.comovingLeftKm)).toBeLessThan(1e-15);

    const { frames, path, taus } = fly(20 * FPS);
    expect(frames).toBeGreaterThan(0);
    expect(travel.trip).toBeNull();
    // No jump through the flip: there the ship is fastest and each frame's step is within a few per cent
    // of the last. On the way in the steps shrink steadily to nothing: it arrives at rest, on the aim.
    const flipFrame = taus.findIndex((t) => t / YEAR_S >= flipYr);
    expect(flipFrame).toBeGreaterThan(5);
    const step = (i: number) => path[i].distanceTo(path[i - 1]);
    // (γ changes by e^(aΔτ/c) a frame, 3% here: a jump would be far more.)
    for (let i = flipFrame - 5; i <= flipFrame + 5; i++) expect(Math.abs(Math.log(step(i) / step(i - 1)))).toBeLessThan(0.045);
    for (let i = path.length - 30; i < path.length; i++) expect(step(i)).toBeLessThan(step(i - 1));
    expect(plan.phases[0].endTauYr).toBe(flipYr);
    // On arrival: the clock at the trip's cosmic time, the universe as the plan says, and Virgo's centre the standoff ahead.
    expect(sim.timeMs).toBe(trip.startMs + 1000 * trip.earthTime);
    const end = cosmicNow();
    expect(rel(end.ageGyr, plan.arrival.timeGyr)).toBeLessThan(1e-9);
    expect(rel(end.a, plan.arrival.scale)).toBeLessThan(1e-9);
    updateEphemeris();
    const toVirgo = sim.bodies['virgo-cluster'].pos.distanceTo(travel.shipPos);
    // The standoff is a proper distance on arrival: the cluster's closest approach (it has no surface to stop short of).
    expect(flightStandoff('virgo-cluster', 1e21)).toBe(minDistance('virgo-cluster'));
    expect(rel(toVirgo, minDistance('virgo-cluster'))).toBeLessThan(1e-6);
    expect(rel(chrono.t, trip.earthTime)).toBeLessThan(1e-12);
    expect(rel(chronoTau(), trip.shipTime)).toBeLessThan(1e-12);
    // The arrival card has the universe and the home clock.
    const a = travel.lastArrival!;
    expect(a.model).toBe('flrw');
    expect(a.cosmic).toBe(trip.cosmic);
    expect(a.homeOnArrival!.fromHome).toBe(true);
    expect(a.homeOnArrival!.z).toBe(plan.home.redshift);
    const words = arrivalCosmicText({
      shipTime: a.shipTime,
      cosmicYears: plan.cosmicTimeYr,
      ageGyr: plan.arrival.timeGyr,
      growth: plan.arrival.scale / plan.departure.scale,
      home: a.homeOnArrival!,
      departure: { z: plan.home.redshift, afterDepartureYr: plan.home.emissionAfterDepartureYr },
    });
    expect(words).toMatch(/^You are 35 years older; at home 53\.\d million years have passed\. The universe is now 13\.8\d billion years old and 0\.\d+% larger than when you left\./);
    expect(words).toMatch(/The light from home reaching you left it only \d(\.\d)? years after you did/);
  });

  it('takes the ship’s velocity relative to the galaxies it passes for the view', () => {
    const trip = depart('virgo-cluster');
    setShipRate(trip.shipTime / 20);
    for (let i = 0; i < 10 * FPS; i++) tickTrip(tickClock(1 / FPS));
    updateShipKinematics();
    const s = cosmicSampleAt(trip, trip.tau);
    expect(rel(sim.ship.phi, Math.asinh(s.u))).toBeLessThan(1e-12);
    expect(sim.ship.vel.clone().normalize().dot(trip.dir)).toBeCloseTo(1, 12);
  });

  it('flies to a galaxy at z = 1 in 46 years aboard while 18.9 billion years pass at home', () => {
    testGalaxy('test-z1', 3395.58 + 0.1);
    try {
      setSimTime(msFromCivil(2000, 1, 1, 12));
      updateEphemeris();
      const trip = depart('test-z1', new Vector3());
      expect(trip.model).toBe('flrw');
      expect(trip.shipTime / YEAR_S).toBeCloseTo(46.04, 1);
      expect(trip.earthTime / YEAR_S / 1e9).toBeCloseTo(18.93, 1);
      jumpToArrival();
      expect(fly(2).frames).toBe(1);
      expect(cosmicNow().ageGyr).toBeCloseTo(13.787 + 18.93, 1);
      expect(cosmicNow().a).toBeCloseTo(3.157, 2);
      // Far from 1970 the clock still lands exactly on the trip's end.
      expect((sim.timeMs - trip.startMs) / JULIAN_YEAR_MS / 1e9).toBeCloseTo(trip.earthTime / YEAR_S / 1e9, 9);
      const rows = homeClockText(trip.cosmic!.home, trip.cosmic!.plan.arrival.timeGyr);
      expect(rows.find((r) => r.label === 'The Sun')!.text).toMatch(/^A white dwarf\./);
      expect(rows.find((r) => r.label === 'The universe')!.text).toMatch(/^32\.7\d billion years old/);
    } finally {
      travel.trip = null;
      unregisterBodies(['test-z1']);
      clearCosmicPlans();
    }
  });
});

describe('aiming at where the destination is on arrival', () => {
  /** Fly to Virgo, then from where the ship stops to `dest`: the ship's distance from it on arrival. */
  function outAndBack(dest: string): { miss: number; trip: Trip } {
    depart('virgo-cluster');
    jumpToArrival();
    expect(fly(2).frames).toBe(1);
    updateEphemeris();
    const trip = depart(dest, travel.shipPos.clone());
    expect(trip.model).toBe('flrw');
    jumpToArrival();
    expect(fly(2).frames).toBe(1);
    updateEphemeris();
    return { miss: sim.bodies[dest].pos.distanceTo(travel.shipPos), trip };
  }

  it('brings the ship home from the Virgo Cluster to Earth’s framing distance, however far Earth has moved on its orbit', () => {
    const { miss, trip } = outAndBack('earth');
    // 54 million years after leaving Virgo (108 million after leaving home): Earth where the ephemeris has it then.
    expect(trip.earthTime / YEAR_S / 1e6).toBeGreaterThan(53);
    expect(Math.abs(miss - framingDistance('earth'))).toBeLessThan(10);
    // Home is ahead on the way back: the arrival card says the Local Group does not expand.
    const home = travel.lastArrival!.homeOnArrival!;
    expect(home.fromHome).toBe(false);
    expect(home.inLocalGroup).toBe(true);
    expect(home.z).toBe(0);
    const words = arrivalCosmicText({
      shipTime: trip.shipTime,
      cosmicYears: trip.cosmic!.plan.cosmicTimeYr,
      ageGyr: trip.cosmic!.plan.arrival.timeGyr,
      growth: trip.cosmic!.plan.arrival.scale / trip.cosmic!.plan.departure.scale,
      home,
      departure: { z: trip.cosmic!.plan.home.redshift, afterDepartureYr: trip.cosmic!.plan.home.emissionAfterDepartureYr },
    });
    expect(words).toMatch(/You are back in the Local Group, where space does not expand: home’s light is not stretched\. The light reaching you from where you set out left it only [\d.]+ years after you did/);
  });

  it('stops at Sgr A*’s framing distance, and in Andromeda, a member of the Local Group, near its centre', () => {
    const sgr = outAndBack('sgr-a-star');
    expect(rel(sgr.miss, framingDistance('sgr-a-star'))).toBeLessThan(1e-3);
    const m31 = outAndBack('andromeda');
    expect(rel(m31.miss, minDistance('andromeda'))).toBeLessThan(1e-3);
  });

  it('sees home ahead on the way back, blueshifted by the ship’s speed', () => {
    depart('virgo-cluster');
    jumpToArrival();
    fly(2);
    updateEphemeris();
    const trip = depart('earth', travel.shipPos.clone());
    setShipRate(trip.shipTime / 20);
    for (let i = 0; i < 6 * FPS; i++) tickTrip(tickClock(1 / FPS));
    const r = cosmicReadings(trip)!;
    expect(r.fromHome).toBe(false);
    // The expansion still reddens home's light a little; the ship's speed, towards it, blueshifts it far more.
    expect(r.homeZExpansion).toBeGreaterThan(0);
    expect(r.homeZExpansion).toBeLessThan(0.004);
    expect(r.homeLn1pZ).toBeLessThan(-5);
    const phi = Math.asinh(cosmicSampleAt(trip, trip.tau).u);
    expect(Math.abs(r.homeLn1pZ - (Math.log1p(r.homeZExpansion) - phi))).toBeLessThan(1e-6);
    // Its light left home about 50 million years ago, before the ship set out on this leg.
    expect(r.homeSeenAfterDepartureYr).toBeLessThan(0);
  });
});

describe('the home clock on arrival', () => {
  const c = planck18();
  const text = (fromNowGyr: number) => homeClockText(homeAt(c, c.ageGyr() + fromNowGyr), c.ageGyr() + fromNowGyr);
  const row = (rows: ReturnType<typeof text>, label: string) => rows.find((r) => r.label === label)!.text;
  it('says what has become of the Sun, the Earth, Andromeda and the sky from home', () => {
    const soon = text(0.054);
    expect(row(soon, 'The Sun')).toMatch(/^A main-sequence star\./);
    expect(row(soon, 'The Earth')).toBe('The Earth is still habitable.');
    expect(row(soon, 'Milky Way and Andromeda')).toMatch(/still approaching/);
    expect(row(soon, 'The sky from home')).toMatch(
      /^Home can still see the M81 group \(z = 0\.00082\), the Centaurus A group \(z = 0\.00082\), the Virgo Cluster \(z = 0\.0037\) and the Coma Cluster \(z = 0\.022\), all still inside the cosmic event horizon\./,
    );
    expect(row(soon, 'The sky from home')).toMatch(/The Coma Cluster will be first to slip over it, in about 68 billion years\./);
    const giant = text(6.5);
    expect(row(giant, 'The Sun')).toMatch(/^A subgiant, then red giant\./);
    expect(row(giant, 'Milky Way and Andromeda')).toMatch(/^The chance that the Milky Way and Andromeda have merged by now is about \d+%/);
    const dwarf = text(8.2);
    expect(row(dwarf, 'The Sun')).toMatch(/^A white dwarf\./);
    expect(row(dwarf, 'The Earth')).toMatch(/^The Earth is gone/);
    const late = text(80);
    expect(row(late, 'Milky Way and Andromeda')).toMatch(/the study stops at 10 billion years/);
    expect(row(late, 'The sky from home')).toMatch(/The Coma Cluster \(z = \d+(\.\d+)?\) has crossed the event horizon: home still receives its old light/);
    expect(row(late, 'The universe')).toMatch(/billion years old; the cosmic microwave background has cooled to 0\.\d+ K\./);
  });
});
