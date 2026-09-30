import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { setSimTime, sim } from '../sim/sim';
import { AU_KM, C_KM_S } from '../physics/constants';
import { edgeAngle, lnGStatic, type LensFrame } from '../physics/schwarzschild';
import { buildForwardTable, buildInverseTable } from '../physics/schwarzschildTables';
import { lens } from '../render/lens/lensState';
import { getBody, type BodyId } from '../sim/bodies';
import { updateDerived } from '../sim/derived';
import { updateEphemeris } from '../sim/ephemeris';
import { gravity } from '../sim/gravity';
import { updateApparentPositions } from '../sim/lightDelay';
import { registerUniverse } from '../test/universe';
import { pickAt, pickBody, pickedImage } from './picking';
import '../sim/bodies';

/** Put bodies on screen: [id, x, y, radiusPx, magnitude, distCamera?]. Everything else is hidden. */
function scene(list: [string, number, number, number, number, number?][]) {
  for (const b of sim.bodyList) {
    b.present = true;
    b.screen.inFront = false;
    b.screen.onScreen = false;
  }
  for (const [id, x, y, r, mag, dist] of list) {
    const b = sim.bodies[id];
    b.screen.x = x;
    b.screen.y = y;
    b.screen.inFront = true;
    b.screen.onScreen = true;
    b.radiusPx = r;
    b.magnitude = mag;
    b.distCamera = dist ?? 1e9;
  }
}

afterEach(() => {
  for (const b of sim.bodyList) {
    b.present = true;
    b.screen.inFront = false;
  }
});

describe('pickBody', () => {
  it('takes the resolved disc under the pointer over any marker', () => {
    scene([
      ['earth', 400, 300, 120, -3],
      ['moon', 410, 300, 2, -12], // a marker right under the pointer, but on Earth's disc
    ]);
    expect(pickBody(405, 300)).toBe('earth');
  });

  it('takes the nearest marker to the pointer', () => {
    scene([
      ['jupiter', 400, 300, 0.5, -2.5],
      ['saturn', 410, 300, 0.5, 0.5],
    ]);
    expect(pickBody(402, 300)).toBe('jupiter');
    expect(pickBody(409, 300)).toBe('saturn');
  });

  it('prefers the brighter of two specks the pointer is about as near to', () => {
    // A faint moon 1 px nearer the pointer than its bright planet: the planet wins…
    scene([
      ['jupiter', 400, 300, 0.4, -2.5],
      ['moon', 406, 300, 0.1, 5],
    ]);
    expect(pickBody(403.5, 300)).toBe('jupiter');
    // …but a pointer clearly on the moon picks the moon.
    expect(pickBody(406, 300)).toBe('moon');
  });

  it('ignores bodies out of reach, behind the camera or absent', () => {
    scene([['mars', 400, 300, 0.5, 1]]);
    expect(pickBody(430, 300)).toBeNull();
    sim.bodies.mars.screen.inFront = false;
    expect(pickBody(400, 300)).toBeNull();
    scene([['voyager1', 400, 300, 0.1, 20]]);
    sim.bodies.voyager1.present = false;
    expect(pickBody(400, 300)).toBeNull();
  });

  it('breaks an exact tie by distance from the camera', () => {
    scene([
      ['uranus', 400, 300, 0.2, 5.7, 2.8e9],
      ['neptune', 400, 300, 0.2, 5.7, 4.3e9],
    ]);
    expect(pickBody(400, 300)).toBe('uranus');
  });
});

describe('pickBody, a faint marker right under the pointer', () => {
  it('beats a bright one a few pixels away (a spacecraft by its planet)', () => {
    scene([
      ['jupiter', 405, 300, 0.4, -2.5],
      ['voyager1', 400, 300, 0.001, 25],
    ]);
    expect(pickBody(400, 300)).toBe('voyager1');
    expect(pickBody(400.5, 300)).toBe('voyager1');
    // Pointing between them, nearer the planet: the planet.
    expect(pickBody(403, 300)).toBe('jupiter');
  });
});

/*
 * Near a black hole: the hole is picked by the exact circle of its shadow as drawn, at any
 * size and inside the horizon; a body bent round it is picked on any of its images, and a secondary image's pick
 * says which image and where it is (the hover tag's place). The camera, gravity and the lens are set up as
 * sim/gravity.ts and render/lens/lensState.ts set them.
 */
describe('pickBody and pickAt near a black hole', () => {
  const W = 1600;
  const H = 1000;
  const camera = new PerspectiveCamera(50, W / H, 1e-3, 1e25);
  /** CSS px per unit tan of the angle from the view's centre. */
  const F = H / 2 / Math.tan((25 * Math.PI) / 180);

  function look(dir: Vector3): void {
    const m = new Matrix4().lookAt(new Vector3(), dir, Math.abs(dir.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
    sim.camera.quat.setFromRotationMatrix(m);
  }

  function rsOf(id: BodyId): number {
    const r = getBody(id)!;
    return r.blackHole?.rsKm ?? r.physical.radiusKm;
  }

  /** At camRelKm from the hole, at rest past the hovering observers (a fall's frame is set after). */
  function hover(id: BodyId, camRelKm: Vector3): void {
    const b = sim.bodies[id];
    const rs = rsOf(id);
    const r = camRelKm.length();
    const mKm = rs / 2;
    Object.assign(gravity, { hole: id, gmKm3S2: (rs * C_KM_S * C_KM_S) / 2, mKm, mTimeS: mKm / C_KM_S, rsKm: rs, rKm: r, heightKm: r - rs });
    gravity.camRelHoleKm.copy(camRelKm);
    gravity.rM = r / mKm;
    gravity.x = rs / r;
    gravity.alpha = Math.sqrt(Math.max(0, (r - rs) / r));
    gravity.frame = 'static';
    gravity.inside = r < rs;
    gravity.lnGStatic = r > rs ? lnGStatic(gravity.rM) : 0;
    gravity.framePhi = 0;
    gravity.relPhi = 0;
    gravity.fallView = null;
    sim.camera.pos.copy(b.pos).add(camRelKm);
    sim.ship.vel.copy(b.vel);
    sim.ship.phi = 0;
  }

  function lensOn(frame: LensFrame = 'static'): void {
    const obs = { frame, r: gravity.rM };
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
    camera.updateProjectionMatrix();
    updateApparentPositions(false);
    updateDerived(camera, undefined, null);
  }

  beforeAll(() => {
    registerUniverse();
    setSimTime(Date.UTC(2018, 4, 1));
    updateEphemeris();
  });

  afterEach(() => {
    Object.assign(lens, { active: false, hole: null, fwd: null, inv: null });
    Object.assign(gravity, { hole: null, x: 0, rKm: Infinity, rM: Infinity, heightKm: Infinity, alpha: 1, inside: false, frame: 'static', fallView: null, lnGStatic: 0 });
    gravity.camRelHoleKm.set(0, 0, 0);
  });

  afterAll(() => {
    sim.camera.pos.set(0, 0, 0);
    sim.camera.quat.identity();
  });

  it('picks the hole anywhere inside the exact circle of its shadow at 10 M, the band the small-angle radius misses included', () => {
    const rs = rsOf('sgr-a-star');
    hover('sgr-a-star', new Vector3(0, 0, 5 * rs));
    look(new Vector3(0, 0, -1));
    frame();
    const hole = sim.bodies['sgr-a-star'];
    const rho = edgeAngle({ frame: 'static', r: 10 });
    const exactPx = F * Math.tan(rho); // the shadow's edge on screen along the screen's axes
    expect(hole.radiusPx).toBeCloseTo(rho * F, 6); // the app's convention: the angle × px per radian
    expect(exactPx - hole.radiusPx).toBeGreaterThan(40); // (picking.ts quotes 31 px, on another canvas)
    for (const dx of [0, 100, hole.radiusPx - 1, 0.5 * (hole.radiusPx + exactPx), exactPx - 1]) {
      expect(pickBody(W / 2 + dx, H / 2), `${dx.toFixed(1)} px out`).toBe('sgr-a-star');
      expect(pickBody(W / 2, H / 2 - dx), `${dx.toFixed(1)} px up`).toBe('sgr-a-star');
    }
    // just beyond the edge, the hole is not what is under the pointer
    expect(pickBody(W / 2 + exactPx + 1.5, H / 2)).not.toBe('sgr-a-star');
  });

  it('picks the hole inside its horizon by the raindrop’s dark region, wherever that reaches on screen', () => {
    const rs = rsOf('sgr-a-star');
    hover('sgr-a-star', new Vector3(0, 0, 0.5 * rs)); // r = 1 M
    gravity.frame = 'rain';
    gravity.fallView = { phi: 0, dir: new Vector3(0, 0, 1), rainPhi: 0 };
    const dark = edgeAngle({ frame: 'rain', r: 1 });
    expect(dark).toBeGreaterThan(Math.atan(Math.hypot(W / 2, H / 2) / F)); // wider than the view
    look(new Vector3(0, 0, -1));
    frame();
    for (const [x, y] of [
      [W / 2, H / 2],
      [1, 1],
      [W - 1, H - 1],
    ]) expect(pickBody(x, y)).toBe('sgr-a-star');
    // looking straight away from the hole (π from it): outside the dark region, which is under π
    expect(dark).toBeLessThan(Math.PI);
    look(new Vector3(0, 0, 1));
    frame();
    expect(pickBody(W / 2, H / 2)).not.toBe('sgr-a-star');
  });

  it('picks S2 on its second image behind Sgr A*, saying which image and where (the hover tag’s place)', () => {
    // S2 1 au off the line through Sgr A*, camera 300 au beyond the hole: two images 0.81° and 0.68° out
    const hole = sim.bodies['sgr-a-star'].pos;
    const h = sim.bodies.s2.pos.clone().sub(hole);
    const hh = h.clone().normalize();
    const p = new Vector3(0, 1, 0).cross(hh).normalize();
    const eps = Math.asin(AU_KM / h.length());
    const u = hh.clone().multiplyScalar(Math.cos(eps)).addScaledVector(p, Math.sin(eps));
    hover('sgr-a-star', u.clone().multiplyScalar(-300 * AU_KM));
    look(u);
    lensOn();
    frame();
    const L = sim.bodies.s2.lens!;
    expect(L.count).toBe(2);
    const second = L.images[1].screen;
    const first = L.images[0].screen;
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThan(20);
    expect(pickAt(second.x + 0.5, second.y, camera)).toEqual({ kind: 'body', id: 's2', image: 1, x: second.x, y: second.y });
    expect(pickedImage.image).toBe(1);
    // the primary is picked as any body is: no image fields (hostPicking.test.ts's form)
    expect(pickAt(first.x, first.y + 0.5, camera)).toEqual({ kind: 'body', id: 's2' });
    expect(sim.bodies.s2.screen.x).toBe(first.x);
    // with its first image behind the camera (close to a hole the images spread round the sky), the second is
    // still picked where it is
    sim.bodies.s2.screen.inFront = false;
    expect(pickAt(second.x, second.y, camera)).toEqual({ kind: 'body', id: 's2', image: 1, x: second.x, y: second.y });
  });
});
