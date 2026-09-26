/**
 * Light-time for registered systems: heads carried back along their velocity where that is good
 * to a kilometre, evaluated exactly where it is not, and the built-in bodies always exactly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AU_KM, C_KM_S, GM_SUN_KM3_S2 } from '../physics/constants';
import { msFromCivil } from '../lib/time';
import { bodyPositionAt, keplerProvider, registerBodies, unregisterBodies, type BodyRecord, type KeplerElements, type PositionProvider } from './bodies';
import { entryOf, evalEntries } from './bodies/registry';
import { updateEphemeris } from './ephemeris';
import { LINEAR_KM, updateApparentPositions } from './lightDelay';
import { setSimTime, sim } from './sim';

const CORE = new Set(evalEntries().map((e) => e.id));
const T = msFromCivil(2026, 9, 25);

afterEach(() => {
  unregisterBodies(evalEntries().map((e) => e.id).filter((id) => !CORE.has(id)));
  sim.camera.pos.set(0, 0, 0);
});

/** A provider that counts its calls. */
function counted(p: PositionProvider): PositionProvider & { calls: number } {
  const c = {
    ...p,
    calls: 0,
    positionAt(time: Parameters<PositionProvider['positionAt']>[0], pos: Parameters<PositionProvider['positionAt']>[1], vel?: Parameters<PositionProvider['positionAt']>[2]) {
      c.calls++;
      p.positionAt(time, pos, vel);
    },
  };
  return c;
}

const helio = (el: Partial<KeplerElements>): KeplerElements => ({ a: AU_KM, e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, m0Deg: 0, epochTt: 0, mu: GM_SUN_KM3_S2, ...el });

function small(id: string, provider: PositionProvider, extra: Partial<BodyRecord> = {}): BodyRecord {
  return { id, name: id, kind: 'asteroid', parent: 'sun', physical: { radiusKm: 50, colour: '#999999' }, provider, ...extra };
}

/** The exact retarded position of a body seen from the camera (iterated with the ephemeris). */
function exactRetarded(id: string): { pos: Vector3; tau: number } {
  const pos = sim.bodies[id].pos.clone();
  let tau = pos.distanceTo(sim.camera.pos) / C_KM_S;
  for (let i = 0; i < 8; i++) {
    bodyPositionAt(id, sim.astroTime.AddDays(-tau / 86_400), pos);
    tau = pos.distanceTo(sim.camera.pos) / C_KM_S;
  }
  return { pos, tau };
}

/** Place everything at T, then count the provider calls light-time makes from `camera`. */
function frame(camera: Vector3, ...providers: { calls: number }[]): number[] {
  setSimTime(T);
  updateEphemeris();
  const before = providers.map((p) => p.calls);
  sim.camera.pos.copy(camera);
  updateApparentPositions(true);
  return providers.map((p, i) => p.calls - before[i]);
}

const earthNow = () => {
  setSimTime(T);
  updateEphemeris();
  return sim.bodies.earth.pos.clone();
};

describe('light-time of a registered body', () => {
  it('carries a distant body back along its velocity: no ephemeris call, good to a kilometre', () => {
    const p = counted(keplerProvider(helio({ a: 44 * AU_KM, e: 0.1, iDeg: 17, nodeDeg: 80, periDeg: 110, m0Deg: 200 })));
    registerBodies([small('tno', p, { kind: 'dwarf-planet' })]);
    expect(frame(earthNow(), p)).toEqual([0]);
    const want = exactRetarded('tno');
    const b = sim.bodies.tno;
    expect(b.lightDelay).toBeCloseTo(want.tau, 4);
    expect(b.apparentPos.distanceTo(want.pos)).toBeLessThan(LINEAR_KM);
  });

  it('evaluates a body exactly where the straight line would be off (a comet by the Sun)', () => {
    // At perihelion 0.1 au, seen from Neptune's distance: ½·a·τ² is thousands of km.
    const p = counted(keplerProvider(helio({ a: 20 * AU_KM, e: 0.995, m0Deg: 0 })));
    registerBodies([small('sungrazer', p, { kind: 'comet' })]);
    const [calls] = frame(new Vector3(30 * AU_KM, 0, 0), p);
    expect(calls).toBeGreaterThan(0);
    const want = exactRetarded('sungrazer');
    expect(sim.bodies.sungrazer.apparentPos.distanceTo(want.pos)).toBeLessThan(0.05);
  });

  it('places the moons of a registered system at its head’s carried-back time', () => {
    const head = counted(keplerProvider(helio({ a: 39 * AU_KM, e: 0.05, m0Deg: 30 })));
    const moon = counted(keplerProvider({ a: 20_000, e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, m0Deg: 0, epochTt: 0, mu: 1000 }));
    registerBodies([small('orcus-like', head, { kind: 'dwarf-planet' }), small('its-moon', moon, { kind: 'moon', parent: 'orcus-like' })]);
    // The head: carried back; each moon: one evaluation at that time.
    expect(frame(earthNow(), head, moon)).toEqual([0, 1]);
    for (const id of ['orcus-like', 'its-moon']) {
      const want = exactRetarded(id);
      expect(sim.bodies[id].apparentPos.distanceTo(want.pos), id).toBeLessThan(LINEAR_KM);
    }
  });

  it('keeps the built-in bodies exact (their providers ask for it)', () => {
    expect(entryOf('jupiter')!.record.provider.exactLightTime).toBe(true);
    expect(entryOf('pluto-barycentre')!.record.provider.exactLightTime).toBe(true);
    expect(entryOf('voyager1')!.record.provider.exactLightTime).toBe(true);
    frame(earthNow());
    // Two ephemeris steps, as ever: converged to metres at 17 km/s.
    const want = exactRetarded('voyager1');
    expect(sim.bodies.voyager1.apparentPos.distanceTo(want.pos)).toBeLessThan(0.01);
  });
});
