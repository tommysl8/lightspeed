/**
 * The lab's readings (lab/measure.ts) far from black holes and near one, against the formulas themselves:
 *  - with no hole every reading is the flat-spacetime one of the Sun's frame, number for number;
 *  - near a hole the motion is the ship's past the local observers (gravity.relPhi, relVelDir), so hovering is
 *    at rest; the spectrometer's D is the kinematic factor times the hole's g (the hovering observers' blueshift
 *    whatever the direction; inside the horizon the raindrop's, by the light's angle from the hole); a hole's
 *    angular diameter is its shadow's (holeView); a lensed body is read at its primary image;
 *  - the lab records nothing near a hole (lab/logger.ts), where it would record the same reading far away.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { registerUniverse } from '../test/universe';
import { C_KM_S } from '../physics/constants';
import { cosRestFromShip, dopplerFromShipAngle } from '../physics/relativity';
import { edgeAngle, lnGRain, lnGStatic } from '../physics/schwarzschild';
import { getBody } from '../sim/bodies';
import { gravity } from '../sim/gravity';
import { setSimTime, sim } from '../sim/sim';
import { updateEphemeris } from '../sim/ephemeris';
import { useUI } from '../state/ui';
import { useNotebook } from './notebook';
import { recordManual } from './logger';
import { angularDiameterDeg, apexDirection, nearBlackHole, observerBeta, reticleDirection, reticleReading, targetReading } from './measure';

const DEG = 180 / Math.PI;

/** The camera looking along `dir` (world axes): the reticle's direction. */
function look(dir: Vector3): void {
  const m = new Matrix4().lookAt(new Vector3(), dir, Math.abs(dir.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
  sim.camera.quat.setFromRotationMatrix(m);
}

/** Sgr A*'s r_s, km, from its record. */
function rsOfSgrA(): number {
  const r = getBody('sgr-a-star')!;
  return r.blackHole?.rsKm ?? r.physical.radiusKm;
}

/** Gravity as sim/gravity.ts sets it for a camera at camRelKm from Sgr A*, hovering (rest past the local observers). */
function nearSgrA(camRelKm: Vector3): void {
  const b = sim.bodies['sgr-a-star'];
  const rs = rsOfSgrA();
  const r = camRelKm.length();
  const mKm = rs / 2;
  gravity.hole = 'sgr-a-star';
  gravity.mKm = mKm;
  gravity.rsKm = rs;
  gravity.camRelHoleKm.copy(camRelKm);
  gravity.rKm = r;
  gravity.heightKm = r - rs;
  gravity.rM = r / mKm;
  gravity.x = rs / r;
  gravity.alpha = Math.sqrt((r - rs) / r);
  gravity.oneMinusAlpha = gravity.x / (1 + gravity.alpha);
  gravity.frame = 'static';
  gravity.inside = r < rs;
  gravity.lnGStatic = r > rs ? lnGStatic(gravity.rM) : 0;
  gravity.relPhi = 0;
  gravity.relVelDir.set(0, 0, -1);
  gravity.fallView = null;
  sim.camera.pos.copy(b.pos).add(camRelKm);
  sim.ship.vel.copy(b.vel);
}

let rsSgrA = 0;

beforeAll(() => {
  registerUniverse();
  setSimTime(Date.UTC(2026, 0, 1));
  updateEphemeris();
});

afterEach(() => {
  gravity.hole = null;
  gravity.x = 0;
  gravity.rKm = Infinity;
  gravity.rM = Infinity;
  gravity.alpha = 1;
  gravity.inside = false;
  gravity.relPhi = 0;
  gravity.lnGStatic = 0;
  gravity.camRelHoleKm.set(0, 0, 0);
  sim.ship.vel.set(0, 0, 0);
  sim.ship.phi = 0;
  sim.camera.pos.set(0, 0, 0);
  sim.camera.quat.identity();
  useUI.setState({ experiment: null });
});

describe('far from black holes', () => {
  it('reads the motion, the spectrometer and the goniometer in the Sun’s frame, as always', () => {
    expect(nearBlackHole()).toBe(false);
    sim.ship.vel.set(0.6 * C_KM_S, 0, 0);
    expect(observerBeta()).toBe(Math.min(sim.ship.vel.length() / C_KM_S, 0.999_999_999_999));
    expect(apexDirection()!.toArray()).toEqual([1, 0, 0]);
    look(new Vector3(1, 1, 0).normalize());
    const g = reticleReading()!;
    const beta = observerBeta();
    const cosS = reticleDirection().x;
    expect(g.thetaShipDeg).toBeCloseTo(45, 12);
    expect(g.D).toBe(dopplerFromShipAngle(cosS, beta));
    expect(g.thetaDeg).toBeCloseTo(Math.acos(cosRestFromShip(cosS, beta)) * DEG, 12);
  });
});

describe('near a black hole', () => {
  beforeAll(() => {
    rsSgrA = rsOfSgrA();
    // Sgr A*'s M = GM/c² = 6,345,058 km (docs/data/blackholes.md §4)
    expect(rsSgrA / 2 / 6_345_058 - 1).toBeLessThan(1e-6);
  });

  it('is at rest while hovering: no apex and no spectrometer reading, whatever the Sun’s frame says', () => {
    nearSgrA(new Vector3(0, 0, 10 * rsSgrA));
    expect(nearBlackHole()).toBe(true);
    sim.ship.vel.set(0.3 * C_KM_S, 0, 0); // (ignored near a hole: the motion is gravity.relPhi's)
    expect(observerBeta()).toBe(0);
    expect(apexDirection()).toBeNull();
    expect(reticleReading()).toBeNull();
  });

  it('measures the motion past the hovering observers, and multiplies D by their blueshift g', () => {
    nearSgrA(new Vector3(0, 0, 10 * rsSgrA));
    gravity.relPhi = Math.atanh(0.5);
    gravity.relVelDir.set(0, 1, 0);
    expect(observerBeta()).toBeCloseTo(0.5, 15);
    expect(apexDirection()!.toArray()).toEqual([0, 1, 0]);
    for (const dir of [new Vector3(0, 1, 0), new Vector3(1, 1, 0).normalize(), new Vector3(0, -1, 0.001).normalize()]) {
      look(dir);
      const g = reticleReading()!;
      // at 10 r_s the hovering observer sees light from far away blueshifted by 1/α = 1/√0.9 in every direction
      const kinematic = dopplerFromShipAngle(dir.y, observerBeta());
      expect(g.D / (kinematic / Math.sqrt(0.9)) - 1).toBeLessThan(1e-14);
      expect(g.D / (kinematic / Math.sqrt(0.9)) - 1).toBeGreaterThan(-1e-14);
    }
  });

  it('inside the horizon takes the raindrop’s g, by the light’s angle from the hole; none in the dark region', () => {
    // at r = 1 M (half the horizon's radius), moving past the raindrop sideways
    nearSgrA(new Vector3(0, 0, 0.5 * rsSgrA));
    gravity.frame = 'rain';
    gravity.relPhi = Math.atanh(0.2);
    gravity.relVelDir.set(1, 0, 0);
    const dark = edgeAngle({ frame: 'rain', r: 1 });
    let lit = 0;
    for (const dir of [new Vector3(0, 0, -1), new Vector3(1, 0, -1).normalize(), new Vector3(0.3, 0.2, 1).normalize(), new Vector3(-1, 0.5, 0.2).normalize()]) {
      look(dir);
      const g = reticleReading()!;
      // the light's direction in the raindrop's frame: the seen direction aberrated back (β 0.2 along +x)
      const beta = 0.2;
      const cosS = reticleDirection().x;
      const cosT = cosRestFromShip(cosS, beta);
      const fwd = reticleDirection();
      const perp = new Vector3(0, fwd.y, fwd.z).normalize();
      const rest = new Vector3(cosT, 0, 0).addScaledVector(perp, Math.sqrt(1 - cosT * cosT));
      const toHole = new Vector3(0, 0, -1);
      const angle = 2 * Math.atan2(rest.clone().sub(toHole).length(), rest.clone().add(toHole).length());
      if (angle < dark) {
        expect(g.D, `look ${dir.toArray()}: in the dark region`).toBeNaN();
        continue;
      }
      lit++;
      const expected = dopplerFromShipAngle(cosS, beta) * Math.exp(lnGRain(1, angle));
      expect(Math.abs(g.D / expected - 1), `look ${dir.toArray()}`).toBeLessThan(1e-12);
    }
    expect(lit).toBeGreaterThan(1);
  });

  it('gives a hole’s angular diameter as its shadow’s (28.5° from 10 r_s)', () => {
    nearSgrA(new Vector3(0, 0, 10 * rsSgrA));
    const d = angularDiameterDeg('sgr-a-star');
    expect(d).toBeCloseTo(2 * edgeAngle({ frame: 'static', r: 20 }) * DEG, 10);
    expect(d).toBeCloseTo(28.5, 1);
  });

  it('reads a body the lens bends at its primary image', () => {
    nearSgrA(new Vector3(0, 0, 10 * rsSgrA));
    gravity.relPhi = Math.atanh(0.1);
    gravity.relVelDir.set(0, 0, -1);
    const b = sim.bodies.sun;
    const saved = b.lens;
    const img = new Vector3(0.6, 0, -0.8);
    b.lens = {
      count: 1,
      images: [{ order: 0, screen: { x: 0, y: 0, onScreen: true, inFront: true }, magnitude: 0, lnMu: 0, lnD: 0, lnDView: 0, lnDx: 0, magLensed: 0, dir: img.clone(), dirLens: img.clone(), share: 1 }],
      ring: null,
    };
    try {
      const g = targetReading('sun')!;
      expect(g.thetaDeg).toBeCloseTo(Math.acos(0.8) * DEG, 12);
    } finally {
      b.lens = saved;
    }
    // the hole itself: its own direction from the camera (the exact hole-relative one)
    const h = targetReading('sgr-a-star')!;
    expect(h.thetaDeg).toBeCloseTo(0, 12);
  });

  it('takes no reading there: the lab’s experiments assume flat spacetime', () => {
    useUI.setState({ experiment: 'E3' });
    // far away, moving: a reading is recorded
    const before = useNotebook.getState().rows.length;
    sim.ship.vel.set(0.5 * C_KM_S, 0, 0);
    look(new Vector3(1, 1, 0).normalize());
    expect(recordManual()).toBe(true);
    expect(useNotebook.getState().rows.length).toBe(before + 1);
    // near Sgr A*, moving past the hovering observers just as fast: refused, nothing recorded
    nearSgrA(new Vector3(0, 0, 10 * rsSgrA));
    gravity.relPhi = Math.atanh(0.5);
    gravity.relVelDir.set(1, 0, 0);
    expect(reticleReading()).not.toBeNull();
    expect(recordManual()).toBe(false);
    expect(useNotebook.getState().rows.length).toBe(before + 1);
  });
});
