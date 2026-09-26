import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GM_SUN_KM3_S2 } from '../physics/constants';
import { stateToOrbit } from '../physics/kepler';
import { msFromCivil } from '../lib/time';
import { PLUTO_BARYCENTRE, fixedStarProvider, keplerProvider, registerBodies, unregisterBodies, type BodyRecord } from '../sim/bodies';
import { entryOf, evalEntries } from '../sim/bodies/registry';
import { updateEphemeris } from '../sim/ephemeris';
import { setSimTime, sim } from '../sim/sim';
import { conicFromState, makeConic, orbitMu, orbitSource, segmentsFor, systemGm, viewDistance, visVivaA, type OrbitSource } from './orbitLines';

const CORE = new Set(evalEntries().map((e) => e.id));
const src = (): OrbitSource => ({ rel: null as never, centre: null, view: null });

beforeAll(() => {
  setSimTime(msFromCivil(2026, 9, 25));
  updateEphemeris();
});
afterEach(() => {
  unregisterBodies(evalEntries().map((e) => e.id).filter((id) => !CORE.has(id)));
  updateEphemeris();
});

/** The line's conic for a body, as Orbits.tsx works it out. */
function lineOf(id: string) {
  const e = entryOf(id)!;
  const s = orbitSource(e, src());
  const mu = orbitMu(e, s);
  return { mu, s, orbit: stateToOrbit(s.rel.rel.pos.clone(), s.rel.rel.vel.clone(), mu) };
}

describe('orbit lines about a barycentre', () => {
  // Charon as docs/bodies.md registers it: parent Pluto, placed on the Pluto–Charon barycentre,
  // on a circular orbit about it (radius a·M_P/M, Pluto's GM 870, Charon's 106.1).
  const GMP = 870;
  const GMC = 106.1;
  const A = 19_596;
  const rC = (A * GMP) / (GMP + GMC);
  const charon = (): BodyRecord => ({
    id: 'charon',
    name: 'Charon',
    kind: 'moon',
    parent: 'pluto',
    centre: PLUTO_BARYCENTRE,
    physical: { radiusKm: 606, colour: '#999999', gmKm3S2: GMC, semiMajorAxisKm: A },
    // The pull on Charon about the barycentre: GM_P³ / GM² at its distance rC.
    provider: keplerProvider({ a: rC, e: 0, iDeg: 0, nodeDeg: 0, periDeg: 0, m0Deg: 0, epochTt: 0, mu: GMP ** 3 / (GMP + GMC) ** 2 }),
  });

  it('draws Charon on a circle about the barycentre, not a hyperbola', () => {
    registerBodies([charon()]);
    updateEphemeris();
    const { mu, s, orbit } = lineOf('charon');
    expect(s.rel.id).toBe('charon');
    expect(s.centre?.id).toBe(PLUTO_BARYCENTRE);
    expect(s.view?.id).toBe('pluto');
    expect(mu).toBeCloseTo(GMP ** 3 / (GMP + GMC) ** 2, 6); // ≈ 691, not 106
    expect(orbit.hyperbolic).toBe(false);
    expect(orbit.e).toBeLessThan(1e-6);
    expect(orbit.a).toBeCloseTo(rC, 3);
  });

  it("counts every body placed on the barycentre (the system's mass), or the barycentre's own GM", () => {
    registerBodies([charon()]);
    const bary = entryOf(PLUTO_BARYCENTRE)!;
    expect(bary.placed.map((e) => e.id).sort()).toEqual(['charon', 'pluto']);
    expect(systemGm(bary)).toBeCloseTo(GMP + GMC, 9);
    // A tiny moon of the system (Nix) sees nearly the whole system's mass.
    registerBodies([{ ...charon(), id: 'nix', name: 'Nix', physical: { radiusKm: 20, colour: '#999999', gmKm3S2: 0.003 } }]);
    expect(orbitMu(entryOf('nix')!, orbitSource(entryOf('nix')!, src()))).toBeCloseTo(GMP + GMC, 1);
  });

  it("keeps Pluto's line on its system's path about the Sun", () => {
    const { mu, s } = lineOf('pluto');
    expect(s.rel.id).toBe(PLUTO_BARYCENTRE);
    expect(s.centre?.id).toBe('sun');
    expect(mu).toBe(GM_SUN_KM3_S2 + 870);
  });
});

describe('orbit lines about a star of unknown mass', () => {
  const star: BodyRecord = {
    id: 'test-star',
    name: 'Test Star',
    kind: 'star',
    parent: null,
    physical: { radiusKm: 100_000, colour: '#ffcc99', luminous: { vmag: 11, atKm: 4e13, teffK: 3000 } },
    provider: fixedStarProvider(217, -62, 4e13),
  };
  const A = 7.5e6;
  const P_DAYS = 11.2;
  const muTrue = (4 * Math.PI ** 2 * A ** 3) / (P_DAYS * 86_400) ** 2;
  const planet = (physical: Partial<BodyRecord['physical']> = {}): BodyRecord => ({
    id: 'test-b',
    name: 'Test b',
    kind: 'exoplanet',
    parent: 'test-star',
    physical: { radiusKm: 7000, colour: '#aa8866', ...physical },
    provider: keplerProvider({ a: A, e: 0.1, iDeg: 30, nodeDeg: 10, periDeg: 40, m0Deg: 50, epochTt: 0, mu: muTrue }),
  });

  it("uses Kepler's third law from the record, never the Sun's GM", () => {
    registerBodies([star, planet({ semiMajorAxisKm: A, orbitalPeriodD: P_DAYS })]);
    updateEphemeris();
    const { mu, orbit } = lineOf('test-b');
    expect(mu / muTrue).toBeCloseTo(1, 9);
    expect(orbit.e).toBeCloseTo(0.1, 6);
  });

  it('without orbit data, draws a circle through the body', () => {
    registerBodies([star, planet()]);
    updateEphemeris();
    const e = entryOf('test-b')!;
    const { mu } = lineOf('test-b');
    expect(mu).toBeCloseTo(e.rel.vel.lengthSq() * e.rel.pos.length(), 0);
    expect(mu).toBeLessThan(10 * muTrue);
  });
});

describe('orbit line helpers', () => {
  it('computes the same conic as stateToOrbit, without allocating', () => {
    const cases: [Vector3, Vector3, number][] = [
      [new Vector3(1.5e8, 0, 2e6), new Vector3(0.3, 1, -29.5), GM_SUN_KM3_S2], // an ellipse
      [new Vector3(2.4e10, 1e9, -3e9), new Vector3(10, 3, 15), GM_SUN_KM3_S2], // a hyperbola
      [new Vector3(384_400, 0, 0), new Vector3(0, 0, -1.018), 403_503], // near-circular
    ];
    const out = makeConic();
    for (const [r, v, mu] of cases) {
      const want = stateToOrbit(r, v, mu);
      const got = conicFromState(r, v, mu, out);
      expect(got.a / want.a).toBeCloseTo(1, 12);
      expect(got.b / want.b).toBeCloseTo(1, 12);
      expect(got.e).toBeCloseTo(want.e, 12);
      expect(got.anomaly).toBeCloseTo(want.anomaly, 12);
      expect(got.meanAnomaly).toBeCloseTo(want.meanAnomaly, 12);
      expect(got.meanMotion / want.meanMotion).toBeCloseTo(1, 12);
      expect(got.hyperbolic).toBe(want.hyperbolic);
      expect(got.P.distanceTo(new Vector3(want.P.x, want.P.y, want.P.z))).toBeLessThan(1e-12);
      expect(got.Q.distanceTo(new Vector3(want.Q.x, want.Q.y, want.Q.z))).toBeLessThan(1e-12);
      expect(visVivaA(r, v, mu) / Math.abs(want.a)).toBeCloseTo(1, 9);
    }
  });

  it('measures a barycentre from its position (it has no camera distance of its own)', () => {
    const bary = entryOf(PLUTO_BARYCENTRE)!;
    const cam = new Vector3(1e9, 0, 0);
    expect(viewDistance(bary, cam, 0)).toBeCloseTo(bary.state.pos.distanceTo(cam), 0);
    expect(viewDistance(null, cam, 123)).toBe(123);
    const earth = entryOf('earth')!;
    expect(viewDistance(earth, cam, 0)).toBe(earth.state.distCamera);
    expect(sim.bodies[PLUTO_BARYCENTRE]).toBeUndefined();
  });

  it('draws small lines with fewer segments', () => {
    expect(segmentsFor(20)).toBe(128);
    expect(segmentsFor(200)).toBe(256);
    expect(segmentsFor(1000)).toBe(512);
    expect(segmentsFor(1e6)).toBe(1024);
  });
});
