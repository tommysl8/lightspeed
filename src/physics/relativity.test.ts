import { describe, expect, it } from 'vitest';
import {
  addVelocities,
  aberrateToRest,
  aberrateToShip,
  betaFromGamma,
  contractedLength,
  cosRestFromShip,
  cosShipFromRest,
  dopplerFromRestAngle,
  dopplerFromShipAngle,
  dopplerHeadOn,
  gamma,
  pointFluxFactor,
  properTime,
  radianceFactor,
  rapidity,
  betaFromRapidity,
} from './relativity';
import { normalize, dot, type Vec3 } from './vec';

const BETAS = [0.1, 0.5, 0.9, 0.99, 0.9999];

describe('Lorentz factor', () => {
  it('matches known values', () => {
    expect(gamma(0)).toBe(1);
    expect(gamma(0.6)).toBeCloseTo(1.25, 12);
    expect(gamma(0.8)).toBeCloseTo(5 / 3, 12);
    expect(gamma(0.9)).toBeCloseTo(2.294_157_338_705_62, 12);
    expect(gamma(0.99)).toBeCloseTo(7.088_812_050_083_36, 10);
    expect(gamma(0.99999)).toBeCloseTo(223.607_356_3, 5);
  });

  it('is infinite at and beyond c', () => {
    expect(gamma(1)).toBe(Infinity);
    expect(gamma(2)).toBe(Infinity);
  });

  it('stays accurate very close to c', () => {
    // 1 − β = 10⁻⁷: γ = 1/√(10⁻⁷ · 1.9999999) = 2236.068033…
    expect(gamma(0.9999999)).toBeCloseTo(2236.068_033, 3);
  });

  it('inverts', () => {
    for (const b of BETAS) expect(betaFromGamma(gamma(b))).toBeCloseTo(b, 10);
    for (const b of BETAS) expect(betaFromRapidity(rapidity(b))).toBeCloseTo(b, 12);
  });
});

describe('time dilation and length contraction', () => {
  it('τ = t/γ', () => {
    expect(properTime(10, 0.6)).toBeCloseTo(8, 12);
    expect(properTime(1, 0.8)).toBeCloseTo(0.6, 12);
    for (const b of BETAS) expect(properTime(100, b) * gamma(b)).toBeCloseTo(100, 9);
  });

  it('d/γ', () => {
    expect(contractedLength(100, 0.6)).toBeCloseTo(80, 12);
    expect(contractedLength(100, 0)).toBe(100);
  });
});

describe('aberration', () => {
  const cosines = Array.from({ length: 41 }, (_, i) => -1 + i * 0.05);

  it('is the identity at β = 0', () => {
    for (const c of cosines) {
      expect(cosRestFromShip(c, 0)).toBeCloseTo(c, 15);
      expect(cosShipFromRest(c, 0)).toBeCloseTo(c, 15);
    }
    const v: Vec3 = { x: 0, y: 0, z: 1 };
    const d = normalize({ x: 0.3, y: -0.5, z: 0.2 });
    const out = aberrateToShip(d, v, 0);
    expect(out.x).toBeCloseTo(d.x, 14);
    expect(out.y).toBeCloseTo(d.y, 14);
    expect(out.z).toBeCloseTo(d.z, 14);
  });

  it('shifts every direction forward when β > 0 (except exactly ahead and behind)', () => {
    for (const b of BETAS) {
      for (const c of cosines) {
        const ship = cosShipFromRest(c, b);
        if (Math.abs(c) === 1) expect(ship).toBeCloseTo(c, 12);
        else expect(ship).toBeGreaterThan(c); // smaller angle to the direction of motion
      }
    }
  });

  it('bunches the sky forward: the rest-frame side direction (90°) appears at cos θ′ = β', () => {
    for (const b of BETAS) expect(cosShipFromRest(0, b)).toBeCloseTo(b, 14);
  });

  it('ship → rest → ship round-trips', () => {
    for (const b of BETAS) {
      for (const c of cosines) expect(cosShipFromRest(cosRestFromShip(c, b), b)).toBeCloseTo(c, 9);
    }
  });

  it('matches the half-angle form used by the GPU remap: tan(θ/2) = k·tan(θ′/2), k = √((1+β)/(1−β))', () => {
    for (const b of [...BETAS, 0.99999]) {
      const k = Math.sqrt((1 + b) / (1 - b));
      for (let deg = 1; deg < 180; deg += 7) {
        const thShip = (deg * Math.PI) / 180;
        const thRest = 2 * Math.atan(k * Math.tan(thShip / 2));
        expect(Math.cos(thRest)).toBeCloseTo(cosRestFromShip(Math.cos(thShip), b), 9);
      }
    }
  });

  it('vector form keeps the azimuth and matches the scalar formula', () => {
    const v = normalize({ x: 1, y: 2, z: -0.5 });
    const d = normalize({ x: -0.2, y: 0.4, z: 0.9 });
    for (const b of BETAS) {
      const s = aberrateToShip(d, v, b);
      expect(dot(s, v)).toBeCloseTo(cosShipFromRest(dot(d, v), b), 12);
      const back = aberrateToRest(s, v, b);
      expect(back.x).toBeCloseTo(d.x, 9);
      expect(back.y).toBeCloseTo(d.y, 9);
      expect(back.z).toBeCloseTo(d.z, 9);
    }
  });
});

describe('Doppler factor', () => {
  it('is 1 everywhere at β = 0', () => {
    for (let c = -1; c <= 1; c += 0.1) {
      expect(dopplerFromShipAngle(c, 0)).toBeCloseTo(1, 15);
      expect(dopplerFromRestAngle(c, 0)).toBeCloseTo(1, 15);
    }
  });

  it('head-on equals √((1+β)/(1−β)); dead astern equals its inverse', () => {
    for (const b of BETAS) {
      expect(dopplerFromShipAngle(1, b)).toBeCloseTo(Math.sqrt((1 + b) / (1 - b)), 8);
      expect(dopplerHeadOn(b)).toBeCloseTo(Math.sqrt((1 + b) / (1 - b)), 12);
      expect(dopplerFromShipAngle(-1, b)).toBeCloseTo(Math.sqrt((1 - b) / (1 + b)), 10);
    }
  });

  it('the ship-angle and rest-angle forms agree', () => {
    for (const b of BETAS) {
      for (let c = -1; c <= 1; c += 0.05) {
        expect(dopplerFromShipAngle(cosShipFromRest(c, b), b)).toBeCloseTo(dopplerFromRestAngle(c, b), 6);
      }
    }
  });

  it('shows the transverse Doppler effect: redshift 1/γ at 90° in the ship frame', () => {
    for (const b of BETAS) expect(dopplerFromShipAngle(0, b)).toBeCloseTo(1 / gamma(b), 12);
  });

  it('has solid-angle Jacobian dΩ′/dΩ = 1/D²', () => {
    const h = 1e-6;
    for (const b of [0.3, 0.9]) {
      for (const c of [-0.8, -0.2, 0.3, 0.7]) {
        const jac = (cosShipFromRest(c + h, b) - cosShipFromRest(c - h, b)) / (2 * h);
        const D = dopplerFromRestAngle(c, b);
        expect(jac).toBeCloseTo(1 / (D * D), 6);
      }
    }
  });
});

describe('velocity addition', () => {
  const c = 299_792.458;
  it('reduces to (u + v)/(1 + uv/c²) along a line and never exceeds c', () => {
    const w = addVelocities({ x: 0.6 * c, y: 0, z: 0 }, { x: 0.6 * c, y: 0, z: 0 });
    expect(w.x / c).toBeCloseTo(1.2 / 1.36, 12);
    const fast = addVelocities({ x: 0.99999 * c, y: 0, z: 0 }, { x: 0.99999 * c, y: 0, z: 0 });
    expect(fast.x).toBeLessThan(c);
  });

  it('is ordinary addition at everyday speeds', () => {
    const w = addVelocities({ x: 30, y: 0, z: 0 }, { x: 0, y: 17, z: 0 });
    expect(w.x).toBeCloseTo(30, 6);
    expect(w.y).toBeCloseTo(17, 6);
  });

  it('keeps perpendicular speeds below c too', () => {
    const w = addVelocities({ x: 0.9 * c, y: 0, z: 0 }, { x: 0, y: 0.9 * c, z: 0 });
    expect(Math.hypot(w.x, w.y, w.z)).toBeLessThan(c);
  });
});

describe('beaming', () => {
  // Energy density of isotropic radiation seen by a moving observer: u′ = γ²(1 + β²/3) u.
  const expected = (b: number) => gamma(b) ** 2 * (1 + (b * b) / 3);

  it('radiance ∝ D⁴ reproduces the energy density of an isotropic field', () => {
    for (const b of [0.2, 0.6, 0.9]) {
      // Average of D⁴ over the ship-frame sphere: ½∫ D(μ′)⁴ dμ′ (Simpson's rule).
      const n = 4000;
      let sum = 0;
      for (let k = 0; k <= n; k++) {
        const mu = -1 + (2 * k) / n;
        const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2;
        sum += w * radianceFactor(dopplerFromShipAngle(mu, b));
      }
      const avg = ((sum * (2 / n)) / 3) * 0.5;
      expect(avg).toBeCloseTo(expected(b), 5);
    }
  });

  it('point-source flux ∝ D² is consistent with it (a sky full of stars is an isotropic field)', () => {
    for (const b of [0.2, 0.6, 0.9]) {
      // Stars spread uniformly in rest-frame μ; average D² over them.
      const n = 4000;
      let sum = 0;
      for (let k = 0; k <= n; k++) {
        const mu = -1 + (2 * k) / n;
        const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2;
        sum += w * pointFluxFactor(dopplerFromRestAngle(mu, b));
      }
      const avg = ((sum * (2 / n)) / 3) * 0.5;
      expect(avg).toBeCloseTo(expected(b), 8);
    }
  });
});
