/**
 * What the renderer is handed for the Galaxy: the nebulae's cards (place, size and orientation as
 * on the sky), the globular clusters' clumps (their measured light, shared out), the dust and warp
 * maps, and one display law for every kind of diffuse light.
 */
import { describe, expect, it } from 'vitest';
import { DataUtils } from 'three';
import { gunzipFile } from '../../test/stars';
import { equatorialToEcliptic, skyBasis } from '../stars/frames';
import { apply, GAL_TO_WORLD, galToG, type Vec3 } from './frames';
import { apparentCard, nebulaCard } from './cards';
import { clusterAliases, clusterDisplayName, CLUMP_POINTS, globularClumps, globularLuminosity, isFamousCluster, parseClusters, type ClustersFile, type GlobularCluster } from './clusters';
import { DUST_EXTENT_KPC, dustMapHalf, warpMapHalf } from './galaxyData';
import { galaxyModel } from './arms';
import type { NebulaeFile } from './records';
import nebulaeJson from './nebulae.json';
import { backgroundScale, displayedLuminance, MW_SB_ZERO_POINT, patchFlux, surfaceBrightness, surfaceScale } from './background';

const nebulae = nebulaeJson as unknown as NebulaeFile;
const clusters = parseClusters(JSON.parse(new TextDecoder().decode(gunzipFile('public/data/clusters.json.gz'))) as ClustersFile);

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const toWorld = (v: Vec3): Vec3 => {
  const e = equatorialToEcliptic(v);
  return [e[0], e[2], -e[1]];
};

describe('nebula cards', () => {
  it('sit at the picture’s centre, at the nebula’s distance and true size, facing the Sun', () => {
    for (const n of nebulae.objects) {
      const c = nebulaCard(n);
      expect(len(c.centre)).toBeCloseTo(len(n.billboard.helioGalacticPc), 6);
      expect(len(c.right)).toBeCloseTo(n.billboard.widthPc / 2, 6);
      expect(len(c.up)).toBeCloseTo(n.billboard.heightPc / 2, 6);
      expect(dot(c.right, c.up)).toBeCloseTo(0, 9);
      // The file's centres are rounded to 0.01 pc, so the card faces the Sun to about 1e-5.
      expect(Math.abs(dot(c.right, c.normal) / len(c.right))).toBeLessThan(1e-4);
      expect(Math.abs(dot(c.up, c.normal) / len(c.up))).toBeLessThan(1e-4);
      expect(dot(c.normal, apply(GAL_TO_WORLD, n.billboard.helioGalacticPc)) / len(c.centre)).toBeCloseTo(1, 9);
    }
  });

  it('are the picture as seen from the Sun, not mirrored: image-right × image-up points back at the Sun', () => {
    for (const n of nebulae.objects) {
      const c = nebulaCard(n);
      expect(dot(cross(c.right, c.up), c.normal), n.id).toBeLessThan(0);
    }
  });

  it('turn image-up clockwise from north by the picture’s angle; east is to the left of north', () => {
    const orion = nebulae.objects.find((o) => o.id === 'orion-nebula')!;
    const c = nebulaCard(orion);
    const { east, north } = skyBasis(orion.billboard.centerRaDeg, orion.billboard.centerDecDeg);
    const N = toWorld(north);
    const E = toWorld(east);
    const up = c.up.map((v) => v / len(c.up)) as Vec3;
    const right = c.right.map((v) => v / len(c.right)) as Vec3;
    const th = (orion.billboard.northAngleDeg * Math.PI) / 180;
    expect(dot(up, N)).toBeCloseTo(Math.cos(th), 9);
    // Clockwise, as seen from the Sun, is towards west: away from east.
    expect(dot(up, E)).toBeCloseTo(-Math.sin(th), 9);
    // With north up, east is on the left: image-right points west.
    expect(dot(right, E)).toBeCloseTo(-Math.cos(th), 9);
  });
});

describe('a card on screen', () => {
  const view = { forward: { x: 0, y: 0, z: -1 }, halfDiagonal: 0.5, pxPerRad: 1000 };

  it('is its angular width in pixels, and in the view only when some of it is', () => {
    const ahead = apparentCard([0, 0, -100], 1, view, null);
    expect(ahead.px).toBeCloseTo(2 * Math.tan(Math.asin(0.01)) * 1000, 9);
    expect(ahead.inView).toBe(true);
    expect(apparentCard([0, 0, 100], 1, view, null).inView).toBe(false);
    // Just outside the view's corner, but its edge reaches in.
    const off = 0.5 + Math.asin(0.01) * 0.5;
    expect(apparentCard([100 * Math.sin(off), 0, -100 * Math.cos(off)], 1, view, null).inView).toBe(true);
    expect(apparentCard([0, 0, -0.5], 1, view, null).px).toBe(1e4);
  });

  it('in flight is where aberration puts it, shrunk ahead by 1/D and magnified astern', () => {
    const phi = Math.atanh(0.99);
    const motion = { velDir: { x: 0, y: 0, z: -1 }, phi };
    const D = Math.exp(phi);
    const still = apparentCard([0, 0, -100], 0.01, view, null).px;
    expect(apparentCard([0, 0, -100], 0.01, view, motion).px).toBeCloseTo(still / D, 6);
    const back = { ...view, forward: { x: 0, y: 0, z: 1 } };
    // (to 1e-6: the magnified angle is no longer small enough for tan x = x to 1e-9)
    expect(apparentCard([0, 0, 100], 0.01, back, motion).px / (still * D)).toBeCloseTo(1, 5);
    // At right angles in the rest frame, the card is seen 8° from ahead at 0.99c, inside the view.
    expect(apparentCard([100, 0, 0], 0.01, view, null).inView).toBe(false);
    expect(apparentCard([100, 0, 0], 0.01, view, motion).inView).toBe(true);
  });
});

describe('star clusters', () => {
  it('reads 1,500 open and 164 globular clusters, and knows the famous ones by name', () => {
    expect(clusters.filter((c) => c.kind === 'open').length).toBe(1500);
    expect(clusters.filter((c) => c.kind === 'globular').length).toBe(164);
    expect(clusters.filter((c) => c.kind === 'open' && isFamousCluster(c)).length).toBe(60);
    const pleiades = clusters.find((c) => c.name === 'Melotte 22')!;
    expect(clusterDisplayName(pleiades)).toBe('Pleiades');
    expect(clusterAliases(pleiades)).toEqual(expect.arrayContaining(['Melotte 22', 'M45', 'Messier 45']));
    const praesepe = clusters.find((c) => c.name === 'NGC 2632')!;
    expect(clusterDisplayName(praesepe)).toBe('Praesepe');
    expect(clusterAliases(praesepe)).toEqual(expect.arrayContaining(['Beehive', 'M44']));
    // The globulars without a proper name or a Messier number have no body.
    expect(isFamousCluster(clusters.find((c) => c.commonName === 'HP 2')!)).toBe(false);
  });

  it('shares each globular’s measured light between its glow and its points', () => {
    const globs = clusters.filter((c): c is GlobularCluster => c.kind === 'globular');
    const clumps = globularClumps(clusters);
    expect(clumps.count).toBe(globs.length * (1 + CLUMP_POINTS));
    globs.forEach((g, i) => {
      let L = 0;
      let far = 0;
      for (let k = 0; k <= CLUMP_POINTS; k++) {
        const j = i * (1 + CLUMP_POINTS) + k;
        L += 2 ** (clumps.attrs[4 * j + 1] / 8);
        const d = Math.hypot(clumps.positionKpc[3 * j] * 1000 - g.xPc, clumps.positionKpc[3 * j + 1] * 1000 - g.yPc, clumps.positionKpc[3 * j + 2] * 1000 - g.zPc);
        far = Math.max(far, d / g.radiusPc);
      }
      // The luminosity codes are steps of 2^(1/8): 4.4%.
      expect(Math.abs(L / globularLuminosity(g) - 1), g.name).toBeLessThan(0.05);
      // The Plummer draws are cut at 99.2% of the mass: 13.6 half-light radii.
      expect(far, g.name).toBeLessThan(13.7);
    });
  });
});

describe('dust and warp maps', () => {
  const res = 64;
  const dust = dustMapHalf(res, DUST_EXTENT_KPC);
  const warp = warpMapHalf(res, DUST_EXTENT_KPC);
  const at = (x: number, y: number) => {
    const i = Math.floor(((x + DUST_EXTENT_KPC) / (2 * DUST_EXTENT_KPC)) * res);
    const j = Math.floor(((y + DUST_EXTENT_KPC) / (2 * DUST_EXTENT_KPC)) * res);
    return j * res + i;
  };

  it('hold the model’s dust as half floats', () => {
    expect(dust.length).toBe(res * res * 4);
    const m = galaxyModel();
    const sun = galToG([0, 0, 0]);
    const k = at(sun[0], sun[1]);
    const cell = -DUST_EXTENT_KPC + ((Math.floor(((sun[0] + DUST_EXTENT_KPC) / (2 * DUST_EXTENT_KPC)) * res) + 0.5) * 2 * DUST_EXTENT_KPC) / res;
    const want = m.dustMidplane(cell, -DUST_EXTENT_KPC + ((Math.floor(((sun[1] + DUST_EXTENT_KPC) / (2 * DUST_EXTENT_KPC)) * res) + 0.5) * 2 * DUST_EXTENT_KPC) / res);
    expect(DataUtils.fromHalfFloat(dust[4 * k])).toBeCloseTo(want.discAV, 2);
    expect(DataUtils.fromHalfFloat(dust[4 * k + 1])).toBeCloseTo(want.discH, 2);
  });

  it('hold the warp: flat inside the Sun’s circle, bent up towards l = 90° and down towards l = 270° far out', () => {
    expect(Math.abs(DataUtils.fromHalfFloat(warp[at(0, 0)]))).toBe(0);
    const m = galaxyModel();
    // 15 kpc out towards galactocentric azimuth 107.5° (x = −R cos β, y = R sin β).
    const b = (107.5 * Math.PI) / 180;
    const x = -15 * Math.cos(b);
    const y = 15 * Math.sin(b);
    expect(DataUtils.fromHalfFloat(warp[at(x, y)])).toBeGreaterThan(0.5);
    expect(m.warpZ(15, 107.5)).toBeGreaterThan(0.6);
    expect(DataUtils.fromHalfFloat(warp[at(-x, -y)])).toBeLessThan(-0.5);
  });
});

describe('one display law for diffuse light', () => {
  const px = (2 * Math.tan((25 * Math.PI) / 180)) / 700;

  it('draws the sky map, the Galaxy’s summed light and the nebulae alike for the same surface brightness', () => {
    for (const mu of [19, 20.24, 21.9, 24]) {
      const y = displayedLuminance(mu, px, 1.6, 0);
      // The sky map: √(scale · mean p), with mean p from the calibration.
      const meanP = 10 ** (-0.4 * (mu - MW_SB_ZERO_POINT));
      expect(surfaceBrightness(meanP)).toBeCloseTo(mu, 9);
      expect(Math.sqrt(backgroundScale(px, 1.6, 0) * meanP)).toBeCloseTo(y, 9);
      // The Galaxy's target: uStarGain √(patch flux).
      expect(1.6 * Math.sqrt(patchFlux(mu, px, 0))).toBeCloseTo(y, 9);
      // A nebula's picture at its brightest.
      expect(Math.sqrt(surfaceScale(mu, px, 1.6, 0))).toBeCloseTo(y, 9);
    }
  });
});
