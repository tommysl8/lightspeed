/**
 * Performance smoke test and benchmark of the update loop: 500 moons on top of the planets.
 *
 * 1. Speed, with the real built-in bodies: placing everything, then the whole per-frame pass
 *    (apparent positions with and without light-time, sizes, screen positions).
 * 2. Allocation, with a stand-in Solar System (a Sun and eight planets on Kepler orbits):
 *    the built-in bodies call astronomy-engine, which returns fresh objects, and that noise
 *    would hide what the registry itself does. Allocation is measured on V8's young generation:
 *    after a full collection, the bytes filled over a few frames (the least of several tries,
 *    discarding any a collection interrupted). The registry's pass must allocate nothing per
 *    body; light-time allocates only per system.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { AU_KM, GM_SUN_KM3_S2, SUN_TEFF_K, SUN_VMAG_AT_1AU } from '../../physics/constants';
import { astroTimeAt } from '../../lib/time';
import { updateDerived } from '../derived';
import { updateApparentPositions } from '../lightDelay';
import { setSimTime, sim } from '../sim';
import { coreBodyRecords, fixedOffsetProvider, keplerProvider, registerBodies, unregisterBodies, updateWorld, type BodyRecord } from '.';
import { bodyEntries, lightTimeGroups } from './registry';

// Node's own modules, reached without its type definitions (the app is typed for the browser).
interface V8 {
  setFlagsFromString(flags: string): void;
  getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[];
}
const node = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
const v8 = node.getBuiltinModule('node:v8') as V8;
const vm = node.getBuiltinModule('node:vm') as { runInNewContext(code: string): unknown };
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const N = 500;

function dummyMoons(): BodyRecord[] {
  return Array.from({ length: N }, (_, i) => {
    const a = 2e5 + 7919 * i;
    return {
      id: `dummy-moon-${i}`,
      name: `Dummy ${i}`,
      kind: 'moon',
      parent: PLANETS[i % PLANETS.length],
      physical: { radiusKm: 10 + (i % 50), colour: '#888888', semiMajorAxisKm: a },
      provider: keplerProvider({ a, e: 0.01 * (i % 7), iDeg: i % 30, nodeDeg: (37 * i) % 360, periDeg: (91 * i) % 360, m0Deg: (13 * i) % 360, epochTt: 0, mu: 1e5 }),
    };
  });
}

/** A Sun and eight planets that allocate nothing (Kepler orbits), standing in for the real ones. */
function standInSystem(): BodyRecord[] {
  const sun: BodyRecord = {
    id: 'sun',
    name: 'Sun',
    kind: 'star',
    parent: null,
    physical: { radiusKm: 695_700, gmKm3S2: GM_SUN_KM3_S2, colour: '#ffd9a0', luminous: { vmag: SUN_VMAG_AT_1AU, atKm: AU_KM, teffK: SUN_TEFF_K } },
    provider: fixedOffsetProvider(0, 0, 0),
  };
  const planets = PLANETS.map(
    (id, i): BodyRecord => ({
      id,
      name: id,
      kind: 'planet',
      parent: 'sun',
      physical: { radiusKm: 30_000, colour: '#aaaaaa' },
      provider: keplerProvider({ a: (0.4 + 1.5 * i) * AU_KM, e: 0.05, iDeg: 1 + i, nodeDeg: 40 * i, periDeg: 70 * i, m0Deg: 33 * i, epochTt: 0, mu: GM_SUN_KM3_S2 }),
    }),
  );
  return [sun, ...planets];
}

const START = Date.UTC(2026, 8, 25);
const FRAMES = 600;
/** Frame times, made up front so creating them is not counted. */
const times = Array.from({ length: FRAMES }, (_, i) => astroTimeAt(START + i * 16.7));

const camera = new PerspectiveCamera(50, 1.6, 0.001, 1e25);
camera.updateProjectionMatrix();

type Stage = 'world' | 'all' | 'retarded';

function step(i: number, stage: Stage): void {
  const t = times[i % FRAMES];
  sim.astroTime = t;
  updateWorld(t);
  if (stage !== 'world') {
    updateApparentPositions(stage === 'retarded');
    updateDerived(camera, 'earth', null);
  }
}

function setup(): void {
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.pos.set(1e8, 2e7, 5e7);
}

/**
 * Milliseconds per frame: after a warm-up (so the optimising compiler has settled), the best of
 * several runs, since other work on the machine (the rest of the test suite) only adds time.
 */
function msPerFrame(stage: Stage): number {
  setup();
  for (let i = 0; i < 200; i++) step(i, stage);
  let best = Infinity;
  const frames = 100;
  for (let run = 0; run < FRAMES / frames; run++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) step(run * frames + i, stage);
    best = Math.min(best, (performance.now() - t0) / frames);
  }
  return best;
}

const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** Young-generation bytes allocated per frame: the least of several uninterrupted tries. */
function bytesPerFrame(stage: Stage, frames = 20): number {
  setup();
  for (let i = 0; i < 200; i++) step(i, stage);
  let best = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    gc();
    const before = newSpace();
    for (let i = 0; i < frames; i++) step(attempt * frames + i, stage);
    const grown = newSpace() - before;
    if (grown >= 0) best = Math.min(best, grown / frames);
  }
  return best;
}

/** The measuring itself costs a little (the heap statistics are objects too). */
const overhead = (() => {
  let best = Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    gc();
    const before = newSpace();
    const grown = newSpace() - before;
    if (grown >= 0) best = Math.min(best, grown);
  }
  return best;
})();

describe('500 moons', () => {
  afterAll(() => {
    unregisterBodies(bodyEntries().map((e) => e.id));
    registerBodies(coreBodyRecords());
    setSimTime(START);
  });

  it('cost well under a millisecond a frame with the real planets', { timeout: 60_000 }, () => {
    setSimTime(START);
    const baseMs = msPerFrame('world');
    registerBodies(dummyMoons());
    expect(bodyEntries().length).toBe(13 + N);
    const worldMs = msPerFrame('world');
    const allMs = msPerFrame('all');
    const retardedMs = msPerFrame('retarded');
    expect(worldMs).toBeLessThan(5);
    expect(allMs).toBeLessThan(8);
    expect(retardedMs).toBeLessThan(12);
    // The benchmark, for the record (vitest shows it with --silent=false).
    console.info(
      `[registry] ${bodyEntries().length} bodies: placing ${worldMs.toFixed(3)} ms/frame (built-in alone ${baseMs.toFixed(3)}), ` +
        `whole pass ${allMs.toFixed(3)} ms, with light-time ${retardedMs.toFixed(3)} ms`,
    );
  });

  it('allocate nothing per body in the per-frame pass; light-time only per system', { timeout: 60_000 }, () => {
    unregisterBodies(bodyEntries().map((e) => e.id));
    registerBodies(standInSystem());
    setSimTime(START);
    const baseWorld = bytesPerFrame('world') - overhead / 20;
    const baseRetarded = bytesPerFrame('retarded') - overhead / 20;
    registerBodies(dummyMoons());
    expect(bodyEntries().length).toBe(9 + N);
    const world = bytesPerFrame('world') - overhead / 20;
    const all = bytesPerFrame('all') - overhead / 20;
    const retarded = bytesPerFrame('retarded') - overhead / 20;
    const systems = lightTimeGroups().length;
    // Nothing per body: a single 3-vector per moon would be 20 kB a frame here.
    expect(world).toBeLessThan(200);
    expect((world - baseWorld) / N).toBeLessThan(0.5);
    expect(all).toBeLessThan(200);
    // Two times per system (and a little besides), however many moons each has.
    expect((retarded - baseRetarded) / N).toBeLessThan(0.5);
    expect(retarded / systems).toBeLessThan(2000);
    console.info(`[registry] young-generation bytes per frame: placing ${world.toFixed(0)}, whole pass ${all.toFixed(0)}, with light-time ${retarded.toFixed(0)} (${systems} systems)`);
  });
});
