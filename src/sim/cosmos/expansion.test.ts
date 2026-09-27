/**
 * The galaxies in the expanding universe: the bound/unbound rule (who recedes and who keeps their
 * place), the redshift of their light against the cosmology module's exact functions, where they are
 * seen with light-delayed positions on, the composition of the redshift with the ship's own Doppler
 * factor in the shaders' flux law, the background's temperature at other epochs and through a fast
 * ship's window, and the CMB map's pattern away from here and now.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { J2000_MS, JULIAN_YEAR_MS } from '../../lib/time';
import { C_KM_S, MPC_KM } from '../../physics/constants';
import { appearance, dopplerFromRapidity } from '../../physics/cosmology/appearance';
import { planck18 } from '../../physics/cosmology/cosmology';
import { CMB_DIPOLE_PHI, cmbForwardTemperature } from '../../physics/cmb';
import { loadLocalGalaxies, loadNamed, loadWeb } from '../../test/cosmos';
import { CMB_DIPOLE_DIR, relView, updateRelativisticView } from '../../render/relativisticView';
import { getBody } from '../bodies';
import { bodyAvailability } from '../bodies/world';
import { cosmicAt } from '../cosmicTime';
import { updateEphemeris } from '../ephemeris';
import { registerGalaxyCore } from '../galaxy/load';
import { setSimTime, sim } from '../sim';
import { cmbEpochNote, cmbPatternShare } from './cmb';
import { buildSkyTable } from './cosmosData';
import { DUPLICATE_DEG, duplicateRows, groupRuns, webBuffers, worldPositions } from './cosmicWeb';
import { cosmology } from './cosmology';
import {
  cosmicSky,
  EARLIEST_GALAXIES_GYR,
  galaxyLn1pz,
  homeLn1pz,
  horizonsAt,
  insideLocalGroup,
  lnFluxRelative,
  setSkyTable,
  updateCosmicSky,
} from './expansion';
import { registerCosmos, webBound, webRowsOfBodies } from './load';
import { bodyIdOf } from './records';
import { cosmicSightLine } from './sight';

const GYR_MS = 1e9 * JULIAN_YEAR_MS;
const local = loadLocalGalaxies();
const named = loadNamed();
const sky = buildSkyTable();

/** Set the clock `dtGyr` from the present, place every body and look from `camKm` (world km). */
function at(dtGyr: number, camKm: Vector3 = new Vector3(), retarded = false): void {
  setSimTime(J2000_MS + dtGyr * GYR_MS);
  updateEphemeris();
  sim.camera.pos.copy(camKm);
  for (const b of sim.bodyList) {
    b.apparentPos.copy(b.pos);
  }
  updateCosmicSky(retarded);
}

const pos = (id: string) => sim.bodies[id].pos.clone();
const mpc = (v: Vector3) => v.length() / MPC_KM;
/** A galaxy of the Local Volume Database's file just beyond the Local Group (it takes part in the expansion). */
const nearbyUnbound = () => local.galaxies.find((g) => g.subgroup === 'nearby' && getBody(bodyIdOf(g.id))?.provider.label?.includes('expansion'))!;

beforeAll(() => {
  registerGalaxyCore();
  registerCosmos(local, named);
  setSkyTable(sky);
});
afterAll(() => {
  sim.camera.pos.set(0, 0, 0);
  sim.ship.phi = 0;
  sim.ship.vel.set(0, 0, 0);
  setSimTime(Date.now());
});

describe('the bound/unbound rule', () => {
  it('carries the galaxies beyond the Local Group away with space, and keeps the bound ones where they are', () => {
    at(0);
    const virgo0 = pos('virgo-cluster');
    const m870 = pos('m87');
    const coma0 = pos('coma-cluster');
    const andromeda0 = pos('andromeda');
    const lmc0 = pos('lmc');
    const m320 = pos('lg-m-032');
    const near = bodyIdOf(nearbyUnbound().id);
    const near0 = pos(near);
    expect(cosmicAt(J2000_MS).a).toBe(1);

    at(10);
    const a = cosmicAt(J2000_MS + 10 * GYR_MS).a;
    expect(a).toBeGreaterThan(1.7);
    // Unbound: at a(t) times their comoving places, so every separation between them grows by a.
    for (const [id, p0] of [['virgo-cluster', virgo0], ['coma-cluster', coma0], [near, near0]] as const) {
      expect(pos(id).distanceTo(p0.clone().multiplyScalar(a)) / MPC_KM, id).toBeLessThan(1e-9);
    }
    expect(pos('virgo-cluster').distanceTo(pos('coma-cluster')) / virgo0.distanceTo(coma0)).toBeCloseTo(a, 12);
    // Bound: the Local Group does not expand (its galaxies are where they were), nor does Virgo.
    expect(pos('andromeda').distanceTo(andromeda0)).toBe(0);
    expect(pos('lmc').distanceTo(lmc0)).toBe(0);
    expect(pos('lg-m-032').distanceTo(m320)).toBe(0);
    expect(pos('m87').distanceTo(pos('virgo-cluster')) / m870.distanceTo(virgo0)).toBeCloseTo(1, 9);
    // The Local Group's members are all anchored at home; the rest at their own places or their cluster's.
    expect(cosmicSky.byId.get('andromeda')!.home).toBe(true);
    expect(cosmicSky.byId.get('lmc')!.home).toBe(true);
    expect(cosmicSky.byId.get('virgo-cluster')!.home).toBe(false);
    expect(cosmicSky.byId.get('m87')!.anchorKm.distanceTo(cosmicSky.byId.get('virgo-cluster')!.anchorKm)).toBe(0);
  });

  it('says how good each place is at each date, and shows no galaxy carried by the expansion before the earliest seen', () => {
    const early = J2000_MS - (cosmicAt(J2000_MS).ageGyr - 0.1) * GYR_MS;
    expect(cosmicAt(early).ageGyr).toBeLessThan(EARLIEST_GALAXIES_GYR);
    expect(bodyAvailability('virgo-cluster', J2000_MS).regime).toBe('approximate');
    expect(bodyAvailability('virgo-cluster', J2000_MS + 10 * GYR_MS).regime).toBe('illustrative');
    expect(bodyAvailability('virgo-cluster', early).available).toBe(false);
    expect(bodyAvailability('virgo-cluster', early).reason).toMatch(/earliest galaxies/);
    // The Local Group's galaxies are held where they are (illustrative far from the present).
    expect(bodyAvailability('andromeda', early).available).toBe(true);
    expect(getBody('virgo-cluster')!.positionNote).toMatch(/carried away/);
    expect(getBody('andromeda')!.positionNote).toMatch(/does not take part in the expansion/);
    expect(getBody('m87')!.positionNote).toMatch(/held fixed in its cluster/);
  });

  it('anchors the cosmic web’s groups, the named clusters’ members and the Local Group', () => {
    const cw = loadWeb();
    const bound = webBound(named, local);
    const w = webBuffers(cw, cosmology(), new Set(webRowsOfBodies(named, local)), bound);
    expect(w.anchor.length).toBe(3 * w.count);
    const anchorOf = (n: number) => new Vector3(w.anchor[3 * n], w.anchor[3 * n + 1], w.anchor[3 * n + 2]);
    const placeOf = (n: number) => new Vector3(w.position[3 * n], w.position[3 * n + 1], w.position[3 * n + 2]);
    const pointOfRow = new Map<number, number>();
    for (let n = 0; n < w.count; n++) pointOfRow.set(w.row[n], n);
    // Virgo's members share Virgo's own anchor (the body's comoving place).
    const virgo = named.objects.find((o) => o.id === 'virgo-cluster')!;
    const va = cosmicSky.byId.get('virgo-cluster')!.anchorKm.clone().divideScalar(MPC_KM);
    const m = virgo.cosmicWeb!.members!;
    let members = 0;
    for (let r = m.first; r < m.first + m.count; r++) {
      const n = pointOfRow.get(r);
      if (n === undefined) continue;
      expect(anchorOf(n).distanceTo(va)).toBeLessThan(1e-4);
      members++;
    }
    expect(members).toBeGreaterThan(100);
    // A group of two or more shares one anchor; a galaxy alone is its own; inside the Local Group, home.
    let groups = 0;
    let singles = 0;
    for (const run of groupRuns(cw)) {
      const ns = [...Array(run.count).keys()].map((k) => pointOfRow.get(run.first + k)).filter((n): n is number => n !== undefined);
      if (!ns.length) continue;
      const a0 = anchorOf(ns[0]);
      if (a0.lengthSq() === 0) continue;
      if (ns.length > 1) {
        groups++;
        for (const n of ns) expect(anchorOf(n).distanceTo(a0)).toBe(0);
      } else if (run.count === 1) {
        singles++;
        expect(anchorOf(ns[0]).distanceTo(placeOf(ns[0]))).toBe(0);
      }
    }
    expect(groups).toBeGreaterThan(1000);
    expect(singles).toBeGreaterThan(1000);
    const lg = bound.localGroup;
    for (let n = 0; n < w.count; n++) {
      const p = placeOf(n);
      if (Math.hypot(p.x - lg.centre[0], p.y - lg.centre[1], p.z - lg.centre[2]) < 0.5 * lg.radius) expect(anchorOf(n).length(), `point ${n}`).toBe(0);
    }
    // At scale factor a a point is at place + (a − 1) anchor: a group keeps its size, groups move apart.
    const a = 1.8;
    const at = (n: number) => placeOf(n).addScaledVector(anchorOf(n), a - 1);
    const [n1, n2] = [pointOfRow.get(m.first)!, pointOfRow.get(m.first + 1)!];
    expect(at(n1).distanceTo(at(n2))).toBeCloseTo(placeOf(n1).distanceTo(placeOf(n2)), 4);
  });

  it('leaves out the rows of galaxies already drawn as bodies, found on the sky when the file does not link them', () => {
    const cw = loadWeb();
    const bound = webBound(named, local);
    expect(bound.bodies!.length).toBeGreaterThan(100);
    const dups = duplicateRows(cw, worldPositions(cw, cosmology()), bound.bodies!);
    // 67 of the 165 Local Volume galaxies the file does not link are in Cosmicflows-4 too: each is drawn once, as a body.
    expect(dups.size).toBe(67);
    const linked = new Set(webRowsOfBodies(named, local));
    const w = webBuffers(cw, cosmology(), linked, bound);
    const without = webBuffers(cw, cosmology(), linked, { ...bound, bodies: [] });
    expect(without.count - w.count).toBe([...dups].filter((r) => !linked.has(r) && without.row.includes(r)).length);
    for (const r of dups) expect(w.row.includes(r)).toBe(false);
    // Each duplicate is one galaxy: within 0.05° of a body on the sky.
    const D = Math.PI / 180;
    for (const r of dups) {
      const near = bound.bodies!.some((b) => {
        const c = Math.sin(cw.dec[r] * D) * Math.sin(b.dec * D) + Math.cos(cw.dec[r] * D) * Math.cos(b.dec * D) * Math.cos((cw.ra[r] - b.ra) * D);
        return c >= Math.cos(DUPLICATE_DEG * D);
      });
      expect(near, `row ${r}`).toBe(true);
    }
  });
});

describe('the galaxies’ light', () => {
  it('finds the observer’s horizons from the emission table to 10⁻⁷, at any epoch', () => {
    const c = planck18();
    const out = { etaMpc: 0, chiEHMpc: 0, lnATable: 0 };
    for (const a of [0.3, 1, 1.8, 10, 1e3, 1e6]) {
      horizonsAt(sky, Math.log(a), out);
      expect(Math.abs(out.etaMpc / c.particleHorizonMpc(a) - 1), `a = ${a}`).toBeLessThan(1e-7);
      expect(Math.abs(out.chiEHMpc / c.eventHorizonMpc(a) - 1), `a = ${a}`).toBeLessThan(1e-5);
      expect(out.lnATable).toBeCloseTo(Math.log(a), 12);
    }
  });

  it('redshifts each galaxy by the expansion between its anchor and the camera’s, as the module’s exact functions do', () => {
    const c = planck18();
    for (const dt of [0, 10, 40]) {
      at(dt);
      const a = cosmicSky.a;
      for (const id of ['virgo-cluster', 'm87', 'coma-cluster', 'm81', 'gn-z11', bodyIdOf(nearbyUnbound().id)]) {
        const m = cosmicSky.byId.get(id)!;
        const exact = Math.log1p(appearance(c, a, m.chiMpc).z);
        expect(Math.abs(galaxyLn1pz(id) - exact), `${id} at +${dt} Gyr`).toBeLessThan(2e-7);
      }
      // The Local Group seen from home: no redshift (one bound structure).
      expect(galaxyLn1pz('andromeda')).toBe(0);
      expect(galaxyLn1pz('lg-m-032')).toBe(0);
    }
    // Virgo recedes: its light is more redshifted 10 billion years from now.
    at(0);
    const z0 = galaxyLn1pz('virgo-cluster');
    at(10);
    expect(galaxyLn1pz('virgo-cluster')).toBeGreaterThan(1.4 * z0);
  });

  it('sees the Local Group redshifted from far away, as far away is seen from home', () => {
    at(0);
    const virgo = pos('virgo-cluster');
    const fromHome = galaxyLn1pz('virgo-cluster');
    at(0, virgo);
    expect(cosmicSky.inLocalGroup).toBe(false);
    expect(Math.abs(galaxyLn1pz('andromeda') - fromHome)).toBeLessThan(1e-9);
    expect(Math.abs(homeLn1pz() - fromHome)).toBeLessThan(1e-9);
    // From Virgo's centre its own member galaxy is not redshifted by the expansion.
    expect(galaxyLn1pz('m87')).toBe(0);
    expect(insideLocalGroup(new Vector3())).toBe(true);
  });

  it('draws a galaxy where its light left it with light-delayed positions on: at the angular-diameter distance', () => {
    const c = planck18();
    for (const dt of [0, 10]) {
      at(dt, new Vector3(), true);
      for (const id of ['virgo-cluster', 'coma-cluster', 'gn-z11']) {
        const b = sim.bodies[id];
        const m = cosmicSky.byId.get(id)!;
        const app = appearance(c, cosmicSky.a, m.chiMpc);
        expect(mpc(b.apparentPos) / app.angularDiameterDistanceMpc - 1, id).toBeCloseTo(0, 6);
        expect(mpc(b.pos) / app.properDistanceNowMpc - 1, id).toBeCloseTo(0, 9);
        expect(b.apparentPos.clone().normalize().dot(b.pos.clone().normalize())).toBeCloseTo(1, 12);
      }
    }
  });

  it('composes the redshift with the ship’s own Doppler factor as the module does: frequency D/(1 + z), flux D² L / 4π D_L²', () => {
    const c = planck18();
    for (const [a, chi] of [
      [1, 16.5],
      [1, 3000],
      [1.8, 400],
      [10, 50],
    ]) {
      for (const [w, cos] of [
        [0, 1],
        [0.5, 0.3],
        [3, -0.9],
        [22, 1],
        [22, -1],
      ]) {
        const app = appearance(c, a, chi, w, cos);
        const L = Math.log1p(app.z);
        const lnD = Math.log(dopplerFromRapidity(w, cos));
        expect(lnD - L).toBeCloseTo(Math.log(app.frequencyRatio), 9);
        // Bolometric black-body radiance goes as T⁴: the shaders' law with it is the physical flux.
        const dLnY = 4 * (lnD - L);
        const now = a * chi * MPC_KM * 1e3; // metres
        const then = now / (1 + app.z);
        for (const [drawn, d] of [
          [false, now],
          [true, then],
        ] as const) {
          const flux = Math.exp(lnFluxRelative(dLnY, lnD, L, drawn)) / (4 * Math.PI * d * d);
          expect(Math.log(flux / app.fluxPerLuminosity), `a ${a} χ ${chi} w ${w} cos ${cos} drawn where it was ${drawn}`).toBeCloseTo(0, 8);
        }
      }
    }
  });

  it('writes the light’s age and stretch on the card', () => {
    at(0);
    expect(cosmicSightLine('andromeda')).toBeNull();
    expect(cosmicSightLine('virgo-cluster')).toMatch(/^Seen as it was 5\d\.\d million years ago, when the universe was 13\.7 billion years old: .*stretched its light by 0\.37% \(redshift 0\.0037\)\.$/);
    expect(cosmicSightLine('gn-z11')).toMatch(/Seen as it was 13\.4 billion years ago, when the universe was 4\d\d million years old: .*stretched its light 11\.\d\d times \(redshift 10\.\d\d\)/);
    // Four figures from redshift 10, as the facts give them: MoM-z14 at 14.44.
    expect(cosmicSightLine('mom-z14')).toMatch(/\(redshift 14\.4\d\)/);
    expect(cosmicSightLine('virgo-cluster', 2)).toMatch(/Doppler factor 2(\.00)?\).*1\.99 times the frequency/);
    at(10);
    expect(cosmicSightLine('virgo-cluster')).toMatch(/when the universe was 23\.\d billion years old/);
  });
});

describe('the cosmic microwave background at other epochs', () => {
  const moveAt = (phi: number, dir = new Vector3(1, 0, 0)) => {
    sim.ship.phi = phi;
    sim.ship.vel.copy(dir).multiplyScalar(Math.tanh(phi) * C_KM_S);
    sim.viewport.width = 1600;
    sim.viewport.height = 1000;
    sim.camera.fovDeg = 50;
    updateRelativisticView('on', 0.5, true, false);
  };

  it('cools as T0 / a, and ahead of a fast ship is that times the Doppler factor', () => {
    at(0);
    moveAt(0);
    expect(relView.cmb.temperature).toBeCloseTo(2.72548, 5);
    at(10);
    moveAt(0);
    const a = cosmicAt(J2000_MS + 10 * GYR_MS).a;
    expect(relView.cmb.temperature).toBeCloseTo(2.72548 / a, 12);
    expect(relView.cmb.temperature).toBeLessThan(1.6);
    // Far from home (outside the Local Group) at γ = 10⁹: the ship's rapidity is its motion through the CMB.
    at(10, new Vector3(20 * MPC_KM, 0, 0));
    const phi = Math.acosh(1e9);
    moveAt(phi);
    expect(relView.cmb.motion.phi).toBeCloseTo(phi, 9);
    expect(cmbForwardTemperature(relView.cmb.motion.phi, relView.cmb.temperature) / ((2.72548 / a) * Math.exp(phi))).toBeCloseTo(1, 9);
    expect(relView.cmb.visible).toBe(true);
    // At home the Sun's own motion through it (370 km/s) is part of the ship's: along it, the rapidities add.
    at(0);
    moveAt(phi, new Vector3(CMB_DIPOLE_DIR.x, CMB_DIPOLE_DIR.y, CMB_DIPOLE_DIR.z));
    expect(relView.cmb.motion.phi - phi).toBeCloseTo(CMB_DIPOLE_PHI, 9);
    moveAt(0);
  });

  it('fades the map’s pattern away from the Solar System’s place and time, and gives the temperature then', () => {
    at(0);
    expect(cmbPatternShare()).toBe(1);
    expect(cmbEpochNote()).toBeUndefined();
    at(0, new Vector3(20 * MPC_KM, 0, 0));
    expect(cmbPatternShare()).toBe(1);
    // Far from home at the present (the cmb-map scene, 3 Mpc out): the universe has not grown.
    expect(cmbEpochNote()).toMatch(/here and now: 2\.73 K \(the same as at the present, 2\.72548 K\)\. The pattern is the one seen/);
    expect(cmbEpochNote()).not.toMatch(/grown|hotter/);
    at(0, new Vector3(400 * MPC_KM, 0, 0));
    expect(cmbPatternShare()).toBe(0);
    at(10);
    expect(cmbPatternShare()).toBe(0);
    expect(cmbEpochNote()).toMatch(/mean temperature here and now: 1\.\d\d K .* grown 1\.\d{4} times since\)\. .*not known/);
  });
});
