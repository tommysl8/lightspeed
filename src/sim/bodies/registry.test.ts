import { afterEach, describe, expect, it } from 'vitest';
import { Body, HelioVector, JupiterMoons, MakeTime } from 'astronomy-engine';
import { Quaternion, Vector3 } from 'three';
import { AU_KM, OBLIQUITY_J2000_DEG } from '../../physics/constants';
import { astroTimeAt, msFromCivil } from '../../lib/time';
import { eclToWorld } from '../frames';
import { updateEphemeris } from '../ephemeris';
import { setSimTime, sim } from '../sim';
import {
  ALWAYS,
  PLUTO_BARYCENTRE,
  atCentreProvider,
  bodyAvailability,
  bodyIds,
  bodyName,
  bodyOrientation,
  bodyPositionAt,
  bodyRecord,
  bodyStateAt,
  childrenOf,
  fixedOffsetProvider,
  getBody,
  heliocentricEclAt,
  isBody,
  jupiterMoonProvider,
  keplerProvider,
  kindText,
  lineage,
  coreBodyRecords,
  registerBodies,
  registerBody,
  registryVersion,
  replaceBodies,
  relativeOrbitProvider,
  rootOf,
  subscribeRegistry,
  systemOf,
  trackProvider,
  twoBodyProvider,
  unregisterBodies,
  type BodyRecord,
  type PositionProvider,
  type TrackSample,
} from '.';
import { evalEntries, lightTimeGroups } from './registry';

const T = Date.UTC(2026, 8, 25);
/** The built-in bodies and barycentre: everything else a test registers is removed after it. */
const CORE = new Set(evalEntries().map((e) => e.id));

function body(id: string, parent: string | null, provider: PositionProvider, extra: Partial<BodyRecord> = {}): BodyRecord {
  return { id, name: id.replace(/^\w/, (c) => c.toUpperCase()), kind: 'moon', parent, physical: { radiusKm: 100, colour: '#999999' }, provider, ...extra };
}

afterEach(() => {
  unregisterBodies(evalEntries().map((e) => e.id).filter((id) => !CORE.has(id)));
});

const circular = (a: number, periodDays: number, phaseDeg = 0) =>
  keplerProvider({ a, e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, m0Deg: phaseDeg, epochTt: 0, mu: (4 * Math.PI ** 2 * a ** 3) / (periodDays * 86_400) ** 2 });

describe('registration', () => {
  it('holds the built-in bodies, parents first, with Pluto on its barycentre', () => {
    expect(bodyIds().slice(0, 5)).toEqual(['sun', 'mercury', 'venus', 'earth', 'moon']);
    expect(isBody('pluto')).toBe(true);
    expect(isBody(PLUTO_BARYCENTRE)).toBe(false); // a point, not a body
    expect(getBody(PLUTO_BARYCENTRE)?.kind).toBe('barycentre');
    expect(bodyRecord('pluto').centre).toBe(PLUTO_BARYCENTRE);
    expect(sim.bodies[PLUTO_BARYCENTRE]).toBeUndefined();
    expect(sim.bodyList.map((b) => b.id)).toEqual([...bodyIds()]);
  });

  it('orders by parent: a moon registered last sits right after its planet’s other moons', () => {
    registerBodies([body('io', 'jupiter', circular(421_700, 1.769)), body('europa', 'jupiter', circular(671_000, 3.551))]);
    registerBody(body('titan', 'saturn', circular(1_221_900, 15.945)));
    registerBody(body('ganymede', 'jupiter', circular(1_070_400, 7.155)));
    const ids = [...bodyIds()];
    expect(ids.slice(ids.indexOf('jupiter'), ids.indexOf('jupiter') + 6)).toEqual(['jupiter', 'io', 'europa', 'ganymede', 'saturn', 'titan']);
    expect(sim.bodyList.map((b) => b.id)).toEqual(ids);
    expect(childrenOf('jupiter').map((r) => r.id)).toEqual(['io', 'europa', 'ganymede']);
  });

  it('takes a batch in any order, and evaluates every centre and dependency first', () => {
    const craft = body('probe', 'sun', fixedOffsetProvider(1e8, 0, 0), { kind: 'spacecraft', dependsOn: ['moonlet'] });
    registerBodies([craft, body('moonlet', 'parentworld', circular(1e5, 3)), body('parentworld', 'sun', circular(3e8, 400), { kind: 'dwarf-planet' })]);
    const order = evalEntries().map((e) => e.id);
    expect(order.indexOf('parentworld')).toBeLessThan(order.indexOf('moonlet'));
    expect(order.indexOf('moonlet')).toBeLessThan(order.indexOf('probe'));
    expect(lineage('moonlet').map((r) => r.id)).toEqual(['sun', 'parentworld', 'moonlet']);
  });

  it('refuses duplicates, unknown references, bad ids and cycles, registering none of the batch', () => {
    const v = registryVersion();
    expect(() => registerBody(body('earth', 'sun', circular(1, 1)))).toThrow(/already registered/);
    expect(() => registerBody(body('nowhere-moon', 'atlantis', circular(1, 1)))).toThrow(/unknown parent/);
    expect(() => registerBody(body('Bad Id', 'sun', circular(1, 1)))).toThrow(/lower-case/);
    expect(() => registerBodies([body('a-a', 'b-b', circular(1, 1)), body('b-b', 'a-a', circular(1, 1))])).toThrow(/depends on itself/);
    expect(() => registerBodies([body('fine-one', 'sun', circular(1e8, 100)), body('broken', 'nowhere', circular(1, 1))])).toThrow();
    expect(isBody('fine-one')).toBe(false);
    expect(registryVersion()).toBe(v);
  });

  it('removes a body with everything placed on it, and tells listeners', () => {
    let heard = 0;
    const stop = subscribeRegistry(() => heard++);
    registerBodies([body('host', 'sun', circular(2e8, 300), { kind: 'dwarf-planet' }), body('host-moon', 'host', circular(5e4, 2))]);
    unregisterBodies(['host']);
    stop();
    expect(isBody('host')).toBe(false);
    expect(isBody('host-moon')).toBe(false);
    expect(sim.bodies['host-moon']).toBeUndefined();
    expect(heard).toBe(2);
  });
});

describe('the parent walk', () => {
  it('places a moon at its planet’s position plus its own offset, in float64', () => {
    registerBody(body('testmoon', 'saturn', fixedOffsetProvider(1e6, -2e5, 3e4)));
    setSimTime(T);
    updateEphemeris();
    const want = sim.bodies.saturn.pos.clone().add(eclToWorld(1e6, -2e5, 3e4));
    expect(sim.bodies.testmoon.pos.distanceTo(want)).toBeLessThan(1e-6);
    expect(sim.bodies.testmoon.vel.distanceTo(sim.bodies.saturn.vel)).toBeLessThan(1e-12);
    // The same at any other time, through the chain walk.
    const t = astroTimeAt(T + 3.6e6);
    const saturn = bodyPositionAt('saturn', t);
    expect(bodyPositionAt('testmoon', t).distanceTo(saturn.add(eclToWorld(1e6, -2e5, 3e4)))).toBeLessThan(1e-6);
  });

  it('names the system and the trail: Solar System, Saturn, Titan', () => {
    registerBody(body('titan', 'saturn', circular(1_221_900, 15.945)));
    expect(systemOf('titan')?.id).toBe('saturn');
    expect(systemOf('saturn')?.id).toBe('saturn');
    expect(systemOf('sun')?.id).toBe('sun');
    expect(rootOf('titan')?.id).toBe('sun');
    expect(rootOf('proxima')?.id).toBe('proxima');
    expect(kindText('titan')).toBe('Moon of Saturn');
    expect(bodyName('titan')).toBe('Titan');
  });

  it('gives a barycentric system: Pluto and Charon both about the barycentre, opposite each other', () => {
    // Charon's orbit about the barycentre, and Pluto's reflex (mass ratio 0.122): a model of the
    // kind the moons data provides.
    const ratio = 0.1218;
    const a = 19_596;
    const charon = keplerProvider({ a: a / (1 + ratio), e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, m0Deg: 0, epochTt: 0, mu: 975.5 / (1 + ratio) ** 3 });
    registerBody(body('charon', 'pluto', charon, { centre: PLUTO_BARYCENTRE }));
    setSimTime(T);
    updateEphemeris();
    const bary = bodyPositionAt(PLUTO_BARYCENTRE, sim.astroTime);
    // Pluto is still on the barycentre (its own offset model is not loaded yet)…
    expect(sim.bodies.pluto.pos.distanceTo(bary)).toBeLessThan(1e-6);
    // …and Charon orbits the barycentre, listed under Pluto.
    expect(sim.bodies.charon.pos.distanceTo(bary)).toBeCloseTo(a / (1 + ratio), 3);
    expect(childrenOf('pluto').map((r) => r.id)).toEqual(['charon']);
    expect(lineage('charon').map((r) => r.id)).toEqual(['sun', 'pluto', 'charon']);
    // The barycentre is the head of the Pluto system's light-time group.
    const g = lightTimeGroups().find((x) => x.head.id === PLUTO_BARYCENTRE)!;
    expect(g.members.map((m) => m.id)).toEqual([PLUTO_BARYCENTRE, 'pluto', 'charon']);
  });
});

describe('replacing a record', () => {
  afterEach(() => {
    replaceBodies(coreBodyRecords().filter((r) => r.id === 'pluto'));
  });

  it('gives Pluto its own orbit about the barycentre, in place, keeping its state and moons', () => {
    const before = [...bodyIds()];
    const state = sim.bodies.pluto;
    registerBody(body('charon', 'pluto', fixedOffsetProvider(17_470, 0, 0), { centre: PLUTO_BARYCENTRE }));
    const core = coreBodyRecords().find((r) => r.id === 'pluto')!;
    // Pluto 2,130 km from the barycentre, opposite Charon.
    replaceBodies([{ ...core, provider: fixedOffsetProvider(-2130, 0, 0) }]);
    expect([...bodyIds()].filter((id) => id !== 'charon')).toEqual(before);
    expect(sim.bodies.pluto).toBe(state);
    expect(isBody('charon')).toBe(true);
    setSimTime(T);
    updateEphemeris();
    const bary = bodyPositionAt(PLUTO_BARYCENTRE, sim.astroTime);
    expect(sim.bodies.pluto.pos.distanceTo(bary)).toBeCloseTo(2130, 6);
    expect(sim.bodies.pluto.pos.distanceTo(sim.bodies.charon.pos)).toBeCloseTo(17_470 + 2130, 6);
    expect(bodyRecord('pluto').key).toBe('9');
  });

  it('refuses unknown ids and body–barycentre swaps', () => {
    expect(() => replaceBodies([body('atlantis', 'sun', circular(1, 1))])).toThrow(/not registered/);
    const core = coreBodyRecords().find((r) => r.id === 'pluto')!;
    expect(() => replaceBodies([{ ...core, kind: 'barycentre' }])).toThrow(/cannot change/);
    expect(() => replaceBodies([{ ...core, centre: 'pluto' }])).toThrow(/itself/);
  });
});

describe('availability and regimes', () => {
  it('follows the date policy for the built-in bodies and Voyager 1’s window', () => {
    expect(bodyAvailability('earth', T)).toEqual({ available: true, reason: null, regime: 'precise' });
    expect(bodyAvailability('earth', msFromCivil(2500, 1, 1)).regime).toBe('approximate');
    expect(bodyAvailability('earth', msFromCivil(9000, 1, 1)).regime).toBe('illustrative');
    expect(bodyAvailability('voyager1', msFromCivil(1976, 1, 1)).available).toBe(false);
    expect(bodyAvailability('voyager1', msFromCivil(1976, 1, 1)).regime).toBe('unknown');
    expect(bodyAvailability('proxima', T).regime).toBe('approximate');
    expect(bodyAvailability('proxima', msFromCivil(-20_000, 1, 1)).regime).toBe('illustrative');
    expect(bodyAvailability('atlantis', T).available).toBe(false);
  });

  it('hides a body while its provider says it is absent, and keeps its state finite', () => {
    const launch = msFromCivil(2030, 1, 1);
    const late: PositionProvider = {
      availability: (ms) => (ms < launch ? { available: false, reason: 'Not launched yet', regime: 'unknown' } : ALWAYS.precise),
      positionAt: (_t, p, v) => {
        p.x = 2e8;
        p.y = p.z = 0;
        if (v) v.x = v.y = v.z = 0;
      },
    };
    registerBody(body('future-probe', 'sun', late, { kind: 'spacecraft' }));
    setSimTime(T);
    updateEphemeris();
    expect(sim.bodies['future-probe'].present).toBe(false);
    expect(sim.bodies['future-probe'].regime).toBe('unknown');
    setSimTime(launch + 1);
    updateEphemeris();
    expect(sim.bodies['future-probe'].present).toBe(true);
  });
});

describe('providers', () => {
  it('Kepler: a circular orbit keeps its radius and turns at its period', () => {
    const p = circular(1e5, 2);
    const a = { x: 0, y: 0, z: 0 };
    const v = { x: 0, y: 0, z: 0 };
    p.positionAt(MakeTime(0), a, v);
    expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(1e5, 6);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo((2 * Math.PI * 1e5) / (2 * 86_400), 9);
    const b = { x: 0, y: 0, z: 0 };
    p.positionAt(MakeTime(2), b); // TT differs from UT by ~a minute: a tiny step along the orbit
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e5 * 2 * Math.PI * (70 / 86_400 / 2) * 1.01);
  });

  it('two-body: a hyperbola from a state vector', () => {
    const mu = 1.327e11;
    const p = twoBodyProvider({ x: 1.5e8, y: 0, z: 0 }, { x: 0, y: 60, z: 0 }, 0, mu);
    const r = { x: 0, y: 0, z: 0 };
    p.positionAt({ tt: 365 } as never, r);
    expect(Math.hypot(r.x, r.y, r.z)).toBeGreaterThan(1.5e8);
  });

  it('a relative-orbit model (the fitted moons) plugs in, with its velocity or a numerical one', () => {
    const model = {
      position: (t: number, out: [number, number, number]) => {
        out[0] = 1000 * Math.cos(t);
        out[1] = 1000 * Math.sin(t);
        out[2] = 0;
        return out;
      },
      regime: (t: number) => (t < 10_000 ? ('precise' as const) : ('illustrative' as const)),
    };
    const p = relativeOrbitProvider(model);
    const pos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    p.positionAt({ tt: 0.5 } as never, pos, vel);
    expect(pos.x).toBeCloseTo(1000 * Math.cos(0.5), 9);
    // d/dt of 1000 (cos t, sin t) per day, in km/s
    expect(vel.x).toBeCloseTo((-1000 * Math.sin(0.5)) / 86_400, 7);
    expect(vel.y).toBeCloseTo((1000 * Math.cos(0.5)) / 86_400, 7);
    expect(p.availability(T).regime).toBe('precise');
    expect(p.availability(msFromCivil(2100, 1, 1)).regime).toBe('illustrative');
    // With a velocity in km/day (as the fitted models give it).
    const withV = relativeOrbitProvider({ ...model, velocity: (t, out) => ((out[0] = -1000 * Math.sin(t)), (out[1] = 1000 * Math.cos(t)), (out[2] = 0), out) }, { velocityUnit: 'km/day' });
    withV.positionAt({ tt: 0.5 } as never, pos, vel);
    expect(vel.y).toBeCloseTo((1000 * Math.cos(0.5)) / 86_400, 12);
  });

  it('a track switches centres per segment and blends between them', () => {
    setSimTime(T);
    updateEphemeris();
    const t0 = sim.astroTime.tt;
    // Relative to Jupiter before t0, to the Sun after, blended over [t0, t0 + 1].
    const sample: TrackSample = { pos: [0, 0, 0], centre: 'sun', regime: 'precise' };
    const source = {
      evaluate(t: number): TrackSample {
        const jup = heliocentricEclAt('jupiter', sim.astroTime.AddDays(t - t0), { x: 0, y: 0, z: 0 });
        if (t < t0) return { pos: [1e6, 0, 0], centre: 'jupiter', regime: 'precise' };
        const w = Math.min(1, t - t0);
        sample.pos = [jup.x + 1e6, jup.y, jup.z];
        sample.centre = 'sun';
        sample.blend = { pos: [1e6, 0, 0], centre: 'jupiter', weight: 1 - w };
        return sample;
      },
    };
    const p = trackProvider(source, { name: 'Probe', centres: { jupiter: 'jupiter' } });
    const jupiter = new Vector3();
    const out = { x: 0, y: 0, z: 0 };
    for (const dt of [-0.5, 0, 0.5, 2]) {
      const time = sim.astroTime.AddDays(dt);
      p.positionAt(time, out);
      heliocentricEclAt('jupiter', time, jupiter);
      // Always 10⁶ km from Jupiter along x, whichever centre the sample used (the test track
      // resolved Jupiter with a slightly different time, hence the metre-level tolerance).
      expect(Math.hypot(out.x - jupiter.x - 1e6, out.y - jupiter.y, out.z - jupiter.z), `dt ${dt}`).toBeLessThan(1);
    }
    expect(() => trackProvider({ evaluate: () => ({ pos: [0, 0, 0], centre: 'venus', regime: 'precise' }) }, { name: 'X', centres: {} }).positionAt(sim.astroTime, out)).toThrow(/no registry body/);
  });

  it('a track hides a craft before launch', () => {
    const p = trackProvider({ evaluate: (t) => ({ pos: [1, 0, 0], centre: 'earth', regime: t < 10_000 ? 'before-launch' : 'precise' }) }, { name: 'Probe', centres: { earth: 'earth' } });
    expect(p.availability(T)).toMatchObject({ available: false, reason: 'Probe had not been launched yet' });
    expect(p.availability(msFromCivil(2030, 1, 1)).available).toBe(true);
  });

  it('astronomy-engine’s Galilean moons, relative to Jupiter in the ecliptic frame', () => {
    const t = MakeTime(new Date(T));
    const io = { x: 0, y: 0, z: 0 };
    jupiterMoonProvider('io').positionAt(t, io);
    const r = Math.hypot(io.x, io.y, io.z);
    expect(r).toBeGreaterThan(415_000);
    expect(r).toBeLessThan(425_000);
    // Io orbits near Jupiter's equator (3° from the ecliptic): small ecliptic z.
    expect(Math.abs(io.z) / r).toBeLessThan(0.07);
    const eq = JupiterMoons(t).io;
    expect(Math.hypot(eq.x, eq.y, eq.z) * AU_KM).toBeCloseTo(r, 3);
  });

  it('a fixed star is at its catalogue distance; a body on its centre is at the centre', () => {
    setSimTime(T);
    updateEphemeris();
    expect(sim.bodies.proxima.pos.length()).toBeCloseTo(4.0175e13, -10);
    const p = atCentreProvider();
    const v = { x: 1, y: 1, z: 1 };
    p.positionAt(sim.astroTime, v, v);
    expect([v.x, v.y, v.z]).toEqual([0, 0, 0]);
  });
});

describe('rotation models', () => {
  it('synchronous: the prime meridian faces the parent, the pole is the orbit normal', () => {
    registerBody(body('lockmoon', 'jupiter', circular(500_000, 3, 40), { rotation: { model: 'synchronous' } }));
    setSimTime(T);
    updateEphemeris();
    const m = sim.bodies.lockmoon;
    const toParent = sim.bodies.jupiter.pos.clone().sub(m.pos).normalize();
    expect(new Vector3(1, 0, 0).applyQuaternion(m.quat).dot(toParent)).toBeCloseTo(1, 9);
    // A prograde orbit in the ecliptic: pole towards ecliptic north (world +Y).
    expect(new Vector3(0, 1, 0).applyQuaternion(m.quat).y).toBeCloseTo(1, 9);
    expect(bodyOrientation('lockmoon', sim.astroTime).angleTo(m.quat)).toBeLessThan(1e-6);
  });

  it('IAU: pole and prime meridian from polynomials, as astronomy-engine evaluates them', () => {
    // IAU 2015 Venus (astronomy-engine uses exactly this): α₀ = 272.76, δ₀ = 67.16, W = 160.20 − 1.4813688d.
    registerBody(
      body('iau-venus', 'sun', fixedOffsetProvider(0.72 * AU_KM, 0, 0), {
        kind: 'planet',
        rotation: { model: 'iau', poleRaDeg: [272.76], poleDecDeg: [67.16], pmDeg: [160.2, -1.4813688] },
      }),
    );
    // IAU 2015 Earth: α₀ = 0 − 0.641T, δ₀ = 90 − 0.557T (the pole; its W is far cruder than astronomy-engine's).
    registerBody(
      body('iau-earth', 'sun', fixedOffsetProvider(AU_KM, 0, 0), {
        kind: 'planet',
        rotation: { model: 'iau', poleRaDeg: [0, -0.641], poleDecDeg: [90, -0.557], pmDeg: [190.147, 360.9856235] },
      }),
    );
    for (const ms of [T, msFromCivil(1850, 3, 1), msFromCivil(2150, 7, 1)]) {
      setSimTime(ms);
      updateEphemeris();
      expect(sim.bodies['iau-venus'].quat.angleTo(sim.bodies.venus.quat)).toBeLessThan(1e-6);
    }
    setSimTime(T);
    updateEphemeris();
    const pole = new Vector3(0, 1, 0).applyQuaternion(sim.bodies['iau-earth'].quat);
    const eps = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
    expect((pole.angleTo(new Vector3(0, Math.cos(eps), -Math.sin(eps))) * 180) / Math.PI).toBeLessThan(0.3);
    const engine = new Vector3(0, 1, 0).applyQuaternion(sim.bodies.earth.quat);
    expect((pole.angleTo(engine) * 180) / Math.PI).toBeLessThan(0.01);
  });

  it('spin: one turn per period', () => {
    registerBody(body('spinner', 'sun', fixedOffsetProvider(3e8, 0, 0), { kind: 'dwarf-planet', rotation: { model: 'spin', periodH: 10 } }));
    const q0 = bodyOrientation('spinner', astroTimeAt(T));
    const q1 = bodyOrientation('spinner', astroTimeAt(T + 10 * 3.6e6));
    const qh = bodyOrientation('spinner', astroTimeAt(T + 5 * 3.6e6));
    expect(q0.angleTo(q1)).toBeLessThan(1e-6);
    expect((q0.angleTo(qh) * 180) / Math.PI).toBeCloseTo(180, 4);
  });
});

describe('light-time per system', () => {
  it('carries each moon to its own retarded position', async () => {
    const { updateApparentPositions } = await import('../lightDelay');
    registerBody(body('fastmoon', 'jupiter', circular(420_000, 1.77)));
    setSimTime(T);
    updateEphemeris();
    sim.camera.pos.copy(sim.bodies.earth.pos);
    updateApparentPositions(true);
    const m = sim.bodies.fastmoon;
    // The exact retarded position: solve τ = |r(t − τ) − camera| / c by iteration.
    let tau = m.pos.distanceTo(sim.camera.pos) / 299_792.458;
    const r = new Vector3();
    for (let i = 0; i < 6; i++) {
      bodyPositionAt('fastmoon', sim.astroTime.AddDays(-tau / 86_400), r);
      tau = r.distanceTo(sim.camera.pos) / 299_792.458;
    }
    expect(m.lightDelay).toBeCloseTo(tau, 6);
    expect(m.apparentPos.distanceTo(r)).toBeLessThan(0.05); // km, out of 600 million
    // Its planet is exactly as before: two ephemeris steps.
    const J = sim.bodies.jupiter;
    expect(J.apparentPos.distanceTo(bodyStateAt('jupiter', sim.astroTime.AddDays(-J.lightDelay / 86_400)).pos)).toBeLessThan(1e-3);
    sim.camera.pos.set(0, 0, 0);
  });
});

describe('heliocentric resolution for data adapters', () => {
  it('gives the ecliptic position of any body, reusing the frame’s', () => {
    setSimTime(T);
    updateEphemeris();
    const out = { x: 0, y: 0, z: 0 };
    heliocentricEclAt('mars', sim.astroTime, out);
    const h = HelioVector(Body.Mars, sim.astroTime);
    const eps = (OBLIQUITY_J2000_DEG * Math.PI) / 180;
    expect(out.x).toBeCloseTo(h.x * AU_KM, 0);
    expect(out.y).toBeCloseTo((Math.cos(eps) * h.y + Math.sin(eps) * h.z) * AU_KM, 0);
    expect(new Quaternion().angleTo(bodyOrientation('voyager1', sim.astroTime))).toBe(0);
  });
});
