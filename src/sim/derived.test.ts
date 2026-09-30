import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { AU_KM, BODIES, BODY_ORDER, C_KM_S, LIGHT_YEAR_KM, PARSEC_KM, SUN_RADIUS_KM } from '../physics/constants';
import { rapidityFromSpeed } from '../physics/relativity';
import { edgeAngle, lnGStatic } from '../physics/schwarzschild';
import { buildForwardTable, buildInverseTable } from '../physics/schwarzschildTables';
import { lens } from '../render/lens/lensState';
import { registerUniverse } from '../test/universe';
import { getBody, type BodyId } from './bodies';
import { screenOf, solarSystemHidden, updateDerived } from './derived';
import { updateEphemeris } from './ephemeris';
import { gravity } from './gravity';
import { boostCircle } from './lensBodies';
import { updateApparentPositions } from './lightDelay';
import { setSimTime, sim } from './sim';

/** Camera on the +z axis at `dist` km from the Sun, looking back at it (three.js looks down −z). */
function viewFrom(dist: number, sizeMode: 'true' | 'visible' = 'true') {
  setSimTime(Date.UTC(2026, 8, 25));
  updateEphemeris();
  sim.viewport.width = 1600;
  sim.viewport.height = 1000;
  sim.camera.fovDeg = 50;
  sim.camera.quat.identity();
  sim.camera.pos.set(0, 0, dist);
  sim.sizeMode = sizeMode;
  updateApparentPositions(false);
  const camera = new PerspectiveCamera(50, 1.6, 0.001, 1e25);
  camera.updateProjectionMatrix();
  updateDerived(camera, 'sun', null);
}

afterEach(() => {
  sim.camera.pos.set(0, 0, 0);
  sim.sizeMode = 'true';
  sim.solarSystemPx = Infinity;
});

describe('the Solar System seen from afar', () => {
  it('is a full-size scene from inside it', () => {
    viewFrom(1e9);
    expect(sim.solarSystemPx).toBe(Infinity);
    expect(solarSystemHidden()).toBe(false);
  });

  it('shrinks below a pixel about 1.6 light-years out, and loses its labels (except the focus)', () => {
    viewFrom(1 * LIGHT_YEAR_KM);
    expect(solarSystemHidden()).toBe(false);
    viewFrom(3 * LIGHT_YEAR_KM);
    expect(solarSystemHidden()).toBe(true);
    expect(sim.bodies.sun.screen.onScreen).toBe(true);
    for (const id of ['earth', 'jupiter', 'neptune'] as const) expect(sim.bodies[id].screen.onScreen).toBe(false);
  });

  it('does not inflate bodies to visible discs once they have merged into one point', () => {
    viewFrom(10 * LIGHT_YEAR_KM, 'visible');
    for (const id of BODY_ORDER) {
      const b = BODIES[id];
      expect(sim.bodies[id].displayRadius).toBe(b.equatorialRadiusKm ?? b.radiusKm);
      expect(sim.bodies[id].radiusPx).toBeLessThan(0.35); // so no mesh is drawn
    }
  });

  it('keeps every derived number finite at the camera’s farthest (10²⁴ km)', () => {
    viewFrom(1e24);
    expect(sim.solarSystemPx).toBeGreaterThan(0);
    for (const id of BODY_ORDER) {
      const b = sim.bodies[id];
      for (const v of [b.distCamera, b.radiusPx, b.magnitude, b.screen.x, b.screen.y]) expect(Number.isFinite(v)).toBe(true);
    }
    // The Sun from 100 billion light-years: far too faint to see.
    expect(sim.bodies.sun.magnitude).toBeGreaterThan(50);
  });
});

/*
 * Near a black hole (sim/lensBodies.ts): the active hole's distances come from the exact
 * hole-relative camera, its screen point is its shadow's centre and radiusPx its shadow's radius, its magnitude
 * its flow's point; a body the lens bends sits at its primary image with that image's magnitude and frequency
 * factor, and screenOf puts any other point on its primary image (the same tables, tier 1). Gravity and the lens
 * are set up as sim/gravity.ts and render/lens/lensState.ts set them.
 */
describe('near a black hole', () => {
  const W = 1600;
  const H = 1000;
  const camera = new PerspectiveCamera(50, W / H, 1e-3, 1e25);

  function look(dir: Vector3): void {
    const m = new Matrix4().lookAt(new Vector3(), dir, Math.abs(dir.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
    sim.camera.quat.setFromRotationMatrix(m);
  }

  function rsOf(id: BodyId): number {
    const r = getBody(id)!;
    return r.blackHole?.rsKm ?? r.physical.radiusKm;
  }

  /** Hovering at camRelKm from the hole (riding with it), as sim/gravity.ts has it. */
  function hover(id: BodyId, camRelKm: Vector3): void {
    const b = sim.bodies[id];
    const rs = rsOf(id);
    const r = camRelKm.length();
    const mKm = rs / 2;
    Object.assign(gravity, { hole: id, gmKm3S2: (rs * C_KM_S * C_KM_S) / 2, mKm, mTimeS: mKm / C_KM_S, rsKm: rs, rKm: r, heightKm: r - rs });
    gravity.camRelHoleKm.copy(camRelKm);
    gravity.rM = r / mKm;
    gravity.x = rs / r;
    gravity.alpha = Math.sqrt((r - rs) / r);
    gravity.frame = 'static';
    gravity.inside = false;
    gravity.lnGStatic = lnGStatic(gravity.rM);
    const u = b.vel.length();
    gravity.framePhi = u > 0 ? rapidityFromSpeed(u) : 0;
    if (u > 0) gravity.frameVelDir.copy(b.vel).divideScalar(u);
    gravity.relPhi = 0;
    gravity.fallView = null;
    sim.camera.pos.copy(b.pos).add(camRelKm);
    sim.ship.vel.copy(b.vel);
    sim.ship.phi = gravity.framePhi;
  }

  function lensOn(): void {
    const obs = { frame: 'static' as const, r: gravity.rM };
    Object.assign(lens, { active: true, hole: gravity.hole, obs, mKm: gravity.mKm, edge: edgeAngle(obs), pointZoneSrc: Math.PI, diffuseZone: Math.PI, ringBandPx: 0 });
    lens.holeM.copy(gravity.camRelHoleKm).divideScalar(-gravity.mKm);
    lens.axis.copy(lens.holeM).normalize();
    lens.fwd = buildForwardTable(obs);
    lens.inv = buildInverseTable(lens.fwd);
    lens.thetaE = lens.inv.thetaE;
  }

  function frame(): void {
    sim.viewport.width = W;
    sim.viewport.height = H;
    sim.camera.fovDeg = 50;
    sim.sizeMode = 'true';
    camera.updateProjectionMatrix();
    updateApparentPositions(false);
    updateDerived(camera, undefined, null);
  }

  beforeAll(() => {
    registerUniverse();
    setSimTime(Date.UTC(2026, 8, 25));
    updateEphemeris();
  });

  afterEach(() => {
    Object.assign(lens, { active: false, hole: null, fwd: null, inv: null });
    Object.assign(gravity, { hole: null, x: 0, rKm: Infinity, rM: Infinity, heightKm: Infinity, alpha: 1, framePhi: 0, lnGStatic: 0, fallView: null });
    gravity.camRelHoleKm.set(0, 0, 0);
    sim.ship.vel.set(0, 0, 0);
    sim.ship.phi = 0;
    sim.camera.quat.identity();
  });

  it('gives the active hole its distance from the exact hole-relative camera: 100 km above Gaia BH1’s horizon', () => {
    const rs = rsOf('gaia-bh1');
    const rel = new Vector3(0.3, -0.5, 0.8).normalize().multiplyScalar(rs + 100);
    hover('gaia-bh1', rel);
    look(rel.clone().negate());
    frame();
    const b = sim.bodies['gaia-bh1'];
    // (camera − hole in heliocentric float64 is 2 km coarse 480 pc out: 2 % of this height)
    expect(b.distCamera).toBe(gravity.rKm);
    expect(b.distTrue).toBe(gravity.rKm);
    expect(b.distCamera - rs).toBeCloseTo(100, 9);
    // its screen point is its shadow's centre and radiusPx its shadow's radius (× px per radian), as the classical
    // view shows it: an observer at rest in the Sun's frame, for whom the hole's own motion moves and resizes the
    // circle about the hole (boostCircle, checked against the fixtures in lensBodies.test.ts)
    const pxPerRad = H / 2 / Math.tan((25 * Math.PI) / 180);
    const c = new Vector3();
    const rho = boostCircle(rel.clone().negate().normalize(), edgeAngle({ frame: 'static', r: gravity.rM }), gravity.frameVelDir, Math.exp(gravity.framePhi), c);
    expect(gravity.framePhi).toBeGreaterThan(1e-5); // (Gaia BH1 moves)
    const v = c.applyQuaternion(sim.camera.quat.clone().invert());
    expect(b.screen.x).toBeCloseTo(W / 2 + (pxPerRad * v.x) / -v.z, 6);
    expect(b.screen.y).toBeCloseTo(H / 2 - (pxPerRad * v.y) / -v.z, 6);
    expect(b.screen.onScreen).toBe(true);
    expect(b.radiusPx).toBeCloseTo(rho * pxPerRad, 6);
    // a stellar hole has no flow: no point of light
    expect(b.magnitude).toBe(99);
  });

  it('puts a body the lens bends at its primary image, and screenOf any point on its order-0 image', () => {
    // the Sun from 10,000 au beyond Sgr A*, 5 of its radii (seen from the hole) off the line: two images
    const hole = sim.bodies['sgr-a-star'].pos;
    const out = hole.clone().sub(sim.bodies.sun.pos).normalize();
    const rho = SUN_RADIUS_KM / hole.distanceTo(sim.bodies.sun.pos);
    const p = new Vector3(0, 1, 0).cross(out).normalize();
    const dir = out.clone().multiplyScalar(Math.cos(5 * rho)).addScaledVector(p, Math.sin(5 * rho));
    hover('sgr-a-star', dir.multiplyScalar(10_000 * AU_KM));
    look(out.clone().negate());
    lensOn();
    frame();
    const sun = sim.bodies.sun;
    const L = sun.lens!;
    expect(L).not.toBeNull();
    expect(L.count).toBe(2);
    expect(L.ring).toBeNull();
    expect(sun.screen.x).toBe(L.images[0].screen.x);
    expect(sun.screen.y).toBe(L.images[0].screen.y);
    expect(sun.magnitude).toBe(L.images[0].magnitude);
    expect(sun.dopplerFactor).toBe(Math.exp(L.images[0].lnD));
    // brightened well beyond its flat magnitude from here (the finite disc caps it)
    const flat = 4.83 + 5 * Math.log10(sun.distCamera / PARSEC_KM / 10);
    expect(sun.magnitude).toBeLessThan(flat - 5);
    // the same place for a label placed through screenOf (the same tier-1 solve, converged to its 10⁻⁷ of α's step)
    const s = screenOf(sun.apparentPos.clone().sub(sim.camera.pos), camera, { x: 0, y: 0, onScreen: false, inFront: false });
    expect(Math.abs(s.x - sun.screen.x)).toBeLessThan(1e-4);
    expect(Math.abs(s.y - sun.screen.y)).toBeLessThan(1e-4);
    // a unit vector is a direction (the constellation names pass them): lensed as light from infinitely far
    // away, which for the Sun 8 kpc away is where its own light lands (its parallax here is 10⁻⁸ rad)
    const unit = screenOf(sun.apparentPos.clone().sub(sim.camera.pos).normalize(), camera, { x: 0, y: 0, onScreen: false, inFront: false });
    expect(Math.abs(unit.x - sun.screen.x)).toBeLessThan(1e-3);
    expect(Math.abs(unit.y - sun.screen.y)).toBeLessThan(1e-3);
    // and without the lens, the straight line (the images are a few px from it)
    const straight = sun.screen.x;
    Object.assign(lens, { active: false });
    frame();
    expect(sun.lens).toBeNull();
    expect(Math.abs(sun.screen.x - straight) + Math.abs(sun.screen.y - L.images[0].screen.y)).toBeGreaterThan(1);
  });
});
