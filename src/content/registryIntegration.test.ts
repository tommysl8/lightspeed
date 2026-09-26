/**
 * Every part of the app that lists, finds, frames or measures bodies works from the registry: a
 * body registered later (here Titan and its sibling, and a Pluto moon) turns up in search, in
 * the Bodies list under its planet, in the location trail, as a scene target, as a flight
 * destination, with a framing distance and a light-pulse detector, and goes again when removed.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { framingDistance, minDistance, systemFramingDistance } from '../controls/framing';
import { msFromCivil } from '../lib/time';
import { PLUTO_BARYCENTRE, bodyIds, keplerProvider, registerBodies, unregisterBodies, type BodyRecord } from '../sim/bodies';
import { updateEphemeris } from '../sim/ephemeris';
import { clearPulses, emitPulse, onDetection, updatePulses, type Detection } from '../sim/pulses';
import { setSimTime, sim } from '../sim/sim';
import { planTrip } from '../sim/travel';
import { locationPath } from '../ui/location';
import { bodyForKey } from '../ui/navigation';
import { articleForBody } from './bodyArticles';
import { allDestinations, findDestination, nestedDestinations, searchDestinations } from './destinations';
import { LATER, resolveTarget, sceneStatus } from './scenes';

const T0 = msFromCivil(2026, 9, 25, 12);
const SATURN_GM = 37_931_000;

function moon(id: string, name: string, parent: string, aKm: number, radiusKm: number, extra: Partial<BodyRecord> = {}): BodyRecord {
  return {
    id,
    name,
    kind: 'moon',
    parent,
    aliases: id === 'titan' ? ['Saturn VI'] : [],
    physical: { radiusKm, colour: '#caa66a', semiMajorAxisKm: aKm, geometricAlbedo: 0.2 },
    provider: keplerProvider({ a: aKm, e: 0.03, iDeg: 0.3, nodeDeg: 10, periDeg: 20, m0Deg: 30, epochTt: 0, mu: SATURN_GM }),
    ...extra,
  };
}

const EXTRA = ['titan', 'rhea', 'charon'];

beforeAll(() => {
  setSimTime(T0);
  updateEphemeris();
});

afterEach(() => unregisterBodies(EXTRA));

function registerSaturnian() {
  registerBodies([moon('titan', 'Titan', 'saturn', 1_221_870, 2574.7), moon('rhea', 'Rhea', 'saturn', 527_068, 763.5)]);
  updateEphemeris();
}

describe('a body registered later', () => {
  it('is a destination: found by name and alias, listed under its planet', () => {
    registerSaturnian();
    expect(searchDestinations('titan')[0]?.destination.id).toBe('titan');
    expect(searchDestinations('saturn vi')[0]?.destination.id).toBe('titan');
    const d = findDestination('titan')!;
    expect(d.kind).toBe('Moon of Saturn');
    expect(d.parent).toBe('saturn');
    expect(d.body).toBe('titan');
    expect(Number.isFinite(d.distanceKm())).toBe(true);
    expect(d.unavailable()).toBeNull();
    const planets = nestedDestinations().find((g) => g.id === 'sun-planets')!.items;
    const at = planets.findIndex((i) => i.destination.id === 'saturn');
    expect(planets[at].children).toBe(2);
    expect(planets.slice(at, at + 3).map((i) => [i.destination.id, i.depth])).toEqual([
      ['saturn', 0],
      ['titan', 1],
      ['rhea', 1],
    ]);
    // The Moon sits under Earth the same way.
    expect(planets.find((i) => i.destination.id === 'moon')?.depth).toBe(1);
    // Nothing is listed twice, and the moons group is empty now.
    expect(nestedDestinations().find((g) => g.id === 'moons')).toBeUndefined();
  });

  it('has a location trail, a scene target, an article, a framing distance and a flight', () => {
    registerSaturnian();
    expect(locationPath('orbit', 'titan').map((c) => c.label)).toEqual(['Solar System', 'Saturn', 'Titan']);
    expect(resolveTarget('titan')).toEqual({ kind: 'body', id: 'titan', name: 'Titan' });
    expect(sceneStatus('go:titan').ok).toBe(true);
    expect(sceneStatus('fly:titan?beta=0.5').ok).toBe(true);
    expect(articleForBody('titan')).toBe('worlds-around-worlds');
    expect(framingDistance('titan')).toBe(4 * 2574.7);
    expect(minDistance('titan')).toBeCloseTo(1.015 * 2574.7, 9);
    // Saturn's system: out to Titan's orbit.
    expect(systemFramingDistance('saturn')).toBeCloseTo(3 * 1_221_870, 0);
    expect(systemFramingDistance('mars')).toBe(framingDistance('mars'));
    const plan = planTrip('titan', 0.5, sim.bodies.earth.pos.clone(), sim.astroTime, 'cruise')!;
    expect(plan.dest).toBe('titan');
    expect(plan.distance).toBeGreaterThan(1e9);
  });

  it('carries a detector for the light-pulse experiment', () => {
    registerSaturnian();
    clearPulses();
    const hits = new Map<string, Detection>();
    const off = onDetection((_, d) => hits.set(d.body, d));
    const p = emitPulse('saturn');
    expect(p.pending.has('titan')).toBe(true);
    expect(p.pending.has(PLUTO_BARYCENTRE)).toBe(false);
    expect(p.pending.has('proxima')).toBe(true);
    for (let s = 1; s <= 12; s++) {
      setSimTime(T0 + s * 1000);
      updateEphemeris();
      updatePulses();
    }
    off();
    clearPulses();
    const titan = hits.get('titan');
    expect(titan).toBeDefined();
    // Titan is 1.2 million km from Saturn: about 4 s of light.
    expect(titan!.dt).toBeGreaterThan(3.9);
    expect(titan!.dt).toBeLessThan(4.3);
    setSimTime(T0);
    updateEphemeris();
  });

  it('can sit on a barycentre and still be listed under the body people say it orbits', () => {
    registerBodies([moon('charon', 'Charon', 'pluto', 17_536, 606, { centre: PLUTO_BARYCENTRE })]);
    updateEphemeris();
    expect(locationPath('orbit', 'charon').map((c) => c.label)).toEqual(['Solar System', 'Pluto', 'Charon']);
    const dwarfs = nestedDestinations().find((g) => g.id === 'dwarf-planets')!.items;
    expect(dwarfs.map((i) => [i.destination.id, i.depth])).toEqual([
      ['pluto', 0],
      ['charon', 1],
    ]);
    expect(findDestination(PLUTO_BARYCENTRE)).toBeUndefined();
  });

  it('goes again when unregistered, and a scene naming it waits for a later update', () => {
    registerSaturnian();
    unregisterBodies(['titan']);
    expect(findDestination('titan')).toBeUndefined();
    expect(resolveTarget('titan')).toBeNull();
    expect(sceneStatus('go:titan').reason).toBe(LATER);
    expect(allDestinations().map((d) => d.id)).not.toContain('titan');
  });
});

describe('navigation keys', () => {
  it('are the same as ever: 0–9, M and V', () => {
    const keys = Object.fromEntries([...'0123456789MV'].map((k) => [k, bodyForKey(k)]));
    expect(keys).toEqual({
      0: 'sun',
      1: 'mercury',
      2: 'venus',
      3: 'earth',
      4: 'mars',
      5: 'jupiter',
      6: 'saturn',
      7: 'uranus',
      8: 'neptune',
      9: 'pluto',
      M: 'moon',
      V: 'voyager1',
    });
    expect(bodyForKey('m')).toBe('moon');
    expect(bodyForKey('q')).toBeUndefined();
    expect(bodyIds()).toHaveLength(13);
  });
});
