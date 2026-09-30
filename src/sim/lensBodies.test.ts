/**
 * Bodies through a black hole's lens on the CPU (sim/lensBodies.ts), against independent references:
 *  - S2 behind Sgr A* at its pericentre, camera 300 au on the far side, the line 1 au from S2: both images
 *    against the reference port's allocating solver (physics/schwarzschild.ts lensImages) to 10⁻¹⁰ rad and
 *    10⁻⁷ in μ, and the brightening ×5.4 of the Learn article's fact sheet (learn/facts/black-holes.facts.md,
 *    whose image angles are thin-lens: the exact
 *    Einstein radius is 0.740°, not 0.728°; the images 0.811° and 0.676°, not 0.80° and 0.66°);
 *  - the Sun's rings: 10,000 au beyond Sgr A* (0.236°, V −4.3 without the dust) and 2.68 × 10⁶ km beyond
 *    Gaia BH1 (0.259°, V −7.5), from the thin lens with a finite source (μ = 2/ρ at alignment), which holds
 *    there to 0.3 %; the glints hand all their light to the ring;
 *  - the shadow as a circle for a moving observer against the fixtures' `circular` rows (10⁻¹² rad);
 *  - the Einstein ring's root against physics/schwarzschild.ts einsteinAngle; holeView at 10 r_s against
 *    the fact sheet's numbers and the closed forms;
 *  - screen points: a lensed body's is its primary image's, each image where its view direction projects;
 *  - the tiers (exact near the hole; tier 1 on the lens's own tables in a fall's rain frame);
 *  - the S-stars' own light: the two images of S2 carry different orbital Doppler factors (emission directions
 *    on either side of the hole), each within the star's speed;
 *  - no allocation per body, and the worst case (every registered body in the zone, fastest of batches) inside
 *    its 0.5 ms budget, guarded at twice that on a shared machine;
 *  - holeView's clock, thrust and tides equal to the HUD's own (ui/flight/HoleStrip.tsx);
 *  - B0(z)/z from the arithmetic–geometric mean equal to physics/lensPoint.ts's;
 *  - with no lens every body is left alone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { registerUniverse } from '../test/universe';
import { readJson } from '../test/files';
import { cpuMs } from '../test/timing';
import { astroTimeAt } from '../lib/time';
import { AU_KM, C_KM_S, PARSEC_KM, SUN_RADIUS_KM } from '../physics/constants';
import { edgeAngle, einsteinAngle, lensImages, lnGStatic, raindropDarkRadius, shadowAngle, type LensFrame } from '../physics/schwarzschild';
import { buildForwardTable, buildInverseTable } from '../physics/schwarzschildTables';
import { gouldB0OverZ, pointImageTier1, type PointImage } from '../physics/lensPoint';
import { rapidityFromSpeed } from '../physics/relativity';
import { lens } from '../render/lens/lensState';
import { relView } from '../render/relativisticView';
import { bodyPositionAt, type BodyId } from './bodies';
import { entryOf } from './bodies/registry';
import { updateEphemeris } from './ephemeris';
import { updateApparentPositions } from './lightDelay';
import { updateDerived } from './derived';
import { gravity } from './gravity';
import { alignBehind, b0OverZ, boostCircle, einsteinRadius, holeShadow, holeView, lensBodies, lensRings } from './lensBodies';
import { setSimTime, sim } from './sim';
import { holeNumbers } from '../ui/flight/HoleStrip';

const DEG = 180 / Math.PI;
const W = 1600;
const H = 1000;
const camera = new PerspectiveCamera(50, W / H, 1e-3, 1e25);

/** The camera looking along `dir` (world axes). */
function look(dir: Vector3): void {
  const m = new Matrix4().lookAt(new Vector3(), dir, Math.abs(dir.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
  sim.camera.quat.setFromRotationMatrix(m);
}

/** A hole's r_s (km) and GM from its record. */
function holeOf(id: BodyId): { rs: number; gm: number } {
  const r = entryOf(id)!.record;
  const rs = r.blackHole?.rsKm ?? r.physical.radiusKm;
  return { rs, gm: r.blackHole?.gmKm3S2 ?? r.physical.gmKm3S2 ?? (rs * C_KM_S * C_KM_S) / 2 };
}

/** Hover (a static observer riding with the hole) at camRelKm from it: gravity as sim/gravity.ts would set it. */
function hover(id: BodyId, camRelKm: Vector3): void {
  const b = sim.bodies[id];
  const { rs, gm } = holeOf(id);
  const r = camRelKm.length();
  const h = r - rs;
  const mKm = rs / 2;
  gravity.hole = id;
  gravity.gmKm3S2 = gm;
  gravity.mKm = mKm;
  gravity.mTimeS = mKm / C_KM_S;
  gravity.rsKm = rs;
  gravity.camRelHoleKm.copy(camRelKm);
  gravity.rKm = r;
  gravity.heightKm = h;
  gravity.rM = r / mKm;
  gravity.x = rs / r;
  gravity.alpha = Math.sqrt(h / r);
  gravity.oneMinusAlpha = gravity.x / (1 + gravity.alpha);
  gravity.frame = 'static';
  gravity.inside = false;
  gravity.paced = gravity.oneMinusAlpha > 1e-4;
  gravity.holeVelKmS.copy(b.vel);
  const u = b.vel.length();
  gravity.framePhi = u > 0 ? rapidityFromSpeed(u) : 0;
  if (u > 0) gravity.frameVelDir.copy(b.vel).divideScalar(u);
  else gravity.frameVelDir.set(0, 0, -1);
  gravity.relPhi = 0;
  gravity.relVelDir.set(0, 0, -1);
  gravity.lnGStatic = lnGStatic(gravity.rM);
  gravity.rainV = Math.sqrt(gravity.x);
  gravity.rainOneMinusV = (h / r) / (1 + gravity.rainV);
  gravity.fallView = null;
  sim.camera.pos.copy(b.pos).add(camRelKm);
  sim.ship.vel.copy(b.vel);
  sim.ship.phi = gravity.framePhi;
}

/** The lens drawn about the hole gravity follows, its tables built as render/lens/lensState.ts builds them. */
function lensOn(frame: LensFrame = 'static', ringBandPx = 0): void {
  const obs = { frame, r: gravity.rM };
  lens.active = true;
  lens.hole = gravity.hole;
  lens.obs = obs;
  lens.mKm = gravity.mKm;
  lens.holeM.copy(gravity.camRelHoleKm).divideScalar(-gravity.mKm);
  lens.axis.copy(lens.holeM).normalize();
  lens.edge = edgeAngle(obs);
  lens.fwd = buildForwardTable(obs);
  lens.inv = buildInverseTable(lens.fwd);
  lens.thetaE = lens.inv.thetaE;
  lens.pointZoneSrc = Math.PI;
  lens.diffuseZone = Math.PI;
  lens.ringBandPx = ringBandPx;
}

function lensOff(): void {
  lens.active = false;
  lens.hole = null;
  lens.fwd = null;
  lens.inv = null;
}

function resetGravity(): void {
  gravity.hole = null;
  gravity.x = 0;
  gravity.rKm = Infinity;
  gravity.rM = Infinity;
  gravity.heightKm = Infinity;
  gravity.alpha = 1;
  gravity.oneMinusAlpha = 0;
  gravity.framePhi = 0;
  gravity.relPhi = 0;
  gravity.lnGStatic = 0;
  gravity.fallView = null;
  gravity.inside = false;
  gravity.frame = 'static';
  gravity.camRelHoleKm.set(0, 0, 0);
}

function frame(): void {
  sim.viewport.width = W;
  sim.viewport.height = H;
  sim.camera.fovDeg = 50;
  camera.updateProjectionMatrix();
  updateApparentPositions(false);
  updateDerived(camera, undefined, null);
}

const angle = (a: Vector3, b: Vector3): number => 2 * Math.atan2(a.clone().sub(b).length(), a.clone().add(b).length());

let t0 = 0;

beforeAll(() => {
  registerUniverse();
  // A pericentre of S2 in the app's registry positions: a coarse scan over one period (16 years), then a
  // golden-section search. (The registry holds where S2 is, a light-time ahead of the epochs the orbit was
  // observed at from Earth, so its pericentres there are not May 2018's.)
  const sep = (ms: number) => bodyPositionAt('s2', astroTimeAt(ms)).distanceTo(bodyPositionAt('sgr-a-star', astroTimeAt(ms)));
  const YEAR_MS = 365.25 * 86_400_000;
  let tMin = Date.UTC(2010, 0, 1);
  let dMin = Infinity;
  for (let t = Date.UTC(2010, 0, 1); t < Date.UTC(2027, 0, 1); t += 0.05 * YEAR_MS) {
    const d = sep(t);
    if (d < dMin) {
      dMin = d;
      tMin = t;
    }
  }
  let a = tMin - 0.05 * YEAR_MS;
  let b = tMin + 0.05 * YEAR_MS;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 80; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (sep(c) < sep(d)) b = d;
    else a = c;
  }
  t0 = (a + b) / 2;
  setSimTime(t0);
  updateEphemeris();
});

afterEach(() => {
  lensOff();
  resetGravity();
  relView.active = false;
  relView.split = false;
  relView.phi = 0;
  sim.ship.vel.set(0, 0, 0);
  sim.ship.phi = 0;
});

afterAll(() => {
  sim.camera.pos.set(0, 0, 0);
});

/** S2 at its pericentre, camera 300 au from Sgr A* on the far side, the camera–hole line `offAu` from S2. */
function s2Behind(offAu: number): { ro: number; rs: number; phi: number; m: number } {
  setSimTime(t0);
  updateEphemeris();
  const hole = sim.bodies['sgr-a-star'].pos;
  const h = sim.bodies.s2.pos.clone().sub(hole);
  const hh = h.clone().normalize();
  const p = new Vector3(0, 1, 0).cross(hh).normalize();
  const eps = Math.asin((offAu * AU_KM) / h.length());
  const u = hh.clone().multiplyScalar(Math.cos(eps)).addScaledVector(p, Math.sin(eps)); // camera → hole
  hover('sgr-a-star', u.clone().multiplyScalar(-300 * AU_KM));
  look(u);
  lensOn();
  frame();
  const m = gravity.mKm;
  return { ro: (300 * AU_KM) / m, rs: h.length() / m, phi: Math.PI - eps, m };
}

describe('S2 behind Sgr A* (exact)', () => {
  it('has both images where the exact solver puts them, and brightens ×5.4', () => {
    const { ro, rs, phi } = s2Behind(1);
    const ref = lensImages(ro, rs, phi, 0);
    const L = sim.bodies.s2.lens!;
    expect(L).not.toBeNull();
    expect(L.count).toBe(2);
    const axis = lens.axis;
    for (const k of [0, 1] as const) {
      const img = L.images[k];
      const r = ref.find((x) => x.side === (k === 0 ? 1 : -1))!;
      expect(Math.abs(angle(img.dirLens, axis) - r.theta), `order ${k}`).toBeLessThan(1e-10);
      expect(Math.abs(Math.exp(img.lnMu) / Math.abs(r.mu) - 1)).toBeLessThan(1e-7);
    }
    // The fact sheet: 0.80° and 0.66° (thin lens, S2 120 au behind); exactly 0.810° and 0.676° at the app's
    // pericentre, ×5.4 together.
    expect(angle(L.images[0].dirLens, axis) * DEG).toBeCloseTo(0.81, 2);
    expect(angle(L.images[1].dirLens, axis) * DEG).toBeCloseTo(0.676, 2);
    expect(Math.exp(L.images[0].lnMu) + Math.exp(L.images[1].lnMu)).toBeCloseTo(5.4, 1);
    // on opposite sides of the hole
    const q0 = L.images[0].dirLens.clone().sub(axis);
    const q1 = L.images[1].dirLens.clone().sub(axis);
    expect(q0.dot(q1)).toBeLessThan(0);
  });

  it('has its Einstein ring 0.739° from 300 au (thin lens: 0.728°)', () => {
    const { ro, rs } = s2Behind(1);
    const ref = lensImages(ro, rs, Math.PI - 1e-12, 0);
    expect(ref[0].theta * DEG).toBeCloseTo(0.739, 3);
    // the fact sheet's thin lens is 1.5 % small at 300 au: the exact bending there is stronger
    const thin = Math.sqrt((4 * (rs / (ro + rs))) / ro);
    expect(ref[0].theta / thin - 1).toBeGreaterThan(0.01);
    expect(ref[0].theta / thin - 1).toBeLessThan(0.02);
  });

  it('puts the body, and its label, on the primary image; every image where its view direction projects', () => {
    s2Behind(1);
    const b = sim.bodies.s2;
    const L = b.lens!;
    expect(b.screen.x).toBe(L.images[0].screen.x);
    expect(b.screen.y).toBe(L.images[0].screen.y);
    // the camera looks at the hole: the images straddle the screen's centre, 0.81° and 0.68° from it
    const pxPerRad = H / 2 / Math.tan((25 * Math.PI) / 180);
    const cx = W / 2;
    const cy = H / 2;
    const r0 = Math.hypot(L.images[0].screen.x - cx, L.images[0].screen.y - cy);
    const r1 = Math.hypot(L.images[1].screen.x - cx, L.images[1].screen.y - cy);
    const axis = lens.axis;
    expect(r0).toBeCloseTo(Math.tan(angle(L.images[0].dirLens, axis)) * pxPerRad, 6);
    expect(r1).toBeCloseTo(Math.tan(angle(L.images[1].dirLens, axis)) * pxPerRad, 6);
    expect(r0).toBeCloseTo(Math.tan(0.81 / DEG) * pxPerRad, -1);
    const dx0 = L.images[0].screen.x - cx;
    const dx1 = L.images[1].screen.x - cx;
    const dy0 = L.images[0].screen.y - cy;
    const dy1 = L.images[1].screen.y - cy;
    expect(dx0 * dx1 + dy0 * dy1).toBeLessThan(0);
    // the magnitude of the primary: flat, brightened by its magnification and shifted
    expect(b.magnitude).toBe(L.images[0].magnitude);
  });

  it('carries S2’s orbital Doppler shift along each image’s own emission direction', () => {
    s2Behind(1);
    const b = sim.bodies.s2;
    const L = b.lens!;
    const beta = b.vel.clone().sub(sim.bodies['sgr-a-star'].vel).length() / C_KM_S;
    expect(beta).toBeGreaterThan(0.02); // near pericentre: 7,700 km/s
    // ln D_x = ln D_own + ln g_exact (the emitter's and the observer's potential); |ln D_own| ≤ artanh β
    const lnG = 0.5 * Math.log1p(-2 / (sim.bodies.s2.pos.distanceTo(sim.bodies['sgr-a-star'].pos) / gravity.mKm)) + lnGStatic(gravity.rM);
    for (const img of L.images.slice(0, L.count)) expect(Math.abs(img.lnDx - lnG)).toBeLessThan(Math.atanh(beta) + 1e-12);
    // the light of the two images leaves S2 on either side of the hole: different shifts
    expect(Math.abs(L.images[0].lnDx - L.images[1].lnDx)).toBeGreaterThan(1e-3);
  });
});

describe('the finite-source cap', () => {
  it('has B0(z)/z from the arithmetic–geometric mean as physics/lensPoint.ts has it from Carlson’s forms', () => {
    for (const z of [0, 1e-9, 1e-3, 0.3, 0.5, 0.96, 1 - 1e-9, 1, 1 + 1e-9, 1.2, 2, 3.5, 8, 30, 99.9]) {
      const a = b0OverZ(z);
      const b = gouldB0OverZ(z);
      expect(Math.abs(a / b - 1), `z ${z}`).toBeLessThan(1e-12);
    }
    // Gould's values: B0 = 0.9342 at 0.5, 4/π at 1, 1.0346 at 2 (Gould 1994)
    expect(0.5 * b0OverZ(0.5)).toBeCloseTo(0.9342, 4);
    expect(b0OverZ(1)).toBe(4 / Math.PI);
    expect(2 * b0OverZ(2)).toBeCloseTo(1.0346, 4);
  });
});

describe('the Sun’s rings', () => {
  /**
   * Hover `dKm` beyond `id` with the Sun exactly behind it in the hole's frame (alignBehind: for a moving hole the
   * line from the Sun turned by the aberration of its light), looking back at the Sun.
   */
  function beyond(id: BodyId, dKm: number): void {
    setSimTime(t0);
    updateEphemeris();
    updateApparentPositions(false);
    const rel = alignBehind(id, 'sun', dKm, new Vector3())!;
    hover(id, rel);
    look(rel.clone().negate().normalize());
    lensOn();
    frame();
  }

  /** The thin lens with a finite source at alignment: ring radius √(4M/D) and total magnification 2/ρ. */
  function thinRing(mKm: number, dKm: number, sunDistKm: number): { radius: number; mag: number } {
    const thetaE = Math.sqrt((4 * mKm * (sunDistKm - dKm)) / (dKm * sunDistKm));
    const rho = SUN_RADIUS_KM / sunDistKm / thetaE;
    const vFlat = 4.83 + 5 * Math.log10(sunDistKm / PARSEC_KM / 10);
    return { radius: thetaE, mag: vFlat - 2.5 * Math.log10(2 / rho) };
  }

  it('is 0.236° across in radius, V ≈ −4.3, from 10,000 au beyond Sgr A*', () => {
    beyond('sgr-a-star', 10_000 * AU_KM);
    const sun = sim.bodies.sun;
    const L = sun.lens!;
    expect(L.ring).not.toBeNull();
    const ring = L.ring!;
    const d = sim.bodies['sgr-a-star'].pos.distanceTo(sun.pos) + 10_000 * AU_KM;
    const thin = thinRing(gravity.mKm, 10_000 * AU_KM, d);
    expect(ring.radius * DEG).toBeCloseTo(0.236, 3);
    expect(Math.abs(ring.radius / thin.radius - 1)).toBeLessThan(3e-3);
    expect(ring.magnitude).toBeCloseTo(-4.3, 1);
    expect(Math.abs(ring.magnitude - thin.mag)).toBeLessThan(0.02);
    // perfectly aligned (to float64): all the light in the ring, none in the two glints
    expect(ring.share).toBe(1);
    expect(L.images[0].share).toBe(0);
    expect(L.images[1].share).toBe(0);
    expect(ring.arcHalf).toBeCloseTo(Math.PI / 2, 12);
    expect(lensRings.count).toBe(1);
    expect(lensRings.owners[0]).toBe(sun);
  });

  it('is the Moon’s size (0.259°), V ≈ −7.5, from 2.68 × 10⁶ km beyond Gaia BH1 (on the aberrated line)', () => {
    // On the straight line from the Sun the Sun is 2 × 10⁻⁴ rad off in Gaia BH1's frame: two images, no ring.
    setSimTime(t0);
    updateEphemeris();
    const straight = sim.bodies['gaia-bh1'].pos.clone().sub(sim.bodies.sun.pos).normalize();
    hover('gaia-bh1', straight.clone().multiplyScalar(2.68e6));
    look(straight.clone().negate());
    lensOn();
    frame();
    expect(sim.bodies.sun.lens!.ring).toBeNull();
    beyond('gaia-bh1', 2.68e6);
    const sun = sim.bodies.sun;
    const ring = sun.lens!.ring!;
    expect(ring).not.toBeNull();
    const d = sim.bodies['gaia-bh1'].pos.distanceTo(sun.pos) + 2.68e6;
    const thin = thinRing(gravity.mKm, 2.68e6, d);
    expect(ring.radius * DEG).toBeCloseTo(0.259, 3);
    expect(Math.abs(ring.radius / thin.radius - 1)).toBeLessThan(2e-3);
    expect(ring.magnitude).toBeCloseTo(-7.5, 1);
    expect(Math.abs(ring.magnitude - thin.mag)).toBeLessThan(0.05);
  });

  it('fades its glints out as the ring fades in, between z = 3.5 and 2.5', () => {
    // Off the line by z = 3: the Sun's source angle from the hole 3 of its radii (seen from the hole)
    setSimTime(t0);
    updateEphemeris();
    const hole = sim.bodies['sgr-a-star'].pos;
    const sunFromHole = sim.bodies.sun.pos.clone().sub(hole);
    const rho = SUN_RADIUS_KM / sunFromHole.length();
    const out = sunFromHole.clone().normalize().negate();
    const p = new Vector3(0, 1, 0).cross(out).normalize();
    for (const [z, share] of [
      [3.0, 0.5],
      [2.0, 1],
      [4.0, 0],
    ] as const) {
      const dir = out.clone().multiplyScalar(Math.cos(z * rho)).addScaledVector(p, Math.sin(z * rho));
      hover('sgr-a-star', dir.multiplyScalar(10_000 * AU_KM));
      look(out.clone().negate());
      lensOn();
      frame();
      const L = sim.bodies.sun.lens!;
      const w = L.ring ? L.ring.share : 0;
      expect(w, `z ${z}`).toBeCloseTo(share, 2);
      expect(L.images[0].share).toBeCloseTo(1 - w, 12);
      expect(L.images[1].share).toBeCloseTo(1 - w, 12);
    }
  });
});

interface CircularRow {
  r: number;
  rapidity: number;
  shadow_circle_centre_from_motion: number;
  shadow_circle_radius: number;
  static_shadow_radius: number;
}

describe('the shadow as a circle for a moving observer (fixtures `circular`)', () => {
  const rows = readJson<{ circular: CircularRow[] }>('src/physics/__fixtures__/schwarzschild.json').circular;

  it('boostCircle moves the static shadow to the fixtures’ circle', () => {
    const c = new Vector3(0, 0, -1);
    const v = new Vector3(1, 0, 0);
    const out = new Vector3();
    for (const row of rows) {
      const edge = shadowAngle(row.r);
      expect(Math.abs(edge - row.static_shadow_radius)).toBeLessThan(1e-14);
      const rho = boostCircle(c, edge, v, Math.exp(-row.rapidity), out);
      expect(Math.abs(rho - row.shadow_circle_radius), `r ${row.r}`).toBeLessThan(1e-12);
      expect(Math.abs(angle(out, v) - row.shadow_circle_centre_from_motion), `r ${row.r}`).toBeLessThan(1e-12);
    }
  });

  it('holeShadow and holeView give it for the ship in motion past the hovering observers', () => {
    for (const row of rows) {
      setSimTime(t0);
      updateEphemeris();
      const hole = sim.bodies['sgr-a-star'];
      hover('sgr-a-star', new Vector3(0, 0, row.r * holeOf('sgr-a-star').rs * 0.5));
      // moving sideways (a circular orbit's direction) at the row's rapidity: the relativistic view
      sim.ship.phi = row.rapidity;
      sim.ship.vel.set(Math.tanh(row.rapidity) * C_KM_S, 0, 0).add(hole.vel);
      gravity.relPhi = row.rapidity;
      gravity.relVelDir.set(1, 0, 0);
      relView.active = true;
      relView.phi = row.rapidity;
      relView.velDir.set(1, 0, 0);
      look(new Vector3(0, 0, -1));
      frame();
      expect(Math.abs(holeShadow.radius[1] - row.shadow_circle_radius)).toBeLessThan(1e-12);
      expect(Math.abs(angle(holeShadow.centre[1], relView.velDir) - row.shadow_circle_centre_from_motion)).toBeLessThan(1e-12);
      const v = holeView('sgr-a-star')!;
      expect(Math.abs(v.shadowRadius - row.shadow_circle_radius)).toBeLessThan(1e-12);
      // at rest (the classical half) the shadow is Synge's, about the hole's direction
      expect(Math.abs(holeShadow.radius[0] - row.static_shadow_radius)).toBeLessThan(1e-14);
    }
  });
});

describe('holeView', () => {
  it('finds the Einstein ring as einsteinAngle does, at any distance and in both frames', () => {
    // The root is set by Δφ(α) = π, whose float64 value is good to an ulp of π: 4 × 10⁻¹⁶ rad of α wherever the
    // ring is (far out it is 2 × 10⁻⁷ rad at 10¹⁴ M, so there the two agree to that, not to 10⁻¹² of the ring).
    for (const r of [3.5, 6, 20, 100, 1e4, 1e8, 1e14]) {
      const a = einsteinRadius('static', r);
      const b = einsteinAngle({ frame: 'static', r });
      expect(Math.abs(a - b), `static r ${r}`).toBeLessThan(Math.max(1e-12 * b, 1e-15));
    }
    for (const r of [2.5, 1, 0.1]) {
      const a = einsteinRadius('rain', r);
      const b = einsteinAngle({ frame: 'rain', r });
      expect(Math.abs(a / b - 1), `rain r ${r}`).toBeLessThan(1e-12);
    }
  });

  it('hovering at 10 r_s over Sgr A*: shadow 28.5°, Einstein ring 59.7°, clock 0.9487, 3,806 g, tides 1.1 × 10⁻⁶ m/s²', () => {
    setSimTime(t0);
    updateEphemeris();
    const rs = holeOf('sgr-a-star').rs;
    hover('sgr-a-star', new Vector3(0, 0, 10 * rs));
    look(new Vector3(0, 0, -1));
    frame();
    const v = holeView('sgr-a-star')!;
    expect(v.heightKm).toBe(9 * rs);
    expect(v.rOverRs).toBe(10);
    expect(v.rM).toBe(20);
    expect(2 * v.shadowRadius * DEG).toBeCloseTo(28.5, 1);
    expect(v.shadowRadius * DEG).toBeCloseTo(14.27, 2);
    expect(v.shadowOffset).toBeLessThan(1e-15);
    expect(v.einsteinRadius * DEG).toBeCloseTo(29.83, 2);
    expect(v.clockRate).toBeCloseTo(0.9487, 4);
    expect(v.thrustG!).toBeGreaterThan(3805);
    expect(v.thrustG!).toBeLessThan(3807);
    expect(v.tidalMS2).toBeCloseTo(1.1e-6, 7);
    expect(v.tidesTearShip).toBe(false);
    // the label's and the card's: the height above the horizon, from the exact hole-relative camera
    expect(sim.bodies['sgr-a-star'].distCamera).toBe(10 * rs);
    // the shadow on screen: centred, radius 14.27° (the app's radiusPx, CSS px at the centre's scale)
    const b = sim.bodies['sgr-a-star'];
    expect(b.screen.x).toBeCloseTo(W / 2, 6);
    expect(b.screen.y).toBeCloseTo(H / 2, 6);
    expect(b.radiusPx).toBeCloseTo((14.27 / DEG) * (H / 2 / Math.tan((25 * Math.PI) / 180)), -1);
  });

  it('agrees with the HUD’s own numbers (ui/flight/HoleStrip.tsx), hovering and moving past the hovering observers', () => {
    setSimTime(t0);
    updateEphemeris();
    const rs = holeOf('sgr-a-star').rs;
    const hole = sim.bodies['sgr-a-star'];
    for (const [beta, dir] of [
      [0, new Vector3(1, 0, 0)],
      [0.5, new Vector3(1, 0, 0)],
      [0.9, new Vector3(0.6, 0, 0.8)],
    ] as const) {
      hover('sgr-a-star', new Vector3(0, 0, 10 * rs));
      if (beta > 0) {
        const phi = Math.atanh(beta);
        sim.ship.phi = phi;
        sim.ship.vel.copy(dir).multiplyScalar(beta * C_KM_S).add(hole.vel);
        gravity.relPhi = phi;
        gravity.relVelDir.copy(dir);
      }
      look(new Vector3(0, 0, -1));
      frame();
      const v = holeView('sgr-a-star')!;
      const n = holeNumbers()!;
      expect(v.clockRate / n.clockRate - 1, `β ${beta}`).toBeLessThan(1e-14);
      expect(n.clockRate / v.clockRate - 1, `β ${beta}`).toBeLessThan(1e-14);
      expect(Math.abs(v.thrustG! / n.thrustG! - 1), `β ${beta}`).toBeLessThan(1e-12);
      expect(v.tidalMS2).toBe(n.tidalMS2);
      expect(v.heightKm).toBe(n.heightKm);
    }
  });

  it('gives the numbers of a hole far away (Gaia BH1 from Sgr A*’s neighbourhood) without a lens', () => {
    setSimTime(t0);
    updateEphemeris();
    const rs = holeOf('sgr-a-star').rs;
    hover('sgr-a-star', new Vector3(0, 0, 1000 * rs));
    frame();
    const v = holeView('gaia-bh1')!;
    const d = sim.camera.pos.distanceTo(sim.bodies['gaia-bh1'].pos);
    expect(v.distanceKm).toBeCloseTo(d, -3);
    expect(Math.abs(v.einsteinRadius / (2 / Math.sqrt(v.rM)) - 1)).toBeLessThan(1e-4);
    expect(v.shadowRadius).toBeGreaterThan(0);
    expect(v.thrustG!).toBeGreaterThan(0);
    // Before the first frame places anything (the camera and the hole both at the origin): no numbers, rather
    // than a hover floor's height.
    const cam = sim.camera.pos.clone();
    try {
      sim.camera.pos.copy(sim.bodies['gaia-bh1'].pos);
      expect(holeView('gaia-bh1')).toBeNull();
    } finally {
      sim.camera.pos.copy(cam);
    }
  });
});

describe('tiers and frames', () => {
  it('uses the lens’s own tables (tier 1) in a fall’s rain frame below 3M', () => {
    setSimTime(t0);
    updateEphemeris();
    const rs = holeOf('sgr-a-star').rs;
    // A raindrop 1.25 r_s from the hole (2.5 M), falling from rest far away: the view is the raindrop's
    hover('sgr-a-star', new Vector3(0, 0, 1.25 * rs));
    gravity.frame = 'rain';
    gravity.lnGStatic = 0;
    gravity.fallView = { phi: 0, dir: new Vector3(0, 0, 1), rainPhi: 0 };
    look(new Vector3(0, 0, -1));
    lensOn('rain');
    frame();
    const sun = sim.bodies.sun;
    const L = sun.lens!;
    expect(L).not.toBeNull();
    const out: PointImage = { ok: false, alpha: 0, dir: { x: 0, y: 0, z: 0 }, lnMu: 0, lnG: 0, side: 1, branch: 'identity', emitDir: { x: 0, y: 0, z: 0 }, causticOffset: 0 };
    const srcM = sun.apparentPos.clone().sub(sim.bodies['sgr-a-star'].pos).addScaledVector(lens.holeM, gravity.mKm).divideScalar(gravity.mKm);
    pointImageTier1(lens.inv!, lens.holeM, srcM, 0, out, 1000);
    expect(L.images[0].dirLens.x).toBe(out.dir.x);
    expect(L.images[0].dirLens.y).toBe(out.dir.y);
    expect(L.images[0].dirLens.z).toBe(out.dir.z);
    expect(L.images[0].lnDx).toBeCloseTo(out.lnG, 15);
    // the dark region there is the raindrop's
    expect(Math.abs(holeShadow.radius[0] - raindropDarkRadius(2.5))).toBeLessThan(1e-15);
  });
});

describe('cost', () => {
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
  const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

  /**
   * Young-generation bytes filled per call of fn, averaged over 100 calls (one call's few numbers are at the mercy
   * of whatever else V8 does in between), less the measuring's own: the least of several tries.
   */
  function bytesPer(fn: () => void): number {
    const CALLS = 100;
    for (let k = 0; k < 200; k++) fn();
    let best = Infinity;
    let overhead = Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      gc();
      const before = newSpace();
      for (let k = 0; k < CALLS; k++) fn();
      const grown = newSpace() - before;
      if (grown >= 0) best = Math.min(best, grown);
      gc();
      const b0 = newSpace();
      for (let k = 0; k < CALLS; k++) noop();
      const g0 = newSpace() - b0;
      if (g0 >= 0) overhead = Math.min(overhead, g0);
    }
    return (best - overhead) / CALLS;
  }
  const noop = (): void => {};

  /** Every body's flat magnitude, as updateDerived leaves it for lensBodies (which reads it and writes the lensed one). */
  let flat = new Float64Array(0);

  /** The worst case: 20 M from Sgr A*, every registered body in the lens's zone, the S-stars exact, orders 0–2. */
  function worst(): void {
    setSimTime(t0);
    updateEphemeris();
    const rs = holeOf('sgr-a-star').rs;
    hover('sgr-a-star', new Vector3(0.3, 0.2, 1).normalize().multiplyScalar(10 * rs));
    look(new Vector3(-0.3, -0.2, -1).normalize());
    frame();
    flat = Float64Array.from(sim.bodyList, (b) => b.magnitude);
    lensOn('static', 2);
    frame();
  }

  /** One frame's lensBodies, as updateDerived calls it: after every body's flat magnitude. */
  function lensFrame(): void {
    const list = sim.bodyList;
    for (let i = 0; i < list.length; i++) list[i].magnitude = flat[i];
    lensBodies(camera, undefined, null);
  }

  it('allocates nothing per body: a few numbers a frame, for tier 2 and the set-up', { timeout: 60_000 }, () => {
    worst();
    // Warmed long enough for V8's optimising compiler to take in the rarer paths too (the rings, the finite-source
    // cap): until then a function's numbers are boxed.
    for (let k = 0; k < 8000; k++) lensFrame();
    const all = bytesPer(lensFrame);
    // Tier 2 (physics/lensPoint.ts pointImageExact, the S-stars here) boxes a few numbers an image, and the
    // once-a-frame set-up a few more (V8 keeps a function run once a frame in its middle tier, which boxes
    // some): a few hundred bytes a frame in all.
    expect(all).toBeLessThan(512);
    // Per body, nothing: without the S-stars, 388 bodies lensed fill what one does, once V8 has settled (the
    // frame loop runs thousands of frames: measured last, after the few).
    const near = ['s2', 's38', 's55'].filter((id) => sim.bodies[id]?.present);
    for (const id of near) sim.bodies[id].present = false;
    try {
      lens.pointZoneSrc = 1e-9;
      lens.diffuseZone = 1e-9;
      for (let k = 0; k < 4000; k++) lensFrame();
      const few = bytesPer(lensFrame);
      let lensedFew = 0;
      for (const b of sim.bodyList) if (b.lens) lensedFew++;
      lens.pointZoneSrc = Math.PI;
      lens.diffuseZone = Math.PI;
      for (let k = 0; k < 4000; k++) lensFrame();
      const many = bytesPer(lensFrame);
      let lensedMany = 0;
      for (const b of sim.bodyList) if (b.lens) lensedMany++;
      expect(lensedMany).toBeGreaterThan(300);
      expect(lensedFew).toBeLessThan(3);
      // At most a number or two (measured 0–16 bytes), not one a body: one 16-byte number a body would be 6 kB.
      expect(many - few).toBeLessThan(48);
    } finally {
      for (const id of near) sim.bodies[id].present = true;
    }
  });

  it('takes well under 1 ms a frame in the worst case (budget 0.5 ms; the fastest of batches)', { timeout: 60_000 }, () => {
    worst();
    let lensed = 0;
    for (const b of sim.bodyList) if (b.lens) lensed++;
    expect(lensed).toBeGreaterThan(100);
    // Batches of a few hundred milliseconds: Windows counts processor time in ticks of 15.6 ms.
    for (let k = 0; k < 2000; k++) lensFrame();
    let best = Infinity;
    for (let batch = 0; batch < 6; batch++) {
      const t = cpuMs();
      for (let k = 0; k < 600; k++) lensFrame();
      best = Math.min(best, (cpuMs() - t) / 600);
    }
    // The budget is 0.5 ms (docs/data/blackholes.md §11), measured at 0.21–0.39 ms here with the processor busy with other
    // work; the guard is twice the budget, as for the tables' build (schwarzschildTables.test.ts), because
    // processor time itself rises when other processes share the core.
    expect(best).toBeLessThan(1.0);
  });

  it('does nothing without a lens: every body is left as it is', () => {
    worst();
    lensOff();
    frame();
    for (const b of sim.bodyList) expect(b.lens).toBeNull();
    resetGravity();
    frame();
    expect(holeShadow.hole).toBeNull();
  });
});
