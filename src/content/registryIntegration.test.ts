/**
 * Every part of the app that lists, finds, frames or measures bodies works from the registry: a
 * body registered later (here Titan and its sibling, and a Pluto moon) turns up in search, in
 * the Bodies list under its planet, in the location trail, as a scene target, as a flight
 * destination, with a framing distance and a light-pulse detector, and goes again when removed.
 * And so does a black hole, in each of its four placements (registered with the rest of the
 * universe, as the loaders do): on its own at the Galaxy's centre (Sgr A*), at another galaxy's
 * centre (M87*), in a binary (Gaia BH1) and alone (OGLE-2011-BLG-0462).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { framingDistance, minDistance, systemFramingDistance } from '../controls/framing';
import { msFromCivil } from '../lib/time';
import { PLUTO_BARYCENTRE, bodyIds, getBody, keplerProvider, registerBodies, unregisterBodies, type BodyRecord } from '../sim/bodies';
import { updateEphemeris } from '../sim/ephemeris';
import { clearPulses, emitPulse, onDetection, updatePulses, type Detection } from '../sim/pulses';
import { setSimTime, sim } from '../sim/sim';
import { planTrip } from '../sim/travel';
import { locationPath } from '../ui/location';
import { bodyForKey } from '../ui/navigation';
import { articleForBody, kindArticle } from './bodyArticles';
import { allDestinations, findDestination, nestedDestinations, searchDestinations } from './destinations';
import { LATER, resolveTarget, sceneStatus } from './scenes';
import { registerUniverse } from '../test/universe';
import { AU_KM } from '../physics/constants';
import { holeLabelled } from '../ui/Labels';
import { UNRESOLVED_PX, unresolvedPairs, type PairLabels } from '../ui/labelPairs';
import type { Entry } from '../sim/bodies/registry';

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
    expect(locationPath('orbit', 'titan').map((c) => c.label)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Saturn', 'Titan']);
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

  it('carries a light-pulse detector', () => {
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
    expect(locationPath('orbit', 'charon').map((c) => c.label)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Pluto', 'Charon']);
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

describe('a black hole, in each placement', () => {
  beforeAll(() => {
    registerUniverse();
    setSimTime(T0);
    updateEphemeris();
  });
  const top = (q: string) => searchDestinations(q)[0]?.destination.id;
  const trail = (id: string) => locationPath('orbit', id).map((c) => c.label);
  const rs = (id: string) => getBody(id)!.blackHole!.rsKm;

  it('lists them under The Milky Way after the Galaxy and Sgr A*, M87* under its galaxy', () => {
    const mw = nestedDestinations().find((g) => g.id === 'milky-way')!.items;
    expect(mw.filter((i) => i.depth === 0).map((i) => i.destination.id).slice(0, 2)).toEqual(['milky-way', 'sgr-a-star']);
    const at = mw.findIndex((i) => i.destination.id === 'gaia-bh1-system-barycentre');
    expect(mw[at]).toMatchObject({ depth: 0, children: 2, destination: { name: 'Gaia BH1 system', kind: 'Black hole and star', body: 'gaia-bh1-star' } });
    expect(mw.slice(at + 1, at + 3).map((i) => [i.destination.id, i.depth])).toEqual([
      ['gaia-bh1', 1],
      ['gaia-bh1-star', 1],
    ]);
    expect(mw.find((i) => i.destination.id === 'ogle-2011-blg-0462')?.depth).toBe(0);
    expect(mw.find((i) => i.destination.id === 'hde-226868')?.depth).toBe(1);
    expect(findDestination('m87-star')).toMatchObject({ parent: 'm87', group: 'galaxies' });
    // No star system's row claims a black hole's star as its own.
    expect(nestedDestinations().find((g) => g.id === 'stars')!.items.some((i) => i.destination.id === 'gaia-bh1-star')).toBe(false);
  });

  it('finds, trails, targets and frames each of them', () => {
    expect(top('Sagittarius A*')).toBe('sgr-a-star');
    expect(top('M87*')).toBe('m87-star');
    expect(top('Gaia BH1')).toBe('gaia-bh1');
    expect(top('OGLE-2011-BLG-0462')).toBe('ogle-2011-blg-0462');
    expect(trail('sgr-a-star')).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Sagittarius A*']);
    expect(trail('m87-star')).toEqual(['Observable universe', 'Local Universe', 'Virgo Cluster', 'Messier 87 (Virgo A)', 'M87*']);
    expect(trail('gaia-bh1').slice(0, 4)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way']);
    expect(trail('gaia-bh1').slice(-2)).toEqual(['Gaia BH1 system', 'Gaia BH1']);
    expect(trail('ogle-2011-blg-0462').at(-1)).toBe('OGLE-2011-BLG-0462');
    for (const id of ['sgr-a-star', 'm87-star', 'gaia-bh1', 'ogle-2011-blg-0462']) {
      expect(resolveTarget(id), id).toMatchObject({ kind: 'body', id });
      expect(sceneStatus(`go:${id}`).ok, id).toBe(true);
      expect(articleForBody(id), id).toBe(kindArticle('black-hole'));
      expect(minDistance(id), id).toBeGreaterThan(rs(id));
    }
    expect(framingDistance('gaia-bh1')).toBeCloseTo(1e4 * rs('gaia-bh1'), 6);
    expect(minDistance('gaia-bh1')).toBeCloseTo(rs('gaia-bh1') * (1 + 1e-6), 9);
    expect(framingDistance('m87-star')).toBeCloseTo(50 * rs('m87-star'), 3);
    expect(framingDistance('sgr-a-star')).toBe(4000 * AU_KM);
    expect(framingDistance('ogle-2011-blg-0462')).toBeCloseTo(1e4 * rs('ogle-2011-blg-0462'), 6);
  });

  it('is labelled when it matters: a binary’s hole with its star, a lone one within a parsec, M87* from inside M87', () => {
    const hidden = new Set<string>();
    const state = (id: string) => sim.bodies[id];
    const star = state('gaia-bh1-star');
    const keep = { magnitude: star.magnitude, present: star.present, onScreen: star.screen.onScreen };
    try {
      star.present = true;
      star.screen.onScreen = true;
      star.magnitude = 5;
      expect(holeLabelled(getBody('gaia-bh1')!, state('gaia-bh1'), hidden)).toBe(true);
      star.magnitude = 12;
      expect(holeLabelled(getBody('gaia-bh1')!, state('gaia-bh1'), hidden)).toBe(false);
      star.magnitude = 5;
      // Unresolved from here: the star carries the pair's label, the hole's name.
      hidden.add('gaia-bh1');
      expect(holeLabelled(getBody('gaia-bh1')!, state('gaia-bh1'), hidden)).toBe(false);
    } finally {
      Object.assign(star, { magnitude: keep.magnitude, present: keep.present });
      star.screen.onScreen = keep.onScreen;
    }
    expect(holeLabelled(getBody('ogle-2011-blg-0462')!, { distTrue: 0.5 * 3.0857e13 }, hidden)).toBe(true);
    expect(holeLabelled(getBody('ogle-2011-blg-0462')!, { distTrue: 2 * 3.0857e13 }, hidden)).toBe(false);
    expect(holeLabelled(getBody('sgr-a-star')!, { distTrue: 1e20 }, hidden)).toBe(true);
    const m87 = state('m87');
    const was = { d: m87.distCamera, r: m87.displayRadius };
    try {
      m87.displayRadius = getBody('m87')!.physical.radiusKm;
      m87.distCamera = 0.5 * m87.displayRadius;
      expect(holeLabelled(getBody('m87-star')!, state('m87-star'), hidden)).toBe(true);
      m87.distCamera = 2 * m87.displayRadius;
      expect(holeLabelled(getBody('m87-star')!, state('m87-star'), hidden)).toBe(false);
    } finally {
      m87.distCamera = was.d;
      m87.displayRadius = was.r;
    }
  });

  it('shares one label with its star while the pair is unresolved: the hole’s name', () => {
    const node = { id: 'p-barycentre', isNode: true, record: { name: 'Gaia BH1 system', kind: 'barycentre' }, parent: null, placed: [] as Entry[] } as unknown as Entry;
    const member = (id: string, kind: string, name: string, x: number, magnitude: number) => {
      const e = { id, isNode: false, record: { id, name, kind }, parent: node, placed: [], state: { present: true, magnitude, screen: { x, y: 100, onScreen: true } } } as unknown as Entry;
      node.placed.push(e);
      return e;
    };
    const h = member('gaia-bh1', 'black-hole', 'Gaia BH1', 100, 99);
    const st = member('gaia-bh1-star', 'star', 'Gaia BH1’s star', 102, 13);
    const out: PairLabels = { hide: new Set(), text: new Map() };
    unresolvedPairs([h, st], out);
    expect(out.text.get('gaia-bh1-star')).toBe('Gaia BH1');
    expect(out.hide.has('gaia-bh1')).toBe(true);
    (st.state.screen as { x: number }).x = 100 + UNRESOLVED_PX + 5;
    unresolvedPairs([h, st], out);
    expect(out.text.size).toBe(0);
    expect(out.hide.size).toBe(0);
  });

  it('can be flown to, and has no light-pulse detector', () => {
    const plan = planTrip('gaia-bh1', 0.5, sim.bodies.earth.pos.clone(), sim.astroTime, 'cruise')!;
    expect(plan.dest).toBe('gaia-bh1');
    expect(plan.distance / 3.0857e13).toBeGreaterThan(470);
    for (const id of ['sgr-a-star', 'm87-star', 'gaia-bh1', 'ogle-2011-blg-0462']) expect(getBody(id)!.detector, id).toBe(false);
  });
});
