import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  bodyToEclipticAt,
  bodyToIcrf,
  bodyFixedDirection,
  mulVec,
  orientationAt,
  rotationDifference,
  textureUvToLatLon,
  type Mat3,
  type PhaseSystem,
  type RotationModel,
} from './rotation';

const here = dirname(fileURLToPath(import.meta.url));
const bodiesJson = JSON.parse(readFileSync(join(here, '../../bodies.json'), 'utf8')) as {
  phaseAngles: Record<string, PhaseSystem>;
  bodies: { id: string; rotation: RotationModel }[];
};
const spice = JSON.parse(readFileSync(join(here, '__fixtures__/rotation-spice.json'), 'utf8')) as {
  bodies: Record<string, { d: number; bodyToEcliptic: Mat3; poleRaDeg: number; poleDecDeg: number }[]>;
};
const byId = Object.fromEntries(bodiesJson.bodies.map((b) => [b.id, b]));

describe('IAU rotation models against CSPICE (pck00011)', () => {
  let worst = 0;
  let worstAt = '';
  for (const [id, rows] of Object.entries(spice.bodies)) {
    it(`${id}: body-fixed → ecliptic J2000 matches SPICE to < 1e-9 rad at 8 epochs (1900–2300)`, () => {
      for (const r of rows) {
        const got = bodyToEclipticAt(byId[id].rotation, bodiesJson.phaseAngles, r.d);
        expect(got).not.toBeNull();
        const err = rotationDifference(got!.matrix, r.bodyToEcliptic);
        if (err > worst) {
          worst = err;
          worstAt = `${id} @ d=${r.d}`;
        }
        expect(err).toBeLessThan(1e-9);
      }
    });
  }
  it('reports the worst case', () => {
    // Printed for the spec file: the measured implementation error bound.
    console.log(`rotation: worst difference from SPICE ${worst.toExponential(2)} rad (${worstAt})`);
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('rotation regimes', () => {
  it('flags IAU models outside 1981–2199 as extrapolated but keeps them finite', () => {
    const o = orientationAt(byId.io.rotation, bodiesJson.phaseAngles, -200 * 365.25);
    expect(o.regime).toBe('extrapolated');
    expect(Number.isFinite(o.wDeg) && Number.isFinite(o.raDeg) && Number.isFinite(o.decDeg)).toBe(true);
    expect(orientationAt(byId.io.rotation, bodiesJson.phaseAngles, 9764.5).regime).toBe('model');
  });
  it('returns no orientation for chaotic and unknown rotators', () => {
    expect(bodyToEclipticAt(byId.hyperion.rotation, bodiesJson.phaseAngles, 0)).toBeNull();
    expect(bodyToEclipticAt(byId.borisov.rotation, bodiesJson.phaseAngles, 0)).toBeNull();
  });
  it('treats snapshot poles (Nix, Hydra) as pole-only', () => {
    expect(orientationAt(byId.nix.rotation, bodiesJson.phaseAngles, 5673).regime).toBe('pole-only');
  });
  it('Haumea: +x (long axis) lies along the Earth line at the 2017 occultation (minimum brightness)', () => {
    const rot = byId.haumea.rotation as RotationModel & { occultation: { jdTdbOcc: number } };
    const d = rot.occultation.jdTdbOcc - 2451545;
    const m = bodyToIcrf(...(Object.values(orientationAt(rot, bodiesJson.phaseAngles, d)).slice(0, 3) as [number, number, number]));
    const x = mulVec(m, [1, 0, 0]);
    // Horizons: Earth → Haumea (ICRF) at 2017-01-21 03:09:20 UTC.
    const v = [-6.070047288831916e9, -3.943943555002071e9, 2.153345976509012e9];
    const n = Math.hypot(...v);
    const pole = mulVec(m, [0, 0, 1]);
    const u = v.map((c) => c / n);
    const up = u[0] * pole[0] + u[1] * pole[1] + u[2] * pole[2];
    const ue = u.map((c, i) => c - up * pole[i]);
    const ne = Math.hypot(...ue);
    const cos = Math.abs((ue[0] * x[0] + ue[1] * x[1] + ue[2] * x[2]) / ne);
    // W₀ and the rate are stored rounded (1e-4°, 1e-6°/day): allow 1e-4 rad (0.006°).
    expect(cos).toBeGreaterThan(Math.cos(1e-4));
  });
});

describe('frame conventions', () => {
  it('+z of the body frame is the pole direction (α₀, δ₀)', () => {
    const m = bodyToIcrf(268.05, 64.5, 123);
    const z = mulVec(m, [0, 0, 1]);
    const a = 268.05 * (Math.PI / 180);
    const d = 64.5 * (Math.PI / 180);
    expect(z[0]).toBeCloseTo(Math.cos(d) * Math.cos(a), 12);
    expect(z[1]).toBeCloseTo(Math.cos(d) * Math.sin(a), 12);
    expect(z[2]).toBeCloseTo(Math.sin(d), 12);
  });
  it('at W = 0 the prime meridian points at the node, RA α₀ + 90° on the ICRF equator', () => {
    const m = bodyToIcrf(40, 83.5, 0);
    const x = mulVec(m, [1, 0, 0]);
    expect(x[2]).toBeCloseTo(0, 12);
    expect(Math.atan2(x[1], x[0]) * (180 / Math.PI)).toBeCloseTo(130, 10);
  });
  it('texture centre (u = 0.5, v = 0.5) is the prime meridian on the equator, +x', () => {
    const { latDeg, lonEastDeg } = textureUvToLatLon(0.5, 0.5);
    const p = bodyFixedDirection(latDeg, lonEastDeg);
    expect(p[0]).toBeCloseTo(1, 12);
    expect(textureUvToLatLon(0.75, 0).lonEastDeg).toBeCloseTo(90, 12);
  });
});
